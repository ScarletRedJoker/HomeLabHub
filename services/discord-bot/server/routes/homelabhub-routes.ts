import { Router, Request, Response } from "express";
import { getDiscordClient } from "../discord/bot";
import os from "os";

const router = Router();

// Middleware to validate homelabhub requests with API key authentication
const validateHomelabhub = (req: Request, res: Response, next: Function) => {
  // SECURITY: Require API key for all homelabhub endpoints
  const apiKey = req.headers['x-homelabhub-key'];
  const expectedKey = process.env.HOMELABHUB_API_KEY;
  
  // If no API key is configured, allow requests (backwards compatibility)
  // For production, ALWAYS set HOMELABHUB_API_KEY in .env
  if (!expectedKey) {
    console.warn('[Homelabhub] WARNING: HOMELABHUB_API_KEY not set - endpoints are unprotected!');
    return next();
  }
  
  if (!apiKey || apiKey !== expectedKey) {
    console.error('[Homelabhub] Unauthorized access attempt to homelabhub API');
    return res.status(401).json({ error: "Unauthorized - valid API key required" });
  }
  
  next();
};

// Metrics endpoint - provides current bot statistics
router.get("/metrics", validateHomelabhub, async (req: Request, res: Response) => {
  try {
    const client = getDiscordClient();
    if (!client) {
      return res.status(503).json({ 
        error: "Discord bot not initialized",
        status: "offline" 
      });
    }

    const uptime = process.uptime();
    const memUsage = process.memoryUsage();
    
    const metrics = {
      service: "discord-ticket-bot",
      status: client.isReady() ? "online" : "offline",
      uptime: {
        seconds: Math.floor(uptime),
        formatted: formatUptime(uptime)
      },
      discord: {
        ready: client.isReady(),
        ping: client.ws.ping,
        guilds: client.guilds.cache.size,
        users: client.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount ?? 0), 0) || 0,
        channels: client.channels.cache.size
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        memory: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          rss: Math.round(memUsage.rss / 1024 / 1024),
          unit: "MB"
        },
        cpu: {
          model: os.cpus()[0]?.model || "Unknown",
          cores: os.cpus().length,
          usage: process.cpuUsage()
        }
      },
      endpoints: {
        web: process.env.PUBLIC_DOMAIN || "http://localhost:5000",
        health: "/health",
        metrics: "/api/homelabhub/metrics",
        control: "/api/homelabhub/control"
      },
      timestamp: new Date().toISOString()
    };

    res.json(metrics);
  } catch (error: any) {
    console.error("Failed to get homelabhub metrics:", error);
    res.status(500).json({ 
      error: "Failed to retrieve metrics",
      message: error.message 
    });
  }
});

// Control endpoint - allows homelabhub to restart/control the bot
router.post("/control", validateHomelabhub, async (req: Request, res: Response) => {
  const { action } = req.body;

  try {
    const client = getDiscordClient();
    if (!client) {
      return res.status(503).json({ 
        error: "Discord bot not initialized",
        status: "offline" 
      });
    }

    switch (action) {
      case "status":
        return res.json({
          status: client.isReady() ? "online" : "offline",
          ready: client.isReady(),
          uptime: process.uptime()
        });

      case "restart":
        // Note: In Docker, this will cause the container to restart if restart policy is set
        res.json({ 
          message: "Bot restart initiated",
          action: "restart",
          status: "processing"
        });
        
        setTimeout(() => {
          console.log("[Homelabhub] Restart requested, exiting process...");
          process.exit(0);
        }, 1000);
        break;

      case "refresh-cache":
        // Refresh bot caches
        console.log("[Homelabhub] Cache refresh requested");
        // Add your cache refresh logic here
        res.json({ 
          message: "Cache refresh initiated",
          action: "refresh-cache",
          status: "completed"
        });
        break;

      case "health-check":
        const isHealthy = client.isReady() && client.ws.ping < 500;
        res.json({
          healthy: isHealthy,
          checks: {
            botReady: client.isReady(),
            websocketPing: client.ws.ping,
            guildsConnected: client.guilds.cache.size > 0
          }
        });
        break;

      default:
        return res.status(400).json({ 
          error: "Invalid action",
          validActions: ["status", "restart", "refresh-cache", "health-check"]
        });
    }
  } catch (error: any) {
    console.error("Failed to execute homelabhub control action:", error);
    res.status(500).json({ 
      error: "Failed to execute action",
      message: error.message 
    });
  }
});

// Simplified status endpoint for quick checks
router.get("/status", validateHomelabhub, (req: Request, res: Response) => {
  try {
    const client = getDiscordClient();
    if (!client) {
      return res.status(503).json({ 
        status: "offline",
        error: "Discord bot not initialized" 
      });
    }

    res.json({
      status: client.isReady() ? "online" : "offline",
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({ 
      status: "error",
      message: error.message 
    });
  }
});

// Helper function to format uptime
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(" ");
}

export default router;
