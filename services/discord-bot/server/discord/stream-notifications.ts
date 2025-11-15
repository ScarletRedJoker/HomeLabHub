import { Client, ActivityType, EmbedBuilder, TextChannel, GuildMember } from 'discord.js';
import { IStorage } from '../storage';
import { twitchAPI, youtubeAPI, type EnrichedStreamData } from './twitch-api';

/**
 * ENHANCED STREAM NOTIFICATION SYSTEM WITH EDGE CASE HANDLING
 * 
 * Features:
 * - Debouncing: 30 second minimum between notifications
 * - Offline grace period: 5 minutes before removing "live" status
 * - Platform switch detection: Handles Twitch → YouTube transitions
 * - Stream verification: Confirms stream is live via platform API
 * - Retry logic: Exponential backoff for API failures
 * - Notification queue: Queues notifications during Discord API downtime
 * - Comprehensive logging: All state transitions logged
 * - Presence flapping protection: Prevents spam from unstable presence
 */

// Stream state tracking
interface StreamState {
  userId: string;
  serverId: string;
  platform: string;
  streamUrl: string;
  streamTitle: string;
  game: string | null;
  sessionId: string; // Unique identifier for this stream session
  startedAt: Date;
  lastSeenAt: Date;
  lastNotifiedAt: Date | null;
  wentOfflineAt: Date | null;
  isLive: boolean;
  verifiedLive: boolean; // Confirmed via platform API
  notificationSent: boolean;
}

// Notification queue for API failures
interface QueuedNotification {
  serverId: string;
  userId: string;
  state: StreamState;
  retryCount: number;
  queuedAt: Date;
}

// Track all stream states
const streamStates = new Map<string, StreamState>(); // key: `${serverId}:${userId}`

// Track offline timers (for 5-minute grace period)
const offlineTimers = new Map<string, NodeJS.Timeout>(); // key: `${serverId}:${userId}`

// Notification queue for API failures
const notificationQueue: QueuedNotification[] = [];

// Track API health
let discordAPIHealthy = true;
let lastAPIFailure: Date | null = null;

// Configuration
const DEBOUNCE_INTERVAL_MS = 30 * 1000; // 30 seconds
const OFFLINE_GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes
const MIN_STREAM_DURATION_MS = 60 * 1000; // 1 minute
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 1000; // Start with 1 second

/**
 * Generate unique session ID for a stream
 */
function generateSessionId(userId: string, platform: string, streamUrl: string): string {
  return `${userId}-${platform}-${Date.now()}-${streamUrl.substring(0, 20)}`;
}

/**
 * Get state key for tracking
 */
function getStateKey(serverId: string, userId: string): string {
  return `${serverId}:${userId}`;
}

/**
 * Detect platform from stream URL
 */
function detectPlatform(url: string): string {
  const urlLower = url.toLowerCase();
  if (urlLower.includes('twitch.tv')) return 'Twitch';
  if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) return 'YouTube';
  if (urlLower.includes('kick.com')) return 'Kick';
  if (urlLower.includes('facebook.com')) return 'Facebook Gaming';
  return 'Unknown';
}

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
 * Verify stream is actually live via platform API
 */
