import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, User } from 'discord.js';

/**
 * Discord Embed Templates for Ticket Moderation
 * 
 * This file contains reusable embed builders for all ticket actions.
 * All embeds follow consistent formatting and branding with appropriate color coding.
 */

// Color scheme for different ticket actions
export const EMBED_COLORS = {
  CREATED: 0x5865F2,      // Discord blue - ticket created
  CLAIMED: 0x57F287,      // Green - ticket claimed
  ASSIGNED: 0x3BA55D,     // Dark green - ticket assigned
  PRIORITY_HIGH: 0xFEE75C, // Yellow - priority changed to high/urgent
  PRIORITY_NORMAL: 0x5865F2, // Blue - priority changed to normal
  TRANSFERRED: 0xEB459E,   // Pink - ticket transferred
  CLOSED: 0xED4245,       // Red - ticket closed
  REOPENED: 0xFEE75C,     // Yellow - ticket reopened
  ADMIN_NOTIFICATION: 0xFFD700, // Gold - admin notifications
  PLEX: 0xE5A00D,         // Plex orange
};

/**
 * Get priority emoji and display text
 */
export function getPriorityDisplay(priority: string): { emoji: string; text: string } {
  switch (priority) {
    case 'urgent':
      return { emoji: '🔴', text: 'Urgent' };
    case 'high':
      return { emoji: '🟠', text: 'High' };
    case 'normal':
    default:
      return { emoji: '🟢', text: 'Normal' };
  }
}

/**
 * Get status emoji and display text
 */
export function getStatusDisplay(status: string): { emoji: string; text: string } {
  switch (status) {
    case 'open':
      return { emoji: '✅', text: 'Open' };
    case 'in_progress':
      return { emoji: '🔄', text: 'In Progress' };
    case 'closed':
      return { emoji: '🔒', text: 'Closed' };
    default:
      return { emoji: '❓', text: 'Unknown' };
  }
}

/**
 * Create embed for ticket creation
 */
export function createTicketCreatedEmbed(ticket: any, category: any, creator: User | null): EmbedBuilder {
  const priority = getPriorityDisplay(ticket.priority);
  const status = getStatusDisplay(ticket.status);

  const embed = new EmbedBuilder()
    .setTitle(`🎫 New Ticket Created - #${ticket.id}`)
    .setDescription(`**${ticket.title}**\n\n${ticket.description}`)
    .addFields(
      { name: 'Created By', value: creator ? `<@${creator.id}>` : `<@${ticket.creatorId}>`, inline: true },
      { name: 'Category', value: category?.name || 'Unknown', inline: true },
      { name: 'Priority', value: `${priority.emoji} ${priority.text}`, inline: true },
      { name: 'Status', value: `${status.emoji} ${status.text}`, inline: true },
      { name: 'Ticket ID', value: `#${ticket.id}`, inline: true }
    )
    .setColor(EMBED_COLORS.CREATED)
    .setTimestamp()
    .setFooter({ text: 'Ticket System' });

  if (creator && creator.displayAvatarURL) {
    embed.setAuthor({
      name: creator.username,
      iconURL: creator.displayAvatarURL()
    });
  }

  return embed;
}

/**
 * Create embed for ticket claimed
 */
export function createTicketClaimedEmbed(ticket: any, claimer: User, admin: User | null): EmbedBuilder {
  const priority = getPriorityDisplay(ticket.priority);

  const embed = new EmbedBuilder()
    .setTitle(`👤 Ticket Claimed - #${ticket.id}`)
    .setDescription(`**${ticket.title}**\n\nThis ticket has been claimed and is now being handled.`)
    .addFields(
      { name: 'Claimed By', value: `<@${claimer.id}>`, inline: true },
      { name: 'Priority', value: `${priority.emoji} ${priority.text}`, inline: true },
      { name: 'Ticket ID', value: `#${ticket.id}`, inline: true }
    )
    .setColor(EMBED_COLORS.CLAIMED)
    .setTimestamp()
    .setFooter({ text: 'Ticket System' })
    .setAuthor({
      name: claimer.username,
      iconURL: claimer.displayAvatarURL()
    });

  return embed;
}

/**
 * Create embed for ticket assigned
 */
