import { randomBytes } from "crypto";
import { db } from "./db";
import {
  giveaways,
  giveawayEntries,
  giveawayWinners,
  giveawayEntryAttempts,
  type Giveaway,
  type GiveawayEntry,
  type GiveawayWinner,
  type InsertGiveaway,
} from "@shared/schema";
import { eq, and, sql, gte } from "drizzle-orm";

export interface GiveawayWithStats extends Giveaway {
  entriesCount: number;
  winnersCount: number;
  winners?: GiveawayWinner[];
}

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_ENTRIES_PER_MINUTE = 10;

export class GiveawayService {
  async createGiveaway(userId: string, data: InsertGiveaway): Promise<Giveaway> {
    return await db.transaction(async (tx) => {
      const [activeGiveaway] = await tx
        .select()
        .from(giveaways)
        .where(
          and(
            eq(giveaways.userId, userId),
            eq(giveaways.isActive, true)
          )
        )
        .limit(1);

      if (activeGiveaway) {
        throw new Error("You already have an active giveaway. Please end it before starting a new one.");
      }

      const keyword = data.keyword.startsWith("!") ? data.keyword : `!${data.keyword}`;

      const [giveaway] = await tx
        .insert(giveaways)
        .values({
          ...data,
          userId,
          keyword,
          isActive: true,
          entryCount: 0,
        })
        .returning();

      return giveaway;
    });
  }

  async enterGiveaway(
    userId: string,
    giveawayId: string,
    username: string,
    platform: string,
    isSubscriber: boolean = false
  ): Promise<{ success: boolean; message: string; entry?: GiveawayEntry }> {
    try {
      const result = await db.transaction(async (tx) => {
        const [giveaway] = await tx
          .select()
          .from(giveaways)
          .where(
            and(
              eq(giveaways.id, giveawayId),
              eq(giveaways.userId, userId)
            )
          )
          .limit(1)
          .for("update");

        if (!giveaway) {
          return { success: false, message: "Giveaway not found" };
        }

        if (!giveaway.isActive) {
          return { success: false, message: "This giveaway has ended" };
        }

        if (giveaway.requiresSubscription && !isSubscriber) {
          return { success: false, message: "This giveaway is for subscribers only" };
        }

        const [existingEntry] = await tx
          .select()
          .from(giveawayEntries)
          .where(
            and(
              eq(giveawayEntries.giveawayId, giveawayId),
              eq(giveawayEntries.username, username),
              eq(giveawayEntries.platform, platform)
            )
          )
          .limit(1);

        if (existingEntry) {
          return { success: false, message: "You have already entered this giveaway" };
        }

        const rateLimitCheck = await this.checkRateLimit(tx, userId, username, platform);
        if (!rateLimitCheck.allowed) {
          return { success: false, message: rateLimitCheck.message };
        }

        await tx
          .insert(giveawayEntryAttempts)
          .values({
            userId,
            username,
            platform,
            giveawayId,
          });

        const [entry] = await tx
          .insert(giveawayEntries)
          .values({
            giveawayId,
            userId,
            username,
            platform,
            subscriberStatus: isSubscriber,
          })
          .returning();

        await tx
          .update(giveaways)
          .set({
            entryCount: sql`${giveaways.entryCount} + 1`,
          })
          .where(eq(giveaways.id, giveawayId));

        return {
          success: true,
          message: `@${username}, you're entered in the giveaway!`,
          entry,
        };
      });

      return result;
    } catch (error: any) {
      if (error.code === '23505') {
        return { success: false, message: "You have already entered this giveaway" };
      }
      console.error("Error entering giveaway:", error);
      return { success: false, message: "An error occurred while entering the giveaway" };
    }
  }

  private async checkRateLimit(
    tx: any,
    userId: string,
    username: string,
    platform: string
  ): Promise<{ allowed: boolean; message: string }> {
    const oneMinuteAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);

    const attempts = await tx
      .select()
      .from(giveawayEntryAttempts)
      .where(
        and(
          eq(giveawayEntryAttempts.userId, userId),
          eq(giveawayEntryAttempts.username, username),
          eq(giveawayEntryAttempts.platform, platform),
          gte(giveawayEntryAttempts.attemptedAt, oneMinuteAgo)
        )
      );

    if (attempts.length >= MAX_ENTRIES_PER_MINUTE) {
      return {
        allowed: false,
        message: `Rate limit exceeded. You can only enter ${MAX_ENTRIES_PER_MINUTE} giveaways per minute. Please wait and try again.`,
      };
    }

