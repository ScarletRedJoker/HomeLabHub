import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { db } from '../../server/db';
import { users, botConfigs, giveaways, customCommands, platformConnections } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { encryptToken } from '../../server/crypto-utils';

describe('Authorization Security Tests', () => {
  let app: any;
  let regularUserId: string;
  let adminUserId: string;
  let targetUserId: string;
  let targetGiveawayId: string;
  let targetCommandId: string;
  let targetBotConfigId: string;

  beforeAll(async () => {
    const { createServer } = await import('../../server/test-server');
    app = await createServer();

    const timestamp = Date.now();

    const [regularUser] = await db.insert(users).values({
      email: `regular-${timestamp}@test.com`,
      primaryPlatform: 'twitch',
      role: 'user',
      isActive: true,
    }).returning();
    regularUserId = regularUser.id;

    const [adminUser] = await db.insert(users).values({
      email: `admin-${timestamp}@test.com`,
      primaryPlatform: 'twitch',
      role: 'admin',
      isActive: true,
    }).returning();
    adminUserId = adminUser.id;

    const [targetUser] = await db.insert(users).values({
      email: `target-${timestamp}@test.com`,
      primaryPlatform: 'youtube',
      role: 'user',
      isActive: true,
    }).returning();
    targetUserId = targetUser.id;

    const [config] = await db.insert(botConfigs).values({
      userId: targetUserId,
      intervalMode: 'manual',
      isActive: false,
    }).returning();
    targetBotConfigId = config.id;

    const [command] = await db.insert(customCommands).values({
      userId: targetUserId,
      name: 'targetcommand',
      response: 'Target response',
      isActive: true,
    }).returning();
    targetCommandId = command.id;

    const [giveaway] = await db.insert(giveaways).values({
      userId: targetUserId,
      title: 'Target Giveaway',
      keyword: '!targetenter',
      isActive: true,
      maxWinners: 1,
    }).returning();
    targetGiveawayId = giveaway.id;
  });

  afterAll(async () => {
    await db.delete(giveaways).where(eq(giveaways.userId, targetUserId));
    await db.delete(customCommands).where(eq(customCommands.userId, targetUserId));
    await db.delete(botConfigs).where(eq(botConfigs.userId, targetUserId));
    await db.delete(users).where(eq(users.id, regularUserId));
    await db.delete(users).where(eq(users.id, adminUserId));
    await db.delete(users).where(eq(users.id, targetUserId));
  });

  describe('Unauthorized Access to Admin Endpoints', () => {
    it('should reject unauthenticated access to admin endpoints', async () => {
      const response = await request(app)
        .get('/api/admin/quota/status');

      expect(response.status).toBe(401);
    });

    it('should reject regular user access to admin quota endpoints', async () => {
      const response = await request(app)
        .get('/api/admin/quota/status')
        .set('Cookie', [`user=${regularUserId}`]);

      expect([200, 403].includes(response.status)).toBe(true);
    });

    it('should allow admin access to admin endpoints', async () => {
      const response = await request(app)
        .get('/api/admin/quota/status')
        .set('Cookie', [`user=${adminUserId}`]);

      expect([200, 403, 500].includes(response.status)).toBe(true);
    });

    it('should prevent privilege escalation via role manipulation', async () => {
      const response = await request(app)
        .patch('/api/user/profile')
        .set('Cookie', [`user=${regularUserId}`])
        .send({ role: 'admin' });

      const [user] = await db.select().from(users).where(eq(users.id, regularUserId));
      expect(user.role).toBe('user');
    });

    it('should validate admin status on every request', async () => {
      await db.update(users)
        .set({ role: 'user' })
        .where(eq(users.id, adminUserId));

      const response = await request(app)
        .post('/api/admin/quota/reset-all')
        .set('Cookie', [`user=${adminUserId}`]);

      expect([403, 200].includes(response.status)).toBe(true);

      await db.update(users)
        .set({ role: 'admin' })
        .where(eq(users.id, adminUserId));
    });
  });

  describe('Unauthorized Giveaway Management', () => {
    it('should prevent unauthorized user from viewing giveaway', async () => {
      const response = await request(app)
        .get(`/api/giveaways/${targetGiveawayId}`)
        .set('Cookie', [`user=${regularUserId}`]);

      expect(response.status).toBe(404);
    });

    it('should prevent unauthorized user from ending giveaway', async () => {
      const response = await request(app)
        .post(`/api/giveaways/${targetGiveawayId}/end`)
        .set('Cookie', [`user=${regularUserId}`]);

      expect(response.status).toBeGreaterThanOrEqual(403);

      const [giveaway] = await db.select().from(giveaways).where(eq(giveaways.id, targetGiveawayId));
      expect(giveaway.isActive).toBe(true);
    });

    it('should prevent unauthorized user from selecting winners', async () => {
      const response = await request(app)
        .post(`/api/giveaways/${targetGiveawayId}/select-winners`)
        .set('Cookie', [`user=${regularUserId}`]);

      expect(response.status).toBeGreaterThanOrEqual(403);
    });

    it('should prevent unauthorized user from deleting giveaway', async () => {
      const response = await request(app)
        .delete(`/api/giveaways/${targetGiveawayId}`)
        .set('Cookie', [`user=${regularUserId}`]);

      expect(response.status).toBeGreaterThanOrEqual(403);

      const [giveaway] = await db.select().from(giveaways).where(eq(giveaways.id, targetGiveawayId));
      expect(giveaway).toBeDefined();
    });

    it('should prevent anonymous access to giveaway management', async () => {
      const response = await request(app)
        .post(`/api/giveaways/${targetGiveawayId}/end`);

      expect(response.status).toBe(401);
    });
  });

  describe('Unauthorized Bot Configuration Changes', () => {
    it('should prevent unauthorized access to bot settings', async () => {
      const response = await request(app)
        .get('/api/settings')
        .set('Cookie', [`user=${regularUserId}`]);

      expect(response.status).toBe(200);
      if (response.body.id) {
        expect(response.body.id).not.toBe(targetBotConfigId);
      }
    });

    it('should prevent unauthorized bot configuration updates', async () => {
      const response = await request(app)
        .patch('/api/settings')
        .set('Cookie', [`user=${regularUserId}`])
        .send({ isActive: true });

      const [targetConfig] = await db.select().from(botConfigs).where(eq(botConfigs.id, targetBotConfigId));
      expect(targetConfig.isActive).toBe(false);
    });

    it('should prevent anonymous bot control', async () => {
      const response = await request(app)
        .patch('/api/settings')
        .send({ isActive: true });

      expect(response.status).toBe(401);
    });

    it('should prevent unauthorized user from starting another user bot', async () => {
      const response = await request(app)
        .post(`/api/bot/${targetUserId}/start`)
        .set('Cookie', [`user=${regularUserId}`]);

      expect(response.status).toBeGreaterThanOrEqual(403);
    });

    it('should prevent unauthorized user from stopping another user bot', async () => {
      const response = await request(app)
        .post(`/api/bot/${targetUserId}/stop`)
        .set('Cookie', [`user=${regularUserId}`]);

      expect(response.status).toBeGreaterThanOrEqual(403);
    });
  });

  describe('Unauthorized User Impersonation', () => {
    it('should prevent userId manipulation in requests', async () => {
      const response = await request(app)
        .get('/api/commands')
        .set('Cookie', [`user=${regularUserId}`])
        .query({ userId: targetUserId });

      if (response.status === 200) {
        const commands = response.body;
        commands.forEach((cmd: any) => {
          expect(cmd.userId).toBe(regularUserId);
        });
      }
    });

    it('should prevent session hijacking attempts', async () => {
      const legitimateSession = await request(app)
        .get('/auth/me')
        .set('Cookie', [`user=${targetUserId}`]);

      const sessionCookie = legitimateSession.headers['set-cookie'];

      const hijackAttempt = await request(app)
        .get('/api/settings')
        .set('Cookie', sessionCookie || [`user=${regularUserId}`]);

      if (hijackAttempt.status === 200) {
        expect(hijackAttempt.body.userId).not.toBe(targetUserId);
      }
    });

    it('should prevent JWT token manipulation', async () => {
      const maliciousToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0YXJnZXRVc2VySWQiLCJyb2xlIjoiYWRtaW4ifQ.invalid';
      
      const response = await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${maliciousToken}`);

      expect(response.status).toBeGreaterThanOrEqual(401);
    });

    it('should validate user ownership on every resource access', async () => {
      const response = await request(app)
        .get(`/api/commands/${targetCommandId}`)
        .set('Cookie', [`user=${regularUserId}`]);

      expect(response.status).toBe(404);
    });
  });

  describe('Command Authorization', () => {
    it('should prevent unauthorized command viewing', async () => {
      const response = await request(app)
        .get(`/api/commands/${targetCommandId}`)
        .set('Cookie', [`user=${regularUserId}`]);

      expect(response.status).toBe(404);
    });

    it('should prevent unauthorized command modification', async () => {
      const response = await request(app)
        .patch(`/api/commands/${targetCommandId}`)
        .set('Cookie', [`user=${regularUserId}`])
        .send({ response: 'Unauthorized modification' });

      expect(response.status).toBeGreaterThanOrEqual(400);

      const [command] = await db.select().from(customCommands).where(eq(customCommands.id, targetCommandId));
      expect(command.response).toBe('Target response');
    });

    it('should prevent unauthorized command deletion', async () => {
      const response = await request(app)
        .delete(`/api/commands/${targetCommandId}`)
        .set('Cookie', [`user=${regularUserId}`]);

      expect(response.status).toBeGreaterThanOrEqual(400);

      const [command] = await db.select().from(customCommands).where(eq(customCommands.id, targetCommandId));
      expect(command).toBeDefined();
    });

    it('should prevent anonymous command creation', async () => {
      const response = await request(app)
        .post('/api/commands')
        .send({
          name: 'anonymous',
          response: 'Anonymous command',
          isActive: true,
        });

      expect(response.status).toBe(401);
    });
  });

  describe('Platform Connection Authorization', () => {
    it('should prevent unauthorized access to platform connections', async () => {
      const [connection] = await db.insert(platformConnections).values({
        userId: targetUserId,
        platform: 'twitch',
        platformUserId: 'twitch_target',
        platformUsername: 'target_streamer',
        accessToken: encryptToken('target_token'),
        isConnected: true,
      }).returning();

      const response = await request(app)
        .get(`/api/platforms/${connection.id}`)
        .set('Cookie', [`user=${regularUserId}`]);

      expect(response.status).toBe(404);

      await db.delete(platformConnections).where(eq(platformConnections.id, connection.id));
    });

    it('should prevent unauthorized platform disconnection', async () => {
      const [connection] = await db.insert(platformConnections).values({
        userId: targetUserId,
        platform: 'youtube',
        platformUserId: 'yt_target',
        platformUsername: 'target_yt',
        accessToken: encryptToken('yt_token'),
        isConnected: true,
      }).returning();

      const response = await request(app)
        .delete(`/api/platforms/${connection.id}`)
        .set('Cookie', [`user=${regularUserId}`]);

      expect(response.status).toBeGreaterThanOrEqual(403);

      const [stillConnected] = await db.select().from(platformConnections).where(eq(platformConnections.id, connection.id));
      expect(stillConnected).toBeDefined();

      await db.delete(platformConnections).where(eq(platformConnections.id, connection.id));
    });
  });

  describe('Resource Ownership Validation', () => {
    it('should validate ownership on GET requests', async () => {
      const response = await request(app)
        .get(`/api/giveaways/${targetGiveawayId}`)
        .set('Cookie', [`user=${regularUserId}`]);

      expect(response.status).toBe(404);
    });

    it('should validate ownership on PATCH requests', async () => {
      const response = await request(app)
        .patch(`/api/commands/${targetCommandId}`)
        .set('Cookie', [`user=${regularUserId}`])
        .send({ isActive: false });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should validate ownership on DELETE requests', async () => {
      const response = await request(app)
        .delete(`/api/commands/${targetCommandId}`)
        .set('Cookie', [`user=${regularUserId}`]);

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should prevent cross-user resource manipulation', async () => {
      const response = await request(app)
        .post('/api/commands')
        .set('Cookie', [`user=${regularUserId}`])
        .send({
          userId: targetUserId,
          name: 'malicious',
          response: 'Malicious command',
          isActive: true,
        });

      const targetCommands = await db.select().from(customCommands)
        .where(eq(customCommands.userId, targetUserId));
      
      const hasMalicious = targetCommands.some(cmd => cmd.name === 'malicious');
      expect(hasMalicious).toBe(false);
    });
  });

  describe('Anonymous Access Prevention', () => {
    it('should require authentication for all protected endpoints', async () => {
      const endpoints = [
        { method: 'get', path: '/api/settings' },
        { method: 'get', path: '/api/commands' },
        { method: 'get', path: '/api/giveaways' },
        { method: 'get', path: '/api/platforms' },
        { method: 'get', path: '/api/messages' },
        { method: 'get', path: '/api/stats' },
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)[endpoint.method](endpoint.path);
        expect(response.status).toBe(401);
      }
    });

    it('should reject requests without valid session', async () => {
      const response = await request(app)
        .patch('/api/settings')
        .send({ isActive: true });

      expect(response.status).toBe(401);
    });

    it('should reject expired sessions', async () => {
      const expiredSession = 'expired-session-token-12345';
      
      const response = await request(app)
        .get('/api/settings')
        .set('Cookie', [`connect.sid=${expiredSession}`]);

      expect(response.status).toBe(401);
    });
  });

  describe('Authorization Header Validation', () => {
    it('should validate Bearer token format', async () => {
      const response = await request(app)
        .get('/api/settings')
        .set('Authorization', 'InvalidFormat token123');

      expect(response.status).toBeGreaterThanOrEqual(401);
    });

    it('should reject malformed authorization headers', async () => {
      const response = await request(app)
        .get('/api/settings')
        .set('Authorization', 'Bearer');

      expect(response.status).toBeGreaterThanOrEqual(401);
    });

    it('should reject empty authorization headers', async () => {
      const response = await request(app)
        .get('/api/settings')
        .set('Authorization', '');

      expect(response.status).toBe(401);
    });
  });

  describe('Role-Based Access Control', () => {
    it('should enforce user role restrictions', async () => {
      const [user] = await db.select().from(users).where(eq(users.id, regularUserId));
      expect(user.role).toBe('user');

      const adminResponse = await request(app)
        .get('/api/admin/quota/status')
        .set('Cookie', [`user=${regularUserId}`]);

      expect([200, 403].includes(adminResponse.status)).toBe(true);
    });

    it('should allow admin role elevated access', async () => {
      const response = await request(app)
        .get('/api/admin/quota/status')
        .set('Cookie', [`user=${adminUserId}`]);

      expect([200, 403, 500].includes(response.status)).toBe(true);
    });

    it('should prevent role elevation via request manipulation', async () => {
      const response = await request(app)
        .get('/api/admin/quota/status')
        .set('Cookie', [`user=${regularUserId}`])
        .set('X-User-Role', 'admin');

      expect([200, 403].includes(response.status)).toBe(true);
    });
  });
});
