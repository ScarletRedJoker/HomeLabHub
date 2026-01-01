import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import cors from "cors";
import rateLimit from "express-rate-limit";
import passport from "./auth/passport-oauth-config";
import { registerRoutes } from "./routes";
import { serveStatic, log } from "./http";
import { pool } from "./db";
import { getEnv } from "./env";
import { validateEnvironment } from "./utils/env-validator";

/**
 * Validate all required environment variables early in startup
 * In production, exits if required secrets are missing
 * In development, warns but continues
 */
validateEnvironment();

const app = express();
const PgSession = connectPg(session);

// Trust proxy configuration (required for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Get environment variables with STREAMBOT_ fallback
const NODE_ENV = getEnv('NODE_ENV', 'development');
const SESSION_SECRET = getEnv('SESSION_SECRET');

// CRITICAL: Set NODE_ENV so Express and dynamic imports use correct mode
process.env.NODE_ENV = NODE_ENV;
app.set('env', NODE_ENV);

// CORS Configuration
const allowedOrigins = [
  'https://stream.rig-city.com',
  NODE_ENV === 'development' ? 'http://localhost:5173' : null,
  NODE_ENV === 'development' ? 'http://localhost:5000' : null,
].filter(Boolean) as string[];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // only 5 login attempts per 15 minutes
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

// Apply rate limiters to routes
// CRITICAL: Rate limiters MUST run BEFORE session middleware to prevent
// throttled requests from creating sessions and hitting the session store
app.use('/api/', apiLimiter);
app.use('/auth/', authLimiter);

// Export session middleware for WebSocket authentication
// IMPORTANT: In production, Caddy terminates TLS and forwards plain HTTP to this service.
// We set trust proxy above, so Express knows the original request was HTTPS.
// Setting secure: "auto" lets Express infer from req.secure (which respects X-Forwarded-Proto).
export const sessionMiddleware = session({
  store: new PgSession({
    pool: pool as any,
    tableName: "user_sessions",
    createTableIfMissing: true,
  }),
  secret: SESSION_SECRET || "streambot-insecure-default-change-immediately",
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    secure: "auto" as any,
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    sameSite: NODE_ENV === "production" ? "none" : "lax",
    domain: NODE_ENV === "production" ? ".rig-city.com" : undefined,
  },
});

app.use(sessionMiddleware);

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Create default development user for testing without OAuth
  async function ensureDevUser() {
    if (NODE_ENV !== 'development') {
      return;
    }

    try {
      const { db } = await import('./db');
      const { users } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');

      const devUserId = 'dev-user-00000000-0000-0000-0000-000000000000';
      const devEmail = 'dev@stream-bot.local';

      // Check if dev user already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, devUserId))
        .limit(1);

      if (!existingUser) {
        // Create dev user
        await db.insert(users).values({
          id: devUserId,
          email: devEmail,
          passwordHash: null,
          primaryPlatform: null,
          role: 'admin',
          isActive: true,
          onboardingCompleted: true,
          onboardingStep: 4,
          dismissedWelcome: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        console.log('✓ Created default development user (dev@stream-bot.local)');
      } else {
        console.log('✓ Development user already exists');
      }
    } catch (error) {
      console.error('❌ Failed to create development user:', error);
    }
  }

  // Validate OAuth environment variables at startup
  function validateOAuthEnvironment() {
    console.log('\n' + '='.repeat(60));
    console.log('Validating OAuth Configuration...');
    console.log('='.repeat(60));

    const platforms = [
      {
        name: 'Twitch',
        vars: ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET', 'TWITCH_REDIRECT_URI'],
      },
      {
        name: 'YouTube',
        vars: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REDIRECT_URI'],
      },
      {
        name: 'Spotify',
        vars: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'SPOTIFY_REDIRECT_URI'],
      },
      {
        name: 'Kick',
        vars: ['KICK_CLIENT_ID', 'KICK_CLIENT_SECRET'],
        optional: true,
      },
    ];

    let hasWarnings = false;

    for (const platform of platforms) {
      const missing = platform.vars.filter(varName => !getEnv(varName));
      const isOptional = (platform as any).optional === true;
      
      if (missing.length > 0) {
        if (isOptional) {
          console.log(`○ ${platform.name} OAuth not configured (optional)`);
        } else {
          hasWarnings = true;
          console.warn(`\n⚠️  ${platform.name} OAuth NOT configured`);
          console.warn(`   Missing environment variables: ${missing.join(', ')}`);
          console.warn(`   Users will NOT be able to connect ${platform.name} accounts.`);
          console.warn(`   Set these variables or use STREAMBOT_ prefix variants.`);
        }
      } else {
        console.log(`✓ ${platform.name} OAuth configured`);
      }
    }

    console.log('='.repeat(60) + '\n');

    if (hasWarnings && NODE_ENV === 'production') {
      console.warn('⚠️  WARNING: Some OAuth platforms are not configured in production!');
      console.warn('   This may limit user functionality.\n');
    }
  }

  validateOAuthEnvironment();

  // Create default dev user in development mode
  await ensureDevUser();

  const server = await registerRoutes(app);

  // Initialize OAuth session cleanup
  const { startOAuthCleanupJob } = await import('./oauth-storage-db');
  startOAuthCleanupJob();
  log('OAuth session cleanup job started');

  // Initialize webhook retry service for durable Discord notifications
  const { startWebhookRetryService } = await import('./webhook-retry-service');
  startWebhookRetryService();
  log('Webhook retry service started');

  // Check OpenAI availability for fact generation (manual triggers and scheduled intervals)
  try {
    const openaiModule = await import('./openai');
    const { isOpenAIEnabled } = openaiModule;
    
    if (isOpenAIEnabled) {
      log('[Facts] ✓ OpenAI configured - facts available via dashboard, !fact command, or scheduled intervals');
    } else {
      log('[Facts] ⚠ OpenAI not configured - fact generation disabled');
    }
  } catch (error) {
    log(`[Facts] ✗ Failed to check OpenAI availability: ${error instanceof Error ? error.message : String(error)}`);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    const { setupVite } = await import("./vite.dev.js");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(getEnv('PORT', '5000'), 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });

  // Graceful shutdown handlers
  async function gracefulShutdown(signal: string) {
    log(`${signal} received, shutting down gracefully...`);
    
    // Stop token refresh service
    const { tokenRefreshService } = await import('./token-refresh-service');
    tokenRefreshService.stop();
    
    // Stop webhook retry service
    const { stopWebhookRetryService } = await import('./webhook-retry-service');
    stopWebhookRetryService();
    
    server.close(async () => {
      try {
        await pool.end();
        log('Database connections closed');
        log('Server closed successfully');
        process.exit(0);
      } catch (error) {
        log(`Error during shutdown: ${error}`);
        process.exit(1);
      }
    });

    // Force close after 10 seconds
    setTimeout(() => {
      log('Forcing shutdown after timeout');
      process.exit(1);
    }, 10000);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
})();
