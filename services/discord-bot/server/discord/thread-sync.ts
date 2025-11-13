import { Client, ThreadChannel, Message, ChannelType } from 'discord.js';
import { IStorage } from '../storage';
import type { InsertTicketMessage, InsertThreadMapping } from '@shared/schema';

// Metadata keys for tracking message origin to prevent echo loops
const MESSAGE_ORIGIN_KEY = 'sync_origin';
const ORIGIN_DISCORD = 'discord';
const ORIGIN_DASHBOARD = 'dashboard';

export interface ThreadSyncService {
  storage: IStorage;
  client: Client;
  broadcast: (data: any) => void;
}

/**
 * Syncs a Discord thread message to the dashboard
 * Saves the message to ticket_messages and broadcasts it via WebSocket
 */
export async function syncThreadMessageToDashboard(
  service: ThreadSyncService,
  thread: ThreadChannel,
  message: Message
): Promise<void> {
  try {
    console.log(`[Thread Sync] Syncing message from Discord thread ${thread.id} to dashboard`);

    // Check if message has origin metadata indicating it came from dashboard
    // This prevents infinite loops
    if (message.content.includes(`[${MESSAGE_ORIGIN_KEY}:${ORIGIN_DASHBOARD}]`)) {
      console.log(`[Thread Sync] Skipping dashboard-originated message to prevent echo loop`);
      return;
    }

    // Get thread mapping to find associated ticket
    const mapping = await service.storage.getThreadMapping(thread.id);
    if (!mapping) {
      console.log(`[Thread Sync] No mapping found for thread ${thread.id}, skipping sync`);
      return;
    }

    // Check if sync is enabled for this mapping
    if (!mapping.syncEnabled) {
      console.log(`[Thread Sync] Sync disabled for thread ${thread.id}, skipping`);
      return;
    }

    // Check bot settings to ensure bidirectional sync is enabled
    const botSettings = await service.storage.getBotSettings(mapping.serverId);
    if (!botSettings?.threadBidirectionalSync) {
      console.log(`[Thread Sync] Bidirectional sync disabled for server ${mapping.serverId}`);
      return;
    }

    // Skip bot messages to avoid syncing system messages
    if (message.author.bot) {
      console.log(`[Thread Sync] Skipping bot message`);
      return;
    }

    // Create ticket message with origin tracking
    const ticketMessage: InsertTicketMessage = {
      ticketId: mapping.ticketId,
      senderId: message.author.id,
      senderUsername: message.author.username,
      content: message.content || '[Empty message]'
    };

    const createdMessage = await service.storage.createTicketMessage(ticketMessage);
    console.log(`[Thread Sync] Created ticket message ${createdMessage.id} for ticket ${mapping.ticketId}`);

    // Update last synced timestamp
    await service.storage.updateThreadMapping(thread.id, {
      lastSyncedAt: new Date()
    });

    // Broadcast to connected dashboard clients
    service.broadcast({
      type: 'ticket_message',
      ticketId: mapping.ticketId,
      message: createdMessage
    });

    console.log(`[Thread Sync] Successfully synced message to dashboard and broadcast to clients`);
  } catch (error) {
    console.error(`[Thread Sync] Error syncing thread message to dashboard:`, error);
    throw error;
  }
}

/**
 * Syncs a dashboard message to the Discord thread
 * Posts the message to the thread with origin tracking to prevent loops
 */
export async function syncDashboardMessageToThread(
  service: ThreadSyncService,
  ticketId: number,
  messageContent: string,
  senderUsername: string
): Promise<void> {
  try {
    console.log(`[Thread Sync] Syncing message from dashboard ticket ${ticketId} to Discord thread`);

    // Get thread mapping for this ticket
    const mapping = await service.storage.getThreadMappingByTicket(ticketId);
    if (!mapping) {
      console.log(`[Thread Sync] No thread mapping found for ticket ${ticketId}, skipping sync`);
      return;
    }

    // Check if sync is enabled for this mapping
    if (!mapping.syncEnabled) {
      console.log(`[Thread Sync] Sync disabled for ticket ${ticketId}, skipping`);
      return;
    }

    // Check bot settings to ensure bidirectional sync is enabled
    const botSettings = await service.storage.getBotSettings(mapping.serverId);
    if (!botSettings?.threadBidirectionalSync) {
      console.log(`[Thread Sync] Bidirectional sync disabled for server ${mapping.serverId}`);
      return;
    }

    // Get the thread from Discord
    const thread = await service.client.channels.fetch(mapping.threadId) as ThreadChannel;
    if (!thread || thread.type !== ChannelType.PublicThread && thread.type !== ChannelType.PrivateThread) {
      console.error(`[Thread Sync] Thread ${mapping.threadId} not found or is not a thread`);
      return;
    }

    // Check if thread is archived
    if (thread.archived) {
      console.log(`[Thread Sync] Thread ${mapping.threadId} is archived, unarchiving to send message`);
      await thread.setArchived(false);
    }

    // Format message with sender info and origin tracking (hidden)
    // The origin marker helps prevent echo loops
    const formattedMessage = `**${senderUsername}** (via Dashboard):\n${messageContent}\n\u200b[${MESSAGE_ORIGIN_KEY}:${ORIGIN_DASHBOARD}]`;

    // Send message to thread
    await thread.send(formattedMessage);
    console.log(`[Thread Sync] Successfully sent message to thread ${mapping.threadId}`);

    // Update last synced timestamp
    await service.storage.updateThreadMapping(thread.id, {
      lastSyncedAt: new Date()
    });
  } catch (error) {
    console.error(`[Thread Sync] Error syncing dashboard message to thread:`, error);
    throw error;
  }
}

