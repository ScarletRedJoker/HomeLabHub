import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  TextChannel,
  Collection
} from 'discord.js';
import { IStorage } from '../../../storage';
import {
  createGiveawayEmbed,
  createGiveawayButton,
  parseDuration,
  formatDuration,
  endGiveaway,
  rerollGiveaway,
  updateGiveawayMessage,
  announceWinners,
  parseEntries
} from './giveawayService';

interface CommandContext {
  storage: IStorage;
  broadcast: (data: any) => void;
}

interface Command {
  data: any;
  execute: (interaction: ChatInputCommandInteraction, context: CommandContext) => Promise<void>;
}

export const giveawayCommands: Command[] = [];

const giveawayCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Create and manage giveaways')
    .addSubcommand(sub => sub
      .setName('create')
      .setDescription('Create a new giveaway')
      .addStringOption(opt => opt
        .setName('prize')
        .setDescription('What are you giving away?')
        .setRequired(true)
        .setMaxLength(256)
      )
      .addStringOption(opt => opt
        .setName('duration')
        .setDescription('How long should the giveaway last? (e.g., 1h, 1d, 1w)')
        .setRequired(true)
      )
      .addIntegerOption(opt => opt
        .setName('winners')
        .setDescription('Number of winners (default: 1)')
        .setMinValue(1)
        .setMaxValue(20)
        .setRequired(false)
      )
      .addStringOption(opt => opt
        .setName('description')
        .setDescription('Additional description for the giveaway')
        .setRequired(false)
        .setMaxLength(1000)
      )
      .addIntegerOption(opt => opt
        .setName('min_level')
        .setDescription('Minimum level required to enter')
        .setMinValue(1)
        .setRequired(false)
      )
      .addRoleOption(opt => opt
        .setName('required_role')
        .setDescription('Role required to enter the giveaway')
        .setRequired(false)
      )
    )
    .addSubcommand(sub => sub
      .setName('end')
      .setDescription('End a giveaway early')
      .addIntegerOption(opt => opt
        .setName('giveaway_id')
        .setDescription('The ID of the giveaway to end')
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('reroll')
      .setDescription('Reroll winners for a giveaway')
      .addIntegerOption(opt => opt
        .setName('giveaway_id')
        .setDescription('The ID of the giveaway to reroll')
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List active giveaways in this server')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  execute: async (interaction, { storage }) => {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'create') {
      await handleCreateGiveaway(interaction, storage);
    } else if (subcommand === 'end') {
      await handleEndGiveaway(interaction, storage);
    } else if (subcommand === 'reroll') {
      await handleRerollGiveaway(interaction, storage);
    } else if (subcommand === 'list') {
      await handleListGiveaways(interaction, storage);
    }
  }
};

async function handleCreateGiveaway(interaction: ChatInputCommandInteraction, storage: IStorage) {
  await interaction.deferReply();

  if (!interaction.guildId || !interaction.channelId) {
    await interaction.editReply({ content: '❌ This command can only be used in a server channel.' });
    return;
  }

  const prize = interaction.options.getString('prize', true);
  const durationStr = interaction.options.getString('duration', true);
  const winnersCount = interaction.options.getInteger('winners') || 1;
  const description = interaction.options.getString('description');
  const minLevel = interaction.options.getInteger('min_level');
  const requiredRole = interaction.options.getRole('required_role');

  const durationMs = parseDuration(durationStr);
  if (!durationMs) {
    await interaction.editReply({ content: '❌ Invalid duration format. Use formats like: 30m, 1h, 1d, 1w' });
    return;
  }

  if (durationMs < 60000) {
    await interaction.editReply({ content: '❌ Minimum duration is 1 minute.' });
    return;
  }

  if (durationMs > 30 * 24 * 60 * 60 * 1000) {
    await interaction.editReply({ content: '❌ Maximum duration is 30 days.' });
    return;
  }

  const endTime = new Date(Date.now() + durationMs);
  
  const requirements: { minLevel?: number; requiredRoles?: string[] } = {};
  if (minLevel) requirements.minLevel = minLevel;
  if (requiredRole) requirements.requiredRoles = [requiredRole.id];

  const giveaway = await storage.createGiveaway({
    serverId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: null,
    prize,
    description: description || null,
    hostId: interaction.user.id,
    hostUsername: interaction.user.username,
    endTime,
    winnerCount: winnersCount,
    ended: false,
    requirements: Object.keys(requirements).length > 0 ? JSON.stringify(requirements) : null,
    entries: '[]',
    winners: null
  });

  const embed = createGiveawayEmbed(giveaway, false);
  const button = createGiveawayButton(giveaway);
  
  const reply = await interaction.editReply({ 
    embeds: [embed], 
    components: [button] 
  });

  await storage.updateGiveaway(giveaway.id, { messageId: reply.id });

  console.log(`[Giveaways] Created giveaway ${giveaway.id} in server ${interaction.guildId} by ${interaction.user.tag}`);
}

