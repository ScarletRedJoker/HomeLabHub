import { db } from "./db";
import { restreamDestinations } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export interface RestreamDestination {
  id: string;
  platform: string;
  rtmpUrl: string;
  streamKey: string;
  enabled: boolean;
  bitrate: number;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StreamStatus {
  platform: string;
  isLive: boolean;
  viewerCount?: number;
  startedAt?: Date;
}

export const RTMP_SERVERS = {
  twitch: {
    name: "Twitch",
    servers: [
      { region: "US East", url: "rtmp://iad05.contribute.live-video.net/app" },
      { region: "US West", url: "rtmp://sfo05.contribute.live-video.net/app" },
      { region: "EU West", url: "rtmp://cdg10.contribute.live-video.net/app" },
      { region: "EU Central", url: "rtmp://fra05.contribute.live-video.net/app" },
      { region: "Asia", url: "rtmp://tyo05.contribute.live-video.net/app" },
    ],
  },
  youtube: {
    name: "YouTube",
    servers: [
      { region: "Primary", url: "rtmp://a.rtmp.youtube.com/live2" },
      { region: "Backup", url: "rtmp://b.rtmp.youtube.com/live2?backup=1" },
    ],
  },
  kick: {
    name: "Kick",
    servers: [
      { region: "Primary", url: "rtmps://fa723fc1b171.global-contribute.live-video.net/app" },
    ],
  },
  facebook: {
    name: "Facebook",
    servers: [
      { region: "Primary", url: "rtmps://live-api-s.facebook.com:443/rtmp" },
    ],
  },
  custom: {
    name: "Custom",
    servers: [],
  },
} as const;

export type PlatformType = keyof typeof RTMP_SERVERS;

export class RestreamService {
  async getDestinations(userId: string): Promise<RestreamDestination[]> {
    const results = await db.select().from(restreamDestinations)
      .where(eq(restreamDestinations.userId, userId))
      .orderBy(desc(restreamDestinations.createdAt));
    
    return results.map(r => ({
      id: r.id,
      platform: r.platform,
      rtmpUrl: r.rtmpUrl,
      streamKey: r.streamKey,
      enabled: r.enabled,
      bitrate: r.bitrate,
      notes: r.notes || "",
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async addDestination(
    userId: string,
    dest: Omit<RestreamDestination, "id" | "createdAt" | "updatedAt">
  ): Promise<RestreamDestination> {
    const [result] = await db.insert(restreamDestinations).values({
      userId,
      platform: dest.platform,
      rtmpUrl: dest.rtmpUrl,
      streamKey: dest.streamKey,
      enabled: dest.enabled,
      bitrate: dest.bitrate,
      notes: dest.notes || null,
    }).returning();

    return {
      id: result.id,
      platform: result.platform,
      rtmpUrl: result.rtmpUrl,
      streamKey: result.streamKey,
      enabled: result.enabled,
      bitrate: result.bitrate,
      notes: result.notes || "",
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };
  }

  async updateDestination(
    userId: string,
    destId: string,
    data: Partial<Omit<RestreamDestination, "id" | "createdAt">>
  ): Promise<RestreamDestination | null> {
    const [result] = await db.update(restreamDestinations)
      .set({
        ...data,
        notes: data.notes ?? undefined,
        updatedAt: new Date(),
      })
      .where(and(
        eq(restreamDestinations.id, destId),
        eq(restreamDestinations.userId, userId)
      ))
      .returning();

    if (!result) return null;

    return {
      id: result.id,
      platform: result.platform,
      rtmpUrl: result.rtmpUrl,
      streamKey: result.streamKey,
      enabled: result.enabled,
      bitrate: result.bitrate,
      notes: result.notes || "",
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };
  }

  async deleteDestination(userId: string, destId: string): Promise<boolean> {
    const result = await db.delete(restreamDestinations)
      .where(and(
        eq(restreamDestinations.id, destId),
        eq(restreamDestinations.userId, userId)
      ))
      .returning();
    
    return result.length > 0;
  }

  async getStreamStatus(userId: string): Promise<StreamStatus[]> {
    const dests = await this.getDestinations(userId);
    const statuses: StreamStatus[] = [];

    for (const dest of dests) {
      if (dest.enabled) {
        statuses.push({
          platform: dest.platform,
          isLive: false,
          viewerCount: 0,
        });
      }
    }

    return statuses;
  }

  getRtmpServers(): typeof RTMP_SERVERS {
    return RTMP_SERVERS;
  }
}

export const restreamService = new RestreamService();
