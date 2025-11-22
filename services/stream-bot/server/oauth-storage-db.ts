/**
 * Database-Backed OAuth Session Storage
 * 
 * Replaces in-memory oauth-storage.ts with persistent, scalable database storage
 * 
 * Benefits:
 * - Survives server restarts
 * - Supports horizontal scaling (multiple server instances)
 * - Automatic expiration and cleanup
 * - Audit trail for security
 * - Replay attack prevention
 */

import { db } from "./db";
import { sql } from "drizzle-orm";
import { eq, lt, and } from "drizzle-orm";
import { oauthSessions } from "@shared/schema";

export type OAuthSession = typeof oauthSessions.$inferSelect;
export type InsertOAuthSession = typeof oauthSessions.$inferInsert;

interface OAuthSessionData {
  userId: string;
  platform: string;
  codeVerifier?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
}

/**
 * Database-Backed OAuth Storage Service
 */
export class OAuthStorageDB {
  private readonly DEFAULT_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

  /**
   * Create a new OAuth session
   * 
   * @param state - Unique state parameter for OAuth flow
   * @param sessionData - Session data (userId, platform, etc.)
   * @param expiryMs - Session expiry in milliseconds (default: 10 minutes)
   */
  async set(state: string, sessionData: OAuthSessionData, expiryMs?: number): Promise<void> {
    try {
      const expiry = expiryMs || this.DEFAULT_EXPIRY_MS;
      const expiresAt = new Date(Date.now() + expiry);

      await db.insert(oauthSessions).values({
        state,
        userId: sessionData.userId,
        platform: sessionData.platform,
        codeVerifier: sessionData.codeVerifier,
        metadata: sessionData.metadata || {},
        expiresAt,
        ipAddress: sessionData.ipAddress,
      });

      console.log(`[OAuthStorageDB] Created OAuth session for user ${sessionData.userId} (${sessionData.platform}), expires at ${expiresAt.toISOString()}`);
    } catch (error: any) {
      // Handle duplicate state (should be extremely rare with crypto.randomBytes)
      if (error.code === '23505') { // PostgreSQL unique violation
        console.error('[OAuthStorageDB] Duplicate state detected - possible replay attack attempt');
        throw new Error('OAuth state collision detected');
      }
      throw error;
    }
  }

  /**
   * Retrieve and consume OAuth session (one-time use)
   * 
   * Uses atomic UPDATE to prevent race conditions and replay attacks.
   * Only one concurrent request can successfully consume a state.
   * 
   * @param state - OAuth state parameter
   * @returns Session data or null if not found/expired/used
   */
  async get(state: string): Promise<OAuthSessionData | null> {
    try {
      // ATOMIC CONSUME: Update and return in single query (prevents race conditions)
      // This ensures only ONE concurrent request can consume the state
      const [session] = await db
        .update(oauthSessions)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(oauthSessions.state, state),
            sql`${oauthSessions.expiresAt} > NOW()`, // Not expired
            sql`${oauthSessions.usedAt} IS NULL` // Not already used
          )
        )
        .returning();

      if (!session) {
        // Session not found, already used, or expired
        // Check which case for better logging
        const [existingSession] = await db
          .select()
          .from(oauthSessions)
          .where(eq(oauthSessions.state, state))
          .limit(1);

        if (!existingSession) {
          console.warn(`[OAuthStorageDB] OAuth session not found for state: ${state}`);
        } else if (existingSession.usedAt) {
          console.error(`[OAuthStorageDB] ⚠️  SECURITY: OAuth session already used! Possible replay attack for state: ${state}`);
        } else if (new Date() > existingSession.expiresAt) {
          console.warn(`[OAuthStorageDB] OAuth session expired for state: ${state}`);
        }

        return null;
      }

      console.log(`[OAuthStorageDB] ✅ Retrieved and consumed OAuth session for user ${session.userId} (${session.platform})`);

