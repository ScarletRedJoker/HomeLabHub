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
  createClosedTicketActionButtons
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
        
        const updatedTicket = await storage.updateTicket(ticketId, { status: 'closed' });
        
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
          channelId: channel.id,
          customMessage: message || existingSettings.customMessage,
          enabled
        });
      } else {
        // Create new settings
        await storage.createStreamNotificationSettings({
          serverId: interaction.guildId,
          channelId: channel.id,
          customMessage: message || null,
          enabled
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
        customMessage: customMessage || null
      });

      const embed = new EmbedBuilder()
        .setTitle('✅ User Added to Stream Tracking')
        .setDescription(`${user.username} will now trigger notifications when they go live!`)
        .addFields(
          { name: 'User', value: `<@${user.id}>`, inline: true },
          { name: 'Channel', value: `<#${settings.channelId}>`, inline: true }
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
        { name: 'Status', value: settings.enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
        { name: 'Channel', value: `<#${settings.channelId}>`, inline: true },
        { name: 'Tracked Users', value: trackedUsers.length.toString(), inline: true }
      );

      if (settings.customMessage) {
        embed.addFields({ name: 'Default Message', value: settings.customMessage, inline: false });
      }

      if (trackedUsers.length > 0) {
        const userList = trackedUsers.map((u, i) => {
          let line = `${i + 1}. <@${u.userId}>`;
          if (u.customMessage) {
            line += ` - *${u.customMessage.substring(0, 50)}${u.customMessage.length > 50 ? '...' : ''}*`;
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
        
        await storage.updateTicket(id, { status: 'closed' });
        
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
