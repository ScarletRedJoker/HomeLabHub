// Reference: javascript_database blueprint
import {
  users,
  platformConnections,
  botConfigs,
  messageHistory,
  customCommands,
  commandAliases,
  moderationRules,
  moderationLogs,
  linkWhitelist,
  giveaways,
  giveawayEntries,
  giveawayWinners,
  shoutouts,
  shoutoutSettings,
  shoutoutHistory,
  gameSettings,
  gameHistory,
  activeTriviaQuestions,
  gameStats,
  currencySettings,
  currencyRewards,
  alertSettings,
  alertHistory,
  milestones,
  streamAlerts,
  streamAlertHistory,
  chatbotSettings,
  chatbotResponses,
  chatbotContext,
  chatbotPersonalities,
  polls,
  pollVotes,
  predictions,
  predictionBets,
  type PlatformConnection,
  type BotConfig,
  type MessageHistory,
  type CustomCommand,
  type CommandAlias,
  type ModerationRule,
  type ModerationLog,
  type LinkWhitelist,
  type Giveaway,
  type GiveawayEntry,
  type GiveawayWinner,
  type Shoutout,
  type ShoutoutSettings,
  type ShoutoutHistory,
  type GameSettings,
  type GameHistory,
  type ActiveTriviaQuestion,
  type GameStats,
  type CurrencySettings,
  type CurrencyReward,
  type AlertSettings,
  type AlertHistory,
  type Milestone,
  type StreamAlert,
  type StreamAlertHistory,
  type ChatbotSettings,
  type ChatbotResponse,
  type ChatbotContext,
  type ChatbotPersonality,
  type Poll,
  type PollVote,
  type Prediction,
  type PredictionBet,
  type InsertPlatformConnection,
  type InsertBotConfig,
  type InsertMessageHistory,
  type InsertCustomCommand,
  type InsertCommandAlias,
  type InsertModerationRule,
  type InsertModerationLog,
  type InsertLinkWhitelist,
  type InsertGiveaway,
  type InsertGiveawayEntry,
  type InsertGiveawayWinner,
  type InsertShoutout,
  type InsertShoutoutSettings,
  type InsertShoutoutHistory,
  type InsertGameSettings,
  type InsertGameHistory,
  type InsertActiveTriviaQuestion,
  type InsertGameStats,
  type InsertCurrencySettings,
  type InsertCurrencyReward,
  type InsertAlertSettings,
  type InsertAlertHistory,
  type InsertMilestone,
  type InsertStreamAlert,
  type InsertStreamAlertHistory,
  type InsertChatbotSettings,
  type InsertChatbotResponse,
  type InsertChatbotContext,
  type InsertChatbotPersonality,
  type InsertPoll,
  type InsertPollVote,
  type InsertPrediction,
  type InsertPredictionBet,
  type UpdateBotConfig,
  type UpdatePlatformConnection,
  type UpdateCustomCommand,
  type UpdateModerationRule,
  type UpdateGiveaway,
  type UpdateShoutout,
  type UpdateShoutoutSettings,
  type UpdateGameSettings,
  type UpdateGameStats,
  type UpdateCurrencySettings,
  type UpdateCurrencyReward,
  type UpdateAlertSettings,
  type UpdateMilestone,
  type UpdateStreamAlert,
  type UpdatePoll,
  type UpdatePrediction,
  type UpdatePredictionBet,
} from "@shared/schema";

type UpdateChatbotSettings = Partial<Omit<ChatbotSettings, 'id' | 'userId' | 'createdAt'>>;
type UpdateChatbotResponse = Partial<Omit<ChatbotResponse, 'id' | 'userId' | 'createdAt'>>;
type UpdateChatbotContext = Partial<Omit<ChatbotContext, 'id' | 'userId' | 'createdAt'>>;
type UpdateChatbotPersonality = Partial<Omit<ChatbotPersonality, 'id' | 'userId' | 'createdAt'>>;
import { db } from "./db";
import { eq, desc, gte, lt, sql, and } from "drizzle-orm";
import { UserStorage } from "./user-storage";

export interface IStorage {
  // Platform Connections
  getPlatformConnections(userId: string): Promise<PlatformConnection[]>;
  getPlatformConnection(userId: string, id: string): Promise<PlatformConnection | undefined>;
  getPlatformConnectionByPlatform(userId: string, platform: string): Promise<PlatformConnection | undefined>;
  createPlatformConnection(userId: string, data: InsertPlatformConnection): Promise<PlatformConnection>;
  updatePlatformConnection(userId: string, id: string, data: UpdatePlatformConnection): Promise<PlatformConnection>;
  deletePlatformConnection(userId: string, id: string): Promise<void>;

  // Bot Config (new naming)
  getBotConfig(userId: string): Promise<BotConfig | undefined>;
  createBotConfig(userId: string, data: InsertBotConfig): Promise<BotConfig>;
  updateBotConfig(userId: string, data: UpdateBotConfig): Promise<BotConfig>;

  // Bot Settings (backward compatibility aliases)
  getBotSettings(userId: string): Promise<BotConfig | undefined>;
  createBotSettings(userId: string, data: InsertBotConfig): Promise<BotConfig>;
  updateBotSettings(userId: string, data: UpdateBotConfig): Promise<BotConfig>;

  // Message History
  getMessages(userId: string): Promise<MessageHistory[]>;
  getRecentMessages(userId: string, limit: number): Promise<MessageHistory[]>;
  createMessage(userId: string, data: InsertMessageHistory): Promise<MessageHistory>;
  getMessageStats(userId: string): Promise<{
    totalMessages: number;
    messagesThisWeek: number;
    activePlatforms: number;
  }>;

  // Custom Commands
  getCustomCommands(userId: string): Promise<CustomCommand[]>;
  getCustomCommand(userId: string, id: string): Promise<CustomCommand | undefined>;
  getCustomCommandByName(userId: string, name: string): Promise<CustomCommand | undefined>;
  createCustomCommand(userId: string, data: InsertCustomCommand): Promise<CustomCommand>;
  updateCustomCommand(userId: string, id: string, data: UpdateCustomCommand): Promise<CustomCommand>;
  deleteCustomCommand(userId: string, id: string): Promise<void>;
  incrementCommandUsage(userId: string, id: string): Promise<void>;
  getCommandStats(userId: string, id: string): Promise<{
    usageCount: number;
    lastUsedAt: Date | null;
    createdAt: Date;
  }>;

  // Moderation Rules
  getModerationRules(userId: string): Promise<ModerationRule[]>;
  getModerationRule(userId: string, id: string): Promise<ModerationRule | undefined>;
  getModerationRuleByType(userId: string, ruleType: string): Promise<ModerationRule | undefined>;
  createModerationRule(userId: string, data: InsertModerationRule): Promise<ModerationRule>;
  updateModerationRule(userId: string, id: string, data: UpdateModerationRule): Promise<ModerationRule>;
  deleteModerationRule(userId: string, id: string): Promise<void>;
  initializeDefaultModerationRules(userId: string): Promise<ModerationRule[]>;

  // Moderation Logs
  getModerationLogs(userId: string, limit?: number): Promise<ModerationLog[]>;
  createModerationLog(userId: string, data: InsertModerationLog): Promise<ModerationLog>;
  getModerationStats(userId: string): Promise<{
    totalModerated: number;
    moderatedToday: number;
    moderatedThisWeek: number;
    byAction: { action: string; count: number }[];
  }>;

  // Link Whitelist
  getLinkWhitelist(userId: string): Promise<LinkWhitelist[]>;
  addToLinkWhitelist(userId: string, domain: string): Promise<LinkWhitelist>;
  removeFromLinkWhitelist(userId: string, domain: string): Promise<void>;

  // Giveaways
  getGiveaways(userId: string, limit?: number): Promise<Giveaway[]>;
  getGiveaway(userId: string, id: string): Promise<Giveaway | undefined>;
  getActiveGiveaway(userId: string): Promise<Giveaway | undefined>;
  createGiveaway(userId: string, data: InsertGiveaway): Promise<Giveaway>;
  updateGiveaway(userId: string, id: string, data: UpdateGiveaway): Promise<Giveaway>;
  deleteGiveaway(userId: string, id: string): Promise<void>;

