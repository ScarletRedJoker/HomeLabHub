import { randomBytes } from "crypto";
import { storage } from "./storage";
import type {
  Giveaway,
  GiveawayEntry,
  GiveawayWinner,
  InsertGiveaway,
  InsertGiveawayEntry,
} from "@shared/schema";

export interface GiveawayWithStats extends Giveaway {
  entriesCount: number;
  winnersCount: number;
  winners?: GiveawayWinner[];
}

export class GiveawayService {
  async createGiveaway(userId: string, data: InsertGiveaway): Promise<Giveaway> {
    const activeGiveaway = await storage.getActiveGiveaway(userId);
    if (activeGiveaway) {
      throw new Error("You already have an active giveaway. Please end it before starting a new one.");
    }

    const keyword = data.keyword.startsWith("!") ? data.keyword : `!${data.keyword}`;
    
    return await storage.createGiveaway(userId, {
      ...data,
      keyword,
      isActive: true,
    });
  }

  async enterGiveaway(
    userId: string,
    giveawayId: string,
    username: string,
    platform: string,
    isSubscriber: boolean = false
  ): Promise<{ success: boolean; message: string; entry?: GiveawayEntry }> {
    const giveaway = await storage.getGiveaway(userId, giveawayId);
    
    if (!giveaway) {
      return { success: false, message: "Giveaway not found" };
    }

    if (!giveaway.isActive) {
      return { success: false, message: "This giveaway has ended" };
    }

    if (giveaway.requiresSubscription && !isSubscriber) {
      return { success: false, message: "This giveaway is for subscribers only" };
    }

    const existingEntry = await storage.getGiveawayEntryByUsername(
      giveawayId,
      username,
      platform
    );

    if (existingEntry) {
      return { success: false, message: "You are already entered in this giveaway" };
    }

    const entry = await storage.createGiveawayEntry(userId, {
      giveawayId,
      userId,
      username,
      platform,
      subscriberStatus: isSubscriber,
    });

    return {
      success: true,
      message: `@${username}, you're entered in the giveaway!`,
      entry,
    };
  }

  async endGiveaway(
    userId: string,
    giveawayId: string
  ): Promise<{ giveaway: Giveaway; winners: GiveawayWinner[] }> {
    const giveaway = await storage.getGiveaway(userId, giveawayId);
    
    if (!giveaway) {
      throw new Error("Giveaway not found");
    }

    if (!giveaway.isActive) {
      throw new Error("This giveaway has already ended");
    }

    const entries = await storage.getGiveawayEntries(giveawayId);
    
    if (entries.length === 0) {
      throw new Error("No entries to select winners from");
    }

    const maxWinners = Math.min(giveaway.maxWinners, entries.length);
    const winners = this.selectRandomWinners(entries, maxWinners);

    const winnerRecords: GiveawayWinner[] = [];
    for (const entry of winners) {
      const winner = await storage.createGiveawayWinner({
        giveawayId,
        username: entry.username,
        platform: entry.platform,
      });
      winnerRecords.push(winner);
    }

    const updatedGiveaway = await storage.updateGiveaway(userId, giveawayId, {
      isActive: false,
      endedAt: new Date(),
    });

    return {
      giveaway: updatedGiveaway,
      winners: winnerRecords,
    };
  }

  async getActiveGiveaway(userId: string): Promise<GiveawayWithStats | null> {
    const giveaway = await storage.getActiveGiveaway(userId);
    
    if (!giveaway) {
      return null;
    }

    const entries = await storage.getGiveawayEntries(giveaway.id);
    const winners = await storage.getGiveawayWinners(giveaway.id);

    return {
      ...giveaway,
      entriesCount: entries.length,
      winnersCount: winners.length,
      winners,
    };
  }

  async getGiveawayHistory(
    userId: string,
    limit: number = 50
  ): Promise<GiveawayWithStats[]> {
    const giveaways = await storage.getGiveaways(userId, limit);
    
    const giveawaysWithStats = await Promise.all(
      giveaways.map(async (giveaway) => {
        const entries = await storage.getGiveawayEntries(giveaway.id);
        const winners = await storage.getGiveawayWinners(giveaway.id);
        
        return {
          ...giveaway,
          entriesCount: entries.length,
          winnersCount: winners.length,
          winners,
        };
      })
    );

    return giveawaysWithStats;
  }

  async getGiveaway(userId: string, giveawayId: string): Promise<GiveawayWithStats | null> {
    const giveaway = await storage.getGiveaway(userId, giveawayId);
    
    if (!giveaway) {
      return null;
    }

    const entries = await storage.getGiveawayEntries(giveaway.id);
    const winners = await storage.getGiveawayWinners(giveaway.id);

    return {
      ...giveaway,
      entriesCount: entries.length,
      winnersCount: winners.length,
      winners,
    };
  }

  async cancelGiveaway(userId: string, giveawayId: string): Promise<void> {
    const giveaway = await storage.getGiveaway(userId, giveawayId);
    
    if (!giveaway) {
      throw new Error("Giveaway not found");
    }

    if (!giveaway.isActive) {
      throw new Error("Cannot cancel a giveaway that has already ended");
    }

    await storage.deleteGiveaway(userId, giveawayId);
  }

  private selectRandomWinners(entries: GiveawayEntry[], count: number): GiveawayEntry[] {
    if (count >= entries.length) {
      return this.shuffleArray([...entries]);
    }

    const winners: GiveawayEntry[] = [];
    const availableEntries = [...entries];

    for (let i = 0; i < count; i++) {
      const randomIndex = this.getSecureRandomInt(availableEntries.length);
      winners.push(availableEntries[randomIndex]);
      availableEntries.splice(randomIndex, 1);
    }

    return winners;
  }

  private getSecureRandomInt(max: number): number {
    const randomBuffer = randomBytes(4);
    const randomInt = randomBuffer.readUInt32BE(0);
    return randomInt % max;
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = this.getSecureRandomInt(i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

export const giveawayService = new GiveawayService();
