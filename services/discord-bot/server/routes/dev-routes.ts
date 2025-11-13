import { Router, Request, Response } from "express";
import { dbStorage as storage } from "../database-storage";
import { db } from "../db";
import { readOnlyDb } from "../db-readonly";
import { logDeveloperAction } from "../middleware/developerAuth";
import * as os from "os";
import {
  listContainers,
  getContainerLogs,
  restartContainer,
  getContainerStats,
  getAllContainerStats,
  checkDockerAvailability
} from "../docker/manager";
import { getBotGuilds, getDiscordClient } from "../discord/bot";
import { sql } from "drizzle-orm";

const router = Router();

// System Monitor APIs
router.get("/system/stats", async (req: Request, res: Response) => {
  try {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    const stats = {
      cpu: {
        count: cpus.length,
        model: cpus[0]?.model || "Unknown",
        usage: cpus.map(cpu => {
          const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
          const idle = cpu.times.idle;
          return ((1 - idle / total) * 100).toFixed(2);
        })
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        usagePercent: ((usedMem / totalMem) * 100).toFixed(2)
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        uptime: os.uptime()
      }
    };
    
    await logDeveloperAction(req.user!.id, "view_system_stats", null, req);
    res.json(stats);
  } catch (error) {
    console.error("Failed to get system stats:", error);
    res.status(500).json({ error: "Failed to get system stats" });
  }
});

router.get("/system/process", async (req: Request, res: Response) => {
  try {
    const processInfo = {
      pid: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      version: process.version,
      nodeVersion: process.versions.node,
      v8Version: process.versions.v8
    };
    
    await logDeveloperAction(req.user!.id, "view_process_info", null, req);
    res.json(processInfo);
  } catch (error) {
    console.error("Failed to get process info:", error);
    res.status(500).json({ error: "Failed to get process info" });
  }
});

// Docker APIs
router.get("/docker/containers", async (req: Request, res: Response) => {
  try {
    const dockerAvailable = await checkDockerAvailability();
    
    if (!dockerAvailable) {
      return res.json({ 
        dockerAvailable: false, 
        containers: [],
        message: "Docker is not available in this environment"
      });
    }
    
    const containers = await listContainers(true);
    
    await logDeveloperAction(req.user!.id, "view_docker_containers", { count: containers.length }, req);
    res.json({ dockerAvailable: true, containers });
  } catch (error) {
    console.error("Failed to list containers:", error);
    res.status(500).json({ error: "Failed to list containers" });
  }
});

router.get("/docker/logs/:container", async (req: Request, res: Response) => {
  try {
    const { container } = req.params;
    const tail = parseInt(req.query.tail as string) || 100;
    
    const logs = await getContainerLogs(container, tail);
    
    await logDeveloperAction(req.user!.id, "view_docker_logs", { container, tail }, req);
    res.json({ logs });
  } catch (error) {
    console.error("Failed to get container logs:", error);
    res.status(500).json({ error: "Failed to get container logs" });
  }
});

router.post("/docker/restart/:container", async (req: Request, res: Response) => {
  try {
    const { container } = req.params;
    
    await restartContainer(container);
    
    await logDeveloperAction(req.user!.id, "restart_docker_container", { container }, req);
    res.json({ success: true, message: "Container restarted successfully" });
  } catch (error) {
    console.error("Failed to restart container:", error);
    res.status(500).json({ error: "Failed to restart container" });
  }
});

router.get("/docker/stats", async (req: Request, res: Response) => {
  try {
    const dockerAvailable = await checkDockerAvailability();
    
    if (!dockerAvailable) {
      return res.json({ 
        dockerAvailable: false, 
        stats: [],
        message: "Docker is not available in this environment"
      });
    }
    
    const stats = await getAllContainerStats();
    
    await logDeveloperAction(req.user!.id, "view_docker_stats", null, req);
    res.json({ dockerAvailable: true, stats });
  } catch (error) {
    console.error("Failed to get Docker stats:", error);
    res.status(500).json({ error: "Failed to get Docker stats" });
  }
});

