import axios from "axios";
import querystring from "querystring";
import { storage } from "./storage";
import { getEnv } from "./env";
import { encryptToken, decryptToken } from "./crypto-utils";

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

export interface CurrentLivestream {
  isLive: boolean;
  title?: string;
  description?: string;
  thumbnailUrl?: string;
  viewerCount?: number;
  streamUrl?: string;
}

interface TokenCache {
  accessToken: string;
  expiresAt: Date;
}

// Short-lived cache to avoid DB hits on rapid requests (10 seconds)
const tokenCache = new Map<string, TokenCache>();

/**
 * Multi-user YouTube service
 * Each user has their own OAuth connection stored in platformConnections table
 */
export class YouTubeServiceMultiUser {
  /**
   * Get valid access token for a user, refreshing if needed
   */
  private async getAccessToken(userId: string): Promise<string> {
    // Check cache first (avoid DB hits)
    const cached = tokenCache.get(userId);
    if (cached && cached.expiresAt.getTime() > Date.now() + 60000) { // 1 min buffer
      return cached.accessToken;
    }

    // Get connection from database
    const connection = await storage.getPlatformConnectionByPlatform(userId, 'youtube');
    
    if (!connection || !connection.isConnected) {
      throw new Error('YouTube not connected for this user');
    }

    if (!connection.accessToken) {
      throw new Error('No access token found for YouTube connection');
    }

    // Decrypt token
    const accessToken = decryptToken(connection.accessToken);

    // Check if token needs refresh (with 5-minute buffer)
    const needsRefresh = !connection.tokenExpiresAt || 
      connection.tokenExpiresAt.getTime() <= Date.now() + (5 * 60 * 1000);

    if (needsRefresh && connection.refreshToken) {
      console.log(`[YouTube] Refreshing token for user ${userId}`);
      return await this.refreshAccessToken(userId, connection.id, decryptToken(connection.refreshToken));
    }

    // Cache valid token
    if (connection.tokenExpiresAt) {
      tokenCache.set(userId, {
        accessToken,
        expiresAt: connection.tokenExpiresAt,
      });
    }

    return accessToken;
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshAccessToken(userId: string, connectionId: string, refreshToken: string): Promise<string> {
    const clientId = getEnv('YOUTUBE_CLIENT_ID');
    const clientSecret = getEnv('YOUTUBE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new Error('YouTube OAuth credentials not configured');
    }

    try {
      const response = await axios.post(
        GOOGLE_TOKEN_URL,
        querystring.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const { access_token, expires_in, refresh_token } = response.data;

      // Encrypt new tokens
      const encryptedAccessToken = encryptToken(access_token);
      const encryptedRefreshToken = refresh_token ? encryptToken(refresh_token) : undefined;

      // Calculate new expiry
      const tokenExpiresAt = new Date(Date.now() + (expires_in * 1000));

      // Update database
      await storage.updatePlatformConnection(userId, connectionId, {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt,
      });

      // Update cache
      tokenCache.set(userId, {
        accessToken: access_token,
        expiresAt: tokenExpiresAt,
      });

      console.log(`[YouTube] Token refreshed successfully for user ${userId}`);
      return access_token;

    } catch (error: any) {
      console.error(`[YouTube] Token refresh failed for user ${userId}:`, error.response?.data || error.message);
      
      // If refresh fails, mark connection as disconnected
      await storage.updatePlatformConnection(userId, connectionId, {
        isConnected: false,
      });

      throw new Error('Failed to refresh YouTube token. Please reconnect your account.');
    }
  }

  /**
   * Make authenticated request to YouTube API
   */
  private async youtubeRequest<T>(userId: string, endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const accessToken = await this.getAccessToken(userId);

    try {
      const response = await axios.get(`${YOUTUBE_API_BASE}${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
        params,
      });

      return response.data;
    } catch (error: any) {
      // Handle 429 Rate Limit
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after'] || 1;
        console.warn(`[YouTube] Rate limited for user ${userId}, retry after ${retryAfter}s`);
        throw new Error(`YouTube rate limit exceeded. Retry after ${retryAfter} seconds.`);
      }

      // Handle 401 Unauthorized
      if (error.response?.status === 401) {
        console.error(`[YouTube] Unauthorized for user ${userId}, clearing cache`);
        tokenCache.delete(userId);
        throw new Error('YouTube authorization failed. Please reconnect your account.');
      }

      throw error;
    }
  }

  /**
   * Get user's current livestream (if any)
   */
  async getCurrentLivestream(userId: string): Promise<CurrentLivestream> {
    try {
      // Get user's channel
      const channelData: any = await this.youtubeRequest(userId, '/channels', {
        part: 'snippet,contentDetails',
        mine: 'true',
      });

      if (!channelData.items || channelData.items.length === 0) {
        return { isLive: false };
      }

      const channelId = channelData.items[0].id;

      // Check for active livestreams
      const searchData: any = await this.youtubeRequest(userId, '/search', {
        part: 'snippet',
        channelId,
        eventType: 'live',
        type: 'video',
      });

      if (!searchData.items || searchData.items.length === 0) {
        return { isLive: false };
      }

      const liveVideo = searchData.items[0];
      
      // Get detailed video information
      const videoData: any = await this.youtubeRequest(userId, '/videos', {
        part: 'snippet,liveStreamingDetails',
        id: liveVideo.id.videoId,
      });

      if (!videoData.items || videoData.items.length === 0) {
        return { isLive: false };
      }

      const video = videoData.items[0];

      return {
        isLive: true,
        title: video.snippet.title,
        description: video.snippet.description,
        thumbnailUrl: video.snippet.thumbnails?.high?.url,
        viewerCount: parseInt(video.liveStreamingDetails?.concurrentViewers || '0', 10),
        streamUrl: `https://youtube.com/watch?v=${video.id}`,
      };

    } catch (error: any) {
      console.error(`[YouTube] Error fetching livestream for user ${userId}:`, error.message);

      // Return not live for user-facing errors
      if (error.message?.includes('not connected') || error.message?.includes('No access token')) {
        return { isLive: false };
      }

      // For rate limits and other errors, throw to be handled by caller
      throw error;
    }
  }

  /**
   * Check if user has YouTube connected
   */
  async isConnected(userId: string): Promise<boolean> {
    try {
      const connection = await storage.getPlatformConnectionByPlatform(userId, 'youtube');
      return connection?.isConnected || false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get connection status for user
   */
  async getConnectionStatus(userId: string) {
    const connection = await storage.getPlatformConnectionByPlatform(userId, 'youtube');
    
    if (!connection || !connection.isConnected) {
      return {
        connected: false,
        username: null,
        lastConnected: null,
      };
    }

    return {
      connected: true,
      username: connection.platformUsername,
      platformUserId: connection.platformUserId,
      lastConnected: connection.lastConnectedAt,
    };
  }
}

export const youtubeServiceMultiUser = new YouTubeServiceMultiUser();
