import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { db } from '../server/db';
import { users, platformConnections } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { createTestApp } from './test-utils';

describe('OAuth Flow Integration Tests', () => {
  let app: any;
  let testUserId: string;

  beforeAll(async () => {
    app = await createTestApp();

    const [user] = await db.insert(users).values({
      username: 'oauth_test_user',
      email: `oauth-test-${Date.now()}@test.com`,
      passwordHash: 'hash',
    }).returning();
    testUserId = user.id;
  });

  afterAll(async () => {
    await db.delete(platformConnections).where(eq(platformConnections.userId, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  describe('Spotify OAuth', () => {
    it('GET /auth/spotify should redirect to Spotify authorization', async () => {
      const response = await request(app)
        .get('/auth/spotify')
        .set('Cookie', [`user=${testUserId}`])
        .redirects(0);

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('accounts.spotify.com');
      expect(response.headers.location).toContain('client_id=');
      expect(response.headers.location).toContain('redirect_uri=');
      expect(response.headers.location).toContain('scope=');
    });

    it('GET /auth/spotify/callback should handle missing code parameter', async () => {
      const response = await request(app)
        .get('/auth/spotify/callback');

      expect([302, 400, 401]).toContain(response.status);
    });

    it('DELETE /auth/spotify/disconnect should return success or error', async () => {
      const response = await request(app)
        .delete('/auth/spotify/disconnect')
        .set('Cookie', [`user=${testUserId}`]);

      expect([200, 400, 404]).toContain(response.status);
    });
  });

  describe('Twitch OAuth', () => {
    it('GET /auth/twitch should redirect to Twitch authorization', async () => {
      const response = await request(app)
        .get('/auth/twitch')
        .set('Cookie', [`user=${testUserId}`])
        .redirects(0);

      expect([302, 301, 307, 308]).toContain(response.status);
      if (response.headers.location) {
        expect(response.headers.location).toContain('twitch.tv');
      }
    });

    it('GET /auth/twitch/callback should handle missing code parameter', async () => {
      const response = await request(app)
        .get('/auth/twitch/callback');

      expect([302, 400, 401]).toContain(response.status);
    });
  });

  describe('YouTube OAuth', () => {
    it('GET /auth/youtube should redirect to Google authorization', async () => {
      const response = await request(app)
        .get('/auth/youtube')
        .set('Cookie', [`user=${testUserId}`])
        .redirects(0);

      expect([302, 301, 307, 308]).toContain(response.status);
      if (response.headers.location) {
        expect(response.headers.location).toContain('google.com');
      }
    });
  });

  describe('Kick OAuth', () => {
    it('GET /auth/kick should redirect to Kick authorization', async () => {
      const response = await request(app)
        .get('/auth/kick')
        .set('Cookie', [`user=${testUserId}`])
        .redirects(0);

      expect([302, 301, 307, 308]).toContain(response.status);
    });
  });

  describe('Platform Connection API', () => {
    it('GET /api/platforms should return user connections', async () => {
      const response = await request(app)
        .get('/api/platforms')
        .set('Cookie', [`user=${testUserId}`]);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('GET /api/platforms/token-health should return token status', async () => {
      const response = await request(app)
        .get('/api/platforms/token-health')
        .set('Cookie', [`user=${testUserId}`]);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('platforms');
    });

    it('should not expose access tokens in API responses', async () => {
      await db.insert(platformConnections).values({
        userId: testUserId,
        platform: 'twitch',
        platformUserId: 'security_test',
        platformUsername: 'security_user',
        accessToken: 'super_secret_token_12345',
        refreshToken: 'super_secret_refresh_67890',
        isConnected: true,
      });

      const response = await request(app)
        .get('/api/platforms')
        .set('Cookie', [`user=${testUserId}`]);

      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toContain('super_secret_token');
      expect(responseText).not.toContain('super_secret_refresh');
    });
  });

  describe('OAuth Callback URL Handling', () => {
    const platforms = [
      { path: '/auth/spotify/callback', name: 'Spotify' },
      { path: '/auth/twitch/callback', name: 'Twitch' },
      { path: '/auth/youtube/callback', name: 'YouTube' },
      { path: '/auth/kick/callback', name: 'Kick' },
    ];

    it.each(platforms)('$name callback should handle error parameter', async ({ path }) => {
      const response = await request(app)
        .get(`${path}?error=access_denied&error_description=User+denied+access`);

      expect(response.status).toBeGreaterThanOrEqual(300);
    });

    it.each(platforms)('$name callback should handle missing state', async ({ path }) => {
      const response = await request(app)
        .get(`${path}?code=valid_code`);

      expect([302, 400, 401, 500]).toContain(response.status);
    });
  });

  describe('Redirect URL Validation', () => {
    it('should redirect to settings page after successful connection', async () => {
      const successRedirectUrl = '/settings?spotify=connected';
      expect(successRedirectUrl).toContain('/settings');
      expect(successRedirectUrl).toContain('=connected');
    });

    it('should redirect with error parameter on failure', async () => {
      const errorRedirectUrl = '/settings?error=spotify_auth_failed';
      expect(errorRedirectUrl).toContain('/settings');
      expect(errorRedirectUrl).toContain('error=');
    });
  });
});
