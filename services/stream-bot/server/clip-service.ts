import { db } from "./db";
import { streamClips, platformConnections } from "@shared/schema";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL,
});

export interface ClipFilters {
  platform?: string;
  status?: string;
  isHighlight?: boolean;
  sort?: "date" | "views";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface ClipUpdate {
  title?: string;
  tags?: string[];
  status?: "new" | "reviewed" | "posted";
  socialCaption?: string;
  isHighlight?: boolean;
}

export class ClipService {
  async getClips(userId: string, filters: ClipFilters = {}) {
    const conditions = [eq(streamClips.userId, userId)];

    if (filters.platform) {
      conditions.push(eq(streamClips.platform, filters.platform));
    }

    if (filters.status) {
      conditions.push(eq(streamClips.status, filters.status));
    }

    if (filters.isHighlight !== undefined) {
      conditions.push(eq(streamClips.isHighlight, filters.isHighlight));
    }

    const sortColumn = filters.sort === "views" ? streamClips.viewCount : streamClips.clipCreatedAt;
    const sortOrder = filters.order === "asc" ? asc(sortColumn) : desc(sortColumn);

    const clips = await db
      .select()
      .from(streamClips)
      .where(and(...conditions))
      .orderBy(sortOrder)
      .limit(filters.limit || 50)
      .offset(filters.offset || 0);

    const total = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(streamClips)
      .where(and(...conditions));

    return {
      clips,
      total: total[0]?.count || 0,
      limit: filters.limit || 50,
      offset: filters.offset || 0,
    };
  }

  async fetchTwitchClips(userId: string) {
    const connection = await db
      .select()
      .from(platformConnections)
      .where(and(
        eq(platformConnections.userId, userId),
        eq(platformConnections.platform, "twitch")
      ))
      .limit(1);

    if (!connection[0]) {
      throw new Error("No Twitch connection found. Please connect your Twitch account.");
    }

    const twitchConnection = connection[0];

    if (!twitchConnection.accessToken) {
      throw new Error("Twitch access token missing. Please reconnect your Twitch account.");
    }

    const clientId = process.env.TWITCH_CLIENT_ID;
    if (!clientId) {
      throw new Error("Twitch API not configured");
    }

    const clipsResponse = await fetch(
      `https://api.twitch.tv/helix/clips?broadcaster_id=${twitchConnection.platformUserId}&first=100`,
      {
        headers: {
          Authorization: `Bearer ${twitchConnection.accessToken}`,
          "Client-Id": clientId,
        },
      }
    );

    if (!clipsResponse.ok) {
      const errorText = await clipsResponse.text();
      console.error("[ClipService] Twitch API error:", errorText);
      throw new Error("Failed to fetch clips from Twitch");
    }

    const clipsData = await clipsResponse.json();
    let inserted = 0;
    let updated = 0;

    for (const clip of clipsData.data || []) {
      const clipData = {
        userId,
        platform: "twitch" as const,
        clipId: clip.id,
        title: clip.title,
        url: clip.url,
        embedUrl: clip.embed_url,
        thumbnailUrl: clip.thumbnail_url,
        duration: Math.round(clip.duration),
        viewCount: clip.view_count,
        gameId: clip.game_id,
        gameName: clip.game_name || null,
        broadcasterName: clip.broadcaster_name,
        broadcasterId: clip.broadcaster_id,
        clipCreatedAt: new Date(clip.created_at),
        status: "new" as const,
      };

      const existing = await db
        .select()
        .from(streamClips)
        .where(and(
          eq(streamClips.userId, userId),
          eq(streamClips.platform, "twitch"),
          eq(streamClips.clipId, clip.id)
        ))
        .limit(1);

      if (existing[0]) {
        await db
          .update(streamClips)
          .set({ viewCount: clip.view_count, updatedAt: new Date() })
          .where(eq(streamClips.id, existing[0].id));
        updated++;
      } else {
        await db.insert(streamClips).values(clipData);
        inserted++;
      }
    }

    return {
      success: true,
      message: "Synced clips from Twitch",
      inserted,
      updated,
      total: clipsData.data?.length || 0,
    };
  }

  async fetchYouTubeClips(userId: string) {
    const connection = await db
      .select()
      .from(platformConnections)
      .where(and(
        eq(platformConnections.userId, userId),
        eq(platformConnections.platform, "youtube")
      ))
      .limit(1);

    if (!connection[0]) {
      throw new Error("No YouTube connection found. Please connect your YouTube account.");
    }

    const youtubeConnection = connection[0];

    if (!youtubeConnection.accessToken) {
      throw new Error("YouTube access token missing. Please reconnect your YouTube account.");
    }

    const channelResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true`,
      {
        headers: {
          Authorization: `Bearer ${youtubeConnection.accessToken}`,
        },
      }
    );

    if (!channelResponse.ok) {
      const errorText = await channelResponse.text();
      console.error("[ClipService] YouTube channel API error:", errorText);
      throw new Error("Failed to fetch YouTube channel info");
    }

    const channelData = await channelResponse.json();
    const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

    if (!uploadsPlaylistId) {
      return { success: true, message: "No uploads playlist found", inserted: 0, updated: 0, total: 0 };
    }

    const videosResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50`,
      {
        headers: {
          Authorization: `Bearer ${youtubeConnection.accessToken}`,
        },
      }
    );