async function verifyStreamLive(platform: string, streamUrl: string): Promise<EnrichedStreamData | null> {
  console.log(`[Stream Verification] Verifying ${platform} stream: ${streamUrl}`);
  
  try {
    if (platform === 'Twitch' && twitchAPI.isConfigured()) {
      const data = await twitchAPI.getStreamData(streamUrl);
      if (data?.isLive) {
        console.log(`[Stream Verification] ✓ Twitch stream verified live`);
        return data;
      } else {
        console.log(`[Stream Verification] ✗ Twitch stream not live`);
        return null;
      }
    } else if (platform === 'YouTube' && youtubeAPI.isConfigured()) {
      const data = await youtubeAPI.getStreamData(streamUrl);
      if (data?.isLive) {
        console.log(`[Stream Verification] ✓ YouTube stream verified live`);
        return data;
      } else {
        console.log(`[Stream Verification] ✗ YouTube stream not live`);
        return null;
      }
    }
    
    // If API not configured or unknown platform, assume live (trust Discord presence)
    console.log(`[Stream Verification] No API available for ${platform}, trusting Discord presence`);
    return null;
  } catch (error) {
    console.error(`[Stream Verification] Error verifying stream:`, error);
    // On error, trust Discord presence rather than blocking notification
    return null;
  }
}

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(retryCount: number): number {
  return Math.min(RETRY_BASE_DELAY_MS * Math.pow(2, retryCount), 60000); // Max 60 seconds
}

/**
 * Retry with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  context: string,
  maxAttempts: number = MAX_RETRY_ATTEMPTS
): Promise<T | null> {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (attempt > 0) {
        const delay = getBackoffDelay(attempt - 1);
        console.log(`[Retry] ${context} - Attempt ${attempt + 1}/${maxAttempts} after ${delay}ms delay`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      return await fn();
    } catch (error) {
      lastError = error;
      console.error(`[Retry] ${context} - Attempt ${attempt + 1}/${maxAttempts} failed:`, error);
      
      // Check if error is retryable
      if (error && typeof error === 'object' && 'code' in error) {
        const errorCode = (error as any).code;
        // Don't retry on 404, 403, 401
        if (errorCode === 404 || errorCode === 403 || errorCode === 401) {
          console.log(`[Retry] ${context} - Non-retryable error code ${errorCode}, aborting`);
          break;
        }
      }
    }
  }
  
  console.error(`[Retry] ${context} - All attempts failed`);
  return null;
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
 * Send stream notification with retry logic
 */
async function sendStreamNotification(
  guild: any,
  member: GuildMember,
  state: StreamState,
  settings: any,
  storage: IStorage,
  enrichedData: EnrichedStreamData | null
): Promise<boolean> {
  const context = `Send notification for ${member.displayName}`;
  
  const result = await retryWithBackoff(async () => {
    const channel = await guild.channels.fetch(settings.notificationChannelId);
    
    if (!channel || !(channel instanceof TextChannel)) {
      throw new Error(`Channel ${settings.notificationChannelId} not found or not a text channel`);
    }

    // Get custom message from server settings or use default
    let messageTemplate = settings.customMessage || `{user} just went live!`;
    
    // Substitute placeholders (use enriched data if available)
    const gameName = enrichedData?.game || state.game || 'Unknown Game';
    let content = messageTemplate
      .replace(/{user}/g, member.toString())
      .replace(/{game}/g, gameName)
      .replace(/{platform}/g, state.platform);

    // Create the embed with enriched data
    const embed = createStreamNotificationEmbed(
      member,
      state.streamTitle,
      state.streamUrl,
      state.game,
      state.platform,
      enrichedData
    );

    // Send notification
    const message = await channel.send({
      content,
      embeds: [embed]
    });

    // Log the notification
    await storage.createStreamNotificationLog({
      serverId: state.serverId,
      userId: state.userId,
      streamTitle: state.streamTitle,
      streamUrl: state.streamUrl,
      platform: state.platform,
      messageId: message.id
    });

    console.log(`✓ [Notification Sent] ${member.displayName} on ${state.platform}`);
    
    return message;
  }, context);
  
  if (result) {
    discordAPIHealthy = true;
    return true;
  } else {
    discordAPIHealthy = false;
    lastAPIFailure = new Date();
    return false;
  }
}

/**
 * Process queued notifications
 */
