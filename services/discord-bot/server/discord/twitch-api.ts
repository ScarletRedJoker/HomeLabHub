/**
 * Twitch API Integration
 * 
 * Fetches stream data from Twitch API including:
 * - Stream title
 * - Game/category
 * - Viewer count
 * - Stream thumbnail
 * - User profile picture
 */

interface TwitchTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface TwitchStreamData {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  type: string;
  title: string;
  viewer_count: number;
  started_at: string;
  language: string;
  thumbnail_url: string;
  tag_ids: string[];
  is_mature: boolean;
}

interface TwitchUserData {
  id: string;
  login: string;
  display_name: string;
  type: string;
  broadcaster_type: string;
  description: string;
  profile_image_url: string;
  offline_image_url: string;
  view_count: number;
  created_at: string;
}

export interface EnrichedStreamData {
  title: string;
  game: string;
  viewerCount: number;
  thumbnailUrl: string;
  profileImageUrl: string;
  isLive: boolean;
}

class TwitchAPI {
  private clientId: string | undefined;
  private clientSecret: string | undefined;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.clientId = process.env.TWITCH_CLIENT_ID;
    this.clientSecret = process.env.TWITCH_CLIENT_SECRET;
  }

  /**
   * Check if Twitch API credentials are configured
   */
  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  /**
   * Get or refresh the OAuth access token
   */
  private async getAccessToken(): Promise<string | null> {
    if (!this.clientId || !this.clientSecret) {
      console.warn('[Twitch API] Client ID or Secret not configured');
      return null;
    }

    // Return cached token if still valid
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'client_credentials',
        }),
      });

      if (!response.ok) {
        console.error('[Twitch API] Failed to get access token:', response.statusText);
        return null;
      }

      const data: TwitchTokenResponse = await response.json();
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // Refresh 1 min before expiry

      console.log('[Twitch API] Successfully obtained access token');
      return this.accessToken;
    } catch (error) {
      console.error('[Twitch API] Error getting access token:', error);
      return null;
    }
  }

  /**
   * Extract Twitch username from a Twitch URL
   */
  private extractUsername(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p);
      
      // twitch.tv/username format
      if (pathParts.length > 0) {
        return pathParts[0].toLowerCase();
      }
    } catch (error) {
      console.error('[Twitch API] Error parsing Twitch URL:', error);
    }
    return null;
  }

  /**
   * Fetch stream data from Twitch API
   */
  async getStreamData(twitchUrl: string): Promise<EnrichedStreamData | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const username = this.extractUsername(twitchUrl);
    if (!username) {
      console.warn('[Twitch API] Could not extract username from URL:', twitchUrl);
      return null;
    }

    const token = await this.getAccessToken();
    if (!token) {
      return null;
    }

    try {
      // Fetch stream data
      const streamResponse = await fetch(
        `https://api.twitch.tv/helix/streams?user_login=${username}`,
        {
          headers: {
            'Client-ID': this.clientId!,
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!streamResponse.ok) {
        console.error('[Twitch API] Failed to fetch stream data:', streamResponse.statusText);
        return null;
      }

      const streamJson = await streamResponse.json();
      const streamData: TwitchStreamData[] = streamJson.data;

      // If no stream data, user is not live
      if (!streamData || streamData.length === 0) {
        return {
          title: '',
          game: '',
          viewerCount: 0,
          thumbnailUrl: '',
          profileImageUrl: '',
          isLive: false,
        };
      }

      const stream = streamData[0];

      // Fetch user data for profile image
      const userResponse = await fetch(
        `https://api.twitch.tv/helix/users?login=${username}`,
        {
          headers: {
            'Client-ID': this.clientId!,
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      let profileImageUrl = '';
      if (userResponse.ok) {
        const userJson = await userResponse.json();
        const userData: TwitchUserData[] = userJson.data;
        if (userData && userData.length > 0) {
          profileImageUrl = userData[0].profile_image_url;
        }
      }

      // Format thumbnail URL (replace {width} and {height} placeholders)
      const thumbnailUrl = stream.thumbnail_url
        .replace('{width}', '1280')
        .replace('{height}', '720');

      return {
        title: stream.title,
        game: stream.game_name,
        viewerCount: stream.viewer_count,
        thumbnailUrl,
        profileImageUrl,
        isLive: true,
      };
    } catch (error) {
      console.error('[Twitch API] Error fetching stream data:', error);
      return null;
    }
  }
}

// Export singleton instance
export const twitchAPI = new TwitchAPI();
