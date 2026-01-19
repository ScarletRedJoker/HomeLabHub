/**
 * Jellyfin Media Service
 * 
 * Provides access to Jellyfin media library for the Discord bot.
 * Supports searching, browsing, and streaming audio content.
 * 
 * Features:
 * - JSON API for Jellyfin responses
 * - Search across all media types
 * - Audio streaming URLs for discord-player
 * - Graceful handling when service is offline
 */

export interface JellyfinMediaItem {
  id: string;
  name: string;
  type: 'Movie' | 'Series' | 'Season' | 'Episode' | 'MusicArtist' | 'MusicAlbum' | 'Audio';
  artistName?: string;
  albumName?: string;
  year?: number;
  duration?: number;
  imageTag?: string;
  seriesName?: string;
  albumArtist?: string;
  runTimeTicks?: number;
}

export interface JellyfinSearchResult {
  items: JellyfinMediaItem[];
  query: string;
}

export class JellyfinService {
  private jellyfinUrl: string;
  private apiKey: string;
  private userId: string = '';
  private enabled = false;
  private consecutiveFailures = 0;
  private lastErrorLogTime = 0;
  private errorLogIntervalMs = 300000;

  constructor() {
    this.jellyfinUrl = process.env.JELLYFIN_URL || '';
    this.apiKey = process.env.JELLYFIN_API_KEY || '';
    
    if (this.jellyfinUrl) {
      this.jellyfinUrl = this.jellyfinUrl.replace(/\/$/, '');
    }
  }

  isConfigured(): boolean {
    return !!(this.jellyfinUrl && this.apiKey);
  }

  isReady(): boolean {
    return this.enabled && !!this.userId;
  }

  // Reset internal state for retry
  reset(): void {
    this.enabled = false;
    this.userId = '';
    this.consecutiveFailures = 0;
  }

  async start(): Promise<void> {
    // Reset state before attempting to start
    this.reset();
    if (!this.isConfigured()) {
      console.log('[Jellyfin Service] JELLYFIN_URL or JELLYFIN_API_KEY not configured - Jellyfin disabled');
      throw new Error('Jellyfin not configured - set JELLYFIN_URL and JELLYFIN_API_KEY');
    }

    console.log('[Jellyfin Service] Starting Jellyfin service...');
    console.log(`[Jellyfin Service] Jellyfin URL: ${this.jellyfinUrl}`);
    
    // Throw errors so caller can handle them
    await this.fetchUserId();
    this.enabled = true;
    console.log('[Jellyfin Service] ✅ Jellyfin service started');
  }

  stop(): void {
    this.enabled = false;
    console.log('[Jellyfin Service] Jellyfin service stopped');
  }

