import { 
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  ChatInputCommandInteraction,
  Client, 
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Collection,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  User
} from 'discord.js';
import { IStorage } from '../storage';
import { InsertTicket, InsertTicketMessage, PanelTemplate, PanelTemplateField, PanelTemplateButton } from '@shared/schema';
import { getDiscordClient } from './bot';
import { 
  checkTicketRateLimit, 
  recordTicketCreation, 
  validateTicketCategory,
  validateBotSettings,
  retryDiscordOperation,
  safeSendMessage
} from './ticket-safeguards';
import {
  createAdminNotificationEmbed,
  createTicketActionButtons,
  createClosedTicketActionButtons,
  createPlexInviteEmbed,
  createPlexInviteButton,
  createMainHelpEmbed,
  createTicketHelpEmbed,
  createStreamHelpEmbed,
  createPlexHelpEmbed,
  createPanelsHelpEmbed,
  createAdminHelpEmbed,
  createHelpNavigationButtons,
  createHelpBackButton
} from './embed-templates';

// Extended PanelTemplate type with fields and buttons
interface PanelTemplateWithRelations extends PanelTemplate {
  fields?: PanelTemplateField[];
  buttons?: PanelTemplateButton[];
}

// Helper function to convert string button style to Discord.js ButtonStyle enum
function getButtonStyle(style: string | null | undefined): ButtonStyle {
  switch (style?.toLowerCase()) {
    case 'primary':
      return ButtonStyle.Primary;
    case 'secondary':
      return ButtonStyle.Secondary;
    case 'success':
      return ButtonStyle.Success;
    case 'danger':
      return ButtonStyle.Danger;
    case 'link':
      return ButtonStyle.Link;
    default:
      return ButtonStyle.Primary;
  }
}

// Command execution context
interface CommandContext {
  storage: IStorage;
  broadcast: (data: any) => void;
}

// Command interface
interface Command {
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction, context: CommandContext) => Promise<void>;
}

// Create a collection to store commands
export const commands = new Collection<string, Command>();

/**
 * Enhanced Helper function to send ticket notification to admin channel
 * Supports all ticket action types with color coding and user avatars
 */
export async function sendTicketNotificationToAdminChannel(
  guildId: string,
  guild: any,
  storage: IStorage, 
  ticket: any, 
  category: any,
  action: 'created' | 'claimed' | 'assigned' | 'priority_changed' | 'transferred' | 'closed' | 'reopened',
  actor: User,
  additionalInfo?: { [key: string]: string }
): Promise<void> {
  try {
    // Get bot settings for the server
    const botSettings = await storage.getBotSettings(guildId);
    if (!botSettings?.adminChannelId || !botSettings.sendCopyToAdminChannel) {
      console.log('[Discord] Admin channel not configured or notifications disabled');
      return;
    }
    
    // Get the admin channel
    const adminChannel = guild?.channels.cache.get(botSettings.adminChannelId);
    if (!adminChannel || !adminChannel.isTextBased()) {
      console.log('[Discord] Admin channel not found or not text-based');
      return;
    }
    
    // Create admin notification embed using template
    const adminEmbed = createAdminNotificationEmbed(
      action,
      ticket,
      category,
      actor,
      additionalInfo
    );
    
    // Create action buttons based on ticket status
    const adminActions = ticket.status === 'closed' 
      ? createClosedTicketActionButtons(ticket.id)
      : createTicketActionButtons(ticket.id);
    
    // Send to admin channel with proper error handling
    try {
      const notificationMessage = await adminChannel.send({ 
        embeds: [adminEmbed], 
        components: [adminActions] 
      });
      console.log(`[Discord] Admin notification sent for ticket ${ticket.id} - action: ${action}`);
      
      // Create a discussion thread for new tickets
      if (action === 'created' && notificationMessage.channel.isTextBased()) {
        try {
          const thread = await notificationMessage.startThread({
            name: `🎫 Ticket #${ticket.id}: ${ticket.title.substring(0, 80)}`,
            autoArchiveDuration: 1440, // 24 hours
            reason: `Discussion thread for ticket #${ticket.id}`
          });
          
          // Send initial context message in thread
          const { getPriorityDisplay } = await import('./embed-templates.js');
          const priorityDisplay = getPriorityDisplay(ticket.priority);
          
          const contextEmbed = new EmbedBuilder()
            .setTitle(`📋 Ticket Discussion Thread`)
            .setDescription(`This thread is for moderator discussion about **Ticket #${ticket.id}**.\n\n**Ticket Title:** ${ticket.title}\n**Category:** ${category?.name || 'Unknown'}\n**Priority:** ${priorityDisplay.emoji} ${priorityDisplay.text}\n\nUse the buttons in the parent message for quick actions, or discuss the ticket here.`)
            .setColor('#5865F2')
            .setFooter({ text: 'Moderator Discussion Only' })
            .setTimestamp();
            
          await thread.send({ embeds: [contextEmbed] });
          console.log(`[Discord] Created discussion thread for ticket ${ticket.id}: ${thread.id}`);
        } catch (threadError) {
          console.error(`[Discord] Failed to create discussion thread for ticket ${ticket.id}:`, threadError);
          // Non-critical, continue execution
        }
      }
    } catch (sendError) {
      console.error(`[Discord] Error sending admin notification for ticket ${ticket.id}:`, sendError);
      // Try without buttons as fallback
      try {
        await adminChannel.send({ embeds: [adminEmbed] });
        console.log(`[Discord] Admin notification sent without buttons for ticket ${ticket.id}`);
      } catch (fallbackError) {
        console.error(`[Discord] Failed to send admin notification even without buttons:`, fallbackError);
      }
    }
    
    // Send to public log channel if configured (only for created action)
    if (action === 'created' && botSettings.publicLogChannelId) {
      const logChannel = guild?.channels.cache.get(botSettings.publicLogChannelId);
      if (logChannel && logChannel.isTextBased()) {
        const logEmbed = new EmbedBuilder()
          .setTitle('New Support Ticket')
          .setDescription(`A new support ticket has been created in the ${category.name} category.`)
          .addFields(
            { name: 'Ticket ID', value: `#${ticket.id}`, inline: true },
            { name: 'Priority', value: ticket.priority === 'urgent' ? 'Urgent' : 'Normal', inline: true }
          )
          .setColor('#5865F2')
          .setTimestamp();
        
        try {
          await logChannel.send({ embeds: [logEmbed] });
          console.log(`[Discord] Public log sent for ticket ${ticket.id}`);
        } catch (logError) {
          console.error(`[Discord] Failed to send public log:`, logError);
        }
      }
    }
  } catch (error) {
    console.error('[Discord] Error sending admin notification:', error);
    // Don't throw - this is a non-critical feature
  }
}

// /ticket create command
const createTicketCommand: Command = {
  // @ts-ignore - Using subcommands causes TypeScript errors but is supported by Discord.js
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket management commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new support ticket')
        .addStringOption(option =>
          option.setName('title')
            .setDescription('Title of your ticket')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('description')
            .setDescription('Describe your issue')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('category')
            .setDescription('Ticket category')
            .setRequired(true)
            .addChoices(
              { name: 'General Support', value: '1' },
              { name: 'Bug Reports', value: '2' },
              { name: 'Feature Requests', value: '3' },
              { name: 'Account Issues', value: '4' }
            )
        )
        .addBooleanOption(option =>
          option.setName('urgent')
            .setDescription('Mark this ticket as urgent')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List your open tickets')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View a specific ticket')
        .addIntegerOption(option =>
          option.setName('id')
            .setDescription('Ticket ID')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('close')
        .setDescription('Close a ticket')
        .addIntegerOption(option =>
          option.setName('id')
            .setDescription('Ticket ID')
            .setRequired(true)
        )
    ),
  execute: async (interaction, { storage, broadcast }) => {
    if (!interaction.isCommand()) return;
    
    // IMMEDIATELY defer the reply to prevent timeout issues
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (error) {
      console.error('Failed to defer Discord interaction:', error);
      return;
    }
    
    const subcommand = interaction.options.data[0]?.name || '';
    
    if (subcommand === 'create') {
      try {
        const options = interaction.options.data[0]?.options || [];
        const title = options.find(opt => opt.name === 'title')?.value as string;
        const description = options.find(opt => opt.name === 'description')?.value as string;
        const categoryId = parseInt(options.find(opt => opt.name === 'category')?.value as string);
        const isUrgent = (options.find(opt => opt.name === 'urgent')?.value as boolean) || false;
        
        // STEP 1: Validate server settings
        if (!interaction.guildId) {
          await interaction.editReply({
            content: '❌ **Error**\n\nThis command can only be used in a server.'
          });
          return;
        }
        
        const settingsValidation = await validateBotSettings(storage, interaction.guildId);
        if (!settingsValidation.isValid) {
          await interaction.editReply({ content: settingsValidation.error });
          return;
        }
        
        // STEP 2: Check rate limiting
        const rateLimitCheck = checkTicketRateLimit(interaction.user.id);
        if (rateLimitCheck.isLimited) {
          const resetTime = rateLimitCheck.resetAt.toLocaleString();
          await interaction.editReply({
            content: `❌ **Rate Limit Exceeded**\n\nYou have reached the maximum of 5 tickets per hour. Please wait until **${resetTime}** before creating another ticket.\n\n*If you have an urgent issue, please contact a server administrator directly.*`
          });
          return;
        }
        
        // STEP 3: Validate category exists and belongs to this server
        const categoryValidation = await validateTicketCategory(storage, categoryId, interaction.guildId);
        if (!categoryValidation.isValid) {
          await interaction.editReply({ content: categoryValidation.error });
          return;
        }
        
        const category = categoryValidation.category;
        
        // STEP 4: Validate the user exists in our system, create if not
        const discordUser = await storage.getDiscordUser(interaction.user.id);
        
        if (!discordUser) {
          await storage.createDiscordUser({
            id: interaction.user.id,
            username: interaction.user.username,
            discriminator: interaction.user.discriminator || '0000',
            avatar: interaction.user.avatarURL() || undefined,
            isAdmin: false
          });
        }
        
        // STEP 5: Create the ticket in database with retry logic
        let ticket;
        try {
          const ticketData: InsertTicket = {
            title,
            description,
            status: 'open',
            priority: isUrgent ? 'urgent' : 'normal',
            categoryId,
            creatorId: interaction.user.id,
            serverId: interaction.guildId,
          };
          
          ticket = await retryDiscordOperation(async () => {
            return await storage.createTicket(ticketData);
          }, 2);
          
          console.log(`[Discord] ✅ Ticket created: ID ${ticket.id}, Title: ${ticket.title}`);
        } catch (error) {
          console.error('[Discord] Failed to create ticket in database:', error);
          await interaction.editReply({
            content: '❌ **Database Error**\n\nFailed to create ticket due to a database error. Please try again in a moment.\n\n*If this issue persists, please contact an administrator.*'
          });
          return;
        }
        
        // STEP 6: Record rate limit after successful ticket creation
        recordTicketCreation(interaction.user.id);
        
        // STEP 7: Create first message from the user
        try {
          await storage.createTicketMessage({
            ticketId: ticket.id,
            senderId: interaction.user.id,
            content: description
          });
          console.log(`[Discord] First message added to ticket ${ticket.id}`);
        } catch (error) {
          console.error('[Discord] Warning: Failed to create initial message:', error);
          // Non-critical - continue
        }
        
        // STEP 8: Create audit log
        try {
          await storage.createTicketAuditLog({
            ticketId: ticket.id,
            action: 'created',
            performedBy: interaction.user.id,
            performedByUsername: interaction.user.username,
            details: JSON.stringify({
              method: 'slash_command',
              categoryId,
              priority: ticket.priority
            }),
            serverId: ticket.serverId
          });
        } catch (error) {
          console.error('[Discord] Warning: Failed to create audit log:', error);
          // Non-critical - continue
        }
        
        // STEP 9: Broadcast to connected clients
        try {
          console.log(`[Discord] Broadcasting TICKET_CREATED event for ticket ${ticket.id}`);
          broadcast({ type: 'TICKET_CREATED', data: ticket });
        } catch (error) {
          console.error('[Discord] Warning: Failed to broadcast event:', error);
          // Non-critical - continue
        }
        
        // STEP 10: Send copy to admin channel if configured
        try {
          if (interaction.guildId && interaction.guild && category) {
            await sendTicketNotificationToAdminChannel(
              interaction.guildId,
              interaction.guild,
              storage,
              ticket,
              category,
              'created',
              interaction.user
            );
          }
        } catch (error) {
          console.error('[Discord] Warning: Failed to send admin notification:', error);
          // Non-critical - continue
        }
        
        // STEP 11: Send success confirmation to user
        const baseUrl = process.env.APP_URL || `https://${process.env.REPLIT_DOMAINS}`;
        const dashboardUrl = baseUrl;
        
        const embed = new EmbedBuilder()
          .setTitle('✅ Ticket Created Successfully')
          .setDescription(`Your support ticket has been created and our team will review it shortly.\n\n**${title}**\n${description.substring(0, 100)}${description.length > 100 ? '...' : ''}`)
          .addFields(
            { name: 'Ticket ID', value: `#${ticket.id}`, inline: true },
            { name: 'Status', value: '✅ Open', inline: true },
            { name: 'Priority', value: isUrgent ? '🔴 Urgent' : '🟢 Normal', inline: true },
            { name: 'Category', value: category.name, inline: true },
            { name: 'Tickets Remaining', value: `${rateLimitCheck.remaining - 1}/5 this hour`, inline: true }
          )
          .setColor('#43B581')
          .setFooter({ text: 'View and manage this ticket in the web dashboard' })
          .setTimestamp();
        
        const linkButton = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setLabel('View in Dashboard')
              .setStyle(ButtonStyle.Link)
              .setURL(dashboardUrl),
          );
        
        await interaction.editReply({ 
          embeds: [embed],
          components: [linkButton]
        });
        
        console.log(`[Discord] ✅ Ticket creation completed successfully for user ${interaction.user.username}`);
        
      } catch (error) {
        console.error('[Discord] Unexpected error creating ticket:', error);
        await interaction.editReply({
          content: '❌ **Unexpected Error**\n\nAn unexpected error occurred while creating your ticket. Please try again later.\n\n*If this issue persists, please contact an administrator.*'
        }).catch(() => {
          console.error('[Discord] Failed to send error message to user');
        });
      }
    } else if (subcommand === 'list') {
      try {
        
        const tickets = await storage.getTicketsByCreator(interaction.user.id);
        
        if (tickets.length === 0) {
          await interaction.editReply('You have no open tickets.');
          return;
        }
        
        const embed = new EmbedBuilder()
          .setTitle('Your Tickets')
          .setDescription('Here are your current tickets:')
          .setColor('#5865F2')
          .setTimestamp();
        
        tickets.forEach(ticket => {
          embed.addFields({
            name: `#ticket-${ticket.id}: ${ticket.title}`,
            value: `Status: ${ticket.status} | Priority: ${ticket.priority}`
          });
        });
        
        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        console.error('Error listing tickets:', error);
        await interaction.editReply('Failed to list tickets. Please try again later.');
      }
    } else if (subcommand === 'view') {
      try {
        
        const options = interaction.options.data[0]?.options || [];
        const ticketId = options.find(opt => opt.name === 'id')?.value as number;
        const ticket = await storage.getTicket(ticketId);
        
        if (!ticket) {
          await interaction.editReply(`Ticket #${ticketId} not found.`);
          return;
        }
        
        // Check if the user is the creator or has admin role
        const user = await storage.getDiscordUser(interaction.user.id);
        if (ticket.creatorId !== interaction.user.id && !(user?.isAdmin)) {
          await interaction.editReply('You do not have permission to view this ticket.');
          return;
        }
        
        const messages = await storage.getTicketMessages(ticketId);
        const category = ticket.categoryId 
          ? await storage.getTicketCategory(ticket.categoryId)
          : null;
        
        const embed = new EmbedBuilder()
          .setTitle(`Ticket #${ticket.id}: ${ticket.title}`)
          .setDescription(ticket.description)
          .addFields(
            { name: 'Status', value: ticket.status || 'Unknown', inline: true },
            { name: 'Priority', value: ticket.priority || 'Normal', inline: true },
            { name: 'Category', value: category?.name || 'None', inline: true },
            { name: 'Created', value: ticket.createdAt ? ticket.createdAt.toLocaleString() : 'Unknown', inline: true }
          )
          .setColor('#5865F2')
          .setTimestamp();
        
        // Create buttons for actions
        const row = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`closeTicket_${ticket.id}`)
              .setLabel('Close Ticket')
              .setStyle(ButtonStyle.Danger),
          );
        
        await interaction.editReply({ 
          embeds: [embed],
          components: [row]
        });
        
        // Show the last 3 messages if any
        if (messages.length > 0) {
          const recentMessages = messages.slice(-3);
          const messagesEmbed = new EmbedBuilder()
            .setTitle('Recent Messages')
            .setColor('#36393F');
          
          recentMessages.forEach((msg, index) => {
            messagesEmbed.addFields({
              name: `Message ${index + 1}`,
              value: `From: <@${msg.senderId}>\n${msg.content}\n${msg.createdAt ? msg.createdAt.toLocaleString() : 'Unknown time'}`
            });
          });
          
          await interaction.followUp({ 
            embeds: [messagesEmbed],
            ephemeral: true
          });
        }
      } catch (error) {
        console.error('Error viewing ticket:', error);
        await interaction.editReply('Failed to view ticket. Please try again later.');
      }
    } else if (subcommand === 'close') {
      try {
        
        const options = interaction.options.data[0]?.options || [];
        const ticketId = options.find(opt => opt.name === 'id')?.value as number;
        const ticket = await storage.getTicket(ticketId);
        
        if (!ticket) {
          await interaction.editReply(`Ticket #${ticketId} not found.`);
          return;
        }
        
        // Check if the user is the creator or has admin role
        const user = await storage.getDiscordUser(interaction.user.id);
        if (ticket.creatorId !== interaction.user.id && !(user?.isAdmin)) {
          await interaction.editReply('You do not have permission to close this ticket.');
          return;
        }
        
        if (ticket.status === 'closed') {
          await interaction.editReply('This ticket is already closed.');
          return;
        }
        
        const updatedTicket = await storage.updateTicket(ticketId, { status: 'closed', closedAt: new Date() });
        
        // Notify all connected clients about the updated ticket
        broadcast({ type: 'TICKET_UPDATED', data: updatedTicket });
        
        // Create a system message for the closure
        await storage.createTicketMessage({
          ticketId: ticket.id,
          senderId: interaction.user.id,
          content: `Ticket closed by ${interaction.user.username}.`
        });
        
        const embed = new EmbedBuilder()
          .setTitle('Ticket Closed')
          .setDescription(`Ticket #${ticketId} has been closed successfully.`)
          .setColor('#F04747')
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        console.error('Error closing ticket:', error);
        await interaction.editReply('Failed to close ticket. Please try again later.');
      }
    }
  }
};

