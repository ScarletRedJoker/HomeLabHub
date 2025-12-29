import { EmbedBuilder, Client, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle, GuildMember } from 'discord.js';
import { IStorage } from '../../../storage';
import { DiscordGiveaway } from '@shared/schema';

export interface GiveawayRequirements {
  minLevel?: number;
  requiredRoles?: string[];
}

export function parseRequirements(requirementsJson: string | null): GiveawayRequirements {
  if (!requirementsJson) return {};
  try {
    return JSON.parse(requirementsJson);
  } catch {
    return {};
  }
}

export function parseEntries(entriesJson: string | null): string[] {
  if (!entriesJson) return [];
  try {
    return JSON.parse(entriesJson);
  } catch {
    return [];
  }
}

export function parseWinners(winnersJson: string | null): string[] {
  if (!winnersJson) return [];
  try {
    return JSON.parse(winnersJson);
  } catch {
    return [];
  }
}

export function parseDuration(durationStr: string): number | null {
  const match = durationStr.match(/^(\d+)([smhdw])$/i);
  if (!match) return null;
  
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'w': return value * 7 * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);

  if (weeks > 0) return `${weeks} week${weeks > 1 ? 's' : ''}`;
  if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}

export function createGiveawayEmbed(giveaway: DiscordGiveaway, showWinners: boolean = false): EmbedBuilder {
  const entries = parseEntries(giveaway.entries);
  const requirements = parseRequirements(giveaway.requirements);
  const winners = parseWinners(giveaway.winners);
  
  const embed = new EmbedBuilder()
    .setTitle(`🎉 ${giveaway.prize}`)
    .setColor(giveaway.ended ? '#808080' : '#FF69B4')
    .setTimestamp();

  let description = '';
  
  if (giveaway.description) {
    description += `${giveaway.description}\n\n`;
  }

  if (giveaway.ended && showWinners) {
    if (winners.length > 0) {
      const winnerMentions = winners.map(w => `<@${w}>`).join(', ');
      description += `🏆 **Winner${winners.length > 1 ? 's' : ''}:** ${winnerMentions}\n\n`;
    } else {
      description += `❌ **No valid entries - no winner selected**\n\n`;
    }
    description += '✅ **Giveaway Ended**\n';
  } else {
    const endsAtTime = Math.floor(new Date(giveaway.endTime).getTime() / 1000);
    description += `⏰ **Ends:** <t:${endsAtTime}:R> (<t:${endsAtTime}:F>)\n`;
    description += `🎫 **Entries:** ${entries.length}\n`;
    description += `🏆 **Winners:** ${giveaway.winnerCount}\n`;
  }

  if (requirements.minLevel || (requirements.requiredRoles && requirements.requiredRoles.length > 0)) {
    description += '\n**Requirements:**\n';
    if (requirements.minLevel) {
      description += `📊 Minimum Level: ${requirements.minLevel}\n`;
    }
    if (requirements.requiredRoles && requirements.requiredRoles.length > 0) {
      const rolesMention = requirements.requiredRoles.map(r => `<@&${r}>`).join(', ');
      description += `🔐 Required Role: ${rolesMention}\n`;
    }
  }

  description += `\n👤 **Hosted by:** <@${giveaway.hostId}>`;

  embed.setDescription(description);
  embed.setFooter({ text: `Giveaway ID: ${giveaway.id}${giveaway.hostUsername ? ` • Hosted by ${giveaway.hostUsername}` : ''}` });

  return embed;
}

