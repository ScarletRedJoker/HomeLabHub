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
} from "@shared/schema";
import { getAvailableVariables } from "./command-variables";
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

  return httpServer;
}
