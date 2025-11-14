// Reference: javascript_database blueprint
import {
  platformConnections,
  botConfigs,
  messageHistory,
  customCommands,
  moderationRules,
  moderationLogs,
  linkWhitelist,
  giveaways,
  giveawayEntries,
  giveawayWinners,
  shoutouts,
  type PlatformConnection,
  type BotConfig,
  type MessageHistory,
  type CustomCommand,
  type ModerationRule,
  type ModerationLog,
  type LinkWhitelist,
  type Giveaway,
  type GiveawayEntry,
  type GiveawayWinner,
  type Shoutout,
  type InsertPlatformConnection,
  type InsertBotConfig,
  type InsertMessageHistory,
  type InsertCustomCommand,
  type InsertModerationRule,
  type InsertModerationLog,
  type InsertLinkWhitelist,
  type InsertGiveaway,
  type InsertGiveawayEntry,
  type InsertGiveawayWinner,
  type InsertShoutout,
  type UpdateBotConfig,
  type UpdatePlatformConnection,
  type UpdateCustomCommand,
  type UpdateModerationRule,
  type UpdateGiveaway,
  type UpdateShoutout,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, gte, sql, and } from "drizzle-orm";

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
        aiModel: "gpt-5-mini",
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
}

export const storage = new DatabaseStorage();
