import { WebSocket } from "ws";
import { BotWorker } from "./bot-worker";
import { createUserStorage } from "./user-storage";
import { db } from "./db";
import { botInstances } from "@shared/schema";
import { eq } from "drizzle-orm";

export class BotManager {
  private workers: Map<string, BotWorker> = new Map();
  private wsClients: Map<string, Set<WebSocket>> = new Map(); // userId -> Set<WebSocket>
  private wsToUser: Map<WebSocket, string> = new Map(); // WebSocket -> userId (for cleanup)
  private isReady = false;

  constructor() {}

  async bootstrap(): Promise<void> {
    console.log("[BotManager] Bootstrapping...");

    // Query bot_instances for active bots
    const activeInstances = await db.query.botInstances.findMany({
      where: eq(botInstances.status, "running"),
    });

    console.log(`[BotManager] Found ${activeInstances.length} active bot instances`);

    // Start workers for active bots
    for (const instance of activeInstances) {
      try {
        await this.startUserBot(instance.userId);
      } catch (error) {
        console.error(`[BotManager] Failed to start bot for user ${instance.userId}:`, error);
        // Update instance to stopped status
        await db
          .update(botInstances)
          .set({ status: "stopped", updatedAt: new Date() })
          .where(eq(botInstances.userId, instance.userId));
      }
    }

    this.isReady = true;
    console.log("[BotManager] Bootstrap complete");
  }

  async startUserBot(userId: string): Promise<void> {
    // Check if worker already exists
    if (this.workers.has(userId)) {
      console.log(`[BotManager] Bot already running for user ${userId}`);
      return;
    }

    console.log(`[BotManager] Starting bot for user ${userId}`);

    // Create user-scoped storage
    const userStorage = createUserStorage(userId);

    // Create worker
    const worker = new BotWorker(userId, userStorage, (event) => {
      this.handleBotEvent(event);
    });

    // Store worker
    this.workers.set(userId, worker);

    // Start worker
    try {
      await worker.start();

      // Update bot instance status
      await db
        .update(botInstances)
        .set({
          status: "running",
          lastHeartbeat: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(botInstances.userId, userId));
    } catch (error) {
      // Remove worker if start failed
      this.workers.delete(userId);

      // Update bot instance status
      await db
        .update(botInstances)
        .set({
          status: "error",
          errorMessage: String(error),
          updatedAt: new Date(),
        })
        .where(eq(botInstances.userId, userId));

      throw error;
    }
  }

  async stopUserBot(userId: string): Promise<void> {
    const worker = this.workers.get(userId);

    if (!worker) {
      console.log(`[BotManager] No bot running for user ${userId}`);
      return;
    }

    console.log(`[BotManager] Stopping bot for user ${userId}`);

    try {
      await worker.stop();
    } finally {
      // Remove worker from map
      this.workers.delete(userId);

      // Update bot instance status
      await db
        .update(botInstances)
        .set({
          status: "stopped",
          updatedAt: new Date(),
        })
        .where(eq(botInstances.userId, userId));
    }
  }

  async restartUserBot(userId: string): Promise<void> {
    await this.stopUserBot(userId);
    await this.startUserBot(userId);
  }

  getWorker(userId: string): BotWorker | undefined {
    return this.workers.get(userId);
  }

  getUserBotStatus(userId: string): { isRunning: boolean } {
    const worker = this.workers.get(userId);
    return {
      isRunning: worker?.getStatus().isRunning || false,
    };
  }

  // WebSocket management
  addWSClient(ws: WebSocket, userId: string): void {
    if (!this.wsClients.has(userId)) {
      this.wsClients.set(userId, new Set());
    }

    this.wsClients.get(userId)!.add(ws);
    this.wsToUser.set(ws, userId);

    console.log(`[BotManager] Added WebSocket client for user ${userId}`);
  }

  removeWSClient(ws: WebSocket): void {
    const userId = this.wsToUser.get(ws);

    if (userId) {
      const userClients = this.wsClients.get(userId);
      if (userClients) {
        userClients.delete(ws);

        // Remove empty sets
        if (userClients.size === 0) {
          this.wsClients.delete(userId);
        }
      }

      this.wsToUser.delete(ws);
      console.log(`[BotManager] Removed WebSocket client for user ${userId}`);
    }
  }

  getWSClientCount(userId?: string): number {
    if (userId) {
      return this.wsClients.get(userId)?.size || 0;
    }

    // Total across all users
    let total = 0;
    const clientSets = Array.from(this.wsClients.values());
    for (const clients of clientSets) {
      total += clients.size;
    }
    return total;
  }

  private broadcastToUser(userId: string, data: any): void {
    const userClients = this.wsClients.get(userId);

    if (!userClients || userClients.size === 0) {
      return;
    }

    const message = JSON.stringify(data);

    userClients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  private handleBotEvent(event: any): void {
    // Broadcast event to user's WebSocket clients
    this.broadcastToUser(event.userId, {
      type: event.type,
      data: event.data,
    });
  }

  // Manual fact posting
  async postManualFact(userId: string, platforms: string[]): Promise<string | null> {
    let worker = this.workers.get(userId);

    if (!worker) {
      // Create worker for manual post (doesn't require bot to be "active")
      console.log(`[BotManager] Creating worker for manual fact post (user ${userId})`);
      
      const userStorage = createUserStorage(userId);
      worker = new BotWorker(userId, userStorage, (event) => {
        this.handleBotEvent(event);
      });
      
      // Store worker
      this.workers.set(userId, worker);
      
      // Start the worker to connect platforms
      try {
        await worker.startForManualPosting();
      } catch (error) {
        console.error(`[BotManager] Failed to start worker for manual posting:`, error);
        this.workers.delete(userId);
        throw error;
      }
    }

    return await worker.postManualFact(platforms);
  }

  // Fact generation (preview only)
  async generateFact(userId: string): Promise<string> {
    const worker = this.workers.get(userId);

    if (worker) {
      return await worker.generateFact();
    }

    // Generate fact without starting worker
    const userStorage = createUserStorage(userId);
    const tempWorker = new BotWorker(userId, userStorage, () => {});
    return await tempWorker.generateFact();
  }

  // Reload config for a user's bot
  async reloadUserBotConfig(userId: string): Promise<void> {
    const worker = this.workers.get(userId);

    if (worker) {
      await worker.reloadConfig();
    }
  }

  // Notify chat about giveaway start
  async notifyGiveawayStart(userId: string, giveaway: any): Promise<void> {
    const worker = this.workers.get(userId);

    if (!worker) {
      console.log(`[BotManager] No worker found for user ${userId} to announce giveaway start`);
      return;
    }

    await worker.announceGiveawayStart(giveaway);
  }

  // Notify chat about giveaway winners
  async notifyGiveawayEnd(userId: string, giveaway: any, winners: any[]): Promise<void> {
    const worker = this.workers.get(userId);

    if (!worker) {
      console.log(`[BotManager] No worker found for user ${userId} to announce giveaway winners`);
      return;
    }

    await worker.announceGiveawayWinners(giveaway, winners);
  }

  // Get statistics
  getStats(): {
    totalWorkers: number;
    activeWorkers: number;
    totalWSClients: number;
  } {
    let activeWorkers = 0;

    const workers = Array.from(this.workers.values());
    for (const worker of workers) {
      if (worker.getStatus().isRunning) {
        activeWorkers++;
      }
    }

    return {
      totalWorkers: this.workers.size,
      activeWorkers,
      totalWSClients: this.getWSClientCount(),
    };
  }
}

// Singleton instance
export const botManager = new BotManager();
