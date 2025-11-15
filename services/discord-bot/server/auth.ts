/**
 * Authentication Module
 * 
 * Implements Discord OAuth authentication using Passport.js for the ticket management system.
 * Manages user sessions, permissions, and onboarding flow.
 * 
 * Key Features:
 * - Discord OAuth 2.0 integration via passport-discord
 * - Session management with secure cookies
 * - Admin permission detection based on Discord server roles
 * - User onboarding for first-time admins
 * - Server access validation (user must be admin on servers where bot is present)
 * - Automatic session serialization/deserialization
 * 
 * Authentication Flow:
 * 1. User clicks "Login with Discord" → redirected to /auth/discord
 * 2. Discord OAuth page → user authorizes app
 * 3. Discord redirects to callback URL with authorization code
 * 4. Passport exchanges code for access token and user profile
 * 5. Strategy callback creates/updates user in database
 * 6. User is serialized to session
 * 7. Subsequent requests deserialize user from session
 * 
 * Security Considerations:
 * - SESSION_SECRET must be set (enforced with process.exit)
 * - Secure cookies in production (httpOnly, sameSite: 'lax')
 * - Trust proxy for proper HTTPS detection
 * - Session expiry after 24 hours
 * 
 * @module server/auth
 */

import { Express, Request, Response, NextFunction } from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import MemoryStore from 'memorystore';
import { IStorage } from './storage';
import { getBotGuilds } from './discord/bot';

/**
 * Configure in-memory session store
 * 
 * Why MemoryStore:
 * - Simple, no external dependencies (Redis, etc.)
 * - Suitable for single-instance deployments
 * - Sessions are lost on server restart (acceptable for this use case)
 * 
 * For production multi-instance:
 * - Consider Redis, PostgreSQL-based store, or similar
 * - Enables session sharing across multiple server processes
 */
const SessionStore = MemoryStore(session);

/**
 * Set up authentication system
 * 
 * Configures Express middleware for session management and Discord OAuth.
 * Sets up Passport strategies, serialization, and authentication routes.
 * 
 * @param {Express} app - Express application instance
 * @param {IStorage} storage - Database storage interface for user persistence
 * 
 * @throws {Error} Exits process if SESSION_SECRET is not set
 */
