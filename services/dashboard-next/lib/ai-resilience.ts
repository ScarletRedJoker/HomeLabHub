/**
 * AI Resilience Layer
 * Provides circuit breaker pattern, retry logic with exponential backoff,
 * and failure tracking for AI service calls
 */

export type ServiceName = "ollama" | "openai" | "stable-diffusion" | "comfyui" | "replicate";

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  resetTimeoutMs: number;
  halfOpenRequests: number;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
}

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  halfOpenAttempts: number;
  totalRequests: number;
  totalFailures: number;
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  successThreshold: 2,
  resetTimeoutMs: 30000,
  halfOpenRequests: 1,
};

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

class CircuitBreaker {
  private states: Map<ServiceName, CircuitBreakerState> = new Map();
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
  }

  private getState(service: ServiceName): CircuitBreakerState {
    if (!this.states.has(service)) {
      this.states.set(service, {
        state: "closed",
        failureCount: 0,
        successCount: 0,
        lastFailureTime: 0,
        lastSuccessTime: 0,
        halfOpenAttempts: 0,
        totalRequests: 0,
        totalFailures: 0,
      });
    }
    return this.states.get(service)!;
  }

  canRequest(service: ServiceName): boolean {
    const state = this.getState(service);

    if (state.state === "closed") {
      return true;
    }

    if (state.state === "open") {
      const timeSinceLastFailure = Date.now() - state.lastFailureTime;
      if (timeSinceLastFailure >= this.config.resetTimeoutMs) {
        state.state = "half-open";
        state.halfOpenAttempts = 0;
        console.log(`[CircuitBreaker] ${service}: open -> half-open (reset timeout elapsed)`);
        return true;
      }
      return false;
    }

    if (state.state === "half-open") {
      return state.halfOpenAttempts < this.config.halfOpenRequests;
    }

    return false;
  }

  recordSuccess(service: ServiceName): void {
    const state = this.getState(service);
    state.totalRequests++;
    state.lastSuccessTime = Date.now();

    if (state.state === "half-open") {
      state.successCount++;
      if (state.successCount >= this.config.successThreshold) {
        state.state = "closed";
        state.failureCount = 0;
        state.successCount = 0;
        console.log(`[CircuitBreaker] ${service}: half-open -> closed (success threshold met)`);
      }
    } else if (state.state === "closed") {
      state.failureCount = 0;
    }
  }

  recordFailure(service: ServiceName, error: Error): void {
    const state = this.getState(service);
    state.totalRequests++;
    state.totalFailures++;
    state.failureCount++;
    state.lastFailureTime = Date.now();

    if (state.state === "half-open") {
      state.halfOpenAttempts++;
      state.state = "open";
      console.log(`[CircuitBreaker] ${service}: half-open -> open (failure during probe)`);
    } else if (state.state === "closed") {
      if (state.failureCount >= this.config.failureThreshold) {
        state.state = "open";
        console.log(`[CircuitBreaker] ${service}: closed -> open (failure threshold: ${error.message})`);
      }
    }
  }

  getStatus(service: ServiceName): {
    state: CircuitState;
    failureCount: number;
    totalRequests: number;
    totalFailures: number;
    lastFailureTime: number;
    lastSuccessTime: number;
    msUntilReset?: number;
  } {
    const state = this.getState(service);
    let msUntilReset: number | undefined;

    if (state.state === "open") {
      const elapsed = Date.now() - state.lastFailureTime;
      msUntilReset = Math.max(0, this.config.resetTimeoutMs - elapsed);
    }

    return {
      state: state.state,
      failureCount: state.failureCount,
      totalRequests: state.totalRequests,
      totalFailures: state.totalFailures,
      lastFailureTime: state.lastFailureTime,
      lastSuccessTime: state.lastSuccessTime,
      msUntilReset,
    };
  }

  getAllStatus(): Record<ServiceName, ReturnType<CircuitBreaker["getStatus"]>> {
    const result: Partial<Record<ServiceName, ReturnType<CircuitBreaker["getStatus"]>>> = {};
    const services: ServiceName[] = ["ollama", "openai", "stable-diffusion", "comfyui", "replicate"];
    
    for (const service of services) {
      if (this.states.has(service)) {
        result[service] = this.getStatus(service);
      }
    }
    
    return result as Record<ServiceName, ReturnType<CircuitBreaker["getStatus"]>>;
  }

  reset(service: ServiceName): void {
    const state = this.getState(service);
    state.state = "closed";
    state.failureCount = 0;
    state.successCount = 0;
    state.halfOpenAttempts = 0;
    console.log(`[CircuitBreaker] ${service}: manually reset to closed`);
  }

  resetAll(): void {
    for (const service of Array.from(this.states.keys())) {
      this.reset(service);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateDelay(attempt: number, config: RetryConfig): number {
  const baseDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  const jitter = baseDelay * config.jitterFactor * (Math.random() * 2 - 1);
  return Math.min(baseDelay + jitter, config.maxDelayMs);
}

function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  
  const nonRetryable = [
    "api key",
    "authentication",
    "unauthorized",
    "forbidden",
    "not configured",
    "invalid request",
    "content policy",
    "safety system",
  ];
  
  return !nonRetryable.some((term) => message.includes(term));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  onRetry?: (attempt: number, error: Error, delayMs: number) => void
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      if (!isRetryableError(error) || attempt === finalConfig.maxRetries) {
        throw error;
      }

      const delayMs = calculateDelay(attempt, finalConfig);
      onRetry?.(attempt, error, delayMs);
      console.log(`[Retry] Attempt ${attempt}/${finalConfig.maxRetries} failed: ${error.message}. Retrying in ${delayMs}ms`);
      
      await sleep(delayMs);
    }
  }

  throw lastError || new Error("Retry exhausted with no error captured");
}