export function createGiveawayButton(giveaway: DiscordGiveaway): ActionRowBuilder<ButtonBuilder> {
  const entries = parseEntries(giveaway.entries);
  
  const row = new ActionRowBuilder<ButtonBuilder>();
  
  if (!giveaway.ended) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway_enter_${giveaway.id}`)
        .setLabel(`🎉 Enter (${entries.length})`)
        .setStyle(ButtonStyle.Primary)
    );
  }
  
  return row;
}

export async function checkRequirements(
  storage: IStorage,
  giveaway: DiscordGiveaway,
  member: GuildMember
): Promise<{ eligible: boolean; reason?: string }> {
  const requirements = parseRequirements(giveaway.requirements);
  
  if (requirements.minLevel && requirements.minLevel > 0) {
    const xpData = await storage.getXpData(giveaway.serverId, member.id);
    if (!xpData || xpData.level < requirements.minLevel) {
      return { 
        eligible: false, 
        reason: `You need to be at least level ${requirements.minLevel} to enter. ${xpData ? `Your level: ${xpData.level}` : 'You have no XP data.'}` 
      };
    }
  }
  
  if (requirements.requiredRoles && requirements.requiredRoles.length > 0) {
    const hasRole = requirements.requiredRoles.some(roleId => member.roles.cache.has(roleId));
    if (!hasRole) {
      return { 
        eligible: false, 
        reason: 'You do not have the required role to enter this giveaway.' 
      };
    }
  }
  
  return { eligible: true };
}

export async function enterGiveaway(
  storage: IStorage,
  giveaway: DiscordGiveaway,
  userId: string
): Promise<{ success: boolean; message: string; giveaway: DiscordGiveaway }> {
  if (giveaway.ended) {
    return { success: false, message: 'This giveaway has ended.', giveaway };
  }

  const entries = parseEntries(giveaway.entries);
  
  if (entries.includes(userId)) {
    return { success: false, message: 'You have already entered this giveaway.', giveaway };
  }

  entries.push(userId);
  
  const updatedGiveaway = await storage.updateGiveaway(giveaway.id, { 
    entries: JSON.stringify(entries) 
  });

  return { 
    success: true, 
    message: '🎉 You have entered the giveaway! Good luck!', 
    giveaway: updatedGiveaway || giveaway 
  };
}

export async function leaveGiveaway(
  storage: IStorage,
  giveaway: DiscordGiveaway,
  userId: string
): Promise<{ success: boolean; message: string; giveaway: DiscordGiveaway }> {
  if (giveaway.ended) {
    return { success: false, message: 'This giveaway has ended.', giveaway };
  }

  const entries = parseEntries(giveaway.entries);
  
  const index = entries.indexOf(userId);
  if (index === -1) {
    return { success: false, message: 'You have not entered this giveaway.', giveaway };
  }

  entries.splice(index, 1);
  
  const updatedGiveaway = await storage.updateGiveaway(giveaway.id, { 
    entries: JSON.stringify(entries) 
  });

  return { 
    success: true, 
    message: 'You have left the giveaway.', 
    giveaway: updatedGiveaway || giveaway 
  };
}

export function selectWinners(entries: string[], count: number): string[] {
  if (entries.length === 0) return [];
  if (entries.length <= count) return [...entries];
  
  const shuffled = [...entries].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export async function endGiveaway(
  storage: IStorage,
  giveaway: DiscordGiveaway
): Promise<{ giveaway: DiscordGiveaway; winners: string[] }> {
  const entries = parseEntries(giveaway.entries);
  const winners = selectWinners(entries, giveaway.winnerCount);
  
  const updatedGiveaway = await storage.endGiveaway(giveaway.id, winners);
  
  return { 
    giveaway: updatedGiveaway || giveaway, 
    winners 
  };
}

export async function rerollGiveaway(
  storage: IStorage,
  giveaway: DiscordGiveaway,
  excludeWinners: string[] = []
): Promise<{ giveaway: DiscordGiveaway; newWinners: string[] }> {
  const entries = parseEntries(giveaway.entries);
  const currentWinners = parseWinners(giveaway.winners);
  
  const allExcluded = [...new Set([...currentWinners, ...excludeWinners])];
  const eligibleEntries = entries.filter(e => !allExcluded.includes(e));
  
  const newWinners = selectWinners(eligibleEntries, giveaway.winnerCount);
  
  const updatedGiveaway = await storage.updateGiveaway(giveaway.id, { 
    winners: JSON.stringify(newWinners) 
  });
  
  return { 
    giveaway: updatedGiveaway || giveaway, 
    newWinners 
  };
}

export async function updateGiveawayMessage(client: Client, giveaway: DiscordGiveaway): Promise<void> {
  try {
    if (!giveaway.messageId) return;
    
    const channel = await client.channels.fetch(giveaway.channelId) as TextChannel;
    if (!channel?.isTextBased()) return;
    
    const message = await channel.messages.fetch(giveaway.messageId);
    if (!message) return;
    
    const embed = createGiveawayEmbed(giveaway, giveaway.ended);
    const components = giveaway.ended ? [] : [createGiveawayButton(giveaway)];
    
    await message.edit({ embeds: [embed], components });
  } catch (error) {
    console.error('[Giveaways] Error updating giveaway message:', error);
  }
}

export async function announceWinners(
  client: Client,
  giveaway: DiscordGiveaway,
  winners: string[]
): Promise<void> {
  try {
    const channel = await client.channels.fetch(giveaway.channelId) as TextChannel;
    if (!channel?.isTextBased()) return;
    
    if (winners.length === 0) {
      await channel.send({
        content: `🎉 **Giveaway Ended!**\n\n**Prize:** ${giveaway.prize}\n\n❌ No valid entries - no winner could be selected.`
      });
      return;
    }
    
    const winnerMentions = winners.map(w => `<@${w}>`).join(', ');
    
    await channel.send({
      content: `🎉 **Congratulations!** 🎉\n\n${winnerMentions}\n\nYou won **${giveaway.prize}**!\n\nHosted by <@${giveaway.hostId}>`
    });
  } catch (error) {
    console.error('[Giveaways] Error announcing winners:', error);
  }
}
