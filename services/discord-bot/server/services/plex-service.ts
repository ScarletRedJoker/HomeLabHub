/**
 * Plex Now Playing Service
 * 
 * Polls the Plex server for currently playing media sessions
 * and provides formatted data for Discord presence display.
 * 
 * Features:
 * - XML parsing for Plex API responses
 * - Rate-limited polling (30-60 seconds)
 * - Graceful handling when nothing is playing
 * - Techy/hacker aesthetic formatting
 */

export interface PlexSession {
  title: string;
  type: 'movie' | 'episode' | 'track' | 'unknown';
  grandparentTitle?: string;
  parentTitle?: string;
  year?: number;
  duration: number;
  viewOffset: number;
  player: string;
  user: string;
  state: 'playing' | 'paused' | 'buffering';
}

export interface PlexNowPlaying {
  sessions: PlexSession[];
  timestamp: number;
}

export interface PlexMediaItem {
  ratingKey: string;
  key: string;
  title: string;
  type: 'movie' | 'show' | 'season' | 'episode' | 'artist' | 'album' | 'track';
  grandparentTitle?: string;
  parentTitle?: string;
  year?: number;
  duration?: number;
  thumb?: string;
  addedAt?: number;
  artist?: string;
  album?: string;
}

export interface PlexSearchResult {
  items: PlexMediaItem[];
  query: string;
}

const HACKER_PREFIXES = {
  movie: [
    'Decrypting',
    'Neural Stream',
    'Data Feed',
    'Cipher Protocol',
    'Matrix Decode'
  ],
  episode: [
    'Streaming Protocol',
    'Neural Feed',
    'Data Pipeline',
    'Quantum Stream',
    'Encrypted Channel'
  ],
  track: [
    'Audio Matrix',
    'Sound Wave',
    'Frequency Lock',
    'Signal Decode',
    'Harmonic Feed'
  ],
  unknown: [
    'Processing',
    'Data Stream',
    'Signal Active'
  ]
};

export class PlexService {
  private plexUrl: string;
  private plexToken: string;
  private lastData: PlexNowPlaying | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private enabled = false;
  private pollIntervalMs = 45000; // 45 seconds
  
  private consecutiveFailures = 0;
  private maxBackoffMs = 300000; // 5 minutes max
  private lastErrorLogTime = 0;
  private errorLogIntervalMs = 300000;

  constructor() {
    const LOCAL_SERVER_IP = process.env.LOCAL_TAILSCALE_IP || '100.66.61.51';
    this.plexUrl = process.env.PLEX_URL || `http://${LOCAL_SERVER_IP}:32400`;
    this.plexToken = process.env.PLEX_TOKEN || '';
    
    if (!process.env.PLEX_URL && !process.env.LOCAL_TAILSCALE_IP) {
      console.log(`[Plex Service] Using default Plex URL: ${this.plexUrl}`);
      console.log('[Plex Service] Set PLEX_URL or LOCAL_TAILSCALE_IP env var to override');
    }
  }

  isConfigured(): boolean {
    return !!this.plexToken;
  }

  async start(): Promise<void> {
    if (!this.isConfigured()) {
      console.log('[Plex Service] PLEX_TOKEN not configured - Plex presence disabled');
      return;
    }

    console.log('[Plex Service] Starting Plex polling service...');
    console.log(`[Plex Service] Plex URL: ${this.plexUrl}`);
    this.enabled = true;

    await this.fetchNowPlaying();
    this.schedulePoll();

    console.log('[Plex Service] ✅ Plex service started');
  }