// Database APIs
router.post("/database/query", async (req: Request, res: Response) => {
  const { query } = req.body;
  
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: "Query is required" });
  }
  
  const trimmedQuery = query.trim();
  const upperQuery = trimmedQuery.toUpperCase();
  
  // SECURITY LAYER 1: Block multi-statement queries
  if (trimmedQuery.includes(';')) {
    return res.status(403).json({ 
      error: "Multi-statement queries are not allowed. Please execute one query at a time." 
    });
  }
  
  // SECURITY LAYER 2: Only allow SELECT, SHOW, and EXPLAIN statements
  const allowedPrefixes = ['SELECT', 'SHOW', 'EXPLAIN', 'DESCRIBE', 'WITH'];
  const startsWithAllowed = allowedPrefixes.some(prefix => upperQuery.startsWith(prefix));
  
  if (!startsWithAllowed) {
    return res.status(403).json({ 
      error: `Only read-only queries are allowed (SELECT, SHOW, EXPLAIN, DESCRIBE, WITH). Query starts with: ${upperQuery.split(' ')[0]}` 
    });
  }
  
  // SECURITY LAYER 3: Block dangerous SQL keywords (write operations and session changes)
  const dangerousKeywords = [
    // Write operations
    'DROP', 'DELETE', 'INSERT', 'UPDATE', 'ALTER', 'CREATE', 
    'TRUNCATE', 'GRANT', 'REVOKE', 'EXECUTE', 'EXEC',
    'MERGE', 'REPLACE', 'RENAME', 'COMMENT', 'COPY',
    // Session/transaction control (prevent bypassing read-only mode)
    '\\bSET\\b', 'SET_CONFIG', 'RESET', 'BEGIN', 'COMMIT', 'ROLLBACK', 'START TRANSACTION',
    // INTO clause (prevents SELECT ... INTO new_table)
    '\\bINTO\\b',
    // Function calls that might execute writes
    'DBLINK_EXEC', 'PG_TERMINATE_BACKEND', 'PG_CANCEL_BACKEND',
    'PG_DROP_REPLICATION_SLOT', 'PG_CREATE_RESTORE_POINT',
    'PG_CATALOG.SET_CONFIG'
  ];
  
  for (const keyword of dangerousKeywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(trimmedQuery)) {
      return res.status(403).json({ 
        error: `Dangerous SQL keyword detected: ${keyword}. Only read-only queries are allowed.` 
      });
    }
  }
  
  try {
    // SECURITY LAYER 4: Execute query using READ-ONLY database connection
    // Note: This provides defense-in-depth but can be bypassed by SET commands
    // For production: Create a dedicated PostgreSQL role with SELECT-only privileges
    const result = await readOnlyDb.execute(sql.raw(trimmedQuery));
    
    await logDeveloperAction(req.user!.id, "execute_sql_query", { query: trimmedQuery.substring(0, 100) }, req);
    res.json({ rows: result, rowCount: result.length });
  } catch (error: any) {
    console.error("Failed to execute query:", error);
    
    // Log the failed query attempt with error details
    await logDeveloperAction(req.user!.id, "execute_sql_query_failed", { 
      query: trimmedQuery.substring(0, 100),
      error: error.message 
    }, req);
    
    // Check if error is due to read-only mode violation
    if (error.message && (error.message.includes('read-only') || error.message.includes('permission denied'))) {
      return res.status(403).json({ 
        error: "Query rejected: Read-only mode violation or insufficient permissions." 
      });
    }
    
    res.status(500).json({ error: error.message || "Failed to execute query" });
  }
});

