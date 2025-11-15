/**
 * Main Server Entry Point
 * 
 * Initializes and configures the Express application server with all necessary middleware,
 * authentication, API routes, and static file serving.
 * 
 * Key Components:
 * - Express web server with JSON/URL-encoded body parsing
 * - Discord OAuth authentication via Passport
 * - PostgreSQL database connection
 * - Discord bot integration
 * - API request logging
 * - Vite dev server (development) or static file serving (production)
 * - WebSocket support for real-time updates
 * 
 * Environment Variables Required:
 * - SESSION_SECRET: Secret key for session encryption
 * - DISCORD_CLIENT_ID: Discord OAuth client ID
 * - DISCORD_CLIENT_SECRET: Discord OAuth client secret
 * - DISCORD_CALLBACK_URL or REPLIT_DEV_DOMAIN: OAuth callback URL
 * - DATABASE_URL: PostgreSQL connection string
 * 
 * @module server/index
 */

import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { setupAuth } from "./auth";
import { dbStorage as storage } from "./database-storage";
import * as dotenv from 'dotenv';
import { db } from "./db";

/**
 * Logging utility function
 * Formats and logs messages with timestamp and source
 */
function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

/**
 * Load environment variables from .env file
 * Must be called before accessing process.env values
 */
dotenv.config();

/**
 * PRODUCTION SECURITY: Validate SESSION_SECRET
 */
const NODE_ENV = process.env.NODE_ENV || 'development';
const SESSION_SECRET = process.env.SESSION_SECRET;

if (NODE_ENV === 'production' && !SESSION_SECRET) {
  console.error("=".repeat(60));
  console.error("FATAL: SESSION_SECRET environment variable is required for production!");
  console.error("Generate one with: openssl rand -base64 32");
  console.error("=".repeat(60));
  process.exit(1);
}

if (!SESSION_SECRET && NODE_ENV !== 'production') {
  console.warn("⚠️  WARNING: SESSION_SECRET not set! Using insecure default for development.");
}

/**
 * Auto-configure APP_URL from DISCORD_CALLBACK_URL if not explicitly set
 * 
 * Why this is needed:
 * - Some parts of the app need the base URL (APP_URL)
 * - Discord OAuth requires a callback URL (DISCORD_CALLBACK_URL)
 * - We can derive APP_URL from DISCORD_CALLBACK_URL to reduce config duplication
 * - Prevents configuration errors where callback works but app doesn't know its own URL
 */
if (!process.env.APP_URL && process.env.DISCORD_CALLBACK_URL) {
  try {
    const url = new URL(process.env.DISCORD_CALLBACK_URL);
    process.env.APP_URL = `${url.protocol}//${url.host}`;
    console.log('Set APP_URL from DISCORD_CALLBACK_URL:', process.env.APP_URL);
  } catch (error) {
    console.error('Failed to parse DISCORD_CALLBACK_URL:', error);
  }
}

/**
 * Initialize Express application
 */
const app = express();

/**
 * Trust proxy configuration (required for rate limiting behind reverse proxy)
 */
app.set('trust proxy', 1);

/**
 * CORS Configuration
 */
const allowedOrigins = [
  'https://bot.rig-city.com',
  NODE_ENV === 'development' ? 'http://localhost:5173' : null,
  NODE_ENV === 'development' ? 'http://localhost:5000' : null,
].filter(Boolean) as string[];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

/**
 * Security Headers Middleware
 * 
 * Adds critical security headers to protect against common web vulnerabilities:
 * - X-Frame-Options: Prevents clickjacking by disabling iframe embedding
 * - X-Content-Type-Options: Prevents MIME-sniffing attacks
 * - X-XSS-Protection: Legacy XSS filter for older browsers (CSP is primary defense)
 * - Referrer-Policy: Controls referrer information sent with requests
 * - Permissions-Policy: Disables unnecessary browser features
 * - Content-Security-Policy: Primary XSS defense (strict policy)
 */
app.use((req, res, next) => {
  // Prevent clickjacking - don't allow our site to be embedded in iframes
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME-sniffing - browser must respect declared Content-Type
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS filter in older browsers (defense in depth)
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Control referrer information
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Disable unnecessary browser features
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  /**
   * Content Security Policy (CSP)
   * 
   * Strict policy to prevent XSS attacks:
   * - default-src 'self': Only load resources from our domain by default
   * - script-src 'self' 'unsafe-inline': Allow inline scripts (needed for Vite dev)
   * - style-src 'self' 'unsafe-inline': Allow inline styles (needed for React)
   * - img-src 'self' data: https: Allow images from our domain, data URIs, and HTTPS
   * - connect-src 'self' wss: Allow WebSocket connections and same-origin fetch/XHR
   * - font-src 'self': Only load fonts from our domain
   * - object-src 'none': Disable Flash and other plugins
   * - frame-ancestors 'none': Redundant with X-Frame-Options but CSP takes precedence
   * 
   * Note: 'unsafe-inline' for scripts/styles is needed for Vite/React dev mode
   * In production, consider stricter policy with nonces or hashes
   */
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https: cdn.discordapp.com; " +
    "connect-src 'self' wss: https:; " +
    "font-src 'self'; " +
    "object-src 'none'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'"
  );
  
  next();
});

