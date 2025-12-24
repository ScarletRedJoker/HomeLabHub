import { 
  Client, 
  Events, 
  MessageReaction, 
  User, 
  PartialMessageReaction, 
  PartialUser,
  GuildMember,
  PartialGuildMember,
  Message,
  EmbedBuilder,
  TextChannel
} from 'discord.js';
import { IStorage } from '../storage';
import { pickGiveawayWinners, announceGiveawayWinners } from './commands';

export function calculateLevel(xp: number): number {
  return Math.floor(0.1 * Math.sqrt(xp));
}

export function calculateXpForLevel(level: number): number {
  return Math.pow(level / 0.1, 2);
}

export function calculateProgressToNextLevel(xp: number, level: number): number {
  const currentLevelXp = calculateXpForLevel(level);
  const nextLevelXp = calculateXpForLevel(level + 1);
  const xpIntoCurrentLevel = xp - currentLevelXp;
  const xpNeeded = nextLevelXp - currentLevelXp;
  return Math.min(100, Math.floor((xpIntoCurrentLevel / xpNeeded) * 100));
}

async function handleStarboardReaction(
  reaction: MessageReaction | PartialMessageReaction,
  storage: IStorage,
  isAdd: boolean
): Promise<void> {
  try {
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        console.error('[Starboard] Failed to fetch partial reaction:', error);
        return;
      }
    }

    const message = reaction.message;
    if (!message.guild) return;

    const settings = await storage.getBotSettings(message.guild.id);
    if (!settings?.starboardEnabled || !settings.starboardChannelId) return;

    const starEmoji = settings.starboardEmoji || '⭐';
    const threshold = settings.starboardThreshold || 3;

    if (reaction.emoji.name !== starEmoji && reaction.emoji.toString() !== starEmoji) return;

    const starCount = reaction.count || 0;
    const existingStarred = await storage.getStarredMessage(message.guild.id, message.id);

    if (starCount >= threshold && !existingStarred) {
      const starboardChannel = message.guild.channels.cache.get(settings.starboardChannelId) as TextChannel;
      if (!starboardChannel || !starboardChannel.isTextBased()) {
        console.log('[Starboard] Starboard channel not found or not text-based');
        return;
      }

      const fullMessage = await message.fetch();
      const embed = new EmbedBuilder()
        .setAuthor({ 
          name: fullMessage.author?.tag || 'Unknown User',
          iconURL: fullMessage.author?.displayAvatarURL()
        })
        .setDescription(fullMessage.content || '*No text content*')
        .addFields({ name: 'Source', value: `[Jump to message](${fullMessage.url})` })
        .setColor('#FFD700')
        .setFooter({ text: `${starEmoji} ${starCount} | #${(fullMessage.channel as TextChannel).name || 'unknown'}` })
        .setTimestamp(fullMessage.createdAt);

      if (fullMessage.attachments.size > 0) {
        const firstAttachment = fullMessage.attachments.first();
        if (firstAttachment && firstAttachment.contentType?.startsWith('image/')) {
          embed.setImage(firstAttachment.url);
        }
      }

      if (fullMessage.embeds.length > 0 && fullMessage.embeds[0].image) {
        embed.setImage(fullMessage.embeds[0].image.url);
      }

      const starboardMessage = await starboardChannel.send({ embeds: [embed] });

      await storage.createStarredMessage({
        serverId: message.guild.id,
        originalMessageId: message.id,
        originalChannelId: message.channelId,
        starboardMessageId: starboardMessage.id,
        authorId: fullMessage.author?.id || 'unknown',
        starCount
      });

      console.log(`[Starboard] New starred message: ${message.id} with ${starCount} stars`);
    } else if (existingStarred) {
      if (starCount < threshold) {
        try {
          const starboardChannel = message.guild.channels.cache.get(settings.starboardChannelId) as TextChannel;
          if (starboardChannel) {
            const starboardMsg = await starboardChannel.messages.fetch(existingStarred.starboardMessageId).catch(() => null);
            if (starboardMsg) await starboardMsg.delete().catch(() => {});
          }
        } catch (error) {
          console.error('[Starboard] Failed to delete starboard message:', error);
        }
        await storage.deleteStarredMessage(message.guild.id, message.id);
        console.log(`[Starboard] Removed starred message: ${message.id} (below threshold)`);
      } else {
        await storage.updateStarredMessageCount(message.guild.id, message.id, starCount);
        
        try {
          const starboardChannel = message.guild.channels.cache.get(settings.starboardChannelId) as TextChannel;
          if (starboardChannel) {
            const starboardMsg = await starboardChannel.messages.fetch(existingStarred.starboardMessageId).catch(() => null);
            if (starboardMsg && starboardMsg.embeds.length > 0) {
              const existingEmbed = starboardMsg.embeds[0];
              const updatedEmbed = EmbedBuilder.from(existingEmbed)
                .setFooter({ text: `${starEmoji} ${starCount} | ${existingEmbed.footer?.text.split('|')[1]?.trim() || 'unknown'}` });
              await starboardMsg.edit({ embeds: [updatedEmbed] });
            }
          }
        } catch (error) {
          console.error('[Starboard] Failed to update starboard message:', error);
        }
      }
    }
  } catch (error) {
    console.error('[Starboard] Error handling reaction:', error);
  }
}

