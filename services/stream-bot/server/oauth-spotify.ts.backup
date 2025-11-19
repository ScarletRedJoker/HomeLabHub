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
 * Step 1: Initiate Spotify OAuth flow
 * GET /auth/spotify
 */
router.get('/spotify', requireAuth, async (req, res) => {
  try {
    const clientId = getEnv('SPOTIFY_CLIENT_ID');
    const redirectUri = getEnv('SPOTIFY_REDIRECT_URI');

    if (!clientId || !redirectUri) {
      return res.status(500).json({ 
        error: 'Spotify OAuth not configured. Please set SPOTIFY_CLIENT_ID and SPOTIFY_REDIRECT_URI' 
      });
    }

    // Generate state and PKCE parameters
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Store OAuth session for callback verification (database-backed)
    await oauthStorageDB.set(state, {
      userId: req.user!.id,
      platform: 'spotify',
      codeVerifier,
      ipAddress: req.ip,
    });

    // Build authorization URL
    const authUrl = SPOTIFY_AUTH_URL + '?' + querystring.stringify({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      state: state,
      scope: SPOTIFY_SCOPES,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
    });

    // Redirect user to Spotify authorization
    res.redirect(authUrl);
  } catch (error: any) {
    console.error('[Spotify OAuth] Initiation error:', error.message);
    res.status(500).json({ error: 'Failed to initiate Spotify authorization' });
  }
});

/**
 * Step 2: Handle Spotify OAuth callback
 * GET /auth/spotify/callback
 */
router.get('/spotify/callback', async (req, res) => {
  const { code, state, error } = req.query;

  // Handle authorization errors
  if (error) {
    console.error('[Spotify OAuth] Authorization error:', error);
    return res.redirect(`/settings?error=spotify_${error}`);
  }

  if (!code || !state || typeof state !== 'string') {
    console.error('[Spotify OAuth] Missing code or state');
    return res.redirect('/settings?error=spotify_invalid_callback');
  }

  try {
    // Verify state and get OAuth session (database-backed with atomic replay protection)
    const session = await oauthStorageDB.consume(state);
    if (!session) {
      console.error('[Spotify OAuth] Invalid or expired state');
      return res.redirect('/settings?error=spotify_invalid_state');
    }

    const clientId = getEnv('SPOTIFY_CLIENT_ID');
    const clientSecret = getEnv('SPOTIFY_CLIENT_SECRET');
    const redirectUri = getEnv('SPOTIFY_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Spotify OAuth credentials not configured');
    }

    // Exchange authorization code for tokens
    const tokenResponse = await axios.post(
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
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // Fetch user profile to get Spotify user ID
    const profileResponse = await axios.get('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${access_token}` },
    });

    const { id: platformUserId, display_name, email } = profileResponse.data;

    // Encrypt tokens before storing
    const encryptedAccessToken = encryptToken(access_token);
    const encryptedRefreshToken = refresh_token ? encryptToken(refresh_token) : null;

    // Calculate token expiry
    const tokenExpiresAt = new Date(Date.now() + (expires_in * 1000));

    // Store or update platform connection
    const existingConnection = await storage.getPlatformConnectionByPlatform(session.userId, 'spotify');

    if (existingConnection) {
      // Update existing connection
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
      // Create new connection
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

    console.log(`[Spotify OAuth] Successfully connected Spotify for user ${session.userId}`);

    // Redirect to settings with success message
    res.redirect('/settings?spotify=connected');

  } catch (error: any) {
    console.error('[Spotify OAuth] Callback error:', error.message);
    res.redirect('/settings?error=spotify_callback_failed');
  }
});

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

    // Mark as disconnected (keep for history but revoke tokens)
    await storage.updatePlatformConnection(req.user!.id, connection.id, {
      accessToken: null,
      refreshToken: null,
      isConnected: false,
      tokenExpiresAt: null,
    });

    res.json({ success: true, message: 'Spotify disconnected successfully' });
  } catch (error: any) {
    console.error('[Spotify OAuth] Disconnect error:', error.message);
    res.status(500).json({ error: 'Failed to disconnect Spotify' });
  }
});

export default router;
