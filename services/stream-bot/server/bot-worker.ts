import tmi from "tmi.js";
import * as cron from "node-cron";
import { createClient } from "@retconned/kick-js";
import { UserStorage } from "./user-storage";
import { generateSnappleFact } from "./openai";
import { sendYouTubeChatMessage, getActiveYouTubeLivestream } from "./youtube-client";
import { parseCommandVariables, type CommandContext } from "./command-variables";
import { moderationService } from "./moderation-service";
import { giveawayService } from "./giveaway-service";
import { statsService } from "./stats-service";
import { streamerInfoService } from "./streamer-info";
import { GamesService } from "./games-service";
import { currencyService } from "./currency-service";
import { songRequestService } from "./song-request-service";
import { PollsService } from "./polls-service";
import { AlertsService } from "./alerts-service";
import { ChatbotService } from "./chatbot-service";
import { shoutoutService } from "./shoutout-service";
import type { BotConfig, PlatformConnection, CustomCommand, ModerationRule, LinkWhitelist } from "@shared/schema";

type BotEvent = {
  type: "status_changed" | "new_message" | "error" | "moderation_action" | "giveaway_entry";
  userId: string;
  data: any;
};

type KickClient = ReturnType<typeof createClient>;

export class BotWorker {
  private twitchClient: tmi.Client | null = null;
  private kickClient: KickClient | null = null;
  private kickChannelSlug: string | null = null;
  private kickClientReady: boolean = false;
  private youtubeActiveLiveChatId: string | null = null;
  private cronJob: cron.ScheduledTask | null = null;
  private randomTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private viewerTrackingInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private config: BotConfig | null = null;
  private commandCooldowns: Map<string, number> = new Map(); // commandId -> lastUsedTimestamp
  private gameCooldowns: Map<string, number> = new Map(); // userId+gameType -> lastPlayedTimestamp
  private activePlatforms: Set<string> = new Set();
  private streamStartTime: Date | null = null; // Track when stream/bot started for uptime
  private gamesService: GamesService;
  private pollsService: PollsService;
  private alertsService: AlertsService;
  private chatbotService: ChatbotService;

