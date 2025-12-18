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
import { botManager } from "./bot-manager";

const router = Router();

const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/authorize';
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const TWITCH_VALIDATE_URL = 'https://id.twitch.tv/oauth2/validate';

const TWITCH_SCOPES = [
  'user:read:chat',
  'user:write:chat',
  'user:bot',
  'channel:bot',
  'moderator:read:chatters',
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
      console.log(`[Twitch OAuth] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms...`);
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
 * Step 1: Initiate Twitch OAuth flow
 * GET /auth/twitch
 */
router.get('/twitch', requireAuth, async (req, res) => {
  try {
    const clientId = getEnv('TWITCH_CLIENT_ID');
    const redirectUri = getEnv('TWITCH_REDIRECT_URI');

    if (!clientId) {
      console.error('[Twitch OAuth] TWITCH_CLIENT_ID not configured');
      return res.status(500).json({ 
        error: 'Twitch OAuth not configured',
        message: 'Please set TWITCH_CLIENT_ID environment variable. Contact administrator for setup instructions.'
      });
    }

    if (!redirectUri) {
      console.error('[Twitch OAuth] TWITCH_REDIRECT_URI not configured');
      return res.status(500).json({ 
        error: 'Twitch OAuth not configured',
        message: 'Please set TWITCH_REDIRECT_URI environment variable. Contact administrator for setup instructions.'
      });
    }

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    try {
      await oauthStorageDB.set(state, {
        userId: req.user!.id,
        platform: 'twitch',
        codeVerifier,
        ipAddress: req.ip,
      });
    } catch (dbError: any) {
      console.error('[Twitch OAuth] Database error storing OAuth session:', dbError.message);
      return res.status(500).json({ 
        error: 'Database error',
        message: 'Unable to initialize OAuth session. Please try again later.'
      });
    }

    const authUrl = TWITCH_AUTH_URL + '?' + querystring.stringify({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      state: state,
      scope: TWITCH_SCOPES,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      force_verify: 'true',
    });

    res.redirect(authUrl);
  } catch (error: any) {
    console.error('[Twitch OAuth] Initiation error:', error.message, error.stack);
    res.status(500).json({ 
      error: 'Failed to initiate Twitch authorization',
      message: 'An unexpected error occurred. Please try again later.'
    });
  }
});

/**
 * Step 2: Handle Twitch OAuth callback
 * GET /auth/twitch/callback
 */
router.get('/twitch/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    console.error('[Twitch OAuth] Authorization error:', oauthError);
    
    let errorMessage = 'twitch_auth_failed';
    if (oauthError === 'access_denied') {
      errorMessage = 'twitch_access_denied';
      console.log('[Twitch OAuth] User denied required permissions');
    }
    
    return res.redirect(`/settings?error=${errorMessage}&details=${encodeURIComponent(String(oauthError))}`);
  }

  if (!code || !state || typeof state !== 'string') {
    console.error('[Twitch OAuth] Missing or invalid callback parameters', { code: !!code, state: !!state });
    return res.redirect('/settings?error=twitch_invalid_callback&details=missing_parameters');
  }

  try {
    let session;
    try {
      session = await oauthStorageDB.consume(state);
    } catch (dbError: any) {
      console.error('[Twitch OAuth] Database error consuming state:', dbError.message);
      return res.redirect('/settings?error=twitch_database_error&details=session_verification_failed');
    }

    if (!session) {
      console.error('[Twitch OAuth] Invalid or expired state token');
      return res.redirect('/settings?error=twitch_invalid_state&details=state_expired_or_invalid');
    }

    const clientId = getEnv('TWITCH_CLIENT_ID');
    const clientSecret = getEnv('TWITCH_CLIENT_SECRET');
    const redirectUri = getEnv('TWITCH_REDIRECT_URI');

    if (!clientId) {
      console.error('[Twitch OAuth] TWITCH_CLIENT_ID not configured');
      return res.redirect('/settings?error=twitch_config_error&details=missing_client_id');
    }

    if (!clientSecret) {
      console.error('[Twitch OAuth] TWITCH_CLIENT_SECRET not configured');
      return res.redirect('/settings?error=twitch_config_error&details=missing_client_secret');
    }

    if (!redirectUri) {
      console.error('[Twitch OAuth] TWITCH_REDIRECT_URI not configured');
      return res.redirect('/settings?error=twitch_config_error&details=missing_redirect_uri');
    }

    let tokenResponse;
    try {
      tokenResponse = await retryWithBackoff(async () => {
        return await axios.post(
          TWITCH_TOKEN_URL,
          querystring.stringify({
            grant_type: 'authorization_code',
            code: code as string,
            redirect_uri: redirectUri,
            client_id: clientId,
            client_secret: clientSecret,
            code_verifier: session.codeVerifier,
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout: 10000,
          }
        );
      });
    } catch (tokenError: any) {
      const status = tokenError.response?.status;
      const errorData = tokenError.response?.data;
      
      console.error('[Twitch OAuth] Token exchange failed:', {
        status,
        error: errorData?.error || tokenError.message,
        message: errorData?.message,
      });

      if (tokenError.code === 'ECONNABORTED' || tokenError.code === 'ETIMEDOUT') {
        return res.redirect('/settings?error=twitch_timeout&details=network_timeout');
      }
      
      if (tokenError.code === 'ENOTFOUND' || tokenError.code === 'ECONNREFUSED') {
        return res.redirect('/settings?error=twitch_network_error&details=connection_failed');
      }

      if (status === 400) {
        return res.redirect('/settings?error=twitch_invalid_code&details=authorization_code_invalid_or_expired');
      }

      if (status === 401) {
        return res.redirect('/settings?error=twitch_invalid_credentials&details=client_credentials_invalid');
      }

      if (status === 429) {
        return res.redirect('/settings?error=twitch_rate_limit&details=too_many_requests');
      }

      if (status && status >= 500) {
        return res.redirect('/settings?error=twitch_server_error&details=twitch_api_unavailable');
      }

      return res.redirect('/settings?error=twitch_token_failed&details=unknown_error');
    }

    try {
      validateTokenResponse(tokenResponse.data);
    } catch (validationError: any) {
      console.error('[Twitch OAuth] Invalid token response:', validationError.message, tokenResponse.data);
      return res.redirect('/settings?error=twitch_invalid_response&details=malformed_token_response');
    }

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    let validateResponse;
    try {
      validateResponse = await retryWithBackoff(async () => {
        return await axios.get(TWITCH_VALIDATE_URL, {
          headers: {
            'Authorization': `Bearer ${access_token}`,
          },
          timeout: 10000,
        });
      });
    } catch (validateError: any) {
      console.error('[Twitch OAuth] Token validation failed:', validateError.response?.data || validateError.message);
      return res.redirect('/settings?error=twitch_validation_failed&details=token_validation_error');
    }

    const { user_id, login } = validateResponse.data;

    if (!user_id || !login) {
      console.error('[Twitch OAuth] Missing user info in validation response:', validateResponse.data);
      return res.redirect('/settings?error=twitch_invalid_user_data&details=missing_user_info');
    }

    const encryptedAccessToken = encryptToken(access_token);
    const encryptedRefreshToken = refresh_token ? encryptToken(refresh_token) : null;

    if (!refresh_token) {
      console.warn('[Twitch OAuth] No refresh_token received for user', session.userId);
    }

    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);

    try {
      await storage.upsertPlatformConnection(
        session.userId,
        'twitch',
        {
          platformUserId: user_id,
          platformUsername: login,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiresAt,
          isConnected: true,
          lastConnectedAt: new Date(),
          connectionData: {
            scopes: TWITCH_SCOPES.split(' '),
          },
        }
      );
    } catch (dbError: any) {
      console.error('[Twitch OAuth] Database error storing connection:', dbError.message);
      return res.redirect('/settings?error=twitch_database_error&details=failed_to_save_connection');
    }

    console.log(`[Twitch OAuth] ✓ Successfully connected user ${session.userId} to Twitch (@${login})`);

    // Auto-start bot on first platform connection
    try {
      const allConnections = await storage.getPlatformConnections(session.userId);
      const connectedPlatforms = allConnections.filter(c => c.isConnected);
      if (connectedPlatforms.length === 1) {
        console.log(`[Twitch OAuth] First platform connected, auto-starting bot for user ${session.userId}`);
        await storage.updateBotSettings(session.userId, { isActive: true });
        await botManager.startUserBot(session.userId);
      }
    } catch (autoStartError: any) {
      console.error('[Twitch OAuth] Auto-start bot error (non-fatal):', autoStartError.message);
    }

    res.redirect('/settings?success=twitch_connected');
  } catch (error: any) {
    console.error('[Twitch OAuth] Unexpected callback error:', error.message, error.stack);
    res.redirect('/settings?error=twitch_unexpected_error&details=internal_error');
  }
});

