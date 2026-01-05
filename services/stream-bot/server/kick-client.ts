import axios, { AxiosError } from 'axios';
import { storage } from './storage';
import { getEnv } from './env';
import { encryptToken, decryptToken } from './crypto-utils';

const KICK_API_BASE = 'https://api.kick.com';
const KICK_TOKEN_URL = 'https://id.kick.com/oauth/token';

export interface KickUserInfo {
  id: number;
  username: string;
  email?: string;
  profilePic?: string;
}

export interface KickChannelInfo {
  id: number;
  slug: string;
  username: string;
  isLive: boolean;
  title?: string;
  category?: string;
  categoryId?: number;
  viewerCount?: number;
  thumbnailUrl?: string;
}

export interface KickStreamUpdateData {
  title?: string;
  categoryId?: number;
}

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
      console.log(`[Kick Client] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

export async function refreshKickToken(userId: string): Promise<string | null> {
  try {
    const connection = await storage.getPlatformConnection(userId, 'kick');
    if (!connection || !connection.refreshToken) {
      console.error('[Kick Client] No refresh token available for user', userId);
      return null;
    }

    const clientId = getEnv('KICK_CLIENT_ID');
    const clientSecret = getEnv('KICK_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      console.error('[Kick Client] OAuth credentials not configured');
      throw new Error('Kick OAuth credentials not configured');
    }

    console.log(`[Kick Client] Attempting to refresh token for user ${userId}...`);

    const refreshToken = decryptToken(connection.refreshToken);

    let tokenResponse;
    try {
      tokenResponse = await retryWithBackoff(async () => {
        return await axios.post(
          KICK_TOKEN_URL,
          new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
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
      
      console.error('[Kick Client] Token refresh failed:', {
        userId,
        status,
        error: errorData?.error || tokenError.message,
        message: errorData?.error_description,
      });

      if (status === 400 || status === 401) {
        console.error(`[Kick Client] ✗ Token has been revoked for user ${userId}`);
      }

      await storage.upsertPlatformConnection(userId, 'kick', {
        isConnected: false,
        needsRefresh: true,
      });
      
      return null;
    }

    const { access_token, refresh_token: new_refresh_token, expires_in } = tokenResponse.data;

    if (!access_token) {
      console.error('[Kick Client] Invalid refresh token response: missing access_token');
      await storage.upsertPlatformConnection(userId, 'kick', {
        isConnected: false,
        needsRefresh: true,
      });
      return null;
    }

    const encryptedAccessToken = encryptToken(access_token);
    const encryptedRefreshToken = new_refresh_token ? encryptToken(new_refresh_token) : connection.refreshToken;

    const tokenExpiresAt = new Date(Date.now() + (expires_in || 3600) * 1000);
    await storage.upsertPlatformConnection(userId, 'kick', {
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      tokenExpiresAt,
      isConnected: true,
      needsRefresh: false,
    });

    console.log(`[Kick Client] ✓ Successfully refreshed token for user ${userId} (expires at ${tokenExpiresAt.toISOString()})`);
    return access_token;
  } catch (error: any) {
    console.error(`[Kick Client] ✗ Unexpected error refreshing token for user ${userId}:`, error.message);
    
    try {
      await storage.upsertPlatformConnection(userId, 'kick', {
        isConnected: false,
        needsRefresh: true,
      });
    } catch (dbError: any) {
      console.error('[Kick Client] Database error marking connection as disconnected:', dbError.message);
    }
    
    return null;
  }
}

export async function getKickAccessToken(userId: string): Promise<string | null> {
  try {
    const connection = await storage.getPlatformConnection(userId, 'kick');
    if (!connection || !connection.accessToken) {
      return null;
    }

    const now = new Date();
    const expiryBuffer = new Date(now.getTime() + 5 * 60 * 1000);
    
    if (connection.tokenExpiresAt && connection.tokenExpiresAt <= expiryBuffer) {
      console.log('[Kick Client] Token expired or expiring soon, refreshing...');
      return await refreshKickToken(userId);
    }

    return decryptToken(connection.accessToken);
  } catch (error: any) {
    console.error('[Kick Client] Error getting access token:', error.message);
    return null;
  }
}

export async function getKickUserInfo(accessToken: string): Promise<KickUserInfo | null> {
  try {
    const response = await retryWithBackoff(async () => {
      return await axios.get(`${KICK_API_BASE}/api/v1/user`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
        timeout: 10000,
      });
    });

    const data = response.data?.data || response.data;
    
    return {
      id: data.id,
      username: data.username || data.name,
      email: data.email,
      profilePic: data.profile_pic || data.avatar,
    };
  } catch (error: any) {
    console.error('[Kick Client] Error getting user info:', error.response?.data || error.message);
    return null;
  }
}

export async function getKickChannelInfo(userId: string): Promise<KickChannelInfo | null> {
  try {
    const connection = await storage.getPlatformConnection(userId, 'kick');
    if (!connection || !connection.platformUsername) {
      return null;
    }

    const accessToken = await getKickAccessToken(userId);
    if (!accessToken) {
      return null;
    }

    const slug = connection.platformUsername.toLowerCase();

    const response = await retryWithBackoff(async () => {
      return await axios.get(`${KICK_API_BASE}/api/v2/channels/${slug}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
        timeout: 10000,
      });
    });

    const channel = response.data?.data || response.data;

    return {
      id: channel.id,
      slug: channel.slug || slug,
      username: channel.user?.username || connection.platformUsername,
      isLive: channel.livestream !== null,
      title: channel.livestream?.session_title || channel.recent_categories?.[0]?.name,
      category: channel.livestream?.categories?.[0]?.name || channel.recent_categories?.[0]?.name,
      categoryId: channel.livestream?.categories?.[0]?.id || channel.recent_categories?.[0]?.id,
      viewerCount: channel.livestream?.viewer_count,
      thumbnailUrl: channel.livestream?.thumbnail?.url,
    };
  } catch (error: any) {
    console.error('[Kick Client] Error getting channel info:', error.response?.data || error.message);
    return null;
  }
}

