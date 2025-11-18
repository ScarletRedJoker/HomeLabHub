import { SpotifyApi } from "@spotify/web-api-ts-sdk";

async function getAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
  
  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }
  
  try {
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    if (!tokenResponse.ok) {
      console.error('[Spotify] Token refresh failed:', tokenResponse.status);
      return null;
    }

    const data = await tokenResponse.json();
    return { 
      accessToken: data.access_token, 
      clientId, 
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: data.expires_in 
    };
  } catch (error) {
    console.error('[Spotify] Token refresh failed:', error);
    return null;
  }
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
// Returns null if Spotify is not configured.
async function getUncachableSpotifyClient() {
  const tokenData = await getAccessToken();
  if (!tokenData) {
    return null;
  }

  const { accessToken, clientId, refreshToken, expiresIn } = tokenData;

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
      
      // If Spotify is not configured, return not playing
      if (!spotify) {
        return { isPlaying: false };
      }
      
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
      return { isPlaying: false };
    }
  }

  /**
   * Check if Spotify is connected and working
   */
  async isConnected(): Promise<boolean> {
    const spotify = await getUncachableSpotifyClient();
    return spotify !== null;
  }

  /**
   * Get user's profile information
   */
  async getUserProfile() {
    try {
      const spotify = await getUncachableSpotifyClient();
      
      if (!spotify) {
        return null;
      }
      
      const profile = await spotify.currentUser.profile();
      return {
        displayName: profile.display_name,
        email: profile.email,
        id: profile.id,
        imageUrl: profile.images?.[0]?.url,
      };
    } catch (error: any) {
      console.error('[Spotify] Error fetching user profile:', error.message);
      return null;
    }
  }
}

export const spotifyService = new SpotifyService();
