/**
 * Mock implementations for external APIs used in E2E testing
 * This allows tests to run without actual API keys or network calls
 */

export class MockTwitchAPI {
  private tokens = new Map<string, { access: string; refresh: string; expires: Date }>();

  async validateToken(accessToken: string): Promise<boolean> {
    return accessToken.startsWith('mock_access_token') || accessToken.startsWith('twitch_');
  }

  async refreshToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    return {
      accessToken: `mock_access_token_${Date.now()}`,
      refreshToken: `mock_refresh_token_${Date.now()}`,
      expiresIn: 3600,
    };
  }

  async getUserInfo(accessToken: string): Promise<{
    id: string;
    login: string;
    display_name: string;
    email?: string;
  }> {
    return {
      id: 'twitch_user_123',
      login: 'test_streamer',
      display_name: 'Test Streamer',
      email: 'test@twitch.tv',
    };
  }

  async getStreamInfo(userId: string): Promise<{
    isLive: boolean;
    title?: string;
    game?: string;
    viewerCount?: number;
  }> {
    return {
      isLive: Math.random() > 0.5,
      title: 'Test Stream Title',
      game: 'Software Development',
      viewerCount: Math.floor(Math.random() * 1000),
    };
  }
}

export class MockYouTubeAPI {
  async validateToken(accessToken: string): Promise<boolean> {
    return accessToken.startsWith('mock_youtube_') || accessToken.startsWith('youtube_');
  }

  async refreshToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    return {
      accessToken: `mock_youtube_token_${Date.now()}`,
      refreshToken: `mock_youtube_refresh_${Date.now()}`,
      expiresIn: 3600,
    };
  }

  async getChannelInfo(accessToken: string): Promise<{
    id: string;
    title: string;
    customUrl?: string;
    subscriberCount: string;
  }> {
    return {
      id: 'youtube_channel_123',
      title: 'Test YouTube Channel',
      customUrl: '@testchannel',
      subscriberCount: '1000',
    };
  }

  async getLiveStreams(channelId: string): Promise<Array<{
    id: string;
    title: string;
    description: string;
    viewerCount: number;
    startedAt: string;
  }>> {
    return [
      {
        id: 'stream_123',
        title: 'Live Test Stream',
        description: 'Testing YouTube integration',
        viewerCount: 500,
        startedAt: new Date().toISOString(),
      },
    ];
  }
}

export class MockKickAPI {
  async validateToken(accessToken: string): Promise<boolean> {
    return accessToken.startsWith('mock_kick_') || accessToken.startsWith('kick_');
  }

  async getUserInfo(accessToken: string): Promise<{
    id: string;
    username: string;
    displayName: string;
  }> {
    return {
      id: 'kick_user_123',
      username: 'test_kick_streamer',
      displayName: 'Test Kick Streamer',
    };
  }

  async getStreamStatus(username: string): Promise<{
    isLive: boolean;
    title?: string;
    category?: string;
    viewers?: number;
  }> {
    return {
      isLive: false,
      title: 'Test Kick Stream',
      category: 'Just Chatting',
      viewers: 250,
    };
  }
}

export class MockDiscordAPI {
  async getGuildInfo(guildId: string): Promise<{
    id: string;
    name: string;
    icon?: string;
    owner_id: string;
  }> {
    return {
      id: guildId,
      name: 'Test Discord Server',
      icon: 'icon_hash',
      owner_id: 'owner_123',
    };
  }

  async getUserGuilds(accessToken: string): Promise<Array<{
    id: string;
    name: string;
    icon?: string;
    owner: boolean;
    permissions: string;
  }>> {
    return [
      {
        id: 'guild_1',
        name: 'Test Server 1',
        owner: true,
        permissions: '8',
      },
      {
        id: 'guild_2',
        name: 'Test Server 2',
        owner: false,
        permissions: '2048',
      },
    ];
  }

  async sendMessage(channelId: string, content: string): Promise<{
    id: string;
    content: string;
    timestamp: string;
  }> {
    return {
      id: `message_${Date.now()}`,
      content,
      timestamp: new Date().toISOString(),
    };
  }
}

export class MockSpotifyAPI {
  async getCurrentlyPlaying(accessToken: string): Promise<{
    isPlaying: boolean;
    track?: {
      name: string;
      artist: string;
      album: string;
      duration: number;
      progress: number;
    };
  }> {
    return {
      isPlaying: true,
      track: {
        name: 'Test Song',
        artist: 'Test Artist',
        album: 'Test Album',
        duration: 240000,
        progress: 120000,
      },
    };
  }

  async skipToNext(accessToken: string): Promise<{ success: boolean }> {
    return { success: true };
  }

  async pause(accessToken: string): Promise<{ success: boolean }> {
    return { success: true };
  }

  async play(accessToken: string): Promise<{ success: boolean }> {
    return { success: true };
  }
}

export const mockAPIs = {
  twitch: new MockTwitchAPI(),
  youtube: new MockYouTubeAPI(),
  kick: new MockKickAPI(),
  discord: new MockDiscordAPI(),
  spotify: new MockSpotifyAPI(),
};

export function setupMockAPIs() {
  if (process.env.NODE_ENV === 'test' || process.env.MOCK_EXTERNAL_APIS === 'true') {
    console.log('🎭 Mock external APIs enabled for testing');
    return mockAPIs;
  }
  return null;
}
