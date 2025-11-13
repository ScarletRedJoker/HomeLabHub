import { google } from 'googleapis';
import type { youtube_v3 } from 'googleapis';

async function getYouTubeAuth() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('YouTube connector: X_REPLIT_TOKEN not found');
  }

  if (!hostname) {
    throw new Error('YouTube connector: REPLIT_CONNECTORS_HOSTNAME not found');
  }

  try {
    const response = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=youtube`,
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    );

    if (!response.ok) {
      throw new Error(`YouTube connector API returned ${response.status}`);
    }

    const data = await response.json();
    const connectionSettings = data.items?.[0];

    if (!connectionSettings) {
      throw new Error('YouTube connector not configured. Please set up the YouTube integration.');
    }

    const accessToken = connectionSettings?.settings?.access_token || 
                       connectionSettings?.settings?.oauth?.credentials?.access_token;

    if (!accessToken) {
      throw new Error('YouTube connector: No access token found. Please reconnect your YouTube account.');
    }

    // Create OAuth2 client with the access token
    // Replit connector handles token refresh automatically
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    return oauth2Client;
  } catch (error) {
    console.error('[YouTube] Failed to get auth:', error);
    throw new Error(`YouTube authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getUncachableYouTubeClient(): Promise<youtube_v3.Youtube> {
  const auth = await getYouTubeAuth();
  return google.youtube({ version: 'v3', auth });
}

// Helper to get live chat ID from a video/broadcast
export async function getLiveChatId(videoId: string): Promise<string | null> {
  try {
    const youtube = await getUncachableYouTubeClient();
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
  try {
    const youtube = await getUncachableYouTubeClient();
    
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
    
    console.log('[YouTube] No active livestream found');
    return null;
  } catch (error) {
    console.error('[YouTube] Error getting active livestream:', error);
    // Return null instead of throwing to allow graceful degradation
    return null;
  }
}