export async function withResilience<T>(
  service: ServiceName,
  fn: () => Promise<T>,
  options: {
    retryConfig?: Partial<RetryConfig>;
    onRetry?: (attempt: number, error: Error, delayMs: number) => void;
    onCircuitOpen?: () => void;
  } = {}
): Promise<T> {
  if (!circuitBreaker.canRequest(service)) {
    const status = circuitBreaker.getStatus(service);
    const resetIn = status.msUntilReset ? Math.ceil(status.msUntilReset / 1000) : "unknown";
    options.onCircuitOpen?.();
    throw new Error(`Service ${service} circuit is open. Will reset in ${resetIn}s.`);
  }

  try {
    const result = await withRetry(fn, options.retryConfig, options.onRetry);
    circuitBreaker.recordSuccess(service);
    return result;
  } catch (error: any) {
    circuitBreaker.recordFailure(service, error);
    throw error;
  }
}

export interface ServiceHealthResult {
  service: ServiceName;
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  circuitState: CircuitState;
  checkedAt: Date;
}

export type HealthCheckFn = () => Promise<{ healthy: boolean; latencyMs?: number; error?: string }>;

class ProactiveHealthMonitor {
  private healthChecks: Map<ServiceName, HealthCheckFn> = new Map();
  private lastResults: Map<ServiceName, ServiceHealthResult> = new Map();
  private intervalId: NodeJS.Timeout | null = null;
  private checkIntervalMs: number = 30000;

  registerHealthCheck(service: ServiceName, checkFn: HealthCheckFn): void {
    this.healthChecks.set(service, checkFn);
  }

  unregisterHealthCheck(service: ServiceName): void {
    this.healthChecks.delete(service);
  }

  async checkService(service: ServiceName): Promise<ServiceHealthResult> {
    const checkFn = this.healthChecks.get(service);
    if (!checkFn) {
      return {
        service,
        healthy: false,
        error: "No health check registered",
        circuitState: circuitBreaker.getStatus(service).state,
        checkedAt: new Date(),
      };
    }

    try {
      const result = await checkFn();
      const healthResult: ServiceHealthResult = {
        service,
        healthy: result.healthy,
        latencyMs: result.latencyMs,
        error: result.error,
        circuitState: circuitBreaker.getStatus(service).state,
        checkedAt: new Date(),
      };
      
      this.lastResults.set(service, healthResult);
      
      if (result.healthy) {
        if (circuitBreaker.getStatus(service).state === "open") {
          console.log(`[HealthMonitor] ${service} is healthy, resetting circuit breaker`);
          circuitBreaker.reset(service);
        }
      }
      
      return healthResult;
    } catch (error: any) {
      const healthResult: ServiceHealthResult = {
        service,
        healthy: false,
        error: error.message,
        circuitState: circuitBreaker.getStatus(service).state,
        checkedAt: new Date(),
      };
      
      this.lastResults.set(service, healthResult);
      return healthResult;
    }
  }

  async checkAllServices(): Promise<ServiceHealthResult[]> {
    const results: ServiceHealthResult[] = [];
    
    for (const service of Array.from(this.healthChecks.keys())) {
      const result = await this.checkService(service);
      results.push(result);
    }
    
    return results;
  }

  getLastResult(service: ServiceName): ServiceHealthResult | null {
    return this.lastResults.get(service) || null;
  }

  getAllLastResults(): ServiceHealthResult[] {
    return Array.from(this.lastResults.values());
  }

  startMonitoring(intervalMs: number = 30000): void {
    if (this.intervalId) {
      this.stopMonitoring();
    }

    this.checkIntervalMs = intervalMs;
    
    this.checkAllServices().catch(console.error);

    this.intervalId = setInterval(() => {
      this.checkAllServices().catch(console.error);
    }, this.checkIntervalMs);

    console.log(`[HealthMonitor] Started proactive monitoring every ${intervalMs / 1000}s`);
  }

  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[HealthMonitor] Stopped proactive monitoring");
    }
  }

  isMonitoring(): boolean {
    return this.intervalId !== null;
  }
}

export const circuitBreaker = new CircuitBreaker();
export const healthMonitor = new ProactiveHealthMonitor();

export function getResilienceStatus(): {
  circuitBreakers: Record<ServiceName, ReturnType<CircuitBreaker["getStatus"]>>;
  healthResults: ServiceHealthResult[];
  isMonitoring: boolean;
} {
  return {
    circuitBreakers: circuitBreaker.getAllStatus(),
    healthResults: healthMonitor.getAllLastResults(),
    isMonitoring: healthMonitor.isMonitoring(),
  };
}