function replaceWelcomeVariables(template: string, member: GuildMember): string {
  return template
    .replace(/\{user\}/g, `<@${member.id}>`)
    .replace(/\{username\}/g, member.user.username)
    .replace(/\{server\}/g, member.guild.name)
    .replace(/\{memberCount\}/g, member.guild.memberCount.toString());
}

async function handleMemberJoin(member: GuildMember, storage: IStorage): Promise<void> {
  try {
    const settings = await storage.getBotSettings(member.guild.id);
    if (!settings) return;

    if (settings.autoRoleIds) {
      try {
        const roleIds: string[] = JSON.parse(settings.autoRoleIds);
        for (const roleId of roleIds) {
          const role = member.guild.roles.cache.get(roleId);
          if (role && role.position < (member.guild.members.me?.roles.highest.position || 0)) {
            await member.roles.add(role).catch(err => 
              console.error(`[AutoRole] Failed to add role ${roleId}:`, err)
            );
          }
        }
        console.log(`[AutoRole] Assigned ${roleIds.length} roles to ${member.user.tag}`);
      } catch (error) {
        console.error('[AutoRole] Failed to parse autoRoleIds:', error);
      }
    }

    if (settings.welcomeEnabled && settings.welcomeChannelId) {
      const channel = member.guild.channels.cache.get(settings.welcomeChannelId) as TextChannel;
      if (channel && channel.isTextBased()) {
        const template = settings.welcomeMessageTemplate || 'Welcome to {server}, {user}! You are member #{memberCount}.';
        const welcomeMessage = replaceWelcomeVariables(template, member);
        
        const embed = new EmbedBuilder()
          .setTitle('👋 Welcome!')
          .setDescription(welcomeMessage)
          .setColor('#57F287')
          .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
          .setFooter({ text: `Member #${member.guild.memberCount}` })
          .setTimestamp();
        
        await channel.send({ embeds: [embed] });
        console.log(`[Welcome] Sent welcome message for ${member.user.tag}`);
      }
    }
  } catch (error) {
    console.error('[Welcome] Error handling member join:', error);
  }
}