export function createTicketAssignedEmbed(ticket: any, assignee: User, assigner: User): EmbedBuilder {
  const priority = getPriorityDisplay(ticket.priority);

  const embed = new EmbedBuilder()
    .setTitle(`📋 Ticket Assigned - #${ticket.id}`)
    .setDescription(`**${ticket.title}**\n\nThis ticket has been assigned to a team member.`)
    .addFields(
      { name: 'Assigned To', value: `<@${assignee.id}>`, inline: true },
      { name: 'Assigned By', value: `<@${assigner.id}>`, inline: true },
      { name: 'Priority', value: `${priority.emoji} ${priority.text}`, inline: true },
      { name: 'Ticket ID', value: `#${ticket.id}`, inline: true }
    )
    .setColor(EMBED_COLORS.ASSIGNED)
    .setTimestamp()
    .setFooter({ text: 'Ticket System' })
    .setAuthor({
      name: assigner.username,
      iconURL: assigner.displayAvatarURL()
    });

  return embed;
}

/**
 * Create embed for ticket priority changed
 */
export function createTicketPriorityChangedEmbed(
  ticket: any, 
  oldPriority: string, 
  newPriority: string, 
  changedBy: User
): EmbedBuilder {
  const oldPriorityDisplay = getPriorityDisplay(oldPriority);
  const newPriorityDisplay = getPriorityDisplay(newPriority);

  const color = newPriority === 'urgent' || newPriority === 'high' 
    ? EMBED_COLORS.PRIORITY_HIGH 
    : EMBED_COLORS.PRIORITY_NORMAL;

  const embed = new EmbedBuilder()
    .setTitle(`⚠️ Ticket Priority Changed - #${ticket.id}`)
    .setDescription(`**${ticket.title}**\n\nThe priority of this ticket has been updated.`)
    .addFields(
      { name: 'Previous Priority', value: `${oldPriorityDisplay.emoji} ${oldPriorityDisplay.text}`, inline: true },
      { name: 'New Priority', value: `${newPriorityDisplay.emoji} ${newPriorityDisplay.text}`, inline: true },
      { name: 'Changed By', value: `<@${changedBy.id}>`, inline: true },
      { name: 'Ticket ID', value: `#${ticket.id}`, inline: true }
    )
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: 'Ticket System' })
    .setAuthor({
      name: changedBy.username,
      iconURL: changedBy.displayAvatarURL()
    });

  return embed;
}

/**
 * Create embed for ticket transferred
 */
export function createTicketTransferredEmbed(
  ticket: any, 
  fromUser: User | null, 
  toUser: User, 
  transferredBy: User
): EmbedBuilder {
  const priority = getPriorityDisplay(ticket.priority);

  const embed = new EmbedBuilder()
    .setTitle(`🔄 Ticket Transferred - #${ticket.id}`)
    .setDescription(`**${ticket.title}**\n\nThis ticket has been reassigned to a different team member.`)
    .addFields(
      { name: 'From', value: fromUser ? `<@${fromUser.id}>` : 'Unassigned', inline: true },
      { name: 'To', value: `<@${toUser.id}>`, inline: true },
      { name: 'Transferred By', value: `<@${transferredBy.id}>`, inline: true },
      { name: 'Priority', value: `${priority.emoji} ${priority.text}`, inline: true },
      { name: 'Ticket ID', value: `#${ticket.id}`, inline: true }
    )
    .setColor(EMBED_COLORS.TRANSFERRED)
    .setTimestamp()
    .setFooter({ text: 'Ticket System' })
    .setAuthor({
      name: transferredBy.username,
      iconURL: transferredBy.displayAvatarURL()
    });

  return embed;
}

/**
 * Create embed for ticket closed
 */
export function createTicketClosedEmbed(
  ticket: any, 
  closedBy: User, 
  resolution?: string
): EmbedBuilder {
  const priority = getPriorityDisplay(ticket.priority);

  const embed = new EmbedBuilder()
    .setTitle(`🔒 Ticket Closed - #${ticket.id}`)
    .setDescription(`**${ticket.title}**\n\nThis ticket has been closed.`)
    .addFields(
      { name: 'Closed By', value: `<@${closedBy.id}>`, inline: true },
      { name: 'Priority', value: `${priority.emoji} ${priority.text}`, inline: true },
      { name: 'Ticket ID', value: `#${ticket.id}`, inline: true }
    )
    .setColor(EMBED_COLORS.CLOSED)
    .setTimestamp()
    .setFooter({ text: 'Ticket System - Closed' })
    .setAuthor({
      name: closedBy.username,
      iconURL: closedBy.displayAvatarURL()
    });

  if (resolution) {
    embed.addFields({ name: 'Resolution', value: resolution, inline: false });
  }

  return embed;
}

