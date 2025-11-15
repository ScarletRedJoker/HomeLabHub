import Redis from 'ioredis';
import { getEnv } from './env';

export type Platform = 'twitch' | 'youtube' | 'kick';

export interface PlatformQuotaConfig {
  limit: number;
  resetPeriodMs: number;
  resetPeriodName: string;
  quotaCostPerCall: number;
}

export interface QuotaStatus {
  platform: Platform;
  current: number;
  limit: number;
  percentage: number;
  resetTime: Date;
  status: 'ok' | 'warning' | 'alert' | 'exhausted';
  isCircuitBreakerActive: boolean;
}

export interface QuotaCheckResult {
  allowed: boolean;
  status: QuotaStatus;
  reason?: string;
}

const PLATFORM_CONFIGS: Record<Platform, PlatformQuotaConfig> = {
  twitch: {
    limit: 800,
    resetPeriodMs: 60 * 1000,
    resetPeriodName: 'minute',
    quotaCostPerCall: 1,
  },
  youtube: {
    limit: 10000,
    resetPeriodMs: 24 * 60 * 60 * 1000,
    resetPeriodName: 'day',
    quotaCostPerCall: 1,
  },
  kick: {
    limit: 100,
    resetPeriodMs: 60 * 1000,
    resetPeriodName: 'minute',
    quotaCostPerCall: 1,
  },
};

const WARNING_THRESHOLD = 0.7;
const ALERT_THRESHOLD = 0.85;
const CIRCUIT_BREAKER_THRESHOLD = 0.95;

class QuotaService {
  private redis: Redis | null = null;
  private inMemoryStore: Map<string, { count: number; resetTime: number }> = new Map();
  private useRedis: boolean = false;
  private lastWarnings: Map<Platform, number> = new Map();
  private readonly WARNING_COOLDOWN_MS = 5 * 60 * 1000;

  constructor() {
    this.initializeRedis();
    this.startCleanupInterval();
  }

