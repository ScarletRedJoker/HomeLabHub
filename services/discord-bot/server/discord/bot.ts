import { Client, GatewayIntentBits, Events, REST, Routes, EmbedBuilder, ActivityType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { commands, registerCommands, sendTicketNotificationToAdminChannel } from './commands';
import { developerCommands } from './dev-commands';
import { IStorage } from '../storage';
import { startBackgroundJobs, safeSendMessage, isDuplicateInteraction } from './ticket-safeguards';
import {
  createTicketClaimedEmbed,
  createTicketAssignedEmbed,
  createTicketPriorityChangedEmbed,
  createTicketTransferredEmbed,
  createTicketClosedEmbed,
  createTicketReopenedEmbed,
  createTicketActionButtons,
  createClosedTicketActionButtons
} from './embed-templates';
import {
  syncThreadMessageToDashboard,
  syncDashboardMessageToThread,
  getOrCreateThreadMapping,
  syncThreadStatusToTicket,
  syncTicketStatusToThread
} from './thread-sync';
import { handlePresenceUpdate, initializeStreamTracking } from './stream-notifications';
import { initializeAutoDetection, scheduleAutoDetectionScans } from './stream-auto-detection';
import { TicketChannelManager, startThreadCleanupJob } from './ticket-channel-manager';
import { initHomelabPresence, HomelabPresenceService } from './homelab-presence';
import { streamPoller } from '../services/stream-poller';
import { initializeCommunityFeatures } from './community-features';
import { initializeModerationFeatures, handleAutoMod } from './moderation-features';
import { registerScheduledCommands, calculateNextRun } from './scheduled-commands';
import { registerLevelingCommands, initializeLevelingEvents } from './features/leveling';
import { registerCustomCommandCommands, initializeCustomCommandEvents } from './features/customCommands';
import { registerPollCommands, handlePollButtonInteraction, handlePollSelectMenuInteraction, startPollScheduler, stopPollScheduler } from './features/polls';
import { registerGiveawayCommands, handleGiveawayButtonInteraction, startGiveawayScheduler, stopGiveawayScheduler } from './features/giveaways';
import { registerModerationCommands, registerAutomodConfigCommands, initializeAutomodEvents } from './features/moderation';
import { commandEngine } from '../services/commandEngine';
import { guildIdentityService } from '../services/guildIdentityService';
import { welcomeCardRenderer } from '../services/welcomeCardRenderer';
import { welcomeCardTemplates, botSettings } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { AttachmentBuilder } from 'discord.js';
import { workflowEngine, EventContext } from '../services/workflowEngine';
import { dbStorage } from '../database-storage';
import { metricsTracker } from '../services/metricsTracker';

const voiceTimeTracker = new Map<string, { joinTime: number; guildId: string }>();

// Discord bot instance
let client: Client | null = null;

// Ticket channel manager instance
let ticketChannelManager: TicketChannelManager | null = null;

// Background job handles for cleanup
let ticketMappingRefreshInterval: NodeJS.Timeout | null = null;
let autoDetectionScanInterval: NodeJS.Timeout | null = null;
let threadCleanupJobInterval: NodeJS.Timeout | null = null;

// Map to track Discord channels/threads to ticket IDs
const channelToTicketMap = new Map<string, number>();

// Debug: Check what commands are loaded from commands.ts
console.log('[Discord] Commands loaded from commands.ts:', Array.from(commands.keys()).join(', '));

// Register developer commands
developerCommands.forEach(command => {
  commands.set(command.data.name, command);
});
console.log('[Discord] Registered developer commands:', developerCommands.map(c => c.data.name).join(', '));

registerScheduledCommands();
registerLevelingCommands(commands);
registerCustomCommandCommands(commands);
registerPollCommands(commands);
registerGiveawayCommands(commands);
registerModerationCommands(commands);
registerAutomodConfigCommands(commands);
console.log('[Discord] Total commands after all registrations:', Array.from(commands.keys()).join(', '));

export async function startBot(storage: IStorage, broadcast: (data: any) => void): Promise<void> {
  if (!process.env.DISCORD_BOT_TOKEN) {
    console.warn('DISCORD_BOT_TOKEN is not defined in environment variables');
    return;
  }

  if (!process.env.DISCORD_APP_ID) {
    console.warn('DISCORD_APP_ID is not defined in environment variables');
    return;
  }

  // Basic token validation (Discord v2 tokens can contain periods and special chars)
  // Just check it's not empty and looks vaguely like a token
  if (process.env.DISCORD_BOT_TOKEN.length < 50) {
    console.warn('DISCORD_BOT_TOKEN appears to be too short or invalid.');
    return;
  }

  try {
    // Create a new Discord client with required intents for member data access
    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // Required to fetch member information like nicknames
        GatewayIntentBits.GuildMessages, // Required for message-related operations
        GatewayIntentBits.MessageContent, // Required for reading message content and embeds
        GatewayIntentBits.GuildVoiceStates, // Required for voice channel functionality
        GatewayIntentBits.GuildPresences, // Required to detect when users start streaming
        GatewayIntentBits.GuildMessageReactions, // Required for starboard reaction tracking
      ],
      partials: [
        2, // Partials.Message - Required to receive events on uncached messages
        3, // Partials.Reaction - Required to receive events on uncached reactions
      ]
    });

    // Register commands with Discord API
    try {
      await registerCommandsWithAPI(process.env.DISCORD_BOT_TOKEN);
    } catch (error) {
      console.error('Error registering commands with Discord API. Continuing with limited functionality:', error);
      // Continue with bot startup even if command registration fails
    }

    // Clear and reload ticket mappings on bot start
    channelToTicketMap.clear();
    
    // Retry utility with exponential backoff
    const retryWithBackoff = async <T>(
      fn: () => Promise<T>,
      maxRetries: number = 5,
      delayMs: number = 1000,
      operationName: string = 'operation'
    ): Promise<T | null> => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const result = await fn();
          if (attempt > 1) {
            console.log(`[Discord] ✅ ${operationName} succeeded on attempt ${attempt}`);
          }
          return result;
        } catch (error) {
          const isLastAttempt = attempt === maxRetries;
          if (isLastAttempt) {
            console.error(`[Discord] ❌ ${operationName} failed after ${maxRetries} attempts:`, error);
            return null;
          }
          
          const waitTime = delayMs * Math.pow(2, attempt - 1);
          console.warn(`[Discord] ⚠️  ${operationName} failed (attempt ${attempt}/${maxRetries}), retrying in ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
      return null;
    };
    
    // Load existing ticket-channel mappings on startup with retry logic
    const loadTicketMappings = async (): Promise<boolean> => {
      console.log('[Discord] Loading ticket-channel mappings from database...');
      
      const allTickets = await retryWithBackoff(
        () => storage.getAllTickets(),
        5,
        1000,
        'Loading ticket mappings'
      );
      
      if (!allTickets) {
        console.error('[Discord] ❌ Failed to load ticket mappings. Bot will continue with empty mappings and retry later.');
        return false;
      }
      
      channelToTicketMap.clear();
      for (const ticket of allTickets) {
        if (ticket.discordId && ticket.status === 'open') {
          channelToTicketMap.set(ticket.discordId, ticket.id);
        }
      }
      
      console.log(`[Discord] ✅ Successfully loaded ${channelToTicketMap.size} ticket-channel mappings`);
      return true;
    };
    
    // Schedule periodic refresh of ticket mappings (every 5 minutes)
    // This ensures the bot recovers if database was unavailable at startup
    const scheduleTicketMappingRefresh = () => {
      // Prevent duplicate intervals if called multiple times
      if (ticketMappingRefreshInterval) {
        console.log('[Discord] Ticket mapping refresh already scheduled, skipping duplicate');
        return;
      }
      
      ticketMappingRefreshInterval = setInterval(async () => {
        console.log('[Discord] Scheduled refresh of ticket mappings...');
        await loadTicketMappings();
      }, 5 * 60 * 1000); // 5 minutes
      
      console.log('[Discord] Scheduled ticket mapping refresh every 5 minutes');
    };

    // Handle interaction create events (slash commands, button clicks, modals)
    client.on(Events.InteractionCreate, async (interaction) => {
      // Handle slash commands (only chat input commands)
      if (interaction.isChatInputCommand()) {
        const command = commands.get(interaction.commandName);
        if (!command) return;
        
        // Track command usage for analytics (fire-and-forget)
        if (interaction.guildId) {
          metricsTracker.trackCommandUsage(
            interaction.guildId,
            interaction.commandName,
            interaction.user.id,
            interaction.channelId || undefined
          ).catch(() => {});
        }
        
        try {
          await command.execute(interaction, { storage, broadcast });
        } catch (error) {
          console.error(`Error executing command ${interaction.commandName}:`, error);
          
          try {
            if (interaction.deferred) {
              await interaction.editReply({ 
                content: 'There was an error while executing this command!' 
              });
            } else if (interaction.replied) {
              await interaction.followUp({ 
                content: 'There was an error while executing this command!', 
                flags: 64
              });
            } else {
              await interaction.reply({ 
                content: 'There was an error while executing this command!', 
                flags: 64
              });
            }
          } catch (replyError) {
            console.error('Failed to send error message to user:', replyError);
          }
        }
      }
      
      // Handle ticket panel button clicks to create new tickets
      else if (interaction.isButton() && interaction.customId.startsWith('createTicket_')) {
        try {
          const categoryId = parseInt(interaction.customId.split('_')[1]);
          
          // Fetch category from database
          const category = await storage.getTicketCategory(categoryId);
          const categoryName = category?.name || 'Support';
          
          // Import required components
          const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
          
          // Create modal for ticket information
          const modal = new ModalBuilder()
            .setCustomId(`ticketModal_${categoryId}`)
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

          const firstRow = new ActionRowBuilder<any>().addComponents(titleInput);
          const secondRow = new ActionRowBuilder<any>().addComponents(descriptionInput);
          const thirdRow = new ActionRowBuilder<any>().addComponents(urgencyInput);

          modal.addComponents(firstRow, secondRow, thirdRow);
          
          await interaction.showModal(modal);
        } catch (error) {
          console.error('Error showing ticket creation modal:', error);
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
      }
      
      // Handle button interaction for updating mediation actions
      else if (interaction.isButton() && interaction.customId.startsWith('updateMediationActions_')) {
        const ticketId = parseInt(interaction.customId.split('_')[1]);
        
        // Import required components
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
        
        // Get current ticket data
        const ticket = await storage.getTicket(ticketId);
        
        // Create modal for mediation actions
        const modal = new ModalBuilder()
          .setCustomId(`mediationActionsModal_${ticketId}`)
          .setTitle(`Mediation Actions - Ticket #${ticketId}`);
          
        const actionsInput = new TextInputBuilder()
          .setCustomId('mediationActions')
          .setLabel('What mediation actions have been taken?')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder('e.g., Reviewed evidence, contacted parties, issued warning, etc.')
          .setValue(ticket?.mediationActions || '')
          .setMaxLength(1000);
          
        const actionRow = new ActionRowBuilder<any>().addComponents(actionsInput);
        modal.addComponents(actionRow);
        
        await interaction.showModal(modal);
      }
      
      // Handle button interaction for updating user actions
      else if (interaction.isButton() && interaction.customId.startsWith('updateUserActions_')) {
        const ticketId = parseInt(interaction.customId.split('_')[1]);
        
        // Import required components
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
        
        // Get current ticket data
        const ticket = await storage.getTicket(ticketId);
        
        // Create modal for user actions
        const modal = new ModalBuilder()
          .setCustomId(`userActionsModal_${ticketId}`)
          .setTitle(`User Actions - Ticket #${ticketId}`);
          
        const actionsInput = new TextInputBuilder()
          .setCustomId('userActions')
          .setLabel('What actions are required from the user?')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder('e.g., Apologize to affected users, read server rules, etc.')
          .setValue(ticket?.userActions || '')
          .setMaxLength(1000);
          
        const actionRow = new ActionRowBuilder<any>().addComponents(actionsInput);
        modal.addComponents(actionRow);
        
        await interaction.showModal(modal);
      }
      
      // Handle button interaction for review and close
      else if (interaction.isButton() && interaction.customId.startsWith('reviewAndClose_')) {
        const ticketId = parseInt(interaction.customId.split('_')[1]);
        
        // Import required components
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
        
        // Create modal for review acknowledgment
        const modal = new ModalBuilder()
          .setCustomId(`reviewAndCloseModal_${ticketId}`)
          .setTitle(`Review & Close - Ticket #${ticketId}`);
          
        const reviewInput = new TextInputBuilder()
          .setCustomId('reviewNotes')
          .setLabel('Provide acknowledgment and final notes')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder('Summary of review, final actions taken, and resolution details...')
          .setMinLength(20)
          .setMaxLength(1000);
          
        const actionRow = new ActionRowBuilder<any>().addComponents(reviewInput);
        modal.addComponents(actionRow);
        
        await interaction.showModal(modal);
      }
      
      // Handle modal submission for ticket creation from panels
      else if (interaction.isModalSubmit() && interaction.customId.startsWith('ticketModal_')) {
        // Defer reply immediately to prevent timeout
        let deferred = false;
        try {
          await interaction.deferReply({ ephemeral: true });
          deferred = true;
        } catch (error) {
          console.error('Failed to defer ticket modal interaction:', error);
          return;
        }

        try {
          const categoryId = parseInt(interaction.customId.split('_')[1]);
          const title = interaction.fields.getTextInputValue('ticketTitle');
          const description = interaction.fields.getTextInputValue('ticketDescription');
          const urgencyResponse = interaction.fields.getTextInputValue('ticketUrgency') || 'no';
          const isUrgent = urgencyResponse.toLowerCase().includes('yes');

          // Check for duplicate interaction (prevents spam from Discord retries)
          const isDuplicate = await isDuplicateInteraction(
            interaction.id,
            interaction.user.id,
            storage
          );

          if (isDuplicate) {
            console.log(`[TicketSystem] 🚫 Blocked duplicate ticket creation from interaction ${interaction.id}`);
            await interaction.editReply({
              content: '⚠️ This ticket has already been created. Please check your existing tickets in the dashboard.',
            });
            return;
          }

          // Validate user exists in system, create if not
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

          // Create the ticket
          const ticketData = {
            title,
            description,
            status: 'open' as const,
            priority: isUrgent ? 'urgent' as const : 'normal' as const,
            categoryId,
            creatorId: interaction.user.id,
            serverId: interaction.guildId!,
          };
          
          const ticket = await storage.createTicket(ticketData);
          console.log(`[Discord Panel] ✅ Ticket created via panel button: ID ${ticket.id}, Title: ${ticket.title}`);
          
          // Create first message from the user
          await storage.createTicketMessage({
            ticketId: ticket.id,
            senderId: interaction.user.id,
            content: description
          });
          
          // Broadcast to connected clients
          broadcast({ type: 'TICKET_CREATED', data: ticket });
          
          // Get category for notifications
          const category = await storage.getTicketCategory(categoryId);
          
          // Create a Discord thread for the ticket in the same channel as the panel
          let ticketThread = null;
          let threadId: string | null = null;
          
          if (interaction.channel && interaction.channel.isTextBased() && 'threads' in interaction.channel) {
            try {
              const { ChannelType, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');
              
              // Create the thread in the same channel where the button was clicked
              ticketThread = await interaction.channel.threads.create({
                name: `🎫 Ticket #${ticket.id}: ${title.substring(0, 80)}`,
                autoArchiveDuration: 10080, // 7 days
                reason: `Support ticket created by ${interaction.user.username}`
              });
              
              threadId = ticketThread.id;
              console.log(`[Discord Thread] ✅ Created thread ${threadId} for ticket #${ticket.id}`);
              
              // Add the ticket creator to the thread (automatically added but ensuring)
              try {
                await ticketThread.members.add(interaction.user.id);
              } catch (err) {
                console.log(`[Discord Thread] Creator already in thread or permission issue`);
              }
              
              // Add support and staff roles to the thread
              try {
                if (!interaction.guildId) {
                  console.log(`[Discord Thread] No guild ID available for role addition`);
                  throw new Error('No guild ID');
                }
                
                const settings = await storage.getBotSettings(interaction.guildId);
                const guild = interaction.guild;
                
                if (settings && guild) {
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
                      console.log(`[Discord Thread] Adding ${membersWithRole.size} members from role ${role.name} to thread`);
                      
                      // Add each member to the thread
                      for (const [memberId, member] of membersWithRole) {
                        try {
                          await ticketThread.members.add(memberId);
                        } catch (memberErr) {
                          console.log(`[Discord Thread] Could not add member ${member.user.username} to thread:`, memberErr instanceof Error ? memberErr.message : 'Unknown error');
                        }
                      }
                    }
                  }
                  console.log(`[Discord Thread] ✅ Added support/staff members to thread`);
                }
              } catch (roleErr) {
                console.error(`[Discord Thread] Failed to add support/staff roles:`, roleErr);
                // Continue even if role addition fails
              }
              
              // Create comprehensive ticket embed for the thread
              const categoryName = category ? category.name : 'Unknown Category';
              const categoryEmoji = category?.emoji || '🎫';
              const baseUrl = process.env.APP_URL || `https://${process.env.REPLIT_DOMAINS}`;
              
              const ticketEmbed = new EmbedBuilder()
                .setTitle(`🎫 Ticket #${ticket.id}`)
                .setDescription(`**${title}**\n\n${description}`)
                .addFields(
                  { name: 'Created By', value: `<@${interaction.user.id}>`, inline: true },
                  { name: 'Status', value: '✅ Open', inline: true },
                  { name: 'Priority', value: isUrgent ? '🔴 Urgent' : '🟢 Normal', inline: true },
                  { name: 'Category', value: `${categoryEmoji} ${categoryName}`, inline: true },
                  { name: 'Created', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
                )
                .setColor(isUrgent ? '#ED4245' : '#5865F2')
                .setFooter({ text: 'Support Team • Reply in this thread for assistance' })
                .setTimestamp();
              
              // Create action buttons for staff using existing button handlers
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
                    .setLabel('View Dashboard')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`${baseUrl}?ticket=${ticket.id}`)
                    .setEmoji('🔗')
                );
              
              // Post the ticket embed in the thread
              await ticketThread.send({
                content: `<@${interaction.user.id}> Your ticket has been created! Our support team has been notified and will assist you shortly.`,
                embeds: [ticketEmbed],
                components: [staffActions]
              });
              
              // Update ticket with thread ID
              await storage.updateTicket(ticket.id, { discordId: threadId });
              
              // Update channelToTicketMap for message sync
              channelToTicketMap.set(threadId, ticket.id);
              
            } catch (threadError) {
              console.error('[Discord Thread] Failed to create thread for ticket:', threadError);
              // Continue even if thread creation fails
            }
          }
          
          // Send notification to admin channel if configured
          if (interaction.guildId && interaction.guild && category) {
            const { sendTicketNotificationToAdminChannel } = await import('./commands.js');
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
          
          // Send confirmation to user with thread link
          const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');
          const baseUrl = process.env.APP_URL || `https://${process.env.REPLIT_DOMAINS}`;
          const categoryName = category ? category.name : 'Unknown Category';
          const categoryEmoji = category?.emoji || '🎫';
          
          const confirmEmbed = new EmbedBuilder()
            .setTitle('🎫 Ticket Created Successfully!')
            .setDescription(`Your support ticket has been created and our team has been notified.\n\n**${title}**\n${description.substring(0, 150)}${description.length > 150 ? '...' : ''}`)
            .addFields(
              { name: 'Ticket ID', value: `#${ticket.id}`, inline: true },
              { name: 'Status', value: '✅ Open', inline: true },
              { name: 'Priority', value: isUrgent ? '🔴 Urgent' : '🟢 Normal', inline: true },
              { name: 'Category', value: `${categoryEmoji} ${categoryName}`, inline: true }
            )
            .setColor('#43B581')
            .setFooter({ text: 'We\'ll respond as soon as possible' })
            .setTimestamp();
          
          const confirmButtons = new ActionRowBuilder<any>();
          
          if (threadId) {
            confirmButtons.addComponents(
              new ButtonBuilder()
                .setLabel('Go to Ticket Thread')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/channels/${interaction.guildId}/${threadId}`)
                .setEmoji('💬')
            );
          }
          
          confirmButtons.addComponents(
            new ButtonBuilder()
              .setLabel('View in Dashboard')
              .setStyle(ButtonStyle.Link)
              .setURL(baseUrl)
              .setEmoji('🔗')
          );
          
          await interaction.editReply({ 
            embeds: [confirmEmbed],
            components: [confirmButtons]
          });
        } catch (error) {
          console.error('Error creating ticket from panel modal:', error);
          if (deferred && !interaction.replied) {
            try {
              await interaction.editReply('❌ Failed to create ticket. Please try again later.');
            } catch (editError) {
              console.error('Failed to send error message:', editError);
            }
          }
        }
      }
      
      // Handle modal submission for mediation actions
      else if (interaction.isModalSubmit() && interaction.customId.startsWith('mediationActionsModal_')) {
        await interaction.deferReply({ flags: 64 });
        
        const ticketId = parseInt(interaction.customId.split('_')[1]);
        const mediationActions = interaction.fields.getTextInputValue('mediationActions');
        
        try {
          // Update ticket with mediation actions
          const updatedTicket = await storage.updateTicket(ticketId, { mediationActions });
          
          if (!updatedTicket) {
            await interaction.editReply('❌ Ticket not found.');
            return;
          }
          
          // Update the embed in the ticket channel
          if (updatedTicket.discordId && interaction.guild) {
            const ticketChannel = interaction.guild.channels.cache.get(updatedTicket.discordId);
            if (ticketChannel && ticketChannel.isTextBased()) {
              const { EmbedBuilder } = await import('discord.js');
              
              // Get category info
              const category = updatedTicket.categoryId 
                ? await storage.getTicketCategory(updatedTicket.categoryId)
                : null;
              
              const updateEmbed = new EmbedBuilder()
                .setTitle(`⚖️ Mediation Actions Updated - Ticket #${ticketId}`)
                .setDescription(mediationActions)
                .addFields(
                  { name: 'Updated By', value: `<@${interaction.user.id}>`, inline: true },
                  { name: 'Updated At', value: new Date().toLocaleString(), inline: true }
                )
                .setColor('#5865F2')
                .setTimestamp();
              
              await ticketChannel.send({ embeds: [updateEmbed] });
            }
          }
          
          // Broadcast update
          broadcast({ type: 'TICKET_UPDATED', data: updatedTicket });
          
          await interaction.editReply('✅ Mediation actions have been updated successfully.');
        } catch (error) {
          console.error('[Discord Modal] Error updating mediation actions:', error);
          await interaction.editReply('❌ Failed to update mediation actions.');
        }
      }
      
      // Handle modal submission for user actions
      else if (interaction.isModalSubmit() && interaction.customId.startsWith('userActionsModal_')) {
        await interaction.deferReply({ flags: 64 });
        
        const ticketId = parseInt(interaction.customId.split('_')[1]);
        const userActions = interaction.fields.getTextInputValue('userActions');
        
        try {
          // Update ticket with user actions
          const updatedTicket = await storage.updateTicket(ticketId, { userActions });
          
          if (!updatedTicket) {
            await interaction.editReply('❌ Ticket not found.');
            return;
          }
          
          // Update the embed in the ticket channel
          if (updatedTicket.discordId && interaction.guild) {
            const ticketChannel = interaction.guild.channels.cache.get(updatedTicket.discordId);
            if (ticketChannel && ticketChannel.isTextBased()) {
              const { EmbedBuilder } = await import('discord.js');
              
              const updateEmbed = new EmbedBuilder()
                .setTitle(`👤 User Actions Updated - Ticket #${ticketId}`)
                .setDescription(userActions)
                .addFields(
                  { name: 'Updated By', value: `<@${interaction.user.id}>`, inline: true },
                  { name: 'Updated At', value: new Date().toLocaleString(), inline: true }
                )
                .setColor('#43B581')
                .setTimestamp();
              
              await ticketChannel.send({ embeds: [updateEmbed] });
            }
          }
          
          // Broadcast update
          broadcast({ type: 'TICKET_UPDATED', data: updatedTicket });
          
          await interaction.editReply('✅ User actions have been updated successfully.');
        } catch (error) {
          console.error('[Discord Modal] Error updating user actions:', error);
          await interaction.editReply('❌ Failed to update user actions.');
        }
      }
      
      // Handle modal submission for review and close
      else if (interaction.isModalSubmit() && interaction.customId.startsWith('reviewAndCloseModal_')) {
        await interaction.deferReply({ flags: 64 });
        
        const ticketId = parseInt(interaction.customId.split('_')[1]);
        const reviewNotes = interaction.fields.getTextInputValue('reviewNotes');
        
        try {
          const ticket = await storage.getTicket(ticketId);
          
          if (!ticket) {
            await interaction.editReply('❌ Ticket not found.');
            return;
          }
          
          // Update ticket status to closed
          const updatedTicket = await storage.updateTicket(ticketId, { status: 'closed', closedAt: new Date() });
          
          // Add a resolution entry with review notes
          await storage.createTicketResolution({
            ticketId: ticketId,
            resolutionType: 'resolved',
            resolutionNotes: reviewNotes,
            actionTaken: 'Channel reviewed and closed by moderator',
            resolvedBy: interaction.user.id,
            resolvedByUsername: interaction.user.username,
            serverId: ticket.serverId
          });
          
          // Send final message to the channel before closing
          if (ticket.discordId && interaction.guild) {
            const ticketChannel = interaction.guild.channels.cache.get(ticket.discordId);
            if (ticketChannel && ticketChannel.isTextBased()) {
              const { EmbedBuilder } = await import('discord.js');
              
              const closureEmbed = new EmbedBuilder()
                .setTitle(`✅ Ticket #${ticketId} Reviewed and Closed`)
                .setDescription(`**Review Notes:**\n${reviewNotes}`)
                .addFields(
                  { name: 'Reviewed By', value: `<@${interaction.user.id}>`, inline: true },
                  { name: 'Closed At', value: new Date().toLocaleString(), inline: true },
                  { name: 'Mediation Actions', value: ticket.mediationActions || '_None recorded_', inline: false },
                  { name: 'User Actions', value: ticket.userActions || '_None required_', inline: false }
                )
                .setColor('#F04747')
                .setFooter({ text: 'This channel will be deleted in 10 seconds...' })
                .setTimestamp();
              
              await ticketChannel.send({ embeds: [closureEmbed] });
              
              // Delete the channel after 10 seconds
              setTimeout(async () => {
                try {
                  await ticketChannel.delete('Ticket reviewed and resolved');
                  console.log(`[Discord] Deleted ticket channel ${ticket.discordId} for ticket ${ticketId}`);
                  
                  // Remove from tracking map
                  if (ticket.discordId) {
                    channelToTicketMap.delete(ticket.discordId);
                  }
                } catch (deleteError) {
                  console.error(`[Discord] Error deleting ticket channel:`, deleteError);
                }
              }, 10000);
            }
          }
          
          // Broadcast ticket closure
          broadcast({ type: 'TICKET_UPDATED', data: updatedTicket });
          
          await interaction.editReply('✅ Ticket has been reviewed and marked as closed. The channel will be deleted shortly.');
        } catch (error) {
          console.error('[Discord Modal] Error in review and close:', error);
          await interaction.editReply('❌ Failed to complete the review and closure process.');
        }
      }
      
      // Handle "Assign to Me" button
      else if (interaction.isButton() && interaction.customId.startsWith('ticket_assign_')) {
        await interaction.deferReply({ ephemeral: true });
        
        // Permission check: Only admins can assign tickets
        const { PermissionFlagsBits } = await import('discord.js');
        const member = interaction.member;
        if (!member || !('permissions' in member) || !(member.permissions as any).has(PermissionFlagsBits.ManageMessages)) {
          await interaction.editReply('❌ You need Manage Messages permission to assign tickets.');
          return;
        }
        
        const ticketId = parseInt(interaction.customId.split('_')[2]);
        
        try {
          const ticket = await storage.getTicket(ticketId);
          
          if (!ticket) {
            await interaction.editReply('❌ Ticket not found.');
            return;
          }
          
          // Update ticket to assign to the user
          const updatedTicket = await storage.updateTicket(ticketId, { 
            assigneeId: interaction.user.id 
          });
          
          // Create audit log
          await storage.createTicketAuditLog({
            ticketId: ticketId,
            action: 'assigned',
            performedBy: interaction.user.id,
            performedByUsername: interaction.user.username,
            details: JSON.stringify({ assignedTo: interaction.user.id }),
            serverId: ticket.serverId
          });
          
          // Update the original embed to show assignment
          if (interaction.message && interaction.message.embeds[0]) {
            const { EmbedBuilder } = await import('discord.js');
            const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
            
            originalEmbed.addFields({ 
              name: 'Assigned To', 
              value: `<@${interaction.user.id}>`, 
              inline: true 
            });
            
            await interaction.message.edit({ embeds: [originalEmbed] });
          }
          
          // Broadcast update
          broadcast({ type: 'TICKET_UPDATED', data: updatedTicket });
          
          await interaction.editReply(`✅ Ticket #${ticketId} assigned to you`);
        } catch (error) {
          console.error('[Discord Button] Error assigning ticket:', error);
          await interaction.editReply('❌ Failed to assign ticket.');
        }
      }
      
      // Handle "Close Ticket" button
      else if (interaction.isButton() && interaction.customId.startsWith('ticket_close_')) {
        await interaction.deferReply({ ephemeral: true });
        
        // Permission check: Only admins can close tickets
        const { PermissionFlagsBits } = await import('discord.js');
        const member = interaction.member;
        if (!member || !('permissions' in member) || !(member.permissions as any).has(PermissionFlagsBits.ManageMessages)) {
          await interaction.editReply('❌ You need Manage Messages permission to close tickets.');
          return;
        }
        
        const ticketId = parseInt(interaction.customId.split('_')[2]);
        
        try {
          const ticket = await storage.getTicket(ticketId);
          
          if (!ticket) {
            await interaction.editReply('❌ Ticket not found.');
            return;
          }
          
          // Update ticket status to closed
          const updatedTicket = await storage.updateTicket(ticketId, { status: 'closed', closedAt: new Date() });
          
          // Create audit log
          await storage.createTicketAuditLog({
            ticketId: ticketId,
            action: 'resolved',
            performedBy: interaction.user.id,
            performedByUsername: interaction.user.username,
            details: JSON.stringify({ status: 'closed' }),
            serverId: ticket.serverId
          });
          
          // Create resolution
          await storage.createTicketResolution({
            ticketId: ticketId,
            resolutionType: 'resolved',
            resolutionNotes: 'Ticket closed via Discord action button',
            actionTaken: 'Closed by moderator',
            resolvedBy: interaction.user.id,
            resolvedByUsername: interaction.user.username,
            serverId: ticket.serverId
          });
          
          // Update the original embed to show closure
          if (interaction.message && interaction.message.embeds[0]) {
            const { EmbedBuilder } = await import('discord.js');
            const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
            
            originalEmbed.addFields({ 
              name: 'Closed By', 
              value: `<@${interaction.user.id}>`, 
              inline: true 
            });
            originalEmbed.setColor('#43B581');
            
            await interaction.message.edit({ embeds: [originalEmbed] });
          }
          
          // Archive the ticket thread using TicketChannelManager
          if (ticket.discordId && ticketChannelManager) {
            console.log(`[TicketChannelManager] Archiving thread for closed ticket #${ticketId}`);
            const archived = await ticketChannelManager.archiveTicket(ticket.discordId);
            if (archived) {
              console.log(`[TicketChannelManager] ✅ Successfully archived thread ${ticket.discordId}`);
            } else {
              console.log(`[TicketChannelManager] Failed to archive thread ${ticket.discordId}, thread may already be archived`);
            }
          }
          
          // Broadcast update
          broadcast({ type: 'TICKET_UPDATED', data: updatedTicket });
          
          await interaction.editReply(`✅ Ticket #${ticketId} closed`);
        } catch (error) {
          console.error('[Discord Button] Error closing ticket:', error);
          await interaction.editReply('❌ Failed to close ticket.');
        }
      }
      
      // Handle "Mark Pending" button
      else if (interaction.isButton() && interaction.customId.startsWith('ticket_pending_')) {
        await interaction.deferReply({ ephemeral: true });
        
        // Permission check: Only admins can mark tickets as pending
        const { PermissionFlagsBits } = await import('discord.js');
        const member = interaction.member;
        if (!member || !('permissions' in member) || !(member.permissions as any).has(PermissionFlagsBits.ManageMessages)) {
          await interaction.editReply('❌ You need Manage Messages permission to mark tickets as pending.');
          return;
        }
        
        const ticketId = parseInt(interaction.customId.split('_')[2]);
        
        try {
          const ticket = await storage.getTicket(ticketId);
          
          if (!ticket) {
            await interaction.editReply('❌ Ticket not found.');
            return;
          }
          
          // Update ticket status to pending
          const updatedTicket = await storage.updateTicket(ticketId, { status: 'pending' });
          
          // Create audit log
          await storage.createTicketAuditLog({
            ticketId: ticketId,
            action: 'updated',
            performedBy: interaction.user.id,
            performedByUsername: interaction.user.username,
            details: JSON.stringify({ status: 'pending' }),
            serverId: ticket.serverId
          });
          
          // Update the original embed to show pending status
          if (interaction.message && interaction.message.embeds[0]) {
            const { EmbedBuilder } = await import('discord.js');
            const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
            
            originalEmbed.addFields({ 
              name: 'Marked Pending By', 
              value: `<@${interaction.user.id}>`, 
              inline: true 
            });
            originalEmbed.setColor('#FFA500');
            
            await interaction.message.edit({ embeds: [originalEmbed] });
          }
          
          // Broadcast update
          broadcast({ type: 'TICKET_UPDATED', data: updatedTicket });
          
          await interaction.editReply(`⏳ Ticket #${ticketId} marked as pending`);
        } catch (error) {
          console.error('[Discord Button] Error marking ticket as pending:', error);
          await interaction.editReply('❌ Failed to mark ticket as pending.');
        }
      }
      
      // Handle "Ban User" button
      else if (interaction.isButton() && interaction.customId.startsWith('ticket_ban_')) {
        // Permission check: Only admins can ban users (requires Ban Members permission)
        const { PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
        const member = interaction.member;
        if (!member || !('permissions' in member) || !(member.permissions as any).has(PermissionFlagsBits.BanMembers)) {
          await interaction.reply({ content: '❌ You need Ban Members permission to ban users.', ephemeral: true });
          return;
        }
        
        const ticketId = parseInt(interaction.customId.split('_')[2]);
        
        // Get current ticket data
        const ticket = await storage.getTicket(ticketId);
        
        // Create modal for ban reason
        const modal = new ModalBuilder()
          .setCustomId(`banUserModal_${ticketId}`)
          .setTitle(`Ban User - Ticket #${ticketId}`);
          
        const reasonInput = new TextInputBuilder()
          .setCustomId('banReason')
          .setLabel('Reason for ban')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder('e.g., Repeated rule violations, harassment, spam...')
          .setMaxLength(500);
          
        const actionRow = new ActionRowBuilder<any>().addComponents(reasonInput);
        modal.addComponents(actionRow);
        
        await interaction.showModal(modal);
      }
      
      // Handle modal submission for ban user
      else if (interaction.isModalSubmit() && interaction.customId.startsWith('banUserModal_')) {
        await interaction.deferReply({ ephemeral: true });
        
        const ticketId = parseInt(interaction.customId.split('_')[1]);
        const banReason = interaction.fields.getTextInputValue('banReason');
        
        try {
          const ticket = await storage.getTicket(ticketId);
          
          if (!ticket) {
            await interaction.editReply('❌ Ticket not found.');
            return;
          }
          
          // Update ticket status to closed
          const updatedTicket = await storage.updateTicket(ticketId, { status: 'closed', closedAt: new Date() });
          
          // Create resolution with type "punished"
          await storage.createTicketResolution({
            ticketId: ticketId,
            resolutionType: 'punished',
            resolutionNotes: banReason,
            actionTaken: 'User banned',
            resolvedBy: interaction.user.id,
            resolvedByUsername: interaction.user.username,
            serverId: ticket.serverId
          });
          
          // Create audit log
          await storage.createTicketAuditLog({
            ticketId: ticketId,
            action: 'resolved',
            performedBy: interaction.user.id,
            performedByUsername: interaction.user.username,
            details: JSON.stringify({ action: 'ban', reason: banReason }),
            serverId: ticket.serverId
          });
          
          // Update the original embed in the admin channel
          if (interaction.message && interaction.message.embeds[0]) {
            const { EmbedBuilder } = await import('discord.js');
            const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
            
            originalEmbed.addFields({ 
              name: 'User Banned By', 
              value: `<@${interaction.user.id}>`, 
              inline: true 
            });
            originalEmbed.addFields({ 
              name: 'Ban Reason', 
              value: banReason, 
              inline: false 
            });
            originalEmbed.setColor('#F04747');
            
            await interaction.message.edit({ embeds: [originalEmbed] });
          }
          
          // Broadcast update
          broadcast({ type: 'TICKET_UPDATED', data: updatedTicket });
          
          await interaction.editReply(`🔨 User banned for ticket #${ticketId}\n**Reason:** ${banReason}`);
        } catch (error) {
          console.error('[Discord Modal] Error banning user:', error);
          await interaction.editReply('❌ Failed to ban user.');
        }
      }
      
      // Handle "Warn User" button
      else if (interaction.isButton() && interaction.customId.startsWith('ticket_warn_')) {
        // Permission check: Only admins can warn users
        const { PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
        const member = interaction.member;
        if (!member || !('permissions' in member) || !(member.permissions as any).has(PermissionFlagsBits.ManageMessages)) {
          await interaction.reply({ content: '❌ You need Manage Messages permission to warn users.', ephemeral: true });
          return;
        }
        
        const ticketId = parseInt(interaction.customId.split('_')[2]);
        
        // Get current ticket data
        const ticket = await storage.getTicket(ticketId);
        
        // Create modal for warning reason
        const modal = new ModalBuilder()
          .setCustomId(`warnUserModal_${ticketId}`)
          .setTitle(`Warn User - Ticket #${ticketId}`);
          
        const reasonInput = new TextInputBuilder()
          .setCustomId('warnReason')
          .setLabel('Reason for warning')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder('e.g., Minor rule violation, first offense...')
          .setMaxLength(500);
          
        const actionRow = new ActionRowBuilder<any>().addComponents(reasonInput);
        modal.addComponents(actionRow);
        
        await interaction.showModal(modal);
      }
      
      // Handle modal submission for warn user
      else if (interaction.isModalSubmit() && interaction.customId.startsWith('warnUserModal_')) {
        await interaction.deferReply({ ephemeral: true });
        
        const ticketId = parseInt(interaction.customId.split('_')[1]);
        const warnReason = interaction.fields.getTextInputValue('warnReason');
        
        try {
          const ticket = await storage.getTicket(ticketId);
          
          if (!ticket) {
            await interaction.editReply('❌ Ticket not found.');
            return;
          }
          
          // Update ticket status to closed
          const updatedTicket = await storage.updateTicket(ticketId, { status: 'closed', closedAt: new Date() });
          
          // Create resolution with type "warned"
          await storage.createTicketResolution({
            ticketId: ticketId,
            resolutionType: 'warned',
            resolutionNotes: warnReason,
            actionTaken: 'User warned',
            resolvedBy: interaction.user.id,
            resolvedByUsername: interaction.user.username,
            serverId: ticket.serverId
          });
          
          // Create audit log
          await storage.createTicketAuditLog({
            ticketId: ticketId,
            action: 'resolved',
            performedBy: interaction.user.id,
            performedByUsername: interaction.user.username,
            details: JSON.stringify({ action: 'warn', reason: warnReason }),
            serverId: ticket.serverId
          });
          
          // Update the original embed in the admin channel
          if (interaction.message && interaction.message.embeds[0]) {
            const { EmbedBuilder } = await import('discord.js');
            const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
            
            originalEmbed.addFields({ 
              name: 'User Warned By', 
              value: `<@${interaction.user.id}>`, 
              inline: true 
            });
            originalEmbed.addFields({ 
              name: 'Warning Reason', 
              value: warnReason, 
              inline: false 
            });
            originalEmbed.setColor('#FFA500');
            
            await interaction.message.edit({ embeds: [originalEmbed] });
          }
          
          // Broadcast update
          broadcast({ type: 'TICKET_UPDATED', data: updatedTicket });
          
          await interaction.editReply(`⚠️ User warned for ticket #${ticketId}\n**Reason:** ${warnReason}`);
        } catch (error) {
          console.error('[Discord Modal] Error warning user:', error);
          await interaction.editReply('❌ Failed to warn user.');
        }
      }
      
      // =============== NEW TICKET MODERATION BUTTON HANDLERS ===============
      
      // Handle "Claim Ticket" button
      else if (interaction.isButton() && interaction.customId.startsWith('claimTicket_')) {
        await interaction.deferReply({ ephemeral: true });
        
        // Permission check: Only users with Manage Messages permission can claim tickets
        const { PermissionFlagsBits } = await import('discord.js');
        const member = interaction.member;
        if (!member || !('permissions' in member) || !(member.permissions as any).has(PermissionFlagsBits.ManageMessages)) {
          await interaction.editReply('❌ You need Manage Messages permission to claim tickets.');
          return;
        }
        
        const ticketId = parseInt(interaction.customId.split('_')[1]);
        
        try {
          const ticket = await storage.getTicket(ticketId);
          
          if (!ticket) {
            await interaction.editReply('❌ Ticket not found.');
            return;
          }
          
          if (ticket.status === 'closed') {
            await interaction.editReply('❌ Cannot claim a closed ticket.');
            return;
          }
          
          // Update ticket with assignment
          const updatedTicket = await storage.updateTicket(ticketId, {
            assigneeId: interaction.user.id,
            status: 'in_progress'
          });
          
          // Create audit log
          await storage.createTicketAuditLog({
            ticketId: ticketId,
            action: 'claimed',
            performedBy: interaction.user.id,
            performedByUsername: interaction.user.username,
            details: JSON.stringify({ action: 'claim' }),
            serverId: ticket.serverId
          });
          
          // Get category for notification (handle null categoryId)
          const category = ticket.categoryId ? await storage.getTicketCategory(ticket.categoryId) : null;
          
          // Send embed to ticket channel if it exists
          if (ticket.discordId) {
            const ticketChannel = interaction.guild?.channels.cache.get(ticket.discordId);
            if (ticketChannel && ticketChannel.isTextBased()) {
              const claimedEmbed = createTicketClaimedEmbed(ticket, interaction.user, null);
              await ticketChannel.send({ embeds: [claimedEmbed] });
            }
          }
          
          // Send admin notification
          await sendTicketNotificationToAdminChannel(
            interaction.guildId!,
            interaction.guild,
            storage,
            updatedTicket,
            category,
            'claimed',
            interaction.user
          );
          
          // Broadcast update
          broadcast({ type: 'TICKET_UPDATED', data: updatedTicket });
          
          await interaction.editReply(`✅ You have claimed ticket #${ticketId}`);
        } catch (error) {
          console.error('[Discord] Error claiming ticket:', error);
          await interaction.editReply('❌ Failed to claim ticket.');
        }
      }
      
      // Handle "Assign Ticket" button - Shows modal to select assignee
      else if (interaction.isButton() && interaction.customId.startsWith('assignTicket_')) {
        const ticketId = parseInt(interaction.customId.split('_')[1]);
        
        // Import required components
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
        
        // Create modal for assignee selection
        const modal = new ModalBuilder()
          .setCustomId(`assignTicketModal_${ticketId}`)
          .setTitle(`Assign Ticket #${ticketId}`);
          
        const assigneeInput = new TextInputBuilder()
          .setCustomId('assigneeId')
          .setLabel('User ID or @mention to assign')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('User ID or @mention');
          
        const actionRow = new ActionRowBuilder<any>().addComponents(assigneeInput);
        modal.addComponents(actionRow);
        
        await interaction.showModal(modal);
      }
      
      // Handle "Close Ticket" button enhancement with embed
      else if (interaction.isButton() && interaction.customId.startsWith('closeTicket_')) {
        const ticketId = parseInt(interaction.customId.split('_')[1]);
        
        // Import required components
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
        
        // Create modal for closure reason
        const modal = new ModalBuilder()
          .setCustomId(`closeTicketModal_${ticketId}`)
          .setTitle(`Close Ticket #${ticketId}`);
          
        const resolutionInput = new TextInputBuilder()
          .setCustomId('resolution')
          .setLabel('Resolution notes')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setPlaceholder('Optional: Describe how the ticket was resolved...')
          .setMaxLength(1000);
          
        const actionRow = new ActionRowBuilder<any>().addComponents(resolutionInput);
        modal.addComponents(actionRow);
        
        await interaction.showModal(modal);
      }
      
      // Handle "Reopen Ticket" button
      else if (interaction.isButton() && interaction.customId.startsWith('reopenTicket_')) {
        await interaction.deferReply({ ephemeral: true });
        
        // Permission check: Only users with Manage Messages permission can reopen tickets
        const { PermissionFlagsBits } = await import('discord.js');
        const member = interaction.member;
        if (!member || !('permissions' in member) || !(member.permissions as any).has(PermissionFlagsBits.ManageMessages)) {
          await interaction.editReply('❌ You need Manage Messages permission to reopen tickets.');
          return;
        }
        
        const ticketId = parseInt(interaction.customId.split('_')[1]);
        
        try {
          const ticket = await storage.getTicket(ticketId);
          
          if (!ticket) {
            await interaction.editReply('❌ Ticket not found.');
            return;
          }
          
          if (ticket.status !== 'closed') {
            await interaction.editReply('❌ Ticket is not closed.');
            return;
          }
          
          // Reopen the ticket
          const updatedTicket = await storage.updateTicket(ticketId, {
            status: 'open'
          });
          
          // Create audit log
          await storage.createTicketAuditLog({
            ticketId: ticketId,
            action: 'reopened',
            performedBy: interaction.user.id,
            performedByUsername: interaction.user.username,
            details: JSON.stringify({ action: 'reopen' }),
            serverId: ticket.serverId
          });
          
          // Get category for notification (handle null categoryId)
          const category = ticket.categoryId ? await storage.getTicketCategory(ticket.categoryId) : null;
          
          // Send embed to ticket channel if it exists
          if (ticket.discordId) {
            const ticketChannel = interaction.guild?.channels.cache.get(ticket.discordId);
            if (ticketChannel && ticketChannel.isTextBased()) {
              const reopenedEmbed = createTicketReopenedEmbed(ticket, interaction.user);
              const actionButtons = createTicketActionButtons(ticketId);
              await ticketChannel.send({ embeds: [reopenedEmbed], components: [actionButtons] });
            }
          }
          
          // Reopen the ticket thread using TicketChannelManager
          if (ticket.discordId && ticketChannelManager) {
            console.log(`[TicketChannelManager] Reopening thread for ticket #${ticketId}`);
            const reopened = await ticketChannelManager.reopenTicket(ticket.discordId);
            if (reopened) {
              console.log(`[TicketChannelManager] ✅ Successfully reopened thread ${ticket.discordId}`);
            } else {
              console.log(`[TicketChannelManager] Failed to reopen thread ${ticket.discordId}, thread may not exist`);
            }
          }
          
          // Send admin notification
          await sendTicketNotificationToAdminChannel(
            interaction.guildId!,
            interaction.guild,
            storage,
            updatedTicket,
            category,
            'reopened',
            interaction.user
          );
          
          // Broadcast update
          broadcast({ type: 'TICKET_UPDATED', data: updatedTicket });
          
          await interaction.editReply(`✅ Ticket #${ticketId} has been reopened`);
        } catch (error) {
          console.error('[Discord] Error reopening ticket:', error);
          await interaction.editReply('❌ Failed to reopen ticket.');
        }
      }
      
      // Handle "View Ticket" button
      else if (interaction.isButton() && interaction.customId.startsWith('viewTicket_')) {
        await interaction.deferReply({ ephemeral: true });
        
        const ticketId = parseInt(interaction.customId.split('_')[1]);
        
        try {
          const ticket = await storage.getTicket(ticketId);
          
          if (!ticket) {
            await interaction.editReply('❌ Ticket not found.');
            return;
          }
          
          // Get category for notification (handle null categoryId)
          const category = ticket.categoryId ? await storage.getTicketCategory(ticket.categoryId) : null;
          
          // Create detailed ticket view embed
          const viewEmbed = new EmbedBuilder()
            .setTitle(`📋 Ticket #${ticket.id} - ${ticket.title}`)
            .setDescription(ticket.description)
            .addFields(
              { name: 'Status', value: ticket.status || 'open', inline: true },
              { name: 'Priority', value: ticket.priority || 'normal', inline: true },
              { name: 'Category', value: category?.name || 'Unknown', inline: true },
              { name: 'Created By', value: `<@${ticket.creatorId}>`, inline: true },
              { name: 'Created At', value: ticket.createdAt ? new Date(ticket.createdAt).toLocaleString() : 'Unknown', inline: true }
            )
            .setColor(ticket.status === 'closed' ? 0xED4245 : 0x5865F2)
            .setTimestamp();
            
          if (ticket.assigneeId) {
            viewEmbed.addFields({ name: 'Assigned To', value: `<@${ticket.assigneeId}>`, inline: true });
          }
          
          await interaction.editReply({ embeds: [viewEmbed] });
        } catch (error) {
          console.error('[Discord] Error viewing ticket:', error);
          await interaction.editReply('❌ Failed to load ticket details.');
        }
      }
      
      // Handle modal submission for assign ticket
      else if (interaction.isModalSubmit() && interaction.customId.startsWith('assignTicketModal_')) {
        await interaction.deferReply({ ephemeral: true });
        
        const ticketId = parseInt(interaction.customId.split('_')[1]);
        const assigneeInput = interaction.fields.getTextInputValue('assigneeId');
        
        try {
          // Extract user ID from mention or use directly
          const userIdMatch = assigneeInput.match(/(\d+)/);
          if (!userIdMatch) {
            await interaction.editReply('❌ Invalid user ID or mention.');
            return;
          }
          
          const assigneeId = userIdMatch[1];
          
          // Fetch the user to verify they exist
          const assignee = await interaction.client.users.fetch(assigneeId);
          
          const ticket = await storage.getTicket(ticketId);
          
          if (!ticket) {
            await interaction.editReply('❌ Ticket not found.');
            return;
          }
          
          // Update ticket with assignment
          const updatedTicket = await storage.updateTicket(ticketId, {
            assigneeId: assigneeId,
            status: 'in_progress'
          });
          
          // Create audit log
          await storage.createTicketAuditLog({
            ticketId: ticketId,
            action: 'assigned',
            performedBy: interaction.user.id,
            performedByUsername: interaction.user.username,
            details: JSON.stringify({ assignedTo: assigneeId, assignedToUsername: assignee.username }),
            serverId: ticket.serverId
          });
          
          // Get category for notification (handle null categoryId)
          const category = ticket.categoryId ? await storage.getTicketCategory(ticket.categoryId) : null;
          
          // Send embed to ticket channel if it exists
          if (ticket.discordId) {
            const ticketChannel = interaction.guild?.channels.cache.get(ticket.discordId);
            if (ticketChannel && ticketChannel.isTextBased()) {
              const assignedEmbed = createTicketAssignedEmbed(ticket, assignee, interaction.user);
              await ticketChannel.send({ embeds: [assignedEmbed] });
            }
          }
          
          // Send admin notification
          await sendTicketNotificationToAdminChannel(
            interaction.guildId!,
            interaction.guild,
            storage,
            updatedTicket,
            category,
            'assigned',
            interaction.user,
            { assignee: `<@${assigneeId}>` }
          );
          
          // Broadcast update
          broadcast({ type: 'TICKET_UPDATED', data: updatedTicket });
          
          await interaction.editReply(`✅ Ticket #${ticketId} assigned to <@${assigneeId}>`);
        } catch (error) {
          console.error('[Discord] Error assigning ticket:', error);
          await interaction.editReply('❌ Failed to assign ticket.');
        }
      }
      
      // Handle modal submission for close ticket with enhanced embed
      else if (interaction.isModalSubmit() && interaction.customId.startsWith('closeTicketModal_')) {
        await interaction.deferReply({ ephemeral: true });
        
        const ticketId = parseInt(interaction.customId.split('_')[1]);
        const resolution = interaction.fields.getTextInputValue('resolution');
        
        try {
          const ticket = await storage.getTicket(ticketId);
          
          if (!ticket) {
            await interaction.editReply('❌ Ticket not found.');
            return;
          }
          
          // Update ticket status to closed
          const updatedTicket = await storage.updateTicket(ticketId, { status: 'closed', closedAt: new Date() });
          
          // Create resolution if provided
          if (resolution) {
            await storage.createTicketResolution({
              ticketId: ticketId,
              resolutionType: 'resolved',
              resolutionNotes: resolution,
              actionTaken: 'Ticket closed',
              resolvedBy: interaction.user.id,
              resolvedByUsername: interaction.user.username,
              serverId: ticket.serverId
            });
          }
          
          // Create audit log
          await storage.createTicketAuditLog({
            ticketId: ticketId,
            action: 'closed',
            performedBy: interaction.user.id,
            performedByUsername: interaction.user.username,
            details: JSON.stringify({ resolution: resolution || 'No resolution provided' }),
            serverId: ticket.serverId
          });
          
          // Get category for notification (handle null categoryId)
          const category = ticket.categoryId ? await storage.getTicketCategory(ticket.categoryId) : null;
          
          // Send enhanced embed to ticket channel if it exists
          if (ticket.discordId) {
            const ticketChannel = interaction.guild?.channels.cache.get(ticket.discordId);
            if (ticketChannel && ticketChannel.isTextBased()) {
              const closedEmbed = createTicketClosedEmbed(ticket, interaction.user, resolution);
              const closedButtons = createClosedTicketActionButtons(ticketId);
              await ticketChannel.send({ embeds: [closedEmbed], components: [closedButtons] });
            }
          }
          
          // Send admin notification
          await sendTicketNotificationToAdminChannel(
            interaction.guildId!,
            interaction.guild,
            storage,
            updatedTicket,
            category,
            'closed',
            interaction.user,
            resolution ? { Resolution: resolution } : undefined
          );
          
          // Broadcast update
          broadcast({ type: 'TICKET_UPDATED', data: updatedTicket });
          
          await interaction.editReply(`✅ Ticket #${ticketId} has been closed${resolution ? '\n**Resolution:** ' + resolution : ''}`);
        } catch (error) {
          console.error('[Discord] Error closing ticket:', error);
          await interaction.editReply('❌ Failed to close ticket.');
        }
      }
      
      // =============== END NEW TICKET MODERATION BUTTON HANDLERS ===============
      
      // =============== PLEX MEDIA REQUEST BUTTON HANDLERS ===============
      
      // Handle Plex request approve button
      else if (interaction.isButton() && interaction.customId.startsWith('plex_approve_')) {
        await interaction.deferReply({ ephemeral: true });
        
        const requestId = parseInt(interaction.customId.split('_')[2]);
        const serverId = interaction.guildId;
        
        if (!serverId) {
          await interaction.editReply('❌ This action can only be used in a server.');
          return;
        }
        
        try {
          // Check admin permissions
          const member = interaction.member;
          const settings = await storage.getBotSettings(serverId);
          
          let hasAdminAccess = false;
          if (member && 'permissions' in member) {
            hasAdminAccess = (member.permissions as any).has(PermissionFlagsBits.Administrator);
          }
          if (!hasAdminAccess && settings?.plexAdminRoleId && member && 'roles' in member) {
            const memberRoles = member.roles as any;
            if ('cache' in memberRoles) {
              hasAdminAccess = memberRoles.cache.has(settings.plexAdminRoleId);
            }
          }
          
          if (!hasAdminAccess) {
            await interaction.editReply('❌ You do not have permission to approve media requests.');
            return;
          }
          
          const existingRequest = await storage.getMediaRequest(requestId);
          if (!existingRequest) {
            await interaction.editReply(`❌ Request #${requestId} not found.`);
            return;
          }
          
          if (existingRequest.serverId !== serverId) {
            await interaction.editReply('❌ This request belongs to a different server.');
            return;
          }
          
          if (existingRequest.status !== 'pending') {
            await interaction.editReply(`❌ Request #${requestId} has already been ${existingRequest.status}.`);
            return;
          }
          
          const updated = await storage.approveMediaRequest(
            requestId,
            interaction.user.id,
            interaction.user.username
          );
          
          if (!updated) {
            await interaction.editReply('❌ Failed to approve request. Please try again.');
            return;
          }
          
          await interaction.editReply(`✅ Request #${requestId} (**${updated.title}**) has been approved!`);
          
          // Update the original message to reflect the approval
          try {
            const { createMediaRequestEmbed } = await import('./embed-templates');
            const requestData = {
              id: updated.id,
              title: updated.title,
              mediaType: updated.mediaType,
              status: updated.status,
              username: updated.username,
              userId: updated.userId,
              year: updated.year,
              approvedBy: updated.approvedBy,
              approvedByUsername: updated.approvedByUsername,
              approvedAt: updated.approvedAt,
              createdAt: updated.createdAt
            };
            const embed = createMediaRequestEmbed(requestData);
            await interaction.message.edit({ embeds: [embed], components: [] });
          } catch (e) {
            console.error('Error updating request message:', e);
          }
          
          // Notify the requester
          try {
            const requester = await client.users.fetch(updated.userId);
            if (requester) {
              const { createMediaRequestNotificationEmbed } = await import('./embed-templates');
              const notificationEmbed = createMediaRequestNotificationEmbed({
                id: updated.id,
                title: updated.title,
                mediaType: updated.mediaType,
                status: updated.status,
                username: updated.username,
                userId: updated.userId,
                year: updated.year,
                approvedByUsername: updated.approvedByUsername
              }, 'approved');
              await requester.send({ embeds: [notificationEmbed] }).catch(() => {});
            }
          } catch (e) {
            console.error('Error notifying requester:', e);
          }
          
          console.log(`[Discord] Media request #${requestId} approved by ${interaction.user.username}`);
        } catch (error) {
          console.error('Error approving request:', error);
          await interaction.editReply('❌ Failed to approve request. Please try again.');
        }
      }
      
      // Handle Plex request deny button
      else if (interaction.isButton() && interaction.customId.startsWith('plex_deny_')) {
        const requestId = parseInt(interaction.customId.split('_')[2]);
        const serverId = interaction.guildId;
        
        if (!serverId) {
          await interaction.reply({ content: '❌ This action can only be used in a server.', ephemeral: true });
          return;
        }
        
        try {
          // Check admin permissions
          const member = interaction.member;
          const settings = await storage.getBotSettings(serverId);
          
          let hasAdminAccess = false;
          if (member && 'permissions' in member) {
            hasAdminAccess = (member.permissions as any).has(PermissionFlagsBits.Administrator);
          }
          if (!hasAdminAccess && settings?.plexAdminRoleId && member && 'roles' in member) {
            const memberRoles = member.roles as any;
            if ('cache' in memberRoles) {
              hasAdminAccess = memberRoles.cache.has(settings.plexAdminRoleId);
            }
          }
          
          if (!hasAdminAccess) {
            await interaction.reply({ content: '❌ You do not have permission to deny media requests.', ephemeral: true });
            return;
          }
          
          const existingRequest = await storage.getMediaRequest(requestId);
          if (!existingRequest) {
            await interaction.reply({ content: `❌ Request #${requestId} not found.`, ephemeral: true });
            return;
          }
          
          if (existingRequest.status !== 'pending') {
            await interaction.reply({ content: `❌ Request #${requestId} has already been ${existingRequest.status}.`, ephemeral: true });
            return;
          }
          
          // Show modal for denial reason
          const modal = new ModalBuilder()
            .setCustomId(`plex_deny_modal_${requestId}`)
            .setTitle(`Deny Request #${requestId}`);
          
          const reasonInput = new TextInputBuilder()
            .setCustomId('deny_reason')
            .setLabel('Reason for denial (optional)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(500)
            .setPlaceholder('Enter a reason for denying this request...');
          
          const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
          modal.addComponents(actionRow);
          
          await interaction.showModal(modal);
        } catch (error) {
          console.error('Error handling deny button:', error);
          await interaction.reply({ content: '❌ Failed to process denial. Please try again.', ephemeral: true });
        }
      }
      
      // Handle Plex deny modal submission
      else if (interaction.isModalSubmit() && interaction.customId.startsWith('plex_deny_modal_')) {
        await interaction.deferReply({ ephemeral: true });
        
        const requestId = parseInt(interaction.customId.split('_')[3]);
        const reason = interaction.fields.getTextInputValue('deny_reason') || undefined;
        const serverId = interaction.guildId;
        
        if (!serverId) {
          await interaction.editReply('❌ This action can only be used in a server.');
          return;
        }
        
        try {
          const existingRequest = await storage.getMediaRequest(requestId);
          if (!existingRequest) {
            await interaction.editReply(`❌ Request #${requestId} not found.`);
            return;
          }
          
          if (existingRequest.status !== 'pending') {
            await interaction.editReply(`❌ Request #${requestId} has already been ${existingRequest.status}.`);
            return;
          }
          
          const updated = await storage.denyMediaRequest(
            requestId,
            interaction.user.id,
            interaction.user.username,
            reason
          );
          
          if (!updated) {
            await interaction.editReply('❌ Failed to deny request. Please try again.');
            return;
          }
          
          await interaction.editReply(`❌ Request #${requestId} (**${updated.title}**) has been denied.${reason ? `\n**Reason:** ${reason}` : ''}`);
          
          // Update the original message to reflect the denial
          try {
            const { createMediaRequestEmbed } = await import('./embed-templates');
            const requestData = {
              id: updated.id,
              title: updated.title,
              mediaType: updated.mediaType,
              status: updated.status,
              username: updated.username,
              userId: updated.userId,
              year: updated.year,
              reason: updated.reason,
              approvedBy: updated.approvedBy,
              approvedByUsername: updated.approvedByUsername,
              approvedAt: updated.approvedAt,
              createdAt: updated.createdAt
            };
            const embed = createMediaRequestEmbed(requestData);
            
            // Find and update the message
            const channel = interaction.channel;
            if (channel && 'messages' in channel) {
              const messages = await channel.messages.fetch({ limit: 50 });
              for (const msg of messages.values()) {
                if (msg.components.length > 0) {
                  const buttons = msg.components[0]?.components || [];
                  for (const btn of buttons) {
                    if ('customId' in btn && btn.customId?.includes(`plex_deny_${requestId}`)) {
                      await msg.edit({ embeds: [embed], components: [] });
                      break;
                    }
                  }
                }
              }
            }
          } catch (e) {
            console.error('Error updating request message:', e);
          }
          
          // Notify the requester
          try {
            const requester = await client.users.fetch(updated.userId);
            if (requester) {
              const { createMediaRequestNotificationEmbed } = await import('./embed-templates');
              const notificationEmbed = createMediaRequestNotificationEmbed({
                id: updated.id,
                title: updated.title,
                mediaType: updated.mediaType,
                status: updated.status,
                username: updated.username,
                userId: updated.userId,
                year: updated.year,
                reason: updated.reason,
                approvedByUsername: updated.approvedByUsername
              }, 'denied');
              await requester.send({ embeds: [notificationEmbed] }).catch(() => {});
            }
          } catch (e) {
            console.error('Error notifying requester:', e);
          }
          
          console.log(`[Discord] Media request #${requestId} denied by ${interaction.user.username}${reason ? `: ${reason}` : ''}`);
        } catch (error) {
          console.error('Error denying request:', error);
          await interaction.editReply('❌ Failed to deny request. Please try again.');
        }
      }
      
      // =============== END PLEX MEDIA REQUEST BUTTON HANDLERS ===============
      
      // Handle embed builder modal submission
      else if (interaction.isModalSubmit() && interaction.customId === 'embed_create_modal') {
        try {
          await interaction.deferReply({ ephemeral: true });
          
          const title = interaction.fields.getTextInputValue('embed_title') || null;
          const description = interaction.fields.getTextInputValue('embed_description') || null;
          const color = interaction.fields.getTextInputValue('embed_color') || '#5865F2';
          const footer = interaction.fields.getTextInputValue('embed_footer') || null;
          const imageUrl = interaction.fields.getTextInputValue('embed_image') || null;
          
          if (!title && !description) {
            await interaction.editReply('❌ You must provide at least a title or description.');
            return;
          }
          
          await storage.createOrUpdateUserEmbed({
            userId: interaction.user.id,
            serverId: interaction.guildId!,
            title,
            description,
            color,
            footer,
            imageUrl
          });
          
          const previewEmbed = new EmbedBuilder();
          if (title) previewEmbed.setTitle(title);
          if (description) previewEmbed.setDescription(description);
          if (color) {
            try {
              previewEmbed.setColor(parseInt(color.replace('#', ''), 16));
            } catch {}
          }
          if (footer) previewEmbed.setFooter({ text: footer });
          if (imageUrl) previewEmbed.setImage(imageUrl);
          
          await interaction.editReply({ 
            content: '✅ Embed saved! Use `/embed preview` to see it or `/embed send` to send it.',
            embeds: [previewEmbed]
          });
        } catch (error) {
          console.error('[Embed Modal] Error:', error);
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply('❌ An error occurred while saving your embed.');
          }
        }
      }
      
      // Trigger workflows for button clicks (fire-and-forget)
      if (interaction.isButton() && interaction.guild?.id) {
        try {
          workflowEngine.handleEvent({
            eventType: 'button_click',
            userId: interaction.user.id,
            channelId: interaction.channel?.id,
            guildId: interaction.guild.id,
            customId: interaction.customId,
            member: interaction.member as any,
            client: client!
          }).catch(console.error);
        } catch (workflowError) {
          console.error('[WorkflowEngine] Error triggering button_click workflow:', workflowError);
        }
      }
      
      // Trigger workflows for select menu interactions (fire-and-forget)
      if (interaction.isStringSelectMenu() && interaction.guild?.id) {
        try {
          workflowEngine.handleEvent({
            eventType: 'select_menu',
            userId: interaction.user.id,
            channelId: interaction.channel?.id,
            guildId: interaction.guild.id,
            customId: interaction.customId,
            member: interaction.member as any,
            client: client!
          }).catch(console.error);
        } catch (workflowError) {
          console.error('[WorkflowEngine] Error triggering select_menu workflow:', workflowError);
        }
      }
      
      // Handle poll button interactions
      if (interaction.isButton() && interaction.customId.startsWith('poll_')) {
        try {
          const handled = await handlePollButtonInteraction(interaction, storage, client!);
          if (handled) return;
        } catch (pollError) {
          console.error('[Polls] Error handling poll button interaction:', pollError);
        }
      }
      
      // Handle poll select menu interactions
      if (interaction.isStringSelectMenu() && interaction.customId.startsWith('poll_')) {
        try {
          const handled = await handlePollSelectMenuInteraction(interaction, storage, client!);
          if (handled) return;
        } catch (pollError) {
          console.error('[Polls] Error handling poll select menu interaction:', pollError);
        }
      }
      
      // Handle giveaway button interactions
      if (interaction.isButton() && interaction.customId.startsWith('giveaway_')) {
        try {
          const handled = await handleGiveawayButtonInteraction(interaction, storage, client!);
          if (handled) return;
        } catch (giveawayError) {
          console.error('[Giveaways] Error handling giveaway button interaction:', giveawayError);
        }
      }
    });
    
    // Handle messages in ticket channels/threads
    client.on(Events.MessageCreate, async (message) => {
      // Ignore bot messages
      if (message.author.bot) return;
      
      // Run auto-mod check first
      try {
        const autoModResult = await handleAutoMod(message, storage);
        if (autoModResult.triggered) {
          console.log(`[AutoMod] Action triggered for user ${message.author.tag}: ${autoModResult.reason}`);
          return; // Stop processing if automod handled it
        }
      } catch (autoModError) {
        console.error('[AutoMod] Error in automod handler:', autoModError);
      }
      
      // Track message metrics for analytics (fire-and-forget)
      if (message.guild) {
        metricsTracker.trackMessage(message.guild.id, message.author.id).catch(() => {});
      }
      
      // Economy message rewards (fire-and-forget, no blocking)
      if (message.guild) {
        (async () => {
          try {
            const economySettings = await dbStorage.getEconomySettings(message.guild!.id);
            if (!economySettings?.isEnabled || !economySettings.messageReward) return;
            
            const userBalance = await dbStorage.getOrCreateUserBalance(message.guild!.id, message.author.id);
            const now = new Date();
            const cooldownMs = (economySettings.messageRewardCooldown || 60) * 1000;
            
            if (userBalance.lastMessageReward) {
              const lastReward = new Date(userBalance.lastMessageReward);
              if (now.getTime() - lastReward.getTime() < cooldownMs) return;
            }
            
            await dbStorage.addBalance(
              message.guild!.id, 
              message.author.id, 
              economySettings.messageReward, 
              'message', 
              'Message activity reward'
            );
            await dbStorage.updateUserBalance(message.guild!.id, message.author.id, { lastMessageReward: now });
          } catch (e) {
            // Silently ignore economy errors to not block message processing
          }
        })();
      }
      
      // Handle custom commands using commandEngine
      if (message.guild) {
        try {
          const settings = await storage.getBotSettings(message.guild.id);
          const prefix = settings?.botPrefix || '!';
          
          if (message.content.startsWith(prefix)) {
            const args = message.content.slice(prefix.length).trim().split(/\s+/);
            const trigger = args.shift()?.toLowerCase();
            
            if (trigger) {
              // Check if trigger matches a built-in slash command (prevent overriding critical bot functions)
              if (commands.has(trigger)) {
                console.log(`[CommandEngine] Skipping custom command "${trigger}" - matches built-in command`);
                return;
              }
              
              // Use commandEngine to find and execute custom commands
              const customCmd = commandEngine.findCommand(message.guild.id, trigger);
              if (customCmd) {
                try {
                  const result = await commandEngine.executeCommand(message, customCmd, args);
                  if (!result.success && result.error) {
                    console.log(`[CommandEngine] Command "${trigger}" failed: ${result.error}`);
                  }
                } catch (execError) {
                  console.error(`[CommandEngine] Error executing command "${trigger}":`, execError);
                  try {
                    await message.reply({
                      content: '❌ An error occurred while running this command. Please try again later.',
                      allowedMentions: { repliedUser: false }
                    });
                  } catch {}
                }
                return;
              }
            }
          }
        } catch (customCmdError) {
          console.error('[CommandEngine] Error handling custom command:', customCmdError);
        }
      }
      
      // Import ChannelType to check if it's a thread
      const { ChannelType } = await import('discord.js');
      
      // Check if message is in a thread and use thread sync if applicable
      if (message.channel.type === ChannelType.PublicThread || message.channel.type === ChannelType.PrivateThread) {
        try {
          // Use thread sync service for thread messages
          await syncThreadMessageToDashboard(
            { storage, client: client!, broadcast },
            message.channel,
            message
          );
          return; // Thread sync handles everything
        } catch (error) {
          console.error('[Thread Sync] Error syncing thread message:', error);
          // Fall through to regular message handling if thread sync fails
        }
      }
      
      // Regular channel/forum post message handling (existing logic)
      // Check if message is in a tracked ticket channel/thread
      let ticketId = channelToTicketMap.get(message.channel.id);
      if (!ticketId) {
        // Try to find ticket by Discord ID in database
        const tickets = await storage.getAllTickets();
        const ticket = tickets.find(t => t.discordId === message.channel.id);
        if (ticket) {
          channelToTicketMap.set(message.channel.id, ticket.id);
          ticketId = ticket.id;
        } else {
          return; // Not a ticket channel
        }
      }
      
      if (!ticketId) return;
      
      try {
        // Ensure user exists in database
        let discordUser = await storage.getDiscordUser(message.author.id);
        if (!discordUser) {
          await storage.createDiscordUser({
            id: message.author.id,
            username: message.author.username,
            discriminator: message.author.discriminator || '0000',
            avatar: message.author.avatarURL() || undefined,
            isAdmin: false
          });
        }
        
        // Store message in database
        const ticketMessage = await storage.createTicketMessage({
          ticketId: ticketId,
          senderId: message.author.id,
          content: message.content,
          senderUsername: message.author.username
        });
        
        console.log(`[Discord Message] Synced message for ticket ${ticketId}`);
        
        // Broadcast message addition event
        broadcast({
          type: 'MESSAGE_ADDED',
          data: {
            ticketId: ticketId,
            message: ticketMessage
          }
        });
        
      } catch (error) {
        console.error('[Discord Message] Error syncing message to database:', error);
      }
      
      // Trigger workflows for message_received (fire-and-forget)
      if (message.guild?.id) {
        try {
          workflowEngine.handleEvent({
            eventType: 'message_received',
            userId: message.author.id,
            channelId: message.channel.id,
            guildId: message.guild.id,
            messageId: message.id,
            messageContent: message.content,
            member: message.member ?? undefined,
            client: client!
          }).catch(console.error);
        } catch (workflowError) {
          console.error('[WorkflowEngine] Error triggering message_received workflow:', workflowError);
        }
      }
    });

    // Handle thread creation (both forum posts and regular threads)
    client.on(Events.ThreadCreate, async (thread, newlyCreated) => {
      try {
        // Only process newly created threads
        if (!newlyCreated) return;
        
        const { ChannelType, EmbedBuilder, PermissionFlagsBits } = await import('discord.js');
        const parent = thread.parent;
        
        // Handle forum posts (existing functionality)
        if (parent && parent.type === ChannelType.GuildForum) {
        
        console.log(`[Forum Post] New forum post detected: "${thread.name}" in forum "${parent.name}"`);
        
        // Get the starter message (initial forum post content)
        const starterMessage = await thread.fetchStarterMessage();
        if (!starterMessage) {
          console.log('[Forum Post] No starter message found, skipping ticket creation');
          return;
        }
        
        // Check if bot has permission to see and send messages in the thread
        const botMember = thread.guild.members.cache.get(client!.user!.id);
        if (!botMember) return;
        
        // Ensure user exists in database
        let discordUser = await storage.getDiscordUser(starterMessage.author.id);
        if (!discordUser) {
          await storage.createDiscordUser({
            id: starterMessage.author.id,
            username: starterMessage.author.username,
            discriminator: starterMessage.author.discriminator || '0000',
            avatar: starterMessage.author.avatarURL() || undefined,
            isAdmin: false
          });
        }
        
        // Create ticket from forum post
        const ticketData = {
          title: thread.name,
          description: starterMessage.content || 'Forum post (see Discord thread for details)',
          status: 'open' as const,
          priority: 'normal' as const,
          categoryId: null, // Forum posts don't have a category
          creatorId: starterMessage.author.id,
          serverId: thread.guildId || null,
          discordId: thread.id // Link to the forum thread
        };
        
        const ticket = await storage.createTicket(ticketData);
        console.log(`[Forum Post] ✅ Ticket created from forum post: ID ${ticket.id}, Title: "${thread.name}"`);
        
        // Create initial message
        await storage.createTicketMessage({
          ticketId: ticket.id,
          senderId: starterMessage.author.id,
          content: starterMessage.content,
          senderUsername: starterMessage.author.username
        });
        
        // Track the thread-ticket mapping
        channelToTicketMap.set(thread.id, ticket.id);
        
        // Send notification in the forum thread
        const confirmEmbed = new EmbedBuilder()
          .setTitle('🎫 Ticket Created')
          .setDescription(`Your forum post has been converted to support ticket #${ticket.id}`)
          .addFields(
            { name: 'Status', value: '✅ Open', inline: true },
            { name: 'Priority', value: '🟢 Normal', inline: true }
          )
          .setColor('#5865F2')
          .setFooter({ text: 'Our team will assist you shortly' })
          .setTimestamp();
        
        await thread.send({ embeds: [confirmEmbed] });
        
        // Broadcast ticket creation event to dashboard
        console.log(`[Forum Post] Broadcasting TICKET_CREATED event for ticket ${ticket.id}`);
        broadcast({ 
          type: 'TICKET_CREATED', 
          data: ticket
        });
        
        // Send notification to admin channel
        if (thread.guild && ticket.serverId) {
          const category = ticket.categoryId ? await storage.getTicketCategory(ticket.categoryId) : null;
          await sendTicketNotificationToAdminChannel(
            ticket.serverId,
            thread.guild,
            storage,
            ticket,
            category,
            'created',
            starterMessage.author
          );
        }
        
        console.log(`[Forum Post] Successfully processed forum post into ticket ${ticket.id}`);
          return; // Exit after handling forum post
        }
        
        // Handle regular threads (thread integration)
        if (!parent) return; // Thread must have a parent channel
        
        // Only handle PublicThread and PrivateThread
        if (thread.type !== ChannelType.PublicThread && thread.type !== ChannelType.PrivateThread) {
          return;
        }
        
        const serverId = thread.guildId;
        if (!serverId) return;
        
        console.log(`[Thread Integration] New thread detected: "${thread.name}" in channel "${parent.name}"`);
        
        // IMPORTANT: Only process threads that were created as tickets
        // Check if this thread was created by the ticket system (has ticket naming pattern)
        const isTicketThread = thread.name.startsWith('🎫 Ticket #') || thread.name.startsWith('Ticket #');
        
        // Check if thread was created by the bot itself
        const wasCreatedByBot = thread.ownerId === client?.user?.id;
        
        // Only sync threads that are explicitly ticket threads
        if (!isTicketThread && !wasCreatedByBot) {
          console.log(`[Thread Integration] Thread "${thread.name}" is not a ticket thread (created by user), skipping`);
          return;
        }
        
        // Check if thread integration is enabled for this server
        const botSettings = await storage.getBotSettings(serverId);
        if (!botSettings?.threadIntegrationEnabled) {
          console.log(`[Thread Integration] Thread integration not enabled for server ${serverId}`);
          return;
        }
        
        // If a specific ticket channel is configured, only process threads in that channel
        if (botSettings.threadChannelId && parent.id !== botSettings.threadChannelId) {
          console.log(`[Thread Integration] Thread not in configured ticket channel, skipping`);
          return;
        }
        
        // Skip if auto-create is disabled (threads must be created via ticket panel)
        if (!botSettings.threadAutoCreate && !wasCreatedByBot) {
          console.log(`[Thread Integration] Auto-create disabled and thread not created by bot, skipping`);
          return;
        }
        
        // Ensure thread owner exists in database
        const owner = await thread.fetchOwner();
        if (!owner) {
          console.log(`[Thread Integration] Could not fetch thread owner, skipping`);
          return;
        }
        
        let discordUser = await storage.getDiscordUser(owner.user!.id);
        if (!discordUser) {
          await storage.createDiscordUser({
            id: owner.user!.id,
            username: owner.user!.username,
            discriminator: owner.user!.discriminator || '0000',
            avatar: owner.user!.avatarURL() || undefined,
            isAdmin: false
          });
        }
        
        // Get default category or first available category
        const categories = await storage.getTicketCategoriesByServerId(serverId);
        const defaultCategory = categories.length > 0 ? categories[0] : null;
        
        // Create ticket from thread
        const ticketData = {
          title: thread.name,
          description: `Created from Discord thread: https://discord.com/channels/${serverId}/${thread.id}`,
          status: 'open' as const,
          priority: (botSettings.defaultPriority || 'normal') as any,
          categoryId: defaultCategory?.id || null,
          creatorId: owner.user!.id,
          serverId: serverId,
          discordId: thread.id
        };
        
        const ticket = await storage.createTicket(ticketData);
        console.log(`[Thread Integration] ✅ Ticket created from thread: ID ${ticket.id}, Title: "${thread.name}"`);
        
        // Create thread mapping
        await getOrCreateThreadMapping(
          { storage, client: client!, broadcast },
          thread.id,
          parent.id,
          ticket.id,
          serverId
        );
        
        // Track in local map
        channelToTicketMap.set(thread.id, ticket.id);
        
        // Send welcome message to thread
        const welcomeEmbed = new EmbedBuilder()
          .setTitle('🎫 Support Ticket Created')
          .setDescription(botSettings.welcomeMessage || 'Thank you for creating a ticket. Our support team will assist you shortly.')
          .addFields(
            { name: 'Ticket ID', value: `#${ticket.id}`, inline: true },
            { name: 'Status', value: '✅ Open', inline: true },
            { name: 'Priority', value: `${ticket.priority}`, inline: true }
          )
          .setColor('#5865F2')
          .setFooter({ text: 'Messages in this thread will sync with the dashboard' })
          .setTimestamp();
        
        await thread.send({ embeds: [welcomeEmbed] });
        
        // Broadcast ticket creation event to dashboard
        console.log(`[Thread Integration] Broadcasting TICKET_CREATED event for ticket ${ticket.id}`);
        broadcast({ 
          type: 'TICKET_CREATED', 
          data: ticket
        });
        
        // Send notification to admin channel
        if (thread.guild) {
          await sendTicketNotificationToAdminChannel(
            serverId,
            thread.guild,
            storage,
            ticket,
            defaultCategory,
            'created',
            owner.user!
          );
        }
        
        console.log(`[Thread Integration] Successfully processed thread into ticket ${ticket.id}`);
      } catch (error) {
        console.error('[Thread Integration] Error processing thread:', error);
      }
    });

    // Handle thread updates (status changes) - ONLY for threads with ticket mappings
    client.on(Events.ThreadUpdate, async (oldThread, newThread) => {
      try {
        const { ChannelType } = await import('discord.js');
        
        // Only handle thread types
        if (newThread.type !== ChannelType.PublicThread && newThread.type !== ChannelType.PrivateThread) {
          return;
        }
        
        // Only process threads that have a ticket mapping (were explicitly created as tickets)
        const mapping = await storage.getThreadMapping(newThread.id);
        if (!mapping) {
          // This is a regular thread, not a ticket thread - ignore it
          return;
        }
        
        console.log(`[Thread Integration] Ticket thread updated: "${newThread.name}"`);
        
        // Check if status changed (archived or locked)
        const wasArchived = oldThread.archived;
        const isArchived = newThread.archived;
        const wasLocked = oldThread.locked;
        const isLocked = newThread.locked;
        
        if (wasArchived !== isArchived || wasLocked !== isLocked) {
          console.log(`[Thread Integration] Thread status changed - Archived: ${isArchived}, Locked: ${isLocked}`);
          
          // Sync status to ticket
          await syncThreadStatusToTicket(
            { storage, client: client!, broadcast },
            newThread.id,
            isArchived || false,
            isLocked || false
          );
        }
      } catch (error) {
        console.error('[Thread Integration] Error handling thread update:', error);
      }
    });

    // Handle thread deletion
    client.on(Events.ThreadDelete, async (thread) => {
      try {
        const { ChannelType } = await import('discord.js');
        
        // Only handle thread types
        if (thread.type !== ChannelType.PublicThread && thread.type !== ChannelType.PrivateThread) {
          return;
        }
        
        console.log(`[Thread Integration] Thread deleted: "${thread.name}"`);
        
        // Get thread mapping
        const mapping = await storage.getThreadMapping(thread.id);
        if (!mapping) {
          console.log(`[Thread Integration] No mapping found for deleted thread ${thread.id}`);
          return;
        }
        
        // Update mapping status to deleted
        await storage.updateThreadMapping(thread.id, {
          status: 'deleted'
        });
        
        // Close associated ticket
        const ticket = await storage.getTicket(mapping.ticketId);
        if (ticket && ticket.status === 'open') {
          await storage.updateTicket(mapping.ticketId, {
            status: 'resolved'
          });
          
          console.log(`[Thread Integration] Closed ticket ${mapping.ticketId} because thread was deleted`);
          
          // Broadcast ticket update
          broadcast({
            type: 'TICKET_UPDATED',
            data: { id: mapping.ticketId, status: 'resolved' }
          });
        }
        
        // Remove from local map
        channelToTicketMap.delete(thread.id);
      } catch (error) {
        console.error('[Thread Integration] Error handling thread deletion:', error);
      }
    });

    // Handle presence updates to detect streaming
    client.on(Events.PresenceUpdate, async (oldPresence, newPresence) => {
      await handlePresenceUpdate(storage, oldPresence, newPresence);
    });

    // Handle member join for workflows
    client.on(Events.GuildMemberAdd, async (member) => {
      try {
        workflowEngine.handleEvent({
          eventType: 'member_join',
          userId: member.id,
          guildId: member.guild.id,
          member: member,
          client: client!
        }).catch(console.error);
      } catch (workflowError) {
        console.error('[WorkflowEngine] Error triggering member_join workflow:', workflowError);
      }
    });

    // Handle member leave for workflows
    client.on(Events.GuildMemberRemove, async (member) => {
      try {
        workflowEngine.handleEvent({
          eventType: 'member_leave',
          userId: member.id,
          guildId: member.guild.id,
          client: client!
        }).catch(console.error);
      } catch (workflowError) {
        console.error('[WorkflowEngine] Error triggering member_leave workflow:', workflowError);
      }
    });

    // Handle reaction add for workflows
    client.on(Events.MessageReactionAdd, async (reaction, user) => {
      if (reaction.message.guild?.id) {
        try {
          workflowEngine.handleEvent({
            eventType: 'reaction_add',
            userId: user.id,
            channelId: reaction.message.channel.id,
            guildId: reaction.message.guild.id,
            messageId: reaction.message.id,
            emoji: reaction.emoji.name ?? undefined,
            client: client!
          }).catch(console.error);
        } catch (workflowError) {
          console.error('[WorkflowEngine] Error triggering reaction_add workflow:', workflowError);
        }
      }
    });

    // Handle voice state updates for workflows
    client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
      try {
        const userId = newState.member?.id || oldState.member?.id;
        const guildId = newState.guild.id;
        
        // If user joined a voice channel
        if (!oldState.channel && newState.channel) {
          workflowEngine.handleEvent({
            eventType: 'voice_join',
            userId: newState.member?.id,
            guildId: newState.guild.id,
            voiceChannelId: newState.channel.id,
            client: client!
          }).catch(console.error);
          
          // Track voice join time for economy rewards
          if (userId) {
            voiceTimeTracker.set(`${guildId}-${userId}`, { joinTime: Date.now(), guildId });
          }
        }
        // If user left a voice channel
        if (oldState.channel && !newState.channel) {
          workflowEngine.handleEvent({
            eventType: 'voice_leave',
            userId: oldState.member?.id,
            guildId: oldState.guild.id,
            voiceChannelId: oldState.channel.id,
            client: client!
          }).catch(console.error);
          
          // Calculate and award voice time rewards
          if (userId) {
            const trackerKey = `${guildId}-${userId}`;
            const tracker = voiceTimeTracker.get(trackerKey);
            if (tracker) {
              voiceTimeTracker.delete(trackerKey);
              
              const minutesInVoice = Math.floor((Date.now() - tracker.joinTime) / 60000);
              
              // Track voice minutes for analytics (fire-and-forget)
              if (minutesInVoice >= 1) {
                metricsTracker.trackVoiceMinutes(guildId, minutesInVoice).catch(() => {});
              }
              
              // Fire-and-forget voice reward calculation
              (async () => {
                try {
                  const economySettings = await dbStorage.getEconomySettings(guildId);
                  if (!economySettings?.isEnabled || !economySettings.voiceRewardPerMin) return;
                  
                  if (minutesInVoice < 1) return;
                  
                  const reward = minutesInVoice * economySettings.voiceRewardPerMin;
                  await dbStorage.addBalance(
                    guildId, 
                    userId, 
                    reward, 
                    'voice', 
                    `Voice chat reward (${minutesInVoice} minutes)`
                  );
                } catch (e) {
                  // Silently ignore economy errors
                }
              })();
            }
          }
        }
      } catch (workflowError) {
        console.error('[WorkflowEngine] Error triggering voice workflow:', workflowError);
      }
    });

    // Handle member update for role changes
    client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
      try {
        const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
        const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));
        
        addedRoles.forEach(role => {
          workflowEngine.handleEvent({
            eventType: 'role_add',
            userId: newMember.id,
            guildId: newMember.guild.id,
            roleId: role.id,
            client: client!
          }).catch(console.error);
        });
        
        removedRoles.forEach(role => {
          workflowEngine.handleEvent({
            eventType: 'role_remove',
            userId: newMember.id,
            guildId: newMember.guild.id,
            roleId: role.id,
            client: client!
          }).catch(console.error);
        });
      } catch (workflowError) {
        console.error('[WorkflowEngine] Error triggering role workflow:', workflowError);
      }
    });

    // Handle ready event
    client.once(Events.ClientReady, async (readyClient) => {
      console.log(`Discord bot ready! Logged in as ${readyClient.user.tag}`);
      
      // Set bot presence to show it's online and active
      readyClient.user.setPresence({
        activities: [{ name: 'Support Tickets | /ticket', type: ActivityType.Watching }],
        status: 'online',
      });
      console.log('[Discord] Bot presence set to ONLINE');
      
      // Log connected servers
      const guilds = readyClient.guilds.cache;
      console.log(`\n=== Bot Server Status ===`);
      console.log(`Connected to ${guilds.size} server(s):`);
      guilds.forEach(guild => {
        console.log(`  - ${guild.name} (ID: ${guild.id}) | ${guild.memberCount} members`);
      });
      console.log(`========================\n`);
      
      // Initialize guild identity service with Discord client
      console.log('[GuildIdentity] Registering Discord client...');
      guildIdentityService.setClient(readyClient);
      
      // Load custom commands for all connected guilds
      console.log('[CommandEngine] Loading custom commands for all guilds...');
      for (const [guildId, guild] of guilds) {
        try {
          await commandEngine.loadCommands(guildId);
          console.log(`[CommandEngine] ✅ Loaded commands for ${guild.name}`);
        } catch (cmdError) {
          console.error(`[CommandEngine] Failed to load commands for ${guild.name}:`, cmdError);
        }
      }
      
      // Sync guild identities on startup (optional - rate-limited)
      console.log('[GuildIdentity] Syncing guild identities...');
      try {
        const syncResult = await guildIdentityService.syncAllGuilds();
        console.log(`[GuildIdentity] ✅ Sync complete: ${syncResult.success} success, ${syncResult.failed} failed`);
      } catch (syncError) {
        console.error('[GuildIdentity] Failed to sync guild identities:', syncError);
      }
      
      // Load ticket-channel mappings with retry logic
      const mappingsLoaded = await loadTicketMappings();
      
      // Schedule periodic refresh to recover from database failures
      scheduleTicketMappingRefresh();
      
      if (!mappingsLoaded) {
        console.warn('[Discord] ⚠️  Bot started with incomplete ticket mappings. Will retry every 5 minutes.');
      }
      
      // Initialize TicketChannelManager for organized ticket channels
      try {
        console.log('[TicketChannelManager] Initializing ticket channel organization...');
        
        // Get guild ID from env or use first guild
        const guildId = process.env.DISCORD_PRIMARY_GUILD_ID || guilds.first()?.id;
        
        if (!guildId) {
          console.warn('[TicketChannelManager] No guild ID available, skipping initialization');
        } else {
          // Create manager instance
          ticketChannelManager = new TicketChannelManager({
            serverId: guildId,
            client: readyClient,
            storage
          });
          
          // Cache existing channel structure
          await ticketChannelManager.cacheChannelStructure();
          
          // Start daily cleanup job for old archived threads
          threadCleanupJobInterval = startThreadCleanupJob(ticketChannelManager);
          
          console.log('[TicketChannelManager] ✅ Ticket channel manager initialized successfully');
        }
      } catch (error) {
        console.error('[TicketChannelManager] Failed to initialize:', error);
        console.warn('[TicketChannelManager] Ticket system will fall back to admin channel only');
      }
      
      // NOTE: registerCommands() is commented out because it adds a duplicate
      // interactionCreate handler. All interaction handling is already done
      // in the main handler above (line 67).
      // registerCommands(client!, storage, broadcast);
      
      // Initialize workflow engine for automation
      console.log('[WorkflowEngine] Initializing workflow engine...');
      try {
        await workflowEngine.initialize();
        console.log('[WorkflowEngine] ✅ Workflow engine initialized successfully');
      } catch (workflowError) {
        console.error('[WorkflowEngine] Failed to initialize workflow engine:', workflowError);
      }
      
      // Start background jobs for ticket system hardening
      console.log('[Bot] Starting ticket system safeguard background jobs...');
      startBackgroundJobs(client!, storage, broadcast);
      
      // Start scheduled messages scheduler (check every minute)
      console.log('[Scheduler] Starting scheduled messages job...');
      setInterval(async () => {
        try {
          const dueMessages = await storage.getDueScheduledMessages();
          
          for (const scheduled of dueMessages) {
            try {
              const guild = readyClient.guilds.cache.get(scheduled.serverId);
              if (!guild) continue;
              
              const channel = guild.channels.cache.get(scheduled.channelId);
              if (!channel || !channel.isTextBased()) continue;
              
              // Parse embed if present
              if (scheduled.embedJson) {
                try {
                  const embedData = JSON.parse(scheduled.embedJson);
                  const embed = new EmbedBuilder(embedData);
                  await (channel as any).send({ 
                    content: scheduled.message || undefined, 
                    embeds: [embed] 
                  });
                } catch {
                  await (channel as any).send(scheduled.message);
                }
              } else if (scheduled.message) {
                await (channel as any).send(scheduled.message);
              }
              
              console.log(`[Scheduler] Sent scheduled message #${scheduled.id} to ${guild.name}/${channel.name}`);
              
              // Handle repeat or deactivate
              if (scheduled.cronExpression) {
                const nextRun = calculateNextRun(scheduled.cronExpression, new Date());
                await storage.updateScheduledMessage(scheduled.id, { nextRunAt: nextRun });
                console.log(`[Scheduler] Rescheduled message #${scheduled.id} for ${nextRun.toISOString()}`);
              } else {
                await storage.updateScheduledMessage(scheduled.id, { isActive: false });
                console.log(`[Scheduler] Deactivated one-time message #${scheduled.id}`);
              }
            } catch (msgError) {
              console.error(`[Scheduler] Error sending scheduled message #${scheduled.id}:`, msgError);
              // Deactivate on error to prevent spam
              await storage.updateScheduledMessage(scheduled.id, { isActive: false });
            }
          }
        } catch (error) {
          console.error('[Scheduler] Error in scheduled messages job:', error);
        }
      }, 60 * 1000); // Check every minute
      
      // Cleanup old interaction locks every hour to prevent table bloat
      setInterval(async () => {
        try {
          await storage.cleanupOldInteractionLocks();
          console.log('[Deduplication] ✅ Cleaned up old interaction locks (>5 minutes old)');
        } catch (error) {
          console.error('[Deduplication] ❌ Error cleaning interaction locks:', error);
        }
      }, 60 * 60 * 1000); // Run every 1 hour
      
      // Initialize stream tracking
      await initializeStreamTracking(client!, storage);
      
      // Start multi-platform stream polling service
      console.log('[Bot] Starting stream polling service...');
      try {
        await streamPoller.start(client!, storage);
        console.log('[Bot] ✅ Stream polling service started successfully');
      } catch (pollerError) {
        console.error('[Bot] Failed to start stream polling service:', pollerError);
      }
      
      // Initialize auto-detection for stream notifications
      console.log('[Bot] Initializing stream notification auto-detection...');
      await initializeAutoDetection(client!, storage);
      
      // Schedule periodic auto-detection scans
      console.log('[Bot] Scheduling auto-detection periodic scans...');
      autoDetectionScanInterval = scheduleAutoDetectionScans(client!, storage);
      
      // Start SLA monitor for breach detection and auto-escalation
      console.log('[Bot] Starting SLA monitor service...');
      try {
        const { startSlaMonitor } = await import('../services/sla-monitor');
        startSlaMonitor();
        console.log('[Bot] ✅ SLA monitor started successfully');
      } catch (slaError) {
        console.error('[Bot] Failed to start SLA monitor:', slaError);
      }
      
      // Start poll scheduler for auto-ending timed polls
      console.log('[Bot] Starting poll scheduler...');
      try {
        startPollScheduler(readyClient, storage);
        console.log('[Bot] ✅ Poll scheduler started successfully');
      } catch (pollSchedulerError) {
        console.error('[Bot] Failed to start poll scheduler:', pollSchedulerError);
      }
      
      // Start giveaway scheduler for auto-ending timed giveaways
      console.log('[Bot] Starting giveaway scheduler...');
      try {
        startGiveawayScheduler(readyClient, storage);
        console.log('[Bot] ✅ Giveaway scheduler started successfully');
      } catch (giveawaySchedulerError) {
        console.error('[Bot] Failed to start giveaway scheduler:', giveawaySchedulerError);
      }
      
      // Start Homelab Presence service for dynamic bot status
      console.log('[Bot] Starting Homelab Presence service...');
      try {
        const presenceService = initHomelabPresence(readyClient);
        await presenceService.start();
        console.log('[Bot] ✅ Homelab Presence service started successfully');
      } catch (presenceError) {
        console.error('[Bot] Failed to start Homelab Presence service:', presenceError);
        console.log('[Bot] Bot will use default presence instead');
      }
      
      // Initialize community features (Starboard, Welcome, XP/Leveling)
      console.log('[Bot] Initializing community features...');
      try {
        initializeCommunityFeatures(client!, storage);
        console.log('[Bot] ✅ Community features initialized successfully');
      } catch (communityError) {
        console.error('[Bot] Failed to initialize community features:', communityError);
      }
      
      // Initialize leveling system events
      console.log('[Bot] Initializing leveling system...');
      try {
        initializeLevelingEvents(client!, storage);
        console.log('[Bot] ✅ Leveling system initialized successfully');
      } catch (levelingError) {
        console.error('[Bot] Failed to initialize leveling system:', levelingError);
      }
      
      // Initialize custom commands system
      console.log('[Bot] Initializing custom commands system...');
      try {
        initializeCustomCommandEvents(client!, storage);
        console.log('[Bot] ✅ Custom commands system initialized successfully');
      } catch (customCmdError) {
        console.error('[Bot] Failed to initialize custom commands system:', customCmdError);
      }
      
      // Initialize moderation features (Logging, Auto-Mod)
      console.log('[Bot] Initializing moderation features...');
      try {
        initializeModerationFeatures(client!, storage);
        console.log('[Bot] ✅ Moderation features initialized successfully');
      } catch (modError) {
        console.error('[Bot] Failed to initialize moderation features:', modError);
      }
      
      // Initialize automod events (Advanced rule-based moderation)
      console.log('[Bot] Initializing automod events...');
      try {
        initializeAutomodEvents(client!, storage);
        console.log('[Bot] ✅ Automod events initialized successfully');
      } catch (automodError) {
        console.error('[Bot] Failed to initialize automod events:', automodError);
      }
    });

    // Handle bot joining a new guild (auto-provisioning)
    client.on(Events.GuildCreate, async (guild) => {
      console.log(`[Discord] Bot joined new guild: ${guild.name} (ID: ${guild.id})`);
      
      try {
        const { autoProvisionNewGuild } = await import('../routes/guild-provisioning-routes');
        await autoProvisionNewGuild(guild);
      } catch (provError) {
        console.error(`[Discord] Failed to auto-provision guild ${guild.name}:`, provError);
      }
      
      // Load custom commands for the new guild
      try {
        await commandEngine.loadCommands(guild.id);
        console.log(`[CommandEngine] ✅ Loaded commands for new guild ${guild.name}`);
      } catch (cmdError) {
        console.error(`[CommandEngine] Failed to load commands for new guild ${guild.name}:`, cmdError);
      }
      
      broadcast({
        type: 'GUILD_CREATE',
        data: {
          guildId: guild.id,
          guildName: guild.name,
          memberCount: guild.memberCount,
          timestamp: new Date().toISOString()
        }
      });
    });

    // Handle guild member add (new members joining)
    client.on(Events.GuildMemberAdd, async (member) => {
      console.log(`[Discord] Member joined: ${member.user.tag} in guild ${member.guild.name}`);
      
      // Track member join for analytics (fire-and-forget)
      metricsTracker.trackMemberJoin(member.guild.id, member.guild.memberCount).catch(() => {});
      
      // Broadcast member add event for real-time updates
      broadcast({
        type: 'GUILD_MEMBER_ADD',
        serverId: member.guild.id,
        data: {
          userId: member.user.id,
          username: member.user.tag,
          guildId: member.guild.id,
          memberCount: member.guild.memberCount,
          timestamp: new Date().toISOString()
        }
      });
      
      // Send welcome card if configured
      try {
        // Check if welcome cards are enabled for this server
        const [settings] = await db
          .select({ 
            welcomeEnabled: botSettings.welcomeEnabled,
            welcomeChannelId: botSettings.welcomeChannelId
          })
          .from(botSettings)
          .where(eq(botSettings.serverId, member.guild.id));
        
        if (!settings?.welcomeEnabled || !settings?.welcomeChannelId) {
          return;
        }
        
        // Get active welcome card template
        const [template] = await db
          .select()
          .from(welcomeCardTemplates)
          .where(
            and(
              eq(welcomeCardTemplates.serverId, member.guild.id),
              eq(welcomeCardTemplates.isActive, true)
            )
          )
          .limit(1);
        
        if (!template) {
          console.log(`[WelcomeCard] No active template found for ${member.guild.name}`);
          return;
        }
        
        // Generate welcome card image
        const imageBuffer = await welcomeCardRenderer.renderCard(template, member);
        
        // Get the welcome channel
        const channelId = template.channelId || settings.welcomeChannelId;
        const channel = member.guild.channels.cache.get(channelId);
        
        if (!channel || !channel.isTextBased()) {
          console.error(`[WelcomeCard] Invalid channel ${channelId} for ${member.guild.name}`);
          return;
        }
        
        // Interpolate welcome message
        const welcomeMessage = (template.welcomeMessage || 'Welcome to {server}!')
          .replace(/{username}/gi, member.user.username)
          .replace(/{user}/gi, `<@${member.user.id}>`)
          .replace(/{server}/gi, member.guild.name)
          .replace(/{memberCount}/gi, member.guild.memberCount.toString());
        
        // Send the welcome card
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'welcome-card.png' });
        await (channel as any).send({
          content: welcomeMessage,
          files: [attachment]
        });
        
        console.log(`[WelcomeCard] Sent welcome card for ${member.user.tag} in ${member.guild.name}`);
      } catch (error) {
        console.error(`[WelcomeCard] Error sending welcome card for ${member.user.tag}:`, error);
      }
    });

    // Handle guild member remove (members leaving/being kicked)
    client.on(Events.GuildMemberRemove, async (member) => {
      console.log(`[Discord] Member left: ${member.user.tag} from guild ${member.guild.name}`);
      
      // Track member leave for analytics (fire-and-forget)
      metricsTracker.trackMemberLeave(member.guild.id, member.guild.memberCount).catch(() => {});
      
      // Broadcast member remove event for real-time updates
      broadcast({
        type: 'GUILD_MEMBER_REMOVE',
        serverId: member.guild.id,
        data: {
          userId: member.user.id,
          username: member.user.tag,
          guildId: member.guild.id,
          memberCount: member.guild.memberCount,
          timestamp: new Date().toISOString()
        }
      });
    });

    // Handle voice state updates (users joining/leaving voice channels)
    client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
      // Only broadcast if user joined or left a voice channel (not just mute/deafen changes)
      if (oldState.channelId !== newState.channelId) {
        const action = newState.channelId ? 'joined' : 'left';
        const channelName = newState.channel?.name || oldState.channel?.name || 'Unknown';
        
        console.log(`[Discord] Voice state update: ${newState.member?.user.tag} ${action} voice channel ${channelName}`);
        
        // Broadcast voice state update for real-time channel occupancy updates
        broadcast({
          type: 'VOICE_STATE_UPDATE',
          serverId: newState.guild.id,
          data: {
            userId: newState.member?.user.id,
            username: newState.member?.user.tag,
            guildId: newState.guild.id,
            channelId: newState.channelId,
            oldChannelId: oldState.channelId,
            action: action,
            timestamp: new Date().toISOString()
          }
        });
      }
    });

    client.on('error', (error) => {
      console.error('Discord client error:', error);
    });

    client.on('warn', (warning) => {
      console.warn('Discord client warning:', warning);
    });

    // Login to Discord with a timeout
    const loginPromise = client.login(process.env.DISCORD_BOT_TOKEN);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Discord login timed out after 15 seconds')), 15000);
    });

    await Promise.race([loginPromise, timeoutPromise]);
  } catch (error) {
    console.error('Failed to start Discord bot:', error);
    // Don't throw the error, just log it to prevent the app from crashing
  }
}