/**
 * Create embed for ticket reopened
 */
export function createTicketReopenedEmbed(ticket: any, reopenedBy: User, reason?: string): EmbedBuilder {
  const priority = getPriorityDisplay(ticket.priority);

  const embed = new EmbedBuilder()
    .setTitle(`🔓 Ticket Reopened - #${ticket.id}`)
    .setDescription(`**${ticket.title}**\n\nThis ticket has been reopened and requires further attention.`)
    .addFields(
      { name: 'Reopened By', value: `<@${reopenedBy.id}>`, inline: true },
      { name: 'Priority', value: `${priority.emoji} ${priority.text}`, inline: true },
      { name: 'Ticket ID', value: `#${ticket.id}`, inline: true }
    )
    .setColor(EMBED_COLORS.REOPENED)
    .setTimestamp()
    .setFooter({ text: 'Ticket System - Reopened' })
    .setAuthor({
      name: reopenedBy.username,
      iconURL: reopenedBy.displayAvatarURL()
    });

  if (reason) {
    embed.addFields({ name: 'Reason', value: reason, inline: false });
  }

  return embed;
}

/**
 * Create action buttons for ticket management (Row 1: Primary Actions)
 */
export function createTicketActionButtons(ticketId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_assign_${ticketId}`)
        .setLabel('Assign')
        .setEmoji('📋')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`ticket_close_${ticketId}`)
        .setLabel('Close')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`ticket_pending_${ticketId}`)
        .setLabel('Pending')
        .setEmoji('⏳')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`ticket_ban_${ticketId}`)
        .setLabel('Ban User')
        .setEmoji('🔨')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`ticket_warn_${ticketId}`)
        .setLabel('Warn User')
        .setEmoji('⚠️')
        .setStyle(ButtonStyle.Danger)
    );
}

/**
 * Create action buttons for closed tickets
 */
export function createClosedTicketActionButtons(ticketId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`reopenTicket_${ticketId}`)
        .setLabel('Reopen Ticket')
        .setEmoji('🔓')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`viewTicket_${ticketId}`)
        .setLabel('View Details')
        .setEmoji('👁️')
        .setStyle(ButtonStyle.Secondary)
    );
}

/**
 * Create admin notification embed for any ticket action
 */
export function createAdminNotificationEmbed(
  action: 'created' | 'claimed' | 'assigned' | 'priority_changed' | 'transferred' | 'closed' | 'reopened',
  ticket: any,
  category: any,
  actor: User,
  additionalInfo?: { [key: string]: string }
): EmbedBuilder {
  const priority = getPriorityDisplay(ticket.priority);
  const status = getStatusDisplay(ticket.status);

  let title = '';
  let description = '';
  let color = EMBED_COLORS.ADMIN_NOTIFICATION;

  switch (action) {
    case 'created':
      title = `🎫 New Ticket Created - #${ticket.id}`;
      description = `**${ticket.title}**\n\n${ticket.description}`;
      color = EMBED_COLORS.CREATED;
      break;
    case 'claimed':
      title = `👤 Ticket Claimed - #${ticket.id}`;
      description = `**${ticket.title}**\n\n<@${actor.id}> has claimed this ticket.`;
      color = EMBED_COLORS.CLAIMED;
      break;
    case 'assigned':
      title = `📋 Ticket Assigned - #${ticket.id}`;
      description = `**${ticket.title}**\n\nAssigned to ${additionalInfo?.assignee || 'someone'} by <@${actor.id}>`;
      color = EMBED_COLORS.ASSIGNED;
      break;
    case 'priority_changed':
      title = `⚠️ Ticket Priority Changed - #${ticket.id}`;
      description = `**${ticket.title}**\n\nPriority updated by <@${actor.id}>`;
      color = ticket.priority === 'urgent' || ticket.priority === 'high' 
        ? EMBED_COLORS.PRIORITY_HIGH 
        : EMBED_COLORS.PRIORITY_NORMAL;
      break;
    case 'transferred':
      title = `🔄 Ticket Transferred - #${ticket.id}`;
      description = `**${ticket.title}**\n\nTransferred by <@${actor.id}>`;
      color = EMBED_COLORS.TRANSFERRED;
      break;
    case 'closed':
      title = `🔒 Ticket Closed - #${ticket.id}`;
      description = `**${ticket.title}**\n\nClosed by <@${actor.id}>`;
      color = EMBED_COLORS.CLOSED;
      break;
    case 'reopened':
      title = `🔓 Ticket Reopened - #${ticket.id}`;
      description = `**${ticket.title}**\n\nReopened by <@${actor.id}>`;
      color = EMBED_COLORS.REOPENED;
      break;
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .addFields(
      { name: 'Category', value: category?.name || 'Unknown', inline: true },
      { name: 'Priority', value: `${priority.emoji} ${priority.text}`, inline: true },
      { name: 'Status', value: `${status.emoji} ${status.text}`, inline: true },
      { name: 'Ticket ID', value: `#${ticket.id}`, inline: true }
    )
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: 'Admin Notification' })
    .setAuthor({
      name: actor.username,
      iconURL: actor.displayAvatarURL()
    });

  // Add any additional info fields
  if (additionalInfo) {
    Object.entries(additionalInfo).forEach(([key, value]) => {
      if (key !== 'assignee') { // Already handled in description
        embed.addFields({ name: key, value: value, inline: true });
      }
    });
  }

  return embed;
}

