import { Client, ActivityType, EmbedBuilder, TextChannel, GuildMember } from 'discord.js';
import { IStorage } from '../storage';

// Track which users are currently streaming to avoid duplicate notifications
const currentlyStreaming = new Map<string, Set<string>>(); // serverId -> Set of userIds

/**
 * Creates a rich embed for stream notifications
 */
export function createStreamNotificationEmbed(
  member: GuildMember,
  streamTitle: string,
  streamUrl: string,
  game: string | null,
  platform: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor('#9146FF') // Twitch purple
    .setTitle(`🔴 ${member.displayName} is now live!`)
    .setURL(streamUrl)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setTimestamp()
    .setFooter({ text: `Streaming on ${platform}` });

  if (streamTitle) {
    embed.setDescription(`**${streamTitle}**`);
  }

  if (game) {
    embed.addFields({
      name: '🎮 Playing',
      value: game,
      inline: true
    });
  }

  embed.addFields({
    name: '🔗 Watch Stream',
    value: `[Click here to watch](${streamUrl})`,
    inline: true
  });

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
    
    if (!settings || !settings.enabled || !settings.channelId) {
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
        const channel = await newPresence.guild.channels.fetch(settings.channelId);
        
        if (!channel || !(channel instanceof TextChannel)) {
          console.warn(`[Stream Notifications] Channel ${settings.channelId} not found or not a text channel`);
          return;
        }

        const member = await newPresence.guild.members.fetch(userId);
        
        // Extract stream information
        const streamTitle = newStreaming.details || member.displayName + "'s Stream";
        const streamUrl = newStreaming.url || newStreaming.state || '';
        const game = newStreaming.name || null;
        
        // Determine platform from URL
        let platform = 'Unknown';
        if (streamUrl.includes('twitch.tv')) platform = 'Twitch';
        else if (streamUrl.includes('youtube.com') || streamUrl.includes('youtu.be')) platform = 'YouTube';
        else if (streamUrl.includes('kick.com')) platform = 'Kick';
        else if (streamUrl.includes('facebook.com')) platform = 'Facebook Gaming';

        // Get user-specific custom message or use server default
        const trackedUser = trackedUsers.find(u => u.userId === userId);
        let messageTemplate = trackedUser?.customMessage || settings.customMessage || `{user} just went live!`;
        
        // Substitute placeholders
        let content = messageTemplate
          .replace(/{user}/g, member.toString())
          .replace(/{game}/g, game || 'Unknown Game')
          .replace(/{platform}/g, platform);

        // Create the embed
        const embed = createStreamNotificationEmbed(member, streamTitle, streamUrl, game, platform);

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
    
    if (!settings || !settings.enabled) continue;

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