export function setupAuth(app: Express, storage: IStorage): void {
  /**
   * Trust proxy configuration
   * 
   * Why trust proxy:
   * - App runs behind reverse proxy (nginx, Replit's proxy, etc.)
   * - Proxy sets X-Forwarded-Proto header to indicate original protocol (http/https)
   * - Without this, req.protocol would always be 'http' even when accessed via HTTPS
   * - Required for secure cookies to work properly
   */
  app.set('trust proxy', 1);
  
  /**
   * Validate SESSION_SECRET exists
   * 
   * Why this is critical:
   * - SESSION_SECRET signs session IDs to prevent tampering
   * - Without it, sessions are vulnerable to forgery attacks
   * - Exit immediately rather than running with weak security
   */
  if (!process.env.SESSION_SECRET) {
    console.error('SESSION_SECRET environment variable is required for session security');
    process.exit(1);
  }

  /**
   * Configure session middleware
   * 
   * Options:
   * - secret: Signs the session ID cookie (prevent tampering)
   * - resave: false - Don't save session if unmodified (performance)
   * - saveUninitialized: false - Don't create session until something is stored (GDPR, performance)
   * - cookie.maxAge: 86400000ms = 24 hours - Session expires after 1 day
   * - cookie.secure: true in production - Only send cookie over HTTPS
   * - cookie.sameSite: 'lax' - CSRF protection while allowing OAuth redirects
   * - cookie.httpOnly: true - Prevent JavaScript access to cookie (XSS protection)
   * - store: In-memory store with daily cleanup of expired sessions
   */
  app.use(
    session({
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 86400000, // 1 day
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        httpOnly: true
      },
      store: new SessionStore({ checkPeriod: 86400000 }) // prune expired entries every 24h
    })
  );

  /**
   * Initialize Passport.js
   * 
   * - passport.initialize(): Sets up Passport to work with Express
   * - passport.session(): Enables persistent login sessions
   *   (user data is serialized/deserialized from session)
   */
  app.use(passport.initialize());
  app.use(passport.session());

  /**
   * Discord OAuth Strategy Configuration
   * 
   * Sets up passport-discord strategy only if credentials are provided.
   * This allows the app to run without Discord auth for development/testing.
   */
  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
    console.log('Setting up Discord authentication strategy');
    
    /**
     * Determine OAuth callback URL
     * 
     * Priority order:
     * 1. DISCORD_CALLBACK_URL (explicit override, e.g., custom domain)
     * 2. REPLIT_DEV_DOMAIN (Replit's auto-generated domain)
     * 3. localhost:5000 (local development fallback)
     * 
     * Why this matters:
     * - Discord only allows whitelisted redirect URIs
     * - The callback URL must exactly match what's registered in Discord Developer Portal
     * - Different environments (local, Replit, production) need different URLs
     */
    let callbackURL;
    if (process.env.DISCORD_CALLBACK_URL && process.env.DISCORD_CALLBACK_URL.startsWith('http')) {
      callbackURL = process.env.DISCORD_CALLBACK_URL;
    } else if (process.env.REPLIT_DEV_DOMAIN) {
      callbackURL = `https://${process.env.REPLIT_DEV_DOMAIN}/auth/discord/callback`;
    } else {
      callbackURL = 'http://localhost:5000/auth/discord/callback';
    }
    
    console.log('Discord OAuth callback URL:', callbackURL);
    
    try {
      /**
       * Discord OAuth Strategy Configuration
       * 
       * Scopes requested:
       * - 'identify': Get user's Discord ID, username, avatar
       * - 'guilds': Get list of servers user is in (needed to check admin status)
       */
      const strategyConfig = {
        clientID: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
        callbackURL: callbackURL,
        scope: ['identify', 'guilds']
      };
      
      /**
       * Passport Discord Strategy
       * 
       * This callback is invoked after Discord OAuth succeeds.
       * It receives user profile data and must return a user object for the session.
       * 
       * Responsibilities:
       * 1. Create or retrieve user from database
       * 2. Check admin permissions based on Discord guilds
       * 3. Calculate connected servers (admin guilds where bot is present)
       * 4. Update user record with latest data
       * 5. Return user for session serialization
       * 
       * @param accessToken - OAuth access token (not used, but required by passport)
       * @param refreshToken - OAuth refresh token (not used, but required by passport)
       * @param profile - Discord user profile with guilds data
       * @param done - Callback to signal completion
       */
      passport.use(
        new DiscordStrategy(
          strategyConfig,
          async (accessToken, refreshToken, profile, done) => {
            try {
              console.log(`Discord auth: Processing login for user ${profile.username}#${profile.discriminator}`);
              console.log('Discord auth: Profile data:', { id: profile.id, username: profile.username, guilds: Array.isArray(profile.guilds) ? profile.guilds.length : 'none' });
              
              /**
               * SECURITY: Atomically retrieve or create user in database
               * 
               * Why use atomic operation:
               * - Prevents race condition between getUser and createUser
               * - Similar vulnerability as Stream Bot: concurrent requests could create duplicates
               * - Database transaction ensures only one user record is created per Discord ID
               * - Prevents account hijacking if Discord ID gets reassigned
               * 
               * Why create if not exists:
               * - First-time users need a database record
               * - Stores user profile data and preferences
               * - Tracks onboarding status and permissions
               */
              const { user, created } = await storage.findOrCreateDiscordUserAtomic(profile.id, {
                id: profile.id,
                username: profile.username,
                discriminator: profile.discriminator,
                avatar: profile.avatar,
                isAdmin: null // Will be updated after checking guild permissions
              });
              
              if (created) {
                console.log(`Discord auth: Created new user for ${profile.username}`);
              } else {
                console.log(`Discord auth: Found existing user for ${profile.username}`);
              }
              
              /**
               * Determine admin status and collect admin guilds
               * 
               * Admin Detection Logic:
               * - User must have ADMINISTRATOR permission (bit flag 0x8) OR be server owner
               * - Checks all guilds from Discord OAuth 'guilds' scope
               * - isAdmin = true if user is admin in ANY guild
               * 
               * Why check permissions with BigInt:
               * - Discord permissions are 64-bit integers
               * - JavaScript numbers are unsafe for >53-bit values
               * - BigInt ensures accurate bitwise operations
               * - Bit 3 (0x8) = ADMINISTRATOR permission
               */
              let isAdmin = false;
              let adminGuilds: any[] = [];
              
              // Process guilds data if available
              if (Array.isArray(profile.guilds)) {
                // Filter to only guilds where user has admin permissions
                adminGuilds = profile.guilds.filter((guild: any) => {
                  // Check if user has ADMINISTRATOR permission or is the owner
                  let hasAdminPerm = false;
                  try {
                    /**
                     * Parse Discord permissions bitfield
                     * 
                     * Permissions come as either string or number from Discord API
                     * We convert to BigInt and check bit 3 (ADMINISTRATOR = 0x8)
                     */
                    const permissions = typeof guild.permissions === 'string' 
                      ? BigInt(guild.permissions) 
                      : BigInt(guild.permissions || 0);
                    hasAdminPerm = (permissions & BigInt(8)) !== BigInt(0);
                  } catch (error) {
                    console.warn(`Failed to parse permissions for guild ${guild.id}:`, error);
                  }
                  return hasAdminPerm || guild.owner;
                });
                
                isAdmin = adminGuilds.length > 0;
                console.log(`Discord auth: User ${profile.username} admin status: ${isAdmin} (${adminGuilds.length} admin guilds)`);
              } else {
                console.log('Discord auth: Could not determine admin status - missing guilds data');
              }
              
              /**
               * Calculate connected servers (intersection of admin guilds and bot guilds)
               * 
               * Why this calculation:
               * - User can only manage tickets for servers where:
               *   1. They are an admin
               *   2. The bot is present in that server
               * - This prevents users from seeing servers they don't manage
               * - Ensures bot can actually create/manage tickets there
               * 
               * Error handling:
               * - If bot guild fetch fails, preserve existing connectedServers
               * - Prevents accidentally removing user's access on temporary errors
               */
              let connectedServersToUpdate: string | null = null;
              try {
                const botGuilds = await getBotGuilds();
                const botGuildIds = botGuilds.map(guild => guild.id);
                const adminGuildIds = adminGuilds.map(guild => guild.id);
                
                /**
                 * Intersection calculation
                 * 
                 * connectedServers = adminGuildIds ∩ botGuildIds
                 * Only includes servers where user is admin AND bot is present
                 */
                const calculatedServers = adminGuildIds.filter(id => botGuildIds.includes(id));
                connectedServersToUpdate = JSON.stringify(calculatedServers);
                
                console.log(`Discord auth: User ${profile.username} has access to ${calculatedServers.length} server(s) where bot is present`);
                if (calculatedServers.length > 0) {
                  console.log(`Discord auth: Connected servers: ${calculatedServers.join(', ')}`);
                }
              } catch (error) {
                console.error('Discord auth: Failed to fetch bot guilds, preserving existing connectedServers:', error);
                /**
                 * Preserve existing connectedServers on error
                 * 
                 * Why not update:
                 * - Bot might be temporarily unreachable
                 * - Network issues could be transient
                 * - Better to keep old (possibly stale) data than clear user access
                 */
                connectedServersToUpdate = null;
              }
              
              /**
               * Update user record with latest data
               * 
               * Updates on every login:
               * - isAdmin: Current admin status based on Discord permissions
               * - lastSeenAt: Tracks user activity for analytics/cleanup
               * - adminGuilds: List of servers where user is admin (for UI display)
               * - connectedServers: Only if bot guild fetch succeeded
               * - onboardingCompleted: false for new users (triggers onboarding flow)
               */
              const currentTime = new Date();
              const updates: any = { 
                isAdmin,
                lastSeenAt: currentTime,
                /**
                 * Store admin guilds as JSON string
                 * 
                 * Why JSON:
                 * - PostgreSQL text column can store JSON
                 * - Alternative would be separate guilds table (more complex)
                 * - Parsed back to objects in deserializeUser
                 */
                adminGuilds: JSON.stringify(adminGuilds.map(guild => ({
                  id: guild.id,
                  name: guild.name,
                  icon: guild.icon,
                  owner: guild.owner
                })))
              };

              // Only update connectedServers if bot guilds fetch was successful
              if (connectedServersToUpdate !== null) {
                updates.connectedServers = connectedServersToUpdate;
              }

              /**
               * Initialize onboarding state for new users
               * 
               * Why check if not completed:
               * - New users need onboarding flow
               * - Don't override existing value (might be true from previous login)
               */
              if (!user.onboardingCompleted) {
                updates.onboardingCompleted = false;
              }

              await storage.updateDiscordUser(profile.id, updates);
              
              /**
               * Fetch updated user and return to Passport
               * 
               * Why refetch:
               * - Ensures we have the exact data that was saved
               * - Database might have triggers/defaults that modify data
               * - Provides consistency guarantees
               */
              const updatedUser = await storage.getDiscordUser(profile.id);
              return done(null, updatedUser);
            } catch (error) {
              console.error('Discord auth: Error during authentication process:', error);
              return done(error);
            }
          }
        )
      );
    } catch (error) {
      console.error('Failed to set up Discord authentication strategy:', error);
    }
  } else {
    const missing = [];
    if (!process.env.DISCORD_CLIENT_ID) missing.push('DISCORD_CLIENT_ID');
    if (!process.env.DISCORD_CLIENT_SECRET) missing.push('DISCORD_CLIENT_SECRET');
    console.warn(`Discord OAuth credentials not provided: ${missing.join(', ')}. Discord login will not work.`);
  }

  /**
   * Serialize user to session
   * 
   * Called after successful authentication to determine what to store in the session.
   * We only store the user ID to keep sessions lightweight.
   * 
   * Why only store ID:
   * - Sessions should be minimal (memory/storage efficiency)
   * - User data changes (permissions, avatar, etc.) - we need fresh data on each request
   * - ID is immutable and sufficient to lookup full user
   */
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  /**
   * Deserialize user from session
   * 
   * Called on every authenticated request to reconstruct user object from session data.
   * Fetches full user data from database using the stored ID.
   * 
   * Responsibilities:
   * 1. Look up user by ID from database
   * 2. Parse JSON columns (connectedServers, adminGuilds) back to objects
   * 3. Return full user object to attach to req.user
   * 
   * Why deserialize on every request:
   * - Ensures permissions are always current
   * - Detects if user was deleted from database
   * - Provides fresh data (no stale cache issues)
   * 
   * Performance consideration:
   * - This runs on EVERY authenticated request
   * - Database query per request (could cache if needed)
   * - Trade-off: Consistency vs performance (we chose consistency)
   */
  passport.deserializeUser(async (id: string, done) => {
    try {
      console.log(`Discord auth: Deserializing user ${id}`);
      const user = await storage.getDiscordUser(id);
      
      if (!user) {
        console.log(`Discord auth: User ${id} not found in database`);
        // User was deleted from database - invalidate session
        return done(null, false);
      }
      
      /**
       * Parse JSON columns to JavaScript objects
       * 
       * Why parse here:
       * - Database stores these as JSON strings
       * - Application code expects arrays/objects
       * - Parse once in deserialize, not in every route handler
       * - Centralizes parsing logic and error handling
       */
      let parsedConnectedServers = [];
      let parsedAdminGuilds = [];
      
      try {
        if (user.connectedServers && typeof user.connectedServers === 'string') {
          parsedConnectedServers = JSON.parse(user.connectedServers);
        }
      } catch (error) {
        console.error(`Failed to parse connectedServers for user ${id}:`, error);
        // Fall back to empty array on parse error
      }
      
      try {
        if (user.adminGuilds && typeof user.adminGuilds === 'string') {
          parsedAdminGuilds = JSON.parse(user.adminGuilds);
        }
      } catch (error) {
        console.error(`Failed to parse adminGuilds for user ${id}:`, error);
        // Fall back to empty array on parse error
      }
      
      /**
       * Return user object with parsed arrays
       * This object becomes req.user in route handlers
       */
      done(null, {
        ...user,
        connectedServers: parsedConnectedServers,
        adminGuilds: parsedAdminGuilds
      });
    } catch (error) {
      console.error(`Discord auth: Error deserializing user ${id}:`, error);
      done(error);
    }
  });

  /**
   * Authentication Routes
   * 
   * Sets up OAuth login flow endpoints.
   * Only configured if Discord credentials are present.
   */
  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
    /**
     * Discord OAuth Initiation Route
     * 
     * Manually constructs Discord OAuth URL and redirects user to Discord.
     * 
     * SECURITY: CSRF Protection with State Parameter
     * - Generates cryptographically random state token
     * - Stores in session before redirect
     * - Validated in callback to prevent CSRF attacks
     * 
     * Why manual redirect instead of passport.authenticate:
     * - Works around bugs in passport-discord v0.1.4
     * - Gives us full control over OAuth parameters
     * - Allows easy debugging of OAuth flow
     * 
     * Flow:
     * 1. User clicks "Login with Discord" button
     * 2. Frontend redirects to /auth/discord
     * 3. This handler generates state token and redirects to Discord OAuth page
     * 4. User authorizes app on Discord
     * 5. Discord redirects back to /auth/discord/callback with state
     * 6. Callback validates state matches session
     */
    app.get('/auth/discord', (req, res) => {
      const clientId = process.env.DISCORD_CLIENT_ID;
      
      /**
       * Generate CSRF state token
       * 
       * Why cryptographically secure random:
       * - Prevents attackers from guessing state values
       * - 32 bytes = 256 bits of entropy (highly secure)
       * - URL-safe base64 encoding
       */
      const crypto = require('crypto');
      const state = crypto.randomBytes(32).toString('base64url');
      
      /**
       * Store state in session for validation in callback
       * 
       * SECURITY: Critical for CSRF protection
       * - Session is server-side, attacker cannot access
       * - Will be validated in callback route
       */
      (req.session as any).oauthState = state;
      
      /**
       * Determine callback URL (same logic as strategy config)
       * Must match exactly with what's configured in Discord Developer Portal
       */
      let callbackURL;
      if (process.env.DISCORD_CALLBACK_URL && process.env.DISCORD_CALLBACK_URL.startsWith('http')) {
        callbackURL = process.env.DISCORD_CALLBACK_URL;
      } else if (process.env.REPLIT_DEV_DOMAIN) {
        callbackURL = `https://${process.env.REPLIT_DEV_DOMAIN}/auth/discord/callback`;
      } else {
        callbackURL = 'http://localhost:5000/auth/discord/callback';
      }
      
      /**
       * Build Discord OAuth URL with state parameter
       * 
       * Parameters:
       * - response_type=code: Use authorization code flow (most secure)
       * - client_id: Our Discord application ID
       * - redirect_uri: Where Discord sends user after authorization
       * - scope: Permissions we're requesting (identify + guilds)
       * - state: CSRF protection token (validated in callback)
       */
      const redirectUri = encodeURIComponent(callbackURL);
      const scope = encodeURIComponent('identify guilds');
      const encodedState = encodeURIComponent(state);
      
      const discordAuthUrl = `https://discord.com/api/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${encodedState}`;
      console.log('Discord OAuth redirect initiated with callback:', callbackURL);
      
      res.redirect(discordAuthUrl);
    });
    
    /**
     * Discord OAuth Callback Route
     * 
     * Discord redirects here after user authorizes the app.
     * Passport exchanges authorization code for access token and user profile.
     * 
     * SECURITY: CSRF State Validation
     * - Validates state parameter matches session value
     * - Prevents CSRF attacks during OAuth flow
     * - Rejects requests with missing or mismatched state
     * 
     * Success: User is logged in, redirected to homepage
     * Failure: Redirected to homepage (login button will still show)
     */
    app.get(
      '/auth/discord/callback',
      (req, res, next) => {
        /**
         * CSRF State Validation Middleware
         * 
         * SECURITY: Validate state parameter before processing OAuth callback
         * - Prevents CSRF attacks where attacker tricks user into authorizing attacker's account
         * - state parameter must match what we stored in session during /auth/discord
         */
        const receivedState = req.query.state as string;
        const sessionState = (req.session as any).oauthState;
        
        if (!receivedState || !sessionState || receivedState !== sessionState) {
          console.error('Discord OAuth: CSRF state validation failed', {
            hasReceivedState: !!receivedState,
            hasSessionState: !!sessionState,
            statesMatch: receivedState === sessionState
          });
          return res.redirect('/?error=oauth_csrf_validation_failed');
        }
        
        // Clear state from session after successful validation (one-time use)
        delete (req.session as any).oauthState;
        
        console.log('Discord OAuth: CSRF state validation passed');
        next();
      },
      passport.authenticate('discord', {
        failureRedirect: '/?error=discord_auth_failed' // Return to homepage if auth fails
      }),
      (_req, res) => {
        // Authentication succeeded, redirect to homepage
        console.log('Discord OAuth: Authentication successful, redirecting to homepage');
        res.redirect('/');
      }
    );
  } else {
    /**
     * Fallback routes when Discord OAuth is not configured
     * 
     * Returns 503 Service Unavailable instead of crashing.
     * Allows app to run without Discord auth for local development/testing.
     */
    app.get('/auth/discord', (_req, res) => {
      res.status(503).json({ message: 'Discord authentication not configured' });
    });
    
    app.get('/auth/discord/callback', (_req, res) => {
      res.status(503).json({ message: 'Discord authentication not configured' });
    });
  }
  
  /**
   * Logout Route
   * 
   * Destroys user's session and redirects to homepage.
   * User will need to re-authenticate on next protected route access.
   */
  app.get('/auth/logout', (req, res) => {
    req.logout(() => {
      res.redirect('/');
    });
  });
  
  /**
   * Get Current User Route
   * 
   * Returns the currently authenticated user's data.
   * Used by frontend to check auth status and get user info.
   * 
   * Returns:
   * - 200 + user object if authenticated
   * - 401 if not authenticated
   * 
   * Why check needsOnboarding here:
   * - Frontend uses this to trigger onboarding flow
   * - Computed on every request (not stored) to reflect current state
   * - Admin users who haven't completed onboarding see onboarding flow
   */
  app.get('/api/auth/me', (req, res) => {
    if (req.user) {
      const user = req.user as any;
      
      /**
       * adminGuilds and connectedServers are already parsed in deserializeUser
       * No need to JSON.parse here - they're already arrays
       */
      
      /**
       * Determine if user needs onboarding
       * 
       * Criteria:
       * - User must be admin (has permissions somewhere)
       * - User must NOT have completed onboarding yet
       * 
       * Why compute dynamically:
       * - Reflects current state (not cached)
       * - Simple boolean logic (no complex queries)
       */
      const needsOnboarding = user.isAdmin === true && user.onboardingCompleted !== true;
      
      res.json({
        ...user,
        needsOnboarding
      });
    } else {
      res.status(401).json({ message: 'Not authenticated' });
    }
  });

  /**
   * Get Available Servers for Onboarding
   * 
   * Returns servers where:
   * 1. User is an admin
   * 2. Bot is present
   * 
   * Used during onboarding to let user select which servers to connect to the app.
   * Also provides debug info (user's admin guilds, bot's guilds) for troubleshooting.
   * 
   * Response includes:
   * - availableServers: Intersection of admin guilds and bot guilds
   * - userAdminGuilds: All servers where user is admin
   * - botGuilds: All servers where bot is present
   */
  app.get('/api/auth/available-servers', async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    try {
      const user = req.user as any;
      console.log(`Fetching available servers for user ${user.id} (${user.username})`);

      /**
       * Get user's admin guilds
       * Already parsed to array in deserializeUser, no need for JSON.parse
       */
      const userAdminGuilds: any[] = user.adminGuilds || [];
      if (userAdminGuilds.length > 0) {
        console.log(`User ${user.id} has admin permissions in ${userAdminGuilds.length} servers:`, 
          userAdminGuilds.map(g => `${g.name} (${g.id})`));
      } else {
        console.log(`User ${user.id} has no admin guilds data`);
      }

      /**
       * Get bot's guilds (servers where bot is connected)
       * Dynamic import to avoid circular dependencies
       */
      const { getBotGuilds } = await import('./discord/bot');
      const botGuilds = await getBotGuilds();
      console.log(`Bot is present in ${botGuilds.length} servers:`, 
        botGuilds.map(g => `${g.name} (${g.id})`));

      /**
       * Calculate intersection
       * 
       * availableServers = servers where user is admin AND bot is present
       * Only these servers can be used with the ticket system
       */
      const availableServers = userAdminGuilds.filter(userGuild => 
        botGuilds.some(botGuild => botGuild.id === userGuild.id)
      );

      console.log(`Available servers for user ${user.id}: ${availableServers.length} servers where user is admin AND bot is present:`,
        availableServers.map(g => `${g.name} (${g.id})`));

      /**
       * Return all three datasets for frontend
       * 
       * Why return all three:
       * - availableServers: What user can actually connect
       * - userAdminGuilds: Shows all admin servers (for debugging)
       * - botGuilds: Shows where bot is (for debugging)
       * - Helps troubleshoot "why can't I see my server?" issues
       */
      res.json({
        availableServers,
        userAdminGuilds: userAdminGuilds.map(g => ({ id: g.id, name: g.name })),
        botGuilds: botGuilds.map(g => ({ id: g.id, name: g.name }))
      });
    } catch (error) {
      console.error('Error fetching available servers:', error);
      res.status(500).json({ 
        message: 'Failed to fetch available servers',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Complete Onboarding Route
   * 
   * Saves user's selected servers and marks onboarding as complete.
   * Validates selections against available servers to prevent manipulation.
   * 
   * Request body:
   * - selectedServers: Array of Discord server IDs user wants to connect
   * 
   * Security:
   * - Validates selectedServers against actual available servers
   * - Prevents users from connecting to servers they don't admin
   * - Prevents connecting to servers where bot isn't present
   * 
   * Flow:
   * 1. Receive selected servers from frontend
   * 2. Re-calculate available servers on backend (don't trust frontend)
   * 3. Filter selected servers to only include valid ones
   * 4. Save to database
   * 5. Mark onboarding as complete
   */
  app.post('/api/auth/complete-onboarding', async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    try {
      const user = req.user as any;
      const { selectedServers } = req.body;

      console.log(`Completing onboarding for user ${user.id} with servers:`, selectedServers);

      /**
       * Validate selected servers on server side
       * 
       * Why validate on backend:
       * - Frontend can be manipulated (dev tools, network intercept)
       * - User could try to connect to servers they don't admin
       * - Security best practice: Never trust client input
       * 
       * Validation process:
       * 1. Get user's admin guilds from session
       * 2. Get bot's guilds from Discord bot
       * 3. Calculate intersection (available servers)
       * 4. Filter selected servers to only valid ones
       */
      let connectedServers: string[] = [];
      if (selectedServers && Array.isArray(selectedServers)) {
        try {
          /**
           * Get available servers (same calculation as /api/auth/available-servers)
           * We recalculate instead of trusting frontend to prevent security issues
           */
          const userAdminGuilds: any[] = user.adminGuilds || [];

          // Get bot's guilds
          const { getBotGuilds } = await import('./discord/bot');
          const botGuilds = await getBotGuilds();

          // Find intersection: servers where user is admin AND bot is present
          const availableServerIds = userAdminGuilds
            .filter(userGuild => botGuilds.some(botGuild => botGuild.id === userGuild.id))
            .map(guild => guild.id);

          console.log(`User ${user.id} tried to connect to servers:`, selectedServers);
          console.log(`Available server IDs for user ${user.id}:`, availableServerIds);

          /**
           * Security filter
           * Only allow servers that are actually available to this user
           */
          connectedServers = selectedServers.filter(serverId => 
            availableServerIds.includes(serverId)
          );

          console.log(`Valid connected servers for user ${user.id}:`, connectedServers);
        } catch (error) {
          console.error('Error validating selected servers:', error);
          // On error, don't connect to any servers (safe default)
          connectedServers = [];
        }
      }

      /**
       * Save to database
       * 
       * Updates:
       * - onboardingCompleted: true (prevents onboarding flow from showing again)
       * - connectedServers: JSON array of server IDs user can access
       */
      const connectedServersToSave = Array.isArray(connectedServers) 
        ? JSON.stringify(connectedServers)
        : connectedServers;
      
      await storage.updateDiscordUser(user.id, { 
        onboardingCompleted: true,
        connectedServers: connectedServersToSave
      });

      console.log(`Onboarding completed for user ${user.id}. Connected to ${connectedServers.length} servers.`);

      res.json({ 
        success: true, 
        message: 'Onboarding completed successfully',
        connectedServers
      });
    } catch (error) {
      console.error('Error completing onboarding:', error);
      res.status(500).json({ 
        message: 'Failed to complete onboarding' 
      });
    }
  });

  /**
   * Reset Connected Servers Route
   * 
   * Auto-connects user to all available servers (where they are admin AND bot is present).
   * Useful for fixing accounts that completed onboarding with no servers selected.
   * 
   * Security:
   * - Only connects to servers where user is actually admin
   * - Only connects to servers where bot is present
   * - Validates everything on backend
   */
  app.post('/api/auth/reset-connected-servers', async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    try {
      const user = req.user as any;

      console.log(`[Reset Servers] Resetting connected servers for user ${user.id} (${user.username})`);

      // Get user's admin guilds
      const userAdminGuilds: any[] = user.adminGuilds || [];

      // Get bot's guilds
      const { getBotGuilds } = await import('./discord/bot');
      const botGuilds = await getBotGuilds();

      // Find intersection: servers where user is admin AND bot is present
      const availableServerIds = userAdminGuilds
        .filter(userGuild => botGuilds.some(botGuild => botGuild.id === userGuild.id))
        .map(guild => guild.id);

      console.log(`[Reset Servers] User ${user.id} has ${userAdminGuilds.length} admin guilds`);
      console.log(`[Reset Servers] Bot is present in ${botGuilds.length} guilds`);
      console.log(`[Reset Servers] Auto-connecting to ${availableServerIds.length} available servers:`, availableServerIds);

      // Update database
      const connectedServersToSave = JSON.stringify(availableServerIds);
      
      await storage.updateDiscordUser(user.id, { 
        connectedServers: connectedServersToSave
      });

      console.log(`[Reset Servers] Successfully connected user ${user.id} to ${availableServerIds.length} servers`);

      res.json({ 
        success: true, 
        message: `Connected to ${availableServerIds.length} server(s)`,
        connectedServers: availableServerIds
      });
    } catch (error) {
      console.error('[Reset Servers] Error resetting connected servers:', error);
      res.status(500).json({ 
        message: 'Failed to reset connected servers' 
      });
    }
  });
}

/**
 * Authentication Middleware
 * 
 * Protects routes by ensuring user is authenticated.
 * Use this middleware on routes that require a logged-in user.
 * 
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 * 
 * @example
 * app.get('/api/tickets', isAuthenticated, (req, res) => {
 *   // req.user is guaranteed to exist here
 *   const userId = req.user.id;
 *   // ... fetch user's tickets
 * });
 */
export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Authentication required' });
}

/**
 * Admin-Only Middleware
 * 
 * Protects routes by ensuring user is authenticated AND has admin privileges.
 * Use this middleware on routes that require Discord server admin permissions.
 * 
 * Checks:
 * 1. User is authenticated (has valid session)
 * 2. User object exists
 * 3. User has isAdmin = true (is admin in at least one server)
 * 
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 * 
 * @example
 * app.post('/api/admin/settings', isAdmin, (req, res) => {
 *   // req.user is guaranteed to exist and be an admin
 *   // ... perform admin action
 * });
 */
export function isAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user && (req.user as any).isAdmin) {
    return next();
  }
  res.status(403).json({ message: 'Admin access required' });
}