/**
 * Create Plex invite embed for sending invitations to friends
 */
export function createPlexInviteEmbed(
  inviterUsername: string,
  recipientMention?: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("🎬 You've Been Invited to Evin's Plex Server!")
    .setDescription(
      recipientMention 
        ? `${recipientMention}, you've been invited to join **Evin's Plex Server**!\n\nGet ready for unlimited movies, TV shows, and more - all streaming in high quality.`
        : `You've been invited to join **Evin's Plex Server**!\n\nGet ready for unlimited movies, TV shows, and more - all streaming in high quality.`
    )
    .addFields(
      { 
        name: '🌐 Server URL', 
        value: '[plex.evindrake.net](https://plex.evindrake.net)', 
        inline: true 
      },
      { 
        name: '👤 Invited By', 
        value: inviterUsername, 
        inline: true 
      },
      { 
        name: '\u200B', 
        value: '\u200B', 
        inline: true 
      },
      { 
        name: '📋 How to Join', 
        value: [
          '**1.** Create a free [Plex account](https://www.plex.tv/sign-up/)',
          '**2.** Let the inviter know your Plex username/email',
          '**3.** Accept the server invite in your Plex app',
          '**4.** Start streaming!'
        ].join('\n'),
        inline: false 
      },
      {
        name: '📱 Get the App',
        value: 'Download Plex on [iOS](https://apps.apple.com/app/plex/id383457673) • [Android](https://play.google.com/store/apps/details?id=com.plexapp.android) • [Smart TV](https://www.plex.tv/apps-devices/) • [Web](https://app.plex.tv)',
        inline: false
      }
    )
    .setColor(EMBED_COLORS.PLEX)
    .setThumbnail('https://www.plex.tv/wp-content/uploads/2018/01/pmp-icon-1.png')
    .setFooter({ text: 'Evin\'s Plex Server • Powered by Plex Media Server' })
    .setTimestamp();

  return embed;
}

/**
 * Create action button for Plex invite
 */
export function createPlexInviteButton(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setLabel('Open Plex')
        .setEmoji('🎬')
        .setStyle(ButtonStyle.Link)
        .setURL('https://plex.evindrake.net'),
      new ButtonBuilder()
        .setLabel('Create Plex Account')
        .setEmoji('👤')
        .setStyle(ButtonStyle.Link)
        .setURL('https://www.plex.tv/sign-up/')
    );
}

/**
 * Bot Manual / Help System Embeds
 */

// Help embed colors
export const HELP_COLORS = {
  MAIN: 0x5865F2,      // Discord blurple - main help
  TICKETS: 0x43B581,   // Green - ticket system
  STREAMS: 0x9146FF,   // Twitch purple - stream features
  PLEX: 0xE5A00D,      // Plex orange
  ADMIN: 0xF04747,     // Red - admin commands
  INFO: 0x3498DB,      // Blue - info/utility
};

