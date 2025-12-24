import { 
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalActionRowComponentBuilder,
  TextChannel
} from 'discord.js';
import { IStorage } from '../storage';
import { commands } from './commands';

interface CommandContext {
  storage: IStorage;
  broadcast: (data: any) => void;
}

function parseRelativeTime(timeStr: string): Date | null {
  const now = new Date();
  const lowerStr = timeStr.toLowerCase().trim();
  
  const relativeMatch = lowerStr.match(/^in\s+(\d+)\s+(minute|minutes|min|mins|hour|hours|hr|hrs|day|days|week|weeks)$/i);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2].toLowerCase();
    
    if (unit.startsWith('min')) {
      now.setMinutes(now.getMinutes() + amount);
    } else if (unit.startsWith('hour') || unit.startsWith('hr')) {
      now.setHours(now.getHours() + amount);
    } else if (unit.startsWith('day')) {
      now.setDate(now.getDate() + amount);
    } else if (unit.startsWith('week')) {
      now.setDate(now.getDate() + (amount * 7));
    }
    return now;
  }
  
  if (lowerStr.includes('tomorrow')) {
    now.setDate(now.getDate() + 1);
    const timeMatch = lowerStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const meridian = timeMatch[3]?.toLowerCase();
      
      if (meridian === 'pm' && hours < 12) hours += 12;
      if (meridian === 'am' && hours === 12) hours = 0;
      
      now.setHours(hours, minutes, 0, 0);
    }
    return now;
  }
  
  const dateTimeMatch = lowerStr.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (dateTimeMatch) {
    const [, year, month, day, hours, minutes] = dateTimeMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes));
  }
  
  return null;
}

function getRepeatCron(repeat: string): string | null {
  const lower = repeat.toLowerCase();
  switch (lower) {
    case 'hourly':
      return 'HOURLY';
    case 'daily':
      return 'DAILY';
    case 'weekly':
      return 'WEEKLY';
    case 'monthly':
      return 'MONTHLY';
    default:
      if (/^[\d\*\/\-\,]+\s+[\d\*\/\-\,]+\s+[\d\*\/\-\,]+\s+[\d\*\/\-\,]+\s+[\d\*\/\-\,]+$/.test(repeat)) {
        return repeat;
      }
      return null;
  }
}

function calculateNextRun(cronExpression: string, fromDate: Date = new Date()): Date {
  const next = new Date(fromDate);
  
  switch (cronExpression) {
    case 'HOURLY':
      next.setHours(next.getHours() + 1);
      next.setMinutes(0, 0, 0);
      return next;
    case 'DAILY':
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);
      return next;
    case 'WEEKLY':
      const daysUntilSunday = (7 - next.getDay()) % 7 || 7;
      next.setDate(next.getDate() + daysUntilSunday);
      next.setHours(0, 0, 0, 0);
      return next;
    case 'MONTHLY':
      next.setMonth(next.getMonth() + 1);
      next.setDate(1);
      next.setHours(0, 0, 0, 0);
      return next;
    default:
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);
      return next;
  }
}