async function handleMemberLeave(
  member: GuildMember | PartialGuildMember, 
  storage: IStorage
): Promise<void> {
  try {
    const settings = await storage.getBotSettings(member.guild.id);
    if (!settings?.goodbyeEnabled || !settings.welcomeChannelId) return;

    const channel = member.guild.channels.cache.get(settings.welcomeChannelId) as TextChannel;
    if (!channel || !channel.isTextBased()) return;

    const template = settings.goodbyeMessageTemplate || 'Goodbye {user}, we\'ll miss you!';
    const goodbyeMessage = template
      .replace(/\{user\}/g, member.user?.username || 'Unknown User')
      .replace(/\{username\}/g, member.user?.username || 'Unknown User')
      .replace(/\{server\}/g, member.guild.name)
      .replace(/\{memberCount\}/g, member.guild.memberCount.toString());

    const embed = new EmbedBuilder()
      .setTitle('👋 Goodbye!')
      .setDescription(goodbyeMessage)
      .setColor('#ED4245')
      .setThumbnail(member.user?.displayAvatarURL({ size: 256 }) || null)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    console.log(`[Goodbye] Sent goodbye message for ${member.user?.tag || 'unknown user'}`);
  } catch (error) {
    console.error('[Goodbye] Error handling member leave:', error);
  }
}

async function handleXpMessage(message: Message, storage: IStorage): Promise<void> {
  try {
    if (message.author.bot || !message.guild) return;

    const settings = await storage.getBotSettings(message.guild.id);
    if (!settings?.xpEnabled) return;

    const cooldownSeconds = settings.xpCooldownSeconds || 60;
    const minXp = settings.xpMinAmount || 15;
    const maxXp = settings.xpMaxAmount || 25;

    let userData = await storage.getXpData(message.guild.id, message.author.id);
    
    if (userData) {
      const lastMessage = userData.lastMessageAt;
      if (lastMessage) {
        const timeSinceLastMessage = (Date.now() - new Date(lastMessage).getTime()) / 1000;
        if (timeSinceLastMessage < cooldownSeconds) {
          return;
        }
      }
    }

    const xpGained = Math.floor(Math.random() * (maxXp - minXp + 1)) + minXp;
    const oldLevel = userData?.level || 0;
    const newXp = (userData?.xp || 0) + xpGained;
    const newLevel = calculateLevel(newXp);

    if (!userData) {
      await storage.createXpData({
        serverId: message.guild.id,
        userId: message.author.id,
        username: message.author.username,
        xp: newXp,
        level: newLevel,
        lastMessageAt: new Date(),
        totalMessages: 1
      });
    } else {
      await storage.updateXpData(message.guild.id, message.author.id, {
        xp: newXp,
        level: newLevel,
        username: message.author.username,
        lastMessageAt: new Date(),
        totalMessages: (userData.totalMessages || 0) + 1
      });
    }

    if (newLevel > oldLevel) {
      await handleLevelUp(message, storage, settings, newLevel);
    }
  } catch (error) {
    console.error('[XP] Error handling message:', error);
  }
}

async function handleLevelUp(
  message: Message, 
  storage: IStorage, 
  settings: any, 
  newLevel: number
): Promise<void> {
  try {
    let announceChannel: TextChannel | null = null;
    
    if (settings.levelUpChannelId) {
      announceChannel = message.guild!.channels.cache.get(settings.levelUpChannelId) as TextChannel;
    }
    if (!announceChannel) {
      announceChannel = message.channel as TextChannel;
    }

    if (announceChannel && announceChannel.isTextBased()) {
      const template = settings.levelUpMessage || '🎉 Congratulations {user}! You\'ve reached level {level}!';
      const levelUpMessage = template
        .replace(/\{user\}/g, `<@${message.author.id}>`)
        .replace(/\{level\}/g, newLevel.toString());

      const embed = new EmbedBuilder()
        .setTitle('🎉 Level Up!')
        .setDescription(levelUpMessage)
        .setColor('#FFD700')
        .setThumbnail(message.author.displayAvatarURL())
        .setTimestamp();

      await announceChannel.send({ embeds: [embed] });
    }

    if (settings.levelRoles) {
      try {
        const levelRoles: Record<string, string> = JSON.parse(settings.levelRoles);
        const roleIdForLevel = levelRoles[newLevel.toString()];
        
        if (roleIdForLevel && message.member) {
          const role = message.guild!.roles.cache.get(roleIdForLevel);
          if (role && !message.member.roles.cache.has(roleIdForLevel)) {
            const botMember = message.guild!.members.me;
            if (botMember && role.position < botMember.roles.highest.position) {
              await message.member.roles.add(role);
              console.log(`[XP] Assigned level role ${role.name} to ${message.author.tag} for reaching level ${newLevel}`);
            }
          }
        }
      } catch (error) {
        console.error('[XP] Failed to parse levelRoles:', error);
      }
    }

    console.log(`[XP] ${message.author.tag} leveled up to level ${newLevel}`);
  } catch (error) {
    console.error('[XP] Error handling level up:', error);
  }
}

