import { createHash } from 'crypto';

const DEFAULT_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_SIZE = 1000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
  hits: number;
}

interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
}

export class AIResponseCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private stats = { hits: 0, misses: 0 };
  private ttlMs: number;
  private maxSize: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS, maxSize: number = MAX_CACHE_SIZE) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
  }

  private generateHash(data: any): string {
    const normalized = JSON.stringify(data, Object.keys(data).sort());
    return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
  }

  hashPrompt(messages: Array<{ role: string; content: string }>, model?: string): string {
    const payload = {
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      model: model || 'default',
    };
    return this.generateHash(payload);
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    entry.hits++;
    this.stats.hits++;
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    const now = Date.now();
    this.cache.set(key, {
      value,
      expiresAt: now + (ttlMs ?? this.ttlMs),
      createdAt: now,
      hits: 0,
    });
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  invalidate(pattern?: string): number {
    if (!pattern) {
      const count = this.cache.size;
      this.cache.clear();
      return count;
    }

    let count = 0;
    const regex = new RegExp(pattern);
    const keys = Array.from(this.cache.keys());
    for (const key of keys) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  invalidateExpired(): number {
    const now = Date.now();
    let count = 0;
    const entries = Array.from(this.cache.entries());
    for (const [key, entry] of entries) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    const entries = Array.from(this.cache.entries());
    for (const [key, entry] of entries) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  getStats(): CacheStats {
    let oldestTime = Infinity;
    let newestTime = 0;

    const values = Array.from(this.cache.values());
    for (const entry of values) {
      if (entry.createdAt < oldestTime) oldestTime = entry.createdAt;
      if (entry.createdAt > newestTime) newestTime = entry.createdAt;
    }

    const total = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      oldestEntry: oldestTime !== Infinity ? new Date(oldestTime) : null,
      newestEntry: newestTime !== 0 ? new Date(newestTime) : null,
    };
  }

  resetStats(): void {
    this.stats = { hits: 0, misses: 0 };
  }

  clear(): void {
    this.cache.clear();
    this.resetStats();
  }

  setTTL(ttlMs: number): void {
    this.ttlMs = ttlMs;
  }

  getTTL(): number {
    return this.ttlMs;
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  size(): number {
    return this.cache.size;
  }
}

export const responseCache = new AIResponseCache();

export function getCacheKey(prefix: string, params: Record<string, any>): string {
  const hash = createHash('sha256')
    .update(JSON.stringify(params, Object.keys(params).sort()))
    .digest('hex')
    .slice(0, 16);
  return `${prefix}:${hash}`;
}
