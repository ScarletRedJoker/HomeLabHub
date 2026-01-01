import { db } from "./db";
import { scheduledAnnouncements, platformConnections } from "@shared/schema";
import { eq, and, lte, or, sql } from "drizzle-orm";
import { botManager } from "./routes";

const ANNOUNCEMENT_TEMPLATES = {
  going_live: {
    title: "Going Live!",
    message: "🔴 We're LIVE! Come hang out at the stream!",
  },
  stream_starting_soon: {
    title: "Stream Starting Soon",
    message: "⏰ Stream starting in {minutes} minutes! Get ready!",
  },
  thank_you: {
    title: "Thank You",
    message: "💜 Thanks for watching today! See you next time!",
  },
};

export { ANNOUNCEMENT_TEMPLATES };

interface AnnouncementResult {
  success: boolean;
  platformResults: {
    platform: string;
    success: boolean;
    error?: string;
  }[];
}

class AnnouncementScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private checkIntervalMs = 60 * 1000;

  start(): void {
    if (this.isRunning) {
      console.log("[AnnouncementScheduler] Already running");
      return;
    }

    console.log("[AnnouncementScheduler] Starting scheduler service");
    this.isRunning = true;

    this.checkDueAnnouncements();

    this.intervalId = setInterval(() => {
      this.checkDueAnnouncements();
    }, this.checkIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log("[AnnouncementScheduler] Stopped");
  }

  private async checkDueAnnouncements(): Promise<void> {
    try {
      const now = new Date();

      const dueAnnouncements = await db.query.scheduledAnnouncements.findMany({
        where: and(
          eq(scheduledAnnouncements.isActive, true),
          or(
            eq(scheduledAnnouncements.status, "pending"),
            eq(scheduledAnnouncements.status, "failed")
          ),
          lte(scheduledAnnouncements.nextRunAt, now)
        ),
      });

      if (dueAnnouncements.length > 0) {
        console.log(`[AnnouncementScheduler] Found ${dueAnnouncements.length} due announcements`);
      }

      for (const announcement of dueAnnouncements) {
        if (announcement.status === "failed" && announcement.retryCount >= announcement.maxRetries) {
          await db
            .update(scheduledAnnouncements)
            .set({
              isActive: false,
              errorMessage: "Max retries exceeded",
              updatedAt: new Date(),
            })
            .where(eq(scheduledAnnouncements.id, announcement.id));
          continue;
        }

        await this.processAnnouncement(announcement.id, announcement.userId);
      }
    } catch (error) {
      console.error("[AnnouncementScheduler] Error checking due announcements:", error);
    }
  }

  async processAnnouncement(announcementId: string, userId: string): Promise<AnnouncementResult> {
    const announcement = await db.query.scheduledAnnouncements.findFirst({
      where: eq(scheduledAnnouncements.id, announcementId),
    });

    if (!announcement) {
      return { success: false, platformResults: [] };
    }

    console.log(`[AnnouncementScheduler] Processing announcement: ${announcement.title}`);

    const result = await this.sendAnnouncement(userId, announcement.message, announcement.platforms as string[], announcement.discordWebhookUrl);

    const allSucceeded = result.platformResults.every((r) => r.success);
    const anySucceeded = result.platformResults.some((r) => r.success);

    if (allSucceeded) {
      const nextRunAt = this.calculateNextRunAt(announcement);
      const status = announcement.scheduleType === "once" ? "sent" : "pending";
      const isActive = announcement.scheduleType !== "once";

      await db
        .update(scheduledAnnouncements)
        .set({
          status,
          lastSentAt: new Date(),
          nextRunAt,
          retryCount: 0,
          errorMessage: null,
          isActive,
          updatedAt: new Date(),
        })
        .where(eq(scheduledAnnouncements.id, announcementId));
    } else if (anySucceeded) {
      const failedPlatforms = result.platformResults
        .filter((r) => !r.success)
        .map((r) => `${r.platform}: ${r.error}`)
        .join("; ");

      await db
        .update(scheduledAnnouncements)
        .set({
          status: "pending",
          lastSentAt: new Date(),
          retryCount: announcement.retryCount + 1,
          errorMessage: `Partial failure: ${failedPlatforms}`,
          nextRunAt: new Date(Date.now() + 5 * 60 * 1000),
          updatedAt: new Date(),
        })
        .where(eq(scheduledAnnouncements.id, announcementId));
    } else {
      const errorMessage = result.platformResults
        .map((r) => `${r.platform}: ${r.error}`)
        .join("; ");

      await db
        .update(scheduledAnnouncements)
        .set({
          status: "failed",
          retryCount: announcement.retryCount + 1,
          errorMessage,
          nextRunAt: new Date(Date.now() + 5 * 60 * 1000),
          updatedAt: new Date(),
        })
        .where(eq(scheduledAnnouncements.id, announcementId));
    }

    return result;
  }

  async sendAnnouncement(userId: string, message: string, platforms: string[], discordWebhookUrl?: string | null): Promise<AnnouncementResult> {
    const platformResults: AnnouncementResult["platformResults"] = [];

    const worker = botManager.getWorker(userId);

    for (const platform of platforms) {
      try {
        if (platform === "discord") {
          if (!discordWebhookUrl) {
            platformResults.push({
              platform,
              success: false,
              error: "No Discord webhook URL configured",
            });
            continue;
          }

          const response = await fetch(discordWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: message,
              username: "Stream Bot",
            }),
          });

          if (!response.ok) {
            throw new Error(`Discord webhook failed: ${response.status} ${response.statusText}`);
          }

          platformResults.push({ platform, success: true });
        } else if (platform === "twitch" || platform === "youtube" || platform === "kick") {
          if (!worker) {
            platformResults.push({
              platform,
              success: false,
              error: "Bot not running - please start the bot first",
            });
            continue;
          }

          const connection = await db.query.platformConnections.findFirst({
            where: and(
              eq(platformConnections.userId, userId),
              eq(platformConnections.platform, platform),
              eq(platformConnections.isConnected, true)
            ),
          });

          if (!connection) {
            platformResults.push({
              platform,
              success: false,
              error: `${platform} not connected`,
            });
            continue;
          }

          await worker.postToPlatform(platform, message);
          platformResults.push({ platform, success: true });
        } else {
          platformResults.push({
            platform,
            success: false,
            error: `Unknown platform: ${platform}`,
          });
        }
      } catch (error) {
        console.error(`[AnnouncementScheduler] Failed to send to ${platform}:`, error);
        platformResults.push({
          platform,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      success: platformResults.every((r) => r.success),
      platformResults,
    };
  }

  private calculateNextRunAt(announcement: typeof scheduledAnnouncements.$inferSelect): Date | null {
    switch (announcement.scheduleType) {
      case "once":
        return null;

      case "before_stream":
        return null;

      case "recurring":
        if (!announcement.cronPattern) return null;
        return this.getNextCronRun(announcement.cronPattern);

      default:
        return null;
    }
  }

  private getNextCronRun(cronPattern: string): Date {
    const parts = cronPattern.split(" ");
    if (parts.length !== 5) {
      return new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    const now = new Date();
    const nextRun = new Date(now);

    if (hour !== "*") {
      nextRun.setHours(parseInt(hour, 10));
    }
    if (minute !== "*") {
      nextRun.setMinutes(parseInt(minute, 10));
    }
    nextRun.setSeconds(0);
    nextRun.setMilliseconds(0);

    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    if (dayOfWeek !== "*") {
      const targetDays = dayOfWeek.split(",").map((d) => parseInt(d, 10));
      while (!targetDays.includes(nextRun.getDay())) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
    }

    return nextRun;
  }

  async triggerBeforeStreamAnnouncements(userId: string, minutesUntilStream: number): Promise<void> {
    try {
      const announcements = await db.query.scheduledAnnouncements.findMany({
        where: and(
          eq(scheduledAnnouncements.userId, userId),
          eq(scheduledAnnouncements.scheduleType, "before_stream"),
          eq(scheduledAnnouncements.isActive, true),
          eq(scheduledAnnouncements.status, "pending")
        ),
      });

      for (const announcement of announcements) {
        if (announcement.beforeStreamMinutes && announcement.beforeStreamMinutes >= minutesUntilStream) {
          console.log(`[AnnouncementScheduler] Triggering before-stream announcement: ${announcement.title}`);
          await this.processAnnouncement(announcement.id, userId);
        }
      }
    } catch (error) {
      console.error("[AnnouncementScheduler] Error triggering before-stream announcements:", error);
    }
  }
}

export const announcementScheduler = new AnnouncementScheduler();

export function startAnnouncementScheduler(): void {
  announcementScheduler.start();
}

export function stopAnnouncementScheduler(): void {
  announcementScheduler.stop();
}
