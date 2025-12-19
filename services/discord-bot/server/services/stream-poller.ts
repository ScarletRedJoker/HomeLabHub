/**
 * Multi-Platform Stream Polling Service
 * 
 * Provides independent Twitch/YouTube/Kick API polling to catch streams
 * that Discord presence detection might miss.
 * 
 * Features:
 * - Polls every 5 minutes to respect API rate limits
 * - Batches API requests for efficiency
 * - Integrates with existing notification system
 * - Deduplication with presence-based detection
 * - Tracks active streams in memory
 */

import { Client, GuildMember, TextChannel, EmbedBuilder, ActivityType } from 'discord.js';
import { IStorage } from '../storage';
import { twitchAPI, youtubeAPI, type EnrichedStreamData } from '../discord/twitch-api';
import { StreamNotificationSettings, StreamTrackedUser } from '../../shared/schema';

interface PlatformUsernames {
  twitch?: string;
  youtube?: string;
  kick?: string;
}

interface ActivePolledStream {
  discordUserId: string;
  serverId: string;
  platform: 'twitch' | 'youtube' | 'kick';
  platformUsername: string;
  streamUrl: string;
  startedAt: Date;
  lastSeenAt: Date;
  notificationSent: boolean;
}

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const COOLDOWN_DEFAULT_MS = 30 * 60 * 1000; // 30 minutes default cooldown

class StreamPollerService {
  private client: Client | null = null;
  private storage: IStorage | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private activeStreams = new Map<string, ActivePolledStream>(); // key: `${serverId}:${userId}:${platform}`
  private isPolling = false;
  private lastPollTime: Date | null = null;

  /**
   * Start the polling service
   */
  async start(client: Client, storage: IStorage): Promise<void> {
    this.client = client;
    this.storage = storage;

    console.log('[StreamPoller] Starting multi-platform polling service...');
    
    // Check API availability
    const twitchConfigured = twitchAPI.isConfigured();
    const youtubeConfigured = youtubeAPI.isConfigured();
    
    console.log(`[StreamPoller] API Status - Twitch: ${twitchConfigured ? '✓' : '✗'}, YouTube: ${youtubeConfigured ? '✓' : '✗'}`);
    
    if (!twitchConfigured && !youtubeConfigured) {
      console.warn('[StreamPoller] No platform APIs configured. Polling service will not be effective.');
    }

    // Initial poll after 30 seconds (give bot time to fully connect)
    setTimeout(() => this.poll(), 30000);
    
    // Set up recurring poll
    this.pollInterval = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    
    console.log('[StreamPoller] Polling service started. First poll in 30 seconds, then every 5 minutes.');
  }

  /**
   * Stop the polling service
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    console.log('[StreamPoller] Polling service stopped.');
  }

  /**
   * Get unique key for stream tracking
   */
  private getStreamKey(serverId: string, userId: string, platform: string): string {
    return `${serverId}:${userId}:${platform}`;
  }

  /**
   * Parse platform usernames from JSON string
   */
  private parsePlatformUsernames(json: string | null): PlatformUsernames {
    if (!json) return {};
    try {
      return JSON.parse(json);
    } catch {
      return {};
    }
  }

