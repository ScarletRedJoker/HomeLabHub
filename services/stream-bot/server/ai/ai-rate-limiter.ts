/**
 * AI Rate Limiter for Stream Bot
 * 
 * Per-user, per-command rate limiting for AI features
 * Prevents spam and ensures fair usage across viewers
 */

export type CommandType = 'imagine' | 'ask' | 'workflow';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  cooldownMs: number;
}

interface UserRateLimit {
  requests: number[];
  lastRequest: number;
}

const RATE_LIMITS: Record<CommandType, RateLimitConfig> = {
  imagine: {
    maxRequests: 3,
    windowMs: 3600000,
    cooldownMs: 60000,
  },
  ask: {
    maxRequests: 10,
    windowMs: 3600000,
    cooldownMs: 15000,
  },
  workflow: {
    maxRequests: 2,
    windowMs: 3600000,
    cooldownMs: 120000,
  },
};

const PLATFORM_MULTIPLIERS: Record<string, number> = {
  twitch: 1.0,
  youtube: 1.0,
  kick: 1.0,
};

class AIRateLimiter {
  private userLimits: Map<string, Map<CommandType, UserRateLimit>> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 300000);
  }

  private getKey(username: string, platform: string): string {
    return `${platform}:${username.toLowerCase()}`;
  }

  private getUserLimit(key: string, command: CommandType): UserRateLimit {
    let userMap = this.userLimits.get(key);
    if (!userMap) {
      userMap = new Map();
      this.userLimits.set(key, userMap);
    }

    let limit = userMap.get(command);
    if (!limit) {
      limit = { requests: [], lastRequest: 0 };
      userMap.set(command, limit);
    }

    return limit;
  }

  consume(
    command: CommandType,
    username: string,
    platform: string
  ): { allowed: boolean; remaining: number; message?: string } {
    const config = RATE_LIMITS[command];
    const multiplier = PLATFORM_MULTIPLIERS[platform] || 1.0;
    const effectiveMax = Math.floor(config.maxRequests * multiplier);
    const effectiveCooldown = config.cooldownMs;

    const key = this.getKey(username, platform);
    const limit = this.getUserLimit(key, command);
    const now = Date.now();

    if (now - limit.lastRequest < effectiveCooldown) {
      const waitSeconds = Math.ceil((effectiveCooldown - (now - limit.lastRequest)) / 1000);
      return {
        allowed: false,
        remaining: 0,
        message: `Please wait ${waitSeconds}s before using !${command} again.`,
      };
    }

    limit.requests = limit.requests.filter(ts => now - ts < config.windowMs);

    if (limit.requests.length >= effectiveMax) {
      const oldestRequest = limit.requests[0];
      const resetMs = config.windowMs - (now - oldestRequest);
      const resetMinutes = Math.ceil(resetMs / 60000);
      return {
        allowed: false,
        remaining: 0,
        message: `You've used !${command} ${effectiveMax} times. Resets in ${resetMinutes}m.`,
      };
    }

    limit.requests.push(now);
    limit.lastRequest = now;

    return {
      allowed: true,
      remaining: effectiveMax - limit.requests.length,
    };
  }

  getStatus(
    command: CommandType,
    username: string,
    platform: string
  ): { remaining: number; resetMs: number } {
    const config = RATE_LIMITS[command];
    const multiplier = PLATFORM_MULTIPLIERS[platform] || 1.0;
    const effectiveMax = Math.floor(config.maxRequests * multiplier);

    const key = this.getKey(username, platform);
    const limit = this.getUserLimit(key, command);
    const now = Date.now();

    const validRequests = limit.requests.filter(ts => now - ts < config.windowMs);
    const remaining = effectiveMax - validRequests.length;

    let resetMs = 0;
    if (validRequests.length > 0) {
      resetMs = config.windowMs - (now - validRequests[0]);
    }

    return { remaining: Math.max(0, remaining), resetMs };
  }

  reset(username: string, platform: string, command?: CommandType): void {
    const key = this.getKey(username, platform);
    const userMap = this.userLimits.get(key);
    if (!userMap) return;

    if (command) {
      userMap.delete(command);
    } else {
      this.userLimits.delete(key);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const maxWindow = Math.max(...Object.values(RATE_LIMITS).map(c => c.windowMs));

    for (const [key, userMap] of this.userLimits) {
      for (const [command, limit] of userMap) {
        limit.requests = limit.requests.filter(ts => now - ts < maxWindow);
        if (limit.requests.length === 0 && now - limit.lastRequest > maxWindow) {
          userMap.delete(command);
        }
      }
      if (userMap.size === 0) {
        this.userLimits.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

export const aiRateLimiter = new AIRateLimiter();
export default aiRateLimiter;
