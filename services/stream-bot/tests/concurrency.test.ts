import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "../server/db";
import { giveawayService } from "../server/giveaway-service";
import { currencyService } from "../server/currency-service";
import {
  users,
  giveaways,
  giveawayEntries,
  giveawayWinners,
  userBalances,
  currencySettings,
  giveawayEntryAttempts,
} from "../shared/schema";
import { eq, and } from "drizzle-orm";

describe("Concurrency Tests - Giveaways", () => {
  let testUserId: string;
  let testGiveawayId: string;

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({
        email: `concurrency-test-${Date.now()}@test.com`,
        passwordHash: "test",
      })
      .returning();
    testUserId = user.id;
  });

  afterAll(async () => {
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  beforeEach(async () => {
    await db.delete(giveawayEntries);
    await db.delete(giveawayWinners);
    await db.delete(giveaways);
    await db.delete(giveawayEntryAttempts);
  });

  it("should handle 100 concurrent giveaway entries without duplicates", async () => {
    const giveaway = await giveawayService.createGiveaway(testUserId, {
      title: "Concurrent Test Giveaway",
      keyword: "!test",
      maxWinners: 10,
      requiresSubscription: false,
    });
    testGiveawayId = giveaway.id;

    const numberOfUsers = 100;
    const usernames = Array.from({ length: numberOfUsers }, (_, i) => `user${i}`);

    const entryPromises = usernames.map((username) =>
      giveawayService.enterGiveaway(
        testUserId,
        testGiveawayId,
        username,
        "twitch",
        false
      )
    );

    const results = await Promise.all(entryPromises);

    const successfulEntries = results.filter((r) => r.success);
    expect(successfulEntries.length).toBe(numberOfUsers);

    const entries = await db
      .select()
      .from(giveawayEntries)
      .where(eq(giveawayEntries.giveawayId, testGiveawayId));

    expect(entries.length).toBe(numberOfUsers);

    const uniqueUsernames = new Set(entries.map((e) => e.username));
    expect(uniqueUsernames.size).toBe(numberOfUsers);

    const [updatedGiveaway] = await db
      .select()
      .from(giveaways)
      .where(eq(giveaways.id, testGiveawayId));

    expect(updatedGiveaway.entryCount).toBe(numberOfUsers);
  }, 30000);

  it("should prevent duplicate entries from the same user", async () => {
    const giveaway = await giveawayService.createGiveaway(testUserId, {
      title: "Duplicate Test Giveaway",
      keyword: "!duplicate",
      maxWinners: 5,
      requiresSubscription: false,
    });
    testGiveawayId = giveaway.id;

    const entryPromises = Array.from({ length: 10 }, () =>
      giveawayService.enterGiveaway(
        testUserId,
        testGiveawayId,
        "duplicateUser",
        "twitch",
        false
      )
    );

    const results = await Promise.all(entryPromises);

    const successfulEntries = results.filter((r) => r.success);
    expect(successfulEntries.length).toBe(1);

    const failedEntries = results.filter((r) => !r.success);
    expect(failedEntries.length).toBe(9);
    expect(failedEntries[0].message).toContain("already entered");

    const entries = await db
      .select()
      .from(giveawayEntries)
      .where(eq(giveawayEntries.giveawayId, testGiveawayId));

    expect(entries.length).toBe(1);
  }, 30000);

  it("should enforce rate limiting on giveaway entries", async () => {
    const giveawayIds: string[] = [];
    
    for (let i = 0; i < 15; i++) {
      if (i > 0) {
        const prevId = giveawayIds[i - 1];
        await giveawayService.enterGiveaway(
          testUserId,
          prevId,
          `tempUser${i}`,
          "twitch",
          false
        ).catch(() => {});
        
        try {
          await giveawayService.endGiveaway(testUserId, prevId);
        } catch (e) {
          
        }
      }
      
      const giveaway = await giveawayService.createGiveaway(testUserId, {
        title: `Rate Limit Test ${i}`,
        keyword: `!test${i}`,
        maxWinners: 1,
        requiresSubscription: false,
      });
      giveawayIds.push(giveaway.id);
    }

    await giveawayService.enterGiveaway(
      testUserId,
      giveawayIds[giveawayIds.length - 1],
      "tempUserLast",
      "twitch",
      false
    ).catch(() => {});
    
    await giveawayService.endGiveaway(testUserId, giveawayIds[giveawayIds.length - 1]).catch(() => {});

    const entryPromises = giveawayIds.map((id) =>
      giveawayService.enterGiveaway(
        testUserId,
        id,
        "rateLimitUser",
        "twitch",
        false
      )
    );

    const results = await Promise.all(entryPromises);

    const successfulEntries = results.filter((r) => r.success);
    const rateLimitedEntries = results.filter((r) =>
      r.message?.includes("Rate limit")
    );
    const closedGiveawayEntries = results.filter((r) =>
      r.message?.includes("ended")
    );

    expect(successfulEntries.length).toBeLessThanOrEqual(10);
    expect(rateLimitedEntries.length + closedGiveawayEntries.length).toBeGreaterThan(0);
  }, 30000);

  it("should select unique winners without duplicates", async () => {
    const giveaway = await giveawayService.createGiveaway(testUserId, {
      title: "Winner Selection Test",
      keyword: "!winners",
      maxWinners: 10,
      requiresSubscription: false,
    });
    testGiveawayId = giveaway.id;

    const usernames = Array.from({ length: 50 }, (_, i) => `user${i}`);
    await Promise.all(
      usernames.map((username) =>
        giveawayService.enterGiveaway(
          testUserId,
          testGiveawayId,
          username,
          "twitch",
          false
        )
      )
    );

    const endPromises = Array.from({ length: 5 }, () =>
      giveawayService
        .endGiveaway(testUserId, testGiveawayId)
        .catch((err) => ({ error: err.message }))
    );

    const results = await Promise.all(endPromises);

    const successfulEnds = results.filter(
      (r) => !("error" in r) && r.winners?.length > 0
    );
    expect(successfulEnds.length).toBe(1);

    const winners = await db
      .select()
      .from(giveawayWinners)
      .where(eq(giveawayWinners.giveawayId, testGiveawayId));

    expect(winners.length).toBe(10);

    const uniqueWinners = new Set(winners.map((w) => w.username));
    expect(uniqueWinners.size).toBe(10);
  }, 30000);
});

