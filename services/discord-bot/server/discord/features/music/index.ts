/**
 * Music Player Feature
 * 
 * Voice channel music playback with slick dev aesthetic.
 * Uses discord-player for audio streaming.
 * 
 * Commands:
 * - /play <query> - Play a song from YouTube/Spotify/Plex/Jellyfin/Direct URLs
 * - /skip - Skip the current song
 * - /stop - Stop playback and leave the channel
 * - /queue - Show the current queue
 * - /nowplaying - Show what's currently playing (music version)
 * - /volume <level> - Set the volume (0-100)
 * - /plex search/recent/play - Browse and play from Plex library
 * - /jellyfin search/play - Browse and play from Jellyfin library
 */

import { 
  Client, 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder, 
  GuildMember,
  Collection,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder
} from 'discord.js';
import { Player, GuildQueue, Track, useMainPlayer, useQueue } from 'discord-player';
import { IStorage } from '../../../storage';
import { getPlexService, PlexMediaItem } from '../../../services/plex-service';
import { getJellyfinService, JellyfinMediaItem, initJellyfinService, clearJellyfinService } from '../../../services/jellyfin-service';

interface CommandContext {
  storage: IStorage;
  broadcast: (data: any) => void;
}

interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction, context: CommandContext) => Promise<void>;
}

let player: Player | null = null;