const scheduleCommand = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Manage scheduled messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub => sub
      .setName('create')
      .setDescription('Create a scheduled message')
      .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Channel to send the message to')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true))
      .addStringOption(opt => opt
        .setName('time')
        .setDescription('When to send (e.g., "in 2 hours", "2024-01-15 14:00", "tomorrow at 3pm")')
        .setRequired(true))
      .addStringOption(opt => opt
        .setName('message')
        .setDescription('Message content (use JSON for embeds)')
        .setRequired(true))
      .addStringOption(opt => opt
        .setName('repeat')
        .setDescription('Repeat pattern (daily, weekly, monthly, or cron expression)')
        .setRequired(false)))
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List all scheduled messages for this server'))
    .addSubcommand(sub => sub
      .setName('cancel')
      .setDescription('Cancel a scheduled message')
      .addIntegerOption(opt => opt
        .setName('id')
        .setDescription('ID of the scheduled message')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('edit')
      .setDescription('Edit a scheduled message')
      .addIntegerOption(opt => opt
        .setName('id')
        .setDescription('ID of the scheduled message')
        .setRequired(true))
      .addStringOption(opt => opt
        .setName('message')
        .setDescription('New message content')
        .setRequired(true))),
  
  execute: async (interaction: ChatInputCommandInteraction, context: CommandContext) => {
    const { storage } = context;
    const subcommand = interaction.options.getSubcommand();
    const serverId = interaction.guildId!;
    
    await interaction.deferReply({ ephemeral: true });
    
    try {
      switch (subcommand) {
        case 'create': {
          const channel = interaction.options.getChannel('channel', true);
          const timeStr = interaction.options.getString('time', true);
          const message = interaction.options.getString('message', true);
          const repeat = interaction.options.getString('repeat');
          
          const nextRunAt = parseRelativeTime(timeStr);
          if (!nextRunAt) {
            await interaction.editReply('❌ Invalid time format. Use "in X minutes/hours", "2024-01-15 14:00", or "tomorrow at 3pm"');
            return;
          }
          
          if (nextRunAt <= new Date()) {
            await interaction.editReply('❌ Scheduled time must be in the future.');
            return;
          }
          
          let cronExpression: string | null = null;
          if (repeat) {
            cronExpression = getRepeatCron(repeat);
            if (!cronExpression) {
              await interaction.editReply('❌ Invalid repeat pattern. Use "daily", "weekly", "monthly", or a valid cron expression.');
              return;
            }
          }
          
          let embedJson: string | null = null;
          let messageText = message;
          if (message.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(message);
              embedJson = JSON.stringify(parsed);
              messageText = parsed.content || '';
            } catch {
              messageText = message;
            }
          }
          
          const scheduled = await storage.createScheduledMessage({
            serverId,
            channelId: channel.id,
            message: messageText,
            embedJson,
            cronExpression,
            nextRunAt,
            isActive: true,
            createdBy: interaction.user.id,
            createdByUsername: interaction.user.tag
          });
          
          const embed = new EmbedBuilder()
            .setTitle('✅ Scheduled Message Created')
            .setColor('#00ff00')
            .addFields(
              { name: 'ID', value: `#${scheduled.id}`, inline: true },
              { name: 'Channel', value: `<#${channel.id}>`, inline: true },
              { name: 'Scheduled For', value: `<t:${Math.floor(nextRunAt.getTime() / 1000)}:F>`, inline: true },
              { name: 'Repeat', value: repeat || 'One-time', inline: true }
            )
            .setTimestamp();
          
          await interaction.editReply({ embeds: [embed] });
          break;
        }
        
        case 'list': {
          const messages = await storage.getScheduledMessages(serverId);
          
          if (messages.length === 0) {
            await interaction.editReply('📭 No scheduled messages for this server.');
            return;
          }
          
          const embed = new EmbedBuilder()
            .setTitle('📋 Scheduled Messages')
            .setColor('#5865F2')
            .setDescription(messages.map(m => {
              const status = m.isActive ? '✅' : '❌';
              const time = `<t:${Math.floor(new Date(m.nextRunAt).getTime() / 1000)}:R>`;
              const repeat = m.cronExpression ? '🔄' : '1️⃣';
              return `${status} **#${m.id}** - <#${m.channelId}> ${time} ${repeat}\n> ${m.message.substring(0, 50)}${m.message.length > 50 ? '...' : ''}`;
            }).join('\n\n'))
            .setFooter({ text: `${messages.length} scheduled message(s)` });
          
          await interaction.editReply({ embeds: [embed] });
          break;
        }
        
        case 'cancel': {
          const id = interaction.options.getInteger('id', true);
          const message = await storage.getScheduledMessage(id);
          
          if (!message || message.serverId !== serverId) {
            await interaction.editReply('❌ Scheduled message not found.');
            return;
          }
          
          await storage.deleteScheduledMessage(id);
          await interaction.editReply(`✅ Scheduled message #${id} has been cancelled.`);
          break;
        }
        
        case 'edit': {
          const id = interaction.options.getInteger('id', true);
          const newMessage = interaction.options.getString('message', true);
          
          const existing = await storage.getScheduledMessage(id);
          if (!existing || existing.serverId !== serverId) {
            await interaction.editReply('❌ Scheduled message not found.');
            return;
          }
          
          let embedJson: string | null = null;
          let messageText = newMessage;
          if (newMessage.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(newMessage);
              embedJson = JSON.stringify(parsed);
              messageText = parsed.content || '';
            } catch {
              messageText = newMessage;
            }
          }
          
          await storage.updateScheduledMessage(id, { message: messageText, embedJson });
          await interaction.editReply(`✅ Scheduled message #${id} has been updated.`);
          break;
        }
      }
    } catch (error) {
      console.error('[Schedule] Error:', error);
      await interaction.editReply('❌ An error occurred while processing your request.');
    }
  }
};

