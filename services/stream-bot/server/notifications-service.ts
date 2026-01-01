import crypto from 'crypto';

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
  private notifications: Map<string, StreamNotification[]> = new Map();

  getNotifications(userId: string, filters?: NotificationFilters): StreamNotification[] {
    let userNotifications = this.notifications.get(userId) || [];

    if (filters?.platform && filters.platform !== 'all') {
      userNotifications = userNotifications.filter(n => n.platform === filters.platform);
    }

    if (filters?.type && filters.type !== 'all') {
      userNotifications = userNotifications.filter(n => n.notificationType === filters.type);
    }

    if (filters?.isRead !== undefined) {
      userNotifications = userNotifications.filter(n => n.isRead === filters.isRead);
    }

    userNotifications = userNotifications.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    if (filters?.limit) {
      userNotifications = userNotifications.slice(0, filters.limit);
    }

    return userNotifications;
  }

  markAsRead(userId: string, notificationId: string): boolean {
    const userNotifications = this.notifications.get(userId);
    if (!userNotifications) return false;

    const notification = userNotifications.find(n => n.id === notificationId);
    if (!notification) return false;

    notification.isRead = true;
    return true;
  }

  markAllAsRead(userId: string): number {
    const userNotifications = this.notifications.get(userId);
    if (!userNotifications) return 0;

    let count = 0;
    userNotifications.forEach(n => {
      if (!n.isRead) {
        n.isRead = true;
        count++;
      }
    });

    return count;
  }

  getUnreadCount(userId: string): number {
    const userNotifications = this.notifications.get(userId) || [];
    return userNotifications.filter(n => !n.isRead).length;
  }

  addNotification(userId: string, notification: Partial<StreamNotification>): StreamNotification {
    const newNotification: StreamNotification = {
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
    };

    if (!this.notifications.has(userId)) {
      this.notifications.set(userId, []);
    }

    this.notifications.get(userId)!.push(newNotification);
    return newNotification;
  }

  deleteNotification(userId: string, notificationId: string): boolean {
    const userNotifications = this.notifications.get(userId);
    if (!userNotifications) return false;

    const index = userNotifications.findIndex(n => n.id === notificationId);
    if (index === -1) return false;

    userNotifications.splice(index, 1);
    return true;
  }

  addSampleNotifications(userId: string): void {
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

    sampleNotifications.forEach(notification => {
      this.addNotification(userId, notification);
    });
  }
}

export const notificationsService = new NotificationsService();