/**
 * Create the main help menu embed
 */
export function createMainHelpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('📖 Rig City Bot - Help & Commands')
    .setDescription(
      'Welcome to the Rig City Bot! I help manage tickets, stream notifications, and server utilities.\n\n' +
      'Use the buttons below to explore different feature categories, or type any command to get started.'
    )
    .addFields(
      {
        name: '🎫 Ticket System',
        value: 'Create and manage support tickets with priority levels, categories, and staff assignment.',
        inline: true
      },
      {
        name: '📺 Stream Notifications',
        value: 'Get notified when tracked members go live on Twitch, YouTube, or Kick.',
        inline: true
      },
      {
        name: '🎬 Plex Server',
        value: 'Access Evin\'s personal Plex media server with movies, TV shows, and more.',
        inline: true
      },
      {
        name: '📋 Custom Panels',
        value: 'Create and send custom embed panels for rules, info, and announcements.',
        inline: true
      },
      {
        name: '🛠️ Utilities & Admin',
        value: 'Bot status, health checks, permissions, and server configuration tools.',
        inline: true
      }
    )
    .setColor(HELP_COLORS.MAIN)
    .setThumbnail('https://cdn.discordapp.com/icons/692850100795473920/a_1234567890abcdef.gif')
    .setFooter({ text: 'Rig City Bot • Use /help <category> for detailed info' })
    .setTimestamp();
}

/**
 * Create ticket help embed
 */
export function createTicketHelpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('🎫 Ticket System Commands')
    .setDescription(
      'The ticket system allows you to create support requests that staff can track and respond to.\n\n' +
      '**How it works:**\n' +
      '1. Create a ticket using `/ticket create` or a ticket panel button\n' +
      '2. Staff will be notified and can claim your ticket\n' +
      '3. Communicate through the ticket until resolved\n' +
      '4. Close the ticket when your issue is solved'
    )
    .addFields(
      {
        name: '`/ticket create`',
        value: '**Create a new ticket**\n• `title` - Brief summary of your issue\n• `description` - Detailed explanation\n• `category` - Type of issue (General, Bug, Feature, Account)\n• `urgent` - Mark as urgent if critical',
        inline: false
      },
      {
        name: '`/ticket list`',
        value: '**View your open tickets**\nSee all tickets you\'ve created and their current status.',
        inline: true
      },
      {
        name: '`/ticket view <id>`',
        value: '**View ticket details**\nSee full info and recent messages for a specific ticket.',
        inline: true
      },
      {
        name: '`/ticket close <id>`',
        value: '**Close a ticket**\nMark a ticket as resolved. Staff can also close tickets.',
        inline: true
      },
      {
        name: '📊 Ticket Priorities',
        value: '🟢 **Normal** - Standard response time\n🟠 **High** - Faster response\n🔴 **Urgent** - Immediate attention needed',
        inline: false
      },
      {
        name: '⚠️ Rate Limits',
        value: 'You can create up to **5 tickets per hour** to prevent spam.',
        inline: false
      }
    )
    .setColor(HELP_COLORS.TICKETS)
    .setFooter({ text: 'Ticket System • Need help? Create a ticket!' })
    .setTimestamp();
}

/**
 * Create stream notifications help embed
 */
export function createStreamHelpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('📺 Stream Notification Commands')
    .setDescription(
      'Get notified when your favorite streamers go live! The bot detects Discord streaming activities and can track specific users.\n\n' +
      '**Supported Platforms:** Twitch, YouTube, Kick'
    )
    .addFields(
      {
        name: '`/stream-setup`',
        value: '**Configure notifications** *(Admin)*\n• `channel` - Where to post notifications\n• `message` - Custom announcement text\n• `enabled` - Turn on/off notifications',
        inline: false
      },
      {
        name: '`/stream-track <user>`',
        value: '**Add a user to tracking** *(Admin)*\nTrack a Discord member for go-live notifications.',
        inline: true
      },
      {
        name: '`/stream-untrack <user>`',
        value: '**Remove from tracking** *(Admin)*\nStop notifications for a specific user.',
        inline: true
      },
      {
        name: '`/stream-list`',
        value: '**View tracked users** *(Admin)*\nSee all users being monitored and current settings.',
        inline: true
      },
      {
        name: '`/stream-scan`',
        value: '**Scan for streamers** *(Admin)*\nManually scan server members for connected streaming accounts.',
        inline: true
      },
      {
        name: '📝 Message Tokens',
        value: 'Use these in custom messages:\n• `{user}` - Streamer\'s name\n• `{game}` - Game being played\n• `{platform}` - Streaming platform',
        inline: false
      }
    )
    .setColor(HELP_COLORS.STREAMS)
    .setFooter({ text: 'Stream Notifications • Never miss a stream!' })
    .setTimestamp();
}

