import type { Client, Guild, TextChannel, User as DiscordUser } from 'discord.js';
import type { IStorage } from '../storage.js';
import type { Ticket, TicketCategory } from '../../shared/schema.js';

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
 * HYBRID CHANNEL SELECTION:
 * 1. Tries to find a panel matching the ticket's category
 * 2. Creates thread in panel's channel if found
 * 3. Falls back to admin notification channel if not found
 * 4. Ensures every ticket gets a Discord thread
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
    
    // Use admin notification channel for dashboard-created tickets
    // (Panel-created tickets will use interaction.channel and won't call this function)
    let targetChannel: TextChannel | null = null;
    
    const settings = await storage.getBotSettings(serverId);
    if (settings?.adminChannelId) {
      const channel = guild.channels.cache.get(settings.adminChannelId);
      if (channel && channel.isTextBased() && 'threads' in channel) {
        targetChannel = channel as TextChannel;
        console.log(`[Ticket Thread] Using admin notification channel: ${channel.name}`);
      }
    }
    
    // Abort if no valid channel found
    if (!targetChannel) {
      console.log(`[Ticket Thread] ❌ Admin notification channel not configured for ticket #${ticket.id} - skipping thread creation`);
      return null;
    }
    
    // Create the thread
    const ticketThread = await targetChannel.threads.create({
      name: `🎫 Ticket #${ticket.id}: ${ticket.title.substring(0, 80)}`,
      autoArchiveDuration: 10080, // 7 days
      reason: `Support ticket created by ${creatorUsername}`
    });
    
    const threadId = ticketThread.id;
    console.log(`[Ticket Thread] ✅ Created thread ${threadId} for ticket #${ticket.id}`);
    
    // Add the ticket creator to the thread
    try {
      await ticketThread.members.add(creatorDiscordId);
    } catch (err) {
      console.log(`[Ticket Thread] Creator already in thread or permission issue`);
    }
    
    // Add support and staff roles to the thread
    try {
      const settings = await storage.getBotSettings(serverId);
      
      if (settings) {
        const rolesToAdd = [];
        
        // Collect role IDs to add
        if (settings.supportRoleId) {
          rolesToAdd.push(settings.supportRoleId);
        }
        if (settings.adminRoleId) {
          rolesToAdd.push(settings.adminRoleId);
        }
        
        // Add members from each role to the thread
        for (const roleId of rolesToAdd) {
          const role = guild.roles.cache.get(roleId);
          if (role) {
            // Get members with this role
            const membersWithRole = role.members;
            console.log(`[Ticket Thread] Adding ${membersWithRole.size} members from role ${role.name} to thread`);
            
            // Add each member to the thread
            for (const [memberId, member] of membersWithRole) {
              try {
                await ticketThread.members.add(memberId);
              } catch (memberErr) {
                console.log(`[Ticket Thread] Could not add member ${member.user.username} to thread:`, memberErr instanceof Error ? memberErr.message : 'Unknown error');
              }
            }
          }
        }
        console.log(`[Ticket Thread] ✅ Added support/staff members to thread`);
      }
    } catch (roleErr) {
      console.error(`[Ticket Thread] Failed to add support/staff roles:`, roleErr);
      // Continue even if role addition fails
    }
    
    // Create comprehensive ticket embed for the thread
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