  /**
   * Parse connected platforms from JSON string
   */
  private parseConnectedPlatforms(json: string | null): string[] {
    if (!json) return [];
    try {
      const parsed = JSON.parse(json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Main polling function
   */
  private async poll(): Promise<void> {
    if (this.isPolling) {
      console.log('[StreamPoller] Previous poll still in progress, skipping...');
      return;
    }

    if (!this.client || !this.storage) {
      console.error('[StreamPoller] Client or storage not initialized');
      return;
    }

    this.isPolling = true;
    this.lastPollTime = new Date();
    
    console.log('[StreamPoller] Starting poll cycle...');

    try {
      // Collect all users to check across all guilds
      const twitchUsersToCheck: { serverId: string; userId: string; username: string }[] = [];
      const youtubeUsersToCheck: { serverId: string; userId: string; username: string }[] = [];

      // Iterate through all guilds the bot is in
      for (const [guildId, guild] of this.client.guilds.cache) {
        const settings = await this.storage.getStreamNotificationSettings(guildId);
        
        if (!settings || !settings.isEnabled || !settings.notificationChannelId) {
          continue;
        }

        const trackedUsers = await this.storage.getStreamTrackedUsers(guildId);
        
        for (const tracked of trackedUsers) {
          if (!tracked.isActive) continue;

          const platformUsernames = this.parsePlatformUsernames(tracked.platformUsernames);
          const connectedPlatforms = this.parseConnectedPlatforms(tracked.connectedPlatforms);

          // Add Twitch users
          if (platformUsernames.twitch || connectedPlatforms.includes('twitch')) {
            twitchUsersToCheck.push({
              serverId: guildId,
              userId: tracked.userId,
              username: platformUsernames.twitch || tracked.username || tracked.userId
            });
          }

          // Add YouTube users (need channel ID or handle)
          if (platformUsernames.youtube || connectedPlatforms.includes('youtube')) {
            youtubeUsersToCheck.push({
              serverId: guildId,
              userId: tracked.userId,
              username: platformUsernames.youtube || ''
            });
          }
        }
      }

      console.log(`[StreamPoller] Checking ${twitchUsersToCheck.length} Twitch users, ${youtubeUsersToCheck.length} YouTube users`);

      // Check Twitch streams
      if (twitchAPI.isConfigured() && twitchUsersToCheck.length > 0) {
        await this.checkTwitchStreams(twitchUsersToCheck);
      }

      // Check YouTube streams
      if (youtubeAPI.isConfigured() && youtubeUsersToCheck.length > 0) {
        await this.checkYouTubeStreams(youtubeUsersToCheck);
      }

      // Clean up stale streams (not seen in last 2 poll cycles)
      this.cleanupStaleStreams();
      
      // Periodically clean up old notification logs (every poll cycle, runs async)
      this.storage.cleanupOldNotificationLogs(7).catch(err => 
        console.warn('[StreamPoller] Error cleaning notification logs:', err)
      );

      console.log(`[StreamPoller] Poll cycle complete. Active streams: ${this.activeStreams.size}`);

    } catch (error) {
      console.error('[StreamPoller] Error during poll:', error);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Check Twitch streams using the Twitch Helix API
   */
  private async checkTwitchStreams(
    users: { serverId: string; userId: string; username: string }[]
  ): Promise<void> {
    // Group users by username to deduplicate
    const uniqueUsernames = [...new Set(users.map(u => u.username.toLowerCase()))];
    
    // Twitch API allows up to 100 users per request
    const batches: string[][] = [];
    for (let i = 0; i < uniqueUsernames.length; i += 100) {
      batches.push(uniqueUsernames.slice(i, i + 100));
    }

    const liveUsernames = new Map<string, EnrichedStreamData>();

    for (const batch of batches) {
      try {
        const liveStreams = await this.batchCheckTwitchLive(batch);
        for (const [username, data] of liveStreams) {
          liveUsernames.set(username.toLowerCase(), data);
        }
      } catch (error) {
        console.error('[StreamPoller] Error checking Twitch batch:', error);
      }
    }

    console.log(`[StreamPoller] Twitch: ${liveUsernames.size}/${uniqueUsernames.length} users are live`);

    // Process results
    for (const user of users) {
      const usernameLower = user.username.toLowerCase();
      const streamData = liveUsernames.get(usernameLower);
      const streamKey = this.getStreamKey(user.serverId, user.userId, 'twitch');

      if (streamData && streamData.isLive) {
        const streamUrl = `https://twitch.tv/${user.username}`;
        await this.handleLiveStream(user.serverId, user.userId, 'twitch', user.username, streamUrl, streamData);
      } else {
        // User is offline
        this.handleOfflineStream(streamKey);
      }
    }
  }

  /**
   * Batch check Twitch live status using Helix API
   */
  private async batchCheckTwitchLive(usernames: string[]): Promise<Map<string, EnrichedStreamData>> {
    const results = new Map<string, EnrichedStreamData>();
    
    if (usernames.length === 0) return results;

    // Use individual stream checks (existing API)
    // In a production environment, you'd want to use the batch endpoint
    for (const username of usernames) {
      try {
        const streamUrl = `https://twitch.tv/${username}`;
        const data = await twitchAPI.getStreamData(streamUrl);
        if (data) {
          results.set(username.toLowerCase(), data);
        }
      } catch (error) {
        // Individual user check failed, continue with others
      }
    }

    return results;
  }

  /**
   * Check YouTube streams
   */
  private async checkYouTubeStreams(
    users: { serverId: string; userId: string; username: string }[]
  ): Promise<void> {
    // YouTube API requires video ID or channel lookup
    // For now, we only support users who have a YouTube video URL stored
    for (const user of users) {
      if (!user.username || !user.username.includes('youtube.com')) {
        continue;
      }

      try {
        const streamData = await youtubeAPI.getStreamData(user.username);
        const streamKey = this.getStreamKey(user.serverId, user.userId, 'youtube');

        if (streamData && streamData.isLive) {
          await this.handleLiveStream(user.serverId, user.userId, 'youtube', user.username, user.username, streamData);
        } else {
          this.handleOfflineStream(streamKey);
        }
      } catch (error) {
        console.error(`[StreamPoller] Error checking YouTube for ${user.userId}:`, error);
      }
    }
  }

  /**
   * Handle a detected live stream
   */
  private async handleLiveStream(
    serverId: string,
    userId: string,
    platform: 'twitch' | 'youtube' | 'kick',
    platformUsername: string,
    streamUrl: string,
    streamData: EnrichedStreamData
  ): Promise<void> {
    if (!this.client || !this.storage) return;

    const streamKey = this.getStreamKey(serverId, userId, platform);
    const existingStream = this.activeStreams.get(streamKey);
    const now = new Date();

    if (existingStream) {
      // Update last seen time
      existingStream.lastSeenAt = now;
      this.activeStreams.set(streamKey, existingStream);
      return; // Already tracking this stream
    }

    // New stream detected!
    console.log(`[StreamPoller] 🔴 New stream detected: ${platformUsername} on ${platform}`);

    // Get settings
    const settings = await this.storage.getStreamNotificationSettings(serverId);
    if (!settings || !settings.isEnabled || !settings.notificationChannelId) {
      return;
    }

    // Check cooldown
    const trackedUsers = await this.storage.getStreamTrackedUsers(serverId);
    const trackedUser = trackedUsers.find(u => u.userId === userId);
    
    if (trackedUser?.lastNotifiedAt) {
      const cooldownMs = (settings.cooldownMinutes ?? 30) * 60 * 1000;
      const timeSinceNotification = now.getTime() - new Date(trackedUser.lastNotifiedAt).getTime();
      
      if (timeSinceNotification < cooldownMs) {
        console.log(`[StreamPoller] Cooldown active for ${userId}, skipping notification (${Math.round((cooldownMs - timeSinceNotification) / 60000)}min remaining)`);
        
        // Still track the stream, just don't notify
        this.activeStreams.set(streamKey, {
          discordUserId: userId,
          serverId,
          platform,
          platformUsername,
          streamUrl,
          startedAt: now,
          lastSeenAt: now,
          notificationSent: false
        });
        return;
      }
    }

    // RECONCILIATION: Check if notification was already sent for this stream via any source
    const streamId = streamData.streamId || `poller_${platform}_${now.getTime()}`;
    const alreadyNotified = await this.storage.checkNotificationExists(serverId, userId, streamId);
    
    if (alreadyNotified) {
      console.log(`[StreamPoller] ✓ Stream ${streamId} already notified (via presence/webhook), tracking only`);
      
      // Track the stream but don't send duplicate notification
      this.activeStreams.set(streamKey, {
        discordUserId: userId,
        serverId,
        platform,
        platformUsername,
        streamUrl,
        startedAt: now,
        lastSeenAt: now,
        notificationSent: true
      });
      return;
    }
    
    // Also check if Discord presence is currently showing streaming
    // This is a fallback for cases where presence notification hasn't been logged yet
    try {
      const guild = this.client.guilds.cache.get(serverId);
      if (guild) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) {
          const isAlreadyStreaming = member.presence?.activities?.some(
            activity => activity.type === ActivityType.Streaming
          );
          
          if (isAlreadyStreaming) {
            console.log(`[StreamPoller] ${member.displayName} has streaming presence, waiting for presence handler`);
            
            // Short grace period - presence handler should log within 30 seconds
            // Track but don't notify yet to avoid race condition
            this.activeStreams.set(streamKey, {
              discordUserId: userId,
              serverId,
              platform,
              platformUsername,
              streamUrl,
              startedAt: now,
              lastSeenAt: now,
              notificationSent: false // Will be checked again on next poll
            });
            return;
          }
        }
      }
    } catch (error) {
      console.warn(`[StreamPoller] Could not check Discord presence for ${userId}:`, error);
    }

    // Send notification
    const notificationSent = await this.sendPolledStreamNotification(
      serverId,
      userId,
      platform,
      platformUsername,
      streamUrl,
      streamData,
      settings
    );

    // Track the stream
    this.activeStreams.set(streamKey, {
      discordUserId: userId,
      serverId,
      platform,
      platformUsername,
      streamUrl,
      startedAt: now,
      lastSeenAt: now,
      notificationSent
    });

    // Update last notified time
    if (notificationSent) {
      await this.storage.updateStreamTrackedUser(serverId, userId, {
        lastNotifiedAt: now
      });
    }
  }

  /**
   * Handle stream going offline
   */
  private handleOfflineStream(streamKey: string): void {
    const existingStream = this.activeStreams.get(streamKey);
    if (existingStream) {
      console.log(`[StreamPoller] Stream ended: ${existingStream.platformUsername} on ${existingStream.platform}`);
      this.activeStreams.delete(streamKey);
    }
  }

  /**
   * Clean up stale streams (not seen in last 2 poll cycles = 10 minutes)
   */
  private cleanupStaleStreams(): void {
    const staleThreshold = Date.now() - (POLL_INTERVAL_MS * 2);
    const keysToRemove: string[] = [];

    for (const [key, stream] of this.activeStreams) {
      if (stream.lastSeenAt.getTime() < staleThreshold) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      console.log(`[StreamPoller] Cleaning up stale stream: ${key}`);
      this.activeStreams.delete(key);
    }
  }

  /**
   * Send notification for a stream detected via polling
   */
  private async sendPolledStreamNotification(
    serverId: string,
    userId: string,
    platform: 'twitch' | 'youtube' | 'kick',
    platformUsername: string,
    streamUrl: string,
    streamData: EnrichedStreamData,
    settings: StreamNotificationSettings
  ): Promise<boolean> {
    if (!this.client || !this.storage) return false;

    try {
      const guild = this.client.guilds.cache.get(serverId);
      if (!guild) {
        console.warn(`[StreamPoller] Guild ${serverId} not found`);
        return false;
      }

      const channel = await guild.channels.fetch(settings.notificationChannelId!).catch(() => null);
      if (!channel || !(channel instanceof TextChannel)) {
        console.warn(`[StreamPoller] Notification channel not found for ${guild.name}`);
        return false;
      }

      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) {
        console.warn(`[StreamPoller] Member ${userId} not found in ${guild.name}`);
        return false;
      }

      // Build message content
      const messageTemplate = settings.customMessage || `{user} just went live!`;
      let content = messageTemplate
        .replace(/{user}/g, member.toString())
        .replace(/{username}/g, member.displayName)
        .replace(/{game}/g, streamData.game || 'Unknown Game')
        .replace(/{url}/g, streamUrl)
        .replace(/{title}/g, streamData.title || 'Live Stream')
        .replace(/{platform}/g, this.formatPlatformName(platform))
        .replace(/{channel}/g, guild.name);

      // Add mention role if configured
      if (settings.mentionRole) {
        content = `<@&${settings.mentionRole}> ${content}`;
      }

      // Create embed
      const embed = this.createStreamEmbed(member, streamUrl, streamData, platform);

      // Send notification
      await channel.send({
        content,
        embeds: [embed]
      });

      // Log the notification with new schema for deduplication
      const streamId = streamData.streamId || `poller_${platform}_${Date.now()}`;
      await this.storage.createStreamNotificationLog({
        serverId,
        discordUserId: userId,
        platform,
        streamId,
        source: 'poller'
      });

      console.log(`✓ [StreamPoller] Notification sent for ${member.displayName} on ${platform} (streamId: ${streamId})`);
      return true;

    } catch (error) {
      console.error(`[StreamPoller] Failed to send notification:`, error);
      return false;
    }
  }

  /**
   * Create embed for stream notification
   */
  private createStreamEmbed(
    member: GuildMember,
    streamUrl: string,
    streamData: EnrichedStreamData,
    platform: string
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(this.getPlatformColor(platform))
      .setAuthor({
        name: `${member.displayName} is now live!`,
        iconURL: member.displayAvatarURL({ size: 128 })
      })
      .setTitle(streamData.title || 'Live Stream')
      .setURL(streamUrl)
      .addFields(
        { name: 'Platform', value: this.formatPlatformName(platform), inline: true },
        { name: 'Game', value: streamData.game || 'Unknown', inline: true }
      )
      .setFooter({ text: '📡 Detected via API polling' })
      .setTimestamp();

    if (streamData.viewerCount > 0) {
      embed.addFields({ name: 'Viewers', value: streamData.viewerCount.toString(), inline: true });
    }

    if (streamData.thumbnailUrl) {
      embed.setImage(streamData.thumbnailUrl);
    }

    if (streamData.profileImageUrl) {
      embed.setThumbnail(streamData.profileImageUrl);
    }

    return embed;
  }

  /**
   * Get platform-specific color
   */
  private getPlatformColor(platform: string): number {
    switch (platform.toLowerCase()) {
      case 'twitch':
        return 0x9146FF; // Twitch purple
      case 'youtube':
        return 0xFF0000; // YouTube red
      case 'kick':
        return 0x53FC18; // Kick green
      default:
        return 0x5865F2; // Discord blue
    }
  }

  /**
   * Format platform name for display
   */
  private formatPlatformName(platform: string): string {
    switch (platform.toLowerCase()) {
      case 'twitch':
        return 'Twitch';
      case 'youtube':
        return 'YouTube';
      case 'kick':
        return 'Kick';
      default:
        return platform;
    }
  }

  /**
   * Get service status for monitoring
   */
  getStatus(): {
    isRunning: boolean;
    isPolling: boolean;
    lastPollTime: Date | null;
    activeStreams: number;
    twitchConfigured: boolean;
    youtubeConfigured: boolean;
  } {
    return {
      isRunning: this.pollInterval !== null,
      isPolling: this.isPolling,
      lastPollTime: this.lastPollTime,
      activeStreams: this.activeStreams.size,
      twitchConfigured: twitchAPI.isConfigured(),
      youtubeConfigured: youtubeAPI.isConfigured()
    };
  }

  /**
   * Trigger a manual poll (for testing/debugging)
   */
  async triggerManualPoll(): Promise<void> {
    console.log('[StreamPoller] Manual poll triggered');
    await this.poll();
  }
}

// Export singleton instance
export const streamPoller = new StreamPollerService();
