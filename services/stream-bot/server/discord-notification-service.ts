import { queueWebhook, processQueuedWebhook } from "./webhook-retry-service";

interface StreamNotificationPayload {
  userId: string;
  platform: "twitch" | "youtube" | "kick";
  streamUrl: string;
  streamTitle: string;
  game?: string;
  thumbnailUrl?: string;
  viewerCount?: number;
}

interface NotificationResult {
  success: boolean;
  notificationsSent?: number;
  totalServers?: number;
  message?: string;
  error?: string;
  webhookId?: string;
}

export async function sendDiscordStreamNotification(
  payload: StreamNotificationPayload
): Promise<NotificationResult> {
  const STREAM_BOT_WEBHOOK_SECRET = process.env.STREAM_BOT_WEBHOOK_SECRET;

  if (!STREAM_BOT_WEBHOOK_SECRET) {
    console.warn("[Discord Notification] STREAM_BOT_WEBHOOK_SECRET not configured, skipping notification");
    return { success: false, error: "Webhook secret not configured" };
  }

  console.log(`[Discord Notification] Queueing go-live notification for user ${payload.userId} on ${payload.platform}`);

  try {
    const webhookId = await queueWebhook(payload.userId, payload.platform, payload);

    const success = await processQueuedWebhook(webhookId);

    if (success) {
      return {
        success: true,
        message: "Notification sent successfully",
        webhookId,
      };
    } else {
      return {
        success: false,
        error: "Initial attempt failed, queued for retry",
        webhookId,
      };
    }
  } catch (error) {
    console.error("[Discord Notification] Error queueing webhook:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function notifyStreamGoLive(
  userId: string,
  platform: "twitch" | "youtube" | "kick",
  streamUrl: string,
  streamTitle: string,
  options?: {
    game?: string;
    thumbnailUrl?: string;
    viewerCount?: number;
  }
): Promise<NotificationResult> {
  return sendDiscordStreamNotification({
    userId,
    platform,
    streamUrl,
    streamTitle,
    ...options,
  });
}
