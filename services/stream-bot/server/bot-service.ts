import tmi from "tmi.js";
import cron from "node-cron";
import { storage } from "./storage";
import { generateSnappleFact } from "./openai";
import { WebSocket } from "ws";

export class BotService {
  private twitchClient: tmi.Client | null = null;
  private cronJob: cron.ScheduledTask | null = null;
  private randomTimeout: NodeJS.Timeout | null = null;
  private wsClients: Set<WebSocket> = new Set();
  private isRunning = false;

  constructor() {
    this.initialize();
  }

  // WebSocket management for real-time updates
  addWSClient(ws: WebSocket) {
    this.wsClients.add(ws);
  }

  removeWSClient(ws: WebSocket) {
    this.wsClients.delete(ws);
  }

  getWSClientCount(): number {
    return this.wsClients.size;
  }

  private broadcastUpdate(data: any) {
    const message = JSON.stringify(data);
    this.wsClients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  private async initialize() {
    const settings = await storage.getBotSettings();
    if (settings?.isActive) {
      await this.start();
    }
  }

  async start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    const settings = await storage.getBotSettings();
    
    if (!settings) return;

    // Start Twitch client if connected
    const twitchConnection = await storage.getPlatformConnectionByPlatform("twitch");
    if (twitchConnection?.isConnected && settings.enableChatTriggers) {
      await this.startTwitchClient(twitchConnection, settings.chatKeywords || []);
    }

    // Setup scheduled posting based on interval mode
    if (settings.intervalMode === "fixed" && settings.fixedIntervalMinutes) {
      this.setupFixedInterval(settings.fixedIntervalMinutes);
    } else if (settings.intervalMode === "random" && settings.randomMinMinutes && settings.randomMaxMinutes) {
      this.setupRandomInterval(settings.randomMinMinutes, settings.randomMaxMinutes);
    }

    this.broadcastUpdate({ type: "bot_status", isActive: true });
  }

  async stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    // Stop Twitch client
    if (this.twitchClient) {
      await this.twitchClient.disconnect();
      this.twitchClient = null;
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

    this.broadcastUpdate({ type: "bot_status", isActive: false });
  }

  async restart() {
    await this.stop();
    await this.start();
  }

  private async startTwitchClient(connection: any, keywords: string[]) {
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
            
            // Send fact to chat
            if (fact && this.twitchClient) {
              await this.twitchClient.say(channel, fact);
            }
          } catch (error) {
            console.error("Error posting fact from chat command:", error);
          }
        }
      });

      await this.twitchClient.connect();
      console.log(`Twitch bot connected to ${connection.platformUsername}`);
    } catch (error) {
      console.error("Failed to start Twitch client:", error);
      this.twitchClient = null;
    }
  }

  private setupFixedInterval(minutes: number) {
    // Convert minutes to cron expression
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
        scheduleNext(); // Schedule next random post
      }, delay);
    };

    scheduleNext();
  }

  private async postScheduledFact() {
    const settings = await storage.getBotSettings();
    if (!settings?.isActive || !settings.activePlatforms || settings.activePlatforms.length === 0) {
      return;
    }

    await this.generateAndPostFact(settings.activePlatforms, "scheduled");
  }

  async postManualFact(platforms: string[]): Promise<string | null> {
    return await this.generateAndPostFact(platforms, "manual");
  }

  async generateFact(): Promise<string> {
    const settings = await storage.getBotSettings();
    const model = settings?.aiModel || "gpt-5-mini";
    const customPrompt = settings?.aiPromptTemplate || undefined;

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
        await storage.createMessage({
          platform,
          triggerType,
          triggerUser,
          factContent: fact,
          status: "success",
        });
      }

      // Broadcast update
      this.broadcastUpdate({
        type: "new_message",
        platforms,
        fact,
        triggerType,
      });

      // Update last posted time
      await storage.updateBotSettings({
        lastFactPostedAt: new Date(),
      });

      return fact;
    } catch (error) {
      console.error("Error generating/posting fact:", error);
      
      // Log failed attempts
      for (const platform of platforms) {
        await storage.createMessage({
          platform,
          triggerType,
          triggerUser,
          factContent: "",
          status: "failed",
          errorMessage: String(error),
        });
      }

      return null;
    }
  }

  private async postToPlatform(platform: string, message: string) {
    const connection = await storage.getPlatformConnectionByPlatform(platform);
    
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
        // YouTube Live Chat API would go here
        // For now, just log that we would post
        console.log(`[YouTube] Would post: ${message}`);
        break;

      case "kick":
        // Kick API would go here
        // For now, just log that we would post
        console.log(`[Kick] Would post: ${message}`);
        break;

      default:
        throw new Error(`Unknown platform: ${platform}`);
    }
  }
}

// Singleton instance
export const botService = new BotService();
