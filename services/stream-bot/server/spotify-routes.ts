import { Router } from "express";
import { requireAuth } from "./auth/middleware";
import { spotifyService } from "./spotify-service";

const router = Router();

/**
 * GET /api/spotify/status
 * Check if Spotify is connected
 */
router.get("/status", requireAuth, async (req, res) => {
  try {
    const isConnected = await spotifyService.isConnected();
    res.json({ connected: isConnected });
  } catch (error: any) {
    console.error('[Spotify] Status check error:', error.message);
    res.json({ connected: false });
  }
});

/**
 * GET /api/spotify/profile
 * Get user's Spotify profile
 */
router.get("/profile", requireAuth, async (req, res) => {
  try {
    const profile = await spotifyService.getUserProfile();
    res.json(profile);
  } catch (error: any) {
    console.error('[Spotify] Profile fetch error:', error.message);
    res.status(500).json({ error: "Failed to fetch Spotify profile", details: error.message });
  }
});

/**
 * GET /api/spotify/now-playing
 * Get currently playing track
 */
router.get("/now-playing", requireAuth, async (req, res) => {
  try {
    const nowPlaying = await spotifyService.getNowPlaying();
    res.json(nowPlaying);
  } catch (error: any) {
    console.error('[Spotify] Now playing error:', error.message);
    res.status(500).json({ error: "Failed to fetch now playing", details: error.message });
  }
});

/**
 * GET /api/spotify/now-playing/public
 * Public endpoint for OBS overlay (no auth required)
 * Uses user ID from query parameter
 */
router.get("/now-playing/public", async (req, res) => {
  try {
    // For now, use the main Spotify connection
    // In the future, this could support user-specific overlays via userId query param
    const nowPlaying = await spotifyService.getNowPlaying();
    
    // Add CORS headers for OBS browser source
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.json(nowPlaying);
  } catch (error: any) {
    console.error('[Spotify] Public now playing error:', error.message);
    res.header('Access-Control-Allow-Origin', '*');
    res.json({ isPlaying: false });
  }
});

export default router;
