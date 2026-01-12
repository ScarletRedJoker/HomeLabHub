/**
 * Now Playing / User Presence Feature
 * 
 * Shows users' current activities (games, Spotify, streaming, coding) in a slick dev aesthetic.
 * Uses Lanyard API to fetch Discord presence data.
 * 
 * Commands:
 * - /nowplaying [user] - Show what a user is currently doing
 * - /profile [user] - Show a full activity profile card
 * - /presence toggle - Enable/disable showing your activity to others
 */

import { 
  Client, 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  User, 
  Collection,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder
} from 'discord.js';
import { getLanyardService, initLanyardService, FormattedPresence } from '../../../services/lanyard-service';
import { IStorage } from '../../../storage';

const userPresenceSettings = new Map<string, boolean>();

interface CommandContext {
  storage: IStorage;
  broadcast: (data: any) => void;
}

interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction, context: CommandContext) => Promise<void>;
}

export function registerPresenceCommands(commands: Collection<string, Command>): void {
  console.log('[Presence] Registering presence commands...');
  
  initLanyardService();
  
  const nowPlayingCmd: Command = {
    data: new SlashCommandBuilder()
      .setName('nowplaying')
      .setDescription('See what someone is currently doing')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('The user to check (leave empty for yourself)')
          .setRequired(false)
      ),
    execute: handleNowPlaying
  };

  const profileCmd: Command = {
    data: new SlashCommandBuilder()
      .setName('profile')
      .setDescription('View a slick dev profile showing all current activities')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('The user to view (leave empty for yourself)')
          .setRequired(false)
      ),
    execute: handleProfile
  };

  const presenceCmd: Command = {
    data: new SlashCommandBuilder()
      .setName('presence')
      .setDescription('Manage your presence visibility settings')
      .addSubcommand(sub =>
        sub
          .setName('toggle')
          .setDescription('Toggle whether others can see your activity')
      )
      .addSubcommand(sub =>
        sub
          .setName('status')
          .setDescription('Check your current presence settings')
      ),
    execute: handlePresenceSettings
  };

  commands.set('nowplaying', nowPlayingCmd);
  commands.set('profile', profileCmd);
  commands.set('presence', presenceCmd);
  
  console.log('[Presence] Registered commands: nowplaying, profile, presence');
}

async function handleNowPlaying(
  interaction: ChatInputCommandInteraction,
  context: CommandContext
): Promise<void> {
  await interaction.deferReply();

  const targetUser = interaction.options.getUser('user') || interaction.user;
  const lanyard = getLanyardService();

  if (!lanyard) {
    await interaction.editReply({
      content: '`[ERROR]` Presence service is not available.',
    });
    return;
  }

  if (targetUser.id !== interaction.user.id && !isPresenceVisible(targetUser.id)) {
    await interaction.editReply({
      content: `\`[LOCKED]\` **${targetUser.displayName}** has their activity set to private.`,
    });
    return;
  }

  const presence = await lanyard.getPresence(targetUser.id);

  if (!presence) {
    await interaction.editReply({
      embeds: [createNotFoundEmbed(targetUser)],
    });
    return;
  }

  const embed = createNowPlayingEmbed(targetUser, presence);
  await interaction.editReply({ embeds: [embed] });
}

async function handleProfile(
  interaction: ChatInputCommandInteraction,
  context: CommandContext
): Promise<void> {
  await interaction.deferReply();

  const targetUser = interaction.options.getUser('user') || interaction.user;
  const lanyard = getLanyardService();

  if (!lanyard) {
    await interaction.editReply({
      content: '`[ERROR]` Presence service is not available.',
    });
    return;
  }

  if (targetUser.id !== interaction.user.id && !isPresenceVisible(targetUser.id)) {
    await interaction.editReply({
      content: `\`[LOCKED]\` **${targetUser.displayName}** has their profile set to private.`,
    });
    return;
  }

  const presence = await lanyard.getPresence(targetUser.id);

  if (!presence) {
    await interaction.editReply({
      embeds: [createNotFoundEmbed(targetUser)],
    });
    return;
  }

  const embed = createProfileEmbed(targetUser, presence);
  const row = createProfileButtons(targetUser.id);

  await interaction.editReply({ embeds: [embed], components: [row] });
}

