import { Client, Guild } from 'discord.js';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import {
  guildBotProfiles,
  type GuildBotProfile,
  type InsertGuildBotProfile,
  type UpdateGuildBotProfile
} from '../../shared/schema';

interface CachedProfile {
  profile: GuildBotProfile;
  lastFetched: number;
}

class GuildIdentityService {
  private profileCache: Map<string, CachedProfile> = new Map();
  private client: Client | null = null;
  private syncQueue: Set<string> = new Set();
  private isSyncing = false;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;
  private readonly RATE_LIMIT_DELAY_MS = 1000;

  setClient(client: Client): void {
    this.client = client;
    console.log('[GuildIdentity] Discord client registered');
  }

  async getProfile(serverId: string): Promise<GuildBotProfile | null> {
    const cached = this.profileCache.get(serverId);
    if (cached && Date.now() - cached.lastFetched < this.CACHE_TTL_MS) {
      return cached.profile;
    }

    try {
      const [profile] = await db
        .select()
        .from(guildBotProfiles)
        .where(eq(guildBotProfiles.serverId, serverId))
        .limit(1);

      if (profile) {
        this.profileCache.set(serverId, {
          profile,
          lastFetched: Date.now()
        });
        return profile;
      }
      return null;
    } catch (error) {
      console.error(`[GuildIdentity] Error fetching profile for ${serverId}:`, error);
      return null;
    }
  }

  async createProfile(serverId: string, data: Partial<InsertGuildBotProfile> = {}): Promise<GuildBotProfile> {
    try {
      const [profile] = await db
        .insert(guildBotProfiles)
        .values({
          serverId,
          nickname: data.nickname || null,
          avatarUrl: data.avatarUrl || null,
          avatarAssetId: data.avatarAssetId || null,
          autoSyncEnabled: data.autoSyncEnabled ?? true
        })
        .returning();

      this.profileCache.set(serverId, {
        profile,
        lastFetched: Date.now()
      });

      console.log(`[GuildIdentity] Created profile for server ${serverId}`);
      return profile;
    } catch (error) {
      console.error(`[GuildIdentity] Error creating profile for ${serverId}:`, error);
      throw error;
    }
  }

  async updateNickname(serverId: string, nickname: string | null): Promise<GuildBotProfile | null> {
    try {
      const existingProfile = await this.getProfile(serverId);
      
      let finalProfile: GuildBotProfile;
      
      if (!existingProfile) {
        finalProfile = await this.createProfile(serverId, { nickname });
      } else {
        const results = await db
          .update(guildBotProfiles)
          .set({
            nickname,
            updatedAt: new Date()
          })
          .where(eq(guildBotProfiles.serverId, serverId))
          .returning();
        
        finalProfile = results[0] || existingProfile;
        this.profileCache.set(serverId, {
          profile: finalProfile,
          lastFetched: Date.now()
        });
      }

      if (finalProfile.autoSyncEnabled) {
        this.queueSync(serverId);
      }

      return finalProfile;
    } catch (error) {
      console.error(`[GuildIdentity] Error updating nickname for ${serverId}:`, error);
      throw error;
    }
  }

  async updateAvatarUrl(serverId: string, avatarUrl: string | null, avatarAssetId?: string | null): Promise<GuildBotProfile | null> {
    try {
      const existingProfile = await this.getProfile(serverId);
      
      let finalProfile: GuildBotProfile;
      
      if (!existingProfile) {
        finalProfile = await this.createProfile(serverId, { avatarUrl, avatarAssetId: avatarAssetId || null });
      } else {
        const results = await db
          .update(guildBotProfiles)
          .set({
            avatarUrl,
            avatarAssetId: avatarAssetId || null,
            updatedAt: new Date()
          })
          .where(eq(guildBotProfiles.serverId, serverId))
          .returning();
        
        finalProfile = results[0] || existingProfile;
        this.profileCache.set(serverId, {
          profile: finalProfile,
          lastFetched: Date.now()
        });
      }

      console.log(`[GuildIdentity] Avatar URL cannot be synced per-guild - Discord only supports nicknames per guild. Avatar stored for reference.`);
      return finalProfile;
    } catch (error) {
      console.error(`[GuildIdentity] Error updating avatar for ${serverId}:`, error);
      throw error;
    }
  }