// /ping command
const pingCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency, response time, and uptime'),
  execute: async (interaction, context) => {
    const startTime = Date.now();
    
    try {
      // Defer the reply immediately
      await interaction.deferReply({ ephemeral: true });
    } catch (error) {
      console.error('Failed to defer ping interaction:', error);
      return;
    }

    try {
      const client = getDiscordClient();
      
      if (!client) {
        const embed = new EmbedBuilder()
          .setTitle('🔴 Bot Status')
          .setDescription('Discord client is not available')
          .setColor('#F04747')
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Calculate API response time
      const apiResponseTime = Date.now() - startTime;
      
      // Get WebSocket ping
      const wsPing = client.ws.ping;
      
      // Get bot uptime
      const uptime = client.uptime;
      const uptimeString = uptime ? formatUptime(uptime) : 'Unknown';
      
      // Create embed with bot health information
      const embed = new EmbedBuilder()
        .setTitle('🟢 Bot Status')
        .setDescription('Bot is running smoothly!')
        .addFields(
          { name: '🏓 WebSocket Ping', value: `${wsPing}ms`, inline: true },
          { name: '⚡ API Response Time', value: `${apiResponseTime}ms`, inline: true },
          { name: '⏱️ Bot Uptime', value: uptimeString, inline: true },
          { name: '🤖 Bot Status', value: client.user ? `Ready as ${client.user.tag}` : 'Unknown', inline: false }
        )
        .setColor('#43B581')
        .setFooter({ text: 'All systems operational' })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error in ping command:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('🔴 Error')
        .setDescription('Failed to retrieve bot status information')
        .setColor('#F04747')
        .setTimestamp();
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};

// /heartbeat command
const heartbeatCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('heartbeat')
    .setDescription('Check comprehensive server health status'),
  execute: async (interaction, { storage }) => {
    const startTime = Date.now();
    
    try {
      // Defer the reply immediately
      await interaction.deferReply({ ephemeral: true });
    } catch (error) {
      console.error('Failed to defer heartbeat interaction:', error);
      return;
    }

    try {
      const client = getDiscordClient();
      let overallHealth = '🟢 Healthy';
      let embedColor = '#43B581'; // Green for healthy
      
      // Test database connectivity
      let dbStatus = '🔴 Failed';
      try {
        const categories = await storage.getAllTicketCategories();
        dbStatus = categories ? '🟢 Connected' : '🟡 Warning';
      } catch (error) {
        console.error('Database health check failed:', error);
        dbStatus = '🔴 Failed';
        overallHealth = '🔴 Unhealthy';
        embedColor = '#F04747';
      }
      
      // Check WebSocket status
      let wsStatus = '🔴 Disconnected';
      let wsPing = 'N/A';
      if (client && client.ws) {
        switch (client.ws.status) {
          case 0: // READY
            wsStatus = '🟢 Connected';
            wsPing = `${client.ws.ping}ms`;
            break;
          case 1: // CONNECTING
            wsStatus = '🟡 Connecting';
            if (overallHealth === '🟢 Healthy') {
              overallHealth = '🟡 Warning';
              embedColor = '#FAA61A';
            }
            break;
          case 2: // RECONNECTING
            wsStatus = '🟡 Reconnecting';
            if (overallHealth === '🟢 Healthy') {
              overallHealth = '🟡 Warning';
              embedColor = '#FAA61A';
            }
            break;
          case 3: // IDLE
            wsStatus = '🟡 Idle';
            if (overallHealth === '🟢 Healthy') {
              overallHealth = '🟡 Warning';
              embedColor = '#FAA61A';
            }
            break;
          case 4: // NEARLY
            wsStatus = '🟡 Nearly Ready';
            if (overallHealth === '🟢 Healthy') {
              overallHealth = '🟡 Warning';
              embedColor = '#FAA61A';
            }
            break;
          case 5: // DISCONNECTED
            wsStatus = '🔴 Disconnected';
            overallHealth = '🔴 Unhealthy';
            embedColor = '#F04747';
            break;
          case 6: // WAITING_FOR_GUILDS
            wsStatus = '🟡 Waiting for Guilds';
            if (overallHealth === '🟢 Healthy') {
              overallHealth = '🟡 Warning';
              embedColor = '#FAA61A';
            }
            break;
          case 7: // IDENTIFYING
            wsStatus = '🟡 Identifying';
            if (overallHealth === '🟢 Healthy') {
              overallHealth = '🟡 Warning';
              embedColor = '#FAA61A';
            }
            break;
          case 8: // RESUMING
            wsStatus = '🟡 Resuming';
            if (overallHealth === '🟢 Healthy') {
              overallHealth = '🟡 Warning';
              embedColor = '#FAA61A';
            }
            break;
          default:
            wsStatus = '🔴 Unknown';
            overallHealth = '🔴 Unhealthy';
            embedColor = '#F04747';
        }
      } else {
        overallHealth = '🔴 Unhealthy';
        embedColor = '#F04747';
      }
      
      // Calculate API response time
      const apiResponseTime = Date.now() - startTime;
      const apiStatus = apiResponseTime < 1000 ? '🟢 Fast' : apiResponseTime < 3000 ? '🟡 Slow' : '🔴 Very Slow';
      
      if (apiResponseTime >= 3000 && overallHealth !== '🔴 Unhealthy') {
        overallHealth = '🔴 Unhealthy';
        embedColor = '#F04747';
      } else if (apiResponseTime >= 1000 && overallHealth === '🟢 Healthy') {
        overallHealth = '🟡 Warning';
        embedColor = '#FAA61A';
      }
      
      // Get system uptime
      const processUptime = process.uptime();
      const processUptimeString = formatUptime(processUptime * 1000); // Convert to ms
      
      // Create comprehensive health embed
      const embed = new EmbedBuilder()
        .setTitle(`${overallHealth.split(' ')[0]} Server Health Status`)
        .setDescription(`Overall Status: **${overallHealth}**`)
        .addFields(
          { name: '💾 Database', value: dbStatus, inline: true },
          { name: '🌐 WebSocket', value: `${wsStatus}\n${wsPing !== 'N/A' ? `Ping: ${wsPing}` : ''}`, inline: true },
          { name: '⚡ API Response', value: `${apiStatus}\n${apiResponseTime}ms`, inline: true },
          { name: '🖥️ Process Uptime', value: processUptimeString, inline: true },
          { name: '🤖 Bot User', value: client?.user ? `${client.user.tag}` : '❌ Not Available', inline: true },
          { name: '📊 Memory Usage', value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`, inline: true }
        )
        .setColor(embedColor as any)
        .setFooter({ text: 'Health check completed' })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error in heartbeat command:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('🔴 Health Check Failed')
        .setDescription('Unable to perform comprehensive health check')
        .addFields(
          { name: 'Error', value: 'System health monitoring is currently unavailable', inline: false }
        )
        .setColor('#F04747')
        .setTimestamp();
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};

// Helper function to format uptime
// Helper function to get category emoji
function getCategoryEmoji(categoryId: number): string {
  const emojis = {
    1: '🛠️', // General Support
    2: '🐛', // Bug Reports
    3: '💡', // Feature Requests
    4: '👤'  // Account Issues
  };
  return emojis[categoryId as keyof typeof emojis] || '📋';
}

// Helper function to format uptime
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// /setup-ticket-panel command
const setupTicketPanelCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('setup-ticket-panel')
    .setDescription('Setup an interactive ticket creation panel (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  execute: async (interaction, { storage }) => {
    try {
      // Defer the reply immediately
      await interaction.deferReply({ ephemeral: false });
    } catch (error) {
      console.error('Failed to defer setup-ticket-panel interaction:', error);
      return;
    }

    try {
      // Check if user has admin permissions in the database
      const user = await storage.getDiscordUser(interaction.user.id);
      if (!user?.isAdmin && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
        await interaction.editReply('❌ You do not have permission to use this command. Administrator privileges required.');
        return;
      }

      // Create the professional ticket panel embed
      const embed = new EmbedBuilder()
        .setTitle('🎫 Support Ticket System')
        .setDescription(`**Welcome to our support ticket system!**\n\nClick one of the buttons below to create a new support ticket. Our team will respond as quickly as possible.\n\n**Available Categories:**\n🛠️ **General Support** - General questions and assistance\n🐛 **Bug Reports** - Report issues or problems\n💡 **Feature Requests** - Suggest new features or improvements\n👤 **Account Issues** - Account-related problems\n\n*Please provide as much detail as possible when creating your ticket to help us assist you better.*`)
        .setColor('#5865F2')
        .setFooter({ text: 'Click a button below to get started • Support Team' })
        .setTimestamp()
        .setThumbnail('https://cdn.discordapp.com/attachments/123456789012345678/123456789012345678/discord-icon.png'); // Discord branding

      // Create category buttons with emojis
      const row1 = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('createTicket_1')
            .setLabel('General Support')
            .setEmoji('🛠️')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('createTicket_2')
            .setLabel('Bug Reports')
            .setEmoji('🐛')
            .setStyle(ButtonStyle.Danger)
        );

      const row2 = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('createTicket_3')
            .setLabel('Feature Requests')
            .setEmoji('💡')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('createTicket_4')
            .setLabel('Account Issues')
            .setEmoji('👤')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.editReply({ 
        embeds: [embed],
        components: [row1, row2]
      });

      // Send a confirmation message to the admin
      await interaction.followUp({ 
        content: '✅ Ticket panel has been set up successfully! Users can now click the buttons to create support tickets.',
        ephemeral: true
      });
    } catch (error) {
      console.error('Error setting up ticket panel:', error);
      await interaction.editReply('❌ Failed to set up ticket panel. Please try again later.');
    }
  }
};

// Register all commands
// /panels command for managing panel templates
const panelsCommand: Command = {
  // @ts-ignore - Using subcommands causes TypeScript errors but is supported by Discord.js
  data: new SlashCommandBuilder()
    .setName('panels')
    .setDescription('Manage panel templates')
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List available panel templates')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('send')
        .setDescription('Send a panel template to the current channel')
        .addStringOption(option =>
          option.setName('template')
            .setDescription('Template name to send')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  execute: async (interaction, { storage }) => {
    if (!interaction.isCommand()) return;
    
    // Defer the reply immediately
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (error) {
      console.error('Failed to defer panels interaction:', error);
      return;
    }
    
    const subcommand = interaction.options.data[0]?.name || '';
    const guildId = interaction.guildId;
    
    if (!guildId) {
      await interaction.editReply('❌ This command can only be used in a server.');
      return;
    }
    
    // Check permissions
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.editReply('❌ You need the "Manage Channels" permission to use this command.');
      return;
    }
    
    if (subcommand === 'list') {
      try {
        // Get all panel templates for this server
        const templates = await storage.getPanelTemplates(guildId);
        
        if (templates.length === 0) {
          await interaction.editReply('📭 No panel templates found for this server.\n\nCreate templates in the dashboard to use them here!');
          return;
        }
        
        // Fetch fields and buttons for each template
        const templatesWithRelations: PanelTemplateWithRelations[] = await Promise.all(
          templates.map(async (template) => {
            const fields = await storage.getPanelTemplateFields(template.id);
            const buttons = await storage.getPanelTemplateButtons(template.id);
            return { ...template, fields, buttons };
          })
        );
        
        const embed = new EmbedBuilder()
          .setTitle('📋 Available Panel Templates')
          .setColor('#5865F2')
          .setDescription('Here are all the panel templates available for this server:')
          .setFooter({ text: `Total: ${templates.length} templates` })
          .setTimestamp();
        
        // Add each template as a field
        templatesWithRelations.forEach((template: PanelTemplateWithRelations) => {
          const fieldCount = template.fields?.length || 0;
          const buttonCount = template.buttons?.length || 0;
          embed.addFields({
            name: `📌 ${template.name}`,
            value: `${template.description || 'No description'}\n` +
                   `• **Color:** ${template.embedColor}\n` +
                   `• **Fields:** ${fieldCount} | **Buttons:** ${buttonCount}`,
            inline: false
          });
        });
        
        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        console.error('Error listing panel templates:', error);
        await interaction.editReply('❌ Failed to list panel templates. Please try again later.');
      }
    } else if (subcommand === 'send') {
      try {
        const options = interaction.options.data[0]?.options || [];
        const templateName = options.find(opt => opt.name === 'template')?.value as string;
        
        if (!templateName) {
          await interaction.editReply('❌ Please provide a template name.');
          return;
        }
        
        // Get all templates for this server
        const templates = await storage.getPanelTemplates(guildId);
        
        // Find the template by name (case-insensitive)
        const template = templates.find((t: PanelTemplate) => 
          t.name.toLowerCase() === templateName.toLowerCase()
        );
        
        if (!template) {
          await interaction.editReply(`❌ Template "${templateName}" not found.\n\nUse \`/panels list\` to see available templates.`);
          return;
        }
        
        // Fetch fields and buttons for this template
        const fields = await storage.getPanelTemplateFields(template.id);
        const buttons = await storage.getPanelTemplateButtons(template.id);
        const templateWithRelations: PanelTemplateWithRelations = { ...template, fields, buttons };
        
        // Build the embed from the template
        const embed = new EmbedBuilder()
          .setTitle(templateWithRelations.embedTitle || 'Panel')
          .setDescription(templateWithRelations.embedDescription || 'Panel Description')
          .setColor(templateWithRelations.embedColor as any);
        
        if (templateWithRelations.footerText) {
          embed.setFooter({ text: templateWithRelations.footerText });
        }
        
        if (templateWithRelations.imageUrl) {
          embed.setImage(templateWithRelations.imageUrl);
        }
        
        if (templateWithRelations.thumbnailUrl) {
          embed.setThumbnail(templateWithRelations.thumbnailUrl);
        }
        
        if (templateWithRelations.authorName) {
          embed.setAuthor({ 
            name: templateWithRelations.authorName,
            iconURL: templateWithRelations.authorIconUrl || undefined
          });
        }
        
        // Add fields
        if (templateWithRelations.fields && templateWithRelations.fields.length > 0) {
          templateWithRelations.fields.forEach((field: PanelTemplateField) => {
            embed.addFields({
              name: field.name,
              value: field.value,
              inline: field.inline || false
            });
          });
        }
        
        // Build buttons if any
        const components = [];
        if (templateWithRelations.buttons && templateWithRelations.buttons.length > 0) {
          // Discord allows max 5 buttons per row, max 5 rows
          for (let i = 0; i < templateWithRelations.buttons.length && i < 25; i += 5) {
            const row = new ActionRowBuilder<ButtonBuilder>();
            const buttonsInRow = templateWithRelations.buttons.slice(i, i + 5);
            
            buttonsInRow.forEach((button: PanelTemplateButton) => {
              const btn = new ButtonBuilder()
                .setLabel(button.label)
                .setStyle(getButtonStyle(button.buttonStyle));
              
              // Set custom ID or URL based on button type
              if (button.url) {
                btn.setURL(button.url);
              } else if (button.customId) {
                btn.setCustomId(button.customId);
              } else {
                // Default custom ID if neither is provided
                btn.setCustomId(`template_${templateWithRelations.id}_${button.label.replace(/\s+/g, '_')}`);
              }
              
              if (button.emoji) {
                btn.setEmoji(button.emoji);
              }
              
              row.addComponents(btn);
            });
            
            components.push(row);
          }
        }
        
        // Send the panel to the channel
        // Check if the channel is text-based and can send messages
        if (interaction.channel && 'send' in interaction.channel) {
          await interaction.channel.send({ 
            embeds: [embed],
            components: components
          });
        } else {
          await interaction.editReply('❌ Unable to send the panel to this channel type.');
          return;
        }
        
        await interaction.editReply(`✅ Successfully sent the **${template.name}** panel template!`);
      } catch (error) {
        console.error('Error sending panel template:', error);
        await interaction.editReply('❌ Failed to send panel template. Please try again later.');
      }
    }
  }
};