// Register commands with Discord API
async function registerCommandsWithAPI(token: string): Promise<void> {
  try {
    if (!process.env.DISCORD_APP_ID) {
      console.warn('DISCORD_APP_ID not provided. Commands will not be registered globally.');
      return;
    }
    
    const rest = new REST({ version: '10' }).setToken(token);
    const commandsData = Array.from(commands.values()).map(cmd => cmd.data.toJSON());
    
    // Add timeout to the request to prevent hanging indefinitely
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    try {
      // Global commands
      await rest.put(
        Routes.applicationCommands(process.env.DISCORD_APP_ID),
        { 
          body: commandsData,
          signal: controller.signal
        }
      );
      console.log('Successfully registered application commands globally');
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.error('Request to register commands timed out');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    console.error('Error registering commands with Discord API:', error);
    throw error;
  }
}

// Get the Discord client instance
export function getDiscordClient(): Client | null {
  return client;
}

// Get the channel to ticket mapping for message sync
export function getChannelToTicketMap(): Map<string, number> {
  return channelToTicketMap;
}

/**
 * Cleanup function to stop all background jobs and destroy resources
 * Call this on application shutdown to prevent memory leaks
 */
export function stopBot(): void {
  console.log('[Bot] Stopping bot and cleaning up resources...');
  
  // Clear ticket mapping refresh interval
  if (ticketMappingRefreshInterval) {
    clearInterval(ticketMappingRefreshInterval);
    ticketMappingRefreshInterval = null;
    console.log('[Bot] Cleared ticket mapping refresh interval');
  }
  
  // Destroy Discord client
  if (client) {
    client.destroy();
    client = null;
    console.log('[Bot] Discord client destroyed');
  }
  
  console.log('[Bot] Cleanup complete');
}

// Fetch member data from Discord API for a specific guild
export async function fetchGuildMember(guildId: string, userId: string): Promise<any | null> {
  if (!client || !client.isReady()) {
    console.warn('Discord client not ready when trying to fetch guild member');
    return null;
  }

  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      console.warn(`Guild ${guildId} not found in cache`);
      return null;
    }

    const member = await guild.members.fetch(userId);
    if (!member) {
      return null;
    }

    return {
      id: member.id,
      username: member.user.username,
      discriminator: member.user.discriminator,
      displayName: member.displayName,
      nickname: member.nickname,
      avatar: member.user.avatarURL(),
      guildAvatar: member.avatarURL(),
      roles: member.roles.cache.map(role => ({
        id: role.id,
        name: role.name,
        color: role.hexColor
      }))
    };
  } catch (error) {
    console.error(`Error fetching guild member ${userId} from guild ${guildId}:`, error);
    return null;
  }
}

