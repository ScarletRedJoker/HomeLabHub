import { Client, ActivityType, EmbedBuilder, TextChannel, GuildMember, Role } from 'discord.js';
import { IStorage } from '../storage';
import { twitchAPI, youtubeAPI, type EnrichedStreamData } from './twitch-api';
import { StreamNotificationSettings } from '../../shared/schema';

/**
 * ENHANCED STREAM NOTIFICATION SYSTEM WITH YAGPDB-STYLE FEATURES
 * 
 * Core Features:
 * - Debouncing: Configurable cooldown between notifications
 * - Offline grace period: 5 minutes before removing "live" status
 * - Platform switch detection: Handles Twitch → YouTube transitions
 * - Stream verification: Confirms stream is live via platform API
 * - Retry logic: Exponential backoff for API failures
 * - Notification queue: Queues notifications during Discord API downtime
 * - Comprehensive logging: All state transitions logged
 * - Presence flapping protection: Prevents spam from unstable presence
 * 
 * YAGPDB-Style Features:
 * - Role-based filtering: Only notify for users with certain roles
 * - Excluded roles: Skip users who have specific roles
 * - Game/category regex filter: Only notify for specific games
 * - Streaming role assignment: Auto-assign role when streaming, remove when done
 * - Custom message templates: {user}, {game}, {url}, {title}, {platform}
 * - Notify all members option: Not just tracked users
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
const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes default cooldown
const OFFLINE_GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes
const MIN_STREAM_DURATION_MS = 60 * 1000; // 1 minute
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 1000; // Start with 1 second

// Track users who currently have the streaming role assigned
const usersWithStreamingRole = new Map<string, string>(); // key: `${serverId}:${userId}`, value: roleId

/**
 * YAGPDB-STYLE HELPER FUNCTIONS
 */

/**
 * Check if a member meets role requirements for notifications
 * Returns true if member has at least one required role (or if no requirements set)
 */
function checkRoleRequirements(member: GuildMember, settings: StreamNotificationSettings): boolean {
  if (!settings.roleRequirements) return true;
  
  try {
    const requiredRoles: string[] = JSON.parse(settings.roleRequirements);
    if (requiredRoles.length === 0) return true;
    
    const hasRequiredRole = requiredRoles.some(roleId => member.roles.cache.has(roleId));
    if (!hasRequiredRole) {
      console.log(`[Role Filter] ${member.displayName} does not have any required roles, skipping`);
    }
    return hasRequiredRole;
  } catch (error) {
    console.error('[Role Filter] Error parsing role requirements:', error);
    return true; // Default to allowing if parse error
  }
}

/**
 * Check if a member has any excluded roles
 * Returns true if member should be excluded (has an excluded role)
 */
function hasExcludedRole(member: GuildMember, settings: StreamNotificationSettings): boolean {
  if (!settings.excludedRoles) return false;
  
  try {
    const excludedRoles: string[] = JSON.parse(settings.excludedRoles);
    if (excludedRoles.length === 0) return false;
    
    const hasExcluded = excludedRoles.some(roleId => member.roles.cache.has(roleId));
    if (hasExcluded) {
      console.log(`[Role Filter] ${member.displayName} has an excluded role, skipping`);
    }
    return hasExcluded;
  } catch (error) {
    console.error('[Role Filter] Error parsing excluded roles:', error);
    return false; // Default to not excluding if parse error
  }
}

/**
 * Check if game/category matches the filter regex
 * Returns true if game matches (or if no filter set)
 */
function matchesGameFilter(game: string | null, settings: StreamNotificationSettings): boolean {
  if (!settings.gameFilterEnabled || !settings.gameFilterRegex) return true;
  if (!game) return false; // If game required but none provided
  
  try {
    const regex = new RegExp(settings.gameFilterRegex, 'i');
    const matches = regex.test(game);
    if (!matches) {
      console.log(`[Game Filter] "${game}" does not match regex "${settings.gameFilterRegex}", skipping`);
    }
    return matches;
  } catch (error) {
    console.error('[Game Filter] Invalid regex pattern:', error);
    return true; // Default to allowing if regex error
  }
}

