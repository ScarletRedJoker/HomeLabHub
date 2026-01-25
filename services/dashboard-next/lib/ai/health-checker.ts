import type { AIProviderName, ProviderHealthStatus } from './types';
import { ollamaProvider } from './providers/ollama';
import { openaiProvider } from './providers/openai';
import { stableDiffusionProvider } from './providers/stable-diffusion';

const POLL_INTERVAL_MS = 30000;
const FAILURE_THRESHOLD = 3;

export interface HealthCheckResult {
  provider: AIProviderName;
  status: ProviderHealthStatus;
  timestamp: Date;
}

export interface HealthMonitorState {
  providers: Record<AIProviderName, ProviderHealthStatus>;
  lastFullCheck: Date;
  isRunning: boolean;
}

class AIHealthChecker {
  private intervalId: NodeJS.Timeout | null = null;
  private state: HealthMonitorState;

  constructor() {
    this.state = {
      providers: {
        ollama: { available: false, lastCheck: new Date(0), consecutiveFailures: 0 },
        openai: { available: false, lastCheck: new Date(0), consecutiveFailures: 0 },
        'stable-diffusion': { available: false, lastCheck: new Date(0), consecutiveFailures: 0 },
      },
      lastFullCheck: new Date(0),
      isRunning: false,
    };
  }

  async checkProvider(name: AIProviderName): Promise<ProviderHealthStatus> {
    let status: ProviderHealthStatus;

    switch (name) {
      case 'ollama':
        status = await ollamaProvider.healthCheck();
        break;
      case 'openai':
        status = await openaiProvider.healthCheck();
        break;
      case 'stable-diffusion':
        status = await stableDiffusionProvider.healthCheck();
        break;
      default:
        status = { available: false, lastCheck: new Date(), consecutiveFailures: 0, error: 'Unknown provider' };
    }

    // Check consecutive failures BEFORE assigning to state
    // Mark unavailable when failures >= threshold, regardless of current availability
    if (status.consecutiveFailures >= FAILURE_THRESHOLD) {
      status.available = false;
      console.log(`[HealthChecker] ${name} marked unavailable after ${FAILURE_THRESHOLD} consecutive failures`);
    }

    // Check for auto-recovery BEFORE updating state (compare with previous status)
    const previousStatus = this.state.providers[name];
    if (status.consecutiveFailures === 0 && !previousStatus.available && status.available) {
      console.log(`[HealthChecker] ${name} auto-recovered`);
    }

    // Now assign to state
    this.state.providers[name] = status;

    return status;
  }

  async checkAllProviders(): Promise<Record<AIProviderName, ProviderHealthStatus>> {
    const providers: AIProviderName[] = ['ollama', 'openai', 'stable-diffusion'];
    
    await Promise.all(providers.map(p => this.checkProvider(p)));
    
    this.state.lastFullCheck = new Date();
    return { ...this.state.providers };
  }

  start(): void {
    if (this.state.isRunning) {
      console.log('[HealthChecker] Already running');
      return;
    }

    console.log(`[HealthChecker] Starting health monitoring (interval: ${POLL_INTERVAL_MS}ms)`);
    this.state.isRunning = true;

    this.checkAllProviders().catch(err => {
      console.error('[HealthChecker] Initial check failed:', err);
    });

    this.intervalId = setInterval(async () => {
      try {
        await this.checkAllProviders();
      } catch (error) {
        console.error('[HealthChecker] Periodic check failed:', error);
      }
    }, POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.state.isRunning = false;
    console.log('[HealthChecker] Stopped health monitoring');
  }

  getState(): HealthMonitorState {
    return {
      providers: { ...this.state.providers },
      lastFullCheck: this.state.lastFullCheck,
      isRunning: this.state.isRunning,
    };
  }

  getProviderStatus(name: AIProviderName): ProviderHealthStatus {
    return { ...this.state.providers[name] };
  }

  isProviderAvailable(name: AIProviderName): boolean {
    return this.state.providers[name]?.available ?? false;
  }

  getAvailableProviders(): AIProviderName[] {
    return (Object.entries(this.state.providers) as [AIProviderName, ProviderHealthStatus][])
      .filter(([_, status]) => status.available)
      .map(([name]) => name);
  }

  async forceCheck(name: AIProviderName): Promise<ProviderHealthStatus> {
    console.log(`[HealthChecker] Force checking ${name}`);
    return this.checkProvider(name);
  }

  resetProvider(name: AIProviderName): void {
    this.state.providers[name] = {
      available: false,
      lastCheck: new Date(),
      consecutiveFailures: 0,
    };
    console.log(`[HealthChecker] Reset ${name} status`);
  }
}

export const healthChecker = new AIHealthChecker();
