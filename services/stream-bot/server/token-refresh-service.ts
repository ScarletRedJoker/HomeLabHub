import { db } from "./db";
import { platformConnections, users } from "@shared/schema";
import { eq, and, lt, isNotNull } from "drizzle-orm";
import { decryptToken, encryptToken } from "./crypto-utils";
import { getEnv } from "./env";
import axios from "axios";
import querystring from "querystring";

const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Check tokens every 30 minutes
const REFRESH_INTERVAL = 30 * 60 * 1000;

// Refresh tokens that expire within 24 hours
const REFRESH_THRESHOLD = 24 * 60 * 60 * 1000;

// Exponential backoff retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

/**
 * Token Refresh Service
 * Automatically refreshes platform OAuth tokens before expiry
 */
export class TokenRefreshService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * Start the token refresh service
   */
  start(): void {
    if (this.isRunning) {
      console.log('[TokenRefresh] Service already running');
      return;
    }

    console.log('[TokenRefresh] Starting token refresh service...');
    console.log(`[TokenRefresh] Checking tokens every ${REFRESH_INTERVAL / 60000} minutes`);
    console.log(`[TokenRefresh] Refreshing tokens that expire within ${REFRESH_THRESHOLD / 3600000} hours`);

    this.isRunning = true;

    // Run immediately on start
    this.refreshExpiredTokens().catch(error => {
      console.error('[TokenRefresh] Error during initial refresh:', error);
    });

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.refreshExpiredTokens().catch(error => {
        console.error('[TokenRefresh] Error during scheduled refresh:', error);
      });
    }, REFRESH_INTERVAL);
  }

  /**
   * Stop the token refresh service
   */
  stop(): void {
    if (!this.isRunning) {
      console.log('[TokenRefresh] Service not running');
      return;
    }

    console.log('[TokenRefresh] Stopping token refresh service...');

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
  }

  /**
   * Check all platform connections and refresh expired tokens
   */
  private async refreshExpiredTokens(): Promise<void> {
    try {
      const now = new Date();
      const expiryThreshold = new Date(now.getTime() + REFRESH_THRESHOLD);

      // Find all connections with tokens expiring soon
      const expiringConnections = await db
        .select()
        .from(platformConnections)
        .where(
          and(
            isNotNull(platformConnections.refreshToken),
            isNotNull(platformConnections.tokenExpiresAt),
            lt(platformConnections.tokenExpiresAt, expiryThreshold),
            eq(platformConnections.isConnected, true)
          )
        );

      if (expiringConnections.length === 0) {
        console.log('[TokenRefresh] No tokens need refreshing');
        return;
      }

      console.log(`[TokenRefresh] Found ${expiringConnections.length} token(s) to refresh`);

      // Refresh each connection
      for (const connection of expiringConnections) {
        await this.refreshConnection(connection);
      }
    } catch (error) {
      console.error('[TokenRefresh] Error checking expired tokens:', error);
    }
  }

  /**
   * Refresh a single platform connection
   */
  private async refreshConnection(connection: any): Promise<void> {
    const { userId, platform, id } = connection;

    try {
      console.log(`[TokenRefresh] Refreshing ${platform} token for user ${userId}...`);

      let newTokens;
      
      switch (platform) {
        case 'twitch':
          newTokens = await this.refreshTwitchToken(connection);
          break;
        case 'youtube':
          newTokens = await this.refreshYouTubeToken(connection);
          break;
        case 'kick':
          // Kick doesn't support refresh tokens yet
          console.log(`[TokenRefresh] Kick platform doesn't support token refresh`);
          return;
        default:
          console.warn(`[TokenRefresh] Unknown platform: ${platform}`);
          return;
      }

      if (!newTokens) {
        console.error(`[TokenRefresh] Failed to refresh ${platform} token for user ${userId}`);
        await this.handleRefreshFailure(connection);
        return;
      }

      // Update database with new tokens atomically
      await db
        .update(platformConnections)
        .set({
          accessToken: encryptToken(newTokens.accessToken),
          refreshToken: newTokens.refreshToken ? encryptToken(newTokens.refreshToken) : connection.refreshToken,
          tokenExpiresAt: newTokens.expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(platformConnections.id, id));

      console.log(`[TokenRefresh] ✓ Successfully refreshed ${platform} token for user ${userId}`);
    } catch (error: any) {
      console.error(`[TokenRefresh] Error refreshing ${platform} token for user ${userId}:`, error.message);
      await this.handleRefreshFailure(connection);
    }
  }

  /**
   * Refresh Twitch access token using refresh_token grant
   */
  private async refreshTwitchToken(connection: any): Promise<{ accessToken: string; refreshToken?: string; expiresAt: Date } | null> {
    const clientId = getEnv('TWITCH_CLIENT_ID');
    const clientSecret = getEnv('TWITCH_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      console.error('[TokenRefresh] Twitch OAuth credentials not configured');
      return null;
    }

    const refreshToken = decryptToken(connection.refreshToken);

    return await this.retryWithBackoff(async () => {
      const response = await axios.post(
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

      const { access_token, refresh_token: new_refresh_token, expires_in } = response.data;

      return {
        accessToken: access_token,
        refreshToken: new_refresh_token,
        expiresAt: new Date(Date.now() + expires_in * 1000),
      };
    });
  }

  /**
   * Refresh YouTube (Google) access token using refresh_token grant
   */
  private async refreshYouTubeToken(connection: any): Promise<{ accessToken: string; refreshToken?: string; expiresAt: Date } | null> {
    const clientId = getEnv('YOUTUBE_CLIENT_ID');
    const clientSecret = getEnv('YOUTUBE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      console.error('[TokenRefresh] YouTube OAuth credentials not configured');
      return null;
    }

    const refreshToken = decryptToken(connection.refreshToken);

    return await this.retryWithBackoff(async () => {
      const response = await axios.post(
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

      const { access_token, refresh_token: new_refresh_token, expires_in } = response.data;

      return {
        accessToken: access_token,
        refreshToken: new_refresh_token, // May be undefined if Google doesn't return a new one
        expiresAt: new Date(Date.now() + expires_in * 1000),
      };
    });
  }

  /**
   * Retry API calls with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    retries = MAX_RETRIES,
    delay = INITIAL_RETRY_DELAY
  ): Promise<T | null> {
    try {
      return await fn();
    } catch (error: any) {
      // Check if this is a revoked token error (401 or 400)
      if (error.response?.status === 401 || error.response?.status === 400) {
        const errorData = error.response?.data;
        if (errorData?.error === 'invalid_grant' || errorData?.message?.includes('revoked')) {
          console.error('[TokenRefresh] Token has been revoked:', errorData);
          throw error; // Don't retry on revoked tokens
        }
      }

      // Retry on network errors or 5xx errors
      if (retries > 0 && (!error.response || error.response.status >= 500)) {
        console.log(`[TokenRefresh] Retrying in ${delay}ms... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return await this.retryWithBackoff(fn, retries - 1, delay * 2);
      }

      throw error;
    }
  }

  /**
   * Handle refresh failure - mark connection as disconnected and notify user
   */
  private async handleRefreshFailure(connection: any): Promise<void> {
    try {
      // Mark connection as disconnected
      await db
        .update(platformConnections)
        .set({
          isConnected: false,
          updatedAt: new Date(),
        })
        .where(eq(platformConnections.id, connection.id));

      console.log(`[TokenRefresh] Marked ${connection.platform} connection as disconnected for user ${connection.userId}`);

      // Create notification for user
      await this.notifyUserReauthRequired(connection);
    } catch (error) {
      console.error('[TokenRefresh] Error handling refresh failure:', error);
    }
  }

  /**
   * Notify user that re-authentication is required
   */
  private async notifyUserReauthRequired(connection: any): Promise<void> {
    // Get user email
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, connection.userId))
      .limit(1);

    if (!user) {
      console.error(`[TokenRefresh] User ${connection.userId} not found`);
      return;
    }

    const platformName = connection.platform.charAt(0).toUpperCase() + connection.platform.slice(1);

    // Log notification (in a real system, this would send an email)
    console.log(`[TokenRefresh] 📧 NOTIFICATION: User ${user.email} needs to re-authenticate ${platformName}`);
    console.log(`[TokenRefresh]    Platform: ${platformName}`);
    console.log(`[TokenRefresh]    Action: User should log into dashboard and reconnect ${platformName}`);

    // TODO: Implement actual email notification using email service
    // await emailService.send({
    //   to: user.email,
    //   subject: `Re-authenticate your ${platformName} connection`,
    //   template: 'token-revoked',
    //   data: {
    //     platform: platformName,
    //     dashboardUrl: process.env.APP_URL || 'https://stream.rig-city.com',
    //   },
    // });

    // TODO: Create in-app notification
    // await db.insert(notifications).values({
    //   userId: connection.userId,
    //   type: 'token_expired',
    //   title: `${platformName} connection expired`,
    //   message: `Your ${platformName} connection has expired. Please reconnect to continue using bot features.`,
    //   platform: connection.platform,
    //   isRead: false,
    // });
  }

  /**
   * Manually trigger a refresh check (useful for testing)
   */
  async triggerRefresh(): Promise<void> {
    console.log('[TokenRefresh] Manually triggering token refresh...');
    await this.refreshExpiredTokens();
  }
}

// Singleton instance
export const tokenRefreshService = new TokenRefreshService();