commands.set('ticket', createTicketCommand);
commands.set('ping', pingCommand);
commands.set('heartbeat', heartbeatCommand);
commands.set('setup-ticket-panel', setupTicketPanelCommand);

// Stream notification scan command
const streamScanCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('stream-scan')
    .setDescription('Manually scan server members for connected streaming accounts')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction, { storage }) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      if (!interaction.guild) {
        await interaction.editReply('This command can only be used in a server!');
        return;
      }

      // Check if auto-detection is enabled for this server
      const settings = await storage.getStreamNotificationSettings(interaction.guild.id);
      if (!settings) {
        await interaction.editReply({
          content: '❌ Stream notifications are not configured for this server. Please set up stream notifications first.'
        });
        return;
      }

      if (!settings.autoDetectEnabled) {
        await interaction.editReply({
          content: '⚠️ Auto-detection is not enabled for this server. Enable it in the stream notifications settings to use this command.'
        });
        return;
      }

      // Import and trigger manual scan
      const { triggerManualScan } = await import('./stream-auto-detection');
      const result = await triggerManualScan(interaction.guild, storage);

      // Build result message
      const embed = new EmbedBuilder()
        .setTitle('🔍 Stream Auto-Detection Scan Complete')
        .setColor('#9146FF')
        .setDescription(`Scanned **${result.totalMembers}** server members for connected streaming accounts.`)
        .addFields(
          { name: '👥 Members with Streaming', value: result.membersWithStreaming.toString(), inline: true },
          { name: '➕ Newly Added', value: result.newlyAdded.toString(), inline: true },
          { name: '🔄 Updated', value: result.updated.toString(), inline: true },
          { name: '❌ Errors', value: result.errors.toString(), inline: true }
        )
        .setFooter({ text: 'Stream notifications will be sent automatically when tracked users go live' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error in stream-scan command:', error);
      await interaction.editReply({
        content: '❌ An error occurred while scanning for streaming accounts. Please try again later.'
      });
    }
  }
};

commands.set('stream-scan', streamScanCommand);
commands.set('panels', panelsCommand);

// Stream Notification Commands
const streamSetupCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('stream-setup')
    .setDescription('Configure stream go-live notifications')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to send stream notifications')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Custom message (Tokens: {user}, {game}, {platform})')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('enabled')
        .setDescription('Enable or disable stream notifications')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction, { storage }) {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guildId) {
      await interaction.editReply('This command can only be used in a server!');
      return;
    }

    const channel = interaction.options.getChannel('channel', true);
    const message = interaction.options.getString('message');
    const enabled = interaction.options.getBoolean('enabled') ?? true;

    try {
      // Check if settings exist
      const existingSettings = await storage.getStreamNotificationSettings(interaction.guildId);

      if (existingSettings) {
        // Update existing settings
        await storage.updateStreamNotificationSettings(interaction.guildId, {
          notificationChannelId: channel.id,
          customMessage: message || existingSettings.customMessage,
          isEnabled: enabled
        });
      } else {
        // Create new settings
        await storage.createStreamNotificationSettings({
          serverId: interaction.guildId,
          notificationChannelId: channel.id,
          customMessage: message || null,
          isEnabled: enabled
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('✅ Stream Notifications Configured')
        .setDescription(`Stream go-live notifications have been ${enabled ? 'enabled' : 'disabled'}`)
        .addFields(
          { name: 'Channel', value: `<#${channel.id}>`, inline: true },
          { name: 'Status', value: enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true }
        )
        .setColor(enabled ? '#43B581' : '#F04747')
        .setTimestamp();

      if (message) {
        embed.addFields({ name: 'Custom Message', value: message, inline: false });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error setting up stream notifications:', error);
      await interaction.editReply('❌ Failed to configure stream notifications. Please try again.');
    }
  }
};

const streamTrackCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('stream-track')
    .setDescription('Add a user to stream notification tracking')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Discord user to track')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('custom-message')
        .setDescription('Custom message for this user (Tokens: {user}, {game}, {platform})')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction, { storage }) {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guildId) {
      await interaction.editReply('This command can only be used in a server!');
      return;
    }

    const user = interaction.options.getUser('user', true);
    const customMessage = interaction.options.getString('custom-message');

    try {
      // Check if settings exist
      const settings = await storage.getStreamNotificationSettings(interaction.guildId);
      if (!settings) {
        await interaction.editReply('❌ Please run `/stream-setup` first to configure stream notifications!');
        return;
      }

      // Check if user is already tracked
      const trackedUsers = await storage.getStreamTrackedUsers(interaction.guildId);
      const alreadyTracked = trackedUsers.some(u => u.userId === user.id);

      if (alreadyTracked) {
        await interaction.editReply(`❌ ${user.username} is already being tracked for stream notifications.`);
        return;
      }

      // Add user to tracking
      await storage.addStreamTrackedUser({
        serverId: interaction.guildId,
        userId: user.id,
        username: user.username
      });

      const embed = new EmbedBuilder()
        .setTitle('✅ User Added to Stream Tracking')
        .setDescription(`${user.username} will now trigger notifications when they go live!`)
        .addFields(
          { name: 'User', value: `<@${user.id}>`, inline: true },
          { name: 'Channel', value: settings.notificationChannelId ? `<#${settings.notificationChannelId}>` : 'Not set', inline: true }
        )
        .setColor('#43B581')
        .setThumbnail(user.displayAvatarURL())
        .setTimestamp();

      if (customMessage) {
        embed.addFields({ name: 'Custom Message', value: customMessage, inline: false });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error tracking user for streams:', error);
      await interaction.editReply('❌ Failed to add user to stream tracking. Please try again.');
    }
  }
};

const streamUntrackCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('stream-untrack')
    .setDescription('Remove a user from stream notification tracking')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Discord user to stop tracking')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction, { storage }) {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guildId) {
      await interaction.editReply('This command can only be used in a server!');
      return;
    }

    const user = interaction.options.getUser('user', true);

    try {
      const removed = await storage.removeStreamTrackedUser(interaction.guildId, user.id);

      if (!removed) {
        await interaction.editReply(`❌ ${user.username} is not being tracked for stream notifications.`);
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('✅ User Removed from Stream Tracking')
        .setDescription(`${user.username} will no longer trigger stream notifications.`)
        .addFields({ name: 'User', value: `<@${user.id}>`, inline: true })
        .setColor('#F04747')
        .setThumbnail(user.displayAvatarURL())
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error untracking user for streams:', error);
      await interaction.editReply('❌ Failed to remove user from stream tracking. Please try again.');
    }
  }
};

const streamListCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('stream-list')
    .setDescription('View all users being tracked for stream notifications')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction, { storage }) {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guildId) {
      await interaction.editReply('This command can only be used in a server!');
      return;
    }

    try {
      const settings = await storage.getStreamNotificationSettings(interaction.guildId);
      const trackedUsers = await storage.getStreamTrackedUsers(interaction.guildId);

      const embed = new EmbedBuilder()
        .setTitle('📺 Stream Notification Settings')
        .setColor('#5865F2')
        .setTimestamp();

      if (!settings) {
        embed.setDescription('❌ Stream notifications are not configured. Run `/stream-setup` to get started!');
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      embed.addFields(
        { name: 'Status', value: settings.isEnabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
        { name: 'Channel', value: settings.notificationChannelId ? `<#${settings.notificationChannelId}>` : 'Not set', inline: true },
        { name: 'Tracked Users', value: trackedUsers.length.toString(), inline: true }
      );

      if (settings.customMessage) {
        embed.addFields({ name: 'Default Message', value: settings.customMessage, inline: false });
      }

      if (trackedUsers.length > 0) {
        const userList = trackedUsers.map((u, i) => {
          let line = `${i + 1}. <@${u.userId}>`;
          if (u.username) {
            line += ` - *${u.username}*`;
          }
          return line;
        }).join('\n');

        embed.addFields({ name: 'Tracked Users', value: userList, inline: false });
      } else {
        embed.addFields({ name: 'Tracked Users', value: '*No users being tracked. Use `/stream-track` to add users.*', inline: false });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error listing tracked users:', error);
      await interaction.editReply('❌ Failed to retrieve stream tracking settings. Please try again.');
    }
  }
};

commands.set('stream-setup', streamSetupCommand);
commands.set('stream-track', streamTrackCommand);
commands.set('stream-untrack', streamUntrackCommand);
commands.set('stream-list', streamListCommand);

console.log('[Discord] Registered stream notification commands:', ['stream-setup', 'stream-track', 'stream-untrack', 'stream-list'].join(', '));

// /plex command - Plex server invite
const plexCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('plex')
    .setDescription('Plex server commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('invite')
        .setDescription('Send a Plex server invite to a friend')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to invite (optional - sends to channel if not specified)')
            .setRequired(false)
        )
    ),
  execute: async (interaction, { storage }) => {
    if (!interaction.isCommand()) return;
    
    try {
      await interaction.deferReply();
    } catch (error) {
      console.error('Failed to defer Plex command interaction:', error);
      return;
    }
    
    const subcommand = interaction.options.data[0]?.name || '';
    
    if (subcommand === 'invite') {
      try {
        const options = interaction.options.data[0]?.options || [];
        const targetUser = options.find(opt => opt.name === 'user')?.user as User | undefined;
        
        const recipientMention = targetUser ? `<@${targetUser.id}>` : undefined;
        
        const embed = createPlexInviteEmbed(interaction.user.username, recipientMention);
        const buttons = createPlexInviteButton();
        
        await interaction.editReply({
          embeds: [embed],
          components: [buttons]
        });
        
        console.log(`[Discord] Plex invite sent by ${interaction.user.username}${targetUser ? ` to ${targetUser.username}` : ''}`);
        
      } catch (error) {
        console.error('Error sending Plex invite:', error);
        await interaction.editReply('❌ Failed to send Plex invite. Please try again.');
      }
    }
  }
};

commands.set('plex', plexCommand);
console.log('[Discord] Registered Plex command');

// /help command - Bot manual and command reference
const helpCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('View bot commands and features')
    .addStringOption(option =>
      option.setName('category')
        .setDescription('View help for a specific category')
        .setRequired(false)
        .addChoices(
          { name: '🎫 Tickets', value: 'tickets' },
          { name: '📺 Streams', value: 'streams' },
          { name: '🎬 Plex', value: 'plex' },
          { name: '📋 Panels', value: 'panels' },
          { name: '🛠️ Admin', value: 'admin' }
        )
    ),
  execute: async (interaction, { storage }) => {
    if (!interaction.isCommand()) return;
    
    try {
      await interaction.deferReply();
    } catch (error) {
      console.error('Failed to defer help command interaction:', error);
      return;
    }
    
    const category = interaction.options.getString('category');
    
    try {
      let embed;
      let components;
      
      switch (category) {
        case 'tickets':
          embed = createTicketHelpEmbed();
          components = [createHelpBackButton()];
          break;
        case 'streams':
          embed = createStreamHelpEmbed();
          components = [createHelpBackButton()];
          break;
        case 'plex':
          embed = createPlexHelpEmbed();
          components = [createHelpBackButton()];
          break;
        case 'panels':
          embed = createPanelsHelpEmbed();
          components = [createHelpBackButton()];
          break;
        case 'admin':
          embed = createAdminHelpEmbed();
          components = [createHelpBackButton()];
          break;
        default:
          embed = createMainHelpEmbed();
          components = [createHelpNavigationButtons()];
          break;
      }
      
      await interaction.editReply({
        embeds: [embed],
        components: components
      });
      
      console.log(`[Discord] Help command used by ${interaction.user.username}${category ? ` (category: ${category})` : ''}`);
      
    } catch (error) {
      console.error('Error sending help:', error);
      await interaction.editReply('❌ Failed to load help. Please try again.');
    }
  }
};

commands.set('help', helpCommand);
console.log('[Discord] Registered Help command');

// ==================== MODERATION COMMANDS ====================

// In-memory storage for warnings (in production, use database)
const userWarnings = new Map<string, { moderator: string; reason: string; timestamp: Date }[]>();

