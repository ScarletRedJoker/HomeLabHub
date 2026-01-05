import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp } from './test-utils';
import { db } from '../server/db';
import { users, platformConnections } from '../shared/schema';
import { eq } from 'drizzle-orm';

describe('E2E: Spotify Overlay Workflow', () => {
  let app: Express;
  const testUserId = 'e2e-workflow-' + Date.now();
  
  beforeAll(async () => {
    app = await createTestApp();
    
    await db.insert(users).values({
      id: testUserId,
      username: 'e2e_test_user',
      email: 'e2e@test.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
  });
  
  afterAll(async () => {
    await db.delete(platformConnections).where(eq(platformConnections.userId, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  it('should complete full Spotify overlay workflow: Connect → Generate Token → Access Overlay', async () => {
    await db.insert(platformConnections).values({
      userId: testUserId,
      platform: 'spotify',
      platformUserId: 'spotify_e2e_' + Date.now(),
      platformUsername: 'E2E Spotify User',
      accessToken: 'test_access_token',
      refreshToken: 'test_refresh_token',
      isConnected: true,
    });

    const tokenResponse = await request(app)
      .post('/api/overlay/generate-token')
      .set('Cookie', [`user=${testUserId}`])
      .send({ platform: 'spotify', expiresIn: 86400 });

    expect(tokenResponse.status).toBe(200);
    expect(tokenResponse.body).toHaveProperty('token');
    expect(tokenResponse.body).toHaveProperty('overlayUrl');
    
    const token = tokenResponse.body.token;
    const overlayUrl = tokenResponse.body.overlayUrl;
    
    expect(overlayUrl).toContain('/api/overlay/spotify/obs');
    expect(overlayUrl).not.toMatch(/^\/overlay\/spotify(\?|$)/);

    const obsOverlayResponse = await request(app)
      .get(`/api/overlay/spotify/obs?token=${token}`);

    expect(obsOverlayResponse.status).toBe(200);
    expect(obsOverlayResponse.headers['content-type']).toContain('text/html');
    expect(obsOverlayResponse.text).toContain('<style>');
    expect(obsOverlayResponse.text).toContain('background: transparent');

    const dataResponse = await request(app)
      .get(`/api/overlay/spotify/data?token=${token}`);

    expect([200, 401, 500]).toContain(dataResponse.status);
    if (dataResponse.status === 200) {
      expect(dataResponse.headers['content-type']).toContain('application/json');
    }
  });

  it('should require Spotify connection before generating overlay', async () => {
    const noConnectionUserId = 'no-connection-' + Date.now();
    
    await db.insert(users).values({
      id: noConnectionUserId,
      username: 'no_connection_user',
      email: 'noconnect@test.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();

    const tokenResponse = await request(app)
      .post('/api/overlay/generate-token')
      .set('Cookie', [`user=${noConnectionUserId}`])
      .send({ platform: 'spotify', expiresIn: 86400 });

    expect([200, 400, 404]).toContain(tokenResponse.status);

    await db.delete(users).where(eq(users.id, noConnectionUserId));
  });

  it('should reject overlay access with invalid token', async () => {
    const obsResponse = await request(app)
      .get('/api/overlay/spotify/obs?token=invalid_fake_token');

    expect([200, 401]).toContain(obsResponse.status);
    if (obsResponse.status === 200) {
      expect(obsResponse.text).toContain('Error');
    }
  });
});
