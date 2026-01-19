/**
 * Media Presence Auto-Posting Feature
 * 
 * Automatically posts beautiful embeds to a configured Discord channel
 * when users start watching movies/shows on Plex or Jellyfin.
 * 
 * Features:
 * - Tracks active sessions and detects new playback starts
 * - Posts embed with poster art, title, year, and user
 * - Updates/edits message when playback ends or changes
 * - Cooldown system to avoid spam (configurable, default 30 min)
 * - Supports filtering by media type (movies, shows, music, all)
 * 
 * Commands:
 * - /media-presence setup #channel - Set channel for updates
 * - /media-presence toggle - Enable/disable posting
 * - /media-presence test - Post a test message
 */

import { 
  Client, 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder, 
  TextChannel,
  Collection,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  ChannelType,
  PermissionFlagsBits
} from 'discord.js';
import { db } from '../../../db';
import { mediaPresenceSettings, mediaPresenceLog } from '@shared/schema';
import { eq, and, gte } from 'drizzle-orm';
import { getPlexService, PlexSession } from '../../../services/plex-service';
import { getJellyfinService, JellyfinSession } from '../../../services/jellyfin-service';
import { IStorage } from '../../../storage';

interface CommandContext {
  storage: IStorage;
  broadcast: (data: any) => void;
}

interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction, context: CommandContext) => Promise<void>;
}

interface TrackedSession {
  sessionKey: string;
  messageId?: string;
  channelId: string;
  source: 'plex' | 'jellyfin';
  title: string;
  mediaType: string;
  user: string;
  state: 'playing' | 'paused' | 'ended' | 'buffering';
  startedAt: number;
  lastUpdated: number;
  progress: number;
  duration: number;
  thumbnailUrl?: string;
}

const activeSessions = new Map<string, TrackedSession>();
const settingsCache = new Map<string, { channelId: string; isEnabled: boolean; postTypes: string; cooldownMinutes: number; showUser: boolean; showProgress: boolean; showPoster: boolean }>();
let discordClient: Client | null = null;

function generateSessionKey(source: 'plex' | 'jellyfin', session: PlexSession | JellyfinSession): string {
  if (source === 'plex') {
    const plexSession = session as PlexSession;
    return `plex_${plexSession.title}_${plexSession.user}`;
  } else {
    const jellyfinSession = session as JellyfinSession;
    return `jellyfin_${jellyfinSession.title}_${jellyfinSession.user}`;
  }
}

function getMediaType(source: 'plex' | 'jellyfin', session: PlexSession | JellyfinSession): string {
  if (source === 'plex') {
    const plexSession = session as PlexSession;
    switch (plexSession.type) {
      case 'movie': return 'movie';
      case 'episode': return 'show';
      case 'track': return 'music';
      default: return 'unknown';
    }
  } else {
    const jellyfinSession = session as JellyfinSession;
    switch (jellyfinSession.type) {
      case 'Movie': return 'movie';
      case 'Episode': return 'show';
      case 'Audio': return 'music';
      default: return 'unknown';
    }
  }
}

function shouldPostMediaType(postTypes: string, mediaType: string): boolean {
  if (postTypes === 'all') return true;
  if (postTypes === 'movies' && mediaType === 'movie') return true;
  if (postTypes === 'shows' && mediaType === 'show') return true;
  if (postTypes === 'music' && mediaType === 'music') return true;
  return false;
}

async function getServerSettings(serverId: string): Promise<typeof settingsCache extends Map<string, infer V> ? V | null : never> {
  if (settingsCache.has(serverId)) {
    return settingsCache.get(serverId)!;
  }

  try {
    const [settings] = await db.select().from(mediaPresenceSettings).where(eq(mediaPresenceSettings.serverId, serverId));
    if (settings && settings.channelId) {
      const cached = {
        channelId: settings.channelId,
        isEnabled: settings.isEnabled ?? true,
        postTypes: settings.postTypes ?? 'all',
        cooldownMinutes: settings.cooldownMinutes ?? 30,
        showUser: settings.showUser ?? true,
        showProgress: settings.showProgress ?? true,
        showPoster: settings.showPoster ?? true
      };
      settingsCache.set(serverId, cached);
      return cached;
    }
  } catch (error) {
    console.error('[Media Presence] Error fetching settings:', error);
  }
  return null;
}