// /ban command
const banCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to ban')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the ban')
        .setRequired(false)
    )
    .addIntegerOption(option =>
      option.setName('delete_days')
        .setDescription('Days of messages to delete (0-7)')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(7)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  execute: async (interaction, { storage }) => {
    if (!interaction.isCommand()) return;
    
    try {
      await interaction.deferReply();
    } catch (error) {
      console.error('Failed to defer ban interaction:', error);
      return;
    }
    
    try {
      if (!interaction.guild) {
        await interaction.editReply('❌ This command can only be used in a server.');
        return;
      }
      
      const targetUser = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const deleteDays = interaction.options.getInteger('delete_days') || 0;
      
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      
      if (member) {
        if (!member.bannable) {
          await interaction.editReply('❌ I cannot ban this user. They may have higher permissions than me.');
          return;
        }
        
        if (member.id === interaction.user.id) {
          await interaction.editReply('❌ You cannot ban yourself!');
          return;
        }
      }
      
      await interaction.guild.members.ban(targetUser.id, {
        deleteMessageSeconds: deleteDays * 24 * 60 * 60,
        reason: `${reason} | Banned by ${interaction.user.tag}`
      });
      
      const embed = new EmbedBuilder()
        .setTitle('🔨 User Banned')
        .setDescription(`**${targetUser.tag}** has been banned from the server.`)
        .addFields(
          { name: 'Banned User', value: `<@${targetUser.id}>`, inline: true },
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false },
          { name: 'Messages Deleted', value: `${deleteDays} day(s)`, inline: true }
        )
        .setColor('#ED4245')
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      console.log(`[Discord] ${interaction.user.tag} banned ${targetUser.tag} in ${interaction.guild.name}`);
      
    } catch (error) {
      console.error('Error executing ban command:', error);
      await interaction.editReply('❌ Failed to ban user. Please check my permissions and try again.');
    }
  }
};

commands.set('ban', banCommand);
console.log('[Discord] Registered Ban command');

// /kick command
const kickCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user from the server')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to kick')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the kick')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  execute: async (interaction, { storage }) => {
    if (!interaction.isCommand()) return;
    
    try {
      await interaction.deferReply();
    } catch (error) {
      console.error('Failed to defer kick interaction:', error);
      return;
    }
    
    try {
      if (!interaction.guild) {
        await interaction.editReply('❌ This command can only be used in a server.');
        return;
      }
      
      const targetUser = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason') || 'No reason provided';
      
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      
      if (!member) {
        await interaction.editReply('❌ User is not in this server.');
        return;
      }
      
      if (!member.kickable) {
        await interaction.editReply('❌ I cannot kick this user. They may have higher permissions than me.');
        return;
      }
      
      if (member.id === interaction.user.id) {
        await interaction.editReply('❌ You cannot kick yourself!');
        return;
      }
      
      await member.kick(`${reason} | Kicked by ${interaction.user.tag}`);
      
      const embed = new EmbedBuilder()
        .setTitle('👢 User Kicked')
        .setDescription(`**${targetUser.tag}** has been kicked from the server.`)
        .addFields(
          { name: 'Kicked User', value: `<@${targetUser.id}>`, inline: true },
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false }
        )
        .setColor('#FFA500')
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      console.log(`[Discord] ${interaction.user.tag} kicked ${targetUser.tag} in ${interaction.guild.name}`);
      
    } catch (error) {
      console.error('Error executing kick command:', error);
      await interaction.editReply('❌ Failed to kick user. Please check my permissions and try again.');
    }
  }
};

commands.set('kick', kickCommand);
console.log('[Discord] Registered Kick command');

// /timeout command
const timeoutCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a user (mute them temporarily)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to timeout')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Duration (e.g., 10m, 1h, 1d, 1w)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the timeout')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  execute: async (interaction, { storage }) => {
    if (!interaction.isCommand()) return;
    
    try {
      await interaction.deferReply();
    } catch (error) {
      console.error('Failed to defer timeout interaction:', error);
      return;
    }
    
    try {
      if (!interaction.guild) {
        await interaction.editReply('❌ This command can only be used in a server.');
        return;
      }
      
      const targetUser = interaction.options.getUser('user', true);
      const durationStr = interaction.options.getString('duration', true);
      const reason = interaction.options.getString('reason') || 'No reason provided';
      
      // Parse duration string
      const durationMatch = durationStr.match(/^(\d+)([smhdw])$/i);
      if (!durationMatch) {
        await interaction.editReply('❌ Invalid duration format. Use: 10s, 10m, 1h, 1d, or 1w');
        return;
      }
      
      const amount = parseInt(durationMatch[1]);
      const unit = durationMatch[2].toLowerCase();
      
      let durationMs: number;
      let durationDisplay: string;
      
      switch (unit) {
        case 's':
          durationMs = amount * 1000;
          durationDisplay = `${amount} second(s)`;
          break;
        case 'm':
          durationMs = amount * 60 * 1000;
          durationDisplay = `${amount} minute(s)`;
          break;
        case 'h':
          durationMs = amount * 60 * 60 * 1000;
          durationDisplay = `${amount} hour(s)`;
          break;
        case 'd':
          durationMs = amount * 24 * 60 * 60 * 1000;
          durationDisplay = `${amount} day(s)`;
          break;
        case 'w':
          durationMs = amount * 7 * 24 * 60 * 60 * 1000;
          durationDisplay = `${amount} week(s)`;
          break;
        default:
          await interaction.editReply('❌ Invalid duration unit.');
          return;
      }
      
      // Discord max timeout is 28 days
      if (durationMs > 28 * 24 * 60 * 60 * 1000) {
        await interaction.editReply('❌ Maximum timeout duration is 28 days.');
        return;
      }
      
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      
      if (!member) {
        await interaction.editReply('❌ User is not in this server.');
        return;
      }
      
      if (!member.moderatable) {
        await interaction.editReply('❌ I cannot timeout this user. They may have higher permissions than me.');
        return;
      }
      
      if (member.id === interaction.user.id) {
        await interaction.editReply('❌ You cannot timeout yourself!');
        return;
      }
      
      await member.timeout(durationMs, `${reason} | Timed out by ${interaction.user.tag}`);
      
      const embed = new EmbedBuilder()
        .setTitle('⏰ User Timed Out')
        .setDescription(`**${targetUser.tag}** has been timed out.`)
        .addFields(
          { name: 'User', value: `<@${targetUser.id}>`, inline: true },
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Duration', value: durationDisplay, inline: true },
          { name: 'Reason', value: reason, inline: false }
        )
        .setColor('#FEE75C')
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      console.log(`[Discord] ${interaction.user.tag} timed out ${targetUser.tag} for ${durationDisplay} in ${interaction.guild.name}`);
      
    } catch (error) {
      console.error('Error executing timeout command:', error);
      await interaction.editReply('❌ Failed to timeout user. Please check my permissions and try again.');
    }
  }
};

commands.set('timeout', timeoutCommand);
console.log('[Discord] Registered Timeout command');

// /warn command
const warnCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a warning to a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to warn')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the warning')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  execute: async (interaction, { storage }) => {
    if (!interaction.isCommand()) return;
    
    try {
      await interaction.deferReply();
    } catch (error) {
      console.error('Failed to defer warn interaction:', error);
      return;
    }
    
    try {
      if (!interaction.guild) {
        await interaction.editReply('❌ This command can only be used in a server.');
        return;
      }
      
      const targetUser = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason', true);
      
      const warningKey = `${interaction.guild.id}-${targetUser.id}`;
      const warnings = userWarnings.get(warningKey) || [];
      
      const newWarning = {
        moderator: interaction.user.id,
        reason,
        timestamp: new Date()
      };
      
      warnings.push(newWarning);
      userWarnings.set(warningKey, warnings);
      
      const embed = new EmbedBuilder()
        .setTitle('⚠️ Warning Issued')
        .setDescription(`**${targetUser.tag}** has received a warning.`)
        .addFields(
          { name: 'Warned User', value: `<@${targetUser.id}>`, inline: true },
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Total Warnings', value: `${warnings.length}`, inline: true },
          { name: 'Reason', value: reason, inline: false }
        )
        .setColor('#FEE75C')
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      console.log(`[Discord] ${interaction.user.tag} warned ${targetUser.tag} in ${interaction.guild.name} (total: ${warnings.length})`);
      
    } catch (error) {
      console.error('Error executing warn command:', error);
      await interaction.editReply('❌ Failed to issue warning. Please try again.');
    }
  }
};

commands.set('warn', warnCommand);
console.log('[Discord] Registered Warn command');

// /warnings command
const warningsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View warnings for a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to check warnings for (default: yourself)')
        .setRequired(false)
    ),
  execute: async (interaction, { storage }) => {
    if (!interaction.isCommand()) return;
    
    try {
      await interaction.deferReply();
    } catch (error) {
      console.error('Failed to defer warnings interaction:', error);
      return;
    }
    
    try {
      if (!interaction.guild) {
        await interaction.editReply('❌ This command can only be used in a server.');
        return;
      }
      
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const warningKey = `${interaction.guild.id}-${targetUser.id}`;
      const warnings = userWarnings.get(warningKey) || [];
      
      if (warnings.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('📋 User Warnings')
          .setDescription(`**${targetUser.tag}** has no warnings. 🎉`)
          .setColor('#57F287')
          .setThumbnail(targetUser.displayAvatarURL())
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        return;
      }
      
      const embed = new EmbedBuilder()
        .setTitle(`📋 Warnings for ${targetUser.tag}`)
        .setDescription(`Total warnings: **${warnings.length}**`)
        .setColor('#FEE75C')
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp();
      
      warnings.slice(-10).forEach((warning, index) => {
        embed.addFields({
          name: `Warning #${index + 1} - ${warning.timestamp.toLocaleDateString()}`,
          value: `**Reason:** ${warning.reason}\n**Moderator:** <@${warning.moderator}>`,
          inline: false
        });
      });
      
      if (warnings.length > 10) {
        embed.setFooter({ text: `Showing last 10 of ${warnings.length} warnings` });
      }
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error executing warnings command:', error);
      await interaction.editReply('❌ Failed to retrieve warnings. Please try again.');
    }
  }
};

commands.set('warnings', warningsCommand);
console.log('[Discord] Registered Warnings command');

// /purge command
const purgeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete multiple messages from the channel')
    .addIntegerOption(option =>
      option.setName('count')
        .setDescription('Number of messages to delete (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Only delete messages from this user')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  execute: async (interaction, { storage }) => {
    if (!interaction.isCommand()) return;
    
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (error) {
      console.error('Failed to defer purge interaction:', error);
      return;
    }
    
    try {
      if (!interaction.guild || !interaction.channel || !interaction.channel.isTextBased()) {
        await interaction.editReply('❌ This command can only be used in a text channel.');
        return;
      }
      
      const count = interaction.options.getInteger('count', true);
      const targetUser = interaction.options.getUser('user');
      
      // Fetch messages
      const messages = await interaction.channel.messages.fetch({ limit: 100 });
      
      // Filter messages if user specified
      let messagesToDelete = [...messages.values()];
      if (targetUser) {
        messagesToDelete = messagesToDelete.filter(msg => msg.author.id === targetUser.id);
      }
      
      // Only get messages less than 14 days old (Discord limitation)
      const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
      messagesToDelete = messagesToDelete.filter(msg => msg.createdTimestamp > fourteenDaysAgo);
      
      // Limit to requested count
      messagesToDelete = messagesToDelete.slice(0, count);
      
      if (messagesToDelete.length === 0) {
        await interaction.editReply('❌ No deletable messages found (messages must be less than 14 days old).');
        return;
      }
      
      // Bulk delete
      if ('bulkDelete' in interaction.channel) {
        const deleted = await interaction.channel.bulkDelete(messagesToDelete, true);
        
        const embed = new EmbedBuilder()
          .setTitle('🗑️ Messages Purged')
          .setDescription(`Successfully deleted **${deleted.size}** message(s).`)
          .addFields(
            { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: true }
          )
          .setColor('#57F287')
          .setTimestamp();
        
        if (targetUser) {
          embed.addFields({ name: 'Filtered User', value: `<@${targetUser.id}>`, inline: true });
        }
        
        await interaction.editReply({ embeds: [embed] });
        console.log(`[Discord] ${interaction.user.tag} purged ${deleted.size} messages in ${interaction.guild.name}`);
      }
      
    } catch (error) {
      console.error('Error executing purge command:', error);
      await interaction.editReply('❌ Failed to purge messages. Please check my permissions and try again.');
    }
  }
};

commands.set('purge', purgeCommand);
console.log('[Discord] Registered Purge command');

// /slowmode command
const slowmodeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set slowmode for the channel')
    .addIntegerOption(option =>
      option.setName('seconds')
        .setDescription('Slowmode duration in seconds (0 to disable, max 21600)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  execute: async (interaction, { storage }) => {
    if (!interaction.isCommand()) return;
    
    try {
      await interaction.deferReply();
    } catch (error) {
      console.error('Failed to defer slowmode interaction:', error);
      return;
    }
    
    try {
      if (!interaction.guild || !interaction.channel) {
        await interaction.editReply('❌ This command can only be used in a channel.');
        return;
      }
      
      const seconds = interaction.options.getInteger('seconds', true);
      
      if (!('setRateLimitPerUser' in interaction.channel)) {
        await interaction.editReply('❌ Slowmode cannot be set in this channel type.');
        return;
      }
      
      await interaction.channel.setRateLimitPerUser(seconds);
      
      let description: string;
      if (seconds === 0) {
        description = 'Slowmode has been **disabled** for this channel.';
      } else if (seconds < 60) {
        description = `Slowmode set to **${seconds} second(s)**.`;
      } else if (seconds < 3600) {
        description = `Slowmode set to **${Math.floor(seconds / 60)} minute(s)**.`;
      } else {
        description = `Slowmode set to **${Math.floor(seconds / 3600)} hour(s)**.`;
      }
      
      const embed = new EmbedBuilder()
        .setTitle('🐌 Slowmode Updated')
        .setDescription(description)
        .addFields(
          { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: true },
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true }
        )
        .setColor(seconds === 0 ? '#57F287' : '#5865F2')
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      console.log(`[Discord] ${interaction.user.tag} set slowmode to ${seconds}s in ${interaction.guild.name}`);
      
    } catch (error) {
      console.error('Error executing slowmode command:', error);
      await interaction.editReply('❌ Failed to set slowmode. Please check my permissions and try again.');
    }
  }
};

commands.set('slowmode', slowmodeCommand);
console.log('[Discord] Registered Slowmode command');

// ==================== UTILITY COMMANDS ====================

// /userinfo command
const userinfoCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Get information about a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to get information about (default: yourself)')
        .setRequired(false)
    ),
  execute: async (interaction, { storage }) => {
    if (!interaction.isCommand()) return;
    
    try {
      await interaction.deferReply();
    } catch (error) {
      console.error('Failed to defer userinfo interaction:', error);
      return;
    }
    
    try {
      if (!interaction.guild) {
        await interaction.editReply('❌ This command can only be used in a server.');
        return;
      }
      
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      
      const accountAge = Math.floor((Date.now() - targetUser.createdTimestamp) / (1000 * 60 * 60 * 24));
      
      const embed = new EmbedBuilder()
        .setTitle(`👤 ${targetUser.tag}`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: '🆔 User ID', value: targetUser.id, inline: true },
          { name: '🤖 Bot', value: targetUser.bot ? 'Yes' : 'No', inline: true },
          { name: '📅 Account Created', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true }
        )
        .setColor('#5865F2')
        .setTimestamp();
      
      if (member) {
        const joinAge = Math.floor((Date.now() - (member.joinedTimestamp || 0)) / (1000 * 60 * 60 * 24));
        const roles = member.roles.cache
          .filter(role => role.id !== interaction.guild!.id)
          .sort((a, b) => b.position - a.position)
          .map(role => `<@&${role.id}>`)
          .slice(0, 10);
        
        embed.addFields(
          { name: '📥 Joined Server', value: `<t:${Math.floor((member.joinedTimestamp || 0) / 1000)}:R>`, inline: true },
          { name: '📛 Nickname', value: member.nickname || 'None', inline: true },
          { name: '🎨 Display Color', value: member.displayHexColor || '#000000', inline: true },
          { name: `🏷️ Roles (${member.roles.cache.size - 1})`, value: roles.length > 0 ? roles.join(', ') : 'None', inline: false }
        );
        
        if (member.premiumSince) {
          embed.addFields({
            name: '💎 Boosting Since',
            value: `<t:${Math.floor(member.premiumSinceTimestamp! / 1000)}:R>`,
            inline: true
          });
        }
      } else {
        embed.addFields({ name: '📥 Server Member', value: 'Not in this server', inline: true });
      }
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error executing userinfo command:', error);
      await interaction.editReply('❌ Failed to get user information. Please try again.');
    }
  }
};

