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

async function findOrCreateUserFromOAuth(profile: OAuthProfile): Promise<User> {
  const email = profile.email.toLowerCase();

  let user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (user) {
    console.log(`[OAuth] Existing user found for email ${email}`);
    
    const existingConnection = await db.query.platformConnections.findFirst({
      where: and(
        eq(platformConnections.userId, user.id),
        eq(platformConnections.platform, profile.platform)
      ),
    });

    if (!existingConnection) {
      const encryptedAccessToken = encryptToken(profile.accessToken);
      const encryptedRefreshToken = profile.refreshToken ? encryptToken(profile.refreshToken) : null;
      const tokenExpiresAt = profile.expiresIn 
        ? new Date(Date.now() + profile.expiresIn * 1000) 
        : null;

      await db.insert(platformConnections).values({
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
      });

      console.log(`[OAuth] Auto-linked ${profile.platform} to existing user ${user.id}`);
    } else {
      console.log(`[OAuth] ${profile.platform} already linked to user ${user.id}`);
    }
  } else {
    const [newUser] = await db
      .insert(users)
      .values({
        email,
        primaryPlatform: profile.platform,
        role: "user",
        isActive: true,
      })
      .returning();

    user = newUser;

    const encryptedAccessToken = encryptToken(profile.accessToken);
    const encryptedRefreshToken = profile.refreshToken ? encryptToken(profile.refreshToken) : null;
    const tokenExpiresAt = profile.expiresIn 
      ? new Date(Date.now() + profile.expiresIn * 1000) 
      : null;

    await db.insert(platformConnections).values({
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
    });

    await db.insert(botConfigs).values({
      userId: user.id,
      intervalMode: "manual",
      fixedIntervalMinutes: 30,
      randomMinMinutes: 15,
      randomMaxMinutes: 60,
      aiModel: "gpt-5-mini",
      aiPromptTemplate:
        "Generate a fun, interesting, and engaging fact similar to a Snapple fact. Keep it under 200 characters.",
      aiTemperature: 1,
      enableChatTriggers: true,
      chatKeywords: ["!snapple", "!fact"],
      activePlatforms: [],
      isActive: false,
    });

    await db.insert(botInstances).values({
      userId: user.id,
      status: "stopped",
    });

    console.log(`[OAuth] Created new user ${user.id} with ${profile.platform} as primary platform`);
  }

  return user;
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
    },
    async (accessToken: string, refreshToken: string, profile: any, done: any) => {
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

        const user = await findOrCreateUserFromOAuth(oauthProfile);
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
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
    },
    async (accessToken: string, refreshToken: string, profile: any, done: any) => {
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

        const user = await findOrCreateUserFromOAuth(oauthProfile);
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
    },
    async (accessToken: string, refreshToken: string, profile: any, done: any) => {
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

        const user = await findOrCreateUserFromOAuth(oauthProfile);
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
