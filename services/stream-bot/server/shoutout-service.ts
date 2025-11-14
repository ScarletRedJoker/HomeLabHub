import axios from "axios";
import { storage } from "./storage";
import { getTwitchAccessToken } from "./oauth-twitch";
import { getEnv } from "./env";
import type { Shoutout, InsertShoutout } from "@shared/schema";

interface StreamerInfo {
  username: string;
  displayName: string;
  platform: string;
  game?: string;
  viewers?: number;
  url: string;
  profileImageUrl?: string;
  isLive?: boolean;
  title?: string;
}

interface CachedStreamerInfo extends StreamerInfo {
  cachedAt: number;
}

export class ShoutoutService {
  private cache: Map<string, CachedStreamerInfo> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

  async getStreamerInfo(username: string, platform: string): Promise<StreamerInfo | null> {
    const cacheKey = `${platform}:${username.toLowerCase()}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL) {
      console.log(`[ShoutoutService] Using cached info for ${username} on ${platform}`);
      const { cachedAt, ...info } = cached;
      return info;
    }

    // Fetch fresh data based on platform
    let info: StreamerInfo | null = null;
    
    try {
      switch (platform.toLowerCase()) {
        case "twitch":
          info = await this.getTwitchStreamerInfo(username);
          break;
        case "youtube":
          info = await this.getYouTubeStreamerInfo(username);
          break;
        case "kick":
          info = await this.getKickStreamerInfo(username);
          break;
        default:
          console.error(`[ShoutoutService] Unsupported platform: ${platform}`);
          return null;
      }

      if (info) {
        // Cache the result
        this.cache.set(cacheKey, {
          ...info,
          cachedAt: Date.now(),
        });
      }

      return info;
    } catch (error: any) {
      console.error(`[ShoutoutService] Error fetching info for ${username} on ${platform}:`, error.message);
      return null;
    }
  }

  private async getTwitchStreamerInfo(username: string): Promise<StreamerInfo | null> {
    try {
      const clientId = getEnv("TWITCH_CLIENT_ID");
      if (!clientId) {
        console.error("[ShoutoutService] TWITCH_CLIENT_ID not configured");
        return null;
      }

      // We need to get access token from a connected user
      // For now, we'll use app access token instead of user token
      // This is a limitation - in production you'd want to use the broadcaster's token
      const clientSecret = getEnv("TWITCH_CLIENT_SECRET");
      if (!clientSecret) {
        console.error("[ShoutoutService] TWITCH_CLIENT_SECRET not configured");
        return null;
      }

      // Get app access token
      const tokenResponse = await axios.post(
        "https://id.twitch.tv/oauth2/token",
        null,
        {
          params: {
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "client_credentials",
          },
        }
      );

      const accessToken = tokenResponse.data.access_token;

      // Get user info
      const userResponse = await axios.get(
        "https://api.twitch.tv/helix/users",
        {
          params: { login: username },
          headers: {
            "Client-ID": clientId,
            "Authorization": `Bearer ${accessToken}`,
          },
        }
      );

      if (!userResponse.data.data || userResponse.data.data.length === 0) {
        console.log(`[ShoutoutService] Twitch user not found: ${username}`);
        return null;
      }

      const user = userResponse.data.data[0];
      const userId = user.id;

      // Get stream info (to check if live and get game/viewers)
      const streamResponse = await axios.get(
        "https://api.twitch.tv/helix/streams",
        {
          params: { user_id: userId },
          headers: {
            "Client-ID": clientId,
            "Authorization": `Bearer ${accessToken}`,
          },
        }
      );

      const stream = streamResponse.data.data?.[0];

      return {
        username: user.login,
        displayName: user.display_name,
        platform: "twitch",
        game: stream?.game_name || "Unknown",
        viewers: stream?.viewer_count || 0,
        url: `https://twitch.tv/${user.login}`,
        profileImageUrl: user.profile_image_url,
        isLive: !!stream,
        title: stream?.title,
      };
    } catch (error: any) {
      console.error(`[ShoutoutService] Twitch API error:`, error.response?.data || error.message);
      return null;
    }
  }

  private async getYouTubeStreamerInfo(username: string): Promise<StreamerInfo | null> {
    // YouTube API integration would require API key and channel ID resolution
    // For now, return basic info
    console.log(`[ShoutoutService] YouTube API not fully implemented yet`);
    
    return {
      username: username,
      displayName: username,
      platform: "youtube",
      game: "Unknown",
      viewers: 0,
      url: `https://youtube.com/@${username}`,
      isLive: false,
    };
  }

  private async getKickStreamerInfo(username: string): Promise<StreamerInfo | null> {
    // Kick API integration
    // Note: Kick doesn't have an official public API yet, this is a placeholder
    console.log(`[ShoutoutService] Kick API not fully implemented yet`);
    
    return {
      username: username,
      displayName: username,
      platform: "kick",
      game: "Unknown",
      viewers: 0,
      url: `https://kick.com/${username}`,
      isLive: false,
    };
  }

  async generateShoutoutMessage(
    userId: string,
    targetUsername: string,
    targetPlatform: string,
    customTemplate?: string
  ): Promise<string> {
    // Get bot config for template
    const botConfig = await storage.getBotConfig(userId);
    const template = customTemplate || botConfig?.shoutoutMessageTemplate || 
      "Check out @{username}! They were last streaming {game} with {viewers} viewers! {url}";

    // Get streamer info
    const info = await this.getStreamerInfo(targetUsername, targetPlatform);
    
    if (!info) {
      // Fallback message if we can't fetch info
      return `Check out @${targetUsername}! Go give them a follow at ${this.getPlatformUrl(targetUsername, targetPlatform)}!`;
    }

    // Replace template variables
    let message = template
      .replace(/{username}/g, info.displayName || info.username)
      .replace(/{game}/g, info.game || "Unknown")
      .replace(/{viewers}/g, (info.viewers || 0).toString())
      .replace(/{url}/g, info.url)
      .replace(/{platform}/g, info.platform);

    return message;
  }

  private getPlatformUrl(username: string, platform: string): string {
    switch (platform.toLowerCase()) {
      case "twitch":
        return `https://twitch.tv/${username}`;
      case "youtube":
        return `https://youtube.com/@${username}`;
      case "kick":
        return `https://kick.com/${username}`;
      default:
        return username;
    }
  }

  async recordShoutout(
    userId: string,
    targetUsername: string,
    targetPlatform: string,
    customMessage?: string
  ): Promise<Shoutout> {
    // Check if shoutout record already exists
    const existing = await storage.getShoutoutByTarget(userId, targetUsername, targetPlatform);
    
    if (existing) {
      // Increment usage count
      return await storage.updateShoutout(userId, existing.id, {
        usageCount: (existing.usageCount || 0) + 1,
        lastUsedAt: new Date(),
      });
    } else {
      // Create new shoutout record
      return await storage.createShoutout(userId, {
        userId,
        targetUsername,
        targetPlatform,
        customMessage,
        usageCount: 1,
      });
    }
  }

  async getShoutoutHistory(userId: string, limit: number = 50): Promise<Shoutout[]> {
    return await storage.getShoutouts(userId, limit);
  }

  async getShoutoutStats(userId: string): Promise<{
    totalShoutouts: number;
    topShoutouts: Array<{
      username: string;
      platform: string;
      count: number;
      lastUsed: Date;
    }>;
  }> {
    const shoutouts = await storage.getShoutouts(userId, 100);
    
    // Sort by usage count
    const sorted = [...shoutouts].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
    
    return {
      totalShoutouts: shoutouts.length,
      topShoutouts: sorted.slice(0, 10).map(so => ({
        username: so.targetUsername,
        platform: so.targetPlatform,
        count: so.usageCount || 0,
        lastUsed: so.lastUsedAt,
      })),
    };
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const shoutoutService = new ShoutoutService();
