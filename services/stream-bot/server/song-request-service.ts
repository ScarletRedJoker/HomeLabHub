import { db } from "./db";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { songQueue, songSettings, type SongQueue, type SongSettings, type InsertSongQueue, type UpdateSongQueue } from "@shared/schema";
import { SpotifyServiceMultiUser } from "./spotify-service-multiuser";
import { YouTubeServiceMultiUser } from "./youtube-service-multiuser";
import { UserStorage } from "./user-storage";
import OpenAI from "openai";
import axios from "axios";

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// Initialize OpenAI for profanity filtering
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

export interface SearchResult {
  title: string;
  artist: string;
  url: string;
  platform: 'spotify' | 'youtube';
  albumImageUrl?: string;
  duration?: number;
  id?: string;
}

export interface QueuePosition {
  current: number;
  total: number;
}

export class SongRequestService {
  private spotifyService: SpotifyServiceMultiUser;
  private youtubeService: YouTubeServiceMultiUser;

  constructor() {
    this.spotifyService = new SpotifyServiceMultiUser();
    this.youtubeService = new YouTubeServiceMultiUser();
  }

  /**
   * Get or create song settings for a user
   */
  async getSettings(userId: string): Promise<SongSettings> {
    const existing = await db.select().from(songSettings).where(eq(songSettings.userId, userId)).limit(1);
    
    if (existing.length > 0) {
      return existing[0];
    }

    // Create default settings
    const [newSettings] = await db.insert(songSettings).values({
      userId,
      enableSongRequests: true,
      maxQueueSize: 20,
      maxSongsPerUser: 3,
      allowDuplicates: false,
      profanityFilter: true,
      bannedSongs: [],
      volumeLimit: 100,
      allowSpotify: true,
      allowYoutube: true,
      moderatorOnly: false,
    }).returning();

    return newSettings;
  }

  /**
   * Update song settings for a user
   */
  async updateSettings(userId: string, updates: Partial<SongSettings>): Promise<SongSettings> {
    const [updated] = await db.update(songSettings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(songSettings.userId, userId))
      .returning();

    return updated;
  }

  /**
   * Search for songs on Spotify
   */
  async searchSpotify(userId: string, query: string): Promise<SearchResult[]> {
    try {
      const isConnected = await this.spotifyService.isConnected(userId);
      if (!isConnected) {
        throw new Error('Spotify not connected');
      }

      // Use the private spotifyRequest method via reflection
      const tracks = await (this.spotifyService as any).spotifyRequest(
        userId,
        `/search?q=${encodeURIComponent(query)}&type=track&limit=5`,
        'GET'
      );

      if (!tracks?.tracks?.items) {
        return [];
      }

      return tracks.tracks.items.map((track: any) => ({
        title: track.name,
        artist: track.artists.map((a: any) => a.name).join(', '),
        url: track.external_urls.spotify,
        platform: 'spotify' as const,
        albumImageUrl: track.album.images[0]?.url,
        duration: track.duration_ms,
        id: track.id,
      }));
    } catch (error: any) {
      console.error('[SongRequest] Spotify search error:', error.message);
      return [];
    }
  }

