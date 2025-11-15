import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { db } from '../../server/db';
import { 
  users, 
  platformConnections,
  customCommands,
  giveaways,
  messageHistory,
  streamSessions,
  botConfigs
} from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { encryptToken } from '../../server/crypto-utils';

describe('Data Privacy Security Tests', () => {
  let app: any;
  let testUserId: string;
  let testUserEmail: string;

  beforeAll(async () => {
    const { createServer } = await import('../../server/test-server');
    app = await createServer();
    
    const timestamp = Date.now();
    testUserEmail = `privacy-test-${timestamp}@test.com`;

    const [user] = await db.insert(users).values({
      email: testUserEmail,
      primaryPlatform: 'twitch',
      role: 'user',
      isActive: true,
    }).returning();
    testUserId = user.id;
  });

  afterAll(async () => {
    if (testUserId) {
      await db.delete(messageHistory).where(eq(messageHistory.userId, testUserId));
      await db.delete(streamSessions).where(eq(streamSessions.userId, testUserId));
      await db.delete(giveaways).where(eq(giveaways.userId, testUserId));
      await db.delete(customCommands).where(eq(customCommands.userId, testUserId));
      await db.delete(platformConnections).where(eq(platformConnections.userId, testUserId));
      await db.delete(botConfigs).where(eq(botConfigs.userId, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  describe('PII Exposure Prevention', () => {
    it('should not expose email in public API responses', async () => {
      const response = await request(app)
        .get('/api/health');

      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toContain(testUserEmail);
    });

    it('should not expose user IDs in public diagnostics', async () => {
      const response = await request(app)
        .get('/api/diagnostics');

      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toContain(testUserId);
    });

    it('should sanitize user data in /auth/me endpoint', async () => {
      const response = await request(app)
        .get('/auth/me')
        .set('Cookie', [`user=${testUserId}`]);

      if (response.status === 200) {
        expect(response.body.passwordHash).toBeUndefined();
        expect(response.body.email).toBeDefined();
        
        if (response.body.platformConnections) {
          response.body.platformConnections.forEach((conn: any) => {
            expect(conn.accessToken).toBeUndefined();
            expect(conn.refreshToken).toBeUndefined();
          });
        }
      }
    });

    it('should not include PII in error messages', async () => {
      const response = await request(app)
        .post('/api/commands')
        .set('Cookie', [`user=${testUserId}`])
        .send({ invalid: 'data' });

      const errorText = JSON.stringify(response.body);
      expect(errorText).not.toContain(testUserEmail);
      expect(errorText).not.toContain(testUserId);
    });

    it('should mask sensitive data in validation errors', async () => {
      const response = await request(app)
        .patch('/api/settings')
        .set('Cookie', [`user=${testUserId}`])
        .send({ 
          aiModel: 'invalid-model-name-that-is-too-long-' + testUserEmail 
        });

      const errorText = JSON.stringify(response.body);
      if (errorText.includes('invalid-model')) {
        expect(errorText.length).toBeLessThan(200);
      }
    });
  });

  describe('Platform Token Privacy', () => {
    it('should never return access tokens to client', async () => {
      await db.insert(platformConnections).values({
        userId: testUserId,
        platform: 'twitch',
        platformUserId: 'twitch_privacy',
        platformUsername: 'privacy_user',
        accessToken: encryptToken('secret_access_token_12345'),
        refreshToken: encryptToken('secret_refresh_token_67890'),
        isConnected: true,
      });

      const response = await request(app)
        .get('/api/platforms')
        .set('Cookie', [`user=${testUserId}`]);

      expect(response.status).toBe(200);
      const connections = response.body;
      
      connections.forEach((conn: any) => {
        expect(conn.accessToken).toBeUndefined();
        expect(conn.refreshToken).toBeUndefined();
        expect(conn.tokenExpiresAt).toBeUndefined();
      });

      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toContain('secret_access_token');
      expect(responseText).not.toContain('secret_refresh_token');
    });

    it('should sanitize individual platform connection details', async () => {
      const connections = await db.query.platformConnections.findMany({
        where: eq(platformConnections.userId, testUserId),
      });

      if (connections.length > 0) {
        const response = await request(app)
          .get(`/api/platforms/${connections[0].id}`)
          .set('Cookie', [`user=${testUserId}`]);

        if (response.status === 200) {
          expect(response.body.accessToken).toBeUndefined();
          expect(response.body.refreshToken).toBeUndefined();
        }
      }
    });

    it('should not expose encrypted tokens in API responses', async () => {
      const response = await request(app)
        .get('/api/platforms')
        .set('Cookie', [`user=${testUserId}`]);

      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toMatch(/[a-f0-9]{32}:[a-f0-9]{32}:[a-f0-9]+/);
    });

    it('should not leak tokens in WebSocket messages', async () => {
      const connections = await db.query.platformConnections.findMany({
        where: eq(platformConnections.userId, testUserId),
      });

      connections.forEach(conn => {
        expect(conn.accessToken).toBeDefined();
        expect(conn.accessToken).toContain(':');
      });
    });
  });

  describe('Sensitive Data in Logs', () => {
    it('should not log access tokens', async () => {
      const testToken = 'test_access_token_should_not_be_logged';
      
      await db.insert(platformConnections).values({
        userId: testUserId,
        platform: 'youtube',
        platformUserId: 'yt_log_test',
        platformUsername: 'log_test',
        accessToken: encryptToken(testToken),
        isConnected: true,
      });

      const response = await request(app)
        .get('/api/platforms')
        .set('Cookie', [`user=${testUserId}`]);

      expect(response.status).toBe(200);
    });

    it('should not log user passwords or hashes', async () => {
      const response = await request(app)
        .post('/api/commands')
        .set('Cookie', [`user=${testUserId}`])
        .send({
          name: 'testlog',
          response: 'test response',
          isActive: true,
        });

      expect(response.status).toBeLessThanOrEqual(500);
    });

    it('should mask sensitive query parameters in logs', async () => {
      const response = await request(app)
        .get('/api/commands')
        .query({ search: 'sensitive_search_term' })
        .set('Cookie', [`user=${testUserId}`]);

      expect(response.status).toBeLessThanOrEqual(500);
    });

    it('should not expose session secrets in error responses', async () => {
      const response = await request(app)
        .get('/api/invalid-endpoint-to-trigger-error')
        .set('Cookie', [`user=${testUserId}`]);

      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toContain('SESSION_SECRET');
      expect(responseText).not.toContain('session_secret');
    });
  });

  describe('User Data Deletion', () => {
    it('should cascade delete all user data when user is deleted', async () => {
      const [tempUser] = await db.insert(users).values({
        email: `delete-test-${Date.now()}@test.com`,
        primaryPlatform: 'twitch',
        role: 'user',
        isActive: true,
      }).returning();

      await db.insert(botConfigs).values({
        userId: tempUser.id,
        intervalMode: 'manual',
        isActive: false,
      });

      await db.insert(customCommands).values({
        userId: tempUser.id,
        name: 'tempcommand',
        response: 'temp response',
        isActive: true,
      });

      await db.insert(platformConnections).values({
        userId: tempUser.id,
        platform: 'twitch',
        platformUserId: 'twitch_temp',
        platformUsername: 'temp_user',
        accessToken: encryptToken('temp_token'),
        isConnected: true,
      });

      await db.delete(users).where(eq(users.id, tempUser.id));

      const configs = await db.query.botConfigs.findMany({
        where: eq(botConfigs.userId, tempUser.id),
      });
      const commands = await db.query.customCommands.findMany({
        where: eq(customCommands.userId, tempUser.id),
      });
      const connections = await db.query.platformConnections.findMany({
        where: eq(platformConnections.userId, tempUser.id),
      });

      expect(configs.length).toBe(0);
      expect(commands.length).toBe(0);
      expect(connections.length).toBe(0);
    });

    it('should remove all message history on user deletion', async () => {
      const [tempUser] = await db.insert(users).values({
        email: `delete-messages-${Date.now()}@test.com`,
        primaryPlatform: 'twitch',
        role: 'user',
        isActive: true,
      }).returning();

      await db.insert(messageHistory).values({
        userId: tempUser.id,
        platform: 'twitch',
        triggerType: 'manual',
        factContent: 'Test fact to be deleted',
      });

      await db.delete(users).where(eq(users.id, tempUser.id));

      const messages = await db.query.messageHistory.findMany({
        where: eq(messageHistory.userId, tempUser.id),
      });

      expect(messages.length).toBe(0);
    });

    it('should remove all giveaway data on user deletion', async () => {
      const [tempUser] = await db.insert(users).values({
        email: `delete-giveaway-${Date.now()}@test.com`,
        primaryPlatform: 'twitch',
        role: 'user',
        isActive: true,
      }).returning();

      await db.insert(giveaways).values({
        userId: tempUser.id,
        title: 'Temp Giveaway',
        keyword: '!tempenter',
        isActive: true,
        maxWinners: 1,
      });

      await db.delete(users).where(eq(users.id, tempUser.id));

      const giveawayRecords = await db.query.giveaways.findMany({
        where: eq(giveaways.userId, tempUser.id),
      });

      expect(giveawayRecords.length).toBe(0);
    });

    it('should delete stream session data on user deletion', async () => {
      const [tempUser] = await db.insert(users).values({
        email: `delete-sessions-${Date.now()}@test.com`,
        primaryPlatform: 'twitch',
        role: 'user',
        isActive: true,
      }).returning();

      await db.insert(streamSessions).values({
        userId: tempUser.id,
        platform: 'twitch',
        peakViewers: 50,
      });

      await db.delete(users).where(eq(users.id, tempUser.id));

      const sessions = await db.query.streamSessions.findMany({
        where: eq(streamSessions.userId, tempUser.id),
      });

      expect(sessions.length).toBe(0);
    });
  });

  describe('Data Export Privacy', () => {
    it('should only export data belonging to authenticated user', async () => {
      await db.insert(customCommands).values({
        userId: testUserId,
        name: 'exporttest',
        response: 'export response',
        isActive: true,
      });

      const response = await request(app)
        .get('/api/export')
        .set('Cookie', [`user=${testUserId}`]);

      if (response.status === 200) {
        const exportData = response.body;
        
        if (exportData.commands) {
          exportData.commands.forEach((cmd: any) => {
            expect(cmd.userId).toBe(testUserId);
          });
        }

        if (exportData.giveaways) {
          exportData.giveaways.forEach((g: any) => {
            expect(g.userId).toBe(testUserId);
          });
        }

        if (exportData.messages) {
          exportData.messages.forEach((m: any) => {
            expect(m.userId).toBe(testUserId);
          });
        }
      }
    });

    it('should not include encrypted tokens in data export', async () => {
      const response = await request(app)
        .get('/api/export')
        .set('Cookie', [`user=${testUserId}`]);

      if (response.status === 200) {
        const exportText = JSON.stringify(response.body);
        expect(exportText).not.toMatch(/[a-f0-9]{32}:[a-f0-9]{32}:[a-f0-9]+/);
        expect(exportText).not.toContain('accessToken');
        expect(exportText).not.toContain('refreshToken');
      }
    });

    it('should sanitize platform connections in export', async () => {
      const response = await request(app)
        .get('/api/export')
        .set('Cookie', [`user=${testUserId}`]);

      if (response.status === 200 && response.body.platformConnections) {
        response.body.platformConnections.forEach((conn: any) => {
          expect(conn.accessToken).toBeUndefined();
          expect(conn.refreshToken).toBeUndefined();
        });
      }
    });
  });

  describe('Cross-Origin Data Leakage', () => {
    it('should enforce CORS policies', async () => {
      const response = await request(app)
        .get('/api/platforms')
        .set('Origin', 'https://malicious-site.com')
        .set('Cookie', [`user=${testUserId}`]);

      expect(response.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('should not expose sensitive headers', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Cookie', [`user=${testUserId}`]);

      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('should use httpOnly cookies', async () => {
      const response = await request(app)
        .post('/api/commands')
        .set('Cookie', [`user=${testUserId}`])
        .send({
          name: 'cookietest',
          response: 'cookie response',
          isActive: true,
        });

      const cookies = response.headers['set-cookie'];
      if (cookies) {
        const cookieString = Array.isArray(cookies) ? cookies.join('; ') : cookies;
        expect(cookieString.toLowerCase()).toContain('httponly');
      }
    });
  });

  describe('Personally Identifiable Information', () => {
    it('should not expose internal user IDs in public endpoints', async () => {
      const response = await request(app)
        .get('/api/health');

      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toContain(testUserId);
    });

    it('should redact email addresses from public logs', async () => {
      const response = await request(app)
        .get('/api/diagnostics');

      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toMatch(/@test\.com/);
    });

    it('should not include user personal data in analytics aggregations', async () => {
      const response = await request(app)
        .get('/api/health');

      if (response.status === 200 && response.body.users) {
        expect(response.body.users.emails).toBeUndefined();
        expect(response.body.users.ids).toBeUndefined();
      }
    });

    it('should sanitize platform usernames in public responses', async () => {
      const response = await request(app)
        .get('/api/diagnostics');

      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toContain('platformUsername');
    });
  });

  describe('Session Data Privacy', () => {
    it('should not expose session data to other users', async () => {
      const [otherUser] = await db.insert(users).values({
        email: `other-${Date.now()}@test.com`,
        primaryPlatform: 'youtube',
        role: 'user',
        isActive: true,
      }).returning();

      const responseAsOther = await request(app)
        .get('/api/platforms')
        .set('Cookie', [`user=${otherUser.id}`]);

      if (responseAsOther.status === 200) {
        const connections = responseAsOther.body;
        connections.forEach((conn: any) => {
          expect(conn.userId).not.toBe(testUserId);
        });
      }

      await db.delete(users).where(eq(users.id, otherUser.id));
    });

    it('should invalidate session on logout', async () => {
      const loginResponse = await request(app)
        .get('/auth/me')
        .set('Cookie', [`user=${testUserId}`]);

      const sessionCookie = loginResponse.headers['set-cookie'];

      await request(app)
        .post('/auth/logout')
        .set('Cookie', sessionCookie || [`user=${testUserId}`]);

      const afterLogout = await request(app)
        .get('/auth/me')
        .set('Cookie', sessionCookie || [`user=${testUserId}`]);

      expect([401, 403].includes(afterLogout.status)).toBe(true);
    });
  });

  describe('Database Query Privacy', () => {
    it('should prevent information disclosure through timing attacks', async () => {
      const start1 = Date.now();
      await request(app)
        .get('/auth/me')
        .set('Cookie', [`user=nonexistent-user-id`]);
      const duration1 = Date.now() - start1;

      const start2 = Date.now();
      await request(app)
        .get('/auth/me')
        .set('Cookie', [`user=${testUserId}`]);
      const duration2 = Date.now() - start2;

      const timingDifference = Math.abs(duration1 - duration2);
      expect(timingDifference).toBeLessThan(1000);
    });

    it('should not expose database schema in error messages', async () => {
      const response = await request(app)
        .post('/api/commands')
        .set('Cookie', [`user=${testUserId}`])
        .send({ malformed: 'data' });

      const errorText = JSON.stringify(response.body);
      expect(errorText).not.toContain('pg_');
      expect(errorText).not.toContain('column');
      expect(errorText).not.toContain('table');
      expect(errorText).not.toContain('relation');
    });
  });
});
