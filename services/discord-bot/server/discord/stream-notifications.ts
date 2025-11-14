import { Client, ActivityType, EmbedBuilder, TextChannel, GuildMember } from 'discord.js';
import { IStorage } from '../storage';
import { twitchAPI, type EnrichedStreamData } from './twitch-api';

// Track which users are currently streaming to avoid duplicate notifications
const currentlyStreaming = new Map<string, Set<string>>(); // serverId -> Set of userIds

/**
 * Get platform-specific embed color
 */
function getPlatformColor(platform: string): number {
  switch (platform.toLowerCase()) {
    case 'twitch':
      return 0x9146FF; // Twitch purple
    case 'youtube':
      return 0xFF0000; // YouTube red
    case 'kick':
      return 0x53FC18; // Kick green
    default:
      return 0x9146FF; // Default to Twitch purple
  }
}

/**
 * Creates a rich embed for stream notifications with enhanced data
 */
export function createStreamNotificationEmbed(
  member: GuildMember,
  streamTitle: string,
  streamUrl: string,
  game: string | null,
  platform: string,
  enrichedData?: EnrichedStreamData | null
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(getPlatformColor(platform))
    .setTitle(`🔴 ${member.displayName} is now LIVE!`)
    .setURL(streamUrl)
    .setTimestamp()
    .setFooter({ text: 'A member of RigCity went live!' });

  // Use enriched data if available, otherwise fall back to Discord presence data
  const title = enrichedData?.title || streamTitle;
  const gameName = enrichedData?.game || game;
  const viewerCount = enrichedData?.viewerCount;
  const thumbnailUrl = enrichedData?.thumbnailUrl;
  const profileImageUrl = enrichedData?.profileImageUrl;

  // Set description (stream title)
  if (title) {
    embed.setDescription(`**${title}**`);
  }

  // Set thumbnail (profile picture)
  if (profileImageUrl) {
    embed.setThumbnail(profileImageUrl);
  } else {
    embed.setThumbnail(member.user.displayAvatarURL({ size: 256 }));
  }

  // Set main image (stream thumbnail/preview)
  if (thumbnailUrl) {
    embed.setImage(thumbnailUrl);
  }

  // Add game/category field
  if (gameName) {
    embed.addFields({
      name: '🎮 Game/Category',
      value: gameName,
      inline: true
    });
  }

  // Add viewer count field (if available)
  if (viewerCount !== undefined && viewerCount > 0) {
    embed.addFields({
      name: '👀 Viewers',
      value: viewerCount.toLocaleString(),
      inline: true
    });
  }

  return embed;
}

/**
 * Handle presence update events to detect when users start streaming
 */
