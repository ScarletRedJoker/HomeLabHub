import type { AIProviderName, ProviderHealthStatus } from './types';
import { ollamaProvider } from './providers/ollama';
import { openaiProvider } from './providers/openai';
import { stableDiffusionProvider } from './providers/stable-diffusion';
import { comfyClient } from './providers/comfyui';

const POLL_INTERVAL_MS = 30000;
const FAILURE_THRESHOLD = 3;
const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || '100.118.44.102';
const AGENT_PORT = process.env.WINDOWS_AGENT_PORT || '9765';
const AGENT_TOKEN = process.env.KVM_AGENT_TOKEN;

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
        comfyui: { available: false, lastCheck: new Date(0), consecutiveFailures: 0 },
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
      case 'comfyui':
        status = await this.checkComfyUIHealth();
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
    const providers: AIProviderName[] = ['ollama', 'openai', 'stable-diffusion', 'comfyui'];
    
    await Promise.all(providers.map(p => this.checkProvider(p)));
    
    // Auto-recovery: trigger Windows agent restart for failed local services
    await this.autoRecoverServices();
    
    this.state.lastFullCheck = new Date();
    return { ...this.state.providers };
  }

  private async checkComfyUIHealth(): Promise<ProviderHealthStatus> {
    const previousStatus = this.state.providers.comfyui;
    const start = Date.now();
    
    try {
      const isHealthy = await comfyClient.health();
      const latencyMs = Date.now() - start;
      
      if (isHealthy) {
        return {
          available: true,
          lastCheck: new Date(),
          consecutiveFailures: 0,
          latencyMs,
        };
      } else {
        const failures = (previousStatus?.consecutiveFailures || 0) + 1;
        return {
          available: failures < FAILURE_THRESHOLD,
          lastCheck: new Date(),
          consecutiveFailures: failures,
          latencyMs,
          error: 'ComfyUI health check returned unhealthy',
        };
      }
    } catch (error: any) {
      const failures = (previousStatus?.consecutiveFailures || 0) + 1;
      return {
        available: false,
        lastCheck: new Date(),
        consecutiveFailures: failures,
        latencyMs: Date.now() - start,
        error: error.message,
      };
    }
  }

  private async autoRecoverServices(): Promise<void> {
    if (!AGENT_TOKEN) {
      return; // Can't auto-recover without agent token
    }

    const localProviders: AIProviderName[] = ['ollama', 'stable-diffusion', 'comfyui'];
    
    for (const provider of localProviders) {
      const status = this.state.providers[provider];
      
      // Attempt recovery at threshold and every 3 failures after (3, 6, 9, etc.)
      // This ensures recovery attempts continue if initial repair fails
      if (status.consecutiveFailures >= FAILURE_THRESHOLD && status.consecutiveFailures % FAILURE_THRESHOLD === 0) {
        console.log(`[HealthChecker] Auto-recovery triggered for ${provider}`);
        
        try {
          const serviceMap: Record<string, string> = {
            'ollama': 'ollama',
            'stable-diffusion': 'stable-diffusion',
            'comfyui': 'comfyui',
          };
          
          const serviceName = serviceMap[provider];
          if (!serviceName) continue;

          const url = `http://${WINDOWS_VM_IP}:${AGENT_PORT}/api/watchdog/repair`;
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${AGENT_TOKEN}`,
            },
            body: JSON.stringify({ service: serviceName }),
            signal: AbortSignal.timeout(60000),
          });

          if (response.ok) {
            const result = await response.json();
            console.log(`[HealthChecker] Auto-recovery result for ${provider}:`, result);
            
            // If recovery succeeded, reset failure count
            if (result.success && result.online) {
              this.state.providers[provider].consecutiveFailures = 0;
              this.state.providers[provider].available = true;
            }
          } else {
            console.error(`[HealthChecker] Auto-recovery failed for ${provider}: HTTP ${response.status}`);
          }
        } catch (error: any) {
          console.error(`[HealthChecker] Auto-recovery error for ${provider}:`, error.message);
        }
      }
    }
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