async function handlePresenceSettings(
  interaction: ChatInputCommandInteraction,
  context: CommandContext
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  
  if (subcommand === 'toggle') {
    const userId = interaction.user.id;
    const currentState = userPresenceSettings.get(userId) ?? true;
    const newState = !currentState;
    userPresenceSettings.set(userId, newState);

    const statusEmoji = newState ? '🟢' : '🔒';
    const statusText = newState ? 'visible to everyone' : 'hidden from others';

    await interaction.reply({
      content: `${statusEmoji} Your activity is now **${statusText}**.`,
      ephemeral: true,
    });
  } else if (subcommand === 'status') {
    const userId = interaction.user.id;
    const isVisible = isPresenceVisible(userId);

    const lanyard = getLanyardService();
    let lanyardStatus = '❓ Unknown';

    if (lanyard) {
      const presence = await lanyard.getPresence(userId);
      if (presence) {
        lanyardStatus = '`CONNECTED` You\'re in Lanyard Discord';
      } else {
        lanyardStatus = '`OFFLINE` Join discord.gg/lanyard to enable';
      }
    }

    const embed = new EmbedBuilder()
      .setColor(isVisible ? 0x00ff88 : 0xff6b6b)
      .setTitle('```\n⚙️ PRESENCE SETTINGS\n```')
      .setDescription(
        '```ansi\n' +
        `\x1b[2;34m┌─────────────────────────────────┐\x1b[0m\n` +
        `│ Status: ${isVisible ? '\x1b[32mPUBLIC\x1b[0m ' : '\x1b[31mPRIVATE\x1b[0m'}                   │\n` +
        `\x1b[2;34m└─────────────────────────────────┘\x1b[0m\n` +
        '```'
      )
      .addFields(
        {
          name: '📡 Visibility',
          value: isVisible 
            ? '`PUBLIC` Others can see your activity' 
            : '`PRIVATE` Your activity is hidden',
          inline: true,
        },
        {
          name: '🔗 Lanyard',
          value: lanyardStatus,
          inline: true,
        }
      )
      .setFooter({ text: 'Use /presence toggle to change visibility' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

function isPresenceVisible(userId: string): boolean {
  return userPresenceSettings.get(userId) ?? true;
}

function createNowPlayingEmbed(user: User, presence: FormattedPresence): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(getStatusColor(presence.status))
    .setAuthor({
      name: `${presence.displayName || user.displayName}`,
      iconURL: presence.avatarUrl || user.displayAvatarURL(),
    })
    .setTimestamp();

  if (presence.spotify?.isListening) {
    embed.setTitle('🎵 NOW PLAYING');
    embed.setDescription(
      '```\n' +
      `${presence.spotify.song}\n` +
      `by ${presence.spotify.artist}\n` +
      `on ${presence.spotify.album}\n` +
      '```'
    );
    if (presence.spotify.albumArtUrl) {
      embed.setThumbnail(presence.spotify.albumArtUrl);
    }
    embed.addFields({
      name: 'Progress',
      value: '`' + createProgressBar(presence.spotify.progress || 0) + '`',
      inline: false,
    });
  } else if (presence.activities.length > 0) {
    const mainActivity = presence.activities[0];
    embed.setTitle(getActivityEmoji(mainActivity.type) + ' ' + mainActivity.type.toUpperCase());
    embed.setDescription('```\n' + mainActivity.name + '\n```');

    if (mainActivity.details) {
      embed.addFields({ name: 'Details', value: '`' + mainActivity.details + '`', inline: true });
    }
    if (mainActivity.state) {
      embed.addFields({ name: 'State', value: '`' + mainActivity.state + '`', inline: true });
    }
  } else {
    embed.setTitle(getStatusEmoji(presence.status) + ' ' + presence.status.toUpperCase());
    embed.setDescription('```\nNo current activity\n```');
  }

  const platforms = [];
  if (presence.platforms.desktop) platforms.push('🖥️ Desktop');
  if (presence.platforms.web) platforms.push('🌐 Web');
  if (presence.platforms.mobile) platforms.push('📱 Mobile');

  if (platforms.length > 0) {
    embed.setFooter({ text: platforms.join(' • ') });
  }

  return embed;
}

function createProfileEmbed(user: User, presence: FormattedPresence): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(getStatusColor(presence.status))
    .setAuthor({
      name: '⚡ DEV PROFILE',
    })
    .setTitle(`${presence.displayName || user.displayName}`)
    .setThumbnail(presence.avatarUrl || user.displayAvatarURL())
    .setTimestamp();

  const statusArt = 
    '```ansi\n' +
    `\x1b[2;34m╔══════════════════════════════════╗\x1b[0m\n` +
    `\x1b[2;34m║\x1b[0m ${getStatusEmoji(presence.status)} STATUS: \x1b[${getAnsiColor(presence.status)}m${presence.status.toUpperCase().padEnd(20)}\x1b[0m \x1b[2;34m║\x1b[0m\n` +
    `\x1b[2;34m╚══════════════════════════════════╝\x1b[0m\n` +
    '```';
  embed.setDescription(statusArt);

  if (presence.spotify?.isListening) {
    const spotifyArt = 
      '```\n' +
      `🎵 ${presence.spotify.song}\n` +
      `   ${presence.spotify.artist}\n` +
      `   ${createProgressBar(presence.spotify.progress || 0)}\n` +
      '```';
    embed.addFields({
      name: '🎧 LISTENING TO',
      value: spotifyArt,
      inline: false,
    });
  }

  if (presence.activities.length > 0) {
    const activityList = presence.activities
      .slice(0, 3)
      .map(a => `${getActivityEmoji(a.type)} **${a.name}**${a.details ? `\n   └─ \`${a.details}\`` : ''}`)
      .join('\n');

    embed.addFields({
      name: '📊 ACTIVITIES',
      value: activityList || 'None',
      inline: false,
    });
  }

  const platformBadges = [];
  if (presence.platforms.desktop) platformBadges.push('`🖥️ DESKTOP`');
  if (presence.platforms.web) platformBadges.push('`🌐 WEB`');
  if (presence.platforms.mobile) platformBadges.push('`📱 MOBILE`');

  if (platformBadges.length > 0) {
    embed.addFields({
      name: '📡 CONNECTED FROM',
      value: platformBadges.join(' '),
      inline: false,
    });
  }

  embed.setFooter({
    text: `ID: ${user.id} • Powered by Lanyard`,
  });

  return embed;
}

function createNotFoundEmbed(user: User): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x2f3136)
    .setTitle('```\n❓ PRESENCE UNAVAILABLE\n```')
    .setDescription(
      `Could not fetch activity for **${user.displayName}**.\n\n` +
      '```\n' +
      'REQUIREMENTS:\n' +
      '1. Join discord.gg/lanyard\n' +
      '2. Presence syncs automatically\n' +
      '```'
    )
    .setThumbnail(user.displayAvatarURL());
}

function createProfileButtons(userId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`profile_refresh_${userId}`)
      .setLabel('Refresh')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔄'),
    new ButtonBuilder()
      .setLabel('Lanyard Discord')
      .setStyle(ButtonStyle.Link)
      .setURL('https://discord.gg/lanyard')
      .setEmoji('🔗')
  );
}