async function processNotificationQueue(client: Client, storage: IStorage): Promise<void> {
  if (notificationQueue.length === 0) return;
  
  console.log(`[Notification Queue] Processing ${notificationQueue.length} queued notification(s)`);
  
  const toRemove: number[] = [];
  
  for (let i = 0; i < notificationQueue.length; i++) {
    const queued = notificationQueue[i];
    const state = queued.state;
    
    try {
      const guild = client.guilds.cache.get(state.serverId);
      if (!guild) {
        console.warn(`[Notification Queue] Guild ${state.serverId} not found, removing from queue`);
        toRemove.push(i);
        continue;
      }
      
      const member = await guild.members.fetch(state.userId);
      const settings = await storage.getStreamNotificationSettings(state.serverId);
      
      if (!settings || !settings.isEnabled) {
        console.log(`[Notification Queue] Notifications disabled for ${guild.name}, removing from queue`);
        toRemove.push(i);
        continue;
      }
      
      // Verify stream is still live
      const enrichedData = await verifyStreamLive(state.platform, state.streamUrl);
      if (!enrichedData || !enrichedData.isLive) {
        console.log(`[Notification Queue] Stream no longer live for ${member.displayName}, removing from queue`);
        toRemove.push(i);
        continue;
      }
      
      // Try to send
      const success = await sendStreamNotification(guild, member, state, settings, storage, enrichedData);
      
      if (success) {
        console.log(`✓ [Notification Queue] Successfully sent queued notification for ${member.displayName}`);
        toRemove.push(i);
        
        // Update state
        state.notificationSent = true;
        state.lastNotifiedAt = new Date();
        streamStates.set(getStateKey(state.serverId, state.userId), state);
        
        // Update storage
        await storage.updateStreamTrackedUser(state.serverId, state.userId, {
          lastNotifiedAt: new Date()
        });
      } else {
        queued.retryCount++;
        if (queued.retryCount >= MAX_RETRY_ATTEMPTS) {
          console.error(`[Notification Queue] Max retries exceeded for ${member.displayName}, removing from queue`);
          toRemove.push(i);
        }
      }
    } catch (error) {
      console.error(`[Notification Queue] Error processing queued notification:`, error);
      queued.retryCount++;
      if (queued.retryCount >= MAX_RETRY_ATTEMPTS) {
        toRemove.push(i);
      }
    }
  }
  
  // Remove processed items (in reverse order to maintain indices)
  for (let i = toRemove.length - 1; i >= 0; i--) {
    notificationQueue.splice(toRemove[i], 1);
  }
}

/**
 * Handle stream going offline with grace period
 */
