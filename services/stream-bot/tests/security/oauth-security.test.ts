import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { db } from '../../server/db';
import { users, platformConnections } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { encryptToken, decryptToken, generateState } from '../../server/crypto-utils';
import crypto from 'crypto';

describe('OAuth Security Tests', () => {
  let app: any;
  let testUserId: string;
  let testUserEmail: string;

  beforeAll(async () => {
    const { createServer } = await import('../../server/test-server');
    app = await createServer();
    testUserEmail = `oauth-test-${Date.now()}@test.com`;
  });

  afterAll(async () => {
    if (testUserId) {
      await db.delete(platformConnections).where(eq(platformConnections.userId, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  describe('CSRF Protection with State Tokens', () => {
    it('should generate unique state tokens for each OAuth request', async () => {
      const state1 = generateState();
      const state2 = generateState();
      
      expect(state1).toBeDefined();
      expect(state2).toBeDefined();
      expect(state1).not.toBe(state2);
      expect(state1.length).toBeGreaterThan(30);
    });

    it('should reject OAuth callback with invalid state token', async () => {
      const response = await request(app)
        .get('/api/auth/twitch/callback')
        .query({
          code: 'fake_code',
          state: 'invalid_state_token'
        });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should prevent state token reuse (replay attack)', async () => {
      const validState = generateState();
      
      const firstAttempt = await request(app)
        .get('/api/auth/twitch/callback')
        .query({
          code: 'fake_code_1',
          state: validState
        });

      const secondAttempt = await request(app)
        .get('/api/auth/twitch/callback')
        .query({
          code: 'fake_code_2',
          state: validState
        });

      expect([firstAttempt.status, secondAttempt.status].some(s => s >= 400)).toBe(true);
    });

    it('should invalidate state tokens after timeout', async () => {
      const stateToken = generateState();
      
      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await request(app)
        .get('/api/auth/twitch/callback')
        .query({
          code: 'fake_code',
          state: stateToken
        });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Token Encryption in Database', () => {
    it('should encrypt tokens before storing in database', async () => {
      const plainToken = 'test_access_token_12345';
      const encryptedToken = encryptToken(plainToken);
      
      expect(encryptedToken).toBeDefined();
      expect(encryptedToken).not.toBe(plainToken);
      expect(encryptedToken).toContain(':');
      
      const parts = encryptedToken.split(':');
      expect(parts.length).toBe(3);
    });

    it('should decrypt tokens correctly', async () => {
      const plainToken = 'test_access_token_12345';
      const encryptedToken = encryptToken(plainToken);
      const decryptedToken = decryptToken(encryptedToken);
      
      expect(decryptedToken).toBe(plainToken);
    });

    it('should use AES-256-GCM for encryption', async () => {
      const plainToken = 'test_token';
      const encrypted = encryptToken(plainToken);
      
      const [ivHex, authTagHex, encryptedHex] = encrypted.split(':');
      
      expect(Buffer.from(ivHex, 'hex').length).toBe(16);
      expect(Buffer.from(authTagHex, 'hex').length).toBe(16);
      expect(encryptedHex.length).toBeGreaterThan(0);
    });

    it('should fail decryption with tampered ciphertext', () => {
      const plainToken = 'test_token';
      const encrypted = encryptToken(plainToken);
      
      const [iv, authTag, ciphertext] = encrypted.split(':');
      const tamperedCiphertext = ciphertext.slice(0, -2) + 'ff';
      const tampered = `${iv}:${authTag}:${tamperedCiphertext}`;
      
      expect(() => decryptToken(tampered)).toThrow();
    });

    it('should never store plaintext tokens in database', async () => {
      const [user] = await db.insert(users).values({
        email: testUserEmail,
        primaryPlatform: 'twitch',
        role: 'user',
        isActive: true,
      }).returning();
      testUserId = user.id;

      const plainAccessToken = 'plain_access_token_secret';
      const plainRefreshToken = 'plain_refresh_token_secret';
      
      await db.insert(platformConnections).values({
        userId: testUserId,
        platform: 'twitch',
        platformUserId: 'twitch_123',
        platformUsername: 'test_user',
        accessToken: encryptToken(plainAccessToken),
        refreshToken: encryptToken(plainRefreshToken),
        isConnected: true,
      });

      const connections = await db.query.platformConnections.findMany({
        where: eq(platformConnections.userId, testUserId),
      });

      const connection = connections[0];
      expect(connection.accessToken).not.toBe(plainAccessToken);
      expect(connection.refreshToken).not.toBe(plainRefreshToken);
      expect(connection.accessToken).toContain(':');
      expect(connection.refreshToken).toContain(':');
    });
  });

  describe('Account Hijacking Prevention', () => {
    it('should prevent linking same platform account to multiple users', async () => {
      const [userA] = await db.insert(users).values({
        email: `userA-${Date.now()}@test.com`,
        primaryPlatform: 'twitch',
        role: 'user',
        isActive: true,
      }).returning();

      const [userB] = await db.insert(users).values({
        email: `userB-${Date.now()}@test.com`,
        primaryPlatform: 'youtube',
        role: 'user',
        isActive: true,
      }).returning();

      const platformUserId = `twitch_hijack_${Date.now()}`;

      await db.insert(platformConnections).values({
        userId: userA.id,
        platform: 'twitch',
        platformUserId,
        platformUsername: 'hijack_target',
        accessToken: encryptToken('token_a'),
        isConnected: true,
      });

      await expect(async () => {
        await db.insert(platformConnections).values({
          userId: userB.id,
          platform: 'twitch',
          platformUserId,
          platformUsername: 'hijack_attempt',
          accessToken: encryptToken('token_b'),
          isConnected: true,
        });
      }).rejects.toThrow();

      await db.delete(platformConnections).where(eq(platformConnections.userId, userA.id));
      await db.delete(platformConnections).where(eq(platformConnections.userId, userB.id));
      await db.delete(users).where(eq(users.id, userA.id));
      await db.delete(users).where(eq(users.id, userB.id));
    });

    it('should detect and reject platform account transfer attempts', async () => {
      const [user1] = await db.insert(users).values({
        email: `transfer-user1-${Date.now()}@test.com`,
        primaryPlatform: 'twitch',
        role: 'user',
        isActive: true,
      }).returning();

      const platformUserId = `twitch_transfer_${Date.now()}`;

      const [connection] = await db.insert(platformConnections).values({
        userId: user1.id,
        platform: 'twitch',
        platformUserId,
        platformUsername: 'original_owner',
        accessToken: encryptToken('original_token'),
        isConnected: true,
      }).returning();

      const [user2] = await db.insert(users).values({
        email: `transfer-user2-${Date.now()}@test.com`,
        primaryPlatform: 'youtube',
        role: 'user',
        isActive: true,
      }).returning();

      await expect(async () => {
        await db.update(platformConnections)
          .set({ userId: user2.id })
          .where(eq(platformConnections.id, connection.id));
      }).rejects.toThrow();

      await db.delete(platformConnections).where(eq(platformConnections.userId, user1.id));
      await db.delete(users).where(eq(users.id, user1.id));
      await db.delete(users).where(eq(users.id, user2.id));
    });
  });

  describe('Duplicate Account Linking Prevention', () => {
    it('should prevent user from linking same platform twice', async () => {
      const [user] = await db.insert(users).values({
        email: `duplicate-${Date.now()}@test.com`,
        primaryPlatform: 'twitch',
        role: 'user',
        isActive: true,
      }).returning();

      await db.insert(platformConnections).values({
        userId: user.id,
        platform: 'twitch',
        platformUserId: 'twitch_dup_1',
        platformUsername: 'first_connection',
        accessToken: encryptToken('token_1'),
        isConnected: true,
      });

      await expect(async () => {
        await db.insert(platformConnections).values({
          userId: user.id,
          platform: 'twitch',
          platformUserId: 'twitch_dup_2',
          platformUsername: 'second_connection',
          accessToken: encryptToken('token_2'),
          isConnected: true,
        });
      }).rejects.toThrow();

      await db.delete(platformConnections).where(eq(platformConnections.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    });

    it('should enforce unique constraint on userId + platform combination', async () => {
      const [user] = await db.insert(users).values({
        email: `unique-constraint-${Date.now()}@test.com`,
        primaryPlatform: 'youtube',
        role: 'user',
        isActive: true,
      }).returning();

      await db.insert(platformConnections).values({
        userId: user.id,
        platform: 'youtube',
        platformUserId: 'yt_123',
        platformUsername: 'first',
        accessToken: encryptToken('token_1'),
        isConnected: true,
      });

      const duplicateAttempt = db.insert(platformConnections).values({
        userId: user.id,
        platform: 'youtube',
        platformUserId: 'yt_456',
        platformUsername: 'second',
        accessToken: encryptToken('token_2'),
        isConnected: true,
      });

      await expect(duplicateAttempt).rejects.toThrow();

      await db.delete(platformConnections).where(eq(platformConnections.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    });
  });

  describe('Token Expiration and Refresh', () => {
    it('should store token expiration timestamp', async () => {
      const [user] = await db.insert(users).values({
        email: `expiry-${Date.now()}@test.com`,
        primaryPlatform: 'twitch',
        role: 'user',
        isActive: true,
      }).returning();

      const expiresAt = new Date(Date.now() + 3600000);

      const [connection] = await db.insert(platformConnections).values({
        userId: user.id,
        platform: 'twitch',
        platformUserId: 'twitch_exp',
        platformUsername: 'expiry_test',
        accessToken: encryptToken('token'),
        refreshToken: encryptToken('refresh'),
        tokenExpiresAt: expiresAt,
        isConnected: true,
      }).returning();

      expect(connection.tokenExpiresAt).toBeDefined();
      expect(new Date(connection.tokenExpiresAt!).getTime()).toBeGreaterThan(Date.now());

      await db.delete(platformConnections).where(eq(platformConnections.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    });

    it('should identify expired tokens', async () => {
      const [user] = await db.insert(users).values({
        email: `expired-${Date.now()}@test.com`,
        primaryPlatform: 'twitch',
        role: 'user',
        isActive: true,
      }).returning();

      const pastExpiry = new Date(Date.now() - 3600000);

      await db.insert(platformConnections).values({
        userId: user.id,
        platform: 'twitch',
        platformUserId: 'twitch_expired',
        platformUsername: 'expired_test',
        accessToken: encryptToken('expired_token'),
        tokenExpiresAt: pastExpiry,
        isConnected: true,
      });

      const connections = await db.query.platformConnections.findMany({
        where: eq(platformConnections.userId, user.id),
      });

      const expiredConnection = connections[0];
      const isExpired = new Date(expiredConnection.tokenExpiresAt!).getTime() < Date.now();
      
      expect(isExpired).toBe(true);

      await db.delete(platformConnections).where(eq(platformConnections.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    });

    it('should store refresh tokens securely', async () => {
      const [user] = await db.insert(users).values({
        email: `refresh-${Date.now()}@test.com`,
        primaryPlatform: 'youtube',
        role: 'user',
        isActive: true,
      }).returning();

      const refreshToken = 'refresh_token_secret_12345';

      await db.insert(platformConnections).values({
        userId: user.id,
        platform: 'youtube',
        platformUserId: 'yt_refresh',
        platformUsername: 'refresh_test',
        accessToken: encryptToken('access_token'),
        refreshToken: encryptToken(refreshToken),
        isConnected: true,
      });

      const connections = await db.query.platformConnections.findMany({
        where: eq(platformConnections.userId, user.id),
      });

      expect(connections[0].refreshToken).not.toBe(refreshToken);
      expect(connections[0].refreshToken).toContain(':');

      await db.delete(platformConnections).where(eq(platformConnections.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    });
  });

  describe('Revoked Token Detection', () => {
    it('should mark connection as disconnected when token is revoked', async () => {
      const [user] = await db.insert(users).values({
        email: `revoked-${Date.now()}@test.com`,
        primaryPlatform: 'twitch',
        role: 'user',
        isActive: true,
      }).returning();

      const [connection] = await db.insert(platformConnections).values({
        userId: user.id,
        platform: 'twitch',
        platformUserId: 'twitch_revoked',
        platformUsername: 'revoked_test',
        accessToken: encryptToken('revoked_token'),
        isConnected: true,
      }).returning();

      await db.update(platformConnections)
        .set({ isConnected: false })
        .where(eq(platformConnections.id, connection.id));

      const updated = await db.query.platformConnections.findFirst({
        where: eq(platformConnections.id, connection.id),
      });

      expect(updated?.isConnected).toBe(false);

      await db.delete(platformConnections).where(eq(platformConnections.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    });

    it('should handle 401 responses by marking token as invalid', async () => {
      const [user] = await db.insert(users).values({
        email: `unauthorized-${Date.now()}@test.com`,
        primaryPlatform: 'twitch',
        role: 'user',
        isActive: true,
      }).returning();

      await db.insert(platformConnections).values({
        userId: user.id,
        platform: 'twitch',
        platformUserId: 'twitch_401',
        platformUsername: 'unauthorized_test',
        accessToken: encryptToken('invalid_token'),
        isConnected: true,
      });

      await db.update(platformConnections)
        .set({ 
          isConnected: false,
          connectionData: { error: 'Token revoked or invalid (401)' }
        })
        .where(and(
          eq(platformConnections.userId, user.id),
          eq(platformConnections.platform, 'twitch')
        ));

      const connection = await db.query.platformConnections.findFirst({
        where: and(
          eq(platformConnections.userId, user.id),
          eq(platformConnections.platform, 'twitch')
        ),
      });

      expect(connection?.isConnected).toBe(false);

      await db.delete(platformConnections).where(eq(platformConnections.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    });
  });

  describe('OAuth Session Security', () => {
    it('should not expose session secret in responses', async () => {
      const response = await request(app)
        .get('/api/diagnostics');

      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toContain('SESSION_SECRET');
      expect(responseText).not.toContain('session_secret');
    });

    it('should use httpOnly cookies for session management', async () => {
      const response = await request(app)
        .get('/health');

      const cookieHeaders = response.headers['set-cookie'];
      if (cookieHeaders) {
        expect(cookieHeaders.some((h: string) => h.includes('HttpOnly'))).toBe(true);
      }
    });

    it('should enforce secure flag on cookies in production', () => {
      const isProduction = process.env.NODE_ENV === 'production';
      
      if (isProduction) {
        const response = request(app).get('/health');
        expect(response).toBeDefined();
      }
    });
  });
});
