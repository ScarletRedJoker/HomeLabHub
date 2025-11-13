import { Client, TextChannel, ThreadChannel, ChannelType, EmbedBuilder } from 'discord.js';
import { IStorage } from '../storage';
import { Ticket } from '@shared/schema';

// Rate limiting map: userId -> array of ticket creation timestamps
const ticketCreationRateLimit = new Map<string, number[]>();

// Configuration
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_TICKETS_PER_HOUR = 5;
const CHANNEL_CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const AUTO_CLOSE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const AUTO_CLOSE_WARNING_HOURS = 12; // Warn before auto-closing

/**
 * Check if a user has exceeded the ticket creation rate limit
 * @param userId Discord user ID
 * @returns Object with isLimited flag and reset time
 */
export function checkTicketRateLimit(userId: string): { 
  isLimited: boolean; 
  remaining: number;
  resetAt: Date;
} {
  const now = Date.now();
  const userTimestamps = ticketCreationRateLimit.get(userId) || [];
  
  // Remove timestamps older than the rate limit window
  const recentTimestamps = userTimestamps.filter(
    timestamp => now - timestamp < RATE_LIMIT_WINDOW_MS
  );
  
  // Update the map with filtered timestamps
  if (recentTimestamps.length > 0) {
    ticketCreationRateLimit.set(userId, recentTimestamps);
  } else {
    ticketCreationRateLimit.delete(userId);
  }
  
  const isLimited = recentTimestamps.length >= MAX_TICKETS_PER_HOUR;
  const remaining = Math.max(0, MAX_TICKETS_PER_HOUR - recentTimestamps.length);
  
  // Calculate when the oldest timestamp will expire
  const oldestTimestamp = recentTimestamps[0] || now;
  const resetAt = new Date(oldestTimestamp + RATE_LIMIT_WINDOW_MS);
  
  return { isLimited, remaining, resetAt };
}

/**
 * Record a ticket creation for rate limiting
 * @param userId Discord user ID
 */
export function recordTicketCreation(userId: string): void {
  const now = Date.now();
  const userTimestamps = ticketCreationRateLimit.get(userId) || [];
  userTimestamps.push(now);
  ticketCreationRateLimit.set(userId, userTimestamps);
}

/**
 * Validate that a category exists in the database
 * @param storage Storage interface
 * @param categoryId Category ID to validate
 * @param serverId Server ID for validation
 * @returns Object with isValid flag and error message
 */
export async function validateTicketCategory(
  storage: IStorage,
  categoryId: number,
  serverId: string | null
): Promise<{ isValid: boolean; error?: string; category?: any }> {
  try {
    const category = await storage.getTicketCategory(categoryId);
    
    if (!category) {
      return {
        isValid: false,
        error: `❌ **Category Not Found**\n\nThe selected category (ID: ${categoryId}) does not exist in the database. Please contact an administrator.`
      };
    }
    
    // Validate that the category belongs to this server or is global
    if (category.serverId && category.serverId !== serverId) {
      return {
        isValid: false,
        error: `❌ **Invalid Category**\n\nThe selected category does not belong to this server. Please select a valid category.`
      };
    }
    
    return { isValid: true, category };
  } catch (error) {
    console.error('[Safeguards] Error validating category:', error);
    return {
      isValid: false,
      error: '❌ **Database Error**\n\nFailed to validate category. Please try again later.'
    };
  }
}

/**
 * Validate that bot settings exist for a server
 * @param storage Storage interface
 * @param serverId Server ID
 * @returns Object with isValid flag and error message
 */