async function handleEndGiveaway(interaction: ChatInputCommandInteraction, storage: IStorage) {
  await interaction.deferReply({ ephemeral: true });

  if (!interaction.guildId) {
    await interaction.editReply({ content: '❌ This command can only be used in a server.' });
    return;
  }

  const giveawayId = interaction.options.getInteger('giveaway_id', true);
  const giveaway = await storage.getGiveaway(giveawayId);

  if (!giveaway) {
    await interaction.editReply({ content: '❌ Giveaway not found.' });
    return;
  }

  if (giveaway.serverId !== interaction.guildId) {
    await interaction.editReply({ content: '❌ Giveaway not found in this server.' });
    return;
  }

  if (giveaway.ended) {
    await interaction.editReply({ content: '❌ This giveaway has already ended.' });
    return;
  }

  const isHost = giveaway.hostId === interaction.user.id;
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

  if (!isHost && !isAdmin) {
    await interaction.editReply({ content: '❌ Only the giveaway host or server admins can end this giveaway.' });
    return;
  }

  const { giveaway: updatedGiveaway, winners } = await endGiveaway(storage, giveaway);

  await updateGiveawayMessage(interaction.client, updatedGiveaway);
  await announceWinners(interaction.client, updatedGiveaway, winners);

  await interaction.editReply({ 
    content: `✅ Giveaway #${giveawayId} has been ended. ${winners.length > 0 ? `Winner${winners.length > 1 ? 's' : ''}: ${winners.map(w => `<@${w}>`).join(', ')}` : 'No valid entries.'}` 
  });

  console.log(`[Giveaways] Giveaway ${giveawayId} ended by ${interaction.user.tag}`);
}

async function handleRerollGiveaway(interaction: ChatInputCommandInteraction, storage: IStorage) {
  await interaction.deferReply({ ephemeral: true });

  if (!interaction.guildId) {
    await interaction.editReply({ content: '❌ This command can only be used in a server.' });
    return;
  }

  const giveawayId = interaction.options.getInteger('giveaway_id', true);
  const giveaway = await storage.getGiveaway(giveawayId);

  if (!giveaway) {
    await interaction.editReply({ content: '❌ Giveaway not found.' });
    return;
  }

  if (giveaway.serverId !== interaction.guildId) {
    await interaction.editReply({ content: '❌ Giveaway not found in this server.' });
    return;
  }

  if (!giveaway.ended) {
    await interaction.editReply({ content: '❌ This giveaway has not ended yet. Use `/giveaway end` first.' });
    return;
  }

  const isHost = giveaway.hostId === interaction.user.id;
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

  if (!isHost && !isAdmin) {
    await interaction.editReply({ content: '❌ Only the giveaway host or server admins can reroll this giveaway.' });
    return;
  }

  const { giveaway: updatedGiveaway, newWinners } = await rerollGiveaway(storage, giveaway);

  await updateGiveawayMessage(interaction.client, updatedGiveaway);

  if (newWinners.length > 0) {
    const channel = interaction.guild?.channels.cache.get(giveaway.channelId) as TextChannel;
    if (channel) {
      const winnerMentions = newWinners.map(w => `<@${w}>`).join(', ');
      await channel.send({
        content: `🎉 **Giveaway Rerolled!**\n\nNew winner${newWinners.length > 1 ? 's' : ''}: ${winnerMentions}\n\nCongratulations on winning **${giveaway.prize}**!`
      });
    }
    
    await interaction.editReply({ 
      content: `✅ Giveaway rerolled! New winner${newWinners.length > 1 ? 's' : ''}: ${newWinners.map(w => `<@${w}>`).join(', ')}` 
    });
  } else {
    await interaction.editReply({ content: '❌ No more eligible entries to reroll.' });
  }

  console.log(`[Giveaways] Giveaway ${giveawayId} rerolled by ${interaction.user.tag}`);
}

async function handleListGiveaways(interaction: ChatInputCommandInteraction, storage: IStorage) {
  await interaction.deferReply({ ephemeral: true });

  if (!interaction.guildId) {
    await interaction.editReply({ content: '❌ This command can only be used in a server.' });
    return;
  }

  const giveaways = await storage.getActiveGiveaways(interaction.guildId);

  if (giveaways.length === 0) {
    await interaction.editReply({ content: '📭 No active giveaways in this server.' });
    return;
  }

  const giveawayList = giveaways.map(giveaway => {
    const entries = parseEntries(giveaway.entries);
    const endsAt = Math.floor(new Date(giveaway.endTime).getTime() / 1000);
    return `**#${giveaway.id}** - ${giveaway.prize.substring(0, 50)}${giveaway.prize.length > 50 ? '...' : ''} (${entries.length} entries | Ends <t:${endsAt}:R>)`;
  }).join('\n');

  await interaction.editReply({ 
    content: `🎉 **Active Giveaways (${giveaways.length})**\n\n${giveawayList}` 
  });
}

giveawayCommands.push(giveawayCommand);

export function registerGiveawayCommands(commands: Collection<string, Command>): void {
  for (const command of giveawayCommands) {
    commands.set(command.data.name, command);
  }
  console.log('[Giveaways] Registered giveaway commands:', giveawayCommands.map(c => c.data.name).join(', '));
}