export function registerMusicCommands(commands: Collection<string, Command>): void {
  console.log('[Music] Registering music commands...');
  
  const playCmd: Command = {
    data: new SlashCommandBuilder()
      .setName('play')
      .setDescription('Play a song from YouTube or Spotify')
      .addStringOption(option =>
        option
          .setName('query')
          .setDescription('Song name or URL')
          .setRequired(true)
      ),
    execute: handlePlay
  };

  const skipCmd: Command = {
    data: new SlashCommandBuilder()
      .setName('skip')
      .setDescription('Skip the current song'),
    execute: handleSkip
  };

  const stopCmd: Command = {
    data: new SlashCommandBuilder()
      .setName('stop')
      .setDescription('Stop playback and leave the voice channel'),
    execute: handleStop
  };

  const queueCmd: Command = {
    data: new SlashCommandBuilder()
      .setName('queue')
      .setDescription('Show the current music queue'),
    execute: handleQueue
  };

  const npMusicCmd: Command = {
    data: new SlashCommandBuilder()
      .setName('np')
      .setDescription('Show what\'s currently playing'),
    execute: handleNowPlayingMusic
  };

  const volumeCmd: Command = {
    data: new SlashCommandBuilder()
      .setName('volume')
      .setDescription('Set the playback volume')
      .addIntegerOption(option =>
        option
          .setName('level')
          .setDescription('Volume level (0-100)')
          .setRequired(true)
          .setMinValue(0)
          .setMaxValue(100)
      ),
    execute: handleVolume
  };

  const pauseCmd: Command = {
    data: new SlashCommandBuilder()
      .setName('pause')
      .setDescription('Pause or resume playback'),
    execute: handlePause
  };

  const plexCmd: Command = {
    data: new SlashCommandBuilder()
      .setName('plex')
      .setDescription('Browse and play media from Plex')
      .addSubcommand(subcommand =>
        subcommand
          .setName('search')
          .setDescription('Search Plex library')
          .addStringOption(option =>
            option
              .setName('query')
              .setDescription('Search query')
              .setRequired(true)
          )
          .addStringOption(option =>
            option
              .setName('type')
              .setDescription('Media type to search for')
              .setRequired(false)
              .addChoices(
                { name: 'Music Tracks', value: 'track' },
                { name: 'Albums', value: 'album' },
                { name: 'Artists', value: 'artist' },
                { name: 'Movies', value: 'movie' },
                { name: 'TV Shows', value: 'show' }
              )
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('recent')
          .setDescription('Show recently added media')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('play')
          .setDescription('Play a track from Plex')
          .addStringOption(option =>
            option
              .setName('title')
              .setDescription('Track title to search and play')
              .setRequired(true)
          )
      ) as SlashCommandSubcommandsOnlyBuilder,
    execute: handlePlex
  };

  const jellyfinCmd: Command = {
    data: new SlashCommandBuilder()
      .setName('jellyfin')
      .setDescription('Browse and play media from Jellyfin')
      .addSubcommand(subcommand =>
        subcommand
          .setName('search')
          .setDescription('Search Jellyfin library')
          .addStringOption(option =>
            option
              .setName('query')
              .setDescription('Search query')
              .setRequired(true)
          )
          .addStringOption(option =>
            option
              .setName('type')
              .setDescription('Media type to search for')
              .setRequired(false)
              .addChoices(
                { name: 'Music Tracks', value: 'Audio' },
                { name: 'Albums', value: 'MusicAlbum' },
                { name: 'Artists', value: 'MusicArtist' },
                { name: 'Movies', value: 'Movie' },
                { name: 'TV Shows', value: 'Series' }
              )
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('play')
          .setDescription('Play a track from Jellyfin')
          .addStringOption(option =>
            option
              .setName('title')
              .setDescription('Track title to search and play')
              .setRequired(true)
          )
      ) as SlashCommandSubcommandsOnlyBuilder,
    execute: handleJellyfin
  };

  commands.set('play', playCmd);
  commands.set('skip', skipCmd);
  commands.set('stop', stopCmd);
  commands.set('queue', queueCmd);
  commands.set('np', npMusicCmd);
  commands.set('volume', volumeCmd);
  commands.set('pause', pauseCmd);
  commands.set('plex', plexCmd);
  commands.set('jellyfin', jellyfinCmd);
  
  console.log('[Music] ✅ Registered commands: play, skip, stop, queue, np, volume, pause, plex, jellyfin');
}

export async function initMusicPlayer(client: Client): Promise<void> {
  console.log('[Music] Initializing music player...');
  
  try {
    player = new Player(client);

    // Load extractors using the new API (loadDefault was deprecated in discord-player 6.x)
    const { DefaultExtractors } = await import('@discord-player/extractor');
    await player.extractors.loadMulti(DefaultExtractors);
    
    player.events.on('playerStart', (queue, track) => {
      const embed = createNowPlayingEmbed(track);
      (queue.metadata as any)?.channel?.send({ embeds: [embed] }).catch(() => {});
    });

    player.events.on('audioTrackAdd', (queue, track) => {
      if (queue.tracks.size > 0) {
        const embed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle('`[QUEUED]`')
          .setDescription(`**${track.title}** added to queue`)
          .setThumbnail(track.thumbnail)
          .addFields({ name: 'Position', value: `#${queue.tracks.size}`, inline: true })
          .setFooter({ text: `Duration: ${track.duration}` });
        
        (queue.metadata as any)?.channel?.send({ embeds: [embed] }).catch(() => {});
      }
    });

    player.events.on('emptyQueue', (queue) => {
      const embed = new EmbedBuilder()
        .setColor(0x555555)
        .setTitle('`[QUEUE EMPTY]`')
        .setDescription('Queue finished. Add more songs with `/play`');
      
      (queue.metadata as any)?.channel?.send({ embeds: [embed] }).catch(() => {});
    });

    player.events.on('error', (queue, error) => {
      console.error('[Music] Player error:', error);
    });

    console.log('[Music] ✅ Music player initialized');
  } catch (error) {
    console.error('[Music] Failed to initialize music player:', error);
    throw error;
  }
}

async function handlePlay(
  interaction: ChatInputCommandInteraction,
  context: CommandContext
): Promise<void> {
  await interaction.deferReply();

  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    await interaction.editReply({
      content: '`[ERROR]` You need to be in a voice channel to use this command.',
    });
    return;
  }

  const query = interaction.options.getString('query', true);

  if (isPlexUrl(query)) {
    await handlePlexUrlPlay(interaction, voiceChannel, query);
    return;
  }

  if (isDirectAudioUrl(query)) {
    await playStreamUrl(interaction, voiceChannel, query, {
      title: extractFilenameFromUrl(query),
      artist: 'Direct URL',
      source: 'URL'
    });
    return;
  }

  const mainPlayer = useMainPlayer();

  if (!mainPlayer) {
    await interaction.editReply({
      content: '`[ERROR]` Music player is not initialized.',
    });
    return;
  }

  try {
    const result = await mainPlayer.play(voiceChannel, query, {
      nodeOptions: {
        metadata: {
          channel: interaction.channel,
          requestedBy: interaction.user
        },
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: 60000,
        leaveOnEnd: false,
        leaveOnEndCooldown: 60000,
      },
      requestedBy: interaction.user
    });

    if (!result.track) {
      await interaction.editReply({
        content: '`[ERROR]` No tracks found for your query.',
      });
      return;
    }

    const sourceLabel = isYouTubeMusicUrl(query) ? 'YOUTUBE MUSIC' : result.track.source.toUpperCase();

    const embed = new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle('`[LOADING]`')
      .setDescription(`**${result.track.title}**`)
      .setThumbnail(result.track.thumbnail)
      .addFields(
        { name: 'Artist', value: result.track.author || 'Unknown', inline: true },
        { name: 'Duration', value: result.track.duration, inline: true },
        { name: 'Source', value: `\`${sourceLabel}\``, inline: true }
      )
      .setFooter({ text: `Requested by ${interaction.user.displayName}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (error: any) {
    console.error('[Music] Play error:', error);
    await interaction.editReply({
      content: `\`[ERROR]\` Failed to play: ${error.message}`,
    });
  }
}

async function handlePlexUrlPlay(
  interaction: ChatInputCommandInteraction,
  voiceChannel: any,
  plexUrl: string
): Promise<void> {
  const plexService = getPlexService();
  if (!plexService || !plexService.isConfigured()) {
    await interaction.editReply({
      content: '`[ERROR]` Plex is not configured. Set PLEX_URL and PLEX_TOKEN environment variables.',
    });
    return;
  }

  // Support multiple Plex URL formats:
  // - plex://server/metadata/12345
  // - https://app.plex.tv/...key=%2Flibrary%2Fmetadata%2F12345
  // - /library/metadata/12345
  let ratingKey: string | null = null;
  
  // Decode the URL first to handle URL-encoded paths
  const decodedUrl = decodeURIComponent(plexUrl);
  
  // Try standard metadata pattern on decoded URL
  const standardMatch = decodedUrl.match(/metadata\/(\d+)/);
  if (standardMatch) {
    ratingKey = standardMatch[1];
  }
  
  // Also try on original URL in case it's not encoded
  if (!ratingKey) {
    const originalMatch = plexUrl.match(/metadata\/(\d+)/);
    if (originalMatch) {
      ratingKey = originalMatch[1];
    }
  }
  
  // Extract from key= query parameter (decode first)
  if (!ratingKey) {
    const keyMatch = plexUrl.match(/[?&]key=([^&]+)/);
    if (keyMatch) {
      const decodedKey = decodeURIComponent(keyMatch[1]);
      const metadataMatch = decodedKey.match(/metadata\/(\d+)/);
      if (metadataMatch) {
        ratingKey = metadataMatch[1];
      }
    }
  }
  
  if (!ratingKey) {
    await interaction.editReply({
      content: '`[ERROR]` Invalid Plex URL format. Supported formats:\n• `plex://server/metadata/12345`\n• `https://app.plex.tv/...key=%2Flibrary%2Fmetadata%2F12345`',
    });
    return;
  }
  const streamUrl = plexService.getTranscodeUrl(ratingKey);

  if (!streamUrl) {
    await interaction.editReply({
      content: '`[ERROR]` Failed to get stream URL from Plex.',
    });
    return;
  }

  await playStreamUrl(interaction, voiceChannel, streamUrl, {
    title: `Plex Track #${ratingKey}`,
    artist: 'Plex',
    source: 'Plex'
  });
}

function extractFilenameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop() || 'Unknown';
    return decodeURIComponent(filename.replace(/\.[^/.]+$/, ''));
  } catch {
    return 'Direct Audio';
  }
}

