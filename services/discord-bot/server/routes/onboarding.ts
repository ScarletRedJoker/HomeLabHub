import { Router, Request, Response } from "express";
import { dbStorage } from "../database-storage";
import { isAuthenticated } from "../auth";
import { z } from "zod";

const router = Router();

const ONBOARDING_STEPS = ["welcome", "features", "welcome_channel", "moderation", "templates", "complete"] as const;

const completeStepSchema = z.object({
  step: z.enum(ONBOARDING_STEPS),
  stepData: z.string().optional(),
});

const applyTemplateSchema = z.object({
  template: z.enum(["gaming", "creator", "business"]),
});

const updateCurrentStepSchema = z.object({
  currentStep: z.enum(ONBOARDING_STEPS),
});

router.get("/servers/:serverId/onboarding", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    
    const status = await dbStorage.getOrCreateOnboardingStatus(serverId);
    const progress = await dbStorage.getOnboardingProgress(serverId);
    
    const completedSteps = progress.filter(p => p.isCompleted).map(p => p.step);
    
    res.json({
      status,
      progress,
      completedSteps,
      totalSteps: ONBOARDING_STEPS.length,
      isComplete: status.isCompleted || status.isSkipped,
    });
  } catch (error) {
    console.error("Error fetching onboarding status:", error);
    res.status(500).json({ error: "Failed to fetch onboarding status" });
  }
});

type FeatureStatus = 'configured' | 'not_configured' | 'partial';

interface FeatureConfig {
  id: string;
  name: string;
  description: string;
  status: FeatureStatus;
  tab: string;
}

router.get("/servers/:serverId/onboarding-status", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    
    const [
      botSettings,
      ticketCategories,
      streamSettings,
      economySettings,
      automodRules
    ] = await Promise.all([
      dbStorage.getBotSettings(serverId),
      dbStorage.getTicketCategoriesByServerId(serverId),
      dbStorage.getStreamNotificationSettings(serverId),
      dbStorage.getEconomySettings(serverId),
      dbStorage.getAutomodRules(serverId)
    ]);

    const features: FeatureConfig[] = [
      {
        id: 'welcome',
        name: 'Welcome Messages',
        description: 'Greet new members with custom messages',
        status: botSettings?.welcomeEnabled && botSettings?.welcomeChannelId ? 'configured' : 
               botSettings?.welcomeEnabled ? 'partial' : 'not_configured',
        tab: 'welcome-cards'
      },
      {
        id: 'moderation',
        name: 'Auto Moderation',
        description: 'Automatically moderate content and protect your server',
        status: botSettings?.autoModEnabled && automodRules.length > 0 ? 'configured' :
               botSettings?.autoModEnabled || automodRules.length > 0 ? 'partial' : 'not_configured',
        tab: 'settings'
      },
      {
        id: 'leveling',
        name: 'XP & Leveling',
        description: 'Reward active members with experience points',
        status: botSettings?.xpEnabled ? 'configured' : 'not_configured',
        tab: 'settings'
      },
      {
        id: 'streams',
        name: 'Stream Notifications',
        description: 'Alert members when streamers go live',
        status: streamSettings?.enabled && streamSettings?.notificationChannelId ? 'configured' :
               streamSettings?.enabled ? 'partial' : 'not_configured',
        tab: 'streams'
      },
      {
        id: 'tickets',
        name: 'Ticket System',
        description: 'Manage support tickets with custom categories',
        status: ticketCategories.length > 0 ? 'configured' : 'not_configured',
        tab: 'panels'
      },
      {
        id: 'economy',
        name: 'Economy System',
        description: 'Virtual currency and shop for your server',
        status: economySettings?.enabled ? 'configured' : 'not_configured',
        tab: 'economy'
      },
      {
        id: 'starboard',
        name: 'Starboard',
        description: 'Highlight the best messages from your community',
        status: botSettings?.starboardEnabled && botSettings?.starboardChannelId ? 'configured' :
               botSettings?.starboardEnabled ? 'partial' : 'not_configured',
        tab: 'settings'
      }
    ];

    const configuredCount = features.filter(f => f.status === 'configured').length;
    const partialCount = features.filter(f => f.status === 'partial').length;
    const totalFeatures = features.length;
    const completionPercentage = Math.round(((configuredCount + (partialCount * 0.5)) / totalFeatures) * 100);

    res.json({
      features,
      summary: {
        configured: configuredCount,
        partial: partialCount,
        notConfigured: features.filter(f => f.status === 'not_configured').length,
        total: totalFeatures,
        completionPercentage
      }
    });
  } catch (error) {
    console.error("Error fetching onboarding status:", error);
    res.status(500).json({ error: "Failed to fetch onboarding status" });
  }
});