  private initializeRedis(): void {
    const redisUrl = getEnv('REDIS_URL') || getEnv('STREAMBOT_REDIS_URL');
    
    if (redisUrl) {
      try {
        this.redis = new Redis(redisUrl, {
          maxRetriesPerRequest: 3,
          retryStrategy: (times) => {
            if (times > 3) {
              console.warn('[QuotaService] Redis connection failed, falling back to in-memory store');
              this.useRedis = false;
              return null;
            }
            return Math.min(times * 100, 3000);
          },
        });

        this.redis.on('connect', () => {
          console.log('[QuotaService] Connected to Redis');
          this.useRedis = true;
        });

        this.redis.on('error', (error) => {
          console.error('[QuotaService] Redis error:', error.message);
          this.useRedis = false;
        });
      } catch (error: any) {
        console.warn('[QuotaService] Failed to initialize Redis:', error.message);
        this.useRedis = false;
      }
    } else {
      console.log('[QuotaService] No Redis URL configured, using in-memory store');
      this.useRedis = false;
    }
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.inMemoryStore.entries()) {
        if (now >= value.resetTime) {
          this.inMemoryStore.delete(key);
        }
      }
    }, 60 * 1000);
  }

  private getQuotaKey(platform: Platform, userId?: string): string {
    return userId ? `quota:${platform}:${userId}` : `quota:${platform}:global`;
  }

  private getResetTimeKey(platform: Platform, userId?: string): string {
    return userId ? `quota:reset:${platform}:${userId}` : `quota:reset:${platform}:global`;
  }

  private async incrementRedis(
    platform: Platform,
    cost: number,
    userId?: string
  ): Promise<{ count: number; resetTime: number }> {
    const config = PLATFORM_CONFIGS[platform];
    const quotaKey = this.getQuotaKey(platform, userId);
    const resetKey = this.getResetTimeKey(platform, userId);
    const now = Date.now();
    const resetTime = now + config.resetPeriodMs;

    const pipeline = this.redis!.pipeline();
    
    const existingReset = await this.redis!.get(resetKey);
    
    if (!existingReset) {
      pipeline.set(resetKey, resetTime.toString(), 'PX', config.resetPeriodMs);
    }
    
    pipeline.incrby(quotaKey, cost);
    pipeline.pexpire(quotaKey, config.resetPeriodMs);
    
    const results = await pipeline.exec();
    const count = results?.[existingReset ? 0 : 1]?.[1] as number || cost;
    const storedResetTime = existingReset ? parseInt(existingReset) : resetTime;

    return { count, resetTime: storedResetTime };
  }

  private incrementInMemory(
    platform: Platform,
    cost: number,
    userId?: string
  ): { count: number; resetTime: number } {
    const config = PLATFORM_CONFIGS[platform];
    const key = this.getQuotaKey(platform, userId);
    const now = Date.now();
    
    let entry = this.inMemoryStore.get(key);
    
    if (!entry || now >= entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + config.resetPeriodMs,
      };
      this.inMemoryStore.set(key, entry);
    }
    
    entry.count += cost;
    return { count: entry.count, resetTime: entry.resetTime };
  }

  private async getCountRedis(platform: Platform, userId?: string): Promise<{ count: number; resetTime: number }> {
    const quotaKey = this.getQuotaKey(platform, userId);
    const resetKey = this.getResetTimeKey(platform, userId);
    const now = Date.now();
    
    const [countStr, resetStr] = await Promise.all([
      this.redis!.get(quotaKey),
      this.redis!.get(resetKey),
    ]);
    
    const count = countStr ? parseInt(countStr) : 0;
    const resetTime = resetStr ? parseInt(resetStr) : now + PLATFORM_CONFIGS[platform].resetPeriodMs;
    
    return { count, resetTime };
  }

  private getCountInMemory(platform: Platform, userId?: string): { count: number; resetTime: number } {
    const key = this.getQuotaKey(platform, userId);
    const entry = this.inMemoryStore.get(key);
    const now = Date.now();
    
    if (!entry || now >= entry.resetTime) {
      return {
        count: 0,
        resetTime: now + PLATFORM_CONFIGS[platform].resetPeriodMs,
      };
    }
    
    return { count: entry.count, resetTime: entry.resetTime };
  }

  async trackApiCall(platform: Platform, cost: number = 1, userId?: string): Promise<QuotaStatus> {
    const config = PLATFORM_CONFIGS[platform];
    
    let result: { count: number; resetTime: number };
    
    if (this.useRedis && this.redis) {
      try {
        result = await this.incrementRedis(platform, cost, userId);
      } catch (error: any) {
        console.warn('[QuotaService] Redis increment failed, using in-memory:', error.message);
        result = this.incrementInMemory(platform, cost, userId);
      }
    } else {
      result = this.incrementInMemory(platform, cost, userId);
    }

    const status = this.calculateStatus(platform, result.count, result.resetTime);
    
    this.checkAndLogWarnings(status);
    
    return status;
  }

  async checkQuota(platform: Platform, cost: number = 1, userId?: string): Promise<QuotaCheckResult> {
    const config = PLATFORM_CONFIGS[platform];
    
    let result: { count: number; resetTime: number };
    
    if (this.useRedis && this.redis) {
      try {
        result = await this.getCountRedis(platform, userId);
      } catch (error: any) {
        console.warn('[QuotaService] Redis get failed, using in-memory:', error.message);
        result = this.getCountInMemory(platform, userId);
      }
    } else {
      result = this.getCountInMemory(platform, userId);
    }

    const status = this.calculateStatus(platform, result.count, result.resetTime);
    
    if (status.isCircuitBreakerActive) {
      return {
        allowed: false,
        status,
        reason: `Circuit breaker active: ${platform} quota at ${status.percentage.toFixed(1)}%`,
      };
    }

    const wouldExceed = (result.count + cost) > config.limit;
    
    if (wouldExceed) {
      return {
        allowed: false,
        status,
        reason: `Request would exceed quota limit (current: ${result.count}, limit: ${config.limit})`,
      };
    }

    return {
      allowed: true,
      status,
    };
  }

  private calculateStatus(platform: Platform, currentCount: number, resetTime: number): QuotaStatus {
    const config = PLATFORM_CONFIGS[platform];
    const percentage = (currentCount / config.limit) * 100;
    
    let status: 'ok' | 'warning' | 'alert' | 'exhausted';
    
    if (percentage >= 100) {
      status = 'exhausted';
    } else if (percentage >= ALERT_THRESHOLD * 100) {
      status = 'alert';
    } else if (percentage >= WARNING_THRESHOLD * 100) {
      status = 'warning';
    } else {
      status = 'ok';
    }

    return {
      platform,
      current: currentCount,
      limit: config.limit,
      percentage,
      resetTime: new Date(resetTime),
      status,
      isCircuitBreakerActive: percentage >= CIRCUIT_BREAKER_THRESHOLD * 100,
    };
  }

  private checkAndLogWarnings(status: QuotaStatus): void {
    const now = Date.now();
    const lastWarning = this.lastWarnings.get(status.platform) || 0;
    
    if (now - lastWarning < this.WARNING_COOLDOWN_MS) {
      return;
    }

    if (status.status === 'warning') {
      console.warn(
        `[QuotaService] WARNING: ${status.platform} quota at ${status.percentage.toFixed(1)}% ` +
        `(${status.current}/${status.limit}). Resets at ${status.resetTime.toISOString()}`
      );
      this.lastWarnings.set(status.platform, now);
    } else if (status.status === 'alert') {
      console.error(
        `[QuotaService] ALERT: ${status.platform} quota at ${status.percentage.toFixed(1)}% ` +
        `(${status.current}/${status.limit}). Resets at ${status.resetTime.toISOString()}`
      );
      this.lastWarnings.set(status.platform, now);
    } else if (status.status === 'exhausted' || status.isCircuitBreakerActive) {
      console.error(
        `[QuotaService] CIRCUIT BREAKER: ${status.platform} quota exhausted at ${status.percentage.toFixed(1)}% ` +
        `(${status.current}/${status.limit}). Blocking requests until reset at ${status.resetTime.toISOString()}`
      );
      this.lastWarnings.set(status.platform, now);
    }
  }

  async getAllQuotaStatus(userId?: string): Promise<QuotaStatus[]> {
    const platforms: Platform[] = ['twitch', 'youtube', 'kick'];
    const statuses: QuotaStatus[] = [];

    for (const platform of platforms) {
      let result: { count: number; resetTime: number };
      
      if (this.useRedis && this.redis) {
        try {
          result = await this.getCountRedis(platform, userId);
        } catch (error: any) {
          result = this.getCountInMemory(platform, userId);
        }
      } else {
        result = this.getCountInMemory(platform, userId);
      }

      const status = this.calculateStatus(platform, result.count, result.resetTime);
      statuses.push(status);
    }

    return statuses;
  }

  async resetQuota(platform: Platform, userId?: string): Promise<void> {
    const quotaKey = this.getQuotaKey(platform, userId);
    const resetKey = this.getResetTimeKey(platform, userId);
    
    if (this.useRedis && this.redis) {
      try {
        await this.redis.del(quotaKey, resetKey);
        console.log(`[QuotaService] Reset quota for ${platform}${userId ? ` (user: ${userId})` : ''}`);
      } catch (error: any) {
        console.error('[QuotaService] Failed to reset quota in Redis:', error.message);
      }
    }
    
    this.inMemoryStore.delete(quotaKey);
  }

  async resetAllQuotas(userId?: string): Promise<void> {
    const platforms: Platform[] = ['twitch', 'youtube', 'kick'];
    
    for (const platform of platforms) {
      await this.resetQuota(platform, userId);
    }
    
    console.log(`[QuotaService] Reset all quotas${userId ? ` for user ${userId}` : ''}`);
  }

  getBackoffDelayMs(status: QuotaStatus): number {
    if (status.isCircuitBreakerActive) {
      const timeUntilReset = status.resetTime.getTime() - Date.now();
      return Math.max(timeUntilReset, 0);
    }

    if (status.percentage >= ALERT_THRESHOLD * 100) {
      return 5000;
    }

    if (status.percentage >= WARNING_THRESHOLD * 100) {
      return 2000;
    }

    return 0;
  }

  isHealthy(): boolean {
    return this.useRedis ? (this.redis?.status === 'ready') : true;
  }

  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

export const quotaService = new QuotaService();
