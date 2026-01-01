import { db } from "./db";
import { streamEvents } from "@shared/schema";
import { eq, and, gte, lte, asc, desc } from "drizzle-orm";

export interface StreamEvent {
  id: string;
  userId: string;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  platform: 'twitch' | 'youtube' | 'kick' | 'multi';
  eventType: 'stream' | 'watch_party' | 'community' | 'collab';
  isRecurring: boolean;
  recurringPattern: string | null;
  notifyDiscord: boolean;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateEventInput = Omit<StreamEvent, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;
export type UpdateEventInput = Partial<CreateEventInput>;

class EventsService {
  async getEvents(userId: string, startDate?: Date, endDate?: Date): Promise<StreamEvent[]> {
    const conditions = [eq(streamEvents.userId, userId)];
    
    if (startDate) {
      conditions.push(gte(streamEvents.startTime, startDate));
    }
    if (endDate) {
      conditions.push(lte(streamEvents.startTime, endDate));
    }

    const results = await db.select().from(streamEvents)
      .where(and(...conditions))
      .orderBy(asc(streamEvents.startTime));

    return results.map(r => this.mapToEvent(r));
  }

  async createEvent(userId: string, eventData: Partial<CreateEventInput>): Promise<StreamEvent> {
    const now = new Date();
    const [result] = await db.insert(streamEvents).values({
      userId,
      title: eventData.title || 'Untitled Event',
      description: eventData.description || null,
      startTime: eventData.startTime ? new Date(eventData.startTime) : now,
      endTime: eventData.endTime ? new Date(eventData.endTime) : null,
      platform: eventData.platform || 'twitch',
      eventType: eventData.eventType || 'stream',
      isRecurring: eventData.isRecurring || false,
      recurringPattern: eventData.recurringPattern || null,
      notifyDiscord: eventData.notifyDiscord || false,
      isPublic: eventData.isPublic !== undefined ? eventData.isPublic : true,
    }).returning();

    return this.mapToEvent(result);
  }

  async updateEvent(userId: string, eventId: string, updates: UpdateEventInput): Promise<StreamEvent | null> {
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.startTime !== undefined) updateData.startTime = new Date(updates.startTime);
    if (updates.endTime !== undefined) updateData.endTime = new Date(updates.endTime);
    if (updates.platform !== undefined) updateData.platform = updates.platform;
    if (updates.eventType !== undefined) updateData.eventType = updates.eventType;
    if (updates.isRecurring !== undefined) updateData.isRecurring = updates.isRecurring;
    if (updates.recurringPattern !== undefined) updateData.recurringPattern = updates.recurringPattern;
    if (updates.notifyDiscord !== undefined) updateData.notifyDiscord = updates.notifyDiscord;
    if (updates.isPublic !== undefined) updateData.isPublic = updates.isPublic;

    const [result] = await db.update(streamEvents)
      .set(updateData)
      .where(and(
        eq(streamEvents.id, eventId),
        eq(streamEvents.userId, userId)
      ))
      .returning();

    if (!result) return null;
    return this.mapToEvent(result);
  }

  async deleteEvent(userId: string, eventId: string): Promise<boolean> {
    const result = await db.delete(streamEvents)
      .where(and(
        eq(streamEvents.id, eventId),
        eq(streamEvents.userId, userId)
      ))
      .returning();
    
    return result.length > 0;
  }

  async getPublicEvents(userId: string): Promise<StreamEvent[]> {
    const now = new Date();
    const results = await db.select().from(streamEvents)
      .where(and(
        eq(streamEvents.userId, userId),
        eq(streamEvents.isPublic, true),
        gte(streamEvents.startTime, now)
      ))
      .orderBy(asc(streamEvents.startTime));

    return results.map(r => this.mapToEvent(r));
  }

  async getUpcomingEvents(userId: string, limit: number = 5): Promise<StreamEvent[]> {
    const now = new Date();
    const results = await db.select().from(streamEvents)
      .where(and(
        eq(streamEvents.userId, userId),
        gte(streamEvents.startTime, now)
      ))
      .orderBy(asc(streamEvents.startTime))
      .limit(limit);

    return results.map(r => this.mapToEvent(r));
  }

  private mapToEvent(r: any): StreamEvent {
    return {
      id: r.id,
      userId: r.userId,
      title: r.title,
      description: r.description || '',
      startTime: r.startTime,
      endTime: r.endTime || new Date(r.startTime.getTime() + 3600000),
      platform: r.platform as StreamEvent['platform'],
      eventType: r.eventType as StreamEvent['eventType'],
      isRecurring: r.isRecurring,
      recurringPattern: r.recurringPattern,
      notifyDiscord: r.notifyDiscord,
      isPublic: r.isPublic,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}

export const eventsService = new EventsService();
