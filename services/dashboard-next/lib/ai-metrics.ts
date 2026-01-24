/**
 * AI Usage Metrics and Cost Tracking
 * Tracks provider usage to enforce 80% local / 20% cloud ratio
 * Provides insights into costs and usage patterns
 */

export type MetricProvider = "ollama" | "openai" | "stable-diffusion" | "comfyui" | "replicate";
export type RequestType = "chat" | "image" | "video" | "embedding" | "code" | "content";

export interface UsageRecord {
  provider: MetricProvider;
  requestType: RequestType;
  tokens?: { prompt: number; completion: number; total: number };
  latencyMs: number;
  success: boolean;
  fallback: boolean;
  fallbackReason?: string;
  timestamp: Date;
  model?: string;
  estimatedCostUsd?: number;
}

export interface ProviderMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  fallbackRequests: number;
  totalTokens: number;
  averageLatencyMs: number;
  estimatedCostUsd: number;
  lastRequestAt: Date | null;
}

export interface UsageSnapshot {
  period: "hour" | "day" | "week" | "all";
  startTime: Date;
  endTime: Date;
  providers: Record<MetricProvider, ProviderMetrics>;
  localRatio: number;
  cloudRatio: number;
  totalRequests: number;
  totalCostUsd: number;
  targetLocalRatio: number;
  isWithinTarget: boolean;
}

export interface RatioPolicy {
  targetLocalRatio: number;
  enforcePolicy: boolean;
  allowExplicitCloudOverride: boolean;
  warningThreshold: number;
}

const COST_PER_1K_TOKENS: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 0.005, output: 0.015 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4-turbo": { input: 0.01, output: 0.03 },
  "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
  "dall-e-3": { input: 0.04, output: 0 },
  "gpt-image-1": { input: 0.02, output: 0 },
};

const LOCAL_PROVIDERS: MetricProvider[] = ["ollama", "stable-diffusion", "comfyui"];
const CLOUD_PROVIDERS: MetricProvider[] = ["openai", "replicate"];

class AIMetricsTracker {
  private records: UsageRecord[] = [];
  private maxRecords: number = 10000;
  private ratioPolicy: RatioPolicy = {
    targetLocalRatio: 0.8,
    enforcePolicy: true,
    allowExplicitCloudOverride: true,
    warningThreshold: 0.7,
  };

