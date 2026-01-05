// Reference: javascript_websocket blueprint
import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { botManager } from "./bot-manager";
export { botManager };
import { giveawayService } from "./giveaway-service";
import { encryptToken } from "./crypto-utils";
import {
  updateBotConfigSchema,
  insertCustomCommandSchema,
  updateCustomCommandSchema,
  updateModerationRuleSchema,
  insertGiveawaySchema,
  updateShoutoutSettingsSchema,
  streamClips,
  platformConnections,
  scheduledAnnouncements,
  type StreamClip,
  insertStreamClipSchema,
  insertScheduledAnnouncementSchema,
  updateScheduledAnnouncementSchema,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { getAvailableVariables } from "./command-variables";
import authRoutes from "./auth/routes";
import oauthSignInRoutes from "./auth/oauth-signin-routes";
import spotifyRoutes from "./spotify-routes";
import oauthSpotifyRoutes from "./oauth-spotify";
import oauthYoutubeRoutes from "./oauth-youtube";
import oauthTwitchRoutes from "./oauth-twitch";
import oauthKickRoutes from "./oauth-kick";
import overlayRoutes from "./overlay-routes";
import obsRoutes from "./obs-routes";
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
import { onboardingService } from "./onboarding-service";
import { featureToggleService } from "./feature-toggle-service";
import { circuitBreakerService } from "./circuit-breaker-service";
import { jobQueueService } from "./job-queue-service";
import { enhancedTokenService } from "./enhanced-token-service";
import { intentDetectionService } from "./intent-detection-service";
import { enhancedModerationService } from "./enhanced-moderation-service";
import { personalizedFactService } from "./personalized-fact-service";
import { speechToTextService } from "./speech-to-text-service";
import adminRoutes from "./admin-routes";
import presenceRoutes from "./presence-routes";
import { announcementScheduler, ANNOUNCEMENT_TEMPLATES } from "./announcement-scheduler";
import { eventsService } from "./events-service";
import { notificationsService } from "./notifications-service";
import { streamInfoService } from "./stream-info-service";

function broadcastStreamAlert(userId: string, data: any): void {
  botManager.broadcastStreamAlert(userId, data);
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.use("/api/auth", oauthSignInRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api", presenceRoutes);
  app.use("/auth", authRoutes);
  app.use("/auth", oauthSpotifyRoutes);
  app.use("/auth", oauthYoutubeRoutes);
  app.use("/auth", oauthTwitchRoutes);
  app.use("/auth", oauthKickRoutes);
  // Note: Direct OAuth routes (platform connection) are ONLY at /auth/*
  // Signin routes (passport) are at /api/auth/* - they must NOT overlap
  // This prevents PKCE conflicts between the two OAuth flows
  app.use("/api/spotify", spotifyRoutes);
  app.use("/api/overlay", overlayRoutes);
  app.use("/api/obs", obsRoutes);
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
        // Debug: Log session state for troubleshooting
        const hasCookies = !!request.headers.cookie;
        const hasSession = !!request.session;
        const hasPassport = !!request.session?.passport;
        console.log(`[WebSocket] Rejecting unauthenticated connection (cookies: ${hasCookies}, session: ${hasSession}, passport: ${hasPassport})`);
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

  // Health Check - Comprehensive endpoint for container health monitoring
  app.get("/health", async (req, res) => {
    try {
      const checks: Record<string, string> = {};
      let overallStatus = "healthy";

      // Check database connectivity
      try {
        const { pool } = await import('./db');
        await pool.query('SELECT 1');
        checks.database = "healthy";
      } catch (error) {
        checks.database = "unhealthy";
        overallStatus = "degraded";
      }

      // Check OAuth storage - skip this check since getOAuthState doesn't exist
      checks.oauth_storage = "healthy";

      // Check token refresh service
      const { tokenRefreshService } = await import('./token-refresh-service');
      checks.token_refresh_service = tokenRefreshService.isRunning() ? "running" : "stopped";

      // Check bot manager
      const managerStats = botManager.getStats();
      checks.bot_manager = managerStats.totalWorkers >= 0 ? "running" : "stopped";

      res.status(overallStatus === "healthy" ? 200 : 503).json({ 
        status: overallStatus,
        service: 'stream-bot',
        version: '1.0.0',
        uptime: Math.floor(process.uptime()),
        checks,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(503).json({
        status: "unhealthy",
        service: 'stream-bot',
        version: '1.0.0',
        uptime: Math.floor(process.uptime()),
        checks: {
          error: error.message
        },
        timestamp: new Date().toISOString(),
      });
    }
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

  // Feature Flags - Expose enabled features to frontend
  // Note: This endpoint is public to allow frontend to adapt UI based on available features
  app.get("/api/features", async (req, res) => {
    try {
      const { getFeatureFlags } = await import('./env');
      const features = getFeatureFlags();
      res.json(features);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to get feature flags",
        message: error.message 
      });
    }
  });

  // Facts API - Store and retrieve AI-generated facts
  // POST /api/facts - Store a new fact
  app.post("/api/facts", async (req, res) => {
    try {
      const { db } = await import('./db');
      const { facts } = await import('@shared/schema');
      const { insertFactSchema } = await import('@shared/schema');
      
      // Validate request body
      const validationResult = insertFactSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid fact data",
          details: validationResult.error.errors 
        });
      }
      
      const factData = validationResult.data;
      
      // Insert fact into database
      const [newFact] = await db.insert(facts).values(factData).returning();
      
      res.status(201).json({ 
        success: true,
        fact: newFact 
      });
    } catch (error: any) {
      console.error('[Facts API] Error storing fact:', error);
      res.status(500).json({ 
        error: "Failed to store fact",
        message: error.message 
      });
    }
  });

  // GET /api/facts/latest - Get most recent facts (supports limit query param)
  app.get("/api/facts/latest", async (req, res) => {
    try {
      const { db } = await import('./db');
      const { facts } = await import('@shared/schema');
      const { desc } = await import('drizzle-orm');
      
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      
      const latestFacts = await db
        .select()
        .from(facts)
        .orderBy(desc(facts.createdAt))
        .limit(limit);
      
      // Return wrapped response matching dashboard expectations
      res.json({
        success: true,
        count: latestFacts.length,
        facts: latestFacts.map(f => ({
          id: f.id,
          content: f.fact,
          source: f.source,
          created_at: f.createdAt,
          tags: f.tags || []
        }))
      });
    } catch (error: any) {
      console.error('[Facts API] Error fetching latest facts:', error);
      res.status(500).json({ 
        success: false,
        error: "Failed to fetch latest facts",
        message: error.message 
      });
    }
  });

  // GET /api/facts/random - Get a random fact
  app.get("/api/facts/random", async (req, res) => {
    try {
      const { db } = await import('./db');
      const { facts } = await import('@shared/schema');
      const { sql } = await import('drizzle-orm');
      
      // Use PostgreSQL's RANDOM() function to get a random fact
      const [randomFact] = await db
        .select()
        .from(facts)
        .orderBy(sql`RANDOM()`)
        .limit(1);
      
      if (!randomFact) {
        return res.json({
          success: true,
          fact: null,
          message: "No facts available yet"
        });
      }
      
      // Return wrapped response matching dashboard expectations
      res.json({
        success: true,
        fact: {
          id: randomFact.id,
          content: randomFact.fact,
          source: randomFact.source,
          created_at: randomFact.createdAt,
          tags: randomFact.tags || []
        }
      });
    } catch (error: any) {
      console.error('[Facts API] Error fetching random fact:', error);
      res.status(500).json({ 
        success: false,
        error: "Failed to fetch random fact",
        message: error.message 
      });
    }
  });

  // GET /api/facts/public - Public community fact feed (no auth required)
  // Returns only AI-generated facts (source: 'stream-bot' or 'openai') with pagination
  // Manual/admin-created facts are excluded for security
  app.get("/api/facts/public", async (req, res) => {
    try {
      const { db } = await import('./db');
      const { facts } = await import('@shared/schema');
      const { desc, asc, ilike, sql, inArray, and } = await import('drizzle-orm');
      
      // Parse query parameters with defaults
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
      const sort = (req.query.sort as string) === 'oldest' ? 'oldest' : 'newest';
      const search = (req.query.search as string) || '';
      const tag = (req.query.tag as string) || '';
      
      // Only allow public AI-generated facts (exclude manual/admin entries for security)
      const allowedSources = ['stream-bot', 'openai'];
      
      // Build conditions array - always start with source filter for security
      const conditions: any[] = [inArray(facts.source, allowedSources)];
      
      // Apply search filter if provided
      if (search) {
        conditions.push(ilike(facts.fact, `%${search}%`));
      }
      
      // Apply tag filter if provided (check if tag is in jsonb array)
      if (tag) {
        conditions.push(sql`${facts.tags} @> ${JSON.stringify([tag])}::jsonb`);
      }
      
      // Build the where clause using and()
      const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
      
      // Execute query with all filters, sorting, and pagination
      const publicFacts = await db.select({
        id: facts.id,
        fact: facts.fact,
        source: facts.source,
        tags: facts.tags,
        createdAt: facts.createdAt,
      })
        .from(facts)
        .where(whereClause)
        .orderBy(sort === 'oldest' ? asc(facts.createdAt) : desc(facts.createdAt))
        .limit(limit)
        .offset(offset);
      
      // Get total count for pagination with same filters
      const [{ count: totalCount }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(facts)
        .where(whereClause);
      
      // Get unique tags for filtering UI (only from allowed sources)
      const allTags = await db.select({ tags: facts.tags })
        .from(facts)
        .where(inArray(facts.source, allowedSources));
      const uniqueTags = [...new Set(allTags.flatMap(f => (f.tags as string[]) || []))].sort();
      
      res.json({
        success: true,
        facts: publicFacts.map(f => ({
          id: f.id,
          content: f.fact,
          source: f.source,
          tags: f.tags || [],
          createdAt: f.createdAt,
        })),
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount,
        },
        availableTags: uniqueTags,
      });
    } catch (error: any) {
      console.error('[Facts API] Error fetching public facts:', error);
      res.status(500).json({ 
        success: false,
        error: "Failed to fetch public facts",
        message: error.message 
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
        needsRefresh: p.needsRefresh ?? false,
        lastConnectedAt: p.lastConnectedAt,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }));
      
      res.json(sanitized);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch platforms" });
    }
  });

  // Token Health Check - Check if tokens need re-authentication
  app.get("/api/platforms/token-health", requireAuth, async (req, res) => {
    try {
      const platforms = await storage.getPlatformConnections(req.user!.id);
      
      const tokenHealth = platforms.map(p => {
        const hasRefreshToken = !!p.refreshToken;
        const tokenExpired = p.tokenExpiresAt ? new Date(p.tokenExpiresAt) < new Date() : false;
        const tokenExpiringSoon = p.tokenExpiresAt 
          ? new Date(p.tokenExpiresAt) < new Date(Date.now() + 24 * 60 * 60 * 1000) 
          : false;
        
        let status: 'healthy' | 'needs_reauth' | 'expiring_soon' | 'expired' = 'healthy';
        let message = 'Token is valid';
        
        if (!hasRefreshToken) {
          status = 'needs_reauth';
          message = 'No refresh token - please disconnect and reconnect to fix';
        } else if (tokenExpired) {
          status = 'expired';
          message = 'Token has expired - will auto-refresh on next use';
        } else if (tokenExpiringSoon) {
          status = 'expiring_soon';
          message = 'Token expires within 24 hours - will auto-refresh';
        }
        
        return {
          platform: p.platform,
          platformUsername: p.platformUsername,
          isConnected: p.isConnected,
          hasRefreshToken,
          tokenExpired,
          tokenExpiringSoon,
          tokenExpiresAt: p.tokenExpiresAt,
          status,
          message,
          needsReauth: !hasRefreshToken || p.needsRefresh,
          needsRefresh: p.needsRefresh ?? false,
        };
      });
      
      res.json({
        success: true,
        platforms: tokenHealth,
        anyNeedsReauth: tokenHealth.some(t => t.needsReauth || t.needsRefresh),
      });
    } catch (error: any) {
      console.error('[Token Health] Error:', error.message);
      res.status(500).json({ error: "Failed to check token health" });
    }
  });

  // Token Health Check - Simple endpoint for all platform connection status
  app.get("/api/token-health", requireAuth, async (req, res) => {
    try {
      const platforms = await storage.getPlatformConnections(req.user!.id);
      
      const connections = platforms.map(p => ({
        platform: p.platform,
        platformUsername: p.platformUsername,
        isConnected: p.isConnected,
        needsRefresh: p.needsRefresh ?? false,
        lastConnectedAt: p.lastConnectedAt,
        tokenExpiresAt: p.tokenExpiresAt,
      }));
      
      res.json({
        success: true,
        connections,
        summary: {
          total: connections.length,
          connected: connections.filter(c => c.isConnected).length,
          needsRefresh: connections.filter(c => c.needsRefresh).length,
        },
      });
    } catch (error: any) {
      console.error('[Token Health API] Error:', error.message);
      res.status(500).json({ error: "Failed to fetch token health" });
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
      const data = { ...req.body };
      
      // SECURITY: Encrypt Kick bearer token and cookies before storage
      if (data.platform === 'kick' && data.connectionData) {
        const connectionData = { ...data.connectionData };
        if (connectionData.bearerToken) {
          connectionData.bearerToken = encryptToken(connectionData.bearerToken);
        }
        if (connectionData.cookies) {
          connectionData.cookies = encryptToken(connectionData.cookies);
        }
        data.connectionData = connectionData;
      }
      
      // SECURITY: Encrypt accessToken if provided directly (Kick manual entry)
      if (data.platform === 'kick' && data.accessToken) {
        data.accessToken = encryptToken(data.accessToken);
      }
      
      const platform = await storage.createPlatformConnection(req.user!.id, data);
      
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
      console.error("Failed to create platform connection");
      res.status(500).json({ error: "Failed to create platform connection" });
    }
  });

  app.patch("/api/platforms/:id", requireAuth, async (req, res) => {
    try {
      const data = { ...req.body };
      
      // Get existing connection to determine platform type
      const existingConnection = await storage.getPlatformConnection(req.user!.id, req.params.id);
      const platformType = existingConnection?.platform || data.platform;
      
      // SECURITY: Encrypt Kick bearer token and cookies before storage
      if (platformType === 'kick' && data.connectionData) {
        const connectionData = { ...data.connectionData };
        if (connectionData.bearerToken) {
          connectionData.bearerToken = encryptToken(connectionData.bearerToken);
        }
        if (connectionData.cookies) {
          connectionData.cookies = encryptToken(connectionData.cookies);
        }
        data.connectionData = connectionData;
      }
      
      // SECURITY: Encrypt accessToken if provided directly (Kick manual entry)
      if (platformType === 'kick' && data.accessToken) {
        data.accessToken = encryptToken(data.accessToken);
      }
      
      const platform = await storage.updatePlatformConnection(
        req.user!.id,
        req.params.id,
        data
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
          aiModel: "gpt-4o",
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
      console.log('[Settings PATCH] Request body:', JSON.stringify(req.body));
      const validated = updateBotConfigSchema.parse(req.body);
      console.log('[Settings PATCH] Validated:', JSON.stringify(validated));
      const settings = await storage.updateBotSettings(req.user!.id, validated);
      console.log('[Settings PATCH] Updated settings for user:', req.user!.id);
      
      // Start/stop/restart user's bot based on settings
      if (settings.isActive) {
        await botManager.restartUserBot(req.user!.id);
      } else {
        await botManager.stopUserBot(req.user!.id);
      }
      
      res.json(settings);
    } catch (error: any) {
      console.error('[Settings PATCH] Error:', error.message, error.stack);
      if (error.name === "ZodError") {
        console.error('[Settings PATCH] Validation error:', JSON.stringify(error.errors));
        return res.status(400).json({ error: "Invalid settings data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update settings", message: error.message });
    }
  });

  // Stream Info - Unified stream info editor
  app.get("/api/stream-info", requireAuth, async (req, res) => {
    try {
      const streamInfo = await streamInfoService.getAllStreamInfo(req.user!.id);
      res.json(streamInfo);
    } catch (error: any) {
      console.error('[StreamInfo] GET error:', error.message);
      res.status(500).json({ error: "Failed to fetch stream info" });
    }
  });

  app.put("/api/stream-info", requireAuth, async (req, res) => {
    try {
      const { title, gameId, game, tags, description, platforms } = req.body;
      
      if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
        return res.status(400).json({ error: "At least one platform must be selected" });
      }

      const results = await streamInfoService.updateStreamInfo(
        req.user!.id,
        { title, gameId, game, tags, description },
        platforms
      );

      res.json({ results });
    } catch (error: any) {
      console.error('[StreamInfo] PUT error:', error.message);
      res.status(500).json({ error: "Failed to update stream info" });
    }
  });

  app.get("/api/stream-info/games", requireAuth, async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.length < 2) {
        return res.json([]);
      }

      const games = await streamInfoService.searchTwitchGames(req.user!.id, query);
      res.json(games);
    } catch (error: any) {
      console.error('[StreamInfo] Games search error:', error.message);
      res.status(500).json({ error: "Failed to search games" });
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

  app.get("/api/analytics/platforms", requireAuth, async (req, res) => {
    try {
      const metrics = await analyticsService.getPlatformMetrics(req.user!.id);
      res.json(metrics);
    } catch (error: any) {
      console.error('[Analytics] Platforms endpoint error:', error);
      res.status(500).json({ error: "Failed to fetch platform metrics" });
    }
  });

  app.get("/api/analytics/stream-history", requireAuth, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const history = await analyticsService.getStreamHistory(req.user!.id, days);
      res.json(history);
    } catch (error: any) {
      console.error('[Analytics] Stream history endpoint error:', error);
      res.status(500).json({ error: "Failed to fetch stream history" });
    }
  });

  app.get("/api/analytics/revenue", requireAuth, async (req, res) => {
    try {
      const revenue = await analyticsService.getRevenueEstimate(req.user!.id);
      res.json(revenue);
    } catch (error: any) {
      console.error('[Analytics] Revenue endpoint error:', error);
      res.status(500).json({ error: "Failed to fetch revenue estimates" });
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

  // Command Aliases
  app.get("/api/commands/:id/aliases", requireAuth, async (req, res) => {
    try {
      const command = await storage.getCustomCommand(req.user!.id, req.params.id);
      if (!command) {
        return res.status(404).json({ error: "Command not found" });
      }
      const aliases = await storage.getCommandAliases(req.params.id);
      res.json(aliases);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch command aliases" });
    }
  });

  app.post("/api/commands/:id/aliases", requireAuth, async (req, res) => {
    try {
      const { alias } = req.body;
      if (!alias || typeof alias !== 'string') {
        return res.status(400).json({ error: "Alias is required" });
      }
      
      const command = await storage.getCustomCommand(req.user!.id, req.params.id);
      if (!command) {
        return res.status(404).json({ error: "Command not found" });
      }
      
      const existing = await storage.getCustomCommandByName(req.user!.id, alias);
      if (existing) {
        return res.status(400).json({ error: "An alias or command with this name already exists" });
      }
      
      const existingAlias = await storage.getCommandByAlias(req.user!.id, alias);
      if (existingAlias) {
        return res.status(400).json({ error: "This alias already exists for another command" });
      }
      
      const newAlias = await storage.createCommandAlias(req.params.id, alias);
      res.status(201).json(newAlias);
    } catch (error) {
      res.status(500).json({ error: "Failed to create command alias" });
    }
  });

  app.delete("/api/commands/:commandId/aliases/:aliasId", requireAuth, async (req, res) => {
    try {
      const command = await storage.getCustomCommand(req.user!.id, req.params.commandId);
      if (!command) {
        return res.status(404).json({ error: "Command not found" });
      }
      
      await storage.deleteCommandAlias(req.params.aliasId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete command alias" });
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
        const userBot = botManager.getWorker(req.user!.id);
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

      console.log(`[trigger] Manual trigger for user ${req.user!.id} to platforms:`, platforms);
      
      const fact = await botManager.postManualFact(req.user!.id, platforms);
      
      if (!fact) {
        console.error(`[trigger] No fact returned for user ${req.user!.id}`);
        return res.status(500).json({ error: "Failed to generate fact" });
      }

      console.log(`[trigger] Successfully posted fact for user ${req.user!.id}:`, fact.substring(0, 50));
      res.json({ success: true, fact });
    } catch (error: any) {
      console.error(`[trigger] Error posting fact:`, error?.message || error);
      res.status(500).json({ 
        error: "Failed to trigger fact posting",
        details: error?.message || String(error)
      });
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

  app.post("/api/moderation/rules", requireAuth, async (req, res) => {
    try {
      const { ruleType, isEnabled, severity, action, timeoutDuration } = req.body;
      
      if (!ruleType || !severity || !action) {
        return res.status(400).json({ error: "ruleType, severity, and action are required" });
      }

      const existing = await storage.getModerationRuleByType(req.user!.id, ruleType);
      if (existing) {
        return res.status(400).json({ error: "A rule with this type already exists" });
      }

      const rule = await storage.createModerationRule(req.user!.id, {
        userId: req.user!.id,
        ruleType,
        isEnabled: isEnabled !== undefined ? isEnabled : true,
        severity,
        action,
        timeoutDuration: timeoutDuration || (action === "timeout" ? 600 : undefined),
      });
      
      res.json(rule);
    } catch (error: any) {
      console.error("Failed to create moderation rule:", error);
      res.status(500).json({ error: "Failed to create moderation rule" });
    }
  });

  app.delete("/api/moderation/rules/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteModerationRule(req.user!.id, req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete moderation rule" });
    }
  });

  app.post("/api/moderation/test", requireAuth, async (req, res) => {
    try {
      const { message, username } = req.body;
      
      if (!message || !username) {
        return res.status(400).json({ error: "message and username are required" });
      }

      const [rules, whitelist, config] = await Promise.all([
        storage.getModerationRules(req.user!.id),
        storage.getLinkWhitelist(req.user!.id),
        storage.getBotSettings(req.user!.id),
      ]);

      const { moderationService } = await import('./moderation-service');
      const bannedWords = config?.bannedWords || [];
      const decision = await moderationService.checkMessage(message, username, rules, whitelist, bannedWords);

      res.json({
        allowed: decision.allow,
        action: decision.action,
        ruleTriggered: decision.ruleTriggered,
        severity: decision.severity,
        reason: decision.reason,
        timeoutDuration: decision.timeoutDuration,
      });
    } catch (error: any) {
      console.error("Failed to test message:", error);
      res.status(500).json({ error: "Failed to test message", details: error.message });
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
      
      const history = gameType 
        ? await userStorage.getGameHistoryByType(gameType, limit)
        : await userStorage.getGameHistory(limit);
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
      let settings = await currencyService.getCurrencySettings(req.user!.id);
      
      if (!settings) {
        settings = await currencyService.createCurrencySettings(req.user!.id, {
          currencyName: "Points",
          currencySymbol: "⭐",
          earnPerMessage: 1,
          earnPerMinute: 10,
          startingBalance: 100,
          maxBalance: 100000,
          enableGambling: true,
        });
      }
      
      res.json(settings);
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
      const { limit = "50", username, platform = "twitch" } = req.query;
      if (!username) {
        return res.status(400).json({ error: "Missing required query parameter: username" });
      }
      const transactions = await currencyService.getTransactions(
        req.user!.id,
        username as string,
        platform as string,
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
        botUserId: req.user!.id,
        rewardName,
        rewardType: "custom_command" as const,
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
      await currencyService.updateReward(req.user!.id, id, req.body);
      const rewards = await currencyService.getRewards(req.user!.id);
      const updated = rewards.find(r => r.id === id);
      res.json(updated);
    } catch (error) {
      console.error("Failed to update reward:", error);
      res.status(500).json({ error: "Failed to update reward" });
    }
  });

  app.delete("/api/rewards/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await currencyService.deleteReward(req.user!.id, id);
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
      
      const result = await currencyService.redeemReward(req.user!.id, username, platform, id);
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
        ? await currencyService.getPendingRedemptions(req.user!.id)
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
      await currencyService.fulfillRedemption(req.user!.id, id);
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
      res.json({ ...result, poll });
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
      
      const result = await pollsService.vote(id, username, option, platform || "twitch");
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
      
      const result = await pollsService.endPoll(id);
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
      
      const results = await pollsService.getPollResults(id);
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
      
      const polls = await pollsService.getPollHistory(req.user!.id, parseInt(limit as string));
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
      res.json({ ...result, prediction });
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
      
      const result = await pollsService.placeBet(id, username, outcome, amount, platform || "twitch");
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
      
      const result = await pollsService.resolvePrediction(id, winningOutcome);
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
      
      const results = await pollsService.getPredictionResults(id);
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
      
      const predictions = await pollsService.getPredictionHistory(req.user!.id, parseInt(limit as string));
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

  // Notifications (Unified Inbox)
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const { platform, type, isRead, limit } = req.query;
      const filters = {
        platform: platform as string | undefined,
        type: type as string | undefined,
        isRead: isRead !== undefined ? isRead === "true" : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      };
      
      // Initialize sample notifications for new users
      const existingNotifications = await notificationsService.getNotifications(req.user!.id);
      if (existingNotifications.length === 0) {
        await notificationsService.addSampleNotifications(req.user!.id);
      }
      
      const notifications = await notificationsService.getNotifications(req.user!.id, filters);
      res.json(notifications);
    } catch (error) {
      console.error("Failed to get notifications:", error);
      res.status(500).json({ error: "Failed to get notifications" });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      const count = await notificationsService.getUnreadCount(req.user!.id);
      res.json({ count });
    } catch (error) {
      console.error("Failed to get unread count:", error);
      res.status(500).json({ error: "Failed to get unread count" });
    }
  });

  app.put("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const success = await notificationsService.markAsRead(req.user!.id, id);
      if (!success) {
        return res.status(404).json({ error: "Notification not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  app.put("/api/notifications/read-all", requireAuth, async (req, res) => {
    try {
      const count = await notificationsService.markAllAsRead(req.user!.id);
      res.json({ success: true, count });
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
      res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
  });

  app.delete("/api/notifications/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const success = await notificationsService.deleteNotification(req.user!.id, id);
      if (!success) {
        return res.status(404).json({ error: "Notification not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete notification:", error);
      res.status(500).json({ error: "Failed to delete notification" });
    }
  });

  app.post("/api/notifications/webhook", async (req, res) => {
    try {
      const { userId, notification } = req.body;
      if (!userId || !notification) {
        return res.status(400).json({ error: "Missing userId or notification data" });
      }
      const newNotification = await notificationsService.addNotification(userId, notification);
      res.json({ success: true, notification: newNotification });
    } catch (error) {
      console.error("Failed to process webhook notification:", error);
      res.status(500).json({ error: "Failed to process webhook notification" });
    }
  });

  // Stream Alerts (OBS overlay-style alerts)
  app.get("/api/stream-alerts", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      const alerts = await userStorage.getStreamAlerts();
      res.json(alerts);
    } catch (error) {
      console.error("Failed to get stream alerts:", error);
      res.status(500).json({ error: "Failed to get stream alerts" });
    }
  });

  app.get("/api/stream-alerts/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const userStorage = storage.getUserStorage(req.user!.id);
      const alert = await userStorage.getStreamAlert(id);
      
      if (!alert) {
        return res.status(404).json({ error: "Stream alert not found" });
      }
      
      res.json(alert);
    } catch (error) {
      console.error("Failed to get stream alert:", error);
      res.status(500).json({ error: "Failed to get stream alert" });
    }
  });

  app.post("/api/stream-alerts", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      
      const existingAlert = await userStorage.getStreamAlertByType(req.body.alertType);
      if (existingAlert) {
        return res.status(400).json({ error: "Alert type already exists. Use PUT to update." });
      }
      
      const alert = await userStorage.createStreamAlert({
        ...req.body,
        userId: req.user!.id,
      });
      res.status(201).json(alert);
    } catch (error) {
      console.error("Failed to create stream alert:", error);
      res.status(500).json({ error: "Failed to create stream alert" });
    }
  });

  app.put("/api/stream-alerts/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const userStorage = storage.getUserStorage(req.user!.id);
      
      const existingAlert = await userStorage.getStreamAlert(id);
      if (!existingAlert) {
        return res.status(404).json({ error: "Stream alert not found" });
      }
      
      const alert = await userStorage.updateStreamAlert(id, req.body);
      res.json(alert);
    } catch (error) {
      console.error("Failed to update stream alert:", error);
      res.status(500).json({ error: "Failed to update stream alert" });
    }
  });

  app.delete("/api/stream-alerts/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const userStorage = storage.getUserStorage(req.user!.id);
      
      const existingAlert = await userStorage.getStreamAlert(id);
      if (!existingAlert) {
        return res.status(404).json({ error: "Stream alert not found" });
      }
      
      await userStorage.deleteStreamAlert(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete stream alert:", error);
      res.status(500).json({ error: "Failed to delete stream alert" });
    }
  });

  app.get("/api/stream-alerts-history", requireAuth, async (req, res) => {
    try {
      const { type, limit = "50" } = req.query;
      const userStorage = storage.getUserStorage(req.user!.id);
      const history = await userStorage.getStreamAlertHistory(
        type as string | undefined,
        parseInt(limit as string)
      );
      res.json(history);
    } catch (error) {
      console.error("Failed to get stream alert history:", error);
      res.status(500).json({ error: "Failed to get stream alert history" });
    }
  });

  app.post("/api/stream-alerts/test", requireAuth, async (req, res) => {
    try {
      const { alertType, platform = "twitch" } = req.body;
      
      if (!alertType || !["follow", "sub", "donation", "raid", "bits", "host"].includes(alertType)) {
        return res.status(400).json({ error: "Invalid alert type" });
      }
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const alert = await userStorage.getStreamAlertByType(alertType);
      
      if (!alert) {
        return res.status(404).json({ error: "Alert configuration not found" });
      }
      
      const testData = {
        alertId: alert.id,
        userId: req.user!.id,
        platform,
        triggeredBy: "TestUser",
        alertType,
        amount: alertType === "donation" || alertType === "bits" ? 100 : alertType === "raid" ? 50 : undefined,
        message: "This is a test alert message!",
        tier: alertType === "sub" ? "Tier 1" : undefined,
        months: alertType === "sub" ? 1 : undefined,
      };
      
      broadcastStreamAlert(req.user!.id, {
        type: "stream_alert",
        alert: alert,
        data: testData,
      });
      
      res.json({ success: true, message: "Test alert sent" });
    } catch (error) {
      console.error("Failed to test stream alert:", error);
      res.status(500).json({ error: "Failed to test stream alert" });
    }
  });

  app.post("/api/stream-alerts/initialize-defaults", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      const existingAlerts = await userStorage.getStreamAlerts();
      
      const defaultAlerts = [
        { alertType: "follow", textTemplate: "🎉 {user} just followed!", duration: 5, animation: "bounce" as const },
        { alertType: "sub", textTemplate: "💜 {user} subscribed! {tier} for {months} months!", duration: 7, animation: "zoom" as const },
        { alertType: "donation", textTemplate: "💰 {user} donated ${amount}! {message}", duration: 8, animation: "slide" as const },
        { alertType: "raid", textTemplate: "🚀 {user} is raiding with {amount} viewers!", duration: 10, animation: "shake" as const },
        { alertType: "bits", textTemplate: "✨ {user} cheered {amount} bits! {message}", duration: 6, animation: "bounce" as const },
        { alertType: "host", textTemplate: "📺 {user} is hosting with {amount} viewers!", duration: 5, animation: "fade" as const },
      ];
      
      const createdAlerts = [];
      for (const defaults of defaultAlerts) {
        const existing = existingAlerts.find(a => a.alertType === defaults.alertType);
        if (!existing) {
          const alert = await userStorage.createStreamAlert({
            ...defaults,
            userId: req.user!.id,
            enabled: true,
            fontSize: 32,
            fontColor: "#ffffff",
            backgroundColor: "transparent",
            ttsEnabled: false,
            ttsVoice: "en-US",
            minAmount: 0,
            volume: 50,
          });
          createdAlerts.push(alert);
        }
      }
      
      res.json({ 
        success: true, 
        created: createdAlerts.length,
        message: `Initialized ${createdAlerts.length} default alerts`
      });
    } catch (error) {
      console.error("Failed to initialize default stream alerts:", error);
      res.status(500).json({ error: "Failed to initialize default stream alerts" });
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
    const defaultPresets = [
      { name: "friendly", systemPrompt: "You are a friendly and helpful stream assistant. Be warm, engaging and supportive.", temperature: 0.7, traits: ["helpful", "warm", "encouraging"] },
      { name: "sarcastic", systemPrompt: "You are a sarcastic but funny bot. You make witty jokes and playful jabs but never cross the line to be mean.", temperature: 0.8, traits: ["witty", "sarcastic", "playful"] },
      { name: "professional", systemPrompt: "You are a professional assistant. Be clear, concise and informative.", temperature: 0.3, traits: ["professional", "informative", "clear"] },
      { name: "hyped", systemPrompt: "You are an extremely hyped bot! Everything is AMAZING and EXCITING! Use lots of caps and emojis!", temperature: 0.9, traits: ["excited", "energetic", "enthusiastic"] },
      { name: "mysterious", systemPrompt: "You are a mysterious bot that speaks in riddles and cryptic messages. Add intrigue to conversations.", temperature: 0.7, traits: ["mysterious", "cryptic", "intriguing"] },
    ];
    
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      let presets = await userStorage.getPresetPersonalities();
      
      if (!presets || presets.length === 0) {
        return res.json(defaultPresets);
      }
      
      res.json(presets);
    } catch (error) {
      console.error("Failed to get preset personalities:", error);
      res.json(defaultPresets);
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
      const { 
        name, 
        systemPrompt, 
        temperature, 
        traits,
        tone,
        responseStyle,
        triggerWords,
        replyChance,
        cooldown,
        isActive
      } = req.body;
      
      if (!name || !systemPrompt) {
        return res.status(400).json({ error: "Missing required fields: name, systemPrompt" });
      }
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const personality = await userStorage.createChatbotPersonality({
        name,
        systemPrompt,
        temperature: temperature ?? 10,
        traits: traits || [],
        tone: tone || "friendly",
        responseStyle: responseStyle || "medium",
        triggerWords: triggerWords || [],
        replyChance: replyChance ?? 100,
        cooldown: cooldown ?? 30,
        isActive: isActive ?? true
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
        context = await userStorage.getChatbotContext(username as string, "twitch");
      } else {
        context = await userStorage.getAllChatbotContexts(parseInt(limit as string));
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

  app.post("/api/chatbot/test", requireAuth, async (req, res) => {
    try {
      const { message, personalityId, personality } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Missing required field: message" });
      }
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const chatbotService = new ChatbotService(userStorage);
      
      let result;
      if (personality && typeof personality === 'object') {
        result = await chatbotService.testPersonality(message, personality);
      } else {
        result = await chatbotService.testChat(message, personalityId);
      }
      
      res.json(result);
    } catch (error) {
      console.error("Failed to test chatbot response:", error);
      res.status(500).json({ error: "Failed to test chatbot response" });
    }
  });

  app.get("/api/chatbot/stats", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      const chatbotService = new ChatbotService(userStorage);
      
      const stats = await chatbotService.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Failed to get chatbot stats:", error);
      res.status(500).json({ error: "Failed to get chatbot stats" });
    }
  });

  app.post("/api/chatbot/check-trigger", requireAuth, async (req, res) => {
    try {
      const { message, username = "test_user", platform = "twitch" } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Missing required field: message" });
      }
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const chatbotService = new ChatbotService(userStorage);
      
      const result = await chatbotService.shouldReply(username, message, platform);
      res.json(result);
    } catch (error) {
      console.error("Failed to check chatbot trigger:", error);
      res.status(500).json({ error: "Failed to check chatbot trigger" });
    }
  });

  app.get("/api/chatbot/memory/:personalityId", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      const memories = await userStorage.getChatbotMemoriesByPersonality(req.params.personalityId);
      res.json(memories);
    } catch (error) {
      console.error("Failed to get chatbot memories:", error);
      res.status(500).json({ error: "Failed to get chatbot memories" });
    }
  });

  app.post("/api/chatbot/memory/:personalityId", requireAuth, async (req, res) => {
    try {
      const { contextKey, contextValue, expiresInMinutes } = req.body;
      
      if (!contextKey || !contextValue) {
        return res.status(400).json({ error: "Missing required fields: contextKey, contextValue" });
      }
      
      const userStorage = storage.getUserStorage(req.user!.id);
      const expiresAt = expiresInMinutes 
        ? new Date(Date.now() + expiresInMinutes * 60 * 1000)
        : undefined;
      
      const memory = await userStorage.upsertChatbotMemory(
        req.params.personalityId, 
        contextKey, 
        contextValue, 
        expiresAt
      );
      res.json(memory);
    } catch (error) {
      console.error("Failed to save chatbot memory:", error);
      res.status(500).json({ error: "Failed to save chatbot memory" });
    }
  });

  app.delete("/api/chatbot/memory/:personalityId/:contextKey", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      await userStorage.deleteChatbotMemory(req.params.personalityId, req.params.contextKey);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete chatbot memory:", error);
      res.status(500).json({ error: "Failed to delete chatbot memory" });
    }
  });

  // Personality System - Enhanced chatbot personality with trait sliders
  const PERSONALITY_PRESETS = [
    {
      id: "friendly",
      name: "Friendly",
      description: "Warm, welcoming, and supportive. Uses emojis and positive language.",
      traits: { humor: 60, formality: 30, energy: 70 },
      systemPrompt: "You are a friendly and warm chat assistant. Be helpful, kind, and supportive. Use emojis occasionally to show warmth. Keep responses brief and conversational.",
      tone: "friendly",
      responseStyle: "medium"
    },
    {
      id: "sassy",
      name: "Sassy",
      description: "Witty, playful, with light sarcasm. Think comedic sidekick.",
      traits: { humor: 90, formality: 20, energy: 80 },
      systemPrompt: "You are a sassy, witty chat assistant with a playful attitude. Use clever comebacks, light sarcasm, and humor. Keep it fun without being mean. Responses should be brief and punchy.",
      tone: "sarcastic",
      responseStyle: "short"
    },
    {
      id: "professional",
      name: "Professional",
      description: "Polite, formal, and informative. Clear and precise communication.",
      traits: { humor: 20, formality: 90, energy: 40 },
      systemPrompt: "You are a professional, knowledgeable assistant. Provide clear, concise, and helpful information. Maintain a polite and respectful tone. Focus on being informative and accurate.",
      tone: "professional",
      responseStyle: "medium"
    },
    {
      id: "gamer",
      name: "Gamer",
      description: "High energy, uses gaming lingo, enthusiastic about games.",
      traits: { humor: 70, formality: 10, energy: 95 },
      systemPrompt: "You are an enthusiastic gamer chat assistant! Use gaming slang like 'GG', 'poggers', 'let's gooo'. Get hyped about wins and be encouraging after losses. Keep the energy HIGH and use lots of exclamation points!",
      tone: "funny",
      responseStyle: "short"
    },
    {
      id: "chill",
      name: "Chill",
      description: "Laid-back, relaxed, casual vibes. Just vibing with chat.",
      traits: { humor: 50, formality: 20, energy: 30 },
      systemPrompt: "You are a chill, laid-back chat assistant. Keep things relaxed and casual. Use a calm, easygoing tone with occasional slang like 'yeah', 'cool', 'nice'. Don't stress about anything. Just vibing.",
      tone: "friendly",
      responseStyle: "short"
    }
  ];

  app.get("/api/personality/presets", requireAuth, async (req, res) => {
    try {
      res.json(PERSONALITY_PRESETS);
    } catch (error) {
      console.error("Failed to get personality presets:", error);
      res.status(500).json({ error: "Failed to get personality presets" });
    }
  });

  app.get("/api/personality", requireAuth, async (req, res) => {
    try {
      const userStorage = storage.getUserStorage(req.user!.id);
      const personalities = await userStorage.getChatbotPersonalities();
      const settings = await userStorage.getChatbotSettings();
      res.json({ 
        personalities,
        settings,
        presets: PERSONALITY_PRESETS
      });
    } catch (error) {
      console.error("Failed to get personality config:", error);
      res.status(500).json({ error: "Failed to get personality config" });
    }
  });

  app.post("/api/personality", requireAuth, async (req, res) => {
    try {
      const { 
        name, 
        systemPrompt, 
        traits,
        triggerWords,
        responseTemplates,
        tone,
        responseStyle,
        replyChance,
        cooldown,
        isActive,
        presetId
      } = req.body;

      if (!name || (!systemPrompt && !presetId)) {
        return res.status(400).json({ error: "Missing required fields: name and systemPrompt (or presetId)" });
      }

      const userStorage = storage.getUserStorage(req.user!.id);
      
      let finalSystemPrompt = systemPrompt;
      let finalTone = tone || "friendly";
      let finalResponseStyle = responseStyle || "medium";
      let finalTraits = traits || { humor: 50, formality: 50, energy: 50 };

      if (presetId) {
        const preset = PERSONALITY_PRESETS.find(p => p.id === presetId);
        if (preset) {
          finalSystemPrompt = finalSystemPrompt || preset.systemPrompt;
          finalTone = preset.tone;
          finalResponseStyle = preset.responseStyle;
          finalTraits = preset.traits;
        }
      }

      if (traits && typeof traits === 'object') {
        const traitPrompt = buildTraitPrompt(traits);
        finalSystemPrompt += `\n\n${traitPrompt}`;
      }

      if (responseTemplates && Array.isArray(responseTemplates) && responseTemplates.length > 0) {
        finalSystemPrompt += `\n\nWhen appropriate, you may use these response templates (replace variables in {braces}):\n${responseTemplates.map((t: string) => `- ${t}`).join('\n')}`;
      }

      const personality = await userStorage.createChatbotPersonality({
        name,
        systemPrompt: finalSystemPrompt,
        temperature: 10,
        traits: finalTraits,
        tone: finalTone,
        responseStyle: finalResponseStyle,
        triggerWords: triggerWords || [],
        replyChance: replyChance ?? 100,
        cooldown: cooldown ?? 30,
        isActive: isActive ?? true
      });

      res.json(personality);
    } catch (error) {
      console.error("Failed to create personality:", error);
      res.status(500).json({ error: "Failed to create personality" });
    }
  });

  app.post("/api/personality/generate", requireAuth, async (req, res) => {
    try {
      const { message, traits, presetId, personalityId, systemPrompt } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Missing required field: message" });
      }

      const userStorage = storage.getUserStorage(req.user!.id);
      const chatbotService = new ChatbotService(userStorage);

      let personality: any;

      if (personalityId) {
        const result = await chatbotService.testChat(message, personalityId);
        return res.json(result);
      }

      if (presetId) {
        const preset = PERSONALITY_PRESETS.find(p => p.id === presetId);
        if (!preset) {
          return res.status(400).json({ error: "Invalid preset ID" });
        }
        personality = {
          name: preset.name,
          systemPrompt: preset.systemPrompt,
          tone: preset.tone,
          responseStyle: preset.responseStyle,
          temperature: 10,
          traits: preset.traits
        };
      } else if (traits && typeof traits === 'object') {
        const traitPrompt = buildTraitPrompt(traits);
        personality = {
          name: "Custom",
          systemPrompt: (systemPrompt || "You are a helpful chat assistant for a livestream.") + `\n\n${traitPrompt}`,
          tone: traits.formality > 70 ? "professional" : (traits.humor > 70 ? "funny" : "friendly"),
          responseStyle: traits.energy > 70 ? "verbose" : (traits.energy < 30 ? "short" : "medium"),
          temperature: Math.round(10 + (traits.humor / 10)),
          traits
        };
      } else {
        personality = {
          name: "Default",
          systemPrompt: systemPrompt || "You are a helpful and friendly chat assistant for a livestream. Keep responses brief and engaging.",
          tone: "friendly",
          responseStyle: "medium",
          temperature: 10,
          traits: { humor: 50, formality: 50, energy: 50 }
        };
      }

      const result = await chatbotService.testPersonality(message, personality);
      res.json(result);
    } catch (error) {
      console.error("Failed to generate personality response:", error);
      res.status(500).json({ error: "Failed to generate personality response" });
    }
  });

  function buildTraitPrompt(traits: { humor?: number; formality?: number; energy?: number }): string {
    const parts: string[] = [];

    if (traits.humor !== undefined) {
      if (traits.humor >= 80) {
        parts.push("Be very humorous and entertaining. Use jokes, puns, and witty observations frequently.");
      } else if (traits.humor >= 60) {
        parts.push("Include light humor and occasional jokes to keep things fun.");
      } else if (traits.humor >= 40) {
        parts.push("Use a balanced tone with occasional light humor when appropriate.");
      } else if (traits.humor >= 20) {
        parts.push("Keep humor minimal, focusing more on helpful and clear responses.");
      } else {
        parts.push("Be serious and straightforward, avoiding humor entirely.");
      }
    }

    if (traits.formality !== undefined) {
      if (traits.formality >= 80) {
        parts.push("Use formal, professional language. Avoid slang, contractions, and casual expressions.");
      } else if (traits.formality >= 60) {
        parts.push("Maintain a polite and professional tone while remaining approachable.");
      } else if (traits.formality >= 40) {
        parts.push("Use a conversational but respectful tone.");
      } else if (traits.formality >= 20) {
        parts.push("Be casual and relaxed in your communication style. Use contractions and informal language.");
      } else {
        parts.push("Be extremely casual. Use slang, abbreviations, and internet speak freely.");
      }
    }

    if (traits.energy !== undefined) {
      if (traits.energy >= 80) {
        parts.push("Be SUPER enthusiastic and energetic! Use exclamation points, caps for emphasis, and convey excitement!");
      } else if (traits.energy >= 60) {
        parts.push("Show enthusiasm and positive energy in your responses.");
      } else if (traits.energy >= 40) {
        parts.push("Maintain a balanced, engaged energy level.");
      } else if (traits.energy >= 20) {
        parts.push("Keep a calm, relaxed vibe. Don't be too excitable.");
      } else {
        parts.push("Be very chill and laid-back. Low energy, relaxed responses.");
      }
    }

    return parts.join(" ");
  }

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

  // ============================================================================
  // ENHANCED BACKEND API ROUTES
  // Onboarding, Feature Toggles, Platform Health, Job Queue, Token Management
  // ============================================================================

  // --- Onboarding Wizard API ---
  app.get("/api/onboarding", requireAuth, async (req, res) => {
    try {
      const status = await onboardingService.getOnboardingStatus(req.user!.id);
      res.json(status);
    } catch (error: any) {
      console.error("[Onboarding API] Failed to get onboarding status:", error);
      res.status(500).json({ error: error.message || "Failed to get onboarding status" });
    }
  });

  app.post("/api/onboarding/step/:stepName/complete", requireAuth, async (req, res) => {
    try {
      const { stepName } = req.params;
      const progress = await onboardingService.completeStep(req.user!.id, stepName);
      const status = await onboardingService.getOnboardingStatus(req.user!.id);
      res.json({ progress, status });
    } catch (error: any) {
      console.error("[Onboarding API] Failed to complete step:", error);
      res.status(500).json({ error: error.message || "Failed to complete step" });
    }
  });

  app.post("/api/onboarding/goto/:step", requireAuth, async (req, res) => {
    try {
      const step = parseInt(req.params.step);
      if (isNaN(step) || step < 1 || step > 5) {
        return res.status(400).json({ error: "Invalid step number (1-5)" });
      }
      const progress = await onboardingService.goToStep(req.user!.id, step);
      res.json({ progress });
    } catch (error: any) {
      console.error("[Onboarding API] Failed to navigate to step:", error);
      res.status(500).json({ error: error.message || "Failed to navigate to step" });
    }
  });

  app.post("/api/onboarding/features", requireAuth, async (req, res) => {
    try {
      const { features } = req.body;
      if (!Array.isArray(features)) {
        return res.status(400).json({ error: "Features must be an array" });
      }
      const progress = await onboardingService.setEnabledFeatures(req.user!.id, features);
      res.json({ progress });
    } catch (error: any) {
      console.error("[Onboarding API] Failed to set features:", error);
      res.status(500).json({ error: error.message || "Failed to set features" });
    }
  });

  app.post("/api/onboarding/skip", requireAuth, async (req, res) => {
    try {
      const progress = await onboardingService.skipOnboarding(req.user!.id);
      res.json({ success: true, progress });
    } catch (error: any) {
      console.error("[Onboarding API] Failed to skip onboarding:", error);
      res.status(500).json({ error: error.message || "Failed to skip onboarding" });
    }
  });

  app.post("/api/onboarding/reset", requireAuth, async (req, res) => {
    try {
      const progress = await onboardingService.resetOnboarding(req.user!.id);
      res.json({ success: true, progress });
    } catch (error: any) {
      console.error("[Onboarding API] Failed to reset onboarding:", error);
      res.status(500).json({ error: error.message || "Failed to reset onboarding" });
    }
  });

  // --- Feature Toggles API ---
  app.get("/api/features/toggles", requireAuth, async (req, res) => {
    try {
      const toggles = await featureToggleService.getOrCreateFeatureToggles(req.user!.id);
      const enabled = await featureToggleService.getEnabledFeatures(req.user!.id);
      const disabled = await featureToggleService.getDisabledFeatures(req.user!.id);
      res.json({ toggles, enabled, disabled, available: featureToggleService.getAvailableFeatures() });
    } catch (error: any) {
      console.error("[Feature Toggle API] Failed to get feature toggles:", error);
      res.status(500).json({ error: error.message || "Failed to get feature toggles" });
    }
  });

  app.put("/api/features/toggles", requireAuth, async (req, res) => {
    try {
      const updates = req.body;
      if (typeof updates !== 'object' || updates === null) {
        return res.status(400).json({ error: "Request body must be an object with feature flags" });
      }
      const toggles = await featureToggleService.updateFeatureToggles(req.user!.id, updates);
      res.json({ toggles });
    } catch (error: any) {
      console.error("[Feature Toggle API] Failed to update feature toggles:", error);
      res.status(500).json({ error: error.message || "Failed to update feature toggles" });
    }
  });

  app.post("/api/features/toggles/:feature/toggle", requireAuth, async (req, res) => {
    try {
      const { feature } = req.params;
      const toggles = await featureToggleService.toggleFeature(req.user!.id, feature as any);
      res.json({ toggles, toggled: feature });
    } catch (error: any) {
      console.error("[Feature Toggle API] Failed to toggle feature:", error);
      res.status(500).json({ error: error.message || "Failed to toggle feature" });
    }
  });

  app.post("/api/features/toggles/reset", requireAuth, async (req, res) => {
    try {
      const toggles = await featureToggleService.resetToDefaults(req.user!.id);
      res.json({ toggles, message: "Features reset to defaults" });
    } catch (error: any) {
      console.error("[Feature Toggle API] Failed to reset features:", error);
      res.status(500).json({ error: error.message || "Failed to reset features" });
    }
  });

  // --- Platform Health / Circuit Breaker API ---
  app.get("/api/platform-health", requireAuth, async (req, res) => {
    try {
      const health = await circuitBreakerService.getAllPlatformHealth();
      const queueStats = await circuitBreakerService.getQueueStats(req.user!.id);
      res.json({ platforms: health, queueStats });
    } catch (error: any) {
      console.error("[Platform Health API] Failed to get platform health:", error);
      res.status(500).json({ error: error.message || "Failed to get platform health" });
    }
  });

  app.get("/api/platform-health/:platform", requireAuth, async (req, res) => {
    try {
      const platform = req.params.platform as 'twitch' | 'youtube' | 'kick' | 'spotify';
      const health = await circuitBreakerService.getPlatformHealth(platform);
      const canRequest = await circuitBreakerService.canMakeRequest(platform);
      const isThrottled = await circuitBreakerService.isThrottled(platform);
      res.json({ health, canRequest, isThrottled });
    } catch (error: any) {
      console.error("[Platform Health API] Failed to get platform health:", error);
      res.status(500).json({ error: error.message || "Failed to get platform health" });
    }
  });

  app.get("/api/message-queue", requireAuth, async (req, res) => {
    try {
      const { platform, limit } = req.query;
      const messages = await circuitBreakerService.getQueuedMessages(
        platform as any,
        limit ? parseInt(limit as string) : 100
      );
      const stats = await circuitBreakerService.getQueueStats(req.user!.id);
      res.json({ messages, stats });
    } catch (error: any) {
      console.error("[Message Queue API] Failed to get message queue:", error);
      res.status(500).json({ error: error.message || "Failed to get message queue" });
    }
  });

  app.post("/api/message-queue", requireAuth, async (req, res) => {
    try {
      const { platform, messageType, content, metadata, priority, scheduledFor } = req.body;
      
      if (!platform || !messageType || !content) {
        return res.status(400).json({ error: "platform, messageType, and content are required" });
      }

      const message = await circuitBreakerService.queueMessage(
        req.user!.id,
        platform,
        messageType,
        content,
        metadata,
        priority,
        scheduledFor ? new Date(scheduledFor) : undefined
      );
      res.json({ message });
    } catch (error: any) {
      console.error("[Message Queue API] Failed to queue message:", error);
      res.status(500).json({ error: error.message || "Failed to queue message" });
    }
  });

  // --- Job Queue API ---
  app.get("/api/jobs/status", requireAuth, async (req, res) => {
    try {
      const status = await jobQueueService.getJobStatus();
      const userJobs = await jobQueueService.getJobsByUser(req.user!.id, 20);
      res.json({ ...status, userJobs });
    } catch (error: any) {
      console.error("[Job Queue API] Failed to get job status:", error);
      res.status(500).json({ error: error.message || "Failed to get job status" });
    }
  });

  app.get("/api/jobs", requireAuth, async (req, res) => {
    try {
      const { status, jobType, limit } = req.query;
      const jobs = await jobQueueService.getJobs(
        status as any,
        jobType as any,
        limit ? parseInt(limit as string) : 100
      );
      res.json({ jobs });
    } catch (error: any) {
      console.error("[Job Queue API] Failed to get jobs:", error);
      res.status(500).json({ error: error.message || "Failed to get jobs" });
    }
  });

  app.post("/api/jobs", requireAuth, async (req, res) => {
    try {
      const { jobType, jobName, payload, priority, runAt, repeatInterval } = req.body;
      
      if (!jobType || !jobName) {
        return res.status(400).json({ error: "jobType and jobName are required" });
      }

      const job = await jobQueueService.createJob(jobType, jobName, payload, {
        userId: req.user!.id,
        priority,
        runAt: runAt ? new Date(runAt) : undefined,
        repeatInterval,
      });
      res.json({ job });
    } catch (error: any) {
      console.error("[Job Queue API] Failed to create job:", error);
      res.status(500).json({ error: error.message || "Failed to create job" });
    }
  });

  app.post("/api/jobs/:id/cancel", requireAuth, async (req, res) => {
    try {
      await jobQueueService.cancelJob(req.params.id);
      res.json({ success: true, message: "Job cancelled" });
    } catch (error: any) {
      console.error("[Job Queue API] Failed to cancel job:", error);
      res.status(500).json({ error: error.message || "Failed to cancel job" });
    }
  });

  // --- Enhanced Token Management API ---
  app.get("/api/tokens/dashboard", requireAuth, async (req, res) => {
    try {
      const dashboard = await enhancedTokenService.getTokenDashboard(req.user!.id);
      res.json(dashboard);
    } catch (error: any) {
      console.error("[Token API] Failed to get token dashboard:", error);
      res.status(500).json({ error: error.message || "Failed to get token dashboard" });
    }
  });

  app.get("/api/tokens/health/:platform", requireAuth, async (req, res) => {
    try {
      const platform = req.params.platform as 'twitch' | 'youtube' | 'kick' | 'spotify';
      const health = await enhancedTokenService.getTokenHealthStatus(req.user!.id, platform);
      res.json(health);
    } catch (error: any) {
      console.error("[Token API] Failed to get token health:", error);
      res.status(500).json({ error: error.message || "Failed to get token health" });
    }
  });

  app.get("/api/tokens/rotation-history", requireAuth, async (req, res) => {
    try {
      const { platform, limit } = req.query;
      const history = await enhancedTokenService.getRotationHistory(
        req.user!.id,
        platform as any,
        limit ? parseInt(limit as string) : 50
      );
      res.json({ history });
    } catch (error: any) {
      console.error("[Token API] Failed to get rotation history:", error);
      res.status(500).json({ error: error.message || "Failed to get rotation history" });
    }
  });

  app.get("/api/tokens/alerts", requireAuth, async (req, res) => {
    try {
      const alerts = await enhancedTokenService.getPendingAlerts(req.user!.id);
      res.json({ alerts });
    } catch (error: any) {
      console.error("[Token API] Failed to get token alerts:", error);
      res.status(500).json({ error: error.message || "Failed to get token alerts" });
    }
  });

  app.post("/api/tokens/alerts/:id/acknowledge", requireAuth, async (req, res) => {
    try {
      await enhancedTokenService.acknowledgeAlert(req.params.id);
      res.json({ success: true, message: "Alert acknowledged" });
    } catch (error: any) {
      console.error("[Token API] Failed to acknowledge alert:", error);
      res.status(500).json({ error: error.message || "Failed to acknowledge alert" });
    }
  });

  app.post("/api/tokens/alerts/acknowledge-all", requireAuth, async (req, res) => {
    try {
      const { platform } = req.body;
      const count = await enhancedTokenService.acknowledgeAllAlerts(req.user!.id, platform);
      res.json({ success: true, acknowledged: count });
    } catch (error: any) {
      console.error("[Token API] Failed to acknowledge alerts:", error);
      res.status(500).json({ error: error.message || "Failed to acknowledge alerts" });
    }
  });

  app.post("/api/tokens/check-expiry", requireAuth, async (req, res) => {
    try {
      await enhancedTokenService.checkTokenExpiry(req.user!.id);
      const alerts = await enhancedTokenService.getPendingAlerts(req.user!.id);
      res.json({ success: true, alerts });
    } catch (error: any) {
      console.error("[Token API] Failed to check token expiry:", error);
      res.status(500).json({ error: error.message || "Failed to check token expiry" });
    }
  });

  // ============================================================================
  // ENHANCED AI SERVICES API ROUTES
  // ============================================================================

  // --- Intent Detection API ---
  app.post("/api/ai/intent/detect", requireAuth, async (req, res) => {
    try {
      const { message, context } = req.body;
      if (!message) {
        return res.status(400).json({ error: "message is required" });
      }

      const result = await intentDetectionService.detectIntent(message, context);
      res.json(result);
    } catch (error: any) {
      console.error("[Intent API] Detection failed:", error);
      res.status(500).json({ error: error.message || "Failed to detect intent" });
    }
  });

  app.post("/api/ai/intent/classify-and-route", requireAuth, async (req, res) => {
    try {
      const { platform, username, message, context } = req.body;
      if (!platform || !username || !message) {
        return res.status(400).json({ error: "platform, username, and message are required" });
      }

      const { result, handler } = await intentDetectionService.classifyAndRoute(
        req.user!.id,
        platform,
        username,
        message,
        context
      );
      res.json({ result, handler });
    } catch (error: any) {
      console.error("[Intent API] Classification failed:", error);
      res.status(500).json({ error: error.message || "Failed to classify intent" });
    }
  });

  app.get("/api/ai/intent/stats", requireAuth, async (req, res) => {
    try {
      const { days } = req.query;
      const stats = await intentDetectionService.getIntentStats(
        req.user!.id,
        days ? parseInt(days as string) : 7
      );
      res.json({ stats });
    } catch (error: any) {
      console.error("[Intent API] Stats failed:", error);
      res.status(500).json({ error: error.message || "Failed to get intent stats" });
    }
  });

  app.get("/api/ai/intent/recent", requireAuth, async (req, res) => {
    try {
      const { limit } = req.query;
      const classifications = await intentDetectionService.getRecentClassifications(
        req.user!.id,
        limit ? parseInt(limit as string) : 50
      );
      res.json({ classifications });
    } catch (error: any) {
      console.error("[Intent API] Recent failed:", error);
      res.status(500).json({ error: error.message || "Failed to get recent classifications" });
    }
  });

  // --- Enhanced Moderation API ---
  app.get("/api/ai/moderation/settings", requireAuth, async (req, res) => {
    try {
      const settings = await enhancedModerationService.getSettings(req.user!.id);
      res.json({ settings });
    } catch (error: any) {
      console.error("[Moderation API] Get settings failed:", error);
      res.status(500).json({ error: error.message || "Failed to get moderation settings" });
    }
  });

  app.put("/api/ai/moderation/settings", requireAuth, async (req, res) => {
    try {
      const settings = await enhancedModerationService.updateSettings(req.user!.id, req.body);
      res.json({ settings });
    } catch (error: any) {
      console.error("[Moderation API] Update settings failed:", error);
      res.status(500).json({ error: error.message || "Failed to update moderation settings" });
    }
  });

  app.post("/api/ai/moderation/check", requireAuth, async (req, res) => {
    try {
      const { platform, username, message } = req.body;
      if (!platform || !username || !message) {
        return res.status(400).json({ error: "platform, username, and message are required" });
      }

      const result = await enhancedModerationService.moderateMessage(
        req.user!.id,
        platform,
        username,
        message
      );
      res.json(result);
    } catch (error: any) {
      console.error("[Moderation API] Check failed:", error);
      res.status(500).json({ error: error.message || "Failed to moderate message" });
    }
  });

  app.get("/api/ai/moderation/log", requireAuth, async (req, res) => {
    try {
      const { limit, offset, actionType, violationType } = req.query;
      const log = await enhancedModerationService.getActionLog(req.user!.id, {
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : undefined,
        actionType: actionType as any,
        violationType: violationType as any,
      });
      res.json({ log });
    } catch (error: any) {
      console.error("[Moderation API] Get log failed:", error);
      res.status(500).json({ error: error.message || "Failed to get moderation log" });
    }
  });

  app.get("/api/ai/moderation/stats", requireAuth, async (req, res) => {
    try {
      const { days } = req.query;
      const stats = await enhancedModerationService.getModerationStats(
        req.user!.id,
        days ? parseInt(days as string) : 7
      );
      res.json({ stats });
    } catch (error: any) {
      console.error("[Moderation API] Stats failed:", error);
      res.status(500).json({ error: error.message || "Failed to get moderation stats" });
    }
  });

  app.post("/api/ai/moderation/whitelist", requireAuth, async (req, res) => {
    try {
      const { items, type } = req.body;
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: "items array is required" });
      }

      if (type === 'user') {
        for (const username of items) {
          await enhancedModerationService.whitelistUser(req.user!.id, username);
        }
      } else {
        await enhancedModerationService.addToWhitelist(req.user!.id, items);
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Moderation API] Whitelist failed:", error);
      res.status(500).json({ error: error.message || "Failed to update whitelist" });
    }
  });

  app.post("/api/ai/moderation/blacklist", requireAuth, async (req, res) => {
    try {
      const { items } = req.body;
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: "items array is required" });
      }

      await enhancedModerationService.addToBlacklist(req.user!.id, items);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Moderation API] Blacklist failed:", error);
      res.status(500).json({ error: error.message || "Failed to update blacklist" });
    }
  });

  app.delete("/api/ai/moderation/whitelist", requireAuth, async (req, res) => {
    try {
      const { items, type } = req.body;
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: "items array is required" });
      }

      if (type === 'user') {
        for (const username of items) {
          await enhancedModerationService.unwhitelistUser(req.user!.id, username);
        }
      } else {
        await enhancedModerationService.removeFromWhitelist(req.user!.id, items);
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Moderation API] Whitelist remove failed:", error);
      res.status(500).json({ error: error.message || "Failed to update whitelist" });
    }
  });

  app.delete("/api/ai/moderation/blacklist", requireAuth, async (req, res) => {
    try {
      const { items } = req.body;
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: "items array is required" });
      }

      await enhancedModerationService.removeFromBlacklist(req.user!.id, items);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Moderation API] Blacklist remove failed:", error);
      res.status(500).json({ error: error.message || "Failed to update blacklist" });
    }
  });

  // --- Personalized Facts API ---
  app.post("/api/ai/facts/generate", requireAuth, async (req, res) => {
    try {
      const { preferredTopics, excludeTopics, platform, forcePersonalized } = req.body;
      
      const result = await personalizedFactService.generateFact(req.user!.id, {
        preferredTopics,
        excludeTopics,
        platform: platform || 'twitch',
        forcePersonalized,
      });

      if (platform) {
        await personalizedFactService.recordFactAnalytics(
          req.user!.id,
          result.fact,
          result.topic,
          platform,
          'manual',
          undefined,
          result.generationTimeMs,
          result.wasPersonalized
        );
      }

      res.json(result);
    } catch (error: any) {
      console.error("[Facts API] Generate failed:", error);
      res.status(500).json({ error: error.message || "Failed to generate fact" });
    }
  });

  app.get("/api/ai/facts/topics", requireAuth, async (req, res) => {
    try {
      const topics = personalizedFactService.getAvailableTopics();
      res.json({ topics });
    } catch (error: any) {
      console.error("[Facts API] Topics failed:", error);
      res.status(500).json({ error: error.message || "Failed to get topics" });
    }
  });

  app.get("/api/ai/facts/preferences", requireAuth, async (req, res) => {
    try {
      const preferences = await personalizedFactService.getUserTopicPreferences(req.user!.id);
      res.json({ preferences });
    } catch (error: any) {
      console.error("[Facts API] Preferences failed:", error);
      res.status(500).json({ error: error.message || "Failed to get preferences" });
    }
  });

  app.post("/api/ai/facts/reaction", requireAuth, async (req, res) => {
    try {
      const { topic, isPositive } = req.body;
      if (!topic || typeof isPositive !== 'boolean') {
        return res.status(400).json({ error: "topic and isPositive are required" });
      }

      await personalizedFactService.recordReaction(req.user!.id, topic, isPositive);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Facts API] Reaction failed:", error);
      res.status(500).json({ error: error.message || "Failed to record reaction" });
    }
  });

  app.get("/api/ai/facts/stats", requireAuth, async (req, res) => {
    try {
      const { days } = req.query;
      const stats = await personalizedFactService.getFactAnalyticsStats(
        req.user!.id,
        days ? parseInt(days as string) : 30
      );
      res.json({ stats });
    } catch (error: any) {
      console.error("[Facts API] Stats failed:", error);
      res.status(500).json({ error: error.message || "Failed to get fact stats" });
    }
  });

  app.post("/api/ai/facts/engagement", requireAuth, async (req, res) => {
    try {
      const { analyticsId, reactionType, increment } = req.body;
      if (!analyticsId || !reactionType) {
        return res.status(400).json({ error: "analyticsId and reactionType are required" });
      }

      await personalizedFactService.recordFactEngagement(analyticsId, reactionType, increment || 1);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Facts API] Engagement failed:", error);
      res.status(500).json({ error: error.message || "Failed to record engagement" });
    }
  });

  // --- Speech-to-Text Preparation API ---
  app.post("/api/ai/stt/queue", requireAuth, async (req, res) => {
    try {
      const { platform, audioSource, audioUrl, audioFormat, durationMs, priority } = req.body;
      if (!platform || !audioSource) {
        return res.status(400).json({ error: "platform and audioSource are required" });
      }

      const queueId = await speechToTextService.addToQueue(req.user!.id, platform, audioSource, {
        audioUrl,
        audioFormat,
        durationMs,
        priority,
      });
      res.json({ queueId });
    } catch (error: any) {
      console.error("[STT API] Queue add failed:", error);
      res.status(500).json({ error: error.message || "Failed to add to queue" });
    }
  });

  app.get("/api/ai/stt/queue", requireAuth, async (req, res) => {
    try {
      const { status, limit } = req.query;
      const queue = await speechToTextService.getUserQueue(req.user!.id, {
        status: status as any,
        limit: limit ? parseInt(limit as string) : 50,
      });
      res.json({ queue });
    } catch (error: any) {
      console.error("[STT API] Queue get failed:", error);
      res.status(500).json({ error: error.message || "Failed to get queue" });
    }
  });

  app.get("/api/ai/stt/queue/:id", requireAuth, async (req, res) => {
    try {
      const item = await speechToTextService.getQueueItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Queue item not found" });
      }
      res.json({ item });
    } catch (error: any) {
      console.error("[STT API] Queue item get failed:", error);
      res.status(500).json({ error: error.message || "Failed to get queue item" });
    }
  });

  app.delete("/api/ai/stt/queue/:id", requireAuth, async (req, res) => {
    try {
      const cancelled = await speechToTextService.cancelQueueItem(req.params.id);
      if (!cancelled) {
        return res.status(400).json({ error: "Cannot cancel this queue item" });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("[STT API] Queue cancel failed:", error);
      res.status(500).json({ error: error.message || "Failed to cancel queue item" });
    }
  });

  app.get("/api/ai/stt/transcriptions", requireAuth, async (req, res) => {
    try {
      const { limit } = req.query;
      const transcriptions = await speechToTextService.getUserTranscriptions(req.user!.id, {
        limit: limit ? parseInt(limit as string) : 50,
      });
      res.json({ transcriptions });
    } catch (error: any) {
      console.error("[STT API] Transcriptions get failed:", error);
      res.status(500).json({ error: error.message || "Failed to get transcriptions" });
    }
  });

  app.get("/api/ai/stt/transcriptions/:id", requireAuth, async (req, res) => {
    try {
      const transcription = await speechToTextService.getTranscription(req.params.id);
      if (!transcription) {
        return res.status(404).json({ error: "Transcription not found" });
      }
      res.json({ transcription });
    } catch (error: any) {
      console.error("[STT API] Transcription get failed:", error);
      res.status(500).json({ error: error.message || "Failed to get transcription" });
    }
  });

  app.get("/api/ai/stt/stats", requireAuth, async (req, res) => {
    try {
      const stats = await speechToTextService.getQueueStats(req.user!.id);
      res.json({ stats });
    } catch (error: any) {
      console.error("[STT API] Stats failed:", error);
      res.status(500).json({ error: error.message || "Failed to get STT stats" });
    }
  });

  app.get("/api/ai/stt/config", requireAuth, async (req, res) => {
    try {
      res.json({
        whisperConfig: speechToTextService.getWhisperConfig(),
        supportedFormats: speechToTextService.getSupportedFormats(),
        maxFileSizeMb: speechToTextService.getMaxFileSizeMb(),
        isIntegrated: speechToTextService.isWhisperIntegrated(),
      });
    } catch (error: any) {
      console.error("[STT API] Config failed:", error);
      res.status(500).json({ error: error.message || "Failed to get STT config" });
    }
  });

  // ============================================================================
  // STREAM CLIPS API - Capture and highlight stream moments
  // ============================================================================

  app.get("/api/clips", requireAuth, async (req, res) => {
    try {
      const { platform, sort, order, limit, offset, highlights } = req.query;
      
      const conditions = [eq(streamClips.userId, req.user!.id)];
      
      if (platform && typeof platform === "string") {
        conditions.push(eq(streamClips.platform, platform));
      }
      
      if (highlights === "true") {
        conditions.push(eq(streamClips.isHighlight, true));
      }
      
      const sortColumn = sort === "views" ? streamClips.viewCount : streamClips.clipCreatedAt;
      const sortOrder = order === "asc" ? asc(sortColumn) : desc(sortColumn);
      
      const clips = await db
        .select()
        .from(streamClips)
        .where(and(...conditions))
        .orderBy(sortOrder)
        .limit(limit ? parseInt(limit as string) : 50)
        .offset(offset ? parseInt(offset as string) : 0);
      
      const total = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(streamClips)
        .where(and(...conditions));
      
      res.json({
        clips,
        total: total[0]?.count || 0,
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
      });
    } catch (error: any) {
      console.error("[Clips API] List failed:", error);
      res.status(500).json({ error: error.message || "Failed to fetch clips" });
    }
  });

  app.get("/api/clips/highlights", requireAuth, async (req, res) => {
    try {
      const clips = await db
        .select()
        .from(streamClips)
        .where(and(
          eq(streamClips.userId, req.user!.id),
          eq(streamClips.isHighlight, true)
        ))
        .orderBy(desc(streamClips.clipCreatedAt))
        .limit(50);
      
      res.json({ clips });
    } catch (error: any) {
      console.error("[Clips API] Highlights failed:", error);
      res.status(500).json({ error: error.message || "Failed to fetch highlights" });
    }
  });

  app.post("/api/clips/fetch", requireAuth, async (req, res) => {
    try {
      const { platform } = req.body;
      
      if (platform !== "twitch") {
        return res.status(400).json({ error: "Only Twitch clips fetch is currently supported" });
      }
      
      const connection = await db
        .select()
        .from(platformConnections)
        .where(and(
          eq(platformConnections.userId, req.user!.id),
          eq(platformConnections.platform, "twitch")
        ))
        .limit(1);
      
      if (!connection[0]) {
        return res.status(400).json({ error: "No Twitch connection found. Please connect your Twitch account." });
      }
      
      const twitchConnection = connection[0];
      
      if (!twitchConnection.accessToken) {
        return res.status(400).json({ error: "Twitch access token missing. Please reconnect your Twitch account." });
      }
      
      const clientId = process.env.TWITCH_CLIENT_ID;
      if (!clientId) {
        return res.status(500).json({ error: "Twitch API not configured" });
      }
      
      const clipsResponse = await fetch(
        `https://api.twitch.tv/helix/clips?broadcaster_id=${twitchConnection.platformUserId}&first=100`,
        {
          headers: {
            "Authorization": `Bearer ${twitchConnection.accessToken}`,
            "Client-Id": clientId,
          },
        }
      );
      
      if (!clipsResponse.ok) {
        const errorText = await clipsResponse.text();
        console.error("[Clips API] Twitch API error:", errorText);
        return res.status(clipsResponse.status).json({ error: "Failed to fetch clips from Twitch" });
      }
      
      const clipsData = await clipsResponse.json();
      let inserted = 0;
      let updated = 0;
      
      for (const clip of clipsData.data || []) {
        const clipData = {
          userId: req.user!.id,
          platform: "twitch" as const,
          clipId: clip.id,
          title: clip.title,
          url: clip.url,
          embedUrl: clip.embed_url,
          thumbnailUrl: clip.thumbnail_url,
          duration: Math.round(clip.duration),
          viewCount: clip.view_count,
          gameId: clip.game_id,
          broadcasterName: clip.broadcaster_name,
          broadcasterId: clip.broadcaster_id,
          clipCreatedAt: new Date(clip.created_at),
        };
        
        const existing = await db
          .select()
          .from(streamClips)
          .where(and(
            eq(streamClips.userId, req.user!.id),
            eq(streamClips.platform, "twitch"),
            eq(streamClips.clipId, clip.id)
          ))
          .limit(1);
        
        if (existing[0]) {
          await db
            .update(streamClips)
            .set({ viewCount: clip.view_count, updatedAt: new Date() })
            .where(eq(streamClips.id, existing[0].id));
          updated++;
        } else {
          await db.insert(streamClips).values(clipData);
          inserted++;
        }
      }
      
      res.json({
        success: true,
        message: `Synced clips from Twitch`,
        inserted,
        updated,
        total: clipsData.data?.length || 0,
      });
    } catch (error: any) {
      console.error("[Clips API] Fetch failed:", error);
      res.status(500).json({ error: error.message || "Failed to fetch clips" });
    }
  });

  app.delete("/api/clips/:id", requireAuth, async (req, res) => {
    try {
      const clip = await db
        .select()
        .from(streamClips)
        .where(and(
          eq(streamClips.id, req.params.id),
          eq(streamClips.userId, req.user!.id)
        ))
        .limit(1);
      
      if (!clip[0]) {
        return res.status(404).json({ error: "Clip not found" });
      }
      
      await db
        .delete(streamClips)
        .where(eq(streamClips.id, req.params.id));
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Clips API] Delete failed:", error);
      res.status(500).json({ error: error.message || "Failed to delete clip" });
    }
  });

  app.post("/api/clips/:id/highlight", requireAuth, async (req, res) => {
    try {
      const { isHighlight } = req.body;
      
      const clip = await db
        .select()
        .from(streamClips)
        .where(and(
          eq(streamClips.id, req.params.id),
          eq(streamClips.userId, req.user!.id)
        ))
        .limit(1);
      
      if (!clip[0]) {
        return res.status(404).json({ error: "Clip not found" });
      }
      
      const [updated] = await db
        .update(streamClips)
        .set({ isHighlight: isHighlight !== undefined ? isHighlight : !clip[0].isHighlight, updatedAt: new Date() })
        .where(eq(streamClips.id, req.params.id))
        .returning();
      
      res.json({ clip: updated });
    } catch (error: any) {
      console.error("[Clips API] Highlight toggle failed:", error);
      res.status(500).json({ error: error.message || "Failed to update clip" });
    }
  });

  app.put("/api/clips/:id", requireAuth, async (req, res) => {
    try {
      const { clipService } = await import("./clip-service");
      const { title, tags, status, socialCaption, isHighlight } = req.body;
      
      const updated = await clipService.updateClip(req.user!.id, req.params.id, {
        title,
        tags,
        status,
        socialCaption,
        isHighlight,
      });
      
      res.json({ clip: updated });
    } catch (error: any) {
      console.error("[Clips API] Update failed:", error);
      if (error.message === "Clip not found") {
        return res.status(404).json({ error: "Clip not found" });
      }
      res.status(500).json({ error: error.message || "Failed to update clip" });
    }
  });

  app.post("/api/clips/:id/caption", requireAuth, async (req, res) => {
    try {
      const { clipService } = await import("./clip-service");
      
      const clip = await db
        .select()
        .from(streamClips)
        .where(and(
          eq(streamClips.id, req.params.id),
          eq(streamClips.userId, req.user!.id)
        ))
        .limit(1);
      
      if (!clip[0]) {
        return res.status(404).json({ error: "Clip not found" });
      }
      
      const caption = await clipService.generateCaption(clip[0].title, clip[0].platform);
      
      const [updated] = await db
        .update(streamClips)
        .set({ socialCaption: caption, updatedAt: new Date() })
        .where(eq(streamClips.id, req.params.id))
        .returning();
      
      res.json({ clip: updated, caption });
    } catch (error: any) {
      console.error("[Clips API] Caption generation failed:", error);
      res.status(500).json({ error: error.message || "Failed to generate caption" });
    }
  });

  app.get("/api/announcements", requireAuth, async (req, res) => {
    try {
      const announcements = await db
        .select()
        .from(scheduledAnnouncements)
        .where(eq(scheduledAnnouncements.userId, req.user!.id))
        .orderBy(desc(scheduledAnnouncements.createdAt));

      res.json(announcements);
    } catch (error: any) {
      console.error("[Announcements API] Failed to fetch announcements:", error);
      res.status(500).json({ error: error.message || "Failed to fetch announcements" });
    }
  });

  app.get("/api/announcements/templates", requireAuth, async (_req, res) => {
    res.json(ANNOUNCEMENT_TEMPLATES);
  });

  app.post("/api/announcements", requireAuth, async (req, res) => {
    try {
      const validationResult = insertScheduledAnnouncementSchema.safeParse(req.body);

      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: validationResult.error.issues,
        });
      }

      const data = validationResult.data;

      let nextRunAt: Date | null = null;
      if (data.scheduleType === "once" && data.scheduledTime) {
        nextRunAt = new Date(data.scheduledTime);
      } else if (data.scheduleType === "recurring" && data.cronPattern) {
        const parts = data.cronPattern.split(" ");
        if (parts.length === 5) {
          const [minute, hour] = parts;
          const now = new Date();
          nextRunAt = new Date(now);
          if (hour !== "*") nextRunAt.setHours(parseInt(hour, 10));
          if (minute !== "*") nextRunAt.setMinutes(parseInt(minute, 10));
          nextRunAt.setSeconds(0);
          if (nextRunAt <= now) nextRunAt.setDate(nextRunAt.getDate() + 1);
        }
      }

      const [announcement] = await db
        .insert(scheduledAnnouncements)
        .values({
          ...data,
          userId: req.user!.id,
          nextRunAt,
          discordWebhookUrl: data.discordWebhookUrl || null,
        })
        .returning();

      res.json(announcement);
    } catch (error: any) {
      console.error("[Announcements API] Failed to create announcement:", error);
      res.status(500).json({ error: error.message || "Failed to create announcement" });
    }
  });

  app.put("/api/announcements/:id", requireAuth, async (req, res) => {
    try {
      const existing = await db
        .select()
        .from(scheduledAnnouncements)
        .where(and(
          eq(scheduledAnnouncements.id, req.params.id),
          eq(scheduledAnnouncements.userId, req.user!.id)
        ))
        .limit(1);

      if (!existing[0]) {
        return res.status(404).json({ error: "Announcement not found" });
      }

      const validationResult = updateScheduledAnnouncementSchema.safeParse(req.body);

      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: validationResult.error.issues,
        });
      }

      const data = validationResult.data;

      let nextRunAt = existing[0].nextRunAt;
      if (data.scheduleType === "once" && data.scheduledTime) {
        nextRunAt = new Date(data.scheduledTime);
      } else if (data.scheduleType === "recurring" && data.cronPattern) {
        const parts = data.cronPattern.split(" ");
        if (parts.length === 5) {
          const [minute, hour] = parts;
          const now = new Date();
          nextRunAt = new Date(now);
          if (hour !== "*") nextRunAt.setHours(parseInt(hour, 10));
          if (minute !== "*") nextRunAt.setMinutes(parseInt(minute, 10));
          nextRunAt.setSeconds(0);
          if (nextRunAt <= now) nextRunAt.setDate(nextRunAt.getDate() + 1);
        }
      }

      const [updated] = await db
        .update(scheduledAnnouncements)
        .set({
          ...data,
          nextRunAt,
          updatedAt: new Date(),
        })
        .where(eq(scheduledAnnouncements.id, req.params.id))
        .returning();

      res.json(updated);
    } catch (error: any) {
      console.error("[Announcements API] Failed to update announcement:", error);
      res.status(500).json({ error: error.message || "Failed to update announcement" });
    }
  });

  app.delete("/api/announcements/:id", requireAuth, async (req, res) => {
    try {
      const existing = await db
        .select()
        .from(scheduledAnnouncements)
        .where(and(
          eq(scheduledAnnouncements.id, req.params.id),
          eq(scheduledAnnouncements.userId, req.user!.id)
        ))
        .limit(1);

      if (!existing[0]) {
        return res.status(404).json({ error: "Announcement not found" });
      }

      await db
        .delete(scheduledAnnouncements)
        .where(eq(scheduledAnnouncements.id, req.params.id));

      res.json({ success: true });
    } catch (error: any) {
      console.error("[Announcements API] Failed to delete announcement:", error);
      res.status(500).json({ error: error.message || "Failed to delete announcement" });
    }
  });

  app.post("/api/announcements/:id/send-now", requireAuth, async (req, res) => {
    try {
      const existing = await db
        .select()
        .from(scheduledAnnouncements)
        .where(and(
          eq(scheduledAnnouncements.id, req.params.id),
          eq(scheduledAnnouncements.userId, req.user!.id)
        ))
        .limit(1);

      if (!existing[0]) {
        return res.status(404).json({ error: "Announcement not found" });
      }

      const result = await announcementScheduler.processAnnouncement(
        req.params.id,
        req.user!.id
      );

      if (result.success) {
        res.json({ success: true, message: "Announcement sent successfully", platformResults: result.platformResults });
      } else {
        res.status(500).json({
          success: false,
          error: "Failed to send to some platforms",
          platformResults: result.platformResults,
        });
      }
    } catch (error: any) {
      console.error("[Announcements API] Failed to send announcement:", error);
      res.status(500).json({ error: error.message || "Failed to send announcement" });
    }
  });

  app.post("/api/announcements/:id/cancel", requireAuth, async (req, res) => {
    try {
      const existing = await db
        .select()
        .from(scheduledAnnouncements)
        .where(and(
          eq(scheduledAnnouncements.id, req.params.id),
          eq(scheduledAnnouncements.userId, req.user!.id)
        ))
        .limit(1);

      if (!existing[0]) {
        return res.status(404).json({ error: "Announcement not found" });
      }

      const [updated] = await db
        .update(scheduledAnnouncements)
        .set({
          status: "cancelled",
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(scheduledAnnouncements.id, req.params.id))
        .returning();

      res.json(updated);
    } catch (error: any) {
      console.error("[Announcements API] Failed to cancel announcement:", error);
      res.status(500).json({ error: error.message || "Failed to cancel announcement" });
    }
  });

  // ============================================
  // RESTREAM CONFIGURATION ROUTES
  // ============================================

  app.get("/api/restream/destinations", requireAuth, async (req, res) => {
    try {
      const { restreamService } = await import("./restream-service");
      const destinations = await restreamService.getDestinations(req.user!.id);
      res.json(destinations);
    } catch (error: any) {
      console.error("[Restream API] Failed to get destinations:", error);
      res.status(500).json({ error: error.message || "Failed to get destinations" });
    }
  });

  app.get("/api/restream/servers", async (req, res) => {
    try {
      const { restreamService } = await import("./restream-service");
      const servers = restreamService.getRtmpServers();
      res.json(servers);
    } catch (error: any) {
      console.error("[Restream API] Failed to get servers:", error);
      res.status(500).json({ error: error.message || "Failed to get servers" });
    }
  });

  app.post("/api/restream/destinations", requireAuth, async (req, res) => {
    try {
      const { restreamService } = await import("./restream-service");
      const { platform, rtmpUrl, streamKey, enabled, bitrate, notes } = req.body;

      if (!platform || !rtmpUrl || !streamKey) {
        return res.status(400).json({ error: "Platform, RTMP URL, and stream key are required" });
      }

      const destination = await restreamService.addDestination(req.user!.id, {
        platform,
        rtmpUrl,
        streamKey,
        enabled: enabled ?? true,
        bitrate: bitrate ?? 6000,
        notes: notes ?? "",
      });

      res.json(destination);
    } catch (error: any) {
      console.error("[Restream API] Failed to add destination:", error);
      res.status(500).json({ error: error.message || "Failed to add destination" });
    }
  });

  app.put("/api/restream/destinations/:id", requireAuth, async (req, res) => {
    try {
      const { restreamService } = await import("./restream-service");
      const destination = await restreamService.updateDestination(
        req.user!.id,
        req.params.id,
        req.body
      );

      if (!destination) {
        return res.status(404).json({ error: "Destination not found" });
      }

      res.json(destination);
    } catch (error: any) {
      console.error("[Restream API] Failed to update destination:", error);
      res.status(500).json({ error: error.message || "Failed to update destination" });
    }
  });

  app.delete("/api/restream/destinations/:id", requireAuth, async (req, res) => {
    try {
      const { restreamService } = await import("./restream-service");
      const deleted = await restreamService.deleteDestination(req.user!.id, req.params.id);

      if (!deleted) {
        return res.status(404).json({ error: "Destination not found" });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("[Restream API] Failed to delete destination:", error);
      res.status(500).json({ error: error.message || "Failed to delete destination" });
    }
  });

  app.get("/api/restream/status", requireAuth, async (req, res) => {
    try {
      const { restreamService } = await import("./restream-service");
      const status = await restreamService.getStreamStatus(req.user!.id);
      res.json(status);
    } catch (error: any) {
      console.error("[Restream API] Failed to get stream status:", error);
      res.status(500).json({ error: error.message || "Failed to get stream status" });
    }
  });

  // ============================================
  // AI CONTENT ASSISTANT ROUTES
  // ============================================
  
  app.post("/api/ai/generate", requireAuth, async (req, res) => {
    try {
      const { generateContent } = await import("./ai-content-service");
      const result = await generateContent(req.body);
      res.json(result);
    } catch (error: any) {
      console.error("[AI Content] Generation failed:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/ai/improve", requireAuth, async (req, res) => {
    try {
      const { improveContent } = await import("./ai-content-service");
      const { content, instruction } = req.body;
      const result = await improveContent(content, instruction);
      res.json(result);
    } catch (error: any) {
      console.error("[AI Content] Improvement failed:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/ai/hashtags", requireAuth, async (req, res) => {
    try {
      const { generateHashtags } = await import("./ai-content-service");
      const { content, platform, count } = req.body;
      const hashtags = await generateHashtags(content, platform, count);
      res.json({ success: true, hashtags });
    } catch (error: any) {
      console.error("[AI Content] Hashtag generation failed:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/ai/stream-ideas", requireAuth, async (req, res) => {
    try {
      const { suggestStreamIdeas } = await import("./ai-content-service");
      const { category, pastStreams, audience } = req.body;
      const ideas = await suggestStreamIdeas(category, pastStreams, audience);
      res.json({ success: true, ideas });
    } catch (error: any) {
      console.error("[AI Content] Idea generation failed:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Events API - Stream schedule and community events
  app.get("/api/events", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const events = await eventsService.getEvents(userId, startDate, endDate);
      res.json(events);
    } catch (error: any) {
      console.error("[Events] Error fetching events:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/events/upcoming", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const limit = parseInt(req.query.limit as string) || 5;
      const events = await eventsService.getUpcomingEvents(userId, limit);
      res.json(events);
    } catch (error: any) {
      console.error("[Events] Error fetching upcoming events:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/events/public/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const events = await eventsService.getPublicEvents(userId);
      res.json(events);
    } catch (error: any) {
      console.error("[Events] Error fetching public events:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/events", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const event = await eventsService.createEvent(userId, req.body);
      res.status(201).json(event);
    } catch (error: any) {
      console.error("[Events] Error creating event:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/events/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const event = await eventsService.updateEvent(userId, id, req.body);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      res.json(event);
    } catch (error: any) {
      console.error("[Events] Error updating event:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/events/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const success = await eventsService.deleteEvent(userId, id);
      if (!success) {
        return res.status(404).json({ error: "Event not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Events] Error deleting event:", error);
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
