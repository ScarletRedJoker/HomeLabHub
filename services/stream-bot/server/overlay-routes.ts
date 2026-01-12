import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "./auth/middleware";
import { createOverlayToken, verifyOverlayToken } from "./crypto-utils";
import { spotifyServiceMultiUser } from "./spotify-service-multiuser";
import { youtubeServiceMultiUser } from "./youtube-service-multiuser";
import { storage } from "./storage";

const router = Router();

// OBS-compatible headers middleware
function setOBSHeaders(req: Request, res: Response, next: NextFunction) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');
  next();
}

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

    if (!platform || !['spotify', 'youtube', 'alerts', 'chat', 'nowplaying'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform. Must be spotify, youtube, alerts, chat, or nowplaying.' });
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

    // Platform-specific overlay URLs - use OBS-optimized endpoints with inline CSS
    const overlayUrls: Record<string, string> = {
      spotify: `/api/overlay/spotify/obs?token=${token}`,
      youtube: `/api/overlay/youtube/obs?token=${token}`,
      alerts: `/api/overlay/alerts/obs?token=${token}`,
      chat: `/api/overlay/chat/obs?token=${token}`,
      nowplaying: `/api/overlay/spotify/obs?token=${token}`,
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
router.get('/:platform/data', setOBSHeaders, async (req, res) => {
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
 * Standalone OBS-friendly Spotify overlay
 * GET /api/overlay/spotify/obs
 * Returns a self-contained HTML page with inline CSS that works in OBS browser sources
 */
router.get('/spotify/obs', setOBSHeaders, async (req, res) => {
  const { token } = req.query;
  
  if (!token || typeof token !== 'string') {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html><head><title>OBS Overlay Error</title></head>
      <body style="background:transparent;color:#ff4444;font-family:sans-serif;padding:20px;">
        <h2>Missing Token</h2>
        <p>Please generate an overlay URL from your dashboard settings.</p>
      </body></html>
    `);
  }

  try {
    verifyOverlayToken(token);
  } catch (error: any) {
    return res.status(401).send(`
      <!DOCTYPE html>
      <html><head><title>OBS Overlay Error</title></head>
      <body style="background:transparent;color:#ff4444;font-family:sans-serif;padding:20px;">
        <h2>Invalid or Expired Token</h2>
        <p>${error.message}</p>
        <p>Please generate a new overlay URL from your dashboard.</p>
      </body></html>
    `);
  }

  const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
  const host = req.get('host') || 'localhost:3000';
  const baseUrl = `${protocol}://${host}`;
  const apiUrl = `${baseUrl}/api/overlay/spotify/data?token=${encodeURIComponent(token)}`;

  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>Spotify Now Playing - OBS</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      background: transparent; 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
    }
    .container {
      width: 100vw;
      height: 100vh;
      display: flex;
      align-items: flex-end;
      justify-content: flex-start;
      padding: 24px;
    }
    .card {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(12px);
      border: 2px solid rgba(30, 215, 96, 0.5);
      border-radius: 12px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      max-width: 420px;
      opacity: 0;
      transform: translateY(20px) scale(0.95);
      transition: opacity 0.5s ease, transform 0.5s ease;
    }
    .card.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    .card.hidden {
      opacity: 0;
      transform: translateY(20px) scale(0.95);
    }
    .album-art {
      flex-shrink: 0;
      width: 80px;
      height: 80px;
      border-radius: 8px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
      object-fit: cover;
    }
    .info {
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .spotify-icon {
      width: 20px;
      height: 20px;
      fill: #1DB954;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #1DB954;
    }
    .title {
      font-size: 18px;
      font-weight: 700;
      color: white;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 4px;
    }
    .artist {
      font-size: 14px;
      color: #b3b3b3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .progress-container {
      margin-top: 10px;
      height: 4px;
      background: #404040;
      border-radius: 2px;
      overflow: hidden;
    }
    .progress-bar {
      height: 100%;
      background: #1DB954;
      transition: width 1s linear;
      border-radius: 2px;
    }
    .error {
      padding: 16px 20px;
      background: rgba(255, 68, 68, 0.95);
      border-radius: 8px;
      color: white;
      max-width: 350px;
    }
    .error h3 { font-size: 14px; margin-bottom: 6px; }
    .error p { font-size: 12px; opacity: 0.9; }
    .waiting {
      padding: 16px 20px;
      background: rgba(50, 50, 50, 0.9);
      border-radius: 8px;
      color: #888;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid #555;
      border-top-color: #1DB954;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <div id="error" class="error" style="display: none;">
      <h3 id="errorTitle">Connection Error</h3>
      <p id="errorMsg">Unable to fetch Spotify data</p>
    </div>
    <div id="waiting" class="waiting" style="display: none;">
      <div class="spinner"></div>
      <span>Waiting for music to play...</span>
    </div>
    <div id="overlay" class="card hidden">
      <img id="albumArt" class="album-art" src="" alt="Album Art">
      <div class="info">
        <div class="header">
          <svg class="spotify-icon" viewBox="0 0 24 24">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
          <span class="label">Now Playing</span>
        </div>
        <div id="title" class="title"></div>
        <div id="artist" class="artist"></div>
        <div class="progress-container">
          <div id="progress" class="progress-bar" style="width: 0%"></div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const API_URL = "${apiUrl}";
    const overlay = document.getElementById('overlay');
    const albumArt = document.getElementById('albumArt');
    const title = document.getElementById('title');
    const artist = document.getElementById('artist');
    const progress = document.getElementById('progress');
    const errorDiv = document.getElementById('error');
    const errorTitle = document.getElementById('errorTitle');
    const errorMsg = document.getElementById('errorMsg');
    const waitingDiv = document.getElementById('waiting');
    
    let lastIsPlaying = false;
    let lastTitle = '';
    let errorCount = 0;
    let hasEverPlayed = false;

    function showError(title, msg) {
      errorTitle.textContent = title;
      errorMsg.textContent = msg;
      errorDiv.style.display = 'block';
      waitingDiv.style.display = 'none';
      overlay.classList.remove('visible');
      overlay.classList.add('hidden');
    }

    function hideError() {
      errorDiv.style.display = 'none';
      errorCount = 0;
    }

    function showWaiting() {
      if (!hasEverPlayed) {
        waitingDiv.style.display = 'flex';
      }
    }

    function hideWaiting() {
      waitingDiv.style.display = 'none';
    }

    async function fetchNowPlaying() {
      try {
        const response = await fetch(API_URL, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          errorCount++;
          if (response.status === 401) {
            showError('Token Expired', 'Get a new OBS URL from your dashboard');
          } else if (errorCount > 3) {
            showError('Connection Issue', data.error || 'Check your Spotify connection');
          }
          return;
        }
        
        hideError();
        const data = await response.json();
        
        if (data.isPlaying && data.title) {
          hasEverPlayed = true;
          hideWaiting();
          if (!lastIsPlaying || lastTitle !== data.title) {
            albumArt.src = data.albumImageUrl || '';
            title.textContent = data.title || '';
            artist.textContent = data.artist || '';
          }
          
          if (data.progressPercent !== undefined) {
            progress.style.width = data.progressPercent + '%';
          }
          
          overlay.classList.remove('hidden');
          overlay.classList.add('visible');
          lastIsPlaying = true;
          lastTitle = data.title;
        } else {
          overlay.classList.remove('visible');
          overlay.classList.add('hidden');
          lastIsPlaying = false;
          lastTitle = '';
          showWaiting();
        }
      } catch (error) {
        errorCount++;
        if (errorCount > 3) {
          showError('Network Error', 'Check your internet connection');
        }
      }
    }

    fetchNowPlaying();
    setInterval(fetchNowPlaying, 5000);
  </script>
</body>
</html>`);
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