async function isOnCooldown(serverId: string, title: string, cooldownMinutes: number): Promise<boolean> {
  const cooldownTime = new Date(Date.now() - cooldownMinutes * 60 * 1000);
  
  try {
    const recentPosts = await db.select()
      .from(mediaPresenceLog)
      .where(and(
        eq(mediaPresenceLog.serverId, serverId),
        eq(mediaPresenceLog.title, title),
        gte(mediaPresenceLog.postedAt, cooldownTime)
      ));
    
    return recentPosts.length > 0;
  } catch (error) {
    console.error('[Media Presence] Error checking cooldown:', error);
    return false;
  }
}

function createMediaEmbed(
  session: TrackedSession, 
  source: 'plex' | 'jellyfin',
  originalSession: PlexSession | JellyfinSession,
  state: 'started' | 'ended' = 'started',
  showUser: boolean = true,
  showProgress: boolean = true
): EmbedBuilder {
  const isEnded = state === 'ended';
  const typeEmoji = session.mediaType === 'movie' ? '🎬' : 
                    session.mediaType === 'show' ? '📺' : 
                    session.mediaType === 'music' ? '🎵' : '📡';
  const sourceEmoji = source === 'plex' ? '🟠' : '🟣';
  const sourceName = source.charAt(0).toUpperCase() + source.slice(1);
  
  let title = session.title;
  let subtitle = '';
  let year = '';
  
  if (source === 'plex') {
    const plexSession = originalSession as PlexSession;
    if (plexSession.type === 'episode') {
      title = plexSession.grandparentTitle || plexSession.title;
      const seasonNum = plexSession.parentTitle?.replace(/Season\s*/i, 'S') || '';
      subtitle = `${seasonNum} · ${plexSession.title}`;
    } else if (plexSession.type === 'track') {
      subtitle = plexSession.grandparentTitle || 'Unknown Artist';
    }
    if (plexSession.year) year = ` (${plexSession.year})`;
  } else {
    const jellyfinSession = originalSession as JellyfinSession;
    if (jellyfinSession.type === 'Episode') {
      title = jellyfinSession.seriesName || jellyfinSession.title;
      const seasonNum = jellyfinSession.seasonName?.replace(/Season\s*/i, 'S') || '';
      subtitle = `${seasonNum} · ${jellyfinSession.title}`;
    } else if (jellyfinSession.type === 'Audio') {
      subtitle = jellyfinSession.artistName || 'Unknown Artist';
    }
    if (jellyfinSession.year) year = ` (${jellyfinSession.year})`;
  }

  const statusText = isEnded ? '✅ Finished Watching' : '▶️ Now Playing';
  const statusColor = isEnded ? 0x00ff88 : (source === 'plex' ? 0xe5a00d : 0xaa5cc3);

  const embed = new EmbedBuilder()
    .setColor(statusColor)
    .setAuthor({
      name: `${sourceEmoji} ${sourceName} ${typeEmoji}`,
    })
    .setTitle(`${statusText}`)
    .setDescription(
      `**${title}**${year}\n` +
      (subtitle ? `└─ ${subtitle}` : '')
    )
    .setTimestamp();

  if (session.thumbnailUrl) {
    embed.setThumbnail(session.thumbnailUrl);
  }

  if (showUser) {
    embed.addFields({
      name: '👤 Viewer',
      value: `\`${session.user}\``,
      inline: true
    });
  }

  if (showProgress && session.duration > 0) {
    const progress = Math.min(100, Math.round((session.progress / session.duration) * 100));
    const progressBar = createProgressBar(progress);
    const currentTime = formatDuration(session.progress);
    const totalTime = formatDuration(session.duration);
    
    embed.addFields({
      name: isEnded ? '📊 Watched' : '⏱️ Progress',
      value: `\`${progressBar}\`\n${currentTime} / ${totalTime}`,
      inline: true
    });
  }

  const mediaTypeLabel = session.mediaType.charAt(0).toUpperCase() + session.mediaType.slice(1);
  embed.setFooter({ text: `${mediaTypeLabel} • ${sourceName}` });

  return embed;
}