/**
 * Rate Limiting
 */
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

/**
 * Body parsing middleware
 * - express.json(): Parses incoming JSON payloads (for API requests)
 * - express.urlencoded(): Parses URL-encoded form data
 */
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

/**
 * Apply rate limiters to routes
 * CRITICAL: Must be registered BEFORE setupAuth() to properly rate-limit auth endpoints
 */
app.use('/api/', apiLimiter);
app.use('/auth/', authLimiter);

/**
 * Set up authentication system
 * Configures Passport.js with Discord OAuth strategy, session management,
 * and authentication routes. Requires database storage for user persistence.
 */
setupAuth(app, storage);

/**
 * API Request Logging Middleware
 * 
 * Logs all API requests with timing information and response data.
 * Only logs routes starting with /api to avoid cluttering logs with static file requests.
 * 
 * Logged Information:
 * - HTTP method (GET, POST, etc.)
 * - Request path
 * - Response status code
 * - Request duration in milliseconds
 * - Response body (JSON) for debugging
 * 
 * Why we intercept res.json:
 * - Response body isn't available in 'finish' event
 * - We wrap res.json to capture the response data before sending
 * - This allows us to log exactly what was sent to the client
 */
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  // Intercept res.json to capture response data
  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  // Log when response is finished
  res.on("finish", () => {
    const duration = Date.now() - start;
    
    // Only log API routes to reduce noise
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      
      // Include response body if available
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      // Truncate long log lines for readability
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

/**
 * Async IIFE (Immediately Invoked Function Expression)
 * 
 * Why async IIFE:
 * - registerRoutes and setupVite are async functions
 * - Top-level await isn't available in all environments
 * - Wrapping in async function allows us to use await
 */
(async () => {
  /**
   * Register all API routes and initialize Discord bot
   * Returns HTTP server instance with WebSocket support
   */
  const server = await registerRoutes(app);

  /**
   * Global Error Handler
   * 
   * Catches any errors thrown in route handlers and sends appropriate HTTP responses.
   * Must be registered after all routes to catch errors from them.
   * 
   * Error format:
   * - Attempts to extract status code from error object
   * - Defaults to 500 (Internal Server Error) if not specified
   * - Sends JSON response with error message
   */
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    console.error("Express error handler:", err);
  });

  /**
   * Development vs Production Static File Serving
   * 
   * Why this separation:
   * - Development: Use Vite dev server for HMR (Hot Module Replacement) and fast refresh
   * - Production: Serve pre-built static files from dist folder
   * 
   * Order matters:
   * - Must be set up AFTER all API routes
   * - Vite/static server acts as catch-all for frontend routes
   * - If registered before API routes, would catch API requests
   * 
   * Dynamic imports:
   * - Import vite.ts dynamically to avoid loading Vite in production
   * - This prevents "Cannot find package 'vite'" errors in production builds
   * - Static file serving is in a separate module to avoid any vite dependencies
   */
  if (app.get("env") === "development") {
    const { setupVite } = await import("./vite.js");
    await setupVite(app, server);
  } else {
    const { serveStatic } = await import("./static.js");
    serveStatic(app);
  }

  /**
   * Port Configuration
   * 
   * Preferred port: 5000 (required for Replit port forwarding)
   * Fallback: Use PORT environment variable if set
   */
  const preferredPort = 5000;
  const port = process.env.PORT ? parseInt(process.env.PORT) : preferredPort;
  
  /**
   * Server error handler
   * 
   * Handles EADDRINUSE (port already in use) gracefully by using a random available port.
   * Other errors cause the process to exit.
   */
  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is already in use, trying an available port...`);
      
      /**
       * Bind to port 0 to let OS assign an available port
       * 
       * Why port 0:
       * - OS automatically picks an available port
       * - Prevents bind conflicts
       * - Useful for development when port 5000 is busy
       */
      server.listen({
        port: 0,
        host: "0.0.0.0",
        reusePort: true,
      }, () => {
        const actualPort = (server.address() as any).port;
        log(`serving on port ${actualPort} (port ${port} was busy)`);
      });
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });
  
  /**
   * Start the server
   * 
   * Configuration:
   * - host: "0.0.0.0" - Listen on all network interfaces (required for Docker/cloud)
   * - reusePort: true - Allows multiple processes to bind to same port (load balancing)
   * - port: Preferred port 5000 or from environment
   */
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
  
  /**
   * Graceful shutdown handlers
   * 
   * Clean up resources when the process exits to prevent memory leaks:
   * - Clear background job intervals
   * - Destroy Discord client
   * - Close database connections
   */
  async function gracefulShutdown(signal: string) {
    console.log(`\n${signal} received. Starting graceful shutdown...`);
    
    try {
      // Import cleanup functions dynamically
      const { stopBot } = await import('./discord/bot');
      
      // Stop bot and cleanup resources
      stopBot();
      
      // Close HTTP server
      server.close(() => {
        console.log('HTTP server closed');
      });
      
      // Give cleanup a chance to complete
      setTimeout(() => {
        console.log('Graceful shutdown complete');
        process.exit(0);
      }, 1000);
    } catch (error) {
      console.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }
  
  // Register shutdown handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
})();
