import { Router } from "express";
import axios, { AxiosError } from "axios";
import querystring from "querystring";
import { requireAuth } from "./auth/middleware";
import { storage } from "./storage";
import { getEnv } from "./env";
import { 
  generateState, 
  generateCodeVerifier, 
  generateCodeChallenge,
  encryptToken,
  decryptToken 
} from "./crypto-utils";
import { oauthStorageDB } from "./oauth-storage-db";

const router = Router();

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

const SPOTIFY_SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-read-recently-played',
  'user-read-email',
  'user-read-private',
].join(' ');

/**
 * Retry helper with exponential backoff for 5xx errors
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      const status = error.response?.status;
      const isRetryable = 
        !status || 
        (status >= 500 && status < 600);
      
      if (!isRetryable || attempt === maxRetries - 1) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`[Spotify OAuth] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Validate token response has required fields
 */
function validateTokenResponse(data: any): void {
  if (!data.access_token) {
    throw new Error('Token response missing access_token');
  }
  if (!data.expires_in) {
    throw new Error('Token response missing expires_in');
  }
}

/**
 * Step 1: Initiate Spotify OAuth flow
 * GET /auth/spotify
 */
router.get('/spotify', requireAuth, async (req, res) => {
  try {
    const clientId = getEnv('SPOTIFY_CLIENT_ID');
    const redirectUri = getEnv('SPOTIFY_REDIRECT_URI');

    if (!clientId) {
      console.error('[Spotify OAuth] SPOTIFY_CLIENT_ID not configured');
      return res.status(500).json({ 
        error: 'Spotify OAuth not configured',
        message: 'Please set SPOTIFY_CLIENT_ID environment variable. Contact administrator for setup instructions.'
      });
    }

    if (!redirectUri) {
      console.error('[Spotify OAuth] SPOTIFY_REDIRECT_URI not configured');
      return res.status(500).json({ 
        error: 'Spotify OAuth not configured',
        message: 'Please set SPOTIFY_REDIRECT_URI environment variable. Contact administrator for setup instructions.'
      });
    }

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    try {
      await oauthStorageDB.set(state, {
        userId: req.user!.id,
        platform: 'spotify',
        codeVerifier,
        ipAddress: req.ip,
      });
    } catch (dbError: any) {
      console.error('[Spotify OAuth] Database error storing OAuth session:', dbError.message);
      return res.status(500).json({ 
        error: 'Database error',
        message: 'Unable to initialize OAuth session. Please try again later.'
      });
    }

    const authUrl = SPOTIFY_AUTH_URL + '?' + querystring.stringify({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      state: state,
      scope: SPOTIFY_SCOPES,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
    });

    res.redirect(authUrl);
  } catch (error: any) {
    console.error('[Spotify OAuth] Initiation error:', error.message, error.stack);
    res.status(500).json({ 
      error: 'Failed to initiate Spotify authorization',
      message: 'An unexpected error occurred. Please try again later.'
    });
  }
});

/**
 * Step 2: Handle Spotify OAuth callback
 * GET /auth/spotify/callback
 */