    return { allowed: true, message: "" };
  }

  async endGiveaway(
    userId: string,
    giveawayId: string
  ): Promise<{ giveaway: Giveaway; winners: GiveawayWinner[] }> {
    return await db.transaction(async (tx) => {
      const [giveaway] = await tx
        .select()
        .from(giveaways)
        .where(
          and(
            eq(giveaways.id, giveawayId),
            eq(giveaways.userId, userId)
          )
        )
        .limit(1)
        .for("update");

      if (!giveaway) {
        throw new Error("Giveaway not found");
      }

      if (!giveaway.isActive) {
        throw new Error("This giveaway has already ended");
      }

      const entries = await tx
        .select()
        .from(giveawayEntries)
        .where(eq(giveawayEntries.giveawayId, giveawayId));

      if (entries.length === 0) {
        throw new Error("No entries to select winners from");
      }

      const maxWinners = Math.min(giveaway.maxWinners, entries.length);
      const selectedWinners = this.selectRandomWinners(entries, maxWinners);

      const winnerRecords: GiveawayWinner[] = [];
      for (const entry of selectedWinners) {
        const [winner] = await tx
          .insert(giveawayWinners)
          .values({
            giveawayId,
            username: entry.username,
            platform: entry.platform,
          })
          .returning();
        winnerRecords.push(winner);
      }

      const [updatedGiveaway] = await tx
        .update(giveaways)
        .set({
          isActive: false,
          endedAt: new Date(),
        })
        .where(eq(giveaways.id, giveawayId))
        .returning();

      return {
        giveaway: updatedGiveaway,
        winners: winnerRecords,
      };
    });
  }

  async getActiveGiveaway(userId: string): Promise<GiveawayWithStats | null> {
    const [giveaway] = await db
      .select()
      .from(giveaways)
      .where(
        and(
          eq(giveaways.userId, userId),
          eq(giveaways.isActive, true)
        )
      )
      .limit(1);

    if (!giveaway) {
      return null;
    }

    const winners = await db
      .select()
      .from(giveawayWinners)
      .where(eq(giveawayWinners.giveawayId, giveaway.id));

    return {
      ...giveaway,
      entriesCount: giveaway.entryCount,
      winnersCount: winners.length,
      winners,
    };
  }

  async getGiveawayHistory(
    userId: string,
    limit: number = 50
  ): Promise<GiveawayWithStats[]> {
    const allGiveaways = await db
      .select()
      .from(giveaways)
      .where(eq(giveaways.userId, userId))
      .orderBy(sql`${giveaways.createdAt} DESC`)
      .limit(limit);

    const giveawaysWithStats = await Promise.all(
      allGiveaways.map(async (giveaway) => {
        const winners = await db
          .select()
          .from(giveawayWinners)
          .where(eq(giveawayWinners.giveawayId, giveaway.id));

        return {
          ...giveaway,
          entriesCount: giveaway.entryCount,
          winnersCount: winners.length,
          winners,
        };
      })
    );

    return giveawaysWithStats;
  }

  async getGiveaway(userId: string, giveawayId: string): Promise<GiveawayWithStats | null> {
    const [giveaway] = await db
      .select()
      .from(giveaways)
      .where(
        and(
          eq(giveaways.id, giveawayId),
          eq(giveaways.userId, userId)
        )
      )
      .limit(1);

    if (!giveaway) {
      return null;
    }

    const winners = await db
      .select()
      .from(giveawayWinners)
      .where(eq(giveawayWinners.giveawayId, giveaway.id));

    return {
      ...giveaway,
      entriesCount: giveaway.entryCount,
      winnersCount: winners.length,
      winners,
    };
  }

  async cancelGiveaway(userId: string, giveawayId: string): Promise<void> {
    await db.transaction(async (tx) => {
      const [giveaway] = await tx
        .select()
        .from(giveaways)
        .where(
          and(
            eq(giveaways.id, giveawayId),
            eq(giveaways.userId, userId)
          )
        )
        .limit(1)
        .for("update");

      if (!giveaway) {
        throw new Error("Giveaway not found");
      }

      if (!giveaway.isActive) {
        throw new Error("Cannot cancel a giveaway that has already ended");
      }

      await tx
        .delete(giveaways)
        .where(eq(giveaways.id, giveawayId));
    });
  }

  async cleanupOldAttempts(): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await db
      .delete(giveawayEntryAttempts)
      .where(sql`${giveawayEntryAttempts.attemptedAt} < ${oneHourAgo}`);
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