  // Giveaway Entries
  getGiveawayEntries(giveawayId: string): Promise<GiveawayEntry[]>;
  getGiveawayEntryByUsername(giveawayId: string, username: string, platform: string): Promise<GiveawayEntry | undefined>;
  createGiveawayEntry(userId: string, data: InsertGiveawayEntry): Promise<GiveawayEntry>;

  // Giveaway Winners
  getGiveawayWinners(giveawayId: string): Promise<GiveawayWinner[]>;
  createGiveawayWinner(data: InsertGiveawayWinner): Promise<GiveawayWinner>;

  // Shoutouts
  getShoutouts(userId: string, limit?: number): Promise<Shoutout[]>;
  getShoutout(userId: string, id: string): Promise<Shoutout | undefined>;
  getShoutoutByTarget(userId: string, targetUsername: string, targetPlatform: string): Promise<Shoutout | undefined>;
  createShoutout(userId: string, data: InsertShoutout): Promise<Shoutout>;
  updateShoutout(userId: string, id: string, data: UpdateShoutout): Promise<Shoutout>;
  deleteShoutout(userId: string, id: string): Promise<void>;

  // Shoutout Settings
  getShoutoutSettings(userId: string): Promise<ShoutoutSettings | undefined>;
  createShoutoutSettings(userId: string, data: InsertShoutoutSettings): Promise<ShoutoutSettings>;
  updateShoutoutSettings(userId: string, data: UpdateShoutoutSettings): Promise<ShoutoutSettings>;

  // Shoutout History
  getShoutoutHistory(userId: string, limit?: number): Promise<ShoutoutHistory[]>;
  createShoutoutHistory(data: InsertShoutoutHistory): Promise<ShoutoutHistory>;

  // Game Settings
  getGameSettings(userId: string): Promise<GameSettings | undefined>;
  createGameSettings(userId: string, data: InsertGameSettings): Promise<GameSettings>;
  updateGameSettings(userId: string, data: UpdateGameSettings): Promise<GameSettings>;

  // Game History
  getGameHistory(userId: string, limit?: number): Promise<GameHistory[]>;
  getGameHistoryByType(userId: string, gameType: string, limit?: number): Promise<GameHistory[]>;
  createGameHistory(data: InsertGameHistory): Promise<GameHistory>;

  // Active Trivia Questions
  getActiveTriviaQuestion(userId: string, player: string, platform: string): Promise<ActiveTriviaQuestion | undefined>;
  createActiveTriviaQuestion(data: InsertActiveTriviaQuestion): Promise<ActiveTriviaQuestion>;
  deleteActiveTriviaQuestion(id: string): Promise<void>;
  cleanupExpiredTriviaQuestions(): Promise<void>;

  // Game Stats
  getGameStats(userId: string, limit?: number): Promise<GameStats[]>;
  getGameStatsByGame(userId: string, gameName: string, limit?: number): Promise<GameStats[]>;
  getGameStatsByPlayer(userId: string, username: string, platform: string): Promise<GameStats[]>;
  getGameLeaderboard(userId: string, gameName: string, limit?: number): Promise<GameStats[]>;
  upsertGameStats(data: InsertGameStats): Promise<GameStats>;

  // Currency Settings
  getCurrencySettings(userId: string): Promise<CurrencySettings | undefined>;
  createCurrencySettings(userId: string, data: InsertCurrencySettings): Promise<CurrencySettings>;
  updateCurrencySettings(userId: string, data: UpdateCurrencySettings): Promise<CurrencySettings>;

  // Currency Rewards
  getCurrencyRewards(userId: string): Promise<CurrencyReward[]>;
  getCurrencyReward(userId: string, id: string): Promise<CurrencyReward | undefined>;
  createCurrencyReward(userId: string, data: InsertCurrencyReward): Promise<CurrencyReward>;
  updateCurrencyReward(userId: string, id: string, data: UpdateCurrencyReward): Promise<CurrencyReward>;
  deleteCurrencyReward(userId: string, id: string): Promise<void>;

  // Alert Settings
  getAlertSettings(userId: string): Promise<AlertSettings | undefined>;
  createAlertSettings(userId: string, data: InsertAlertSettings): Promise<AlertSettings>;
  updateAlertSettings(userId: string, data: UpdateAlertSettings): Promise<AlertSettings>;

  // Alert History
  getAlertHistory(userId: string, alertType?: string, limit?: number): Promise<AlertHistory[]>;
  createAlertHistory(data: InsertAlertHistory): Promise<AlertHistory>;

  // Milestones
  getMilestones(userId: string, milestoneType?: string): Promise<Milestone[]>;
  getMilestone(userId: string, milestoneType: string, threshold: number): Promise<Milestone | undefined>;
  createMilestone(data: InsertMilestone): Promise<Milestone>;
  updateMilestone(userId: string, id: string, data: UpdateMilestone): Promise<Milestone>;

  // Stream Alerts (OBS overlay-style alerts)
  getStreamAlerts(userId: string): Promise<StreamAlert[]>;
  getStreamAlert(userId: string, id: string): Promise<StreamAlert | undefined>;
  getStreamAlertByType(userId: string, alertType: string): Promise<StreamAlert | undefined>;
  createStreamAlert(userId: string, data: InsertStreamAlert): Promise<StreamAlert>;
  updateStreamAlert(userId: string, id: string, data: UpdateStreamAlert): Promise<StreamAlert>;
  deleteStreamAlert(userId: string, id: string): Promise<void>;

  // Stream Alert History
  getStreamAlertHistory(userId: string, alertType?: string, limit?: number): Promise<StreamAlertHistory[]>;
  createStreamAlertHistory(data: InsertStreamAlertHistory): Promise<StreamAlertHistory>;

  // Chatbot Settings
  getChatbotSettings(userId: string): Promise<ChatbotSettings | undefined>;
  createChatbotSettings(userId: string, data: InsertChatbotSettings): Promise<ChatbotSettings>;
  updateChatbotSettings(userId: string, data: UpdateChatbotSettings): Promise<ChatbotSettings>;

  // Chatbot Responses
  getChatbotResponses(userId: string, limit?: number): Promise<ChatbotResponse[]>;
  getChatbotResponse(userId: string, id: string): Promise<ChatbotResponse | undefined>;
  createChatbotResponse(userId: string, data: InsertChatbotResponse): Promise<ChatbotResponse>;
  updateChatbotResponse(userId: string, id: string, data: UpdateChatbotResponse): Promise<ChatbotResponse>;

  // Chatbot Context
  getChatbotContext(userId: string, username: string, platform: string): Promise<ChatbotContext | undefined>;
  getAllChatbotContexts(userId: string, limit?: number): Promise<ChatbotContext[]>;
  createChatbotContext(userId: string, data: InsertChatbotContext): Promise<ChatbotContext>;
  updateChatbotContext(userId: string, id: string, data: UpdateChatbotContext): Promise<ChatbotContext>;

  // Chatbot Personalities
  getChatbotPersonalities(userId: string): Promise<ChatbotPersonality[]>;
  getChatbotPersonality(userId: string, id: string): Promise<ChatbotPersonality | undefined>;
  getChatbotPersonalityByName(userId: string, name: string): Promise<ChatbotPersonality | undefined>;
  createChatbotPersonality(userId: string, data: InsertChatbotPersonality): Promise<ChatbotPersonality>;
  updateChatbotPersonality(userId: string, id: string, data: UpdateChatbotPersonality): Promise<ChatbotPersonality>;
  deleteChatbotPersonality(userId: string, id: string): Promise<void>;
  getPresetPersonalities(): Promise<ChatbotPersonality[]>;
}

export class DatabaseStorage implements IStorage {
  // Platform Connections
  async getPlatformConnections(userId: string): Promise<PlatformConnection[]> {
    return await db
      .select()
      .from(platformConnections)
      .where(eq(platformConnections.userId, userId));
  }