async function handleSkip(
  interaction: ChatInputCommandInteraction,
  context: CommandContext
): Promise<void> {
  const queue = useQueue(interaction.guildId!);

  if (!queue || !queue.isPlaying()) {
    await interaction.reply({
      content: '`[ERROR]` No music is currently playing.',
      ephemeral: true,
    });
    return;
  }

  const currentTrack = queue.currentTrack;
  queue.node.skip();

  const embed = new EmbedBuilder()
    .setColor(0xffaa00)
    .setTitle('`[SKIPPED]`')
    .setDescription(`**${currentTrack?.title || 'Unknown'}** was skipped`)
    .setFooter({ text: `Skipped by ${interaction.user.displayName}` });

  await interaction.reply({ embeds: [embed] });
}

async function handleStop(
  interaction: ChatInputCommandInteraction,
  context: CommandContext
): Promise<void> {
  const queue = useQueue(interaction.guildId!);

  if (!queue) {
    await interaction.reply({
      content: '`[ERROR]` No music is currently playing.',
      ephemeral: true,
    });
    return;
  }

  queue.delete();

  const embed = new EmbedBuilder()
    .setColor(0xff4444)
    .setTitle('`[STOPPED]`')
    .setDescription('Music stopped and queue cleared.')
    .setFooter({ text: `Stopped by ${interaction.user.displayName}` });

  await interaction.reply({ embeds: [embed] });
}