commands.set('userinfo', userinfoCommand);
console.log('[Discord] Registered Userinfo command');

// /serverinfo command
const serverinfoCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Get information about this server'),
  execute: async (interaction, { storage }) => {
    if (!interaction.isCommand()) return;
    
    try {
      await interaction.deferReply();
    } catch (error) {
      console.error('Failed to defer serverinfo interaction:', error);
      return;
    }
    
    try {
      if (!interaction.guild) {
        await interaction.editReply('❌ This command can only be used in a server.');
        return;
      }
      
      const guild = interaction.guild;
      await guild.fetch();
      
      const owner = await guild.fetchOwner().catch(() => null);
      const channels = guild.channels.cache;
      const textChannels = channels.filter(c => c.type === 0).size;
      const voiceChannels = channels.filter(c => c.type === 2).size;
      const categories = channels.filter(c => c.type === 4).size;
      
      const boostTier = ['None', 'Tier 1', 'Tier 2', 'Tier 3'][guild.premiumTier] || 'None';
      
      const embed = new EmbedBuilder()
        .setTitle(`📊 ${guild.name}`)
        .setThumbnail(guild.iconURL({ size: 256 }) || '')
        .addFields(
          { name: '🆔 Server ID', value: guild.id, inline: true },
          { name: '👑 Owner', value: owner ? `<@${owner.id}>` : 'Unknown', inline: true },
          { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
          { name: '👥 Members', value: `${guild.memberCount.toLocaleString()}`, inline: true },
          { name: '🏷️ Roles', value: `${guild.roles.cache.size}`, inline: true },
          { name: '😀 Emojis', value: `${guild.emojis.cache.size}`, inline: true },
          { name: '📝 Text Channels', value: `${textChannels}`, inline: true },
          { name: '🔊 Voice Channels', value: `${voiceChannels}`, inline: true },
          { name: '📁 Categories', value: `${categories}`, inline: true },
          { name: '💎 Boost Level', value: boostTier, inline: true },
          { name: '🚀 Boosts', value: `${guild.premiumSubscriptionCount || 0}`, inline: true },
          { name: '🔒 Verification Level', value: ['None', 'Low', 'Medium', 'High', 'Very High'][guild.verificationLevel] || 'Unknown', inline: true }
        )
        .setColor('#5865F2')
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();
      
      if (guild.description) {
        embed.setDescription(guild.description);
      }
      
      if (guild.bannerURL()) {
        embed.setImage(guild.bannerURL({ size: 512 }) || '');
      }
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error executing serverinfo command:', error);
      await interaction.editReply('❌ Failed to get server information. Please try again.');
    }
  }
};

commands.set('serverinfo', serverinfoCommand);
console.log('[Discord] Registered Serverinfo command');

// /avatar command
const avatarCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Get a user\'s avatar in full size')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to get the avatar of (default: yourself)')
        .setRequired(false)
    ),
  execute: async (interaction, { storage }) => {
    if (!interaction.isCommand()) return;
    
    try {
      await interaction.deferReply();
    } catch (error) {
      console.error('Failed to defer avatar interaction:', error);
      return;
    }
    
    try {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      
      const avatarUrl = targetUser.displayAvatarURL({ size: 4096 });
      
      const embed = new EmbedBuilder()
        .setTitle(`🖼️ ${targetUser.tag}'s Avatar`)
        .setImage(avatarUrl)
        .setColor('#5865F2')
        .setTimestamp();
      
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setLabel('Open in Browser')
            .setStyle(ButtonStyle.Link)
            .setURL(avatarUrl)
        );
      
      await interaction.editReply({ embeds: [embed], components: [row] });
      
    } catch (error) {
      console.error('Error executing avatar command:', error);
      await interaction.editReply('❌ Failed to get avatar. Please try again.');
    }
  }
};

commands.set('avatar', avatarCommand);
console.log('[Discord] Registered Avatar command');

// /poll command
const pollCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a poll with emoji reactions')
    .addStringOption(option =>
      option.setName('question')
        .setDescription('The poll question')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('choices')
        .setDescription('Comma-separated choices (e.g., "Yes, No, Maybe")')
        .setRequired(true)
    ),
  execute: async (interaction, { storage }) => {
    if (!interaction.isCommand()) return;
    
    try {
      await interaction.deferReply();
    } catch (error) {
      console.error('Failed to defer poll interaction:', error);
      return;
    }
    
    try {
      const question = interaction.options.getString('question', true);
      const choicesStr = interaction.options.getString('choices', true);
      
      const choices = choicesStr.split(',').map(c => c.trim()).filter(c => c.length > 0);
      
      if (choices.length < 2) {
        await interaction.editReply('❌ Please provide at least 2 choices separated by commas.');
        return;
      }
      
      if (choices.length > 10) {
        await interaction.editReply('❌ Maximum 10 choices allowed.');
        return;
      }
      
      const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
      
      const optionsList = choices.map((choice, index) => `${emojis[index]} ${choice}`).join('\n\n');
      
      const embed = new EmbedBuilder()
        .setTitle(`📊 ${question}`)
        .setDescription(optionsList)
        .setColor('#5865F2')
        .setFooter({ text: `Poll by ${interaction.user.tag} • React to vote!` })
        .setTimestamp();
      
      const message = await interaction.editReply({ embeds: [embed] });
      
      // Add reactions
      for (let i = 0; i < choices.length; i++) {
        try {
          await message.react(emojis[i]);
        } catch (e) {
          console.error(`Failed to add reaction ${emojis[i]}:`, e);
        }
      }
      
    } catch (error) {
      console.error('Error executing poll command:', error);
      await interaction.editReply('❌ Failed to create poll. Please try again.');
    }
  }
};

commands.set('poll', pollCommand);
console.log('[Discord] Registered Poll command');

// ==================== FUN COMMANDS ====================

// /8ball command
const eightBallCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Ask the magic 8-ball a question')
    .addStringOption(option =>
      option.setName('question')
        .setDescription('Your question for the 8-ball')
        .setRequired(true)
    ),
  execute: async (interaction, { storage }) => {
    if (!interaction.isCommand()) return;
    
    try {
      await interaction.deferReply();
    } catch (error) {
      console.error('Failed to defer 8ball interaction:', error);
      return;
    }
    
    try {
      const question = interaction.options.getString('question', true);
      
      const responses = [
        { answer: 'It is certain.', type: 'positive' },
        { answer: 'It is decidedly so.', type: 'positive' },
        { answer: 'Without a doubt.', type: 'positive' },
        { answer: 'Yes, definitely.', type: 'positive' },
        { answer: 'You may rely on it.', type: 'positive' },
        { answer: 'As I see it, yes.', type: 'positive' },
        { answer: 'Most likely.', type: 'positive' },
        { answer: 'Outlook good.', type: 'positive' },
        { answer: 'Yes.', type: 'positive' },
        { answer: 'Signs point to yes.', type: 'positive' },
        { answer: 'Reply hazy, try again.', type: 'neutral' },
        { answer: 'Ask again later.', type: 'neutral' },
        { answer: 'Better not tell you now.', type: 'neutral' },
        { answer: 'Cannot predict now.', type: 'neutral' },
        { answer: 'Concentrate and ask again.', type: 'neutral' },
        { answer: "Don't count on it.", type: 'negative' },
        { answer: 'My reply is no.', type: 'negative' },
        { answer: 'My sources say no.', type: 'negative' },
        { answer: 'Outlook not so good.', type: 'negative' },
        { answer: 'Very doubtful.', type: 'negative' }
      ];
      
      const response = responses[Math.floor(Math.random() * responses.length)];
      
      const colors = {
        positive: '#57F287',
        neutral: '#FEE75C',
        negative: '#ED4245'
      };
      
      const embed = new EmbedBuilder()
        .setTitle('🎱 Magic 8-Ball')
        .addFields(
          { name: '❓ Question', value: question, inline: false },
          { name: '🔮 Answer', value: response.answer, inline: false }
        )
        .setColor(colors[response.type as keyof typeof colors])
        .setFooter({ text: `Asked by ${interaction.user.tag}` })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error executing 8ball command:', error);
      await interaction.editReply('❌ The magic 8-ball is cloudy. Please try again.');
    }
  }
};

commands.set('8ball', eightBallCommand);
console.log('[Discord] Registered 8ball command');

// /roll command
const rollCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Roll dice')
    .addStringOption(option =>
      option.setName('dice')
        .setDescription('Dice notation (e.g., d20, 2d6, 3d8+5). Default: d20')
        .setRequired(false)
    ),
  execute: async (interaction, { storage }) => {
    if (!interaction.isCommand()) return;
    
    try {
      await interaction.deferReply();
    } catch (error) {
      console.error('Failed to defer roll interaction:', error);
      return;
    }
    
    try {
      const diceStr = interaction.options.getString('dice') || 'd20';
      
      // Parse dice notation: NdS+M or NdS-M or dS
      const diceMatch = diceStr.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
      
      if (!diceMatch) {
        await interaction.editReply('❌ Invalid dice notation. Use format like: d20, 2d6, 3d8+5, d100-2');
        return;
      }
      
      const numDice = parseInt(diceMatch[1] || '1');
      const sides = parseInt(diceMatch[2]);
      const modifier = parseInt(diceMatch[3] || '0');
      
      if (numDice < 1 || numDice > 100) {
        await interaction.editReply('❌ Number of dice must be between 1 and 100.');
        return;
      }
      
      if (sides < 2 || sides > 1000) {
        await interaction.editReply('❌ Number of sides must be between 2 and 1000.');
        return;
      }
      
      const rolls: number[] = [];
      for (let i = 0; i < numDice; i++) {
        rolls.push(Math.floor(Math.random() * sides) + 1);
      }
      
      const subtotal = rolls.reduce((a, b) => a + b, 0);
      const total = subtotal + modifier;
      
      let modifierStr = '';
      if (modifier !== 0) {
        modifierStr = modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`;
      }
      
      const embed = new EmbedBuilder()
        .setTitle('🎲 Dice Roll')
        .setDescription(`Rolling **${diceStr}**`)
        .addFields(
          { name: '🎯 Rolls', value: rolls.join(', '), inline: true },
          { name: '📊 Total', value: `**${total}**${modifierStr ? ` (${subtotal}${modifierStr})` : ''}`, inline: true }
        )
        .setColor('#5865F2')
        .setFooter({ text: `Rolled by ${interaction.user.tag}` })
        .setTimestamp();
      
      // Special styling for nat 20 or nat 1 on d20
      if (numDice === 1 && sides === 20 && modifier === 0) {
        if (rolls[0] === 20) {
          embed.setColor('#FFD700').setTitle('🎲 NATURAL 20! 🌟');
        } else if (rolls[0] === 1) {
          embed.setColor('#ED4245').setTitle('🎲 Critical Fail! 💀');
        }
      }
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error executing roll command:', error);
      await interaction.editReply('❌ Failed to roll dice. Please try again.');
    }
  }
};

commands.set('roll', rollCommand);
console.log('[Discord] Registered Roll command');

// /coinflip command
const coinflipCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Flip a coin'),
  execute: async (interaction, { storage }) => {
    if (!interaction.isCommand()) return;
    
    try {
      await interaction.deferReply();
    } catch (error) {
      console.error('Failed to defer coinflip interaction:', error);
      return;
    }
    
    try {
      const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
      const emoji = result === 'Heads' ? '👑' : '🔢';
      
      const embed = new EmbedBuilder()
        .setTitle('🪙 Coin Flip')
        .setDescription(`The coin lands on...\n\n# ${emoji} ${result}!`)
        .setColor(result === 'Heads' ? '#FFD700' : '#C0C0C0')
        .setFooter({ text: `Flipped by ${interaction.user.tag}` })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error executing coinflip command:', error);
      await interaction.editReply('❌ The coin rolled away! Please try again.');
    }
  }
};

commands.set('coinflip', coinflipCommand);
console.log('[Discord] Registered Coinflip command');

// /choose command
const chooseCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('choose')
    .setDescription('Let the bot choose from a list of options')
    .addStringOption(option =>
      option.setName('options')
        .setDescription('Comma-separated options (e.g., "Pizza, Burger, Tacos")')
        .setRequired(true)
    ),
  execute: async (interaction, { storage }) => {
    if (!interaction.isCommand()) return;
    
    try {
      await interaction.deferReply();
    } catch (error) {
      console.error('Failed to defer choose interaction:', error);
      return;
    }
    
    try {
      const optionsStr = interaction.options.getString('options', true);
      const options = optionsStr.split(',').map(o => o.trim()).filter(o => o.length > 0);
      
      if (options.length < 2) {
        await interaction.editReply('❌ Please provide at least 2 options separated by commas.');
        return;
      }
      
      const choice = options[Math.floor(Math.random() * options.length)];
      
      const embed = new EmbedBuilder()
        .setTitle('🤔 I Choose...')
        .setDescription(`From the options:\n${options.map(o => `• ${o}`).join('\n')}\n\n**I choose:** 🎯 **${choice}**`)
        .setColor('#5865F2')
        .setFooter({ text: `Asked by ${interaction.user.tag}` })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error executing choose command:', error);
      await interaction.editReply('❌ I couldn\'t make a decision. Please try again.');
    }
  }
};

commands.set('choose', chooseCommand);
console.log('[Discord] Registered Choose command');

import { calculateLevel, calculateXpForLevel, calculateProgressToNextLevel, replaceWelcomeVariables } from './community-features';

