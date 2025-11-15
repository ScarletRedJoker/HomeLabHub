import { Router } from "express";
import axios from "axios";
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
import { oauthStorage } from "./oauth-storage";

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
 * Step 1: Initiate Twitch OAuth flow
 * GET /auth/twitch
 */
router.get('/twitch', requireAuth, (req, res) => {
  try {
    const clientId = getEnv('TWITCH_CLIENT_ID');
    const redirectUri = getEnv('TWITCH_REDIRECT_URI');

    if (!clientId || !redirectUri) {
      return res.status(500).json({ 
        error: 'Twitch OAuth not configured. Please set TWITCH_CLIENT_ID and TWITCH_REDIRECT_URI' 
      });
    }

    // Generate state and PKCE parameters
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Store OAuth session for callback verification
    oauthStorage.set(state, {
      userId: req.user!.id,
      platform: 'twitch',
      codeVerifier,
    });

    // Build authorization URL
    const authUrl = TWITCH_AUTH_URL + '?' + querystring.stringify({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      state: state,
      scope: TWITCH_SCOPES,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
    });

    // Redirect user to Twitch authorization
    res.redirect(authUrl);
  } catch (error: any) {
    console.error('[Twitch OAuth] Initiation error:', error.message);
    res.status(500).json({ error: 'Failed to initiate Twitch authorization' });
  }
});

/**
 * Step 2: Handle Twitch OAuth callback
 * GET /auth/twitch/callback
 */
router.get('/twitch/callback', async (req, res) => {
  const { code, state, error } = req.query;

  // Handle authorization errors
  if (error) {
    console.error('[Twitch OAuth] Authorization error:', error);
    return res.redirect(`/settings?error=twitch_${error}`);
  }

  if (!code || !state || typeof state !== 'string') {
    console.error('[Twitch OAuth] Missing code or state');
    return res.redirect('/settings?error=twitch_invalid_callback');
  }

  try {
    // Verify state and get OAuth session
    const session = oauthStorage.get(state);
    if (!session) {
      console.error('[Twitch OAuth] Invalid or expired state');
      return res.redirect('/settings?error=twitch_invalid_state');
    }

    const clientId = getEnv('TWITCH_CLIENT_ID');
    const clientSecret = getEnv('TWITCH_CLIENT_SECRET');
    const redirectUri = getEnv('TWITCH_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Twitch OAuth credentials not configured');
    }

    // Exchange authorization code for tokens
    const tokenResponse = await axios.post(
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
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // Validate token and get user info
    const validateResponse = await axios.get(TWITCH_VALIDATE_URL, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
      },
    });

    const { user_id, login } = validateResponse.data;

    // Encrypt tokens before storing
    const encryptedAccessToken = encryptToken(access_token);
    const encryptedRefreshToken = refresh_token ? encryptToken(refresh_token) : null;

    // Calculate token expiry
    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);

    // Store Twitch connection
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

    // Clear OAuth session
    oauthStorage.delete(state);

    console.log(`[Twitch OAuth] Successfully connected user ${session.userId} to Twitch (@${login})`);
    res.redirect('/settings?success=twitch_connected');
  } catch (error: any) {
    console.error('[Twitch OAuth] Token exchange error:', error.response?.data || error.message);
    res.redirect('/settings?error=twitch_token_failed');
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

    // Decrypt refresh token
    const refreshToken = decryptToken(connection.refreshToken);

    // Request new access token
    const tokenResponse = await axios.post(
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
      }
    );

    const { access_token, refresh_token: new_refresh_token, expires_in } = tokenResponse.data;

    // Encrypt new tokens
    const encryptedAccessToken = encryptToken(access_token);
    const encryptedRefreshToken = new_refresh_token ? encryptToken(new_refresh_token) : connection.refreshToken;

    // Update stored tokens atomically
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
    const errorData = error.response?.data;
    const statusCode = error.response?.status;

    // Check for revoked token errors
    if (statusCode === 400 || statusCode === 401) {
      if (errorData?.message?.includes('Invalid refresh token') || errorData?.error === 'invalid_grant') {
        console.error(`[Twitch OAuth] ✗ Token has been revoked for user ${userId}:`, errorData);
      } else {
        console.error(`[Twitch OAuth] ✗ Authentication error for user ${userId}:`, errorData || error.message);
      }
    } else {
      console.error(`[Twitch OAuth] ✗ Token refresh error for user ${userId}:`, error.message);
    }
    
    // Mark connection as disconnected if refresh fails
    await storage.upsertPlatformConnection(userId, 'twitch', {
      isConnected: false,
    });
    
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

    // Check if token is expired or about to expire (within 5 minutes)
    const now = new Date();
    const expiryBuffer = new Date(now.getTime() + 5 * 60 * 1000);
    
    if (connection.tokenExpiresAt && connection.tokenExpiresAt <= expiryBuffer) {
      console.log('[Twitch OAuth] Token expired or expiring soon, refreshing...');
      return await refreshTwitchToken(userId);
    }

    // Token is still valid, decrypt and return
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
    res.status(500).json({ error: 'Failed to disconnect Twitch account' });
  }
});

export default router;
