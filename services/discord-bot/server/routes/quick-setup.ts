import { Router, Request, Response } from "express";
import { dbStorage } from "../database-storage";
import { isAuthenticated } from "../auth";
import { z } from "zod";

const router = Router();

const quickSetupSchema = z.object({
  template: z.enum(["gaming", "creator", "community"]),
  channels: z.object({
    welcomeChannelId: z.string().optional(),
    logChannelId: z.string().optional(),
    generalChannelId: z.string().optional(),
    starboardChannelId: z.string().optional(),
  }),
});

interface TemplateConfig {
  name: string;
  description: string;
  settings: Record<string, any>;
  levelRewards?: { level: number; roleId?: string; message: string }[];
  ticketCategories?: { name: string; description: string }[];
}

const TEMPLATE_CONFIGS: Record<string, TemplateConfig> = {
  gaming: {
    name: "Gaming Community",
    description: "XP & leveling, economy, anti-spam, and starboard for gamers",
    settings: {
      xpEnabled: true,
      xpMultiplier: 1.0,
      xpCooldown: 60,
      xpMin: 15,
      xpMax: 25,
      levelUpMessage: "🎮 **Level Up!** {user} has reached level {level}! Keep gaming! 🕹️",
      levelUpAnnouncementEnabled: true,
      economyEnabled: true,
      dailyCoins: 100,
      currencyName: "coins",
      currencySymbol: "🪙",
      autoModEnabled: true,
      antiSpamEnabled: true,
      spamThreshold: 5,
      spamTimeWindow: 5,
      autoModAction: "warn",
      starboardEnabled: true,
      starboardThreshold: 5,
      starboardEmoji: "⭐",
      welcomeEnabled: true,
      welcomeMessageTemplate: "🎮 Welcome to the gaming hub, {user}! Check out the rules and pick your roles. You're gamer #{memberCount}!",
      goodbyeEnabled: true,
      goodbyeMessageTemplate: "👋 {user} has left the arena. GG!",
    },
    levelRewards: [
      { level: 5, message: "🏆 Reached Level 5! Novice Gamer unlocked!" },
      { level: 10, message: "🏆 Reached Level 10! Rising Star unlocked!" },
      { level: 25, message: "🏆 Reached Level 25! Pro Gamer unlocked!" },
      { level: 50, message: "🏆 Reached Level 50! Legend unlocked!" },
    ],
  },
  creator: {
    name: "Content Creator",
    description: "Stream notifications, tickets, basic automod, and welcome messages",
    settings: {
      welcomeEnabled: true,
      welcomeMessageTemplate: "🎬 Hey {user}! Welcome to the community! 🌟 Check out our latest content and don't forget to hit the notification bell! Member #{memberCount}",
      goodbyeEnabled: false,
      autoModEnabled: true,
      antiSpamEnabled: true,
      spamThreshold: 4,
      linkFilterEnabled: true,
      linkFilterWhitelist: "youtube.com,twitch.tv,twitter.com,instagram.com",
      autoModAction: "delete",
      starboardEnabled: false,
      xpEnabled: false,
      economyEnabled: false,
    },
    ticketCategories: [
      { name: "Support", description: "Get help with any issues" },
      { name: "Collab Requests", description: "Submit collaboration proposals" },
      { name: "Business", description: "Business and sponsorship inquiries" },
    ],
  },
  community: {
    name: "General Community",
    description: "Welcome messages, basic leveling, starboard, and moderation",
    settings: {
      welcomeEnabled: true,
      welcomeMessageTemplate: "👋 Welcome to our community, {user}! We're happy to have you here. You're member #{memberCount}!",
      goodbyeEnabled: true,
      goodbyeMessageTemplate: "👋 {user} has left the server. We'll miss you!",
      xpEnabled: true,
      xpMultiplier: 1.0,
      xpCooldown: 60,
      xpMin: 10,
      xpMax: 20,
      levelUpMessage: "🎉 Congrats {user}! You've reached level {level}!",
      levelUpAnnouncementEnabled: true,
      starboardEnabled: true,
      starboardThreshold: 3,
      starboardEmoji: "⭐",
      autoModEnabled: true,
      antiSpamEnabled: true,
      spamThreshold: 5,
      badWordsFilterEnabled: true,
      autoModAction: "warn",
      economyEnabled: false,
    },
  },
};

router.get("/servers/:serverId/quick-setup/templates", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const templates = Object.entries(TEMPLATE_CONFIGS).map(([id, config]) => ({
      id,
      name: config.name,
      description: config.description,
      features: Object.entries(config.settings)
        .filter(([key, value]) => key.endsWith("Enabled") && value === true)
        .map(([key]) => key.replace("Enabled", ""))
        .slice(0, 5),
    }));

    res.json({ templates });
  } catch (error) {
    console.error("Error fetching quick setup templates:", error);
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

router.get("/servers/:serverId/quick-setup/preview/:template", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { template } = req.params;
    
    const config = TEMPLATE_CONFIGS[template];
    if (!config) {
      return res.status(400).json({ error: "Invalid template" });
    }

    const preview = {
      template,
      name: config.name,
      description: config.description,
      settings: config.settings,
      levelRewards: config.levelRewards || [],
      ticketCategories: config.ticketCategories || [],
    };

    res.json(preview);
  } catch (error) {
    console.error("Error fetching template preview:", error);
    res.status(500).json({ error: "Failed to fetch template preview" });
  }
});

router.post("/servers/:serverId/quick-setup", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    
    const validation = quickSetupSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const { template, channels } = validation.data;
    const config = TEMPLATE_CONFIGS[template];
    
    if (!config) {
      return res.status(400).json({ error: "Invalid template" });
    }

    let settings = await dbStorage.getBotSettings(serverId);
    if (!settings) {
      await dbStorage.createBotSettings({ serverId });
      settings = await dbStorage.getBotSettings(serverId);
    }

    const settingsToApply = {
      ...config.settings,
      ...(channels.welcomeChannelId && { welcomeChannelId: channels.welcomeChannelId }),
      ...(channels.logChannelId && { loggingChannelId: channels.logChannelId }),
      ...(channels.generalChannelId && { generalChannelId: channels.generalChannelId }),
      ...(channels.starboardChannelId && { starboardChannelId: channels.starboardChannelId }),
    };

    await dbStorage.updateBotSettings(serverId, settingsToApply);

    if (config.levelRewards && config.levelRewards.length > 0) {
      for (const reward of config.levelRewards) {
        try {
          await dbStorage.createLevelReward({
            serverId,
            level: reward.level,
            roleId: reward.roleId || null,
            message: reward.message,
          });
        } catch (err) {
          console.log(`Level reward for level ${reward.level} may already exist, skipping`);
        }
      }
    }

    if (config.ticketCategories && config.ticketCategories.length > 0) {
      for (const category of config.ticketCategories) {
        try {
          await dbStorage.createTicketCategory({
            serverId,
            name: category.name,
            description: category.description,
          });
        } catch (err) {
          console.log(`Ticket category ${category.name} may already exist, skipping`);
        }
      }
    }

    try {
      await dbStorage.completeOnboarding(serverId, template);
    } catch (err) {
      console.log("Onboarding completion optional, continuing");
    }

    const updatedSettings = await dbStorage.getBotSettings(serverId);

    res.json({
      success: true,
      template,
      templateName: config.name,
      settings: updatedSettings,
      message: `Successfully applied ${config.name} template!`,
    });
  } catch (error) {
    console.error("Error applying quick setup:", error);
    res.status(500).json({ error: "Failed to apply quick setup" });
  }
});

export default router;