  constructor(
    private userId: string,
    private storage: UserStorage,
    private onEvent: (event: BotEvent) => void
  ) {
    this.gamesService = new GamesService(storage);
    this.pollsService = new PollsService(storage);
    this.alertsService = new AlertsService(storage);
    this.chatbotService = new ChatbotService(storage);
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    try {
      const config = await this.storage.getBotConfig();
      if (!config) {
        throw new Error("Bot config not found");
      }
      this.config = config;

      this.isRunning = true;

      // Set stream start time for uptime tracking
      this.streamStartTime = new Date();

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

      // Track active platforms and create sessions
      if (twitchConnection?.isConnected) {
        this.activePlatforms.add("twitch");
        await statsService.createSession(this.userId, "twitch");
      }
      if (youtubeConnection?.isConnected) {
        this.activePlatforms.add("youtube");
        await statsService.createSession(this.userId, "youtube");
      }
      if (kickConnection?.isConnected) {
        this.activePlatforms.add("kick");
        await statsService.createSession(this.userId, "kick");
      }

      // Start viewer tracking (every 5 minutes)
      this.startViewerTracking();

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
        this.kickChannelSlug = null;
        this.kickClientReady = false;
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

      // Stop viewer tracking
      if (this.viewerTrackingInterval) {
        clearInterval(this.viewerTrackingInterval);
        this.viewerTrackingInterval = null;
      }

      // Reset stream start time
      this.streamStartTime = null;

      // End sessions for all active platforms
      for (const platform of Array.from(this.activePlatforms)) {
        const session = await statsService.getCurrentSession(this.userId, platform);
        if (session) {
          await statsService.endSession(session.id);
        }
      }
      this.activePlatforms.clear();

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

  private async checkModeration(
    message: string,
    username: string,
    platform: string
  ): Promise<{ allowed: boolean; action?: string; reason?: string; timeoutDuration?: number }> {
    try {
      const [rules, whitelist, config] = await Promise.all([
        this.storage.getModerationRules(),
        this.storage.getLinkWhitelist(),
        this.storage.getBotConfig(),
      ]);

      const bannedWords = config?.bannedWords || [];
      const decision = await moderationService.checkMessage(message, username, rules, whitelist, bannedWords);

      if (!decision.allow) {
        await this.storage.createModerationLog({
          userId: this.userId,
          platform,
          username,
          message,
          ruleTriggered: decision.ruleTriggered || "unknown",
          action: decision.action,
          severity: decision.severity || "low",
        });

        this.emitEvent({
          type: "moderation_action",
          userId: this.userId,
          data: {
            username,
            platform,
            action: decision.action,
            ruleTriggered: decision.ruleTriggered,
            reason: decision.reason,
            message,
          },
        });

        console.log(`[BotWorker] Moderation action: ${decision.action} for ${username} on ${platform} - ${decision.reason}`);
      }

      return {
        allowed: decision.allow,
        action: decision.action,
        reason: decision.reason,
        timeoutDuration: decision.timeoutDuration,
      };
    } catch (error) {
      console.error(`[BotWorker] Error checking moderation:`, error);
      return { allowed: true };
    }
  }

  private async executeModerationAction(
    platform: string,
    username: string,
    action: string,
    reason?: string,
    timeoutDuration?: number
  ): Promise<void> {
    try {
      if (platform === "twitch" && this.twitchClient) {
        const channel = (await this.storage.getPlatformConnectionByPlatform("twitch"))?.platformUsername;
        if (!channel) return;

        if (action === "warn") {
          const warningMessage = `@${username}, please follow chat rules. ${reason || "Your message violated moderation rules."}`;
          await this.twitchClient.say(channel, warningMessage);
        } else if (action === "timeout" && timeoutDuration) {
          await this.twitchClient.timeout(channel, username, timeoutDuration, "Auto-moderation");
        } else if (action === "ban") {
          await this.twitchClient.ban(channel, username, "Auto-moderation");
        }
      } else if (platform === "youtube" && this.youtubeActiveLiveChatId) {
        if (action === "warn") {
          const warningMessage = `@${username}, please follow chat rules. ${reason || "Your message violated moderation rules."}`;
          await sendYouTubeChatMessage(this.youtubeActiveLiveChatId, warningMessage);
        }
        // Note: YouTube Live Chat API doesn't support direct timeout/ban actions
        // These would need to be handled via YouTube Studio API or manually
      } else if (platform === "kick" && this.kickClient && this.kickClientReady) {
        if (action === "warn") {
          const warningMessage = `@${username}, please follow chat rules. ${reason || "Your message violated moderation rules."}`;
          await this.kickClient.sendMessage(warningMessage);
        }
        // Note: Kick API timeout/ban support would need to be implemented when available
      }
    } catch (error) {
      console.error(`[BotWorker] Error executing moderation action:`, error);
    }
  }

  private async executeShoutoutCommand(
    message: string,
    platform: string
  ): Promise<string | null> {
    try {
      // Parse the command: !so username or !shoutout username
      const parts = message.trim().split(/\s+/);
      if (parts.length < 2) {
        return "Usage: !so <username> or !shoutout <username>";
      }

      const targetUsername = parts[1].replace("@", ""); // Remove @ if present

      // Execute the shoutout
      const result = await shoutoutService.executeShoutout(
        this.userId,
        targetUsername,
        platform,
        "command"
      );

      if (result.success) {
        return result.message;
      } else {
        return `Failed to shoutout ${targetUsername}.`;
      }
    } catch (error) {
      console.error(`[BotWorker] Error executing shoutout command:`, error);
      return null;
    }
  }

  private async handleRaidShoutout(
    username: string,
    platform: string,
    viewerCount?: number
  ): Promise<string | null> {
    try {
      const settings = await this.storage.getShoutoutSettings();
      
      if (!settings || !settings.enableRaidShoutouts) {
        return null; // Auto-shoutouts on raid are disabled
      }

      const result = await shoutoutService.executeShoutout(
        this.userId,
        username,
        platform,
        "raid"
      );

      if (result.success) {
        return result.message;
      }
      return null;
    } catch (error) {
      console.error(`[BotWorker] Error handling raid shoutout:`, error);
      return null;
    }
  }

  private async handleHostShoutout(
    username: string,
    platform: string
  ): Promise<string | null> {
    try {
      const settings = await this.storage.getShoutoutSettings();
      
      if (!settings || !settings.enableHostShoutouts) {
        return null; // Auto-shoutouts on host are disabled
      }

      const result = await shoutoutService.executeShoutout(
        this.userId,
        username,
        platform,
        "host"
      );

      if (result.success) {
        return result.message;
      }
      return null;
    } catch (error) {
      console.error(`[BotWorker] Error handling host shoutout:`, error);
      return null;
    }
  }

  private async handleGameCommand(
    message: string,
    username: string,
    platform: string
  ): Promise<{ response: string | null; shouldTimeout?: boolean; timeoutDuration?: number; timeoutUser?: string }> {
    try {
      const settings = await this.storage.getGameSettings();
      
      if (!settings || !settings.enableGames) {
        return { response: null };
      }

      const parts = message.trim().split(/\s+/);
      const command = parts[0].toLowerCase();
      
      // Check game-specific enabled status
      if (command === "!8ball" && !settings.enable8Ball) return { response: null };
      if (command === "!trivia" && !settings.enableTrivia) return { response: null };
      if (command === "!duel" && !settings.enableDuel) return { response: null };
      if (command === "!slots" && !settings.enableSlots) return { response: null };
      if (command === "!roulette" && !settings.enableRoulette) return { response: null };

      // Check cooldown
      const gameType = command.substring(1); // Remove "!"
      const cooldownKey = `${username}-${gameType}`;
      const now = Date.now();
      const lastPlayed = this.gameCooldowns.get(cooldownKey) || 0;
      const cooldownMs = settings.cooldownMinutes * 60 * 1000;
      
      if (now - lastPlayed < cooldownMs) {
        const remainingSeconds = Math.ceil((cooldownMs - (now - lastPlayed)) / 1000);
        return { response: `@${username}, please wait ${remainingSeconds} seconds before playing ${gameType} again.` };
      }

      let result;
      let opponent: string | undefined;

      switch (command) {
        case "!8ball":
          const question = parts.slice(1).join(" ");
          if (!question) {
            return { response: "Usage: !8ball <your question>" };
          }
          result = await this.gamesService.play8Ball(question);
          break;

        case "!trivia":
          const difficulty: "easy" | "medium" | "hard" = (parts[1]?.toLowerCase() as any) || "medium";
          result = await this.gamesService.playTrivia(difficulty, username, this.userId, platform);
          break;

        case "!duel":
          opponent = parts[1]?.replace("@", "");
          if (!opponent) {
            return { response: "Usage: !duel @username" };
          }
          result = await this.gamesService.playDuel(username, opponent);
          break;

        case "!slots":
          result = await this.gamesService.playSlots();
          break;

        case "!roulette":
          result = await this.gamesService.playRoulette(username);
          break;

        default:
          return { response: null };
      }

      if (result && result.success) {
        // Update cooldown
        this.gameCooldowns.set(cooldownKey, now);

        // Track game play
        await this.gamesService.trackGamePlay(
          gameType as any,
          username,
          result.outcome || "neutral",
          platform,
          result.pointsAwarded || 0,
          opponent,
          result.details
        );

        // Handle game timeouts
        // Roulette: timeout the player if they got shot
        if (command === "!roulette" && result.details?.shot) {
          return {
            response: result.message,
            shouldTimeout: true,
            timeoutDuration: result.details.timeoutDuration || 300,
            timeoutUser: username
          };
        }

        // Duel: timeout the loser
        if (command === "!duel" && result.details?.timeout) {
          return {
            response: result.message,
            shouldTimeout: true,
            timeoutDuration: result.details.timeoutDuration || 60,
            timeoutUser: result.details.loser
          };
        }

        return { response: result.message };
      }

      return { response: result?.message || null };
    } catch (error) {
      console.error(`[BotWorker] Error handling game command:`, error);
      return { response: "Game error! Please try again later." };
    }
  }

  private async shouldChatbotRespond(
    message: string,
    username: string,
    platform: string
  ): Promise<{ should: boolean; reason: string; cleanMessage: string }> {
    try {
      // Get chatbot settings
      const chatbotSettings = await this.storage.getChatbotSettings();
      if (!chatbotSettings || !chatbotSettings.isEnabled) {
        return { should: false, reason: "disabled", cleanMessage: message };
      }

      // Check rate limiting
      const isRateLimited = await this.chatbotService.isRateLimited(username, platform);
      if (isRateLimited) {
        return { should: false, reason: "rate_limited", cleanMessage: message };
      }

      // Check for mention trigger
      const mentionTrigger = chatbotSettings.mentionTrigger || "@bot";
      if (message.toLowerCase().includes(mentionTrigger.toLowerCase())) {
        const cleanMessage = message.replace(new RegExp(mentionTrigger, 'gi'), '').trim();
        return { should: true, reason: "mention", cleanMessage };
      }

      // Check if message is a question (ends with ?)
      if (message.trim().endsWith("?")) {
        // Random 50% chance to respond to questions
        if (Math.random() < 0.5) {
          return { should: true, reason: "question", cleanMessage: message };
        }
      }

      // Random response chance (configured in settings, default 10% which is 0.1)
      // responseRate in settings is seconds between responses per user, not percentage
      // So we'll use a fixed 10% chance for random responses to avoid confusion
      const randomChance = 0.10; // 10% chance
      if (Math.random() < randomChance) {
        return { should: true, reason: "random", cleanMessage: message };
      }

      return { should: false, reason: "no_trigger", cleanMessage: message };
    } catch (error) {
      console.error(`[BotWorker] Error checking if chatbot should respond:`, error);
      return { should: false, reason: "error", cleanMessage: message };
    }
  }

  private async handleChatbotResponse(
    message: string,
    username: string,
    platform: string
  ): Promise<string | null> {
    try {
      // Check if chatbot should respond to this message
      const { should, reason, cleanMessage } = await this.shouldChatbotRespond(message, username, platform);
      
      if (!should) {
        return null;
      }

      console.log(`[BotWorker] Chatbot responding to ${username} (reason: ${reason}): ${cleanMessage}`);

      // Process message and generate response
      const response = await this.chatbotService.processMessage(username, cleanMessage, platform);

      // Format response based on trigger reason
      if (reason === "mention") {
        return `@${username}, ${response}`;
      } else {
        // For questions and random responses, be more natural (no @mention)
        return response;
      }
    } catch (error) {
      console.error(`[BotWorker] Error handling chatbot response:`, error);
      return null;
    }
  }

  private async handleChatbotMention(
    message: string,
    username: string,
    platform: string
  ): Promise<string | null> {
    // This method is now deprecated, use handleChatbotResponse instead
    return await this.handleChatbotResponse(message, username, platform);
  }

  private async handleTriviaAnswer(
    message: string,
    username: string,
    platform: string
  ): Promise<string | null> {
    try {
      const answer = message.trim();
      const result = await this.gamesService.checkTriviaAnswer(username, this.userId, platform, answer);
      
      if (result) {
        // Track the game result
        await this.gamesService.trackGamePlay(
          "trivia",
          username,
          result.outcome || "neutral",
          platform,
          result.pointsAwarded || 0,
          undefined,
          result.details
        );

        return result.message;
      }

      return null;
    } catch (error) {
      console.error(`[BotWorker] Error handling trivia answer:`, error);
      return null;
    }
  }

  private async handleSongRequestCommand(
    message: string,
    username: string,
    isModerator: boolean
  ): Promise<string | null> {
    try {
      const parts = message.trim().split(/\s+/);
      const command = parts[0].toLowerCase();

      switch (command) {
        case "!songrequest":
        case "!sr":
          const query = parts.slice(1).join(" ");
          if (!query) {
            return "Usage: !songrequest <song name or URL>";
          }

          const addResult = await songRequestService.addToQueue(
            this.userId,
            username,
            query,
            isModerator
          );

          if (addResult.success && addResult.song && addResult.position) {
            return `@${username}, added "${addResult.song.songTitle}" by ${addResult.song.artist} to the queue! (Position ${addResult.position.current}/${addResult.position.total})`;
          } else {
            return `@${username}, ${addResult.error || "Failed to add song to queue"}`;
          }

        case "!currentsong":
        case "!nowplaying":
          const current = await songRequestService.getCurrentSong(this.userId);
          if (current) {
            return `Now playing: "${current.songTitle}" by ${current.artist} (requested by ${current.requestedBy}) - ${current.url}`;
          } else {
            return "No song is currently playing";
          }

        case "!queue":
          const queue = await songRequestService.getQueue(this.userId);
          if (queue.length === 0) {
            return "The song queue is empty!";
          }

          const next5 = queue.slice(0, 5);
          const queueList = next5.map((song, index) => 
            `${index + 1}. "${song.songTitle}" by ${song.artist} (${song.requestedBy})`
          ).join(" | ");

          if (queue.length > 5) {
            return `Next ${next5.length} songs: ${queueList} ... (${queue.length - 5} more)`;
          } else {
            return `Song queue (${queue.length}): ${queueList}`;
          }

        case "!skipsong":
          if (!isModerator) {
            return `@${username}, only moderators can skip songs`;
          }

          const skipped = await songRequestService.skipCurrent(this.userId);
          if (skipped) {
            const next = await songRequestService.playNext(this.userId);
            if (next) {
              return `Song skipped! Now playing: "${next.songTitle}" by ${next.artist}`;
            } else {
              return "Song skipped! Queue is now empty.";
            }
          } else {
            return "No song is currently playing";
          }

        case "!removesong":
          if (!isModerator) {
            return `@${username}, only moderators can remove songs`;
          }

          const position = parseInt(parts[1]);
          if (isNaN(position) || position < 1) {
            return "Usage: !removesong <position>";
          }

          const removed = await songRequestService.removeByPosition(this.userId, position);
          if (removed) {
            return `Removed song at position ${position} from queue`;
          } else {
            return `Invalid position. Check !queue to see current songs.`;
          }

        default:
          return null;
      }
    } catch (error) {
      console.error(`[BotWorker] Error handling song request command:`, error);
      return "Song request error! Please try again later.";
    }
  }

  /**
   * Check if user has required permission level for a command
   * @param requiredPermission - Command permission level: 'broadcaster', 'moderator', 'subscriber', 'everyone'
   * @param userTags - Platform-specific user tags/badges
   * @param username - Username for additional checks
   * @returns true if user has permission, false otherwise
   */
  private checkUserPermission(
    requiredPermission: string,
    userTags: any,
    username: string
  ): boolean {
    // Everyone can use commands with 'everyone' permission
    if (requiredPermission === 'everyone') {
      return true;
    }

    // Extract user roles from tags (works for Twitch, YouTube, Kick)
    const isBroadcaster = userTags?.badges?.broadcaster || userTags?.isBroadcaster || false;
    const isModerator = userTags?.mod || userTags?.badges?.moderator || userTags?.isModerator || false;
    const isSubscriber = userTags?.subscriber || userTags?.badges?.subscriber || userTags?.isSubscriber || false;

    // Broadcaster has access to all commands
    if (isBroadcaster) {
      return true;
    }

    // Check permission hierarchy: broadcaster > moderator > subscriber > everyone
    switch (requiredPermission) {
      case 'broadcaster':
        return isBroadcaster;
      case 'moderator':
      case 'mods':
        return isModerator || isBroadcaster;
      case 'subscriber':
      case 'subs':
        return isSubscriber || isModerator || isBroadcaster;
      default:
        return true; // Default to everyone
    }
  }

  private async executeCustomCommand(
    commandName: string,
    username: string,
    userTags?: any
  ): Promise<string | null> {
    try {
      // Remove ! prefix if present
      const cleanName = commandName.startsWith("!") ? commandName.slice(1) : commandName;
      
      // Get command from database
      const command = await this.storage.getCustomCommandByName(cleanName);
      
      if (!command) {
        return null; // Command doesn't exist
      }

      if (!command.isActive) {
        return null; // Command is disabled
      }

      // Check cooldown
      const now = Date.now();
      const lastUsed = this.commandCooldowns.get(command.id);
      if (lastUsed && command.cooldown > 0) {
        const timeSinceLastUse = (now - lastUsed) / 1000; // seconds
        if (timeSinceLastUse < command.cooldown) {
          return null; // Still on cooldown
        }
      }

      // Check user permissions
      const hasPermission = this.checkUserPermission(
        command.permission || 'everyone',
        userTags,
        username
      );

      if (!hasPermission) {
        // Return permission error message
        const permissionName = command.permission === 'moderator' || command.permission === 'mods'
          ? 'moderators'
          : command.permission === 'subscriber' || command.permission === 'subs'
          ? 'subscribers'
          : command.permission === 'broadcaster'
          ? 'the broadcaster'
          : 'everyone';
        
        return `@${username}, this command is only available to ${permissionName}.`;
      }
      
      // Parse variables in the response
      const context: CommandContext = {
        username,
        usageCount: command.usageCount + 1, // Show the count after increment
        streamStartTime: this.streamStartTime || undefined,
      };
      
      const response = parseCommandVariables(command.response, context);
      
      // Update cooldown and increment usage
      this.commandCooldowns.set(command.id, now);
      await this.storage.incrementCommandUsage(command.id);
      
      return response;
    } catch (error) {
      console.error(`[BotWorker] Error executing command ${commandName}:`, error);
      return null;
    }
  }

  private async handleGiveawayEntry(
    message: string,
    username: string,
    platform: string,
    isSubscriber: boolean = false
  ): Promise<string | null> {
    try {
      const activeGiveaway = await this.storage.getActiveGiveaway();
      
      if (!activeGiveaway) {
        return null; // No active giveaway
      }

      // Check if message matches giveaway keyword
      const lowerMessage = message.toLowerCase().trim();
      const keyword = activeGiveaway.keyword.toLowerCase();
      
      if (lowerMessage !== keyword) {
        return null; // Message doesn't match keyword
      }

      // Try to enter the giveaway
      const result = await giveawayService.enterGiveaway(
        this.userId,
        activeGiveaway.id,
        username,
        platform,
        isSubscriber
      );

      // Emit event for real-time updates
      if (result.success) {
        this.emitEvent({
          type: "giveaway_entry",
          userId: this.userId,
          data: {
            giveawayId: activeGiveaway.id,
            username,
            platform,
            totalEntries: await this.storage.getGiveawayEntries(activeGiveaway.id).then(e => e.length),
          },
        });
      }

      return result.message;
    } catch (error) {
      console.error(`[BotWorker] Error handling giveaway entry:`, error);
      return null;
    }
  }

  async announceGiveawayStart(giveaway: any): Promise<void> {
    try {
      const connections = await this.storage.getPlatformConnections();
      const connectedPlatforms = connections.filter((c) => c.isConnected).map((c) => c.platform);

      const subsText = giveaway.requiresSubscription ? " (Subscribers Only)" : "";
      const winnersText = giveaway.maxWinners === 1 ? "1 winner" : `${giveaway.maxWinners} winners`;
      const message = `🎁 Giveaway Started: "${giveaway.title}"${subsText}! Type ${giveaway.keyword} in chat to enter. Drawing ${winnersText}!`;

      for (const platform of connectedPlatforms) {
        try {
          await this.postToPlatform(platform, message);
          console.log(`[BotWorker] Announced giveaway start on ${platform}`);
        } catch (error) {
          console.error(`[BotWorker] Failed to announce giveaway start on ${platform}:`, error);
        }
      }
    } catch (error) {
      console.error(`[BotWorker] Error announcing giveaway start:`, error);
    }
  }

  async announceGiveawayWinners(giveaway: any, winners: any[]): Promise<void> {
    try {
      const connections = await this.storage.getPlatformConnections();
      const connectedPlatforms = connections.filter((c) => c.isConnected).map((c) => c.platform);

      if (winners.length === 0) {
        const message = `Giveaway "${giveaway.title}" ended with no winners.`;
        for (const platform of connectedPlatforms) {
          try {
            await this.postToPlatform(platform, message);
          } catch (error) {
            console.error(`[BotWorker] Failed to announce giveaway end on ${platform}:`, error);
          }
        }
        return;
      }

      const winnerNames = winners.map((w) => `@${w.username}`).join(", ");
      const message =
        winners.length === 1
          ? `🎉 Giveaway Winner: ${winnerNames}! Congratulations! 🎉`
          : `🎉 Giveaway Winners: ${winnerNames}! Congratulations! 🎉`;

      for (const platform of connectedPlatforms) {
        try {
          await this.postToPlatform(platform, message);
          console.log(`[BotWorker] Announced giveaway winners on ${platform}`);
        } catch (error) {
          console.error(`[BotWorker] Failed to announce giveaway winners on ${platform}:`, error);
        }
      }
    } catch (error) {
      console.error(`[BotWorker] Error announcing giveaway winners:`, error);
    }
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

      // Raid event listener
      this.twitchClient.on("raided", async (channel, username, viewers) => {
        console.log(`[BotWorker] Raid detected: ${username} raided with ${viewers} viewers`);
        
        const shoutoutResponse = await this.handleRaidShoutout(username, "twitch", viewers);
        
        if (shoutoutResponse && this.twitchClient) {
          await this.twitchClient.say(channel, shoutoutResponse);
        }

        try {
          const alertResult = await this.alertsService.triggerAlert(
            this.userId,
            "raid",
            "twitch",
            { raider: username, viewers }
          );
          
          if (alertResult.shouldPost && alertResult.message && this.twitchClient) {
            await this.twitchClient.say(channel, alertResult.message);
          }
        } catch (error) {
          console.error(`[BotWorker] Error triggering raid alert:`, error);
        }
      });

      // Subscription event listener
      this.twitchClient.on("subscription", async (channel, username, methods, message, userstate) => {
        console.log(`[BotWorker] New subscription: ${username}`);
        
        try {
          const alertResult = await this.alertsService.triggerAlert(
            this.userId,
            "subscriber",
            "twitch",
            { username, tier: "Tier 1", months: 1 }
          );
          
          if (alertResult.shouldPost && alertResult.message && this.twitchClient) {
            await this.twitchClient.say(channel, alertResult.message);
          }
        } catch (error) {
          console.error(`[BotWorker] Error triggering subscription alert:`, error);
        }
      });

      // Resubscription event listener
      this.twitchClient.on("resub", async (channel, username, months, message, userstate, methods) => {
        console.log(`[BotWorker] Resubscription: ${username} for ${months} months`);
        
        try {
          const tier = methods?.plan ? `Tier ${methods.plan.replace("000", "")}` : "Tier 1";
          const alertResult = await this.alertsService.triggerAlert(
            this.userId,
            "subscriber",
            "twitch",
            { username, tier, months: months || 1 }
          );
          
          if (alertResult.shouldPost && alertResult.message && this.twitchClient) {
            await this.twitchClient.say(channel, alertResult.message);
          }
        } catch (error) {
          console.error(`[BotWorker] Error triggering resubscription alert:`, error);
        }
      });

      // Host event listener (Note: Twitch deprecated hosting, but keeping for compatibility)
      this.twitchClient.on("hosted", async (channel, username, viewers, autohost) => {
        if (autohost) return; // Skip autohosts
        
        console.log(`[BotWorker] Host detected: ${username} is hosting with ${viewers} viewers`);
        
        const shoutoutResponse = await this.handleHostShoutout(username, "twitch");
        
        if (shoutoutResponse && this.twitchClient) {
          await this.twitchClient.say(channel, shoutoutResponse);
        }
      });

      // NOTE: TMI.js does not support follower events
      // For follower alerts, you need to integrate Twitch EventSub API
      // EventSub provides webhook-based notifications for channel.follow events
      // Requires setting up a webhook endpoint and subscribing to the channel.follow event type
      // See: https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types#channelfollow

      this.twitchClient.on("message", async (channel, tags, message, self) => {
        if (self) return;

        const trimmedMessage = message.trim();
        const username = tags.username || "unknown";
        
        // Track chat message for statistics
        await statsService.trackChatMessage(this.userId, "twitch", username);
        
        // Award currency points for message
        try {
          const currencySettings = await this.storage.getCurrencySettings();
          if (currencySettings && currencySettings.earnPerMessage > 0) {
            await currencyService.addPoints(
              this.userId,
              username,
              "twitch",
              currencySettings.earnPerMessage,
              "Chat message",
              "earn_message"
            );
          }
        } catch (error) {
          console.error(`[BotWorker] Error awarding currency points:`, error);
        }
        
        // Check moderation FIRST, before processing anything
        const moderationResult = await this.checkModeration(trimmedMessage, username, "twitch");
        
        if (!moderationResult.allowed) {
          // Execute moderation action (warn, timeout, or ban)
          if (moderationResult.action) {
            await this.executeModerationAction(
              "twitch",
              username,
              moderationResult.action,
              moderationResult.reason,
              moderationResult.timeoutDuration
            );
          }
          
          return;
        }

        // Check for trivia answer (before commands, so users can answer without !)
        const triviaResponse = await this.handleTriviaAnswer(trimmedMessage, username, "twitch");
        if (triviaResponse && this.twitchClient) {
          await this.twitchClient.say(channel, triviaResponse);
          return;
        }

        // Check for chatbot response (mentions, questions, or random chance)
        // Do this early, before commands, so the chatbot can respond naturally
        if (!trimmedMessage.startsWith("!")) {
          const chatbotResponse = await this.handleChatbotResponse(trimmedMessage, username, "twitch");
          if (chatbotResponse && this.twitchClient) {
            await this.twitchClient.say(channel, chatbotResponse);
            return;
          }
        }
        
        // Check for custom commands (starts with !)
        if (trimmedMessage.startsWith("!")) {
          const commandName = trimmedMessage.split(" ")[0]; // Get first word
          
          // Check for shoutout commands (!so or !shoutout)
          if (commandName === "!so" || commandName === "!shoutout") {
            const shoutoutResponse = await this.executeShoutoutCommand(trimmedMessage, "twitch");
            
            if (shoutoutResponse && this.twitchClient) {
              await this.twitchClient.say(channel, shoutoutResponse);
              return;
            }
          }

          // Check for game commands (!8ball, !trivia, !duel, !slots, !roulette)
          if (["!8ball", "!trivia", "!duel", "!slots", "!roulette"].includes(commandName)) {
            const gameResult = await this.handleGameCommand(trimmedMessage, username, "twitch");
            
            if (gameResult.response && this.twitchClient) {
              await this.twitchClient.say(channel, gameResult.response);
              
              // Handle game timeouts (roulette, duel)
              if (gameResult.shouldTimeout && gameResult.timeoutDuration && gameResult.timeoutUser) {
                const reason = commandName === "!roulette" ? "Lost Russian roulette!" : "Lost duel!";
                await this.twitchClient.timeout(
                  channel,
                  gameResult.timeoutUser,
                  gameResult.timeoutDuration,
                  reason
                );
              }
              return;
            }
          }

          // Check for currency commands (!points, !balance, !gamble, !leaderboard, !redeem, !give)
          if (["!points", "!balance", "!gamble", "!leaderboard", "!redeem", "!give"].includes(commandName)) {
            const currencyResponse = await this.handleCurrencyCommand(trimmedMessage, username, "twitch");
            
            if (currencyResponse && this.twitchClient) {
              await this.twitchClient.say(channel, currencyResponse);
              return;
            }
          }

          // Check for poll commands (!poll, !vote)
          if (["!poll", "!vote"].includes(commandName)) {
            const isMod = !!tags.mod || !!tags.badges?.moderator || !!tags.badges?.broadcaster;
            const pollResponse = await this.handlePollCommand(trimmedMessage, username, "twitch", isMod);
            
            if (pollResponse && this.twitchClient) {
              await this.twitchClient.say(channel, pollResponse);
              return;
            }
          }

          // Check for prediction commands (!predict, !bet)
          if (["!predict", "!bet"].includes(commandName)) {
            const isMod = !!tags.mod || !!tags.badges?.moderator || !!tags.badges?.broadcaster;
            const predictionResponse = await this.handlePredictionCommand(trimmedMessage, username, "twitch", isMod);
            
            if (predictionResponse && this.twitchClient) {
              await this.twitchClient.say(channel, predictionResponse);
              return;
            }
          }

          // Check for song request commands (!songrequest, !sr, !currentsong, !queue, !skipsong, !removesong, !nowplaying)
          if (["!songrequest", "!sr", "!currentsong", "!nowplaying", "!queue", "!skipsong", "!removesong"].includes(commandName)) {
            const isMod = !!tags.mod || !!tags.badges?.moderator || !!tags.badges?.broadcaster;
            const songResponse = await this.handleSongRequestCommand(trimmedMessage, username, isMod);
            
            if (songResponse && this.twitchClient) {
              await this.twitchClient.say(channel, songResponse);
              return;
            }
          }
          
          const response = await this.executeCustomCommand(commandName, username, tags);
          
          if (response && this.twitchClient) {
            await this.twitchClient.say(channel, response);
            return; // Don't check keywords if command was executed
          }

          // Check for giveaway entry if no custom command matched
          const isSubscriber = !!tags.subscriber || !!tags.badges?.subscriber;
          const giveawayResponse = await this.handleGiveawayEntry(
            trimmedMessage,
            username,
            "twitch",
            isSubscriber
          );
          
          if (giveawayResponse && this.twitchClient) {
            await this.twitchClient.say(channel, giveawayResponse);
            return; // Don't check keywords if giveaway entry was processed
          }
        }

        // Check for Snapple fact keywords
        const lowerMessage = trimmedMessage.toLowerCase();
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
      this.kickChannelSlug = channelName;
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
        this.kickClientReady = true;
        console.log(`[BotWorker] Kick bot connected for user ${this.userId} (${channelName})`);
      });

      this.kickClient.on("ChatMessage", async (message: any) => {
        const trimmedContent = message.content.trim();
        const username = message.sender.username || "unknown";
        
        // Track chat message for statistics
        await statsService.trackChatMessage(this.userId, "kick", username);
        
        // Check moderation FIRST, before processing anything
        const moderationResult = await this.checkModeration(trimmedContent, username, "kick");
        
        if (!moderationResult.allowed) {
          // Execute moderation action (warn, timeout, or ban)
          if (moderationResult.action) {
            await this.executeModerationAction(
              "kick",
              username,
              moderationResult.action,
              moderationResult.reason,
              moderationResult.timeoutDuration
            );
          }
          
          return;
        }
        
        // Check for custom commands (starts with !)
        if (trimmedContent.startsWith("!")) {
          const commandName = trimmedContent.split(" ")[0]; // Get first word
          const response = await this.executeCustomCommand(commandName, message.sender.username);
          
          if (response && this.kickClient && this.kickClientReady && this.kickChannelSlug) {
            await this.kickClient.sendMessage(response);
            return; // Don't check keywords if command was executed
          } else if (response && this.kickClient && !this.kickClientReady) {
            console.log(`[BotWorker] Skipping Kick message send - client not ready yet (user ${this.userId})`);
          }

          // Check for giveaway entry if no custom command matched
          const isSubscriber = message.sender.badges?.some((b: any) => b.type === "subscriber") || false;
          const giveawayResponse = await this.handleGiveawayEntry(
            trimmedContent,
            message.sender.username,
            "kick",
            isSubscriber
          );
          
          if (giveawayResponse && this.kickClient && this.kickClientReady) {
            await this.kickClient.sendMessage(giveawayResponse);
            return; // Don't check keywords if giveaway entry was processed
          }
        }

        // Check for Snapple fact keywords
        const lowerMessage = trimmedContent.toLowerCase();
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
    const model = config?.aiModel || "gpt-4o";
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
        if (this.kickClient && this.kickClientReady && this.kickChannelSlug) {
          await this.kickClient.sendMessage(message);
        } else {
          const reason = !this.kickClient ? "not connected" : !this.kickClientReady ? "not ready" : "missing channel slug";
          console.log(`[BotWorker] Kick client ${reason} for user ${this.userId}`);
          throw new Error(`Kick client not connected or not ready (${reason})`);
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

  private startViewerTracking() {
    // Track viewer counts every 5 minutes
    const FIVE_MINUTES = 5 * 60 * 1000;
    
    // Track immediately on start
    this.fetchViewerCounts();
    
    // Then track every 5 minutes
    this.viewerTrackingInterval = setInterval(async () => {
      if (this.isRunning) {
        await this.fetchViewerCounts();
      }
    }, FIVE_MINUTES);
  }

  private async fetchViewerCounts() {
    for (const platform of Array.from(this.activePlatforms)) {
      try {
        let viewerCount = 0;
        
        switch (platform) {
          case "twitch":
            viewerCount = await this.fetchTwitchViewerCount();
            break;
          case "youtube":
            viewerCount = await this.fetchYouTubeViewerCount();
            break;
          case "kick":
            viewerCount = await this.fetchKickViewerCount();
            break;
        }
        
        await statsService.trackViewerCount(this.userId, platform, viewerCount);
        console.log(`[BotWorker] Tracked ${viewerCount} viewers for ${platform}`);
      } catch (error) {
        console.error(`[BotWorker] Error fetching viewer count for ${platform}:`, error);
      }
    }
  }

  private async fetchTwitchViewerCount(): Promise<number> {
    try {
      const connection = await this.storage.getPlatformConnectionByPlatform("twitch");
      if (!connection?.platformUsername) return 0;

      const info = await streamerInfoService.fetchTwitchStreamerInfo(connection.platformUsername);
      return info?.viewers || 0;
    } catch (error) {
      console.error(`[BotWorker] Error fetching Twitch viewer count:`, error);
      return 0;
    }
  }

  private async fetchYouTubeViewerCount(): Promise<number> {
    try {
      const connection = await this.storage.getPlatformConnectionByPlatform("youtube");
      if (!connection?.channelId) return 0;

      const info = await streamerInfoService.fetchYouTubeChannelInfo(connection.channelId);
      return info?.viewers || 0;
    } catch (error) {
      console.error(`[BotWorker] Error fetching YouTube viewer count:`, error);
      return 0;
    }
  }

  private async fetchKickViewerCount(): Promise<number> {
    try {
      const connection = await this.storage.getPlatformConnectionByPlatform("kick");
      if (!connection?.platformUsername) return 0;

      const info = await streamerInfoService.fetchKickChannelInfo(connection.platformUsername);
      return info?.viewers || 0;
    } catch (error) {
      console.error(`[BotWorker] Error fetching Kick viewer count:`, error);
      return 0;
    }
  }

  private async handleCurrencyCommand(
    message: string,
    username: string,
    platform: string
  ): Promise<string | null> {
    try {
      const parts = message.trim().split(/\s+/);
      const command = parts[0].toLowerCase();
      
      const currencySettings = await this.storage.getCurrencySettings();
      const symbol = currencySettings?.currencySymbol || "⭐";
      const currencyName = currencySettings?.currencyName || "Points";

      if (command === "!balance" || command === "!points") {
        const balance = await currencyService.getBalance(this.userId, username, platform);
        if (balance) {
          return `@${username}, you have ${balance.balance} ${symbol} ${currencyName}!`;
        } else {
          return `@${username}, you have 0 ${symbol} ${currencyName}!`;
        }
      }

      if (command === "!give") {
        const toUser = parts[1];
        const amountStr = parts[2];
        
        if (!toUser || !amountStr) {
          return `@${username}, usage: !give @username <amount>`;
        }
        
        const amount = parseInt(amountStr);
        if (isNaN(amount) || amount <= 0) {
          return `@${username}, please enter a valid amount!`;
        }
        
        const targetUsername = toUser.replace("@", "");
        
        const result = await currencyService.transferPoints(
          this.userId,
          username,
          targetUsername,
          platform,
          amount
        );
        
        if (!result.success) {
          return `@${username}, ${result.error}`;
        }
        
        return `@${username} gave ${amount} ${symbol} to @${targetUsername}! You have ${result.fromBalance} ${symbol} remaining.`;
      }

      if (command === "!leaderboard") {
        const leaderboard = await currencyService.getLeaderboard(this.userId, 10);
        if (leaderboard.length === 0) {
          return "The leaderboard is empty!";
        }
        
        const top5 = leaderboard.slice(0, 5);
        const leaderboardText = top5
          .map((entry, index) => `${index + 1}. ${entry.username}: ${entry.balance} ${symbol}`)
          .join(" | ");
        
        return `💰 Top ${currencyName}: ${leaderboardText}`;
      }

      if (command === "!gamble") {
        if (!currencySettings?.enableGambling) {
          return `@${username}, gambling is currently disabled!`;
        }

        const wagerStr = parts[1];
        if (!wagerStr) {
          return `@${username}, please specify an amount to gamble! Usage: !gamble <amount>`;
        }

        const wager = parseInt(wagerStr);
        if (isNaN(wager) || wager <= 0) {
          return `@${username}, please enter a valid amount!`;
        }

        const result = await currencyService.gamblePoints(
          this.userId,
          username,
          platform,
          wager
        );

        if (!result.success) {
          return `@${username}, ${result.error}`;
        }

        if (result.won) {
          return `@${username} won ${wager} ${symbol}! You now have ${result.newBalance} ${symbol}! 🎉`;
        } else {
          return `@${username} lost ${wager} ${symbol}! You now have ${result.newBalance} ${symbol}. 😢`;
        }
      }

      if (command === "!redeem") {
        const rewardName = parts.slice(1).join(" ");
        if (!rewardName) {
          return `@${username}, please specify a reward to redeem! Usage: !redeem <reward name>`;
        }

        // Find reward by name
        const rewards = await this.storage.getCurrencyRewards();
        const reward = rewards.find(
          r => r.rewardName.toLowerCase() === rewardName.toLowerCase() && r.isActive
        );

        if (!reward) {
          return `@${username}, reward "${rewardName}" not found!`;
        }

        const result = await currencyService.redeemReward(
          this.userId,
          username,
          platform,
          reward.id
        );

        if (!result.success) {
          return `@${username}, ${result.error}`;
        }

        return `@${username} redeemed "${reward.rewardName}" for ${reward.cost} ${symbol}! You have ${result.newBalance} ${symbol} remaining.`;
      }

      return null;
    } catch (error) {
      console.error(`[BotWorker] Error handling currency command:`, error);
      return null;
    }
  }

  private async handlePollCommand(
    message: string,
    username: string,
    platform: string,
    isMod: boolean
  ): Promise<string | null> {
    try {
      const parts = message.trim().split(/\s+/);
      const command = parts[0].toLowerCase();

      if (command === "!poll") {
        if (!isMod) {
          return `@${username}, only moderators can create polls!`;
        }

        const activePoll = await this.pollsService.getActivePoll(this.userId, platform);
        if (activePoll) {
          return `@${username}, there is already an active poll! End it with /endpoll before creating a new one.`;
        }

        const questionAndOptions = parts.slice(1).join(" ");
        const matches = questionAndOptions.match(/"([^"]+)"/g);

        if (!matches || matches.length < 3) {
          return `@${username}, usage: !poll "Question?" "Option 1" "Option 2" ["Option 3"] ["Option 4"] ["Option 5"]`;
        }

        const question = matches[0].replace(/"/g, "");
        const options = matches.slice(1).map(opt => opt.replace(/"/g, ""));

        if (options.length < 2) {
          return `@${username}, a poll needs at least 2 options!`;
        }

        if (options.length > 5) {
          return `@${username}, a poll can have at most 5 options!`;
        }

        const durationSeconds = 120; // Default 2 minutes
        const poll = await this.pollsService.createPoll(
          this.userId,
          question,
          options,
          durationSeconds,
          platform
        );

        const { message: startMessage } = await this.pollsService.startPoll(poll.id);

        return startMessage;
      }

      if (command === "!vote") {
        const activePoll = await this.pollsService.getActivePoll(this.userId, platform);
        if (!activePoll) {
          return `@${username}, there is no active poll!`;
        }

        const optionInput = parts[1];
        if (!optionInput) {
          return `@${username}, usage: !vote <number> or !vote "<option text>"`;
        }

        let selectedOption: string;
        const optionNumber = parseInt(optionInput);

        if (!isNaN(optionNumber)) {
          if (optionNumber < 1 || optionNumber > activePoll.options.length) {
            return `@${username}, please enter a valid option number (1-${activePoll.options.length})!`;
          }
          selectedOption = activePoll.options[optionNumber - 1];
        } else {
          const optionText = parts.slice(1).join(" ").replace(/"/g, "");
          if (!activePoll.options.includes(optionText)) {
            return `@${username}, invalid option! Options: ${activePoll.options.map((opt, i) => `${i + 1}. ${opt}`).join(" | ")}`;
          }
          selectedOption = optionText;
        }

        const result = await this.pollsService.vote(
          activePoll.id,
          username,
          selectedOption,
          platform
        );

        return `@${username}, ${result.message}`;
      }

      return null;
    } catch (error) {
      console.error(`[BotWorker] Error handling poll command:`, error);
      return null;
    }
  }

  private async handlePredictionCommand(
    message: string,
    username: string,
    platform: string,
    isMod: boolean
  ): Promise<string | null> {
    try {
      const parts = message.trim().split(/\s+/);
      const command = parts[0].toLowerCase();

      if (command === "!predict") {
        if (!isMod) {
          return `@${username}, only moderators can create predictions!`;
        }

        const activePrediction = await this.pollsService.getActivePrediction(this.userId, platform);
        if (activePrediction) {
          return `@${username}, there is already an active prediction! Resolve it before creating a new one.`;
        }

        const titleAndOutcomes = parts.slice(1).join(" ");
        const matches = titleAndOutcomes.match(/"([^"]+)"/g);

        if (!matches || matches.length < 3) {
          return `@${username}, usage: !predict "Title" "Outcome 1" "Outcome 2" ["Outcome 3"] ...`;
        }

        const title = matches[0].replace(/"/g, "");
        const outcomes = matches.slice(1).map(opt => opt.replace(/"/g, ""));

        if (outcomes.length < 2) {
          return `@${username}, a prediction needs at least 2 outcomes!`;
        }

        if (outcomes.length > 10) {
          return `@${username}, a prediction can have at most 10 outcomes!`;
        }

        const durationSeconds = 300; // Default 5 minutes
        const prediction = await this.pollsService.createPrediction(
          this.userId,
          title,
          outcomes,
          durationSeconds,
          platform
        );

        const { message: startMessage } = await this.pollsService.startPrediction(prediction.id);

        return startMessage;
      }

      if (command === "!bet") {
        const activePrediction = await this.pollsService.getActivePrediction(this.userId, platform);
        if (!activePrediction) {
          return `@${username}, there is no active prediction!`;
        }

        if (activePrediction.status === "locked") {
          return `@${username}, betting is closed for this prediction!`;
        }

        const outcomeInput = parts.slice(1, -1).join(" ");
        const pointsStr = parts[parts.length - 1];

        if (!outcomeInput || !pointsStr) {
          return `@${username}, usage: !bet <outcome> <points> or !bet <number> <points>`;
        }

        const points = parseInt(pointsStr);
        if (isNaN(points) || points <= 0) {
          return `@${username}, please enter a valid amount of points!`;
        }

        let selectedOutcome: string;
        const outcomeNumber = parseInt(outcomeInput);

        if (!isNaN(outcomeNumber)) {
          if (outcomeNumber < 1 || outcomeNumber > activePrediction.outcomes.length) {
            return `@${username}, please enter a valid outcome number (1-${activePrediction.outcomes.length})!`;
          }
          selectedOutcome = activePrediction.outcomes[outcomeNumber - 1];
        } else {
          if (!activePrediction.outcomes.includes(outcomeInput)) {
            return `@${username}, invalid outcome! Outcomes: ${activePrediction.outcomes.map((opt, i) => `${i + 1}. ${opt}`).join(" | ")}`;
          }
          selectedOutcome = outcomeInput;
        }

        const result = await this.pollsService.placeBet(
          activePrediction.id,
          username,
          selectedOutcome,
          points,
          platform
        );

        return `@${username}, ${result.message}`;
      }

      return null;
    } catch (error) {
      console.error(`[BotWorker] Error handling prediction command:`, error);
      return null;
    }
  }

  private emitEvent(event: BotEvent) {
    this.onEvent(event);
  }
}
