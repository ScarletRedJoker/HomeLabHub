// Reference: javascript_database blueprint
import {
  platformConnections,
  botConfigs,
  messageHistory,
  type PlatformConnection,
  type BotConfig,
  type MessageHistory,
  type InsertPlatformConnection,
  type InsertBotConfig,
  type InsertMessageHistory,
  type UpdateBotConfig,
  type UpdatePlatformConnection,
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
}

export const storage = new DatabaseStorage();
