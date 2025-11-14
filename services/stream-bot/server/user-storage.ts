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
  CustomCommand,
  ModerationRule,
  ModerationLog,
  LinkWhitelist,
  Giveaway,
  GiveawayEntry,
  GiveawayWinner,
  Shoutout,
  InsertModerationLog,
  InsertGiveaway,
  InsertGiveawayEntry,
  InsertGiveawayWinner,
  InsertShoutout,
  UpdateGiveaway,
  UpdateShoutout,
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

  // Custom Commands
  async getCustomCommandByName(name: string): Promise<CustomCommand | undefined> {
    return storage.getCustomCommandByName(this.userId, name);
  }

  async incrementCommandUsage(id: string): Promise<void> {
    return storage.incrementCommandUsage(this.userId, id);
  }

  async getCustomCommands(): Promise<CustomCommand[]> {
    return storage.getCustomCommands(this.userId);
  }

  // Moderation Rules
  async getModerationRules(): Promise<ModerationRule[]> {
    return storage.getModerationRules(this.userId);
  }

  // Moderation Logs
  async createModerationLog(data: InsertModerationLog): Promise<ModerationLog> {
    return storage.createModerationLog(this.userId, data);
  }

  // Link Whitelist
  async getLinkWhitelist(): Promise<LinkWhitelist[]> {
    return storage.getLinkWhitelist(this.userId);
  }

  // Giveaways
  async getGiveaways(limit?: number): Promise<Giveaway[]> {
    return storage.getGiveaways(this.userId, limit);
  }

  async getGiveaway(id: string): Promise<Giveaway | undefined> {
    return storage.getGiveaway(this.userId, id);
  }

  async getActiveGiveaway(): Promise<Giveaway | undefined> {
    return storage.getActiveGiveaway(this.userId);
  }

  async createGiveaway(data: InsertGiveaway): Promise<Giveaway> {
    return storage.createGiveaway(this.userId, data);
  }

  async updateGiveaway(id: string, data: UpdateGiveaway): Promise<Giveaway> {
    return storage.updateGiveaway(this.userId, id, data);
  }

  async deleteGiveaway(id: string): Promise<void> {
    return storage.deleteGiveaway(this.userId, id);
  }

  // Giveaway Entries
  async getGiveawayEntries(giveawayId: string): Promise<GiveawayEntry[]> {
    return storage.getGiveawayEntries(giveawayId);
  }

  async getGiveawayEntryByUsername(
    giveawayId: string,
    username: string,
    platform: string
  ): Promise<GiveawayEntry | undefined> {
    return storage.getGiveawayEntryByUsername(giveawayId, username, platform);
  }

  async createGiveawayEntry(data: InsertGiveawayEntry): Promise<GiveawayEntry> {
    return storage.createGiveawayEntry(this.userId, data);
  }

  // Giveaway Winners
  async getGiveawayWinners(giveawayId: string): Promise<GiveawayWinner[]> {
    return storage.getGiveawayWinners(giveawayId);
  }

  async createGiveawayWinner(data: InsertGiveawayWinner): Promise<GiveawayWinner> {
    return storage.createGiveawayWinner(data);
  }

  // Shoutouts
  async getShoutouts(limit?: number): Promise<Shoutout[]> {
    return storage.getShoutouts(this.userId, limit);
  }

  async getShoutout(id: string): Promise<Shoutout | undefined> {
    return storage.getShoutout(this.userId, id);
  }

  async getShoutoutByTarget(targetUsername: string, targetPlatform: string): Promise<Shoutout | undefined> {
    return storage.getShoutoutByTarget(this.userId, targetUsername, targetPlatform);
  }

  async createShoutout(data: InsertShoutout): Promise<Shoutout> {
    return storage.createShoutout(this.userId, data);
  }

  async updateShoutout(id: string, data: UpdateShoutout): Promise<Shoutout> {
    return storage.updateShoutout(this.userId, id, data);
  }

  async deleteShoutout(id: string): Promise<void> {
    return storage.deleteShoutout(this.userId, id);
  }
}

export function createUserStorage(userId: string): UserStorage {
  return new UserStorage(userId);
}