router.get('/spotify/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    console.error('[Spotify OAuth] Authorization error:', oauthError);
    
    let errorMessage = 'spotify_auth_failed';
    if (oauthError === 'access_denied') {
      errorMessage = 'spotify_access_denied';
      console.log('[Spotify OAuth] User denied required permissions');
    }
    
    return res.redirect(`/settings?error=${errorMessage}&details=${encodeURIComponent(String(oauthError))}`);
  }

  if (!code || !state || typeof state !== 'string') {
    console.error('[Spotify OAuth] Missing or invalid callback parameters', { code: !!code, state: !!state });
    return res.redirect('/settings?error=spotify_invalid_callback&details=missing_parameters');
  }

  try {
    let session;
    try {
      session = await oauthStorageDB.consume(state);
    } catch (dbError: any) {
      console.error('[Spotify OAuth] Database error consuming state:', dbError.message);
      return res.redirect('/settings?error=spotify_database_error&details=session_verification_failed');
    }

    if (!session) {
      console.error('[Spotify OAuth] Invalid or expired state token');
      return res.redirect('/settings?error=spotify_invalid_state&details=state_expired_or_invalid');
    }

    const clientId = getEnv('SPOTIFY_CLIENT_ID');
    const clientSecret = getEnv('SPOTIFY_CLIENT_SECRET');
    const redirectUri = getEnv('SPOTIFY_REDIRECT_URI');

    if (!clientId) {
      console.error('[Spotify OAuth] SPOTIFY_CLIENT_ID not configured');
      return res.redirect('/settings?error=spotify_config_error&details=missing_client_id');
    }

    if (!clientSecret) {
      console.error('[Spotify OAuth] SPOTIFY_CLIENT_SECRET not configured');
      return res.redirect('/settings?error=spotify_config_error&details=missing_client_secret');
    }

    if (!redirectUri) {
      console.error('[Spotify OAuth] SPOTIFY_REDIRECT_URI not configured');
      return res.redirect('/settings?error=spotify_config_error&details=missing_redirect_uri');
    }

    let tokenResponse;
    try {
      tokenResponse = await retryWithBackoff(async () => {
        return await axios.post(
          SPOTIFY_TOKEN_URL,
          querystring.stringify({
            grant_type: 'authorization_code',
            code: code as string,
            redirect_uri: redirectUri,
            code_verifier: session.codeVerifier,
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
            },
            timeout: 10000,
          }
        );
      });
    } catch (tokenError: any) {
      const status = tokenError.response?.status;
      const errorData = tokenError.response?.data;
      
      console.error('[Spotify OAuth] Token exchange failed:', {
        status,
        error: errorData?.error || tokenError.message,
        message: errorData?.error_description || errorData?.message,
      });

      if (tokenError.code === 'ECONNABORTED' || tokenError.code === 'ETIMEDOUT') {
        return res.redirect('/settings?error=spotify_timeout&details=network_timeout');
      }
      
      if (tokenError.code === 'ENOTFOUND' || tokenError.code === 'ECONNREFUSED') {
        return res.redirect('/settings?error=spotify_network_error&details=connection_failed');
      }

      if (status === 400) {
        return res.redirect('/settings?error=spotify_invalid_code&details=authorization_code_invalid_or_expired');
      }

      if (status === 401) {
        return res.redirect('/settings?error=spotify_invalid_credentials&details=client_credentials_invalid');
      }

      if (status === 429) {
        return res.redirect('/settings?error=spotify_rate_limit&details=too_many_requests');
      }

      if (status && status >= 500) {
        return res.redirect('/settings?error=spotify_server_error&details=spotify_api_unavailable');
      }

      return res.redirect('/settings?error=spotify_token_failed&details=unknown_error');
    }

    try {
      validateTokenResponse(tokenResponse.data);
    } catch (validationError: any) {
      console.error('[Spotify OAuth] Invalid token response:', validationError.message, tokenResponse.data);
      return res.redirect('/settings?error=spotify_invalid_response&details=malformed_token_response');
    }

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    if (!refresh_token) {
      console.warn('[Spotify OAuth] No refresh_token received for user', session.userId);
    }

    let profileResponse;
    try {
      profileResponse = await retryWithBackoff(async () => {
        return await axios.get('https://api.spotify.com/v1/me', {
          headers: { 'Authorization': `Bearer ${access_token}` },
          timeout: 10000,
        });
      });
    } catch (profileError: any) {
      console.error('[Spotify OAuth] Profile fetch failed:', profileError.response?.data || profileError.message);
      return res.redirect('/settings?error=spotify_profile_failed&details=unable_to_fetch_user_profile');
    }

    const { id: platformUserId, display_name, email } = profileResponse.data;

    if (!platformUserId) {
      console.error('[Spotify OAuth] Missing user ID in profile response:', profileResponse.data);
      return res.redirect('/settings?error=spotify_invalid_user_data&details=missing_user_id');
    }

    const encryptedAccessToken = encryptToken(access_token);
    const encryptedRefreshToken = refresh_token ? encryptToken(refresh_token) : null;

    const tokenExpiresAt = new Date(Date.now() + (expires_in * 1000));

    const existingConnection = await storage.getPlatformConnectionByPlatform(session.userId, 'spotify');

    try {
      if (existingConnection) {
        await storage.updatePlatformConnection(session.userId, existingConnection.id, {
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiresAt,
          platformUserId,
          platformUsername: display_name || email,
          isConnected: true,
          lastConnectedAt: new Date(),
          connectionData: { scopes: SPOTIFY_SCOPES },
        });
      } else {
        await storage.createPlatformConnection(session.userId, {
          userId: session.userId,
          platform: 'spotify',
          platformUserId,
          platformUsername: display_name || email,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiresAt,
          isConnected: true,
          lastConnectedAt: new Date(),
          connectionData: { scopes: SPOTIFY_SCOPES },
        });
      }
    } catch (dbError: any) {
      console.error('[Spotify OAuth] Database error storing connection:', dbError.message);
      return res.redirect('/settings?error=spotify_database_error&details=failed_to_save_connection');
    }

    console.log(`[Spotify OAuth] ✓ Successfully connected Spotify for user ${session.userId}`);
    res.redirect('/settings?spotify=connected');

  } catch (error: any) {
    console.error('[Spotify OAuth] Unexpected callback error:', error.message, error.stack);
    res.redirect('/settings?error=spotify_unexpected_error&details=internal_error');
  }
});

/**
 * Refresh Spotify access token using refresh_token grant
 */
