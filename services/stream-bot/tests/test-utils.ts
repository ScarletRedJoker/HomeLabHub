import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import cors from "cors";
import passport from "../server/auth/passport-oauth-config";
import MemoryStore from "memorystore";

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
  app.use(passport.initialize());
  app.use(passport.session());
  
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const userCookie = req.headers.cookie?.split(';').find(c => c.trim().startsWith('user='));
    if (userCookie) {
      const userId = userCookie.split('=')[1].trim();
      (req as any).user = { id: userId };
    }
    next();
  });
  
  const overlayRoutes = (await import('../server/overlay-routes')).default;
  const authRoutes = (await import('../server/auth/routes')).default;
  const oauthSpotifyRoutes = (await import('../server/oauth-spotify')).default;
  const oauthTwitchRoutes = (await import('../server/oauth-twitch')).default;
  const oauthYoutubeRoutes = (await import('../server/oauth-youtube')).default;
  const oauthKickRoutes = (await import('../server/oauth-kick')).default;
  
  app.use("/api/overlay", overlayRoutes);
  app.use("/auth", authRoutes);
  app.use("/auth", oauthSpotifyRoutes);
  app.use("/auth", oauthTwitchRoutes);
  app.use("/auth", oauthYoutubeRoutes);
  app.use("/auth", oauthKickRoutes);
  
  app.get('/api/platforms', async (req: Request, res: Response) => {
    if (!(req as any).user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { db } = await import('../server/db');
    const { platformConnections } = await import('../shared/schema');
    const { eq } = await import('drizzle-orm');
    
    const connections = await db.select({
      id: platformConnections.id,
      platform: platformConnections.platform,
      platformUserId: platformConnections.platformUserId,
      platformUsername: platformConnections.platformUsername,
      isConnected: platformConnections.isConnected,
    }).from(platformConnections).where(eq(platformConnections.userId, (req as any).user.id));
    
    res.json(connections);
  });
  
  app.get('/api/platforms/token-health', async (req: Request, res: Response) => {
    if (!(req as any).user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({ success: true, platforms: [], anyNeedsReauth: false });
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
    (req as any).user = { id: userId };
    next();
  };
}
