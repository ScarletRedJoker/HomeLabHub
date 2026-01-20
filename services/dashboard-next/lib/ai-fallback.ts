/**
 * AI Fallback System
 * Centralized fallback logic for AI providers with health check caching,
 * automatic provider selection, and metrics tracking
 */

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
    localAIOnly: boolean = false
  ): Promise<FallbackDecision> {
    this.metrics.totalRequests++;

    if (requestedProvider === "custom" && customEndpoint) {
      return {
        provider: "custom",
        isFallback: false,
        reason: "Custom endpoint requested",
      };
    }

    if (requestedProvider === "openai") {
      if (localAIOnly) {
        console.log("[AIFallback] OpenAI explicitly requested but LOCAL_AI_ONLY is enabled - allowing explicit request");
      }
      this.metrics.openaiRequests++;
      return {
        provider: "openai",
        isFallback: false,
        reason: "OpenAI explicitly requested",
      };
    }

    const ollamaHealth = await this.checkOllamaHealth();

    if (requestedProvider === "ollama" || localAIOnly) {
      if (ollamaHealth.status === "online" || ollamaHealth.status === "degraded") {
        this.metrics.ollamaRequests++;
        return {
          provider: "ollama",
          isFallback: false,
          reason: ollamaHealth.status === "degraded" 
            ? "Ollama available (degraded)" 
            : localAIOnly ? "Ollama online (local-only mode)" : "Ollama online",
        };
      }

      if (localAIOnly) {
        throw new Error("Local AI is offline. Please start Ollama on your Windows VM or set LOCAL_AI_ONLY=false to allow cloud fallback.");
      }

      const openaiHealth = await this.checkOpenAIHealth();
      if (openaiHealth.status === "online") {
        this.recordFallback("Ollama requested but offline");
        return {
          provider: "openai",
          isFallback: true,
          reason: `Ollama offline (${ollamaHealth.error || "unreachable"}), using OpenAI fallback`,
          originalProvider: "ollama",
        };
      }

      throw new Error("Both Ollama and OpenAI are unavailable");
    }

    if (ollamaHealth.status === "online") {
      this.metrics.ollamaRequests++;
      return {
        provider: "ollama",
        isFallback: false,
        reason: "Auto-selected Ollama (local, preferred)",
      };
    }

    if (ollamaHealth.status === "degraded") {
      this.metrics.ollamaRequests++;
      return {
        provider: "ollama",
        isFallback: false,
        reason: "Auto-selected Ollama (local, degraded but available)",
      };
    }

    const openaiHealth = await this.checkOpenAIHealth();
    if (openaiHealth.status === "online") {
      this.metrics.openaiRequests++;
      return {
        provider: "openai",
        isFallback: requestedProvider === "auto" ? false : true,
        reason: "Auto-selected OpenAI (local AI offline)",
        originalProvider: requestedProvider === "auto" ? undefined : "ollama",
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
}

export const aiFallbackManager = new AIFallbackManager();
