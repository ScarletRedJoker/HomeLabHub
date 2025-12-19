import { Router, Request, Response } from "express";
import { dbStorage as storage } from "../database-storage";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { EmbedBuilder, TextChannel } from "discord.js";

const router = Router();

const externalNotificationSchema = z.object({
  userId: z.string(),
  platform: z.enum(["twitch", "youtube", "kick"]),
  streamUrl: z.string().url(),
  streamTitle: z.string(),
  game: z.string().optional(),
  thumbnailUrl: z.string().url().optional(),
  viewerCount: z.number().optional(),
  streamId: z.string().optional(), // Platform-specific stream ID for deduplication
});

// Validation schemas - Enhanced with YAGPDB-style features
const streamSettingsSchema = z.object({
  notificationChannelId: z.string(),
  customMessage: z.string().nullable().optional(),
  isEnabled: z.boolean().optional(),
  autoDetectEnabled: z.boolean().optional(),
  autoSyncIntervalMinutes: z.number().min(15).max(1440).optional(),
  mentionRole: z.string().nullable().optional(),
  // YAGPDB-style features
  notifyAllMembers: z.boolean().optional(),
  roleRequirements: z.string().nullable().optional(), // JSON array of role IDs
  excludedRoles: z.string().nullable().optional(), // JSON array of role IDs
  gameFilterEnabled: z.boolean().optional(),
  gameFilterRegex: z.string().nullable().optional(),
  streamingRoleEnabled: z.boolean().optional(),
  streamingRoleId: z.string().nullable().optional(),
  cooldownMinutes: z.number().min(0).max(1440).optional(),
});

const trackedUserSchema = z.object({
  userId: z.string(),
  username: z.string().nullable().optional(),
});

// Discord snowflake ID pattern (17-19 digit string)
const SNOWFLAKE_REGEX = /^\d{17,19}$/;

/**
 * Validate that a string is a valid Discord snowflake ID
 */
function isValidSnowflake(id: string): boolean {
  return SNOWFLAKE_REGEX.test(id);
}

/**
 * Validate that a JSON string contains a valid array of Discord snowflake IDs
 * Returns { valid: true } or { valid: false, error: string }
 */
function validateRoleArrayJson(jsonString: string | null | undefined): { valid: true } | { valid: false; error: string } {
  if (!jsonString) return { valid: true };
  
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    return { valid: false, error: 'Invalid JSON format' };
  }
  
  if (!Array.isArray(parsed)) {
    return { valid: false, error: 'Must be a JSON array' };
  }
  
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (typeof item !== 'string') {
      return { valid: false, error: `Item at index ${i} must be a string` };
    }
    if (!isValidSnowflake(item)) {
      return { valid: false, error: `Item at index ${i} is not a valid Discord ID (must be 17-19 digits)` };
    }
  }
  
  return { valid: true };
}

/**
 * Validate that a regex pattern is valid and safe to compile
 */
