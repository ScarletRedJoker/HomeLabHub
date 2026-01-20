import { NextRequest, NextResponse } from 'next/server';

const LANYARD_API_BASE = 'https://api.lanyard.rest/v1/users';
const DISCORD_BOT_URL = process.env.DISCORD_BOT_URL || 'http://localhost:3001';

interface LanyardResponse {
  success: boolean;
  data?: {
    spotify: {
      track_id: string;
      timestamps: { start: number; end: number };
      album: string;
      album_art_url: string;
      artist: string;
      song: string;
    } | null;
    listening_to_spotify: boolean;
    discord_user: {
      id: string;
      username: string;
      avatar: string;
      discriminator: string;
      display_name: string | null;
      global_name: string | null;
    };
    discord_status: 'online' | 'idle' | 'dnd' | 'offline';
    activities: Array<{
      id: string;
      name: string;
      type: number;
      state?: string;
      details?: string;
      timestamps?: { start?: number; end?: number };
      assets?: {
        large_image?: string;
        large_text?: string;
        small_image?: string;
        small_text?: string;
      };
      application_id?: string;
      emoji?: { name: string; id?: string; animated?: boolean };
    }>;
    active_on_discord_web: boolean;
    active_on_discord_desktop: boolean;
    active_on_discord_mobile: boolean;
    kv?: Record<string, string>;
  };
  error?: { code: string; message: string };
}

interface FormattedPresence {
  discordId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  statusText: string;
  spotify: {
    isListening: boolean;
    song?: string;
    artist?: string;
    album?: string;
    albumArtUrl?: string;
    progress?: number;
    trackId?: string;
  } | null;
  activities: Array<{
    name: string;
    type: string;
    details?: string;
    state?: string;
  }>;
  platforms: {
    desktop: boolean;
    web: boolean;
    mobile: boolean;
  };
  lastUpdated: number;
}

const ACTIVITY_TYPE_NAMES: Record<number, string> = {
  0: 'Playing',
  1: 'Streaming',
  2: 'Listening to',
  3: 'Watching',
  4: 'Custom Status',
  5: 'Competing in',
};

function getStatusEmoji(status: string): string {
  switch (status) {
    case 'online': return '🟢 Online';
    case 'idle': return '🌙 Idle';
    case 'dnd': return '🔴 Do Not Disturb';
    case 'offline': return '⚫ Offline';
    default: return '❓ Unknown';
  }
}

function formatPresence(discordId: string, data: LanyardResponse['data']): FormattedPresence | null {
  if (!data) return null;

  const avatarUrl = data.discord_user.avatar
    ? `https://cdn.discordapp.com/avatars/${discordId}/${data.discord_user.avatar}.${data.discord_user.avatar.startsWith('a_') ? 'gif' : 'png'}`
    : null;

  let spotify: FormattedPresence['spotify'] = null;
  if (data.listening_to_spotify && data.spotify) {
    const now = Date.now();
    const elapsed = now - data.spotify.timestamps.start;
    const duration = data.spotify.timestamps.end - data.spotify.timestamps.start;
    const progress = Math.min(100, Math.max(0, (elapsed / duration) * 100));

    spotify = {
      isListening: true,
      song: data.spotify.song,
      artist: data.spotify.artist,
      album: data.spotify.album,
      albumArtUrl: data.spotify.album_art_url,
      progress: Math.round(progress),
      trackId: data.spotify.track_id,
    };
  }

  const activities = data.activities
    .filter(a => a.type !== 2)
    .map(a => ({
      name: a.name,
      type: ACTIVITY_TYPE_NAMES[a.type] || 'Unknown',
      details: a.details,
      state: a.state,
    }));

  let statusText = getStatusEmoji(data.discord_status);
  if (data.listening_to_spotify && data.spotify) {
    statusText = `🎵 Listening to ${data.spotify.song} by ${data.spotify.artist}`;
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
    activities,
    platforms: {
      desktop: data.active_on_discord_desktop,
      web: data.active_on_discord_web,
      mobile: data.active_on_discord_mobile,
    },
    lastUpdated: Date.now(),
  };
}

async function fetchLanyardPresence(discordId: string): Promise<FormattedPresence | null> {
  if (!discordId || !/^\d{17,19}$/.test(discordId)) {
    return null;
  }

  try {
    const response = await fetch(`${LANYARD_API_BASE}/${discordId}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 30 },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const result: LanyardResponse = await response.json();
    if (!result.success || !result.data) {
      return null;
    }

    return formatPresence(discordId, result.data);
  } catch (error) {
    console.error(`[Presence API] Failed to fetch Lanyard data for ${discordId}:`, error);
    return null;
  }
}

async function fetchBatchPresence(discordIds: string[]): Promise<Map<string, FormattedPresence | null>> {
  const results = new Map<string, FormattedPresence | null>();
  const validIds = discordIds.filter(id => /^\d{17,19}$/.test(id)).slice(0, 10);

  if (validIds.length === 0) {
    return results;
  }

  // Fetch each ID individually (Lanyard batch API can be inconsistent)
  const promises = validIds.map(async (id) => {
    const presence = await fetchLanyardPresence(id);
    results.set(id, presence);
  });

  await Promise.all(promises);
  return results;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const userIds = searchParams.get('userIds');

  // Handle batch request
  if (userIds) {
    const ids = userIds.split(',').map(id => id.trim()).filter(Boolean);
    const presences = await fetchBatchPresence(ids);
    
    return NextResponse.json({
      success: true,
      presences: Object.fromEntries(presences),
      timestamp: Date.now(),
      usage: {
        note: 'For Lanyard to work, users must join: https://discord.gg/lanyard',
        documentation: 'https://github.com/Phineas/lanyard',
      }
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }

  // Handle single user request
  if (!userId) {
    return NextResponse.json({
      success: false,
      error: 'Missing userId or userIds parameter',
      usage: {
        single: 'GET /api/presence?userId=123456789012345678',
        batch: 'GET /api/presence?userIds=123,456,789',
        requirements: [
          'User must be in Lanyard Discord server: https://discord.gg/lanyard',
          'No API key needed - Lanyard is a free public service',
          'Discord ID is automatically tracked once user joins',
        ],
      }
    }, { status: 400 });
  }

  // Validate Discord ID format
  if (!/^\d{17,19}$/.test(userId)) {
    return NextResponse.json({
      success: false,
      error: 'Invalid Discord ID format. Must be 17-19 digits.',
      provided: userId,
    }, { status: 400 });
  }

  const presence = await fetchLanyardPresence(userId);

  if (!presence) {
    return NextResponse.json({
      success: false,
      error: 'User not found in Lanyard',
      discordId: userId,
      help: {
        message: 'To enable presence tracking, the user must:',
        steps: [
          '1. Join the Lanyard Discord server: https://discord.gg/lanyard',
          '2. Wait a few minutes for their ID to be registered',
          '3. Their presence will then be automatically tracked',
        ],
        documentation: 'https://github.com/Phineas/lanyard',
      }
    }, { 
      status: 404,
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }

  return NextResponse.json({
    success: true,
    presence,
    timestamp: Date.now(),
  }, {
    headers: {
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      'Access-Control-Allow-Origin': '*',
    }
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