  /**
   * Search for songs on YouTube
   */
  async searchYouTube(userId: string, query: string): Promise<SearchResult[]> {
    try {
      const isConnected = await (this.youtubeService as any).isConnected(userId);
      if (!isConnected) {
        throw new Error('YouTube not connected');
      }

      const accessToken = await (this.youtubeService as any).getAccessToken(userId);
      
      const response = await axios.get(`${YOUTUBE_API_BASE}/search`, {
        params: {
          part: 'snippet',
          q: query,
          type: 'video',
          videoCategoryId: '10', // Music category
          maxResults: 5,
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.data?.items) {
        return [];
      }

      // Get video details for duration
      const videoIds = response.data.items.map((item: any) => item.id.videoId).join(',');
      const detailsResponse = await axios.get(`${YOUTUBE_API_BASE}/videos`, {
        params: {
          part: 'contentDetails,snippet',
          id: videoIds,
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      return detailsResponse.data.items.map((video: any) => ({
        title: video.snippet.title,
        artist: video.snippet.channelTitle,
        url: `https://www.youtube.com/watch?v=${video.id}`,
        platform: 'youtube' as const,
        albumImageUrl: video.snippet.thumbnails?.high?.url,
        duration: this.parseDuration(video.contentDetails.duration),
        id: video.id,
      }));
    } catch (error: any) {
      console.error('[SongRequest] YouTube search error:', error.message);
      return [];
    }
  }

  /**
   * Parse ISO 8601 duration to milliseconds
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');

    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }

  /**
   * Search for songs across platforms
   */
  async searchSong(userId: string, query: string): Promise<SearchResult[]> {
    const settings = await this.getSettings(userId);
    const results: SearchResult[] = [];

    // Search both platforms in parallel
    const promises: Promise<SearchResult[]>[] = [];

    if (settings.allowSpotify) {
      promises.push(this.searchSpotify(userId, query));
    }

    if (settings.allowYoutube) {
      promises.push(this.searchYouTube(userId, query));
    }

    const allResults = await Promise.allSettled(promises);

    allResults.forEach(result => {
      if (result.status === 'fulfilled') {
        results.push(...result.value);
      }
    });

    return results;
  }

  /**
   * Filter profanity using OpenAI moderation API
   */
  async filterProfanity(title: string, artist: string): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const text = `${title} by ${artist}`;
      
      const moderation = await openai.moderations.create({
        input: text,
      });

      const result = moderation.results[0];

      if (result.flagged) {
        const categories = Object.entries(result.categories)
          .filter(([_, flagged]) => flagged)
          .map(([category]) => category);

        return {
          allowed: false,
          reason: `Content flagged: ${categories.join(', ')}`,
        };
      }

      return { allowed: true };
    } catch (error: any) {
      console.error('[SongRequest] Profanity filter error:', error.message);
      // Allow by default if moderation fails
      return { allowed: true };
    }
  }

  /**
   * Check if song is banned
   */
  async checkBannedSong(userId: string, songUrl: string): Promise<boolean> {
    const settings = await this.getSettings(userId);
    return settings.bannedSongs.includes(songUrl);
  }

  /**
   * Ban a song
   */
  async banSong(userId: string, songUrl: string): Promise<void> {
    const settings = await this.getSettings(userId);
    
    if (!settings.bannedSongs.includes(songUrl)) {
      await db.update(songSettings)
        .set({
          bannedSongs: [...settings.bannedSongs, songUrl],
          updatedAt: new Date(),
        })
        .where(eq(songSettings.userId, userId));
    }
  }

  /**
   * Unban a song
   */
  async unbanSong(userId: string, songUrl: string): Promise<void> {
    const settings = await this.getSettings(userId);
    
    await db.update(songSettings)
      .set({
        bannedSongs: settings.bannedSongs.filter(url => url !== songUrl),
        updatedAt: new Date(),
      })
      .where(eq(songSettings.userId, userId));
  }

  /**
   * Add song to queue
   */
  async addToQueue(
    userId: string,
    requestedBy: string,
    query: string,
    isModerator: boolean = false
  ): Promise<{ success: boolean; song?: SongQueue; error?: string; position?: QueuePosition }> {
    try {
      const settings = await this.getSettings(userId);

      // Check if song requests are enabled
      if (!settings.enableSongRequests) {
        return { success: false, error: 'Song requests are currently disabled' };
      }

      // Check moderator-only restriction
      if (settings.moderatorOnly && !isModerator) {
        return { success: false, error: 'Only moderators can request songs' };
      }

      // Check if query is a direct URL
      let searchResults: SearchResult[];
      
      if (query.includes('spotify.com') || query.includes('youtube.com') || query.includes('youtu.be')) {
        // Direct URL - extract song info
        searchResults = await this.extractSongFromUrl(userId, query);
      } else {
        // Search query
        searchResults = await this.searchSong(userId, query);
      }

      if (searchResults.length === 0) {
        return { success: false, error: 'No songs found for that query' };
      }

      const song = searchResults[0]; // Take first result

      // Check platform allowance
      if (song.platform === 'spotify' && !settings.allowSpotify) {
        return { success: false, error: 'Spotify requests are not allowed' };
      }

      if (song.platform === 'youtube' && !settings.allowYoutube) {
        return { success: false, error: 'YouTube requests are not allowed' };
      }

      // Check if song is banned
      const isBanned = await this.checkBannedSong(userId, song.url);
      if (isBanned) {
        return { success: false, error: 'This song is banned' };
      }

      // Check profanity filter
      if (settings.profanityFilter) {
        const profanityCheck = await this.filterProfanity(song.title, song.artist);
        if (!profanityCheck.allowed) {
          return { success: false, error: profanityCheck.reason || 'Song contains inappropriate content' };
        }
      }

      // Get current queue
      const currentQueue = await this.getQueue(userId);

      // Check queue size limit
      if (currentQueue.length >= settings.maxQueueSize) {
        return { success: false, error: `Queue is full (max ${settings.maxQueueSize} songs)` };
      }

      // Check per-user limit
      const userSongs = currentQueue.filter(s => s.requestedBy === requestedBy && s.status === 'pending');
      if (userSongs.length >= settings.maxSongsPerUser) {
        return { success: false, error: `You can only have ${settings.maxSongsPerUser} songs in queue` };
      }

      // Check duplicates
      if (!settings.allowDuplicates) {
        const duplicate = currentQueue.find(s => s.url === song.url && s.status === 'pending');
        if (duplicate) {
          return { success: false, error: 'This song is already in the queue' };
        }
      }

      // Calculate position
      const maxPosition = currentQueue.length > 0
        ? Math.max(...currentQueue.map(s => s.position))
        : -1;

      // Add to queue
      const [addedSong] = await db.insert(songQueue).values({
        userId,
        requestedBy,
        songTitle: song.title,
        artist: song.artist,
        url: song.url,
        platform: song.platform,
        albumImageUrl: song.albumImageUrl,
        duration: song.duration,
        status: 'pending',
        position: maxPosition + 1,
      }).returning();

      const position: QueuePosition = {
        current: addedSong.position + 1,
        total: currentQueue.length + 1,
      };

      return { success: true, song: addedSong, position };
    } catch (error: any) {
      console.error('[SongRequest] Add to queue error:', error);
      return { success: false, error: error.message || 'Failed to add song to queue' };
    }
  }

  /**
   * Extract song info from URL
   */
  private async extractSongFromUrl(userId: string, url: string): Promise<SearchResult[]> {
    if (url.includes('spotify.com')) {
      // Extract Spotify track ID
      const match = url.match(/track\/([a-zA-Z0-9]+)/);
      if (match) {
        const trackId = match[1];
        try {
          const track = await (this.spotifyService as any).spotifyRequest(
            userId,
            `/tracks/${trackId}`,
            'GET'
          );

          return [{
            title: track.name,
            artist: track.artists.map((a: any) => a.name).join(', '),
            url: track.external_urls.spotify,
            platform: 'spotify',
            albumImageUrl: track.album.images[0]?.url,
            duration: track.duration_ms,
            id: track.id,
          }];
        } catch (error) {
          console.error('[SongRequest] Spotify URL extraction error:', error);
          return [];
        }
      }
    } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
      // Extract YouTube video ID
      let videoId: string | null = null;

      if (url.includes('youtube.com')) {
        const match = url.match(/[?&]v=([^&]+)/);
        videoId = match ? match[1] : null;
      } else if (url.includes('youtu.be')) {
        const match = url.match(/youtu\.be\/([^?]+)/);
        videoId = match ? match[1] : null;
      }

      if (videoId) {
        try {
          const accessToken = await (this.youtubeService as any).getAccessToken(userId);
          
          const response = await axios.get(`${YOUTUBE_API_BASE}/videos`, {
            params: {
              part: 'snippet,contentDetails',
              id: videoId,
            },
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          });

          if (response.data.items && response.data.items.length > 0) {
            const video = response.data.items[0];
            return [{
              title: video.snippet.title,
              artist: video.snippet.channelTitle,
              url,
              platform: 'youtube',
              albumImageUrl: video.snippet.thumbnails?.high?.url,
              duration: this.parseDuration(video.contentDetails.duration),
              id: video.id,
            }];
          }
        } catch (error) {
          console.error('[SongRequest] YouTube URL extraction error:', error);
          return [];
        }
      }
    }

    return [];
  }

  /**
   * Get current queue
   */
  async getQueue(userId: string): Promise<SongQueue[]> {
    return db.select()
      .from(songQueue)
      .where(and(
        eq(songQueue.userId, userId),
        eq(songQueue.status, 'pending')
      ))
      .orderBy(asc(songQueue.position));
  }

  /**
   * Get current playing song
   */
  async getCurrentSong(userId: string): Promise<SongQueue | null> {
    const songs = await db.select()
      .from(songQueue)
      .where(and(
        eq(songQueue.userId, userId),
        eq(songQueue.status, 'playing')
      ))
      .orderBy(desc(songQueue.requestedAt))
      .limit(1);

    return songs.length > 0 ? songs[0] : null;
  }

  /**
   * Play next song in queue
   */
  async playNext(userId: string): Promise<SongQueue | null> {
    // Mark current song as played
    const current = await this.getCurrentSong(userId);
    if (current) {
      await db.update(songQueue)
        .set({ status: 'played', playedAt: new Date() })
        .where(eq(songQueue.id, current.id));
    }

    // Get next song
    const queue = await this.getQueue(userId);
    if (queue.length === 0) {
      return null;
    }

    const next = queue[0];

    // Mark as playing
    await db.update(songQueue)
      .set({ status: 'playing' })
      .where(eq(songQueue.id, next.id));

    return next;
  }

  /**
   * Skip current song
   */
  async skipCurrent(userId: string): Promise<boolean> {
    const current = await this.getCurrentSong(userId);
    if (!current) {
      return false;
    }

    await db.update(songQueue)
      .set({ status: 'skipped', playedAt: new Date() })
      .where(eq(songQueue.id, current.id));

    return true;
  }

  /**
   * Remove song from queue
   */
  async removeFromQueue(userId: string, songId: string): Promise<boolean> {
    const result = await db.update(songQueue)
      .set({ status: 'removed' })
      .where(and(
        eq(songQueue.id, songId),
        eq(songQueue.userId, userId)
      ));

    return true;
  }

  /**
   * Remove song by position
   */
  async removeByPosition(userId: string, position: number): Promise<boolean> {
    const queue = await this.getQueue(userId);
    
    if (position < 1 || position > queue.length) {
      return false;
    }

    const song = queue[position - 1];
    return this.removeFromQueue(userId, song.id);
  }

  /**
   * Get song request history
   */
  async getHistory(userId: string, limit: number = 50): Promise<SongQueue[]> {
    return db.select()
      .from(songQueue)
      .where(eq(songQueue.userId, userId))
      .orderBy(desc(songQueue.requestedAt))
      .limit(limit);
  }

  /**
   * Reorder queue
   */
  async reorderQueue(userId: string, songId: string, newPosition: number): Promise<boolean> {
    try {
      const queue = await this.getQueue(userId);
      const songIndex = queue.findIndex(s => s.id === songId);

      if (songIndex === -1) {
        return false;
      }

      // Remove song from old position
      const [song] = queue.splice(songIndex, 1);

      // Insert at new position
      queue.splice(newPosition, 0, song);

      // Update all positions
      const updates = queue.map((s, index) =>
        db.update(songQueue)
          .set({ position: index })
          .where(eq(songQueue.id, s.id))
      );

      await Promise.all(updates);

      return true;
    } catch (error) {
      console.error('[SongRequest] Reorder error:', error);
      return false;
    }
  }
}

export const songRequestService = new SongRequestService();
