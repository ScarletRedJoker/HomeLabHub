import { Router, Request, Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { getDiscordClient } from "../discord/bot";
import { dbStorage as storage } from "../database-storage";
import { GuildMember, GuildScheduledEvent, Collection } from "discord.js";

const router = Router();

const RIG_CITY_SERVER_ID = process.env.RIG_CITY_SERVER_ID || "";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 60 * 1000;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

const publicCors = cors({
  origin: [
    'https://rig-city.com',
    'https://www.rig-city.com',
    process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : '',
    process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : '',
  ].filter(Boolean),
  methods: ['GET'],
  optionsSuccessStatus: 200,
});

const publicRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(publicCors);
router.use(publicRateLimiter);

router.get('/stats', async (req: Request, res: Response) => {
  try {
    const cacheKey = 'public:stats';
    const cached = getCached<any>(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const client = getDiscordClient();
    if (!client || !RIG_CITY_SERVER_ID) {
      return res.status(503).json({ error: 'Discord service unavailable' });
    }

    const guild = await client.guilds.fetch(RIG_CITY_SERVER_ID);
    if (!guild) {
      return res.status(404).json({ error: 'Server not found' });
    }

    await guild.members.fetch();

    const onlineCount = guild.members.cache.filter(
      (member: GuildMember) => member.presence?.status && member.presence.status !== 'offline'
    ).size;

    const data = {
      memberCount: guild.memberCount,
      onlineCount,
      boostLevel: guild.premiumTier,
      boostCount: guild.premiumSubscriptionCount || 0,
      serverName: guild.name,
      serverIcon: guild.iconURL({ size: 256 }) || null,
    };

    setCache(cacheKey, data);
    res.json(data);
  } catch (error) {
    console.error('[Public API] Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch server stats' });
  }
});

router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 10, 1), 50);
    const cacheKey = `public:leaderboard:${limit}`;
    const cached = getCached<any>(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    if (!RIG_CITY_SERVER_ID) {
      return res.status(503).json({ error: 'Server not configured' });
    }

    const client = getDiscordClient();
    const leaderboardData = await storage.getServerLeaderboard(RIG_CITY_SERVER_ID, limit);

    const data = await Promise.all(
      leaderboardData.map(async (entry, index) => {
        let avatarUrl = null;
        let username = entry.username || 'Unknown User';

        if (client) {
          try {
            const guild = await client.guilds.fetch(RIG_CITY_SERVER_ID);
            const member = await guild.members.fetch(entry.userId).catch(() => null);
            if (member) {
              username = member.displayName || member.user.username;
              avatarUrl = member.user.displayAvatarURL({ size: 64 });
            }
          } catch {
          }
        }

        return {
          rank: index + 1,
          username,
          avatarUrl,
          level: entry.level,
          xp: entry.xp,
        };
      })
    );

    setCache(cacheKey, data);
    res.json(data);
  } catch (error) {
    console.error('[Public API] Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

router.get('/starboard', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 5, 1), 20);
    const cacheKey = `public:starboard:${limit}`;
    const cached = getCached<any>(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const client = getDiscordClient();
    if (!client || !RIG_CITY_SERVER_ID) {
      return res.status(503).json({ error: 'Discord service unavailable' });
    }

    const guild = await client.guilds.fetch(RIG_CITY_SERVER_ID);
    const settings = await storage.getBotSettings(RIG_CITY_SERVER_ID);
    
    if (!settings?.starboardChannelId || !settings.starboardEnabled) {
      return res.json([]);
    }

    const starboardChannel = await guild.channels.fetch(settings.starboardChannelId).catch(() => null);
    if (!starboardChannel || !starboardChannel.isTextBased()) {
      return res.json([]);
    }

    const messages = await starboardChannel.messages.fetch({ limit: limit * 2 });
    
    const data = messages
      .filter(msg => msg.embeds.length > 0)
      .first(limit)
      .map(msg => {
        const embed = msg.embeds[0];
        let stars = 0;
        const starMatch = msg.content.match(/(\d+)/);
        if (starMatch) {
          stars = parseInt(starMatch[1]);
        } else if (embed.footer?.text) {
          const footerMatch = embed.footer.text.match(/(\d+)/);
          if (footerMatch) stars = parseInt(footerMatch[1]);
        }
        
        return {
          content: embed.description || '',
          author: embed.author?.name || 'Unknown',
          authorAvatar: embed.author?.iconURL || null,
          stars,
          messageUrl: embed.url || null,
          timestamp: msg.createdAt.toISOString(),
          attachments: embed.image ? [embed.image.url] : [],
        };
      });

    setCache(cacheKey, data);
    res.json(data);
  } catch (error) {
    console.error('[Public API] Error fetching starboard:', error);
    res.status(500).json({ error: 'Failed to fetch starboard' });
  }
});