function createProgressBar(progress: number): string {
  const filled = Math.round(progress / 5);
  const empty = 20 - filled;
  return `[${'\u2588'.repeat(filled)}${'\u2591'.repeat(empty)}] ${progress}%`;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function postMediaUpdate(
  serverId: string,
  session: TrackedSession,
  source: 'plex' | 'jellyfin',
  originalSession: PlexSession | JellyfinSession,
  settings: ReturnType<typeof getServerSettings> extends Promise<infer V> ? V : never
): Promise<string | null> {
  if (!discordClient || !settings) return null;

  try {
    const channel = await discordClient.channels.fetch(settings.channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      console.warn(`[Media Presence] Channel ${settings.channelId} not found or not a text channel`);
      return null;
    }

    const textChannel = channel as TextChannel;
    const embed = createMediaEmbed(session, source, originalSession, 'started', settings.showUser, settings.showProgress);
    
    const message = await textChannel.send({ embeds: [embed] });
    
    await db.insert(mediaPresenceLog).values({
      serverId,
      sessionKey: session.sessionKey,
      messageId: message.id,
      channelId: settings.channelId,
      source,
      title: session.title,
      mediaType: session.mediaType,
      user: session.user,
      state: 'playing'
    });

    console.log(`[Media Presence] Posted update for "${session.title}" by ${session.user}`);
    return message.id;
  } catch (error) {
    console.error('[Media Presence] Failed to post update:', error);
    return null;
  }
}

async function updateMediaMessage(
  serverId: string,
  session: TrackedSession,
  source: 'plex' | 'jellyfin',
  originalSession: PlexSession | JellyfinSession,
  settings: ReturnType<typeof getServerSettings> extends Promise<infer V> ? V : never,
  state: 'started' | 'ended'
): Promise<void> {
  if (!discordClient || !settings || !session.messageId) return;

  try {
    const channel = await discordClient.channels.fetch(session.channelId);
    if (!channel || channel.type !== ChannelType.GuildText) return;

    const textChannel = channel as TextChannel;
    const message = await textChannel.messages.fetch(session.messageId);
    
    const embed = createMediaEmbed(session, source, originalSession, state, settings.showUser, settings.showProgress);
    await message.edit({ embeds: [embed] });

    await db.update(mediaPresenceLog)
      .set({ state: state === 'ended' ? 'ended' : 'playing', updatedAt: new Date() })
      .where(eq(mediaPresenceLog.messageId, session.messageId));

    console.log(`[Media Presence] Updated message for "${session.title}" - ${state}`);
  } catch (error) {
    console.error('[Media Presence] Failed to update message:', error);
  }
}

export async function processMediaSessions(serverIds: string[]): Promise<void> {
  if (!discordClient) return;

  const plexService = getPlexService();
  const jellyfinService = getJellyfinService();

  const plexData = plexService?.getNowPlaying();
  const jellyfinData = jellyfinService?.getNowPlaying();

  const currentSessionKeys = new Set<string>();

  for (const serverId of serverIds) {
    const settings = await getServerSettings(serverId);
    if (!settings || !settings.isEnabled || !settings.channelId) continue;

    if (plexData?.sessions) {
      for (const session of plexData.sessions) {
        const sessionKey = generateSessionKey('plex', session);
        currentSessionKeys.add(sessionKey);
        
        const mediaType = getMediaType('plex', session);
        if (!shouldPostMediaType(settings.postTypes, mediaType)) continue;

        const existingSession = activeSessions.get(sessionKey);
        
        if (!existingSession) {
          const onCooldown = await isOnCooldown(serverId, session.title, settings.cooldownMinutes);
          if (onCooldown) {
            console.log(`[Media Presence] Skipping "${session.title}" - on cooldown`);
            continue;
          }

          const newSession: TrackedSession = {
            sessionKey,
            channelId: settings.channelId,
            source: 'plex',
            title: session.title,
            mediaType,
            user: session.user,
            state: session.state,
            startedAt: Date.now(),
            lastUpdated: Date.now(),
            progress: Math.floor(session.viewOffset / 1000),
            duration: Math.floor(session.duration / 1000)
          };

          const messageId = await postMediaUpdate(serverId, newSession, 'plex', session, settings);
          if (messageId) {
            newSession.messageId = messageId;
            activeSessions.set(sessionKey, newSession);
          }
        } else {
          existingSession.progress = Math.floor(session.viewOffset / 1000);
          existingSession.state = session.state;
          existingSession.lastUpdated = Date.now();
        }
      }
    }

    if (jellyfinData?.sessions) {
      for (const session of jellyfinData.sessions) {
        const sessionKey = generateSessionKey('jellyfin', session);
        currentSessionKeys.add(sessionKey);
        
        const mediaType = getMediaType('jellyfin', session);
        if (!shouldPostMediaType(settings.postTypes, mediaType)) continue;

        const existingSession = activeSessions.get(sessionKey);
        
        if (!existingSession) {
          const onCooldown = await isOnCooldown(serverId, session.title, settings.cooldownMinutes);
          if (onCooldown) {
            console.log(`[Media Presence] Skipping "${session.title}" - on cooldown`);
            continue;
          }

          const newSession: TrackedSession = {
            sessionKey,
            channelId: settings.channelId,
            source: 'jellyfin',
            title: session.title,
            mediaType,
            user: session.user,
            state: session.state,
            startedAt: Date.now(),
            lastUpdated: Date.now(),
            progress: session.position,
            duration: session.duration
          };

          const messageId = await postMediaUpdate(serverId, newSession, 'jellyfin', session, settings);
          if (messageId) {
            newSession.messageId = messageId;
            activeSessions.set(sessionKey, newSession);
          }
        } else {
          existingSession.progress = session.position;
          existingSession.state = session.state;
          existingSession.lastUpdated = Date.now();
        }
      }
    }
  }

  for (const [sessionKey, session] of activeSessions) {
    if (!currentSessionKeys.has(sessionKey)) {
      const settings = await getServerSettings(serverIds[0]);
      if (settings && session.messageId) {
        const mockSession = session.source === 'plex' 
          ? { title: session.title, type: 'movie', user: session.user, state: 'playing', viewOffset: session.progress * 1000, duration: session.duration * 1000, player: '', grandparentTitle: '', parentTitle: '', year: 0 } as PlexSession
          : { title: session.title, type: 'Movie', user: session.user, state: 'playing', position: session.progress, duration: session.duration, device: '', player: '' } as JellyfinSession;
        
        await updateMediaMessage(serverIds[0], session, session.source, mockSession, settings, 'ended');
      }
      activeSessions.delete(sessionKey);
      console.log(`[Media Presence] Session ended: "${session.title}" by ${session.user}`);
    }
  }
}

export function initMediaPresence(client: Client): void {
  discordClient = client;
  console.log('[Media Presence] Initialized');
}

async function handleMediaPresenceSetup(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.editReply('❌ You need **Manage Server** permission to configure media presence.');
    return;
  }

  const channel = interaction.options.getChannel('channel', true);
  const serverId = interaction.guildId!;

  if (channel.type !== ChannelType.GuildText) {
    await interaction.editReply('❌ Please select a text channel.');
    return;
  }

  try {
    const existing = await db.select().from(mediaPresenceSettings).where(eq(mediaPresenceSettings.serverId, serverId));
    
    if (existing.length > 0) {
      await db.update(mediaPresenceSettings)
        .set({ channelId: channel.id, updatedAt: new Date() })
        .where(eq(mediaPresenceSettings.serverId, serverId));
    } else {
      await db.insert(mediaPresenceSettings).values({
        serverId,
        channelId: channel.id,
        isEnabled: true
      });
    }

    settingsCache.delete(serverId);

    await interaction.editReply(
      `✅ Media presence updates will now be posted to <#${channel.id}>\n\n` +
      `**Tips:**\n` +
      `• Use \`/media-presence toggle\` to enable/disable\n` +
      `• Use \`/media-presence test\` to post a test message\n` +
      `• Use \`/media-presence config\` to customize settings`
    );
  } catch (error) {
    console.error('[Media Presence] Setup error:', error);
    await interaction.editReply('❌ Failed to save settings. Please try again.');
  }
}

