import { Router } from "express";
import axios, { AxiosError } from "axios";
import querystring from "querystring";
import { requireAuth } from "./auth/middleware";
import { storage } from "./storage";
import { getEnv } from "./env";
import { getYouTubeConfig, isReplit } from "../src/config/environment";
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

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
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
      console.log(`[YouTube OAuth] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms...`);
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
 * Step 1: Initiate YouTube/Google OAuth flow
 * GET /auth/youtube
 */
router.get('/youtube', requireAuth, async (req, res) => {
  try {
    // Get YouTube OAuth configuration
    let youtubeConfig;
    try {
      youtubeConfig = getYouTubeConfig();
      const envType = isReplit() ? "Replit (dev)" : "Ubuntu (production)";
      console.log(`[YouTube OAuth] Environment: ${envType}`);
    } catch (error) {
      console.error('[YouTube OAuth] Configuration error:', error);
      return res.status(500).json({ 
        error: 'YouTube OAuth not configured',
        message: error instanceof Error ? error.message : 'Please contact administrator for setup instructions.'
      });
    }

    const clientId = youtubeConfig.clientId;
    const redirectUri = youtubeConfig.redirectUri;

    // Log redirect URI for verification
    console.log(`[YouTube OAuth] Redirect URI: ${redirectUri}`);
    
    // Validate redirect URI matches current environment
    const appUrl = process.env.APP_URL || process.env.REPLIT_DEV_DOMAIN;
    if (appUrl && !redirectUri.includes(appUrl)) {
      console.warn(
        `[YouTube OAuth] Warning: Redirect URI (${redirectUri}) doesn't match APP_URL (${appUrl}). ` +
        `This may cause OAuth failures in production.`
      );
    }

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    try {
      await oauthStorageDB.set(state, {
        userId: req.user!.id,
        platform: 'youtube',
        codeVerifier,
        ipAddress: req.ip,
      });
    } catch (dbError: any) {
      console.error('[YouTube OAuth] Database error storing OAuth session:', dbError.message);
      return res.status(500).json({ 
        error: 'Database error',
        message: 'Unable to initialize OAuth session. Please try again later.'
      });
    }

    const authUrl = GOOGLE_AUTH_URL + '?' + querystring.stringify({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      state: state,
      scope: YOUTUBE_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
    });

    res.redirect(authUrl);
  } catch (error: any) {
    console.error('[YouTube OAuth] Initiation error:', error.message, error.stack);
    res.status(500).json({ 
      error: 'Failed to initiate YouTube authorization',
      message: 'An unexpected error occurred. Please try again later.'
    });
  }
});

/**
 * Step 2: Handle YouTube/Google OAuth callback
 * GET /auth/youtube/callback
 */