/**
 * Set the bot's nickname in a specific guild
 * @param guildId - The Discord guild/server ID
 * @param nickname - The new nickname (or null to reset to default)
 * @returns Success status and message
 */
export async function setBotNickname(guildId: string, nickname: string | null): Promise<{ success: boolean; message: string }> {
  if (!client || !client.isReady()) {
    return { success: false, message: 'Discord client not ready' };
  }

  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return { success: false, message: `Guild ${guildId} not found` };
    }

    // Get the bot's member in this guild
    const botMember = guild.members.me;
    if (!botMember) {
      return { success: false, message: 'Bot member not found in guild' };
    }

    // Set the nickname (null resets to default username)
    await botMember.setNickname(nickname);
    
    const action = nickname ? `set to "${nickname}"` : 'reset to default';
    console.log(`[Bot] Nickname ${action} in guild ${guild.name} (${guildId})`);
    
    return { success: true, message: `Nickname ${action} successfully` };
  } catch (error: any) {
    console.error(`Error setting bot nickname in guild ${guildId}:`, error);
    return { success: false, message: error.message || 'Failed to set nickname' };
  }
}

// Fetch user data from Discord API (without guild context)
export async function fetchDiscordUser(userId: string): Promise<any | null> {
  if (!client || !client.isReady()) {
    console.warn('Discord client not ready when trying to fetch Discord user');
    return null;
  }

  try {
    const user = await client.users.fetch(userId);
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      displayName: user.displayName || user.username,
      avatar: user.avatarURL()
    };
  } catch (error) {
    console.error(`Error fetching Discord user ${userId}:`, error);
    return null;
  }
}

