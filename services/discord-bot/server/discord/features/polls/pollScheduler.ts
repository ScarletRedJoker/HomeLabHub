import { Client, TextChannel } from 'discord.js';
import { IStorage } from '../../../storage';
import { createPollEmbed } from './pollService';

let pollSchedulerInterval: NodeJS.Timeout | null = null;
const CHECK_INTERVAL_MS = 30000;

export async function checkAndEndExpiredPolls(
  client: Client,
  storage: IStorage
): Promise<void> {
  try {
    const expiredPolls = await storage.getExpiredPolls();
    
    for (const poll of expiredPolls) {
      try {
        console.log(`[Polls] Ending expired poll ${poll.id} in server ${poll.serverId}`);
        
        const updatedPoll = await storage.updatePoll(poll.id, { ended: true });
        
        if (poll.messageId && updatedPoll) {
          try {
            const channel = await client.channels.fetch(poll.channelId) as TextChannel;
            if (channel?.isTextBased()) {
              const message = await channel.messages.fetch(poll.messageId);
              if (message) {
                const embed = createPollEmbed(updatedPoll, true);
                await message.edit({ embeds: [embed], components: [] });
                console.log(`[Polls] Updated message for ended poll ${poll.id}`);
              }
            }
          } catch (error) {
            console.error(`[Polls] Failed to update message for poll ${poll.id}:`, error);
          }
        }
      } catch (error) {
        console.error(`[Polls] Error ending poll ${poll.id}:`, error);
      }
    }
    
    if (expiredPolls.length > 0) {
      console.log(`[Polls] Ended ${expiredPolls.length} expired poll(s)`);
    }
  } catch (error) {
    console.error('[Polls] Error in poll scheduler:', error);
  }
}

export function startPollScheduler(client: Client, storage: IStorage): void {
  if (pollSchedulerInterval) {
    console.log('[Polls] Poll scheduler already running');
    return;
  }

  console.log(`[Polls] Starting poll scheduler (checking every ${CHECK_INTERVAL_MS / 1000}s)`);
  
  checkAndEndExpiredPolls(client, storage);
  
  pollSchedulerInterval = setInterval(() => {
    checkAndEndExpiredPolls(client, storage);
  }, CHECK_INTERVAL_MS);
}

export function stopPollScheduler(): void {
  if (pollSchedulerInterval) {
    clearInterval(pollSchedulerInterval);
    pollSchedulerInterval = null;
    console.log('[Polls] Poll scheduler stopped');
  }
}
