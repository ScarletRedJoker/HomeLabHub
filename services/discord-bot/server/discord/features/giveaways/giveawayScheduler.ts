import { Client, TextChannel } from 'discord.js';
import { IStorage } from '../../../storage';
import { createGiveawayEmbed, endGiveaway, announceWinners } from './giveawayService';

let giveawaySchedulerInterval: NodeJS.Timeout | null = null;
const CHECK_INTERVAL_MS = 30000;

export async function checkAndEndExpiredGiveaways(
  client: Client,
  storage: IStorage
): Promise<void> {
  try {
    const expiredGiveaways = await storage.getEndedGiveaways();
    
    for (const giveaway of expiredGiveaways) {
      try {
        console.log(`[Giveaways] Ending expired giveaway ${giveaway.id} in server ${giveaway.serverId}`);
        
        const { giveaway: updatedGiveaway, winners } = await endGiveaway(storage, giveaway);
        
        if (giveaway.messageId) {
          try {
            const channel = await client.channels.fetch(giveaway.channelId) as TextChannel;
            if (channel?.isTextBased()) {
              const message = await channel.messages.fetch(giveaway.messageId);
              if (message) {
                const embed = createGiveawayEmbed(updatedGiveaway, true);
                await message.edit({ embeds: [embed], components: [] });
                console.log(`[Giveaways] Updated message for ended giveaway ${giveaway.id}`);
              }
            }
          } catch (error) {
            console.error(`[Giveaways] Failed to update message for giveaway ${giveaway.id}:`, error);
          }
        }
        
        await announceWinners(client, updatedGiveaway, winners);
        
      } catch (error) {
        console.error(`[Giveaways] Error ending giveaway ${giveaway.id}:`, error);
      }
    }
    
    if (expiredGiveaways.length > 0) {
      console.log(`[Giveaways] Ended ${expiredGiveaways.length} expired giveaway(s)`);
    }
  } catch (error) {
    console.error('[Giveaways] Error in giveaway scheduler:', error);
  }
}

export function startGiveawayScheduler(client: Client, storage: IStorage): void {
  if (giveawaySchedulerInterval) {
    console.log('[Giveaways] Giveaway scheduler already running');
    return;
  }

  console.log(`[Giveaways] Starting giveaway scheduler (checking every ${CHECK_INTERVAL_MS / 1000}s)`);
  
  checkAndEndExpiredGiveaways(client, storage);
  
  giveawaySchedulerInterval = setInterval(() => {
    checkAndEndExpiredGiveaways(client, storage);
  }, CHECK_INTERVAL_MS);
}

export function stopGiveawayScheduler(): void {
  if (giveawaySchedulerInterval) {
    clearInterval(giveawaySchedulerInterval);
    giveawaySchedulerInterval = null;
    console.log('[Giveaways] Giveaway scheduler stopped');
  }
}
