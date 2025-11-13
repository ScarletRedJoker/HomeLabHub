import { Router } from "express";
import { requireAuth } from "./auth/middleware";
import { createOverlayToken, verifyOverlayToken } from "./crypto-utils";
import { spotifyServiceMultiUser } from "./spotify-service-multiuser";
import { youtubeServiceMultiUser } from "./youtube-service-multiuser";

const router = Router();

// Rate limiting cache (simple in-memory)
const rateLimitCache = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, limit: number = 60, windowMs: number = 60000): boolean {
  const now = Date.now();
  const cached = rateLimitCache.get(key);

  if (!cached || now > cached.resetAt) {
    rateLimitCache.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (cached.count >= limit) {
    return false;
  }

  cached.count++;
  return true;
}

/**
 * Generate overlay access token for authenticated user
 * POST /api/overlay/generate-token
 */
router.post('/generate-token', requireAuth, async (req, res) => {
  try {
    const { platform, expiresIn } = req.body;

    if (!platform || !['spotify', 'youtube'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform. Must be spotify or youtube.' });
    }

    const userId = req.user!.id;

    // Check if user has this platform connected
    if (platform === 'spotify') {
      const connected = await spotifyServiceMultiUser.isConnected(userId);
      if (!connected) {
        return res.status(400).json({ error: 'Spotify not connected. Please connect Spotify first.' });
      }
    } else if (platform === 'youtube') {
      const connected = await youtubeServiceMultiUser.isConnected(userId);
      if (!connected) {
        return res.status(400).json({ error: 'YouTube not connected. Please connect YouTube first.' });
      }
    }

    // Generate signed token (default 24 hours, max 30 days)
    const maxExpiry = 30 * 24 * 60 * 60; // 30 days
    const tokenExpiry = Math.min(expiresIn || 86400, maxExpiry);
    const token = createOverlayToken(userId, tokenExpiry);

    // Platform-specific overlay URLs (using legacy paths for backward compatibility)
    const overlayUrls: Record<string, string> = {
      spotify: `/overlay/spotify?token=${token}`,
      youtube: `/overlay/youtube?token=${token}`,
    };

    const overlayUrl = overlayUrls[platform];
    if (!overlayUrl) {
      return res.status(400).json({ 
        error: `Overlay not yet implemented for ${platform}.` 
      });
    }

    res.json({
      token,
      expiresIn: tokenExpiry,
      overlayUrl,
    });

  } catch (error: any) {
    console.error('[Overlay] Token generation error:', error.message);
    res.status(500).json({ error: 'Failed to generate overlay token' });
  }
});

/**
 * Get overlay data (used by overlay page)
 * GET /api/overlay/:platform/data
 */
router.get('/:platform/data', async (req, res) => {
  const { platform } = req.params;
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.status(401).json({ error: 'Missing overlay token' });
  }

  try {
    // Verify token and extract userId
    const userId = verifyOverlayToken(token);

    // Rate limit by userId (60 requests per minute)
    if (!checkRateLimit(`overlay:${userId}:${platform}`, 60, 60000)) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please wait before refreshing.' });
    }

    if (platform === 'spotify') {
      const nowPlaying = await spotifyServiceMultiUser.getNowPlaying(userId);
      return res.json(nowPlaying);
    }

    if (platform === 'youtube') {
      const livestream = await youtubeServiceMultiUser.getCurrentLivestream(userId);
      return res.json(livestream);
    }

    return res.status(400).json({ error: 'Invalid platform' });

  } catch (error: any) {
    if (error.message?.includes('expired') || error.message?.includes('Invalid')) {
      return res.status(401).json({ error: error.message });
    }

    console.error(`[Overlay] Error fetching ${platform} data:`, error.message);
    res.status(500).json({ error: 'Failed to fetch overlay data' });
  }
});

/**
 * Verify overlay token (for React overlay component to call)
 * GET /verify-token
 */
router.get('/verify-token', (req, res) => {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.status(401).json({ valid: false, error: 'Missing token' });
  }

  try {
    const userId = verifyOverlayToken(token);
    res.json({ valid: true, userId });
  } catch (error: any) {
    res.status(401).json({ valid: false, error: error.message });
  }
});

export default router;
