/**
 * Presence Bridge Service
 * 
 * Aggregates presence data from multiple sources:
 * - Lanyard (Discord presence)
 * - Plex (media playing)
 * - Jellyfin (media playing)
 * - Spotify (via Lanyard or direct API)
 * 
 * Provides a unified WebSocket server for real-time presence updates
 * that other services (like the dashboard) can connect to.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { 
  LanyardService, 
  FormattedPresence, 
  getLanyardService, 
  initLanyardService 
} from './lanyard-service';
import { PlexService, getPlexService, PlexSession } from './plex-service';
import { JellyfinService, getJellyfinService, JellyfinSession } from './jellyfin-service';

export interface MediaPresence {
  source: 'plex' | 'jellyfin';
  title: string;
  type: 'movie' | 'episode' | 'track' | 'unknown';
  showName?: string;
  seasonEpisode?: string;
  artistAlbum?: string;
  year?: number;
  state: 'playing' | 'paused' | 'buffering';
  progress: number; // 0-100
  duration: number;
  elapsed: number;
  user: string;
  player: string;
  thumb?: string;
}

export interface UnifiedPresence {
  userId: string;
  discord?: FormattedPresence;
  media: MediaPresence[];
  spotifyOverride?: {
    isPlaying: boolean;
    song: string;
    artist: string;
    album: string;
    albumArtUrl?: string;
    progress: number;
    source: 'lanyard' | 'plex' | 'jellyfin';
  };
  primaryActivity?: {
    type: 'discord' | 'media' | 'spotify';
    description: string;
    icon?: string;
  };
  lastUpdated: number;
}

export interface PresenceBridgeClient {
  ws: WebSocket;
  subscribedUserIds: Set<string>;
  subscribeAll: boolean;
}

export interface PresenceBridgeConfig {
  port?: number;
  enabled?: boolean;
  pollingInterval?: number;
  userMappings?: Record<string, {
    discordId?: string;
    plexUsername?: string;
    jellyfinUsername?: string;
  }>;
}

export class PresenceBridgeService extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, PresenceBridgeClient> = new Map();
  private lanyardService: LanyardService | null = null;
  private plexService: PlexService | null = null;
  private jellyfinService: JellyfinService | null = null;
  
  private presenceCache: Map<string, UnifiedPresence> = new Map();
  private pollingTimer: NodeJS.Timeout | null = null;
  private pollingInterval = 30000; // 30 seconds
  
  private config: PresenceBridgeConfig;
  private isRunning = false;

  constructor(config: PresenceBridgeConfig = {}) {
    super();
    this.config = {
      port: config.port || 8765,
      enabled: config.enabled !== false,
      pollingInterval: config.pollingInterval || 30000,
      userMappings: config.userMappings || {},
    };
    this.pollingInterval = this.config.pollingInterval!;
    
    console.log('[Presence Bridge] Initialized');
  }

  /**
   * Start the presence bridge service
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      console.log('[Presence Bridge] Service is disabled');
      return;
    }

    if (this.isRunning) {
      console.log('[Presence Bridge] Already running');
      return;
    }

    console.log('[Presence Bridge] Starting presence aggregation service...');

    // Initialize services
    this.lanyardService = getLanyardService() || initLanyardService();
    this.plexService = getPlexService();
    this.jellyfinService = getJellyfinService();

    // Set up Lanyard WebSocket event handlers
    if (this.lanyardService) {
      this.lanyardService.on('presenceUpdate', (presence: FormattedPresence) => {
        this.handleLanyardUpdate(presence);
      });
    }

    // Start WebSocket server
    await this.startWebSocketServer();

    // Start polling for media presence
    this.startPolling();

    this.isRunning = true;
    console.log(`[Presence Bridge] ✅ Started on port ${this.config.port}`);
  }

  /**
   * Stop the presence bridge service
   */
  stop(): void {
    this.isRunning = false;

    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    this.clients.clear();
    this.presenceCache.clear();

    if (this.lanyardService) {
      this.lanyardService.removeAllListeners();
    }

    console.log('[Presence Bridge] Stopped');
  }

  private async startWebSocketServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ 
          port: this.config.port!,
          path: '/presence'
        });

        this.wss.on('connection', (ws: WebSocket) => {
          this.handleClientConnection(ws);
        });

        this.wss.on('error', (error) => {
          console.error('[Presence Bridge] WebSocket server error:', error);
        });

        this.wss.on('listening', () => {
          console.log(`[Presence Bridge] WebSocket server listening on port ${this.config.port}`);
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleClientConnection(ws: WebSocket): void {
    const client: PresenceBridgeClient = {
      ws,
      subscribedUserIds: new Set(),
      subscribeAll: false,
    };

    this.clients.set(ws, client);
    console.log(`[Presence Bridge] Client connected (${this.clients.size} total)`);

    // Send current presence state
    ws.send(JSON.stringify({
      type: 'init',
      data: {
        presences: Array.from(this.presenceCache.values()),
        timestamp: Date.now(),
      }
    }));

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleClientMessage(client, message);
      } catch (error) {
        console.error('[Presence Bridge] Failed to parse client message:', error);
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
      console.log(`[Presence Bridge] Client disconnected (${this.clients.size} remaining)`);
    });

    ws.on('error', (error) => {
      console.error('[Presence Bridge] Client error:', error);
    });
  }

  private handleClientMessage(client: PresenceBridgeClient, message: any): void {
    switch (message.type) {
      case 'subscribe':
        if (message.userId) {
          client.subscribedUserIds.add(message.userId);
          // Send current presence for this user if available
          const presence = this.presenceCache.get(message.userId);
          if (presence) {
            client.ws.send(JSON.stringify({
              type: 'presence',
              data: presence,
            }));
          }
        } else if (message.all) {
          client.subscribeAll = true;
        }
        break;

      case 'unsubscribe':
        if (message.userId) {
          client.subscribedUserIds.delete(message.userId);
        } else if (message.all) {
          client.subscribeAll = false;
        }
        break;

      case 'getPresence':
        if (message.userId) {
          this.fetchAndSendPresence(client, message.userId);
        }
        break;

      case 'ping':
        client.ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;
    }
  }

  private async fetchAndSendPresence(client: PresenceBridgeClient, userId: string): Promise<void> {
    const presence = await this.getUnifiedPresence(userId);
    if (presence) {
      client.ws.send(JSON.stringify({
        type: 'presence',
        data: presence,
      }));
    }
  }

  private startPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }

    this.pollingTimer = setInterval(() => {
      this.pollMediaPresence();
    }, this.pollingInterval);

    // Initial poll
    this.pollMediaPresence();
  }

  private async pollMediaPresence(): Promise<void> {
    const mediaPresences: MediaPresence[] = [];

    // Get Plex sessions
    if (this.plexService) {
      const plexData = this.plexService.getNowPlaying();
      if (plexData?.sessions) {
        for (const session of plexData.sessions) {
          mediaPresences.push(this.formatPlexSession(session));
        }
      }
    }

    // Get Jellyfin sessions
    if (this.jellyfinService) {
      const jellyfinData = this.jellyfinService.getNowPlaying();
      if (jellyfinData?.sessions) {
        for (const session of jellyfinData.sessions) {
          mediaPresences.push(this.formatJellyfinSession(session));
        }
      }
    }

    // Update presence for users with media sessions
    const usersWithMedia = new Set<string>();
    for (const media of mediaPresences) {
      const userId = this.findUserIdByMediaUsername(media.user, media.source);
      if (userId) {
        usersWithMedia.add(userId);
        await this.updateUserMediaPresence(userId, media);
      }
    }

    // Clear media for users who stopped playing
    for (const [userId, presence] of this.presenceCache.entries()) {
      if (!usersWithMedia.has(userId) && presence.media.length > 0) {
        presence.media = [];
        presence.lastUpdated = Date.now();
        this.updatePrimaryActivity(presence);
        this.broadcastPresenceUpdate(presence);
      }
    }
  }

  private formatPlexSession(session: PlexSession): MediaPresence {
    const duration = session.duration || 1;
    const elapsed = session.viewOffset || 0;
    const progress = Math.round((elapsed / duration) * 100);

    return {
      source: 'plex',
      title: session.title,
      type: session.type,
      showName: session.grandparentTitle,
      artistAlbum: session.type === 'track' 
        ? `${session.grandparentTitle || ''}${session.parentTitle ? ` - ${session.parentTitle}` : ''}`
        : undefined,
      year: session.year,
      state: session.state,
      progress,
      duration,
      elapsed,
      user: session.user,
      player: session.player,
    };
  }

  private formatJellyfinSession(session: JellyfinSession): MediaPresence {
    const duration = session.duration || 1;
    const elapsed = session.position || 0;
    const progress = Math.round((elapsed / duration) * 100);

    return {
      source: 'jellyfin',
      title: session.title,
      type: session.type === 'Movie' ? 'movie' 
        : session.type === 'Episode' ? 'episode' 
        : session.type === 'Audio' ? 'track' 
        : 'unknown',
      showName: session.seriesName,
      artistAlbum: session.type === 'Audio' 
        ? `${session.artistName || ''}${session.albumName ? ` - ${session.albumName}` : ''}`
        : undefined,
      year: session.year,
      state: session.state,
      progress,
      duration,
      elapsed,
      user: session.user,
      player: session.player,
    };
  }

  private findUserIdByMediaUsername(username: string, source: 'plex' | 'jellyfin'): string | null {
    for (const [userId, mapping] of Object.entries(this.config.userMappings || {})) {
      if (source === 'plex' && mapping.plexUsername?.toLowerCase() === username.toLowerCase()) {
        return userId;
      }
      if (source === 'jellyfin' && mapping.jellyfinUsername?.toLowerCase() === username.toLowerCase()) {
        return userId;
      }
    }
    // Fallback: use username as userId
    return username;
  }

  private async updateUserMediaPresence(userId: string, media: MediaPresence): Promise<void> {
    let presence = this.presenceCache.get(userId);
    
    if (!presence) {
      presence = {
        userId,
        media: [],
        lastUpdated: Date.now(),
      };
      this.presenceCache.set(userId, presence);
    }

    // Update or add media presence
    const existingIndex = presence.media.findIndex(
      m => m.source === media.source && m.user === media.user
    );

    if (existingIndex >= 0) {
      presence.media[existingIndex] = media;
    } else {
      presence.media.push(media);
    }

    presence.lastUpdated = Date.now();
    this.updatePrimaryActivity(presence);
    this.broadcastPresenceUpdate(presence);
  }

  private handleLanyardUpdate(discordPresence: FormattedPresence): void {
    const userId = discordPresence.discordId;
    let presence = this.presenceCache.get(userId);

    if (!presence) {
      presence = {
        userId,
        media: [],
        lastUpdated: Date.now(),
      };
      this.presenceCache.set(userId, presence);
    }

    presence.discord = discordPresence;
    presence.lastUpdated = Date.now();

    // Check for Spotify from Lanyard
    if (discordPresence.spotify?.isListening) {
      presence.spotifyOverride = {
        isPlaying: true,
        song: discordPresence.spotify.song || '',
        artist: discordPresence.spotify.artist || '',
        album: discordPresence.spotify.album || '',
        albumArtUrl: discordPresence.spotify.albumArtUrl,
        progress: discordPresence.spotify.progress || 0,
        source: 'lanyard',
      };
    } else {
      presence.spotifyOverride = undefined;
    }

    this.updatePrimaryActivity(presence);
    this.broadcastPresenceUpdate(presence);
    this.emit('presenceUpdate', presence);
  }

  private updatePrimaryActivity(presence: UnifiedPresence): void {
    // Priority: Spotify > Media > Discord activity
    if (presence.spotifyOverride?.isPlaying) {
      presence.primaryActivity = {
        type: 'spotify',
        description: `${presence.spotifyOverride.song} - ${presence.spotifyOverride.artist}`,
        icon: '🎵',
      };
    } else if (presence.media.length > 0) {
      const activeMedia = presence.media.find(m => m.state === 'playing') || presence.media[0];
      const icon = activeMedia.type === 'movie' ? '🎬' 
        : activeMedia.type === 'episode' ? '📺'
        : activeMedia.type === 'track' ? '🎵'
        : '▶️';
      
      let description = activeMedia.title;
      if (activeMedia.showName) {
        description = `${activeMedia.showName} - ${activeMedia.title}`;
      } else if (activeMedia.artistAlbum) {
        description = `${activeMedia.title} (${activeMedia.artistAlbum})`;
      }

      presence.primaryActivity = {
        type: 'media',
        description,
        icon,
      };
    } else if (presence.discord?.richPresence.length) {
      const mainActivity = presence.discord.richPresence[0];
      presence.primaryActivity = {
        type: 'discord',
        description: `${mainActivity.name}${mainActivity.details ? ` - ${mainActivity.details}` : ''}`,
        icon: '🎮',
      };
    } else if (presence.discord) {
      presence.primaryActivity = {
        type: 'discord',
        description: presence.discord.statusText,
      };
    } else {
      presence.primaryActivity = undefined;
    }
  }

  private broadcastPresenceUpdate(presence: UnifiedPresence): void {
    const message = JSON.stringify({
      type: 'presence',
      data: presence,
    });

    for (const [ws, client] of this.clients.entries()) {
      if (client.subscribeAll || client.subscribedUserIds.has(presence.userId)) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      }
    }
  }

  /**
   * Get unified presence for a user
   */
  async getUnifiedPresence(userId: string): Promise<UnifiedPresence | null> {
    // Check cache first
    let presence = this.presenceCache.get(userId);

    // Try to find Discord ID from mappings
    const mapping = this.config.userMappings?.[userId];
    const discordId = mapping?.discordId || userId;

    // Fetch Discord presence if not cached or stale
    if (this.lanyardService && (!presence?.discord || Date.now() - presence.lastUpdated > 30000)) {
      const discordPresence = await this.lanyardService.getPresence(discordId);
      
      if (!presence) {
        presence = {
          userId,
          media: [],
          lastUpdated: Date.now(),
        };
        this.presenceCache.set(userId, presence);
      }

      if (discordPresence) {
        presence.discord = discordPresence;
        
        if (discordPresence.spotify?.isListening) {
          presence.spotifyOverride = {
            isPlaying: true,
            song: discordPresence.spotify.song || '',
            artist: discordPresence.spotify.artist || '',
            album: discordPresence.spotify.album || '',
            albumArtUrl: discordPresence.spotify.albumArtUrl,
            progress: discordPresence.spotify.progress || 0,
            source: 'lanyard',
          };
        }

        this.updatePrimaryActivity(presence);
      }
    }

    return presence || null;
  }

  /**
   * Get all active presences
   */
  getAllPresences(): UnifiedPresence[] {
    return Array.from(this.presenceCache.values());
  }

  /**
   * Set user mappings
   */
  setUserMappings(mappings: PresenceBridgeConfig['userMappings']): void {
    this.config.userMappings = mappings;
  }

  /**
   * Add a user mapping
   */
  addUserMapping(userId: string, mapping: {
    discordId?: string;
    plexUsername?: string;
    jellyfinUsername?: string;
  }): void {
    if (!this.config.userMappings) {
      this.config.userMappings = {};
    }
    this.config.userMappings[userId] = mapping;
  }

  /**
   * Get service status
   */
  getStatus(): {
    running: boolean;
    clients: number;
    cachedPresences: number;
    lanyardConnected: boolean;
    plexConnected: boolean;
    jellyfinConnected: boolean;
  } {
    return {
      running: this.isRunning,
      clients: this.clients.size,
      cachedPresences: this.presenceCache.size,
      lanyardConnected: this.lanyardService?.getStatus().wsConnected || false,
      plexConnected: this.plexService?.getStatus().healthy || false,
      jellyfinConnected: this.jellyfinService?.getStatus().healthy || false,
    };
  }
}

// Singleton instance
let presenceBridgeInstance: PresenceBridgeService | null = null;

export function initPresenceBridge(config?: PresenceBridgeConfig): PresenceBridgeService {
  if (presenceBridgeInstance) {
    presenceBridgeInstance.stop();
  }
  presenceBridgeInstance = new PresenceBridgeService(config);
  return presenceBridgeInstance;
}

export function getPresenceBridge(): PresenceBridgeService | null {
  return presenceBridgeInstance;
}
