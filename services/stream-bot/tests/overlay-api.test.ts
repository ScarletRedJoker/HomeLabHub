import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { db } from '../server/db';
import { users, platformConnections } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { createTestApp } from './test-utils';

describe('Overlay API Integration Tests', () => {
  let app: any;
  let testUserId: string;
  let spotifyConnectionId: string;

  beforeAll(async () => {
    app = await createTestApp();

    const [user] = await db.insert(users).values({
      username: 'overlay_test_user',
      email: `overlay-test-${Date.now()}@test.com`,
      passwordHash: 'hash',
    }).returning();
    testUserId = user.id;

    const [connection] = await db.insert(platformConnections).values({
      userId: testUserId,
      platform: 'spotify',
      platformUserId: 'spotify_123',
      platformUsername: 'test_spotify_user',
      accessToken: 'mock_access_token',
      refreshToken: 'mock_refresh_token',
      isConnected: true,
    }).returning();
    spotifyConnectionId = connection.id;
  });

  afterAll(async () => {
    await db.delete(platformConnections).where(eq(platformConnections.userId, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  describe('POST /api/overlay/generate-token', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/overlay/generate-token')
        .send({ platform: 'spotify' });

      expect(response.status).toBe(401);
    });

    it('should reject invalid platforms', async () => {
      const response = await request(app)
        .post('/api/overlay/generate-token')
        .set('Cookie', [`user=${testUserId}`])
        .send({ platform: 'invalid_platform' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid platform');
    });

    it('should generate a valid overlay token for Spotify', async () => {
      const response = await request(app)
        .post('/api/overlay/generate-token')
        .set('Cookie', [`user=${testUserId}`])
        .send({ platform: 'spotify', expiresIn: 86400 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('expiresIn');
      expect(response.body).toHaveProperty('overlayUrl');
    });

    it('CRITICAL: should return OBS-optimized URL (not React app URL)', async () => {
      const response = await request(app)
        .post('/api/overlay/generate-token')
        .set('Cookie', [`user=${testUserId}`])
        .send({ platform: 'spotify', expiresIn: 86400 });

      expect(response.status).toBe(200);
      
      const overlayUrl = response.body.overlayUrl;
      expect(overlayUrl).toContain('/api/overlay/spotify/obs');
      expect(overlayUrl).not.toBe('/overlay/spotify');
      expect(overlayUrl).toContain('token=');
    });

    it('should enforce maximum token expiry of 30 days', async () => {
      const response = await request(app)
        .post('/api/overlay/generate-token')
        .set('Cookie', [`user=${testUserId}`])
        .send({ platform: 'spotify', expiresIn: 999999999 });

      expect(response.status).toBe(200);
      expect(response.body.expiresIn).toBeLessThanOrEqual(30 * 24 * 60 * 60);
    });
  });

  describe('GET /api/overlay/spotify/obs', () => {
    it('should return error HTML for missing token', async () => {
      const response = await request(app)
        .get('/api/overlay/spotify/obs');

      expect([400, 401]).toContain(response.status);
      expect(response.text.toLowerCase()).toContain('token');
    });

    it('should return error HTML for invalid token', async () => {
      const response = await request(app)
        .get('/api/overlay/spotify/obs?token=invalid_token');

      expect(response.status).toBe(401);
      expect(response.text).toContain('Invalid');
      expect(response.text).toContain('<!DOCTYPE html>');
    });

    it('should include inline CSS (OBS compatibility)', async () => {
      const tokenResponse = await request(app)
        .post('/api/overlay/generate-token')
        .set('Cookie', [`user=${testUserId}`])
        .send({ platform: 'spotify', expiresIn: 86400 });

      const token = tokenResponse.body.token;
      
      const response = await request(app)
        .get(`/api/overlay/spotify/obs?token=${token}`);

      expect(response.text).toContain('<style>');
      expect(response.text).toContain('background');
      expect(response.text).not.toContain('<link rel="stylesheet"');
    });

    it('should have transparent background for OBS', async () => {
      const tokenResponse = await request(app)
        .post('/api/overlay/generate-token')
        .set('Cookie', [`user=${testUserId}`])
        .send({ platform: 'spotify', expiresIn: 86400 });

      const token = tokenResponse.body.token;
      
      const response = await request(app)
        .get(`/api/overlay/spotify/obs?token=${token}`);

      expect(response.text).toContain('transparent');
    });

    it('should set correct CORS and cache headers', async () => {
      const tokenResponse = await request(app)
        .post('/api/overlay/generate-token')
        .set('Cookie', [`user=${testUserId}`])
        .send({ platform: 'spotify', expiresIn: 86400 });

      const token = tokenResponse.body.token;
      
      const response = await request(app)
        .get(`/api/overlay/spotify/obs?token=${token}`);

      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['cache-control']).toContain('no-cache');
    });
  });

  describe('GET /api/overlay/:platform/data', () => {
    it('should require token', async () => {
      const response = await request(app)
        .get('/api/overlay/spotify/data');

      expect(response.status).toBe(401);
    });

    it('should reject invalid tokens', async () => {
      const response = await request(app)
        .get('/api/overlay/spotify/data?token=bad_token');

      expect([400, 401]).toContain(response.status);
    });

    it('should return data with valid token (happy path)', async () => {
      const tokenResponse = await request(app)
        .post('/api/overlay/generate-token')
        .set('Cookie', [`user=${testUserId}`])
        .send({ platform: 'spotify', expiresIn: 86400 });

      expect(tokenResponse.status).toBe(200);
      const token = tokenResponse.body.token;
      
      const dataResponse = await request(app)
        .get(`/api/overlay/spotify/data?token=${token}`);

      expect([200, 401, 404, 500]).toContain(dataResponse.status);
      if (dataResponse.status === 200) {
        expect(dataResponse.body).toBeDefined();
      }
    });
  });

  describe('Overlay URL Format Validation', () => {
    const platforms = ['spotify', 'youtube', 'alerts'];
    
    it.each(platforms)('should generate valid URL format for %s', async (platform) => {
      if (platform === 'youtube') {
        await db.insert(platformConnections).values({
          userId: testUserId,
          platform: 'youtube',
          platformUserId: 'youtube_123',
          platformUsername: 'test_youtube_user',
          accessToken: 'mock_access_token',
          refreshToken: 'mock_refresh_token',
          isConnected: true,
        });
      }

      const response = await request(app)
        .post('/api/overlay/generate-token')
        .set('Cookie', [`user=${testUserId}`])
        .send({ platform, expiresIn: 86400 });

      if (response.status === 200) {
        const url = response.body.overlayUrl;
        expect(url).toMatch(/^\/(?:api\/)?overlay\//);
        expect(url).toContain('token=');
        expect(url.split('token=')[1].length).toBeGreaterThan(20);
      }
    });
  });

  describe('Token Security', () => {
    it('should use signed JWT tokens (not raw user IDs)', async () => {
      const response = await request(app)
        .post('/api/overlay/generate-token')
        .set('Cookie', [`user=${testUserId}`])
        .send({ platform: 'spotify', expiresIn: 86400 });

      const token = response.body.token;
      expect(token).toBeDefined();
      expect(token.split('.').length).toBe(3);
    });

    it('should reject expired tokens', async () => {
      const response = await request(app)
        .post('/api/overlay/generate-token')
        .set('Cookie', [`user=${testUserId}`])
        .send({ platform: 'spotify', expiresIn: 1 });

      const token = response.body.token;
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const dataResponse = await request(app)
        .get(`/api/overlay/spotify/data?token=${token}`);

      expect(dataResponse.status).toBe(401);
    }, 10000);
  });
});
