/**
 * AI Fallback System
 * Centralized fallback logic for AI providers with health check caching,
 * automatic provider selection, and metrics tracking
 * 
 * Integrates with:
 * - Circuit breaker for resilience
 * - Proactive health monitoring
 * - Usage metrics and 80/20 local/cloud ratio enforcement
 */

import { circuitBreaker, healthMonitor, ServiceName, getResilienceStatus } from "./ai-resilience";
import { aiMetrics, recordChatUsage as recordMetricsChatUsage } from "./ai-metrics";

export type AIProviderType = "ollama" | "openai" | "custom";

export interface ProviderHealth {
  provider: AIProviderType;
  status: "online" | "offline" | "degraded";
  latencyMs?: number;
  checkedAt: Date;
  error?: string;
}

export interface FallbackMetrics {
  totalRequests: number;
  ollamaRequests: number;
  openaiRequests: number;
  fallbackCount: number;
  lastFallbackAt?: Date;
  lastFallbackReason?: string;
  healthCheckCount: number;
  averageLatencyMs: number;
}

export interface FallbackDecision {
  provider: AIProviderType;
  isFallback: boolean;
  reason: string;
  originalProvider?: AIProviderType;
}

export interface EnhancedStatus {
  provider: AIProviderType;
  status: "online" | "offline" | "degraded";
  circuitState: "closed" | "open" | "half-open";
  available: boolean;
  reason: string;
  latencyMs?: number;
  checkedAt: Date;
  circuitFailureCount?: number;
  circuitTotalFailures?: number;
  circuitMsUntilReset?: number;
}

export interface EnhancedFallbackStatus {
  selected: EnhancedStatus;
  fallback: EnhancedStatus | null;
  metrics: FallbackMetrics;
  ratioStatus: {
    localRatio: number;
    cloudRatio: number;
    isWithinTarget: boolean;
    targetLocalRatio: number;
  };
  resilience: ReturnType<typeof getResilienceStatus>;
  cacheAge: { ollama?: number; openai?: number };
}

interface CachedHealth {
  health: ProviderHealth;
  expiresAt: number;
}

const HEALTH_CHECK_TIMEOUT_MS = 3000;
const HEALTH_CACHE_TTL_MS = 60000;

class AIFallbackManager {
  private healthCache: Map<AIProviderType, CachedHealth> = new Map();
  private metrics: FallbackMetrics = {
    totalRequests: 0,
    ollamaRequests: 0,
    openaiRequests: 0,
    fallbackCount: 0,
    healthCheckCount: 0,
    averageLatencyMs: 0,
  };
  private latencyHistory: number[] = [];

  getOllamaUrl(): string {
    const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
    return process.env.OLLAMA_URL || `http://${WINDOWS_VM_IP}:11434`;
  }

