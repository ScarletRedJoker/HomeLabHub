/**
 * Platform API Integration (Twitch + YouTube)
 * 
 * Fetches stream data from Twitch and YouTube APIs including:
 * - Stream title
 * - Game/category
 * - Viewer count
 * - Stream thumbnail
 * - User profile picture
 * 
 * Features:
 * - Exponential backoff retry logic
 * - Token caching and auto-refresh
 * - Comprehensive error handling
 * - Rate limit awareness
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

interface YouTubeVideoSnippet {
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  thumbnails: {
    high?: { url: string };
    medium?: { url: string };
    default?: { url: string };
  };
}

interface YouTubeVideoStatistics {
  viewCount: string;
  likeCount: string;
  commentCount: string;
}

interface YouTubeVideoLiveStreamingDetails {
  actualStartTime?: string;
  actualEndTime?: string;
  scheduledStartTime?: string;
  concurrentViewers?: string;
}

interface YouTubeVideoData {
  id: string;
  snippet: YouTubeVideoSnippet;
  statistics?: YouTubeVideoStatistics;
  liveStreamingDetails?: YouTubeVideoLiveStreamingDetails;
}

export interface EnrichedStreamData {
  title: string;
  game: string;
  viewerCount: number;
  thumbnailUrl: string;
  profileImageUrl: string;
  isLive: boolean;
  streamId?: string; // Platform-specific stream/broadcast ID for deduplication
}

/**
 * Retry with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000
): Promise<T | null> {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if error is retryable
      if (error && typeof error === 'object') {
        const status = (error as any).status || (error as any).statusCode;
        // Don't retry on 404, 403, 401
        if (status === 404 || status === 403 || status === 401) {
          console.log(`[API Retry] Non-retryable status ${status}, aborting`);
          throw error;
        }
      }
    }
  }
  
  console.error(`[API Retry] All attempts failed:`, lastError);
  return null;
}

/**
 * Twitch API Client
 */
class TwitchAPI {
  private clientId: string | undefined;
  private clientSecret: string | undefined;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.clientId = process.env.TWITCH_CLIENT_ID;
    this.clientSecret = process.env.TWITCH_CLIENT_SECRET;
    
    if (this.isConfigured()) {
      console.log('[Twitch API] Configured with client ID:', this.clientId?.substring(0, 8) + '...');
    } else {
      console.warn('[Twitch API] Not configured - missing TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET');
    }
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

    console.log('[Twitch API] Requesting new access token...');

    try {
      const response = await retryWithBackoff(async () => {
        const res = await fetch('https://id.twitch.tv/oauth2/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: this.clientId!,
            client_secret: this.clientSecret!,
            grant_type: 'client_credentials',
          }),
        });

        if (!res.ok) {
          const error: any = new Error(`Twitch OAuth failed: ${res.statusText}`);
          error.status = res.status;
          throw error;
        }

        return res;
      }, 3, 1000);

      if (!response) {
        console.error('[Twitch API] Failed to get access token after retries');
        return null;
      }

      const data: TwitchTokenResponse = await response.json();
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // Refresh 1 min before expiry

      console.log('[Twitch API] ✓ Successfully obtained access token');
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
      console.warn('[Twitch API] Not configured, cannot fetch stream data');
      return null;
    }

    const username = this.extractUsername(twitchUrl);
    if (!username) {
      console.warn('[Twitch API] Could not extract username from URL:', twitchUrl);
      return null;
    }

    console.log(`[Twitch API] Fetching stream data for: ${username}`);

    const token = await this.getAccessToken();
    if (!token) {
      console.error('[Twitch API] No access token available');
      return null;
    }

    try {
      // Fetch stream data with retry
      const streamResponse = await retryWithBackoff(async () => {
        const res = await fetch(
          `https://api.twitch.tv/helix/streams?user_login=${username}`,
          {
            headers: {
              'Client-ID': this.clientId!,
              'Authorization': `Bearer ${token}`,
            },
          }
        );

        if (!res.ok) {
          const error: any = new Error(`Twitch API error: ${res.statusText}`);
          error.status = res.status;
          throw error;
        }

        return res;
      }, 3, 1000);

      if (!streamResponse) {
        console.error('[Twitch API] Failed to fetch stream data after retries');
        return null;
      }

      const streamJson = await streamResponse.json();
      const streamData: TwitchStreamData[] = streamJson.data;

      // If no stream data, user is not live
      if (!streamData || streamData.length === 0) {
        console.log(`[Twitch API] ${username} is not currently live`);
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

      // Fetch user data for profile image with retry
      const userResponse = await retryWithBackoff(async () => {
        const res = await fetch(
          `https://api.twitch.tv/helix/users?login=${username}`,
          {
            headers: {
              'Client-ID': this.clientId!,
              'Authorization': `Bearer ${token}`,
            },
          }
        );

        if (!res.ok) {
          const error: any = new Error(`Twitch user API error: ${res.statusText}`);
          error.status = res.status;
          throw error;
        }

        return res;
      }, 3, 1000);

      let profileImageUrl = '';
      if (userResponse) {
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

      console.log(`[Twitch API] ✓ ${username} is live: "${stream.title}" with ${stream.viewer_count} viewers (stream_id: ${stream.id})`);

      return {
        title: stream.title,
        game: stream.game_name,
        viewerCount: stream.viewer_count,
        thumbnailUrl,
        profileImageUrl,
        isLive: true,
        streamId: stream.id, // Twitch stream ID for deduplication
      };
    } catch (error) {
      console.error('[Twitch API] Error fetching stream data:', error);
      return null;
    }
  }
}

/**
 * YouTube API Client
 */
class YouTubeAPI {
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.YOUTUBE_API_KEY;
    
