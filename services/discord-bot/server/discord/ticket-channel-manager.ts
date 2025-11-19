import type { Client, Guild, TextChannel, CategoryChannel, ThreadChannel, ChannelType } from 'discord.js';
import type { IStorage } from '../storage.js';
import type { Ticket, TicketCategory } from '../../shared/schema.js';

/**
 * Ticket Channel Manager
 * 
 * Manages dedicated ticket channels with smart organization:
 * 1. Creates a "Active Tickets" category for ongoing tickets
 * 2. Creates threads within category channels based on ticket type
 * 3. Archives closed tickets to a "Ticket Archive" category
 * 4. Auto-cleanup of old archived threads
 * 
 * This prevents channel overflow and keeps tickets organized.
 */

interface ChannelManagerConfig {
  serverId: string;
  client: Client;
  storage: IStorage;
}

export class TicketChannelManager {
  private config: ChannelManagerConfig;
  private activeTicketsCategoryCache = new Map<string, string>(); // serverId -> categoryId
  private archiveCategoryCache = new Map<string, string>(); // serverId -> categoryId
  private ticketChannelCache = new Map<string, Map<number, string>>(); // serverId -> Map<categoryId, channelId>

  constructor(config: ChannelManagerConfig) {
    this.config = config;
  }

  /**
   * Get or create the "Active Tickets" category for a server
   */
  private async getOrCreateActiveTicketsCategory(guild: Guild): Promise<CategoryChannel | null> {
    try {
      // Check cache first
      const cachedId = this.activeTicketsCategoryCache.get(guild.id);
      if (cachedId) {
        const channel = guild.channels.cache.get(cachedId);
        if (channel && channel.type === 4) { // CategoryChannel type
          return channel as CategoryChannel;
        }
      }

      // Search for existing "Active Tickets" category
      const existingCategory = guild.channels.cache.find(
        (ch) => ch.name === '🎫 Active Tickets' && ch.type === 4
      ) as CategoryChannel | undefined;

      if (existingCategory) {
        this.activeTicketsCategoryCache.set(guild.id, existingCategory.id);
        return existingCategory;
      }

      // Create new category
      const newCategory = await guild.channels.create({
        name: '🎫 Active Tickets',
        type: 4, // CategoryChannel
        reason: 'Ticket system category for active support tickets',
      });

      this.activeTicketsCategoryCache.set(guild.id, newCategory.id);
      console.log(`[TicketChannelManager] Created "Active Tickets" category in ${guild.name}`);
      return newCategory;
    } catch (error) {
      console.error('[TicketChannelManager] Failed to create Active Tickets category:', error);
      return null;
    }
  }

  /**
   * Get or create the "Ticket Archive" category for closed tickets
   */
  private async getOrCreateArchiveCategory(guild: Guild): Promise<CategoryChannel | null> {
    try {
      // Check cache first
      const cachedId = this.archiveCategoryCache.get(guild.id);
      if (cachedId) {
        const channel = guild.channels.cache.get(cachedId);
        if (channel && channel.type === 4) {
          return channel as CategoryChannel;
        }
      }

      // Search for existing "Ticket Archive" category
      const existingCategory = guild.channels.cache.find(
        (ch) => ch.name === '📦 Ticket Archive' && ch.type === 4
      ) as CategoryChannel | undefined;

      if (existingCategory) {
        this.archiveCategoryCache.set(guild.id, existingCategory.id);
        return existingCategory;
      }

      // Create new category
      const newCategory = await guild.channels.create({
        name: '📦 Ticket Archive',
        type: 4,
        reason: 'Ticket system category for archived/closed tickets',
      });

      this.archiveCategoryCache.set(guild.id, newCategory.id);
      console.log(`[TicketChannelManager] Created "Ticket Archive" category in ${guild.name}`);
      return newCategory;
    } catch (error) {
      console.error('[TicketChannelManager] Failed to create Archive category:', error);
      return null;
    }
  }