async function handleMediaPresenceToggle(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.editReply('❌ You need **Manage Server** permission to toggle media presence.');
    return;
  }

  const serverId = interaction.guildId!;

  try {
    const [settings] = await db.select().from(mediaPresenceSettings).where(eq(mediaPresenceSettings.serverId, serverId));
    
    if (!settings) {
      await interaction.editReply('❌ Media presence not configured. Use `/media-presence setup` first.');
      return;
    }

    const newState = !settings.isEnabled;
    await db.update(mediaPresenceSettings)
      .set({ isEnabled: newState, updatedAt: new Date() })
      .where(eq(mediaPresenceSettings.serverId, serverId));

    settingsCache.delete(serverId);

    const statusEmoji = newState ? '✅' : '⏸️';
    const statusText = newState ? 'enabled' : 'disabled';

    await interaction.editReply(
      `${statusEmoji} Media presence updates are now **${statusText}**.\n` +
      (settings.channelId ? `Channel: <#${settings.channelId}>` : '')
    );
  } catch (error) {
    console.error('[Media Presence] Toggle error:', error);
    await interaction.editReply('❌ Failed to toggle settings. Please try again.');
  }
}

async function handleMediaPresenceTest(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const serverId = interaction.guildId!;

  try {
    const [settings] = await db.select().from(mediaPresenceSettings).where(eq(mediaPresenceSettings.serverId, serverId));
    
    if (!settings || !settings.channelId) {
      await interaction.editReply('❌ Media presence not configured. Use `/media-presence setup` first.');
      return;
    }

    const channel = await interaction.client.channels.fetch(settings.channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.editReply('❌ Could not find the configured channel. Please run setup again.');
      return;
    }

    const testSession: TrackedSession = {
      sessionKey: 'test_session',
      channelId: settings.channelId,
      source: 'plex',
      title: 'Interstellar',
      mediaType: 'movie',
      user: interaction.user.username,
      state: 'playing',
      startedAt: Date.now(),
      lastUpdated: Date.now(),
      progress: 2700,
      duration: 10200
    };

    const mockPlexSession: PlexSession = {
      title: 'Interstellar',
      type: 'movie',
      year: 2014,
      user: interaction.user.username,
      player: 'Test Player',
      state: 'playing',
      viewOffset: 2700000,
      duration: 10200000
    };

    const embed = createMediaEmbed(
      testSession, 
      'plex', 
      mockPlexSession, 
      'started', 
      settings.showUser ?? true, 
      settings.showProgress ?? true
    );
    
    const textChannel = channel as TextChannel;
    await textChannel.send({ embeds: [embed] });

    await interaction.editReply(`✅ Test message sent to <#${settings.channelId}>`);
  } catch (error) {
    console.error('[Media Presence] Test error:', error);
    await interaction.editReply('❌ Failed to send test message. Please check bot permissions.');
  }
}

