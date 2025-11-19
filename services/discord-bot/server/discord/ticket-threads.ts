import type { Client, Guild, TextChannel, User as DiscordUser } from 'discord.js';
import type { IStorage } from '../storage.js';
import type { Ticket, TicketCategory } from '../../shared/schema.js';
import { getTicketChannelManager } from './bot.js';

interface CreateTicketThreadOptions {
  storage: IStorage;
  client: Client;
  ticket: Ticket;
  category: TicketCategory | null;
  serverId: string;
  creatorDiscordId: string;
  creatorUsername: string;
  channelToTicketMap: Map<string, number>;
}

/**
 * Creates a Discord thread for a ticket with comprehensive embed and action buttons.
 * 
 * ENHANCED STRATEGY (TicketChannelManager):
 * 1. Try to use TicketChannelManager for organized category-based channels
 * 2. Falls back to admin notification channel if manager not available
 * 3. Ensures every ticket gets a Discord thread
 * 
 * TicketChannelManager provides:
 * - Dedicated "Active Tickets" category
 * - Separate channels per ticket type (#general-support, #bug-reports, etc.)
 * - Automatic archiving to "Ticket Archive" category on close
 */
export async function createTicketThread(options: CreateTicketThreadOptions): Promise<string | null> {
  const { storage, client, ticket, category, serverId, creatorDiscordId, creatorUsername, channelToTicketMap } = options;
  
  try {
    const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');
    
    // Get guild
    const guild = client.guilds.cache.get(serverId);
    if (!guild) {
      console.log(`[Ticket Thread] Guild ${serverId} not found`);
      return null;
    }
    
    // STRATEGY 1: Try to use TicketChannelManager for organized ticket channels
    const ticketChannelManager = getTicketChannelManager();
    if (ticketChannelManager) {
      console.log(`[Ticket Thread] Using TicketChannelManager for ticket #${ticket.id}`);
      
      try {
        const threadId = await ticketChannelManager.createTicketThread(
          ticket,
          category,
          creatorDiscordId,
          creatorUsername
        );
        
        if (threadId) {
          // Update the channel-to-ticket map
          channelToTicketMap.set(threadId, ticket.id);
          console.log(`[Ticket Thread] ✅ TicketChannelManager created thread ${threadId} for ticket #${ticket.id}`);
          
          // The TicketChannelManager handles thread creation completely,
          // but we still need to add the embed and buttons to the thread
          const ticketThread = await client.channels.fetch(threadId);
          if (ticketThread && ticketThread.isThread()) {
            await addTicketEmbedAndButtons(ticketThread as any, ticket, category, creatorDiscordId);
          }
          
          return threadId;
        }
        
        console.log(`[Ticket Thread] TicketChannelManager failed to create thread, falling back to admin channel`);
      } catch (error) {
        console.error(`[Ticket Thread] Error using TicketChannelManager:`, error);
        console.log(`[Ticket Thread] Falling back to admin notification channel`);
      }
    } else {
      console.log(`[Ticket Thread] TicketChannelManager not available, using fallback admin channel`);
    }
    
    // STRATEGY 2: Fallback to admin notification channel
    let targetChannel: TextChannel | null = null;
    
    const settings = await storage.getBotSettings(serverId);
    if (settings?.adminChannelId) {
      const channel = guild.channels.cache.get(settings.adminChannelId);
      if (channel && channel.isTextBased() && 'threads' in channel) {
        targetChannel = channel as TextChannel;
        console.log(`[Ticket Thread] Using fallback admin notification channel: ${channel.name}`);
      }
    }
    
    // Abort if no valid channel found
    if (!targetChannel) {
      console.log(`[Ticket Thread] ❌ No valid channel available for ticket #${ticket.id} - skipping thread creation`);
      return null;
    }
    
    // Create the thread
    const ticketThread = await targetChannel.threads.create({
      name: `🎫 Ticket #${ticket.id}: ${ticket.title.substring(0, 80)}`,
      autoArchiveDuration: 10080, // 7 days
      reason: `Support ticket created by ${creatorUsername}`
    });
    
    const threadId = ticketThread.id;
    console.log(`[Ticket Thread] ✅ Created fallback thread ${threadId} for ticket #${ticket.id}`);
    
    // Add embed and buttons to the thread
    await addTicketEmbedAndButtons(ticketThread, ticket, category, creatorDiscordId);
    
    // Update ticket with thread ID
    await storage.updateTicket(ticket.id, { discordId: threadId });
    
    // Update channelToTicketMap for message sync
    channelToTicketMap.set(threadId, ticket.id);
    
    console.log(`[Ticket Thread] ✅ Thread created successfully with comprehensive embed and action buttons`);
    
    return threadId;
  } catch (error) {
    console.error('[Ticket Thread] Failed to create thread for ticket:', error);
    return null;
  }
}