async function handleQueue(
  interaction: ChatInputCommandInteraction,
  context: CommandContext
): Promise<void> {
  const queue = useQueue(interaction.guildId!);

  if (!queue || queue.tracks.size === 0) {
    const embed = new EmbedBuilder()
      .setColor(0x555555)
      .setTitle('`[QUEUE]`')
      .setDescription('Queue is empty. Add songs with `/play`');
    
    await interaction.reply({ embeds: [embed] });
    return;
  }

  const currentTrack = queue.currentTrack;
  const tracks = queue.tracks.toArray().slice(0, 10);

  let queueText = tracks
    .map((track, i) => `\`${i + 1}.\` **${track.title}** - ${track.duration}`)
    .join('\n');

  if (queue.tracks.size > 10) {
    queueText += `\n\n... and ${queue.tracks.size - 10} more tracks`;
  }

  const embed = new EmbedBuilder()
    .setColor(0x00ff88)
    .setTitle('`[QUEUE]`')
    .setDescription(
      '```\nNOW PLAYING:\n```\n' +
      `**${currentTrack?.title || 'Nothing'}**\n\n` +
      '```\nUP NEXT:\n```\n' +
      (queueText || 'Nothing in queue')
    )
    .setThumbnail(currentTrack?.thumbnail || null)
    .setFooter({ text: `${queue.tracks.size} tracks in queue` });

  await interaction.reply({ embeds: [embed] });
}

async function handleNowPlayingMusic(
  interaction: ChatInputCommandInteraction,
  context: CommandContext
): Promise<void> {
  const queue = useQueue(interaction.guildId!);

  if (!queue || !queue.currentTrack) {
    const embed = new EmbedBuilder()
      .setColor(0x555555)
      .setTitle('`[NOW PLAYING]`')
      .setDescription('Nothing is currently playing. Use `/play` to start!');
    
    await interaction.reply({ embeds: [embed] });
    return;
  }

  const track = queue.currentTrack;
  const progress = queue.node.getTimestamp();
  
  const embed = createNowPlayingEmbed(track, progress?.current.value);
  await interaction.reply({ embeds: [embed] });
}

async function handleVolume(
  interaction: ChatInputCommandInteraction,
  context: CommandContext
): Promise<void> {
  const queue = useQueue(interaction.guildId!);

  if (!queue) {
    await interaction.reply({
      content: '`[ERROR]` No music is currently playing.',
      ephemeral: true,
    });
    return;
  }

  const volume = interaction.options.getInteger('level', true);
  queue.node.setVolume(volume);

  const volumeBar = createVolumeBar(volume);
  
  const embed = new EmbedBuilder()
    .setColor(0x00ff88)
    .setTitle('`[VOLUME]`')
    .setDescription(`\`${volumeBar}\` ${volume}%`);

  await interaction.reply({ embeds: [embed] });
}