/**
 * Refresh Twitch access token using refresh_token grant
 */
export async function refreshTwitchToken(userId: string): Promise<string | null> {
  try {
    const connection = await storage.getPlatformConnection(userId, 'twitch');
    if (!connection || !connection.refreshToken) {
      console.error('[Twitch OAuth] No refresh token available for user', userId);
      return null;
    }

    const clientId = getEnv('TWITCH_CLIENT_ID');
    const clientSecret = getEnv('TWITCH_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      console.error('[Twitch OAuth] OAuth credentials not configured');
      throw new Error('Twitch OAuth credentials not configured');
    }

    console.log(`[Twitch OAuth] Attempting to refresh token for user ${userId}...`);

    const refreshToken = decryptToken(connection.refreshToken);

    let tokenResponse;
    try {
      tokenResponse = await retryWithBackoff(async () => {
        return await axios.post(
          TWITCH_TOKEN_URL,
          querystring.stringify({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout: 10000,
          }
        );
      });
    } catch (tokenError: any) {
      const status = tokenError.response?.status;
      const errorData = tokenError.response?.data;
      
      console.error('[Twitch OAuth] Token refresh failed:', {
        userId,
        status,
        error: errorData?.error || tokenError.message,
        message: errorData?.message,
      });

      if (tokenError.code === 'ECONNABORTED' || tokenError.code === 'ETIMEDOUT') {
        console.error(`[Twitch OAuth] ✗ Network timeout refreshing token for user ${userId}`);
      } else if (tokenError.code === 'ENOTFOUND' || tokenError.code === 'ECONNREFUSED') {
        console.error(`[Twitch OAuth] ✗ Network error refreshing token for user ${userId}`);
      } else if (status === 400 || status === 401) {
        if (errorData?.message?.includes('Invalid refresh token') || errorData?.error === 'invalid_grant') {
          console.error(`[Twitch OAuth] ✗ Token has been revoked for user ${userId}`);
        } else {
          console.error(`[Twitch OAuth] ✗ Authentication error for user ${userId}`);
        }
      }

      await storage.upsertPlatformConnection(userId, 'twitch', {
        isConnected: false,
      });
      
      return null;
    }

    try {
      validateTokenResponse(tokenResponse.data);
    } catch (validationError: any) {
      console.error('[Twitch OAuth] Invalid refresh token response:', validationError.message);
      await storage.upsertPlatformConnection(userId, 'twitch', {
        isConnected: false,
      });
      return null;
    }

    const { access_token, refresh_token: new_refresh_token, expires_in } = tokenResponse.data;

    const encryptedAccessToken = encryptToken(access_token);
    const encryptedRefreshToken = new_refresh_token ? encryptToken(new_refresh_token) : connection.refreshToken;

    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);
    await storage.upsertPlatformConnection(userId, 'twitch', {
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      tokenExpiresAt,
      isConnected: true,
    });

    console.log(`[Twitch OAuth] ✓ Successfully refreshed token for user ${userId} (expires at ${tokenExpiresAt.toISOString()})`);
    return access_token;
  } catch (error: any) {
    console.error(`[Twitch OAuth] ✗ Unexpected error refreshing token for user ${userId}:`, error.message);
    
    try {
      await storage.upsertPlatformConnection(userId, 'twitch', {
        isConnected: false,
      });
    } catch (dbError: any) {
      console.error('[Twitch OAuth] Database error marking connection as disconnected:', dbError.message);
    }
    
    return null;
  }
}

