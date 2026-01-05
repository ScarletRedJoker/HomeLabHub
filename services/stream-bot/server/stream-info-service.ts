import axios from 'axios';
import { storage } from './storage';
import { getTwitchAccessToken } from './oauth-twitch';
import { getYouTubeClientForUser, getActiveYouTubeLivestreamForUser } from './youtube-client';
import { getKickChannelInfo, updateKickStreamInfo as kickApiUpdateStream, searchKickCategories } from './kick-client';

export interface StreamInfo {
  title?: string;
  game?: string;
  gameId?: string;
  tags?: string[];
  description?: string;
}

export interface PlatformStreamInfo {
  platform: string;
  connected: boolean;
  isLive?: boolean;
  info?: StreamInfo;
  error?: string;
}

export interface StreamInfoUpdateResult {
  platform: string;
  success: boolean;
  error?: string;
}

class StreamInfoService {
  async getTwitchChannelInfo(userId: string): Promise<PlatformStreamInfo> {
    try {
      const connection = await storage.getPlatformConnection(userId, 'twitch');
      if (!connection || !connection.isConnected) {
        return { platform: 'twitch', connected: false };
      }

      const accessToken = await getTwitchAccessToken(userId);
      if (!accessToken) {
        return { platform: 'twitch', connected: true, error: 'Failed to get access token' };
      }

      const clientId = process.env.TWITCH_CLIENT_ID;
      const broadcasterId = connection.platformUserId;

      const channelResponse = await axios.get(
        'https://api.twitch.tv/helix/channels',
        {
          params: { broadcaster_id: broadcasterId },
          headers: {
            'Client-ID': clientId,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const channel = channelResponse.data.data?.[0];
      if (!channel) {
        return { platform: 'twitch', connected: true, error: 'Channel not found' };
      }

      const streamResponse = await axios.get(
        'https://api.twitch.tv/helix/streams',
        {
          params: { user_id: broadcasterId },
          headers: {
            'Client-ID': clientId,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const stream = streamResponse.data.data?.[0];

      return {
        platform: 'twitch',
        connected: true,
        isLive: !!stream,
        info: {
          title: channel.title,
          game: channel.game_name,
          gameId: channel.game_id,
          tags: channel.tags || [],
        },
      };
    } catch (error: any) {
      console.error('[StreamInfo] Error getting Twitch channel info:', error.message);
      return { platform: 'twitch', connected: true, error: error.message };
    }
  }

  async getYouTubeStreamInfo(userId: string): Promise<PlatformStreamInfo> {
    try {
      const connection = await storage.getPlatformConnection(userId, 'youtube');
      if (!connection || !connection.isConnected) {
        return { platform: 'youtube', connected: false };
      }

      const youtube = await getYouTubeClientForUser(userId);
      if (!youtube) {
        return { platform: 'youtube', connected: true, error: 'Failed to get YouTube client' };
      }

      const livestream = await getActiveYouTubeLivestreamForUser(userId);
      if (!livestream || !livestream.videoId) {
        const response = await youtube.liveBroadcasts.list({
          part: ['snippet', 'status'],
          mine: true,
          broadcastStatus: 'upcoming',
        });

        const broadcast = response.data.items?.[0];
        if (broadcast) {
          return {
            platform: 'youtube',
            connected: true,
            isLive: false,
            info: {
              title: broadcast.snippet?.title || '',
              description: broadcast.snippet?.description || '',
            },
          };
        }

        return {
          platform: 'youtube',
          connected: true,
          isLive: false,
          info: {
            title: '',
            description: '',
          },
        };
      }

      const videoResponse = await youtube.videos.list({
        part: ['snippet'],
        id: [livestream.videoId],
      });

      const video = videoResponse.data.items?.[0];
      return {
        platform: 'youtube',
        connected: true,
        isLive: true,
        info: {
          title: video?.snippet?.title || livestream.title || '',
          description: video?.snippet?.description || '',
          tags: video?.snippet?.tags || [],
        },
      };
    } catch (error: any) {
      console.error('[StreamInfo] Error getting YouTube stream info:', error.message);
      return { platform: 'youtube', connected: true, error: error.message };
    }
  }

  async getKickStreamInfo(userId: string): Promise<PlatformStreamInfo> {
    try {
      const connection = await storage.getPlatformConnection(userId, 'kick');
      if (!connection || !connection.isConnected) {
        return { platform: 'kick', connected: false };
      }

      const channelInfo = await getKickChannelInfo(userId);
      if (!channelInfo) {
        return { 
          platform: 'kick', 
          connected: true, 
          error: 'Failed to get Kick channel info' 
        };
      }

      return {
        platform: 'kick',
        connected: true,
        isLive: channelInfo.isLive,
        info: {
          title: channelInfo.title || '',
          game: channelInfo.category || '',
          gameId: channelInfo.categoryId ? String(channelInfo.categoryId) : undefined,
        },
      };
    } catch (error: any) {
      console.error('[StreamInfo] Error getting Kick stream info:', error.message);
      return { platform: 'kick', connected: true, error: error.message };
    }
  }

  async getAllStreamInfo(userId: string): Promise<PlatformStreamInfo[]> {
    const [twitch, youtube, kick] = await Promise.all([
      this.getTwitchChannelInfo(userId),
      this.getYouTubeStreamInfo(userId),
      this.getKickStreamInfo(userId),
    ]);

    return [twitch, youtube, kick];
  }

  async searchTwitchGames(userId: string, query: string): Promise<{ id: string; name: string; boxArtUrl: string }[]> {
    try {
      const accessToken = await getTwitchAccessToken(userId);
      if (!accessToken) {
        return [];
      }

      const clientId = process.env.TWITCH_CLIENT_ID;

      const response = await axios.get(
        'https://api.twitch.tv/helix/search/categories',
        {
          params: { query, first: 10 },
          headers: {
            'Client-ID': clientId,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      return (response.data.data || []).map((game: any) => ({
        id: game.id,
        name: game.name,
        boxArtUrl: game.box_art_url?.replace('{width}', '52').replace('{height}', '72') || '',
      }));
    } catch (error: any) {
      console.error('[StreamInfo] Error searching Twitch games:', error.message);
      return [];
    }
  }

  async updateTwitchStreamInfo(userId: string, info: StreamInfo): Promise<StreamInfoUpdateResult> {
    try {
      const connection = await storage.getPlatformConnection(userId, 'twitch');
      if (!connection || !connection.isConnected) {
        return { platform: 'twitch', success: false, error: 'Twitch not connected' };
      }

      const accessToken = await getTwitchAccessToken(userId);
      if (!accessToken) {
        return { platform: 'twitch', success: false, error: 'Failed to get access token' };
      }

      const clientId = process.env.TWITCH_CLIENT_ID;
      const broadcasterId = connection.platformUserId;

      const updateData: any = {};
      if (info.title) updateData.title = info.title;
      if (info.gameId) updateData.game_id = info.gameId;
      if (info.tags && info.tags.length > 0) updateData.tags = info.tags.slice(0, 10);

      await axios.patch(
        `https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`,
        updateData,
        {
          headers: {
            'Client-ID': clientId,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log(`[StreamInfo] Successfully updated Twitch stream info for user ${userId}`);
      return { platform: 'twitch', success: true };
    } catch (error: any) {
      console.error('[StreamInfo] Error updating Twitch stream info:', error.response?.data || error.message);
      return { platform: 'twitch', success: false, error: error.response?.data?.message || error.message };
    }
  }

  async updateYouTubeStreamInfo(userId: string, info: StreamInfo): Promise<StreamInfoUpdateResult> {
    try {
      const connection = await storage.getPlatformConnection(userId, 'youtube');
      if (!connection || !connection.isConnected) {
        return { platform: 'youtube', success: false, error: 'YouTube not connected' };
      }

      const youtube = await getYouTubeClientForUser(userId);
      if (!youtube) {
        return { platform: 'youtube', success: false, error: 'Failed to get YouTube client' };
      }

      const livestream = await getActiveYouTubeLivestreamForUser(userId);
      let videoId = livestream?.videoId;

      if (!videoId) {
        const response = await youtube.liveBroadcasts.list({
          part: ['snippet', 'status'],
          mine: true,
          broadcastStatus: 'upcoming',
        });
        videoId = response.data.items?.[0]?.id ?? undefined;
      }

      if (!videoId) {
        return { platform: 'youtube', success: false, error: 'No active or upcoming broadcast found' };
      }

      const videoResponse = await youtube.videos.list({
        part: ['snippet'],
        id: [videoId],
      });

      const currentSnippet = videoResponse.data.items?.[0]?.snippet;
      if (!currentSnippet) {
        return { platform: 'youtube', success: false, error: 'Failed to get video details' };
      }

      const updatedSnippet: any = {
        title: info.title || currentSnippet.title,
        description: info.description || currentSnippet.description,
        categoryId: currentSnippet.categoryId,
      };

      if (info.tags && info.tags.length > 0) {
        updatedSnippet.tags = info.tags;
      }

      await youtube.videos.update({
        part: ['snippet'],
        requestBody: {
          id: videoId,
          snippet: updatedSnippet,
        },
      });

      console.log(`[StreamInfo] Successfully updated YouTube stream info for user ${userId}`);
      return { platform: 'youtube', success: true };
    } catch (error: any) {
      console.error('[StreamInfo] Error updating YouTube stream info:', error.response?.data || error.message);
      return { platform: 'youtube', success: false, error: error.message };
    }
  }

  async updateKickStreamInfo(userId: string, info: StreamInfo): Promise<StreamInfoUpdateResult> {
    try {
      const connection = await storage.getPlatformConnection(userId, 'kick');
      if (!connection || !connection.isConnected) {
        return { platform: 'kick', success: false, error: 'Kick not connected' };
      }

      const updateData: { title?: string; categoryId?: number } = {};
      if (info.title) updateData.title = info.title;
      if (info.gameId) updateData.categoryId = parseInt(info.gameId, 10);

      const result = await kickApiUpdateStream(userId, updateData);
      
      if (result.success) {
        console.log(`[StreamInfo] Successfully updated Kick stream info for user ${userId}`);
        return { platform: 'kick', success: true };
      } else {
        return { platform: 'kick', success: false, error: result.error };
      }
    } catch (error: any) {
      console.error('[StreamInfo] Error updating Kick stream info:', error.message);
      return { platform: 'kick', success: false, error: error.message };
    }
  }

  async searchKickCategories(userId: string, query: string): Promise<{ id: string; name: string; thumbnail?: string }[]> {
    try {
      const categories = await searchKickCategories(userId, query);
      return categories.map(cat => ({
        id: String(cat.id),
        name: cat.name,
        thumbnail: cat.thumbnail,
      }));
    } catch (error: any) {
      console.error('[StreamInfo] Error searching Kick categories:', error.message);
      return [];
    }
  }

  async updateStreamInfo(
    userId: string,
    info: StreamInfo,
    platforms: string[]
  ): Promise<StreamInfoUpdateResult[]> {
    const results: Promise<StreamInfoUpdateResult>[] = [];

    for (const platform of platforms) {
      switch (platform) {
        case 'twitch':
          results.push(this.updateTwitchStreamInfo(userId, info));
          break;
        case 'youtube':
          results.push(this.updateYouTubeStreamInfo(userId, info));
          break;
        case 'kick':
          results.push(this.updateKickStreamInfo(userId, info));
          break;
        default:
          results.push(Promise.resolve({
            platform,
            success: false,
            error: `Unknown platform: ${platform}`,
          }));
      }
    }

    return Promise.all(results);
  }
}

export const streamInfoService = new StreamInfoService();