function validateRegexPattern(pattern: string | null | undefined): { valid: true } | { valid: false; error: string } {
  if (!pattern) return { valid: true };
  
  try {
    new RegExp(pattern, 'i');
    return { valid: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Invalid regex pattern';
    return { valid: false, error: message };
  }
}

// Helper function to check if user has access to server
async function userHasServerAccess(req: Request, serverId: string): Promise<boolean> {
  try {
    const user = req.user as any;
    if (!user) return false;

    let userAdminGuilds: any[] = [];
    
    if (user.adminGuilds) {
      if (Array.isArray(user.adminGuilds)) {
        userAdminGuilds = user.adminGuilds;
      } else if (typeof user.adminGuilds === 'string') {
        try {
          userAdminGuilds = JSON.parse(user.adminGuilds);
        } catch (error) {
          console.error('Failed to parse user admin guilds string:', error);
          return false;
        }
      }
    }
    
    // Check if user is admin in this guild
    const isUserAdmin = userAdminGuilds.some(guild => guild.id === serverId);
    return isUserAdmin;
  } catch (error) {
    console.error('Error checking server access:', error);
    return false;
  }
}

// GET stream notification settings for a server
router.get("/settings/:serverId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;

    // Check access
    const hasAccess = await userHasServerAccess(req, serverId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have permission to access this server" });
    }

    const settings = await storage.getStreamNotificationSettings(serverId);
    
    res.json(settings || {
      serverId,
      notificationChannelId: null,
      customMessage: null,
      isEnabled: false,
      autoDetectEnabled: false,
      autoSyncIntervalMinutes: 60,
      mentionRole: null,
      // YAGPDB-style defaults
      notifyAllMembers: false,
      roleRequirements: null,
      excludedRoles: null,
      gameFilterEnabled: false,
      gameFilterRegex: null,
      streamingRoleEnabled: false,
      streamingRoleId: null,
      cooldownMinutes: 30
    });
  } catch (error) {
    console.error("Failed to get stream notification settings:", error);
    res.status(500).json({ error: "Failed to get stream notification settings" });
  }
});

// POST/UPDATE stream notification settings for a server
router.post("/settings/:serverId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;

    // Check access
    const hasAccess = await userHasServerAccess(req, serverId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have permission to access this server" });
    }

    // Validate request body with Zod schema
    const validatedData = streamSettingsSchema.parse(req.body);

    // Additional YAGPDB-style validation for complex fields
    
    // Validate gameFilterRegex is a valid regex pattern
    const regexValidation = validateRegexPattern(validatedData.gameFilterRegex);
    if (!regexValidation.valid) {
      return res.status(400).json({ 
        error: 'Invalid game filter regex pattern', 
        details: regexValidation.error 
      });
    }

    // Validate roleRequirements is a valid JSON array of snowflake IDs
    const roleReqValidation = validateRoleArrayJson(validatedData.roleRequirements);
    if (!roleReqValidation.valid) {
      return res.status(400).json({ 
        error: 'Invalid roleRequirements format', 
        details: roleReqValidation.error 
      });
    }

    // Validate excludedRoles is a valid JSON array of snowflake IDs
    const excludedRolesValidation = validateRoleArrayJson(validatedData.excludedRoles);
    if (!excludedRolesValidation.valid) {
      return res.status(400).json({ 
        error: 'Invalid excludedRoles format', 
        details: excludedRolesValidation.error 
      });
    }

    // Validate streamingRoleId is a valid snowflake if provided
    if (validatedData.streamingRoleId && !isValidSnowflake(validatedData.streamingRoleId)) {
      return res.status(400).json({ 
        error: 'Invalid streamingRoleId', 
        details: 'Must be a valid Discord ID (17-19 digits)' 
      });
    }

    // Validate mentionRole is a valid snowflake if provided
    if (validatedData.mentionRole && !isValidSnowflake(validatedData.mentionRole)) {
      return res.status(400).json({ 
        error: 'Invalid mentionRole', 
        details: 'Must be a valid Discord ID (17-19 digits)' 
      });
    }

    // Check if settings exist
    const existingSettings = await storage.getStreamNotificationSettings(serverId);

    let result;
    if (existingSettings) {
      // Update existing settings
      result = await storage.updateStreamNotificationSettings(serverId, validatedData);
    } else {
      // Create new settings
      result = await storage.createStreamNotificationSettings({
        serverId,
        ...validatedData,
        isEnabled: validatedData.isEnabled ?? true,
      });
    }

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    console.error("Failed to save stream notification settings:", error);
    res.status(500).json({ error: "Failed to save stream notification settings" });
  }
});

// GET tracked users for a server
router.get("/tracked-users/:serverId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;

    // Check access
    const hasAccess = await userHasServerAccess(req, serverId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have permission to access this server" });
    }

    const trackedUsers = await storage.getStreamTrackedUsers(serverId);
    res.json(trackedUsers);
  } catch (error) {
    console.error("Failed to get tracked users:", error);
    res.status(500).json({ error: "Failed to get tracked users" });
  }
});