// /starboard command
const starboardCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('starboard')
    .setDescription('Configure the starboard system')
    .addSubcommand(subcommand =>
      subcommand.setName('setup')
        .setDescription('Set up the starboard channel and settings')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('The channel to post starred messages to')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option.setName('threshold')
            .setDescription('Minimum reactions needed (default: 3)')
            .setMinValue(1)
            .setMaxValue(50)
            .setRequired(false)
        )
        .addStringOption(option =>
          option.setName('emoji')
            .setDescription('The emoji to track (default: ⭐)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand.setName('disable')
        .setDescription('Disable the starboard')
    )
    .addSubcommand(subcommand =>
      subcommand.setName('status')
        .setDescription('View current starboard settings')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) as SlashCommandSubcommandsOnlyBuilder,
  execute: async (interaction, { storage }) => {
    if (!interaction.isCommand() || !interaction.guildId) return;
    
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (error) {
      console.error('Failed to defer starboard interaction:', error);
      return;
    }
    
    const subcommand = interaction.options.getSubcommand();
    
    try {
      if (subcommand === 'setup') {
        const channel = interaction.options.getChannel('channel', true);
        const threshold = interaction.options.getInteger('threshold') || 3;
        const emoji = interaction.options.getString('emoji') || '⭐';
        
        let settings = await storage.getBotSettings(interaction.guildId);
        if (!settings) {
          settings = await storage.createBotSettings({ serverId: interaction.guildId });
        }
        
        await storage.updateBotSettings(interaction.guildId, {
          starboardChannelId: channel.id,
          starboardThreshold: threshold,
          starboardEmoji: emoji,
          starboardEnabled: true
        });
        
        const embed = new EmbedBuilder()
          .setTitle('⭐ Starboard Configured!')
          .setDescription(`Starboard has been set up successfully.`)
          .addFields(
            { name: 'Channel', value: `<#${channel.id}>`, inline: true },
            { name: 'Threshold', value: `${threshold} reactions`, inline: true },
            { name: 'Emoji', value: emoji, inline: true }
          )
          .setColor('#FFD700')
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === 'disable') {
        await storage.updateBotSettings(interaction.guildId, { starboardEnabled: false });
        await interaction.editReply('⭐ Starboard has been disabled.');
      } else if (subcommand === 'status') {
        const settings = await storage.getBotSettings(interaction.guildId);
        
        if (!settings?.starboardEnabled) {
          await interaction.editReply('⭐ Starboard is currently disabled.');
          return;
        }
        
        const embed = new EmbedBuilder()
          .setTitle('⭐ Starboard Status')
          .addFields(
            { name: 'Status', value: '✅ Enabled', inline: true },
            { name: 'Channel', value: settings.starboardChannelId ? `<#${settings.starboardChannelId}>` : 'Not set', inline: true },
            { name: 'Threshold', value: `${settings.starboardThreshold || 3} reactions`, inline: true },
            { name: 'Emoji', value: settings.starboardEmoji || '⭐', inline: true }
          )
          .setColor('#FFD700')
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Error executing starboard command:', error);
      await interaction.editReply('❌ Failed to update starboard settings.');
    }
  }
};

commands.set('starboard', starboardCommand);
console.log('[Discord] Registered Starboard command');

// /welcome command
const welcomeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Configure welcome/goodbye messages')
    .addSubcommand(subcommand =>
      subcommand.setName('setup')
        .setDescription('Set up the welcome channel and message')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('The channel to send welcome messages to')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('message')
            .setDescription('Welcome message (use {user}, {server}, {memberCount})')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand.setName('goodbye')
        .setDescription('Set the goodbye message')
        .addStringOption(option =>
          option.setName('message')
            .setDescription('Goodbye message (use {user}, {server}, {memberCount})')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand.setName('test')
        .setDescription('Preview your welcome message')
    )
    .addSubcommand(subcommand =>
      subcommand.setName('toggle')
        .setDescription('Enable or disable welcome/goodbye messages')
        .addStringOption(option =>
          option.setName('type')
            .setDescription('Which type to toggle')
            .setRequired(true)
            .addChoices(
              { name: 'Welcome', value: 'welcome' },
              { name: 'Goodbye', value: 'goodbye' }
            )
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) as SlashCommandSubcommandsOnlyBuilder,
  execute: async (interaction, { storage }) => {
    if (!interaction.isCommand() || !interaction.guildId || !interaction.guild) return;
    
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (error) {
      console.error('Failed to defer welcome interaction:', error);
      return;
    }
    
    const subcommand = interaction.options.getSubcommand();
    
    try {
      let settings = await storage.getBotSettings(interaction.guildId);
      if (!settings) {
        settings = await storage.createBotSettings({ serverId: interaction.guildId });
      }
      
      if (subcommand === 'setup') {
        const channel = interaction.options.getChannel('channel', true);
        const message = interaction.options.getString('message') || 'Welcome to {server}, {user}! You are member #{memberCount}.';
        
        await storage.updateBotSettings(interaction.guildId, {
          welcomeChannelId: channel.id,
          welcomeMessageTemplate: message,
          welcomeEnabled: true
        });
        
        const embed = new EmbedBuilder()
          .setTitle('👋 Welcome Messages Configured!')
          .setDescription(`Welcome messages will be sent to <#${channel.id}>`)
          .addFields({ name: 'Message Template', value: message })
          .setColor('#57F287')
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === 'goodbye') {
        const message = interaction.options.getString('message', true);
        
        await storage.updateBotSettings(interaction.guildId, {
          goodbyeMessageTemplate: message,
          goodbyeEnabled: true
        });
        
        await interaction.editReply(`✅ Goodbye message updated to: ${message}`);
      } else if (subcommand === 'test') {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const template = settings.welcomeMessageTemplate || 'Welcome to {server}, {user}! You are member #{memberCount}.';
        const previewMessage = replaceWelcomeVariables(template, member);
        
        const embed = new EmbedBuilder()
          .setTitle('👋 Welcome!')
          .setDescription(previewMessage)
          .setColor('#57F287')
          .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
          .setFooter({ text: `Member #${interaction.guild.memberCount}` })
          .setTimestamp();
        
        await interaction.editReply({ content: '**Preview of your welcome message:**', embeds: [embed] });
      } else if (subcommand === 'toggle') {
        const type = interaction.options.getString('type', true);
        
        if (type === 'welcome') {
          const newState = !settings.welcomeEnabled;
          await storage.updateBotSettings(interaction.guildId, { welcomeEnabled: newState });
          await interaction.editReply(`👋 Welcome messages are now ${newState ? 'enabled ✅' : 'disabled ❌'}`);
        } else {
          const newState = !settings.goodbyeEnabled;
          await storage.updateBotSettings(interaction.guildId, { goodbyeEnabled: newState });
          await interaction.editReply(`👋 Goodbye messages are now ${newState ? 'enabled ✅' : 'disabled ❌'}`);
        }
      }
    } catch (error) {
      console.error('Error executing welcome command:', error);
      await interaction.editReply('❌ Failed to update welcome settings.');
    }
  }
};

commands.set('welcome', welcomeCommand);
console.log('[Discord] Registered Welcome command');

// /autorole command
const autoroleCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Manage automatic role assignment on join')
    .addSubcommand(subcommand =>
      subcommand.setName('add')
        .setDescription('Add a role to be auto-assigned on join')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('The role to auto-assign')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand.setName('remove')
        .setDescription('Remove a role from auto-assignment')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('The role to remove from auto-assignment')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand.setName('list')
        .setDescription('List all auto-assigned roles')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles) as SlashCommandSubcommandsOnlyBuilder,
  execute: async (interaction, { storage }) => {
    if (!interaction.isCommand() || !interaction.guildId || !interaction.guild) return;
    
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (error) {
      console.error('Failed to defer autorole interaction:', error);
      return;
    }
    
    const subcommand = interaction.options.getSubcommand();
    
    try {
      let settings = await storage.getBotSettings(interaction.guildId);
      if (!settings) {
        settings = await storage.createBotSettings({ serverId: interaction.guildId });
      }
      
      let roleIds: string[] = [];
      try {
        roleIds = settings.autoRoleIds ? JSON.parse(settings.autoRoleIds) : [];
      } catch (e) {
        roleIds = [];
      }
      
      if (subcommand === 'add') {
        const role = interaction.options.getRole('role', true);
        
        if (roleIds.includes(role.id)) {
          await interaction.editReply(`❌ ${role.name} is already in the autorole list.`);
          return;
        }
        
        const botMember = interaction.guild.members.me;
        if (botMember && role.position >= botMember.roles.highest.position) {
          await interaction.editReply(`❌ I cannot assign ${role.name} because it's equal to or higher than my highest role.`);
          return;
        }
        
        roleIds.push(role.id);
        await storage.updateBotSettings(interaction.guildId, { autoRoleIds: JSON.stringify(roleIds) });
        
        await interaction.editReply(`✅ Added **${role.name}** to autoroles. New members will receive this role automatically.`);
      } else if (subcommand === 'remove') {
        const role = interaction.options.getRole('role', true);
        
        if (!roleIds.includes(role.id)) {
          await interaction.editReply(`❌ ${role.name} is not in the autorole list.`);
          return;
        }
        
        roleIds = roleIds.filter(id => id !== role.id);
        await storage.updateBotSettings(interaction.guildId, { autoRoleIds: JSON.stringify(roleIds) });
        
        await interaction.editReply(`✅ Removed **${role.name}** from autoroles.`);
      } else if (subcommand === 'list') {
        if (roleIds.length === 0) {
          await interaction.editReply('📋 No autoroles configured. Use `/autorole add` to add roles.');
          return;
        }
        
        const roleList = roleIds.map(id => `<@&${id}>`).join('\n');
        
        const embed = new EmbedBuilder()
          .setTitle('📋 Auto-Assigned Roles')
          .setDescription(`The following roles are automatically assigned to new members:\n\n${roleList}`)
          .setColor('#5865F2')
          .setFooter({ text: `${roleIds.length} role(s) configured` })
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Error executing autorole command:', error);
      await interaction.editReply('❌ Failed to update autorole settings.');
    }
  }
};

commands.set('autorole', autoroleCommand);
console.log('[Discord] Registered Autorole command');

// /rank command
const rankCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Check your or another user\'s XP and level')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to check (defaults to yourself)')
        .setRequired(false)
    ),
  execute: async (interaction, { storage }) => {
    if (!interaction.isCommand() || !interaction.guildId) return;
    
    try {
      await interaction.deferReply();
    } catch (error) {
      console.error('Failed to defer rank interaction:', error);
      return;
    }
    
    try {
      const settings = await storage.getBotSettings(interaction.guildId);
      if (!settings?.xpEnabled) {
        await interaction.editReply('❌ The leveling system is not enabled on this server.');
        return;
      }
      
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const userData = await storage.getXpData(interaction.guildId, targetUser.id);
      
      if (!userData) {
        await interaction.editReply(`${targetUser.id === interaction.user.id ? 'You have' : `${targetUser.username} has`} no XP yet. Start chatting to earn XP!`);
        return;
      }
      
      const rank = await storage.getUserRank(interaction.guildId, targetUser.id);
      const progress = calculateProgressToNextLevel(userData.xp, userData.level);
      const xpForNextLevel = Math.floor(calculateXpForLevel(userData.level + 1));
      const progressBar = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));
      
      const embed = new EmbedBuilder()
        .setTitle(`📊 ${targetUser.username}'s Rank`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: 'Rank', value: `#${rank}`, inline: true },
          { name: 'Level', value: `${userData.level}`, inline: true },
          { name: 'Total XP', value: `${userData.xp.toLocaleString()}`, inline: true },
          { name: 'Progress to Next Level', value: `${progressBar} ${progress}%\n${userData.xp.toLocaleString()} / ${xpForNextLevel.toLocaleString()} XP`, inline: false },
          { name: 'Messages', value: `${(userData.totalMessages || 0).toLocaleString()}`, inline: true }
        )
        .setColor('#5865F2')
        .setFooter({ text: `Keep chatting to level up!` })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error executing rank command:', error);
      await interaction.editReply('❌ Failed to fetch rank information.');
    }
  }
};

commands.set('rank', rankCommand);
console.log('[Discord] Registered Rank command');

// /leaderboard command
const leaderboardCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the server XP leaderboard')
    .addIntegerOption(option =>
      option.setName('page')
        .setDescription('Page number (default: 1)')
        .setMinValue(1)
        .setRequired(false)
    ),
  execute: async (interaction, { storage }) => {
    if (!interaction.isCommand() || !interaction.guildId) return;
    
    try {
      await interaction.deferReply();
    } catch (error) {
      console.error('Failed to defer leaderboard interaction:', error);
      return;
    }
    
    try {
      const settings = await storage.getBotSettings(interaction.guildId);
      if (!settings?.xpEnabled) {
        await interaction.editReply('❌ The leveling system is not enabled on this server.');
        return;
      }
      
      const page = interaction.options.getInteger('page') || 1;
      const perPage = 10;
      const offset = (page - 1) * perPage;
      
      const leaderboard = await storage.getServerLeaderboard(interaction.guildId, perPage, offset);
      
      if (leaderboard.length === 0) {
        await interaction.editReply(page === 1 
          ? '📊 No one has earned XP yet. Start chatting to be the first!'
          : '📊 No more entries on this page.');
        return;
      }
      
      const leaderboardEntries = leaderboard.map((entry, index) => {
        const position = offset + index + 1;
        const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `**${position}.**`;
        return `${medal} <@${entry.userId}> - Level ${entry.level} (${entry.xp.toLocaleString()} XP)`;
      }).join('\n');
      
      const embed = new EmbedBuilder()
        .setTitle(`🏆 ${interaction.guild?.name || 'Server'} Leaderboard`)
        .setDescription(leaderboardEntries)
        .setColor('#FFD700')
        .setFooter({ text: `Page ${page} • Use /leaderboard page:${page + 1} for more` })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error executing leaderboard command:', error);
      await interaction.editReply('❌ Failed to fetch leaderboard.');
    }
  }
};

commands.set('leaderboard', leaderboardCommand);
console.log('[Discord] Registered Leaderboard command');

