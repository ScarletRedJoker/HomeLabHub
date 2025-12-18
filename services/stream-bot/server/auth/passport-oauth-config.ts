import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as OAuth2Strategy } from "passport-oauth2";
import { db } from "../db";
import { users, platformConnections, botConfigs, botInstances } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import type { User } from "@shared/schema";
import { getEnv } from "../env";
import { encryptToken } from "../crypto-utils";

export interface OAuthProfile {
  id: string;
  email: string;
  displayName?: string;
  username?: string;
  platform: 'twitch' | 'youtube' | 'kick';
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

async function findOrCreateUserFromOAuth(profile: OAuthProfile, existingUserId?: string): Promise<User> {
  const email = profile.email.toLowerCase();

  try {
    // CASE 1: User is already authenticated - link platform to existing account (ATOMIC)
    if (existingUserId) {
      console.log(`[OAuth] Linking ${profile.platform} to authenticated user ${existingUserId}`);
      
      const user = await db.query.users.findFirst({
        where: eq(users.id, existingUserId),
      });

      if (!user) {
        throw new Error('Authenticated user not found in database');
      }

      // Atomic UPSERT to prevent race conditions
      try {
        await db.transaction(async (tx) => {
          // SECURITY: Check if this platformUserId is already linked to a DIFFERENT user
          const globalPlatformCheck = await tx.query.platformConnections.findFirst({
            where: and(
              eq(platformConnections.platform, profile.platform),
              eq(platformConnections.platformUserId, profile.id)
            ),
          });

          if (globalPlatformCheck && globalPlatformCheck.userId !== user.id) {
            // Platform is linked to a DIFFERENT user - REJECT to prevent account hijacking
            console.error(`[OAuth Security] Attempted hijack: ${profile.platform} user ${profile.id} already linked to user ${globalPlatformCheck.userId}`);
            throw new Error(`This ${profile.platform} account is already linked to another StreamBot account. Please use a different ${profile.platform} account or contact support.`);
          }

          // UPSERT: Insert new connection or update existing (atomic, no race condition)
          const encryptedAccessToken = encryptToken(profile.accessToken);
          const encryptedRefreshToken = profile.refreshToken ? encryptToken(profile.refreshToken) : null;
          const tokenExpiresAt = profile.expiresIn 
            ? new Date(Date.now() + profile.expiresIn * 1000) 
            : null;

          await tx.insert(platformConnections)
            .values({
              userId: user.id,
              platform: profile.platform,
              platformUserId: profile.id,
              platformUsername: profile.username || profile.displayName || email,
              accessToken: encryptedAccessToken,
              refreshToken: encryptedRefreshToken,
              tokenExpiresAt,
              isConnected: true,
              lastConnectedAt: new Date(),
              connectionData: { email: profile.email },
            })
            .onConflictDoUpdate({
              target: [platformConnections.userId, platformConnections.platform],
              set: {
                platformUserId: profile.id,
                platformUsername: profile.username || profile.displayName || email,
                accessToken: encryptedAccessToken,
                refreshToken: encryptedRefreshToken,
                tokenExpiresAt,
                isConnected: true,
                lastConnectedAt: new Date(),
                connectionData: { email: profile.email },
                updatedAt: new Date(),
              },
            });

          console.log(`[OAuth] Successfully linked/updated ${profile.platform} for user ${user.id} (email: ${profile.email})`);
        });
      } catch (txError: any) {
        // Handle unique constraint violation for platformUserId (hijacking attempt)
        if (txError.code === '23505' || txError.message?.includes('duplicate key') || txError.message?.includes('unique constraint')) {
          throw new Error(`This ${profile.platform} account is already linked to another StreamBot account. Please use a different ${profile.platform} account or contact support.`);
        }
        throw txError;
      }

      return user;
    }

    // CASE 2: Find existing user by email (ATOMIC)
    let user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (user) {
      console.log(`[OAuth] Existing user found for email ${email}`);
      
      // Atomic UPSERT to prevent race conditions
      try {
        await db.transaction(async (tx) => {
          // SECURITY: Check if this platformUserId is already linked to a DIFFERENT user
          const globalPlatformCheck = await tx.query.platformConnections.findFirst({
            where: and(
              eq(platformConnections.platform, profile.platform),
              eq(platformConnections.platformUserId, profile.id)
            ),
          });

          if (globalPlatformCheck && globalPlatformCheck.userId !== user!.id) {
            // Platform is linked to a DIFFERENT user - REJECT to prevent account hijacking
            console.error(`[OAuth Security] Attempted hijack: ${profile.platform} user ${profile.id} already linked to user ${globalPlatformCheck.userId}`);
            throw new Error(`This ${profile.platform} account is already linked to another StreamBot account. Please use a different ${profile.platform} account or contact support.`);
          }

          // UPSERT: Insert new connection or update existing (atomic, no race condition)
          const encryptedAccessToken = encryptToken(profile.accessToken);
          const encryptedRefreshToken = profile.refreshToken ? encryptToken(profile.refreshToken) : null;
          const tokenExpiresAt = profile.expiresIn 
            ? new Date(Date.now() + profile.expiresIn * 1000) 
            : null;

          await tx.insert(platformConnections)
            .values({
              userId: user!.id,
              platform: profile.platform,
              platformUserId: profile.id,
              platformUsername: profile.username || profile.displayName || email,
              accessToken: encryptedAccessToken,
              refreshToken: encryptedRefreshToken,
              tokenExpiresAt,
              isConnected: true,
              lastConnectedAt: new Date(),
              connectionData: { email: profile.email },
            })
            .onConflictDoUpdate({
              target: [platformConnections.userId, platformConnections.platform],
              set: {
                platformUserId: profile.id,
                platformUsername: profile.username || profile.displayName || email,
                accessToken: encryptedAccessToken,
                refreshToken: encryptedRefreshToken,
                tokenExpiresAt,
                isConnected: true,
                lastConnectedAt: new Date(),
                connectionData: { email: profile.email },
                updatedAt: new Date(),
              },
            });

          console.log(`[OAuth] Auto-linked/updated ${profile.platform} for existing user ${user!.id}`);
        });
      } catch (txError: any) {
        // Handle unique constraint violation for platformUserId (hijacking attempt)
        if (txError.code === '23505' || txError.message?.includes('duplicate key') || txError.message?.includes('unique constraint')) {
          throw new Error(`This ${profile.platform} account is already linked to another StreamBot account. Please use a different ${profile.platform} account or contact support.`);
        }
        throw txError;
      }
    } else {
      // CASE 3: Create new user (atomic transaction with security check)
      console.log(`[OAuth] Creating new user with email ${email} and platform ${profile.platform}`);
      
      try {
        user = await db.transaction(async (tx) => {
          // SECURITY: Check if this platformUserId is already linked to ANY user
          const globalPlatformCheck = await tx.query.platformConnections.findFirst({
            where: and(
              eq(platformConnections.platform, profile.platform),
              eq(platformConnections.platformUserId, profile.id)
            ),
          });

          if (globalPlatformCheck) {
            console.error(`[OAuth Security] Cannot create new user - ${profile.platform} user ${profile.id} already linked to user ${globalPlatformCheck.userId}`);
            throw new Error(`This ${profile.platform} account is already linked to another StreamBot account. Please sign in with that account or contact support.`);
          }

          // UPSERT user by email (handles concurrent user creation attempts)
          const [newUser] = await tx
            .insert(users)
            .values({
              email,
              primaryPlatform: profile.platform,
              role: "user",
              isActive: true,
            })
            .onConflictDoUpdate({
              target: [users.email],
              set: {
                primaryPlatform: profile.platform,
                isActive: true,
                updatedAt: new Date(),
              },
            })
            .returning();

          const encryptedAccessToken = encryptToken(profile.accessToken);
          const encryptedRefreshToken = profile.refreshToken ? encryptToken(profile.refreshToken) : null;
          const tokenExpiresAt = profile.expiresIn 
            ? new Date(Date.now() + profile.expiresIn * 1000) 
            : null;

          // UPSERT platform connection (atomic, handles race conditions)
          await tx.insert(platformConnections)
            .values({
              userId: newUser.id,
              platform: profile.platform,
              platformUserId: profile.id,
              platformUsername: profile.username || profile.displayName || email,
              accessToken: encryptedAccessToken,
              refreshToken: encryptedRefreshToken,
              tokenExpiresAt,
              isConnected: true,
              lastConnectedAt: new Date(),
              connectionData: { email: profile.email },
            })
            .onConflictDoUpdate({
              target: [platformConnections.userId, platformConnections.platform],
              set: {
                platformUserId: profile.id,
                platformUsername: profile.username || profile.displayName || email,
                accessToken: encryptedAccessToken,
                refreshToken: encryptedRefreshToken,
                tokenExpiresAt,
                isConnected: true,
                lastConnectedAt: new Date(),
                connectionData: { email: profile.email },
                updatedAt: new Date(),
              },
            });

          // Insert bot config (only if not exists)
          await tx.insert(botConfigs)
            .values({
              userId: newUser.id,
              intervalMode: "manual",
              fixedIntervalMinutes: 30,
              randomMinMinutes: 15,
              randomMaxMinutes: 60,
              aiModel: "gpt-4o",
              aiPromptTemplate:
                "Generate a fun, mind-blowing fact about life, the universe, science, history, nature, or weird phenomena. Topics: space, animals, physics, human body, ancient civilizations, food science, geography, inventions, unusual traditions, or bizarre natural phenomena. Keep it under 200 characters.",
              aiTemperature: 1,
              enableChatTriggers: true,
              chatKeywords: ["!snapple", "!fact"],
              activePlatforms: [],
              isActive: false,
            })
            .onConflictDoNothing({ target: [botConfigs.userId] });

          // Insert bot instance (only if not exists)
          await tx.insert(botInstances)
            .values({
              userId: newUser.id,
              status: "stopped",
            })
            .onConflictDoNothing({ target: [botInstances.userId] });

          console.log(`[OAuth] Created/updated user ${newUser.id} with ${profile.platform} as primary platform`);
          return newUser;
        });
      } catch (txError: any) {
        // Handle unique constraint violation for platformUserId (hijacking attempt)
        if (txError.code === '23505' || txError.message?.includes('duplicate key') || txError.message?.includes('unique constraint')) {
          throw new Error(`This ${profile.platform} account is already linked to another StreamBot account. Please sign in with that account or contact support.`);
        }
        throw txError;
      }
    }

    return user;
  } catch (error) {
    console.error(`[OAuth] Error in findOrCreateUserFromOAuth:`, error);
    throw error;
  }
}

const TWITCH_CLIENT_ID = getEnv('TWITCH_CLIENT_ID');
const TWITCH_CLIENT_SECRET = getEnv('TWITCH_CLIENT_SECRET');
const TWITCH_CALLBACK_URL = getEnv('TWITCH_SIGNIN_CALLBACK_URL') || `${getEnv('APP_URL') || 'http://localhost:5000'}/api/auth/twitch/callback`;

if (TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET) {
  passport.use('twitch-signin', new OAuth2Strategy(
    {
      authorizationURL: 'https://id.twitch.tv/oauth2/authorize',
      tokenURL: 'https://id.twitch.tv/oauth2/token',
      clientID: TWITCH_CLIENT_ID,
      clientSecret: TWITCH_CLIENT_SECRET,
      callbackURL: TWITCH_CALLBACK_URL,
      scope: ['user:read:email'],
      passReqToCallback: true,
    },
    async (req: any, accessToken: string, refreshToken: string, profile: any, done: any) => {
      try {
        // Fetch user profile from Twitch API
        const userResponse = await fetch('https://api.twitch.tv/helix/users', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Client-Id': TWITCH_CLIENT_ID,
          },
        });

        if (!userResponse.ok) {
          throw new Error(`Twitch API error: ${userResponse.statusText}`);
        }

        const userData = await userResponse.json();
        const twitchUser = userData.data?.[0];

        if (!twitchUser || !twitchUser.email) {
          return done(new Error('No email found in Twitch profile'), null);
        }

        const oauthProfile: OAuthProfile = {
          id: twitchUser.id,
          email: twitchUser.email,
          displayName: twitchUser.display_name,
          username: twitchUser.login,
          platform: 'twitch',
          accessToken,
          refreshToken,
          expiresIn: 14400,
        };

        const existingUserId = req.user?.id;
        const user = await findOrCreateUserFromOAuth(oauthProfile, existingUserId);
        return done(null, user);
      } catch (error) {
        console.error('[OAuth Twitch] Error:', error);
        return done(error, null);
      }
    }
  ));
}

