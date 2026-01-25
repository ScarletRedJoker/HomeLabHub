import type { AIProviderName } from './types';

export type ModelName = 
  | 'ollama'
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'dall-e-3'
  | 'stable-diffusion';

export interface ModelCost {
  inputPer1K: number;
  outputPer1K: number;
  perImage?: number;
}

export const MODEL_COSTS: Record<ModelName, ModelCost> = {
  'ollama': { inputPer1K: 0, outputPer1K: 0 },
  'gpt-4o': { inputPer1K: 0.005, outputPer1K: 0.015 },
  'gpt-4o-mini': { inputPer1K: 0.00015, outputPer1K: 0.0006 },
  'dall-e-3': { inputPer1K: 0, outputPer1K: 0, perImage: 0.04 },
  'stable-diffusion': { inputPer1K: 0, outputPer1K: 0, perImage: 0 },
};

export const LOCAL_MODELS: ModelName[] = ['ollama', 'stable-diffusion'];
export const CLOUD_MODELS: ModelName[] = ['gpt-4o', 'gpt-4o-mini', 'dall-e-3'];

export interface UsageRecord {
  timestamp: Date;
  provider: AIProviderName;
  model: ModelName | string;
  inputTokens: number;
  outputTokens: number;
  imageCount: number;
  cost: number;
  requestType: 'chat' | 'image' | 'embedding';
}

export interface DailyStats {
  date: string;
  totalCost: number;
  totalRequests: number;
  byProvider: Record<string, { cost: number; requests: number }>;
  byModel: Record<string, { cost: number; requests: number; tokens: number }>;
  records: UsageRecord[];
}

export interface CostSummary {
  dailySpend: number;
  dailyLimit: number;
  remainingBudget: number;
  percentUsed: number;
  isOverLimit: boolean;
  isNearLimit: boolean;
  localOnlyMode: boolean;
  byProvider: Record<string, { cost: number; requests: number }>;
  byModel: Record<string, { cost: number; requests: number }>;
  lastUpdated: Date;
}

export interface CostTrackerConfig {
  maxDailyCost: number;
  alertThreshold: number;
  enableLocalOnlyMode: boolean;
}

const DEFAULT_MAX_DAILY_COST = 5.00;
const DEFAULT_ALERT_THRESHOLD = 0.80;