// /xp command (admin)
const xpCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('xp')
    .setDescription('Manage the XP/leveling system')
    .addSubcommand(subcommand =>
      subcommand.setName('enable')
        .setDescription('Enable the XP system')
    )
    .addSubcommand(subcommand =>
      subcommand.setName('disable')
        .setDescription('Disable the XP system')
    )
    .addSubcommand(subcommand =>
      subcommand.setName('settings')
        .setDescription('Configure XP settings')
        .addIntegerOption(option =>
          option.setName('cooldown')
            .setDescription('Cooldown between XP gains in seconds (default: 60)')
            .setMinValue(10)
            .setMaxValue(600)
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option.setName('min_xp')
            .setDescription('Minimum XP per message (default: 15)')
            .setMinValue(1)
            .setMaxValue(100)
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option.setName('max_xp')
            .setDescription('Maximum XP per message (default: 25)')
            .setMinValue(1)
            .setMaxValue(100)
            .setRequired(false)
        )
        .addChannelOption(option =>
          option.setName('announce_channel')
            .setDescription('Channel for level-up announcements (leave empty for same channel)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand.setName('levelrole')
        .setDescription('Set a role reward for reaching a level')
        .addIntegerOption(option =>
          option.setName('level')
            .setDescription('The level to assign the role at')
            .setMinValue(1)
            .setRequired(true)
        )
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('The role to assign (leave empty to remove)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand.setName('status')
        .setDescription('View current XP system settings')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) as SlashCommandSubcommandsOnlyBuilder,
  execute: async (interaction, { storage }) => {
    if (!interaction.isCommand() || !interaction.guildId) return;
    
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (error) {
      console.error('Failed to defer xp interaction:', error);
      return;
    }
    
    const subcommand = interaction.options.getSubcommand();
    
    try {
      let settings = await storage.getBotSettings(interaction.guildId);
      if (!settings) {
        settings = await storage.createBotSettings({ serverId: interaction.guildId });
      }
      
      if (subcommand === 'enable') {
        await storage.updateBotSettings(interaction.guildId, { xpEnabled: true });
        await interaction.editReply('✅ XP system has been enabled! Members will now earn XP from chatting.');
      } else if (subcommand === 'disable') {
        await storage.updateBotSettings(interaction.guildId, { xpEnabled: false });
        await interaction.editReply('❌ XP system has been disabled.');
      } else if (subcommand === 'settings') {
        const cooldown = interaction.options.getInteger('cooldown');
        const minXp = interaction.options.getInteger('min_xp');
        const maxXp = interaction.options.getInteger('max_xp');
        const announceChannel = interaction.options.getChannel('announce_channel');
        
        const updates: any = {};
        if (cooldown !== null) updates.xpCooldownSeconds = cooldown;
        if (minXp !== null) updates.xpMinAmount = minXp;
        if (maxXp !== null) updates.xpMaxAmount = maxXp;
        if (announceChannel) updates.levelUpChannelId = announceChannel.id;
        
        if (Object.keys(updates).length === 0) {
          await interaction.editReply('❌ Please provide at least one setting to change.');
          return;
        }
        
        await storage.updateBotSettings(interaction.guildId, updates);
        
        const changes = [];
        if (cooldown !== null) changes.push(`Cooldown: ${cooldown}s`);
        if (minXp !== null) changes.push(`Min XP: ${minXp}`);
        if (maxXp !== null) changes.push(`Max XP: ${maxXp}`);
        if (announceChannel) changes.push(`Announce Channel: <#${announceChannel.id}>`);
        
        await interaction.editReply(`✅ XP settings updated:\n${changes.join('\n')}`);
      } else if (subcommand === 'levelrole') {
        const level = interaction.options.getInteger('level', true);
        const role = interaction.options.getRole('role');
        
        let levelRoles: Record<string, string> = {};
        try {
          levelRoles = settings.levelRoles ? JSON.parse(settings.levelRoles) : {};
        } catch (e) {
          levelRoles = {};
        }
        
        if (role) {
          levelRoles[level.toString()] = role.id;
          await storage.updateBotSettings(interaction.guildId, { levelRoles: JSON.stringify(levelRoles) });
          await interaction.editReply(`✅ Members reaching level ${level} will now receive the **${role.name}** role.`);
        } else {
          delete levelRoles[level.toString()];
          await storage.updateBotSettings(interaction.guildId, { levelRoles: JSON.stringify(levelRoles) });
          await interaction.editReply(`✅ Removed level role reward for level ${level}.`);
        }
      } else if (subcommand === 'status') {
        let levelRoles: Record<string, string> = {};
        try {
          levelRoles = settings.levelRoles ? JSON.parse(settings.levelRoles) : {};
        } catch (e) {
          levelRoles = {};
        }
        
        const roleRewards = Object.entries(levelRoles)
          .sort(([a], [b]) => parseInt(a) - parseInt(b))
          .map(([lvl, roleId]) => `Level ${lvl}: <@&${roleId}>`)
          .join('\n') || 'None configured';
        
        const embed = new EmbedBuilder()
          .setTitle('📊 XP System Status')
          .addFields(
            { name: 'Status', value: settings.xpEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: 'Cooldown', value: `${settings.xpCooldownSeconds || 60}s`, inline: true },
            { name: 'XP Range', value: `${settings.xpMinAmount || 15}-${settings.xpMaxAmount || 25}`, inline: true },
            { name: 'Announce Channel', value: settings.levelUpChannelId ? `<#${settings.levelUpChannelId}>` : 'Same channel', inline: true },
            { name: 'Level Roles', value: roleRewards, inline: false }
          )
          .setColor('#5865F2')
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Error executing xp command:', error);
      await interaction.editReply('❌ Failed to update XP settings.');
    }
  }
};

commands.set('xp', xpCommand);
console.log('[Discord] Registered XP command');

// Reaction Role command
const reactionRoleCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Manage reaction roles')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a reaction role')
        .addStringOption(option =>
          option.setName('message_id')
            .setDescription('The message ID to add the reaction role to')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('emoji')
            .setDescription('The emoji to react with')
            .setRequired(true))
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('The role to assign')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a reaction role')
        .addStringOption(option =>
          option.setName('message_id')
            .setDescription('The message ID')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('emoji')
            .setDescription('The emoji')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all reaction roles')) as SlashCommandSubcommandsOnlyBuilder,

  async execute(interaction: ChatInputCommandInteraction, context: CommandContext) {
    const subcommand = interaction.options.getSubcommand();
    const serverId = interaction.guildId!;
    
    await interaction.deferReply({ ephemeral: true });
    
    try {
      if (subcommand === 'create') {
        const messageId = interaction.options.getString('message_id', true);
        const emoji = interaction.options.getString('emoji', true);
        const role = interaction.options.getRole('role', true);
        
        const existingRole = await context.storage.getReactionRole(serverId, messageId, emoji);
        if (existingRole) {
          await interaction.editReply('❌ A reaction role with that emoji already exists on this message.');
          return;
        }
        
        let channel = interaction.channel;
        let message;
        
        try {
          if (channel && channel.isTextBased()) {
            message = await channel.messages.fetch(messageId).catch(() => null);
          }
          
          if (!message && interaction.guild) {
            for (const [, ch] of interaction.guild.channels.cache) {
              if (ch.isTextBased()) {
                message = await ch.messages.fetch(messageId).catch(() => null);
                if (message) {
                  channel = ch;
                  break;
                }
              }
            }
          }
        } catch (error) {
          console.error('[ReactionRole] Error fetching message:', error);
        }
        
        if (!message) {
          await interaction.editReply('❌ Could not find a message with that ID in any accessible channel.');
          return;
        }
        
        await context.storage.createReactionRole({
          serverId,
          messageId,
          channelId: channel!.id,
          emoji,
          roleId: role.id
        });
        
        try {
          await message.react(emoji);
        } catch (error) {
          console.error('[ReactionRole] Could not add reaction:', error);
        }
        
        await interaction.editReply(`✅ Reaction role created! React with ${emoji} to get <@&${role.id}>`);
        console.log(`[ReactionRole] Created: ${emoji} -> ${role.name} on message ${messageId}`);
        
      } else if (subcommand === 'remove') {
        const messageId = interaction.options.getString('message_id', true);
        const emoji = interaction.options.getString('emoji', true);
        
        const deleted = await context.storage.deleteReactionRole(serverId, messageId, emoji);
        
        if (deleted) {
          await interaction.editReply(`✅ Reaction role with ${emoji} removed.`);
          console.log(`[ReactionRole] Removed: ${emoji} from message ${messageId}`);
        } else {
          await interaction.editReply('❌ No reaction role found with that emoji on this message.');
        }
        
      } else if (subcommand === 'list') {
        const reactionRoles = await context.storage.getReactionRoles(serverId);
        
        if (reactionRoles.length === 0) {
          await interaction.editReply('No reaction roles configured for this server.');
          return;
        }
        
        const embed = new EmbedBuilder()
          .setTitle('🎭 Reaction Roles')
          .setColor('#5865F2')
          .setDescription(
            reactionRoles.map(rr => 
              `${rr.emoji} → <@&${rr.roleId}>\nMessage: \`${rr.messageId}\` in <#${rr.channelId}>`
            ).join('\n\n')
          )
          .setFooter({ text: `${reactionRoles.length} reaction role(s) configured` })
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Error executing reactionrole command:', error);
      await interaction.editReply('❌ Failed to execute reaction role command.');
    }
  }
};

commands.set('reactionrole', reactionRoleCommand);
console.log('[Discord] Registered reactionrole command');

// AFK command
const afkCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Set your AFK status')
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for being AFK')
        .setRequired(false)) as SlashCommandOptionsOnlyBuilder,

  async execute(interaction: ChatInputCommandInteraction, context: CommandContext) {
    const reason = interaction.options.getString('reason') || 'AFK';
    const serverId = interaction.guildId!;
    const userId = interaction.user.id;
    
    await interaction.deferReply();
    
    try {
      await context.storage.setAfkUser({
        serverId,
        userId,
        username: interaction.user.username,
        reason
      });
      
      if (interaction.member && 'setNickname' in interaction.member) {
        try {
          const currentNick = interaction.member.displayName || interaction.user.username;
          if (!currentNick.startsWith('[AFK]')) {
            const newNick = `[AFK] ${currentNick}`.substring(0, 32);
            await interaction.member.setNickname(newNick).catch(() => {});
          }
        } catch (error) {
          // Bot might not have permission to change nicknames
        }
      }
      
      const embed = new EmbedBuilder()
        .setDescription(`💤 **${interaction.user.username}** is now AFK: ${reason}`)
        .setColor('#FFA500')
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      console.log(`[AFK] ${interaction.user.username} set AFK: ${reason}`);
      
    } catch (error) {
      console.error('Error executing afk command:', error);
      await interaction.editReply('❌ Failed to set AFK status.');
    }
  }
};

commands.set('afk', afkCommand);
console.log('[Discord] Registered afk command');

// Helper function to parse duration strings
function parseDuration(durationStr: string): number | null {
  const regex = /^(\d+)(s|m|h|d)$/i;
  const match = durationStr.match(regex);
  
  if (!match) return null;
  
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

// Helper function to format time remaining
function formatTimeRemaining(endTime: Date): string {
  const now = Date.now();
  const end = new Date(endTime).getTime();
  const diff = end - now;
  
  if (diff <= 0) return 'Ended';
  
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((diff % (60 * 1000)) / 1000);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 && days === 0) parts.push(`${seconds}s`);
  
  return parts.join(' ') || 'Ending soon';
}

// Giveaway command
const giveawayCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Manage giveaways')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
      subcommand
        .setName('start')
        .setDescription('Start a new giveaway')
        .addStringOption(option =>
          option.setName('duration')
            .setDescription('Duration (e.g., 1h, 30m, 1d)')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('winners')
            .setDescription('Number of winners')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(20))
        .addStringOption(option =>
          option.setName('prize')
            .setDescription('What are you giving away?')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('end')
        .setDescription('End a giveaway early')
        .addStringOption(option =>
          option.setName('message_id')
            .setDescription('Giveaway message ID (uses most recent if not provided)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('reroll')
        .setDescription('Pick new winner(s)')
        .addStringOption(option =>
          option.setName('message_id')
            .setDescription('Giveaway message ID (uses most recent if not provided)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List active giveaways')) as SlashCommandSubcommandsOnlyBuilder,

  async execute(interaction: ChatInputCommandInteraction, context: CommandContext) {
    const subcommand = interaction.options.getSubcommand();
    const serverId = interaction.guildId!;
    
    await interaction.deferReply({ ephemeral: subcommand !== 'start' });
    
    try {
      if (subcommand === 'start') {
        const durationStr = interaction.options.getString('duration', true);
        const winnerCount = interaction.options.getInteger('winners', true);
        const prize = interaction.options.getString('prize', true);
        
        const durationMs = parseDuration(durationStr);
        if (!durationMs) {
          await interaction.editReply('❌ Invalid duration format. Use: 30s, 5m, 2h, 1d');
          return;
        }
        
        const endTime = new Date(Date.now() + durationMs);
        
        const embed = new EmbedBuilder()
          .setTitle('🎉 GIVEAWAY 🎉')
          .setDescription(`**${prize}**\n\nReact with 🎉 to enter!\nHosted by: ${interaction.user}`)
          .addFields(
            { name: 'Winners', value: `${winnerCount}`, inline: true },
            { name: 'Ends', value: `<t:${Math.floor(endTime.getTime() / 1000)}:R>`, inline: true }
          )
          .setColor('#FF69B4')
          .setFooter({ text: `Ends at` })
          .setTimestamp(endTime);
        
        await interaction.editReply({ content: '🎉 Giveaway created!', embeds: [embed] });
        
        const reply = await interaction.fetchReply();
        await reply.react('🎉');
        
        await context.storage.createGiveaway({
          serverId,
          channelId: interaction.channelId,
          messageId: reply.id,
          prize,
          hostId: interaction.user.id,
          endTime,
          winnerCount,
          ended: false,
          winners: null
        });
        
        console.log(`[Giveaway] Started: "${prize}" by ${interaction.user.username}, ends ${endTime}`);
        
      } else if (subcommand === 'end') {
        const messageId = interaction.options.getString('message_id');
        let giveaway;
        
        if (messageId) {
          giveaway = await context.storage.getGiveawayByMessage(messageId);
        } else {
          const activeGiveaways = await context.storage.getActiveGiveaways(serverId);
          giveaway = activeGiveaways[0];
        }
        
        if (!giveaway) {
          await interaction.editReply('❌ No active giveaway found.');
          return;
        }
        
        const winners = await pickGiveawayWinners(interaction.client, giveaway);
        await context.storage.endGiveaway(giveaway.id, winners);
        
        await announceGiveawayWinners(interaction.client, giveaway, winners);
        
        await interaction.editReply(`✅ Giveaway ended! Winners: ${winners.length > 0 ? winners.map(w => `<@${w}>`).join(', ') : 'No valid entries'}`);
        console.log(`[Giveaway] Ended early: ${giveaway.prize}, winners: ${winners.join(', ')}`);
        
      } else if (subcommand === 'reroll') {
        const messageId = interaction.options.getString('message_id');
        let giveaway;
        
        if (messageId) {
          giveaway = await context.storage.getGiveawayByMessage(messageId);
        } else {
          const activeGiveaways = await context.storage.getActiveGiveaways(serverId);
          if (activeGiveaways.length === 0) {
            const { desc } = await import('drizzle-orm');
            giveaway = await context.storage.getGiveawayByMessage(messageId || '');
          }
          giveaway = activeGiveaways[0];
        }
        
        if (!giveaway) {
          await interaction.editReply('❌ No giveaway found to reroll.');
          return;
        }
        
        const newWinners = await pickGiveawayWinners(interaction.client, giveaway);
        await context.storage.updateGiveaway(giveaway.id, { winners: JSON.stringify(newWinners) });
        
        await announceGiveawayWinners(interaction.client, giveaway, newWinners, true);
        
        await interaction.editReply(`✅ Rerolled! New winners: ${newWinners.length > 0 ? newWinners.map(w => `<@${w}>`).join(', ') : 'No valid entries'}`);
        console.log(`[Giveaway] Rerolled: ${giveaway.prize}, new winners: ${newWinners.join(', ')}`);
        
      } else if (subcommand === 'list') {
        const giveaways = await context.storage.getActiveGiveaways(serverId);
        
        if (giveaways.length === 0) {
          await interaction.editReply('No active giveaways.');
          return;
        }
        
        const embed = new EmbedBuilder()
          .setTitle('🎉 Active Giveaways')
          .setColor('#FF69B4')
          .setDescription(
            giveaways.map(g => 
              `**${g.prize}**\nEnds: <t:${Math.floor(new Date(g.endTime).getTime() / 1000)}:R>\nWinners: ${g.winnerCount} | Channel: <#${g.channelId}>`
            ).join('\n\n')
          )
          .setFooter({ text: `${giveaways.length} active giveaway(s)` })
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Error executing giveaway command:', error);
      await interaction.editReply('❌ Failed to execute giveaway command.');
    }
  }
};

// Helper function to pick giveaway winners
async function pickGiveawayWinners(client: Client, giveaway: any): Promise<string[]> {
  try {
    const guild = await client.guilds.fetch(giveaway.serverId);
    const channel = await guild.channels.fetch(giveaway.channelId);
    
    if (!channel || !channel.isTextBased()) return [];
    
    const message = await channel.messages.fetch(giveaway.messageId);
    const reaction = message.reactions.cache.get('🎉');
    
    if (!reaction) return [];
    
    const users = await reaction.users.fetch();
    const validUsers = users.filter(u => !u.bot).map(u => u.id);
    
    if (validUsers.length === 0) return [];
    
    const shuffled = validUsers.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(giveaway.winnerCount, shuffled.length));
  } catch (error) {
    console.error('[Giveaway] Error picking winners:', error);
    return [];
  }
}

// Helper function to announce giveaway winners
async function announceGiveawayWinners(client: Client, giveaway: any, winners: string[], isReroll: boolean = false): Promise<void> {
  try {
    const guild = await client.guilds.fetch(giveaway.serverId);
    const channel = await guild.channels.fetch(giveaway.channelId);
    
    if (!channel || !channel.isTextBased()) return;
    
    const message = await channel.messages.fetch(giveaway.messageId);
    
    const endedEmbed = new EmbedBuilder()
      .setTitle('🎉 GIVEAWAY ENDED 🎉')
      .setDescription(`**${giveaway.prize}**\n\n${winners.length > 0 ? `Winner(s): ${winners.map(w => `<@${w}>`).join(', ')}` : 'No valid entries!'}`)
      .setColor('#808080')
      .setFooter({ text: 'Ended' })
      .setTimestamp();
    
    await message.edit({ embeds: [endedEmbed] });
    
    if (winners.length > 0) {
      const announceText = isReroll 
        ? `🎉 Congratulations ${winners.map(w => `<@${w}>`).join(', ')}! You are the new winner(s) of **${giveaway.prize}**!`
        : `🎉 Congratulations ${winners.map(w => `<@${w}>`).join(', ')}! You won **${giveaway.prize}**!`;
      
      await channel.send(announceText);
    }
  } catch (error) {
    console.error('[Giveaway] Error announcing winners:', error);
  }
}

commands.set('giveaway', giveawayCommand);
console.log('[Discord] Registered giveaway command');

// Export giveaway helper functions for scheduled job
export { pickGiveawayWinners, announceGiveawayWinners };

// Register developer commands (imported in bot.ts and registered there)
// Developer commands will be imported and added to the collection in bot.ts

// Function to handle additional command registration with a Discord client
export function registerCommands(client: Client, storage: IStorage, broadcast: (data: any) => void): void {
  // Register button and modal interactions
  client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
      const [action, idStr] = interaction.customId.split('_');
      const id = parseInt(idStr);
      
      if (action === 'createTicket') {
        // Handle ticket creation buttons
        try {
          // Fetch category from database
          const category = await storage.getTicketCategory(id);
          const categoryName = category?.name || 'Unknown';
          
          // Create modal for ticket information
          const modal = new ModalBuilder()
            .setCustomId(`ticketModal_${id}`)
            .setTitle(`${categoryName} - New Ticket`);

          const titleInput = new TextInputBuilder()
            .setCustomId('ticketTitle')
            .setLabel('Ticket Title')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Brief summary of your issue...')
            .setRequired(true)
            .setMaxLength(100);

          const descriptionInput = new TextInputBuilder()
            .setCustomId('ticketDescription')
            .setLabel('Description')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Please provide detailed information about your issue...')
            .setRequired(true)
            .setMaxLength(1000);

          const urgencyInput = new TextInputBuilder()
            .setCustomId('ticketUrgency')
            .setLabel('Is this urgent? (yes/no)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('no')
            .setRequired(false)
            .setMaxLength(3);

          const firstRow = new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput);
          const secondRow = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);
          const thirdRow = new ActionRowBuilder<TextInputBuilder>().addComponents(urgencyInput);

          modal.addComponents(firstRow, secondRow, thirdRow);
          
          await interaction.showModal(modal);
        } catch (error) {
          console.error('Error showing ticket modal:', error);
          // Only try to reply if the interaction hasn't been acknowledged yet
          // showModal() doesn't acknowledge the interaction, so we can safely reply here
          if (!interaction.replied && !interaction.deferred) {
            try {
              await interaction.reply({ 
                content: '❌ Failed to show ticket form. Please try again.',
                ephemeral: true
              });
            } catch (replyError) {
              console.error('Failed to send error message to user:', replyError);
            }
          }
        }
      } else if (action === 'closeTicket') {
      try {
        await interaction.deferUpdate();
        
        // Get the storage instance from the client
        // @ts-ignore - We're accessing a property we set on client
        const storage = client.storage as IStorage;
        if (!storage) throw new Error('Storage not available');
        
        const ticket = await storage.getTicket(id);
        if (!ticket) {
          await interaction.followUp({ 
            content: `Ticket #${id} not found.`, 
            ephemeral: true 
          });
          return;
        }
        
        await storage.updateTicket(id, { status: 'closed', closedAt: new Date() });
        
        // Create a system message for the closure
        await storage.createTicketMessage({
          ticketId: id,
          senderId: interaction.user.id,
          content: `Ticket closed by ${interaction.user.username}.`
        });
        
        // @ts-ignore - We're accessing a property we set on client
        const broadcast = client.broadcast as (data: any) => void;
        if (broadcast) {
          broadcast({ 
            type: 'TICKET_UPDATED', 
            data: { ...ticket, status: 'closed' } 
          });
        }
        
        await interaction.editReply({ 
          content: `Ticket #${id} has been closed.`,
          components: []
        });
      } catch (error) {
        console.error('Error handling button interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
          try {
            await interaction.reply({ 
              content: 'An error occurred while processing your request.',
              ephemeral: true
            });
          } catch (replyError) {
            console.error('Failed to send error reply:', replyError);
          }
        } else {
          try {
            await interaction.followUp({ 
              content: 'An error occurred while processing your request.',
              ephemeral: true
            });
          } catch (followUpError) {
            console.error('Failed to send error follow-up:', followUpError);
          }
        }
      }
    } else if (action === 'claimTicket') {
      try {
        await interaction.deferUpdate();
        
        // @ts-ignore - We're accessing a property we set on client
        const storage = client.storage as IStorage;
        if (!storage) throw new Error('Storage not available');
        
        const ticket = await storage.getTicket(id);
        if (!ticket) {
          await interaction.followUp({ 
            content: `Ticket #${id} not found.`, 
            ephemeral: true 
          });
          return;
        }
        
        // Assign the ticket to the user who clicked the button
        await storage.updateTicket(id, { assigneeId: interaction.user.id });
        
        // Create a system message
        await storage.createTicketMessage({
          ticketId: id,
          senderId: interaction.user.id,
          content: `Ticket claimed by ${interaction.user.username}.`
        });
        
        // @ts-ignore - We're accessing a property we set on client
        const broadcast = client.broadcast as (data: any) => void;
        if (broadcast) {
          broadcast({ 
            type: 'TICKET_UPDATED', 
            data: { ...ticket, assigneeId: interaction.user.id } 
          });
        }
        
        await interaction.followUp({ 
          content: `✅ You have claimed ticket #${id}`,
          ephemeral: true
        });
      } catch (error) {
        console.error('Error claiming ticket:', error);
        if (!interaction.replied && !interaction.deferred) {
          try {
            await interaction.reply({ 
              content: 'An error occurred while claiming the ticket.',
              ephemeral: true
            });
          } catch (replyError) {
            console.error('Failed to send error reply:', replyError);
          }
        } else {
          try {
            await interaction.followUp({ 
              content: 'An error occurred while claiming the ticket.',
              ephemeral: true
            });
          } catch (followUpError) {
            console.error('Failed to send error follow-up:', followUpError);
          }
        }
      }
    } else if (action === 'assignTicket') {
      try {
        await interaction.deferReply({ ephemeral: true });
        
        await interaction.editReply({ 
          content: '📋 To assign this ticket to a specific team member, please use the dashboard or claim it yourself using the "Claim Ticket" button.'
        });
      } catch (error) {
        console.error('Error with assign ticket button:', error);
      }
    } else if (action === 'viewTicket') {
      try {
        await interaction.deferReply({ ephemeral: true });
        
        // @ts-ignore - We're accessing a property we set on client
        const storage = client.storage as IStorage;
        if (!storage) throw new Error('Storage not available');
        
        const ticket = await storage.getTicket(id);
        if (!ticket) {
          await interaction.editReply(`Ticket #${id} not found.`);
          return;
        }
        
        const category = ticket.categoryId ? await storage.getTicketCategory(ticket.categoryId) : null;
        const creator = await storage.getDiscordUser(ticket.creatorId);
        
        const embed = new EmbedBuilder()
          .setTitle(`🎫 Ticket #${ticket.id}: ${ticket.title}`)
          .setDescription(ticket.description)
          .addFields(
            { name: 'Status', value: ticket.status === 'open' ? '✅ Open' : ticket.status === 'closed' ? '🔒 Closed' : '⏳ In Progress', inline: true },
            { name: 'Priority', value: ticket.priority === 'urgent' ? '🔴 Urgent' : '🟢 Normal', inline: true },
            { name: 'Category', value: category?.name || 'Unknown', inline: true },
            { name: 'Created By', value: creator ? `${creator.username}` : 'Unknown User', inline: true },
            { name: 'Created At', value: ticket.createdAt ? new Date(ticket.createdAt).toLocaleString() : 'Unknown', inline: true }
          )
          .setColor(ticket.status === 'open' ? '#43B581' : '#747F8D')
          .setTimestamp();
        
        if (ticket.assigneeId) {
          const assignee = await storage.getDiscordUser(ticket.assigneeId);
          embed.addFields({ name: 'Assigned To', value: assignee?.username || 'Unknown User', inline: true });
        }
        
        const baseUrl = process.env.APP_URL || `https://${process.env.REPLIT_DOMAINS}`;
        const linkButton = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setLabel('View in Dashboard')
              .setStyle(ButtonStyle.Link)
              .setURL(baseUrl)
              .setEmoji('🔗')
          );
        
        await interaction.editReply({ 
          embeds: [embed],
          components: [linkButton]
        });
      } catch (error) {
        console.error('Error viewing ticket:', error);
        if (!interaction.replied) {
          try {
            await interaction.editReply('An error occurred while retrieving ticket details.');
          } catch (editError) {
            console.error('Failed to send error message:', editError);
          }
        }
      }
    } else if (interaction.customId.startsWith('help_')) {
      // Handle help navigation buttons
      try {
        await interaction.deferUpdate();
        
        const helpCategory = interaction.customId.replace('help_', '');
        let embed;
        let components;
        
        switch (helpCategory) {
          case 'tickets':
            embed = createTicketHelpEmbed();
            components = [createHelpBackButton()];
            break;
          case 'streams':
            embed = createStreamHelpEmbed();
            components = [createHelpBackButton()];
            break;
          case 'plex':
            embed = createPlexHelpEmbed();
            components = [createHelpBackButton()];
            break;
          case 'panels':
            embed = createPanelsHelpEmbed();
            components = [createHelpBackButton()];
            break;
          case 'admin':
            embed = createAdminHelpEmbed();
            components = [createHelpBackButton()];
            break;
          case 'main':
          default:
            embed = createMainHelpEmbed();
            components = [createHelpNavigationButtons()];
            break;
        }
        
        await interaction.editReply({
          embeds: [embed],
          components: components
        });
        
        console.log(`[Discord] Help navigation: ${helpCategory} by ${interaction.user.username}`);
      } catch (error) {
        console.error('Error handling help button:', error);
      }
    }
    } else if (interaction.isModalSubmit()) {
      // Handle modal submissions for ticket creation
      const [action, categoryIdStr] = interaction.customId.split('_');
      
      if (action === 'ticketModal') {
        // Try to defer the reply immediately - critical for preventing timeout errors
        let deferred = false;
        try {
          await interaction.deferReply({ ephemeral: true });
          deferred = true;
        } catch (error) {
          console.error('Failed to defer modal interaction:', error);
          // If we can't defer, we likely can't interact with this at all
          // This usually means the interaction has expired (>3 seconds)
          return;
        }

        try {
          const categoryId = parseInt(categoryIdStr);
          const title = interaction.fields.getTextInputValue('ticketTitle');
          const description = interaction.fields.getTextInputValue('ticketDescription');
          const urgencyResponse = interaction.fields.getTextInputValue('ticketUrgency') || 'no';
          const isUrgent = urgencyResponse.toLowerCase().includes('yes');

          // Get the storage instance from the client
          // @ts-ignore - We're accessing a property we set on client
          const storage = client.storage as IStorage;
          if (!storage) throw new Error('Storage not available');
          
          // @ts-ignore - We're accessing a property we set on client
          const broadcast = client.broadcast as (data: any) => void;

          // Validate the user exists in our system, create if not
          const discordUser = await storage.getDiscordUser(interaction.user.id);
          
          if (!discordUser) {
            await storage.createDiscordUser({
              id: interaction.user.id,
              username: interaction.user.username,
              discriminator: interaction.user.discriminator || '0000',
              avatar: interaction.user.avatarURL() || undefined,
              isAdmin: false
            });
          }

          // Create the ticket using the same logic as the slash command
          const ticketData: InsertTicket = {
            title,
            description,
            status: 'open',
            priority: isUrgent ? 'urgent' : 'normal',
            categoryId,
            creatorId: interaction.user.id,
          };
          
          const ticket = await storage.createTicket(ticketData);
          console.log(`[Discord Modal] ✅ Ticket created via modal: ID ${ticket.id}, Title: ${ticket.title}`);
          
          // Create first message from the user
          await storage.createTicketMessage({
            ticketId: ticket.id,
            senderId: interaction.user.id,
            content: description
          });
          console.log(`[Discord Modal] First message added to ticket ${ticket.id}`);
          
          // Notify all connected clients about the new ticket
          if (broadcast) {
            console.log(`[Discord Modal] Broadcasting TICKET_CREATED event for ticket ${ticket.id}`);
            broadcast({ type: 'TICKET_CREATED', data: ticket });
          } else {
            console.warn(`[Discord Modal] ⚠️ Broadcast function not available for ticket ${ticket.id}`);
          }
          
          // Get the category for notifications
          const category = await storage.getTicketCategory(categoryId);
          
          // Send copy to admin channel if configured
          if (interaction.guildId && interaction.guild && category) {
            await sendTicketNotificationToAdminChannel(
              interaction.guildId,
              interaction.guild,
              storage,
              ticket,
              category,
              'created',
              interaction.user
            );
          }
          
          // Get the base URL for the dashboard from environment variables or use a default
          const baseUrl = process.env.APP_URL || `https://${process.env.REPLIT_DOMAINS}`;
          const dashboardUrl = baseUrl; // Dashboard is at root path '/'
          const categoryName = category ? category.name : 'Unknown Category';
          
          // Send confirmation with a rich embed and button link to the dashboard
          const embed = new EmbedBuilder()
            .setTitle('🎫 Ticket Created Successfully!')
            .setDescription(`Your support ticket has been created and our team has been notified.\n\n**${title}**\n${description.substring(0, 150)}${description.length > 150 ? '...' : ''}`)
            .addFields(
              { name: 'Ticket ID', value: `#${ticket.id}`, inline: true },
              { name: 'Status', value: '✅ Open', inline: true },
              { name: 'Priority', value: isUrgent ? '🔴 Urgent' : '🟢 Normal', inline: true },
              { name: 'Category', value: `${getCategoryEmoji(categoryId)} ${categoryName}`, inline: true }
            )
            .setColor('#43B581')
            .setFooter({ text: 'We\'ll respond as soon as possible • View details in the dashboard' })
            .setTimestamp();
          
          // Create a button that links to the dashboard
          const linkButton = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
              new ButtonBuilder()
                .setLabel('View in Dashboard')
                .setStyle(ButtonStyle.Link)
                .setURL(dashboardUrl)
                .setEmoji('🔗'),
            );
          
          await interaction.editReply({ 
            embeds: [embed],
            components: [linkButton]
          });

          // Also send a follow-up message in the channel where the button was clicked (optional)
          if (interaction.channel && interaction.channel.isTextBased()) {
            const channelEmbed = new EmbedBuilder()
              .setDescription(`✅ **${interaction.user.displayName}** created ticket **#${ticket.id}**: ${title}`)
              .setColor('#43B581')
              .setTimestamp();
              
            await interaction.followUp({
              embeds: [channelEmbed],
              ephemeral: false
            });
          }
        } catch (error) {
          console.error('Error creating ticket from modal:', error);
          // Only try to edit reply if we successfully deferred earlier
          if (deferred && !interaction.replied) {
            try {
              await interaction.editReply('❌ Failed to create ticket. Please try again later.');
            } catch (editError) {
              console.error('Failed to send error message to user:', editError);
            }
          }
        }
      }
    }
  });
  
  // Store storage and broadcast on the client for easy access
  // @ts-ignore - We're setting properties on client
  client.storage = storage;
  // @ts-ignore - We're setting properties on client
  client.broadcast = broadcast;
}