// POST add a tracked user
router.post("/tracked-users/:serverId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;

    // Check access
    const hasAccess = await userHasServerAccess(req, serverId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have permission to access this server" });
    }

    // Validate request body
    const validatedData = trackedUserSchema.parse(req.body);

    // Check if user is already tracked
    const existingUsers = await storage.getStreamTrackedUsers(serverId);
    const alreadyTracked = existingUsers.some(u => u.userId === validatedData.userId);

    if (alreadyTracked) {
      return res.status(409).json({ error: "User is already being tracked" });
    }

    const result = await storage.addStreamTrackedUser({
      serverId,
      ...validatedData,
    });

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    console.error("Failed to add tracked user:", error);
    res.status(500).json({ error: "Failed to add tracked user" });
  }
});

// DELETE remove a tracked user
router.delete("/tracked-users/:serverId/:userId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId, userId } = req.params;

    // Check access
    const hasAccess = await userHasServerAccess(req, serverId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have permission to access this server" });
    }

    const removed = await storage.removeStreamTrackedUser(serverId, userId);

    if (!removed) {
      return res.status(404).json({ error: "User not found in tracked list" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to remove tracked user:", error);
    res.status(500).json({ error: "Failed to remove tracked user" });
  }
});

// POST trigger manual auto-detection scan
router.post("/scan/:serverId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;

    // Check access
    const hasAccess = await userHasServerAccess(req, serverId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have permission to access this server" });
    }

    // Check if auto-detection is enabled
    const settings = await storage.getStreamNotificationSettings(serverId);
    if (!settings || !settings.autoDetectEnabled) {
      return res.status(400).json({ error: "Auto-detection is not enabled for this server" });
    }

    // Import and trigger manual scan
    const { getDiscordClient } = await import("../discord/bot");
    const { triggerManualScan } = await import("../discord/stream-auto-detection");
    
    const client = getDiscordClient();
    if (!client) {
      return res.status(503).json({ error: "Discord bot is not connected" });
    }

    const guild = client.guilds.cache.get(serverId);
    if (!guild) {
      return res.status(404).json({ error: "Server not found or bot is not a member" });
    }

    const result = await triggerManualScan(guild, storage);
    res.json(result);
  } catch (error) {
    console.error("Failed to trigger manual scan:", error);
    res.status(500).json({ error: "Failed to trigger manual scan" });
  }
});

function getPlatformColor(platform: string): number {
  switch (platform.toLowerCase()) {
    case 'twitch':
      return 0x9146FF;
    case 'youtube':
      return 0xFF0000;
    case 'kick':
      return 0x53FC18;
    default:
      return 0x9146FF;
  }
}

