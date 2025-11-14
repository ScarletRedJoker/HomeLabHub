import { Router } from "express";
import passport from "./passport-oauth-config";
import { requireAuth } from "./middleware";
import { db } from "../db";
import { users, platformConnections } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { encryptToken } from "../crypto-utils";

const router = Router();

router.get('/twitch', 
  passport.authenticate('twitch-signin', { 
    scope: ['user:read:email', 'user:read:chat', 'user:write:chat', 'user:bot', 'channel:bot'] 
  })
);

router.get('/twitch/callback',
  passport.authenticate('twitch-signin', { 
    failureRedirect: '/login?error=twitch_auth_failed',
    failureMessage: true 
  }),
  (req, res) => {
    console.log(`[OAuth Sign-in] Twitch authentication successful for user ${req.user?.id}`);
    res.redirect('/?success=twitch_signin');
  }
);

router.get('/youtube',
  passport.authenticate('google-youtube-signin', {
    scope: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    accessType: 'offline',
    prompt: 'consent',
  })
);

router.get('/youtube/callback',
  passport.authenticate('google-youtube-signin', {
    failureRedirect: '/login?error=youtube_auth_failed',
    failureMessage: true
  }),
  (req, res) => {
    console.log(`[OAuth Sign-in] YouTube authentication successful for user ${req.user?.id}`);
    res.redirect('/?success=youtube_signin');
  }
);

router.get('/kick', 
  passport.authenticate('kick-signin', { 
    scope: ['user:read', 'chat:read', 'chat:send'] 
  })
);

router.get('/kick/callback',
  passport.authenticate('kick-signin', { 
    failureRedirect: '/login?error=kick_auth_failed',
    failureMessage: true 
  }),
  (req, res) => {
    console.log(`[OAuth Sign-in] Kick authentication successful for user ${req.user?.id}`);
    res.redirect('/?success=kick_signin');
  }
);

router.delete('/unlink/:platform', requireAuth, async (req, res) => {
  try {
    const { platform } = req.params;
    const userId = req.user!.id;

    if (!['twitch', 'youtube', 'kick'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }

    const connection = await db.query.platformConnections.findFirst({
      where: and(
        eq(platformConnections.userId, userId),
        eq(platformConnections.platform, platform)
      ),
    });

    if (!connection) {
      return res.status(404).json({ error: `${platform} is not linked` });
    }

    await db.delete(platformConnections)
      .where(and(
        eq(platformConnections.userId, userId),
        eq(platformConnections.platform, platform)
      ));

    console.log(`[OAuth] User ${userId} unlinked ${platform}`);
    res.json({ success: true, message: `${platform} unlinked successfully` });
  } catch (error: any) {
    console.error('[OAuth] Unlink error:', error.message);
    res.status(500).json({ error: 'Failed to unlink platform' });
  }
});

router.post('/change-primary', requireAuth, async (req, res) => {
  try {
    const { platform } = req.body;
    const userId = req.user!.id;

    if (!['twitch', 'youtube', 'kick'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }

    const connection = await db.query.platformConnections.findFirst({
      where: and(
        eq(platformConnections.userId, userId),
        eq(platformConnections.platform, platform)
      ),
    });

    if (!connection) {
      return res.status(400).json({ error: `${platform} is not linked. Please link it first.` });
    }

    await db.update(users)
      .set({ 
        primaryPlatform: platform,
        updatedAt: new Date() 
      })
      .where(eq(users.id, userId));

    console.log(`[OAuth] User ${userId} changed primary platform to ${platform}`);
    res.json({ success: true, message: `Primary platform changed to ${platform}` });
  } catch (error: any) {
    console.error('[OAuth] Change primary platform error:', error.message);
    res.status(500).json({ error: 'Failed to change primary platform' });
  }
});

router.get('/platforms', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;

    const [user, connections] = await Promise.all([
      db.query.users.findFirst({
        where: eq(users.id, userId),
      }),
      db.query.platformConnections.findMany({
        where: eq(platformConnections.userId, userId),
      }),
    ]);

    const platformData = connections.map(conn => ({
      platform: conn.platform,
      username: conn.platformUsername,
      isConnected: conn.isConnected,
      lastConnectedAt: conn.lastConnectedAt,
    }));

    res.json({
      primaryPlatform: user?.primaryPlatform || null,
      platforms: platformData,
    });
  } catch (error: any) {
    console.error('[OAuth] Get platforms error:', error.message);
    res.status(500).json({ error: 'Failed to get platform connections' });
  }
});

export default router;