function handleStreamOffline(serverId: string, userId: string, state: StreamState): void {
  const key = getStateKey(serverId, userId);
  
  // Cancel existing timer if any
  const existingTimer = offlineTimers.get(key);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  
  // Mark as went offline
  state.wentOfflineAt = new Date();
  streamStates.set(key, state);
  
  console.log(`[Stream Offline] ${state.userId} on ${state.platform} - Starting ${OFFLINE_GRACE_PERIOD_MS / 1000}s grace period`);
  
  // Set grace period timer
  const timer = setTimeout(() => {
    const currentState = streamStates.get(key);
    if (currentState && currentState.wentOfflineAt && !currentState.isLive) {
      const offlineDuration = Date.now() - currentState.wentOfflineAt.getTime();
      console.log(`[Stream Offline] Grace period expired for ${currentState.userId} (offline for ${offlineDuration / 1000}s)`);
      
      // Remove from tracking
      streamStates.delete(key);
      offlineTimers.delete(key);
      
      console.log(`[Stream State] Removed ${currentState.userId} - Stream ended`);
    }
  }, OFFLINE_GRACE_PERIOD_MS);
  
  offlineTimers.set(key, timer);
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

    const key = getStateKey(serverId, userId);
    const existingState = streamStates.get(key);
    const now = new Date();

    // USER STARTED STREAMING OR CHANGED STREAM
    if (newStreaming) {
      const streamUrl = newStreaming.url || newStreaming.state || '';
      const platform = detectPlatform(streamUrl);
      const streamTitle = newStreaming.details || '';
      const game = newStreaming.name || null;
      
      console.log(`[Presence Update] ${userId} streaming on ${platform}: ${streamUrl}`);
      
      // Check if this is a new stream session or platform switch
      const isPlatformSwitch = existingState && existingState.platform !== platform;
      const isSessionChange = existingState && existingState.streamUrl !== streamUrl;
      const isNewStream = !existingState;
      
      if (isPlatformSwitch) {
        console.log(`⚠ [Platform Switch] ${userId}: ${existingState.platform} → ${platform}`);
      }
      
      if (isSessionChange && !isPlatformSwitch) {
        console.log(`⚠ [Stream Restart] ${userId}: New session on ${platform}`);
      }
      
      // Cancel offline timer if exists (user came back online)
      const offlineTimer = offlineTimers.get(key);
      if (offlineTimer) {
        clearTimeout(offlineTimer);
        offlineTimers.delete(key);
        console.log(`[Stream Online] ${userId} came back online within grace period`);
      }
      
      // Create or update stream state
      let state: StreamState;
      
      if (isNewStream || isPlatformSwitch || isSessionChange) {
        // New stream session
        state = {
          userId,
          serverId,
          platform,
          streamUrl,
          streamTitle,
          game,
          sessionId: generateSessionId(userId, platform, streamUrl),
          startedAt: now,
          lastSeenAt: now,
          lastNotifiedAt: null,
          wentOfflineAt: null,
          isLive: true,
          verifiedLive: false,
          notificationSent: false
        };
        
        console.log(`[Stream State] New session: ${userId} on ${platform} (${state.sessionId})`);
      } else {
        // Update existing state
        state = {
          ...existingState,
          lastSeenAt: now,
          wentOfflineAt: null,
          isLive: true,
          streamTitle, // Update title (might change)
          game // Update game (might change)
        };
        
        console.log(`[Stream State] Updated: ${userId} on ${platform}`);
      }
      
      streamStates.set(key, state);
      
      // DEBOUNCE CHECK: Don't notify if we just notified recently
      if (state.lastNotifiedAt) {
        const timeSinceLastNotification = now.getTime() - state.lastNotifiedAt.getTime();
        if (timeSinceLastNotification < DEBOUNCE_INTERVAL_MS) {
          console.log(`⏱ [Debounce] ${userId} - Skipping notification (${timeSinceLastNotification / 1000}s since last notification)`);
          return;
        }
      }
      
      // Only send notification for new sessions or platform switches
      if ((isNewStream || isPlatformSwitch || isSessionChange) && !state.notificationSent) {
        // Verify stream is actually live via platform API
        console.log(`[Stream Verification] Verifying ${platform} stream for ${userId}...`);
        const enrichedData = await verifyStreamLive(platform, streamUrl);
        
        if (enrichedData && !enrichedData.isLive) {
          console.log(`✗ [Verification Failed] ${userId} - Platform API says stream is not live, skipping notification`);
          return;
        }
        
        state.verifiedLive = !!enrichedData;
        
        // Fetch member
        const member = await retryWithBackoff(
          () => newPresence.guild.members.fetch(userId),
          `Fetch member ${userId}`
        );
        
        if (!member) {
          console.error(`[Presence Update] Could not fetch member ${userId}`);
          return;
        }
        
        // Try to send notification
        const success = await sendStreamNotification(
          newPresence.guild,
          member,
          state,
          settings,
          storage,
          enrichedData
        );
        
        if (success) {
          state.notificationSent = true;
          state.lastNotifiedAt = now;
          streamStates.set(key, state);
          
          await storage.updateStreamTrackedUser(serverId, userId, {
            lastNotifiedAt: now
          });
        } else {
          // Queue for retry
          console.log(`[Notification Queue] Queueing notification for ${member.displayName}`);
          notificationQueue.push({
            serverId,
            userId,
            state,
            retryCount: 0,
            queuedAt: now
          });
        }
      }
    }
    
    // USER STOPPED STREAMING
    else if (!newStreaming && existingState && existingState.isLive) {
      console.log(`[Presence Update] ${userId} stopped streaming`);
      
      // Check if stream was too short (< 1 minute)
      const streamDuration = now.getTime() - existingState.startedAt.getTime();
      if (streamDuration < MIN_STREAM_DURATION_MS && existingState.notificationSent) {
        console.log(`⚠ [Short Stream] ${userId} - Stream lasted only ${streamDuration / 1000}s, was likely a test`);
      }
      
      // Mark as offline and start grace period
      existingState.isLive = false;
      handleStreamOffline(serverId, userId, existingState);
    }

  } catch (error) {
    console.error('[Stream Notifications] Error handling presence update:', error);
  }
}

