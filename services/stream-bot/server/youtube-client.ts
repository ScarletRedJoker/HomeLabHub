import { google } from 'googleapis';
import type { youtube_v3 } from 'googleapis';
import { db } from './db';
import { platformConnections } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { decryptToken } from './crypto-utils';
import { getYouTubeConfig } from '../src/config/environment';

interface YouTubeAuthResult {
  client: ReturnType<typeof google.auth.OAuth2>;
  accessToken: string;
}

async function getYouTubeAuthForUser(userId: string): Promise<YouTubeAuthResult | null> {
  try {
    const connection = await db.query.platformConnections.findFirst({
      where: and(
        eq(platformConnections.userId, userId),
        eq(platformConnections.platform, 'youtube'),
        eq(platformConnections.isConnected, true)
      ),
    });

    if (!connection?.accessToken || !connection?.refreshToken) {
      console.log(`[YouTube] No valid YouTube connection for user ${userId}`);
      return null;
    }

    const config = getYouTubeConfig();
    
    const oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );

    const accessToken = decryptToken(connection.accessToken);
    const refreshToken = decryptToken(connection.refreshToken);

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    return { client: oauth2Client, accessToken };
  } catch (error) {
    console.error(`[YouTube] Failed to get auth for user ${userId}:`, error);
    return null;
  }
}

export async function getYouTubeClientForUser(userId: string): Promise<youtube_v3.Youtube | null> {
  const auth = await getYouTubeAuthForUser(userId);
  if (!auth) {
    return null;
  }
  return google.youtube({ version: 'v3', auth: auth.client });
}

export async function getLiveChatIdForUser(userId: string, videoId: string): Promise<string | null> {
  try {
    const youtube = await getYouTubeClientForUser(userId);
    if (!youtube) {
      return null;
    }
    
    const response = await youtube.videos.list({
      part: ['liveStreamingDetails'],
      id: [videoId],
    });

    const liveChatId = response.data.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
    return liveChatId || null;
  } catch (error) {
    console.error(`[YouTube] Error getting live chat ID for user ${userId}:`, error);
    return null;
  }
}

export async function sendYouTubeChatMessageForUser(userId: string, liveChatId: string, message: string): Promise<void> {
  const youtube = await getYouTubeClientForUser(userId);
  if (!youtube) {
    console.log(`[YouTube] YouTube not configured for user ${userId} - cannot send message`);
    throw new Error('YouTube not configured for this user');
  }
  
  try {
    await youtube.liveChatMessages.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          liveChatId,
          type: 'textMessageEvent',
          textMessageDetails: {
            messageText: message,
          },
        },
      },
    });
    
    console.log(`[YouTube] Successfully sent message to chat ${liveChatId} for user ${userId}`);
  } catch (error) {
    console.error(`[YouTube] Failed to send chat message for user ${userId}:`, error);
    throw new Error(`Failed to send YouTube chat message: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getActiveYouTubeLivestreamForUser(userId: string): Promise<{ videoId?: string; liveChatId: string | null; title?: string } | null> {
  try {
    const youtube = await getYouTubeClientForUser(userId);
    if (!youtube) {
      return null;
    }
    
    const response = await youtube.liveBroadcasts.list({
      part: ['snippet', 'contentDetails', 'status'],
      broadcastStatus: 'active',
      mine: true,
    });

    const broadcast = response.data.items?.[0];
    if (broadcast) {
      const videoId = broadcast.id ?? undefined;
      const liveChatId = await getLiveChatIdForUser(userId, videoId || '');
      
      if (!liveChatId) {
        console.warn(`[YouTube] Active broadcast found (${videoId}) for user ${userId} but no live chat ID available`);
      }
      
      return {
        videoId,
        liveChatId,
        title: broadcast.snippet?.title ?? undefined,
      };
    }
    
    return null;
  } catch (error) {
    console.error(`[YouTube] Error getting active livestream for user ${userId}:`, error);
    return null;
  }
}

export async function getUncachableYouTubeClient(): Promise<youtube_v3.Youtube | null> {
  console.warn('[YouTube] getUncachableYouTubeClient() is deprecated. Use getYouTubeClientForUser(userId) instead.');
  return null;
}

export async function getLiveChatId(videoId: string): Promise<string | null> {
  console.warn('[YouTube] getLiveChatId() is deprecated. Use getLiveChatIdForUser(userId, videoId) instead.');
  return null;
}

export async function sendYouTubeChatMessage(liveChatId: string, message: string): Promise<void> {
  console.warn('[YouTube] sendYouTubeChatMessage() is deprecated. Use sendYouTubeChatMessageForUser(userId, liveChatId, message) instead.');
  throw new Error('sendYouTubeChatMessage is deprecated - use sendYouTubeChatMessageForUser instead');
}

export async function getActiveYouTubeLivestream(): Promise<{ videoId?: string; liveChatId: string | null; title?: string } | null> {
  console.warn('[YouTube] getActiveYouTubeLivestream() is deprecated. Use getActiveYouTubeLivestreamForUser(userId) instead.');
  return null;
}
