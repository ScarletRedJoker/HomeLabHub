import { Router, type Request, type Response, type NextFunction } from 'express';
import { obsService } from './obs-service';
import { db } from './db';
import { obsConnections, obsAutomations } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from './auth/middleware';
import { insertOBSConnectionSchema, insertOBSAutomationSchema, updateOBSConnectionSchema, updateOBSAutomationSchema } from '@shared/schema';
import crypto from 'crypto';
import { OBS_ENABLED } from './env';

const router = Router();

/**
 * Middleware to check if OBS feature is enabled
 * Returns 501 Not Implemented if OBS_WEBSOCKET_HOST is not configured
 */
function requireOBSEnabled(req: Request, res: Response, next: NextFunction) {
  if (!OBS_ENABLED) {
    return res.status(501).json({
      error: 'OBS integration not available',
      message: 'OBS WebSocket integration is not configured for this deployment. This feature is optional and not all instances have OBS Studio available.',
      feature: 'obs',
      enabled: false,
    });
  }
  next();
}

// Apply OBS feature check to all routes in this router
router.use(requireOBSEnabled);

const ENCRYPTION_KEY = process.env.OBS_ENCRYPTION_KEY || 'default-encryption-key-change-in-production';
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts.shift()!, 'hex');
  const encrypted = parts.join(':');
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

router.get('/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const connection = await db.query.obsConnections.findFirst({
      where: eq(obsConnections.userId, req.user!.id),
    });

    res.json({
      connected: obsService.isConnected(),
      connectionExists: !!connection,
      lastConnectedAt: connection?.lastConnectedAt || null,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get OBS status', message: error.message });
  }
});

router.post('/connect', requireAuth, async (req: Request, res: Response) => {
  try {
    const { host, port, password } = req.body;

    if (!host || !port || !password) {
      return res.status(400).json({ error: 'Host, port, and password are required' });
    }

    await obsService.connect(host, port, password);

    const existingConnection = await db.query.obsConnections.findFirst({
      where: eq(obsConnections.userId, req.user!.id),
    });

    const encryptedPassword = encrypt(password);

    if (existingConnection) {
      await db
        .update(obsConnections)
        .set({
          host,
          port,
          password: encryptedPassword,
          isConnected: true,
          lastConnectedAt: new Date(),
        })
        .where(eq(obsConnections.id, existingConnection.id));
    } else {
      await db.insert(obsConnections).values({
        userId: req.user!.id,
        host,
        port,
        password: encryptedPassword,
        isConnected: true,
        lastConnectedAt: new Date(),
      });
    }

    res.json({ success: true, message: 'Connected to OBS successfully' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to connect to OBS', message: error.message });
  }
});

router.post('/disconnect', requireAuth, async (req: Request, res: Response) => {
  try {
    await obsService.disconnect();

    await db
      .update(obsConnections)
      .set({ isConnected: false })
      .where(eq(obsConnections.userId, req.user!.id));

    res.json({ success: true, message: 'Disconnected from OBS' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to disconnect from OBS', message: error.message });
  }
});

router.get('/scenes', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!obsService.isConnected()) {
      return res.status(400).json({ error: 'Not connected to OBS' });
    }

    const scenes = await obsService.getScenes();
    res.json(scenes);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get scenes', message: error.message });
  }
});

router.get('/scenes/current', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!obsService.isConnected()) {
      return res.status(400).json({ error: 'Not connected to OBS' });
    }

    const currentScene = await obsService.getCurrentScene();
    res.json({ currentScene });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get current scene', message: error.message });
  }
});

router.post('/scenes/switch', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sceneName } = req.body;

    if (!sceneName) {
      return res.status(400).json({ error: 'Scene name is required' });
    }

    if (!obsService.isConnected()) {
      return res.status(400).json({ error: 'Not connected to OBS' });
    }

    await obsService.setScene(sceneName);
    res.json({ success: true, message: `Switched to scene: ${sceneName}` });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to switch scene', message: error.message });
  }
});

router.post('/scenes/create', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sceneName } = req.body;

    if (!sceneName) {
      return res.status(400).json({ error: 'Scene name is required' });
    }

    if (!obsService.isConnected()) {
      return res.status(400).json({ error: 'Not connected to OBS' });
    }

    await obsService.createScene(sceneName);
    res.json({ success: true, message: `Created scene: ${sceneName}` });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create scene', message: error.message });
  }
});

router.get('/sources', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sceneName } = req.query;

    if (!sceneName || typeof sceneName !== 'string') {
      return res.status(400).json({ error: 'Scene name is required' });
    }

    if (!obsService.isConnected()) {
      return res.status(400).json({ error: 'Not connected to OBS' });
    }

    const sources = await obsService.getSceneItems(sceneName);
    res.json(sources);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get sources', message: error.message });
  }
});