export async function validateBotSettings(
  storage: IStorage,
  serverId: string
): Promise<{ isValid: boolean; error?: string; settings?: any }> {
  try {
    const settings = await storage.getBotSettings(serverId);
    
    if (!settings) {
      console.log(`[Safeguards] No bot settings found for server ${serverId}, creating defaults...`);
      // Create default settings if they don't exist
      const defaultSettings = await storage.createBotSettings({
        serverId,
        botName: 'Ticket Bot',
        botPrefix: '!',
        welcomeMessage: 'Thank you for creating a ticket. Our support team will assist you shortly.',
        notificationsEnabled: true,
        autoCloseEnabled: false,
        autoCloseHours: '48',
        defaultPriority: 'normal',
        debugMode: false
      });
      
      return { isValid: true, settings: defaultSettings };
    }
    
    return { isValid: true, settings };
  } catch (error) {
    console.error('[Safeguards] Error validating bot settings:', error);
    return {
      isValid: false,
      error: '❌ **Configuration Error**\n\nFailed to load server settings. Please contact an administrator.'
    };
  }
}

/**
 * Check if a Discord channel/thread still exists
 * @param client Discord client
 * @param channelId Channel or thread ID
 * @returns true if channel exists and is accessible
 */
export async function checkChannelExists(
  client: Client,
  channelId: string
): Promise<boolean> {
  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    return channel !== null;
  } catch (error) {
    console.error(`[Safeguards] Error checking channel ${channelId}:`, error);
    return false;
  }
}

/**
 * Safely send a message to a Discord channel with error handling
 * @param client Discord client
 * @param channelId Channel or thread ID
 * @param content Message content or embed
 * @returns Success status
 */
export async function safeSendMessage(
  client: Client,
  channelId: string,
  content: { content?: string; embeds?: EmbedBuilder[] }
): Promise<{ success: boolean; error?: string }> {
  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    
    if (!channel) {
      return {
        success: false,
        error: 'Channel not found or deleted'
      };
    }
    
    if (!channel.isTextBased()) {
      return {
        success: false,
        error: 'Channel is not text-based'
      };
    }
    
    // Type guard to ensure channel has send method
    if ('send' in channel && typeof channel.send === 'function') {
      await channel.send(content);
      return { success: true };
    } else {
      return {
        success: false,
        error: 'Channel does not support sending messages'
      };
    }
  } catch (error: any) {
    console.error(`[Safeguards] Error sending message to ${channelId}:`, error);
    
    // Check for common Discord API errors
    if (error.code === 10003) {
      return { success: false, error: 'Unknown channel (deleted)' };
    } else if (error.code === 50001) {
      return { success: false, error: 'Missing access' };
    } else if (error.code === 50013) {
      return { success: false, error: 'Missing permissions' };
    }
    
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
}

/**
 * Background job to reconcile Discord channels with database tickets
 * Marks tickets as orphaned if their Discord channel no longer exists
 */
export async function reconcileTicketChannels(
  client: Client,
  storage: IStorage,
  broadcast: (data: any) => void
): Promise<void> {
  console.log('[Safeguards] Starting ticket channel reconciliation...');
  
  try {
    // Get all open tickets with Discord IDs
    const allTickets = await storage.getAllTickets();
    const openTickets = allTickets.filter(
      ticket => ticket.status === 'open' && ticket.discordId
    );
    
    console.log(`[Safeguards] Checking ${openTickets.length} open tickets with Discord channels`);
    
    let orphanedCount = 0;
    
    for (const ticket of openTickets) {
      if (!ticket.discordId) continue;
      
      const channelExists = await checkChannelExists(client, ticket.discordId);
      
      if (!channelExists) {
        console.log(`[Safeguards] Orphaned ticket detected: #${ticket.id} (channel ${ticket.discordId} deleted)`);
        
        // Mark ticket as orphaned by updating status
        await storage.updateTicket(ticket.id, {
          status: 'orphaned'
        });
        
        // Create audit log
        await storage.createTicketAuditLog({
          ticketId: ticket.id,
          action: 'orphaned',
          performedBy: client.user?.id || 'system',
          performedByUsername: 'System',
          details: JSON.stringify({
            reason: 'Discord channel deleted',
            channelId: ticket.discordId
          }),
          serverId: ticket.serverId
        });
        
        // Broadcast update
        broadcast({
          type: 'TICKET_UPDATED',
          data: { ...ticket, status: 'orphaned' }
        });
        
        orphanedCount++;
      }
    }
    
    console.log(`[Safeguards] Reconciliation complete. Marked ${orphanedCount} tickets as orphaned.`);
  } catch (error) {
    console.error('[Safeguards] Error during channel reconciliation:', error);
  }
}

