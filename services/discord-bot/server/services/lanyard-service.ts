/**
 * Lanyard Integration Service
 * 
 * Provides Discord presence data via Lanyard API with hybrid REST/WebSocket approach.
 * Lanyard is a service that exposes Discord presence data.
 * 
 * Requirements:
 * - User must be in the Lanyard Discord server: https://discord.gg/lanyard
 * - GitHub: https://github.com/Phineas/lanyard
 * - No API key needed - it's a free public service
 * 
 * Features:
 * - REST API polling for on-demand presence data
 * - WebSocket connection for real-time updates
 * - In-memory caching with TTL
 * - Batch user lookup (up to 10 users)
 * - Rich presence parsing (Spotify, games, custom status)
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';

export interface LanyardDiscordUser {
  id: string;
  username: string;
  avatar: string;
  discriminator: string;
  public_flags: number;
  display_name: string | null;
  global_name: string | null;
}

export interface LanyardSpotify {
  track_id: string;
  timestamps: {
    start: number;
    end: number;
  };
  album: string;
  album_art_url: string;
  artist: string;
  song: string;
}

export interface LanyardActivity {
  id: string;
  name: string;
  type: number; // 0=Playing, 1=Streaming, 2=Listening, 3=Watching, 4=Custom, 5=Competing
  state?: string;
  details?: string;
  timestamps?: {
    start?: number;
    end?: number;
  };
  assets?: {
    large_image?: string;
    large_text?: string;
    small_image?: string;
    small_text?: string;
  };
  application_id?: string;
  emoji?: {
    name: string;
    id?: string;
    animated?: boolean;
  };
  created_at?: number;
  buttons?: string[];
}

export interface LanyardPresenceData {
  spotify: LanyardSpotify | null;
  listening_to_spotify: boolean;
  discord_user: LanyardDiscordUser;
  discord_status: 'online' | 'idle' | 'dnd' | 'offline';
  activities: LanyardActivity[];
  active_on_discord_web: boolean;
  active_on_discord_desktop: boolean;
  active_on_discord_mobile: boolean;
  kv?: Record<string, string>;
}

export interface LanyardResponse {
  success: boolean;
  data: LanyardPresenceData;
  error?: {
    code: string;
    message: string;
  };
}

export interface LanyardBatchResponse {
  success: boolean;
  data: Record<string, LanyardPresenceData>;
  error?: {
    code: string;
    message: string;
  };
}

export interface RichPresence {
  type: 'spotify' | 'game' | 'stream' | 'custom' | 'watching' | 'competing' | 'unknown';
  name: string;
  details?: string;
  state?: string;
  startedAt?: number;
  endsAt?: number;
  largeImageUrl?: string;
  smallImageUrl?: string;
  largeText?: string;
  smallText?: string;
  applicationId?: string;
  emoji?: {
    name: string;
    id?: string;
    animated?: boolean;
  };
  buttons?: string[];
}

export interface SpotifyPresence {
  isListening: boolean;
  trackId?: string;
  song?: string;
  artist?: string;
  album?: string;
  albumArtUrl?: string;
  progress?: number; // 0-100
  elapsed?: number; // ms
  duration?: number; // ms
  startedAt?: number;
  endsAt?: number;
}

export interface FormattedPresence {
  discordId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  statusText: string;
  spotify: SpotifyPresence | null;
  richPresence: RichPresence[];
  activities: Array<{
    name: string;
    type: string;
    details?: string;
    state?: string;
  }>;
  customStatus?: {
    text: string;
    emoji?: {
      name: string;
      id?: string;
      animated?: boolean;
    };
  };
  platforms: {
    desktop: boolean;
    web: boolean;
    mobile: boolean;
  };
  kv?: Record<string, string>;
  lastUpdated: number;
  source: 'rest' | 'websocket';
}

const LANYARD_API_BASE = 'https://api.lanyard.rest/v1/users';
const LANYARD_WS_URL = 'wss://api.lanyard.rest/socket';

const ACTIVITY_TYPE_NAMES: Record<number, string> = {
  0: 'Playing',
  1: 'Streaming',
  2: 'Listening to',
  3: 'Watching',
  4: 'Custom Status',
  5: 'Competing in',
};

const ACTIVITY_TYPE_RICH: Record<number, RichPresence['type']> = {
  0: 'game',
  1: 'stream',
  2: 'spotify',
  3: 'watching',
  4: 'custom',
  5: 'competing',
};

interface CacheEntry {
  data: FormattedPresence;
  rawData: LanyardPresenceData;
  timestamp: number;
  expiresAt: number;
}

export class LanyardService extends EventEmitter {
  private cache: Map<string, CacheEntry> = new Map();
  private cacheTTL = 30000; // 30 seconds for REST cache
  private wsCacheTTL = 60000; // 60 seconds for WebSocket-updated cache
  
  private ws: WebSocket | null = null;
  private wsConnected = false;
  private wsReconnectTimer: NodeJS.Timeout | null = null;
  private wsHeartbeatTimer: NodeJS.Timeout | null = null;
  private wsReconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private subscribedUserIds: Set<string> = new Set();
  private wsEnabled = false;
  
  constructor() {
    super();
    console.log('[Lanyard Service] Initialized with hybrid REST/WebSocket support');
  }

  /**
   * Enable WebSocket connection for real-time updates
   */
  async enableWebSocket(userIds?: string[]): Promise<void> {
    this.wsEnabled = true;
    
    if (userIds) {
      userIds.forEach(id => this.subscribedUserIds.add(id));
    }
    
    await this.connectWebSocket();
  }

  /**
   * Disable WebSocket connection
   */
  disableWebSocket(): void {
    this.wsEnabled = false;
    this.disconnectWebSocket();
  }

  /**
   * Subscribe to real-time updates for a user
   */
  subscribeToUser(discordId: string): void {
    if (!this.isValidDiscordId(discordId)) {
      console.warn(`[Lanyard WS] Invalid Discord ID: ${discordId}`);
      return;
    }
    
    this.subscribedUserIds.add(discordId);
    
    if (this.wsConnected && this.ws) {
      this.ws.send(JSON.stringify({
        op: 2,
        d: { subscribe_to_id: discordId }
      }));
      console.log(`[Lanyard WS] Subscribed to user: ${discordId}`);
    }
  }

  /**
   * Unsubscribe from a user's updates
   */
  unsubscribeFromUser(discordId: string): void {
    this.subscribedUserIds.delete(discordId);
    // Note: Lanyard doesn't have an unsubscribe opcode, connection needs to be remade
  }

  private async connectWebSocket(): Promise<void> {
    if (this.ws && this.wsConnected) {
      return;
    }

    try {
      this.ws = new WebSocket(LANYARD_WS_URL);

      this.ws.on('open', () => {
        console.log('[Lanyard WS] Connected');
        this.wsConnected = true;
        this.wsReconnectAttempts = 0;
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(message);
        } catch (error) {
          console.error('[Lanyard WS] Failed to parse message:', error);
        }
      });

      this.ws.on('close', (code, reason) => {
        console.log(`[Lanyard WS] Disconnected: ${code} ${reason}`);
        this.wsConnected = false;
        this.clearHeartbeat();
        
        if (this.wsEnabled) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (error) => {
        console.error('[Lanyard WS] Error:', error.message);
      });

    } catch (error: any) {
      console.error('[Lanyard WS] Connection failed:', error.message);
      if (this.wsEnabled) {
        this.scheduleReconnect();
      }
    }
  }

  private handleWebSocketMessage(message: any): void {
    switch (message.op) {
      case 0: // Event
        if (message.t === 'INIT_STATE') {
          this.handleInitState(message.d);
        } else if (message.t === 'PRESENCE_UPDATE') {
          this.handlePresenceUpdate(message.d);
        }
        break;
      
      case 1: // Hello - Contains heartbeat interval
        const heartbeatInterval = message.d.heartbeat_interval;
        this.startHeartbeat(heartbeatInterval);
        
        // Subscribe to all tracked users
        if (this.subscribedUserIds.size > 0) {
          this.ws?.send(JSON.stringify({
            op: 2,
            d: { subscribe_to_ids: Array.from(this.subscribedUserIds) }
          }));
        }
        break;
    }
  }

  private handleInitState(data: Record<string, LanyardPresenceData>): void {
    console.log(`[Lanyard WS] Received init state for ${Object.keys(data).length} users`);
    
    for (const [userId, presenceData] of Object.entries(data)) {
      const formatted = this.formatPresence(userId, presenceData, 'websocket');
      this.updateCache(userId, formatted, presenceData, this.wsCacheTTL);
      this.emit('presenceUpdate', formatted);
    }
  }

  private handlePresenceUpdate(data: LanyardPresenceData): void {
    const userId = data.discord_user.id;
    const formatted = this.formatPresence(userId, data, 'websocket');
    const oldPresence = this.cache.get(userId);
    
    this.updateCache(userId, formatted, data, this.wsCacheTTL);
    
    // Emit events for different types of updates
    this.emit('presenceUpdate', formatted);
    
    if (formatted.spotify?.isListening && !oldPresence?.data.spotify?.isListening) {
      this.emit('spotifyStart', formatted);
    } else if (!formatted.spotify?.isListening && oldPresence?.data.spotify?.isListening) {
      this.emit('spotifyEnd', formatted);
    }
    
    if (formatted.status !== oldPresence?.data.status) {
      this.emit('statusChange', formatted, oldPresence?.data.status);
    }
  }

  private startHeartbeat(interval: number): void {
    this.clearHeartbeat();
    
    this.wsHeartbeatTimer = setInterval(() => {
      if (this.ws && this.wsConnected) {
        this.ws.send(JSON.stringify({ op: 3 }));
      }
    }, interval);
  }

  private clearHeartbeat(): void {
    if (this.wsHeartbeatTimer) {
      clearInterval(this.wsHeartbeatTimer);
      this.wsHeartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
    }

    if (this.wsReconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Lanyard WS] Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.wsReconnectAttempts), 30000);
    this.wsReconnectAttempts++;

    console.log(`[Lanyard WS] Reconnecting in ${delay}ms (attempt ${this.wsReconnectAttempts})`);

    this.wsReconnectTimer = setTimeout(() => {
      this.connectWebSocket();
    }, delay);
  }

  private disconnectWebSocket(): void {
    this.clearHeartbeat();
    
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.wsConnected = false;
  }

  private isValidDiscordId(discordId: string): boolean {
    return !!discordId && /^\d{17,19}$/.test(discordId);
  }

  private updateCache(userId: string, formatted: FormattedPresence, rawData: LanyardPresenceData, ttl: number): void {
    this.cache.set(userId, {
      data: formatted,
      rawData,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl
    });
  }

  /**
   * Get user's presence data from Lanyard API
   */
  async getPresence(discordId: string, forceRefresh = false): Promise<FormattedPresence | null> {
    if (!this.isValidDiscordId(discordId)) {
      console.warn(`[Lanyard Service] Invalid Discord ID format: ${discordId}`);
      return null;
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = this.cache.get(discordId);
      if (cached && Date.now() < cached.expiresAt) {
        return cached.data;
      }
    }

    try {
      const response = await fetch(`${LANYARD_API_BASE}/${discordId}`, {
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`[Lanyard Service] User ${discordId} not found - they may not be in Lanyard Discord`);
          return null;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result: LanyardResponse = await response.json();

      if (!result.success) {
        console.warn(`[Lanyard Service] API error: ${result.error?.message || 'Unknown error'}`);
        return null;
      }

      const formatted = this.formatPresence(discordId, result.data, 'rest');
      this.updateCache(discordId, formatted, result.data, this.cacheTTL);

      return formatted;

    } catch (error: any) {
      console.error(`[Lanyard Service] Failed to fetch presence for ${discordId}: ${error.message}`);
      
      // Return stale cache if available
      const cached = this.cache.get(discordId);
      if (cached) {
        console.log(`[Lanyard Service] Returning stale cache for ${discordId}`);
        return cached.data;
      }
      
      return null;
    }
  }

  /**
   * Get presence for multiple users at once (up to 10)
   */
  async getPresenceBatch(discordIds: string[]): Promise<Map<string, FormattedPresence | null>> {
    const results = new Map<string, FormattedPresence | null>();
    
    // Filter valid IDs
    const validIds = discordIds.filter(id => this.isValidDiscordId(id)).slice(0, 10);
    
    if (validIds.length === 0) {
      return results;
    }

    // Check cache first
    const uncachedIds: string[] = [];
    for (const id of validIds) {
      const cached = this.cache.get(id);
      if (cached && Date.now() < cached.expiresAt) {
        results.set(id, cached.data);
      } else {
        uncachedIds.push(id);
      }
    }

    // Fetch uncached IDs
    if (uncachedIds.length > 0) {
      try {
        const idsParam = uncachedIds.join(',');
        const response = await fetch(`${LANYARD_API_BASE}/${idsParam}`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(15000),
        });

        if (response.ok) {
          const result = await response.json();
          
          // Handle single user response
          if (result.success && result.data && uncachedIds.length === 1) {
            const id = uncachedIds[0];
            const formatted = this.formatPresence(id, result.data, 'rest');
            this.updateCache(id, formatted, result.data, this.cacheTTL);
            results.set(id, formatted);
          }
          // Handle batch response
          else if (result.success && typeof result.data === 'object') {
            for (const [id, presenceData] of Object.entries(result.data as Record<string, LanyardPresenceData>)) {
              const formatted = this.formatPresence(id, presenceData, 'rest');
              this.updateCache(id, formatted, presenceData, this.cacheTTL);
              results.set(id, formatted);
            }
          }
        }
      } catch (error: any) {
        console.error(`[Lanyard Service] Batch fetch failed: ${error.message}`);
        
        // Fallback to individual requests
        await Promise.all(
          uncachedIds.map(async (id) => {
            const presence = await this.getPresence(id);
            results.set(id, presence);
          })
        );
      }
    }

    // Ensure all requested IDs have an entry
    for (const id of validIds) {
      if (!results.has(id)) {
        results.set(id, null);
      }
    }

    return results;
  }

  /**
   * Check if a user is online on Discord
   */
  async isOnline(discordId: string): Promise<boolean> {
    const presence = await this.getPresence(discordId);
    return presence !== null && presence.status !== 'offline';
  }

  /**
   * Get current activity (game, stream, etc.)
   */
  async getCurrentActivity(discordId: string): Promise<LanyardActivity | null> {
    const cached = this.cache.get(discordId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.rawData.activities.find(a => a.type !== 2) || null;
    }
    
    const rawPresence = await this.getRawPresence(discordId);
    if (rawPresence) {
      return rawPresence.activities.find(a => a.type !== 2) || null;
    }
    
    return null;
  }

  /**
   * Get rich presence details for all activities
   */
  async getRichPresence(discordId: string): Promise<RichPresence[]> {
    const presence = await this.getPresence(discordId);
    return presence?.richPresence || [];
  }

  /**
   * Get Spotify listening status
   */
  async getSpotifyPresence(discordId: string): Promise<SpotifyPresence | null> {
    const presence = await this.getPresence(discordId);
    return presence?.spotify || null;
  }

  /**
   * Get raw presence data without formatting
   */
  async getRawPresence(discordId: string): Promise<LanyardPresenceData | null> {
    // Check cache first
    const cached = this.cache.get(discordId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.rawData;
    }

    if (!this.isValidDiscordId(discordId)) {
      return null;
    }

    try {
      const response = await fetch(`${LANYARD_API_BASE}/${discordId}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return null;

      const result: LanyardResponse = await response.json();
      if (result.success) {
        const formatted = this.formatPresence(discordId, result.data, 'rest');
        this.updateCache(discordId, formatted, result.data, this.cacheTTL);
        return result.data;
      }
      return null;

    } catch {
      return null;
    }
  }

  /**
   * Parse rich presence from activity
   */
  private parseRichPresence(activity: LanyardActivity): RichPresence {
    const type = ACTIVITY_TYPE_RICH[activity.type] || 'unknown';
    
    let largeImageUrl: string | undefined;
    let smallImageUrl: string | undefined;
    
    if (activity.assets) {
      if (activity.assets.large_image) {
        largeImageUrl = this.parseAssetUrl(activity.assets.large_image, activity.application_id);
      }
      if (activity.assets.small_image) {
        smallImageUrl = this.parseAssetUrl(activity.assets.small_image, activity.application_id);
      }
    }

    return {
      type,
      name: activity.name,
      details: activity.details,
      state: activity.state,
      startedAt: activity.timestamps?.start,
      endsAt: activity.timestamps?.end,
      largeImageUrl,
      smallImageUrl,
      largeText: activity.assets?.large_text,
      smallText: activity.assets?.small_text,
      applicationId: activity.application_id,
      emoji: activity.emoji,
      buttons: activity.buttons,
    };
  }

  /**
   * Parse Discord asset URL
   */
  private parseAssetUrl(asset: string, applicationId?: string): string {
    if (asset.startsWith('mp:external/')) {
      // External image from Discord CDN proxy
      const path = asset.replace('mp:external/', '');
      return `https://media.discordapp.net/external/${path}`;
    }
    if (asset.startsWith('spotify:')) {
      // Spotify album art
      const spotifyId = asset.replace('spotify:', '');
      return `https://i.scdn.co/image/${spotifyId}`;
    }
    if (applicationId && /^\d+$/.test(asset)) {
      // Application asset
      return `https://cdn.discordapp.com/app-assets/${applicationId}/${asset}.png`;
    }
    // Direct URL
    if (asset.startsWith('http')) {
      return asset;
    }
    return asset;
  }

  /**
   * Format raw Lanyard data into a cleaner structure
   */
  private formatPresence(discordId: string, data: LanyardPresenceData, source: 'rest' | 'websocket'): FormattedPresence {
    const avatarUrl = data.discord_user.avatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${data.discord_user.avatar}.${data.discord_user.avatar.startsWith('a_') ? 'gif' : 'png'}`
      : null;

    // Parse Spotify presence
    let spotify: SpotifyPresence | null = null;
    if (data.listening_to_spotify && data.spotify) {
      const now = Date.now();
      const elapsed = now - data.spotify.timestamps.start;
      const duration = data.spotify.timestamps.end - data.spotify.timestamps.start;
      const progress = Math.min(100, Math.max(0, (elapsed / duration) * 100));

      spotify = {
        isListening: true,
        trackId: data.spotify.track_id,
        song: data.spotify.song,
        artist: data.spotify.artist,
        album: data.spotify.album,
        albumArtUrl: data.spotify.album_art_url,
        progress: Math.round(progress),
        elapsed,
        duration,
        startedAt: data.spotify.timestamps.start,
        endsAt: data.spotify.timestamps.end,
      };
    }

    // Parse rich presence for all activities
    const richPresence: RichPresence[] = data.activities
      .filter(a => a.type !== 4) // Exclude custom status from rich presence array
      .map(a => this.parseRichPresence(a));

    // Parse custom status
    const customStatusActivity = data.activities.find(a => a.type === 4);
    let customStatus: FormattedPresence['customStatus'];
    if (customStatusActivity) {
      customStatus = {
        text: customStatusActivity.state || '',
        emoji: customStatusActivity.emoji,
      };
    }

    const activities = data.activities
      .filter(a => a.type !== 2) // Exclude Spotify (handled separately)
      .map(a => ({
        name: a.name,
        type: ACTIVITY_TYPE_NAMES[a.type] || 'Unknown',
        details: a.details,
        state: a.state,
      }));

    // Build status text
    let statusText = this.getStatusEmoji(data.discord_status);
    if (data.listening_to_spotify && data.spotify) {
      statusText = `🎵 Listening to ${data.spotify.song} by ${data.spotify.artist}`;
    } else if (customStatus?.text) {
      statusText = customStatus.emoji?.name 
        ? `${customStatus.emoji.name} ${customStatus.text}`
        : customStatus.text;
    } else if (activities.length > 0) {
      const mainActivity = activities[0];
      statusText = `${mainActivity.type} ${mainActivity.name}`;
      if (mainActivity.details) {
        statusText += ` - ${mainActivity.details}`;
      }
    }

    return {
      discordId,
      username: data.discord_user.username,
      displayName: data.discord_user.display_name || data.discord_user.global_name,
      avatarUrl,
      status: data.discord_status,
      statusText,
      spotify,
      richPresence,
      activities,
      customStatus,
      platforms: {
        desktop: data.active_on_discord_desktop,
        web: data.active_on_discord_web,
        mobile: data.active_on_discord_mobile,
      },
      kv: data.kv,
      lastUpdated: Date.now(),
      source,
    };
  }

  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'online': return '🟢 Online';
      case 'idle': return '🌙 Idle';
      case 'dnd': return '🔴 Do Not Disturb';
      case 'offline': return '⚫ Offline';
      default: return '❓ Unknown';
    }
  }

  /**
   * Clear cache for a specific user or all users
   */
  clearCache(discordId?: string): void {
    if (discordId) {
      this.cache.delete(discordId);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Set cache TTL
   */
  setCacheTTL(ttlMs: number): void {
    this.cacheTTL = ttlMs;
  }

  /**
   * Get service status
   */
  getStatus(): {
    cacheSize: number;
    cacheTTL: number;
    wsConnected: boolean;
    wsEnabled: boolean;
    subscribedUsers: number;
  } {
    return {
      cacheSize: this.cache.size,
      cacheTTL: this.cacheTTL,
      wsConnected: this.wsConnected,
      wsEnabled: this.wsEnabled,
      subscribedUsers: this.subscribedUserIds.size,
    };
  }

  /**
   * Stop the service and clean up
   */
  stop(): void {
    this.disableWebSocket();
    this.cache.clear();
    this.subscribedUserIds.clear();
    this.removeAllListeners();
    console.log('[Lanyard Service] Stopped');
  }
}

// Singleton instance
let lanyardServiceInstance: LanyardService | null = null;

export function initLanyardService(): LanyardService {
  if (!lanyardServiceInstance) {
    lanyardServiceInstance = new LanyardService();
  }
  return lanyardServiceInstance;
}

export function getLanyardService(): LanyardService | null {
  return lanyardServiceInstance;
}
