import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { db } from '../../server/db';
import { users, botConfigs, commands, giveaways, platformConnections, commandUsageLogs, giveawayEntries } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import type { Express } from 'express';

describe('Stream Bot E2E User Flows', () => {
  let app: Express;
  let testUserId: string;
  let testBotConfigId: string;
  let testCommandId: string;
  let testGiveawayId: string;
  let testPlatformConnectionId: string;
  let sessionCookie: string;

  beforeAll(async () => {
    const { createServer } = await import('../../server/index');
    app = await createServer();
  });

  afterAll(async () => {
    await db.delete(commandUsageLogs).where(eq(commandUsageLogs.userId, testUserId));
    await db.delete(giveawayEntries).where(eq(giveawayEntries.giveawayId, testGiveawayId));
    await db.delete(giveaways).where(eq(giveaways.userId, testUserId));
    await db.delete(commands).where(eq(commands.userId, testUserId));
    await db.delete(platformConnections).where(eq(platformConnections.userId, testUserId));
    await db.delete(botConfigs).where(eq(botConfigs.userId, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  describe('E2E Flow 1: User Signup → OAuth Platform Linking → Bot Setup → Command Execution', () => {
    it('should complete full onboarding flow from signup to first command', async () => {
      const signupData = {
        username: `e2e_user_${Date.now()}`,
        email: `e2e_${Date.now()}@test.com`,
        password: 'TestPassword123!',
      };

      const signupResponse = await request(app)
        .post('/api/auth/signup')
        .send(signupData)
        .expect(201);

      expect(signupResponse.body).toHaveProperty('user');
      expect(signupResponse.body.user).toHaveProperty('id');
      testUserId = signupResponse.body.user.id;

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: signupData.email,
          password: signupData.password,
        })
        .expect(200);

      expect(loginResponse.headers['set-cookie']).toBeDefined();
      sessionCookie = loginResponse.headers['set-cookie'][0];

      const mockTwitchConnection = {
        platform: 'twitch',
        platformUserId: 'twitch_test_123',
        platformUsername: 'test_streamer',
        accessToken: 'mock_access_token',
        refreshToken: 'mock_refresh_token',
        expiresAt: new Date(Date.now() + 3600000),
      };

      const [connection] = await db.insert(platformConnections).values({
        userId: testUserId,
        ...mockTwitchConnection,
        isConnected: true,
      }).returning();
      
      testPlatformConnectionId = connection.id;

      const connectionCheckResponse = await request(app)
        .get('/api/platform-connections')
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(connectionCheckResponse.body).toBeInstanceOf(Array);
      expect(connectionCheckResponse.body.length).toBeGreaterThan(0);
      expect(connectionCheckResponse.body[0].platform).toBe('twitch');

      const botConfigResponse = await request(app)
        .post('/api/bot-config')
        .set('Cookie', sessionCookie)
        .send({
          botName: 'E2E Test Bot',
          prefix: '!',
          isActive: true,
          moderationEnabled: false,
        })
        .expect(201);

      expect(botConfigResponse.body).toHaveProperty('id');
      testBotConfigId = botConfigResponse.body.id;

      const createCommandResponse = await request(app)
        .post('/api/commands')
        .set('Cookie', sessionCookie)
        .send({
          commandName: '!hello',
          response: 'Hello from E2E test!',
          isActive: true,
          cooldown: 5,
        })
        .expect(201);

      expect(createCommandResponse.body).toHaveProperty('id');
      expect(createCommandResponse.body.commandName).toBe('!hello');
      testCommandId = createCommandResponse.body.id;

      const executeCommandResponse = await request(app)
        .post(`/api/commands/${testCommandId}/execute`)
        .set('Cookie', sessionCookie)
        .send({
          username: 'test_viewer',
          platform: 'twitch',
        })
        .expect(200);

      expect(executeCommandResponse.body).toHaveProperty('response');
      expect(executeCommandResponse.body.response).toBe('Hello from E2E test!');

      const usageLogsResponse = await request(app)
        .get(`/api/commands/${testCommandId}/usage`)
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(usageLogsResponse.body).toBeInstanceOf(Array);
      expect(usageLogsResponse.body.length).toBeGreaterThan(0);
    });
  });

  describe('E2E Flow 2: Giveaway Creation → User Entry → Winner Selection → Notification', () => {
    beforeEach(async () => {
      if (!testUserId) {
        const [user] = await db.insert(users).values({
          username: `e2e_giveaway_user_${Date.now()}`,
          email: `e2e_giveaway_${Date.now()}@test.com`,
          passwordHash: 'hash',
        }).returning();
        testUserId = user.id;

        const [connection] = await db.insert(platformConnections).values({
          userId: testUserId,
          platform: 'twitch',
          platformUserId: 'twitch_giveaway_123',
          platformUsername: 'giveaway_streamer',
          accessToken: 'mock_token',
          refreshToken: 'mock_refresh',
          isConnected: true,
        }).returning();
        testPlatformConnectionId = connection.id;

        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            email: `e2e_giveaway_${Date.now()}@test.com`,
            password: 'test',
          });
        
        sessionCookie = loginResponse.headers['set-cookie']?.[0] || sessionCookie;
      }
    });

    it('should complete full giveaway flow from creation to winner selection', async () => {
      const createGiveawayResponse = await request(app)
        .post('/api/giveaways')
        .set('Cookie', sessionCookie)
        .send({
          title: 'E2E Test Giveaway',
          description: 'Testing giveaway flow',
          platform: 'twitch',
          entryMethod: 'keyword',
          keyword: '!join',
          winnersCount: 2,
          duration: 300,
        })
        .expect(201);

      expect(createGiveawayResponse.body).toHaveProperty('id');
      expect(createGiveawayResponse.body.title).toBe('E2E Test Giveaway');
      expect(createGiveawayResponse.body.isActive).toBe(true);
      testGiveawayId = createGiveawayResponse.body.id;

      const mockEntries = [
        { username: 'viewer1', platformUserId: 'viewer_1' },
        { username: 'viewer2', platformUserId: 'viewer_2' },
        { username: 'viewer3', platformUserId: 'viewer_3' },
        { username: 'viewer4', platformUserId: 'viewer_4' },
        { username: 'viewer5', platformUserId: 'viewer_5' },
      ];

      for (const entry of mockEntries) {
        await request(app)
          .post(`/api/giveaways/${testGiveawayId}/entries`)
          .set('Cookie', sessionCookie)
          .send(entry)
          .expect(201);
      }

      const entriesResponse = await request(app)
        .get(`/api/giveaways/${testGiveawayId}/entries`)
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(entriesResponse.body).toBeInstanceOf(Array);
      expect(entriesResponse.body.length).toBe(5);

      const endGiveawayResponse = await request(app)
        .post(`/api/giveaways/${testGiveawayId}/end`)
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(endGiveawayResponse.body).toHaveProperty('winners');
      expect(endGiveawayResponse.body.winners).toBeInstanceOf(Array);
      expect(endGiveawayResponse.body.winners.length).toBeLessThanOrEqual(2);

      const giveawayCheckResponse = await request(app)
        .get(`/api/giveaways/${testGiveawayId}`)
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(giveawayCheckResponse.body.isActive).toBe(false);
      expect(giveawayCheckResponse.body.endedAt).toBeTruthy();
    });
  });

  describe('E2E Flow 3: Command Creation → Usage Tracking → Analytics', () => {
    beforeEach(async () => {
      if (!testUserId) {
        const [user] = await db.insert(users).values({
          username: `e2e_analytics_user_${Date.now()}`,
          email: `e2e_analytics_${Date.now()}@test.com`,
          passwordHash: 'hash',
        }).returning();
        testUserId = user.id;

        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            email: `e2e_analytics_${Date.now()}@test.com`,
            password: 'test',
          });
        
        sessionCookie = loginResponse.headers['set-cookie']?.[0] || sessionCookie;
      }
    });

    it('should track command usage and generate analytics', async () => {
      const createCommandResponse = await request(app)
        .post('/api/commands')
        .set('Cookie', sessionCookie)
        .send({
          commandName: '!stats',
          response: 'Here are your stats!',
          isActive: true,
          cooldown: 10,
        })
        .expect(201);

      testCommandId = createCommandResponse.body.id;

      const executeCount = 10;
      for (let i = 0; i < executeCount; i++) {
        await request(app)
          .post(`/api/commands/${testCommandId}/execute`)
          .set('Cookie', sessionCookie)
          .send({
            username: `viewer_${i % 3}`,
            platform: 'twitch',
          });
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const analyticsResponse = await request(app)
        .get(`/api/commands/${testCommandId}/analytics`)
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(analyticsResponse.body).toHaveProperty('totalExecutions');
      expect(analyticsResponse.body.totalExecutions).toBeGreaterThanOrEqual(executeCount);
      expect(analyticsResponse.body).toHaveProperty('uniqueUsers');
      expect(analyticsResponse.body.uniqueUsers).toBeGreaterThanOrEqual(3);
      expect(analyticsResponse.body).toHaveProperty('executionsByHour');

      const allCommandsAnalyticsResponse = await request(app)
        .get('/api/analytics/commands')
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(allCommandsAnalyticsResponse.body).toBeInstanceOf(Array);
      const statsCommand = allCommandsAnalyticsResponse.body.find(
        (cmd: any) => cmd.commandName === '!stats'
      );
      expect(statsCommand).toBeDefined();
      expect(statsCommand.usageCount).toBeGreaterThanOrEqual(executeCount);
    });
  });

  describe('E2E Flow 4: Token Expiration → Auto-refresh → Continued Service', () => {
    beforeEach(async () => {
      if (!testUserId) {
        const [user] = await db.insert(users).values({
          username: `e2e_token_user_${Date.now()}`,
          email: `e2e_token_${Date.now()}@test.com`,
          passwordHash: 'hash',
        }).returning();
        testUserId = user.id;

        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            email: `e2e_token_${Date.now()}@test.com`,
            password: 'test',
          });
        
        sessionCookie = loginResponse.headers['set-cookie']?.[0] || sessionCookie;
      }
    });

    it('should automatically refresh expired tokens and maintain service', async () => {
      const expiredDate = new Date(Date.now() - 1000);
      
      const [connection] = await db.insert(platformConnections).values({
        userId: testUserId,
        platform: 'twitch',
        platformUserId: 'twitch_token_test',
        platformUsername: 'token_test_streamer',
        accessToken: 'expired_access_token',
        refreshToken: 'valid_refresh_token',
        expiresAt: expiredDate,
        isConnected: true,
      }).returning();
      
      testPlatformConnectionId = connection.id;

      const checkConnectionResponse = await request(app)
        .get('/api/platform-connections')
        .set('Cookie', sessionCookie)
        .expect(200);

      const twitchConnection = checkConnectionResponse.body.find(
        (conn: any) => conn.id === testPlatformConnectionId
      );
      expect(twitchConnection).toBeDefined();

      const refreshResponse = await request(app)
        .post(`/api/platform-connections/${testPlatformConnectionId}/refresh`)
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(refreshResponse.body).toHaveProperty('accessToken');
      expect(refreshResponse.body.accessToken).not.toBe('expired_access_token');
      expect(refreshResponse.body).toHaveProperty('expiresAt');
      
      const newExpiresAt = new Date(refreshResponse.body.expiresAt);
      expect(newExpiresAt.getTime()).toBeGreaterThan(Date.now());

      const [updatedConnection] = await db
        .select()
        .from(platformConnections)
        .where(eq(platformConnections.id, testPlatformConnectionId));

      expect(updatedConnection.accessToken).not.toBe('expired_access_token');
      expect(updatedConnection.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(updatedConnection.isConnected).toBe(true);

      const createCommandAfterRefresh = await request(app)
        .post('/api/commands')
        .set('Cookie', sessionCookie)
        .send({
          commandName: '!afterrefresh',
          response: 'Token refresh successful!',
          isActive: true,
        })
        .expect(201);

      expect(createCommandAfterRefresh.body).toHaveProperty('id');
    });
  });

  describe('E2E Flow 5: Multi-Platform Bot Management', () => {
    it('should manage bot across multiple platforms simultaneously', async () => {
      if (!testUserId) {
        const [user] = await db.insert(users).values({
          username: `e2e_multiplatform_${Date.now()}`,
          email: `e2e_multiplatform_${Date.now()}@test.com`,
          passwordHash: 'hash',
        }).returning();
        testUserId = user.id;

        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            email: user.email,
            password: 'test',
          });
        
        sessionCookie = loginResponse.headers['set-cookie']?.[0] || '';
      }

      const platforms = ['twitch', 'youtube', 'kick'];
      const connectionIds: string[] = [];

      for (const platform of platforms) {
        const [connection] = await db.insert(platformConnections).values({
          userId: testUserId,
          platform,
          platformUserId: `${platform}_user_123`,
          platformUsername: `${platform}_streamer`,
          accessToken: `${platform}_token`,
          refreshToken: `${platform}_refresh`,
          isConnected: true,
        }).returning();
        
        connectionIds.push(connection.id);
      }

      const allConnectionsResponse = await request(app)
        .get('/api/platform-connections')
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(allConnectionsResponse.body).toBeInstanceOf(Array);
      expect(allConnectionsResponse.body.length).toBeGreaterThanOrEqual(3);

      const createGlobalCommandResponse = await request(app)
        .post('/api/commands')
        .set('Cookie', sessionCookie)
        .send({
          commandName: '!global',
          response: 'This works on all platforms!',
          isActive: true,
          platforms: ['twitch', 'youtube', 'kick'],
        })
        .expect(201);

      const globalCommandId = createGlobalCommandResponse.body.id;

      for (const platform of platforms) {
        await request(app)
          .post(`/api/commands/${globalCommandId}/execute`)
          .set('Cookie', sessionCookie)
          .send({
            username: `test_user_${platform}`,
            platform,
          })
          .expect(200);
      }

      const platformStatsResponse = await request(app)
        .get(`/api/commands/${globalCommandId}/platform-stats`)
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(platformStatsResponse.body).toHaveProperty('twitch');
      expect(platformStatsResponse.body).toHaveProperty('youtube');
      expect(platformStatsResponse.body).toHaveProperty('kick');

      for (const connectionId of connectionIds) {
        await db.delete(platformConnections).where(eq(platformConnections.id, connectionId));
      }
    });
  });
});