  /**
   * Get or create a dedicated channel for a specific ticket category
   * This creates separate channels like "#support-tickets", "#bug-reports", etc.
   */
  private async getOrCreateCategoryChannel(
    guild: Guild,
    category: TicketCategory,
    parentCategory: CategoryChannel
  ): Promise<TextChannel | null> {
    try {
      // Check cache
      let serverCache = this.ticketChannelCache.get(guild.id);
      if (!serverCache) {
        serverCache = new Map();
        this.ticketChannelCache.set(guild.id, serverCache);
      }

      const cachedChannelId = serverCache.get(category.id);
      if (cachedChannelId) {
        const channel = guild.channels.cache.get(cachedChannelId);
        if (channel && channel.isTextBased()) {
          return channel as TextChannel;
        }
      }

      // Generate channel name from category (e.g., "General Support" -> "general-support")
      const channelName = category.name.toLowerCase().replace(/\s+/g, '-');

      // Search for existing channel
      const existingChannel = guild.channels.cache.find(
        (ch) => 
          ch.name === channelName && 
          ch.isTextBased() && 
          ch.parentId === parentCategory.id
      ) as TextChannel | undefined;

      if (existingChannel) {
        serverCache.set(category.id, existingChannel.id);
        return existingChannel;
      }

      // Create new channel
      const newChannel = await guild.channels.create({
        name: channelName,
        type: 0, // Text channel
        parent: parentCategory.id,
        topic: `${category.emoji || '🎫'} ${category.name} - Support ticket threads`,
        reason: `Ticket category channel for ${category.name}`,
      });

      serverCache.set(category.id, newChannel.id);
      console.log(`[TicketChannelManager] Created channel "${channelName}" for category ${category.name}`);
      return newChannel as TextChannel;
    } catch (error) {
      console.error(`[TicketChannelManager] Failed to create category channel:`, error);
      return null;
    }
  }

  /**
   * Create a ticket thread in the appropriate channel
   * 
   * Strategy:
   * 1. Get/create "Active Tickets" category
   * 2. Get/create dedicated channel for ticket type (e.g., #general-support)
   * 3. Create thread within that channel
   */
  async createTicketThread(
    ticket: Ticket,
    category: TicketCategory | null,
    creatorDiscordId: string,
    creatorUsername: string
  ): Promise<string | null> {
    try {
      const guild = this.config.client.guilds.cache.get(this.config.serverId);
      if (!guild) {
        console.error(`[TicketChannelManager] Guild ${this.config.serverId} not found`);
        return null;
      }

      // Get or create Active Tickets category
      const activeCategory = await this.getOrCreateActiveTicketsCategory(guild);
      if (!activeCategory) {
        console.error('[TicketChannelManager] Failed to get/create Active Tickets category');
        return null;
      }

      // Get or create dedicated channel for this ticket type
      let targetChannel: TextChannel | null = null;
      
      if (category) {
        targetChannel = await this.getOrCreateCategoryChannel(guild, category, activeCategory);
      }

      // Fallback to admin notification channel if category channel creation failed
      if (!targetChannel) {
        const settings = await this.config.storage.getBotSettings(this.config.serverId);
        if (settings?.adminChannelId) {
          const channel = guild.channels.cache.get(settings.adminChannelId);
          if (channel && channel.isTextBased() && 'threads' in channel) {
            targetChannel = channel as TextChannel;
            console.log(`[TicketChannelManager] Using fallback admin channel: ${channel.name}`);
          }
        }
      }

      if (!targetChannel) {
        console.error('[TicketChannelManager] No valid channel found for ticket thread');
        return null;
      }

      // Create the thread
      const ticketThread = await targetChannel.threads.create({
        name: `🎫 Ticket #${ticket.id}: ${ticket.title.substring(0, 80)}`,
        autoArchiveDuration: 10080, // 7 days
        reason: `Support ticket created by ${creatorUsername}`,
      });

      console.log(`[TicketChannelManager] ✅ Created thread ${ticketThread.id} in channel ${targetChannel.name} for ticket #${ticket.id}`);
      return ticketThread.id;
    } catch (error) {
      console.error('[TicketChannelManager] Failed to create ticket thread:', error);
      return null;
    }
  }