router.get('/giveaways', async (req: Request, res: Response) => {
  try {
    const cacheKey = 'public:giveaways';
    const cached = getCached<any>(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    if (!RIG_CITY_SERVER_ID) {
      return res.status(503).json({ error: 'Server not configured' });
    }

    const client = getDiscordClient();
    const activeGiveaways = await storage.getActiveGiveaways(RIG_CITY_SERVER_ID);

    const data = await Promise.all(
      activeGiveaways.map(async (giveaway) => {
        let hostName = 'Unknown Host';
        let participants = 0;

        if (client) {
          try {
            const guild = await client.guilds.fetch(RIG_CITY_SERVER_ID);
            const host = await guild.members.fetch(giveaway.hostId).catch(() => null);
            if (host) {
              hostName = host.displayName || host.user.username;
            }

            if (giveaway.messageId && giveaway.channelId) {
              const channel = await guild.channels.fetch(giveaway.channelId).catch(() => null);
              if (channel && channel.isTextBased()) {
                const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
                if (message) {
                  const reaction = message.reactions.cache.get('🎉');
                  participants = reaction ? reaction.count - 1 : 0;
                }
              }
            }
          } catch {
          }
        }

        return {
          prize: giveaway.prize,
          endsAt: giveaway.endTime.toISOString(),
          participants: Math.max(0, participants),
          hostName,
          winnerCount: giveaway.winnerCount,
        };
      })
    );

    setCache(cacheKey, data);
    res.json(data);
  } catch (error) {
    console.error('[Public API] Error fetching giveaways:', error);
    res.status(500).json({ error: 'Failed to fetch giveaways' });
  }
});

router.get('/events', async (req: Request, res: Response) => {
  try {
    const cacheKey = 'public:events';
    const cached = getCached<any>(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const client = getDiscordClient();
    if (!client || !RIG_CITY_SERVER_ID) {
      return res.status(503).json({ error: 'Discord service unavailable' });
    }

    const guild = await client.guilds.fetch(RIG_CITY_SERVER_ID);
    const events = await guild.scheduledEvents.fetch();

    const data = events
      .filter((event: GuildScheduledEvent) => 
        event.status === 1 || event.status === 2
      )
      .map((event: GuildScheduledEvent) => ({
        name: event.name,
        description: event.description || null,
        startTime: event.scheduledStartAt?.toISOString() || null,
        endTime: event.scheduledEndAt?.toISOString() || null,
        interestedCount: event.userCount || 0,
        location: event.entityMetadata?.location || null,
        image: event.coverImageURL({ size: 512 }) || null,
      }));

    setCache(cacheKey, Array.from(data.values()));
    res.json(Array.from(data.values()));
  } catch (error) {
    console.error('[Public API] Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

router.get('/boosters', async (req: Request, res: Response) => {
  try {
    const cacheKey = 'public:boosters';
    const cached = getCached<any>(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const client = getDiscordClient();
    if (!client || !RIG_CITY_SERVER_ID) {
      return res.status(503).json({ error: 'Discord service unavailable' });
    }

    const guild = await client.guilds.fetch(RIG_CITY_SERVER_ID);
    await guild.members.fetch();

    const boosters = guild.members.cache.filter(
      (member: GuildMember) => member.premiumSince !== null
    );

    const data = boosters.map((member: GuildMember) => ({
      username: member.displayName || member.user.username,
      avatarUrl: member.user.displayAvatarURL({ size: 64 }),
      boostingSince: member.premiumSince?.toISOString() || null,
    }));

    const sortedData = Array.from(data.values()).sort((a: any, b: any) => {
      if (!a.boostingSince || !b.boostingSince) return 0;
      return new Date(a.boostingSince).getTime() - new Date(b.boostingSince).getTime();
    });

    setCache(cacheKey, sortedData);
    res.json(sortedData);
  } catch (error) {
    console.error('[Public API] Error fetching boosters:', error);
    res.status(500).json({ error: 'Failed to fetch boosters' });
  }
});

router.get('/health', (req: Request, res: Response) => {
  const client = getDiscordClient();
  res.json({
    status: client?.isReady() ? 'ok' : 'degraded',
    serverConfigured: !!RIG_CITY_SERVER_ID,
  });
});

export default router;
