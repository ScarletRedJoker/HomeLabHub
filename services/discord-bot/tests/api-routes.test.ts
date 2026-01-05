import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp } from './test-utils';
import type { Express } from 'express';

describe('Discord Bot API Routes', () => {
  let app: Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  describe('Health Endpoints', () => {
    it('GET /health should return healthy status', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('service', 'discord-bot-test');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Bot Endpoints', () => {
    it('GET /api/bot/invite-url should return invite URL', async () => {
      const response = await request(app).get('/api/bot/invite-url');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('inviteURL');
      expect(response.body).toHaveProperty('clientId');
      expect(response.body.inviteURL).toContain('discord.com/oauth2/authorize');
    });
  });

  describe('Server Settings Endpoints', () => {
    it('GET /api/accessible-servers should require authentication', async () => {
      const response = await request(app).get('/api/accessible-servers');
      
      expect(response.status).toBe(401);
    });

    it('GET /api/accessible-servers should return servers when authenticated', async () => {
      const response = await request(app)
        .get('/api/accessible-servers')
        .set('Cookie', 'user=test-user-id');
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('GET /api/servers/:serverId/settings should require authentication', async () => {
      const response = await request(app).get('/api/servers/test-server-id/settings');
      
      expect(response.status).toBe(401);
    });

    it('GET /api/servers/:serverId/settings should return settings when authenticated', async () => {
      const response = await request(app)
        .get('/api/servers/test-server-id/settings')
        .set('Cookie', 'user=test-user-id');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('serverId', 'test-server-id');
      expect(response.body).toHaveProperty('botName');
      expect(response.body).toHaveProperty('botPrefix');
    });

    it('PUT /api/servers/:serverId/settings should update settings', async () => {
      const newSettings = {
        botName: 'Updated Bot',
        botPrefix: '?',
      };

      const response = await request(app)
        .put('/api/servers/test-server-id/settings')
        .set('Cookie', 'user=test-user-id')
        .send(newSettings);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('serverId', 'test-server-id');
      expect(response.body).toHaveProperty('botName', 'Updated Bot');
      expect(response.body).toHaveProperty('botPrefix', '?');
    });
  });

  describe('Ticket Endpoints', () => {
    it('GET /api/tickets should require authentication', async () => {
      const response = await request(app).get('/api/tickets');
      
      expect(response.status).toBe(401);
    });

    it('GET /api/tickets should return tickets when authenticated', async () => {
      const response = await request(app)
        .get('/api/tickets')
        .set('Cookie', 'user=test-user-id');
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('GET /api/tickets/server/:serverId should return server tickets', async () => {
      const response = await request(app)
        .get('/api/tickets/server/test-server-id')
        .set('Cookie', 'user=test-user-id');
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('POST /api/tickets should create a new ticket', async () => {
      const ticketData = {
        title: 'Test Ticket',
        description: 'This is a test ticket',
        serverId: 'test-server-id',
        priority: 'normal',
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Cookie', 'user=test-user-id')
        .send(ticketData);
      
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('status', 'open');
      expect(response.body).toHaveProperty('title', 'Test Ticket');
    });
  });

  describe('Stream Notification Endpoints', () => {
    it('GET /api/stream-notifications/:serverId/settings should require authentication', async () => {
      const response = await request(app).get('/api/stream-notifications/test-server-id/settings');
      
      expect(response.status).toBe(401);
    });

    it('GET /api/stream-notifications/:serverId/settings should return settings', async () => {
      const response = await request(app)
        .get('/api/stream-notifications/test-server-id/settings')
        .set('Cookie', 'user=test-user-id');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('serverId', 'test-server-id');
      expect(response.body).toHaveProperty('isEnabled');
    });

    it('PUT /api/stream-notifications/:serverId/settings should update settings', async () => {
      const newSettings = {
        notificationChannelId: '123456789',
        isEnabled: true,
        customMessage: 'Stream is live!',
      };

      const response = await request(app)
        .put('/api/stream-notifications/test-server-id/settings')
        .set('Cookie', 'user=test-user-id')
        .send(newSettings);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('serverId', 'test-server-id');
      expect(response.body).toHaveProperty('isEnabled', true);
    });

    it('GET /api/stream-notifications/:serverId/tracked-users should return tracked users', async () => {
      const response = await request(app)
        .get('/api/stream-notifications/test-server-id/tracked-users')
        .set('Cookie', 'user=test-user-id');
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });
});
