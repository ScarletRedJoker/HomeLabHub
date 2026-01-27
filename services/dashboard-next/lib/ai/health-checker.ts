import type { AIProviderName, ProviderHealthStatus } from './types';
import { ollamaProvider } from './providers/ollama';
import { openaiProvider } from './providers/openai';
import { stableDiffusionProvider } from './providers/stable-diffusion';
import { comfyClient } from './providers/comfyui';
import { getAIConfig } from './config';
import { aiLogger } from './logger';

const POLL_INTERVAL_MS = parseInt(process.env.AI_HEALTH_CHECK_INTERVAL || '30000');
const FAILURE_THRESHOLD = 3;

function getAgentConfig() {
  const windowsVMIP = process.env.WINDOWS_VM_TAILSCALE_IP;
  const agentPort = process.env.WINDOWS_AGENT_PORT || '9765';
  const agentToken = process.env.KVM_AGENT_TOKEN;
  
  return {
    enabled: !!windowsVMIP && !!agentToken,
    url: windowsVMIP ? `http://${windowsVMIP}:${agentPort}` : null,
    token: agentToken,
  };
}

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
  private agentConfig = getAgentConfig();
  private shutdownHandlerRegistered = false;

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
    
    this.registerShutdownHandler();
  }
  
  private registerShutdownHandler(): void {
    if (this.shutdownHandlerRegistered || typeof process === 'undefined') {
      return;
    }
    
    this.shutdownHandlerRegistered = true;
    
    const shutdown = () => {
      if (this.state.isRunning) {
        console.log('[HealthChecker] Graceful shutdown triggered');
        this.stop();
      }
    };
    
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
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

    if (status.consecutiveFailures >= FAILURE_THRESHOLD) {
      status.available = false;
      console.log(`[HealthChecker] ${name} marked unavailable after ${FAILURE_THRESHOLD} consecutive failures`);
    }

    const previousStatus = this.state.providers[name];
    if (status.consecutiveFailures === 0 && !previousStatus.available && status.available) {
      console.log(`[HealthChecker] ${name} auto-recovered`);
      aiLogger.logRecovery(name, 'unavailable');
    }

    this.state.providers[name] = status;

    return status;
  }

  async checkAllProviders(): Promise<Record<AIProviderName, ProviderHealthStatus>> {
    const providers: AIProviderName[] = ['ollama', 'openai', 'stable-diffusion', 'comfyui'];
    
    await Promise.all(providers.map(p => this.checkProvider(p)));
    
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
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const failures = (previousStatus?.consecutiveFailures || 0) + 1;
      return {
        available: false,
        lastCheck: new Date(),
        consecutiveFailures: failures,
        latencyMs: Date.now() - start,
        error: errorMessage,
      };
    }
  }

  private async autoRecoverServices(): Promise<void> {
    if (!this.agentConfig.enabled || !this.agentConfig.url || !this.agentConfig.token) {
      return;
    }

    const localProviders: AIProviderName[] = ['ollama', 'stable-diffusion', 'comfyui'];
    
    for (const provider of localProviders) {
      const status = this.state.providers[provider];
      
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

          const url = `${this.agentConfig.url}/api/watchdog/repair`;
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.agentConfig.token}`,
            },
            body: JSON.stringify({ service: serviceName }),
            signal: AbortSignal.timeout(60000),
          });

          if (response.ok) {
            const result = await response.json();
            console.log(`[HealthChecker] Auto-recovery result for ${provider}:`, result);
            
            if (result.success && result.online) {
              this.state.providers[provider].consecutiveFailures = 0;
              this.state.providers[provider].available = true;
              aiLogger.logRecovery(provider, 'auto-repair');
            }
          } else {
            console.error(`[HealthChecker] Auto-recovery failed for ${provider}: HTTP ${response.status}`);
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[HealthChecker] Auto-recovery error for ${provider}:`, errorMessage);
        }
      }
    }
  }

  start(): void {
    if (this.state.isRunning) {
      console.log('[HealthChecker] Already running, skipping start');
      return;
    }

    const config = getAIConfig();
    console.log(`[HealthChecker] Starting health monitoring (interval: ${POLL_INTERVAL_MS}ms)`);
    console.log(`[HealthChecker] Monitoring endpoints:`);
    console.log(`  - Ollama: ${config.ollama.url}`);
    console.log(`  - Stable Diffusion: ${config.stableDiffusion.url}`);
    console.log(`  - ComfyUI: ${config.comfyui.url}`);
    console.log(`  - OpenAI: ${config.openai.apiKey ? 'configured' : 'not configured'}`);
    
    if (this.agentConfig.enabled) {
      console.log(`  - Windows Agent: ${this.agentConfig.url} (auto-recovery enabled)`);
    }
    
    this.state.isRunning = true;

    this.checkAllProviders()
      .then(results => {
        const available = Object.entries(results)
          .filter(([_, status]) => status.available)
          .map(([name]) => name);
        console.log(`[HealthChecker] Initial check complete, available: ${available.length > 0 ? available.join(', ') : 'none'}`);
      })
      .catch(err => {
        console.error('[HealthChecker] Initial check failed:', err);
      });

    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(async () => {
      if (!this.state.isRunning) return;
      try {
        await this.checkAllProviders();
      } catch (error) {
        console.error('[HealthChecker] Periodic check failed:', error);
      }
    }, POLL_INTERVAL_MS);
  }

  stop(): void {
    if (!this.state.isRunning && !this.intervalId) {
      console.log('[HealthChecker] Already stopped');
      return;
    }
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.state.isRunning = false;
    console.log('[HealthChecker] Stopped health monitoring');
  }

  restart(): void {
    console.log('[HealthChecker] Restarting...');
    this.stop();
    this.agentConfig = getAgentConfig();
    this.start();
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