router.get('/youtube/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    console.error('[YouTube OAuth] Authorization error:', oauthError);
    
    let errorMessage = 'youtube_auth_failed';
    if (oauthError === 'access_denied') {
      errorMessage = 'youtube_access_denied';
      console.log('[YouTube OAuth] User denied required permissions');
    }
    
    return res.redirect(`/settings?error=${errorMessage}&details=${encodeURIComponent(String(oauthError))}`);
  }

  if (!code || !state || typeof state !== 'string') {
    console.error('[YouTube OAuth] Missing or invalid callback parameters', { code: !!code, state: !!state });
    return res.redirect('/settings?error=youtube_invalid_callback&details=missing_parameters');
  }

  try {
    let session;
    try {
      session = await oauthStorageDB.consume(state);
    } catch (dbError: any) {
      console.error('[YouTube OAuth] Database error consuming state:', dbError.message);
      return res.redirect('/settings?error=youtube_database_error&details=session_verification_failed');
    }

    if (!session) {
      console.error('[YouTube OAuth] Invalid or expired state token');
      return res.redirect('/settings?error=youtube_invalid_state&details=state_expired_or_invalid');
    }

    // Use environment-aware YouTube configuration
    let youtubeConfig;
    try {
      youtubeConfig = getYouTubeConfig();
    } catch (error) {
      console.error('[YouTube OAuth] Configuration error in callback:', error);
      return res.redirect('/settings?error=youtube_config_error&details=configuration_missing');
    }

    const clientId = youtubeConfig.clientId;
    const clientSecret = youtubeConfig.clientSecret;
    const redirectUri = youtubeConfig.redirectUri;

    // Log callback configuration for debugging
    console.log(`[YouTube OAuth Callback] Using redirect URI: ${redirectUri}`);

    let tokenResponse;
    try {
      tokenResponse = await retryWithBackoff(async () => {
        return await axios.post(
          GOOGLE_TOKEN_URL,
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
      
      console.error('[YouTube OAuth] Token exchange failed:', {
        status,
        error: errorData?.error || tokenError.message,
        message: errorData?.error_description || errorData?.message,
      });

      if (tokenError.code === 'ECONNABORTED' || tokenError.code === 'ETIMEDOUT') {
        return res.redirect('/settings?error=youtube_timeout&details=network_timeout');
      }
      
      if (tokenError.code === 'ENOTFOUND' || tokenError.code === 'ECONNREFUSED') {
        return res.redirect('/settings?error=youtube_network_error&details=connection_failed');
      }

      if (status === 400) {
        return res.redirect('/settings?error=youtube_invalid_code&details=authorization_code_invalid_or_expired');
      }

      if (status === 401) {
        return res.redirect('/settings?error=youtube_invalid_credentials&details=client_credentials_invalid');
      }

      if (status === 429) {
        return res.redirect('/settings?error=youtube_rate_limit&details=too_many_requests');
      }

      if (status && status >= 500) {
        return res.redirect('/settings?error=youtube_server_error&details=google_api_unavailable');
      }

      return res.redirect('/settings?error=youtube_token_failed&details=unknown_error');
    }

    try {
      validateTokenResponse(tokenResponse.data);
    } catch (validationError: any) {
      console.error('[YouTube OAuth] Invalid token response:', validationError.message, tokenResponse.data);
      return res.redirect('/settings?error=youtube_invalid_response&details=malformed_token_response');
    }

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    if (!refresh_token) {
      console.warn('[YouTube OAuth] No refresh_token received for user', session.userId);
    }

    let profileResponse;
    try {
      profileResponse = await retryWithBackoff(async () => {
        return await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { 'Authorization': `Bearer ${access_token}` },
          timeout: 10000,
        });
      });
    } catch (profileError: any) {
      console.error('[YouTube OAuth] Profile fetch failed:', profileError.response?.data || profileError.message);
      return res.redirect('/settings?error=youtube_profile_failed&details=unable_to_fetch_user_profile');
    }

    const { id: platformUserId, name, email } = profileResponse.data;

    if (!platformUserId) {
      console.error('[YouTube OAuth] Missing user ID in profile response:', profileResponse.data);
      return res.redirect('/settings?error=youtube_invalid_user_data&details=missing_user_id');
    }

    const encryptedAccessToken = encryptToken(access_token);
    const encryptedRefreshToken = refresh_token ? encryptToken(refresh_token) : null;

    const tokenExpiresAt = new Date(Date.now() + (expires_in * 1000));

    const existingConnection = await storage.getPlatformConnectionByPlatform(session.userId, 'youtube');

    try {
      if (existingConnection) {
        await storage.updatePlatformConnection(session.userId, existingConnection.id, {
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiresAt,
          platformUserId,
          platformUsername: name || email,
          isConnected: true,
          lastConnectedAt: new Date(),
          connectionData: { scopes: YOUTUBE_SCOPES, email },
        });
      } else {
        await storage.createPlatformConnection(session.userId, {
          userId: session.userId,
          platform: 'youtube',
          platformUserId,
          platformUsername: name || email,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiresAt,
          isConnected: true,
          lastConnectedAt: new Date(),
          connectionData: { scopes: YOUTUBE_SCOPES, email },
        });
      }
    } catch (dbError: any) {
      console.error('[YouTube OAuth] Database error storing connection:', dbError.message);
      return res.redirect('/settings?error=youtube_database_error&details=failed_to_save_connection');
    }

    console.log(`[YouTube OAuth] ✓ Successfully connected YouTube for user ${session.userId}`);

    // Auto-start bot on first platform connection
    try {
      const allConnections = await storage.getPlatformConnections(session.userId);
      const connectedPlatforms = allConnections.filter(c => c.isConnected);
      if (connectedPlatforms.length === 1) {
        console.log(`[YouTube OAuth] First platform connected, auto-starting bot for user ${session.userId}`);
        await storage.updateBotSettings(session.userId, { isActive: true });
        await botManager.startUserBot(session.userId);
      }
    } catch (autoStartError: any) {
      console.error('[YouTube OAuth] Auto-start bot error (non-fatal):', autoStartError.message);
    }

    res.redirect('/settings?youtube=connected');

  } catch (error: any) {
    console.error('[YouTube OAuth] Unexpected callback error:', error.message, error.stack);
    res.redirect('/settings?error=youtube_unexpected_error&details=internal_error');
  }
});