const customcmdCommand = {
  data: new SlashCommandBuilder()
    .setName('customcmd')
    .setDescription('Manage custom commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub => sub
      .setName('create')
      .setDescription('Create a custom command')
      .addStringOption(opt => opt
        .setName('trigger')
        .setDescription('Command trigger (without prefix)')
        .setRequired(true))
      .addStringOption(opt => opt
        .setName('response')
        .setDescription('Response text (supports {user}, {server}, {channel}, {args})')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('delete')
      .setDescription('Delete a custom command')
      .addStringOption(opt => opt
        .setName('trigger')
        .setDescription('Command trigger to delete')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List all custom commands'))
    .addSubcommand(sub => sub
      .setName('edit')
      .setDescription('Edit a custom command')
      .addStringOption(opt => opt
        .setName('trigger')
        .setDescription('Command trigger to edit')
        .setRequired(true))
      .addStringOption(opt => opt
        .setName('response')
        .setDescription('New response text')
        .setRequired(true))),
  
  execute: async (interaction: ChatInputCommandInteraction, context: CommandContext) => {
    const { storage } = context;
    const subcommand = interaction.options.getSubcommand();
    const serverId = interaction.guildId!;
    
    await interaction.deferReply({ ephemeral: true });
    
    try {
      switch (subcommand) {
        case 'create': {
          const trigger = interaction.options.getString('trigger', true).toLowerCase();
          const response = interaction.options.getString('response', true);
          
          if (trigger.includes(' ')) {
            await interaction.editReply('❌ Trigger cannot contain spaces.');
            return;
          }
          
          const existing = await storage.getCustomCommand(serverId, trigger);
          if (existing) {
            await interaction.editReply('❌ A command with this trigger already exists.');
            return;
          }
          
          let embedJson: string | null = null;
          if (response.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(response);
              embedJson = JSON.stringify(parsed);
            } catch {}
          }
          
          await storage.createCustomCommand({
            serverId,
            trigger,
            response,
            embedJson,
            createdBy: interaction.user.id,
            createdByUsername: interaction.user.tag
          });
          
          await interaction.editReply(`✅ Custom command \`${trigger}\` has been created!`);
          break;
        }
        
        case 'delete': {
          const trigger = interaction.options.getString('trigger', true);
          
          const existing = await storage.getCustomCommand(serverId, trigger);
          if (!existing) {
            await interaction.editReply('❌ Command not found.');
            return;
          }
          
          await storage.deleteCustomCommand(serverId, trigger);
          await interaction.editReply(`✅ Custom command \`${trigger}\` has been deleted.`);
          break;
        }
        
        case 'list': {
          const cmds = await storage.getCustomCommands(serverId);
          
          if (cmds.length === 0) {
            await interaction.editReply('📭 No custom commands for this server.');
            return;
          }
          
          const settings = await storage.getBotSettings(serverId);
          const prefix = settings?.botPrefix || '!';
          
          const embed = new EmbedBuilder()
            .setTitle('📋 Custom Commands')
            .setColor('#5865F2')
            .setDescription(cmds.map(c => 
              `\`${prefix}${c.trigger}\` - ${c.response.substring(0, 50)}${c.response.length > 50 ? '...' : ''} (used ${c.usageCount}x)`
            ).join('\n'))
            .setFooter({ text: `${cmds.length} command(s) | Prefix: ${prefix}` });
          
          await interaction.editReply({ embeds: [embed] });
          break;
        }
        
        case 'edit': {
          const trigger = interaction.options.getString('trigger', true);
          const response = interaction.options.getString('response', true);
          
          const existing = await storage.getCustomCommand(serverId, trigger);
          if (!existing) {
            await interaction.editReply('❌ Command not found.');
            return;
          }
          
          let embedJson: string | null = null;
          if (response.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(response);
              embedJson = JSON.stringify(parsed);
            } catch {}
          }
          
          await storage.updateCustomCommand(serverId, trigger, { response, embedJson });
          await interaction.editReply(`✅ Custom command \`${trigger}\` has been updated.`);
          break;
        }
      }
    } catch (error) {
      console.error('[CustomCmd] Error:', error);
      await interaction.editReply('❌ An error occurred while processing your request.');
    }
  }
};

const embedCommand = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Build and send custom embeds')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub => sub
      .setName('create')
      .setDescription('Create an embed using a modal'))
    .addSubcommand(sub => sub
      .setName('preview')
      .setDescription('Preview your current embed'))
    .addSubcommand(sub => sub
      .setName('send')
      .setDescription('Send your embed to a channel')
      .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Channel to send the embed to')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('clear')
      .setDescription('Clear your current embed draft')),
  
  execute: async (interaction: ChatInputCommandInteraction, context: CommandContext) => {
    const { storage } = context;
    const subcommand = interaction.options.getSubcommand();
    const serverId = interaction.guildId!;
    const userId = interaction.user.id;
    
    try {
      switch (subcommand) {
        case 'create': {
          const modal = new ModalBuilder()
            .setCustomId('embed_create_modal')
            .setTitle('Create Embed');
          
          const titleInput = new TextInputBuilder()
            .setCustomId('embed_title')
            .setLabel('Title')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(256)
            .setRequired(false);
          
          const descriptionInput = new TextInputBuilder()
            .setCustomId('embed_description')
            .setLabel('Description')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(4000)
            .setRequired(false);
          
          const colorInput = new TextInputBuilder()
            .setCustomId('embed_color')
            .setLabel('Color (hex, e.g., #5865F2)')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(7)
            .setRequired(false)
            .setPlaceholder('#5865F2');
          
          const footerInput = new TextInputBuilder()
            .setCustomId('embed_footer')
            .setLabel('Footer')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(2048)
            .setRequired(false);
          
          const imageInput = new TextInputBuilder()
            .setCustomId('embed_image')
            .setLabel('Image URL')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('https://example.com/image.png');
          
          modal.addComponents(
            new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(titleInput),
            new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(descriptionInput),
            new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(colorInput),
            new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(footerInput),
            new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(imageInput)
          );
          
          await interaction.showModal(modal);
          break;
        }
        
        case 'preview': {
          await interaction.deferReply({ ephemeral: true });
          
          const userEmbed = await storage.getUserEmbed(userId, serverId);
          if (!userEmbed) {
            await interaction.editReply('❌ No embed draft found. Use `/embed create` first.');
            return;
          }
          
          const embed = new EmbedBuilder();
          if (userEmbed.title) embed.setTitle(userEmbed.title);
          if (userEmbed.description) embed.setDescription(userEmbed.description);
          if (userEmbed.color) {
            try {
              embed.setColor(parseInt(userEmbed.color.replace('#', ''), 16));
            } catch {}
          }
          if (userEmbed.footer) embed.setFooter({ text: userEmbed.footer });
          if (userEmbed.imageUrl) embed.setImage(userEmbed.imageUrl);
          if (userEmbed.thumbnailUrl) embed.setThumbnail(userEmbed.thumbnailUrl);
          
          await interaction.editReply({ content: '📝 **Preview of your embed:**', embeds: [embed] });
          break;
        }
        
        case 'send': {
          await interaction.deferReply({ ephemeral: true });
          
          const channel = interaction.options.getChannel('channel', true) as TextChannel;
          const userEmbed = await storage.getUserEmbed(userId, serverId);
          
          if (!userEmbed) {
            await interaction.editReply('❌ No embed draft found. Use `/embed create` first.');
            return;
          }
          
          const embed = new EmbedBuilder();
          if (userEmbed.title) embed.setTitle(userEmbed.title);
          if (userEmbed.description) embed.setDescription(userEmbed.description);
          if (userEmbed.color) {
            try {
              embed.setColor(parseInt(userEmbed.color.replace('#', ''), 16));
            } catch {}
          }
          if (userEmbed.footer) embed.setFooter({ text: userEmbed.footer });
          if (userEmbed.imageUrl) embed.setImage(userEmbed.imageUrl);
          if (userEmbed.thumbnailUrl) embed.setThumbnail(userEmbed.thumbnailUrl);
          
          await channel.send({ embeds: [embed] });
          await storage.deleteUserEmbed(userId, serverId);
          
          await interaction.editReply(`✅ Embed sent to <#${channel.id}>!`);
          break;
        }
        
        case 'clear': {
          await interaction.deferReply({ ephemeral: true });
          
          await storage.deleteUserEmbed(userId, serverId);
          await interaction.editReply('✅ Embed draft cleared.');
          break;
        }
      }
    } catch (error) {
      console.error('[Embed] Error:', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('❌ An error occurred while processing your request.');
      }
    }
  }
};

export function registerScheduledCommands(): void {
  commands.set('schedule', scheduleCommand);
  commands.set('customcmd', customcmdCommand);
  commands.set('embed', embedCommand);
  console.log('[Discord] Registered schedule, customcmd, and embed commands');
}

export { scheduleCommand, customcmdCommand, embedCommand, calculateNextRun };