  async getPlatformConnection(userId: string, id: string): Promise<PlatformConnection | undefined> {
    const [connection] = await db
      .select()
      .from(platformConnections)
      .where(
        and(
          eq(platformConnections.userId, userId),
          eq(platformConnections.id, id)
        )
      );
    return connection || undefined;
  }

  async getPlatformConnectionByPlatform(userId: string, platform: string): Promise<PlatformConnection | undefined> {
    const [connection] = await db
      .select()
      .from(platformConnections)
      .where(
        and(
          eq(platformConnections.userId, userId),
          eq(platformConnections.platform, platform)
        )
      );
    return connection || undefined;
  }

  async createPlatformConnection(userId: string, data: InsertPlatformConnection): Promise<PlatformConnection> {
    const [connection] = await db
      .insert(platformConnections)
      .values({
        ...data,
        userId,
        // Convert ISO string dates to Date objects if needed
        lastConnectedAt: data.lastConnectedAt ? new Date(data.lastConnectedAt as any) : undefined,
        tokenExpiresAt: data.tokenExpiresAt ? new Date(data.tokenExpiresAt as any) : undefined,
        updatedAt: new Date(),
      })
      .returning();
    return connection;
  }

  async updatePlatformConnection(userId: string, id: string, data: UpdatePlatformConnection): Promise<PlatformConnection> {
    const { userId: _userId, ...safeData } = data as any;
    
    const [connection] = await db
      .update(platformConnections)
      .set({
        ...safeData,
        // Convert ISO string dates to Date objects if needed
        lastConnectedAt: safeData.lastConnectedAt ? new Date(safeData.lastConnectedAt as any) : undefined,
        tokenExpiresAt: safeData.tokenExpiresAt ? new Date(safeData.tokenExpiresAt as any) : undefined,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(platformConnections.userId, userId),
          eq(platformConnections.id, id)
        )
      )
      .returning();
    return connection;
  }

  async deletePlatformConnection(userId: string, id: string): Promise<void> {
    await db
      .delete(platformConnections)
      .where(
        and(
          eq(platformConnections.userId, userId),
          eq(platformConnections.id, id)
        )
      );
  }

  // Bot Config (new naming)
  async getBotConfig(userId: string): Promise<BotConfig | undefined> {
    const [config] = await db
      .select()
      .from(botConfigs)
      .where(eq(botConfigs.userId, userId))
      .limit(1);
    return config || undefined;
  }

  async createBotConfig(userId: string, data: InsertBotConfig): Promise<BotConfig> {
    const [config] = await db
      .insert(botConfigs)
      .values({
        ...data,
        userId,
        updatedAt: new Date(),
      })
      .returning();
    return config;
  }

  async updateBotConfig(userId: string, data: UpdateBotConfig): Promise<BotConfig> {
    // Strip immutable fields from update data to prevent privilege escalation
    const { userId: _userId, ...safeData } = data as any;
    
    // Get existing config or create if not exists
    let existing = await this.getBotConfig(userId);
    
    if (!existing) {
      // Create default config if none exists
      existing = await this.createBotConfig(userId, {
        userId,
        intervalMode: "manual",
        aiModel: "gpt-4o",
        enableChatTriggers: true,
        chatKeywords: ["!snapple", "!fact"],
        activePlatforms: [],
        isActive: false,
      });
    }

    const [config] = await db
      .update(botConfigs)
      .set({
        ...safeData,
        updatedAt: new Date(),
      })
      .where(eq(botConfigs.id, existing.id))
      .returning();
    return config;
  }

  // Bot Settings (backward compatibility aliases)
  async getBotSettings(userId: string): Promise<BotConfig | undefined> {
    return this.getBotConfig(userId);
  }

  async createBotSettings(userId: string, data: InsertBotConfig): Promise<BotConfig> {
    return this.createBotConfig(userId, data);
  }

  async updateBotSettings(userId: string, data: UpdateBotConfig): Promise<BotConfig> {
    return this.updateBotConfig(userId, data);
  }

  // Message History
  async getMessages(userId: string): Promise<MessageHistory[]> {
    return await db
      .select()
      .from(messageHistory)
      .where(eq(messageHistory.userId, userId))
      .orderBy(desc(messageHistory.postedAt));
  }

  async getRecentMessages(userId: string, limit: number = 20): Promise<MessageHistory[]> {
    return await db
      .select()
      .from(messageHistory)
      .where(eq(messageHistory.userId, userId))
      .orderBy(desc(messageHistory.postedAt))
      .limit(limit);
  }

  async createMessage(userId: string, data: InsertMessageHistory): Promise<MessageHistory> {
    const [message] = await db
      .insert(messageHistory)
      .values({
        ...data,
        userId,
      })
      .returning();
    return message;
  }

  async getMessageStats(userId: string): Promise<{
    totalMessages: number;
    messagesThisWeek: number;
    activePlatforms: number;
  }> {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messageHistory)
      .where(eq(messageHistory.userId, userId));

    const [weekResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messageHistory)
      .where(
        and(
          eq(messageHistory.userId, userId),
          gte(messageHistory.postedAt, weekAgo)
        )
      );

    const [platformsResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(platformConnections)
      .where(
        and(
          eq(platformConnections.userId, userId),
          eq(platformConnections.isConnected, true)
        )
      );

    return {
      totalMessages: totalResult?.count || 0,
      messagesThisWeek: weekResult?.count || 0,
      activePlatforms: platformsResult?.count || 0,
    };
  }

  // Custom Commands
  async getCustomCommands(userId: string): Promise<CustomCommand[]> {
    return await db
      .select()
      .from(customCommands)
      .where(eq(customCommands.userId, userId))
      .orderBy(desc(customCommands.createdAt));
  }

  async getCustomCommand(userId: string, id: string): Promise<CustomCommand | undefined> {
    const [command] = await db
      .select()
      .from(customCommands)
      .where(
        and(
          eq(customCommands.userId, userId),
          eq(customCommands.id, id)
        )
      );
    return command || undefined;
  }

  async getCustomCommandByName(userId: string, name: string): Promise<CustomCommand | undefined> {
    const [command] = await db
      .select()
      .from(customCommands)
      .where(
        and(
          eq(customCommands.userId, userId),
          eq(customCommands.name, name.toLowerCase())
        )
      );
    return command || undefined;
  }

  async createCustomCommand(userId: string, data: InsertCustomCommand): Promise<CustomCommand> {
    const [command] = await db
      .insert(customCommands)
      .values({
        ...data,
        userId,
        name: data.name.toLowerCase(), // Normalize command name to lowercase
        updatedAt: new Date(),
      })
      .returning();
    return command;
  }

  async updateCustomCommand(userId: string, id: string, data: UpdateCustomCommand): Promise<CustomCommand> {
    const { userId: _userId, ...safeData } = data as any;
    
    const updateData: any = {
      ...safeData,
      updatedAt: new Date(),
    };

    // Normalize command name to lowercase if provided
    if (updateData.name) {
      updateData.name = updateData.name.toLowerCase();
    }

    const [command] = await db
      .update(customCommands)
      .set(updateData)
      .where(
        and(
          eq(customCommands.userId, userId),
          eq(customCommands.id, id)
        )
      )
      .returning();
    return command;
  }

  async deleteCustomCommand(userId: string, id: string): Promise<void> {
    await db
      .delete(customCommands)
      .where(
        and(
          eq(customCommands.userId, userId),
          eq(customCommands.id, id)
        )
      );
  }