  private async fetchUserId(): Promise<void> {
    try {
      const response = await fetch(`${this.jellyfinUrl}/Users`, {
        headers: {
          'X-MediaBrowser-Token': this.apiKey,
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const users = await response.json() as any[];
      if (users.length > 0) {
        this.userId = users[0].Id;
        console.log(`[Jellyfin Service] Using user: ${users[0].Name}`);
      }
    } catch (error: any) {
      console.error('[Jellyfin Service] Failed to fetch user ID:', error.message);
      throw error;
    }
  }

  async search(query: string, type?: 'Audio' | 'MusicAlbum' | 'MusicArtist' | 'Movie' | 'Series'): Promise<JellyfinSearchResult> {
    if (!this.isConfigured() || !this.userId) {
      return { items: [], query };
    }

    try {
      const typeFilter = type ? `&IncludeItemTypes=${type}` : '&IncludeItemTypes=Audio,MusicAlbum,MusicArtist,Movie,Series';
      const response = await fetch(
        `${this.jellyfinUrl}/Users/${this.userId}/Items?searchTerm=${encodeURIComponent(query)}${typeFilter}&Recursive=true&Limit=25`,
        {
          headers: {
            'X-MediaBrowser-Token': this.apiKey,
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(15000)
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as { Items: any[] };
      const items = this.parseItems(data.Items || []);

      if (this.consecutiveFailures > 0) {
        console.log('[Jellyfin Service] ✅ Jellyfin connection restored');
      }
      this.consecutiveFailures = 0;

      return { items, query };
    } catch (error: any) {
      this.handleError(error);
      return { items: [], query };
    }
  }

  async getRecentlyAdded(limit: number = 10): Promise<JellyfinMediaItem[]> {
    if (!this.isConfigured() || !this.userId) {
      return [];
    }

    try {
      const response = await fetch(
        `${this.jellyfinUrl}/Users/${this.userId}/Items/Latest?Limit=${limit}&IncludeItemTypes=Audio,Movie,Episode`,
        {
          headers: {
            'X-MediaBrowser-Token': this.apiKey,
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(15000)
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as any[];
      return this.parseItems(data || []);
    } catch (error: any) {
      this.handleError(error);
      return [];
    }
  }

  async getItemById(itemId: string): Promise<JellyfinMediaItem | null> {
    if (!this.isConfigured() || !this.userId) {
      return null;
    }

    try {
      const response = await fetch(
        `${this.jellyfinUrl}/Users/${this.userId}/Items/${itemId}`,
        {
          headers: {
            'X-MediaBrowser-Token': this.apiKey,
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(10000)
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const items = this.parseItems([data]);
      return items[0] || null;
    } catch (error: any) {
      return null;
    }
  }

  getStreamUrl(itemId: string): string | null {
    if (!this.isConfigured()) {
      return null;
    }
    return `${this.jellyfinUrl}/Audio/${itemId}/universal?api_key=${this.apiKey}&Container=mp3,opus,flac`;
  }

  getDirectStreamUrl(itemId: string): string | null {
    if (!this.isConfigured()) {
      return null;
    }
    return `${this.jellyfinUrl}/Items/${itemId}/Download?api_key=${this.apiKey}`;
  }

  getImageUrl(itemId: string, imageTag?: string): string | null {
    if (!this.isConfigured() || !imageTag) {
      return null;
    }
    return `${this.jellyfinUrl}/Items/${itemId}/Images/Primary?tag=${imageTag}&quality=90`;
  }

  private parseItems(items: any[]): JellyfinMediaItem[] {
    return items.map(item => ({
      id: item.Id,
      name: item.Name,
      type: item.Type as JellyfinMediaItem['type'],
      artistName: item.AlbumArtist || item.Artists?.[0],
      albumName: item.Album,
      year: item.ProductionYear,
      duration: item.RunTimeTicks ? Math.floor(item.RunTimeTicks / 10000000) : undefined,
      imageTag: item.ImageTags?.Primary,
      seriesName: item.SeriesName,
      albumArtist: item.AlbumArtist,
      runTimeTicks: item.RunTimeTicks
    })).filter(item => item.id && item.name);
  }

  private handleError(error: any): void {
    this.consecutiveFailures++;

    const now = Date.now();
    const shouldLog = (now - this.lastErrorLogTime) >= this.errorLogIntervalMs;

    if (shouldLog || this.consecutiveFailures === 1) {
      console.warn(
        `[Jellyfin Service] Request failed (attempt ${this.consecutiveFailures}): ${error.message}`
      );
      this.lastErrorLogTime = now;
    }
  }

  getStatus(): { configured: boolean; healthy: boolean; consecutiveFailures: number } {
    return {
      configured: this.isConfigured(),
      healthy: this.consecutiveFailures === 0 && this.enabled,
      consecutiveFailures: this.consecutiveFailures
    };
  }
}

let jellyfinServiceInstance: JellyfinService | null = null;

export function initJellyfinService(): JellyfinService {
  if (jellyfinServiceInstance) {
    jellyfinServiceInstance.stop();
  }
  jellyfinServiceInstance = new JellyfinService();
  return jellyfinServiceInstance;
}

export function getJellyfinService(): JellyfinService | null {
  return jellyfinServiceInstance;
}

export function clearJellyfinService(): void {
  if (jellyfinServiceInstance) {
    jellyfinServiceInstance.stop();
    jellyfinServiceInstance = null;
  }
}