      return {
        userId: session.userId,
        platform: session.platform,
        codeVerifier: session.codeVerifier || undefined,
        metadata: (session.metadata as Record<string, any>) || undefined,
      };
    } catch (error) {
      console.error('[OAuthStorageDB] Error retrieving OAuth session:', error);
      return null;
    }
  }

  /**
   * Consume OAuth session (alias for get() for backward compatibility)
   * 
   * @param state - OAuth state parameter
   * @returns Session data or null if not found/expired/used
   */
  async consume(state: string): Promise<OAuthSessionData | null> {
    return this.get(state);
  }

  /**
   * Check if OAuth session exists
   */
  async has(state: string): Promise<boolean> {
    try {
      const [session] = await db
        .select()
        .from(oauthSessions)
        .where(
          and(
            eq(oauthSessions.state, state),
            sql`${oauthSessions.expiresAt} > NOW()`,
            sql`${oauthSessions.usedAt} IS NULL`
          )
        )
        .limit(1);

      return !!session;
    } catch (error) {
      console.error('[OAuthStorageDB] Error checking OAuth session:', error);
      return false;
    }
  }

  /**
   * Delete OAuth session
   */
  async delete(state: string): Promise<void> {
    try {
      await db.delete(oauthSessions).where(eq(oauthSessions.state, state));
    } catch (error) {
      console.error('[OAuthStorageDB] Error deleting OAuth session:', error);
    }
  }

  /**
   * Cleanup expired OAuth sessions
   * Should be run periodically (e.g., every hour)
   */
  async cleanupExpired(): Promise<number> {
    try {
      const result = await db
        .delete(oauthSessions)
        .where(lt(oauthSessions.expiresAt, new Date()));

      const deletedCount = result.rowCount || 0;
      
      if (deletedCount > 0) {
        console.log(`[OAuthStorageDB] Cleaned up ${deletedCount} expired OAuth sessions`);
      }

      return deletedCount;
    } catch (error) {
      console.error('[OAuthStorageDB] Error cleaning up expired sessions:', error);
      return 0;
    }
  }

  /**
   * Get session statistics (for monitoring)
   */
  async getStats(): Promise<{
    total: number;
    expired: number;
    used: number;
    active: number;
  }> {
    try {
      const result = await db.execute(sql`
        SELECT 
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE expires_at < NOW())::int AS expired,
          COUNT(*) FILTER (WHERE used_at IS NOT NULL)::int AS used,
          COUNT(*) FILTER (WHERE expires_at > NOW() AND used_at IS NULL)::int AS active
        FROM ${oauthSessions}
      `);

      const stats = result.rows?.[0] || { total: 0, expired: 0, used: 0, active: 0 };

      return {
        total: stats.total || 0,
        expired: stats.expired || 0,
        used: stats.used || 0,
        active: stats.active || 0,
      };
    } catch (error) {
      console.error('[OAuthStorageDB] Error getting session stats:', error);
      return { total: 0, expired: 0, used: 0, active: 0 };
    }
  }
}

// Singleton instance
export const oauthStorageDB = new OAuthStorageDB();

/**
 * Start periodic cleanup job for expired OAuth sessions
 * Runs every hour
 */
export function startOAuthCleanupJob(): NodeJS.Timeout {
  const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

  const interval = setInterval(async () => {
    console.log('[OAuthStorageDB] Running scheduled cleanup of expired OAuth sessions...');
    const deleted = await oauthStorageDB.cleanupExpired();
    
    // Log stats for monitoring
    const stats = await oauthStorageDB.getStats();
    console.log(`[OAuthStorageDB] Session stats - Total: ${stats.total}, Active: ${stats.active}, Used: ${stats.used}, Expired: ${stats.expired}`);
  }, CLEANUP_INTERVAL);

  console.log('[OAuthStorageDB] Scheduled hourly OAuth session cleanup job');
  
  // Run immediately on start
  oauthStorageDB.cleanupExpired().catch(error => {
    console.error('[OAuthStorageDB] Error during initial cleanup:', error);
  });

  return interval;
}

/**
 * Migration SQL to add oauth_sessions table
 * Add this to your database migration system
 */
export const OAUTH_SESSIONS_MIGRATION = `
-- OAuth Sessions Table for scalable, persistent OAuth state storage
CREATE TABLE IF NOT EXISTS oauth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  code_verifier TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  ip_address TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS oauth_sessions_state_idx ON oauth_sessions(state);
CREATE INDEX IF NOT EXISTS oauth_sessions_expires_at_idx ON oauth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS oauth_sessions_user_id_idx ON oauth_sessions(user_id);

-- Cleanup function to automatically delete expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_sessions() RETURNS void AS $$
BEGIN
  DELETE FROM oauth_sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Optional: Add PostgreSQL trigger to clean up on insert
-- (Runs cleanup every time a new session is created)
CREATE OR REPLACE FUNCTION trigger_cleanup_oauth_sessions() RETURNS TRIGGER AS $$
BEGIN
  -- Only cleanup occasionally to avoid overhead (10% chance)
  IF random() < 0.1 THEN
    PERFORM cleanup_expired_oauth_sessions();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER oauth_sessions_cleanup_trigger
  AFTER INSERT ON oauth_sessions
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_cleanup_oauth_sessions();
`;