async function handlePause(
  interaction: ChatInputCommandInteraction,
  context: CommandContext
): Promise<void> {
  const queue = useQueue(interaction.guildId!);

  if (!queue || !queue.isPlaying()) {
    await interaction.reply({
      content: '`[ERROR]` No music is currently playing.',
      ephemeral: true,
    });
    return;
  }

  const isPaused = queue.node.isPaused();
  
  if (isPaused) {
    queue.node.resume();
  } else {
    queue.node.pause();
  }

  const embed = new EmbedBuilder()
    .setColor(isPaused ? 0x00ff88 : 0xffaa00)
    .setTitle(isPaused ? '`[RESUMED]`' : '`[PAUSED]`')
    .setDescription(isPaused ? 'Playback resumed' : 'Playback paused');

  await interaction.reply({ embeds: [embed] });
}

function createNowPlayingEmbed(track: Track, progress?: number): EmbedBuilder {
  const progressBar = createProgressBar(progress || 0, 100);
  
  return new EmbedBuilder()
    .setColor(0x00ff88)
    .setTitle('`[NOW PLAYING]`')
    .setDescription(
      '```\n' +
      `${track.title}\n` +
      `${track.author}\n` +
      '```'
    )
    .setThumbnail(track.thumbnail)
    .addFields(
      { name: 'Duration', value: `\`${track.duration}\``, inline: true },
      { name: 'Source', value: `\`${track.source.toUpperCase()}\``, inline: true }
    )
    .setFooter({ text: track.requestedBy ? `Requested by ${track.requestedBy.username}` : 'Music Player' });
}

function createProgressBar(current: number, max: number): string {
  const progress = Math.round((current / max) * 20);
  const filled = '\u2588'.repeat(progress);
  const empty = '\u2591'.repeat(20 - progress);
  return `[${filled}${empty}]`;
}