// Fetch all channels from servers where the bot has permissions
export async function fetchGuildChannels(guildId: string): Promise<any[] | null> {
  if (!client || !client.isReady()) {
    console.warn('Discord client not ready when trying to fetch guild channels');
    return null;
  }

  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      console.warn(`Guild ${guildId} not found in cache`);
      return null;
    }

    // Fetch all channels and filter for text channels where bot can send messages
    const channels = guild.channels.cache
      .filter(channel => 
        channel.isTextBased() && 
        !channel.isThread() &&
        channel.permissionsFor(guild.members.me!)?.has(['SendMessages', 'EmbedLinks'])
      )
      .map(channel => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        topic: 'topic' in channel ? channel.topic : null,
        parentId: channel.parentId,
        position: 'position' in channel ? channel.position : 0,
        permissions: {
          canSendMessages: channel.permissionsFor(guild.members.me!)?.has('SendMessages') || false,
          canEmbedLinks: channel.permissionsFor(guild.members.me!)?.has('EmbedLinks') || false,
          canManageMessages: channel.permissionsFor(guild.members.me!)?.has('ManageMessages') || false
        }
      }))
      .sort((a, b) => a.position - b.position);

    return Array.from(channels.values());
  } catch (error) {
    console.error(`Error fetching guild channels for ${guildId}:`, error);
    return null;
  }
}