/**
 * Create Plex help embed
 */
export function createPlexHelpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('🎬 Plex Server Commands')
    .setDescription(
      'Access Evin\'s Plex media server with thousands of movies, TV shows, and more!\n\n' +
      '**Server URL:** [plex.evindrake.net](https://plex.evindrake.net)\n\n' +
      '**Free Access:** Thanks to Evin\'s Plex Pass, all invited users can stream for free on any device - no subscription required!'
    )
    .addFields(
      {
        name: '`/plex invite [user]`',
        value: '**Send an invite**\nShare the Plex server invite with a user or the channel.\n• `user` - (Optional) Mention a specific person',
        inline: false
      },
      {
        name: '`/plex request <title> [type]`',
        value: '**Request media**\nRequest a movie or TV show to be added.\n• `title` - Name of the movie/show\n• `type` - movie or show (default: movie)',
        inline: false
      },
      {
        name: '`/plex requests list`',
        value: '**View pending requests** *(Admin)*\nSee all pending media requests waiting for approval.',
        inline: true
      },
      {
        name: '`/plex requests approve <id>`',
        value: '**Approve a request** *(Admin)*\nApprove a pending media request.',
        inline: true
      },
      {
        name: '`/plex requests deny <id> [reason]`',
        value: '**Deny a request** *(Admin)*\nDeny a pending media request with optional reason.',
        inline: true
      },
      {
        name: '`/plex requests downloaded <id>`',
        value: '**Mark as downloaded** *(Admin)*\nMark when media has been added to Plex.',
        inline: true
      },
      {
        name: '`/plex requests all [status]`',
        value: '**View all requests** *(Admin)*\nView requests with optional status filter.',
        inline: true
      },
      {
        name: '`/plex setup [channel] [role]`',
        value: '**Configure settings** *(Admin)*\nSet notification channel and admin role.',
        inline: true
      },
      {
        name: '📱 Supported Devices',
        value: '• iOS & Android phones/tablets\n• Smart TVs (Samsung, LG, etc.)\n• Streaming devices (Roku, Fire TV, Apple TV)\n• Web browser at app.plex.tv\n• Gaming consoles (PlayStation, Xbox)',
        inline: true
      },
      {
        name: '🚀 Getting Started',
        value: '1. Create a free Plex account\n2. Tell Evin your Plex username\n3. Accept the server invite\n4. Download the Plex app\n5. Start streaming!',
        inline: true
      }
    )
    .setColor(HELP_COLORS.PLEX)
    .setThumbnail('https://www.plex.tv/wp-content/uploads/2018/01/pmp-icon-1.png')
    .setFooter({ text: 'Plex Server • Unlimited streaming for friends!' })
    .setTimestamp();
}

/**
 * Create panels help embed
 */
export function createPanelsHelpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('📋 Panel Commands')
    .setDescription(
      'Create and send custom embed panels for announcements, rules, information, and interactive buttons.\n\n' +
      'Panels are designed in the web dashboard and can be sent to any channel.'
    )
    .addFields(
      {
        name: '`/panels list`',
        value: '**View available templates** *(Manage Channels)*\nSee all panel templates created for this server.',
        inline: true
      },
      {
        name: '`/panels send <template>`',
        value: '**Send a panel** *(Manage Channels)*\nPost a panel template to the current channel.',
        inline: true
      },
      {
        name: '`/setup-ticket-panel`',
        value: '**Create ticket panel** *(Admin)*\nSet up an interactive ticket creation panel with category buttons.',
        inline: false
      },
      {
        name: '💡 Tips',
        value: '• Create panels in the web dashboard for full customization\n• Panels can have up to 25 buttons\n• Use link buttons for external URLs\n• Ticket panels auto-create support tickets when clicked',
        inline: false
      }
    )
    .setColor(HELP_COLORS.INFO)
    .setFooter({ text: 'Panels • Create beautiful embeds easily!' })
    .setTimestamp();
}

