// Reference: javascript_websocket blueprint
import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { botManager } from "./bot-manager";
import { giveawayService } from "./giveaway-service";
import {
  updateBotConfigSchema,
  insertCustomCommandSchema,
  updateCustomCommandSchema,
  updateModerationRuleSchema,
  insertGiveawaySchema,
  updateShoutoutSettingsSchema,
} from "@shared/schema";
import { getAvailableVariables } from "./command-variables";
import authRoutes from "./auth/routes";
import oauthSignInRoutes from "./auth/oauth-signin-routes";
import spotifyRoutes from "./spotify-routes";
import oauthSpotifyRoutes from "./oauth-spotify";
import oauthYoutubeRoutes from "./oauth-youtube";
import oauthTwitchRoutes from "./oauth-twitch";
import overlayRoutes from "./overlay-routes";
import { requireAuth } from "./auth/middleware";
import { sessionMiddleware } from "./index";
import { shoutoutService } from "./shoutout-service";
import { statsService } from "./stats-service";
import { GamesService } from "./games-service";
import { currencyService } from "./currency-service";
import { songRequestService } from "./song-request-service";
import { PollsService } from "./polls-service";
import { AlertsService } from "./alerts-service";
import { ChatbotService } from "./chatbot-service";
import { analyticsService } from "./analytics-service";
import { tokenRefreshService } from "./token-refresh-service";
import { quotaService } from "./quota-service";
import { getHealthStatus } from "./health";