// Send ticket creation panel embed to a specific channel
export async function sendTicketPanelToChannel(channelId: string, guildId: string, storage: IStorage): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!client || !client.isReady()) {
    return { success: false, error: 'Discord client not ready' };
  }

  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return { success: false, error: `Guild ${guildId} not found` };
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) {
      return { success: false, error: 'Channel not found or not a text channel' };
    }

    // Check bot permissions with detailed logging
    const botMember = guild.members.me;
    if (!botMember) {
      console.error(`Bot member not found in guild ${guildId}`);
      return { success: false, error: 'Bot is not a member of this guild' };
    }
    
    const permissions = channel.permissionsFor(botMember);
    if (!permissions) {
      console.error(`Could not get permissions for bot in channel ${channelId}`);
      return { success: false, error: 'Unable to check bot permissions in this channel' };
    }
    
    const hasPerms = permissions.has(['SendMessages', 'EmbedLinks']);
    if (!hasPerms) {
      const missingPerms = [];
      if (!permissions.has('SendMessages')) missingPerms.push('SendMessages');
      if (!permissions.has('EmbedLinks')) missingPerms.push('EmbedLinks');
      console.error(`Bot missing permissions in channel ${channelId}: ${missingPerms.join(', ')}`);
      return { success: false, error: `Bot lacks permission(s) in this channel: ${missingPerms.join(', ')}` };
    }

    // Import the components needed for embed creation
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');

    try {
      // Fetch panel settings from database
      let panelSettings = await storage.getTicketPanelSettings(guildId);
      
      // If no custom settings exist, create defaults
      if (!panelSettings) {
        console.log(`No panel settings found for guild ${guildId}, creating defaults`);
        panelSettings = await storage.resetTicketPanelSettings(guildId);
      }
      
      // Fetch panel categories from database
      let panelCategories = await storage.getTicketPanelCategories(guildId);
      
      // If no categories exist, ensure we have some defaults
      if (!panelCategories || panelCategories.length === 0) {
        console.log(`No panel categories found for guild ${guildId}, this should be handled by resetTicketPanelSettings`);
        // resetTicketPanelSettings should have created default categories, try fetching again
        panelCategories = await storage.getTicketPanelCategories(guildId);
      }
      
      // Build embed using dynamic settings
      const embed = new EmbedBuilder()
        .setTitle(panelSettings.title)
        .setDescription(panelSettings.description)
        .setColor(panelSettings.embedColor as any)
        .setFooter({ text: panelSettings.footerText })
        .setTimestamp();
      
      // Filter enabled categories and sort by sortOrder
      const enabledCategories = panelCategories
        .filter(category => category.isEnabled)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      
      if (enabledCategories.length === 0) {
        throw new Error('No enabled categories found for ticket panel');
      }
      
      // Map Discord button styles
      const getButtonStyle = (style: string) => {
        switch (style.toLowerCase()) {
          case 'primary': return ButtonStyle.Primary;
          case 'secondary': return ButtonStyle.Secondary;
          case 'success': return ButtonStyle.Success;
          case 'danger': return ButtonStyle.Danger;
          default: return ButtonStyle.Primary;
        }
      };
      
      // Generate buttons dynamically based on categories
      const buttonRows: any[] = [];
      const buttonsPerRow = panelSettings.buttonsPerRow || 2;
      let currentRow = new ActionRowBuilder();
      let buttonsInCurrentRow = 0;
      
      for (const category of enabledCategories) {
        const button = new ButtonBuilder()
          .setCustomId(category.customId)
          .setLabel(category.name)
          .setStyle(getButtonStyle(category.buttonStyle));
        
        // Add emoji if provided
        if (category.emoji) {
          button.setEmoji(category.emoji);
        }
        
        currentRow.addComponents(button);
        buttonsInCurrentRow++;
        
        // If we've reached the max buttons per row or this is the last button
        if (buttonsInCurrentRow >= buttonsPerRow || category === enabledCategories[enabledCategories.length - 1]) {
          buttonRows.push(currentRow);
          currentRow = new ActionRowBuilder();
          buttonsInCurrentRow = 0;
        }
      }
      
      // Send the embed with dynamically generated buttons
      const message = await channel.send({
        embeds: [embed],
        components: buttonRows as any
      });
      
      console.log(`Successfully sent dynamic ticket panel to channel ${channelId} in guild ${guildId}`);
      return { success: true, messageId: message.id };
      
    } catch (dbError: any) {
      console.error(`Database error when creating ticket panel for guild ${guildId}:`, dbError);
      
      // Fallback to hardcoded panel if database operations fail
      console.log('Falling back to hardcoded ticket panel due to database error');
      
      const fallbackEmbed = new EmbedBuilder()
        .setTitle('🎫 Support Ticket System')
        .setDescription(`**Welcome to our support ticket system!**\n\nClick one of the buttons below to create a new support ticket. Our team will respond as quickly as possible.\n\n**Available Categories:**\n🛠️ **General Support** - General questions and assistance\n🐛 **Bug Reports** - Report issues or problems\n💡 **Feature Requests** - Suggest new features or improvements\n👤 **Account Issues** - Account-related problems\n\n*Please provide as much detail as possible when creating your ticket to help us assist you better.*`)
        .setColor('#5865F2')
        .setFooter({ text: 'Click a button below to get started • Support Team' })
        .setTimestamp();

      const fallbackRow1 = new ActionRowBuilder()
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

      const fallbackRow2 = new ActionRowBuilder()
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

      const fallbackMessage = await channel.send({
        embeds: [fallbackEmbed],
        components: [fallbackRow1, fallbackRow2] as any
      });
      
      return { success: true, messageId: fallbackMessage.id };
    }
  } catch (error) {
    console.error(`Error sending ticket panel to channel ${channelId}:`, error);
    return { success: false, error: `Failed to send ticket panel: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

// Send custom panel template to a specific channel
export async function sendPanelTemplateToChannel(
  channelId: string, 
  guildId: string, 
  template: any,
  fields: any[],
  buttons: any[]
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  console.log(`[Template Send] Starting template dispatch to channel ${channelId} in guild ${guildId}`);
  console.log(`[Template Send] Template ID: ${template?.id}, Name: ${template?.name}`);
  console.log(`[Template Send] Fields count: ${fields?.length || 0}, Buttons count: ${buttons?.length || 0}`);
  
  if (!client || !client.isReady()) {
    console.error('[Template Send] Discord client not ready');
    return { success: false, error: 'Discord client not ready' };
  }

  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      console.error(`[Template Send] Guild ${guildId} not found in cache`);
      return { success: false, error: `Guild ${guildId} not found` };
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) {
      console.error(`[Template Send] Channel ${channelId} not found or not a text channel`);
      return { success: false, error: 'Channel not found or not a text channel' };
    }

    // Check bot permissions
    const botMember = guild.members.me;
    if (!botMember) {
      console.error(`Bot member not found in guild ${guildId}`);
      return { success: false, error: 'Bot is not a member of this guild' };
    }
    
    const permissions = channel.permissionsFor(botMember);
    if (!permissions) {
      console.error(`Could not get permissions for bot in channel ${channelId}`);
      return { success: false, error: 'Unable to check bot permissions in this channel' };
    }
    
    const hasPerms = permissions.has(['SendMessages', 'EmbedLinks']);
    if (!hasPerms) {
      const missingPerms = [];
      if (!permissions.has('SendMessages')) missingPerms.push('SendMessages');
      if (!permissions.has('EmbedLinks')) missingPerms.push('EmbedLinks');
      console.error(`Bot missing permissions in channel ${channelId}: ${missingPerms.join(', ')}`);
      return { success: false, error: `Bot lacks permission(s) in this channel: ${missingPerms.join(', ')}` };
    }

    // Import the components needed for embed creation
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');

    // Create the embed
    const embed = new EmbedBuilder();
    
    if (template.embedTitle) embed.setTitle(template.embedTitle);
    if (template.embedDescription) embed.setDescription(template.embedDescription);
    if (template.embedColor) embed.setColor(template.embedColor);
    if (template.embedUrl) embed.setURL(template.embedUrl);
    
    // Author
    if (template.authorName) {
      embed.setAuthor({
        name: template.authorName,
        iconURL: template.authorIconUrl || undefined,
        url: template.authorUrl || undefined
      });
    }
    
    // Images
    if (template.thumbnailUrl) embed.setThumbnail(template.thumbnailUrl);
    if (template.imageUrl) embed.setImage(template.imageUrl);
    
    // Footer
    if (template.footerText) {
      embed.setFooter({
        text: template.footerText,
        iconURL: template.footerIconUrl || undefined
      });
    }
    
    // Timestamp
    if (template.showTimestamp) {
      embed.setTimestamp();
    }
    
    // Add fields
    const enabledFields = fields.filter(f => f.isEnabled);
    for (const field of enabledFields) {
      embed.addFields({
        name: field.name,
        value: field.value,
        inline: field.inline || false
      });
    }
    
    // Create button rows
    const rows: any[] = [];
    const enabledButtons = buttons.filter(b => b.isEnabled);
    
    // Group buttons by row
    const buttonsByRow = new Map<number, any[]>();
    for (const button of enabledButtons) {
      const row = button.row || 1;
      if (!buttonsByRow.has(row)) {
        buttonsByRow.set(row, []);
      }
      buttonsByRow.get(row)!.push(button);
    }
    
    // Create ActionRows with buttons
    for (const [rowNum, rowButtons] of Array.from(buttonsByRow)) {
      const row = new ActionRowBuilder();
      
      // Sort by position within row
      rowButtons.sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
      
      // Add buttons (max 5 per row as per Discord limit)
      for (const button of rowButtons.slice(0, 5)) {
        let discordButton: any;
        
        // Set style based on buttonStyle
        const styleMap: { [key: string]: any } = {
          'Primary': ButtonStyle.Primary,
          'Secondary': ButtonStyle.Secondary,
          'Success': ButtonStyle.Success,
          'Danger': ButtonStyle.Danger,
          'Link': ButtonStyle.Link
        };
        
        if (button.buttonStyle === 'Link' && button.url) {
          // Create Link button without customId
          discordButton = new ButtonBuilder()
            .setLabel(button.label)
            .setStyle(ButtonStyle.Link)
            .setURL(button.url);
        } else {
          // Create regular button with customId
          discordButton = new ButtonBuilder()
            .setCustomId(button.customId)
            .setLabel(button.label)
            .setStyle(styleMap[button.buttonStyle] || ButtonStyle.Primary);
        }
        
        if (button.emoji) {
          discordButton.setEmoji(button.emoji);
        }
        
        row.addComponents(discordButton);
      }
      
      if (row.components.length > 0) {
        rows.push(row);
      }
    }
    
    // Log final message structure
    console.log(`[Template Send] Sending message with ${rows.length} button rows`);
    console.log(`[Template Send] Embed title: ${template.embedTitle || 'No title'}`);
    console.log(`[Template Send] Embed color: ${template.embedColor || 'Default'}`);
    
    // Send the message
    const message = await channel.send({
      embeds: [embed],
      components: rows.slice(0, 5) // Max 5 ActionRows
    });
    
    console.log(`[Template Send] ✅ Successfully sent template message with ID: ${message.id}`);
    return { success: true, messageId: message.id };
    
  } catch (error) {
    console.error(`[Template Send] ❌ Error sending panel template to channel ${channelId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Template Send] Error details:`, { channelId, guildId, templateId: template?.id, error: errorMessage });
    return { success: false, error: `Failed to send panel template: ${errorMessage}` };
  }
}

// Get information about servers where the bot is present
export async function getBotGuilds(): Promise<any[]> {
  if (!client || !client.isReady()) {
    const error = new Error('Discord client not ready - cannot fetch bot guilds');
    console.warn(error.message);
    throw error;
  }

  try {
    return client.guilds.cache.map(guild => ({
      id: guild.id,
      name: guild.name,
      icon: guild.iconURL(),
      memberCount: guild.memberCount,
      available: guild.available,
      permissions: {
        canSendMessages: guild.members.me?.permissions.has('SendMessages') || false,
        canEmbedLinks: guild.members.me?.permissions.has('EmbedLinks') || false,
        canManageChannels: guild.members.me?.permissions.has('ManageChannels') || false
      }
    }));
  } catch (error) {
    console.error('Error fetching bot guilds:', error);
    throw error;
  }
}

// Shutdown the bot gracefully
export function shutdownBot(): Promise<void> {
  if (!client) {
    return Promise.resolve();
  }
  
  console.log('Shutting down Discord bot...');
  
  // Clear all background job intervals
  if (ticketMappingRefreshInterval) {
    clearInterval(ticketMappingRefreshInterval);
    ticketMappingRefreshInterval = null;
    console.log('[Discord] Cleared ticket mapping refresh interval');
  }
  
  if (autoDetectionScanInterval) {
    clearInterval(autoDetectionScanInterval);
    autoDetectionScanInterval = null;
    console.log('[Discord] Cleared auto-detection scan interval');
  }
  
  if (threadCleanupJobInterval) {
    clearInterval(threadCleanupJobInterval);
    threadCleanupJobInterval = null;
    console.log('[Discord] Cleared thread cleanup job interval');
  }
  
  return client.destroy();
}

// Export ticketChannelManager for use in other modules
export function getTicketChannelManager(): TicketChannelManager | null {
  return ticketChannelManager;
}
