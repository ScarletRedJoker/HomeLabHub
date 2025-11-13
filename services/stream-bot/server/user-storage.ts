import { storage, IStorage } from "./storage";
import type {
  PlatformConnection,
  InsertPlatformConnection,
  UpdatePlatformConnection,
  BotConfig,
  InsertBotConfig,
  UpdateBotConfig,
  MessageHistory,
  InsertMessageHistory,
} from "@shared/schema";

export class UserStorage {
  constructor(private userId: string) {}

  // Platform Connections
  async getPlatformConnections(): Promise<PlatformConnection[]> {
    return storage.getPlatformConnections(this.userId);
  }

  async getPlatformConnectionByPlatform(platform: string): Promise<PlatformConnection | undefined> {
    return storage.getPlatformConnectionByPlatform(this.userId, platform);
  }

  async createPlatformConnection(data: InsertPlatformConnection): Promise<PlatformConnection> {
    return storage.createPlatformConnection(this.userId, data);
  }

  async updatePlatformConnection(id: string, data: UpdatePlatformConnection): Promise<PlatformConnection> {
    return storage.updatePlatformConnection(this.userId, id, data);
  }

  async deletePlatformConnection(id: string): Promise<void> {
    return storage.deletePlatformConnection(this.userId, id);
  }

  // Bot Config
  async getBotConfig(): Promise<BotConfig | undefined> {
    return storage.getBotConfig(this.userId);
  }

  async createBotConfig(data: InsertBotConfig): Promise<BotConfig> {
    return storage.createBotConfig(this.userId, data);
  }

  async updateBotConfig(data: UpdateBotConfig): Promise<BotConfig> {
    return storage.updateBotConfig(this.userId, data);
  }

  // Message History
  async getMessages(): Promise<MessageHistory[]> {
    return storage.getMessages(this.userId);
  }

  async getRecentMessages(limit?: number): Promise<MessageHistory[]> {
    return storage.getRecentMessages(this.userId, limit);
  }

  async createMessage(data: InsertMessageHistory): Promise<MessageHistory> {
    return storage.createMessage(this.userId, data);
  }
}

export function createUserStorage(userId: string): UserStorage {
  return new UserStorage(userId);
}
