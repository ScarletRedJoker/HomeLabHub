import { Router, Request, Response } from "express";
import { dbStorage } from "../database-storage";
import { isAuthenticated } from "../auth";
import { z } from "zod";

const router = Router();

export interface ModerationPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  features: string[];
  settings: Record<string, any>;
}

const COMMON_PROFANITY_WORDS = [
  "fuck", "shit", "ass", "bitch", "damn", "crap", "bastard", "hell",
  "dick", "cock", "pussy", "slut", "whore", "fag", "retard", "nigger", "cunt"
];

const NSFW_KEYWORDS = [
  "porn", "xxx", "sex", "nude", "naked", "hentai", "nsfw", "onlyfans",
  "pornhub", "xvideos", "redtube", "xhamster", "rule34"
];

const SAFE_DOMAINS_WHITELIST = [
  "discord.com", "discord.gg", "discordapp.com",
  "youtube.com", "youtu.be", "twitch.tv",
  "twitter.com", "x.com", "reddit.com",
  "github.com", "gitlab.com",
  "google.com", "docs.google.com",
  "imgur.com", "giphy.com", "tenor.com",
  "wikipedia.org", "wikimedia.org"
];

const MODERATION_PRESETS: Record<string, ModerationPreset> = {
  "anti-spam": {
    id: "anti-spam",
    name: "Anti-Spam",
    description: "Blocks duplicate messages, rate limits messages, and auto-timeouts repeat offenders",
    icon: "🛡️",
    color: "#3498db",
    features: [
      "Block duplicate messages (3+ times in 30 seconds)",
      "Rate limit: max 5 messages per 10 seconds",
      "Auto-timeout for 5 minutes on violation"
    ],
    settings: {
      autoModEnabled: true,
      spamThreshold: 5,
      spamTimeWindow: 10,
      duplicateMessageThreshold: 3,
      duplicateMessageWindow: 30,
      autoModAction: "mute",
      autoMuteDuration: 300,
    }
  },
  "anti-raid": {
    id: "anti-raid",
    name: "Anti-Raid",
    description: "Protects against raid attacks by monitoring new account joins and enforcing restrictions",
    icon: "🏰",
    color: "#e74c3c",
    features: [
      "Alert when 5+ new accounts join within 1 minute",
      "Block accounts less than 24 hours old from posting links",
      "Auto-enable slowmode (30 seconds) when triggered"
    ],
    settings: {
      autoModEnabled: true,
      raidProtectionEnabled: true,
      raidThreshold: 5,
      raidTimeWindow: 60,
      newAccountAgeHours: 24,
      newAccountLinkBlock: true,
      autoSlowmodeOnRaid: true,
      autoSlowmodeDuration: 30,
    }
  },
  "family-friendly": {
    id: "family-friendly",
    name: "Family-Friendly",
    description: "Filters profanity, NSFW content, caps spam, and excessive emoji usage",
    icon: "👨‍👩‍👧‍👦",
    color: "#2ecc71",
    features: [
      "Block common profanity words",
      "Block NSFW links and keywords",
      "Filter caps spam (80%+ caps messages)",
      "Filter excessive emoji spam (10+ emojis)"
    ],
    settings: {
      autoModEnabled: true,
      bannedWords: JSON.stringify([...COMMON_PROFANITY_WORDS, ...NSFW_KEYWORDS]),
      capsFilterEnabled: true,
      capsFilterThreshold: 80,
      emojiSpamFilterEnabled: true,
      emojiSpamThreshold: 10,
      autoModAction: "delete",
    }
  },
  "strict-moderation": {
    id: "strict-moderation",
    name: "Strict Moderation",
    description: "Maximum protection combining all presets with link whitelisting and auto-timeout",
    icon: "⚔️",
    color: "#9b59b6",
    features: [
      "All spam and raid protections",
      "Family-friendly filters",
      "Link whitelist mode (only approved domains)",
      "Auto-timeout for all violations"
    ],
    settings: {
      autoModEnabled: true,
      spamThreshold: 5,
      spamTimeWindow: 10,
      duplicateMessageThreshold: 3,
      duplicateMessageWindow: 30,
      raidProtectionEnabled: true,
      raidThreshold: 5,
      raidTimeWindow: 60,
      newAccountAgeHours: 24,
      newAccountLinkBlock: true,
      autoSlowmodeOnRaid: true,
      autoSlowmodeDuration: 30,
      bannedWords: JSON.stringify([...COMMON_PROFANITY_WORDS, ...NSFW_KEYWORDS]),
      capsFilterEnabled: true,
      capsFilterThreshold: 80,
      emojiSpamFilterEnabled: true,
      emojiSpamThreshold: 10,
      linkFilterEnabled: true,
      linkWhitelist: JSON.stringify(SAFE_DOMAINS_WHITELIST),
      autoModAction: "mute",
      autoMuteDuration: 300,
    }
  }
};

const applyPresetSchema = z.object({
  presetId: z.enum(["anti-spam", "anti-raid", "family-friendly", "strict-moderation"]),
  replaceExisting: z.boolean().default(false),
});

router.get("/servers/:serverId/moderation/presets", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;

    const settings = await dbStorage.getBotSettings(serverId);
    
    const presets = Object.values(MODERATION_PRESETS).map(preset => {
      const isActive = checkPresetActive(preset.id, settings);
      return {
        ...preset,
        isActive,
      };
    });

    res.json({ 
      presets,
      currentSettings: settings ? {
        autoModEnabled: settings.autoModEnabled,
        spamThreshold: settings.spamThreshold,
        spamTimeWindow: settings.spamTimeWindow,
        autoModAction: settings.autoModAction,
        bannedWords: settings.bannedWords,
        linkFilterEnabled: settings.linkFilterEnabled,
        linkWhitelist: settings.linkWhitelist,
      } : null
    });
  } catch (error) {
    console.error("Error fetching moderation presets:", error);
    res.status(500).json({ error: "Failed to fetch moderation presets" });
  }
});

