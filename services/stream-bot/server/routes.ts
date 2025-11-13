// Reference: javascript_websocket blueprint
import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { botManager } from "./bot-manager";
import { updateBotConfigSchema } from "@shared/schema";
import authRoutes from "./auth/routes";
import spotifyRoutes from "./spotify-routes";
import oauthSpotifyRoutes from "./oauth-spotify";
import oauthYoutubeRoutes from "./oauth-youtube";
import oauthTwitchRoutes from "./oauth-twitch";
import overlayRoutes from "./overlay-routes";
import { requireAuth } from "./auth/middleware";
import { sessionMiddleware } from "./index";

export async function registerRoutes(app: Express): Promise<Server> {
  app.use("/auth", authRoutes);
  app.use("/auth", oauthSpotifyRoutes);
  app.use("/auth", oauthYoutubeRoutes);
  app.use("/auth", oauthTwitchRoutes);
  app.use("/api/spotify", spotifyRoutes);
  app.use("/api/overlay", overlayRoutes);
  const httpServer = createServer(app);

  // Bootstrap botManager
  await botManager.bootstrap();

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

  // Health Check - Simple endpoint for container health monitoring
  app.get("/health", async (req, res) => {
    res.status(200).json({ 
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
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

  return httpServer;
}