/**
 * Get the cooldown interval based on settings
 */
function getCooldownMs(settings: StreamNotificationSettings): number {
  const cooldownMinutes = settings.cooldownMinutes ?? 30;
  return cooldownMinutes * 60 * 1000;
}

/**
 * Assign streaming role to a member
 */
async function assignStreamingRole(
  member: GuildMember,
  settings: StreamNotificationSettings
): Promise<void> {
  if (!settings.streamingRoleEnabled || !settings.streamingRoleId) return;
  
  const key = `${member.guild.id}:${member.id}`;
  
  try {
    const role = member.guild.roles.cache.get(settings.streamingRoleId);
    if (!role) {
      console.warn(`[Streaming Role] Role ${settings.streamingRoleId} not found in guild`);
      return;
    }
    
    if (!member.roles.cache.has(settings.streamingRoleId)) {
      await member.roles.add(role, 'User started streaming');
      usersWithStreamingRole.set(key, settings.streamingRoleId);
      console.log(`✓ [Streaming Role] Assigned "${role.name}" to ${member.displayName}`);
    }
  } catch (error) {
    console.error(`[Streaming Role] Failed to assign role to ${member.displayName}:`, error);
  }
}

/**
 * Remove streaming role from a member
 */
async function removeStreamingRole(
  member: GuildMember,
  settings: StreamNotificationSettings
): Promise<void> {
  if (!settings.streamingRoleEnabled || !settings.streamingRoleId) return;
  
  const key = `${member.guild.id}:${member.id}`;
  
  try {
    const role = member.guild.roles.cache.get(settings.streamingRoleId);
    if (!role) {
      usersWithStreamingRole.delete(key);
      return;
    }
    
    if (member.roles.cache.has(settings.streamingRoleId)) {
      await member.roles.remove(role, 'User stopped streaming');
      usersWithStreamingRole.delete(key);
      console.log(`✓ [Streaming Role] Removed "${role.name}" from ${member.displayName}`);
    }
  } catch (error) {
    console.error(`[Streaming Role] Failed to remove role from ${member.displayName}:`, error);
  }
}

/**
 * Process custom message template with variables
 * Supports: {user}, {game}, {url}, {title}, {platform}, {channel}
 */
function processMessageTemplate(
  template: string,
  member: GuildMember,
  state: StreamState,
  enrichedData: EnrichedStreamData | null
): string {
  const game = enrichedData?.game || state.game || 'Unknown Game';
  const title = enrichedData?.title || state.streamTitle || 'Live Stream';
  
  return template
    .replace(/{user}/g, member.toString())
    .replace(/{username}/g, member.displayName)
    .replace(/{game}/g, game)
    .replace(/{url}/g, state.streamUrl)
    .replace(/{title}/g, title)
    .replace(/{platform}/g, state.platform)
    .replace(/{channel}/g, member.guild.name);
}

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
 * Generate a unique stream ID for deduplication
 * - Twitch/YouTube: Use platform-specific stream/broadcast ID from enriched data
 * - Discord presence: Generate from startedAt timestamp and sessionId
 */
function generateStreamId(state: StreamState, enrichedData: EnrichedStreamData | null): string {
  // If we have enriched data with a stream ID, use it
  if (enrichedData?.streamId) {
    return enrichedData.streamId;
  }
  
  // Fall back to generating a unique ID from session info
  // Format: {platform}_{sessionId or startedAt timestamp}
  return `${state.platform}_${state.sessionId || state.startedAt.getTime()}`;
}

/**
 * Send stream notification with retry logic (YAGPDB-enhanced)
 */