    if (this.isConfigured()) {
      console.log('[YouTube API] Configured with API key');
    } else {
      console.warn('[YouTube API] Not configured - missing YOUTUBE_API_KEY');
    }
  }

  /**
   * Check if YouTube API credentials are configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Extract video ID from YouTube URL
   */
  private extractVideoId(url: string): string | null {
    try {
      const urlObj = new URL(url);
      
      // youtube.com/watch?v=VIDEO_ID
      if (urlObj.hostname.includes('youtube.com')) {
        return urlObj.searchParams.get('v');
      }
      
      // youtu.be/VIDEO_ID
      if (urlObj.hostname.includes('youtu.be')) {
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        return pathParts[0] || null;
      }
      
      // youtube.com/live/VIDEO_ID
      if (urlObj.pathname.includes('/live/')) {
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        const liveIndex = pathParts.indexOf('live');
        if (liveIndex >= 0 && pathParts[liveIndex + 1]) {
          return pathParts[liveIndex + 1];
        }
      }
    } catch (error) {
      console.error('[YouTube API] Error parsing YouTube URL:', error);
    }
    return null;
  }

  /**
   * Extract channel ID or username from YouTube URL
   */
  private extractChannelInfo(url: string): { type: 'id' | 'username' | 'handle'; value: string } | null {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p);
      
      // youtube.com/channel/CHANNEL_ID
      if (pathParts[0] === 'channel' && pathParts[1]) {
        return { type: 'id', value: pathParts[1] };
      }
      
      // youtube.com/@username
      if (pathParts[0]?.startsWith('@')) {
        return { type: 'handle', value: pathParts[0] };
      }
      
      // youtube.com/c/username or youtube.com/user/username
      if ((pathParts[0] === 'c' || pathParts[0] === 'user') && pathParts[1]) {
        return { type: 'username', value: pathParts[1] };
      }
    } catch (error) {
      console.error('[YouTube API] Error parsing channel URL:', error);
    }
    return null;
  }

  /**
   * Fetch stream data from YouTube API
   */
  async getStreamData(youtubeUrl: string): Promise<EnrichedStreamData | null> {
    if (!this.isConfigured()) {
      console.warn('[YouTube API] Not configured, cannot fetch stream data');
      return null;
    }

    const videoId = this.extractVideoId(youtubeUrl);
    if (!videoId) {
      console.warn('[YouTube API] Could not extract video ID from URL:', youtubeUrl);
      return null;
    }

    console.log(`[YouTube API] Fetching stream data for video: ${videoId}`);

    try {
      // Fetch video data with retry
      const response = await retryWithBackoff(async () => {
        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,liveStreamingDetails&id=${videoId}&key=${this.apiKey}`,
          {
            headers: {
              'Accept': 'application/json',
            },
          }
        );

        if (!res.ok) {
          const error: any = new Error(`YouTube API error: ${res.statusText}`);
          error.status = res.status;
          throw error;
        }

        return res;
      }, 3, 1000);

      if (!response) {
        console.error('[YouTube API] Failed to fetch stream data after retries');
        return null;
      }

      const data = await response.json();
      const videos: YouTubeVideoData[] = data.items || [];

      if (videos.length === 0) {
        console.log(`[YouTube API] Video ${videoId} not found or not accessible`);
        return {
          title: '',
          game: '',
          viewerCount: 0,
          thumbnailUrl: '',
          profileImageUrl: '',
          isLive: false,
        };
      }

      const video = videos[0];
      const snippet = video.snippet;
      const liveDetails = video.liveStreamingDetails;

      // Check if stream is actually live
      const isLive = !!liveDetails?.actualStartTime && !liveDetails?.actualEndTime;

      if (!isLive) {
        console.log(`[YouTube API] Video ${videoId} is not currently live`);
        return {
          title: '',
          game: '',
          viewerCount: 0,
          thumbnailUrl: '',
          profileImageUrl: '',
          isLive: false,
        };
      }

      const viewerCount = liveDetails?.concurrentViewers ? parseInt(liveDetails.concurrentViewers, 10) : 0;
      const thumbnailUrl = snippet.thumbnails.high?.url || snippet.thumbnails.medium?.url || snippet.thumbnails.default?.url || '';

      // Fetch channel data for profile picture
      let profileImageUrl = '';
      try {
        const channelResponse = await retryWithBackoff(async () => {
          const res = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${snippet.channelId}&key=${this.apiKey}`,
            {
              headers: {
                'Accept': 'application/json',
              },
            }
          );

          if (!res.ok) {
            const error: any = new Error(`YouTube channel API error: ${res.statusText}`);
            error.status = res.status;
            throw error;
          }

          return res;
        }, 3, 1000);

        if (channelResponse) {
          const channelData = await channelResponse.json();
          const channels = channelData.items || [];
          if (channels.length > 0) {
            profileImageUrl = channels[0].snippet.thumbnails.high?.url || channels[0].snippet.thumbnails.default?.url || '';
          }
        }
      } catch (error) {
        console.warn('[YouTube API] Could not fetch channel data:', error);
      }

      console.log(`[YouTube API] ✓ ${snippet.channelTitle} is live: "${snippet.title}" with ${viewerCount} viewers (video_id: ${videoId})`);

      return {
        title: snippet.title,
        game: '', // YouTube doesn't have a game/category in the same way
        viewerCount,
        thumbnailUrl,
        profileImageUrl,
        isLive: true,
        streamId: videoId, // YouTube video ID for deduplication
      };
    } catch (error) {
      console.error('[YouTube API] Error fetching stream data:', error);
      return null;
    }
  }
}

// Export singleton instances
export const twitchAPI = new TwitchAPI();
export const youtubeAPI = new YouTubeAPI();
