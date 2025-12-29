import { EmbedBuilder, Message, TextChannel, Client, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { IStorage } from '../../../storage';
import { Poll, PollOption, PollVotesData, PollType } from '@shared/schema';

export function generateProgressBar(percentage: number, length: number = 10): string {
  const filled = Math.round((percentage / 100) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

export function parsePollOptions(optionsJson: string): PollOption[] {
  try {
    return JSON.parse(optionsJson);
  } catch {
    return [];
  }
}

export function parsePollVotes(votesJson: string | null): PollVotesData {
  try {
    return votesJson ? JSON.parse(votesJson) : {};
  } catch {
    return {};
  }
}

export function getTotalVotes(votes: PollVotesData): number {
  let total = 0;
  for (const optionIndex in votes) {
    total += votes[optionIndex]?.length || 0;
  }
  return total;
}

export function getUniqueVoters(votes: PollVotesData): Set<string> {
  const voters = new Set<string>();
  for (const optionIndex in votes) {
    for (const odUserId of votes[optionIndex] || []) {
      voters.add(odUserId);
    }
  }
  return voters;
}

export function getUserVotes(votes: PollVotesData, odUserId: string): number[] {
  const userVotes: number[] = [];
  for (const optionIndex in votes) {
    if (votes[optionIndex]?.includes(odUserId)) {
      userVotes.push(parseInt(optionIndex, 10));
    }
  }
  return userVotes;
}

export function parseAllowedRoles(poll: Poll): string[] {
  if (!poll.allowedRoles) return [];
  try {
    return JSON.parse(poll.allowedRoles) as string[];
  } catch {
    return [];
  }
}

export function checkUserHasAllowedRole(allowedRoles: string[], userRoleIds: string[]): boolean {
  if (allowedRoles.length === 0) return true;
  return allowedRoles.some(roleId => userRoleIds.includes(roleId));
}

export function createPollEmbed(poll: Poll, showResults: boolean = false): EmbedBuilder {
  const options = parsePollOptions(poll.options);
  const votes = parsePollVotes(poll.votes);
  const totalVotes = getTotalVotes(votes);
  const uniqueVoters = getUniqueVoters(votes).size;
  
  const embed = new EmbedBuilder()
    .setTitle(`📊 ${poll.question}`)
    .setColor(poll.ended ? '#808080' : '#5865F2')
    .setTimestamp();

  const pollTypeLabel = poll.pollType === 'single' ? 'Single Choice' : 
                        poll.pollType === 'multiple' ? `Multiple Choice (max ${poll.maxChoices})` : 
                        'Ranked Choice';
  
  let description = `**Type:** ${pollTypeLabel}\n`;
  if (poll.anonymous) {
    description += '🔒 **Anonymous Voting**\n';
  }
  if (poll.allowedRoles) {
    try {
      const allowedRoleIds = JSON.parse(poll.allowedRoles) as string[];
      if (allowedRoleIds.length > 0) {
        const rolesMention = allowedRoleIds.map(id => `<@&${id}>`).join(', ');
        description += `🔐 **Required Role:** ${rolesMention}\n`;
      }
    } catch {}
  }
  if (poll.endsAt && !poll.ended) {
    const endsAtTime = Math.floor(new Date(poll.endsAt).getTime() / 1000);
    description += `⏰ **Ends:** <t:${endsAtTime}:R>\n`;
  }
  if (poll.ended) {
    description += '✅ **Poll Ended**\n';
  }
  description += '\n';

  if (showResults || poll.ended) {
    options.forEach((option, index) => {
      const optionVotes = votes[index.toString()]?.length || 0;
      const percentage = totalVotes > 0 ? Math.round((optionVotes / totalVotes) * 100) : 0;
      const progressBar = generateProgressBar(percentage);
      const emoji = option.emoji || `${index + 1}️⃣`;
      description += `${emoji} **${option.text}**\n${progressBar} ${optionVotes} votes (${percentage}%)\n\n`;
    });
    description += `\n**Total Votes:** ${totalVotes} | **Voters:** ${uniqueVoters}`;
  } else {
    options.forEach((option, index) => {
      const emoji = option.emoji || `${index + 1}️⃣`;
      description += `${emoji} ${option.text}\n`;
    });
    description += `\n**Voters:** ${uniqueVoters}`;
  }

  embed.setDescription(description);
  
  if (poll.createdByUsername) {
    embed.setFooter({ text: `Poll ID: ${poll.id} • Created by ${poll.createdByUsername}` });
  } else {
    embed.setFooter({ text: `Poll ID: ${poll.id}` });
  }

  return embed;
}

export function createPollButtons(poll: Poll): ActionRowBuilder<ButtonBuilder>[] {
  const options = parsePollOptions(poll.options);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  
  if (poll.ended) {
    return rows;
  }

  const buttonsPerRow = 5;
  for (let i = 0; i < options.length; i += buttonsPerRow) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    const rowOptions = options.slice(i, i + buttonsPerRow);
    
    rowOptions.forEach((option, index) => {
      const actualIndex = i + index;
      const label = option.text.length > 80 ? option.text.substring(0, 77) + '...' : option.text;
      const button = new ButtonBuilder()
        .setCustomId(`poll_vote_${poll.id}_${actualIndex}`)
        .setLabel(label)
        .setStyle(ButtonStyle.Primary);
      
      if (option.emoji) {
        button.setEmoji(option.emoji);
      }
      
      row.addComponents(button);
    });
    
    rows.push(row);
  }

  const actionRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`poll_results_${poll.id}`)
        .setLabel('View Results')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📊'),
      new ButtonBuilder()
        .setCustomId(`poll_clear_${poll.id}`)
        .setLabel('Clear My Votes')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
    );
  rows.push(actionRow);

  return rows;
}

