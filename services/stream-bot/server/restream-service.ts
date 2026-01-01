import { randomUUID } from "crypto";

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

type UserDestinations = Map<string, RestreamDestination>;

export class RestreamService {
  private destinations: Map<string, UserDestinations> = new Map();

  private getUserDestinations(userId: string): UserDestinations {
    if (!this.destinations.has(userId)) {
      this.destinations.set(userId, new Map());
    }
    return this.destinations.get(userId)!;
  }

  async getDestinations(userId: string): Promise<RestreamDestination[]> {
    const userDests = this.getUserDestinations(userId);
    return Array.from(userDests.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  async addDestination(
    userId: string,
    dest: Omit<RestreamDestination, "id" | "createdAt" | "updatedAt">
  ): Promise<RestreamDestination> {
    const userDests = this.getUserDestinations(userId);

    const newDest: RestreamDestination = {
      ...dest,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    userDests.set(newDest.id, newDest);
    return newDest;
  }

  async updateDestination(
    userId: string,
    destId: string,
    data: Partial<Omit<RestreamDestination, "id" | "createdAt">>
  ): Promise<RestreamDestination | null> {
    const userDests = this.getUserDestinations(userId);
    const existing = userDests.get(destId);

    if (!existing) {
      return null;
    }

    const updated: RestreamDestination = {
      ...existing,
      ...data,
      id: destId,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    };

    userDests.set(destId, updated);
    return updated;
  }

  async deleteDestination(userId: string, destId: string): Promise<boolean> {
    const userDests = this.getUserDestinations(userId);
    return userDests.delete(destId);
  }

  async getStreamStatus(userId: string): Promise<StreamStatus[]> {
    const userDests = this.getUserDestinations(userId);
    const statuses: StreamStatus[] = [];

    for (const dest of userDests.values()) {
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
