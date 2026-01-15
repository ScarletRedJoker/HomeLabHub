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

// CORS Configuration - Use APP_URL env variable
const APP_URL = getEnv('APP_URL', 'https://stream.evindrake.net');
const allowedOrigins = [
  APP_URL,
  NODE_ENV === 'development' ? 'http://localhost:5173' : null,
  NODE_ENV === 'development' ? 'http://localhost:5000' : null,
].filter(Boolean) as string[];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate Limiting - Production-ready configuration
// NOTE: Rate limiters run BEFORE session middleware to prevent DoS on session store
// Higher limits account for dashboard polling and shared IPs behind Caddy/Cloudflare
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // High limit: dashboard polls ~5 endpoints every 5s = ~900 req/15min per user
  message: { error: '429: Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks, static assets, and overlay endpoints
    // Overlay endpoints are called by OBS and should never be rate limited
    return req.path === '/health' || 
           req.path.startsWith('/assets/') ||
           req.path.includes('/overlay/');
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // Allow enough requests for OAuth multi-step flows
  message: { error: '429: Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful OAuth redirects against limit
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
// 
// SESSION FIX (Jan 2026): Changed resave/saveUninitialized to true for OAuth state persistence.
// OAuth flows need the session saved immediately to store state tokens before redirect.
export const sessionMiddleware = session({
  store: new PgSession({
    pool: pool as any,
    tableName: "user_sessions",
    createTableIfMissing: true,
  }),
  secret: SESSION_SECRET || "streambot-insecure-default-change-immediately",
  resave: true, // Save session to persist OAuth state
  saveUninitialized: true, // Create session immediately for OAuth
  proxy: true,
  cookie: {
    secure: NODE_ENV === "production", // Explicit boolean for clarity
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    sameSite: NODE_ENV === "production" ? "none" : "lax",
    domain: NODE_ENV === "production" ? (process.env.COOKIE_DOMAIN || ".evindrake.net") : undefined,
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
      // Suppress expected 401s from overlay endpoints (expired tokens are normal for OBS overlays)
      const isOverlayTokenExpired = path.includes('/overlay/') && 
        res.statusCode === 401 && 
        capturedJsonResponse?.error?.includes('expired');
      
      if (isOverlayTokenExpired) {
        // Don't log expected overlay token expirations - they spam logs
        return;
      }

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

/**
 * Handle legacy /success/* paths that should be query parameters
 * 
 * REDIRECT FIX (Jan 2026): Some OAuth flows were incorrectly redirecting to
 * /success/twitch_connected instead of /?success=twitch_connected
 * This handler catches those and redirects properly to the frontend.
 */
app.get('/success/:action', (req, res) => {
  const action = req.params.action;
  console.log(`[Legacy Route] Redirecting /success/${action} to /settings?success=${action}`);
  res.redirect(`/settings?success=${action}`);
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

  // Initialize announcement scheduler for scheduled messages
  const { startAnnouncementScheduler } = await import('./announcement-scheduler');
  startAnnouncementScheduler();
  log('Announcement scheduler started');

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

    // Stop announcement scheduler
    const { stopAnnouncementScheduler } = await import('./announcement-scheduler');
    stopAnnouncementScheduler();
    
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

  // Register with service registry
  registerStreamBotService(port);
})();

async function registerStreamBotService(port: number): Promise<void> {
  const registryUrl = process.env.DASHBOARD_REGISTRY_URL || "https://dashboard.evindrake.net/api/registry";
  const serviceName = "stream-bot";
  const capabilities = ["stream-bot", "twitch", "youtube", "spotify", "overlay"];
  const heartbeatInterval = 30000;
  
  let heartbeatTimer: NodeJS.Timeout | null = null;
  
  async function doRegister(): Promise<boolean> {
    try {
      const host = process.env.APP_URL || `http://localhost:${port}`;
      const endpoint = host.startsWith("http") ? host : `https://${host}`;
      
      const response = await fetch(registryUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          name: serviceName,
          capabilities,
          endpoint,
          metadata: {
            environment: process.env.NODE_ENV === "production" ? "linode" : "replit",
            version: "1.0.0",
            startedAt: new Date().toISOString(),
          },
        }),
      });
      
      if (response.ok) {
        log("Registered with service registry");
        return true;
      }
      return false;
    } catch (error) {
      log(`Service registry unavailable: ${error}`);
      return false;
    }
  }
  
  async function sendHeartbeat(): Promise<void> {
    try {
      const response = await fetch(registryUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "heartbeat", name: serviceName }),
      });
      
      if (!response.ok) {
        await doRegister();
      }
    } catch {
      // Silent fail for heartbeats
    }
  }
  
  const registered = await doRegister();
  if (registered) {
    heartbeatTimer = setInterval(sendHeartbeat, heartbeatInterval);
  } else {
    setTimeout(async () => {
      if (await doRegister()) {
        heartbeatTimer = setInterval(sendHeartbeat, heartbeatInterval);
      }
    }, 30000);
  }
}