export async function updateKickStreamInfo(
  userId: string, 
  data: KickStreamUpdateData
): Promise<{ success: boolean; error?: string }> {
  try {
    const connection = await storage.getPlatformConnection(userId, 'kick');
    if (!connection || !connection.platformUserId) {
      return { success: false, error: 'Kick not connected' };
    }

    const accessToken = await getKickAccessToken(userId);
    if (!accessToken) {
      return { success: false, error: 'Failed to get access token' };
    }

    const channelId = connection.platformUserId;

    const updatePayload: any = {};
    if (data.title) updatePayload.session_title = data.title;
    if (data.categoryId) updatePayload.category_id = data.categoryId;

    await retryWithBackoff(async () => {
      return await axios.put(
        `${KICK_API_BASE}/api/v1/channels/${channelId}/stream`,
        updatePayload,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          timeout: 10000,
        }
      );
    });

    console.log(`[Kick Client] Successfully updated stream info for user ${userId}`);
    return { success: true };
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message;
    console.error('[Kick Client] Error updating stream info:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

export async function searchKickCategories(
  userId: string, 
  query: string
): Promise<{ id: number; name: string; thumbnail?: string }[]> {
  try {
    const accessToken = await getKickAccessToken(userId);
    if (!accessToken) {
      return [];
    }

    const response = await retryWithBackoff(async () => {
      return await axios.get(`${KICK_API_BASE}/api/v1/categories`, {
        params: { query, limit: 10 },
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
        timeout: 10000,
      });
    });

    const categories = response.data?.data || response.data || [];
    
    return categories.map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      thumbnail: cat.thumbnail || cat.banner,
    }));
  } catch (error: any) {
    console.error('[Kick Client] Error searching categories:', error.response?.data || error.message);
    return [];
  }
}