  /**
   * Archive a ticket thread (move to archive category)
   * This keeps the ticket data but removes clutter from active channels
   */
  async archiveTicket(threadId: string): Promise<boolean> {
    try {
      const guild = this.config.client.guilds.cache.get(this.config.serverId);
      if (!guild) return false;

      const thread = await this.config.client.channels.fetch(threadId) as ThreadChannel;
      if (!thread || !thread.isThread()) {
        console.error(`[TicketChannelManager] Thread ${threadId} not found`);
        return false;
      }

      // Archive the thread
      if (!thread.archived) {
        await thread.setArchived(true, 'Ticket closed - moving to archive');
      }

      // Lock the thread to prevent further messages
      if (!thread.locked) {
        await thread.setLocked(true, 'Ticket archived');
      }

      console.log(`[TicketChannelManager] ✅ Archived thread ${threadId}`);
      return true;
    } catch (error) {
      console.error('[TicketChannelManager] Failed to archive ticket:', error);
      return false;
    }
  }

  /**
   * Reopen an archived ticket thread
   * Unarchives and unlocks the thread for continued discussion
   */
  async reopenTicket(threadId: string): Promise<boolean> {
    try {
      const guild = this.config.client.guilds.cache.get(this.config.serverId);
      if (!guild) return false;

      const thread = await this.config.client.channels.fetch(threadId) as ThreadChannel;
      if (!thread || !thread.isThread()) {
        console.error(`[TicketChannelManager] Thread ${threadId} not found`);
        return false;
      }

      // Unarchive the thread
      if (thread.archived) {
        await thread.setArchived(false, 'Ticket reopened');
      }

      // Unlock the thread to allow messages
      if (thread.locked) {
        await thread.setLocked(false, 'Ticket reopened');
      }

      console.log(`[TicketChannelManager] ✅ Reopened thread ${threadId}`);
      return true;
    } catch (error) {
      console.error('[TicketChannelManager] Failed to reopen ticket:', error);
      return false;
    }
  }

  /**
   * Cache the channel structure on bot startup
   * Populates the category and channel caches for faster lookups
   */
  async cacheChannelStructure(): Promise<void> {
    try {
      const guild = this.config.client.guilds.cache.get(this.config.serverId);
      if (!guild) {
        console.error(`[TicketChannelManager] Guild ${this.config.serverId} not found`);
        return;
      }

      console.log('[TicketChannelManager] Caching channel structure...');

      // Cache Active Tickets category
      const activeCategory = guild.channels.cache.find(
        (ch) => ch.name === '🎫 Active Tickets' && ch.type === 4
      );
      if (activeCategory) {
        this.activeTicketsCategoryCache.set(guild.id, activeCategory.id);
        console.log(`[TicketChannelManager] Cached Active Tickets category: ${activeCategory.id}`);
      }

      // Cache Archive category
      const archiveCategory = guild.channels.cache.find(
        (ch) => ch.name === '📦 Ticket Archive' && ch.type === 4
      );
      if (archiveCategory) {
        this.archiveCategoryCache.set(guild.id, archiveCategory.id);
        console.log(`[TicketChannelManager] Cached Archive category: ${archiveCategory.id}`);
      }

      // Cache ticket category channels
      const allCategories = await this.config.storage.getAllTicketCategories(this.config.serverId);
      let cachedChannels = 0;
      
      for (const category of allCategories) {
        const channelName = category.name.toLowerCase().replace(/\s+/g, '-');
        const channel = guild.channels.cache.find(
          (ch) => ch.name === channelName && ch.isTextBased() && 
          (ch.parentId === activeCategory?.id || ch.parentId === archiveCategory?.id)
        );
        
        if (channel) {
          let serverCache = this.ticketChannelCache.get(guild.id);
          if (!serverCache) {
            serverCache = new Map();
            this.ticketChannelCache.set(guild.id, serverCache);
          }
          serverCache.set(category.id, channel.id);
          cachedChannels++;
        }
      }

      console.log(`[TicketChannelManager] ✅ Cached ${cachedChannels} ticket category channels`);
    } catch (error) {
      console.error('[TicketChannelManager] Failed to cache channel structure:', error);
    }
  }

