import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  TextChannel,
  Collection
} from 'discord.js';
import { IStorage } from '../../../storage';
import {
  createPollEmbed,
  createPollButtons,
  parseDuration,
  formatDuration,
  parsePollOptions
} from './pollService';
import { PollOption, PollType } from '@shared/schema';

interface CommandContext {
  storage: IStorage;
  broadcast: (data: any) => void;
}

interface Command {
  data: any;
  execute: (interaction: ChatInputCommandInteraction, context: CommandContext) => Promise<void>;
}

export const pollCommands: Command[] = [];

const pollCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create and manage polls')
    .addSubcommand(sub => sub
      .setName('create')
      .setDescription('Create a new poll')
      .addStringOption(opt => opt
        .setName('question')
        .setDescription('The poll question')
        .setRequired(true)
        .setMaxLength(256)
      )
      .addStringOption(opt => opt
        .setName('options')
        .setDescription('Poll options separated by | (e.g., "Option 1|Option 2|Option 3")')
        .setRequired(true)
      )
      .addStringOption(opt => opt
        .setName('duration')
        .setDescription('Poll duration (e.g., 30m, 1h, 1d). Leave empty for no time limit')
        .setRequired(false)
      )
      .addStringOption(opt => opt
        .setName('type')
        .setDescription('Poll type')
        .setRequired(false)
        .addChoices(
          { name: 'Single Choice', value: 'single' },
          { name: 'Multiple Choice', value: 'multiple' }
        )
      )
      .addBooleanOption(opt => opt
        .setName('anonymous')
        .setDescription('Hide who voted for what')
        .setRequired(false)
      )
      .addIntegerOption(opt => opt
        .setName('max_choices')
        .setDescription('Maximum number of choices for multiple choice polls')
        .setMinValue(1)
        .setMaxValue(25)
        .setRequired(false)
      )
      .addRoleOption(opt => opt
        .setName('required_role')
        .setDescription('Only members with this role can vote')
        .setRequired(false)
      )
    )
    .addSubcommand(sub => sub
      .setName('end')
      .setDescription('End a poll early')
      .addIntegerOption(opt => opt
        .setName('poll_id')
        .setDescription('The ID of the poll to end')
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('results')
      .setDescription('View current poll results')
      .addIntegerOption(opt => opt
        .setName('poll_id')
        .setDescription('The ID of the poll')
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List active polls in this server')
    ),

  execute: async (interaction, { storage }) => {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'create') {
      await handleCreatePoll(interaction, storage);
    } else if (subcommand === 'end') {
      await handleEndPoll(interaction, storage);
    } else if (subcommand === 'results') {
      await handlePollResults(interaction, storage);
    } else if (subcommand === 'list') {
      await handleListPolls(interaction, storage);
    }
  }
};

async function handleCreatePoll(interaction: ChatInputCommandInteraction, storage: IStorage) {
  await interaction.deferReply();

  if (!interaction.guildId || !interaction.channelId) {
    await interaction.editReply({ content: '❌ This command can only be used in a server channel.' });
    return;
  }

  const question = interaction.options.getString('question', true);
  const optionsStr = interaction.options.getString('options', true);
  const durationStr = interaction.options.getString('duration');
  const pollType = (interaction.options.getString('type') || 'single') as PollType;
  const anonymous = interaction.options.getBoolean('anonymous') || false;
  const maxChoices = interaction.options.getInteger('max_choices') || (pollType === 'multiple' ? 5 : 1);
  const requiredRole = interaction.options.getRole('required_role');

  const optionTexts = optionsStr.split('|').map(o => o.trim()).filter(o => o.length > 0);
  
  if (optionTexts.length < 2) {
    await interaction.editReply({ content: '❌ You need at least 2 options. Separate them with `|` (e.g., "Yes|No|Maybe")' });
    return;
  }
  
  if (optionTexts.length > 25) {
    await interaction.editReply({ content: '❌ Maximum 25 options allowed.' });
    return;
  }

  let endsAt: Date | null = null;
  if (durationStr) {
    const durationMs = parseDuration(durationStr);
    if (!durationMs) {
      await interaction.editReply({ content: '❌ Invalid duration format. Use formats like: 30s, 30m, 1h, 1d' });
      return;
    }
    if (durationMs < 10000) {
      await interaction.editReply({ content: '❌ Minimum duration is 10 seconds.' });
      return;
    }
    if (durationMs > 7 * 24 * 60 * 60 * 1000) {
      await interaction.editReply({ content: '❌ Maximum duration is 7 days.' });
      return;
    }
    endsAt = new Date(Date.now() + durationMs);
  }

  const options: PollOption[] = optionTexts.map(text => ({ text }));

  const poll = await storage.createPoll({
    serverId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: null,
    question,
    pollType,
    options: JSON.stringify(options),
    votes: '{}',
    createdBy: interaction.user.id,
    createdByUsername: interaction.user.username,
    endsAt,
    ended: false,
    anonymous,
    maxChoices: pollType === 'multiple' ? maxChoices : 1,
    allowedRoles: requiredRole ? JSON.stringify([requiredRole.id]) : null
  });

  const embed = createPollEmbed(poll, false);
  const components = createPollButtons(poll);
  
  const reply = await interaction.editReply({ 
    embeds: [embed], 
    components 
  });

  await storage.updatePoll(poll.id, { messageId: reply.id });

  console.log(`[Polls] Created poll ${poll.id} in server ${interaction.guildId} by ${interaction.user.tag}`);
}

