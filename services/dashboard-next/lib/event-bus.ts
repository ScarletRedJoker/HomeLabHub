/**
 * Unified Event Bus - Redis-based notification system
 * Provides pub/sub messaging across services with multiple delivery channels:
 * - Dashboard toasts (real-time via SSE)
 * - Discord webhooks
 * - Email notifications (future)
 */

import Redis from "ioredis";
import { db } from "./db";
import { events, eventSubscriptions, type NewEvent } from "./db/platform-schema";
import { eq, desc, and, gte, lte, inArray } from "drizzle-orm";

export type EventCategory = 
  | "system" 
  | "deployment" 
  | "server" 
  | "ai" 
  | "stream" 
  | "discord" 
  | "security"
  | "user";

export type EventSeverity = "info" | "warning" | "error" | "success";

export type NotificationChannel = "dashboard" | "discord" | "email";

export interface EventPayload {
  category: EventCategory;
  severity: EventSeverity;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  channels?: NotificationChannel[];
  userId?: string;
  serverId?: string;
}

export interface EventRecord {
  id: number;
  category: EventCategory;
  severity: EventSeverity;
  title: string;
  message: string;
  metadata: Record<string, any> | null;
  channels: NotificationChannel[];
  read: boolean;
  createdAt: Date;
}

class EventBus {
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private isConnected = false;
  private eventHandlers: Map<string, Set<(event: EventRecord) => void>> = new Map();
  private sseClients: Set<(event: EventRecord) => void> = new Set();

  private getRedisUrl(): string | null {
    return process.env.REDIS_URL || null;
  }

  async connect(): Promise<boolean> {
    const redisUrl = this.getRedisUrl();
    
    if (!redisUrl) {
      console.log("EventBus: Redis URL not configured, using database-only mode");
      return false;
    }

    try {
      this.publisher = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      this.subscriber = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      await Promise.all([
        this.publisher.connect(),
        this.subscriber.connect(),
      ]);

      this.subscriber.on("message", (channel, message) => {
        try {
          const event = JSON.parse(message) as EventRecord;
          this.notifyHandlers(channel, event);
        } catch (error) {
          console.error("EventBus: Failed to parse message:", error);
        }
      });

      this.isConnected = true;
      console.log("EventBus: Connected to Redis");
      return true;
    } catch (error) {
      console.error("EventBus: Failed to connect to Redis:", error);
      this.isConnected = false;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.publisher) {
      await this.publisher.quit();
      this.publisher = null;
    }
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
    this.isConnected = false;
  }

  async publish(payload: EventPayload): Promise<EventRecord | null> {
    try {
      const channels = payload.channels || ["dashboard"];
      
      const [eventRecord] = await db.insert(events).values({
        category: payload.category,
        severity: payload.severity,
        title: payload.title,
        message: payload.message,
        metadata: payload.metadata || null,
        channels: channels,
        userId: payload.userId || null,
        serverId: payload.serverId || null,
      }).returning();

      const record: EventRecord = {
        id: eventRecord.id,
        category: payload.category,
        severity: payload.severity,
        title: payload.title,
        message: payload.message,
        metadata: payload.metadata || null,
        channels: channels,
        read: false,
        createdAt: eventRecord.createdAt,
      };

      if (this.isConnected && this.publisher) {
        await this.publisher.publish(`events:${payload.category}`, JSON.stringify(record));
        await this.publisher.publish("events:all", JSON.stringify(record));
      }

      this.sseClients.forEach(handler => {
        try {
          handler(record);
        } catch (error) {
          console.error("EventBus: SSE handler error:", error);
        }
      });

      if (channels.includes("discord")) {
        await this.sendDiscordNotification(record);
      }

      return record;
    } catch (error) {
      console.error("EventBus: Failed to publish event:", error);
      return null;
    }
  }