    if (!videosResponse.ok) {
      const errorText = await videosResponse.text();
      console.error("[ClipService] YouTube videos API error:", errorText);
      throw new Error("Failed to fetch YouTube videos");
    }

    const videosData = await videosResponse.json();
    let inserted = 0;
    let updated = 0;

    for (const item of videosData.items || []) {
      const videoId = item.contentDetails?.videoId;
      if (!videoId) continue;

      const statsResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${videoId}`,
        {
          headers: {
            Authorization: `Bearer ${youtubeConnection.accessToken}`,
          },
        }
      );

      let viewCount = 0;
      let duration = 0;

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        const videoStats = statsData.items?.[0];
        viewCount = parseInt(videoStats?.statistics?.viewCount || "0", 10);
        const isoDuration = videoStats?.contentDetails?.duration || "PT0S";
        duration = this.parseYouTubeDuration(isoDuration);
      }

      const clipData = {
        userId,
        platform: "youtube" as const,
        clipId: videoId,
        title: item.snippet?.title || "Untitled",
        url: `https://www.youtube.com/watch?v=${videoId}`,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        thumbnailUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url,
        duration,
        viewCount,
        broadcasterName: item.snippet?.channelTitle,
        broadcasterId: item.snippet?.channelId,
        clipCreatedAt: new Date(item.snippet?.publishedAt),
        status: "new" as const,
      };

      const existing = await db
        .select()
        .from(streamClips)
        .where(and(
          eq(streamClips.userId, userId),
          eq(streamClips.platform, "youtube"),
          eq(streamClips.clipId, videoId)
        ))
        .limit(1);

      if (existing[0]) {
        await db
          .update(streamClips)
          .set({ viewCount, updatedAt: new Date() })
          .where(eq(streamClips.id, existing[0].id));
        updated++;
      } else {
        await db.insert(streamClips).values(clipData);
        inserted++;
      }
    }

    return {
      success: true,
      message: "Synced videos from YouTube",
      inserted,
      updated,
      total: videosData.items?.length || 0,
    };
  }

  private parseYouTubeDuration(isoDuration: string): number {
    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const hours = parseInt(match[1] || "0", 10);
    const minutes = parseInt(match[2] || "0", 10);
    const seconds = parseInt(match[3] || "0", 10);
    return hours * 3600 + minutes * 60 + seconds;
  }

  async updateClip(userId: string, clipId: string, updates: ClipUpdate) {
    const clip = await db
      .select()
      .from(streamClips)
      .where(and(
        eq(streamClips.id, clipId),
        eq(streamClips.userId, userId)
      ))
      .limit(1);

    if (!clip[0]) {
      throw new Error("Clip not found");
    }

    const updateData: any = { updatedAt: new Date() };

    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.tags !== undefined) updateData.tags = updates.tags;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.socialCaption !== undefined) updateData.socialCaption = updates.socialCaption;
    if (updates.isHighlight !== undefined) updateData.isHighlight = updates.isHighlight;

    const [updated] = await db
      .update(streamClips)
      .set(updateData)
      .where(eq(streamClips.id, clipId))
      .returning();

    return updated;
  }

  async deleteClip(userId: string, clipId: string) {
    const clip = await db
      .select()
      .from(streamClips)
      .where(and(
        eq(streamClips.id, clipId),
        eq(streamClips.userId, userId)
      ))
      .limit(1);

    if (!clip[0]) {
      throw new Error("Clip not found");
    }

    await db.delete(streamClips).where(eq(streamClips.id, clipId));

    return { success: true };
  }

  async generateCaption(clipTitle: string, platform: string): Promise<string> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a social media expert who creates engaging captions for stream clips. Create a short, catchy caption (under 280 characters) that:
- Is engaging and encourages interaction
- Uses 1-2 relevant emojis
- Includes a call to action
- Is appropriate for ${platform} content
Do not use hashtags.`,
          },
          {
            role: "user",
            content: `Create a social media caption for this stream clip: "${clipTitle}"`,
          },
        ],
        max_tokens: 150,
        temperature: 0.8,
      });

      return response.choices[0]?.message?.content?.trim() || `Check out this clip: ${clipTitle}`;
    } catch (error: any) {
      console.error("[ClipService] Caption generation failed:", error);
      return `Check out this clip: ${clipTitle}`;
    }
  }
}

export const clipService = new ClipService();
