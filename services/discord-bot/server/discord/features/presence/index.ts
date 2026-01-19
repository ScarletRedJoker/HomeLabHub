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
import { getPlexService, PlexSession } from '../../../services/plex-service';
import { getJellyfinService, JellyfinSession } from '../../../services/jellyfin-service';
import { IStorage } from '../../../storage';
import { db } from '../../../db';
import { discordUsers } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Cache presence settings in memory for performance, but persist to database
const userPresenceCache = new Map<string, boolean>();

// Initialize cache from database on startup
async function loadPresenceSettings(): Promise<void> {
  try {
    const users = await db.select({ id: discordUsers.id, presenceVisible: discordUsers.presenceVisible })
      .from(discordUsers);
    for (const user of users) {
      if (user.presenceVisible !== null) {
        userPresenceCache.set(user.id, user.presenceVisible);
      }
    }
    console.log(`[Presence] Loaded ${userPresenceCache.size} presence settings from database`);
  } catch (error) {
    console.log('[Presence] Could not load presence settings from database, using defaults');
  }
}

// Persist presence setting to database
async function setPresenceVisible(userId: string, visible: boolean, username?: string, discriminator?: string): Promise<void> {
  userPresenceCache.set(userId, visible);
  try {
    const existing = await db.select().from(discordUsers).where(eq(discordUsers.id, userId));
    if (existing.length > 0) {
      await db.update(discordUsers)
        .set({ presenceVisible: visible })
        .where(eq(discordUsers.id, userId));
    } else {
      await db.insert(discordUsers).values({
        id: userId,
        username: username || 'unknown',
        discriminator: discriminator || '0',
        presenceVisible: visible,
      });
    }
  } catch (error) {
    console.error('[Presence] Failed to persist presence setting:', error);
  }
}

// Get presence visibility (from cache first, then database)
async function getPresenceVisible(userId: string): Promise<boolean> {
  if (userPresenceCache.has(userId)) {
    return userPresenceCache.get(userId)!;
  }
  try {
    const [user] = await db.select({ presenceVisible: discordUsers.presenceVisible })
      .from(discordUsers)
      .where(eq(discordUsers.id, userId));
    const visible = user?.presenceVisible ?? true;
    userPresenceCache.set(userId, visible);
    return visible;
  } catch (error) {
    return true; // Default to visible
  }
}

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
  loadPresenceSettings(); // Load presence settings from database
  
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

  if (targetUser.id !== interaction.user.id) {
    const isVisible = await getPresenceVisible(targetUser.id);
    if (!isVisible) {
      await interaction.editReply({
        content: `\`[LOCKED]\` **${targetUser.displayName}** has their activity set to private.`,
      });
      return;
    }
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

  if (targetUser.id !== interaction.user.id) {
    const isVisible = await getPresenceVisible(targetUser.id);
    if (!isVisible) {
      await interaction.editReply({
        content: `\`[LOCKED]\` **${targetUser.displayName}** has their profile set to private.`,
      });
      return;
    }
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
    await interaction.deferReply({ ephemeral: true });
    
    const user = interaction.user;
    const currentState = await getPresenceVisible(user.id);
    const newState = !currentState;
    await setPresenceVisible(user.id, newState, user.username, user.discriminator);

    const statusEmoji = newState ? '🟢' : '🔒';
    const statusText = newState ? 'visible to everyone' : 'hidden from others';

    await interaction.editReply({
      content: `${statusEmoji} Your activity is now **${statusText}**.\n\`[SAVED]\` This setting persists across restarts.`,
    });
  } else if (subcommand === 'status') {
    await interaction.deferReply({ ephemeral: true });
    
    const userId = interaction.user.id;
    const isVisible = await getPresenceVisible(userId);

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

    await interaction.editReply({ embeds: [embed] });
  }
}