  async subscribe(category: EventCategory | "all", handler: (event: EventRecord) => void): Promise<() => void> {
    const channel = category === "all" ? "events:all" : `events:${category}`;
    
    if (!this.eventHandlers.has(channel)) {
      this.eventHandlers.set(channel, new Set());
      
      if (this.isConnected && this.subscriber) {
        await this.subscriber.subscribe(channel);
      }
    }
    
    this.eventHandlers.get(channel)!.add(handler);
    
    return () => {
      const handlers = this.eventHandlers.get(channel);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.eventHandlers.delete(channel);
          if (this.subscriber) {
            this.subscriber.unsubscribe(channel).catch(console.error);
          }
        }
      }
    };
  }

  registerSSEClient(handler: (event: EventRecord) => void): () => void {
    this.sseClients.add(handler);
    return () => {
      this.sseClients.delete(handler);
    };
  }

  private notifyHandlers(channel: string, event: EventRecord): void {
    const handlers = this.eventHandlers.get(channel);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error("EventBus: Handler error:", error);
        }
      });
    }
  }

  private async sendDiscordNotification(event: EventRecord): Promise<void> {
    try {
      const subscriptions = await db.select()
        .from(eventSubscriptions)
        .where(
          and(
            eq(eventSubscriptions.channel, "discord"),
            eq(eventSubscriptions.enabled, true)
          )
        );

      for (const sub of subscriptions) {
        if (sub.webhookUrl) {
          const categories = sub.categories as string[] || [];
          const severities = sub.severities as string[] || [];
          const categoryMatch = categories.length === 0 || categories.includes(event.category);
          const severityMatch = severities.length === 0 || severities.includes(event.severity);
          if (categoryMatch && severityMatch) {
            await this.postDiscordWebhook(sub.webhookUrl, event);
          }
        }
      }
    } catch (error) {
      console.error("EventBus: Failed to send Discord notification:", error);
    }
  }

  private async postDiscordWebhook(webhookUrl: string, event: EventRecord): Promise<void> {
    const colors: Record<EventSeverity, number> = {
      info: 0x3498db,
      success: 0x2ecc71,
      warning: 0xf39c12,
      error: 0xe74c3c,
    };

    const embed = {
      title: event.title,
      description: event.message,
      color: colors[event.severity],
      timestamp: event.createdAt.toISOString(),
      footer: {
        text: `Nebula Command | ${event.category}`,
      },
    };

    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
      });
    } catch (error) {
      console.error("EventBus: Discord webhook failed:", error);
    }
  }

  async getEvents(options: {
    category?: EventCategory;
    severity?: EventSeverity;
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
    unreadOnly?: boolean;
  } = {}): Promise<EventRecord[]> {
    try {
      let query = db.select().from(events);
      
      const conditions = [];
      
      if (options.category) {
        conditions.push(eq(events.category, options.category));
      }
      if (options.severity) {
        conditions.push(eq(events.severity, options.severity));
      }
      if (options.startDate) {
        conditions.push(gte(events.createdAt, options.startDate));
      }
      if (options.endDate) {
        conditions.push(lte(events.createdAt, options.endDate));
      }
      if (options.unreadOnly) {
        conditions.push(eq(events.read, false));
      }

      const result = await db.select()
        .from(events)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(events.createdAt))
        .limit(options.limit || 50)
        .offset(options.offset || 0);

      return result.map(e => ({
        id: e.id,
        category: e.category as EventCategory,
        severity: e.severity as EventSeverity,
        title: e.title,
        message: e.message,
        metadata: e.metadata as Record<string, any> | null,
        channels: (e.channels || ["dashboard"]) as NotificationChannel[],
        read: e.read ?? false,
        createdAt: e.createdAt,
      }));
    } catch (error) {
      console.error("EventBus: Failed to get events:", error);
      return [];
    }
  }

  async markAsRead(eventIds: number[]): Promise<boolean> {
    try {
      if (eventIds.length === 0) return true;
      await db.update(events)
        .set({ read: true })
        .where(inArray(events.id, eventIds));
      return true;
    } catch (error) {
      console.error("EventBus: Failed to mark events as read:", error);
      return false;
    }
  }

  async markAllAsRead(): Promise<boolean> {
    try {
      await db.update(events)
        .set({ read: true })
        .where(eq(events.read, false));
      return true;
    } catch (error) {
      console.error("EventBus: Failed to mark all as read:", error);
      return false;
    }
  }

  async getUnreadCount(): Promise<number> {
    try {
      const result = await db.select()
        .from(events)
        .where(eq(events.read, false));
      return result.length;
    } catch (error) {
      console.error("EventBus: Failed to get unread count:", error);
      return 0;
    }
  }

  getStatus(): { connected: boolean; sseClients: number; channels: string[] } {
    return {
      connected: this.isConnected,
      sseClients: this.sseClients.size,
      channels: Array.from(this.eventHandlers.keys()),
    };
  }
}

export const eventBus = new EventBus();

eventBus.connect().catch(console.error);
