import { 
  ButtonInteraction, 
  StringSelectMenuInteraction, 
  Client,
  MessageComponentInteraction
} from 'discord.js';
import { IStorage } from '../../../storage';
import { 
  recordVote, 
  clearUserVotes, 
  createPollEmbed, 
  createPollButtons,
  parsePollOptions,
  getUserVotes,
  parsePollVotes,
  parseAllowedRoles,
  checkUserHasAllowedRole
} from './pollService';

export async function handlePollButtonInteraction(
  interaction: ButtonInteraction,
  storage: IStorage,
  client: Client
): Promise<boolean> {
  const customId = interaction.customId;
  
  if (!customId.startsWith('poll_')) {
    return false;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    if (customId.startsWith('poll_vote_')) {
      const parts = customId.split('_');
      const pollId = parseInt(parts[2], 10);
      const optionIndex = parseInt(parts[3], 10);
      
      const poll = await storage.getPoll(pollId);
      if (!poll) {
        await interaction.editReply({ content: '❌ Poll not found.' });
        return true;
      }

      if (poll.ended) {
        await interaction.editReply({ content: '❌ This poll has ended.' });
        return true;
      }

      const allowedRoles = parseAllowedRoles(poll);
      if (allowedRoles.length > 0 && interaction.member) {
        const memberRoles = (interaction.member.roles as any).cache?.map((r: any) => r.id) || [];
        if (!checkUserHasAllowedRole(allowedRoles, memberRoles)) {
          await interaction.editReply({ content: '❌ You do not have the required role to vote in this poll.' });
          return true;
        }
      }

      const options = parsePollOptions(poll.options);
      const votes = parsePollVotes(poll.votes);
      const currentVotes = getUserVotes(votes, interaction.user.id);

      let newVotes: number[];
      
      if (poll.pollType === 'single') {
        newVotes = [optionIndex];
      } else {
        if (currentVotes.includes(optionIndex)) {
          newVotes = currentVotes.filter(v => v !== optionIndex);
          if (newVotes.length === 0) {
            await interaction.editReply({ content: '❌ You must have at least one vote. Use "Clear My Votes" to remove all votes.' });
            return true;
          }
        } else {
          if (currentVotes.length >= (poll.maxChoices || options.length)) {
            await interaction.editReply({ content: `❌ You can only select up to ${poll.maxChoices} options. Remove one first or use "Clear My Votes".` });
            return true;
          }
          newVotes = [...currentVotes, optionIndex];
        }
      }

      const result = await recordVote(
        storage,
        poll,
        interaction.user.id,
        interaction.user.username,
        newVotes
      );

      if (!result.success) {
        await interaction.editReply({ content: `❌ ${result.message}` });
        return true;
      }

      await updateOriginalMessage(interaction, result.poll, storage);
      await interaction.editReply({ content: `✅ ${result.message}` });
      
    } else if (customId.startsWith('poll_results_')) {
      const pollId = parseInt(customId.split('_')[2], 10);
      
      const poll = await storage.getPoll(pollId);
      if (!poll) {
        await interaction.editReply({ content: '❌ Poll not found.' });
        return true;
      }

      const embed = createPollEmbed(poll, true);
      await interaction.editReply({ embeds: [embed] });
      
    } else if (customId.startsWith('poll_clear_')) {
      const pollId = parseInt(customId.split('_')[2], 10);
      
      const poll = await storage.getPoll(pollId);
      if (!poll) {
        await interaction.editReply({ content: '❌ Poll not found.' });
        return true;
      }

      if (poll.ended) {
        await interaction.editReply({ content: '❌ This poll has ended.' });
        return true;
      }

      const allowedRolesForClear = parseAllowedRoles(poll);
      if (allowedRolesForClear.length > 0 && interaction.member) {
        const memberRolesForClear = (interaction.member.roles as any).cache?.map((r: any) => r.id) || [];
        if (!checkUserHasAllowedRole(allowedRolesForClear, memberRolesForClear)) {
          await interaction.editReply({ content: '❌ You do not have the required role to interact with this poll.' });
          return true;
        }
      }

      const result = await clearUserVotes(storage, poll, interaction.user.id);
      
      if (!result.success) {
        await interaction.editReply({ content: `❌ ${result.message}` });
        return true;
      }

      await updateOriginalMessage(interaction, result.poll, storage);
      await interaction.editReply({ content: `✅ ${result.message}` });
    }

    return true;
  } catch (error) {
    console.error('[Polls] Error handling button interaction:', error);
    await interaction.editReply({ content: '❌ An error occurred while processing your vote.' }).catch(() => {});
    return true;
  }
}

export async function handlePollSelectMenuInteraction(
  interaction: StringSelectMenuInteraction,
  storage: IStorage,
  client: Client
): Promise<boolean> {
  const customId = interaction.customId;
  
  if (!customId.startsWith('poll_select_')) {
    return false;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const pollId = parseInt(customId.split('_')[2], 10);
    const selectedIndices = interaction.values.map(v => parseInt(v, 10));
    
    const poll = await storage.getPoll(pollId);
    if (!poll) {
      await interaction.editReply({ content: '❌ Poll not found.' });
      return true;
    }

    if (poll.ended) {
      await interaction.editReply({ content: '❌ This poll has ended.' });
      return true;
    }

    const allowedRolesSelect = parseAllowedRoles(poll);
    if (allowedRolesSelect.length > 0 && interaction.member) {
      const memberRolesSelect = (interaction.member.roles as any).cache?.map((r: any) => r.id) || [];
      if (!checkUserHasAllowedRole(allowedRolesSelect, memberRolesSelect)) {
        await interaction.editReply({ content: '❌ You do not have the required role to vote in this poll.' });
        return true;
      }
    }

    const result = await recordVote(
      storage,
      poll,
      interaction.user.id,
      interaction.user.username,
      selectedIndices
    );

    if (!result.success) {
      await interaction.editReply({ content: `❌ ${result.message}` });
      return true;
    }

    await updateOriginalMessage(interaction, result.poll, storage);
    await interaction.editReply({ content: `✅ ${result.message}` });
    
    return true;
  } catch (error) {
    console.error('[Polls] Error handling select menu interaction:', error);
    await interaction.editReply({ content: '❌ An error occurred while processing your vote.' }).catch(() => {});
    return true;
  }
}

async function updateOriginalMessage(
  interaction: MessageComponentInteraction,
  poll: any,
  storage: IStorage
): Promise<void> {
  try {
    const freshPoll = await storage.getPoll(poll.id);
    if (!freshPoll) return;
    
    const embed = createPollEmbed(freshPoll, false);
    const components = freshPoll.ended ? [] : createPollButtons(freshPoll);
    
    await interaction.message.edit({ embeds: [embed], components });
  } catch (error) {
    console.error('[Polls] Error updating poll message:', error);
  }
}

export function initializePollComponentHandlers(
  client: Client,
  storage: IStorage
): void {
  console.log('[Polls] Poll component handlers initialized');
}