/**
 * Background job to auto-close inactive tickets
 * Sends warning before closing and then closes tickets past the threshold
 */
export async function autoCloseInactiveTickets(
  client: Client,
  storage: IStorage,
  broadcast: (data: any) => void
): Promise<void> {
  console.log('[Safeguards] Starting auto-close check for inactive tickets...');
  
  try {
    // Get all servers with auto-close enabled
    const allServers = await storage.getAllServers();
    
    for (const server of allServers) {
      const botSettings = await storage.getBotSettings(server.id);
      
      if (!botSettings?.autoCloseEnabled) {
        continue;
      }
      
      const autoCloseHours = parseInt(botSettings.autoCloseHours || '48');
      const warningHours = autoCloseHours - AUTO_CLOSE_WARNING_HOURS;
      
      console.log(`[Safeguards] Checking server ${server.name} (auto-close after ${autoCloseHours}h, warning at ${warningHours}h)`);
      
      // Get open tickets for this server
      const serverTickets = await storage.getTicketsByServerId(server.id);
      const openTickets = serverTickets.filter(t => t.status === 'open');
      
      const now = new Date();
      
      for (const ticket of openTickets) {
        if (!ticket.updatedAt) continue;
        
        const hoursSinceUpdate = (now.getTime() - ticket.updatedAt.getTime()) / (1000 * 60 * 60);
        
        // Check if ticket should be auto-closed
        if (hoursSinceUpdate >= autoCloseHours) {
          console.log(`[Safeguards] Auto-closing ticket #${ticket.id} (inactive for ${hoursSinceUpdate.toFixed(1)}h)`);
          
          // Update ticket status
          await storage.updateTicket(ticket.id, {
            status: 'closed'
          });
          
          // Create resolution
          await storage.createTicketResolution({
            ticketId: ticket.id,
            resolutionType: 'resolved',
            resolutionNotes: `Ticket automatically closed due to ${autoCloseHours} hours of inactivity`,
            actionTaken: 'Auto-closed by system',
            resolvedBy: client.user?.id || 'system',
            resolvedByUsername: 'System',
            serverId: ticket.serverId
          });
          
          // Create audit log
          await storage.createTicketAuditLog({
            ticketId: ticket.id,
            action: 'auto_closed',
            performedBy: client.user?.id || 'system',
            performedByUsername: 'System',
            details: JSON.stringify({
              reason: 'Inactivity timeout',
              inactiveHours: hoursSinceUpdate.toFixed(1)
            }),
            serverId: ticket.serverId
          });
          
          // Send closure message to Discord channel if it exists
          if (ticket.discordId) {
            const closeEmbed = new EmbedBuilder()
              .setTitle('🔒 Ticket Auto-Closed')
              .setDescription(`This ticket has been automatically closed due to ${autoCloseHours} hours of inactivity.`)
              .addFields(
                { name: 'Ticket ID', value: `#${ticket.id}`, inline: true },
                { name: 'Inactive Duration', value: `${hoursSinceUpdate.toFixed(1)} hours`, inline: true }
              )
              .setColor('#F04747')
              .setTimestamp()
              .setFooter({ text: 'If you need further assistance, please create a new ticket.' });
            
            await safeSendMessage(client, ticket.discordId, { embeds: [closeEmbed] });
          }
          
          // Broadcast update
          broadcast({
            type: 'TICKET_UPDATED',
            data: { ...ticket, status: 'closed' }
          });
        }
        // Check if ticket should receive warning
        else if (hoursSinceUpdate >= warningHours && hoursSinceUpdate < autoCloseHours) {
          // Check if we've already sent a warning (you might want to add a field to track this)
          const hoursRemaining = autoCloseHours - hoursSinceUpdate;
          
          console.log(`[Safeguards] Sending inactivity warning for ticket #${ticket.id} (${hoursRemaining.toFixed(1)}h remaining)`);
          
          if (ticket.discordId) {
            const warningEmbed = new EmbedBuilder()
              .setTitle('⚠️ Inactivity Warning')
              .setDescription(`This ticket has been inactive and will be automatically closed in approximately **${hoursRemaining.toFixed(1)} hours** if there is no activity.`)
              .addFields(
                { name: 'Ticket ID', value: `#${ticket.id}`, inline: true },
                { name: 'Time Remaining', value: `~${hoursRemaining.toFixed(1)} hours`, inline: true }
              )
              .setColor('#FAA61A')
              .setTimestamp()
              .setFooter({ text: 'Send a message to keep this ticket active.' });
            
            await safeSendMessage(client, ticket.discordId, { embeds: [warningEmbed] });
            
            // Create audit log for warning
            await storage.createTicketAuditLog({
              ticketId: ticket.id,
              action: 'inactivity_warning',
              performedBy: client.user?.id || 'system',
              performedByUsername: 'System',
              details: JSON.stringify({
                hoursRemaining: hoursRemaining.toFixed(1)
              }),
              serverId: ticket.serverId
            });
          }
        }
      }
    }
    
    console.log('[Safeguards] Auto-close check complete.');
  } catch (error) {
    console.error('[Safeguards] Error during auto-close check:', error);
  }
}