router.post("/servers/:serverId/onboarding/complete-step", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    
    const validation = completeStepSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const { step, stepData } = validation.data;
    
    const completedStep = await dbStorage.markStepComplete(serverId, step, stepData);
    
    const stepIndex = ONBOARDING_STEPS.indexOf(step);
    if (stepIndex < ONBOARDING_STEPS.length - 1) {
      const nextStep = ONBOARDING_STEPS[stepIndex + 1];
      await dbStorage.updateOnboardingStatus(serverId, { currentStep: nextStep });
    }
    
    if (step === "complete") {
      await dbStorage.completeOnboarding(serverId);
    }
    
    res.json({ 
      success: true, 
      completedStep,
      nextStep: stepIndex < ONBOARDING_STEPS.length - 1 ? ONBOARDING_STEPS[stepIndex + 1] : null
    });
  } catch (error) {
    console.error("Error completing onboarding step:", error);
    res.status(500).json({ error: "Failed to complete onboarding step" });
  }
});

router.post("/servers/:serverId/onboarding/update-step", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    
    const validation = updateCurrentStepSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const { currentStep } = validation.data;
    
    await dbStorage.updateOnboardingStatus(serverId, { currentStep });
    
    res.json({ success: true, currentStep });
  } catch (error) {
    console.error("Error updating current step:", error);
    res.status(500).json({ error: "Failed to update current step" });
  }
});

router.post("/servers/:serverId/onboarding/skip", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    
    const status = await dbStorage.skipOnboarding(serverId);
    
    res.json({ success: true, status });
  } catch (error) {
    console.error("Error skipping onboarding:", error);
    res.status(500).json({ error: "Failed to skip onboarding" });
  }
});

router.post("/servers/:serverId/onboarding/apply-template", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    
    const validation = applyTemplateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const { template } = validation.data;
    
    const settings = await dbStorage.getBotSettings(serverId);
    if (!settings) {
      await dbStorage.createBotSettings({ serverId });
    }
    
    const templateConfigs: Record<string, Partial<typeof settings>> = {
      gaming: {
        xpEnabled: true,
        welcomeEnabled: true,
        starboardEnabled: true,
        autoModEnabled: true,
        welcomeMessageTemplate: "🎮 Welcome to the gaming community, {user}! Check out #rules and #roles to get started. You're player #{memberCount}!",
        levelUpMessage: "🎮 Level Up! {user} has reached level {level}! Keep gaming! 🕹️",
      },
      creator: {
        welcomeEnabled: true,
        starboardEnabled: true,
        boostTrackingEnabled: true,
        welcomeMessageTemplate: "🎬 Welcome {user}! Thanks for joining our creative community. Check out our latest content and don't forget to share your own! Member #{memberCount}",
        boostThankMessage: "💜 Huge thanks to {user} for boosting! You're helping us grow! 🚀",
      },
      business: {
        welcomeEnabled: true,
        autoModEnabled: true,
        inviteTrackingEnabled: true,
        welcomeMessageTemplate: "Welcome to our professional community, {user}. Please review our guidelines and introduce yourself. Member #{memberCount}.",
        autoModAction: "warn",
        spamThreshold: 3,
      },
    };
    
    const config = templateConfigs[template];
    if (config) {
      await dbStorage.updateBotSettings(serverId, config);
    }
    
    await dbStorage.markStepComplete(serverId, "templates", JSON.stringify({ template }));
    const status = await dbStorage.completeOnboarding(serverId, template);
    
    res.json({ success: true, template, status });
  } catch (error) {
    console.error("Error applying template:", error);
    res.status(500).json({ error: "Failed to apply template" });
  }
});

router.post("/servers/:serverId/onboarding/complete", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    
    const status = await dbStorage.completeOnboarding(serverId);
    
    res.json({ success: true, status });
  } catch (error) {
    console.error("Error completing onboarding:", error);
    res.status(500).json({ error: "Failed to complete onboarding" });
  }
});

router.post("/servers/:serverId/onboarding/reset", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    
    await dbStorage.updateOnboardingStatus(serverId, {
      isSkipped: false,
      isCompleted: false,
      currentStep: "welcome",
      appliedTemplate: null,
      completedAt: null,
      skippedAt: null,
    });
    
    res.json({ success: true, message: "Onboarding reset" });
  } catch (error) {
    console.error("Error resetting onboarding:", error);
    res.status(500).json({ error: "Failed to reset onboarding" });
  }
});

export default router;
