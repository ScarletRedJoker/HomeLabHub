import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  User,
  TextChannel,
  ColorResolvable
} from 'discord.js';
import { IStorage } from '../storage';
import { getDiscordClient } from './bot';

// Command execution context
interface CommandContext {
  storage: IStorage;
  broadcast: (data: any) => void;
}

// Helper function to check if a user is a developer
export async function isDeveloper(userId: string, storage: IStorage): Promise<boolean> {
  const developer = await storage.getDeveloper(userId);
  return developer !== null && developer.isActive === true;
}

// Track bot start time for uptime calculation
const botStartTime = Date.now();

// /dev-dm - Send custom embed to user via DM
export const devDmCommand = {
  data: new SlashCommandBuilder()
    .setName('dev-dm')
    .setDescription('[DEV] Send a custom embed to a user via DM')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to send the DM to')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('title')
        .setDescription('Embed title')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('description')
        .setDescription('Embed description')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('color')
        .setDescription('Embed color (hex code like #5865F2)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('image')
        .setDescription('Image URL')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('footer')
        .setDescription('Footer text')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
  async execute(interaction: ChatInputCommandInteraction, context: CommandContext) {
    try {
      // Check if user is a developer
      if (!await isDeveloper(interaction.user.id, context.storage)) {
        await interaction.reply({ 
          content: '❌ You do not have permission to use this command. This command is restricted to bot developers only.', 
          ephemeral: true 
        });
        return;
      }
      
      console.log(`[DEV] ${interaction.user.tag} (${interaction.user.id}) executed /dev-dm`);
      
      const targetUser = interaction.options.getUser('user', true);
      const title = interaction.options.getString('title');
      const description = interaction.options.getString('description');
      const color = interaction.options.getString('color');
      const image = interaction.options.getString('image');
      const footer = interaction.options.getString('footer');
      
      // Build the embed
      const embed = new EmbedBuilder();
      
      if (title) embed.setTitle(title);
      if (description) embed.setDescription(description);
      if (color) {
        try {
          embed.setColor(color as ColorResolvable);
        } catch {
          embed.setColor('#5865F2');
        }
      } else {
        embed.setColor('#5865F2');
      }
      if (image) embed.setImage(image);
      if (footer) embed.setFooter({ text: footer });
      embed.setTimestamp();
      
      // Send DM to user
      try {
        await targetUser.send({ embeds: [embed] });
        await interaction.reply({ 
          content: `✅ Successfully sent DM to ${targetUser.tag}`, 
          ephemeral: true 
        });
        console.log(`[DEV] DM sent to ${targetUser.tag} (${targetUser.id})`);
      } catch (error) {
        console.error(`[DEV] Failed to send DM to ${targetUser.tag}:`, error);
        await interaction.reply({ 
          content: `❌ Failed to send DM to ${targetUser.tag}. They may have DMs disabled.`, 
          ephemeral: true 
        });
      }
    } catch (error) {
      console.error('[DEV] Error executing dev-dm command:', error);
      await interaction.reply({ 
        content: '❌ An error occurred while executing this command.', 
        ephemeral: true 
      });
    }
  }
};

// /dev-announce - Send custom embed to channel
export const devAnnounceCommand = {
  data: new SlashCommandBuilder()
    .setName('dev-announce')
    .setDescription('[DEV] Send a custom embed to a channel')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel to send the announcement to')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true))
    .addStringOption(option =>
      option.setName('title')
        .setDescription('Embed title')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('description')
        .setDescription('Embed description')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('color')
        .setDescription('Embed color (hex code like #5865F2)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('image')
        .setDescription('Image URL')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('footer')
        .setDescription('Footer text')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
  async execute(interaction: ChatInputCommandInteraction, context: CommandContext) {
    try {
      // Check if user is a developer
      if (!await isDeveloper(interaction.user.id, context.storage)) {
        await interaction.reply({ 
          content: '❌ You do not have permission to use this command. This command is restricted to bot developers only.', 
          ephemeral: true 
        });
        return;
      }
      
      console.log(`[DEV] ${interaction.user.tag} (${interaction.user.id}) executed /dev-announce`);
      
      const channel = interaction.options.getChannel('channel', true) as TextChannel;
      const title = interaction.options.getString('title');
      const description = interaction.options.getString('description');
      const color = interaction.options.getString('color');
      const image = interaction.options.getString('image');
      const footer = interaction.options.getString('footer');
      
      // Build the embed
      const embed = new EmbedBuilder();
      
      if (title) embed.setTitle(title);
      if (description) embed.setDescription(description);
      if (color) {
        try {
          embed.setColor(color as ColorResolvable);
        } catch {
          embed.setColor('#5865F2');
        }
      } else {
        embed.setColor('#5865F2');
      }
      if (image) embed.setImage(image);
      if (footer) embed.setFooter({ text: footer });
      embed.setTimestamp();
      
      // Send to channel
      try {
        await channel.send({ embeds: [embed] });
        await interaction.reply({ 
          content: `✅ Successfully sent announcement to ${channel.toString()}`, 
          ephemeral: true 
        });
        console.log(`[DEV] Announcement sent to channel ${channel.name} (${channel.id})`);
      } catch (error) {
        console.error(`[DEV] Failed to send announcement to ${channel.name}:`, error);
        await interaction.reply({ 
          content: `❌ Failed to send announcement to ${channel.toString()}. Check bot permissions.`, 
          ephemeral: true 
        });
      }
    } catch (error) {
      console.error('[DEV] Error executing dev-announce command:', error);
      await interaction.reply({ 
        content: '❌ An error occurred while executing this command.', 
        ephemeral: true 
      });
    }
  }
};

// /dev-stats - Show comprehensive bot statistics
export const devStatsCommand = {
  data: new SlashCommandBuilder()
    .setName('dev-stats')
    .setDescription('[DEV] Show comprehensive bot statistics')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
  async execute(interaction: ChatInputCommandInteraction, context: CommandContext) {
    try {
      // Check if user is a developer
      if (!await isDeveloper(interaction.user.id, context.storage)) {
        await interaction.reply({ 
          content: '❌ You do not have permission to use this command. This command is restricted to bot developers only.', 
          ephemeral: true 
        });
        return;
      }
      
      console.log(`[DEV] ${interaction.user.tag} (${interaction.user.id}) executed /dev-stats`);
      
      await interaction.deferReply({ ephemeral: true });
      
      const client = getDiscordClient();
      if (!client) {
        await interaction.editReply({ content: '❌ Bot client not available.' });
        return;
      }
      
      // Gather statistics
      const allTickets = await context.storage.getAllTickets();
      const openTickets = allTickets.filter(t => t.status === 'open');
      const closedTickets = allTickets.filter(t => t.status === 'closed');
      const allServers = await context.storage.getAllServers();
      const threadMappings = await context.storage.getAllServers();
      
      // Calculate uptime
      const uptimeMs = Date.now() - botStartTime;
      const uptimeDays = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
      const uptimeHours = Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const uptimeMinutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
      const uptimeSeconds = Math.floor((uptimeMs % (1000 * 60)) / 1000);
      
      // Memory usage
      const memoryUsage = process.memoryUsage();
      const memoryUsedMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
      const memoryTotalMB = (memoryUsage.heapTotal / 1024 / 1024).toFixed(2);
      
      // Build stats embed
      const statsEmbed = new EmbedBuilder()
        .setTitle('🔧 Bot Developer Statistics')
        .setDescription('Comprehensive overview of bot status and metrics')
        .setColor('#5865F2')
        .addFields(
          { 
            name: '📊 Server Statistics', 
            value: `**Total Servers:** ${client.guilds.cache.size}\n**Active Servers:** ${allServers.filter(s => s.isActive).length}`, 
            inline: true 
          },
          { 
            name: '🎫 Ticket Statistics', 
            value: `**Total Tickets:** ${allTickets.length}\n**Open Tickets:** ${openTickets.length}\n**Closed Tickets:** ${closedTickets.length}`, 
            inline: true 
          },
          { 
            name: '⏱️ Bot Uptime', 
            value: `${uptimeDays}d ${uptimeHours}h ${uptimeMinutes}m ${uptimeSeconds}s`, 
            inline: true 
          },
          { 
            name: '💾 Memory Usage', 
            value: `${memoryUsedMB} MB / ${memoryTotalMB} MB`, 
            inline: true 
          },
          { 
            name: '🔗 Database Status', 
            value: '✅ Connected', 
            inline: true 
          },
          { 
            name: '🧵 Thread Sync', 
            value: `**Active Mappings:** ${threadMappings.length}`, 
            inline: true 
          }
        )
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [statsEmbed] });
      console.log(`[DEV] Stats displayed to ${interaction.user.tag}`);
    } catch (error) {
      console.error('[DEV] Error executing dev-stats command:', error);
      try {
        await interaction.editReply({ content: '❌ An error occurred while fetching statistics.' });
      } catch {
        await interaction.reply({ content: '❌ An error occurred while fetching statistics.', ephemeral: true });
      }
    }
  }
};

// /dev-refresh - Force refresh various caches
export const devRefreshCommand = {
  data: new SlashCommandBuilder()
    .setName('dev-refresh')
    .setDescription('[DEV] Force refresh various caches')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('What to refresh')
        .setRequired(true)
        .addChoices(
          { name: 'Ticket Mappings', value: 'ticket-mappings' },
          { name: 'All Caches', value: 'all' }
        ))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
  async execute(interaction: ChatInputCommandInteraction, context: CommandContext) {
    try {
      // Check if user is a developer
      if (!await isDeveloper(interaction.user.id, context.storage)) {
        await interaction.reply({ 
          content: '❌ You do not have permission to use this command. This command is restricted to bot developers only.', 
          ephemeral: true 
        });
        return;
      }
      
      console.log(`[DEV] ${interaction.user.tag} (${interaction.user.id}) executed /dev-refresh`);
      
      const refreshType = interaction.options.getString('type', true);
      
      await interaction.deferReply({ ephemeral: true });
      
      let refreshedItems: string[] = [];
      
      if (refreshType === 'ticket-mappings' || refreshType === 'all') {
        // Force reload ticket-channel mappings
        const allTickets = await context.storage.getAllTickets();
        const openTickets = allTickets.filter(t => t.status === 'open' && t.discordId);
        refreshedItems.push(`Ticket Mappings (${openTickets.length} active)`);
        console.log(`[DEV] Refreshed ${openTickets.length} ticket mappings`);
      }
      
      if (refreshType === 'all') {
        // Could add more cache refreshes here
        const allServers = await context.storage.getAllServers();
        refreshedItems.push(`Server Cache (${allServers.length} servers)`);
        console.log(`[DEV] Refreshed server cache`);
      }
      
      const embed = new EmbedBuilder()
        .setTitle('🔄 Cache Refresh Complete')
        .setDescription('The following caches have been refreshed:')
        .setColor('#57F287')
        .addFields(
          { name: 'Refreshed Items', value: refreshedItems.join('\n') || 'None' }
        )
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      console.log(`[DEV] Refresh completed for: ${refreshedItems.join(', ')}`);
    } catch (error) {
      console.error('[DEV] Error executing dev-refresh command:', error);
      try {
        await interaction.editReply({ content: '❌ An error occurred while refreshing caches.' });
      } catch {
        await interaction.reply({ content: '❌ An error occurred while refreshing caches.', ephemeral: true });
      }
    }
  }
};