router.post('/sources/visibility', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sceneName, sceneItemId, visible } = req.body;

    if (!sceneName || sceneItemId === undefined || visible === undefined) {
      return res.status(400).json({ error: 'Scene name, scene item ID, and visible are required' });
    }

    if (!obsService.isConnected()) {
      return res.status(400).json({ error: 'Not connected to OBS' });
    }

    await obsService.setSourceVisibility(sceneName, sceneItemId, visible);
    res.json({ success: true, message: 'Source visibility updated' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to set source visibility', message: error.message });
  }
});

router.post('/sources/settings', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sourceName, settings } = req.body;

    if (!sourceName || !settings) {
      return res.status(400).json({ error: 'Source name and settings are required' });
    }

    if (!obsService.isConnected()) {
      return res.status(400).json({ error: 'Not connected to OBS' });
    }

    await obsService.setSourceSettings(sourceName, settings);
    res.json({ success: true, message: 'Source settings updated' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to set source settings', message: error.message });
  }
});

router.post('/text', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sourceName, text } = req.body;

    if (!sourceName || text === undefined) {
      return res.status(400).json({ error: 'Source name and text are required' });
    }

    if (!obsService.isConnected()) {
      return res.status(400).json({ error: 'Not connected to OBS' });
    }

    await obsService.updateTextSource(sourceName, text);
    res.json({ success: true, message: 'Text source updated' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update text source', message: error.message });
  }
});

router.post('/media/play', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sourceName } = req.body;

    if (!sourceName) {
      return res.status(400).json({ error: 'Source name is required' });
    }

    if (!obsService.isConnected()) {
      return res.status(400).json({ error: 'Not connected to OBS' });
    }

    await obsService.playMedia(sourceName);
    res.json({ success: true, message: 'Media started' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to play media', message: error.message });
  }
});

router.post('/media/stop', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sourceName } = req.body;

    if (!sourceName) {
      return res.status(400).json({ error: 'Source name is required' });
    }

    if (!obsService.isConnected()) {
      return res.status(400).json({ error: 'Not connected to OBS' });
    }

    await obsService.stopMedia(sourceName);
    res.json({ success: true, message: 'Media stopped' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to stop media', message: error.message });
  }
});

router.post('/stream/start', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!obsService.isConnected()) {
      return res.status(400).json({ error: 'Not connected to OBS' });
    }

    await obsService.startStreaming();
    res.json({ success: true, message: 'Streaming started' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to start streaming', message: error.message });
  }
});

router.post('/stream/stop', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!obsService.isConnected()) {
      return res.status(400).json({ error: 'Not connected to OBS' });
    }

    await obsService.stopStreaming();
    res.json({ success: true, message: 'Streaming stopped' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to stop streaming', message: error.message });
  }
});

router.post('/recording/start', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!obsService.isConnected()) {
      return res.status(400).json({ error: 'Not connected to OBS' });
    }

    await obsService.startRecording();
    res.json({ success: true, message: 'Recording started' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to start recording', message: error.message });
  }
});

router.post('/recording/stop', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!obsService.isConnected()) {
      return res.status(400).json({ error: 'Not connected to OBS' });
    }

    await obsService.stopRecording();
    res.json({ success: true, message: 'Recording stopped' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to stop recording', message: error.message });
  }
});

router.get('/automations', requireAuth, async (req: Request, res: Response) => {
  try {
    const automations = await db.query.obsAutomations.findMany({
      where: eq(obsAutomations.userId, req.user!.id),
    });

    res.json(automations);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get automations', message: error.message });
  }
});

router.post('/automations', requireAuth, async (req: Request, res: Response) => {
  try {
    const validated = insertOBSAutomationSchema.parse(req.body);

    const [automation] = await db
      .insert(obsAutomations)
      .values({
        ...validated,
        userId: req.user!.id,
      })
      .returning();

    res.json(automation);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid automation data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create automation', message: error.message });
  }
});

router.put('/automations/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const validated = updateOBSAutomationSchema.parse(req.body);

    const [automation] = await db
      .update(obsAutomations)
      .set(validated)
      .where(and(eq(obsAutomations.id, req.params.id), eq(obsAutomations.userId, req.user!.id)))
      .returning();

    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    res.json(automation);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid automation data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update automation', message: error.message });
  }
});

router.delete('/automations/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const [automation] = await db
      .delete(obsAutomations)
      .where(and(eq(obsAutomations.id, req.params.id), eq(obsAutomations.userId, req.user!.id)))
      .returning();

    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    res.json({ success: true, message: 'Automation deleted' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete automation', message: error.message });
  }
});

export default router;
