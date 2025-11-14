import { db } from "./db";
import {
  streamSessions,
  viewerSnapshots,
  chatActivity,
  type StreamSession,
  type ViewerSnapshot,
  type ChatActivity,
  type InsertStreamSession,
  type InsertViewerSnapshot,
  type InsertChatActivity,
  type UpdateStreamSession,
} from "@shared/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";

export class StatsService {
  async createSession(userId: string, platform: string): Promise<StreamSession> {
    try {
      const [session] = await db.insert(streamSessions).values({
        userId,
        platform,
        startedAt: new Date(),
      }).returning();
      
      console.log(`[StatsService] Created session ${session.id} for user ${userId} on ${platform}`);
      return session;
    } catch (error: any) {
      console.error(`[StatsService] Error creating session:`, error);
      throw error;
    }
  }

  async endSession(sessionId: string): Promise<StreamSession> {
    try {
      const [session] = await db.update(streamSessions)
        .set({ endedAt: new Date() })
        .where(eq(streamSessions.id, sessionId))
        .returning();
      
      console.log(`[StatsService] Ended session ${sessionId}`);
      return session;
    } catch (error: any) {
      console.error(`[StatsService] Error ending session:`, error);
      throw error;
    }
  }

  async getCurrentSession(userId: string, platform: string): Promise<StreamSession | null> {
    try {
      const [session] = await db.select()
        .from(streamSessions)
        .where(
          and(
            eq(streamSessions.userId, userId),
            eq(streamSessions.platform, platform),
            sql`${streamSessions.endedAt} IS NULL`
          )
        )
        .orderBy(desc(streamSessions.startedAt))
        .limit(1);
      
      return session || null;
    } catch (error: any) {
      console.error(`[StatsService] Error getting current session:`, error);
      return null;
    }
  }

  async trackViewerCount(userId: string, platform: string, count: number): Promise<void> {
    try {
      let session = await this.getCurrentSession(userId, platform);
      
      if (!session) {
        console.log(`[StatsService] No active session found, creating one`);
        session = await this.createSession(userId, platform);
      }

      await db.insert(viewerSnapshots).values({
        sessionId: session.id,
        viewerCount: count,
        timestamp: new Date(),
      });

      const currentPeak = session.peakViewers || 0;
      if (count > currentPeak) {
        await db.update(streamSessions)
          .set({ peakViewers: count })
          .where(eq(streamSessions.id, session.id));
        
        console.log(`[StatsService] Updated peak viewers to ${count} for session ${session.id}`);
      }
    } catch (error: any) {
      console.error(`[StatsService] Error tracking viewer count:`, error);
    }
  }

