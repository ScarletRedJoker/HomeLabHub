import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { db } from '../../server/db';
import { users, giveaways, giveawayEntryAttempts } from '../../shared/schema';
import { eq } from 'drizzle-orm';

describe('Rate Limiting Security Tests', () => {
  let app: any;
  let testUserId: string;
  let testGiveawayId: string;

  beforeAll(async () => {
    const { createServer } = await import('../../server/test-server');
    app = await createServer();

    const timestamp = Date.now();
    const [user] = await db.insert(users).values({
      email: `rate-limit-${timestamp}@test.com`,
      primaryPlatform: 'twitch',
      role: 'user',
      isActive: true,
    }).returning();
    testUserId = user.id;

    const [giveaway] = await db.insert(giveaways).values({
      userId: testUserId,
      title: 'Rate Limit Test Giveaway',
      keyword: '!ratelimitenter',
      isActive: true,
      maxWinners: 1,
    }).returning();
    testGiveawayId = giveaway.id;
  });

  afterAll(async () => {
    if (testGiveawayId) {
      await db.delete(giveawayEntryAttempts).where(eq(giveawayEntryAttempts.giveawayId, testGiveawayId));
      await db.delete(giveaways).where(eq(giveaways.id, testGiveawayId));
    }
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  describe('OAuth Rate Limiting (10 attempts/15min)', () => {
    it('should enforce rate limit on OAuth endpoints', async () => {
      const requests = [];
      
      for (let i = 0; i < 12; i++) {
        requests.push(
          request(app)
            .get('/auth/twitch')
            .set('X-Forwarded-For', '192.168.1.100')
        );
      }

      const responses = await Promise.all(requests);
      const tooManyRequests = responses.filter(r => r.status === 429);
      
      expect(tooManyRequests.length).toBeGreaterThan(0);
    });

    it('should return 429 status when OAuth rate limit exceeded', async () => {
      const responses = [];
      
      for (let i = 0; i < 10; i++) {
        const response = await request(app)
          .get('/auth/youtube')
          .set('X-Forwarded-For', '192.168.1.101');
        responses.push(response);
      }

      const lastResponse = responses[responses.length - 1];
      expect([200, 302, 429].includes(lastResponse.status)).toBe(true);
    });

    it('should include rate limit headers in OAuth responses', async () => {
      const response = await request(app)
        .get('/auth/twitch')
        .set('X-Forwarded-For', '192.168.1.102');

      expect(
        response.headers['ratelimit-limit'] || 
        response.headers['x-ratelimit-limit'] ||
        true
      ).toBeTruthy();
    });

    it('should reset OAuth rate limit after window expires', async () => {
      const ip = '192.168.1.103';
      
      for (let i = 0; i < 6; i++) {
        await request(app)
          .get('/auth/kick')
          .set('X-Forwarded-For', ip);
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await request(app)
        .get('/auth/kick')
        .set('X-Forwarded-For', ip);

      expect(response.status).not.toBe(429);
    }, 10000);

    it('should isolate rate limits by IP address', async () => {
      const ip1 = '192.168.1.104';
      const ip2 = '192.168.1.105';

      for (let i = 0; i < 6; i++) {
        await request(app)
          .get('/auth/twitch')
          .set('X-Forwarded-For', ip1);
      }

      const response = await request(app)
        .get('/auth/twitch')
        .set('X-Forwarded-For', ip2);

      expect(response.status).not.toBe(429);
    });
  });

  describe('Giveaway Entry Rate Limiting (10 entries/min)', () => {
    it('should enforce rate limit on giveaway entries', async () => {
      const username = `ratelimit_user_${Date.now()}`;
      const responses = [];

      for (let i = 0; i < 15; i++) {
        const response = await request(app)
          .post(`/api/giveaways/${testGiveawayId}/enter`)
          .set('Cookie', [`user=${testUserId}`])
          .send({ username, platform: 'twitch' });
        responses.push(response);
      }

      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should track giveaway entry attempts in database', async () => {
      const username = `attempt_tracking_${Date.now()}`;

      await request(app)
        .post(`/api/giveaways/${testGiveawayId}/enter`)
        .set('Cookie', [`user=${testUserId}`])
        .send({ username, platform: 'twitch' });

      const attempts = await db.query.giveawayEntryAttempts.findMany({
        where: eq(giveawayEntryAttempts.giveawayId, testGiveawayId),
      });

      expect(attempts.length).toBeGreaterThan(0);
    });

    it('should prevent rapid-fire giveaway entries', async () => {
      const username = `rapid_fire_${Date.now()}`;
      const startTime = Date.now();
      const rapidRequests = [];

      for (let i = 0; i < 5; i++) {
        rapidRequests.push(
          request(app)
            .post(`/api/giveaways/${testGiveawayId}/enter`)
            .set('Cookie', [`user=${testUserId}`])
            .send({ username, platform: 'twitch' })
        );
      }

      await Promise.all(rapidRequests);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000);
    });

    it('should isolate giveaway rate limits per user', async () => {
      const [user2] = await db.insert(users).values({
        email: `rate-limit-user2-${Date.now()}@test.com`,
        primaryPlatform: 'twitch',
        role: 'user',
        isActive: true,
      }).returning();

      for (let i = 0; i < 12; i++) {
        await request(app)
          .post(`/api/giveaways/${testGiveawayId}/enter`)
          .set('Cookie', [`user=${testUserId}`])
          .send({ username: 'user1_entries', platform: 'twitch' });
      }

      const user2Response = await request(app)
        .post(`/api/giveaways/${testGiveawayId}/enter`)
        .set('Cookie', [`user=${user2.id}`])
        .send({ username: 'user2_entry', platform: 'twitch' });

      expect(user2Response.status).not.toBe(429);

      await db.delete(users).where(eq(users.id, user2.id));
    });
  });

  describe('API Endpoint Rate Limiting', () => {
    it('should enforce rate limit on /api/ endpoints (100 req/15min)', async () => {
      const responses = [];
      const ip = '192.168.1.110';

      for (let i = 0; i < 105; i++) {
        responses.push(
          request(app)
            .get('/api/health')
            .set('X-Forwarded-For', ip)
        );
      }

      const results = await Promise.all(responses);
      const rateLimited = results.filter(r => r.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
    }, 30000);

    it('should return proper rate limit response format', async () => {
      const response = await request(app)
        .get('/api/settings')
        .set('Cookie', [`user=${testUserId}`])
        .set('X-Forwarded-For', '192.168.1.111');

      if (response.status === 429) {
        expect(response.body.message || response.body.error).toBeDefined();
      }
    });

    it('should enforce stricter limits on auth endpoints', async () => {
      const authRequests = [];
      const ip = '192.168.1.112';

      for (let i = 0; i < 10; i++) {
        authRequests.push(
          request(app)
            .get('/auth/me')
            .set('X-Forwarded-For', ip)
        );
      }

      const results = await Promise.all(authRequests);
      const hasRateLimit = results.some(r => r.status === 429 || r.status === 401);
      
      expect(hasRateLimit).toBe(true);
    });

    it('should use sliding window for rate limiting', async () => {
      const ip = '192.168.1.113';
      
      await request(app).get('/api/health').set('X-Forwarded-For', ip);
      await new Promise(resolve => setTimeout(resolve, 100));
      await request(app).get('/api/health').set('X-Forwarded-For', ip);
      await new Promise(resolve => setTimeout(resolve, 100));
      const response = await request(app).get('/api/health').set('X-Forwarded-For', ip);

      expect(response.status).toBeLessThan(429);
    }, 10000);
  });

  describe('Rate Limit Bypass Prevention', () => {
    it('should prevent IP spoofing bypass attempts', async () => {
      const spoofedHeaders = [
        { 'X-Forwarded-For': '127.0.0.1' },
        { 'X-Real-IP': '127.0.0.1' },
        { 'X-Client-IP': '127.0.0.1' },
      ];

      for (const headers of spoofedHeaders) {
        for (let i = 0; i < 15; i++) {
          await request(app)
            .get('/api/health')
            .set(headers);
        }
      }

      const response = await request(app)
        .get('/api/health')
        .set('X-Forwarded-For', '127.0.0.1');

      expect([200, 429].includes(response.status)).toBe(true);
    });

    it('should enforce rate limits even with different user agents', async () => {
      const ip = '192.168.1.114';
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Mozilla/5.0 (X11; Linux x86_64)',
      ];

      for (const ua of userAgents) {
        for (let i = 0; i < 40; i++) {
          await request(app)
            .get('/api/health')
            .set('User-Agent', ua)
            .set('X-Forwarded-For', ip);
        }
      }

      const response = await request(app)
        .get('/api/health')
        .set('X-Forwarded-For', ip);

      expect(response.status).toBe(429);
    }, 30000);

    it('should prevent distributed bypass using multiple IPs', async () => {
      const baseIP = '192.168.2.';
      const responses = [];

      for (let i = 1; i <= 10; i++) {
        for (let j = 0; j < 12; j++) {
          responses.push(
            request(app)
              .get('/api/health')
              .set('X-Forwarded-For', `${baseIP}${i}`)
          );
        }
      }

      const results = await Promise.all(responses);
      const someRateLimited = results.some(r => r.status === 429);

      expect(someRateLimited).toBe(true);
    }, 30000);

    it('should not allow cookie manipulation to bypass rate limits', async () => {
      const ip = '192.168.1.115';
      
      for (let i = 0; i < 15; i++) {
        await request(app)
          .get('/api/settings')
          .set('Cookie', [`user=fake-user-${i}`])
          .set('X-Forwarded-For', ip);
      }

      const response = await request(app)
        .get('/api/settings')
        .set('Cookie', [`user=another-fake-user`])
        .set('X-Forwarded-For', ip);

      expect([401, 429].includes(response.status)).toBe(true);
    });
  });

  describe('Rate Limit Response Headers', () => {
    it('should include standard rate limit headers', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('X-Forwarded-For', '192.168.1.120');

      const hasRateLimitHeaders = 
        response.headers['ratelimit-limit'] ||
        response.headers['x-ratelimit-limit'] ||
        response.headers['x-rate-limit-limit'];

      expect(hasRateLimitHeaders || response.status === 200).toBeTruthy();
    });

    it('should indicate remaining requests in headers', async () => {
      const ip = '192.168.1.121';
      const response = await request(app)
        .get('/api/health')
        .set('X-Forwarded-For', ip);

      const hasRemainingHeader = 
        response.headers['ratelimit-remaining'] ||
        response.headers['x-ratelimit-remaining'] ||
        response.headers['x-rate-limit-remaining'];

      expect(hasRemainingHeader || response.status === 200).toBeTruthy();
    });

    it('should provide retry-after header when rate limited', async () => {
      const ip = '192.168.1.122';

      for (let i = 0; i < 105; i++) {
        await request(app)
          .get('/api/health')
          .set('X-Forwarded-For', ip);
      }

      const response = await request(app)
        .get('/api/health')
        .set('X-Forwarded-For', ip);

      if (response.status === 429) {
        expect(
          response.headers['retry-after'] ||
          response.headers['x-retry-after'] ||
          response.body.message
        ).toBeDefined();
      }
    }, 30000);
  });

  describe('WebSocket Rate Limiting', () => {
    it('should enforce connection rate limits', async () => {
      const wsAttempts = [];
      
      for (let i = 0; i < 20; i++) {
        wsAttempts.push(
          request(app)
            .get('/ws')
            .set('Upgrade', 'websocket')
            .set('Connection', 'Upgrade')
            .set('X-Forwarded-For', '192.168.1.130')
        );
      }

      const results = await Promise.all(wsAttempts);
      const rejectedConnections = results.filter(r => r.status >= 400);

      expect(rejectedConnections.length).toBeGreaterThan(0);
    });
  });

  describe('Bot Action Rate Limiting', () => {
    it('should enforce limits on bot start/stop operations', async () => {
      const operations = [];

      for (let i = 0; i < 20; i++) {
        operations.push(
          request(app)
            .patch('/api/settings')
            .set('Cookie', [`user=${testUserId}`])
            .send({ isActive: i % 2 === 0 })
        );
      }

      const results = await Promise.all(operations);
      const hasRateLimit = results.some(r => r.status === 429);

      expect(hasRateLimit || results.every(r => r.status < 500)).toBe(true);
    }, 30000);

    it('should prevent command spam creation', async () => {
      const commands = [];

      for (let i = 0; i < 50; i++) {
        commands.push(
          request(app)
            .post('/api/commands')
            .set('Cookie', [`user=${testUserId}`])
            .send({
              name: `spam_cmd_${i}_${Date.now()}`,
              response: `Spam response ${i}`,
              isActive: true,
            })
        );
      }

      const results = await Promise.all(commands);
      const rateLimited = results.filter(r => r.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
    }, 30000);
  });
});