const YOUTUBE_CLIENT_ID = getEnv('YOUTUBE_CLIENT_ID');
const YOUTUBE_CLIENT_SECRET = getEnv('YOUTUBE_CLIENT_SECRET');
const YOUTUBE_CALLBACK_URL = getEnv('YOUTUBE_SIGNIN_CALLBACK_URL') || `${getEnv('APP_URL') || 'http://localhost:5000'}/api/auth/youtube/callback`;

if (YOUTUBE_CLIENT_ID && YOUTUBE_CLIENT_SECRET) {
  passport.use('google-youtube-signin', new GoogleStrategy(
    {
      clientID: YOUTUBE_CLIENT_ID,
      clientSecret: YOUTUBE_CLIENT_SECRET,
      callbackURL: YOUTUBE_CALLBACK_URL,
      scope: [
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/youtube.force-ssl',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
      passReqToCallback: true,
    },
    async (req: any, accessToken: string, refreshToken: string, profile: any, done: any) => {
      try {
        const email = profile.emails?.[0]?.value;
        
        if (!email) {
          return done(new Error('No email found in Google profile'), null);
        }

        const oauthProfile: OAuthProfile = {
          id: profile.id,
          email,
          displayName: profile.displayName,
          username: profile.displayName,
          platform: 'youtube',
          accessToken,
          refreshToken,
          expiresIn: 3600,
        };

        const existingUserId = req.user?.id;
        const user = await findOrCreateUserFromOAuth(oauthProfile, existingUserId);
        return done(null, user);
      } catch (error) {
        console.error('[OAuth YouTube] Error:', error);
        return done(error, null);
      }
    }
  ));
}

const KICK_CLIENT_ID = getEnv('KICK_CLIENT_ID');
const KICK_CLIENT_SECRET = getEnv('KICK_CLIENT_SECRET');
const KICK_CALLBACK_URL = getEnv('KICK_SIGNIN_CALLBACK_URL') || `${getEnv('APP_URL') || 'http://localhost:5000'}/api/auth/kick/callback`;

if (KICK_CLIENT_ID && KICK_CLIENT_SECRET) {
  passport.use('kick-signin', new OAuth2Strategy(
    {
      authorizationURL: 'https://kick.com/oauth2/authorize',
      tokenURL: 'https://kick.com/oauth2/token',
      clientID: KICK_CLIENT_ID,
      clientSecret: KICK_CLIENT_SECRET,
      callbackURL: KICK_CALLBACK_URL,
      scope: ['user:read', 'chat:read', 'chat:send'],
      passReqToCallback: true,
    },
    async (req: any, accessToken: string, refreshToken: string, profile: any, done: any) => {
      try {
        const userResponse = await fetch('https://kick.com/api/v2/user', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (!userResponse.ok) {
          return done(new Error('Failed to fetch Kick user profile'), null);
        }

        const userData = await userResponse.json();
        
        const syntheticEmail = userData.email || `kick_${userData.id}@kick.local`;

        const oauthProfile: OAuthProfile = {
          id: String(userData.id),
          email: syntheticEmail,
          displayName: userData.username,
          username: userData.username,
          platform: 'kick',
          accessToken,
          refreshToken,
          expiresIn: 3600,
        };

        const existingUserId = req.user?.id;
        const user = await findOrCreateUserFromOAuth(oauthProfile, existingUserId);
        return done(null, user);
      } catch (error) {
        console.error('[OAuth Kick] Error:', error);
        return done(error, null);
      }
    }
  ));
}

passport.serializeUser((user, done) => {
  done(null, (user as User).id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, id),
    });

    if (!user) {
      return done(null, false);
    }

    done(null, user);
  } catch (error) {
    done(error);
  }
});

export default passport;
