import { db } from "./db";
import { webhookQueue } from "@shared/schema";
import { eq, and, lte, lt } from "drizzle-orm";

interface StreamNotificationPayload {
  userId: string;
  platform: "twitch" | "youtube" | "kick";
  streamUrl: string;
  streamTitle: string;
  game?: string;
  thumbnailUrl?: string;
  viewerCount?: number;
}

const DISCORD_BOT_URL = process.env.DISCORD_BOT_URL || "http://localhost:5000";
const STREAM_BOT_WEBHOOK_SECRET = process.env.STREAM_BOT_WEBHOOK_SECRET;

const BACKOFF_INTERVALS = [30, 60, 120, 300, 600];
const RETRY_INTERVAL_MS = 30000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

let retryIntervalId: NodeJS.Timeout | null = null;
let cleanupIntervalId: NodeJS.Timeout | null = null;

function getNextRetryDelay(attempts: number): number {
  const index = Math.min(attempts, BACKOFF_INTERVALS.length - 1);
  return BACKOFF_INTERVALS[index] * 1000;
}

async function sendWebhookDirect(payload: StreamNotificationPayload): Promise<{ success: boolean; error?: string }> {
  if (!STREAM_BOT_WEBHOOK_SECRET) {
    return { success: false, error: "Webhook secret not configured" };
  }

  const url = `${DISCORD_BOT_URL}/api/stream-notifications/external`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Stream-Bot-Secret": STREAM_BOT_WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
      return { success: false, error: errorData.error || response.statusText };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function queueWebhook(
  userId: string,
  platform: "twitch" | "youtube" | "kick",
  payload: StreamNotificationPayload
): Promise<string> {
  const [inserted] = await db
    .insert(webhookQueue)
    .values({
      userId,
      platform,
      payload: JSON.stringify(payload),
      status: "pending",
      attempts: 0,
      maxAttempts: 5,
      nextRetryAt: new Date(),
    })
    .returning({ id: webhookQueue.id });

  console.log(`[Webhook Queue] Queued notification for user ${userId} on ${platform}, id: ${inserted.id}`);
  return inserted.id;
}

export async function processQueuedWebhook(webhookId: string): Promise<boolean> {
  const [webhook] = await db
    .select()
    .from(webhookQueue)
    .where(eq(webhookQueue.id, webhookId))
    .limit(1);

  if (!webhook) {
    console.error(`[Webhook Queue] Webhook ${webhookId} not found`);
    return false;
  }

  if (webhook.status !== "pending") {
    console.log(`[Webhook Queue] Webhook ${webhookId} already processed (status: ${webhook.status})`);
    return webhook.status === "sent";
  }

  const payload: StreamNotificationPayload = JSON.parse(webhook.payload);
  const result = await sendWebhookDirect(payload);

  const newAttempts = webhook.attempts + 1;
  const now = new Date();

  if (result.success) {
    await db
      .update(webhookQueue)
      .set({
        status: "sent",
        attempts: newAttempts,
        lastAttemptAt: now,
        errorMessage: null,
      })
      .where(eq(webhookQueue.id, webhookId));

    console.log(`[Webhook Queue] Successfully sent webhook ${webhookId} after ${newAttempts} attempt(s)`);
    return true;
  }

  if (newAttempts >= webhook.maxAttempts) {
    await db
      .update(webhookQueue)
      .set({
        status: "failed",
        attempts: newAttempts,
        lastAttemptAt: now,
        errorMessage: result.error || "Max attempts exceeded",
      })
      .where(eq(webhookQueue.id, webhookId));

    console.error(`[Webhook Queue] Webhook ${webhookId} failed permanently after ${newAttempts} attempts: ${result.error}`);
    return false;
  }

  const nextRetryDelay = getNextRetryDelay(newAttempts);
  const nextRetryAt = new Date(now.getTime() + nextRetryDelay);

  await db
    .update(webhookQueue)
    .set({
      attempts: newAttempts,
      lastAttemptAt: now,
      nextRetryAt,
      errorMessage: result.error,
    })
    .where(eq(webhookQueue.id, webhookId));

  console.log(`[Webhook Queue] Webhook ${webhookId} failed (attempt ${newAttempts}/${webhook.maxAttempts}), retry at ${nextRetryAt.toISOString()}: ${result.error}`);
  return false;
}

async function retryPendingWebhooks(): Promise<void> {
  const now = new Date();

  try {
    const pendingWebhooks = await db
      .select()
      .from(webhookQueue)
      .where(
        and(
          eq(webhookQueue.status, "pending"),
          lte(webhookQueue.nextRetryAt, now)
        )
      )
      .limit(50);

    if (pendingWebhooks.length === 0) {
      return;
    }

    console.log(`[Webhook Retry] Processing ${pendingWebhooks.length} pending webhooks`);

    for (const webhook of pendingWebhooks) {
      if (webhook.attempts >= webhook.maxAttempts) {
        await db
          .update(webhookQueue)
          .set({
            status: "failed",
            errorMessage: "Max attempts exceeded",
          })
          .where(eq(webhookQueue.id, webhook.id));
        console.log(`[Webhook Retry] Marked webhook ${webhook.id} as failed (max attempts exceeded)`);
        continue;
      }

      await processQueuedWebhook(webhook.id);
    }
  } catch (error) {
    console.error("[Webhook Retry] Error processing pending webhooks:", error);
  }
}

async function cleanupOldWebhooks(): Promise<void> {
  const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const result = await db
      .delete(webhookQueue)
      .where(
        and(
          eq(webhookQueue.status, "sent"),
          lt(webhookQueue.createdAt, cutoffTime)
        )
      )
      .returning({ id: webhookQueue.id });

    if (result.length > 0) {
      console.log(`[Webhook Cleanup] Removed ${result.length} old sent webhooks`);
    }
  } catch (error) {
    console.error("[Webhook Cleanup] Error cleaning up old webhooks:", error);
  }
}

