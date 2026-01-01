import crypto from 'crypto';
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";
import { unifiedInboxNotifications } from "@shared/schema";

export type NotificationType = 'follow' | 'sub' | 'donation' | 'mention' | 'raid' | 'host';
export type Platform = 'twitch' | 'youtube' | 'kick';

export interface StreamNotification {
  id: string;
  userId: string;
  platform: Platform;
  notificationType: NotificationType;
  title: string;
  message: string;
  senderName: string;
  senderAvatar?: string;
  amount?: number;
  currency?: string;
  isRead: boolean;
  createdAt: Date;
}

export interface NotificationFilters {
  platform?: string;
  type?: string;
  isRead?: boolean;
  limit?: number;
}

class NotificationsService {
  async getNotifications(userId: string, filters?: NotificationFilters): Promise<StreamNotification[]> {
    const conditions = [eq(unifiedInboxNotifications.userId, userId)];

    if (filters?.platform && filters.platform !== 'all') {
      conditions.push(eq(unifiedInboxNotifications.platform, filters.platform));
    }

    if (filters?.type && filters.type !== 'all') {
      conditions.push(eq(unifiedInboxNotifications.notificationType, filters.type));
    }

    if (filters?.isRead !== undefined) {
      conditions.push(eq(unifiedInboxNotifications.isRead, filters.isRead));
    }

    const query = db.select().from(unifiedInboxNotifications)
      .where(and(...conditions))
      .orderBy(desc(unifiedInboxNotifications.createdAt));

    if (filters?.limit) {
      query.limit(filters.limit);
    }

    const results = await query;
    return results.map(n => ({
      ...n,
      platform: n.platform as Platform,
      notificationType: n.notificationType as NotificationType,
      senderAvatar: n.senderAvatar ?? undefined,
      amount: n.amount ?? undefined,
      currency: n.currency ?? undefined
    }));
  }

  async markAsRead(userId: string, notificationId: string): Promise<boolean> {
    const result = await db.update(unifiedInboxNotifications)
      .set({ isRead: true })
      .where(
        and(
          eq(unifiedInboxNotifications.id, notificationId),
          eq(unifiedInboxNotifications.userId, userId)
        )
      )
      .returning();

    return result.length > 0;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await db.update(unifiedInboxNotifications)
      .set({ isRead: true })
      .where(
        and(
          eq(unifiedInboxNotifications.userId, userId),
          eq(unifiedInboxNotifications.isRead, false)
        )
      )
      .returning();

    return result.length;
  }

  async getUnreadCount(userId: string): Promise<number> {
    const result = await db.select({
      count: sql<number>`count(*)`
    })
    .from(unifiedInboxNotifications)
    .where(
      and(
        eq(unifiedInboxNotifications.userId, userId),
        eq(unifiedInboxNotifications.isRead, false)
      )
    );

    return Number(result[0]?.count || 0);
  }

  async addNotification(userId: string, notification: Partial<StreamNotification>): Promise<StreamNotification> {
    const [newNotification] = await db.insert(unifiedInboxNotifications)
      .values({
        id: notification.id || crypto.randomUUID(),
        userId,
        platform: notification.platform || 'twitch',
        notificationType: notification.notificationType || 'mention',
        title: notification.title || '',
        message: notification.message || '',
        senderName: notification.senderName || 'Unknown',
        senderAvatar: notification.senderAvatar,
        amount: notification.amount,
        currency: notification.currency,
        isRead: notification.isRead ?? false,
        createdAt: notification.createdAt || new Date(),
      })
      .returning();

    return {
      ...newNotification,
      platform: newNotification.platform as Platform,
      notificationType: newNotification.notificationType as NotificationType,
      senderAvatar: newNotification.senderAvatar ?? undefined,
      amount: newNotification.amount ?? undefined,
      currency: newNotification.currency ?? undefined
    };
  }

  async deleteNotification(userId: string, notificationId: string): Promise<boolean> {
    const result = await db.delete(unifiedInboxNotifications)
      .where(
        and(
          eq(unifiedInboxNotifications.id, notificationId),
          eq(unifiedInboxNotifications.userId, userId)
        )
      )
      .returning();

    return result.length > 0;
  }

  async addSampleNotifications(userId: string): Promise<void> {
    const sampleNotifications: Partial<StreamNotification>[] = [
      {
        platform: 'twitch',
        notificationType: 'follow',
        title: 'New Follower',
        message: 'started following you!',
        senderName: 'StreamFan123',
        senderAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=StreamFan123',
        createdAt: new Date(Date.now() - 1000 * 60 * 5),
      },
      {
        platform: 'twitch',
        notificationType: 'sub',
        title: 'New Subscription',
        message: 'subscribed at Tier 1!',
        senderName: 'GamerPro99',
        senderAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=GamerPro99',
        amount: 1,
        createdAt: new Date(Date.now() - 1000 * 60 * 15),
      },
      {
        platform: 'youtube',
        notificationType: 'donation',
        title: 'Super Chat',
        message: 'Love your content! Keep it up!',
        senderName: 'YouTubeSupporter',
        senderAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=YouTubeSupporter',
        amount: 10,
        currency: 'USD',
        createdAt: new Date(Date.now() - 1000 * 60 * 30),
      },
      {
        platform: 'twitch',
        notificationType: 'raid',
        title: 'Incoming Raid',
        message: 'is raiding with 150 viewers!',
        senderName: 'BigStreamer',
        senderAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=BigStreamer',
        amount: 150,
        createdAt: new Date(Date.now() - 1000 * 60 * 60),
      },
      {
        platform: 'kick',
        notificationType: 'follow',
        title: 'New Follower',
        message: 'started following you on Kick!',
        senderName: 'KickViewer',
        senderAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=KickViewer',
        createdAt: new Date(Date.now() - 1000 * 60 * 120),
      },
      {
        platform: 'twitch',
        notificationType: 'mention',
        title: 'Chat Mention',
        message: '@You are amazing at this game!',
        senderName: 'ChattyUser',
        senderAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ChattyUser',
        createdAt: new Date(Date.now() - 1000 * 60 * 180),
        isRead: true,
      },
      {
        platform: 'youtube',
        notificationType: 'sub',
        title: 'New Member',
        message: 'became a channel member!',
        senderName: 'LoyalFan',
        senderAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=LoyalFan',
        createdAt: new Date(Date.now() - 1000 * 60 * 240),
        isRead: true,
      },
    ];

    for (const notification of sampleNotifications) {
      await this.addNotification(userId, notification);
    }
  }
}

export const notificationsService = new NotificationsService();