function getDateKey(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

function getMaxDailyCost(): number {
  const envValue = process.env.MAX_DAILY_AI_COST;
  if (envValue) {
    const parsed = parseFloat(envValue);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_MAX_DAILY_COST;
}

class DailyCostTracker {
  private dailyStats: Map<string, DailyStats> = new Map();
  private config: CostTrackerConfig;
  private localOnlyModeActive: boolean = false;

  constructor(config: Partial<CostTrackerConfig> = {}) {
    this.config = {
      maxDailyCost: config.maxDailyCost ?? getMaxDailyCost(),
      alertThreshold: config.alertThreshold ?? DEFAULT_ALERT_THRESHOLD,
      enableLocalOnlyMode: config.enableLocalOnlyMode ?? true,
    };
  }

  private getOrCreateDailyStats(dateKey: string): DailyStats {
    if (!this.dailyStats.has(dateKey)) {
      this.dailyStats.set(dateKey, {
        date: dateKey,
        totalCost: 0,
        totalRequests: 0,
        byProvider: {},
        byModel: {},
        records: [],
      });
    }
    return this.dailyStats.get(dateKey)!;
  }

  private calculateCost(
    model: ModelName | string,
    inputTokens: number,
    outputTokens: number,
    imageCount: number
  ): number {
    const modelKey = model as ModelName;
    const costs = MODEL_COSTS[modelKey];
    
    if (!costs) {
      if (model.toLowerCase().includes('gpt-4o-mini')) {
        return (inputTokens * MODEL_COSTS['gpt-4o-mini'].inputPer1K + 
                outputTokens * MODEL_COSTS['gpt-4o-mini'].outputPer1K) / 1000;
      }
      if (model.toLowerCase().includes('gpt-4o') || model.toLowerCase().includes('gpt-4')) {
        return (inputTokens * MODEL_COSTS['gpt-4o'].inputPer1K + 
                outputTokens * MODEL_COSTS['gpt-4o'].outputPer1K) / 1000;
      }
      if (model.toLowerCase().includes('dall-e')) {
        return imageCount * MODEL_COSTS['dall-e-3'].perImage!;
      }
      return 0;
    }

    let cost = 0;
    if (inputTokens > 0 || outputTokens > 0) {
      cost += (inputTokens * costs.inputPer1K + outputTokens * costs.outputPer1K) / 1000;
    }
    if (imageCount > 0 && costs.perImage) {
      cost += imageCount * costs.perImage;
    }
    return cost;
  }

  recordUsage(params: {
    provider: AIProviderName;
    model: ModelName | string;
    inputTokens?: number;
    outputTokens?: number;
    imageCount?: number;
    requestType: 'chat' | 'image' | 'embedding';
  }): UsageRecord {
    const dateKey = getDateKey();
    const stats = this.getOrCreateDailyStats(dateKey);

    const inputTokens = params.inputTokens ?? 0;
    const outputTokens = params.outputTokens ?? 0;
    const imageCount = params.imageCount ?? 0;
    const cost = this.calculateCost(params.model, inputTokens, outputTokens, imageCount);

    const record: UsageRecord = {
      timestamp: new Date(),
      provider: params.provider,
      model: params.model,
      inputTokens,
      outputTokens,
      imageCount,
      cost,
      requestType: params.requestType,
    };

    stats.records.push(record);
    stats.totalCost += cost;
    stats.totalRequests += 1;

    if (!stats.byProvider[params.provider]) {
      stats.byProvider[params.provider] = { cost: 0, requests: 0 };
    }
    stats.byProvider[params.provider].cost += cost;
    stats.byProvider[params.provider].requests += 1;

    if (!stats.byModel[params.model]) {
      stats.byModel[params.model] = { cost: 0, requests: 0, tokens: 0 };
    }
    stats.byModel[params.model].cost += cost;
    stats.byModel[params.model].requests += 1;
    stats.byModel[params.model].tokens += inputTokens + outputTokens;

    this.checkThresholds(stats.totalCost);

    return record;
  }

  private checkThresholds(currentSpend: number): void {
    const percentUsed = currentSpend / this.config.maxDailyCost;

    if (percentUsed >= 1.0) {
      if (!this.localOnlyModeActive && this.config.enableLocalOnlyMode) {
        this.localOnlyModeActive = true;
        console.warn(`[CostTracker] ALERT: Daily limit ($${this.config.maxDailyCost}) exceeded! Current spend: $${currentSpend.toFixed(4)}. Switching to LOCAL_ONLY mode.`);
      }
    } else if (percentUsed >= this.config.alertThreshold) {
      const remaining = this.config.maxDailyCost - currentSpend;
      console.warn(`[CostTracker] WARNING: Approaching daily limit. ${(percentUsed * 100).toFixed(1)}% used. Remaining: $${remaining.toFixed(4)}`);
    }
  }

  getDailySpend(date?: Date): number {
    const dateKey = getDateKey(date);
    const stats = this.dailyStats.get(dateKey);
    return stats?.totalCost ?? 0;
  }

  getRemainingBudget(date?: Date): number {
    const spent = this.getDailySpend(date);
    return Math.max(0, this.config.maxDailyCost - spent);
  }

  shouldBlockCloudUsage(): boolean {
    if (!this.config.enableLocalOnlyMode) {
      return false;
    }

    const dateKey = getDateKey();
    const stats = this.dailyStats.get(dateKey);
    
    if (!stats) {
      this.localOnlyModeActive = false;
      return false;
    }

    if (stats.totalCost >= this.config.maxDailyCost) {
      this.localOnlyModeActive = true;
      return true;
    }

    this.localOnlyModeActive = false;
    return false;
  }

  isLocalOnlyMode(): boolean {
    return this.localOnlyModeActive;
  }

  getCostSummary(date?: Date): CostSummary {
    const dateKey = getDateKey(date);
    const stats = this.dailyStats.get(dateKey);
    const dailySpend = stats?.totalCost ?? 0;
    const dailyLimit = this.config.maxDailyCost;
    const remainingBudget = Math.max(0, dailyLimit - dailySpend);
    const percentUsed = dailyLimit > 0 ? (dailySpend / dailyLimit) * 100 : 0;

    return {
      dailySpend,
      dailyLimit,
      remainingBudget,
      percentUsed,
      isOverLimit: dailySpend >= dailyLimit,
      isNearLimit: percentUsed >= this.config.alertThreshold * 100,
      localOnlyMode: this.localOnlyModeActive,
      byProvider: stats?.byProvider ?? {},
      byModel: stats?.byModel ?? {},
      lastUpdated: new Date(),
    };
  }

  getDailyStats(date?: Date): DailyStats | null {
    const dateKey = getDateKey(date);
    return this.dailyStats.get(dateKey) ?? null;
  }

  resetDailyStats(date?: Date): void {
    const dateKey = getDateKey(date);
    this.dailyStats.delete(dateKey);
    
    if (dateKey === getDateKey()) {
      this.localOnlyModeActive = false;
    }
    
    console.log(`[CostTracker] Daily stats reset for ${dateKey}`);
  }

  setConfig(config: Partial<CostTrackerConfig>): void {
    this.config = { ...this.config, ...config };
    console.log(`[CostTracker] Config updated:`, this.config);
  }

  getConfig(): CostTrackerConfig {
    return { ...this.config };
  }

  forceLocalOnlyMode(enabled: boolean): void {
    this.localOnlyModeActive = enabled;
    console.log(`[CostTracker] Local-only mode manually set to: ${enabled}`);
  }

  cleanupOldStats(daysToKeep: number = 7): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffKey = getDateKey(cutoffDate);
    
    let removed = 0;
    for (const dateKey of this.dailyStats.keys()) {
      if (dateKey < cutoffKey) {
        this.dailyStats.delete(dateKey);
        removed++;
      }
    }
    
    if (removed > 0) {
      console.log(`[CostTracker] Cleaned up ${removed} old daily stats entries`);
    }
    
    return removed;
  }

  exportStats(): { stats: DailyStats[]; config: CostTrackerConfig } {
    return {
      stats: Array.from(this.dailyStats.values()),
      config: this.getConfig(),
    };
  }
}

export const costTracker = new DailyCostTracker();

export function recordAIUsage(params: {
  provider: AIProviderName;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  imageCount?: number;
  requestType: 'chat' | 'image' | 'embedding';
}): UsageRecord {
  return costTracker.recordUsage(params);
}

export function shouldBlockCloudUsage(): boolean {
  return costTracker.shouldBlockCloudUsage();
}

export function getCostSummary(date?: Date): CostSummary {
  return costTracker.getCostSummary(date);
}

export function getDailySpend(date?: Date): number {
  return costTracker.getDailySpend(date);
}

export function getRemainingBudget(date?: Date): number {
  return costTracker.getRemainingBudget(date);
}

export function isLocalOnlyMode(): boolean {
  return costTracker.isLocalOnlyMode();
}

export function resetDailyCosts(date?: Date): void {
  costTracker.resetDailyStats(date);
}

export { DailyCostTracker };
