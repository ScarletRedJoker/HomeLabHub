import { google } from 'googleapis';
import type { youtube_v3 } from 'googleapis';

async function getYouTubeAuth() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'https://stream.rig-city.com/api/auth/youtube/callback'
    );

    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    return oauth2Client;
  } catch (error) {
    console.error('[YouTube] Failed to get auth:', error);
    return null;
  }
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
// Returns null if YouTube is not configured.
export async function getUncachableYouTubeClient(): Promise<youtube_v3.Youtube | null> {
  const auth = await getYouTubeAuth();
  if (!auth) {
    return null;
  }
  return google.youtube({ version: 'v3', auth });
}

// Helper to get live chat ID from a video/broadcast
export async function getLiveChatId(videoId: string): Promise<string | null> {
  try {
    const youtube = await getUncachableYouTubeClient();
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
    console.error('[YouTube] Error getting live chat ID:', error);
    return null;
  }
}

// Send a message to YouTube Live Chat
export async function sendYouTubeChatMessage(liveChatId: string, message: string): Promise<void> {
  const youtube = await getUncachableYouTubeClient();
  if (!youtube) {
    console.log('[YouTube] YouTube not configured - cannot send message');
    return;
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
    
    console.log(`[YouTube] Successfully sent message to chat ${liveChatId}`);
  } catch (error) {
    console.error('[YouTube] Failed to send chat message:', error);
    throw new Error(`Failed to send YouTube chat message: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Get user's active livestream
export async function getActiveYouTubeLivestream(): Promise<{ videoId?: string; liveChatId: string | null; title?: string } | null> {
  try {
    const youtube = await getUncachableYouTubeClient();
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
      const videoId = broadcast.id;
      const liveChatId = await getLiveChatId(videoId || '');
      
      if (!liveChatId) {
        console.warn(`[YouTube] Active broadcast found (${videoId}) but no live chat ID available`);
      }
      
      return {
        videoId,
        liveChatId,
        title: broadcast.snippet?.title,
      };
    }
    
    return null;
  } catch (error) {
    console.error('[YouTube] Error getting active livestream:', error);
    return null;
  }
}