async function reconcilePendingWebhooks(): Promise<void> {
  console.log("[Webhook Retry] Reconciling pending webhooks from previous session...");

  try {
    const pendingWebhooks = await db
      .select()
      .from(webhookQueue)
      .where(eq(webhookQueue.status, "pending"));

    if (pendingWebhooks.length === 0) {
      console.log("[Webhook Retry] No pending webhooks to reconcile");
      return;
    }

    console.log(`[Webhook Retry] Found ${pendingWebhooks.length} pending webhooks, scheduling immediate retry`);

    const now = new Date();
    await db
      .update(webhookQueue)
      .set({ nextRetryAt: now })
      .where(eq(webhookQueue.status, "pending"));

  } catch (error) {
    console.error("[Webhook Retry] Error reconciling pending webhooks:", error);
  }
}

export function startWebhookRetryService(): void {
  if (retryIntervalId) {
    console.log("[Webhook Retry] Service already running");
    return;
  }

  console.log("[Webhook Retry] Starting webhook retry service");

  reconcilePendingWebhooks();

  retryIntervalId = setInterval(retryPendingWebhooks, RETRY_INTERVAL_MS);

  cleanupIntervalId = setInterval(cleanupOldWebhooks, CLEANUP_INTERVAL_MS);

  console.log("[Webhook Retry] Service started (retry interval: 30s, cleanup interval: 1h)");
}

export function stopWebhookRetryService(): void {
  if (retryIntervalId) {
    clearInterval(retryIntervalId);
    retryIntervalId = null;
  }

  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }

  console.log("[Webhook Retry] Service stopped");
}

export async function getWebhookQueueStats(): Promise<{
  pending: number;
  sent: number;
  failed: number;
}> {
  const [stats] = await db.execute<{ pending: string; sent: string; failed: string }>(
    `SELECT 
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'sent') as sent,
      COUNT(*) FILTER (WHERE status = 'failed') as failed
    FROM webhook_queue`
  );

  return {
    pending: parseInt(stats?.pending || "0", 10),
    sent: parseInt(stats?.sent || "0", 10),
    failed: parseInt(stats?.failed || "0", 10),
  };
}
