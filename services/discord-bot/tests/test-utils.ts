import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import cors from "cors";
import MemoryStore from "memorystore";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

export async function createTestApp() {
  const app = express();
  const MStore = MemoryStore(session);
  
  app.set('trust proxy', 1);
  
  app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  }));
  
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  
  const sessionMiddleware = session({
    secret: 'test-session-secret',
    resave: false,
    saveUninitialized: false,
    store: new MStore({ checkPeriod: 86400000 }),
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    },
  });
  
  app.use(sessionMiddleware);
  
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const userCookie = req.headers.cookie?.split(';').find(c => c.trim().startsWith('user='));
    if (userCookie) {
      const userId = userCookie.split('=')[1].trim();
      (req as any).user = { 
        id: userId,
        isAdmin: true,
        adminGuilds: [{ id: 'test-server-id', name: 'Test Server' }]
      };
    }
    next();
  });

  app.get('/health', (req: Request, res: Response) => {
    res.json({ 
      status: 'healthy',
      service: 'discord-bot-test',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/bot/invite-url', async (req: Request, res: Response) => {
    const clientId = process.env.DISCORD_CLIENT_ID || 'test-client-id';
    res.json({ 
      inviteURL: `https://discord.com/oauth2/authorize?client_id=${clientId}`,
      permissions: '8',
      clientId
    });
  });

  app.get('/api/accessible-servers', async (req: Request, res: Response) => {
    if (!(req as any).user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json([
      { id: 'test-server-id', name: 'Test Server', icon: null }
    ]);
  });

  app.get('/api/servers/:serverId/settings', async (req: Request, res: Response) => {
    if (!(req as any).user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { serverId } = req.params;
    res.json({
      serverId,
      botName: 'Test Bot',
      botPrefix: '!',
      notificationsEnabled: true,
      autoCloseEnabled: false,
      autoCloseHours: '48',
      defaultPriority: 'normal',
    });
  });

  app.put('/api/servers/:serverId/settings', async (req: Request, res: Response) => {
    if (!(req as any).user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { serverId } = req.params;
    res.json({
      serverId,
      ...req.body,
    });
  });

  app.get('/api/tickets', async (req: Request, res: Response) => {
    if (!(req as any).user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json([]);
  });

  app.get('/api/tickets/server/:serverId', async (req: Request, res: Response) => {
    if (!(req as any).user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { serverId } = req.params;
    res.json([]);
  });

  app.post('/api/tickets', async (req: Request, res: Response) => {
    if (!(req as any).user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.status(201).json({
      id: 1,
      ...req.body,
      status: 'open',
      createdAt: new Date().toISOString(),
    });
  });

  app.get('/api/stream-notifications/:serverId/settings', async (req: Request, res: Response) => {
    if (!(req as any).user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { serverId } = req.params;
    res.json({
      serverId,
      notificationChannelId: null,
      customMessage: null,
      isEnabled: false,
      autoDetectEnabled: false,
    });
  });

  app.put('/api/stream-notifications/:serverId/settings', async (req: Request, res: Response) => {
    if (!(req as any).user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { serverId } = req.params;
    res.json({
      serverId,
      ...req.body,
    });
  });

  app.get('/api/stream-notifications/:serverId/tracked-users', async (req: Request, res: Response) => {
    if (!(req as any).user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json([]);
  });
  
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
  });
  
  return app;
}

export function mockAuthMiddleware(userId: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { 
      id: userId,
      isAdmin: true,
      adminGuilds: [{ id: 'test-server-id', name: 'Test Server' }]
    };
    next();
  };
}

export async function withTransaction<T>(
  callback: () => Promise<T>
): Promise<T> {
  await db.execute(sql`BEGIN`);
  try {
    const result = await callback();
    await db.execute(sql`ROLLBACK`);
    return result;
  } catch (error) {
    await db.execute(sql`ROLLBACK`);
    throw error;
  }
}

export async function beginTestTransaction(): Promise<void> {
  await db.execute(sql`BEGIN`);
}

export async function rollbackTestTransaction(): Promise<void> {
  await db.execute(sql`ROLLBACK`);
}

export function createTransactionWrapper() {
  return {
    begin: async () => {
      await db.execute(sql`BEGIN`);
    },
    rollback: async () => {
      await db.execute(sql`ROLLBACK`);
    },
    commit: async () => {
      await db.execute(sql`COMMIT`);
    }
  };
}