export async function registerRoutes(app: Express): Promise<Server> {
  app.use("/api/auth", oauthSignInRoutes);
  app.use("/auth", authRoutes);
  app.use("/auth", oauthSpotifyRoutes);
  app.use("/auth", oauthYoutubeRoutes);
  app.use("/auth", oauthTwitchRoutes);
  app.use("/api/spotify", spotifyRoutes);
  app.use("/api/overlay", overlayRoutes);
  const httpServer = createServer(app);

  // Bootstrap botManager
  await botManager.bootstrap();

  // Start token refresh service
  tokenRefreshService.start();

  // Initialize WebSocket server on /ws path (Reference: javascript_websocket blueprint)
  const wss = new WebSocketServer({ noServer: true });

  // Authenticate WebSocket upgrades using session middleware
  httpServer.on("upgrade", (request: any, socket, head) => {
    if (request.url !== "/ws") {
      socket.destroy();
      return;
    }

    // Create a fake response object for session middleware
    const res: any = {
      getHeader: () => {},
      setHeader: () => {},
      writeHead: () => {},
      end: () => {},
    };

    // Run session middleware to hydrate request.session
    sessionMiddleware(request, res, () => {
      // Check if user is authenticated
      if (!request.session?.passport?.user) {
        console.log("[WebSocket] Rejecting unauthenticated connection");
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      const userId = request.session.passport.user;

      // Handle the upgrade with authenticated userId
      wss.handleUpgrade(request, socket, head, (ws) => {
        // Attach userId to WebSocket for later reference
        (ws as any).userId = userId;
        wss.emit("connection", ws, request);
      });
    });
  });

  wss.on("connection", (ws: WebSocket) => {
    const userId = (ws as any).userId;

    if (!userId) {
      ws.close();
      return;
    }

    // Register WebSocket client with botManager
    botManager.addWSClient(ws, userId);
    console.log(`[WebSocket] Client connected for user ${userId}`);

    ws.on("close", () => {
      botManager.removeWSClient(ws);
      console.log(`[WebSocket] Client disconnected for user ${userId}`);
    });

    ws.on("error", (error) => {
      console.error(`[WebSocket] Error for user ${userId}:`, error);
    });
  });

  // Health Check - Comprehensive health monitoring endpoint
  app.get("/health", async (req, res) => {
    const healthData = await getHealthStatus();
    const statusCode = healthData.status === 'healthy' ? 200 : healthData.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(healthData);
  });

  // Readiness Check - Checks database connectivity
  app.get("/ready", async (req, res) => {
    try {
      // Check database connection
      const { pool } = await import('./db');
      await pool.query('SELECT 1');
      res.json({ status: 'ready' });
    } catch (error: any) {
      res.status(503).json({ 
        status: 'not ready', 
        error: 'Database unavailable',
        message: error.message 
      });
    }
  });

  // Diagnostics - Detailed system diagnostics for homelabhub integration
  // Note: This endpoint is public for system monitoring and doesn't include user-specific data
  app.get("/api/diagnostics", async (req, res) => {
    try {
      const diagnostics: any = {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || "development",
        version: "1.0.0",
        status: "operational"
      };

      // WebSocket status
      const managerStats = botManager.getStats();
      diagnostics.websocket = {
        clients: managerStats.totalWSClients,
        status: "active"
      };

      // Bot Manager status
      diagnostics.bot = {
        totalWorkers: managerStats.totalWorkers,
        activeWorkers: managerStats.activeWorkers,
        status: "operational"
      };

      // OpenAI integration status
      diagnostics.openai = {
        configured: !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY),
        baseUrl: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
      };

      res.json(diagnostics);
    } catch (error: any) {
      res.status(500).json({ 
        status: "error",
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Enhanced Health Check - Detailed bot health for homelabhub integration
  // Returns bot status, platform connections, and user counts
  app.get("/api/health", async (req, res) => {
    try {
      const managerStats = botManager.getStats();
      
      // Get all users with bot instances
      const { db } = await import('./db');
      const { botInstances, users } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');
      
      const instances = await db.query.botInstances.findMany({
        where: eq(botInstances.status, 'running'),
      });

      // Count total users
      const allUsers = await db.query.users.findMany();
      const userCount = allUsers.length;

      // Aggregate platform connection statuses
      const platformStatuses = {
        twitch: { connected: 0, total: 0 },
        youtube: { connected: 0, total: 0 },
        kick: { connected: 0, total: 0 }
      };

      // Query all platform connections
      const { platformConnections } = await import('@shared/schema');
      const allConnections = await db.query.platformConnections.findMany();

      for (const conn of allConnections) {
        const platform = conn.platform as 'twitch' | 'youtube' | 'kick';
        if (platformStatuses[platform]) {
          platformStatuses[platform].total++;
          if (conn.isConnected) {
            platformStatuses[platform].connected++;
          }
        }
      }

      // Determine overall status
      const status = managerStats.activeWorkers > 0 ? 'online' : 'idle';

      const health = {
        status,
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        service: 'stream-bot',
        bot: {
          totalWorkers: managerStats.totalWorkers,
          activeWorkers: managerStats.activeWorkers,
          status: status === 'online' ? 'operational' : 'idle',
        },
        platforms: {
          twitch: {
            status: platformStatuses.twitch.connected > 0 ? 'connected' : 'disconnected',
            connections: platformStatuses.twitch.connected,
            total: platformStatuses.twitch.total,
          },
          youtube: {
            status: platformStatuses.youtube.connected > 0 ? 'connected' : 'disconnected',
            connections: platformStatuses.youtube.connected,
            total: platformStatuses.youtube.total,
          },
          kick: {
            status: platformStatuses.kick.connected > 0 ? 'connected' : 'disconnected',
            connections: platformStatuses.kick.connected,
            total: platformStatuses.kick.total,
          },
        },
        users: {
          total: userCount,
          activeInstances: instances.length,
        },
        websocket: {
          clients: managerStats.totalWSClients,
          status: 'active',
        },
        memory: {
          used: process.memoryUsage().heapUsed,
          total: process.memoryUsage().heapTotal,
        },
      };

      res.json(health);
    } catch (error: any) {
      console.error('Error fetching bot health:', error);
      res.status(500).json({ 
        status: 'error',
        message: 'Failed to fetch bot health',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Platform Connections - sanitized to not expose encrypted tokens
  app.get("/api/platforms", requireAuth, async (req, res) => {
    try {
      const platforms = await storage.getPlatformConnections(req.user!.id);
      
      // Remove sensitive token data before sending to client
      const sanitized = platforms.map(p => ({
        id: p.id,
        platform: p.platform,
        platformUserId: p.platformUserId,
        platformUsername: p.platformUsername,
        isConnected: p.isConnected,
        lastConnectedAt: p.lastConnectedAt,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }));
      
      res.json(sanitized);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch platforms" });
    }
  });

  app.get("/api/platforms/:id", requireAuth, async (req, res) => {
    try {
      const platform = await storage.getPlatformConnection(req.user!.id, req.params.id);
      if (!platform) {
        return res.status(404).json({ error: "Platform not found" });
      }
      
      // Remove sensitive token data before sending to client
      const sanitized = {
        id: platform.id,
        platform: platform.platform,
        platformUserId: platform.platformUserId,
        platformUsername: platform.platformUsername,
        isConnected: platform.isConnected,
        lastConnectedAt: platform.lastConnectedAt,
        createdAt: platform.createdAt,
        updatedAt: platform.updatedAt,
      };
      
      res.json(sanitized);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch platform" });
    }
  });

  app.post("/api/platforms", requireAuth, async (req, res) => {
    try {
      const platform = await storage.createPlatformConnection(req.user!.id, req.body);
      
      // Sanitize before returning to client
      const sanitized = {
        id: platform.id,
        platform: platform.platform,
        platformUserId: platform.platformUserId,
        platformUsername: platform.platformUsername,
        isConnected: platform.isConnected,
        lastConnectedAt: platform.lastConnectedAt,
        createdAt: platform.createdAt,
        updatedAt: platform.updatedAt,
      };
      
      res.json(sanitized);
    } catch (error: any) {
      console.error("Failed to create platform:", error);
      res.status(500).json({ error: "Failed to create platform connection", details: error.message });
    }
  });

  app.patch("/api/platforms/:id", requireAuth, async (req, res) => {
    try {
      const platform = await storage.updatePlatformConnection(
        req.user!.id,
        req.params.id,
        req.body
      );
      
      // Sanitize before returning to client
      const sanitized = {
        id: platform.id,
        platform: platform.platform,
        platformUserId: platform.platformUserId,
        platformUsername: platform.platformUsername,
        isConnected: platform.isConnected,
        lastConnectedAt: platform.lastConnectedAt,
        createdAt: platform.createdAt,
        updatedAt: platform.updatedAt,
      };
      
      res.json(sanitized);
    } catch (error) {
      res.status(500).json({ error: "Failed to update platform connection" });
    }
  });

  app.delete("/api/platforms/:id", requireAuth, async (req, res) => {
    try {
      await storage.deletePlatformConnection(req.user!.id, req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete platform connection" });
    }
  });

  // Bot Settings
  app.get("/api/settings", requireAuth, async (req, res) => {
    try {
      let settings = await storage.getBotSettings(req.user!.id);
      
      // Create default settings if none exist
      if (!settings) {
        settings = await storage.createBotSettings(req.user!.id, {
          userId: req.user!.id,
          intervalMode: "manual",
          aiModel: "gpt-5-mini",
          enableChatTriggers: true,
          chatKeywords: ["!snapple", "!fact"],
          activePlatforms: [],
          isActive: false,
        });
      }
      
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.patch("/api/settings", requireAuth, async (req, res) => {
    try {
      const validated = updateBotConfigSchema.parse(req.body);
      const settings = await storage.updateBotSettings(req.user!.id, validated);
      
      // Start/stop/restart user's bot based on settings
      if (settings.isActive) {
        await botManager.restartUserBot(req.user!.id);
      } else {
        await botManager.stopUserBot(req.user!.id);
      }
      
      res.json(settings);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid settings data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Message History
  app.get("/api/messages", requireAuth, async (req, res) => {
    try {
      const messages = await storage.getMessages(req.user!.id);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.get("/api/messages/recent", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const messages = await storage.getRecentMessages(req.user!.id, limit);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recent messages" });
    }
  });

  // Stats
  app.get("/api/stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getMessageStats(req.user!.id);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Analytics
  app.get("/api/analytics/sentiment", requireAuth, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const sentimentTrend = await analyticsService.getSentimentTrend(req.user!.id, days);
      res.json(sentimentTrend);
    } catch (error: any) {
      console.error('[Analytics] Sentiment endpoint error:', error);
      res.status(500).json({ error: "Failed to fetch sentiment data" });
    }
  });

  app.get("/api/analytics/growth", requireAuth, async (req, res) => {
    try {
      const predictions = await analyticsService.predictGrowth(req.user!.id);
      res.json(predictions);
    } catch (error: any) {
      console.error('[Analytics] Growth endpoint error:', error);
      res.status(500).json({ error: "Failed to generate growth predictions" });
    }
  });

  app.get("/api/analytics/engagement", requireAuth, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const metrics = await analyticsService.getEngagementMetrics(req.user!.id, days);
      res.json(metrics);
    } catch (error: any) {
      console.error('[Analytics] Engagement endpoint error:', error);
      res.status(500).json({ error: "Failed to fetch engagement metrics" });
    }
  });

  app.get("/api/analytics/best-times", requireAuth, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 90;
      const bestTimes = await analyticsService.getBestStreamingTimes(req.user!.id, days);
      res.json(bestTimes);
    } catch (error: any) {
      console.error('[Analytics] Best times endpoint error:', error);
      res.status(500).json({ error: "Failed to fetch best streaming times" });
    }
  });

  app.get("/api/analytics/health-score", requireAuth, async (req, res) => {
    try {
      const healthScore = await analyticsService.calculateHealthScore(req.user!.id);
      res.json(healthScore);
    } catch (error: any) {
      console.error('[Analytics] Health score endpoint error:', error);
      res.status(500).json({ error: "Failed to calculate health score" });
    }
  });

  // Quota Management - Admin endpoints for monitoring API quota usage
  app.get("/api/admin/quota/status", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const includeGlobal = req.query.global === 'true';
      
      const userQuotas = await quotaService.getAllQuotaStatus(userId);
      
      let globalQuotas = null;
      if (includeGlobal) {
        globalQuotas = await quotaService.getAllQuotaStatus();
      }

      res.json({
        user: {
          quotas: userQuotas,
          summary: {
            hasWarnings: userQuotas.some(q => q.status === 'warning' || q.status === 'alert'),
            hasCircuitBreaker: userQuotas.some(q => q.isCircuitBreakerActive),
            totalPlatforms: userQuotas.length,
          },
        },
        ...(globalQuotas && {
          global: {
            quotas: globalQuotas,
            summary: {
              hasWarnings: globalQuotas.some(q => q.status === 'warning' || q.status === 'alert'),
              hasCircuitBreaker: globalQuotas.some(q => q.isCircuitBreakerActive),
              totalPlatforms: globalQuotas.length,
            },
          },
        }),
      });
    } catch (error: any) {
      console.error('[Quota] Failed to fetch quota status:', error);
      res.status(500).json({ error: "Failed to fetch quota status" });
    }
  });

  app.post("/api/admin/quota/reset", requireAuth, async (req, res) => {
    try {
      const { platform } = req.body;
      const userId = req.user!.id;

      if (!platform || !['twitch', 'youtube', 'kick'].includes(platform)) {
        return res.status(400).json({ 
          error: "Invalid platform. Must be 'twitch', 'youtube', or 'kick'" 
        });
      }

      await quotaService.resetQuota(platform as 'twitch' | 'youtube' | 'kick', userId);
      
      res.json({ 
        success: true, 
        message: `Quota reset for ${platform}`,
        platform,
      });
    } catch (error: any) {
      console.error('[Quota] Failed to reset quota:', error);
      res.status(500).json({ error: "Failed to reset quota" });
    }
  });

  app.post("/api/admin/quota/reset-all", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      
      await quotaService.resetAllQuotas(userId);
      
      res.json({ 
        success: true, 
        message: "All quotas reset successfully",
      });
    } catch (error: any) {
      console.error('[Quota] Failed to reset all quotas:', error);
      res.status(500).json({ error: "Failed to reset all quotas" });
    }
  });

  // Custom Commands
  app.get("/api/commands", requireAuth, async (req, res) => {
    try {
      const commands = await storage.getCustomCommands(req.user!.id);
      res.json(commands);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch commands" });
    }
  });

  app.get("/api/commands/:id", requireAuth, async (req, res) => {
    try {
      const command = await storage.getCustomCommand(req.user!.id, req.params.id);
      if (!command) {
        return res.status(404).json({ error: "Command not found" });
      }
      res.json(command);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch command" });
    }
  });

  app.post("/api/commands", requireAuth, async (req, res) => {
    try {
      const validated = insertCustomCommandSchema.parse(req.body);
      
      // Check if command name already exists for this user
      const existing = await storage.getCustomCommandByName(req.user!.id, validated.name);
      if (existing) {
        return res.status(400).json({ error: "A command with this name already exists" });
      }
      
      const command = await storage.createCustomCommand(req.user!.id, validated);
      res.json(command);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid command data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create command" });
    }
  });

  app.patch("/api/commands/:id", requireAuth, async (req, res) => {
    try {
      const validated = updateCustomCommandSchema.parse(req.body);
      
      // If updating name, check if it already exists
      if (validated.name) {
        const existing = await storage.getCustomCommandByName(req.user!.id, validated.name);
        if (existing && existing.id !== req.params.id) {
          return res.status(400).json({ error: "A command with this name already exists" });
        }
      }
      
      const command = await storage.updateCustomCommand(req.user!.id, req.params.id, validated);
      res.json(command);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid command data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update command" });
    }
  });

  app.delete("/api/commands/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteCustomCommand(req.user!.id, req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete command" });
    }
  });

  app.get("/api/commands/:id/stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getCommandStats(req.user!.id, req.params.id);
      res.json(stats);
    } catch (error: any) {
      if (error.message === "Command not found") {
        return res.status(404).json({ error: "Command not found" });
      }
      res.status(500).json({ error: "Failed to fetch command stats" });
    }
  });

  app.get("/api/commands-variables", requireAuth, async (req, res) => {
    try {
      const variables = getAvailableVariables();
      res.json(variables);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch available variables" });
    }
  });

  // Giveaways
  app.get("/api/giveaways", requireAuth, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const giveaways = await giveawayService.getGiveawayHistory(req.user!.id, limit);
      res.json(giveaways);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch giveaways" });
    }
  });

  app.get("/api/giveaways/active", requireAuth, async (req, res) => {
    try {
      const activeGiveaway = await giveawayService.getActiveGiveaway(req.user!.id);
      res.json(activeGiveaway);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch active giveaway" });
    }
  });

  app.get("/api/giveaways/:id", requireAuth, async (req, res) => {
    try {
      const giveaway = await giveawayService.getGiveaway(req.user!.id, req.params.id);
      if (!giveaway) {
        return res.status(404).json({ error: "Giveaway not found" });
      }
      res.json(giveaway);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch giveaway" });
    }
  });

  app.get("/api/giveaways/:id/entries", requireAuth, async (req, res) => {
    try {
      const giveaway = await giveawayService.getGiveaway(req.user!.id, req.params.id);
      if (!giveaway) {
        return res.status(404).json({ error: "Giveaway not found" });
      }
      
      const entries = await storage.getGiveawayEntries(req.params.id);
      res.json(entries);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch giveaway entries" });
    }
  });

  app.post("/api/giveaways", requireAuth, async (req, res) => {
    try {
      const validated = insertGiveawaySchema.parse(req.body);
      const giveaway = await giveawayService.createGiveaway(req.user!.id, validated);
      
      botManager.notifyGiveawayStart(req.user!.id, giveaway);
      
      res.json(giveaway);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid giveaway data", details: error.errors });
      }
      if (error.message?.includes("already have an active giveaway")) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to create giveaway" });
    }
  });

  app.post("/api/giveaways/:id/end", requireAuth, async (req, res) => {
    try {
      const result = await giveawayService.endGiveaway(req.user!.id, req.params.id);
      
      botManager.notifyGiveawayEnd(req.user!.id, result.giveaway, result.winners);
      
      res.json(result);
    } catch (error: any) {
      if (error.message === "Giveaway not found") {
        return res.status(404).json({ error: "Giveaway not found" });
      }
      if (error.message === "This giveaway has already ended") {
        return res.status(400).json({ error: error.message });
      }
      if (error.message === "No entries to select winners from") {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to end giveaway" });
    }
  });

  app.delete("/api/giveaways/:id", requireAuth, async (req, res) => {
    try {
      await giveawayService.cancelGiveaway(req.user!.id, req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      if (error.message === "Giveaway not found") {
        return res.status(404).json({ error: "Giveaway not found" });
      }
      if (error.message === "Cannot cancel a giveaway that has already ended") {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to cancel giveaway" });
    }
  });

  // Shoutouts
  app.get("/api/shoutouts/settings", requireAuth, async (req, res) => {
    try {
      let settings = await storage.getShoutoutSettings(req.user!.id);
      
      // Create default settings if none exist
      if (!settings) {
        settings = await storage.createShoutoutSettings(req.user!.id, {
          userId: req.user!.id,
          enableAutoShoutouts: false,
          shoutoutTemplate: "Check out @{username}! They were last streaming {game} with {viewers} viewers! {url}",
          enableRaidShoutouts: false,
          enableHostShoutouts: false,
          recentFollowerShoutouts: false,
        });
      }
      
      res.json(settings);
    } catch (error) {
      console.error("Failed to fetch shoutout settings:", error);
      res.status(500).json({ error: "Failed to fetch shoutout settings" });
    }
  });

  app.patch("/api/shoutouts/settings", requireAuth, async (req, res) => {
    try {
      const validated = updateShoutoutSettingsSchema.parse(req.body);
      const settings = await storage.updateShoutoutSettings(req.user!.id, validated);
      res.json(settings);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid settings data", details: error.errors });
      }
      console.error("Failed to update shoutout settings:", error);
      res.status(500).json({ error: "Failed to update shoutout settings" });
    }
  });

  app.post("/api/shoutouts", requireAuth, async (req, res) => {
    try {
      const { targetUsername, platform } = req.body;
      
      if (!targetUsername || !platform) {
        return res.status(400).json({ error: "Missing required fields: targetUsername and platform" });
      }
      
      const result = await shoutoutService.executeShoutout(
        req.user!.id,
        targetUsername,
        platform,
        "manual"
      );
      
      if (result.success) {
        // Post the shoutout to the platform via the bot
        const userBot = botManager.getUserBot(req.user!.id);
        if (userBot) {
          await userBot.postToPlatform(platform, result.message);
        }
        
        res.json({ success: true, message: result.message });
      } else {
        res.status(400).json({ success: false, error: result.message });
      }
    } catch (error: any) {
      console.error("Failed to execute manual shoutout:", error);
      res.status(500).json({ error: "Failed to execute shoutout", details: error.message });
    }
  });

  app.get("/api/shoutouts/history", requireAuth, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const history = await storage.getShoutoutHistory(req.user!.id, limit);
      res.json(history);
    } catch (error) {
      console.error("Failed to fetch shoutout history:", error);
      res.status(500).json({ error: "Failed to fetch shoutout history" });
    }
  });

  app.get("/api/shoutouts/stats", requireAuth, async (req, res) => {
    try {
      const stats = await shoutoutService.getShoutoutStats(req.user!.id);
      res.json(stats);
    } catch (error) {
      console.error("Failed to fetch shoutout stats:", error);
      res.status(500).json({ error: "Failed to fetch shoutout stats" });
    }
  });

  // Manual Trigger
  app.post("/api/trigger", requireAuth, async (req, res) => {
    try {
      const { platforms } = req.body;
      
      if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
        return res.status(400).json({ error: "Platforms array required" });
      }

      const fact = await botManager.postManualFact(req.user!.id, platforms);
      
      if (!fact) {
        return res.status(500).json({ error: "Failed to generate fact" });
      }

      res.json({ success: true, fact });
    } catch (error) {
      res.status(500).json({ error: "Failed to trigger fact posting" });
    }
  });

  // Generate Preview Fact
  app.post("/api/generate-fact", requireAuth, async (req, res) => {
    try {
      const fact = await botManager.generateFact(req.user!.id);
      console.log("[generate-fact] Generated fact:", fact || "(empty)");
      res.json({ fact: fact || "" });
    } catch (error: any) {
      console.error("[generate-fact] Error:", error.message || error);
      res.status(500).json({ error: "Failed to generate fact", details: error.message });
    }
  });

  // Moderation Rules
  app.get("/api/moderation/rules", requireAuth, async (req, res) => {
    try {
      let rules = await storage.getModerationRules(req.user!.id);
      
      // Initialize default rules if none exist
      if (rules.length === 0) {
        rules = await storage.initializeDefaultModerationRules(req.user!.id);
      }
      
      res.json(rules);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch moderation rules" });
    }
  });

  app.patch("/api/moderation/rules", requireAuth, async (req, res) => {
    try {
      const { rules } = req.body;
      
      if (!Array.isArray(rules)) {
        return res.status(400).json({ error: "Rules must be an array" });
      }

      const updatedRules = [];
      for (const ruleUpdate of rules) {
        const validated = updateModerationRuleSchema.parse(ruleUpdate);
        const updated = await storage.updateModerationRule(
          req.user!.id,
          ruleUpdate.id,
          validated
        );
        updatedRules.push(updated);
      }
      
      res.json(updatedRules);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid rule data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update moderation rules" });
    }
  });

  app.patch("/api/moderation/rules/:id", requireAuth, async (req, res) => {
    try {
      const validated = updateModerationRuleSchema.parse(req.body);
      const rule = await storage.updateModerationRule(req.user!.id, req.params.id, validated);
      res.json(rule);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid rule data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update moderation rule" });
    }
  });

  // Bulk Moderation Settings (convenience endpoint)
  app.get("/api/moderation/settings", requireAuth, async (req, res) => {
    try {
      let rules = await storage.getModerationRules(req.user!.id);
      
      // Initialize default rules if none exist
      if (rules.length === 0) {
        rules = await storage.initializeDefaultModerationRules(req.user!.id);
      }
      
      const [whitelist, botConfig] = await Promise.all([
        storage.getLinkWhitelist(req.user!.id),
        storage.getBotSettings(req.user!.id),
      ]);

      const settings = {
        rules,
        whitelistedLinks: whitelist,
        bannedWords: botConfig?.bannedWords || [],
        enableToxicFilter: rules.find(r => r.ruleType === "toxic")?.isEnabled || false,
        enableSpamFilter: rules.find(r => r.ruleType === "spam")?.isEnabled || false,
        enableLinkFilter: rules.find(r => r.ruleType === "links")?.isEnabled || false,
        enableCapsFilter: rules.find(r => r.ruleType === "caps")?.isEnabled || false,
        enableSymbolFilter: rules.find(r => r.ruleType === "symbols")?.isEnabled || false,
        autoTimeoutDuration: rules.find(r => r.action === "timeout")?.timeoutDuration || 300,
      };
      
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch moderation settings" });
    }
  });

  app.patch("/api/moderation/settings", requireAuth, async (req, res) => {
    try {
      const { bannedWords } = req.body;
      
      // Update banned words in bot config if provided
      if (bannedWords !== undefined) {
        if (!Array.isArray(bannedWords)) {
          return res.status(400).json({ error: "bannedWords must be an array" });
        }
        
        await storage.updateBotSettings(req.user!.id, { bannedWords });
      }
      
      // Return updated settings
      const [rules, whitelist, botConfig] = await Promise.all([
        storage.getModerationRules(req.user!.id),
        storage.getLinkWhitelist(req.user!.id),
        storage.getBotSettings(req.user!.id),
      ]);

      const settings = {
        rules,
        whitelistedLinks: whitelist,
        bannedWords: botConfig?.bannedWords || [],
        enableToxicFilter: rules.find(r => r.ruleType === "toxic")?.isEnabled || false,
        enableSpamFilter: rules.find(r => r.ruleType === "spam")?.isEnabled || false,
        enableLinkFilter: rules.find(r => r.ruleType === "links")?.isEnabled || false,
        enableCapsFilter: rules.find(r => r.ruleType === "caps")?.isEnabled || false,
        enableSymbolFilter: rules.find(r => r.ruleType === "symbols")?.isEnabled || false,
        autoTimeoutDuration: rules.find(r => r.action === "timeout")?.timeoutDuration || 300,
      };
      
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to update moderation settings" });
    }
  });

  // Moderation Logs
  app.get("/api/moderation/logs", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await storage.getModerationLogs(req.user!.id, limit);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch moderation logs" });
    }
  });

  app.get("/api/moderation/stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getModerationStats(req.user!.id);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch moderation stats" });
    }
  });

  // Link Whitelist
  app.get("/api/moderation/whitelist", requireAuth, async (req, res) => {
    try {
      const whitelist = await storage.getLinkWhitelist(req.user!.id);
      res.json(whitelist);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch link whitelist" });
    }
  });

  app.post("/api/moderation/whitelist", requireAuth, async (req, res) => {
    try {
      const { domain } = req.body;
      
      if (!domain || typeof domain !== "string") {
        return res.status(400).json({ error: "Domain is required" });
      }
      
      const whitelistEntry = await storage.addToLinkWhitelist(req.user!.id, domain);
      res.json(whitelistEntry);
    } catch (error: any) {
      if (error.message?.includes("duplicate")) {
        return res.status(400).json({ error: "Domain already whitelisted" });
      }
      res.status(500).json({ error: "Failed to add domain to whitelist" });
    }
  });

  app.delete("/api/moderation/whitelist/:domain", requireAuth, async (req, res) => {
    try {
      await storage.removeFromLinkWhitelist(req.user!.id, req.params.domain);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove domain from whitelist" });
    }
  });

  // Stream Statistics
  app.get("/api/stream-stats/current", requireAuth, async (req, res) => {
    try {
      const platform = req.query.platform as string;
      
      if (!platform) {
        return res.status(400).json({ error: "Platform is required" });
      }
      
      const session = await statsService.getCurrentSession(req.user!.id, platform);
      
      if (!session) {
        return res.json(null);
      }
      
      const stats = await statsService.getSessionStats(session.id);
      res.json(stats);
    } catch (error) {
      console.error("Failed to fetch current stream stats:", error);
      res.status(500).json({ error: "Failed to fetch current stream stats" });
    }
  });

  app.get("/api/stream-stats/sessions", requireAuth, async (req, res) => {
    try {
      const platform = req.query.platform as string;
      const limit = parseInt(req.query.limit as string) || 10;
      
      const sessions = await statsService.getRecentSessions(req.user!.id, platform, limit);
      res.json(sessions);
    } catch (error) {
      console.error("Failed to fetch session history:", error);
      res.status(500).json({ error: "Failed to fetch session history" });
    }
  });

  app.get("/api/stream-stats/sessions/:id", requireAuth, async (req, res) => {
    try {
      const stats = await statsService.getSessionStats(req.params.id);
      
      if (!stats) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Verify the session belongs to the authenticated user
      if (stats.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      res.json(stats);
    } catch (error) {
      console.error("Failed to fetch session details:", error);
      res.status(500).json({ error: "Failed to fetch session details" });
    }
  });

  app.get("/api/stream-stats/top-chatters", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const sessionId = req.query.sessionId as string;
      
      const topChatters = await statsService.getTopChatters(req.user!.id, limit, sessionId);
      res.json(topChatters);
    } catch (error) {
      console.error("Failed to fetch top chatters:", error);
      res.status(500).json({ error: "Failed to fetch top chatters" });
    }
  });

  app.get("/api/stream-stats/heatmap/:sessionId", requireAuth, async (req, res) => {
    try {
      const heatmap = await statsService.getChatActivityHeatmap(req.params.sessionId);
      
      // Get session to verify ownership
      const stats = await statsService.getSessionStats(req.params.sessionId);
      if (!stats) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      if (stats.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      res.json(heatmap);
    } catch (error) {
      console.error("Failed to fetch chat activity heatmap:", error);
      res.status(500).json({ error: "Failed to fetch chat activity heatmap" });
    }
  });

  app.get("/api/stream-stats/viewer-history/:sessionId", requireAuth, async (req, res) => {
    try {
      const viewerHistory = await statsService.getViewerHistory(req.params.sessionId);
      
      // Get session to verify ownership
      const stats = await statsService.getSessionStats(req.params.sessionId);
      if (!stats) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      if (stats.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      res.json(viewerHistory);
    } catch (error) {
      console.error("Failed to fetch viewer history:", error);
      res.status(500).json({ error: "Failed to fetch viewer history" });
    }
  });

  // ===== SONG REQUEST ROUTES =====

  // Get song request settings
  app.get("/api/songrequest/settings", requireAuth, async (req, res) => {
    try {
      const settings = await songRequestService.getSettings(req.user!.id);
      res.json(settings);
    } catch (error) {
      console.error("Failed to fetch song request settings:", error);
      res.status(500).json({ error: "Failed to fetch song request settings" });
    }
  });

  // Update song request settings
  app.patch("/api/songrequest/settings", requireAuth, async (req, res) => {
    try {
      const updated = await songRequestService.updateSettings(req.user!.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Failed to update song request settings:", error);
      res.status(500).json({ error: "Failed to update song request settings" });
    }
  });

  // Search for songs
  app.get("/api/songrequest/search", requireAuth, async (req, res) => {
    try {
      const query = req.query.q as string;
      
      if (!query) {
        return res.status(400).json({ error: "Query parameter 'q' is required" });
      }

      const results = await songRequestService.searchSong(req.user!.id, query);
      res.json(results);
    } catch (error) {
      console.error("Failed to search songs:", error);
      res.status(500).json({ error: "Failed to search songs" });
    }
  });

  // Add song to queue
  app.post("/api/songrequest", requireAuth, async (req, res) => {
    try {
      const { query, requestedBy, isModerator } = req.body;
      
      if (!query || !requestedBy) {
        return res.status(400).json({ error: "query and requestedBy are required" });
      }

      const result = await songRequestService.addToQueue(
        req.user!.id,
        requestedBy,
        query,
        isModerator || false
      );

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      console.error("Failed to add song to queue:", error);
      res.status(500).json({ error: "Failed to add song to queue" });
    }
  });

  // Get current queue
  app.get("/api/songrequest/queue", requireAuth, async (req, res) => {
    try {
      const queue = await songRequestService.getQueue(req.user!.id);
      res.json(queue);
    } catch (error) {
      console.error("Failed to fetch song queue:", error);
      res.status(500).json({ error: "Failed to fetch song queue" });
    }
  });

  // Get current playing song
  app.get("/api/songrequest/current", requireAuth, async (req, res) => {
    try {
      const current = await songRequestService.getCurrentSong(req.user!.id);
      res.json(current);
    } catch (error) {
      console.error("Failed to fetch current song:", error);
      res.status(500).json({ error: "Failed to fetch current song" });
    }
  });

  // Get song request history
  app.get("/api/songrequest/history", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const history = await songRequestService.getHistory(req.user!.id, limit);
      res.json(history);
    } catch (error) {
      console.error("Failed to fetch song request history:", error);
      res.status(500).json({ error: "Failed to fetch song request history" });
    }
  });

  // Remove song from queue
  app.delete("/api/songrequest/:id", requireAuth, async (req, res) => {
    try {
      const removed = await songRequestService.removeFromQueue(req.user!.id, req.params.id);
      
      if (removed) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Song not found in queue" });
      }
    } catch (error) {
      console.error("Failed to remove song from queue:", error);
      res.status(500).json({ error: "Failed to remove song from queue" });
    }
  });

  // Skip current song
  app.post("/api/songrequest/skip", requireAuth, async (req, res) => {
    try {
      const skipped = await songRequestService.skipCurrent(req.user!.id);
      
      if (skipped) {
        const next = await songRequestService.playNext(req.user!.id);
        res.json({ success: true, next });
      } else {
        res.status(404).json({ error: "No song is currently playing" });
      }
    } catch (error) {
      console.error("Failed to skip song:", error);
      res.status(500).json({ error: "Failed to skip song" });
    }
  });

  // Play next song
  app.post("/api/songrequest/next", requireAuth, async (req, res) => {
    try {
      const next = await songRequestService.playNext(req.user!.id);
      
      if (next) {
        res.json(next);
      } else {
        res.status(404).json({ error: "Queue is empty" });
      }
    } catch (error) {
      console.error("Failed to play next song:", error);
      res.status(500).json({ error: "Failed to play next song" });
    }
  });

  // Ban a song
  app.post("/api/songrequest/ban/:songId", requireAuth, async (req, res) => {
    try {
      const { songUrl } = req.body;
      
      if (!songUrl) {
        return res.status(400).json({ error: "songUrl is required" });
      }

      await songRequestService.banSong(req.user!.id, songUrl);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to ban song:", error);
      res.status(500).json({ error: "Failed to ban song" });
    }
  });

  // Unban a song
  app.delete("/api/songrequest/ban/:songId", requireAuth, async (req, res) => {
    try {
      const { songUrl } = req.body;
      
      if (!songUrl) {
        return res.status(400).json({ error: "songUrl is required" });
      }

      await songRequestService.unbanSong(req.user!.id, songUrl);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to unban song:", error);
      res.status(500).json({ error: "Failed to unban song" });
    }
  });

  // Reorder queue
  app.post("/api/songrequest/reorder", requireAuth, async (req, res) => {
    try {
      const { songId, newPosition } = req.body;
      
      if (!songId || typeof newPosition !== 'number') {
        return res.status(400).json({ error: "songId and newPosition are required" });
      }

      const success = await songRequestService.reorderQueue(req.user!.id, songId, newPosition);
      
      if (success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ error: "Failed to reorder queue" });
      }
    } catch (error) {
      console.error("Failed to reorder queue:", error);
      res.status(500).json({ error: "Failed to reorder queue" });
    }
  });

  // ===== GAMES ROUTES =====
  
  app.get("/api/games/settings", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      const settings = await userStorage.getGameSettings();
      
      // Return default settings if none exist
      if (!settings) {
        return res.json({
          userId: req.user!.id,
          enableGames: true,
          enable8Ball: true,
          enableTrivia: true,
          enableDuel: true,
          enableSlots: true,
          enableRoulette: true,
          cooldownMinutes: 1,
          pointsPerWin: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      
      res.json(settings);
    } catch (error) {
      console.error("Failed to fetch game settings:", error);
      res.status(500).json({ error: "Failed to fetch game settings" });
    }
  });

  app.patch("/api/games/settings", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      const updatedSettings = await userStorage.updateGameSettings(req.body);
      res.json(updatedSettings);
    } catch (error) {
      console.error("Failed to update game settings:", error);
      res.status(500).json({ error: "Failed to update game settings" });
    }
  });

  app.get("/api/games/history", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      const limit = parseInt(req.query.limit as string) || 50;
      const gameType = req.query.gameType as string | undefined;
      
      const history = await userStorage.getGameHistory(limit, gameType as any);
      res.json(history);
    } catch (error) {
      console.error("Failed to fetch game history:", error);
      res.status(500).json({ error: "Failed to fetch game history" });
    }
  });

  app.get("/api/games/stats", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      const gamesService = new GamesService(userStorage);
      const stats = await gamesService.getGameStats();
      
      // Convert the stats format for frontend
      const statsArray = Object.entries(stats.byGame).map(([gameType, data]) => ({
        gameType,
        totalPlays: data.plays,
        wins: data.wins,
        losses: data.losses,
        neutral: data.neutral,
        totalPointsAwarded: 0,
      }));
      
      res.json(statsArray);
    } catch (error) {
      console.error("Failed to fetch game stats:", error);
      res.status(500).json({ error: "Failed to fetch game stats" });
    }
  });

  app.get("/api/games/leaderboard", requireAuth, async (req, res) => {
    try {
      const gameName = req.query.gameName as string;
      const limit = parseInt(req.query.limit as string) || 10;
      
      if (!gameName) {
        return res.status(400).json({ error: "gameName query parameter is required" });
      }
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const leaderboard = await userStorage.getGameLeaderboard(gameName, limit);
      res.json(leaderboard);
    } catch (error) {
      console.error("Failed to fetch leaderboard:", error);
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  });

  app.post("/api/games/:gameName/play", requireAuth, async (req, res) => {
    try {
      const { gameName } = req.params;
      const { player, platform, opponent, question, difficulty } = req.body;
      
      if (!player || !platform) {
        return res.status(400).json({ error: "player and platform are required" });
      }
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const gamesService = new GamesService(userStorage);
      
      let result;
      
      switch (gameName) {
        case "8ball":
          if (!question) {
            return res.status(400).json({ error: "question is required for 8ball" });
          }
          result = await gamesService.play8Ball(question);
          break;
          
        case "trivia":
          result = await gamesService.playTrivia(
            (difficulty || "medium") as "easy" | "medium" | "hard",
            player,
            req.user!.id,
            platform
          );
          break;
          
        case "duel":
          if (!opponent) {
            return res.status(400).json({ error: "opponent is required for duel" });
          }
          result = await gamesService.playDuel(player, opponent);
          break;
          
        case "slots":
          result = await gamesService.playSlots();
          break;
          
        case "roulette":
          result = await gamesService.playRoulette(player);
          break;
          
        default:
          return res.status(400).json({ error: "Invalid game name" });
      }
      
      // Track the game play
      if (result.success) {
        await gamesService.trackGamePlay(
          gameName as any,
          player,
          result.outcome || "neutral",
          platform,
          result.pointsAwarded || 0,
          opponent,
          result.details
        );
      }
      
      res.json(result);
    } catch (error) {
      console.error("Failed to play game:", error);
      res.status(500).json({ error: "Failed to play game" });
    }
  });

  app.post("/api/games/trivia/check", requireAuth, async (req, res) => {
    try {
      const { username, platform, answer } = req.body;
      
      if (!username || !platform || !answer) {
        return res.status(400).json({ error: "Missing required fields: username, platform, answer" });
      }
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const gamesService = new GamesService(userStorage);
      
      const result = await gamesService.checkTriviaAnswer(username, req.user!.id, platform, answer);
      
      if (!result) {
        return res.status(404).json({ error: "No active trivia question for this player" });
      }
      
      res.json(result);
    } catch (error) {
      console.error("Failed to check trivia answer:", error);
      res.status(500).json({ error: "Failed to check trivia answer" });
    }
  });

  app.get("/api/currency/settings", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      const settings = await userStorage.getCurrencySettings();
      res.json(settings || {});
    } catch (error) {
      console.error("Failed to fetch currency settings:", error);
      res.status(500).json({ error: "Failed to fetch currency settings" });
    }
  });

  app.patch("/api/currency/settings", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      await userStorage.updateCurrencySettings(req.body);
      const updated = await userStorage.getCurrencySettings();
      res.json(updated);
    } catch (error) {
      console.error("Failed to update currency settings:", error);
      res.status(500).json({ error: "Failed to update currency settings" });
    }
  });

  app.get("/api/currency/balance/:username", requireAuth, async (req, res) => {
    try {
      const { username } = req.params;
      const { platform = "twitch" } = req.query;
      const balance = await currencyService.getBalance(req.user!.id, username, platform as string);
      res.json(balance || { balance: 0, totalEarned: 0, totalSpent: 0 });
    } catch (error) {
      console.error("Failed to fetch balance:", error);
      res.status(500).json({ error: "Failed to fetch balance" });
    }
  });

  app.get("/api/currency/leaderboard", requireAuth, async (req, res) => {
    try {
      const { limit = "10" } = req.query;
      const leaderboard = await currencyService.getLeaderboard(req.user!.id, parseInt(limit as string));
      res.json(leaderboard);
    } catch (error) {
      console.error("Failed to fetch leaderboard:", error);
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  });

  app.post("/api/currency/gamble", requireAuth, async (req, res) => {
    try {
      const { username, platform, amount } = req.body;
      
      if (!username || !platform || !amount) {
        return res.status(400).json({ error: "Missing required fields: username, platform, amount" });
      }
      
      const result = await currencyService.gamblePoints(req.user!.id, username, platform, amount);
      res.json(result);
    } catch (error) {
      console.error("Failed to gamble:", error);
      res.status(500).json({ error: "Failed to gamble" });
    }
  });

  app.get("/api/currency/transactions", requireAuth, async (req, res) => {
    try {
      const { limit = "50", username } = req.query;
      const transactions = await currencyService.getTransactions(
        req.user!.id,
        username as string | undefined,
        parseInt(limit as string)
      );
      res.json(transactions);
    } catch (error) {
      console.error("Failed to fetch transactions:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  app.get("/api/rewards", requireAuth, async (req, res) => {
    try {
      const rewards = await currencyService.getRewards(req.user!.id);
      res.json(rewards);
    } catch (error) {
      console.error("Failed to fetch rewards:", error);
      res.status(500).json({ error: "Failed to fetch rewards" });
    }
  });

  app.post("/api/rewards", requireAuth, async (req, res) => {
    try {
      const { rewardName, cost, command, stock, maxRedeems, isActive = true } = req.body;
      
      if (!rewardName || cost === undefined) {
        return res.status(400).json({ error: "Missing required fields: rewardName, cost" });
      }
      
      const reward = await currencyService.createReward(req.user!.id, {
        rewardName,
        cost,
        command,
        stock,
        maxRedeems,
        isActive
      });
      
      res.json(reward);
    } catch (error) {
      console.error("Failed to create reward:", error);
      res.status(500).json({ error: "Failed to create reward" });
    }
  });

  app.patch("/api/rewards/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await currencyService.updateReward(req.user!.id, parseInt(id), req.body);
      const rewards = await currencyService.getRewards(req.user!.id);
      const updated = rewards.find(r => r.id === parseInt(id));
      res.json(updated);
    } catch (error) {
      console.error("Failed to update reward:", error);
      res.status(500).json({ error: "Failed to update reward" });
    }
  });

  app.delete("/api/rewards/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await currencyService.deleteReward(req.user!.id, parseInt(id));
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete reward:", error);
      res.status(500).json({ error: "Failed to delete reward" });
    }
  });

  app.post("/api/rewards/:id/redeem", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { username, platform } = req.body;
      
      if (!username || !platform) {
        return res.status(400).json({ error: "Missing required fields: username, platform" });
      }
      
      const result = await currencyService.redeemReward(req.user!.id, username, platform, parseInt(id));
      res.json(result);
    } catch (error) {
      console.error("Failed to redeem reward:", error);
      res.status(500).json({ error: "Failed to redeem reward" });
    }
  });

  app.get("/api/currency/redemptions", requireAuth, async (req, res) => {
    try {
      const { pending = "false", limit = "50" } = req.query;
      const redemptions = pending === "true"
        ? await currencyService.getPendingRedemptions(req.user!.id, parseInt(limit as string))
        : await currencyService.getRedemptions(req.user!.id, parseInt(limit as string));
      res.json(redemptions);
    } catch (error) {
      console.error("Failed to fetch redemptions:", error);
      res.status(500).json({ error: "Failed to fetch redemptions" });
    }
  });

  app.post("/api/currency/redemptions/:id/fulfill", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await currencyService.fulfillRedemption(req.user!.id, parseInt(id));
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to fulfill redemption:", error);
      res.status(500).json({ error: "Failed to fulfill redemption" });
    }
  });

  app.post("/api/polls", requireAuth, async (req, res) => {
    try {
      const { question, options, durationSeconds, platform } = req.body;
      
      if (!question || !options || !Array.isArray(options) || options.length < 2) {
        return res.status(400).json({ error: "Missing or invalid fields: question and at least 2 options required" });
      }
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      
      const poll = await pollsService.createPoll(
        req.user!.id,
        question,
        options,
        durationSeconds || 120,
        platform || "twitch"
      );
      
      const result = await pollsService.startPoll(poll.id);
      res.json({ poll, ...result });
    } catch (error) {
      console.error("Failed to create poll:", error);
      res.status(500).json({ error: "Failed to create poll" });
    }
  });

  app.post("/api/polls/:id/vote", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { username, option, platform } = req.body;
      
      if (!username || !option) {
        return res.status(400).json({ error: "Missing required fields: username, option" });
      }
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      
      const result = await pollsService.vote(parseInt(id), username, option, platform || "twitch");
      res.json(result);
    } catch (error) {
      console.error("Failed to vote:", error);
      res.status(500).json({ error: "Failed to vote" });
    }
  });

  app.post("/api/polls/:id/end", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      
      const result = await pollsService.endPoll(parseInt(id));
      res.json(result);
    } catch (error) {
      console.error("Failed to end poll:", error);
      res.status(500).json({ error: "Failed to end poll" });
    }
  });

  app.get("/api/polls/active", requireAuth, async (req, res) => {
    try {
      const { platform = "twitch" } = req.query;
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      
      const poll = await pollsService.getActivePoll(req.user!.id, platform as string);
      res.json(poll || null);
    } catch (error) {
      console.error("Failed to get active poll:", error);
      res.status(500).json({ error: "Failed to get active poll" });
    }
  });

  app.get("/api/polls/:id/results", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      
      const results = await pollsService.getPollResults(parseInt(id));
      res.json(results);
    } catch (error) {
      console.error("Failed to get poll results:", error);
      res.status(500).json({ error: "Failed to get poll results" });
    }
  });

  app.get("/api/polls", requireAuth, async (req, res) => {
    try {
      const { limit = "20", platform } = req.query;
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      
      const polls = await pollsService.getPollHistory(req.user!.id, parseInt(limit as string), platform as string | undefined);
      res.json(polls);
    } catch (error) {
      console.error("Failed to get polls:", error);
      res.status(500).json({ error: "Failed to get polls" });
    }
  });

  app.post("/api/predictions", requireAuth, async (req, res) => {
    try {
      const { title, outcomes, durationSeconds, platform } = req.body;
      
      if (!title || !outcomes || !Array.isArray(outcomes) || outcomes.length < 2) {
        return res.status(400).json({ error: "Missing or invalid fields: title and at least 2 outcomes required" });
      }
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      
      const prediction = await pollsService.createPrediction(
        req.user!.id,
        title,
        outcomes,
        durationSeconds || 300,
        platform || "twitch"
      );
      
      const result = await pollsService.startPrediction(prediction.id);
      res.json({ prediction, ...result });
    } catch (error) {
      console.error("Failed to create prediction:", error);
      res.status(500).json({ error: "Failed to create prediction" });
    }
  });

  app.post("/api/predictions/:id/bet", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { username, outcome, amount, platform } = req.body;
      
      if (!username || !outcome || !amount) {
        return res.status(400).json({ error: "Missing required fields: username, outcome, amount" });
      }
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      
      const result = await pollsService.placeBet(parseInt(id), username, outcome, amount, platform || "twitch");
      res.json(result);
    } catch (error) {
      console.error("Failed to place bet:", error);
      res.status(500).json({ error: "Failed to place bet" });
    }
  });

  app.post("/api/predictions/:id/resolve", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { winningOutcome } = req.body;
      
      if (!winningOutcome) {
        return res.status(400).json({ error: "Missing required field: winningOutcome" });
      }
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      
      const result = await pollsService.resolvePrediction(parseInt(id), winningOutcome);
      res.json(result);
    } catch (error) {
      console.error("Failed to resolve prediction:", error);
      res.status(500).json({ error: "Failed to resolve prediction" });
    }
  });

  app.get("/api/predictions/active", requireAuth, async (req, res) => {
    try {
      const { platform = "twitch" } = req.query;
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      
      const prediction = await pollsService.getActivePrediction(req.user!.id, platform as string);
      res.json(prediction || null);
    } catch (error) {
      console.error("Failed to get active prediction:", error);
      res.status(500).json({ error: "Failed to get active prediction" });
    }
  });

  app.get("/api/predictions/:id/results", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      
      const results = await pollsService.getPredictionResults(parseInt(id));
      res.json(results);
    } catch (error) {
      console.error("Failed to get prediction results:", error);
      res.status(500).json({ error: "Failed to get prediction results" });
    }
  });

  app.get("/api/predictions", requireAuth, async (req, res) => {
    try {
      const { limit = "20", platform } = req.query;
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      
      const predictions = await pollsService.getPredictionHistory(req.user!.id, parseInt(limit as string), platform as string | undefined);
      res.json(predictions);
    } catch (error) {
      console.error("Failed to get predictions:", error);
      res.status(500).json({ error: "Failed to get predictions" });
    }
  });

  app.get("/api/alerts/settings", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      let settings = await userStorage.getAlertSettings();
      
      if (!settings) {
        settings = await userStorage.createAlertSettings({
          userId: req.user!.id,
          enableFollowerAlerts: true,
          enableSubAlerts: true,
          enableRaidAlerts: true,
          enableMilestoneAlerts: true,
          followerTemplate: "Welcome {username}! Thanks for the follow! 🎉",
          subTemplate: "Thank you {username} for subscribing! {tier} for {months} months! 💜",
          raidTemplate: "Thank you {raider} for the raid with {viewers} viewers! 🚀",
          milestoneThresholds: [50, 100, 500, 1000, 5000, 10000],
        });
      }
      
      res.json(settings);
    } catch (error) {
      console.error("Failed to get alert settings:", error);
      res.status(500).json({ error: "Failed to get alert settings" });
    }
  });

  app.patch("/api/alerts/settings", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      const settings = await userStorage.updateAlertSettings(req.body);
      res.json(settings);
    } catch (error) {
      console.error("Failed to update alert settings:", error);
      res.status(500).json({ error: "Failed to update alert settings" });
    }
  });

  app.get("/api/alerts/history", requireAuth, async (req, res) => {
    try {
      const { type, limit = "50" } = req.query;
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const history = await userStorage.getAlertHistory(
        type as string | undefined,
        parseInt(limit as string)
      );
      
      res.json(history);
    } catch (error) {
      console.error("Failed to get alert history:", error);
      res.status(500).json({ error: "Failed to get alert history" });
    }
  });

  app.post("/api/alerts/test", requireAuth, async (req, res) => {
    try {
      const { alertType, platform = "twitch" } = req.body;
      
      if (!alertType || !["follower", "subscriber", "raid", "milestone"].includes(alertType)) {
        return res.status(400).json({ error: "Invalid alert type" });
      }
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const alertsService = new AlertsService(userStorage);
      
      const result = await alertsService.testAlert(req.user!.id, alertType, platform);
      
      if (!result.success) {
        return res.status(400).json({ error: "Failed to test alert" });
      }
      
      res.json(result);
    } catch (error) {
      console.error("Failed to test alert:", error);
      res.status(500).json({ error: "Failed to test alert" });
    }
  });

  app.get("/api/alerts/milestones", requireAuth, async (req, res) => {
    try {
      const { type = "followers" } = req.query;
      
      if (!["followers", "subscribers"].includes(type as string)) {
        return res.status(400).json({ error: "Invalid milestone type" });
      }
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const alertsService = new AlertsService(userStorage);
      
      const progress = await alertsService.getMilestoneProgress(
        req.user!.id,
        type as "followers" | "subscribers"
      );
      
      res.json(progress);
    } catch (error) {
      console.error("Failed to get milestone progress:", error);
      res.status(500).json({ error: "Failed to get milestone progress" });
    }
  });

  // Chatbot
  app.get("/api/chatbot/settings", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      const settings = await userStorage.getChatbotSettings();
      res.json(settings || {
        userId: req.user!.id,
        isEnabled: false,
        personality: "friendly",
        responseRate: 60,
        learningEnabled: true,
        contextWindow: 10,
        mentionTrigger: "@bot"
      });
    } catch (error) {
      console.error("Failed to get chatbot settings:", error);
      res.status(500).json({ error: "Failed to get chatbot settings" });
    }
  });

  app.patch("/api/chatbot/settings", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      const settings = await userStorage.updateChatbotSettings(req.body);
      res.json(settings);
    } catch (error) {
      console.error("Failed to update chatbot settings:", error);
      res.status(500).json({ error: "Failed to update chatbot settings" });
    }
  });

  app.get("/api/chatbot/personalities/presets", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      const presets = await userStorage.getPresetPersonalities();
      res.json(presets);
    } catch (error) {
      console.error("Failed to get preset personalities:", error);
      res.status(500).json({ error: "Failed to get preset personalities" });
    }
  });

  app.get("/api/chatbot/personalities", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      const personalities = await userStorage.getChatbotPersonalities();
      res.json(personalities);
    } catch (error) {
      console.error("Failed to get chatbot personalities:", error);
      res.status(500).json({ error: "Failed to get chatbot personalities" });
    }
  });

  app.get("/api/chatbot/personalities/:id", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      const personality = await userStorage.getChatbotPersonality(req.params.id);
      if (!personality) {
        return res.status(404).json({ error: "Personality not found" });
      }
      res.json(personality);
    } catch (error) {
      console.error("Failed to get chatbot personality:", error);
      res.status(500).json({ error: "Failed to get chatbot personality" });
    }
  });

  app.post("/api/chatbot/personalities", requireAuth, async (req, res) => {
    try {
      const { name, systemPrompt, temperature, traits } = req.body;
      
      if (!name || !systemPrompt) {
        return res.status(400).json({ error: "Missing required fields: name, systemPrompt" });
      }
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const personality = await userStorage.createChatbotPersonality({
        name,
        systemPrompt,
        temperature: temperature || 0.7,
        traits: traits || []
      });
      
      res.json(personality);
    } catch (error) {
      console.error("Failed to create chatbot personality:", error);
      res.status(500).json({ error: "Failed to create chatbot personality" });
    }
  });

  app.patch("/api/chatbot/personalities/:id", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      const personality = await userStorage.updateChatbotPersonality(req.params.id, req.body);
      res.json(personality);
    } catch (error) {
      console.error("Failed to update chatbot personality:", error);
      res.status(500).json({ error: "Failed to update chatbot personality" });
    }
  });

  app.delete("/api/chatbot/personalities/:id", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      await userStorage.deleteChatbotPersonality(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete chatbot personality:", error);
      res.status(500).json({ error: "Failed to delete chatbot personality" });
    }
  });

  app.get("/api/chatbot/context", requireAuth, async (req, res) => {
    try {
      const { limit = "20", username } = req.query;
      const userStorage = storage.getUserStorage(req.user!.id);
      
      let context;
      if (username) {
        context = await userStorage.getChatbotContextByUsername(username as string, parseInt(limit as string));
      } else {
        context = await userStorage.getChatbotContext(parseInt(limit as string));
      }
      
      res.json(context);
    } catch (error) {
      console.error("Failed to get chatbot context:", error);
      res.status(500).json({ error: "Failed to get chatbot context" });
    }
  });

  app.post("/api/chatbot/respond", requireAuth, async (req, res) => {
    try {
      const { message, username, platform = "twitch" } = req.body;
      
      if (!message || !username) {
        return res.status(400).json({ error: "Missing required fields: message, username" });
      }
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const chatbotService = new ChatbotService(userStorage);
      
      const response = await chatbotService.processMessage(username, message, platform);
      
      res.json({ response, success: true });
    } catch (error) {
      console.error("Failed to generate chatbot response:", error);
      res.status(500).json({ error: "Failed to generate chatbot response" });
    }
  });

  // Polls
  app.get("/api/polls", requireAuth, async (req, res) => {
    try {
      const { limit = "20" } = req.query;
      const userStorage = storage.getUserStorage(req.user!.id);
      const polls = await userStorage.getPolls(parseInt(limit as string));
      res.json(polls);
    } catch (error) {
      console.error("Failed to get polls:", error);
      res.status(500).json({ error: "Failed to get polls" });
    }
  });

  app.get("/api/polls/active", requireAuth, async (req, res) => {
    try {
      const { platform } = req.query;
      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      const activePoll = await pollsService.getActivePoll(req.user!.id, platform as string | undefined);
      res.json(activePoll);
    } catch (error) {
      console.error("Failed to get active poll:", error);
      res.status(500).json({ error: "Failed to get active poll" });
    }
  });

  app.get("/api/polls/history", requireAuth, async (req, res) => {
    try {
      const { limit = "20" } = req.query;
      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      const history = await pollsService.getPollHistory(req.user!.id, parseInt(limit as string));
      res.json(history);
    } catch (error) {
      console.error("Failed to get poll history:", error);
      res.status(500).json({ error: "Failed to get poll history" });
    }
  });

  app.get("/api/polls/:id", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      const poll = await userStorage.getPoll(req.params.id);
      if (!poll) {
        return res.status(404).json({ error: "Poll not found" });
      }
      res.json(poll);
    } catch (error) {
      console.error("Failed to get poll:", error);
      res.status(500).json({ error: "Failed to get poll" });
    }
  });

  app.get("/api/polls/:id/results", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      const results = await pollsService.getPollResults(req.params.id);
      res.json(results);
    } catch (error) {
      console.error("Failed to get poll results:", error);
      res.status(500).json({ error: "Failed to get poll results" });
    }
  });

  app.post("/api/polls", requireAuth, async (req, res) => {
    try {
      const { question, options, duration = 120, platform = "twitch" } = req.body;

      if (!question || !options || !Array.isArray(options)) {
        return res.status(400).json({ error: "Invalid poll data" });
      }

      if (options.length < 2 || options.length > 5) {
        return res.status(400).json({ error: "Polls must have 2-5 options" });
      }

      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      
      const poll = await pollsService.createPoll(req.user!.id, question, options, duration, platform);
      const result = await pollsService.startPoll(poll.id);
      
      res.json(result);
    } catch (error: any) {
      console.error("Failed to create poll:", error);
      res.status(500).json({ error: error.message || "Failed to create poll" });
    }
  });

  app.post("/api/polls/:id/vote", requireAuth, async (req, res) => {
    try {
      const { option, username, platform = "twitch" } = req.body;

      if (!option || !username) {
        return res.status(400).json({ error: "Invalid vote data" });
      }

      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      const result = await pollsService.vote(req.params.id, username, option, platform);
      
      res.json(result);
    } catch (error: any) {
      console.error("Failed to vote:", error);
      res.status(500).json({ error: error.message || "Failed to vote" });
    }
  });

  app.post("/api/polls/:id/end", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      const result = await pollsService.endPoll(req.params.id);
      
      res.json(result);
    } catch (error: any) {
      console.error("Failed to end poll:", error);
      res.status(500).json({ error: error.message || "Failed to end poll" });
    }
  });

  // Predictions
  app.get("/api/predictions", requireAuth, async (req, res) => {
    try {
      const { limit = "20" } = req.query;
      const userStorage = storage.getUserStorage(req.user!.id);
      const predictions = await userStorage.getPredictions(parseInt(limit as string));
      res.json(predictions);
    } catch (error) {
      console.error("Failed to get predictions:", error);
      res.status(500).json({ error: "Failed to get predictions" });
    }
  });

  app.get("/api/predictions/active", requireAuth, async (req, res) => {
    try {
      const { platform } = req.query;
      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      const activePrediction = await pollsService.getActivePrediction(req.user!.id, platform as string | undefined);
      res.json(activePrediction);
    } catch (error) {
      console.error("Failed to get active prediction:", error);
      res.status(500).json({ error: "Failed to get active prediction" });
    }
  });

  app.get("/api/predictions/history", requireAuth, async (req, res) => {
    try {
      const { limit = "20" } = req.query;
      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      const history = await pollsService.getPredictionHistory(req.user!.id, parseInt(limit as string));
      res.json(history);
    } catch (error) {
      console.error("Failed to get prediction history:", error);
      res.status(500).json({ error: "Failed to get prediction history" });
    }
  });

  app.get("/api/predictions/:id", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      const prediction = await userStorage.getPrediction(req.params.id);
      if (!prediction) {
        return res.status(404).json({ error: "Prediction not found" });
      }
      res.json(prediction);
    } catch (error) {
      console.error("Failed to get prediction:", error);
      res.status(500).json({ error: "Failed to get prediction" });
    }
  });

  app.get("/api/predictions/:id/results", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      const results = await pollsService.getPredictionResults(req.params.id);
      res.json(results);
    } catch (error) {
      console.error("Failed to get prediction results:", error);
      res.status(500).json({ error: "Failed to get prediction results" });
    }
  });

  app.post("/api/predictions", requireAuth, async (req, res) => {
    try {
      const { title, outcomes, duration = 300, platform = "twitch" } = req.body;

      if (!title || !outcomes || !Array.isArray(outcomes)) {
        return res.status(400).json({ error: "Invalid prediction data" });
      }

      if (outcomes.length < 2 || outcomes.length > 10) {
        return res.status(400).json({ error: "Predictions must have 2-10 outcomes" });
      }

      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      
      const prediction = await pollsService.createPrediction(req.user!.id, title, outcomes, duration, platform);
      const result = await pollsService.startPrediction(prediction.id);
      
      res.json(result);
    } catch (error: any) {
      console.error("Failed to create prediction:", error);
      res.status(500).json({ error: error.message || "Failed to create prediction" });
    }
  });

  app.post("/api/predictions/:id/bet", requireAuth, async (req, res) => {
    try {
      const { outcome, points, username, platform = "twitch" } = req.body;

      if (!outcome || !points || !username) {
        return res.status(400).json({ error: "Invalid bet data" });
      }

      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      const result = await pollsService.placeBet(req.params.id, username, outcome, points, platform);
      
      res.json(result);
    } catch (error: any) {
      console.error("Failed to place bet:", error);
      res.status(500).json({ error: error.message || "Failed to place bet" });
    }
  });

  app.post("/api/predictions/:id/resolve", requireAuth, async (req, res) => {
    try {
      const { winningOutcome } = req.body;

      if (!winningOutcome) {
        return res.status(400).json({ error: "Winning outcome is required" });
      }

      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      const result = await pollsService.resolvePrediction(req.params.id, winningOutcome);
      
      res.json(result);
    } catch (error: any) {
      console.error("Failed to resolve prediction:", error);
      res.status(500).json({ error: error.message || "Failed to resolve prediction" });
    }
  });

  app.post("/api/predictions/:id/cancel", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      const pollsService = new PollsService(userStorage);
      const prediction = await pollsService.cancelPrediction(req.params.id);
      
      res.json({ prediction, message: "Prediction cancelled and all bets refunded" });
    } catch (error: any) {
      console.error("Failed to cancel prediction:", error);
      res.status(500).json({ error: error.message || "Failed to cancel prediction" });
    }
  });

  app.post("/api/auth/complete-onboarding", requireAuth, async (req, res) => {
    try {
      await storage.updateUser(req.user!.id, {
        onboardingCompleted: true,
        onboardingStep: 4,
      });
      res.json({ success: true, message: "Onboarding completed" });
    } catch (error: any) {
      console.error("Failed to complete onboarding:", error);
      res.status(500).json({ error: error.message || "Failed to complete onboarding" });
    }
  });

  app.post("/api/auth/skip-onboarding", requireAuth, async (req, res) => {
    try {
      await storage.updateUser(req.user!.id, {
        onboardingCompleted: true,
        onboardingStep: 4,
      });
      res.json({ success: true, message: "Onboarding skipped" });
    } catch (error: any) {
      console.error("Failed to skip onboarding:", error);
      res.status(500).json({ error: error.message || "Failed to skip onboarding" });
    }
  });

  app.post("/api/auth/dismiss-welcome", requireAuth, async (req, res) => {
    try {
      await storage.updateUser(req.user!.id, {
        dismissedWelcome: true,
      });
      res.json({ success: true, message: "Welcome card dismissed" });
    } catch (error: any) {
      console.error("Failed to dismiss welcome:", error);
      res.status(500).json({ error: error.message || "Failed to dismiss welcome" });
    }
  });

  // Token Lifecycle Management - Admin/Testing Endpoints
  app.post("/api/admin/tokens/refresh", requireAuth, async (req, res) => {
    try {
      console.log(`[Admin API] Manual token refresh triggered by user ${req.user!.id}`);
      await tokenRefreshService.triggerRefresh();
      res.json({ success: true, message: "Token refresh check completed" });
    } catch (error: any) {
      console.error("Failed to trigger token refresh:", error);
      res.status(500).json({ error: error.message || "Failed to trigger token refresh" });
    }
  });

  app.get("/api/admin/tokens/status", requireAuth, async (req, res) => {
    try {
      const connections = await storage.getPlatformConnections(req.user!.id);
      const now = new Date();
      const status = connections.map(conn => {
        const expiresIn = conn.tokenExpiresAt 
          ? Math.round((conn.tokenExpiresAt.getTime() - now.getTime()) / 1000 / 60) 
          : null;
        return {
          platform: conn.platform,
          isConnected: conn.isConnected,
          platformUsername: conn.platformUsername,
          tokenExpiresAt: conn.tokenExpiresAt,
          expiresInMinutes: expiresIn,
          needsRefresh: expiresIn !== null && expiresIn < (24 * 60),
        };
      });
      res.json(status);
    } catch (error: any) {
      console.error("Failed to get token status:", error);
      res.status(500).json({ error: error.message || "Failed to get token status" });
    }
  });

  return httpServer;
}