function createVolumeBar(level: number): string {
  const filled = Math.round(level / 5);
  const empty = 20 - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

async function handlePlex(
  interaction: ChatInputCommandInteraction,
  context: CommandContext
): Promise<void> {
  await interaction.deferReply();

  const plexService = getPlexService();
  if (!plexService || !plexService.isConfigured()) {
    await interaction.editReply({
      content: '`[ERROR]` Plex is not configured. Set PLEX_URL and PLEX_TOKEN environment variables.',
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'search') {
    const query = interaction.options.getString('query', true);
    const type = interaction.options.getString('type') as 'movie' | 'show' | 'artist' | 'album' | 'track' | null;

    const result = await plexService.search(query, type || undefined);

    if (result.items.length === 0) {
      await interaction.editReply({
        content: `\`[PLEX]\` No results found for "${query}"`,
      });
      return;
    }

    const embed = createPlexSearchEmbed(result.items, query);
    await interaction.editReply({ embeds: [embed] });
  } 
  else if (subcommand === 'recent') {
    const items = await plexService.getRecentlyAdded(10);

    if (items.length === 0) {
      await interaction.editReply({
        content: '`[PLEX]` No recently added media found.',
      });
      return;
    }

    const embed = createPlexRecentEmbed(items);
    await interaction.editReply({ embeds: [embed] });
  }
  else if (subcommand === 'play') {
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
      await interaction.editReply({
        content: '`[ERROR]` You need to be in a voice channel to use this command.',
      });
      return;
    }

    const title = interaction.options.getString('title', true);
    const result = await plexService.search(title, 'track');

    if (result.items.length === 0) {
      await interaction.editReply({
        content: `\`[PLEX]\` No tracks found for "${title}"`,
      });
      return;
    }

    const track = result.items[0];
    const streamUrl = plexService.getTranscodeUrl(track.ratingKey);

    if (!streamUrl) {
      await interaction.editReply({
        content: '`[ERROR]` Failed to get stream URL.',
      });
      return;
    }

    await playStreamUrl(interaction, voiceChannel, streamUrl, {
      title: track.title,
      artist: track.artist || track.grandparentTitle || 'Unknown Artist',
      album: track.album || track.parentTitle,
      duration: track.duration,
      source: 'Plex'
    });
  }
}

async function handleJellyfin(
  interaction: ChatInputCommandInteraction,
  context: CommandContext
): Promise<void> {
  await interaction.deferReply();

  let jellyfinService = getJellyfinService();
  
  // If service doesn't exist, create it
  if (!jellyfinService) {
    jellyfinService = initJellyfinService();
  }
  
  // If service is not ready (first time or previous failure), try to start it
  if (!jellyfinService.isReady()) {
    if (!jellyfinService.isConfigured()) {
      await interaction.editReply({
        content: '`[ERROR]` Jellyfin is not configured. Set JELLYFIN_URL and JELLYFIN_API_KEY environment variables.',
      });
      return;
    }
    
    try {
      console.log('[Jellyfin] Attempting to start/reconnect Jellyfin service...');
      await jellyfinService.start();
    } catch (err: any) {
      console.error('[Jellyfin] Failed to start service:', err.message);
      // Clear the failed instance so next command gets a fresh one
      clearJellyfinService();
      await interaction.editReply({
        content: `\`[ERROR]\` Failed to connect to Jellyfin server: ${err.message}`,
      });
      return;
    }
    
    // Verify service is now ready
    if (!jellyfinService.isReady()) {
      // Clear the instance if it didn't initialize properly
      clearJellyfinService();
      await interaction.editReply({
        content: '`[ERROR]` Jellyfin service started but is not ready. User authentication may have failed.',
      });
      return;
    }
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'search') {
    const query = interaction.options.getString('query', true);
    const type = interaction.options.getString('type') as 'Audio' | 'MusicAlbum' | 'MusicArtist' | 'Movie' | 'Series' | null;

    const result = await jellyfinService.search(query, type || undefined);

    if (result.items.length === 0) {
      await interaction.editReply({
        content: `\`[JELLYFIN]\` No results found for "${query}"`,
      });
      return;
    }

    const embed = createJellyfinSearchEmbed(result.items, query);
    await interaction.editReply({ embeds: [embed] });
  }
  else if (subcommand === 'play') {
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
      await interaction.editReply({
        content: '`[ERROR]` You need to be in a voice channel to use this command.',
      });
      return;
    }

    const title = interaction.options.getString('title', true);
    const result = await jellyfinService.search(title, 'Audio');

    if (result.items.length === 0) {
      await interaction.editReply({
        content: `\`[JELLYFIN]\` No tracks found for "${title}"`,
      });
      return;
    }

    const track = result.items[0];
    const streamUrl = jellyfinService.getStreamUrl(track.id);

    if (!streamUrl) {
      await interaction.editReply({
        content: '`[ERROR]` Failed to get stream URL.',
      });
      return;
    }

    await playStreamUrl(interaction, voiceChannel, streamUrl, {
      title: track.name,
      artist: track.artistName || 'Unknown Artist',
      album: track.albumName,
      duration: track.duration,
      source: 'Jellyfin'
    });
  }
}

interface StreamTrackInfo {
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  source: string;
}

async function playStreamUrl(
  interaction: ChatInputCommandInteraction,
  voiceChannel: any,
  streamUrl: string,
  trackInfo: StreamTrackInfo
): Promise<void> {
  const mainPlayer = useMainPlayer();

  if (!mainPlayer) {
    await interaction.editReply({
      content: '`[ERROR]` Music player is not initialized.',
    });
    return;
  }

  try {
    const result = await mainPlayer.play(voiceChannel, streamUrl, {
      nodeOptions: {
        metadata: {
          channel: interaction.channel,
          requestedBy: interaction.user
        },
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: 60000,
        leaveOnEnd: false,
        leaveOnEndCooldown: 60000,
      },
      requestedBy: interaction.user
    });

    const durationStr = trackInfo.duration 
      ? formatDuration(trackInfo.duration)
      : 'Unknown';

    const embed = new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle(`\`[${trackInfo.source.toUpperCase()}]\``)
      .setDescription(`**${trackInfo.title}**`)
      .addFields(
        { name: 'Artist', value: trackInfo.artist, inline: true },
        { name: 'Duration', value: durationStr, inline: true }
      )
      .setFooter({ text: `Requested by ${interaction.user.displayName}` });

    if (trackInfo.album) {
      embed.addFields({ name: 'Album', value: trackInfo.album, inline: true });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error: any) {
    console.error(`[Music] ${trackInfo.source} play error:`, error);
    await interaction.editReply({
      content: `\`[ERROR]\` Failed to play from ${trackInfo.source}: ${error.message}`,
    });
  }
}

function createPlexSearchEmbed(items: PlexMediaItem[], query: string): EmbedBuilder {
  const description = items.slice(0, 10).map((item, i) => {
    const typeIcon = getMediaTypeIcon(item.type);
    const details = formatMediaDetails(item);
    return `\`${i + 1}.\` ${typeIcon} **${item.title}** ${details}`;
  }).join('\n');

  return new EmbedBuilder()
    .setColor(0xe5a00d)
    .setTitle('`[PLEX SEARCH]`')
    .setDescription(`Results for "${query}":\n\n${description}`)
    .setFooter({ text: `${items.length} results | Use /plex play <title> to play` });
}

function createPlexRecentEmbed(items: PlexMediaItem[]): EmbedBuilder {
  const description = items.slice(0, 10).map((item, i) => {
    const typeIcon = getMediaTypeIcon(item.type);
    const details = formatMediaDetails(item);
    const addedDate = item.addedAt 
      ? `<t:${item.addedAt}:R>`
      : '';
    return `\`${i + 1}.\` ${typeIcon} **${item.title}** ${details} ${addedDate}`;
  }).join('\n');

  return new EmbedBuilder()
    .setColor(0xe5a00d)
    .setTitle('`[PLEX RECENTLY ADDED]`')
    .setDescription(description)
    .setFooter({ text: 'Use /plex play <title> to play' });
}

function createJellyfinSearchEmbed(items: JellyfinMediaItem[], query: string): EmbedBuilder {
  const description = items.slice(0, 10).map((item, i) => {
    const typeIcon = getJellyfinTypeIcon(item.type);
    const details = formatJellyfinDetails(item);
    return `\`${i + 1}.\` ${typeIcon} **${item.name}** ${details}`;
  }).join('\n');

  return new EmbedBuilder()
    .setColor(0x00a4dc)
    .setTitle('`[JELLYFIN SEARCH]`')
    .setDescription(`Results for "${query}":\n\n${description}`)
    .setFooter({ text: `${items.length} results | Use /jellyfin play <title> to play` });
}

function getMediaTypeIcon(type: PlexMediaItem['type']): string {
  const icons: Record<string, string> = {
    movie: '🎬',
    show: '📺',
    season: '📺',
    episode: '📺',
    artist: '👤',
    album: '💿',
    track: '🎵'
  };
  return icons[type] || '📁';
}

function getJellyfinTypeIcon(type: JellyfinMediaItem['type']): string {
  const icons: Record<string, string> = {
    Movie: '🎬',
    Series: '📺',
    Season: '📺',
    Episode: '📺',
    MusicArtist: '👤',
    MusicAlbum: '💿',
    Audio: '🎵'
  };
  return icons[type] || '📁';
}

function formatMediaDetails(item: PlexMediaItem): string {
  const parts: string[] = [];
  
  if (item.type === 'track' && item.artist) {
    parts.push(`by ${item.artist}`);
  } else if (item.type === 'album' && item.artist) {
    parts.push(`by ${item.artist}`);
  } else if (item.type === 'episode' && item.grandparentTitle) {
    parts.push(`(${item.grandparentTitle})`);
  }
  
  if (item.year) {
    parts.push(`(${item.year})`);
  }
  
  return parts.length > 0 ? `- ${parts.join(' ')}` : '';
}

function formatJellyfinDetails(item: JellyfinMediaItem): string {
  const parts: string[] = [];
  
  if (item.type === 'Audio' && item.artistName) {
    parts.push(`by ${item.artistName}`);
  } else if (item.type === 'MusicAlbum' && item.albumArtist) {
    parts.push(`by ${item.albumArtist}`);
  } else if (item.type === 'Episode' && item.seriesName) {
    parts.push(`(${item.seriesName})`);
  }
  
  if (item.year) {
    parts.push(`(${item.year})`);
  }
  
  return parts.length > 0 ? `- ${parts.join(' ')}` : '';
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function isPlexUrl(query: string): boolean {
  return query.startsWith('plex://') || query.includes('plex.tv/');
}

function isYouTubeMusicUrl(query: string): boolean {
  return query.includes('music.youtube.com');
}

function isDirectAudioUrl(query: string): boolean {
  const audioExtensions = ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.opus'];
  try {
    const url = new URL(query);
    return audioExtensions.some(ext => url.pathname.toLowerCase().endsWith(ext));
  } catch {
    return false;
  }
}