async function sendStreamNotification(
  guild: any,
  member: GuildMember,
  state: StreamState,
  settings: StreamNotificationSettings,
  storage: IStorage,
  enrichedData: EnrichedStreamData | null,
  source: 'presence' | 'webhook' | 'poller' | 'reconciliation' = 'presence'
): Promise<boolean> {
  const context = `Send notification for ${member.displayName}`;
  const streamId = generateStreamId(state, enrichedData);
  
  // Check if notification was already sent for this stream (deduplication)
  const alreadyNotified = await storage.checkNotificationExists(
    state.serverId,
    state.userId,
    streamId
  );
  
  if (alreadyNotified) {
    console.log(`[Notification Skip] Already notified for stream ${streamId}`);
    return true; // Return true since notification was already handled
  }
  
  const result = await retryWithBackoff(async () => {
    const channel = await guild.channels.fetch(settings.notificationChannelId);
    
    if (!channel || !(channel instanceof TextChannel)) {
      throw new Error(`Channel ${settings.notificationChannelId} not found or not a text channel`);
    }

    // Get custom message from server settings or use default
    const messageTemplate = settings.customMessage || `{user} just went live!`;
    
    // Process template with all YAGPDB-style variables
    let content = processMessageTemplate(messageTemplate, member, state, enrichedData);
    
    // Add mention role if configured
    if (settings.mentionRole) {
      content = `<@&${settings.mentionRole}> ${content}`;
    }

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

    // Log the notification with new schema fields for reconciliation
    await storage.createStreamNotificationLog({
      serverId: state.serverId,
      discordUserId: state.userId,
      platform: state.platform,
      streamId,
      source
    });

    console.log(`✓ [Notification Sent] ${member.displayName} on ${state.platform} (source: ${source}, streamId: ${streamId})`);
    
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
 * Handle presence update events to detect when users start streaming (YAGPDB-enhanced)
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

    // YAGPDB-STYLE: Check if we should process this user
    // Option 1: Track all members who go live
    // Option 2: Only track specific users (default)
    const trackedUsers = await storage.getStreamTrackedUsers(serverId);
    const isTracked = trackedUsers.some(u => u.userId === userId);
    const shouldProcess = settings.notifyAllMembers || isTracked;
    
    if (!shouldProcess) {
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
      
      // Fetch member first for role checks
      const member = await retryWithBackoff(
        () => newPresence.guild.members.fetch(userId),
        `Fetch member ${userId}`
      );
      
      if (!member) {
        console.error(`[Presence Update] Could not fetch member ${userId}`);
        return;
      }
      
      // YAGPDB-STYLE: Assign streaming role immediately when streaming detected
      await assignStreamingRole(member as GuildMember, settings);
      
      // YAGPDB-STYLE: Check role requirements
      if (!checkRoleRequirements(member as GuildMember, settings)) {
        return; // User doesn't have required roles
      }
      
      // YAGPDB-STYLE: Check excluded roles
      if (hasExcludedRole(member as GuildMember, settings)) {
        return; // User has an excluded role
      }
      
      // YAGPDB-STYLE: Check game/category filter
      if (!matchesGameFilter(game, settings)) {
        return; // Game doesn't match filter
      }
      
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
      
      // YAGPDB-STYLE: Cooldown check using configurable duration
      const cooldownMs = getCooldownMs(settings);
      if (state.lastNotifiedAt) {
        const timeSinceLastNotification = now.getTime() - state.lastNotifiedAt.getTime();
        if (timeSinceLastNotification < cooldownMs) {
          console.log(`⏱ [Cooldown] ${userId} - Skipping notification (${Math.round(timeSinceLastNotification / 60000)}min since last, cooldown is ${settings.cooldownMinutes}min)`);
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
        
        // Try to send notification
        const success = await sendStreamNotification(
          newPresence.guild,
          member as GuildMember,
          state,
          settings,
          storage,
          enrichedData
        );
        
        if (success) {
          state.notificationSent = true;
          state.lastNotifiedAt = now;
          streamStates.set(key, state);
          
          // Update tracked user if this is a tracked user
          if (isTracked) {
            await storage.updateStreamTrackedUser(serverId, userId, {
              lastNotifiedAt: now
            });
          }
        } else {
          // Queue for retry
          console.log(`[Notification Queue] Queueing notification for ${(member as GuildMember).displayName}`);
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
      
      // YAGPDB-STYLE: Remove streaming role when user stops streaming
      try {
        const member = await newPresence.guild.members.fetch(userId);
        if (member) {
          await removeStreamingRole(member as GuildMember, settings);
        }
      } catch (error) {
        console.warn(`[Streaming Role] Could not remove role for ${userId}:`, error);
      }
      
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