export async function refreshSpotifyToken(userId: string): Promise<string | null> {
  try {
    const connection = await storage.getPlatformConnectionByPlatform(userId, 'spotify');
    if (!connection || !connection.refreshToken) {
      console.error('[Spotify OAuth] No refresh token available for user', userId);
      return null;
    }

    const clientId = getEnv('SPOTIFY_CLIENT_ID');
    const clientSecret = getEnv('SPOTIFY_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      console.error('[Spotify OAuth] OAuth credentials not configured');
      throw new Error('Spotify OAuth credentials not configured');
    }

    console.log(`[Spotify OAuth] Attempting to refresh token for user ${userId}...`);

    const refreshToken = decryptToken(connection.refreshToken);

    let tokenResponse;
    try {
      tokenResponse = await retryWithBackoff(async () => {
        return await axios.post(
          SPOTIFY_TOKEN_URL,
          querystring.stringify({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
            },
            timeout: 10000,
          }
        );
      });
    } catch (tokenError: any) {
      const status = tokenError.response?.status;
      const errorData = tokenError.response?.data;
      
      console.error('[Spotify OAuth] Token refresh failed:', {
        userId,
        status,
        error: errorData?.error || tokenError.message,
        message: errorData?.error_description || errorData?.message,
      });

      if (tokenError.code === 'ECONNABORTED' || tokenError.code === 'ETIMEDOUT') {
        console.error(`[Spotify OAuth] ✗ Network timeout refreshing token for user ${userId}`);
      } else if (tokenError.code === 'ENOTFOUND' || tokenError.code === 'ECONNREFUSED') {
        console.error(`[Spotify OAuth] ✗ Network error refreshing token for user ${userId}`);
      } else if (status === 400 || status === 401) {
        if (errorData?.error === 'invalid_grant') {
          console.error(`[Spotify OAuth] ✗ Token has been revoked for user ${userId}`);
        } else {
          console.error(`[Spotify OAuth] ✗ Authentication error for user ${userId}`);
        }
      }

      if (connection) {
        await storage.updatePlatformConnection(userId, connection.id, {
          isConnected: false,
        });
      }
      
      return null;
    }

    try {
      validateTokenResponse(tokenResponse.data);
    } catch (validationError: any) {
      console.error('[Spotify OAuth] Invalid refresh token response:', validationError.message);
      if (connection) {
        await storage.updatePlatformConnection(userId, connection.id, {
          isConnected: false,
        });
      }
      return null;
    }

    const { access_token, refresh_token: new_refresh_token, expires_in } = tokenResponse.data;

    const encryptedAccessToken = encryptToken(access_token);
    const encryptedRefreshToken = new_refresh_token ? encryptToken(new_refresh_token) : connection.refreshToken;

    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);
    await storage.updatePlatformConnection(userId, connection.id, {
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      tokenExpiresAt,
      isConnected: true,
    });

    console.log(`[Spotify OAuth] ✓ Successfully refreshed token for user ${userId} (expires at ${tokenExpiresAt.toISOString()})`);
    return access_token;
  } catch (error: any) {
    console.error('[Spotify OAuth] ✗ Unexpected error refreshing token for user', userId, ':', error.message);
    
    try {
      const connection = await storage.getPlatformConnectionByPlatform(userId, 'spotify');
      if (connection) {
        await storage.updatePlatformConnection(userId, connection.id, {
          isConnected: false,
        });
      }
    } catch (dbError: any) {
      console.error('[Spotify OAuth] Database error marking connection as disconnected:', dbError.message);
    }
    
    return null;
  }
}

/**
 * Get valid Spotify access token (auto-refresh if expired)
 */
export async function getSpotifyAccessToken(userId: string): Promise<string | null> {
  try {
    const connection = await storage.getPlatformConnectionByPlatform(userId, 'spotify');
    if (!connection || !connection.accessToken) {
      return null;
    }

    const now = new Date();
    const expiryBuffer = new Date(now.getTime() + 5 * 60 * 1000);
    
    if (connection.tokenExpiresAt && connection.tokenExpiresAt <= expiryBuffer) {
      console.log('[Spotify OAuth] Token expired or expiring soon, refreshing...');
      return await refreshSpotifyToken(userId);
    }

    return decryptToken(connection.accessToken);
  } catch (error: any) {
    console.error('[Spotify OAuth] Error getting access token:', error.message);
    return null;
  }
}

/**
 * Disconnect Spotify
 * DELETE /auth/spotify/disconnect
 */
router.delete('/spotify/disconnect', requireAuth, async (req, res) => {
  try {
    const connection = await storage.getPlatformConnectionByPlatform(req.user!.id, 'spotify');
    
    if (!connection) {
      return res.status(404).json({ error: 'No Spotify connection found' });
    }

    await storage.updatePlatformConnection(req.user!.id, connection.id, {
      accessToken: null,
      refreshToken: null,
      isConnected: false,
      tokenExpiresAt: null,
    });

    res.json({ success: true, message: 'Spotify disconnected successfully' });
  } catch (error: any) {
    console.error('[Spotify OAuth] Disconnect error:', error.message);
    res.status(500).json({ 
      error: 'Failed to disconnect Spotify',
      message: 'An error occurred while disconnecting. Please try again later.'
    });
  }
});

export default router;
