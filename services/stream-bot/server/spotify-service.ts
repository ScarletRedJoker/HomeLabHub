import { SpotifyApi } from "@spotify/web-api-ts-sdk";

let connectionSettings: any;

async function getAccessToken() {
  // Check if we need to refresh the connection settings
  const needsRefresh = !connectionSettings || 
    !connectionSettings.settings?.expires_at || 
    new Date(connectionSettings.settings.expires_at).getTime() <= Date.now();
  
  if (needsRefresh) {
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY 
      ? 'repl ' + process.env.REPL_IDENTITY 
      : process.env.WEB_REPL_RENEWAL 
      ? 'depl ' + process.env.WEB_REPL_RENEWAL 
      : null;

    if (!xReplitToken) {
      throw new Error('X_REPLIT_TOKEN not found for repl/depl');
    }

    connectionSettings = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=spotify',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    ).then(res => res.json()).then(data => data.items?.[0]);
  }
  
  const refreshToken = connectionSettings?.settings?.oauth?.credentials?.refresh_token;
  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;
  const clientId = connectionSettings?.settings?.oauth?.credentials?.client_id;
  const expiresIn = connectionSettings.settings?.oauth?.credentials?.expires_in;
  
  if (!connectionSettings || (!accessToken || !clientId || !refreshToken)) {
    throw new Error('Spotify not connected');
  }
  
  return { accessToken, clientId, refreshToken, expiresIn };
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
async function getUncachableSpotifyClient() {
  const { accessToken, clientId, refreshToken, expiresIn } = await getAccessToken();

  const spotify = SpotifyApi.withAccessToken(clientId, {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresIn || 3600,
    refresh_token: refreshToken,
  });

  return spotify;
}

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

export class SpotifyService {
  /**
   * Get the user's currently playing track
   */
  async getNowPlaying(): Promise<NowPlayingData> {
    try {
      const spotify = await getUncachableSpotifyClient();
      const currentlyPlaying = await spotify.player.getCurrentlyPlayingTrack();
      
      // No content (204) means nothing is playing
      if (!currentlyPlaying || !currentlyPlaying.item) {
        return { isPlaying: false };
      }

      // Type guard for track
      if (currentlyPlaying.item.type !== 'track') {
        return { isPlaying: false };
      }

      const track = currentlyPlaying.item;
      const progressPercent = currentlyPlaying.progress_ms && track.duration_ms 
        ? (currentlyPlaying.progress_ms / track.duration_ms) * 100 
        : 0;

      return {
        isPlaying: currentlyPlaying.is_playing,
        title: track.name,
        artist: track.artists.map((a) => a.name).join(', '),
        album: track.album.name,
        albumImageUrl: track.album.images[0]?.url,
        songUrl: track.external_urls.spotify,
        progressMs: currentlyPlaying.progress_ms,
        durationMs: track.duration_ms,
        progressPercent,
      };
    } catch (error: any) {
      console.error('[Spotify] Error fetching now playing:', error.message);
      
      // If Spotify is not connected, return not playing
      if (error.message?.includes('not connected')) {
        return { isPlaying: false };
      }
      
      throw error;
    }
  }

  /**
   * Check if Spotify is connected and working
   */
  async isConnected(): Promise<boolean> {
    try {
      await getUncachableSpotifyClient();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get user's profile information
   */
  async getUserProfile() {
    try {
      const spotify = await getUncachableSpotifyClient();
      const profile = await spotify.currentUser.profile();
      return {
        displayName: profile.display_name,
        email: profile.email,
        id: profile.id,
        imageUrl: profile.images?.[0]?.url,
      };
    } catch (error: any) {
      console.error('[Spotify] Error fetching user profile:', error.message);
      throw error;
    }
  }
}

export const spotifyService = new SpotifyService();