  /**
   * Cleanup old archived threads (older than 30 days)
   * This should be run periodically to prevent Discord thread limit issues
   */
  async cleanupOldArchivedThreads(daysOld: number = 30): Promise<number> {
    try {
      const guild = this.config.client.guilds.cache.get(this.config.serverId);
      if (!guild) return 0;

      const archiveCategory = await this.getOrCreateArchiveCategory(guild);
      if (!archiveCategory) return 0;

      let deletedCount = 0;
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

      // Get all channels in archive category
      const archiveChannels = guild.channels.cache.filter(
        (ch) => ch.parentId === archiveCategory.id && ch.isTextBased()
      );

      for (const [, channel] of archiveChannels) {
        if (!('threads' in channel)) continue;
        
        const textChannel = channel as TextChannel;
        
        // Fetch archived threads
        const archivedThreads = await textChannel.threads.fetchArchived();
        
        for (const [, thread] of archivedThreads.threads) {
          // Check if thread is old enough
          if (thread.archiveTimestamp && new Date(thread.archiveTimestamp) < cutoffDate) {
            try {
              // Delete the thread
              await thread.delete('Cleanup: Thread archived for more than 30 days');
              deletedCount++;
              console.log(`[TicketChannelManager] Deleted old archived thread: ${thread.name}`);
            } catch (error) {
              console.error(`[TicketChannelManager] Failed to delete thread ${thread.id}:`, error);
            }
          }
        }
      }

      console.log(`[TicketChannelManager] ✅ Cleanup complete: Deleted ${deletedCount} old archived threads`);
      return deletedCount;
    } catch (error) {
      console.error('[TicketChannelManager] Failed to cleanup old threads:', error);
      return 0;
    }
  }

  /**
   * Get stats about ticket organization
   */
  async getChannelStats(): Promise<{
    activeThreads: number;
    archivedThreads: number;
    categoriesUsed: number;
  }> {
    try {
      const guild = this.config.client.guilds.cache.get(this.config.serverId);
      if (!guild) {
        return { activeThreads: 0, archivedThreads: 0, categoriesUsed: 0 };
      }

      let activeThreads = 0;
      let archivedThreads = 0;

      const activeCategory = this.activeTicketsCategoryCache.get(guild.id);
      const archiveCategory = this.archiveCategoryCache.get(guild.id);

      // Count active threads
      if (activeCategory) {
        const activeChannels = guild.channels.cache.filter(
          (ch) => ch.parentId === activeCategory && ch.isTextBased()
        );

        for (const [, channel] of activeChannels) {
          if ('threads' in channel) {
            const textChannel = channel as TextChannel;
            const threads = await textChannel.threads.fetchActive();
            activeThreads += threads.threads.size;
          }
        }
      }

      // Count archived threads
      if (archiveCategory) {
        const archiveChannels = guild.channels.cache.filter(
          (ch) => ch.parentId === archiveCategory && ch.isTextBased()
        );

        for (const [, channel] of archiveChannels) {
          if ('threads' in channel) {
            const textChannel = channel as TextChannel;
            const threads = await textChannel.threads.fetchArchived();
            archivedThreads += threads.threads.size;
          }
        }
      }

      const categoriesUsed = this.ticketChannelCache.get(guild.id)?.size || 0;

      return { activeThreads, archivedThreads, categoriesUsed };
    } catch (error) {
      console.error('[TicketChannelManager] Failed to get channel stats:', error);
      return { activeThreads: 0, archivedThreads: 0, categoriesUsed: 0 };
    }
  }
}

/**
 * Background job to cleanup old archived threads
 * Runs daily
 */
export function startThreadCleanupJob(manager: TicketChannelManager): NodeJS.Timeout {
  const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

  const interval = setInterval(async () => {
    console.log('[TicketChannelManager] Running scheduled thread cleanup...');
    const deleted = await manager.cleanupOldArchivedThreads(30);
    console.log(`[TicketChannelManager] Cleanup complete: ${deleted} threads deleted`);
  }, CLEANUP_INTERVAL);

  console.log('[TicketChannelManager] Scheduled daily thread cleanup job');
  return interval;
}