/**
 * Refresh YouTube access token using refresh_token grant
 */
export async function refreshYouTubeToken(userId: string): Promise<string | null> {
  try {
    const connection = await storage.getPlatformConnectionByPlatform(userId, 'youtube');
    if (!connection || !connection.refreshToken) {
      console.error('[YouTube OAuth] No refresh token available for user', userId);
      return null;
    }

    const clientId = getEnv('YOUTUBE_CLIENT_ID');
    const clientSecret = getEnv('YOUTUBE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      console.error('[YouTube OAuth] OAuth credentials not configured');
      throw new Error('YouTube OAuth credentials not configured');
    }

    console.log(`[YouTube OAuth] Attempting to refresh token for user ${userId}...`);

    const refreshToken = decryptToken(connection.refreshToken);

    let tokenResponse;
    try {
      tokenResponse = await retryWithBackoff(async () => {
        return await axios.post(
          GOOGLE_TOKEN_URL,
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
      
      console.error('[YouTube OAuth] Token refresh failed:', {
        userId,
        status,
        error: errorData?.error || tokenError.message,
        message: errorData?.error_description || errorData?.message,
      });

      if (tokenError.code === 'ECONNABORTED' || tokenError.code === 'ETIMEDOUT') {
        console.error(`[YouTube OAuth] ✗ Network timeout refreshing token for user ${userId}`);
      } else if (tokenError.code === 'ENOTFOUND' || tokenError.code === 'ECONNREFUSED') {
        console.error(`[YouTube OAuth] ✗ Network error refreshing token for user ${userId}`);
      } else if (status === 400 || status === 401) {
        if (errorData?.error === 'invalid_grant') {
          console.error(`[YouTube OAuth] ✗ Token has been revoked for user ${userId}`);
        } else {
          console.error(`[YouTube OAuth] ✗ Authentication error for user ${userId}`);
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
      console.error('[YouTube OAuth] Invalid refresh token response:', validationError.message);
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

    console.log(`[YouTube OAuth] ✓ Successfully refreshed token for user ${userId} (expires at ${tokenExpiresAt.toISOString()})`);
    return access_token;
  } catch (error: any) {
    console.error('[YouTube OAuth] ✗ Unexpected error refreshing token for user', userId, ':', error.message);
    
    try {
      const connection = await storage.getPlatformConnectionByPlatform(userId, 'youtube');
      if (connection) {
        await storage.updatePlatformConnection(userId, connection.id, {
          isConnected: false,
        });
      }
    } catch (dbError: any) {
      console.error('[YouTube OAuth] Database error marking connection as disconnected:', dbError.message);
    }
    
    return null;
  }
}

/**
 * Get valid YouTube access token (auto-refresh if expired)
 */
export async function getYouTubeAccessToken(userId: string): Promise<string | null> {
  try {
    const connection = await storage.getPlatformConnectionByPlatform(userId, 'youtube');
    if (!connection || !connection.accessToken) {
      return null;
    }

    const now = new Date();
    const expiryBuffer = new Date(now.getTime() + 5 * 60 * 1000);
    
    if (connection.tokenExpiresAt && connection.tokenExpiresAt <= expiryBuffer) {
      console.log('[YouTube OAuth] Token expired or expiring soon, refreshing...');
      return await refreshYouTubeToken(userId);
    }

    return decryptToken(connection.accessToken);
  } catch (error: any) {
    console.error('[YouTube OAuth] Error getting access token:', error.message);
    return null;
  }
}

/**
 * Disconnect YouTube
 * DELETE /auth/youtube/disconnect
 */
router.delete('/youtube/disconnect', requireAuth, async (req, res) => {
  try {
    const connection = await storage.getPlatformConnectionByPlatform(req.user!.id, 'youtube');
    
    if (!connection) {
      return res.status(404).json({ error: 'No YouTube connection found' });
    }

    await storage.updatePlatformConnection(req.user!.id, connection.id, {
      accessToken: null,
      refreshToken: null,
      isConnected: false,
      tokenExpiresAt: null,
    });

    res.json({ success: true, message: 'YouTube disconnected successfully' });
  } catch (error: any) {
    console.error('[YouTube OAuth] Disconnect error:', error.message);
    res.status(500).json({ 
      error: 'Failed to disconnect YouTube',
      message: 'An error occurred while disconnecting. Please try again later.'
    });
  }
});

export default router;