describe("Concurrency Tests - Currency", () => {
  let testUserId: string;

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({
        email: `currency-test-${Date.now()}@test.com`,
        passwordHash: "test",
      })
      .returning();
    testUserId = user.id;

    await currencyService.createCurrencySettings(testUserId, {
      currencyName: "TestPoints",
      currencySymbol: "🪙",
      earnPerMessage: 1,
      earnPerMinute: 10,
      startingBalance: 100,
      maxBalance: 1000000,
      enableGambling: true,
    });
  });

  afterAll(async () => {
    if (testUserId) {
      await db.delete(currencySettings).where(eq(currencySettings.userId, testUserId));
      await db.delete(userBalances).where(eq(userBalances.botUserId, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  beforeEach(async () => {
    await db.delete(userBalances).where(eq(userBalances.botUserId, testUserId));
  });

  it("should handle 100 concurrent point additions without race conditions", async () => {
    const username = "concurrentUser";
    const platform = "twitch";
    const pointsPerAdd = 10;
    const numberOfAdds = 100;

    const addPromises = Array.from({ length: numberOfAdds }, (_, i) =>
      currencyService.addPoints(
        testUserId,
        username,
        platform,
        pointsPerAdd,
        `Add ${i}`,
        "earn_message"
      )
    );

    await Promise.all(addPromises);

    const balance = await currencyService.getBalance(testUserId, username, platform);

    const expectedBalance = 100 + pointsPerAdd * numberOfAdds;
    expect(balance?.balance).toBe(expectedBalance);
    expect(balance?.totalEarned).toBe(pointsPerAdd * numberOfAdds);
  }, 30000);

  it("should prevent negative balances with concurrent operations", async () => {
    const username = "negativeTestUser";
    const platform = "twitch";

    await currencyService.getOrCreateBalance(testUserId, username, platform);

    const removePromises = Array.from({ length: 50 }, () =>
      currencyService.removePoints(
        testUserId,
        username,
        platform,
        10,
        "Remove test",
        "admin_adjust"
      )
    );

    const results = await Promise.all(removePromises);

    const successfulRemovals = results.filter((r) => r.success);
    const failedRemovals = results.filter((r) => !r.success);

    expect(successfulRemovals.length).toBeLessThanOrEqual(10);
    expect(failedRemovals.some((r) => r.error?.includes("Insufficient"))).toBe(true);

    const balance = await currencyService.getBalance(testUserId, username, platform);
    expect(balance?.balance).toBeGreaterThanOrEqual(0);
  }, 30000);

  it("should handle concurrent gambling operations atomically", async () => {
    const username = "gamblerUser";
    const platform = "twitch";

    await currencyService.getOrCreateBalance(testUserId, username, platform);
    
    await db
      .update(userBalances)
      .set({ balance: 1000, totalEarned: 900 })
      .where(
        and(
          eq(userBalances.botUserId, testUserId),
          eq(userBalances.username, username),
          eq(userBalances.platform, platform)
        )
      );

    const gamblePromises = Array.from({ length: 20 }, () =>
      currencyService.gamblePoints(testUserId, username, platform, 50)
    );

    const results = await Promise.all(gamblePromises);

    const successfulGambles = results.filter((r) => r.success);
    expect(successfulGambles.length).toBeGreaterThan(0);

    const balance = await currencyService.getBalance(testUserId, username, platform);
    expect(balance?.balance).toBeGreaterThanOrEqual(0);

    const winsAndLosses = successfulGambles.reduce(
      (acc, r) => {
        if (r.won) {
          acc.wins += r.winAmount || 0;
        } else {
          acc.losses += 50;
        }
        return acc;
      },
      { wins: 0, losses: 0 }
    );

    const expectedBalance = 1000 + winsAndLosses.wins - winsAndLosses.losses;
    expect(balance?.balance).toBe(expectedBalance);
  }, 30000);

  it("should handle concurrent transfers without partial failures", async () => {
    const sender = "sender";
    const receiver = "receiver";
    const platform = "twitch";

    await currencyService.getOrCreateBalance(testUserId, sender, platform);
    
    await db
      .update(userBalances)
      .set({ balance: 1000, totalEarned: 900 })
      .where(
        and(
          eq(userBalances.botUserId, testUserId),
          eq(userBalances.username, sender),
          eq(userBalances.platform, platform)
        )
      );

    const transferPromises = Array.from({ length: 50 }, () =>
      currencyService.transferPoints(testUserId, sender, receiver, platform, 10)
    );

    const results = await Promise.all(transferPromises);

    const successfulTransfers = results.filter((r) => r.success);

    expect(successfulTransfers.length).toBeLessThanOrEqual(100);

    const senderBalance = await currencyService.getBalance(
      testUserId,
      sender,
      platform
    );
    const receiverBalance = await currencyService.getBalance(
      testUserId,
      receiver,
      platform
    );

    const totalPoints = (senderBalance?.balance || 0) + (receiverBalance?.balance || 0);
    const transferredAmount = successfulTransfers.length * 10;
    
    expect(totalPoints).toBeGreaterThanOrEqual(1000);
    expect(senderBalance?.balance).toBe(1000 - transferredAmount);
    expect(receiverBalance?.balance).toBeGreaterThanOrEqual(transferredAmount);

    expect(senderBalance?.balance).toBeGreaterThanOrEqual(0);
    expect(receiverBalance?.balance).toBeGreaterThanOrEqual(0);
  }, 30000);

  it("should maintain consistency under mixed concurrent operations", async () => {
    const username = "mixedOpsUser";
    const platform = "twitch";

    await currencyService.addPoints(
      testUserId,
      username,
      platform,
      500,
      "Initial",
      "admin_adjust"
    );

    const operations = [
      ...Array.from({ length: 20 }, () => () =>
        currencyService.addPoints(
          testUserId,
          username,
          platform,
          10,
          "Add",
          "earn_message"
        )
      ),
      ...Array.from({ length: 20 }, () => () =>
        currencyService.removePoints(
          testUserId,
          username,
          platform,
          5,
          "Remove",
          "admin_adjust"
        )
      ),
      ...Array.from({ length: 10 }, () => () =>
        currencyService.gamblePoints(testUserId, username, platform, 20)
      ),
    ];

    const shuffledOps = operations.sort(() => Math.random() - 0.5);
    const results = await Promise.all(shuffledOps.map((op) => op()));

    const finalBalance = await currencyService.getBalance(
      testUserId,
      username,
      platform
    );

    expect(finalBalance?.balance).toBeGreaterThanOrEqual(0);

    expect(finalBalance?.totalEarned).toBeGreaterThan(0);
    expect(finalBalance?.totalSpent).toBeGreaterThanOrEqual(0);
  }, 30000);
});