async function handleMediaPresenceConfig(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.editReply('❌ You need **Manage Server** permission to configure media presence.');
    return;
  }

  const serverId = interaction.guildId!;
  const postTypes = interaction.options.getString('types');
  const cooldown = interaction.options.getInteger('cooldown');
  const showUser = interaction.options.getBoolean('show_user');
  const showProgress = interaction.options.getBoolean('show_progress');

  try {
    const [settings] = await db.select().from(mediaPresenceSettings).where(eq(mediaPresenceSettings.serverId, serverId));
    
    if (!settings) {
      await interaction.editReply('❌ Media presence not configured. Use `/media-presence setup` first.');
      return;
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (postTypes !== null) updates.postTypes = postTypes;
    if (cooldown !== null) updates.cooldownMinutes = cooldown;
    if (showUser !== null) updates.showUser = showUser;
    if (showProgress !== null) updates.showProgress = showProgress;

    await db.update(mediaPresenceSettings)
      .set(updates)
      .where(eq(mediaPresenceSettings.serverId, serverId));

    settingsCache.delete(serverId);

    const currentSettings = await db.select().from(mediaPresenceSettings).where(eq(mediaPresenceSettings.serverId, serverId));
    const current = currentSettings[0];

    await interaction.editReply(
      `✅ **Configuration Updated**\n\n` +
      `📺 **Post Types:** \`${current.postTypes}\`\n` +
      `⏱️ **Cooldown:** \`${current.cooldownMinutes}\` minutes\n` +
      `👤 **Show User:** ${current.showUser ? '✅' : '❌'}\n` +
      `📊 **Show Progress:** ${current.showProgress ? '✅' : '❌'}`
    );
  } catch (error) {
    console.error('[Media Presence] Config error:', error);
    await interaction.editReply('❌ Failed to update settings. Please try again.');
  }
}