export async function handlePresenceUpdate(
  storage: IStorage,
  oldPresence: any,
  newPresence: any
): Promise<void> {
  try {
    if (!newPresence || !newPresence.guild) return;

    const serverId = newPresence.guild.id;
    const userId = newPresence.userId || newPresence.user?.id;
    
    if (!userId) return;

    // Get server's stream notification settings
    const settings = await storage.getStreamNotificationSettings(serverId);
    
    if (!settings || !settings.isEnabled || !settings.notificationChannelId) {
      return; // Stream notifications not configured for this server
    }

    // Check if this user is being tracked
    const trackedUsers = await storage.getStreamTrackedUsers(serverId);
    const isTracked = trackedUsers.some(u => u.userId === userId);
    
    if (!isTracked) {
      return; // This user isn't being tracked for stream notifications
    }

    // Get streaming activities
    const newStreaming = newPresence.activities?.find(
      (activity: any) => activity.type === ActivityType.Streaming
    );
    
    const oldStreaming = oldPresence?.activities?.find(
      (activity: any) => activity.type === ActivityType.Streaming
    );

    // Initialize server's streaming set if needed
    if (!currentlyStreaming.has(serverId)) {
      currentlyStreaming.set(serverId, new Set());
    }
    const serverStreaming = currentlyStreaming.get(serverId)!;

    // User just started streaming
    if (newStreaming && !oldStreaming && !serverStreaming.has(userId)) {
      serverStreaming.add(userId);

      try {
        const channel = await newPresence.guild.channels.fetch(settings.notificationChannelId);
        
        if (!channel || !(channel instanceof TextChannel)) {
          console.warn(`[Stream Notifications] Channel ${settings.notificationChannelId} not found or not a text channel`);
          return;
        }

        const member = await newPresence.guild.members.fetch(userId);
        
        // Extract stream information from Discord presence
        const streamTitle = newStreaming.details || member.displayName + "'s Stream";
        const streamUrl = newStreaming.url || newStreaming.state || '';
        const game = newStreaming.name || null;
        
        // Determine platform from URL
        let platform = 'Unknown';
        if (streamUrl.includes('twitch.tv')) platform = 'Twitch';
        else if (streamUrl.includes('youtube.com') || streamUrl.includes('youtu.be')) platform = 'YouTube';
        else if (streamUrl.includes('kick.com')) platform = 'Kick';
        else if (streamUrl.includes('facebook.com')) platform = 'Facebook Gaming';

        // Fetch enriched stream data from platform APIs
        let enrichedData: EnrichedStreamData | null = null;
        
        if (platform === 'Twitch' && twitchAPI.isConfigured()) {
          console.log(`[Stream Notifications] Fetching Twitch API data for ${member.displayName}...`);
          try {
            enrichedData = await twitchAPI.getStreamData(streamUrl);
            if (enrichedData && enrichedData.isLive) {
              console.log(`[Stream Notifications] Enriched data: ${enrichedData.viewerCount} viewers, playing ${enrichedData.game}`);
            } else {
              console.log(`[Stream Notifications] Twitch API returned no live stream data`);
              enrichedData = null;
            }
          } catch (error) {
            console.error(`[Stream Notifications] Failed to fetch Twitch data:`, error);
            enrichedData = null;
          }
        } else if (platform === 'Twitch' && !twitchAPI.isConfigured()) {
          console.log(`[Stream Notifications] Twitch API not configured (missing TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET)`);
        }

        // Get custom message from server settings or use default
        let messageTemplate = settings.customMessage || `{user} just went live!`;
        
        // Substitute placeholders (use enriched data if available)
        const gameName = enrichedData?.game || game || 'Unknown Game';
        let content = messageTemplate
          .replace(/{user}/g, member.toString())
          .replace(/{game}/g, gameName)
          .replace(/{platform}/g, platform);

        // Create the embed with enriched data
        const embed = createStreamNotificationEmbed(
          member,
          streamTitle,
          streamUrl,
          game,
          platform,
          enrichedData
        );

        // Send notification
        const message = await channel.send({
          content,
          embeds: [embed]
        });

        // Log the notification
        await storage.createStreamNotificationLog({
          serverId,
          userId,
          streamTitle,
          streamUrl,
          platform,
          messageId: message.id
        });

        console.log(`[Stream Notifications] Sent notification for ${member.displayName} in server ${serverId}`);

        // Update last notified timestamp
        await storage.updateStreamTrackedUser(serverId, userId, {
          lastNotifiedAt: new Date()
        });

      } catch (error) {
        console.error('[Stream Notifications] Error sending notification:', error);
        serverStreaming.delete(userId);
      }
    }

    // User stopped streaming
    if (!newStreaming && oldStreaming && serverStreaming.has(userId)) {
      serverStreaming.delete(userId);
      console.log(`[Stream Notifications] ${userId} stopped streaming in server ${serverId}`);
    }

  } catch (error) {
    console.error('[Stream Notifications] Error handling presence update:', error);
  }
}

/**
 * Initialize stream tracking for all servers on bot startup
 */
export async function initializeStreamTracking(client: Client, storage: IStorage): Promise<void> {
  console.log('[Stream Notifications] Initializing stream tracking...');
  
  currentlyStreaming.clear();
  
  // For each server, check current presences and populate the tracking map
  for (const [guildId, guild] of client.guilds.cache) {
    const settings = await storage.getStreamNotificationSettings(guildId);
    
    if (!settings || !settings.isEnabled) continue;

    const trackedUsers = await storage.getStreamTrackedUsers(guildId);
    if (trackedUsers.length === 0) continue;

    currentlyStreaming.set(guildId, new Set());
    const serverStreaming = currentlyStreaming.get(guildId)!;

    // Check which tracked users are currently streaming
    for (const tracked of trackedUsers) {

      try {
        const member = await guild.members.fetch(tracked.userId);
        const isStreaming = member.presence?.activities?.some(
          activity => activity.type === ActivityType.Streaming
        );

        if (isStreaming) {
          serverStreaming.add(tracked.userId);
          console.log(`[Stream Notifications] Found ${member.displayName} already streaming in ${guild.name}`);
        }
      } catch (error) {
        // User might have left the server
        console.warn(`[Stream Notifications] Could not fetch user ${tracked.userId} in ${guild.name}`);
      }
    }
  }

  console.log(`[Stream Notifications] Initialized tracking for ${currentlyStreaming.size} server(s)`);
}
