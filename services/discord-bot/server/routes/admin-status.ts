import { Router, Request, Response } from "express";
import { dbStorage as storage } from "../database-storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { botHealthMonitor } from "../monitoring/metrics";
import { getDiscordClient, getBotGuilds } from "../discord/bot";
import { isAuthenticated } from "../auth";

const router = Router();

// GET /api/admin/status - Get comprehensive bot health metrics
router.get("/status", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const client = getDiscordClient();
    
    // If bot is not running, return minimal status
    if (!client) {
      return res.json({
        status: 'offline',
        isConnected: false,
        connectionState: 'offline',
        uptime: 0,
        latency: 0,
        guilds: 0,
        totalMembers: 0,
        activeTickets: { open: 0, inProgress: 0, resolved: 0, total: 0 },
        ticketStats: { today: 0, thisWeek: 0, allTime: 0 },
        errorRate: 0,
        recentErrors: [],
        streamNotifications: { sentToday: 0, failedToday: 0, totalSent: 0, totalFailed: 0 },
        healthStatus: 'critical'
      });
    }
    
    // Get guild information
    const botGuilds = await getBotGuilds();
    const guildsCount = botGuilds.length;
    let totalMembers = 0;
    
    client.guilds.cache.forEach(guild => {
      totalMembers += guild.memberCount;
    });
    
    // Get ticket statistics
    const allTickets = await storage.getAllTickets();
    const openTickets = allTickets.filter(t => t.status === 'open').length;
    const inProgressTickets = allTickets.filter(t => t.status === 'in-progress').length;
    const resolvedTickets = allTickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;
    
    const activeTickets = {
      open: openTickets,
      inProgress: inProgressTickets,
      resolved: resolvedTickets,
      total: allTickets.length
    };
    
    // Calculate ticket creation stats
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const ticketsToday = allTickets.filter(t => 
      t.createdAt && new Date(t.createdAt) >= todayStart
    ).length;
    
    const ticketsThisWeek = allTickets.filter(t => 
      t.createdAt && new Date(t.createdAt) >= weekStart
    ).length;
    
    const ticketStats = {
      today: ticketsToday,
      thisWeek: ticketsThisWeek,
      allTime: allTickets.length
    };
    
    // Get stream notification stats from database
    let streamNotificationStats = {
      sentToday: 0,
      failedToday: 0,
      totalSent: 0,
      totalFailed: 0
    };
    
    try {
      const streamLogsQuery = await db.execute(sql`
        SELECT 
          COUNT(*) FILTER (WHERE success = true AND created_at >= ${todayStart.toISOString()}) as sent_today,
          COUNT(*) FILTER (WHERE success = false AND created_at >= ${todayStart.toISOString()}) as failed_today,
          COUNT(*) FILTER (WHERE success = true) as total_sent,
          COUNT(*) FILTER (WHERE success = false) as total_failed
        FROM stream_notification_log
      `);
      
      if (streamLogsQuery && streamLogsQuery[0]) {
        const row = streamLogsQuery[0] as any;
        streamNotificationStats = {
          sentToday: parseInt(row.sent_today) || 0,
          failedToday: parseInt(row.failed_today) || 0,
          totalSent: parseInt(row.total_sent) || 0,
          totalFailed: parseInt(row.total_failed) || 0
        };
      }
    } catch (error) {
      console.error('[AdminStatus] Failed to fetch stream notification stats:', error);
    }
    
    // Get metrics from health monitor
    const metrics = botHealthMonitor.getMetrics(
      guildsCount,
      totalMembers,
      activeTickets,
      ticketStats
    );
    
    // Add stream notification stats from database
    metrics.streamNotifications = streamNotificationStats;
    
    // Get health status
    const healthStatus = botHealthMonitor.getHealthStatus();
    
    res.json({
      ...metrics,
      healthStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[AdminStatus] Error fetching status:', error);
    res.status(500).json({ 
      error: 'Failed to fetch bot status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/admin/status/errors - Get error logs with filtering
router.get("/status/errors", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { severity, hours, limit } = req.query;
    
    let errors = botHealthMonitor.getRecentErrors(100);
    
    // Filter by severity if provided
    if (severity && typeof severity === 'string') {
      errors = errors.filter(e => e.severity === severity);
    }
    
    // Filter by time window if provided
    if (hours && typeof hours === 'string') {
      const hoursNum = parseInt(hours);
      if (!isNaN(hoursNum)) {
        const cutoff = new Date(Date.now() - hoursNum * 60 * 60 * 1000);
        errors = errors.filter(e => e.timestamp >= cutoff);
      }
    }
    
    // Limit results if provided
    if (limit && typeof limit === 'string') {
      const limitNum = parseInt(limit);
      if (!isNaN(limitNum)) {
        errors = errors.slice(0, limitNum);
      }
    }
    
    res.json({ errors });
  } catch (error) {
    console.error('[AdminStatus] Error fetching error logs:', error);
    res.status(500).json({ 
      error: 'Failed to fetch error logs',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/admin/status/connection-history - Get connection state history
router.get("/status/connection-history", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { limit } = req.query;
    const limitNum = limit && typeof limit === 'string' ? parseInt(limit) : 20;
    
    const history = botHealthMonitor.getConnectionHistory(limitNum);
    
    res.json({ history });
  } catch (error) {
    console.error('[AdminStatus] Error fetching connection history:', error);
    res.status(500).json({ 
      error: 'Failed to fetch connection history',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/admin/status/webhook - Webhook for Discord gateway events
router.post("/status/webhook", async (req: Request, res: Response) => {
  try {
    const { event, data } = req.body;
    
    // Validate webhook payload
    if (!event) {
      return res.status(400).json({ error: 'Event type is required' });
    }
    
    // Handle different event types
    switch (event) {
      case 'ready':
        botHealthMonitor.updateConnectionState('ready', 'Bot is ready');
        break;
      case 'disconnect':
        botHealthMonitor.updateConnectionState('disconnected', data?.reason || 'Unknown');
        break;
      case 'reconnecting':
        botHealthMonitor.updateConnectionState('reconnecting', 'Attempting to reconnect');
        break;
      case 'error':
        botHealthMonitor.logError(
          data?.message || 'Unknown error',
          data?.severity || 'error',
          data?.stack,
          data?.context
        );
        break;
      default:
        console.log(`[AdminStatus] Unknown webhook event: ${event}`);
    }
    
    res.json({ success: true, message: 'Event processed' });
  } catch (error) {
    console.error('[AdminStatus] Error processing webhook:', error);
    res.status(500).json({ 
      error: 'Failed to process webhook',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/admin/status/ticket-trends - Get ticket creation trends
router.get("/status/ticket-trends", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { days } = req.query;
    const daysNum = days && typeof days === 'string' ? parseInt(days) : 30;
    
    const trendsQuery = await db.execute(sql`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE status = 'open') as open_count,
        COUNT(*) FILTER (WHERE status = 'in-progress') as in_progress_count,
        COUNT(*) FILTER (WHERE status = 'closed' OR status = 'resolved') as resolved_count
      FROM tickets
      WHERE created_at >= NOW() - INTERVAL '${sql.raw(daysNum.toString())} days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);
    
    res.json({ trends: trendsQuery });
  } catch (error) {
    console.error('[AdminStatus] Error fetching ticket trends:', error);
    res.status(500).json({ 
      error: 'Failed to fetch ticket trends',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