  async checkOllamaHealth(forceRefresh = false): Promise<ProviderHealth> {
    const cached = this.healthCache.get("ollama");
    if (!forceRefresh && cached && Date.now() < cached.expiresAt) {
      console.log(`[AIFallback] Using cached Ollama health status: ${cached.health.status}`);
      return cached.health;
    }

    this.metrics.healthCheckCount++;
    const start = Date.now();
    const ollamaUrl = this.getOllamaUrl();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

      const response = await fetch(`${ollamaUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const latencyMs = Date.now() - start;
      this.updateLatency(latencyMs);

      if (!response.ok) {
        const health: ProviderHealth = {
          provider: "ollama",
          status: "offline",
          latencyMs,
          checkedAt: new Date(),
          error: `HTTP ${response.status}`,
        };
        this.cacheHealth("ollama", health);
        console.log(`[AIFallback] Ollama health check failed: HTTP ${response.status}`);
        return health;
      }

      const health: ProviderHealth = {
        provider: "ollama",
        status: latencyMs > 2000 ? "degraded" : "online",
        latencyMs,
        checkedAt: new Date(),
      };
      this.cacheHealth("ollama", health);
      console.log(`[AIFallback] Ollama health check passed: ${health.status} (${latencyMs}ms)`);
      return health;
    } catch (error: any) {
      const latencyMs = Date.now() - start;
      const health: ProviderHealth = {
        provider: "ollama",
        status: "offline",
        latencyMs,
        checkedAt: new Date(),
        error: error.name === "AbortError" ? "Timeout" : error.message,
      };
      this.cacheHealth("ollama", health);
      console.log(`[AIFallback] Ollama health check error: ${health.error}`);
      return health;
    }
  }

  private initializeHealthMonitoring(): void {
    const ollamaHealthCheckFn = async () => {
      const health = await this.checkOllamaHealth();
      return {
        healthy: health.status === "online",
        latencyMs: health.latencyMs,
        error: health.error,
      };
    };

    healthMonitor.registerHealthCheck("ollama", ollamaHealthCheckFn);
    console.log("[AIFallback] Registered Ollama health check with resilience monitor");
  }

  async checkOpenAIHealth(): Promise<ProviderHealth> {
    const cached = this.healthCache.get("openai");
    if (cached && Date.now() < cached.expiresAt) {
      return cached.health;
    }

    const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    const directKey = process.env.OPENAI_API_KEY;
    const apiKey = (integrationKey && integrationKey.startsWith('sk-')) ? integrationKey : directKey;

    const health: ProviderHealth = {
      provider: "openai",
      status: apiKey && apiKey.startsWith('sk-') ? "online" : "offline",
      checkedAt: new Date(),
      error: apiKey ? undefined : "OpenAI API key not configured",
    };

    this.cacheHealth("openai", health);
    return health;
  }

  async selectProvider(
    requestedProvider: "auto" | "ollama" | "openai" | "custom",
    customEndpoint?: string,
    localAIOnly: boolean = false,
    forceLocalOverride: boolean = false
  ): Promise<FallbackDecision> {
    this.metrics.totalRequests++;

    if (requestedProvider === "custom" && customEndpoint) {
      return {
        provider: "custom",
        isFallback: false,
        reason: "Custom endpoint requested",
      };
    }

    // Get health status early for all checks
    const ollamaHealth = await this.checkOllamaHealth();
    const openaiHealth = await this.checkOpenAIHealth();

    // Determine circuit breaker status
    const ollamaCanRequest = circuitBreaker.canRequest("ollama");
    const openaiCanRequest = circuitBreaker.canRequest("openai");

    // Determine if Ollama is usable (healthy and circuit not broken)
    const ollamaUsable = (ollamaHealth.status === "online" || ollamaHealth.status === "degraded") && ollamaCanRequest;

    // Check if local should be forced due to usage ratio or override
    // At this point, requestedProvider is not "custom" (handled above and returns early)
    const providerForRatioCheck = requestedProvider as "auto" | "ollama" | "openai";
    const forceLocalCheck = aiMetrics.shouldForceLocal(providerForRatioCheck);
    const shouldForceLocal = forceLocalOverride || forceLocalCheck.forceLocal;

    if (forceLocalCheck.forceLocal) {
      console.log(`[AIFallback] Ratio enforcement active: ${forceLocalCheck.reason}`);
    }
    if (forceLocalOverride && !forceLocalCheck.forceLocal) {
      console.log(`[AIFallback] Local override active - forcing local provider`);
    }

    // ENFORCEMENT: When ratio is being enforced, Ollama MUST be used if available
    if (shouldForceLocal) {
      if (ollamaUsable) {
        this.metrics.ollamaRequests++;
        const reason = forceLocalCheck.forceLocal
          ? `Ollama selected (ratio enforcement: ${forceLocalCheck.reason})`
          : "Ollama selected (local override active)";
        return {
          provider: "ollama",
          isFallback: false,
          reason,
        };
      }

      // Ollama not available - can we use OpenAI?
      const ratioPolicy = aiMetrics.getRatioPolicy();

      // Allow OpenAI only if:
      // 1. User explicitly requested OpenAI AND allowExplicitCloudOverride is true, OR
      // 2. User requested auto/ollama (as fallback)
      let allowOpenAI = false;
      let openaiBlockReason = "";

      if (requestedProvider === "openai") {
        if (ratioPolicy.allowExplicitCloudOverride) {
          allowOpenAI = true;
        } else {
          openaiBlockReason = "User explicitly requested OpenAI but allowExplicitCloudOverride=false";
        }
      } else if (requestedProvider === "auto" || requestedProvider === "ollama") {
        allowOpenAI = true;
      } else {
        openaiBlockReason = `Ratio enforcement blocks cloud usage for request type: ${requestedProvider}`;
      }

      if (allowOpenAI && openaiHealth.status === "online" && openaiCanRequest) {
        this.metrics.openaiRequests++;
        const reason =
          requestedProvider === "openai"
            ? "OpenAI selected despite ratio enforcement (explicit request + allowExplicitCloudOverride)"
            : `OpenAI fallback (Ollama offline, ratio enforcement active)`;
        if (requestedProvider !== "openai") {
          this.recordFallback(`Ratio enforcement active, Ollama offline, allowing ${requestedProvider} fallback`);
        }
        return {
          provider: "openai",
          isFallback: requestedProvider !== "openai",
          reason,
          originalProvider: requestedProvider === "openai" ? undefined : "ollama",
        };
      }

      // Can't use OpenAI due to ratio enforcement
      if (openaiBlockReason) {
        console.log(`[AIFallback] Ratio enforcement blocks cloud usage: ${openaiBlockReason}`);
      }
      throw new Error("Ratio enforcement blocks cloud usage and local provider is unavailable");
    }

    // Normal logic (no ratio enforcement)

    // Handle explicit OpenAI request
    if (requestedProvider === "openai") {
      if (localAIOnly) {
        throw new Error("LOCAL_AI_ONLY is enabled, cannot use OpenAI");
      }

      if (!openaiCanRequest) {
        const status = circuitBreaker.getStatus("openai");
        throw new Error(`OpenAI circuit breaker is ${status.state}. Will reset in ${status.msUntilReset}ms.`);
      }

      this.metrics.openaiRequests++;
      return {
        provider: "openai",
        isFallback: false,
        reason: "OpenAI explicitly requested",
      };
    }

    // Handle explicit Ollama request or local-only mode
    if (requestedProvider === "ollama" || localAIOnly) {
      if (ollamaUsable) {
        this.metrics.ollamaRequests++;
        return {
          provider: "ollama",
          isFallback: false,
          reason:
            ollamaHealth.status === "degraded"
              ? "Ollama available (degraded)"
              : "Ollama online",
        };
      }

      if (localAIOnly) {
        throw new Error("Local AI is offline. Please start Ollama on your Windows VM or set LOCAL_AI_ONLY=false to allow cloud fallback.");
      }

      // Ollama was requested but offline - allow OpenAI fallback
      if (openaiHealth.status === "online" && openaiCanRequest) {
        this.recordFallback("Ollama requested but offline");
        this.metrics.openaiRequests++;
        return {
          provider: "openai",
          isFallback: true,
          reason: `Ollama offline (${ollamaHealth.error || "unreachable"}), using OpenAI fallback`,
          originalProvider: "ollama",
        };
      }

      throw new Error("Both Ollama and OpenAI are unavailable");
    }

    // Auto selection
    if (ollamaUsable) {
      this.metrics.ollamaRequests++;
      return {
        provider: "ollama",
        isFallback: false,
        reason: "Auto-selected Ollama (local, preferred)",
      };
    }

    // Ollama not available in auto mode - try OpenAI
    if (openaiHealth.status === "online" && openaiCanRequest) {
      this.metrics.openaiRequests++;
      return {
        provider: "openai",
        isFallback: true,
        reason: "Auto-selected OpenAI (local AI offline)",
      };
    }

    throw new Error("No AI providers available");
  }

  private cacheHealth(provider: AIProviderType, health: ProviderHealth): void {
    this.healthCache.set(provider, {
      health,
      expiresAt: Date.now() + HEALTH_CACHE_TTL_MS,
    });
  }

  private updateLatency(latencyMs: number): void {
    this.latencyHistory.push(latencyMs);
    if (this.latencyHistory.length > 100) {
      this.latencyHistory.shift();
    }
    this.metrics.averageLatencyMs = Math.round(
      this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length
    );
  }

  private recordFallback(reason: string): void {
    this.metrics.fallbackCount++;
    this.metrics.lastFallbackAt = new Date();
    this.metrics.lastFallbackReason = reason;
    this.metrics.openaiRequests++;
    console.log(`[AIFallback] Fallback triggered: ${reason}`);
  }

  recordRequestSuccess(
    provider: AIProviderType,
    latencyMs: number,
    options?: {
      model?: string;
      tokens?: { prompt: number; completion: number; total: number };
      fallback?: boolean;
    }
  ): void {
    if (provider === "ollama") {
      circuitBreaker.recordSuccess("ollama");
      recordMetricsChatUsage("ollama", true, latencyMs, options?.tokens, {
        model: options?.model,
        fallback: options?.fallback,
      });
    } else if (provider === "openai") {
      circuitBreaker.recordSuccess("openai");
      recordMetricsChatUsage("openai", true, latencyMs, options?.tokens, {
        model: options?.model,
        fallback: options?.fallback,
      });
    }
    console.log(`[AIFallback] Request successful: ${provider} (${latencyMs}ms)`);
  }

  recordRequestFailure(
    provider: AIProviderType,
    error: Error,
    latencyMs?: number
  ): void {
    if (provider === "ollama") {
      circuitBreaker.recordFailure("ollama", error);
      recordMetricsChatUsage("ollama", false, latencyMs || 0, undefined, {
        fallback: false,
      });
    } else if (provider === "openai") {
      circuitBreaker.recordFailure("openai", error);
      recordMetricsChatUsage("openai", false, latencyMs || 0, undefined, {
        fallback: false,
      });
    }
    console.log(`[AIFallback] Request failed: ${provider} - ${error.message}`);
  }

  invalidateCache(provider?: AIProviderType): void {
    if (provider) {
      this.healthCache.delete(provider);
      console.log(`[AIFallback] Cache invalidated for ${provider}`);
    } else {
      this.healthCache.clear();
      console.log(`[AIFallback] All caches invalidated`);
    }
  }

  getCachedHealth(provider: AIProviderType): ProviderHealth | null {
    const cached = this.healthCache.get(provider);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.health;
    }
    return null;
  }

  getAllCachedHealth(): Record<AIProviderType, ProviderHealth | null> {
    return {
      ollama: this.getCachedHealth("ollama"),
      openai: this.getCachedHealth("openai"),
      custom: null,
    };
  }

  getMetrics(): FallbackMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      ollamaRequests: 0,
      openaiRequests: 0,
      fallbackCount: 0,
      healthCheckCount: 0,
      averageLatencyMs: 0,
    };
    this.latencyHistory = [];
    console.log(`[AIFallback] Metrics reset`);
  }

  getStatus(): {
    ollamaHealth: ProviderHealth | null;
    openaiHealth: ProviderHealth | null;
    metrics: FallbackMetrics;
    cacheAge: { ollama?: number; openai?: number };
  } {
    const ollamaCached = this.healthCache.get("ollama");
    const openaiCached = this.healthCache.get("openai");

    return {
      ollamaHealth: ollamaCached ? ollamaCached.health : null,
      openaiHealth: openaiCached ? openaiCached.health : null,
      metrics: this.getMetrics(),
      cacheAge: {
        ollama: ollamaCached ? Date.now() - ollamaCached.health.checkedAt.getTime() : undefined,
        openai: openaiCached ? Date.now() - openaiCached.health.checkedAt.getTime() : undefined,
      },
    };
  }

  getEnhancedStatus(): EnhancedFallbackStatus {
    const ollamaCached = this.healthCache.get("ollama");
    const openaiCached = this.healthCache.get("openai");
    
    const ollamaHealth = ollamaCached?.health;
    const openaiHealth = openaiCached?.health;
    
    const ollamaCircuitStatus = circuitBreaker.getStatus("ollama");
    const openaiCircuitStatus = circuitBreaker.getStatus("openai");
    
    const metricsSnapshot = aiMetrics.getSnapshot("day");
    const ratioStatus = aiMetrics.getRatioPolicy();
    const resilienceStatus = getResilienceStatus();

    const buildEnhancedStatus = (
      provider: AIProviderType,
      baseHealth: ProviderHealth | undefined,
      circuitStatus: ReturnType<typeof circuitBreaker.getStatus>
    ): EnhancedStatus => {
      const isAvailable =
        baseHealth?.status === "online" && circuitStatus.state === "closed";
      const isDegraded =
        baseHealth?.status === "degraded" && circuitStatus.state === "closed";
      const isOffline =
        baseHealth?.status === "offline" || circuitStatus.state === "open";

      let status: "online" | "offline" | "degraded" = "offline";
      if (isAvailable) status = "online";
      else if (isDegraded) status = "degraded";

      let reason = `${provider}: `;
      if (circuitStatus.state === "open") {
        reason += `Circuit is open (${circuitStatus.totalFailures} failures)`;
      } else if (circuitStatus.state === "half-open") {
        reason += "Circuit is half-open, probing for recovery";
      } else if (baseHealth?.status === "offline") {
        reason += baseHealth.error || "Health check failed";
      } else if (baseHealth?.status === "degraded") {
        reason += `Degraded (${baseHealth.latencyMs}ms latency)`;
      } else {
        reason += "No health information";
      }

      return {
        provider,
        status,
        circuitState: circuitStatus.state,
        available: isAvailable || isDegraded,
        reason,
        latencyMs: baseHealth?.latencyMs,
        checkedAt: baseHealth?.checkedAt || new Date(),
        circuitFailureCount: circuitStatus.failureCount,
        circuitTotalFailures: circuitStatus.totalFailures,
        circuitMsUntilReset: circuitStatus.msUntilReset,
      };
    };

    const selectedStatus = buildEnhancedStatus(
      ollamaHealth?.provider === "ollama" ? "ollama" : "openai",
      ollamaHealth || openaiHealth,
      ollamaHealth ? ollamaCircuitStatus : openaiCircuitStatus
    );

    const fallbackStatus =
      ollamaHealth && openaiHealth
        ? buildEnhancedStatus(
            ollamaHealth.provider === "ollama" ? "openai" : "ollama",
            ollamaHealth.provider === "ollama" ? openaiHealth : ollamaHealth,
            ollamaHealth.provider === "ollama"
              ? openaiCircuitStatus
              : ollamaCircuitStatus
          )
        : null;

    return {
      selected: selectedStatus,
      fallback: fallbackStatus,
      metrics: this.getMetrics(),
      ratioStatus: {
        localRatio: metricsSnapshot.localRatio,
        cloudRatio: metricsSnapshot.cloudRatio,
        isWithinTarget: metricsSnapshot.isWithinTarget,
        targetLocalRatio: ratioStatus.targetLocalRatio,
      },
      resilience: resilienceStatus,
      cacheAge: {
        ollama: ollamaCached
          ? Date.now() - ollamaCached.health.checkedAt.getTime()
          : undefined,
        openai: openaiCached
          ? Date.now() - openaiCached.health.checkedAt.getTime()
          : undefined,
      },
    };
  }

  startProactiveMonitoring(intervalMs: number = 30000): void {
    this.initializeHealthMonitoring();
    healthMonitor.startMonitoring(intervalMs);
    console.log("[AIFallback] Proactive health monitoring started");
  }

  stopProactiveMonitoring(): void {
    healthMonitor.stopMonitoring();
    console.log("[AIFallback] Proactive health monitoring stopped");
  }

  isProactiveMonitoringActive(): boolean {
    return healthMonitor.isMonitoring();
  }
}

export const aiFallbackManager = new AIFallbackManager();
