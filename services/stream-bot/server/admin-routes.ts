import { Router } from 'express';
import { db } from './db';
import { users, botConfigs, botInstances, platformConnections } from '@shared/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { botManager } from './bot-manager';
import { requireAuth } from './auth/middleware';

const router = Router();

const requireAdmin = async (req: any, res: any, next: any) => {
  const userId = req.session?.userId || (req.user as any)?.id;
  
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    const [user] = await db.select({
      id: users.id,
      role: users.role,
    }).from(users).where(eq(users.id, userId));
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    (req as any).adminUser = user;
    next();
  } catch (error) {
    console.error('[Admin] Failed to verify admin status:', error);
    return res.status(500).json({ error: 'Failed to verify admin status' });
  }
};

router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const allUsers = await db.select({
      id: users.id,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      onboardingCompleted: users.onboardingCompleted,
      createdAt: users.createdAt,
    }).from(users).orderBy(desc(users.createdAt));

    const enrichedUsers = await Promise.all(allUsers.map(async (user) => {
      const [botConfig] = await db.select().from(botConfigs).where(eq(botConfigs.userId, user.id));
      const [botInstance] = await db.select().from(botInstances).where(eq(botInstances.userId, user.id));
      const platforms = await db.select().from(platformConnections).where(eq(platformConnections.userId, user.id));

      return {
        ...user,
        botIsActive: botConfig?.isActive || false,
        botStatus: botInstance?.status || 'no_instance',
        lastHeartbeat: botInstance?.lastHeartbeat,
        connectedPlatforms: platforms.filter(p => p.isConnected).map(p => p.platform),
        platformCount: platforms.filter(p => p.isConnected).length,
      };
    }));

    res.json(enrichedUsers);
  } catch (error) {
    console.error('[Admin] Failed to fetch users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/users/:userId/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const [user] = await db.select({
      id: users.id,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      onboardingCompleted: users.onboardingCompleted,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    }).from(users).where(eq(users.id, userId));

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [botConfig] = await db.select().from(botConfigs).where(eq(botConfigs.userId, userId));
    const [botInstance] = await db.select().from(botInstances).where(eq(botInstances.userId, userId));
    const platforms = await db.select().from(platformConnections).where(eq(platformConnections.userId, userId));

    const workerStatus = botManager.getUserBotStatus(userId);

    res.json({
      user,
      botConfig: botConfig || null,
      botInstance: botInstance || null,
      workerRunning: workerStatus.isRunning,
      platforms: platforms.map(p => ({
        platform: p.platform,
        isConnected: p.isConnected,
        platformUsername: p.platformUsername,
        lastConnectedAt: p.lastConnectedAt,
        needsRefresh: p.needsRefresh,
      })),
    });
  } catch (error) {
    console.error(`[Admin] Failed to fetch user status for ${req.params.userId}:`, error);
    res.status(500).json({ error: 'Failed to fetch user status' });
  }
});

router.post('/users/:userId/start-bot', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`[Admin] Force starting bot for user ${userId}`);
    await botManager.startUserBot(userId);
    res.json({ success: true, message: `Bot started for user ${userId}` });
  } catch (error: any) {
    console.error(`[Admin] Failed to start bot for user ${req.params.userId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/users/:userId/stop-bot', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`[Admin] Force stopping bot for user ${userId}`);
    await botManager.stopUserBot(userId);
    res.json({ success: true, message: `Bot stopped for user ${userId}` });
  } catch (error: any) {
    console.error(`[Admin] Failed to stop bot for user ${req.params.userId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const stats = botManager.getStats();
    const totalUsersResult = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    const activeConfigsResult = await db.select({ count: sql<number>`count(*)::int` }).from(botConfigs).where(eq(botConfigs.isActive, true));
    const runningInstancesResult = await db.select({ count: sql<number>`count(*)::int` }).from(botInstances).where(eq(botInstances.status, 'running'));

    res.json({
      ...stats,
      totalUsers: totalUsersResult[0]?.count || 0,
      usersWithActiveConfig: activeConfigsResult[0]?.count || 0,
      runningInstances: runningInstancesResult[0]?.count || 0,
    });
  } catch (error) {
    console.error('[Admin] Failed to fetch stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.post('/users/:userId/restart-bot', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`[Admin] Restarting bot for user ${userId}`);
    await botManager.restartUserBot(userId);
    res.json({ success: true, message: `Bot restarted for user ${userId}` });
  } catch (error: any) {
    console.error(`[Admin] Failed to restart bot for user ${req.params.userId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