/**
 * Create admin/utility help embed
 */
export function createAdminHelpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('🛠️ Utility & Admin Commands')
    .setDescription(
      'Bot status, health checks, and server configuration commands.'
    )
    .addFields(
      {
        name: '`/ping`',
        value: '**Check bot latency**\nView response time and API latency.',
        inline: true
      },
      {
        name: '`/heartbeat`',
        value: '**Bot health check**\nDetailed status including uptime and memory usage.',
        inline: true
      },
      {
        name: '`/help [category]`',
        value: '**Show help menu**\nView this help menu or get info on a specific category.',
        inline: true
      },
      {
        name: '🔐 Permission Levels',
        value: '• **Everyone** - `/ticket`, `/plex`, `/ping`, `/help`\n• **Manage Channels** - `/panels`\n• **Manage Server** - `/stream-scan`\n• **Administrator** - `/stream-setup`, `/stream-track`, `/setup-ticket-panel`',
        inline: false
      },
      {
        name: '🌐 Web Dashboard',
        value: 'For advanced configuration, visit the web dashboard at:\n**bot.evindrake.net**',
        inline: false
      }
    )
    .setColor(HELP_COLORS.ADMIN)
    .setFooter({ text: 'Admin Tools • Keep the server running smoothly!' })
    .setTimestamp();
}

/**
 * Create help navigation buttons
 */
export function createHelpNavigationButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('help_tickets')
        .setLabel('Tickets')
        .setEmoji('🎫')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('help_streams')
        .setLabel('Streams')
        .setEmoji('📺')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('help_plex')
        .setLabel('Plex')
        .setEmoji('🎬')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('help_panels')
        .setLabel('Panels')
        .setEmoji('📋')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('help_admin')
        .setLabel('Admin')
        .setEmoji('🛠️')
        .setStyle(ButtonStyle.Secondary)
    );
}

/**
 * Create back to main help button
 */
export function createHelpBackButton(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('help_main')
        .setLabel('Back to Main Menu')
        .setEmoji('🏠')
        .setStyle(ButtonStyle.Secondary)
    );
}

/**
 * Media Request Embeds
 */

export interface MediaRequestData {
  id: number;
  title: string;
  mediaType: string;
  status: string;
  username: string;
  userId: string;
  reason?: string | null;
  year?: string | null;
  posterUrl?: string | null;
  approvedBy?: string | null;
  approvedByUsername?: string | null;
  approvedAt?: Date | null;
  createdAt?: Date | null;
}

export function createMediaRequestEmbed(request: MediaRequestData): EmbedBuilder {
  const typeEmoji = request.mediaType === 'show' ? '📺' : '🎬';
  const statusDisplay = {
    pending: { emoji: '⏳', text: 'Pending', color: '#FFA500' as const },
    approved: { emoji: '✅', text: 'Approved', color: '#43B581' as const },
    denied: { emoji: '❌', text: 'Denied', color: '#F04747' as const },
    downloaded: { emoji: '📥', text: 'Downloaded', color: '#5865F2' as const }
  };

  const status = statusDisplay[request.status as keyof typeof statusDisplay] || statusDisplay.pending;

  const embed = new EmbedBuilder()
    .setTitle(`${typeEmoji} Media Request #${request.id}`)
    .setDescription(`**${request.title}**${request.year ? ` (${request.year})` : ''}`)
    .addFields(
      { name: 'Type', value: request.mediaType === 'show' ? 'TV Show' : 'Movie', inline: true },
      { name: 'Status', value: `${status.emoji} ${status.text}`, inline: true },
      { name: 'Requested By', value: `<@${request.userId}>`, inline: true }
    )
    .setColor(status.color)
    .setTimestamp(request.createdAt || new Date());

  if (request.approvedByUsername && request.status !== 'pending') {
    const actionLabel = request.status === 'approved' ? 'Approved By' 
      : request.status === 'downloaded' ? 'Added to Plex By' 
      : 'Denied By';
    embed.addFields({
      name: actionLabel,
      value: request.approvedByUsername,
      inline: true
    });
  }

  if (request.reason && request.status === 'denied') {
    embed.addFields({ name: 'Reason', value: request.reason, inline: false });
  }

  if (request.posterUrl) {
    embed.setThumbnail(request.posterUrl);
  }

  embed.setFooter({ text: 'Plex Media Request System' });

  return embed;
}