export function createSelectMenu(poll: Poll): ActionRowBuilder<StringSelectMenuBuilder> | null {
  if (poll.ended) return null;
  
  const options = parsePollOptions(poll.options);
  if (options.length > 25) return null;
  
  const maxValues = poll.pollType === 'multiple' ? Math.min(poll.maxChoices || options.length, options.length) : 1;
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`poll_select_${poll.id}`)
    .setPlaceholder('Select your choice(s)')
    .setMinValues(1)
    .setMaxValues(maxValues)
    .addOptions(
      options.map((option, index) => ({
        label: option.text.length > 100 ? option.text.substring(0, 97) + '...' : option.text,
        value: index.toString(),
        emoji: option.emoji || undefined
      }))
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
}

export async function recordVote(
  storage: IStorage,
  poll: Poll,
  odUserId: string,
  odUsername: string,
  optionIndices: number[]
): Promise<{ success: boolean; message: string; poll: Poll }> {
  if (poll.ended) {
    return { success: false, message: 'This poll has ended.', poll };
  }

  const options = parsePollOptions(poll.options);
  const votes = parsePollVotes(poll.votes);
  
  for (const idx of optionIndices) {
    if (idx < 0 || idx >= options.length) {
      return { success: false, message: 'Invalid option selected.', poll };
    }
  }

  if (poll.pollType === 'single' && optionIndices.length > 1) {
    return { success: false, message: 'This poll only allows one vote.', poll };
  }

  if (poll.pollType === 'multiple' && optionIndices.length > (poll.maxChoices || options.length)) {
    return { success: false, message: `You can only select up to ${poll.maxChoices} options.`, poll };
  }

  for (const optionIndex in votes) {
    const voters = votes[optionIndex];
    if (voters) {
      const userIdx = voters.indexOf(odUserId);
      if (userIdx !== -1) {
        voters.splice(userIdx, 1);
      }
    }
  }

  for (const optionIndex of optionIndices) {
    const key = optionIndex.toString();
    if (!votes[key]) {
      votes[key] = [];
    }
    if (!votes[key].includes(odUserId)) {
      votes[key].push(odUserId);
    }
  }

  const updatedPoll = await storage.updatePoll(poll.id, { votes: JSON.stringify(votes) });
  
  if (!poll.anonymous) {
    const existingVote = await storage.getPollVoteByUser(poll.id, odUserId);
    if (existingVote) {
      await storage.deletePollVote(existingVote.id);
    }
    await storage.createPollVote({
      pollId: poll.id,
      odUserId,
      odUsername,
      optionIndices: JSON.stringify(optionIndices)
    });
  }

  const selectedOptions = optionIndices.map(i => options[i]?.text).join(', ');
  return { 
    success: true, 
    message: `Vote recorded for: ${selectedOptions}`, 
    poll: updatedPoll || poll 
  };
}

export async function clearUserVotes(
  storage: IStorage,
  poll: Poll,
  odUserId: string
): Promise<{ success: boolean; message: string; poll: Poll }> {
  if (poll.ended) {
    return { success: false, message: 'This poll has ended.', poll };
  }

  const votes = parsePollVotes(poll.votes);
  let votesCleared = false;

  for (const optionIndex in votes) {
    const voters = votes[optionIndex];
    if (voters) {
      const userIdx = voters.indexOf(odUserId);
      if (userIdx !== -1) {
        voters.splice(userIdx, 1);
        votesCleared = true;
      }
    }
  }

  if (!votesCleared) {
    return { success: false, message: 'You have not voted in this poll.', poll };
  }

  const updatedPoll = await storage.updatePoll(poll.id, { votes: JSON.stringify(votes) });
  
  const existingVote = await storage.getPollVoteByUser(poll.id, odUserId);
  if (existingVote) {
    await storage.deletePollVote(existingVote.id);
  }

  return { 
    success: true, 
    message: 'Your votes have been cleared.', 
    poll: updatedPoll || poll 
  };
}

export async function endPoll(
  storage: IStorage,
  poll: Poll
): Promise<Poll> {
  return await storage.updatePoll(poll.id, { ended: true }) || poll;
}

export async function updatePollMessage(client: Client, poll: Poll): Promise<void> {
  try {
    if (!poll.messageId) return;
    
    const channel = await client.channels.fetch(poll.channelId) as TextChannel;
    if (!channel?.isTextBased()) return;
    
    const message = await channel.messages.fetch(poll.messageId);
    if (!message) return;
    
    const embed = createPollEmbed(poll, poll.ended);
    const components = poll.ended ? [] : createPollButtons(poll);
    
    await message.edit({ embeds: [embed], components });
  } catch (error) {
    console.error('[Polls] Error updating poll message:', error);
  }
}

export function parseDuration(durationStr: string): number | null {
  const match = durationStr.match(/^(\d+)([smhd])$/i);
  if (!match) return null;
  
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}