/**
 * Start all background jobs
 * @param client Discord client
 * @param storage Storage interface
 * @param broadcast Broadcast function for updates
 */
export function startBackgroundJobs(
  client: Client,
  storage: IStorage,
  broadcast: (data: any) => void
): void {
  console.log('[Safeguards] Starting background jobs...');
  
  // Channel reconciliation job
  setInterval(async () => {
    try {
      await reconcileTicketChannels(client, storage, broadcast);
    } catch (error) {
      console.error('[Safeguards] Channel reconciliation job failed:', error);
    }
  }, CHANNEL_CHECK_INTERVAL_MS);
  
  // Auto-close job
  setInterval(async () => {
    try {
      await autoCloseInactiveTickets(client, storage, broadcast);
    } catch (error) {
      console.error('[Safeguards] Auto-close job failed:', error);
    }
  }, AUTO_CLOSE_CHECK_INTERVAL_MS);
  
  // Run initial reconciliation after 30 seconds
  setTimeout(async () => {
    try {
      await reconcileTicketChannels(client, storage, broadcast);
    } catch (error) {
      console.error('[Safeguards] Initial channel reconciliation failed:', error);
    }
  }, 30000);
  
  // Run initial auto-close check after 60 seconds
  setTimeout(async () => {
    try {
      await autoCloseInactiveTickets(client, storage, broadcast);
    } catch (error) {
      console.error('[Safeguards] Initial auto-close check failed:', error);
    }
  }, 60000);
  
  console.log('[Safeguards] Background jobs started successfully.');
  console.log(`[Safeguards] - Channel reconciliation: every ${CHANNEL_CHECK_INTERVAL_MS / 60000} minutes`);
  console.log(`[Safeguards] - Auto-close check: every ${AUTO_CLOSE_CHECK_INTERVAL_MS / 60000} minutes`);
}

/**
 * Retry a Discord API operation with exponential backoff
 * @param operation Function to retry
 * @param maxRetries Maximum number of retries
 * @param baseDelay Base delay in milliseconds
 * @returns Result of the operation
 */
export async function retryDiscordOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on permanent errors
      if (error.code === 10003 || // Unknown channel
          error.code === 10008 || // Unknown message
          error.code === 50001 || // Missing access
          error.code === 50013) { // Missing permissions
        throw error;
      }
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`[Safeguards] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Operation failed after retries');
}