// Reaction Role handler
async function handleReactionRoleAdd(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  storage: IStorage
): Promise<void> {
  try {
    if (user.bot) return;
    
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        console.error('[ReactionRole] Failed to fetch partial reaction:', error);
        return;
      }
    }
    
    const message = reaction.message;
    if (!message.guild) return;
    
    const emoji = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;
    const reactionRole = await storage.getReactionRole(message.guild.id, message.id, emoji || '');
    
    if (!reactionRole) {
      const altEmoji = reaction.emoji.name;
      const altReactionRole = await storage.getReactionRole(message.guild.id, message.id, altEmoji || '');
      if (!altReactionRole) return;
      
      const member = await message.guild.members.fetch(user.id).catch(() => null);
      if (!member) return;
      
      await member.roles.add(altReactionRole.roleId).catch(err => 
        console.error('[ReactionRole] Failed to add role:', err)
      );
      console.log(`[ReactionRole] Added role ${altReactionRole.roleId} to ${user.id}`);
      return;
    }
    
    const member = await message.guild.members.fetch(user.id).catch(() => null);
    if (!member) return;
    
    await member.roles.add(reactionRole.roleId).catch(err => 
      console.error('[ReactionRole] Failed to add role:', err)
    );
    console.log(`[ReactionRole] Added role ${reactionRole.roleId} to ${user.id}`);
  } catch (error) {
    console.error('[ReactionRole] Error handling reaction add:', error);
  }
}

async function handleReactionRoleRemove(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  storage: IStorage
): Promise<void> {
  try {
    if (user.bot) return;
    
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        console.error('[ReactionRole] Failed to fetch partial reaction:', error);
        return;
      }
    }
    
    const message = reaction.message;
    if (!message.guild) return;
    
    const emoji = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;
    const reactionRole = await storage.getReactionRole(message.guild.id, message.id, emoji || '');
    
    if (!reactionRole) {
      const altEmoji = reaction.emoji.name;
      const altReactionRole = await storage.getReactionRole(message.guild.id, message.id, altEmoji || '');
      if (!altReactionRole) return;
      
      const member = await message.guild.members.fetch(user.id).catch(() => null);
      if (!member) return;
      
      await member.roles.remove(altReactionRole.roleId).catch(err => 
        console.error('[ReactionRole] Failed to remove role:', err)
      );
      console.log(`[ReactionRole] Removed role ${altReactionRole.roleId} from ${user.id}`);
      return;
    }
    
    const member = await message.guild.members.fetch(user.id).catch(() => null);
    if (!member) return;
    
    await member.roles.remove(reactionRole.roleId).catch(err => 
      console.error('[ReactionRole] Failed to remove role:', err)
    );
    console.log(`[ReactionRole] Removed role ${reactionRole.roleId} from ${user.id}`);
  } catch (error) {
    console.error('[ReactionRole] Error handling reaction remove:', error);
  }
}

