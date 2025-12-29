import { 
  ButtonInteraction, 
  Client,
  GuildMember
} from 'discord.js';
import { IStorage } from '../../../storage';
import { 
  enterGiveaway,
  createGiveawayEmbed,
  createGiveawayButton,
  checkRequirements,
  parseEntries
} from './giveawayService';

export async function handleGiveawayButtonInteraction(
  interaction: ButtonInteraction,
  storage: IStorage,
  client: Client
): Promise<boolean> {
  const customId = interaction.customId;
  
  if (!customId.startsWith('giveaway_')) {
    return false;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    if (customId.startsWith('giveaway_enter_')) {
      const giveawayId = parseInt(customId.split('_')[2], 10);
      
      const giveaway = await storage.getGiveawayByMessage(interaction.message.id) 
        || await storage.getGiveaway(giveawayId);
      
      if (!giveaway) {
        await interaction.editReply({ content: '❌ Giveaway not found.' });
        return true;
      }

      if (giveaway.ended) {
        await interaction.editReply({ content: '❌ This giveaway has ended.' });
        return true;
      }

      const member = interaction.member as GuildMember;
      if (!member) {
        await interaction.editReply({ content: '❌ Could not verify your membership.' });
        return true;
      }

      const { eligible, reason } = await checkRequirements(storage, giveaway, member);
      if (!eligible) {
        await interaction.editReply({ content: `❌ ${reason}` });
        return true;
      }

      const entries = parseEntries(giveaway.entries);
      if (entries.includes(interaction.user.id)) {
        await interaction.editReply({ content: '✅ You have already entered this giveaway! Good luck! 🍀' });
        return true;
      }

      const result = await enterGiveaway(storage, giveaway, interaction.user.id);

      if (!result.success) {
        await interaction.editReply({ content: `❌ ${result.message}` });
        return true;
      }

      await updateOriginalMessage(interaction, result.giveaway, storage);
      await interaction.editReply({ content: result.message });
    }

    return true;
  } catch (error) {
    console.error('[Giveaways] Error handling button interaction:', error);
    await interaction.editReply({ content: '❌ An error occurred while processing your entry.' }).catch(() => {});
    return true;
  }
}

async function updateOriginalMessage(
  interaction: ButtonInteraction,
  giveaway: any,
  storage: IStorage
): Promise<void> {
  try {
    const freshGiveaway = await storage.getGiveaway(giveaway.id);
    if (!freshGiveaway) return;
    
    const embed = createGiveawayEmbed(freshGiveaway, false);
    const components = freshGiveaway.ended ? [] : [createGiveawayButton(freshGiveaway)];
    
    await interaction.message.edit({ embeds: [embed], components });
  } catch (error) {
    console.error('[Giveaways] Error updating giveaway message:', error);
  }
}

export function initializeGiveawayComponentHandlers(
  client: Client,
  storage: IStorage
): void {
  console.log('[Giveaways] Giveaway component handlers initialized');
}
