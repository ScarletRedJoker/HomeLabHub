/**
 * Personal Presence Routes
 * 
 * API endpoints for managing personal Discord presence via Lanyard integration.
 * Lanyard is a service that exposes Discord presence data via REST API.
 * 
 * Requirements for users:
 * - Must join the Lanyard Discord server: https://discord.gg/lanyard
 * - GitHub: https://github.com/Phineas/lanyard
 */

import { Router } from 'express';
import { requireAuth } from './auth/middleware';
import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

const LANYARD_API_BASE = 'https://api.lanyard.rest/v1/users';

interface LanyardResponse {
  success: boolean;
  data?: {
    spotify: {
      track_id: string;
      timestamps: { start: number; end: number };
      album: string;
      album_art_url: string;
      artist: string;
      song: string;
    } | null;
    listening_to_spotify: boolean;
    discord_user: {
      id: string;
      username: string;
      avatar: string;
      discriminator: string;
      display_name: string | null;
      global_name: string | null;
    };
    discord_status: 'online' | 'idle' | 'dnd' | 'offline';
    activities: Array<{
      id: string;
      name: string;
      type: number;
      state?: string;
      details?: string;
      timestamps?: { start?: number; end?: number };
      assets?: {
        large_image?: string;
        large_text?: string;
        small_image?: string;
        small_text?: string;
      };
    }>;
    active_on_discord_web: boolean;
    active_on_discord_desktop: boolean;
    active_on_discord_mobile: boolean;
  };
  error?: { code: string; message: string };
}

/**
 * GET /api/settings/personal-presence
 * Get current personal presence settings
 */
router.get('/settings/personal-presence', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;

    const [user] = await db
      .select({
        discordId: users.discordId,
        personalPresenceEnabled: users.personalPresenceEnabled,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      settings: {
        discordId: user.discordId || null,
        enabled: user.personalPresenceEnabled,
      },
      documentation: {
        lanyardGithub: 'https://github.com/Phineas/lanyard',
        lanyardDiscord: 'https://discord.gg/lanyard',
        setupInstructions: [
          '1. Join the Lanyard Discord server: https://discord.gg/lanyard',
          '2. Your Discord presence will automatically be tracked',
          '3. Enter your Discord User ID below',
          '4. Enable personal presence to display your status',
        ],
        note: 'This is READ-ONLY - Lanyard can view your presence but cannot set it. For custom Rich Presence, you would need a desktop companion app.',
      },
    });
  } catch (error: any) {
    console.error('[Personal Presence] Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings', message: error.message });
  }
});

/**
 * POST /api/settings/personal-presence
 * Update personal presence settings (Discord ID and enable/disable)
 */
router.post('/settings/personal-presence', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;

    const { discordId, enabled } = req.body;

    // Validate Discord ID format (17-19 digit snowflake)
    if (discordId !== null && discordId !== undefined && discordId !== '') {
      if (!/^\d{17,19}$/.test(discordId)) {
        return res.status(400).json({
          error: 'Invalid Discord ID format',
          message: 'Discord ID should be a 17-19 digit number (snowflake ID)',
        });
      }

      // Verify the Discord ID exists in Lanyard
      try {
        const lanyardCheck = await fetch(`${LANYARD_API_BASE}/${discordId}`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(5000),
        });

        if (!lanyardCheck.ok) {
          return res.status(400).json({
            error: 'Discord ID not found in Lanyard',
            message: 'Make sure you have joined the Lanyard Discord server: https://discord.gg/lanyard',
          });
        }
      } catch {
        return res.status(400).json({
          error: 'Could not verify Discord ID',
          message: 'Failed to connect to Lanyard API. Please try again.',
        });
      }
    }

    // Update user settings
    const updateData: { discordId?: string | null; personalPresenceEnabled?: boolean } = {};
    
    if (discordId !== undefined) {
      updateData.discordId = discordId === '' ? null : discordId;
    }
    
    if (typeof enabled === 'boolean') {
      updateData.personalPresenceEnabled = enabled;
    }

    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning({
        discordId: users.discordId,
        personalPresenceEnabled: users.personalPresenceEnabled,
      });

    res.json({
      success: true,
      settings: {
        discordId: updatedUser.discordId || null,
        enabled: updatedUser.personalPresenceEnabled,
      },
    });
  } catch (error: any) {
    console.error('[Personal Presence] Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings', message: error.message });
  }
});