// AFK handler
function formatAfkDuration(afkSince: Date): string {
  const diff = Date.now() - new Date(afkSince).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

async function handleAfkMessage(message: Message, storage: IStorage): Promise<void> {
  try {
    if (message.author.bot || !message.guild) return;
    
    const afkUser = await storage.getAfkUser(message.guild.id, message.author.id);
    if (afkUser) {
      await storage.removeAfkUser(message.guild.id, message.author.id);
      
      if (message.member) {
        try {
          const currentNick = message.member.displayName || message.author.username;
          if (currentNick.startsWith('[AFK]')) {
            const newNick = currentNick.replace(/^\[AFK\]\s*/, '');
            await message.member.setNickname(newNick || null).catch(() => {});
          }
        } catch (error) {
          // Bot might not have permission
        }
      }
      
      const embed = new EmbedBuilder()
        .setDescription(`👋 Welcome back, **${message.author.username}**! You were AFK for ${formatAfkDuration(afkUser.afkSince)}.`)
        .setColor('#57F287');
      
      await message.reply({ embeds: [embed] }).catch(() => {});
      console.log(`[AFK] ${message.author.username} is no longer AFK`);
    }
    
    if (message.mentions.users.size > 0) {
      for (const [userId, user] of message.mentions.users) {
        if (user.bot) continue;
        
        const mentionedAfk = await storage.getAfkUser(message.guild.id, userId);
        if (mentionedAfk) {
          const embed = new EmbedBuilder()
            .setDescription(`💤 **${mentionedAfk.username || user.username}** is AFK: ${mentionedAfk.reason || 'No reason provided'}\n*Since ${formatAfkDuration(mentionedAfk.afkSince)} ago*`)
            .setColor('#FFA500');
          
          await message.reply({ embeds: [embed] }).catch(() => {});
        }
      }
    }
  } catch (error) {
    console.error('[AFK] Error handling message:', error);
  }
}

// Giveaway scheduled job
let giveawayCheckInterval: NodeJS.Timeout | null = null;

async function checkEndedGiveaways(client: Client, storage: IStorage): Promise<void> {
  try {
    const endedGiveaways = await storage.getEndedGiveaways();
    
    for (const giveaway of endedGiveaways) {
      try {
        const winners = await pickGiveawayWinners(client, giveaway);
        await storage.endGiveaway(giveaway.id, winners);
        await announceGiveawayWinners(client, giveaway, winners);
        console.log(`[Giveaway] Auto-ended: ${giveaway.prize}, winners: ${winners.join(', ') || 'none'}`);
      } catch (error) {
        console.error(`[Giveaway] Error ending giveaway ${giveaway.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[Giveaway] Error checking ended giveaways:', error);
  }
}

export function initializeCommunityFeatures(client: Client, storage: IStorage): void {
  console.log('[Community] Initializing community features (Starboard, Welcome, XP, ReactionRoles, AFK, Giveaways)...');

  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    await handleStarboardReaction(reaction, storage, true);
    await handleReactionRoleAdd(reaction, user, storage);
  });

  client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (user.bot) return;
    await handleStarboardReaction(reaction, storage, false);
    await handleReactionRoleRemove(reaction, user, storage);
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    await handleMemberJoin(member, storage);
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    await handleMemberLeave(member, storage);
  });

  client.on(Events.MessageCreate, async (message) => {
    await handleXpMessage(message, storage);
    await handleAfkMessage(message, storage);
  });

  // Start giveaway check interval (every 15 seconds)
  if (giveawayCheckInterval) {
    clearInterval(giveawayCheckInterval);
  }
  giveawayCheckInterval = setInterval(() => {
    checkEndedGiveaways(client, storage);
  }, 15000);
  
  // Initial check for any giveaways that ended while bot was offline
  setTimeout(() => {
    checkEndedGiveaways(client, storage);
  }, 5000);

  console.log('[Community] Community features initialized successfully (including ReactionRoles, AFK, Giveaways)');
}

export { replaceWelcomeVariables };