/**
 * Initialize stream tracking for all servers on bot startup
 */
export async function initializeStreamTracking(client: Client, storage: IStorage): Promise<void> {
  console.log('[Stream Notifications] Initializing enhanced stream tracking...');
  
  streamStates.clear();
  offlineTimers.forEach(timer => clearTimeout(timer));
  offlineTimers.clear();
  
  // For each server, check current presences and populate the tracking map
  for (const [guildId, guild] of client.guilds.cache) {
    const settings = await storage.getStreamNotificationSettings(guildId);
    
    if (!settings || !settings.isEnabled) continue;

    const trackedUsers = await storage.getStreamTrackedUsers(guildId);
    if (trackedUsers.length === 0) continue;

    console.log(`[Stream Tracking] Initializing ${guild.name} - ${trackedUsers.length} tracked user(s)`);

    // Check which tracked users are currently streaming
    for (const tracked of trackedUsers) {
      try {
        const member = await guild.members.fetch(tracked.userId);
        const streamingActivity = member.presence?.activities?.find(
          activity => activity.type === ActivityType.Streaming
        );

        if (streamingActivity) {
          const streamUrl = streamingActivity.url || streamingActivity.state || '';
          const platform = detectPlatform(streamUrl);
          
          const state: StreamState = {
            userId: tracked.userId,
            serverId: guildId,
            platform,
            streamUrl,
            streamTitle: streamingActivity.details || '',
            game: streamingActivity.name || null,
            sessionId: generateSessionId(tracked.userId, platform, streamUrl),
            startedAt: new Date(),
            lastSeenAt: new Date(),
            lastNotifiedAt: tracked.lastNotifiedAt || null,
            wentOfflineAt: null,
            isLive: true,
            verifiedLive: false,
            notificationSent: true // Don't re-notify on startup
          };
          
          streamStates.set(getStateKey(guildId, tracked.userId), state);
          console.log(`[Stream Tracking] Found ${member.displayName} already streaming on ${platform}`);
        }
      } catch (error) {
        console.warn(`[Stream Tracking] Could not fetch user ${tracked.userId} in ${guild.name}`);
      }
    }
  }

  console.log(`[Stream Notifications] Initialized tracking for ${streamStates.size} active stream(s)`);
  
  // Start queue processor
  setInterval(() => {
    if (notificationQueue.length > 0) {
      processNotificationQueue(client, storage).catch(error => {
        console.error('[Notification Queue] Error processing queue:', error);
      });
    }
  }, 30000); // Process queue every 30 seconds
}

/**
 * Get current stream states (for debugging/monitoring)
 */
export function getStreamStates(): Map<string, StreamState> {
  return new Map(streamStates);
}

/**
 * Get notification queue status (for debugging/monitoring)
 */
export function getQueueStatus(): { queueLength: number; apiHealthy: boolean; lastFailure: Date | null } {
  return {
    queueLength: notificationQueue.length,
    apiHealthy: discordAPIHealthy,
    lastFailure: lastAPIFailure
  };
}
