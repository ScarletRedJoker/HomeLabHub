import { Router, Request, Response } from "express";
import { getDiscordClient } from "../discord/bot";
import { ChannelType, PermissionFlagsBits, TextChannel } from "discord.js";
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

// Available channels endpoint - lists channels the bot can create webhooks in
router.get("/available-channels", validateHomelabhub, async (req: Request, res: Response) => {
  try {
    const client = getDiscordClient();
    if (!client) {
      return res.status(503).json({ 
        error: "Discord bot not initialized",
        status: "offline" 
      });
    }

    if (!client.isReady()) {
      return res.status(503).json({ 
        error: "Discord bot not ready",
        status: "starting" 
      });
    }

    const availableChannels: Array<{
      id: string;
      name: string;
      type: string;
      guild: { id: string; name: string };
      canCreateWebhook: boolean;
    }> = [];

    for (const [guildId, guild] of client.guilds.cache) {
      for (const [channelId, channel] of guild.channels.cache) {
        if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) {
          const textChannel = channel as TextChannel;
          const botMember = guild.members.me;
          const canManageWebhooks = botMember?.permissionsIn(textChannel).has(PermissionFlagsBits.ManageWebhooks) ?? false;
          
          availableChannels.push({
            id: channel.id,
            name: channel.name,
            type: channel.type === ChannelType.GuildText ? 'text' : 'announcement',
            guild: {
              id: guild.id,
              name: guild.name
            },
            canCreateWebhook: canManageWebhooks
          });
        }
      }
    }

    res.json({
      success: true,
      channels: availableChannels,
      total: availableChannels.length,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("[Homelabhub] Failed to list available channels:", error);
    res.status(500).json({ 
      error: "Failed to list channels",
      message: error.message 
    });
  }
});

// Provision webhook endpoint - creates a webhook in the specified channel
router.post("/provision-webhook", validateHomelabhub, async (req: Request, res: Response) => {
  try {
    const client = getDiscordClient();
    if (!client) {
      return res.status(503).json({ 
        error: "Discord bot not initialized",
        status: "offline" 
      });
    }

    if (!client.isReady()) {
      return res.status(503).json({ 
        error: "Discord bot not ready",
        status: "starting" 
      });
    }

    const { channelId, guildId, channelName, name } = req.body;
    const webhookName = name || 'Homelab Alerts';

    if (!channelId && (!guildId || !channelName)) {
      return res.status(400).json({ 
        error: "Invalid request",
        message: "Either 'channelId' or both 'guildId' and 'channelName' are required"
      });
    }

    let targetChannel: TextChannel | null = null;

    if (channelId) {
      const channel = client.channels.cache.get(channelId);
      if (!channel) {
        return res.status(404).json({ 
          error: "Channel not found",
          message: `No channel found with ID: ${channelId}`
        });
      }
      
      if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
        return res.status(400).json({ 
          error: "Invalid channel type",
          message: "Webhooks can only be created in text or announcement channels"
        });
      }
      
      targetChannel = channel as TextChannel;
    } else if (guildId && channelName) {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        return res.status(404).json({ 
          error: "Guild not found",
          message: `No guild found with ID: ${guildId}`
        });
      }
      
      const channel = guild.channels.cache.find(
        ch => ch.name.toLowerCase() === channelName.toLowerCase() && 
             (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement)
      );
      
      if (!channel) {
        return res.status(404).json({ 
          error: "Channel not found",
          message: `No text channel found with name '${channelName}' in guild '${guild.name}'`
        });
      }
      
      targetChannel = channel as TextChannel;
    }

    if (!targetChannel) {
      return res.status(404).json({ 
        error: "Channel not found",
        message: "Unable to locate the specified channel"
      });
    }

    const guild = targetChannel.guild;
    const botMember = guild.members.me;
    
    if (!botMember?.permissionsIn(targetChannel).has(PermissionFlagsBits.ManageWebhooks)) {
      return res.status(403).json({ 
        error: "Missing permissions",
        message: `Bot lacks 'Manage Webhooks' permission in channel #${targetChannel.name}`
      });
    }

    console.log(`[Homelabhub] Creating webhook '${webhookName}' in channel #${targetChannel.name} (${targetChannel.id})`);
    
    const webhook = await targetChannel.createWebhook({
      name: webhookName,
      reason: 'Provisioned by Homelabhub dashboard for system notifications'
    });

    console.log(`[Homelabhub] ✅ Webhook created successfully: ${webhook.id}`);

    res.json({
      success: true,
      webhookUrl: webhook.url,
      webhookId: webhook.id,
      channel: {
        id: targetChannel.id,
        name: targetChannel.name
      },
      guild: {
        id: guild.id,
        name: guild.name
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("[Homelabhub] Failed to provision webhook:", error);
    
    if (error.code === 50013) {
      return res.status(403).json({ 
        error: "Missing permissions",
        message: "Bot lacks required permissions to create webhooks in this channel"
      });
    }
    
    if (error.code === 30007) {
      return res.status(429).json({ 
        error: "Webhook limit reached",
        message: "This channel has reached the maximum number of webhooks (10)"
      });
    }
    
    res.status(500).json({ 
      error: "Failed to create webhook",
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