  recordUsage(record: UsageRecord): void {
    if (!record.estimatedCostUsd && record.tokens && record.model) {
      record.estimatedCostUsd = this.estimateCost(record.model, record.tokens);
    }

    this.records.push(record);

    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-Math.floor(this.maxRecords * 0.8));
    }

    console.log(
      `[AIMetrics] ${record.provider}/${record.requestType}: ${record.success ? "ok" : "fail"} ` +
      `${record.latencyMs}ms ${record.fallback ? "(fallback)" : ""}`
    );
  }

  private estimateCost(model: string, tokens: { prompt: number; completion: number }): number {
    const modelKey = Object.keys(COST_PER_1K_TOKENS).find(
      (k) => model.toLowerCase().includes(k.toLowerCase())
    );
    
    if (!modelKey) return 0;
    
    const costs = COST_PER_1K_TOKENS[modelKey];
    return (tokens.prompt * costs.input + tokens.completion * costs.output) / 1000;
  }

  getSnapshot(period: "hour" | "day" | "week" | "all" = "day"): UsageSnapshot {
    const now = new Date();
    let startTime: Date;

    switch (period) {
      case "hour":
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case "day":
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "week":
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "all":
      default:
        startTime = new Date(0);
    }

    const periodRecords = this.records.filter(
      (r) => r.timestamp.getTime() >= startTime.getTime()
    );

    const providers: Record<MetricProvider, ProviderMetrics> = {
      ollama: this.getProviderMetrics("ollama", periodRecords),
      openai: this.getProviderMetrics("openai", periodRecords),
      "stable-diffusion": this.getProviderMetrics("stable-diffusion", periodRecords),
      comfyui: this.getProviderMetrics("comfyui", periodRecords),
      replicate: this.getProviderMetrics("replicate", periodRecords),
    };

    const localRequests = LOCAL_PROVIDERS.reduce(
      (sum, p) => sum + providers[p].totalRequests,
      0
    );
    const cloudRequests = CLOUD_PROVIDERS.reduce(
      (sum, p) => sum + providers[p].totalRequests,
      0
    );
    const totalRequests = localRequests + cloudRequests;

    const localRatio = totalRequests > 0 ? localRequests / totalRequests : 1;
    const cloudRatio = totalRequests > 0 ? cloudRequests / totalRequests : 0;

    const totalCostUsd = Object.values(providers).reduce(
      (sum, p) => sum + p.estimatedCostUsd,
      0
    );

    return {
      period,
      startTime,
      endTime: now,
      providers,
      localRatio,
      cloudRatio,
      totalRequests,
      totalCostUsd,
      targetLocalRatio: this.ratioPolicy.targetLocalRatio,
      isWithinTarget: localRatio >= this.ratioPolicy.targetLocalRatio,
    };
  }

  private getProviderMetrics(
    provider: MetricProvider,
    records: UsageRecord[]
  ): ProviderMetrics {
    const providerRecords = records.filter((r) => r.provider === provider);

    if (providerRecords.length === 0) {
      return {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        fallbackRequests: 0,
        totalTokens: 0,
        averageLatencyMs: 0,
        estimatedCostUsd: 0,
        lastRequestAt: null,
      };
    }

    const successful = providerRecords.filter((r) => r.success);
    const fallbacks = providerRecords.filter((r) => r.fallback);
    const totalTokens = providerRecords.reduce(
      (sum, r) => sum + (r.tokens?.total || 0),
      0
    );
    const avgLatency =
      providerRecords.reduce((sum, r) => sum + r.latencyMs, 0) /
      providerRecords.length;
    const totalCost = providerRecords.reduce(
      (sum, r) => sum + (r.estimatedCostUsd || 0),
      0
    );

    return {
      totalRequests: providerRecords.length,
      successfulRequests: successful.length,
      failedRequests: providerRecords.length - successful.length,
      fallbackRequests: fallbacks.length,
      totalTokens,
      averageLatencyMs: Math.round(avgLatency),
      estimatedCostUsd: totalCost,
      lastRequestAt: providerRecords[providerRecords.length - 1].timestamp,
    };
  }

  shouldForceLocal(requestedProvider: "auto" | "ollama" | "openai"): {
    forceLocal: boolean;
    reason?: string;
  } {
    if (!this.ratioPolicy.enforcePolicy) {
      return { forceLocal: false };
    }

    if (requestedProvider === "openai" && this.ratioPolicy.allowExplicitCloudOverride) {
      return { forceLocal: false };
    }

    const snapshot = this.getSnapshot("hour");

    if (snapshot.totalRequests < 10) {
      return { forceLocal: false };
    }

    if (snapshot.localRatio < this.ratioPolicy.targetLocalRatio) {
      return {
        forceLocal: true,
        reason: `Local ratio (${(snapshot.localRatio * 100).toFixed(1)}%) below target (${
          this.ratioPolicy.targetLocalRatio * 100
        }%). Forcing local provider.`,
      };
    }

    return { forceLocal: false };
  }

  getRatioWarning(): { hasWarning: boolean; message?: string } {
    const snapshot = this.getSnapshot("day");

    if (snapshot.totalRequests < 10) {
      return { hasWarning: false };
    }

    if (snapshot.localRatio < this.ratioPolicy.warningThreshold) {
      return {
        hasWarning: true,
        message: `Warning: Local AI usage (${(snapshot.localRatio * 100).toFixed(1)}%) is below the warning threshold (${
          this.ratioPolicy.warningThreshold * 100
        }%). Consider using local providers more often.`,
      };
    }

    return { hasWarning: false };
  }

  setRatioPolicy(policy: Partial<RatioPolicy>): void {
    this.ratioPolicy = { ...this.ratioPolicy, ...policy };
    console.log(`[AIMetrics] Ratio policy updated:`, this.ratioPolicy);
  }

  getRatioPolicy(): RatioPolicy {
    return { ...this.ratioPolicy };
  }

  getRecentRecords(count: number = 50): UsageRecord[] {
    return this.records.slice(-count);
  }

  clearRecords(): void {
    this.records = [];
    console.log("[AIMetrics] All records cleared");
  }

  exportMetrics(): {
    records: UsageRecord[];
    hourlySnapshot: UsageSnapshot;
    dailySnapshot: UsageSnapshot;
    weeklySnapshot: UsageSnapshot;
    ratioPolicy: RatioPolicy;
  } {
    return {
      records: this.records,
      hourlySnapshot: this.getSnapshot("hour"),
      dailySnapshot: this.getSnapshot("day"),
      weeklySnapshot: this.getSnapshot("week"),
      ratioPolicy: this.ratioPolicy,
    };
  }
}

export const aiMetrics = new AIMetricsTracker();

export function recordChatUsage(
  provider: MetricProvider,
  success: boolean,
  latencyMs: number,
  tokens?: { prompt: number; completion: number; total: number },
  options: {
    model?: string;
    fallback?: boolean;
    fallbackReason?: string;
  } = {}
): void {
  aiMetrics.recordUsage({
    provider,
    requestType: "chat",
    tokens,
    latencyMs,
    success,
    fallback: options.fallback || false,
    fallbackReason: options.fallbackReason,
    timestamp: new Date(),
    model: options.model,
  });
}

export function recordImageUsage(
  provider: MetricProvider,
  success: boolean,
  latencyMs: number,
  options: {
    model?: string;
    fallback?: boolean;
    fallbackReason?: string;
  } = {}
): void {
  aiMetrics.recordUsage({
    provider,
    requestType: "image",
    latencyMs,
    success,
    fallback: options.fallback || false,
    fallbackReason: options.fallbackReason,
    timestamp: new Date(),
    model: options.model,
  });
}

export function recordVideoUsage(
  provider: MetricProvider,
  success: boolean,
  latencyMs: number,
  options: {
    model?: string;
    fallback?: boolean;
    fallbackReason?: string;
  } = {}
): void {
  aiMetrics.recordUsage({
    provider,
    requestType: "video",
    latencyMs,
    success,
    fallback: options.fallback || false,
    fallbackReason: options.fallbackReason,
    timestamp: new Date(),
    model: options.model,
  });
}

export function recordContentUsage(
  provider: MetricProvider,
  success: boolean,
  latencyMs: number,
  options: {
    model?: string;
    fallback?: boolean;
    fallbackReason?: string;
    tokens?: { prompt: number; completion: number; total: number };
  } = {}
): void {
  aiMetrics.recordUsage({
    provider,
    requestType: "content",
    tokens: options.tokens,
    latencyMs,
    success,
    fallback: options.fallback || false,
    fallbackReason: options.fallbackReason,
    timestamp: new Date(),
    model: options.model,
  });
}