router.get("/servers/:serverId/moderation/presets/:presetId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { presetId } = req.params;
    
    const preset = MODERATION_PRESETS[presetId];
    if (!preset) {
      return res.status(404).json({ error: "Preset not found" });
    }

    res.json(preset);
  } catch (error) {
    console.error("Error fetching preset details:", error);
    res.status(500).json({ error: "Failed to fetch preset details" });
  }
});

router.post("/servers/:serverId/moderation/presets/apply", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    
    const validation = applyPresetSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const { presetId, replaceExisting } = validation.data;
    const preset = MODERATION_PRESETS[presetId];
    
    if (!preset) {
      return res.status(400).json({ error: "Invalid preset" });
    }

    let settings = await dbStorage.getBotSettings(serverId);
    if (!settings) {
      await dbStorage.createBotSettings({ serverId });
      settings = await dbStorage.getBotSettings(serverId);
    }

    let settingsToApply: Record<string, any> = {};

    if (replaceExisting) {
      settingsToApply = { ...preset.settings };
    } else {
      for (const [key, value] of Object.entries(preset.settings)) {
        if (key === 'bannedWords') {
          const existingWords: string[] = settings?.bannedWords ? JSON.parse(settings.bannedWords) : [];
          const newWords: string[] = JSON.parse(value as string);
          const mergedWords = [...new Set([...existingWords, ...newWords])];
          settingsToApply[key] = JSON.stringify(mergedWords);
        } else if (key === 'linkWhitelist') {
          const existingDomains: string[] = settings?.linkWhitelist ? JSON.parse(settings.linkWhitelist) : [];
          const newDomains: string[] = JSON.parse(value as string);
          const mergedDomains = [...new Set([...existingDomains, ...newDomains])];
          settingsToApply[key] = JSON.stringify(mergedDomains);
        } else {
          settingsToApply[key] = value;
        }
      }
    }

    const appliedPresetsRaw = (settings as any)?.appliedModerationPresets;
    let appliedPresets: string[] = [];
    try {
      appliedPresets = appliedPresetsRaw ? JSON.parse(appliedPresetsRaw) : [];
    } catch {
      appliedPresets = [];
    }
    
    if (!appliedPresets.includes(presetId)) {
      appliedPresets.push(presetId);
    }
    settingsToApply.appliedModerationPresets = JSON.stringify(appliedPresets);

    await dbStorage.updateBotSettings(serverId, settingsToApply);

    const updatedSettings = await dbStorage.getBotSettings(serverId);

    res.json({
      success: true,
      presetId,
      presetName: preset.name,
      appliedPresets,
      settings: updatedSettings,
      message: `Successfully applied "${preset.name}" moderation preset!`,
    });
  } catch (error) {
    console.error("Error applying moderation preset:", error);
    res.status(500).json({ error: "Failed to apply moderation preset" });
  }
});

router.post("/servers/:serverId/moderation/presets/remove", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const { presetId } = req.body;
    
    if (!presetId || !MODERATION_PRESETS[presetId]) {
      return res.status(400).json({ error: "Invalid preset" });
    }

    const settings = await dbStorage.getBotSettings(serverId);
    if (!settings) {
      return res.status(404).json({ error: "Server settings not found" });
    }

    const appliedPresetsRaw = (settings as any)?.appliedModerationPresets;
    let appliedPresets: string[] = [];
    try {
      appliedPresets = appliedPresetsRaw ? JSON.parse(appliedPresetsRaw) : [];
    } catch {
      appliedPresets = [];
    }

    appliedPresets = appliedPresets.filter(p => p !== presetId);

    await dbStorage.updateBotSettings(serverId, {
      appliedModerationPresets: JSON.stringify(appliedPresets),
    });

    res.json({
      success: true,
      presetId,
      appliedPresets,
      message: `Removed "${MODERATION_PRESETS[presetId].name}" from active presets. Note: Settings were not reverted.`,
    });
  } catch (error) {
    console.error("Error removing moderation preset:", error);
    res.status(500).json({ error: "Failed to remove moderation preset" });
  }
});

router.post("/servers/:serverId/moderation/reset", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;

    const defaultSettings = {
      autoModEnabled: false,
      spamThreshold: 5,
      spamTimeWindow: 5,
      autoModAction: "warn",
      bannedWords: null,
      linkFilterEnabled: false,
      linkWhitelist: null,
      appliedModerationPresets: JSON.stringify([]),
    };

    await dbStorage.updateBotSettings(serverId, defaultSettings);

    res.json({
      success: true,
      message: "Moderation settings have been reset to defaults",
    });
  } catch (error) {
    console.error("Error resetting moderation settings:", error);
    res.status(500).json({ error: "Failed to reset moderation settings" });
  }
});

function checkPresetActive(presetId: string, settings: any): boolean {
  if (!settings) return false;

  const appliedPresetsRaw = settings?.appliedModerationPresets;
  if (appliedPresetsRaw) {
    try {
      const appliedPresets = JSON.parse(appliedPresetsRaw);
      return appliedPresets.includes(presetId);
    } catch {
      return false;
    }
  }

  return false;
}

export default router;