  async syncToDiscord(serverId: string): Promise<boolean> {
    if (!this.client) {
      console.warn('[GuildIdentity] No Discord client registered');
      return false;
    }

    try {
      const profile = await this.getProfile(serverId);
      if (!profile) {
        console.log(`[GuildIdentity] No profile found for ${serverId}`);
        return false;
      }

      const guild = this.client.guilds.cache.get(serverId);
      if (!guild) {
        console.warn(`[GuildIdentity] Guild ${serverId} not in cache`);
        return false;
      }

      const botMember = guild.members.me;
      if (!botMember) {
        console.warn(`[GuildIdentity] Bot member not found in guild ${serverId}`);
        return false;
      }

      const currentNickname = botMember.nickname;
      const targetNickname = profile.nickname;

      if (currentNickname !== targetNickname) {
        try {
          await botMember.setNickname(targetNickname, 'Guild identity sync');
          
          await db
            .update(guildBotProfiles)
            .set({
              nicknameSyncedAt: new Date(),
              lastSyncError: null
            })
            .where(eq(guildBotProfiles.serverId, serverId));

          console.log(`[GuildIdentity] Synced nickname for ${serverId}: ${targetNickname || '(default)'}`);
        } catch (error: any) {
          const errorMessage = error.message || 'Unknown error';
          await db
            .update(guildBotProfiles)
            .set({ lastSyncError: errorMessage })
            .where(eq(guildBotProfiles.serverId, serverId));

          console.error(`[GuildIdentity] Failed to sync nickname for ${serverId}: ${errorMessage}`);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error(`[GuildIdentity] Sync error for ${serverId}:`, error);
      return false;
    }
  }

  private queueSync(serverId: string): void {
    this.syncQueue.add(serverId);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isSyncing || this.syncQueue.size === 0) return;

    this.isSyncing = true;

    while (this.syncQueue.size > 0) {
      const serverId = this.syncQueue.values().next().value;
      if (serverId) {
        this.syncQueue.delete(serverId);
        await this.syncToDiscord(serverId);
        await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_DELAY_MS));
      }
    }

    this.isSyncing = false;
  }

  async syncAllGuilds(): Promise<{ success: number; failed: number }> {
    if (!this.client) {
      return { success: 0, failed: 0 };
    }

    const results = { success: 0, failed: 0 };

    try {
      const profiles = await db
        .select()
        .from(guildBotProfiles)
        .where(eq(guildBotProfiles.autoSyncEnabled, true));

      for (const profile of profiles) {
        const synced = await this.syncToDiscord(profile.serverId);
        if (synced) {
          results.success++;
        } else {
          results.failed++;
        }
        await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_DELAY_MS));
      }

      console.log(`[GuildIdentity] Bulk sync complete: ${results.success} success, ${results.failed} failed`);
    } catch (error) {
      console.error('[GuildIdentity] Bulk sync error:', error);
    }

    return results;
  }

  async getOrCreateProfile(serverId: string): Promise<GuildBotProfile> {
    let profile = await this.getProfile(serverId);
    if (!profile) {
      profile = await this.createProfile(serverId);
    }
    return profile;
  }

  async setAutoSync(serverId: string, enabled: boolean): Promise<void> {
    await db
      .update(guildBotProfiles)
      .set({
        autoSyncEnabled: enabled,
        updatedAt: new Date()
      })
      .where(eq(guildBotProfiles.serverId, serverId));

    this.profileCache.delete(serverId);
  }

  clearCache(serverId?: string): void {
    if (serverId) {
      this.profileCache.delete(serverId);
    } else {
      this.profileCache.clear();
    }
  }

  async getGuildNickname(serverId: string): Promise<string | null> {
    const profile = await this.getProfile(serverId);
    return profile?.nickname || null;
  }
}

export const guildIdentityService = new GuildIdentityService();