/**
 * GET /api/presence/current
 * Get current Discord presence from Lanyard
 */
router.get('/presence/current', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;

    // Get user's Discord ID
    const [user] = await db
      .select({
        discordId: users.discordId,
        personalPresenceEnabled: users.personalPresenceEnabled,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.discordId) {
      return res.status(400).json({
        error: 'Discord ID not configured',
        message: 'Please set your Discord ID in settings first',
      });
    }

    if (!user.personalPresenceEnabled) {
      return res.status(400).json({
        error: 'Personal presence disabled',
        message: 'Enable personal presence in settings to view your Discord status',
      });
    }

    // Fetch presence from Lanyard
    const response = await fetch(`${LANYARD_API_BASE}/${user.discordId}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({
          error: 'User not found in Lanyard',
          message: 'Make sure you have joined the Lanyard Discord server: https://discord.gg/lanyard',
        });
      }
      throw new Error(`Lanyard API error: ${response.status}`);
    }

    const lanyardData: LanyardResponse = await response.json();

    if (!lanyardData.success || !lanyardData.data) {
      return res.status(500).json({
        error: 'Lanyard API error',
        message: lanyardData.error?.message || 'Unknown error',
      });
    }

    const data = lanyardData.data;
    const avatarUrl = data.discord_user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.discordId}/${data.discord_user.avatar}.${data.discord_user.avatar.startsWith('a_') ? 'gif' : 'png'}`
      : null;

    // Format Spotify data if listening
    let spotify = null;
    if (data.listening_to_spotify && data.spotify) {
      const now = Date.now();
      const elapsed = now - data.spotify.timestamps.start;
      const duration = data.spotify.timestamps.end - data.spotify.timestamps.start;
      const progress = Math.min(100, Math.max(0, (elapsed / duration) * 100));

      spotify = {
        song: data.spotify.song,
        artist: data.spotify.artist,
        album: data.spotify.album,
        albumArtUrl: data.spotify.album_art_url,
        progress: Math.round(progress),
        trackId: data.spotify.track_id,
      };
    }

    // Format activities (exclude Spotify which is type 2)
    const ACTIVITY_TYPES: Record<number, string> = {
      0: 'Playing',
      1: 'Streaming',
      2: 'Listening to',
      3: 'Watching',
      4: 'Custom Status',
      5: 'Competing in',
    };

    const activities = data.activities
      .filter(a => a.type !== 2)
      .map(a => ({
        name: a.name,
        type: ACTIVITY_TYPES[a.type] || 'Unknown',
        details: a.details,
        state: a.state,
        largeImage: a.assets?.large_image,
        largeText: a.assets?.large_text,
      }));

    res.json({
      success: true,
      presence: {
        discordId: user.discordId,
        username: data.discord_user.username,
        displayName: data.discord_user.display_name || data.discord_user.global_name,
        avatarUrl,
        status: data.discord_status,
        spotify,
        activities,
        platforms: {
          desktop: data.active_on_discord_desktop,
          web: data.active_on_discord_web,
          mobile: data.active_on_discord_mobile,
        },
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[Personal Presence] Error fetching presence:', error);
    res.status(500).json({ error: 'Failed to fetch presence', message: error.message });
  }
});

/**
 * GET /api/presence/validate/:discordId
 * Validate a Discord ID exists in Lanyard (public endpoint for UI validation)
 */
router.get('/presence/validate/:discordId', async (req, res) => {
  const { discordId } = req.params;

  // Validate format
  if (!/^\d{17,19}$/.test(discordId)) {
    return res.json({
      valid: false,
      error: 'Invalid Discord ID format',
    });
  }

  try {
    const response = await fetch(`${LANYARD_API_BASE}/${discordId}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return res.json({
        valid: false,
        error: 'Discord ID not found in Lanyard. Join the Lanyard Discord server first.',
      });
    }

    const data: LanyardResponse = await response.json();
    if (!data.success || !data.data) {
      return res.json({
        valid: false,
        error: 'Invalid response from Lanyard',
      });
    }

    res.json({
      valid: true,
      username: data.data.discord_user.username,
      displayName: data.data.discord_user.display_name || data.data.discord_user.global_name,
      status: data.data.discord_status,
    });
  } catch (error: any) {
    res.json({
      valid: false,
      error: 'Failed to validate Discord ID',
    });
  }
});

export default router;