/**
 * Helper function to add comprehensive embed and action buttons to a ticket thread
 * This is used by both TicketChannelManager and fallback paths
 */
async function addTicketEmbedAndButtons(
  ticketThread: any,
  ticket: Ticket,
  category: TicketCategory | null,
  creatorDiscordId: string
): Promise<void> {
  const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');
  
  const categoryName = category ? category.name : 'Unknown Category';
  const categoryEmoji = category?.emoji || '🎫';
  const baseUrl = process.env.APP_URL || `https://${process.env.REPLIT_DOMAINS}`;
  
  // Get priority display
  const getPriorityDisplay = (priority: string) => {
    switch (priority) {
      case 'urgent': return '🔴 Urgent';
      case 'high': return '🟠 High';
      case 'normal': return '🟢 Normal';
      case 'low': return '🔵 Low';
      default: return '🟢 Normal';
    }
  };
  
  const ticketEmbed = new EmbedBuilder()
    .setTitle(`🎫 Ticket #${ticket.id}`)
    .setDescription(`**${ticket.title}**\n\n${ticket.description}`)
    .addFields(
      { name: 'Created By', value: `<@${creatorDiscordId}>`, inline: true },
      { name: 'Status', value: '✅ Open', inline: true },
      { name: 'Priority', value: getPriorityDisplay(ticket.priority || 'normal'), inline: true },
      { name: 'Category', value: `${categoryEmoji} ${categoryName}`, inline: true },
      { name: 'Created', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
    )
    .setColor(ticket.priority === 'urgent' ? '#ED4245' : '#5865F2')
    .setFooter({ text: 'Support Team • Reply in this thread for assistance' })
    .setTimestamp();
  
  // Create action buttons for staff (Assign, Close, Pending, Ban, Warn)
  const staffActions = new ActionRowBuilder<any>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_assign_${ticket.id}`)
        .setLabel('Assign to Me')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✋'),
      new ButtonBuilder()
        .setCustomId(`ticket_close_${ticket.id}`)
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔒'),
      new ButtonBuilder()
        .setCustomId(`ticket_pending_${ticket.id}`)
        .setLabel('Mark Pending')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⏸️'),
      new ButtonBuilder()
        .setCustomId(`ticket_ban_${ticket.id}`)
        .setLabel('Ban User')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔨')
    );
  
  const staffActions2 = new ActionRowBuilder<any>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_warn_${ticket.id}`)
        .setLabel('Warn User')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⚠️'),
      new ButtonBuilder()
        .setLabel('View Dashboard')
        .setStyle(ButtonStyle.Link)
        .setURL(`${baseUrl}?ticket=${ticket.id}`)
        .setEmoji('🔗')
    );
  
  // Post the ticket embed in the thread
  await ticketThread.send({
    content: `<@${creatorDiscordId}> Your ticket has been created! Our support team has been notified and will assist you shortly.`,
    embeds: [ticketEmbed],
    components: [staffActions, staffActions2]
  });
  
  console.log(`[Ticket Thread] ✅ Added comprehensive embed and action buttons to thread`);
}
