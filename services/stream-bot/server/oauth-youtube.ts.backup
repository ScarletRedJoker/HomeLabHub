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
import { oauthStorageDB } from "./oauth-storage-db";

const router = Router();

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

/**
 * Step 1: Initiate YouTube/Google OAuth flow
 * GET /auth/youtube
 */
router.get('/youtube', requireAuth, async (req, res) => {
  try {
    const clientId = getEnv('YOUTUBE_CLIENT_ID');
    const redirectUri = getEnv('YOUTUBE_REDIRECT_URI');

    if (!clientId || !redirectUri) {
      return res.status(500).json({ 
        error: 'YouTube OAuth not configured. Please set YOUTUBE_CLIENT_ID and YOUTUBE_REDIRECT_URI' 
      });
    }

    // Generate state and PKCE parameters
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Store OAuth session for callback verification (database-backed)
    await oauthStorageDB.set(state, {
      userId: req.user!.id,
      platform: 'youtube',
      codeVerifier,
      ipAddress: req.ip,
    });

    // Build authorization URL
    const authUrl = GOOGLE_AUTH_URL + '?' + querystring.stringify({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      state: state,
      scope: YOUTUBE_SCOPES,
      access_type: 'offline', // Get refresh token
      prompt: 'consent', // Force consent to ensure refresh token
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
    });

    // Redirect user to Google authorization
    res.redirect(authUrl);
  } catch (error: any) {
    console.error('[YouTube OAuth] Initiation error:', error.message);
    res.status(500).json({ error: 'Failed to initiate YouTube authorization' });
  }
});

/**
 * Step 2: Handle YouTube/Google OAuth callback
 * GET /auth/youtube/callback
 */
router.get('/youtube/callback', async (req, res) => {
  const { code, state, error } = req.query;

  // Handle authorization errors
  if (error) {
    console.error('[YouTube OAuth] Authorization error:', error);
    return res.redirect(`/settings?error=youtube_${error}`);
  }

  if (!code || !state || typeof state !== 'string') {
    console.error('[YouTube OAuth] Missing code or state');
    return res.redirect('/settings?error=youtube_invalid_callback');
  }

  try {
    // Verify state and get OAuth session (database-backed with atomic replay protection)
    const session = await oauthStorageDB.consume(state);
    if (!session) {
      console.error('[YouTube OAuth] Invalid or expired state');
      return res.redirect('/settings?error=youtube_invalid_state');
    }

    const clientId = getEnv('YOUTUBE_CLIENT_ID');
    const clientSecret = getEnv('YOUTUBE_CLIENT_SECRET');
    const redirectUri = getEnv('YOUTUBE_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('YouTube OAuth credentials not configured');
    }

    // Exchange authorization code for tokens
    const tokenResponse = await axios.post(
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
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // Fetch user profile (Google user info)
    const profileResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${access_token}` },
    });

    const { id: platformUserId, name, email } = profileResponse.data;

    // Encrypt tokens before storing
    const encryptedAccessToken = encryptToken(access_token);
    const encryptedRefreshToken = refresh_token ? encryptToken(refresh_token) : null;

    // Calculate token expiry
    const tokenExpiresAt = new Date(Date.now() + (expires_in * 1000));

    // Store or update platform connection
    const existingConnection = await storage.getPlatformConnectionByPlatform(session.userId, 'youtube');

    if (existingConnection) {
      // Update existing connection
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
      // Create new connection
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

    console.log(`[YouTube OAuth] Successfully connected YouTube for user ${session.userId}`);

    // Redirect to settings with success message
    res.redirect('/settings?youtube=connected');

  } catch (error: any) {
    console.error('[YouTube OAuth] Callback error:', error.message);
    res.redirect('/settings?error=youtube_callback_failed');
  }
});

/**
 * Refresh YouTube access token using refresh_token grant
 */
export async function refreshYouTubeToken(userId: string): Promise<string | null> {
  try {
    const connection = await storage.getPlatformConnectionByPlatform(userId, 'youtube');
    if (!connection || !connection.refreshToken) {
      console.error('[YouTube OAuth] No refresh token available');
      return null;
    }

    const clientId = getEnv('YOUTUBE_CLIENT_ID');
    const clientSecret = getEnv('YOUTUBE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new Error('YouTube OAuth credentials not configured');
    }

    // Decrypt refresh token
    const refreshToken = decryptToken(connection.refreshToken);

    // Request new access token
    const tokenResponse = await axios.post(
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
      }
    );

    const { access_token, refresh_token: new_refresh_token, expires_in } = tokenResponse.data;

    // Encrypt new tokens
    const encryptedAccessToken = encryptToken(access_token);
    const encryptedRefreshToken = new_refresh_token ? encryptToken(new_refresh_token) : connection.refreshToken;

    // Update stored tokens
    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);
    await storage.updatePlatformConnection(userId, connection.id, {
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      tokenExpiresAt,
    });

    console.log(`[YouTube OAuth] Refreshed token for user ${userId}`);
    return access_token;
  } catch (error: any) {
    console.error('[YouTube OAuth] Token refresh error:', error.response?.data || error.message);
    
    // Mark connection as disconnected if refresh fails
    const connection = await storage.getPlatformConnectionByPlatform(userId, 'youtube');
    if (connection) {
      await storage.updatePlatformConnection(userId, connection.id, {
        isConnected: false,
      });
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

    // Check if token is expired or about to expire (within 5 minutes)
    const now = new Date();
    const expiryBuffer = new Date(now.getTime() + 5 * 60 * 1000);
    
    if (connection.tokenExpiresAt && connection.tokenExpiresAt <= expiryBuffer) {
      console.log('[YouTube OAuth] Token expired or expiring soon, refreshing...');
      return await refreshYouTubeToken(userId);
    }

    // Token is still valid, decrypt and return
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

    // Mark as disconnected
    await storage.updatePlatformConnection(req.user!.id, connection.id, {
      accessToken: null,
      refreshToken: null,
      isConnected: false,
      tokenExpiresAt: null,
    });

    res.json({ success: true, message: 'YouTube disconnected successfully' });
  } catch (error: any) {
    console.error('[YouTube OAuth] Disconnect error:', error.message);
    res.status(500).json({ error: 'Failed to disconnect YouTube' });
  }
});

export default router;
