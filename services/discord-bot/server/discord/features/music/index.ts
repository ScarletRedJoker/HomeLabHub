/**
 * Music Player Feature
 * 
 * Voice channel music playback with slick dev aesthetic.
 * Uses discord-player for audio streaming.
 * 
 * Commands:
 * - /play <query> - Play a song from YouTube/Spotify
 * - /skip - Skip the current song
 * - /stop - Stop playback and leave the channel
 * - /queue - Show the current queue
 * - /nowplaying - Show what's currently playing (music version)
 * - /volume <level> - Set the volume (0-100)
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

  commands.set('play', playCmd);
  commands.set('skip', skipCmd);
  commands.set('stop', stopCmd);
  commands.set('queue', queueCmd);
  commands.set('np', npMusicCmd);
  commands.set('volume', volumeCmd);
  commands.set('pause', pauseCmd);
  
  console.log('[Music] ✅ Registered commands: play, skip, stop, queue, np, volume, pause');
}

export async function initMusicPlayer(client: Client): Promise<void> {
  console.log('[Music] Initializing music player...');
  
  try {
    player = new Player(client);

    await player.extractors.loadDefault();
    
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

    const embed = new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle('`[LOADING]`')
      .setDescription(`**${result.track.title}**`)
      .setThumbnail(result.track.thumbnail)
      .addFields(
        { name: 'Artist', value: result.track.author || 'Unknown', inline: true },
        { name: 'Duration', value: result.track.duration, inline: true }
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
