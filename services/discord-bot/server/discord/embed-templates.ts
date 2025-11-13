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