async function handleMediaPresenceStatus(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const serverId = interaction.guildId!;

  try {
    const [settings] = await db.select().from(mediaPresenceSettings).where(eq(mediaPresenceSettings.serverId, serverId));
    
    if (!settings) {
      await interaction.editReply(
        '📡 **Media Presence Status**\n\n' +
        '❌ Not configured\n\n' +
        'Use `/media-presence setup #channel` to get started!'
      );
      return;
    }

    const plexService = getPlexService();
    const jellyfinService = getJellyfinService();

    const plexStatus = plexService?.getStatus();
    const jellyfinConfigured = jellyfinService?.isConfigured();

    const statusEmbed = new EmbedBuilder()
      .setColor(settings.isEnabled ? 0x00ff88 : 0xff6b6b)
      .setTitle('📡 Media Presence Status')
      .addFields(
        {
          name: '⚙️ Configuration',
          value: `**Channel:** ${settings.channelId ? `<#${settings.channelId}>` : 'Not set'}\n` +
                 `**Status:** ${settings.isEnabled ? '✅ Enabled' : '⏸️ Disabled'}\n` +
                 `**Post Types:** \`${settings.postTypes}\`\n` +
                 `**Cooldown:** ${settings.cooldownMinutes} minutes`,
          inline: false
        },
        {
          name: '🟠 Plex',
          value: plexStatus?.configured 
            ? `✅ Connected (${plexStatus.activeSessions} active sessions)`
            : '❌ Not configured',
          inline: true
        },
        {
          name: '🟣 Jellyfin',
          value: jellyfinConfigured 
            ? '✅ Connected'
            : '❌ Not configured',
          inline: true
        }
      )
      .addFields({
        name: '📊 Active Tracking',
        value: `${activeSessions.size} session(s) being tracked`,
        inline: false
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [statusEmbed] });
  } catch (error) {
    console.error('[Media Presence] Status error:', error);
    await interaction.editReply('❌ Failed to fetch status. Please try again.');
  }
}

async function handleMediaPresence(
  interaction: ChatInputCommandInteraction,
  context: CommandContext
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  
  switch (subcommand) {
    case 'setup':
      await handleMediaPresenceSetup(interaction);
      break;
    case 'toggle':
      await handleMediaPresenceToggle(interaction);
      break;
    case 'test':
      await handleMediaPresenceTest(interaction);
      break;
    case 'config':
      await handleMediaPresenceConfig(interaction);
      break;
    case 'status':
      await handleMediaPresenceStatus(interaction);
      break;
    default:
      await interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}

export function registerMediaPresenceCommands(commands: Collection<string, Command>): void {
  console.log('[Media Presence] Registering commands...');

  const mediaPresenceCmd: Command = {
    data: new SlashCommandBuilder()
      .setName('media-presence')
      .setDescription('Configure automatic media activity updates')
      .addSubcommand(sub =>
        sub
          .setName('setup')
          .setDescription('Set the channel for media updates')
          .addChannelOption(opt =>
            opt
              .setName('channel')
              .setDescription('The channel to post updates to')
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true)
          )
      )
      .addSubcommand(sub =>
        sub
          .setName('toggle')
          .setDescription('Enable or disable media presence updates')
      )
      .addSubcommand(sub =>
        sub
          .setName('test')
          .setDescription('Send a test media presence message')
      )
      .addSubcommand(sub =>
        sub
          .setName('status')
          .setDescription('View current media presence configuration and status')
      )
      .addSubcommand(sub =>
        sub
          .setName('config')
          .setDescription('Configure media presence settings')
          .addStringOption(opt =>
            opt
              .setName('types')
              .setDescription('What types of media to post about')
              .addChoices(
                { name: 'All (movies, shows, music)', value: 'all' },
                { name: 'Movies only', value: 'movies' },
                { name: 'TV Shows only', value: 'shows' },
                { name: 'Music only', value: 'music' }
              )
          )
          .addIntegerOption(opt =>
            opt
              .setName('cooldown')
              .setDescription('Minutes before the same title can be posted again')
              .setMinValue(5)
              .setMaxValue(1440)
          )
          .addBooleanOption(opt =>
            opt
              .setName('show_user')
              .setDescription('Show who is watching in the embed')
          )
          .addBooleanOption(opt =>
            opt
              .setName('show_progress')
              .setDescription('Show progress bar in the embed')
          )
      ),
    execute: handleMediaPresence
  };

  commands.set('media-presence', mediaPresenceCmd);
  console.log('[Media Presence] Registered command: media-presence');
}

export function getConfiguredServerIds(): string[] {
  return Array.from(settingsCache.keys());
}

export async function loadMediaPresenceSettings(): Promise<void> {
  try {
    const allSettings = await db.select().from(mediaPresenceSettings);
    for (const settings of allSettings) {
      if (settings.channelId) {
        settingsCache.set(settings.serverId, {
          channelId: settings.channelId,
          isEnabled: settings.isEnabled ?? true,
          postTypes: settings.postTypes ?? 'all',
          cooldownMinutes: settings.cooldownMinutes ?? 30,
          showUser: settings.showUser ?? true,
          showProgress: settings.showProgress ?? true,
          showPoster: settings.showPoster ?? true
        });
      }
    }
    console.log(`[Media Presence] Loaded ${settingsCache.size} server configurations`);
  } catch (error) {
    console.log('[Media Presence] Could not load settings from database');
  }
}
