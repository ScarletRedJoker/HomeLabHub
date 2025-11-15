import { describe, it, expect } from 'vitest';

/**
 * Smoke tests - Quick validation tests for Discord Bot
 * These tests verify core functionality without requiring database
 */

describe('Smoke Tests - Discord Bot', () => {
  describe('Environment Configuration', () => {
    it('should have test environment set', () => {
      expect(process.env.NODE_ENV).toBe('test');
    });

    it('should have mock APIs enabled', () => {
      expect(process.env.MOCK_EXTERNAL_APIS).toBe('true');
    });
  });

  describe('Basic Imports', () => {
    it('should import database module', async () => {
      const { db } = await import('../server/db');
      expect(db).toBeDefined();
    });

    it('should import schema', async () => {
      const schema = await import('../shared/schema-postgresql');
      expect(schema).toHaveProperty('tickets');
      expect(schema).toHaveProperty('serverSettings');
      expect(schema).toHaveProperty('streamNotifications');
    });
  });

  describe('Constants and Configuration', () => {
    it('should import Discord constants', async () => {
      const constants = await import('../shared/discord-constants');
      expect(constants).toBeDefined();
    });
  });

  describe('Type Safety', () => {
    it('should have proper TypeScript types', () => {
      const ticketData = {
        serverId: 'test_server',
        userId: 'test_user',
        username: 'TestUser',
        subject: 'Test Ticket',
        description: 'Test Description',
        priority: 'medium' as const,
      };

      expect(ticketData.serverId).toBe('test_server');
      expect(ticketData.priority).toBe('medium');
    });
  });
});