  async incrementCommandUsage(userId: string, id: string): Promise<void> {
    await db
      .update(customCommands)
      .set({
        usageCount: sql`${customCommands.usageCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(
        and(
          eq(customCommands.userId, userId),
          eq(customCommands.id, id)
        )
      );
  }

  async getCommandStats(userId: string, id: string): Promise<{
    usageCount: number;
    lastUsedAt: Date | null;
    createdAt: Date;
  }> {
    const command = await this.getCustomCommand(userId, id);
    if (!command) {
      throw new Error("Command not found");
    }
    
    return {
      usageCount: command.usageCount,
      lastUsedAt: command.lastUsedAt,
      createdAt: command.createdAt,
    };
  }

  // Command Aliases
  async getCommandAliases(commandId: string): Promise<CommandAlias[]> {
    return await db
      .select()
      .from(commandAliases)
      .where(eq(commandAliases.commandId, commandId));
  }

  async getCommandByAlias(userId: string, aliasName: string): Promise<CustomCommand | undefined> {
    const [alias] = await db
      .select()
      .from(commandAliases)
      .innerJoin(customCommands, eq(commandAliases.commandId, customCommands.id))
      .where(
        and(
          eq(commandAliases.alias, aliasName.toLowerCase()),
          eq(customCommands.userId, userId)
        )
      );
    
    if (!alias) return undefined;
    return alias.custom_commands;
  }

  async createCommandAlias(commandId: string, alias: string): Promise<CommandAlias> {
    const [newAlias] = await db
      .insert(commandAliases)
      .values({
        commandId,
        alias: alias.toLowerCase(),
      })
      .returning();
    return newAlias;
  }

  async deleteCommandAlias(id: string): Promise<void> {
    await db
      .delete(commandAliases)
      .where(eq(commandAliases.id, id));
  }

  async deleteCommandAliasesByCommandId(commandId: string): Promise<void> {
    await db
      .delete(commandAliases)
      .where(eq(commandAliases.commandId, commandId));
  }

  // Moderation Rules
  async getModerationRules(userId: string): Promise<ModerationRule[]> {
    return await db
      .select()
      .from(moderationRules)
      .where(eq(moderationRules.userId, userId));
  }

  async getModerationRule(userId: string, id: string): Promise<ModerationRule | undefined> {
    const [rule] = await db
      .select()
      .from(moderationRules)
      .where(
        and(
          eq(moderationRules.userId, userId),
          eq(moderationRules.id, id)
        )
      );
    return rule || undefined;
  }

  async getModerationRuleByType(userId: string, ruleType: string): Promise<ModerationRule | undefined> {
    const [rule] = await db
      .select()
      .from(moderationRules)
      .where(
        and(
          eq(moderationRules.userId, userId),
          eq(moderationRules.ruleType, ruleType)
        )
      );
    return rule || undefined;
  }

  async createModerationRule(userId: string, data: InsertModerationRule): Promise<ModerationRule> {
    const [rule] = await db
      .insert(moderationRules)
      .values({
        ...data,
        userId,
        updatedAt: new Date(),
      })
      .returning();
    return rule;
  }

  async updateModerationRule(userId: string, id: string, data: UpdateModerationRule): Promise<ModerationRule> {
    const { userId: _userId, ...safeData } = data as any;
    
    const [rule] = await db
      .update(moderationRules)
      .set({
        ...safeData,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(moderationRules.userId, userId),
          eq(moderationRules.id, id)
        )
      )
      .returning();
    return rule;
  }

  async deleteModerationRule(userId: string, id: string): Promise<void> {
    await db
      .delete(moderationRules)
      .where(
        and(
          eq(moderationRules.userId, userId),
          eq(moderationRules.id, id)
        )
      );
  }

  async initializeDefaultModerationRules(userId: string): Promise<ModerationRule[]> {
    const defaultRules: InsertModerationRule[] = [
      {
        userId,
        ruleType: "toxic",
        isEnabled: true,
        severity: "medium",
        action: "timeout",
        timeoutDuration: 300,
      },
      {
        userId,
        ruleType: "spam",
        isEnabled: true,
        severity: "medium",
        action: "timeout",
        timeoutDuration: 60,
      },
      {
        userId,
        ruleType: "links",
        isEnabled: true,
        severity: "low",
        action: "warn",
        timeoutDuration: 60,
      },
      {
        userId,
        ruleType: "caps",
        isEnabled: false,
        severity: "low",
        action: "warn",
        timeoutDuration: 30,
      },
      {
        userId,
        ruleType: "symbols",
        isEnabled: false,
        severity: "low",
        action: "warn",
        timeoutDuration: 30,
      },
    ];

    const createdRules: ModerationRule[] = [];
    for (const rule of defaultRules) {
      const created = await this.createModerationRule(userId, rule);
      createdRules.push(created);
    }

    return createdRules;
  }

  // Moderation Logs
  async getModerationLogs(userId: string, limit: number = 100): Promise<ModerationLog[]> {
    return await db
      .select()
      .from(moderationLogs)
      .where(eq(moderationLogs.userId, userId))
      .orderBy(desc(moderationLogs.timestamp))
      .limit(limit);
  }

  async createModerationLog(userId: string, data: InsertModerationLog): Promise<ModerationLog> {
    const [log] = await db
      .insert(moderationLogs)
      .values({
        ...data,
        userId,
      })
      .returning();
    return log;
  }

  async getModerationStats(userId: string): Promise<{
    totalModerated: number;
    moderatedToday: number;
    moderatedThisWeek: number;
    byAction: { action: string; count: number }[];
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(moderationLogs)
      .where(eq(moderationLogs.userId, userId));

    const [todayResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(moderationLogs)
      .where(
        and(
          eq(moderationLogs.userId, userId),
          gte(moderationLogs.timestamp, today)
        )
      );

    const [weekResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(moderationLogs)
      .where(
        and(
          eq(moderationLogs.userId, userId),
          gte(moderationLogs.timestamp, weekAgo)
        )
      );

    const actionResults = await db
      .select({
        action: moderationLogs.action,
        count: sql<number>`count(*)::int`,
      })
      .from(moderationLogs)
      .where(eq(moderationLogs.userId, userId))
      .groupBy(moderationLogs.action);

    return {
      totalModerated: totalResult?.count || 0,
      moderatedToday: todayResult?.count || 0,
      moderatedThisWeek: weekResult?.count || 0,
      byAction: actionResults.map(r => ({ action: r.action, count: r.count })),
    };
  }

  // Link Whitelist
  async getLinkWhitelist(userId: string): Promise<LinkWhitelist[]> {
    return await db
      .select()
      .from(linkWhitelist)
      .where(eq(linkWhitelist.userId, userId));
  }

  async addToLinkWhitelist(userId: string, domain: string): Promise<LinkWhitelist> {
    const cleanDomain = domain.toLowerCase().replace(/^www\./, '');
    
    const [whitelist] = await db
      .insert(linkWhitelist)
      .values({
        userId,
        domain: cleanDomain,
      })
      .returning();
    return whitelist;
  }

  async removeFromLinkWhitelist(userId: string, domain: string): Promise<void> {
    const cleanDomain = domain.toLowerCase().replace(/^www\./, '');
    
    await db
      .delete(linkWhitelist)
      .where(
        and(
          eq(linkWhitelist.userId, userId),
          eq(linkWhitelist.domain, cleanDomain)
        )
      );
  }

  // Giveaways
  async getGiveaways(userId: string, limit: number = 50): Promise<Giveaway[]> {
    return await db
      .select()
      .from(giveaways)
      .where(eq(giveaways.userId, userId))
      .orderBy(desc(giveaways.createdAt))
      .limit(limit);
  }

  async getGiveaway(userId: string, id: string): Promise<Giveaway | undefined> {
    const [giveaway] = await db
      .select()
      .from(giveaways)
      .where(
        and(
          eq(giveaways.userId, userId),
          eq(giveaways.id, id)
        )
      );
    return giveaway || undefined;
  }

  async getActiveGiveaway(userId: string): Promise<Giveaway | undefined> {
    const [giveaway] = await db
      .select()
      .from(giveaways)
      .where(
        and(
          eq(giveaways.userId, userId),
          eq(giveaways.isActive, true)
        )
      )
      .orderBy(desc(giveaways.startedAt))
      .limit(1);
    return giveaway || undefined;
  }

  async createGiveaway(userId: string, data: InsertGiveaway): Promise<Giveaway> {
    const [giveaway] = await db
      .insert(giveaways)
      .values({
        ...data,
        userId,
      })
      .returning();
    return giveaway;
  }

  async updateGiveaway(userId: string, id: string, data: UpdateGiveaway): Promise<Giveaway> {
    const { userId: _userId, ...safeData } = data as any;
    
    const [giveaway] = await db
      .update(giveaways)
      .set({
        ...safeData,
        endedAt: safeData.endedAt ? new Date(safeData.endedAt as any) : undefined,
      })
      .where(
        and(
          eq(giveaways.userId, userId),
          eq(giveaways.id, id)
        )
      )
      .returning();
    return giveaway;
  }

  async deleteGiveaway(userId: string, id: string): Promise<void> {
    await db
      .delete(giveaways)
      .where(
        and(
          eq(giveaways.userId, userId),
          eq(giveaways.id, id)
        )
      );
  }

  // Giveaway Entries
  async getGiveawayEntries(giveawayId: string): Promise<GiveawayEntry[]> {
    return await db
      .select()
      .from(giveawayEntries)
      .where(eq(giveawayEntries.giveawayId, giveawayId))
      .orderBy(desc(giveawayEntries.enteredAt));
  }

  async getGiveawayEntryByUsername(
    giveawayId: string,
    username: string,
    platform: string
  ): Promise<GiveawayEntry | undefined> {
    const [entry] = await db
      .select()
      .from(giveawayEntries)
      .where(
        and(
          eq(giveawayEntries.giveawayId, giveawayId),
          eq(giveawayEntries.username, username),
          eq(giveawayEntries.platform, platform)
        )
      );
    return entry || undefined;
  }

  async createGiveawayEntry(userId: string, data: InsertGiveawayEntry): Promise<GiveawayEntry> {
    const [entry] = await db
      .insert(giveawayEntries)
      .values({
        ...data,
      })
      .returning();
    return entry;
  }

  // Giveaway Winners
  async getGiveawayWinners(giveawayId: string): Promise<GiveawayWinner[]> {
    return await db
      .select()
      .from(giveawayWinners)
      .where(eq(giveawayWinners.giveawayId, giveawayId))
      .orderBy(desc(giveawayWinners.selectedAt));
  }

  async createGiveawayWinner(data: InsertGiveawayWinner): Promise<GiveawayWinner> {
    const [winner] = await db
      .insert(giveawayWinners)
      .values(data)
      .returning();
    return winner;
  }

  // Shoutouts
  async getShoutouts(userId: string, limit: number = 50): Promise<Shoutout[]> {
    return await db
      .select()
      .from(shoutouts)
      .where(eq(shoutouts.userId, userId))
      .orderBy(desc(shoutouts.lastUsedAt))
      .limit(limit);
  }

  async getShoutout(userId: string, id: string): Promise<Shoutout | undefined> {
    const [shoutout] = await db
      .select()
      .from(shoutouts)
      .where(
        and(
          eq(shoutouts.userId, userId),
          eq(shoutouts.id, id)
        )
      );
    return shoutout || undefined;
  }

  async getShoutoutByTarget(
    userId: string,
    targetUsername: string,
    targetPlatform: string
  ): Promise<Shoutout | undefined> {
    const [shoutout] = await db
      .select()
      .from(shoutouts)
      .where(
        and(
          eq(shoutouts.userId, userId),
          eq(shoutouts.targetUsername, targetUsername.toLowerCase()),
          eq(shoutouts.targetPlatform, targetPlatform.toLowerCase())
        )
      );
    return shoutout || undefined;
  }

  async createShoutout(userId: string, data: InsertShoutout): Promise<Shoutout> {
    const [shoutout] = await db
      .insert(shoutouts)
      .values({
        ...data,
        userId,
        targetUsername: data.targetUsername.toLowerCase(),
        targetPlatform: data.targetPlatform.toLowerCase(),
      })
      .returning();
    return shoutout;
  }

  async updateShoutout(userId: string, id: string, data: UpdateShoutout): Promise<Shoutout> {
    const { userId: _userId, ...safeData } = data as any;
    
    const [shoutout] = await db
      .update(shoutouts)
      .set({
        ...safeData,
        lastUsedAt: safeData.lastUsedAt ? new Date(safeData.lastUsedAt as any) : undefined,
      })
      .where(
        and(
          eq(shoutouts.userId, userId),
          eq(shoutouts.id, id)
        )
      )
      .returning();
    return shoutout;
  }

  async deleteShoutout(userId: string, id: string): Promise<void> {
    await db
      .delete(shoutouts)
      .where(
        and(
          eq(shoutouts.userId, userId),
          eq(shoutouts.id, id)
        )
      );
  }

  // Shoutout Settings
  async getShoutoutSettings(userId: string): Promise<ShoutoutSettings | undefined> {
    const [settings] = await db
      .select()
      .from(shoutoutSettings)
      .where(eq(shoutoutSettings.userId, userId));
    return settings || undefined;
  }

  async createShoutoutSettings(userId: string, data: InsertShoutoutSettings): Promise<ShoutoutSettings> {
    const [settings] = await db
      .insert(shoutoutSettings)
      .values({
        ...data,
        userId,
      })
      .returning();
    return settings;
  }

  async updateShoutoutSettings(userId: string, data: UpdateShoutoutSettings): Promise<ShoutoutSettings> {
    // Get existing settings
    let existing = await this.getShoutoutSettings(userId);
    
    // Create default settings if they don't exist
    if (!existing) {
      existing = await this.createShoutoutSettings(userId, {
        userId,
        enableAutoShoutouts: false,
        shoutoutTemplate: "Check out @{username}! They were last streaming {game} with {viewers} viewers! {url}",
        enableRaidShoutouts: false,
        enableHostShoutouts: false,
        recentFollowerShoutouts: false,
      });
    }

    // Update settings
    const { userId: _userId, ...safeData } = data as any;
    
    const [settings] = await db
      .update(shoutoutSettings)
      .set({
        ...safeData,
        updatedAt: new Date(),
      })
      .where(eq(shoutoutSettings.userId, userId))
      .returning();
    return settings;
  }

  // Shoutout History
  async getShoutoutHistory(userId: string, limit: number = 50): Promise<ShoutoutHistory[]> {
    return await db
      .select()
      .from(shoutoutHistory)
      .where(eq(shoutoutHistory.userId, userId))
      .orderBy(desc(shoutoutHistory.timestamp))
      .limit(limit);
  }

  async createShoutoutHistory(data: InsertShoutoutHistory): Promise<ShoutoutHistory> {
    const [history] = await db
      .insert(shoutoutHistory)
      .values(data)
      .returning();
    return history;
  }

  // Game Settings
  async getGameSettings(userId: string): Promise<GameSettings | undefined> {
    const [settings] = await db
      .select()
      .from(gameSettings)
      .where(eq(gameSettings.userId, userId));
    return settings || undefined;
  }

  async createGameSettings(userId: string, data: InsertGameSettings): Promise<GameSettings> {
    const [settings] = await db
      .insert(gameSettings)
      .values({
        ...data,
        userId,
      })
      .returning();
    return settings;
  }

  async updateGameSettings(userId: string, data: UpdateGameSettings): Promise<GameSettings> {
    let existing = await this.getGameSettings(userId);
    
    if (!existing) {
      existing = await this.createGameSettings(userId, {
        userId,
        enableGames: true,
        cooldownMinutes: 5,
        pointsPerWin: 10,
        enable8Ball: true,
        enableTrivia: true,
        enableDuel: true,
        enableSlots: true,
        enableRoulette: true,
      });
    }

    const { userId: _userId, ...safeData } = data as any;
    
    const [settings] = await db
      .update(gameSettings)
      .set({
        ...safeData,
        updatedAt: new Date(),
      })
      .where(eq(gameSettings.userId, userId))
      .returning();
    return settings;
  }

  // Game History
  async getGameHistory(userId: string, limit: number = 100): Promise<GameHistory[]> {
    return await db
      .select()
      .from(gameHistory)
      .where(eq(gameHistory.userId, userId))
      .orderBy(desc(gameHistory.timestamp))
      .limit(limit);
  }

  async getGameHistoryByType(userId: string, gameType: string, limit: number = 100): Promise<GameHistory[]> {
    return await db
      .select()
      .from(gameHistory)
      .where(
        and(
          eq(gameHistory.userId, userId),
          eq(gameHistory.gameType, gameType)
        )
      )
      .orderBy(desc(gameHistory.timestamp))
      .limit(limit);
  }

  async createGameHistory(data: InsertGameHistory): Promise<GameHistory> {
    const [history] = await db
      .insert(gameHistory)
      .values(data)
      .returning();
    return history;
  }

  // Active Trivia Questions
  async getActiveTriviaQuestion(userId: string, player: string, platform: string): Promise<ActiveTriviaQuestion | undefined> {
    const [question] = await db
      .select()
      .from(activeTriviaQuestions)
      .where(
        and(
          eq(activeTriviaQuestions.userId, userId),
          eq(activeTriviaQuestions.player, player),
          eq(activeTriviaQuestions.platform, platform)
        )
      );
    return question || undefined;
  }

  async createActiveTriviaQuestion(data: InsertActiveTriviaQuestion): Promise<ActiveTriviaQuestion> {
    const [question] = await db
      .insert(activeTriviaQuestions)
      .values(data)
      .returning();
    return question;
  }

  async deleteActiveTriviaQuestion(id: string): Promise<void> {
    await db
      .delete(activeTriviaQuestions)
      .where(eq(activeTriviaQuestions.id, id));
  }

  // Game Stats
  async getGameStats(userId: string, limit: number = 100): Promise<GameStats[]> {
    return await db
      .select()
      .from(gameStats)
      .where(eq(gameStats.userId, userId))
      .orderBy(desc(gameStats.totalPlays))
      .limit(limit);
  }

  async getGameStatsByGame(userId: string, gameName: string, limit: number = 100): Promise<GameStats[]> {
    return await db
      .select()
      .from(gameStats)
      .where(
        and(
          eq(gameStats.userId, userId),
          eq(gameStats.gameName, gameName)
        )
      )
      .orderBy(desc(gameStats.totalPlays))
      .limit(limit);
  }

  async getGameStatsByPlayer(userId: string, username: string, platform: string): Promise<GameStats[]> {
    return await db
      .select()
      .from(gameStats)
      .where(
        and(
          eq(gameStats.userId, userId),
          eq(gameStats.username, username),
          eq(gameStats.platform, platform)
        )
      )
      .orderBy(desc(gameStats.totalPlays));
  }

  async getGameLeaderboard(userId: string, gameName: string, limit: number = 10): Promise<GameStats[]> {
    return await db
      .select()
      .from(gameStats)
      .where(
        and(
          eq(gameStats.userId, userId),
          eq(gameStats.gameName, gameName)
        )
      )
      .orderBy(desc(gameStats.totalPointsEarned))
      .limit(limit);
  }

  async upsertGameStats(data: InsertGameStats): Promise<GameStats> {
    const existing = await db
      .select()
      .from(gameStats)
      .where(
        and(
          eq(gameStats.userId, data.userId),
          eq(gameStats.username, data.username),
          eq(gameStats.gameName, data.gameName),
          eq(gameStats.platform, data.platform)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db
        .update(gameStats)
        .set({
          wins: existing[0].wins + (data.wins || 0),
          losses: existing[0].losses + (data.losses || 0),
          neutral: existing[0].neutral + (data.neutral || 0),
          totalPlays: existing[0].totalPlays + (data.totalPlays || 0),
          totalPointsEarned: existing[0].totalPointsEarned + (data.totalPointsEarned || 0),
          lastPlayed: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(gameStats.id, existing[0].id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(gameStats)
        .values({
          ...data,
          lastPlayed: new Date(),
        })
        .returning();
      return created;
    }
  }

  // Currency Settings
  async getCurrencySettings(userId: string): Promise<CurrencySettings | undefined> {
    const [settings] = await db
      .select()
      .from(currencySettings)
      .where(eq(currencySettings.userId, userId))
      .limit(1);
    return settings || undefined;
  }

  async createCurrencySettings(userId: string, data: InsertCurrencySettings): Promise<CurrencySettings> {
    const [settings] = await db
      .insert(currencySettings)
      .values({
        ...data,
        userId,
        updatedAt: new Date(),
      })
      .returning();
    return settings;
  }

  async updateCurrencySettings(userId: string, data: UpdateCurrencySettings): Promise<CurrencySettings> {
    const [settings] = await db
      .update(currencySettings)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(currencySettings.userId, userId))
      .returning();
    return settings;
  }

  // Currency Rewards
  async getCurrencyRewards(userId: string): Promise<CurrencyReward[]> {
    return await db
      .select()
      .from(currencyRewards)
      .where(eq(currencyRewards.botUserId, userId))
      .orderBy(currencyRewards.cost);
  }

  async getCurrencyReward(userId: string, id: string): Promise<CurrencyReward | undefined> {
    const [reward] = await db
      .select()
      .from(currencyRewards)
      .where(
        and(
          eq(currencyRewards.id, id),
          eq(currencyRewards.botUserId, userId)
        )
      )
      .limit(1);
    return reward || undefined;
  }

  async createCurrencyReward(userId: string, data: InsertCurrencyReward): Promise<CurrencyReward> {
    const [reward] = await db
      .insert(currencyRewards)
      .values({
        ...data,
        botUserId: userId,
      })
      .returning();
    return reward;
  }

  async updateCurrencyReward(userId: string, id: string, data: UpdateCurrencyReward): Promise<CurrencyReward> {
    const [reward] = await db
      .update(currencyRewards)
      .set(data)
      .where(
        and(
          eq(currencyRewards.id, id),
          eq(currencyRewards.botUserId, userId)
        )
      )
      .returning();
    return reward;
  }

  async deleteCurrencyReward(userId: string, id: string): Promise<void> {
    await db
      .delete(currencyRewards)
      .where(
        and(
          eq(currencyRewards.id, id),
          eq(currencyRewards.botUserId, userId)
        )
      );
  }

  // Alert Settings
  async getAlertSettings(userId: string): Promise<AlertSettings | undefined> {
    const [settings] = await db
      .select()
      .from(alertSettings)
      .where(eq(alertSettings.userId, userId))
      .limit(1);
    return settings || undefined;
  }

  async createAlertSettings(userId: string, data: InsertAlertSettings): Promise<AlertSettings> {
    const [settings] = await db
      .insert(alertSettings)
      .values({
        ...data,
        userId,
      })
      .returning();
    return settings;
  }

  async updateAlertSettings(userId: string, data: UpdateAlertSettings): Promise<AlertSettings> {
    const [settings] = await db
      .update(alertSettings)
      .set(data)
      .where(eq(alertSettings.userId, userId))
      .returning();
    return settings;
  }

  // Alert History
  async getAlertHistory(userId: string, alertType?: string, limit: number = 50): Promise<AlertHistory[]> {
    let query = db
      .select()
      .from(alertHistory)
      .where(eq(alertHistory.userId, userId))
      .orderBy(desc(alertHistory.timestamp))
      .limit(limit);

    if (alertType) {
      query = db
        .select()
        .from(alertHistory)
        .where(
          and(
            eq(alertHistory.userId, userId),
            eq(alertHistory.alertType, alertType)
          )
        )
        .orderBy(desc(alertHistory.timestamp))
        .limit(limit);
    }

    return await query;
  }

  async createAlertHistory(data: InsertAlertHistory): Promise<AlertHistory> {
    const [history] = await db
      .insert(alertHistory)
      .values(data)
      .returning();
    return history;
  }

  // Milestones
  async getMilestones(userId: string, milestoneType?: string): Promise<Milestone[]> {
    if (milestoneType) {
      return await db
        .select()
        .from(milestones)
        .where(
          and(
            eq(milestones.userId, userId),
            eq(milestones.milestoneType, milestoneType)
          )
        )
        .orderBy(desc(milestones.threshold));
    }

    return await db
      .select()
      .from(milestones)
      .where(eq(milestones.userId, userId))
      .orderBy(desc(milestones.threshold));
  }

  async getMilestone(userId: string, milestoneType: string, threshold: number): Promise<Milestone | undefined> {
    const [milestone] = await db
      .select()
      .from(milestones)
      .where(
        and(
          eq(milestones.userId, userId),
          eq(milestones.milestoneType, milestoneType),
          eq(milestones.threshold, threshold)
        )
      )
      .limit(1);
    return milestone || undefined;
  }

  async createMilestone(data: InsertMilestone): Promise<Milestone> {
    const [milestone] = await db
      .insert(milestones)
      .values(data)
      .returning();
    return milestone;
  }

  async updateMilestone(userId: string, id: string, data: UpdateMilestone): Promise<Milestone> {
    const [milestone] = await db
      .update(milestones)
      .set(data)
      .where(
        and(
          eq(milestones.id, id),
          eq(milestones.userId, userId)
        )
      )
      .returning();
    return milestone;
  }

  // Stream Alerts (OBS overlay-style alerts)
  async getStreamAlerts(userId: string): Promise<StreamAlert[]> {
    return await db
      .select()
      .from(streamAlerts)
      .where(eq(streamAlerts.userId, userId))
      .orderBy(streamAlerts.alertType);
  }

  async getStreamAlert(userId: string, id: string): Promise<StreamAlert | undefined> {
    const [alert] = await db
      .select()
      .from(streamAlerts)
      .where(
        and(
          eq(streamAlerts.userId, userId),
          eq(streamAlerts.id, id)
        )
      )
      .limit(1);
    return alert || undefined;
  }

  async getStreamAlertByType(userId: string, alertType: string): Promise<StreamAlert | undefined> {
    const [alert] = await db
      .select()
      .from(streamAlerts)
      .where(
        and(
          eq(streamAlerts.userId, userId),
          eq(streamAlerts.alertType, alertType)
        )
      )
      .limit(1);
    return alert || undefined;
  }

  async createStreamAlert(userId: string, data: InsertStreamAlert): Promise<StreamAlert> {
    const [alert] = await db
      .insert(streamAlerts)
      .values({
        ...data,
        userId,
      })
      .returning();
    return alert;
  }

  async updateStreamAlert(userId: string, id: string, data: UpdateStreamAlert): Promise<StreamAlert> {
    const [alert] = await db
      .update(streamAlerts)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(streamAlerts.userId, userId),
          eq(streamAlerts.id, id)
        )
      )
      .returning();
    return alert;
  }

  async deleteStreamAlert(userId: string, id: string): Promise<void> {
    await db
      .delete(streamAlerts)
      .where(
        and(
          eq(streamAlerts.userId, userId),
          eq(streamAlerts.id, id)
        )
      );
  }

  // Stream Alert History
  async getStreamAlertHistory(userId: string, alertType?: string, limit: number = 50): Promise<StreamAlertHistory[]> {
    if (alertType) {
      return await db
        .select()
        .from(streamAlertHistory)
        .where(
          and(
            eq(streamAlertHistory.userId, userId),
            eq(streamAlertHistory.alertType, alertType)
          )
        )
        .orderBy(desc(streamAlertHistory.triggeredAt))
        .limit(limit);
    }

    return await db
      .select()
      .from(streamAlertHistory)
      .where(eq(streamAlertHistory.userId, userId))
      .orderBy(desc(streamAlertHistory.triggeredAt))
      .limit(limit);
  }

  async createStreamAlertHistory(data: InsertStreamAlertHistory): Promise<StreamAlertHistory> {
    const [history] = await db
      .insert(streamAlertHistory)
      .values(data)
      .returning();
    return history;
  }

  // Chatbot Settings
  async getChatbotSettings(userId: string): Promise<ChatbotSettings | undefined> {
    const [settings] = await db
      .select()
      .from(chatbotSettings)
      .where(eq(chatbotSettings.userId, userId));
    return settings || undefined;
  }

  async createChatbotSettings(userId: string, data: InsertChatbotSettings): Promise<ChatbotSettings> {
    const [settings] = await db
      .insert(chatbotSettings)
      .values({ ...data, userId })
      .returning();
    return settings;
  }

  async updateChatbotSettings(userId: string, data: UpdateChatbotSettings): Promise<ChatbotSettings> {
    const [settings] = await db
      .update(chatbotSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(chatbotSettings.userId, userId))
      .returning();
    return settings;
  }

  // Chatbot Responses
  async getChatbotResponses(userId: string, limit: number = 100): Promise<ChatbotResponse[]> {
    return await db
      .select()
      .from(chatbotResponses)
      .where(eq(chatbotResponses.userId, userId))
      .orderBy(desc(chatbotResponses.timestamp))
      .limit(limit);
  }

  async getChatbotResponse(userId: string, id: string): Promise<ChatbotResponse | undefined> {
    const [response] = await db
      .select()
      .from(chatbotResponses)
      .where(
        and(
          eq(chatbotResponses.userId, userId),
          eq(chatbotResponses.id, id)
        )
      );
    return response || undefined;
  }

  async createChatbotResponse(userId: string, data: InsertChatbotResponse): Promise<ChatbotResponse> {
    const [response] = await db
      .insert(chatbotResponses)
      .values({ ...data, userId })
      .returning();
    return response;
  }

  async updateChatbotResponse(userId: string, id: string, data: UpdateChatbotResponse): Promise<ChatbotResponse> {
    const [response] = await db
      .update(chatbotResponses)
      .set(data)
      .where(
        and(
          eq(chatbotResponses.userId, userId),
          eq(chatbotResponses.id, id)
        )
      )
      .returning();
    return response;
  }

  // Chatbot Context
  async getChatbotContext(userId: string, username: string, platform: string): Promise<ChatbotContext | undefined> {
    const [context] = await db
      .select()
      .from(chatbotContext)
      .where(
        and(
          eq(chatbotContext.botUserId, userId),
          eq(chatbotContext.username, username),
          eq(chatbotContext.platform, platform)
        )
      );
    return context || undefined;
  }

  async getAllChatbotContexts(userId: string, limit: number = 50): Promise<ChatbotContext[]> {
    return await db
      .select()
      .from(chatbotContext)
      .where(eq(chatbotContext.botUserId, userId))
      .orderBy(desc(chatbotContext.lastSeen))
      .limit(limit);
  }

  async createChatbotContext(userId: string, data: InsertChatbotContext): Promise<ChatbotContext> {
    const [context] = await db
      .insert(chatbotContext)
      .values({ ...data, botUserId: userId })
      .returning();
    return context;
  }

  async updateChatbotContext(userId: string, id: string, data: UpdateChatbotContext): Promise<ChatbotContext> {
    const [context] = await db
      .update(chatbotContext)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(chatbotContext.id, id),
          eq(chatbotContext.botUserId, userId)
        )
      )
      .returning();
    return context;
  }

  // Chatbot Personalities
  async getChatbotPersonalities(userId: string): Promise<ChatbotPersonality[]> {
    return await db
      .select()
      .from(chatbotPersonalities)
      .where(eq(chatbotPersonalities.userId, userId))
      .orderBy(desc(chatbotPersonalities.createdAt));
  }

  async getChatbotPersonality(userId: string, id: string): Promise<ChatbotPersonality | undefined> {
    const [personality] = await db
      .select()
      .from(chatbotPersonalities)
      .where(
        and(
          eq(chatbotPersonalities.userId, userId),
          eq(chatbotPersonalities.id, id)
        )
      );
    return personality || undefined;
  }

  async getChatbotPersonalityByName(userId: string, name: string): Promise<ChatbotPersonality | undefined> {
    const [personality] = await db
      .select()
      .from(chatbotPersonalities)
      .where(
        and(
          eq(chatbotPersonalities.userId, userId),
          eq(chatbotPersonalities.name, name)
        )
      );
    return personality || undefined;
  }

  async createChatbotPersonality(userId: string, data: InsertChatbotPersonality): Promise<ChatbotPersonality> {
    const [personality] = await db
      .insert(chatbotPersonalities)
      .values({ ...data, userId })
      .returning();
    return personality;
  }

  async updateChatbotPersonality(userId: string, id: string, data: UpdateChatbotPersonality): Promise<ChatbotPersonality> {
    const [personality] = await db
      .update(chatbotPersonalities)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(chatbotPersonalities.userId, userId),
          eq(chatbotPersonalities.id, id)
        )
      )
      .returning();
    return personality;
  }

  async deleteChatbotPersonality(userId: string, id: string): Promise<void> {
    await db
      .delete(chatbotPersonalities)
      .where(
        and(
          eq(chatbotPersonalities.userId, userId),
          eq(chatbotPersonalities.id, id)
        )
      );
  }

  async getPresetPersonalities(): Promise<ChatbotPersonality[]> {
    return await db
      .select()
      .from(chatbotPersonalities)
      .where(eq(chatbotPersonalities.isPreset, true))
      .orderBy(chatbotPersonalities.name);
  }

  async updateUser(userId: string, data: Partial<{
    onboardingCompleted: boolean;
    onboardingStep: number;
    dismissedWelcome: boolean;
  }>): Promise<void> {
    await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  getUserStorage(userId: string): UserStorage {
    return new UserStorage(userId);
  }

  async upsertPlatformConnection(userId: string, platform: string, data: Partial<InsertPlatformConnection>): Promise<PlatformConnection> {
    const existing = await this.getPlatformConnectionByPlatform(userId, platform);
    if (existing) {
      return await this.updatePlatformConnection(userId, existing.id, data as UpdatePlatformConnection);
    }
    return await this.createPlatformConnection(userId, { platform, ...data } as InsertPlatformConnection);
  }

  async getPolls(userId: string, limit?: number): Promise<Poll[]> {
    const query = db
      .select()
      .from(polls)
      .where(eq(polls.userId, userId))
      .orderBy(desc(polls.createdAt));
    
    if (limit) {
      return await query.limit(limit);
    }
    return await query;
  }

  async getPoll(userId: string, id: string): Promise<Poll | undefined> {
    const [poll] = await db
      .select()
      .from(polls)
      .where(
        and(
          eq(polls.userId, userId),
          eq(polls.id, id)
        )
      );
    return poll || undefined;
  }

  async getActivePoll(userId: string, platform?: string): Promise<Poll | null> {
    const conditions = [
      eq(polls.userId, userId),
      eq(polls.status, "active")
    ];
    if (platform) {
      conditions.push(eq(polls.platform, platform));
    }
    const [poll] = await db
      .select()
      .from(polls)
      .where(and(...conditions))
      .limit(1);
    return poll || null;
  }

  async getPollHistory(userId: string, limit?: number): Promise<Poll[]> {
    const query = db
      .select()
      .from(polls)
      .where(
        and(
          eq(polls.userId, userId),
          eq(polls.status, "ended")
        )
      )
      .orderBy(desc(polls.endedAt));
    
    if (limit) {
      return await query.limit(limit);
    }
    return await query;
  }

  async createPoll(userId: string, data: InsertPoll): Promise<Poll> {
    const [poll] = await db
      .insert(polls)
      .values({ ...data, userId })
      .returning();
    return poll;
  }

  async updatePoll(userId: string, id: string, data: UpdatePoll): Promise<Poll> {
    const [poll] = await db
      .update(polls)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(polls.userId, userId),
          eq(polls.id, id)
        )
      )
      .returning();
    return poll;
  }

  async incrementPollVotes(userId: string, pollId: string): Promise<void> {
    await db
      .update(polls)
      .set({
        totalVotes: sql`${polls.totalVotes} + 1`,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(polls.userId, userId),
          eq(polls.id, pollId)
        )
      );
  }

  async getPollVotes(userId: string, pollId: string): Promise<PollVote[]> {
    return await db
      .select()
      .from(pollVotes)
      .where(eq(pollVotes.pollId, pollId))
      .orderBy(desc(pollVotes.votedAt));
  }

  async getPollVoteByUser(userId: string, pollId: string, username: string, platform: string): Promise<PollVote | undefined> {
    const [vote] = await db
      .select()
      .from(pollVotes)
      .where(
        and(
          eq(pollVotes.pollId, pollId),
          eq(pollVotes.username, username),
          eq(pollVotes.platform, platform)
        )
      );
    return vote || undefined;
  }

  async createPollVote(userId: string, data: InsertPollVote): Promise<PollVote> {
    const [vote] = await db
      .insert(pollVotes)
      .values(data)
      .returning();
    return vote;
  }

  async getPredictions(userId: string, limit?: number): Promise<Prediction[]> {
    const query = db
      .select()
      .from(predictions)
      .where(eq(predictions.userId, userId))
      .orderBy(desc(predictions.createdAt));
    
    if (limit) {
      return await query.limit(limit);
    }
    return await query;
  }

  async getPrediction(userId: string, id: string): Promise<Prediction | undefined> {
    const [prediction] = await db
      .select()
      .from(predictions)
      .where(
        and(
          eq(predictions.userId, userId),
          eq(predictions.id, id)
        )
      );
    return prediction || undefined;
  }

  async getActivePrediction(userId: string, platform?: string): Promise<Prediction | null> {
    const conditions = [
      eq(predictions.userId, userId),
      eq(predictions.status, "active")
    ];
    if (platform) {
      conditions.push(eq(predictions.platform, platform));
    }
    const [prediction] = await db
      .select()
      .from(predictions)
      .where(and(...conditions))
      .limit(1);
    return prediction || null;
  }

  async getPredictionHistory(userId: string, limit?: number): Promise<Prediction[]> {
    const query = db
      .select()
      .from(predictions)
      .where(
        and(
          eq(predictions.userId, userId),
          eq(predictions.status, "resolved")
        )
      )
      .orderBy(desc(predictions.endedAt));
    
    if (limit) {
      return await query.limit(limit);
    }
    return await query;
  }

  async createPrediction(userId: string, data: InsertPrediction): Promise<Prediction> {
    const [prediction] = await db
      .insert(predictions)
      .values({ ...data, userId })
      .returning();
    return prediction;
  }

  async updatePrediction(userId: string, id: string, data: UpdatePrediction): Promise<Prediction> {
    const [prediction] = await db
      .update(predictions)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(predictions.userId, userId),
          eq(predictions.id, id)
        )
      )
      .returning();
    return prediction;
  }

  async incrementPredictionStats(userId: string, predictionId: string, points: number): Promise<void> {
    await db
      .update(predictions)
      .set({
        totalPoints: sql`${predictions.totalPoints} + ${points}`,
        totalBets: sql`${predictions.totalBets} + 1`,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(predictions.userId, userId),
          eq(predictions.id, predictionId)
        )
      );
  }

  async getPredictionBets(userId: string, predictionId: string): Promise<PredictionBet[]> {
    return await db
      .select()
      .from(predictionBets)
      .where(eq(predictionBets.predictionId, predictionId))
      .orderBy(desc(predictionBets.placedAt));
  }

  async getPredictionBetByUser(userId: string, predictionId: string, username: string, platform: string): Promise<PredictionBet | undefined> {
    const [bet] = await db
      .select()
      .from(predictionBets)
      .where(
        and(
          eq(predictionBets.predictionId, predictionId),
          eq(predictionBets.username, username),
          eq(predictionBets.platform, platform)
        )
      );
    return bet || undefined;
  }

  async createPredictionBet(userId: string, data: InsertPredictionBet): Promise<PredictionBet> {
    const [bet] = await db
      .insert(predictionBets)
      .values(data)
      .returning();
    return bet;
  }

  async updatePredictionBet(userId: string, betId: string, data: { payout: number }): Promise<PredictionBet> {
    const [bet] = await db
      .update(predictionBets)
      .set(data)
      .where(eq(predictionBets.id, betId))
      .returning();
    return bet;
  }

  async cleanupExpiredTriviaQuestions(): Promise<void> {
    const now = new Date();
    await db.delete(activeTriviaQuestions).where(lt(activeTriviaQuestions.expiresAt, now));
  }
}

export const storage = new DatabaseStorage();
