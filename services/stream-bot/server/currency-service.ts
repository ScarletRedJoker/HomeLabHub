import { db } from "./db";
import {
  currencySettings,
  userBalances,
  currencyTransactions,
  currencyRewards,
  rewardRedemptions,
  type CurrencySettings,
  type UserBalance,
  type CurrencyTransaction,
  type CurrencyReward,
  type RewardRedemption,
  type InsertCurrencySettings,
  type InsertUserBalance,
  type InsertCurrencyTransaction,
  type InsertCurrencyReward,
  type InsertRewardRedemption,
  type UpdateCurrencySettings,
  type UpdateCurrencyReward,
} from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export class CurrencyService {
  async getCurrencySettings(userId: string): Promise<CurrencySettings | null> {
    const [settings] = await db
      .select()
      .from(currencySettings)
      .where(eq(currencySettings.userId, userId))
      .limit(1);

    return settings || null;
  }

  async createCurrencySettings(
    userId: string,
    data: Partial<InsertCurrencySettings>
  ): Promise<CurrencySettings> {
    const [settings] = await db
      .insert(currencySettings)
      .values({
        userId,
        currencyName: data.currencyName || "Points",
        currencySymbol: data.currencySymbol || "⭐",
        earnPerMessage: data.earnPerMessage || 1,
        earnPerMinute: data.earnPerMinute || 10,
        startingBalance: data.startingBalance || 100,
        maxBalance: data.maxBalance || 1000000,
        enableGambling: data.enableGambling !== undefined ? data.enableGambling : true,
      })
      .returning();

    return settings;
  }

  async updateCurrencySettings(
    userId: string,
    data: UpdateCurrencySettings
  ): Promise<CurrencySettings> {
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

  async getBalance(
    botUserId: string,
    username: string,
    platform: string
  ): Promise<UserBalance | null> {
    const [balance] = await db
      .select()
      .from(userBalances)
      .where(
        and(
          eq(userBalances.botUserId, botUserId),
          eq(userBalances.username, username),
          eq(userBalances.platform, platform)
        )
      )
      .limit(1);

    return balance || null;
  }

  async getOrCreateBalance(
    botUserId: string,
    username: string,
    platform: string
  ): Promise<UserBalance> {
    let balance = await this.getBalance(botUserId, username, platform);

    if (!balance) {
      const settings = await this.getCurrencySettings(botUserId);
      const startingBalance = settings?.startingBalance || 100;
      
      const [newBalance] = await db
        .insert(userBalances)
        .values({
          botUserId,
          username,
          platform,
          balance: startingBalance,
          totalEarned: 0,
          totalSpent: 0,
        })
        .returning();

      balance = newBalance;
    }

    return balance;
  }

  async addPoints(
    botUserId: string,
    username: string,
    platform: string,
    amount: number,
    reason: string,
    type: "earn_message" | "earn_watch" | "gamble_win" | "admin_adjust" | "transfer_in" = "earn_message"
  ): Promise<UserBalance> {
    const balance = await this.getOrCreateBalance(botUserId, username, platform);
    const settings = await this.getCurrencySettings(botUserId);
    const maxBalance = settings?.maxBalance || 1000000;
    
    const newBalance = Math.min(balance.balance + amount, maxBalance);
    const actualAmount = newBalance - balance.balance;

    const [updatedBalance] = await db
      .update(userBalances)
      .set({
        balance: newBalance,
        totalEarned: balance.totalEarned + actualAmount,
        lastEarned: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(userBalances.id, balance.id))
      .returning();

    await this.trackTransaction(balance.id, username, type, actualAmount, reason);

    return updatedBalance;
  }

  async removePoints(
    botUserId: string,
    username: string,
    platform: string,
    amount: number,
    reason: string,
    type: "gamble_loss" | "reward_purchase" | "admin_adjust" | "transfer_out" = "reward_purchase"
  ): Promise<{ success: boolean; balance?: UserBalance; error?: string }> {
    const balance = await this.getOrCreateBalance(botUserId, username, platform);

    if (balance.balance < amount) {
      return {
        success: false,
        error: `Insufficient balance. You have ${balance.balance} points but need ${amount}.`,
      };
    }

    const [updatedBalance] = await db
      .update(userBalances)
      .set({
        balance: balance.balance - amount,
        totalSpent: balance.totalSpent + amount,
        updatedAt: new Date(),
      })
      .where(eq(userBalances.id, balance.id))
      .returning();

    await this.trackTransaction(balance.id, username, type, -amount, reason);

    return { success: true, balance: updatedBalance };
  }

  async gamblePoints(
    botUserId: string,
    username: string,
    platform: string,
    wager: number
  ): Promise<{
    success: boolean;
    won: boolean;
    newBalance: number;
    winAmount?: number;
    error?: string;
  }> {
    const settings = await this.getCurrencySettings(botUserId);

    if (!settings?.enableGambling) {
      return {
        success: false,
        won: false,
        newBalance: 0,
        error: "Gambling is currently disabled.",
      };
    }

    const balance = await this.getOrCreateBalance(botUserId, username, platform);

    if (balance.balance < wager) {
      return {
        success: false,
        won: false,
        newBalance: balance.balance,
        error: `Insufficient balance. You have ${balance.balance} points but tried to gamble ${wager}.`,
      };
    }

    if (wager <= 0) {
      return {
        success: false,
        won: false,
        newBalance: balance.balance,
        error: "Wager must be greater than 0.",
      };
    }

    const won = Math.random() < 0.5;

    if (won) {
      const updatedBalance = await this.addPoints(
        botUserId,
        username,
        platform,
        wager,
        `Won gamble of ${wager} points`,
        "gamble_win"
      );

      return {
        success: true,
        won: true,
        newBalance: updatedBalance.balance,
        winAmount: wager,
      };
    } else {
      const result = await this.removePoints(
        botUserId,
        username,
        platform,
        wager,
        `Lost gamble of ${wager} points`,
        "gamble_loss"
      );

      return {
        success: true,
        won: false,
        newBalance: result.balance?.balance || balance.balance,
      };
    }
  }

  async getLeaderboard(
    botUserId: string,
    limit: number = 10
  ): Promise<UserBalance[]> {
    const leaderboard = await db
      .select()
      .from(userBalances)
      .where(eq(userBalances.botUserId, botUserId))
      .orderBy(desc(userBalances.balance))
      .limit(limit);

    return leaderboard;
  }

  async trackTransaction(
    balanceId: string,
    username: string,
    type:
      | "earn_message"
      | "earn_watch"
      | "gamble_win"
      | "gamble_loss"
      | "reward_purchase"
      | "admin_adjust"
      | "transfer_in"
      | "transfer_out",
    amount: number,
    description: string
  ): Promise<CurrencyTransaction> {
    const [transaction] = await db
      .insert(currencyTransactions)
      .values({
        balanceId,
        username,
        type,
        amount,
        description,
      })
      .returning();

    return transaction;
  }

  async getTransactions(
    botUserId: string,
    username: string,
    platform: string,
    limit: number = 50
  ): Promise<CurrencyTransaction[]> {
    const balance = await this.getBalance(botUserId, username, platform);

    if (!balance) {
      return [];
    }

    const transactions = await db
      .select()
      .from(currencyTransactions)
      .where(eq(currencyTransactions.balanceId, balance.id))
      .orderBy(desc(currencyTransactions.timestamp))
      .limit(limit);

    return transactions;
  }

  async createReward(
    botUserId: string,
    data: InsertCurrencyReward
  ): Promise<CurrencyReward> {
    const [reward] = await db
      .insert(currencyRewards)
      .values({
        botUserId,
        rewardName: data.rewardName,
        cost: data.cost,
        command: data.command || null,
        stock: data.stock || null,
        maxRedeems: data.maxRedeems || null,
        rewardType: data.rewardType,
        rewardData: data.rewardData || null,
        isActive: data.isActive !== undefined ? data.isActive : true,
      })
      .returning();

    return reward;
  }

  async getRewards(botUserId: string): Promise<CurrencyReward[]> {
    const rewards = await db
      .select()
      .from(currencyRewards)
      .where(eq(currencyRewards.botUserId, botUserId))
      .orderBy(currencyRewards.cost);

    return rewards;
  }

  async getActiveRewards(botUserId: string): Promise<CurrencyReward[]> {
    const rewards = await db
      .select()
      .from(currencyRewards)
      .where(
        and(
          eq(currencyRewards.botUserId, botUserId),
          eq(currencyRewards.isActive, true)
        )
      )
      .orderBy(currencyRewards.cost);

    return rewards;
  }

  async getReward(botUserId: string, rewardId: string): Promise<CurrencyReward | null> {
    const [reward] = await db
      .select()
      .from(currencyRewards)
      .where(
        and(
          eq(currencyRewards.id, rewardId),
          eq(currencyRewards.botUserId, botUserId)
        )
      )
      .limit(1);

    return reward || null;
  }

  async updateReward(
    botUserId: string,
    rewardId: string,
    data: UpdateCurrencyReward
  ): Promise<CurrencyReward> {
    const [reward] = await db
      .update(currencyRewards)
      .set(data)
      .where(
        and(
          eq(currencyRewards.id, rewardId),
          eq(currencyRewards.botUserId, botUserId)
        )
      )
      .returning();

    return reward;
  }

  async deleteReward(botUserId: string, rewardId: string): Promise<boolean> {
    const result = await db
      .delete(currencyRewards)
      .where(
        and(
          eq(currencyRewards.id, rewardId),
          eq(currencyRewards.botUserId, botUserId)
        )
      );

    return true;
  }

  async redeemReward(
    botUserId: string,
    username: string,
    platform: string,
    rewardId: string
  ): Promise<{
    success: boolean;
    reward?: CurrencyReward;
    newBalance?: number;
    redemption?: RewardRedemption;
    error?: string;
  }> {
    const reward = await this.getReward(botUserId, rewardId);

    if (!reward) {
      return {
        success: false,
        error: "Reward not found.",
      };
    }

    if (!reward.isActive) {
      return {
        success: false,
        error: "This reward is currently disabled.",
      };
    }

    if (reward.stock !== null && reward.stock <= 0) {
      return {
        success: false,
        error: "This reward is out of stock.",
      };
    }

    if (reward.maxRedeems !== null) {
      const userRedemptionCount = await this.getUserRedemptionCount(
        botUserId,
        username,
        platform,
        rewardId
      );
      
      if (userRedemptionCount >= reward.maxRedeems) {
        return {
          success: false,
          error: `You have already redeemed this reward the maximum number of times (${reward.maxRedeems}).`,
        };
      }
    }

    const result = await this.removePoints(
      botUserId,
      username,
      platform,
      reward.cost,
      `Redeemed reward: ${reward.rewardName}`,
      "reward_purchase"
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    if (reward.stock !== null) {
      await db
        .update(currencyRewards)
        .set({ 
          stock: reward.stock - 1,
          updatedAt: new Date(),
        })
        .where(eq(currencyRewards.id, rewardId));
    }

    const [redemption] = await db
      .insert(rewardRedemptions)
      .values({
        rewardId,
        botUserId,
        username,
        platform,
        fulfilled: false,
      })
      .returning();

    return {
      success: true,
      reward,
      newBalance: result.balance!.balance,
      redemption,
    };
  }

  async getTotalPoints(botUserId: string): Promise<number> {
    const result = await db
      .select({
        total: sql<number>`COALESCE(SUM(${userBalances.balance}), 0)`,
      })
      .from(userBalances)
      .where(eq(userBalances.botUserId, botUserId));

    return result[0]?.total || 0;
  }

  async getTopEarners(
    botUserId: string,
    limit: number = 10
  ): Promise<UserBalance[]> {
    const topEarners = await db
      .select()
      .from(userBalances)
      .where(eq(userBalances.botUserId, botUserId))
      .orderBy(desc(userBalances.totalEarned))
      .limit(limit);

    return topEarners;
  }

  async getTopSpenders(
    botUserId: string,
    limit: number = 10
  ): Promise<UserBalance[]> {
    const topSpenders = await db
      .select()
      .from(userBalances)
      .where(eq(userBalances.botUserId, botUserId))
      .orderBy(desc(userBalances.totalSpent))
      .limit(limit);

    return topSpenders;
  }

  async transferPoints(
    botUserId: string,
    fromUsername: string,
    toUsername: string,
    platform: string,
    amount: number
  ): Promise<{
    success: boolean;
    fromBalance?: number;
    toBalance?: number;
    error?: string;
  }> {
    if (amount <= 0) {
      return {
        success: false,
        error: "Transfer amount must be greater than 0.",
      };
    }

    if (fromUsername.toLowerCase() === toUsername.toLowerCase()) {
      return {
        success: false,
        error: "You cannot transfer points to yourself.",
      };
    }

    const removeResult = await this.removePoints(
      botUserId,
      fromUsername,
      platform,
      amount,
      `Transferred ${amount} points to ${toUsername}`,
      "transfer_out"
    );

    if (!removeResult.success) {
      return {
        success: false,
        error: removeResult.error,
      };
    }

    const toBalance = await this.addPoints(
      botUserId,
      toUsername,
      platform,
      amount,
      `Received ${amount} points from ${fromUsername}`,
      "transfer_in"
    );

    return {
      success: true,
      fromBalance: removeResult.balance!.balance,
      toBalance: toBalance.balance,
    };
  }

  async getUserRedemptionCount(
    botUserId: string,
    username: string,
    platform: string,
    rewardId: string
  ): Promise<number> {
    const result = await db
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(rewardRedemptions)
      .where(
        and(
          eq(rewardRedemptions.rewardId, rewardId),
          eq(rewardRedemptions.botUserId, botUserId),
          eq(rewardRedemptions.username, username),
          eq(rewardRedemptions.platform, platform)
        )
      );

    return Number(result[0]?.count || 0);
  }

  async getRedemptions(
    botUserId: string,
    limit: number = 50
  ): Promise<RewardRedemption[]> {
    const redemptions = await db
      .select()
      .from(rewardRedemptions)
      .where(eq(rewardRedemptions.botUserId, botUserId))
      .orderBy(desc(rewardRedemptions.redeemedAt))
      .limit(limit);

    return redemptions;
  }

  async getPendingRedemptions(botUserId: string): Promise<RewardRedemption[]> {
    const redemptions = await db
      .select()
      .from(rewardRedemptions)
      .where(
        and(
          eq(rewardRedemptions.botUserId, botUserId),
          eq(rewardRedemptions.fulfilled, false)
        )
      )
      .orderBy(desc(rewardRedemptions.redeemedAt));

    return redemptions;
  }

  async getRedemptionsByReward(
    botUserId: string,
    rewardId: string
  ): Promise<RewardRedemption[]> {
    const redemptions = await db
      .select()
      .from(rewardRedemptions)
      .where(
        and(
          eq(rewardRedemptions.rewardId, rewardId),
          eq(rewardRedemptions.botUserId, botUserId)
        )
      )
      .orderBy(desc(rewardRedemptions.redeemedAt));

    return redemptions;
  }

  async fulfillRedemption(
    botUserId: string,
    redemptionId: string
  ): Promise<RewardRedemption> {
    const [redemption] = await db
      .update(rewardRedemptions)
      .set({
        fulfilled: true,
        fulfilledAt: new Date(),
      })
      .where(
        and(
          eq(rewardRedemptions.id, redemptionId),
          eq(rewardRedemptions.botUserId, botUserId)
        )
      )
      .returning();

    return redemption;
  }
}

export const currencyService = new CurrencyService();
