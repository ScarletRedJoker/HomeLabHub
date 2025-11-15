import { describe, it, expect } from 'vitest';
import { mockAPIs } from './mocks/external-apis';

/**
 * Smoke tests - Quick validation tests that don't require database or server
 * These tests verify core functionality and can run in any environment
 */

describe('Smoke Tests - Stream Bot', () => {
  describe('Mock API Functionality', () => {
    it('should validate Twitch mock tokens', async () => {
      const isValid = await mockAPIs.twitch.validateToken('mock_access_token_123');
      expect(isValid).toBe(true);
    });

    it('should refresh Twitch tokens', async () => {
      const result = await mockAPIs.twitch.refreshToken('mock_refresh_token');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn');
      expect(result.expiresIn).toBe(3600);
    });

    it('should get Twitch user info', async () => {
      const userInfo = await mockAPIs.twitch.getUserInfo('mock_token');
      expect(userInfo).toHaveProperty('id');
      expect(userInfo).toHaveProperty('login');
      expect(userInfo).toHaveProperty('display_name');
    });

    it('should validate YouTube mock tokens', async () => {
      const isValid = await mockAPIs.youtube.validateToken('mock_youtube_token');
      expect(isValid).toBe(true);
    });

    it('should get YouTube channel info', async () => {
      const channelInfo = await mockAPIs.youtube.getChannelInfo('mock_token');
      expect(channelInfo).toHaveProperty('id');
      expect(channelInfo).toHaveProperty('title');
      expect(channelInfo).toHaveProperty('subscriberCount');
    });

    it('should get Discord guild info', async () => {
      const guildInfo = await mockAPIs.discord.getGuildInfo('test_guild_123');
      expect(guildInfo).toHaveProperty('id');
      expect(guildInfo).toHaveProperty('name');
      expect(guildInfo.id).toBe('test_guild_123');
    });

    it('should get Spotify currently playing track', async () => {
      const nowPlaying = await mockAPIs.spotify.getCurrentlyPlaying('mock_token');
      expect(nowPlaying).toHaveProperty('isPlaying');
      expect(nowPlaying.isPlaying).toBe(true);
      expect(nowPlaying.track).toHaveProperty('name');
      expect(nowPlaying.track).toHaveProperty('artist');
    });
  });

  describe('Environment Configuration', () => {
    it('should have test environment set', () => {
      expect(process.env.NODE_ENV).toBe('test');
    });

    it('should have mock APIs enabled in test mode', () => {
      expect(process.env.MOCK_EXTERNAL_APIS).toBe('true');
    });
  });

  describe('Basic Imports', () => {
    it('should import database module', async () => {
      const { db } = await import('../server/db');
      expect(db).toBeDefined();
    });

    it('should import schema', async () => {
      const schema = await import('../shared/schema');
      expect(schema).toHaveProperty('users');
      expect(schema).toHaveProperty('commands');
      expect(schema).toHaveProperty('giveaways');
    });
  });
});