function createNowPlayingEmbed(user: User, presence: FormattedPresence): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(getStatusColor(presence.status))
    .setAuthor({
      name: `${presence.displayName || user.displayName}`,
      iconURL: presence.avatarUrl || user.displayAvatarURL(),
    })
    .setTimestamp();

  const media = getMediaSources(presence);
  const hasSpotify = media.spotify !== null;
  const hasPlexActivity = media.plex.length > 0;
  const hasJellyfinActivity = media.jellyfin.length > 0;
  const hasMediaActivity = hasSpotify || hasPlexActivity || hasJellyfinActivity;

  if (hasMediaActivity) {
    embed.setTitle('📡 NOW STREAMING');
    
    const mediaLines: string[] = [];
    
    if (hasSpotify && media.spotify) {
      mediaLines.push(
        '```ansi',
        `\x1b[32m[SPOTIFY]\x1b[0m`,
        `${media.spotify.song}`,
        `by ${media.spotify.artist}`,
        `on ${media.spotify.album}`,
        '```'
      );
      if (media.spotify.albumArtUrl) {
        embed.setThumbnail(media.spotify.albumArtUrl);
      }
    }
    
    embed.setDescription(mediaLines.length > 0 ? mediaLines.join('\n') : null);
    
    if (hasSpotify && media.spotify) {
      embed.addFields({
        name: '🎧 Spotify Progress',
        value: '`' + createProgressBar(media.spotify.progress || 0) + '`',
        inline: false,
      });
    }
    
    if (hasPlexActivity) {
      const plexContent = media.plex.slice(0, 2).map(session => {
        return formatPlexSession(session);
      }).join('\n\n');
      
      embed.addFields({
        name: '🎬 Plex',
        value: plexContent || 'Nothing playing',
        inline: false,
      });
    }
    
    if (hasJellyfinActivity) {
      const jellyfinContent = media.jellyfin.slice(0, 2).map(session => {
        return formatJellyfinSession(session);
      }).join('\n\n');
      
      embed.addFields({
        name: '🟣 Jellyfin',
        value: jellyfinContent || 'Nothing playing',
        inline: false,
      });
    }
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
  if (hasPlexActivity) platforms.push('📺 Plex');
  if (hasJellyfinActivity) platforms.push('🟣 Jellyfin');

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

  const media = getMediaSources(presence);

  if (media.spotify) {
    const spotifyArt = 
      '```\n' +
      `🎵 ${media.spotify.song}\n` +
      `   ${media.spotify.artist}\n` +
      `   ${createProgressBar(media.spotify.progress || 0)}\n` +
      '```';
    embed.addFields({
      name: '🎧 SPOTIFY',
      value: spotifyArt,
      inline: false,
    });
  }

  if (media.plex.length > 0) {
    const plexSessions = media.plex.slice(0, 2).map(session => formatPlexSession(session)).join('\n\n');
    embed.addFields({
      name: '🎬 PLEX',
      value: plexSessions || 'Nothing playing',
      inline: false,
    });
  }

  if (media.jellyfin.length > 0) {
    const jellyfinSessions = media.jellyfin.slice(0, 2).map(session => formatJellyfinSession(session)).join('\n\n');
    embed.addFields({
      name: '🟣 JELLYFIN',
      value: jellyfinSessions || 'Nothing playing',
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
  if (media.plex.length > 0) platformBadges.push('`📺 PLEX`');
  if (media.jellyfin.length > 0) platformBadges.push('`🟣 JELLYFIN`');

  if (platformBadges.length > 0) {
    embed.addFields({
      name: '📡 CONNECTED FROM',
      value: platformBadges.join(' '),
      inline: false,
    });
  }

  const footerParts = [`ID: ${user.id}`, 'Powered by Lanyard'];
  if (media.plex.length > 0) footerParts.push('Plex');
  if (media.jellyfin.length > 0) footerParts.push('Jellyfin');

  embed.setFooter({
    text: footerParts.join(' • '),
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

function createMediaProgressBar(current: number, total: number): string {
  if (total <= 0) return '[░░░░░░░░░░░░░░░░░░░░] 0%';
  const progress = Math.min(100, Math.round((current / total) * 100));
  const filled = Math.round(progress / 5);
  const empty = 20 - filled;
  const currentTime = formatDuration(current);
  const totalTime = formatDuration(total);
  return `[${'\u2588'.repeat(filled)}${'\u2591'.repeat(empty)}] ${currentTime}/${totalTime}`;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatPlexSession(session: PlexSession): string {
  const stateIcon = session.state === 'playing' ? '▶️' : session.state === 'paused' ? '⏸️' : '⏳';
  const progress = session.duration > 0 ? Math.round((session.viewOffset / session.duration) * 100) : 0;
  const progressBar = createMediaProgressBar(Math.floor(session.viewOffset / 1000), Math.floor(session.duration / 1000));
  
  if (session.type === 'episode') {
    const showName = session.grandparentTitle || session.title;
    const season = session.parentTitle?.replace(/Season\s*/i, '') || '?';
    return `${stateIcon} **${showName}**\n└─ S${season} · ${session.title}\n└─ \`${progressBar}\``;
  } else if (session.type === 'movie') {
    const yearStr = session.year ? ` (${session.year})` : '';
    return `${stateIcon} **${session.title}**${yearStr}\n└─ \`${progressBar}\``;
  } else if (session.type === 'track') {
    const artist = session.grandparentTitle || 'Unknown Artist';
    return `${stateIcon} **${session.title}**\n└─ ${artist}\n└─ \`${progressBar}\``;
  }
  return `${stateIcon} **${session.title}**`;
}

function formatJellyfinSession(session: JellyfinSession): string {
  const stateIcon = session.state === 'playing' ? '▶️' : '⏸️';
  const progressBar = createMediaProgressBar(session.position, session.duration);
  
  if (session.type === 'Episode') {
    const showName = session.seriesName || session.title;
    const season = session.seasonName?.replace(/Season\s*/i, '') || '?';
    return `${stateIcon} **${showName}**\n└─ S${season} · ${session.title}\n└─ \`${progressBar}\``;
  } else if (session.type === 'Movie') {
    const yearStr = session.year ? ` (${session.year})` : '';
    return `${stateIcon} **${session.title}**${yearStr}\n└─ \`${progressBar}\``;
  } else if (session.type === 'Audio') {
    const artist = session.artistName || 'Unknown Artist';
    return `${stateIcon} **${session.title}**\n└─ ${artist}\n└─ \`${progressBar}\``;
  }
  return `${stateIcon} **${session.title}**`;
}

interface MediaSources {
  spotify: FormattedPresence['spotify'] | null;
  plex: PlexSession[];
  jellyfin: JellyfinSession[];
  otherActivities: Array<{ name: string; type: string; details?: string; state?: string }>;
}

function getMediaSources(presence: FormattedPresence): MediaSources {
  const plexService = getPlexService();
  const jellyfinService = getJellyfinService();
  
  const plexData = plexService?.getNowPlaying();
  const jellyfinData = jellyfinService?.getNowPlaying();
  
  const musicActivities = ['YouTube Music', 'SoundCloud', 'Apple Music', 'Tidal', 'Deezer', 'Amazon Music'];
  const otherActivities = presence.activities.filter(a => 
    a.type.toLowerCase() !== 'listening to' || 
    (a.type.toLowerCase() === 'listening to' && musicActivities.some(m => a.name.includes(m)))
  );

  return {
    spotify: presence.spotify?.isListening ? presence.spotify : null,
    plex: plexData?.sessions || [],
    jellyfin: jellyfinData?.sessions || [],
    otherActivities
  };
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