async function handleEndPoll(interaction: ChatInputCommandInteraction, storage: IStorage) {
  await interaction.deferReply({ ephemeral: true });

  if (!interaction.guildId) {
    await interaction.editReply({ content: '❌ This command can only be used in a server.' });
    return;
  }

  const pollId = interaction.options.getInteger('poll_id', true);
  const poll = await storage.getPoll(pollId);

  if (!poll) {
    await interaction.editReply({ content: '❌ Poll not found.' });
    return;
  }

  if (poll.serverId !== interaction.guildId) {
    await interaction.editReply({ content: '❌ Poll not found in this server.' });
    return;
  }

  if (poll.ended) {
    await interaction.editReply({ content: '❌ This poll has already ended.' });
    return;
  }

  const isCreator = poll.createdBy === interaction.user.id;
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

  if (!isCreator && !isAdmin) {
    await interaction.editReply({ content: '❌ Only the poll creator or server admins can end this poll.' });
    return;
  }

  const updatedPoll = await storage.updatePoll(poll.id, { ended: true });

  if (poll.messageId && updatedPoll) {
    try {
      const channel = interaction.guild?.channels.cache.get(poll.channelId) as TextChannel;
      if (channel) {
        const message = await channel.messages.fetch(poll.messageId);
        if (message) {
          const embed = createPollEmbed(updatedPoll, true);
          await message.edit({ embeds: [embed], components: [] });
        }
      }
    } catch (error) {
      console.error('[Polls] Error updating ended poll message:', error);
    }
  }

  await interaction.editReply({ content: `✅ Poll #${pollId} has been ended. Final results are now displayed.` });
  console.log(`[Polls] Poll ${pollId} ended by ${interaction.user.tag}`);
}

async function handlePollResults(interaction: ChatInputCommandInteraction, storage: IStorage) {
  await interaction.deferReply({ ephemeral: true });

  if (!interaction.guildId) {
    await interaction.editReply({ content: '❌ This command can only be used in a server.' });
    return;
  }

  const pollId = interaction.options.getInteger('poll_id', true);
  const poll = await storage.getPoll(pollId);

  if (!poll) {
    await interaction.editReply({ content: '❌ Poll not found.' });
    return;
  }

  if (poll.serverId !== interaction.guildId) {
    await interaction.editReply({ content: '❌ Poll not found in this server.' });
    return;
  }

  const embed = createPollEmbed(poll, true);
  await interaction.editReply({ embeds: [embed] });
}

async function handleListPolls(interaction: ChatInputCommandInteraction, storage: IStorage) {
  await interaction.deferReply({ ephemeral: true });

  if (!interaction.guildId) {
    await interaction.editReply({ content: '❌ This command can only be used in a server.' });
    return;
  }

  const polls = await storage.getActivePolls(interaction.guildId);

  if (polls.length === 0) {
    await interaction.editReply({ content: '📭 No active polls in this server.' });
    return;
  }

  const pollList = polls.map(poll => {
    const options = parsePollOptions(poll.options);
    const optionCount = options.length;
    const endsInfo = poll.endsAt ? ` | Ends <t:${Math.floor(new Date(poll.endsAt).getTime() / 1000)}:R>` : '';
    return `**#${poll.id}** - ${poll.question.substring(0, 50)}${poll.question.length > 50 ? '...' : ''} (${optionCount} options${endsInfo})`;
  }).join('\n');

  await interaction.editReply({ 
    content: `📊 **Active Polls (${polls.length})**\n\n${pollList}` 
  });
}

pollCommands.push(pollCommand);

export function registerPollCommands(commands: Collection<string, Command>): void {
  for (const command of pollCommands) {
    commands.set(command.data.name, command);
  }
  console.log('[Polls] Registered poll commands:', pollCommands.map(c => c.data.name).join(', '));
}