/**
 * Gets existing thread mapping or creates a new one
 * Helper function for thread event handlers
 */
export async function getOrCreateThreadMapping(
  service: ThreadSyncService,
  threadId: string,
  channelId: string,
  ticketId: number,
  serverId: string
): Promise<any> {
  try {
    // Check if mapping already exists
    let mapping = await service.storage.getThreadMapping(threadId);
    
    if (mapping) {
      console.log(`[Thread Sync] Found existing mapping for thread ${threadId}`);
      return mapping;
    }

    // Create new mapping
    const newMapping: InsertThreadMapping = {
      serverId,
      threadId,
      ticketId,
      channelId,
      status: 'active',
      syncEnabled: true
    };

    mapping = await service.storage.createThreadMapping(newMapping);
    console.log(`[Thread Sync] Created new thread mapping for thread ${threadId} -> ticket ${ticketId}`);
    
    return mapping;
  } catch (error) {
    console.error(`[Thread Sync] Error getting or creating thread mapping:`, error);
    throw error;
  }
}

/**
 * Updates thread status based on thread state
 */
export async function syncThreadStatusToTicket(
  service: ThreadSyncService,
  threadId: string,
  archived: boolean,
  locked: boolean
): Promise<void> {
  try {
    console.log(`[Thread Sync] Syncing thread status to ticket for thread ${threadId}`);

    const mapping = await service.storage.getThreadMapping(threadId);
    if (!mapping) {
      console.log(`[Thread Sync] No mapping found for thread ${threadId}`);
      return;
    }

    // Determine mapping status based on thread state
    let mappingStatus = 'active';
    if (locked) {
      mappingStatus = 'locked';
    } else if (archived) {
      mappingStatus = 'archived';
    }

    // Update thread mapping status
    await service.storage.updateThreadMapping(threadId, {
      status: mappingStatus
    });

    // If thread is archived or locked, close the ticket
    if (archived || locked) {
      const ticket = await service.storage.getTicket(mapping.ticketId);
      if (ticket && ticket.status === 'open') {
        await service.storage.updateTicket(mapping.ticketId, {
          status: 'resolved'
        });
        console.log(`[Thread Sync] Closed ticket ${mapping.ticketId} because thread was ${locked ? 'locked' : 'archived'}`);

        // Broadcast ticket update
        service.broadcast({
          type: 'ticket_update',
          ticketId: mapping.ticketId,
          updates: { status: 'resolved' }
        });
      }
    }
  } catch (error) {
    console.error(`[Thread Sync] Error syncing thread status to ticket:`, error);
    throw error;
  }
}

/**
 * Updates Discord thread status based on ticket status
 */
export async function syncTicketStatusToThread(
  service: ThreadSyncService,
  ticketId: number,
  status: string
): Promise<void> {
  try {
    console.log(`[Thread Sync] Syncing ticket status to thread for ticket ${ticketId}`);

    const mapping = await service.storage.getThreadMappingByTicket(ticketId);
    if (!mapping) {
      console.log(`[Thread Sync] No mapping found for ticket ${ticketId}`);
      return;
    }

    // Get the thread from Discord
    const thread = await service.client.channels.fetch(mapping.threadId) as ThreadChannel;
    if (!thread || thread.type !== ChannelType.PublicThread && thread.type !== ChannelType.PrivateThread) {
      console.error(`[Thread Sync] Thread ${mapping.threadId} not found or is not a thread`);
      return;
    }

    // If ticket is resolved/closed, archive and lock the thread
    if (status === 'resolved' || status === 'closed') {
      if (!thread.archived) {
        await thread.setArchived(true, 'Ticket marked as resolved');
        console.log(`[Thread Sync] Archived thread ${mapping.threadId} because ticket was resolved`);
      }
      
      if (!thread.locked) {
        await thread.setLocked(true, 'Ticket marked as resolved');
        console.log(`[Thread Sync] Locked thread ${mapping.threadId} because ticket was resolved`);
      }

      // Update mapping status
      await service.storage.updateThreadMapping(thread.id, {
        status: 'locked'
      });
    }
    // If ticket is reopened, unarchive the thread
    else if (status === 'open' && thread.archived) {
      await thread.setArchived(false);
      console.log(`[Thread Sync] Unarchived thread ${mapping.threadId} because ticket was reopened`);

      // Update mapping status
      await service.storage.updateThreadMapping(thread.id, {
        status: 'active'
      });
    }
  } catch (error) {
    console.error(`[Thread Sync] Error syncing ticket status to thread:`, error);
    throw error;
  }
}
