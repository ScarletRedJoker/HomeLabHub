import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { db } from '../../server/db';
import { tickets, ticketMessages, serverSettings, streamNotifications } from '../../shared/schema-postgresql';
import { eq } from 'drizzle-orm';
import type { Express } from 'express';

describe('Discord Bot E2E Critical Flows', () => {
  let app: Express;
  let testServerId: string;
  let testTicketId: string;
  let testUserId: string;
  let sessionCookie: string;

  beforeAll(async () => {
    const { createServer } = await import('../../server/index');
    app = await createServer();
    
    testServerId = `test_server_${Date.now()}`;
    testUserId = `test_user_${Date.now()}`;
  });

  afterAll(async () => {
    await db.delete(ticketMessages).where(eq(ticketMessages.ticketId, testTicketId));
    await db.delete(tickets).where(eq(tickets.serverId, testServerId));
    await db.delete(streamNotifications).where(eq(streamNotifications.serverId, testServerId));
    await db.delete(serverSettings).where(eq(serverSettings.serverId, testServerId));
  });

  describe('E2E Flow 1: Ticket Creation → Staff Assignment → Resolution → Closure', () => {
    it('should complete full ticket lifecycle from creation to closure', async () => {
      const [settings] = await db.insert(serverSettings).values({
        serverId: testServerId,
        ticketCategoryId: 'category_123',
        staffRoleId: 'staff_role_123',
        ticketCounter: 0,
      }).returning();

      const createTicketResponse = await request(app)
        .post('/api/tickets')
        .send({
          serverId: testServerId,
          userId: testUserId,
          username: 'test_user',
          subject: 'E2E Test Ticket',
          description: 'Testing the full ticket flow',
          priority: 'medium',
        })
        .expect(201);

      expect(createTicketResponse.body).toHaveProperty('id');
      expect(createTicketResponse.body.status).toBe('open');
      expect(createTicketResponse.body.subject).toBe('E2E Test Ticket');
      expect(createTicketResponse.body.ticketNumber).toBe(1);
      testTicketId = createTicketResponse.body.id;

      const getTicketResponse = await request(app)
        .get(`/api/tickets/${testTicketId}`)
        .expect(200);

      expect(getTicketResponse.body.id).toBe(testTicketId);
      expect(getTicketResponse.body.status).toBe('open');

      const assignStaffResponse = await request(app)
        .patch(`/api/tickets/${testTicketId}/assign`)
        .send({
          staffId: 'staff_user_123',
          staffUsername: 'Support Staff',
        })
        .expect(200);

      expect(assignStaffResponse.body.assignedTo).toBe('staff_user_123');
      expect(assignStaffResponse.body.status).toBe('in_progress');

      const addMessageResponse1 = await request(app)
        .post(`/api/tickets/${testTicketId}/messages`)
        .send({
          userId: 'staff_user_123',
          username: 'Support Staff',
          content: 'Hello! How can I help you?',
          isStaff: true,
        })
        .expect(201);

      expect(addMessageResponse1.body).toHaveProperty('id');
      expect(addMessageResponse1.body.content).toBe('Hello! How can I help you?');

      const addMessageResponse2 = await request(app)
        .post(`/api/tickets/${testTicketId}/messages`)
        .send({
          userId: testUserId,
          username: 'test_user',
          content: 'I need help with my account.',
          isStaff: false,
        })
        .expect(201);

      const addMessageResponse3 = await request(app)
        .post(`/api/tickets/${testTicketId}/messages`)
        .send({
          userId: 'staff_user_123',
          username: 'Support Staff',
          content: 'Issue resolved!',
          isStaff: true,
        })
        .expect(201);

      const messagesResponse = await request(app)
        .get(`/api/tickets/${testTicketId}/messages`)
        .expect(200);

      expect(messagesResponse.body).toBeInstanceOf(Array);
      expect(messagesResponse.body.length).toBeGreaterThanOrEqual(3);

      const resolveTicketResponse = await request(app)
        .patch(`/api/tickets/${testTicketId}/resolve`)
        .send({
          resolution: 'Account issue resolved successfully',
          resolvedBy: 'staff_user_123',
        })
        .expect(200);

      expect(resolveTicketResponse.body.status).toBe('resolved');
      expect(resolveTicketResponse.body.resolution).toBe('Account issue resolved successfully');
      expect(resolveTicketResponse.body.resolvedAt).toBeTruthy();

      const closeTicketResponse = await request(app)
        .patch(`/api/tickets/${testTicketId}/close`)
        .send({
          closedBy: 'staff_user_123',
        })
        .expect(200);

      expect(closeTicketResponse.body.status).toBe('closed');
      expect(closeTicketResponse.body.closedAt).toBeTruthy();

      const ticketHistoryResponse = await request(app)
        .get(`/api/tickets/${testTicketId}/history`)
        .expect(200);

      expect(ticketHistoryResponse.body).toHaveProperty('events');
      expect(ticketHistoryResponse.body.events).toBeInstanceOf(Array);
      expect(ticketHistoryResponse.body.events.length).toBeGreaterThan(0);
    });
  });

  describe('E2E Flow 2: Stream Go-Live Detection → Notification → Multiple Platforms', () => {
    beforeEach(async () => {
      const existingSettings = await db
        .select()
        .from(serverSettings)
        .where(eq(serverSettings.serverId, testServerId));

      if (existingSettings.length === 0) {
        await db.insert(serverSettings).values({
          serverId: testServerId,
          ticketCategoryId: 'category_123',
          staffRoleId: 'staff_role_123',
          ticketCounter: 0,
        });
      }
    });

    it('should detect stream go-live and send notifications across platforms', async () => {
      const platforms = [
        { platform: 'twitch', channelId: 'twitch_channel_123', streamerId: 'twitch_streamer' },
        { platform: 'youtube', channelId: 'youtube_channel_123', streamerId: 'youtube_streamer' },
        { platform: 'kick', channelId: 'kick_channel_123', streamerId: 'kick_streamer' },
      ];

      for (const { platform, channelId, streamerId } of platforms) {
        await db.insert(streamNotifications).values({
          serverId: testServerId,
          platform,
          channelId,
          streamerId,
          streamerName: `${platform}_name`,
          roleId: `${platform}_role`,
          messageTemplate: `🔴 {streamer} is now live on ${platform}!`,
          isEnabled: true,
        });
      }

      const settingsResponse = await request(app)
        .get(`/api/servers/${testServerId}/stream-notifications`)
        .expect(200);

      expect(settingsResponse.body).toBeInstanceOf(Array);
      expect(settingsResponse.body.length).toBe(3);

      const twitchNotification = settingsResponse.body.find((n: any) => n.platform === 'twitch');
      expect(twitchNotification).toBeDefined();
      expect(twitchNotification.isEnabled).toBe(true);

      const mockStreamData = {
        platform: 'twitch',
        streamerId: 'twitch_streamer',
        streamerName: 'twitch_name',
        title: 'Testing Stream Notifications E2E',
        game: 'Software Development',
        viewerCount: 42,
        thumbnailUrl: 'https://example.com/thumbnail.jpg',
        startedAt: new Date().toISOString(),
      };

      const goLiveResponse = await request(app)
        .post('/api/stream-notifications/go-live')
        .send(mockStreamData)
        .expect(200);

      expect(goLiveResponse.body).toHaveProperty('notificationsSent');
      expect(goLiveResponse.body.notificationsSent).toBeGreaterThan(0);
      expect(goLiveResponse.body).toHaveProperty('servers');

      const offlineResponse = await request(app)
        .post('/api/stream-notifications/offline')
        .send({
          platform: 'twitch',
          streamerId: 'twitch_streamer',
        })
        .expect(200);

      expect(offlineResponse.body).toHaveProperty('success');
      expect(offlineResponse.body.success).toBe(true);

      const updateNotificationResponse = await request(app)
        .patch(`/api/servers/${testServerId}/stream-notifications/twitch`)
        .send({
          messageTemplate: '🎮 {streamer} is streaming {game} with {viewers} viewers!',
          roleId: 'new_role_id',
        })
        .expect(200);

      expect(updateNotificationResponse.body.messageTemplate).toBe(
        '🎮 {streamer} is streaming {game} with {viewers} viewers!'
      );
    });

    it('should handle auto-detection of streams across multiple platforms', async () => {
      const mockStreams = [
        {
          platform: 'twitch',
          streamerId: 'auto_twitch_1',
          streamerName: 'AutoStreamer1',
          title: 'Auto-detected Twitch Stream',
          isLive: true,
        },
        {
          platform: 'youtube',
          streamerId: 'auto_youtube_1',
          streamerName: 'AutoStreamer2',
          title: 'Auto-detected YouTube Stream',
          isLive: true,
        },
      ];

      for (const stream of mockStreams) {
        await db.insert(streamNotifications).values({
          serverId: testServerId,
          platform: stream.platform,
          channelId: `channel_${stream.platform}`,
          streamerId: stream.streamerId,
          streamerName: stream.streamerName,
          roleId: 'auto_role',
          messageTemplate: '🔴 {streamer} is live!',
          isEnabled: true,
          autoDetect: true,
        });
      }

      const detectResponse = await request(app)
        .post('/api/stream-notifications/detect')
        .send({ serverId: testServerId })
        .expect(200);

      expect(detectResponse.body).toHaveProperty('streamsDetected');
      expect(detectResponse.body.streamsDetected).toBeInstanceOf(Array);
      expect(detectResponse.body.streamsDetected.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('E2E Flow 3: OAuth Linking → Multiple Servers → Permission Handling', () => {
    it('should handle OAuth flow and manage multiple server permissions', async () => {
      const mockDiscordUser = {
        id: 'discord_user_123',
        username: 'TestDiscordUser',
        discriminator: '1234',
        avatar: 'avatar_hash',
      };

      const oauthMockResponse = await request(app)
        .post('/api/auth/discord/mock-callback')
        .send({
          code: 'mock_oauth_code',
          user: mockDiscordUser,
        })
        .expect(200);

      expect(oauthMockResponse.body).toHaveProperty('accessToken');
      expect(oauthMockResponse.body).toHaveProperty('user');
      expect(oauthMockResponse.body.user.id).toBe(mockDiscordUser.id);

      sessionCookie = oauthMockResponse.headers['set-cookie']?.[0] || '';

      const servers = [
        { serverId: `server_1_${Date.now()}`, serverName: 'Test Server 1', permissions: 'admin' },
        { serverId: `server_2_${Date.now()}`, serverName: 'Test Server 2', permissions: 'moderator' },
        { serverId: `server_3_${Date.now()}`, serverName: 'Test Server 3', permissions: 'member' },
      ];

      for (const server of servers) {
        await db.insert(serverSettings).values({
          serverId: server.serverId,
          ticketCategoryId: 'category',
          staffRoleId: 'staff',
          ticketCounter: 0,
        });
      }

      const userServersResponse = await request(app)
        .get('/api/user/servers')
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(userServersResponse.body).toBeInstanceOf(Array);

      const adminServerResponse = await request(app)
        .get(`/api/servers/${servers[0].serverId}/settings`)
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(adminServerResponse.body).toHaveProperty('serverId');

      const updateSettingsResponse = await request(app)
        .patch(`/api/servers/${servers[0].serverId}/settings`)
        .set('Cookie', sessionCookie)
        .send({
          ticketCategoryId: 'new_category_123',
          staffRoleId: 'new_staff_role_123',
        })
        .expect(200);

      expect(updateSettingsResponse.body.ticketCategoryId).toBe('new_category_123');

      const createTicketInServerResponse = await request(app)
        .post('/api/tickets')
        .set('Cookie', sessionCookie)
        .send({
          serverId: servers[0].serverId,
          userId: mockDiscordUser.id,
          username: mockDiscordUser.username,
          subject: 'Cross-server ticket test',
          description: 'Testing permissions',
        })
        .expect(201);

      expect(createTicketInServerResponse.body.serverId).toBe(servers[0].serverId);

      for (const server of servers) {
        await db.delete(serverSettings).where(eq(serverSettings.serverId, server.serverId));
      }
    });
  });

  describe('E2E Flow 4: Ticket Concurrency and Rate Limiting', () => {
    it('should handle multiple simultaneous ticket operations', async () => {
      const ticketPromises = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post('/api/tickets')
          .send({
            serverId: testServerId,
            userId: `concurrent_user_${i}`,
            username: `ConcurrentUser${i}`,
            subject: `Concurrent Ticket ${i}`,
            description: `Testing concurrent ticket creation ${i}`,
            priority: 'low',
          })
      );

      const results = await Promise.all(ticketPromises);

      results.forEach((result, i) => {
        expect(result.status).toBe(201);
        expect(result.body).toHaveProperty('id');
        expect(result.body.subject).toBe(`Concurrent Ticket ${i}`);
      });

      const allTicketsResponse = await request(app)
        .get(`/api/servers/${testServerId}/tickets`)
        .expect(200);

      expect(allTicketsResponse.body).toBeInstanceOf(Array);
      expect(allTicketsResponse.body.length).toBeGreaterThanOrEqual(5);

      for (const result of results) {
        await db.delete(tickets).where(eq(tickets.id, result.body.id));
      }
    });
  });
});