export function createMediaRequestNotificationEmbed(
  request: MediaRequestData,
  action: 'new' | 'approved' | 'denied' | 'downloaded'
): EmbedBuilder {
  const typeEmoji = request.mediaType === 'show' ? '📺' : '🎬';
  
  let title: string;
  let color: string;
  let description: string;

  switch (action) {
    case 'new':
      title = '🆕 New Media Request';
      color = '#FFA500';
      description = `**${request.username}** has requested a new ${request.mediaType === 'show' ? 'TV show' : 'movie'}`;
      break;
    case 'approved':
      title = '✅ Media Request Approved';
      color = '#43B581';
      description = `Request #${request.id} has been approved${request.approvedByUsername ? ` by **${request.approvedByUsername}**` : ''}`;
      break;
    case 'denied':
      title = '❌ Media Request Denied';
      color = '#F04747';
      description = `Request #${request.id} has been denied${request.approvedByUsername ? ` by **${request.approvedByUsername}**` : ''}`;
      break;
    case 'downloaded':
      title = '📥 Media Added to Plex!';
      color = '#E5A00D';
      description = `Your request has been fulfilled! **${request.title}** is now available on Plex.`;
      break;
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .addFields(
      { name: `${typeEmoji} Title`, value: `**${request.title}**${request.year ? ` (${request.year})` : ''}`, inline: false },
      { name: 'Type', value: request.mediaType === 'show' ? 'TV Show' : 'Movie', inline: true },
      { name: 'Request ID', value: `#${request.id}`, inline: true },
      { name: 'Requested By', value: `<@${request.userId}>`, inline: true }
    )
    .setColor(color)
    .setTimestamp();

  if (request.reason && action === 'denied') {
    embed.addFields({ name: 'Reason', value: request.reason, inline: false });
  }

  if (request.posterUrl) {
    embed.setThumbnail(request.posterUrl);
  }

  embed.setFooter({ text: 'Plex Media Request System' });

  return embed;
}

export function createMediaRequestListEmbed(
  requests: MediaRequestData[],
  status: 'pending' | 'approved' | 'denied' | 'downloaded' | 'all',
  serverName?: string
): EmbedBuilder {
  const titleMap: Record<string, string> = {
    pending: '⏳ Pending Media Requests',
    approved: '✅ Approved Media Requests',
    denied: '❌ Denied Media Requests',
    downloaded: '📥 Downloaded Media Requests',
    all: '📋 All Media Requests'
  };
  const title = titleMap[status] || '📋 Media Requests';

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(EMBED_COLORS.PLEX)
    .setTimestamp()
    .setFooter({ text: 'Plex Media Request System' });

  if (requests.length === 0) {
    const emptyMap: Record<string, string> = {
      pending: '*No pending requests at this time.*',
      approved: '*No approved requests found.*',
      denied: '*No denied requests found.*',
      downloaded: '*No downloaded requests found.*',
      all: '*No media requests found.*'
    };
    embed.setDescription(emptyMap[status] || '*No media requests found.*');
    return embed;
  }

  const requestLines = requests.slice(0, 15).map(r => {
    const typeEmoji = r.mediaType === 'show' ? '📺' : '🎬';
    const statusEmoji = r.status === 'pending' ? '⏳' 
      : r.status === 'approved' ? '✅'
      : r.status === 'denied' ? '❌'
      : '📥';
    return `${statusEmoji} **#${r.id}** ${typeEmoji} ${r.title}${r.year ? ` (${r.year})` : ''} - <@${r.userId}>`;
  });

  embed.setDescription(requestLines.join('\n'));

  if (requests.length > 15) {
    embed.addFields({
      name: 'Note',
      value: `Showing 15 of ${requests.length} requests. Use the web dashboard for full list.`,
      inline: false
    });
  }

  return embed;
}

export function createMediaRequestActionButtons(requestId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`plex_approve_${requestId}`)
        .setLabel('Approve')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`plex_deny_${requestId}`)
        .setLabel('Deny')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    );
}
