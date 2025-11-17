import type { UserStorage } from "./user-storage";
import type { AlertSettings, Milestone } from "@shared/schema";

export interface AlertTriggerData {
  username?: string;
  tier?: string;
  months?: number;
  viewers?: number;
  message?: string;
  count?: number;
  raider?: string;
}

export interface MilestoneProgress {
  milestoneType: "followers" | "subscribers";
  currentCount: number;
  nextMilestone: number | null;
  progress: number;
  achieved: Milestone[];
  upcoming: number[];
}

export class AlertsService {
  constructor(private storage: UserStorage) {}

  async triggerFollowerAlert(
    username: string,
    platform: "twitch" | "youtube" | "kick"
  ): Promise<{ success: boolean; message: string | null; shouldPost: boolean }> {
    return this.triggerAlert(this.storage['userId'], "follower", platform, { username });
  }

  async triggerSubAlert(
    username: string,
    tier: string,
    platform: "twitch" | "youtube" | "kick",
    months?: number
  ): Promise<{ success: boolean; message: string | null; shouldPost: boolean }> {
    return this.triggerAlert(this.storage['userId'], "subscriber", platform, { username, tier, months });
  }

  async triggerRaidAlert(
    raiderName: string,
    viewerCount: number,
    platform: "twitch" | "youtube" | "kick"
  ): Promise<{ success: boolean; message: string | null; shouldPost: boolean }> {
    return this.triggerAlert(this.storage['userId'], "raid", platform, { raider: raiderName, viewers: viewerCount });
  }

  async checkMilestone(
    milestoneType: "followers" | "subscribers",
    currentCount: number,
    platform: "twitch" | "youtube" | "kick"
  ): Promise<{ milestone: number; message: string } | null> {
    return this.trackMilestone(this.storage['userId'], milestoneType, currentCount, platform);
  }

  async triggerAlert(
    userId: string,
    alertType: "follower" | "subscriber" | "raid" | "milestone",
    platform: "twitch" | "youtube" | "kick",
    data: AlertTriggerData
  ): Promise<{ success: boolean; message: string | null; shouldPost: boolean }> {
    try {
      // Get alert settings
      const settings = await this.storage.getAlertSettings();
      
      if (!settings) {
        return { success: false, message: null, shouldPost: false };
      }

      // Check if this alert type is enabled
      const isEnabled = this.isAlertTypeEnabled(settings, alertType);
      if (!isEnabled) {
        return { success: false, message: null, shouldPost: false };
      }

      // Get template for this alert type
      const template = this.getTemplate(settings, alertType);
      
      // Format the message
      const message = this.formatMessage(template, data);

      // Save to alert history
      await this.storage.createAlertHistory({
        userId,
        alertType,
        username: data.username,
        message,
        platform,
        metadata: data,
      });

      return { success: true, message, shouldPost: true };
    } catch (error) {
      console.error(`[AlertsService] Error triggering ${alertType} alert:`, error);
      return { success: false, message: null, shouldPost: false };
    }
  }

  formatMessage(template: string, variables: AlertTriggerData): string {
    let message = template;

    // Replace all template variables
    if (variables.username) {
      message = message.replace(/{username}/g, variables.username);
      message = message.replace(/{user}/g, variables.username);
    }
    if (variables.tier) {
      message = message.replace(/{tier}/g, variables.tier);
    }
    if (variables.months !== undefined) {
      message = message.replace(/{months}/g, variables.months.toString());
    }
    if (variables.viewers !== undefined) {
      message = message.replace(/{viewers}/g, variables.viewers.toString());
    }
    if (variables.raider) {
      message = message.replace(/{raider}/g, variables.raider);
    }
    if (variables.message) {
      message = message.replace(/{message}/g, variables.message);
    }
    if (variables.count !== undefined) {
      message = message.replace(/{count}/g, variables.count.toString());
    }

    return message;
  }