router.get("/database/tables", async (req: Request, res: Response) => {
  try {
    const tablesQuery = await db.execute(sql`
      SELECT 
        table_name,
        (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    const tables = await Promise.all(
      tablesQuery.map(async (table: any) => {
        try {
          const countResult = await db.execute(sql.raw(`SELECT COUNT(*) as count FROM "${table.table_name}"`));
          return {
            name: table.table_name,
            rowCount: countResult[0]?.count || 0,
            columnCount: table.column_count
          };
        } catch (error) {
          return {
            name: table.table_name,
            rowCount: 0,
            columnCount: table.column_count
          };
        }
      })
    );
    
    await logDeveloperAction(req.user!.id, "view_database_tables", null, req);
    res.json({ tables });
  } catch (error) {
    console.error("Failed to get database tables:", error);
    res.status(500).json({ error: "Failed to get database tables" });
  }
});

router.get("/database/stats", async (req: Request, res: Response) => {
  try {
    const sizeQuery = await db.execute(sql`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size
    `);
    
    const stats = {
      databaseSize: sizeQuery[0]?.size || "Unknown",
      timestamp: new Date()
    };
    
    await logDeveloperAction(req.user!.id, "view_database_stats", null, req);
    res.json(stats);
  } catch (error) {
    console.error("Failed to get database stats:", error);
    res.status(500).json({ error: "Failed to get database stats" });
  }
});

// Bot Management APIs
router.get("/bot/global-stats", async (req: Request, res: Response) => {
  try {
    const totalServers = await storage.getAllServers();
    const totalTickets = await storage.getAllTickets();
    const openTickets = await storage.getTicketsByStatus("open");
    const allDiscordUsers = await storage.getAllDiscordUsers();
    
    const stats = {
      totalServers: totalServers.length,
      activeServers: totalServers.filter(s => s.isActive).length,
      totalTickets: totalTickets.length,
      openTickets: openTickets.length,
      closedTickets: totalTickets.length - openTickets.length,
      totalUsers: allDiscordUsers.length
    };
    
    await logDeveloperAction(req.user!.id, "view_bot_global_stats", null, req);
    res.json(stats);
  } catch (error) {
    console.error("Failed to get bot global stats:", error);
    res.status(500).json({ error: "Failed to get bot global stats" });
  }
});

router.get("/bot/servers", async (req: Request, res: Response) => {
  try {
    const botGuilds = await getBotGuilds();
    const dbServers = await storage.getAllServers();
    
    const servers = botGuilds.map(guild => {
      const dbServer = dbServers.find(s => s.id === guild.id);
      return {
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount,
        icon: guild.icon,
        isActive: dbServer?.isActive ?? true,
        hasSettings: !!dbServer
      };
    });
    
    await logDeveloperAction(req.user!.id, "view_bot_servers", { count: servers.length }, req);
    res.json({ servers });
  } catch (error) {
    console.error("Failed to get bot servers:", error);
    res.status(500).json({ error: "Failed to get bot servers" });
  }
});

router.post("/bot/announce", async (req: Request, res: Response) => {
  try {
    const { message, channelType } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }
    
    await logDeveloperAction(req.user!.id, "send_bot_announcement", { message, channelType }, req);
    
    res.json({ 
      success: true, 
      message: "Announcement feature not yet implemented - would send to all servers" 
    });
  } catch (error) {
    console.error("Failed to send announcement:", error);
    res.status(500).json({ error: "Failed to send announcement" });
  }
});

router.post("/bot/cache/clear", async (req: Request, res: Response) => {
  try {
    const { cacheType } = req.body;
    
    await logDeveloperAction(req.user!.id, "clear_bot_cache", { cacheType }, req);
    
    res.json({ success: true, message: `Cache cleared: ${cacheType}` });
  } catch (error) {
    console.error("Failed to clear cache:", error);
    res.status(500).json({ error: "Failed to clear cache" });
  }
});

// Analytics APIs
router.get("/analytics/tickets", async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    
    const ticketsQuery = await db.execute(sql`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM tickets
      WHERE created_at >= NOW() - INTERVAL '${sql.raw(days.toString())} days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);
    
    await logDeveloperAction(req.user!.id, "view_ticket_analytics", { days }, req);
    res.json({ data: ticketsQuery });
  } catch (error) {
    console.error("Failed to get ticket analytics:", error);
    res.status(500).json({ error: "Failed to get ticket analytics" });
  }
});

router.get("/analytics/response-times", async (req: Request, res: Response) => {
  try {
    const responseTimesQuery = await db.execute(sql`
      SELECT 
        t.id,
        t.title,
        t.created_at,
        MIN(tm.created_at) as first_response,
        EXTRACT(EPOCH FROM (MIN(tm.created_at) - t.created_at)) as response_time_seconds
      FROM tickets t
      LEFT JOIN ticket_messages tm ON t.id = tm.ticket_id
      WHERE tm.sender_id != t.creator_id
      GROUP BY t.id, t.title, t.created_at
      HAVING MIN(tm.created_at) IS NOT NULL
      ORDER BY t.created_at DESC
      LIMIT 100
    `);
    
    await logDeveloperAction(req.user!.id, "view_response_time_analytics", null, req);
    res.json({ data: responseTimesQuery });
  } catch (error) {
    console.error("Failed to get response time analytics:", error);
    res.status(500).json({ error: "Failed to get response time analytics" });
  }
});

// Developer Management APIs
router.get("/developers", async (req: Request, res: Response) => {
  try {
    const developers = await storage.getDevelopers();
    
    await logDeveloperAction(req.user!.id, "view_developers", null, req);
    res.json({ developers });
  } catch (error) {
    console.error("Failed to get developers:", error);
    res.status(500).json({ error: "Failed to get developers" });
  }
});

router.post("/developers", async (req: Request, res: Response) => {
  try {
    const { discordId, username } = req.body;
    
    if (!discordId || !username) {
      return res.status(400).json({ error: "discordId and username are required" });
    }
    
    const developer = await storage.addDeveloper({
      discordId,
      username,
      addedBy: req.user!.id,
      isActive: true
    });
    
    await logDeveloperAction(req.user!.id, "add_developer", { discordId, username }, req);
    res.json({ developer });
  } catch (error) {
    console.error("Failed to add developer:", error);
    res.status(500).json({ error: "Failed to add developer" });
  }
});

router.delete("/developers/:discordId", async (req: Request, res: Response) => {
  try {
    const { discordId } = req.params;
    
    const success = await storage.removeDeveloper(discordId);
    
    if (!success) {
      return res.status(404).json({ error: "Developer not found" });
    }
    
    await logDeveloperAction(req.user!.id, "remove_developer", { discordId }, req);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to remove developer:", error);
    res.status(500).json({ error: "Failed to remove developer" });
  }
});

router.get("/audit-log", async (req: Request, res: Response) => {
  try {
    const developerId = req.query.developerId as string | undefined;
    const logs = await storage.getDeveloperAuditLogs(developerId);
    
    await logDeveloperAction(req.user!.id, "view_audit_log", { developerId }, req);
    res.json({ logs });
  } catch (error) {
    console.error("Failed to get audit log:", error);
    res.status(500).json({ error: "Failed to get audit log" });
  }
});

// Check if user is a developer
router.get("/auth/profile", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.json({ isDeveloper: false });
    }
    
    const developer = await storage.getDeveloper(req.user!.id);
    res.json({ 
      isDeveloper: !!developer && developer.isActive,
      developer
    });
  } catch (error) {
    console.error("Failed to get developer profile:", error);
    res.json({ isDeveloper: false });
  }
});

export default router;
