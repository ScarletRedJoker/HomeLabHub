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
import { getKickUserInfo } from "./kick-client";

const router = Router();

const KICK_AUTH_URL = 'https://id.kick.com/oauth/authorize';
const KICK_TOKEN_URL = 'https://id.kick.com/oauth/token';

const KICK_SCOPES = [
  'user:read',
  'channel:read',
  'channel:write',
  'chat:write',
].join(' ');

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
      console.log(`[Kick OAuth] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

function validateTokenResponse(data: any): void {
  if (!data.access_token) {
    throw new Error('Token response missing access_token');
  }
  if (!data.expires_in) {
    throw new Error('Token response missing expires_in');
  }
}

router.get('/kick', requireAuth, async (req, res) => {
  try {
    const clientId = getEnv('KICK_CLIENT_ID');
    const redirectUri = getEnv('KICK_REDIRECT_URI');

    if (!clientId) {
      console.error('[Kick OAuth] KICK_CLIENT_ID not configured');
      return res.status(500).json({ 
        error: 'Kick OAuth not configured',
        message: 'Please set KICK_CLIENT_ID environment variable. Contact administrator for setup instructions.'
      });
    }

    if (!redirectUri) {
      console.error('[Kick OAuth] KICK_REDIRECT_URI not configured');
      return res.status(500).json({ 
        error: 'Kick OAuth not configured',
        message: 'Please set KICK_REDIRECT_URI environment variable. Contact administrator for setup instructions.'
      });
    }

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    try {
      await oauthStorageDB.set(state, {
        userId: req.user!.id,
        platform: 'kick',
        codeVerifier,
        ipAddress: req.ip,
      });
    } catch (dbError: any) {
      console.error('[Kick OAuth] Database error storing OAuth session:', dbError.message);
      return res.status(500).json({ 
        error: 'Database error',
        message: 'Unable to initialize OAuth session. Please try again later.'
      });
    }

    const authUrl = KICK_AUTH_URL + '?' + querystring.stringify({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      state: state,
      scope: KICK_SCOPES,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
    });

    res.redirect(authUrl);
  } catch (error: any) {
    console.error('[Kick OAuth] Initiation error:', error.message, error.stack);
    res.status(500).json({ 
      error: 'Failed to initiate Kick authorization',
      message: 'An unexpected error occurred. Please try again later.'
    });
  }
});

router.get('/kick/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    console.error('[Kick OAuth] Authorization error:', oauthError);
    
    let errorMessage = 'kick_auth_failed';
    if (oauthError === 'access_denied') {
      errorMessage = 'kick_access_denied';
      console.log('[Kick OAuth] User denied required permissions');
    }
    
    return res.redirect(`/settings?error=${errorMessage}&details=${encodeURIComponent(String(oauthError))}`);
  }

  if (!code || !state || typeof state !== 'string') {
    console.error('[Kick OAuth] Missing or invalid callback parameters', { code: !!code, state: !!state });
    return res.redirect('/settings?error=kick_invalid_callback&details=missing_parameters');
  }

  try {
    let session;
    try {
      session = await oauthStorageDB.consume(state);
    } catch (dbError: any) {
      console.error('[Kick OAuth] Database error consuming state:', dbError.message);
      return res.redirect('/settings?error=kick_database_error&details=session_verification_failed');
    }

    if (!session) {
      console.error('[Kick OAuth] Invalid or expired state token');
      return res.redirect('/settings?error=kick_invalid_state&details=state_expired_or_invalid');
    }

    const clientId = getEnv('KICK_CLIENT_ID');
    const clientSecret = getEnv('KICK_CLIENT_SECRET');
    const redirectUri = getEnv('KICK_REDIRECT_URI');

    if (!clientId) {
      console.error('[Kick OAuth] KICK_CLIENT_ID not configured');
      return res.redirect('/settings?error=kick_config_error&details=missing_client_id');
    }

    if (!clientSecret) {
      console.error('[Kick OAuth] KICK_CLIENT_SECRET not configured');
      return res.redirect('/settings?error=kick_config_error&details=missing_client_secret');
    }

    if (!redirectUri) {
      console.error('[Kick OAuth] KICK_REDIRECT_URI not configured');
      return res.redirect('/settings?error=kick_config_error&details=missing_redirect_uri');
    }

    let tokenResponse;
    try {
      tokenResponse = await retryWithBackoff(async () => {
        return await axios.post(
          KICK_TOKEN_URL,
          new URLSearchParams({
            grant_type: 'authorization_code',
            code: code as string,
            redirect_uri: redirectUri,
            client_id: clientId,
            client_secret: clientSecret,
            code_verifier: session.codeVerifier,
          }).toString(),
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
      
      console.error('[Kick OAuth] Token exchange failed:', {
        status,
        error: errorData?.error || tokenError.message,
        message: errorData?.error_description,
      });

      if (tokenError.code === 'ECONNABORTED' || tokenError.code === 'ETIMEDOUT') {
        return res.redirect('/settings?error=kick_timeout&details=network_timeout');
      }
      
      if (tokenError.code === 'ENOTFOUND' || tokenError.code === 'ECONNREFUSED') {
        return res.redirect('/settings?error=kick_network_error&details=connection_failed');
      }

      if (status === 400) {
        return res.redirect('/settings?error=kick_invalid_code&details=authorization_code_invalid_or_expired');
      }

      if (status === 401) {
        return res.redirect('/settings?error=kick_invalid_credentials&details=client_credentials_invalid');
      }

      if (status === 429) {
        return res.redirect('/settings?error=kick_rate_limit&details=too_many_requests');
      }

      if (status && status >= 500) {
        return res.redirect('/settings?error=kick_server_error&details=kick_api_unavailable');
      }

      return res.redirect('/settings?error=kick_token_failed&details=unknown_error');
    }

    try {
      validateTokenResponse(tokenResponse.data);
    } catch (validationError: any) {
      console.error('[Kick OAuth] Invalid token response:', validationError.message, tokenResponse.data);
      return res.redirect('/settings?error=kick_invalid_response&details=malformed_token_response');
    }

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    const userInfo = await getKickUserInfo(access_token);
    if (!userInfo) {
      console.error('[Kick OAuth] Failed to get user info');
      return res.redirect('/settings?error=kick_user_info_failed&details=could_not_fetch_user_info');
    }

    const encryptedAccessToken = encryptToken(access_token);
    const encryptedRefreshToken = refresh_token ? encryptToken(refresh_token) : null;

    if (!refresh_token) {
      console.warn('[Kick OAuth] No refresh_token received for user', session.userId);
    }

    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);

    try {
      await storage.upsertPlatformConnection(
        session.userId,
        'kick',
        {
          platformUserId: String(userInfo.id),
          platformUsername: userInfo.username,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiresAt,
          isConnected: true,
          needsRefresh: false,
          lastConnectedAt: new Date(),
          connectionData: {
            scopes: KICK_SCOPES.split(' '),
            profilePic: userInfo.profilePic,
          },
        }
      );
    } catch (dbError: any) {
      console.error('[Kick OAuth] Database error storing connection:', dbError.message);
      return res.redirect('/settings?error=kick_database_error&details=failed_to_save_connection');
    }

    console.log(`[Kick OAuth] ✓ Successfully connected user ${session.userId} to Kick (@${userInfo.username})`);

    try {
      const allConnections = await storage.getPlatformConnections(session.userId);
      const connectedPlatforms = allConnections.filter(c => c.isConnected);
      if (connectedPlatforms.length === 1) {
        console.log(`[Kick OAuth] First platform connected, auto-starting bot for user ${session.userId}`);
        await storage.updateBotSettings(session.userId, { isActive: true });
        await botManager.startUserBot(session.userId);
      }
    } catch (autoStartError: any) {
      console.error('[Kick OAuth] Auto-start bot error (non-fatal):', autoStartError.message);
    }

    res.redirect('/settings?success=kick_connected');
  } catch (error: any) {
    console.error('[Kick OAuth] Unexpected callback error:', error.message, error.stack);
    res.redirect('/settings?error=kick_unexpected_error&details=internal_error');
  }
});

router.delete('/kick/disconnect', requireAuth, async (req, res) => {
  try {
    await storage.deletePlatformConnection(req.user!.id, 'kick');
    console.log(`[Kick OAuth] Disconnected user ${req.user!.id} from Kick`);
    res.json({ success: true, message: 'Kick disconnected successfully' });
  } catch (error: any) {
    console.error('[Kick OAuth] Disconnect error:', error.message);
    res.status(500).json({ 
      error: 'Failed to disconnect Kick account',
      message: 'An error occurred while disconnecting. Please try again later.'
    });
  }
});

export { refreshKickToken } from './kick-client';
export { getKickAccessToken } from './kick-client';

export default router;
