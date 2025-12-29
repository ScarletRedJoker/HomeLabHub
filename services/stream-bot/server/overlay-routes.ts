import { Router } from "express";
import { requireAuth } from "./auth/middleware";
import { createOverlayToken, verifyOverlayToken } from "./crypto-utils";
import { spotifyServiceMultiUser } from "./spotify-service-multiuser";
import { youtubeServiceMultiUser } from "./youtube-service-multiuser";
import { storage } from "./storage";

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

    if (!platform || !['spotify', 'youtube', 'alerts'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform. Must be spotify, youtube, or alerts.' });
    }

    const userId = req.user!.id;

    // Check if user has this platform connected (skip for alerts as it doesn't require a platform)
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
    // alerts platform doesn't require any connection - always allowed

    // Generate signed token (default 24 hours, max 30 days)
    const maxExpiry = 30 * 24 * 60 * 60; // 30 days
    const tokenExpiry = Math.min(expiresIn || 86400, maxExpiry);
    const token = createOverlayToken(userId, tokenExpiry);

    // Platform-specific overlay URLs (using legacy paths for backward compatibility)
    const overlayUrls: Record<string, string> = {
      spotify: `/overlay/spotify?token=${token}`,
      youtube: `/overlay/youtube?token=${token}`,
      alerts: `/overlay/stream-alerts?token=${token}`,
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

    if (platform === 'alerts') {
      const userStorage = storage.getUserStorage(userId);
      const alerts = await userStorage.getStreamAlerts();
      return res.json({
        alerts: alerts.filter(a => a.enabled),
        userId,
      });
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

// In-memory storage for overlay configs (would use database in production)
const overlayConfigs = new Map<string, { userId: number; config: any; createdAt: Date }>();

/**
 * Save overlay configuration
 * POST /save-config
 */
router.post('/save-config', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { aspectRatio, elements } = req.body;

    if (!elements || !Array.isArray(elements)) {
      return res.status(400).json({ error: 'Invalid overlay configuration' });
    }

    // Generate unique ID for this config
    const configId = `${userId}-${Date.now()}`;
    
    overlayConfigs.set(configId, {
      userId,
      config: { aspectRatio, elements },
      createdAt: new Date()
    });

    // Clean up old configs (keep last 10 per user)
    const userConfigs = Array.from(overlayConfigs.entries())
      .filter(([_, v]) => v.userId === userId)
      .sort((a, b) => b[1].createdAt.getTime() - a[1].createdAt.getTime());
    
    if (userConfigs.length > 10) {
      userConfigs.slice(10).forEach(([key]) => overlayConfigs.delete(key));
    }

    console.log(`[Overlay] Saved config ${configId} for user ${userId}`);

    res.json({ 
      id: configId,
      overlayUrl: `/overlay/custom?id=${configId}`
    });

  } catch (error: any) {
    console.error('[Overlay] Error saving config:', error.message);
    res.status(500).json({ error: 'Failed to save overlay configuration' });
  }
});

/**
 * Get overlay configuration
 * GET /config/:id
 */
router.get('/config/:id', (req, res) => {
  const { id } = req.params;
  
  const saved = overlayConfigs.get(id);
  if (!saved) {
    return res.status(404).json({ error: 'Overlay configuration not found' });
  }

  res.json(saved.config);
});

export default router;
