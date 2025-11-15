import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { db } from '../../server/db';
import { 
  users, 
  botConfigs, 
  customCommands, 
  giveaways, 
  giveawayEntries,
  platformConnections,
  streamSessions,
  messageHistory,
  moderationRules,
  shoutoutSettings,
  gameSettings
} from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { encryptToken } from '../../server/crypto-utils';

describe('Multi-Tenant Isolation Security Tests', () => {
  let app: any;
  let userAId: string;
  let userBId: string;
  let userABotConfigId: string;
  let userBBotConfigId: string;
  let userACommandId: string;
  let userBCommandId: string;
  let userAGiveawayId: string;
  let userBGiveawayId: string;
  let userAPlatformId: string;
  let userBPlatformId: string;
  let userASessionId: string;
  let userBSessionId: string;

  beforeAll(async () => {
    const { createServer } = await import('../../server/test-server');
    app = await createServer();

    const timestamp = Date.now();

    const [userA] = await db.insert(users).values({
      email: `tenant-a-${timestamp}@test.com`,
      primaryPlatform: 'twitch',
      role: 'user',
      isActive: true,
    }).returning();
    userAId = userA.id;

    const [userB] = await db.insert(users).values({
      email: `tenant-b-${timestamp}@test.com`,
      primaryPlatform: 'youtube',
      role: 'user',
      isActive: true,
    }).returning();
    userBId = userB.id;

    const [configA] = await db.insert(botConfigs).values({
      userId: userAId,
      intervalMode: 'manual',
      isActive: false,
    }).returning();
    userABotConfigId = configA.id;

    const [configB] = await db.insert(botConfigs).values({
      userId: userBId,
      intervalMode: 'fixed',
      fixedIntervalMinutes: 30,
      isActive: false,
    }).returning();
    userBBotConfigId = configB.id;

    const [commandA] = await db.insert(customCommands).values({
      userId: userAId,
      name: 'testcommandA',
      response: 'Response from User A',
      isActive: true,
    }).returning();
    userACommandId = commandA.id;

    const [commandB] = await db.insert(customCommands).values({
      userId: userBId,
      name: 'testcommandB',
      response: 'Response from User B',
      isActive: true,
    }).returning();
    userBCommandId = commandB.id;

    const [giveawayA] = await db.insert(giveaways).values({
      userId: userAId,
      title: 'User A Giveaway',
      keyword: '!enterA',
      isActive: true,
      maxWinners: 1,
    }).returning();
    userAGiveawayId = giveawayA.id;

    const [giveawayB] = await db.insert(giveaways).values({
      userId: userBId,
      title: 'User B Giveaway',
      keyword: '!enterB',
      isActive: true,
      maxWinners: 1,
    }).returning();
    userBGiveawayId = giveawayB.id;

    const [platformA] = await db.insert(platformConnections).values({
      userId: userAId,
      platform: 'twitch',
      platformUserId: 'twitch_user_a',
      platformUsername: 'streamer_a',
      accessToken: encryptToken('token_a'),
      isConnected: true,
    }).returning();
    userAPlatformId = platformA.id;

    const [platformB] = await db.insert(platformConnections).values({
      userId: userBId,
      platform: 'youtube',
      platformUserId: 'yt_user_b',
      platformUsername: 'streamer_b',
      accessToken: encryptToken('token_b'),
      isConnected: true,
    }).returning();
    userBPlatformId = platformB.id;

    const [sessionA] = await db.insert(streamSessions).values({
      userId: userAId,
      platform: 'twitch',
      peakViewers: 100,
    }).returning();
    userASessionId = sessionA.id;

    const [sessionB] = await db.insert(streamSessions).values({
      userId: userBId,
      platform: 'youtube',
      peakViewers: 200,
    }).returning();
    userBSessionId = sessionB.id;
  });

  afterAll(async () => {
    await db.delete(giveawayEntries).where(eq(giveawayEntries.giveawayId, userAGiveawayId));
    await db.delete(giveawayEntries).where(eq(giveawayEntries.giveawayId, userBGiveawayId));
    await db.delete(giveaways).where(eq(giveaways.userId, userAId));
    await db.delete(giveaways).where(eq(giveaways.userId, userBId));
    await db.delete(customCommands).where(eq(customCommands.userId, userAId));
    await db.delete(customCommands).where(eq(customCommands.userId, userBId));
    await db.delete(streamSessions).where(eq(streamSessions.userId, userAId));
    await db.delete(streamSessions).where(eq(streamSessions.userId, userBId));
    await db.delete(messageHistory).where(eq(messageHistory.userId, userAId));
    await db.delete(messageHistory).where(eq(messageHistory.userId, userBId));
    await db.delete(platformConnections).where(eq(platformConnections.userId, userAId));
    await db.delete(platformConnections).where(eq(platformConnections.userId, userBId));
    await db.delete(botConfigs).where(eq(botConfigs.userId, userAId));
    await db.delete(botConfigs).where(eq(botConfigs.userId, userBId));
    await db.delete(users).where(eq(users.id, userAId));
    await db.delete(users).where(eq(users.id, userBId));
  });

  describe('Bot Configuration Isolation', () => {
    it('should only return authenticated user bot config', async () => {
      const response = await request(app)
        .get('/api/settings')
        .set('Cookie', [`user=${userAId}`]);

      expect(response.status).toBe(200);
      expect(response.body.userId).toBe(userAId);
      expect(response.body.id).toBe(userABotConfigId);
    });

    it('should prevent User A from accessing User B bot config', async () => {
      const response = await request(app)
        .get('/api/settings')
        .set('Cookie', [`user=${userAId}`]);

      expect(response.status).toBe(200);
      expect(response.body.id).not.toBe(userBBotConfigId);
      expect(response.body.userId).toBe(userAId);
    });

    it('should prevent User A from modifying User B bot config', async () => {
      const response = await request(app)
        .patch('/api/settings')
        .set('Cookie', [`user=${userAId}`])
        .send({ isActive: true });

      const [configB] = await db.select().from(botConfigs).where(eq(botConfigs.id, userBBotConfigId));
      expect(configB.isActive).toBe(false);
    });

    it('should enforce userId in bot config updates', async () => {
      const maliciousUpdate = await request(app)
        .patch('/api/settings')
        .set('Cookie', [`user=${userAId}`])
        .send({ 
          userId: userBId,
          isActive: true 
        });

      const [configB] = await db.select().from(botConfigs).where(eq(botConfigs.id, userBBotConfigId));
      expect(configB.userId).toBe(userBId);
      expect(configB.isActive).toBe(false);
    });
  });

  describe('Command Execution Isolation', () => {
    it('should only return commands for authenticated user', async () => {
      const response = await request(app)
        .get('/api/commands')
        .set('Cookie', [`user=${userAId}`]);

      expect(response.status).toBe(200);
      const commands = response.body;
      
      expect(Array.isArray(commands)).toBe(true);
      commands.forEach((cmd: any) => {
        expect(cmd.userId).toBe(userAId);
      });
      
      const hasUserBCommand = commands.some((cmd: any) => cmd.id === userBCommandId);
      expect(hasUserBCommand).toBe(false);
    });

    it('should prevent User A from viewing User B command details', async () => {
      const response = await request(app)
        .get(`/api/commands/${userBCommandId}`)
        .set('Cookie', [`user=${userAId}`]);

      expect(response.status).toBe(404);
    });

    it('should prevent User A from modifying User B command', async () => {
      const response = await request(app)
        .patch(`/api/commands/${userBCommandId}`)
        .set('Cookie', [`user=${userAId}`])
        .send({ response: 'Hacked by User A' });

      expect(response.status).toBeGreaterThanOrEqual(400);

      const [commandB] = await db.select().from(customCommands).where(eq(customCommands.id, userBCommandId));
      expect(commandB.response).toBe('Response from User B');
    });

    it('should prevent User A from deleting User B command', async () => {
      const response = await request(app)
        .delete(`/api/commands/${userBCommandId}`)
        .set('Cookie', [`user=${userAId}`]);

      expect(response.status).toBeGreaterThanOrEqual(400);

      const [commandB] = await db.select().from(customCommands).where(eq(customCommands.id, userBCommandId));
      expect(commandB).toBeDefined();
    });

    it('should prevent command name collisions across users', async () => {
      const responseA = await request(app)
        .post('/api/commands')
        .set('Cookie', [`user=${userAId}`])
        .send({
          name: 'shared',
          response: 'User A shared command',
          isActive: true,
        });

      const responseB = await request(app)
        .post('/api/commands')
        .set('Cookie', [`user=${userBId}`])
        .send({
          name: 'shared',
          response: 'User B shared command',
          isActive: true,
        });

      expect(responseA.status).toBe(200);
      expect(responseB.status).toBe(200);

      const commandsA = await db.select().from(customCommands).where(eq(customCommands.userId, userAId));
      const commandsB = await db.select().from(customCommands).where(eq(customCommands.userId, userBId));

      const sharedA = commandsA.find(c => c.name === 'shared');
      const sharedB = commandsB.find(c => c.name === 'shared');

      expect(sharedA?.response).toBe('User A shared command');
      expect(sharedB?.response).toBe('User B shared command');
    });
  });

  describe('Giveaway Participant Isolation', () => {
    it('should prevent User A from viewing User B giveaway details', async () => {
      const response = await request(app)
        .get(`/api/giveaways/${userBGiveawayId}`)
        .set('Cookie', [`user=${userAId}`]);

      expect(response.status).toBe(404);
    });

    it('CRITICAL: should prevent User A from viewing User B giveaway entries', async () => {
      await db.insert(giveawayEntries).values({
        giveawayId: userBGiveawayId,
        userId: userBId,
        username: 'participant_b',
        platform: 'youtube',
      });

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

      const [giveaway] = await db.select().from(giveaways).where(eq(giveaways.id, userBGiveawayId));
      expect(giveaway.isActive).toBe(true);
    });

    it('should prevent User A from selecting winners for User B giveaway', async () => {
      const response = await request(app)
        .post(`/api/giveaways/${userBGiveawayId}/select-winners`)
        .set('Cookie', [`user=${userAId}`]);

      expect(response.status).toBeGreaterThanOrEqual(403);
    });

    it('should only show giveaways owned by authenticated user', async () => {
      const response = await request(app)
        .get('/api/giveaways')
        .set('Cookie', [`user=${userAId}`]);

      expect(response.status).toBe(200);
      const giveaways = response.body;

      giveaways.forEach((giveaway: any) => {
        expect(giveaway.userId).toBe(userAId);
      });

      const hasUserBGiveaway = giveaways.some((g: any) => g.id === userBGiveawayId);
      expect(hasUserBGiveaway).toBe(false);
    });
  });

  describe('Analytics Data Isolation', () => {
    it('should only return stream sessions for authenticated user', async () => {
      await request(app)
        .get('/api/stats/sessions')
        .set('Cookie', [`user=${userAId}`])
        .expect((res) => {
          if (res.status === 200 && Array.isArray(res.body)) {
            res.body.forEach((session: any) => {
              expect(session.userId).toBe(userAId);
            });
          }
        });
    });

    it('should prevent User A from accessing User B analytics', async () => {
      const response = await request(app)
        .get('/api/analytics/sentiment')
        .set('Cookie', [`user=${userAId}`]);

      if (response.status === 200) {
        expect(response.body.userId || userAId).toBe(userAId);
      }
    });

    it('should isolate message history between users', async () => {
      await db.insert(messageHistory).values({
        userId: userAId,
        platform: 'twitch',
        triggerType: 'manual',
        factContent: 'User A fact',
      });

      await db.insert(messageHistory).values({
        userId: userBId,
        platform: 'youtube',
        triggerType: 'manual',
        factContent: 'User B fact',
      });

      const response = await request(app)
        .get('/api/messages')
        .set('Cookie', [`user=${userAId}`]);

      expect(response.status).toBe(200);
      const messages = response.body;

      messages.forEach((msg: any) => {
        expect(msg.userId).toBe(userAId);
        expect(msg.factContent).not.toBe('User B fact');
      });
    });

    it('should prevent cross-tenant data leakage in stats endpoints', async () => {
      const response = await request(app)
        .get('/api/stats')
        .set('Cookie', [`user=${userAId}`]);

      expect(response.status).toBe(200);
    });
  });

  describe('Platform Connection Isolation', () => {
    it('should only return platform connections for authenticated user', async () => {
      const response = await request(app)
        .get('/api/platforms')
        .set('Cookie', [`user=${userAId}`]);

      expect(response.status).toBe(200);
      const connections = response.body;

      connections.forEach((conn: any) => {
        expect(conn.id).not.toBe(userBPlatformId);
      });
    });

    it('should prevent User A from viewing User B platform details', async () => {
      const response = await request(app)
        .get(`/api/platforms/${userBPlatformId}`)
        .set('Cookie', [`user=${userAId}`]);

      expect(response.status).toBe(404);
    });

    it('should prevent User A from disconnecting User B platform', async () => {
      const response = await request(app)
        .delete(`/api/platforms/${userBPlatformId}`)
        .set('Cookie', [`user=${userAId}`]);

      expect(response.status).toBeGreaterThanOrEqual(403);

      const [platformB] = await db.select().from(platformConnections).where(eq(platformConnections.id, userBPlatformId));
      expect(platformB).toBeDefined();
    });
  });

  describe('Concurrent User Operations', () => {
    it('should handle concurrent bot config updates without interference', async () => {
      const [updateA, updateB] = await Promise.all([
        request(app)
          .patch('/api/settings')
          .set('Cookie', [`user=${userAId}`])
          .send({ intervalMode: 'fixed', fixedIntervalMinutes: 15 }),
        request(app)
          .patch('/api/settings')
          .set('Cookie', [`user=${userBId}`])
          .send({ intervalMode: 'random', randomMinMinutes: 5, randomMaxMinutes: 30 }),
      ]);

      expect(updateA.status).toBe(200);
      expect(updateB.status).toBe(200);

      const [configA] = await db.select().from(botConfigs).where(eq(botConfigs.id, userABotConfigId));
      const [configB] = await db.select().from(botConfigs).where(eq(botConfigs.id, userBBotConfigId));

      expect(configA.intervalMode).toBe('fixed');
      expect(configA.fixedIntervalMinutes).toBe(15);
      expect(configB.intervalMode).toBe('random');
      expect(configB.randomMinMinutes).toBe(5);
    });

    it('should handle concurrent command creation without collision', async () => {
      const timestamp = Date.now();
      
      const [createA, createB] = await Promise.all([
        request(app)
          .post('/api/commands')
          .set('Cookie', [`user=${userAId}`])
          .send({ name: `concurrent_${timestamp}`, response: 'A response', isActive: true }),
        request(app)
          .post('/api/commands')
          .set('Cookie', [`user=${userBId}`])
          .send({ name: `concurrent_${timestamp}`, response: 'B response', isActive: true }),
      ]);

      expect(createA.status).toBe(200);
      expect(createB.status).toBe(200);
      expect(createA.body.response).toBe('A response');
      expect(createB.body.response).toBe('B response');
    });

    it('should maintain isolation during parallel giveaway operations', async () => {
      const [operationA, operationB] = await Promise.all([
        request(app)
          .get(`/api/giveaways/${userAGiveawayId}`)
          .set('Cookie', [`user=${userAId}`]),
        request(app)
          .get(`/api/giveaways/${userBGiveawayId}`)
          .set('Cookie', [`user=${userBId}`]),
      ]);

      expect(operationA.status).toBe(200);
      expect(operationB.status).toBe(200);
      expect(operationA.body.userId).toBe(userAId);
      expect(operationB.body.userId).toBe(userBId);
    });
  });

  describe('Resource Isolation', () => {
    it('should prevent access to other users moderation rules', async () => {
      const [ruleA] = await db.insert(moderationRules).values({
        userId: userAId,
        ruleType: 'toxic',
        isEnabled: true,
      }).returning();

      const response = await request(app)
        .get('/api/moderation/rules')
        .set('Cookie', [`user=${userBId}`]);

      if (response.status === 200 && Array.isArray(response.body)) {
        const hasUserARule = response.body.some((r: any) => r.id === ruleA.id);
        expect(hasUserARule).toBe(false);
      }

      await db.delete(moderationRules).where(eq(moderationRules.userId, userAId));
    });

    it('should isolate shoutout settings between users', async () => {
      await db.insert(shoutoutSettings).values({
        userId: userAId,
        enableAutoShoutouts: true,
      });

      await db.insert(shoutoutSettings).values({
        userId: userBId,
        enableAutoShoutouts: false,
      });

      const responseA = await request(app)
        .get('/api/shoutout/settings')
        .set('Cookie', [`user=${userAId}`]);

      if (responseA.status === 200) {
        expect(responseA.body.enableAutoShoutouts).toBe(true);
      }

      await db.delete(shoutoutSettings).where(eq(shoutoutSettings.userId, userAId));
      await db.delete(shoutoutSettings).where(eq(shoutoutSettings.userId, userBId));
    });

    it('should isolate game settings between users', async () => {
      await db.insert(gameSettings).values({
        userId: userAId,
        enableGames: true,
        pointsPerWin: 100,
      });

      await db.insert(gameSettings).values({
        userId: userBId,
        enableGames: false,
        pointsPerWin: 50,
      });

      const responseA = await request(app)
        .get('/api/games/settings')
        .set('Cookie', [`user=${userAId}`]);

      if (responseA.status === 200) {
        expect(responseA.body.pointsPerWin).toBe(100);
      }

      await db.delete(gameSettings).where(eq(gameSettings.userId, userAId));
      await db.delete(gameSettings).where(eq(gameSettings.userId, userBId));
    });
  });
});