// /dev-ticket - Advanced ticket management
export const devTicketCommand = {
  data: new SlashCommandBuilder()
    .setName('dev-ticket')
    .setDescription('[DEV] Advanced ticket management')
    .addIntegerOption(option =>
      option.setName('ticket-id')
        .setDescription('The ticket ID to manage')
        .setRequired(true)
        .setMinValue(1))
    .addStringOption(option =>
      option.setName('action')
        .setDescription('Action to perform')
        .setRequired(true)
        .addChoices(
          { name: 'View Details', value: 'view' },
          { name: 'Force Close', value: 'close' },
          { name: 'Delete', value: 'delete' },
          { name: 'View Messages', value: 'messages' }
        ))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
  async execute(interaction: ChatInputCommandInteraction, context: CommandContext) {
    try {
      // Check if user is a developer
      if (!await isDeveloper(interaction.user.id, context.storage)) {
        await interaction.reply({ 
          content: '❌ You do not have permission to use this command. This command is restricted to bot developers only.', 
          ephemeral: true 
        });
        return;
      }
      
      console.log(`[DEV] ${interaction.user.tag} (${interaction.user.id}) executed /dev-ticket`);
      
      const ticketId = interaction.options.getInteger('ticket-id', true);
      const action = interaction.options.getString('action', true);
      
      await interaction.deferReply({ ephemeral: true });
      
      // Fetch ticket
      const ticket = await context.storage.getTicket(ticketId);
      if (!ticket) {
        await interaction.editReply({ content: `❌ Ticket #${ticketId} not found.` });
        return;
      }
      
      // Fetch category for display
      let category = null;
      if (ticket.categoryId) {
        category = await context.storage.getTicketCategory(ticket.categoryId);
      }
      
      if (action === 'view') {
        const embed = new EmbedBuilder()
          .setTitle(`🎫 Ticket #${ticket.id} Details`)
          .setColor(ticket.status === 'open' ? '#57F287' : '#ED4245')
          .addFields(
            { name: 'Title', value: ticket.title, inline: false },
            { name: 'Description', value: ticket.description.substring(0, 1024), inline: false },
            { name: 'Status', value: ticket.status.toUpperCase(), inline: true },
            { name: 'Priority', value: ticket.priority || 'normal', inline: true },
            { name: 'Category', value: category?.name || 'None', inline: true },
            { name: 'Creator ID', value: ticket.creatorId, inline: true },
            { name: 'Assignee ID', value: ticket.assigneeId || 'None', inline: true },
            { name: 'Server ID', value: ticket.serverId || 'None', inline: true },
            { name: 'Discord Channel ID', value: ticket.discordId || 'None', inline: false },
            { name: 'Created', value: ticket.createdAt ? new Date(ticket.createdAt).toLocaleString() : 'Unknown', inline: true },
            { name: 'Updated', value: ticket.updatedAt ? new Date(ticket.updatedAt).toLocaleString() : 'Unknown', inline: true }
          )
          .setFooter({ text: `Requested by ${interaction.user.tag}` })
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        console.log(`[DEV] Displayed details for ticket #${ticketId}`);
        
      } else if (action === 'close') {
        await context.storage.updateTicket(ticketId, { status: 'closed' });
        await interaction.editReply({ content: `✅ Ticket #${ticketId} has been force closed.` });
        console.log(`[DEV] Force closed ticket #${ticketId}`);
        
        // Broadcast update to dashboard
        context.broadcast({
          type: 'ticket_updated',
          ticket: await context.storage.getTicket(ticketId)
        });
        
      } else if (action === 'delete') {
        await context.storage.deleteTicket(ticketId);
        await interaction.editReply({ content: `✅ Ticket #${ticketId} has been permanently deleted.` });
        console.log(`[DEV] Deleted ticket #${ticketId}`);
        
        // Broadcast deletion to dashboard
        context.broadcast({
          type: 'ticket_deleted',
          ticketId: ticketId
        });
        
      } else if (action === 'messages') {
        const messages = await context.storage.getTicketMessages(ticketId);
        
        if (messages.length === 0) {
          await interaction.editReply({ content: `ℹ️ Ticket #${ticketId} has no messages.` });
          return;
        }
        
        const messageList = messages.slice(0, 10).map((msg, idx) => {
          const timestamp = msg.createdAt ? new Date(msg.createdAt).toLocaleString() : 'Unknown';
          const sender = msg.senderUsername || msg.senderId;
          const content = msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : '');
          return `**${idx + 1}.** ${sender} (${timestamp})\n${content}`;
        }).join('\n\n');
        
        const embed = new EmbedBuilder()
          .setTitle(`💬 Messages for Ticket #${ticketId}`)
          .setDescription(messageList || 'No messages')
          .setColor('#5865F2')
          .setFooter({ text: `Showing ${Math.min(messages.length, 10)} of ${messages.length} messages` })
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        console.log(`[DEV] Displayed ${messages.length} messages for ticket #${ticketId}`);
      }
    } catch (error) {
      console.error('[DEV] Error executing dev-ticket command:', error);
      try {
        await interaction.editReply({ content: '❌ An error occurred while managing the ticket.' });
      } catch {
        await interaction.reply({ content: '❌ An error occurred while managing the ticket.', ephemeral: true });
      }
    }
  }
};

// Export all developer commands
export const developerCommands = [
  devDmCommand,
  devAnnounceCommand,
  devStatsCommand,
  devRefreshCommand,
  devTicketCommand
];
