import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import cors from "cors";
import rateLimit from "express-rate-limit";
import passport from "./auth/passport-oauth-config";
import { registerRoutes } from "./routes";
import { serveStatic, log as httpLog } from "./http";
import { pool } from "./db";
import { getEnv } from "./env";
import { logger, getHealthStatus } from "./health";

// Replace http log with winston logger
const log = (message: string) => logger.info(message, { component: 'http' });

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

// PRODUCTION SECURITY: Validate SESSION_SECRET in production
if (NODE_ENV === 'production' && !SESSION_SECRET) {
  logger.error("FATAL: SESSION_SECRET environment variable is required for production!", {
    component: 'startup'
  });
  logger.error("Generate one with: openssl rand -base64 32", { component: 'startup' });
  process.exit(1);
}

if (!SESSION_SECRET && NODE_ENV !== 'production') {
  logger.warn("SESSION_SECRET or STREAMBOT_SESSION_SECRET not set! Using insecure default for development.", {
    component: 'startup'
  });
}

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
export const sessionMiddleware = session({
  store: new PgSession({
    pool: pool as any,
    tableName: "user_sessions",
    createTableIfMissing: true,
  }),
  secret: SESSION_SECRET || "streambot-insecure-default-change-immediately",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: NODE_ENV === "production",
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
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
  const server = await registerRoutes(app);

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