function createProgressBar(progress: number): string {
  const filled = Math.round(progress / 5);
  const empty = 20 - filled;
  return `[${'\u2588'.repeat(filled)}${'\u2591'.repeat(empty)}] ${progress}%`;
}

function getStatusColor(status: string): number {
  switch (status) {
    case 'online': return 0x00ff88;
    case 'idle': return 0xffaa00;
    case 'dnd': return 0xff4444;
    case 'offline': default: return 0x555555;
  }
}

function getAnsiColor(status: string): string {
  switch (status) {
    case 'online': return '32';
    case 'idle': return '33';
    case 'dnd': return '31';
    case 'offline': default: return '37';
  }
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case 'online': return '🟢';
    case 'idle': return '🌙';
    case 'dnd': return '🔴';
    case 'offline': default: return '⚫';
  }
}

function getActivityEmoji(type: string): string {
  switch (type.toLowerCase()) {
    case 'playing': return '🎮';
    case 'streaming': return '📺';
    case 'listening to': return '🎧';
    case 'watching': return '👀';
    case 'competing in': return '🏆';
    case 'custom status': return '💬';
    default: return '📍';
  }
}

export function initPresenceFeature(client: Client): void {
  console.log('[Presence Feature] Initializing button handlers...');

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('profile_refresh_')) {
      const userId = interaction.customId.replace('profile_refresh_', '');
      const lanyard = getLanyardService();

      if (!lanyard) {
        await interaction.reply({ content: '`[ERROR]` Service unavailable', ephemeral: true });
        return;
      }

      const presence = await lanyard.getPresence(userId);
      if (!presence) {
        await interaction.reply({ content: '`[ERROR]` Could not fetch presence', ephemeral: true });
        return;
      }

      const user = await client.users.fetch(userId).catch(() => null);
      if (!user) {
        await interaction.reply({ content: '`[ERROR]` User not found', ephemeral: true });
        return;
      }

      const embed = createProfileEmbed(user, presence);
      const row = createProfileButtons(userId);

      await interaction.update({ embeds: [embed], components: [row] });
    }
  });

  console.log('[Presence Feature] ✅ Ready');
}
