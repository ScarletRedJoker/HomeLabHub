import { NextRequest, NextResponse } from 'next/server';

const PLEX_URL = process.env.PLEX_URL || 'http://100.66.61.51:32400';
const PLEX_TOKEN = process.env.PLEX_TOKEN || '';
const JELLYFIN_URL = process.env.JELLYFIN_URL || '';
const JELLYFIN_API_KEY = process.env.JELLYFIN_API_KEY || '';

interface MediaSession {
  source: 'plex' | 'jellyfin';
  title: string;
  type: 'movie' | 'episode' | 'track' | 'unknown';
  showName?: string;
  seasonEpisode?: string;
  artistAlbum?: string;
  year?: number;
  state: 'playing' | 'paused';
  progress: number;
  duration: number;
  user: string;
  thumb?: string;
}

interface PresenceResponse {
  active: boolean;
  sessions: MediaSession[];
  timestamp: number;
}

async function fetchPlexSessions(): Promise<MediaSession[]> {
  if (!PLEX_TOKEN) return [];
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(`${PLEX_URL}/status/sessions?X-Plex-Token=${PLEX_TOKEN}`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/xml' }
    });
    clearTimeout(timeout);
    
    if (!response.ok) return [];
    
    const xml = await response.text();
    const sessions: MediaSession[] = [];
    
    const videoMatches = xml.match(/<Video[^>]*>/g) || [];
    const trackMatches = xml.match(/<Track[^>]*>/g) || [];
    
    for (const match of [...videoMatches, ...trackMatches]) {
      const title = match.match(/title="([^"]+)"/)?.[1] || 'Unknown';
      const rawType = match.match(/type="([^"]+)"/)?.[1] || '';
      const grandparentTitle = match.match(/grandparentTitle="([^"]+)"/)?.[1];
      const parentTitle = match.match(/parentTitle="([^"]+)"/)?.[1];
      const parentIndex = match.match(/parentIndex="([^"]+)"/)?.[1];
      const index = match.match(/index="([^"]+)"/)?.[1];
      const year = parseInt(match.match(/year="([^"]+)"/)?.[1] || '0');
      const viewOffset = parseInt(match.match(/viewOffset="([^"]+)"/)?.[1] || '0');
      const duration = parseInt(match.match(/duration="([^"]+)"/)?.[1] || '0');
      const thumb = match.match(/thumb="([^"]+)"/)?.[1];
      
      const playerMatch = xml.match(new RegExp(`<Player[^>]*title="([^"]+)"[^>]*state="([^"]+)"`));
      const user = playerMatch?.[1] || 'Unknown';
      const state = playerMatch?.[2] === 'paused' ? 'paused' : 'playing';
      
      let type: 'movie' | 'episode' | 'track' | 'unknown' = 'unknown';
      if (rawType === 'movie') type = 'movie';
      else if (rawType === 'episode') type = 'episode';
      else if (match.includes('<Track')) type = 'track';
      
      const session: MediaSession = {
        source: 'plex',
        title,
        type,
        year: year || undefined,
        state: state as 'playing' | 'paused',
        progress: viewOffset,
        duration,
        user,
        thumb: thumb ? `${PLEX_URL}${thumb}?X-Plex-Token=${PLEX_TOKEN}` : undefined
      };
      
      if (type === 'episode' && grandparentTitle) {
        session.showName = grandparentTitle;
        if (parentIndex && index) {
          session.seasonEpisode = `S${parentIndex.padStart(2, '0')}E${index.padStart(2, '0')}`;
        }
      } else if (type === 'track' && grandparentTitle) {
        session.artistAlbum = `${grandparentTitle}${parentTitle ? ` - ${parentTitle}` : ''}`;
      }
      
      sessions.push(session);
    }
    
    return sessions;
  } catch (error) {
    return [];
  }
}

async function fetchJellyfinSessions(): Promise<MediaSession[]> {
  if (!JELLYFIN_URL || !JELLYFIN_API_KEY) return [];
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(`${JELLYFIN_URL}/Sessions`, {
      signal: controller.signal,
      headers: { 'X-MediaBrowser-Token': JELLYFIN_API_KEY }
    });
    clearTimeout(timeout);
    
    if (!response.ok) return [];
    
    const data = await response.json();
    const sessions: MediaSession[] = [];
    
    for (const session of data) {
      if (!session.NowPlayingItem) continue;
      
      const item = session.NowPlayingItem;
      const playState = session.PlayState || {};
      
      let type: 'movie' | 'episode' | 'track' | 'unknown' = 'unknown';
      if (item.Type === 'Movie') type = 'movie';
      else if (item.Type === 'Episode') type = 'episode';
      else if (item.Type === 'Audio') type = 'track';
      
      const mediaSession: MediaSession = {
        source: 'jellyfin',
        title: item.Name,
        type,
        year: item.ProductionYear || undefined,
        state: playState.IsPaused ? 'paused' : 'playing',
        progress: playState.PositionTicks ? Math.floor(playState.PositionTicks / 10000) : 0,
        duration: item.RunTimeTicks ? Math.floor(item.RunTimeTicks / 10000) : 0,
        user: session.UserName || 'Unknown'
      };
      
      if (type === 'episode' && item.SeriesName) {
        mediaSession.showName = item.SeriesName;
        if (item.ParentIndexNumber && item.IndexNumber) {
          mediaSession.seasonEpisode = `S${String(item.ParentIndexNumber).padStart(2, '0')}E${String(item.IndexNumber).padStart(2, '0')}`;
        }
      } else if (type === 'track') {
        const artist = item.AlbumArtist || item.Artists?.[0] || '';
        const album = item.Album || '';
        if (artist || album) {
          mediaSession.artistAlbum = `${artist}${album ? ` - ${album}` : ''}`;
        }
      }
      
      if (item.Id) {
        mediaSession.thumb = `${JELLYFIN_URL}/Items/${item.Id}/Images/Primary?api_key=${JELLYFIN_API_KEY}`;
      }
      
      sessions.push(mediaSession);
    }
    
    return sessions;
  } catch (error) {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const expectedToken = process.env.PRESENCE_API_KEY || process.env.SERVICE_AUTH_TOKEN || '';
  
  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const [plexSessions, jellyfinSessions] = await Promise.all([
    fetchPlexSessions(),
    fetchJellyfinSessions()
  ]);
  
  const allSessions = [...plexSessions, ...jellyfinSessions];
  
  const response: PresenceResponse = {
    active: allSessions.length > 0,
    sessions: allSessions,
    timestamp: Date.now()
  };
  
  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
