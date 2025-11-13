import axios from "axios";
import querystring from "querystring";
import { storage } from "./storage";
import { getEnv } from "./env";
import { encryptToken, decryptToken } from "./crypto-utils";

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

export interface NowPlayingData {
  isPlaying: boolean;
  title?: string;
  artist?: string;
  album?: string;
  albumImageUrl?: string;
  songUrl?: string;
  progressMs?: number;
  durationMs?: number;
  progressPercent?: number;
}

interface SpotifyTrack {
  name: string;
  artists: Array<{ name: string }>;
  album: {
    name: string;
    images: Array<{ url: string }>;
  };
  external_urls: {
    spotify: string;
  };
  duration_ms: number;
}

interface SpotifyCurrentlyPlaying {
  is_playing: boolean;
  progress_ms?: number;
  item?: SpotifyTrack & { type: string };
}

interface TokenCache {
  accessToken: string;
  expiresAt: Date;
}

// Short-lived cache to avoid DB hits on rapid requests (10 seconds)
const tokenCache = new Map<string, TokenCache>();

/**
 * Multi-user Spotify service
 * Each user has their own OAuth connection stored in platformConnections table
 */
export class SpotifyServiceMultiUser {
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
    const connection = await storage.getPlatformConnectionByPlatform(userId, 'spotify');
    
    if (!connection || !connection.isConnected) {
      throw new Error('Spotify not connected for this user');
    }

    if (!connection.accessToken) {
      throw new Error('No access token found for Spotify connection');
    }

    // Decrypt token
    const accessToken = decryptToken(connection.accessToken);

    // Check if token needs refresh (with 5-minute buffer)
    const needsRefresh = !connection.tokenExpiresAt || 
      connection.tokenExpiresAt.getTime() <= Date.now() + (5 * 60 * 1000);

    if (needsRefresh && connection.refreshToken) {
      console.log(`[Spotify] Refreshing token for user ${userId}`);
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
    const clientId = getEnv('SPOTIFY_CLIENT_ID');
    const clientSecret = getEnv('SPOTIFY_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new Error('Spotify OAuth credentials not configured');
    }

    try {
      const response = await axios.post(
        SPOTIFY_TOKEN_URL,
        querystring.stringify({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
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

      console.log(`[Spotify] Token refreshed successfully for user ${userId}`);
      return access_token;

    } catch (error: any) {
      console.error(`[Spotify] Token refresh failed for user ${userId}:`, error.response?.data || error.message);
      
      // If refresh fails, mark connection as disconnected
      await storage.updatePlatformConnection(userId, connectionId, {
        isConnected: false,
      });

      throw new Error('Failed to refresh Spotify token. Please reconnect your account.');
    }
  }

  /**
   * Make authenticated request to Spotify API
   */
  private async spotifyRequest<T>(userId: string, endpoint: string, method: string = 'GET'): Promise<T> {
    const accessToken = await this.getAccessToken(userId);

    try {
      const response = await axios({
        method,
        url: `${SPOTIFY_API_BASE}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      return response.data;
    } catch (error: any) {
      // Handle 429 Rate Limit
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after'] || 1;
        console.warn(`[Spotify] Rate limited for user ${userId}, retry after ${retryAfter}s`);
        throw new Error(`Spotify rate limit exceeded. Retry after ${retryAfter} seconds.`);
      }

      // Handle 401 Unauthorized (token expired despite refresh)
      if (error.response?.status === 401) {
        console.error(`[Spotify] Unauthorized for user ${userId}, clearing cache`);
        tokenCache.delete(userId);
        throw new Error('Spotify authorization failed. Please reconnect your account.');
      }

      throw error;
    }
  }

  /**
   * Get the user's currently playing track
   */
  async getNowPlaying(userId: string): Promise<NowPlayingData> {
    try {
      const data = await this.spotifyRequest<SpotifyCurrentlyPlaying>(
        userId,
        '/me/player/currently-playing'
      );

      // No content means nothing is playing
      if (!data || !data.item) {
        return { isPlaying: false };
      }

      // Type guard for track (not podcast/episode)
      if (data.item.type !== 'track') {
        return { isPlaying: false };
      }

      const track = data.item;
      const progressPercent = data.progress_ms && track.duration_ms
        ? (data.progress_ms / track.duration_ms) * 100
        : 0;

      return {
        isPlaying: data.is_playing,
        title: track.name,
        artist: track.artists.map((a) => a.name).join(', '),
        album: track.album.name,
        albumImageUrl: track.album.images[0]?.url,
        songUrl: track.external_urls.spotify,
        progressMs: data.progress_ms,
        durationMs: track.duration_ms,
        progressPercent,
      };

    } catch (error: any) {
      console.error(`[Spotify] Error fetching now playing for user ${userId}:`, error.message);

      // Return not playing for user-facing errors
      if (error.message?.includes('not connected') || error.message?.includes('No access token')) {
        return { isPlaying: false };
      }

      // For rate limits and other errors, throw to be handled by caller
      throw error;
    }
  }

  /**
   * Check if user has Spotify connected
   */
  async isConnected(userId: string): Promise<boolean> {
    try {
      const connection = await storage.getPlatformConnectionByPlatform(userId, 'spotify');
      return connection?.isConnected || false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get user's Spotify profile
   */
  async getUserProfile(userId: string) {
    try {
      const profile = await this.spotifyRequest<any>(userId, '/me');
      
      return {
        displayName: profile.display_name,
        email: profile.email,
        id: profile.id,
        imageUrl: profile.images?.[0]?.url,
      };
    } catch (error: any) {
      console.error(`[Spotify] Error fetching profile for user ${userId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get connection status for user
   */
  async getConnectionStatus(userId: string) {
    const connection = await storage.getPlatformConnectionByPlatform(userId, 'spotify');
    
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

export const spotifyServiceMultiUser = new SpotifyServiceMultiUser();
