import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { db } from '../server/db';
import { users, botConfigs, commands, giveaways, platformConnections } from '../shared/schema';
import { eq } from 'drizzle-orm';

describe('Multi-Tenant Isolation Security Tests', () => {
  let app: any;
  let userASession: string;
  let userBSession: string;
  let userAId: string;
  let userBId: string;
  let userABotConfigId: string;
  let userBBotConfigId: string;
  let userACommandId: string;
  let userBCommandId: string;
  let userAGiveawayId: string;
  let userBGiveawayId: string;
  let userAPlatformConnectionId: string;
  let userBPlatformConnectionId: string;

  beforeAll(async () => {
    const { createServer } = await import('../server/index');
    app = await createServer();

    const [userA] = await db.insert(users).values({
      username: 'test_user_a',
      email: 'usera@test.com',
      passwordHash: 'hash_a',
    }).returning();
    userAId = userA.id;

    const [userB] = await db.insert(users).values({
      username: 'test_user_b',
      email: 'userb@test.com',
      passwordHash: 'hash_b',
    }).returning();
    userBId = userB.id;

    const [configA] = await db.insert(botConfigs).values({
      userId: userAId,
      botName: 'Bot A',
      isActive: false,
    }).returning();
    userABotConfigId = configA.id;

    const [configB] = await db.insert(botConfigs).values({
      userId: userBId,
      botName: 'Bot B',
      isActive: false,
    }).returning();
    userBBotConfigId = configB.id;

    const [commandA] = await db.insert(commands).values({
      userId: userAId,
      commandName: '!testA',
      response: 'Response A',
      isActive: true,
    }).returning();
    userACommandId = commandA.id;

    const [commandB] = await db.insert(commands).values({
      userId: userBId,
      commandName: '!testB',
      response: 'Response B',
      isActive: true,
    }).returning();
    userBCommandId = commandB.id;

    const [giveawayA] = await db.insert(giveaways).values({
      userId: userAId,
      title: 'Giveaway A',
      platform: 'twitch',
      isActive: true,
      winnersCount: 1,
    }).returning();
    userAGiveawayId = giveawayA.id;

    const [giveawayB] = await db.insert(giveaways).values({
      userId: userBId,
      title: 'Giveaway B',
      platform: 'twitch',
      isActive: true,
      winnersCount: 1,
    }).returning();
    userBGiveawayId = giveawayB.id;

    const [connectionA] = await db.insert(platformConnections).values({
      userId: userAId,
      platform: 'twitch',
      platformUserId: 'twitch_a',
      platformUsername: 'streamer_a',
      accessToken: 'token_a',
      refreshToken: 'refresh_a',
      isConnected: true,
    }).returning();
    userAPlatformConnectionId = connectionA.id;

    const [connectionB] = await db.insert(platformConnections).values({
      userId: userBId,
      platform: 'twitch',
      platformUserId: 'twitch_b',
      platformUsername: 'streamer_b',
      accessToken: 'token_b',
      refreshToken: 'refresh_b',
      isConnected: true,
    }).returning();
    userBPlatformConnectionId = connectionB.id;
  });

  afterAll(async () => {
    await db.delete(commands).where(eq(commands.userId, userAId));
    await db.delete(commands).where(eq(commands.userId, userBId));
    await db.delete(giveaways).where(eq(giveaways.userId, userAId));
    await db.delete(giveaways).where(eq(giveaways.userId, userBId));
    await db.delete(platformConnections).where(eq(platformConnections.userId, userAId));
    await db.delete(platformConnections).where(eq(platformConnections.userId, userBId));
    await db.delete(botConfigs).where(eq(botConfigs.userId, userAId));
    await db.delete(botConfigs).where(eq(botConfigs.userId, userBId));
    await db.delete(users).where(eq(users.id, userAId));
    await db.delete(users).where(eq(users.id, userBId));
  });

  describe('Bot Configuration Access Control', () => {
    it('should prevent User A from accessing User B bot config', async () => {
      const mockReq = {
        user: { id: userAId },
        params: { id: userBBotConfigId },
      };

      const response = await request(app)
        .get(`/api/bot-config`)
        .set('Cookie', [`user=${userAId}`]);

      if (response.body?.id) {
        expect(response.body.id).not.toBe(userBBotConfigId);
        expect(response.body.userId).toBe(userAId);
      }
    });

    it('should prevent User B from modifying User A bot config', async () => {
      const response = await request(app)
        .patch(`/api/bot-config`)
        .set('Cookie', [`user=${userBId}`])
        .send({ botName: 'Hacked Name' });

      const [configA] = await db.select().from(botConfigs).where(eq(botConfigs.id, userABotConfigId));
      expect(configA.botName).toBe('Bot A');
    });
  });

  describe('Commands Access Control', () => {
    it('should only return commands for authenticated user', async () => {
      const response = await request(app)
        .get('/api/commands')
        .set('Cookie', [`user=${userAId}`]);

      expect(response.status).toBe(200);
      const commands = response.body;
      expect(Array.isArray(commands)).toBe(true);
      
      const hasUserBCommand = commands.some((cmd: any) => cmd.id === userBCommandId);
      expect(hasUserBCommand).toBe(false);
    });

    it('should prevent User A from modifying User B command', async () => {
      const response = await request(app)
        .patch(`/api/commands/${userBCommandId}`)
        .set('Cookie', [`user=${userAId}`])
        .send({ response: 'Hacked response' });

      expect(response.status).toBeGreaterThanOrEqual(403);
    });

    it('should prevent User A from deleting User B command', async () => {
      const response = await request(app)
        .delete(`/api/commands/${userBCommandId}`)
        .set('Cookie', [`user=${userAId}`]);

      expect(response.status).toBeGreaterThanOrEqual(403);

      const [commandB] = await db.select().from(commands).where(eq(commands.id, userBCommandId));
      expect(commandB).toBeDefined();
    });
  });

  describe('Giveaway Access Control', () => {
    it('should prevent User A from accessing User B giveaway details', async () => {
      const response = await request(app)
        .get(`/api/giveaways/${userBGiveawayId}`)
        .set('Cookie', [`user=${userAId}`]);

      expect(response.status).toBe(404);
    });

    it('CRITICAL: should prevent User A from viewing User B giveaway entries', async () => {
      const response = await request(app)
        .get(`/api/giveaways/${userBGiveawayId}/entries`)
        .set('Cookie', [`user=${userAId}`]);

      expect(response.status).toBe(404);
    });

    it('should prevent User A from ending User B giveaway', async () => {
      const response = await request(app)
        .post(`/api/giveaways/${userBGiveawayId}/end`)
        .set('Cookie', [`user=${userAId}`]);

      expect(response.status).toBeGreaterThanOrEqual(403);
    });
  });

  describe('Platform Connections Access Control', () => {
    it('should only return authenticated user platform connections', async () => {
      const response = await request(app)
        .get('/api/platform-connections')
        .set('Cookie', [`user=${userAId}`]);

      expect(response.status).toBe(200);
      const connections = response.body;
      expect(Array.isArray(connections)).toBe(true);
      
      const hasUserBConnection = connections.some((conn: any) => conn.id === userBPlatformConnectionId);
      expect(hasUserBConnection).toBe(false);
    });

    it('should prevent User A from disconnecting User B platform connection', async () => {
      const response = await request(app)
        .post(`/api/platform-connections/${userBPlatformConnectionId}/disconnect`)
        .set('Cookie', [`user=${userAId}`]);

      expect(response.status).toBeGreaterThanOrEqual(403);

      const [connectionB] = await db.select().from(platformConnections).where(eq(platformConnections.id, userBPlatformConnectionId));
      expect(connectionB.isConnected).toBe(true);
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should prevent SQL injection in command name filter', async () => {
      const maliciousInput = "'; DROP TABLE commands; --";
      
      const response = await request(app)
        .get('/api/commands')
        .query({ search: maliciousInput })
        .set('Cookie', [`user=${userAId}`]);

      const commandsStillExist = await db.select().from(commands);
      expect(commandsStillExist.length).toBeGreaterThan(0);
    });

    it('should prevent SQL injection in giveaway ID parameter', async () => {
      const maliciousId = "1' OR '1'='1";
      
      const response = await request(app)
        .get(`/api/giveaways/${maliciousId}`)
        .set('Cookie', [`user=${userAId}`]);

      expect(response.status).not.toBe(200);
    });
  });

  describe('Authorization Bypass Attempts', () => {
    it('should require authentication for sensitive endpoints', async () => {
      const endpoints = [
        '/api/bot-config',
        '/api/commands',
        '/api/giveaways',
        '/api/platform-connections',
      ];

      for (const endpoint of endpoints) {
        const response = await request(app).get(endpoint);
        expect(response.status).toBe(401);
      }
    });

    it('should not allow userId manipulation in request body', async () => {
      const response = await request(app)
        .post('/api/commands')
        .set('Cookie', [`user=${userAId}`])
        .send({
          userId: userBId,
          commandName: '!hacked',
          response: 'This should not work',
          isActive: true,
        });

      const hackedCommands = await db.select().from(commands)
        .where(eq(commands.userId, userBId));
      
      const hasHackedCommand = hackedCommands.some((cmd: any) => cmd.commandName === '!hacked');
      expect(hasHackedCommand).toBe(false);
    });
  });

  describe('Session-based Data Access', () => {
    it('should only return stream stats for authenticated user', async () => {
      const response = await request(app)
        .get('/api/stream-stats/sessions')
        .set('Cookie', [`user=${userAId}`]);

      expect(response.status).toBe(200);
      const sessions = response.body;
      
      if (Array.isArray(sessions) && sessions.length > 0) {
        sessions.forEach((session: any) => {
          expect(session.userId).toBe(userAId);
        });
      }
    });
  });
});
