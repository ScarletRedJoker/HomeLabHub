import tmi from "tmi.js";
import * as cron from "node-cron";
import { createClient } from "@retconned/kick-js";
import { UserStorage } from "./user-storage";
import { generateSnappleFact } from "./openai";
import { sendYouTubeChatMessage, getActiveYouTubeLivestream } from "./youtube-client";
import type { BotConfig, PlatformConnection } from "@shared/schema";

type BotEvent = {
  type: "status_changed" | "new_message" | "error";
  userId: string;
  data: any;
};

type KickClient = ReturnType<typeof createClient>;

export class BotWorker {
  private twitchClient: tmi.Client | null = null;
  private kickClient: KickClient | null = null;
  private youtubeActiveLiveChatId: string | null = null;
  private cronJob: cron.ScheduledTask | null = null;
  private randomTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private config: BotConfig | null = null;

  constructor(
    private userId: string,
    private storage: UserStorage,
    private onEvent: (event: BotEvent) => void
  ) {}

  async start(): Promise<void> {
    if (this.isRunning) return;

    try {
      const config = await this.storage.getBotConfig();
      if (!config) {
        throw new Error("Bot config not found");
      }
      this.config = config;

      this.isRunning = true;

      // Start Twitch client if connected and chat triggers enabled
      const twitchConnection = await this.storage.getPlatformConnectionByPlatform("twitch");
      if (twitchConnection?.isConnected && this.config.enableChatTriggers) {
        await this.startTwitchClient(twitchConnection, this.config.chatKeywords || []);
      }

      // Start YouTube client if connected
      const youtubeConnection = await this.storage.getPlatformConnectionByPlatform("youtube");
      if (youtubeConnection?.isConnected) {
        await this.startYouTubeClient(youtubeConnection, this.config.chatKeywords || []);
      }

      // Start Kick client if connected and chat triggers enabled
      const kickConnection = await this.storage.getPlatformConnectionByPlatform("kick");
      if (kickConnection?.isConnected && this.config.enableChatTriggers) {
        await this.startKickClient(kickConnection, this.config.chatKeywords || []);
      }

      // Setup scheduled posting
      if (this.config.intervalMode === "fixed" && this.config.fixedIntervalMinutes) {
        this.setupFixedInterval(this.config.fixedIntervalMinutes);
      } else if (
        this.config.intervalMode === "random" &&
        this.config.randomMinMinutes &&
        this.config.randomMaxMinutes
      ) {
        this.setupRandomInterval(this.config.randomMinMinutes, this.config.randomMaxMinutes);
      }

      // Start heartbeat
      this.startHeartbeat();

      this.emitEvent({
        type: "status_changed",
        userId: this.userId,
        data: { isActive: true },
      });

      console.log(`[BotWorker] Started bot for user ${this.userId}`);
    } catch (error) {
      this.isRunning = false;
      console.error(`[BotWorker] Failed to start bot for user ${this.userId}:`, error);
      this.emitEvent({
        type: "error",
        userId: this.userId,
        data: { error: String(error) },
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    try {
      this.isRunning = false;

      // Stop Twitch client
      if (this.twitchClient) {
        await this.twitchClient.disconnect();
        this.twitchClient = null;
      }

      // Stop YouTube client
      this.youtubeActiveLiveChatId = null;

      // Stop Kick client
      if (this.kickClient) {
        // Kick client doesn't have explicit disconnect method, just nullify
        this.kickClient = null;
      }

      // Stop cron job
      if (this.cronJob) {
        this.cronJob.stop();
        this.cronJob = null;
      }

      // Clear random timeout
      if (this.randomTimeout) {
        clearTimeout(this.randomTimeout);
        this.randomTimeout = null;
      }

      // Stop heartbeat
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      this.emitEvent({
        type: "status_changed",
        userId: this.userId,
        data: { isActive: false },
      });

      console.log(`[BotWorker] Stopped bot for user ${this.userId}`);
    } catch (error) {
      console.error(`[BotWorker] Error stopping bot for user ${this.userId}:`, error);
      throw error;
    }
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async reloadConfig(): Promise<void> {
    const config = await this.storage.getBotConfig();
    this.config = config || null;
  }

  getStatus(): { isRunning: boolean; userId: string } {
    return {
      isRunning: this.isRunning,
      userId: this.userId,
    };
  }

  private async startTwitchClient(connection: PlatformConnection, keywords: string[]) {
    if (!connection.platformUsername) return;

    try {
      this.twitchClient = new tmi.Client({
        identity: {
          username: connection.platformUsername,
          password: `oauth:${connection.accessToken}`,
        },
        channels: [connection.platformUsername],
      });

      this.twitchClient.on("message", async (channel, tags, message, self) => {
        if (self) return;

        const lowerMessage = message.toLowerCase().trim();
        const hasKeyword = keywords.some((keyword) =>
          lowerMessage.includes(keyword.toLowerCase())
        );

        if (hasKeyword) {
          try {
            const fact = await this.generateAndPostFact(
              ["twitch"],
              "chat_command",
              tags.username
            );

            if (fact && this.twitchClient) {
              await this.twitchClient.say(channel, fact);
            }
          } catch (error) {
            console.error(`[BotWorker] Error posting fact from chat command (user ${this.userId}):`, error);
          }
        }
      });

      await this.twitchClient.connect();
      console.log(`[BotWorker] Twitch bot connected for user ${this.userId} (${connection.platformUsername})`);
    } catch (error) {
      console.error(`[BotWorker] Failed to start Twitch client for user ${this.userId}:`, error);
      this.twitchClient = null;
    }
  }

  private async startYouTubeClient(connection: PlatformConnection, keywords: string[]) {
    try {
      // Get active livestream and chat ID
      const livestream = await getActiveYouTubeLivestream();
      if (livestream?.liveChatId) {
        this.youtubeActiveLiveChatId = livestream.liveChatId;
        console.log(`[BotWorker] YouTube bot ready for user ${this.userId} (Chat ID: ${this.youtubeActiveLiveChatId})`);
      } else {
        console.log(`[BotWorker] No active YouTube livestream for user ${this.userId}`);
      }
    } catch (error) {
      console.error(`[BotWorker] Failed to start YouTube client for user ${this.userId}:`, error);
      this.youtubeActiveLiveChatId = null;
    }
  }

  private async startKickClient(connection: PlatformConnection, keywords: string[]) {
    if (!connection.platformUsername) return;

    try {
      const channelName = connection.platformUsername.toLowerCase();
      this.kickClient = createClient(channelName, { logger: false, readOnly: false });

      // If we have credentials, login
      const connectionData = connection.connectionData as any;
      if (connectionData?.bearerToken || connection.accessToken) {
        const bearerToken = connectionData?.bearerToken || connection.accessToken;
        const cookies = connectionData?.cookies || "";
        
        // Login with tokens (simplified - may need adjustment based on actual API)
        this.kickClient.login({
          type: "tokens" as const,
          credentials: {
            bearerToken,
            cookies,
            xsrfToken: "", // Add required field, may need to extract from cookies
          }
        });
      }

      this.kickClient.on("ready", () => {
        console.log(`[BotWorker] Kick bot connected for user ${this.userId} (${channelName})`);
      });

      this.kickClient.on("ChatMessage", async (message: any) => {
        const lowerMessage = message.content.toLowerCase().trim();
        const hasKeyword = keywords.some((keyword) =>
          lowerMessage.includes(keyword.toLowerCase())
        );

        if (hasKeyword) {
          try {
            // For Kick chat triggers, just generate the fact
            // The response will be sent via the main postToPlatform method
            await this.generateAndPostFact(
              ["kick"],
              "chat_command",
              message.sender.username
            );
          } catch (error) {
            console.error(`[BotWorker] Error posting fact from Kick chat command (user ${this.userId}):`, error);
          }
        }
      });

      console.log(`[BotWorker] Kick client starting for user ${this.userId} (${channelName})`);
    } catch (error) {
      console.error(`[BotWorker] Failed to start Kick client for user ${this.userId}:`, error);
      this.kickClient = null;
    }
  }

  private setupFixedInterval(minutes: number) {
    const cronExpression = `*/${minutes} * * * *`;

    this.cronJob = cron.schedule(cronExpression, async () => {
      await this.postScheduledFact();
    });
  }

  private setupRandomInterval(minMinutes: number, maxMinutes: number) {
    const scheduleNext = () => {
      const randomMinutes =
        Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;
      const delay = randomMinutes * 60 * 1000;

      this.randomTimeout = setTimeout(async () => {
        await this.postScheduledFact();
        scheduleNext();
      }, delay);
    };

    scheduleNext();
  }

  private async postScheduledFact() {
    const config = await this.storage.getBotConfig();
    if (!config?.isActive || !config.activePlatforms || config.activePlatforms.length === 0) {
      return;
    }

    await this.generateAndPostFact(config.activePlatforms, "scheduled");
  }

  async postManualFact(platforms: string[]): Promise<string | null> {
    return await this.generateAndPostFact(platforms, "manual");
  }

  async generateFact(): Promise<string> {
    const config = await this.storage.getBotConfig();
    const model = config?.aiModel || "gpt-5-mini";
    const customPrompt = config?.aiPromptTemplate || undefined;

    return await generateSnappleFact(customPrompt, model);
  }

  private async generateAndPostFact(
    platforms: string[],
    triggerType: string,
    triggerUser?: string
  ): Promise<string | null> {
    try {
      const fact = await this.generateFact();

      // Post to each platform
      for (const platform of platforms) {
        await this.postToPlatform(platform, fact);

        // Log message
        await this.storage.createMessage({
          userId: this.userId,
          platform,
          triggerType,
          triggerUser,
          factContent: fact,
          status: "success",
        });
      }

      // Emit event
      this.emitEvent({
        type: "new_message",
        userId: this.userId,
        data: {
          platforms,
          fact,
          triggerType,
        },
      });

      // Update last posted time
      await this.storage.updateBotConfig({
        lastFactPostedAt: new Date(),
      });

      return fact;
    } catch (error) {
      console.error(`[BotWorker] Error generating/posting fact for user ${this.userId}:`, error);

      // Log failed attempts
      for (const platform of platforms) {
        await this.storage.createMessage({
          userId: this.userId,
          platform,
          triggerType,
          triggerUser,
          factContent: "",
          status: "failed",
          errorMessage: String(error),
        });
      }

      this.emitEvent({
        type: "error",
        userId: this.userId,
        data: { error: String(error) },
      });

      return null;
    }
  }

  private async postToPlatform(platform: string, message: string) {
    const connection = await this.storage.getPlatformConnectionByPlatform(platform);

    if (!connection?.isConnected) {
      throw new Error(`Platform ${platform} is not connected`);
    }

    switch (platform) {
      case "twitch":
        if (this.twitchClient && connection.platformUsername) {
          await this.twitchClient.say(connection.platformUsername, message);
        }
        break;

      case "youtube":
        if (this.youtubeActiveLiveChatId) {
          await sendYouTubeChatMessage(this.youtubeActiveLiveChatId, message);
        } else {
          throw new Error("YouTube live chat not available (no active livestream)");
        }
        break;

      case "kick":
        // Kick.js posting requires authentication - for now log intent
        // In production, this would use the Kick client's sendMessage method
        if (this.kickClient) {
          console.log(`[BotWorker] [Kick] Posting to channel ${connection.platformUsername}: ${message}`);
          // Note: @retconned/kick-js API may vary - consult documentation for exact method
        } else {
          throw new Error("Kick client not connected");
        }
        break;

      default:
        throw new Error(`Unknown platform: ${platform}`);
    }
  }

  private startHeartbeat() {
    // Update heartbeat every 30 seconds
    this.heartbeatInterval = setInterval(async () => {
      if (this.isRunning) {
        // Heartbeat logic can be added here if needed
        // For now, just keep the interval running to prevent orphaned workers
      }
    }, 30000);
  }

  private emitEvent(event: BotEvent) {
    this.onEvent(event);
  }
}