router.post("/external", async (req: Request, res: Response) => {
  try {
    const webhookSecret = req.headers['x-stream-bot-secret'] as string;
    const expectedSecret = process.env.STREAM_BOT_WEBHOOK_SECRET;
    
    if (!expectedSecret) {
      console.error("[External Stream Notification] STREAM_BOT_WEBHOOK_SECRET not configured");
      return res.status(500).json({ error: "Webhook secret not configured" });
    }
    
    if (!webhookSecret || webhookSecret !== expectedSecret) {
      console.warn("[External Stream Notification] Invalid or missing webhook secret");
      return res.status(401).json({ error: "Invalid or missing webhook secret" });
    }

    const validatedData = externalNotificationSchema.parse(req.body);
    const { userId, platform, streamUrl, streamTitle, game, thumbnailUrl, viewerCount, streamId } = validatedData;
    
    // Generate a streamId if not provided (fallback to URL hash for uniqueness)
    const effectiveStreamId = streamId || `webhook_${platform}_${Date.now()}`;

    console.log(`[External Stream Notification] Received go-live notification for user ${userId} on ${platform} (streamId: ${effectiveStreamId})`);

    const serversTracking = await storage.getServersTrackingUser(userId);
    
    if (serversTracking.length === 0) {
      console.log(`[External Stream Notification] No servers tracking user ${userId}`);
      return res.json({ success: true, notificationsSent: 0, message: "No servers tracking this user" });
    }

    const { getDiscordClient } = await import("../discord/bot");
    const client = getDiscordClient();
    
    if (!client || !client.isReady()) {
      console.error("[External Stream Notification] Discord bot is not ready");
      return res.status(503).json({ error: "Discord bot is not connected" });
    }

    let notificationsSent = 0;
    const errors: string[] = [];

    for (const { serverId, settings } of serversTracking) {
      try {
        // Check if notification was already sent for this stream (deduplication)
        const alreadyNotified = await storage.checkNotificationExists(serverId, userId, effectiveStreamId);
        if (alreadyNotified) {
          console.log(`[External Stream Notification] Already notified for streamId ${effectiveStreamId} in server ${serverId}`);
          continue;
        }
        
        const guild = client.guilds.cache.get(serverId);
        if (!guild) {
          errors.push(`Server ${serverId}: Bot not in server`);
          continue;
        }

        const channel = await guild.channels.fetch(settings.notificationChannelId!);
        if (!channel || !(channel instanceof TextChannel)) {
          errors.push(`Server ${serverId}: Channel not found or not a text channel`);
          continue;
        }

        let member;
        try {
          member = await guild.members.fetch(userId);
        } catch (e) {
          errors.push(`Server ${serverId}: User not found in server`);
          continue;
        }

        const embed = new EmbedBuilder()
          .setColor(getPlatformColor(platform))
          .setTitle(`🔴 ${member.displayName} is now LIVE!`)
          .setURL(streamUrl)
          .setTimestamp()
          .setFooter({ text: `${platform.charAt(0).toUpperCase() + platform.slice(1)} Stream Notification` });

        if (streamTitle) {
          embed.setDescription(`**${streamTitle}**`);
        }

        embed.setThumbnail(member.user.displayAvatarURL({ size: 256 }));

        if (thumbnailUrl) {
          embed.setImage(thumbnailUrl);
        }

        if (game) {
          embed.addFields({
            name: '🎮 Game/Category',
            value: game,
            inline: true
          });
        }

        if (viewerCount !== undefined && viewerCount > 0) {
          embed.addFields({
            name: '👀 Viewers',
            value: viewerCount.toLocaleString(),
            inline: true
          });
        }

        embed.addFields({
          name: '📺 Platform',
          value: platform.charAt(0).toUpperCase() + platform.slice(1),
          inline: true
        });

        let messageTemplate = settings.customMessage || `{user} just went live!`;
        const content = messageTemplate
          .replace(/{user}/g, member.toString())
          .replace(/{game}/g, game || 'Unknown Game')
          .replace(/{platform}/g, platform.charAt(0).toUpperCase() + platform.slice(1));

        const message = await channel.send({
          content,
          embeds: [embed]
        });

        // Log notification with new schema for deduplication
        await storage.createStreamNotificationLog({
          serverId,
          discordUserId: userId,
          platform,
          streamId: effectiveStreamId,
          source: 'webhook'
        });

        notificationsSent++;
        console.log(`[External Stream Notification] ✓ Sent notification to ${guild.name} (streamId: ${effectiveStreamId})`);
      } catch (serverError) {
        console.error(`[External Stream Notification] Error sending to server ${serverId}:`, serverError);
        errors.push(`Server ${serverId}: ${serverError instanceof Error ? serverError.message : 'Unknown error'}`);
      }
    }

    console.log(`[External Stream Notification] Completed: ${notificationsSent}/${serversTracking.length} notifications sent`);

    res.json({
      success: true,
      notificationsSent,
      totalServers: serversTracking.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    console.error("[External Stream Notification] Failed to process notification:", error);
    res.status(500).json({ error: "Failed to process stream notification" });
  }
});

export default router;