  async trackChatMessage(userId: string, platform: string, username: string): Promise<void> {
    try {
      let session = await this.getCurrentSession(userId, platform);
      
      if (!session) {
        session = await this.createSession(userId, platform);
      }

      const existing = await db.select()
        .from(chatActivity)
        .where(
          and(
            eq(chatActivity.sessionId, session.id),
            eq(chatActivity.username, username)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db.update(chatActivity)
          .set({
            messageCount: sql`${chatActivity.messageCount} + 1`,
            lastSeen: new Date(),
            timestamp: new Date(),
          })
          .where(eq(chatActivity.id, existing[0].id));
      } else {
        await db.insert(chatActivity).values({
          sessionId: session.id,
          username,
          messageCount: 1,
          firstSeen: new Date(),
          lastSeen: new Date(),
          timestamp: new Date(),
        });
      }

      const [{ count }] = await db.select({ 
        count: sql<number>`SUM(${chatActivity.messageCount})::int`
      })
        .from(chatActivity)
        .where(eq(chatActivity.sessionId, session.id));

      const [{ uniqueCount }] = await db.select({ 
        uniqueCount: sql<number>`count(DISTINCT ${chatActivity.username})::int`
      })
        .from(chatActivity)
        .where(eq(chatActivity.sessionId, session.id));

      await db.update(streamSessions)
        .set({ 
          totalMessages: count || 0,
          uniqueChatters: uniqueCount,
        })
        .where(eq(streamSessions.id, session.id));
    } catch (error: any) {
      console.error(`[StatsService] Error tracking chat message:`, error);
    }
  }

  async getSessionStats(sessionId: string): Promise<{
    userId: string;
    session: StreamSession;
    viewerSnapshots: ViewerSnapshot[];
    chatActivity: ChatActivity[];
    averageViewers: number;
    uptime: number;
  } | null> {
    try {
      const [session] = await db.select()
        .from(streamSessions)
        .where(eq(streamSessions.id, sessionId));
      
      if (!session) {
        return null;
      }

      const snapshots = await db.select()
        .from(viewerSnapshots)
        .where(eq(viewerSnapshots.sessionId, sessionId))
        .orderBy(viewerSnapshots.timestamp);

      const activity = await db.select()
        .from(chatActivity)
        .where(eq(chatActivity.sessionId, sessionId))
        .orderBy(desc(chatActivity.messageCount));

      const averageViewers = snapshots.length > 0
        ? Math.round(snapshots.reduce((sum, s) => sum + s.viewerCount, 0) / snapshots.length)
        : 0;

      const startTime = new Date(session.startedAt).getTime();
      const endTime = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
      const uptime = Math.floor((endTime - startTime) / 1000);

      return {
        userId: session.userId,
        session,
        viewerSnapshots: snapshots,
        chatActivity: activity,
        averageViewers,
        uptime,
      };
    } catch (error: any) {
      console.error(`[StatsService] Error getting session stats:`, error);
      return null;
    }
  }

  async getSessions(userId: string, limit: number = 20): Promise<StreamSession[]> {
    try {
      const sessions = await db.select()
        .from(streamSessions)
        .where(eq(streamSessions.userId, userId))
        .orderBy(desc(streamSessions.startedAt))
        .limit(limit);
      
      return sessions;
    } catch (error: any) {
      console.error(`[StatsService] Error getting sessions:`, error);
      return [];
    }
  }

  async getRecentSessions(userId: string, platform?: string, limit: number = 20): Promise<StreamSession[]> {
    try {
      if (platform) {
        const sessions = await db.select()
          .from(streamSessions)
          .where(
            and(
              eq(streamSessions.userId, userId),
              eq(streamSessions.platform, platform)
            )
          )
          .orderBy(desc(streamSessions.startedAt))
          .limit(limit);
        
        return sessions;
      } else {
        return this.getSessions(userId, limit);
      }
    } catch (error: any) {
      console.error(`[StatsService] Error getting recent sessions:`, error);
      return [];
    }
  }

  async getViewerHistory(sessionId: string): Promise<ViewerSnapshot[]> {
    try {
      const snapshots = await db.select()
        .from(viewerSnapshots)
        .where(eq(viewerSnapshots.sessionId, sessionId))
        .orderBy(viewerSnapshots.timestamp);

      return snapshots;
    } catch (error: any) {
      console.error(`[StatsService] Error getting viewer history:`, error);
      return [];
    }
  }

  async getUserStats(userId: string): Promise<{
    totalSessions: number;
    totalStreamTime: number;
    totalMessages: number;
    totalUniqueChatters: number;
    averageViewers: number;
    peakViewers: number;
    topPlatform: string | null;
  }> {
    try {
      const allSessions = await db.select()
        .from(streamSessions)
        .where(eq(streamSessions.userId, userId));

      if (allSessions.length === 0) {
        return {
          totalSessions: 0,
          totalStreamTime: 0,
          totalMessages: 0,
          totalUniqueChatters: 0,
          averageViewers: 0,
          peakViewers: 0,
          topPlatform: null,
        };
      }

      let totalStreamTime = 0;
      let totalMessages = 0;
      let totalUniqueChattersSet = new Set<string>();
      let peakViewers = 0;
      let totalViewerSum = 0;
      let totalViewerSnapshots = 0;
      const platformCounts: Record<string, number> = {};

      for (const session of allSessions) {
        const startTime = new Date(session.startedAt).getTime();
        const endTime = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
        totalStreamTime += endTime - startTime;

        totalMessages += session.totalMessages || 0;

        if ((session.peakViewers || 0) > peakViewers) {
          peakViewers = session.peakViewers || 0;
        }

        platformCounts[session.platform] = (platformCounts[session.platform] || 0) + 1;

        const chatters = await db.select({ username: chatActivity.username })
          .from(chatActivity)
          .where(eq(chatActivity.sessionId, session.id));
        
        chatters.forEach(c => totalUniqueChattersSet.add(c.username));

        const snapshots = await db.select()
          .from(viewerSnapshots)
          .where(eq(viewerSnapshots.sessionId, session.id));
        
        snapshots.forEach(s => {
          totalViewerSum += s.viewerCount;
          totalViewerSnapshots++;
        });
      }

      const averageViewers = totalViewerSnapshots > 0 
        ? Math.round(totalViewerSum / totalViewerSnapshots) 
        : 0;

      const topPlatform = Object.entries(platformCounts).length > 0
        ? Object.entries(platformCounts).sort((a, b) => b[1] - a[1])[0][0]
        : null;

      return {
        totalSessions: allSessions.length,
        totalStreamTime: Math.floor(totalStreamTime / 1000),
        totalMessages,
        totalUniqueChatters: totalUniqueChattersSet.size,
        averageViewers,
        peakViewers,
        topPlatform,
      };
    } catch (error: any) {
      console.error(`[StatsService] Error getting user stats:`, error);
      return {
        totalSessions: 0,
        totalStreamTime: 0,
        totalMessages: 0,
        totalUniqueChatters: 0,
        averageViewers: 0,
        peakViewers: 0,
        topPlatform: null,
      };
    }
  }

  async getTopChatters(userId: string, limit: number = 10, sessionId?: string): Promise<Array<{
    username: string;
    messageCount: number;
  }>> {
    try {
      let targetSessionId = sessionId;

      if (!targetSessionId) {
        const activeSession = await db.select()
          .from(streamSessions)
          .where(
            and(
              eq(streamSessions.userId, userId),
              sql`${streamSessions.endedAt} IS NULL`
            )
          )
          .orderBy(desc(streamSessions.startedAt))
          .limit(1);

        if (!activeSession || activeSession.length === 0) {
          return [];
        }

        targetSessionId = activeSession[0].id;
      }

      const topChatters = await db.select({
        username: chatActivity.username,
        messageCount: chatActivity.messageCount,
      })
        .from(chatActivity)
        .where(eq(chatActivity.sessionId, targetSessionId))
        .orderBy(desc(chatActivity.messageCount))
        .limit(limit);

      return topChatters;
    } catch (error: any) {
      console.error(`[StatsService] Error getting top chatters:`, error);
      return [];
    }
  }

  async getChatActivityHeatmap(sessionId: string): Promise<Array<{
    hour: number;
    messageCount: number;
  }>> {
    try {
      const heatmap = await db.select({
        hour: sql<number>`EXTRACT(HOUR FROM ${chatActivity.timestamp})::int`,
        messageCount: sql<number>`SUM(${chatActivity.messageCount})::int`,
      })
        .from(chatActivity)
        .where(eq(chatActivity.sessionId, sessionId))
        .groupBy(sql`EXTRACT(HOUR FROM ${chatActivity.timestamp})`)
        .orderBy(sql`EXTRACT(HOUR FROM ${chatActivity.timestamp})`);

      const hours = Array.from({ length: 24 }, (_, i) => i);
      return hours.map(hour => {
        const found = heatmap.find(h => h.hour === hour);
        return {
          hour,
          messageCount: found?.messageCount || 0,
        };
      });
    } catch (error: any) {
      console.error(`[StatsService] Error getting chat activity heatmap:`, error);
      return [];
    }
  }

  async calculatePeakViewers(sessionId: string): Promise<number> {
    try {
      const [result] = await db.select({
        peak: sql<number>`MAX(${viewerSnapshots.viewerCount})::int`,
      })
        .from(viewerSnapshots)
        .where(eq(viewerSnapshots.sessionId, sessionId));

      return result?.peak || 0;
    } catch (error: any) {
      console.error(`[StatsService] Error calculating peak viewers:`, error);
      return 0;
    }
  }

  async getCurrentStats(userId: string, platform?: string): Promise<{
    hasActiveSession: boolean;
    currentViewers: number;
    peakViewers: number;
    totalMessages: number;
    uniqueChatters: number;
    uptime: number;
    avgViewers: number;
    session: StreamSession | null;
  }> {
    try {
      const whereConditions = [
        eq(streamSessions.userId, userId),
        sql`${streamSessions.endedAt} IS NULL`
      ];

      if (platform) {
        whereConditions.push(eq(streamSessions.platform, platform));
      }

      const sessions = await db.select()
        .from(streamSessions)
        .where(and(...whereConditions))
        .orderBy(desc(streamSessions.startedAt))
        .limit(1);

      if (!sessions || sessions.length === 0) {
        return {
          hasActiveSession: false,
          currentViewers: 0,
          peakViewers: 0,
          totalMessages: 0,
          uniqueChatters: 0,
          uptime: 0,
          avgViewers: 0,
          session: null,
        };
      }

      const session = sessions[0];

      const latestSnapshot = await db.select()
        .from(viewerSnapshots)
        .where(eq(viewerSnapshots.sessionId, session.id))
        .orderBy(desc(viewerSnapshots.timestamp))
        .limit(1);

      const currentViewers = latestSnapshot.length > 0 ? latestSnapshot[0].viewerCount : 0;

      const allSnapshots = await db.select()
        .from(viewerSnapshots)
        .where(eq(viewerSnapshots.sessionId, session.id));

      const avgViewers = allSnapshots.length > 0
        ? Math.round(allSnapshots.reduce((sum, s) => sum + s.viewerCount, 0) / allSnapshots.length)
        : 0;

      const startTime = new Date(session.startedAt).getTime();
      const uptime = Math.floor((Date.now() - startTime) / 1000);

      return {
        hasActiveSession: true,
        currentViewers,
        peakViewers: session.peakViewers || 0,
        totalMessages: session.totalMessages || 0,
        uniqueChatters: session.uniqueChatters || 0,
        uptime,
        avgViewers,
        session,
      };
    } catch (error: any) {
      console.error(`[StatsService] Error getting current stats:`, error);
      return {
        hasActiveSession: false,
        currentViewers: 0,
        peakViewers: 0,
        totalMessages: 0,
        uniqueChatters: 0,
        uptime: 0,
        avgViewers: 0,
        session: null,
      };
    }
  }
}

export const statsService = new StatsService();