  stop(): void {
    this.enabled = false;
    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
      this.pollInterval = null;
    }
    console.log('[Plex Service] Plex service stopped');
  }

  private schedulePoll(): void {
    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
    }

    const backoffMs = Math.min(
      this.pollIntervalMs * Math.pow(1.5, this.consecutiveFailures),
      this.maxBackoffMs
    );

    const jitter = Math.random() * 5000;
    const delay = backoffMs + jitter;

    this.pollInterval = setTimeout(async () => {
      if (this.enabled) {
        await this.fetchNowPlaying();
        this.schedulePoll();
      }
    }, delay);
  }

  private async fetchNowPlaying(): Promise<void> {
    if (!this.enabled || !this.isConfigured()) {
      return;
    }

    try {
      const response = await fetch(`${this.plexUrl}/status/sessions`, {
        headers: {
          'X-Plex-Token': this.plexToken,
          'Accept': 'application/xml'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const xmlText = await response.text();
      const sessions = this.parseSessionsXml(xmlText);

      this.lastData = {
        sessions,
        timestamp: Date.now()
      };

      if (this.consecutiveFailures > 0) {
        console.log('[Plex Service] ✅ Plex connection restored');
      }
      this.consecutiveFailures = 0;

    } catch (error: any) {
      this.consecutiveFailures++;

      const now = Date.now();
      const shouldLog = (now - this.lastErrorLogTime) >= this.errorLogIntervalMs;

      if (shouldLog || this.consecutiveFailures === 1) {
        const nextRetrySeconds = Math.round(
          Math.min(this.pollIntervalMs * Math.pow(1.5, this.consecutiveFailures), this.maxBackoffMs) / 1000
        );
        console.warn(
          `[Plex Service] Plex unreachable (attempt ${this.consecutiveFailures}). ` +
          `Next retry in ~${nextRetrySeconds}s. Error: ${error.message}`
        );
        this.lastErrorLogTime = now;
      }

      this.lastData = null;
    }
  }

  private parseSessionsXml(xmlText: string): PlexSession[] {
    const sessions: PlexSession[] = [];

    const videoMatches = xmlText.matchAll(/<Video([^>]*)(?:\/>|>[\s\S]*?<\/Video>)/g);
    const trackMatches = xmlText.matchAll(/<Track([^>]*)(?:\/>|>[\s\S]*?<\/Track>)/g);

    for (const match of videoMatches) {
      const session = this.parseMediaElement(match[0], 'video');
      if (session) sessions.push(session);
    }

    for (const match of trackMatches) {
      const session = this.parseMediaElement(match[0], 'track');
      if (session) sessions.push(session);
    }

    return sessions;
  }

  private parseMediaElement(element: string, mediaType: 'video' | 'track'): PlexSession | null {
    const getAttribute = (name: string): string | undefined => {
      const match = element.match(new RegExp(`${name}="([^"]*)"`));
      return match ? this.decodeXmlEntities(match[1]) : undefined;
    };

    const getPlayerAttribute = (name: string): string | undefined => {
      const playerMatch = element.match(/<Player([^>]*)>/);
      if (playerMatch) {
        const attrMatch = playerMatch[1].match(new RegExp(`${name}="([^"]*)"`));
        return attrMatch ? this.decodeXmlEntities(attrMatch[1]) : undefined;
      }
      return undefined;
    };

    const getUserAttribute = (name: string): string | undefined => {
      const userMatch = element.match(/<User([^>]*)>/);
      if (userMatch) {
        const attrMatch = userMatch[1].match(new RegExp(`${name}="([^"]*)"`));
        return attrMatch ? this.decodeXmlEntities(attrMatch[1]) : undefined;
      }
      return undefined;
    };

    const title = getAttribute('title');
    if (!title) return null;

    const typeAttr = getAttribute('type');
    let type: PlexSession['type'] = 'unknown';
    
    if (mediaType === 'track') {
      type = 'track';
    } else if (typeAttr === 'movie') {
      type = 'movie';
    } else if (typeAttr === 'episode') {
      type = 'episode';
    }

    const playerState = getPlayerAttribute('state') || 'playing';
    let state: PlexSession['state'] = 'playing';
    if (playerState === 'paused') state = 'paused';
    else if (playerState === 'buffering') state = 'buffering';

    return {
      title,
      type,
      grandparentTitle: getAttribute('grandparentTitle'),
      parentTitle: getAttribute('parentTitle'),
      year: parseInt(getAttribute('year') || '0') || undefined,
      duration: parseInt(getAttribute('duration') || '0'),
      viewOffset: parseInt(getAttribute('viewOffset') || '0'),
      player: getPlayerAttribute('title') || getPlayerAttribute('product') || 'Unknown',
      user: getUserAttribute('title') || 'Unknown',
      state
    };
  }

  private decodeXmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  getNowPlaying(): PlexNowPlaying | null {
    return this.lastData;
  }

  hasActiveSessions(): boolean {
    return this.lastData !== null && this.lastData.sessions.length > 0;
  }

  getFormattedActivities(): Array<{ name: string; type: 'watching' | 'playing' | 'custom' }> {
    const activities: Array<{ name: string; type: 'watching' | 'playing' | 'custom' }> = [];

    if (!this.lastData || this.lastData.sessions.length === 0) {
      return activities;
    }

    for (const session of this.lastData.sessions) {
      const hackerActivities = this.formatSessionWithHackerAesthetic(session);
      activities.push(...hackerActivities);
    }

    return activities;
  }

  private formatSessionWithHackerAesthetic(session: PlexSession): Array<{ name: string; type: 'watching' | 'playing' | 'custom' }> {
    const activities: Array<{ name: string; type: 'watching' | 'playing' | 'custom' }> = [];
    const prefixes = HACKER_PREFIXES[session.type] || HACKER_PREFIXES.unknown;
    const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    
    const progress = session.duration > 0 
      ? Math.round((session.viewOffset / session.duration) * 100) 
      : 0;
    
    const stateIcon = session.state === 'paused' ? '⏸️' : session.state === 'buffering' ? '⏳' : '▶️';

    if (session.type === 'movie') {
      const yearStr = session.year ? ` (${session.year})` : '';
      activities.push({
        name: `${stateIcon} ${randomPrefix}: ${session.title}${yearStr}`,
        type: 'watching'
      });
      
      activities.push({
        name: `Runtime: ${progress}% | ${session.player}`,
        type: 'custom'
      });
    } 
    else if (session.type === 'episode') {
      const showName = session.grandparentTitle || 'Unknown Show';
      const episodeInfo = session.parentTitle 
        ? `${session.parentTitle} - ${session.title}`
        : session.title;
      
      activities.push({
        name: `${stateIcon} ${randomPrefix}: ${showName}`,
        type: 'watching'
      });
      
      activities.push({
        name: `Neural Feed: ${episodeInfo}`,
        type: 'custom'
      });
      
      activities.push({
        name: `Buffer: ${progress}% | ${session.user}`,
        type: 'custom'
      });
    }
    else if (session.type === 'track') {
      const artistName = session.grandparentTitle || 'Unknown Artist';
      
      activities.push({
        name: `${stateIcon} ${randomPrefix}: ${artistName}`,
        type: 'playing'
      });
      
      activities.push({
        name: `Track: ${session.title}`,
        type: 'custom'
      });
    }
    else {
      activities.push({
        name: `${stateIcon} ${randomPrefix}: ${session.title}`,
        type: 'watching'
      });
    }

    return activities;
  }

  getStatus(): { configured: boolean; healthy: boolean; activeSessions: number; consecutiveFailures: number } {
    return {
      configured: this.isConfigured(),
      healthy: this.consecutiveFailures === 0,
      activeSessions: this.lastData?.sessions.length || 0,
      consecutiveFailures: this.consecutiveFailures
    };
  }

  async search(query: string, type?: 'movie' | 'show' | 'artist' | 'album' | 'track'): Promise<PlexSearchResult> {
    if (!this.isConfigured()) {
      return { items: [], query };
    }

    try {
      const typeFilter = type ? `&type=${this.getSearchType(type)}` : '';
      const response = await fetch(
        `${this.plexUrl}/search?query=${encodeURIComponent(query)}${typeFilter}`,
        {
          headers: {
            'X-Plex-Token': this.plexToken,
            'Accept': 'application/xml'
          },
          signal: AbortSignal.timeout(15000)
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const xmlText = await response.text();
      const items = this.parseSearchResultsXml(xmlText);

      return { items, query };
    } catch (error: any) {
      console.error('[Plex Service] Search error:', error.message);
      return { items: [], query };
    }
  }

  async getRecentlyAdded(limit: number = 10): Promise<PlexMediaItem[]> {
    if (!this.isConfigured()) {
      return [];
    }

    try {
      const response = await fetch(
        `${this.plexUrl}/library/recentlyAdded?X-Plex-Container-Start=0&X-Plex-Container-Size=${limit}`,
        {
          headers: {
            'X-Plex-Token': this.plexToken,
            'Accept': 'application/xml'
          },
          signal: AbortSignal.timeout(15000)
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const xmlText = await response.text();
      return this.parseSearchResultsXml(xmlText);
    } catch (error: any) {
      console.error('[Plex Service] Recently added error:', error.message);
      return [];
    }
  }

  getStreamUrl(ratingKey: string): string | null {
    if (!this.isConfigured()) {
      return null;
    }
    return `${this.plexUrl}/library/metadata/${ratingKey}/file?X-Plex-Token=${this.plexToken}`;
  }

  getTranscodeUrl(ratingKey: string): string | null {
    if (!this.isConfigured()) {
      return null;
    }
    return `${this.plexUrl}/audio/:/transcode/universal/start.mp3?path=/library/metadata/${ratingKey}&mediaIndex=0&partIndex=0&protocol=http&X-Plex-Token=${this.plexToken}`;
  }

  private getSearchType(type: 'movie' | 'show' | 'artist' | 'album' | 'track'): number {
    const typeMap: Record<string, number> = {
      movie: 1,
      show: 2,
      artist: 8,
      album: 9,
      track: 10
    };
    return typeMap[type] || 0;
  }

  private parseSearchResultsXml(xmlText: string): PlexMediaItem[] {
    const items: PlexMediaItem[] = [];
    
    const mediaPatterns = [
      { regex: /<Video([^>]*)(?:\/>|>[\s\S]*?<\/Video>)/g, defaultType: 'movie' as const },
      { regex: /<Directory([^>]*type="show"[^>]*)(?:\/>|>[\s\S]*?<\/Directory>)/g, defaultType: 'show' as const },
      { regex: /<Directory([^>]*type="artist"[^>]*)(?:\/>|>[\s\S]*?<\/Directory>)/g, defaultType: 'artist' as const },
      { regex: /<Directory([^>]*type="album"[^>]*)(?:\/>|>[\s\S]*?<\/Directory>)/g, defaultType: 'album' as const },
      { regex: /<Track([^>]*)(?:\/>|>[\s\S]*?<\/Track>)/g, defaultType: 'track' as const }
    ];

    for (const { regex, defaultType } of mediaPatterns) {
      const matches = xmlText.matchAll(regex);
      for (const match of matches) {
        const item = this.parseMediaItemElement(match[0], defaultType);
        if (item) items.push(item);
      }
    }

    return items;
  }

  private parseMediaItemElement(element: string, defaultType: PlexMediaItem['type']): PlexMediaItem | null {
    const getAttribute = (name: string): string | undefined => {
      const match = element.match(new RegExp(`${name}="([^"]*)"`));
      return match ? this.decodeXmlEntities(match[1]) : undefined;
    };

    const ratingKey = getAttribute('ratingKey');
    const title = getAttribute('title');
    if (!ratingKey || !title) return null;

    const typeAttr = getAttribute('type');
    let type: PlexMediaItem['type'] = defaultType;
    if (typeAttr === 'movie') type = 'movie';
    else if (typeAttr === 'show') type = 'show';
    else if (typeAttr === 'season') type = 'season';
    else if (typeAttr === 'episode') type = 'episode';
    else if (typeAttr === 'artist') type = 'artist';
    else if (typeAttr === 'album') type = 'album';
    else if (typeAttr === 'track') type = 'track';

    return {
      ratingKey,
      key: getAttribute('key') || '',
      title,
      type,
      grandparentTitle: getAttribute('grandparentTitle'),
      parentTitle: getAttribute('parentTitle'),
      year: parseInt(getAttribute('year') || '0') || undefined,
      duration: parseInt(getAttribute('duration') || '0') || undefined,
      thumb: getAttribute('thumb'),
      addedAt: parseInt(getAttribute('addedAt') || '0') || undefined,
      artist: getAttribute('grandparentTitle'),
      album: getAttribute('parentTitle')
    };
  }
}

let plexServiceInstance: PlexService | null = null;

export function initPlexService(): PlexService {
  if (plexServiceInstance) {
    plexServiceInstance.stop();
  }
  plexServiceInstance = new PlexService();
  return plexServiceInstance;
}

export function getPlexService(): PlexService | null {
  return plexServiceInstance;
}