  async trackMilestone(
    userId: string,
    milestoneType: "followers" | "subscribers",
    currentCount: number,
    platform: "twitch" | "youtube" | "kick"
  ): Promise<{ milestone: number; message: string } | null> {
    try {
      const settings = await this.storage.getAlertSettings();
      
      if (!settings || !settings.enableMilestoneAlerts) {
        return null;
      }

      const thresholds = settings.milestoneThresholds || [];
      
      // Find the milestone that was just achieved
      const achievedMilestone = thresholds.find(threshold => {
        return currentCount >= threshold && currentCount < threshold + 5;
      });

      if (!achievedMilestone) {
        return null;
      }

      // Check if this milestone was already achieved
      const existing = await this.storage.getMilestone(milestoneType, achievedMilestone);
      if (existing?.achieved) {
        return null;
      }

      // Mark milestone as achieved
      if (existing) {
        await this.storage.updateMilestone(existing.id, {
          achieved: true,
          achievedAt: new Date(),
        });
      } else {
        await this.storage.createMilestone({
          userId,
          milestoneType,
          threshold: achievedMilestone,
          achieved: true,
          achievedAt: new Date(),
        });
      }

      // Trigger milestone alert
      const alertResult = await this.triggerAlert(userId, "milestone", platform, {
        count: achievedMilestone,
        username: undefined,
      });

      if (alertResult.message) {
        return {
          milestone: achievedMilestone,
          message: alertResult.message,
        };
      }

      // Fallback message if no custom template
      return {
        milestone: achievedMilestone,
        message: `🎉 Milestone reached: ${achievedMilestone} ${milestoneType}! Thank you all for your support!`,
      };
    } catch (error) {
      console.error(`[AlertsService] Error tracking milestone:`, error);
      return null;
    }
  }

  async getAlertHistory(
    userId: string,
    alertType?: string,
    limit: number = 50
  ) {
    try {
      return await this.storage.getAlertHistory(alertType, limit);
    } catch (error) {
      console.error(`[AlertsService] Error getting alert history:`, error);
      return [];
    }
  }

  async getMilestoneProgress(
    userId: string,
    milestoneType: "followers" | "subscribers"
  ): Promise<MilestoneProgress | null> {
    try {
      const settings = await this.storage.getAlertSettings();
      
      if (!settings) {
        return null;
      }

      const thresholds = settings.milestoneThresholds || [];
      const achieved = await this.storage.getMilestones(milestoneType);

      // For demo purposes, we'll use achieved milestones count as current count
      // In production, this would come from the actual platform API
      const achievedThresholds = achieved.filter(m => m.achieved).map(m => m.threshold);
      const currentCount = achievedThresholds.length > 0 
        ? Math.max(...achievedThresholds) 
        : 0;

      // Find next milestone
      const nextMilestone = thresholds
        .filter(t => t > currentCount)
        .sort((a, b) => a - b)[0] || null;

      // Calculate progress percentage
      const previousMilestone = thresholds
        .filter(t => t <= currentCount)
        .sort((a, b) => b - a)[0] || 0;

      const progress = nextMilestone
        ? ((currentCount - previousMilestone) / (nextMilestone - previousMilestone)) * 100
        : 100;

      // Get upcoming milestones
      const upcoming = thresholds
        .filter(t => t > currentCount)
        .sort((a, b) => a - b)
        .slice(0, 5);

      return {
        milestoneType,
        currentCount,
        nextMilestone,
        progress: Math.min(100, Math.max(0, progress)),
        achieved,
        upcoming,
      };
    } catch (error) {
      console.error(`[AlertsService] Error getting milestone progress:`, error);
      return null;
    }
  }

  async testAlert(
    userId: string,
    alertType: "follower" | "subscriber" | "raid" | "milestone",
    platform: "twitch" | "youtube" | "kick" = "twitch"
  ): Promise<{ success: boolean; message: string | null }> {
    try {
      const testData: AlertTriggerData = {};

      switch (alertType) {
        case "follower":
          testData.username = "TestUser123";
          break;
        case "subscriber":
          testData.username = "TestSubscriber";
          testData.tier = "Tier 1";
          testData.months = 3;
          break;
        case "raid":
          testData.raider = "TestRaider";
          testData.viewers = 42;
          break;
        case "milestone":
          testData.count = 100;
          break;
      }

      const result = await this.triggerAlert(userId, alertType, platform, testData);
      return { success: result.success, message: result.message };
    } catch (error) {
      console.error(`[AlertsService] Error testing alert:`, error);
      return { success: false, message: null };
    }
  }

  private isAlertTypeEnabled(settings: AlertSettings, alertType: string): boolean {
    switch (alertType) {
      case "follower":
        return settings.enableFollowerAlerts;
      case "subscriber":
        return settings.enableSubAlerts;
      case "raid":
        return settings.enableRaidAlerts;
      case "milestone":
        return settings.enableMilestoneAlerts;
      default:
        return false;
    }
  }

  private getTemplate(settings: AlertSettings, alertType: string): string {
    switch (alertType) {
      case "follower":
        return settings.followerTemplate;
      case "subscriber":
        return settings.subTemplate;
      case "raid":
        return settings.raidTemplate;
      case "milestone":
        return `🎉 We just hit {count} followers! Thank you for your support!`;
      default:
        return "";
    }
  }
}