/**
 * Get valid Twitch access token (auto-refresh if expired)
 */
export async function getTwitchAccessToken(userId: string): Promise<string | null> {
  try {
    const connection = await storage.getPlatformConnection(userId, 'twitch');
    if (!connection || !connection.accessToken) {
      return null;
    }

    const now = new Date();
    const expiryBuffer = new Date(now.getTime() + 5 * 60 * 1000);
    
    if (connection.tokenExpiresAt && connection.tokenExpiresAt <= expiryBuffer) {
      console.log('[Twitch OAuth] Token expired or expiring soon, refreshing...');
      return await refreshTwitchToken(userId);
    }

    return decryptToken(connection.accessToken);
  } catch (error: any) {
    console.error('[Twitch OAuth] Error getting access token:', error.message);
    return null;
  }
}

/**
 * Disconnect Twitch account
 * DELETE /auth/twitch/disconnect
 */
router.delete('/twitch/disconnect', requireAuth, async (req, res) => {
  try {
    await storage.deletePlatformConnection(req.user!.id, 'twitch');
    console.log(`[Twitch OAuth] Disconnected user ${req.user!.id} from Twitch`);
    res.json({ success: true, message: 'Twitch disconnected successfully' });
  } catch (error: any) {
    console.error('[Twitch OAuth] Disconnect error:', error.message);
    res.status(500).json({ 
      error: 'Failed to disconnect Twitch account',
      message: 'An error occurred while disconnecting. Please try again later.'
    });
  }
});

export default router;
