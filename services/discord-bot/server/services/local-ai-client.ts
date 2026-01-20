/**
 * Local AI Client for Discord Bot
 * 
 * Provides AI capabilities using local Ollama instance only.
 * Enforces LOCAL_AI_ONLY policy - never falls back to cloud providers.
 * Supports Tailscale connectivity for remote Windows VM access.
 */

export interface LocalAIConfig {
  ollamaUrl: string;
  model: string;
  timeout: number;
  enabled: boolean;
  tailscaleIp?: string;
  windowsVmIp?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface ConnectivityStatus {
  ollamaReachable: boolean;
  tailscaleConnected: boolean;
  windowsVmReachable: boolean;
  lastCheck: Date;
  errorMessage?: string;
}

class LocalAIClient {
  private config: LocalAIConfig;
  private isAvailable: boolean = false;
  private lastHealthCheck: number = 0;
  private healthCheckInterval: number = 30000;
  private connectivityStatus: ConnectivityStatus = {
    ollamaReachable: false,
    tailscaleConnected: false,
    windowsVmReachable: false,
    lastCheck: new Date(),
  };

  constructor() {
    this.config = {
      ollamaUrl: process.env.OLLAMA_URL || process.env.LOCAL_AI_URL || 'http://localhost:11434',
      model: process.env.OLLAMA_MODEL || process.env.LOCAL_AI_MODEL || 'llama3.2',
      timeout: parseInt(process.env.LOCAL_AI_TIMEOUT || '30000', 10),
      enabled: this.isLocalAIOnlyMode(),
      tailscaleIp: process.env.TAILSCALE_IP,
      windowsVmIp: process.env.WINDOWS_VM_IP,
    };
  }

  private isLocalAIOnlyMode(): boolean {
    const localAIOnly = process.env.LOCAL_AI_ONLY;
    return localAIOnly === 'true' || localAIOnly === '1';
  }

  async checkTailscaleConnectivity(): Promise<boolean> {
    const targetIp = this.config.tailscaleIp || this.config.windowsVmIp;
    
    if (!targetIp) {
      console.log('[LocalAI] No Tailscale/Windows VM IP configured, skipping connectivity check');
      return true;
    }

    try {
      console.log(`[LocalAI] Checking Tailscale connectivity to ${targetIp}...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`http://${targetIp}:11434/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      
      if (response.ok) {
        console.log(`[LocalAI] ✓ Tailscale connection to Windows VM (${targetIp}) successful`);
        this.connectivityStatus.tailscaleConnected = true;
        this.connectivityStatus.windowsVmReachable = true;
        return true;
      }
      
      console.warn(`[LocalAI] ⚠ Windows VM responded but Ollama not ready: ${response.status}`);
      this.connectivityStatus.tailscaleConnected = true;
      this.connectivityStatus.windowsVmReachable = false;
      return false;
    } catch (error: any) {
      this.connectivityStatus.tailscaleConnected = false;
      this.connectivityStatus.windowsVmReachable = false;
      
      if (error.name === 'AbortError') {
        console.warn(`[LocalAI] ✗ Tailscale connection to ${targetIp} timed out`);
        this.connectivityStatus.errorMessage = 'Connection timed out - ensure Tailscale is running';
      } else if (error.code === 'ECONNREFUSED') {
        console.warn(`[LocalAI] ✗ Connection refused to ${targetIp} - VM may be offline`);
        this.connectivityStatus.errorMessage = 'Connection refused - Windows VM may be offline';
      } else if (error.code === 'ENOTFOUND' || error.code === 'ENETUNREACH') {
        console.warn(`[LocalAI] ✗ Cannot reach ${targetIp} - check Tailscale connection`);
        this.connectivityStatus.errorMessage = 'Network unreachable - Tailscale may not be connected';
      } else {
        console.warn(`[LocalAI] ✗ Tailscale connectivity check failed:`, error.message);
        this.connectivityStatus.errorMessage = error.message;
      }
      return false;
    }
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      console.log('[LocalAI] LOCAL_AI_ONLY mode disabled - AI features will be unavailable');
      return;
    }

    console.log('[LocalAI] Initializing local AI client...');
    console.log(`[LocalAI]   Ollama URL: ${this.config.ollamaUrl}`);
    console.log(`[LocalAI]   Model: ${this.config.model}`);
    
    if (this.config.tailscaleIp || this.config.windowsVmIp) {
      console.log(`[LocalAI]   Tailscale/VM IP: ${this.config.tailscaleIp || this.config.windowsVmIp}`);
      await this.checkTailscaleConnectivity();
    }

    const available = await this.checkHealth();
    if (available) {
      console.log('[LocalAI] ✓ Connected to local Ollama instance');
      await this.ensureModelLoaded();
    } else {
      console.warn('[LocalAI] ✗ Local Ollama instance is not available');
      console.warn('[LocalAI]   Make sure Ollama is running at:', this.config.ollamaUrl);
      
      if (this.config.tailscaleIp || this.config.windowsVmIp) {
        console.warn('[LocalAI]   For remote access, ensure Tailscale is connected and Windows VM is running');
      }
    }
  }

  async checkHealth(): Promise<boolean> {
    const now = Date.now();
    if (now - this.lastHealthCheck < this.healthCheckInterval && this.lastHealthCheck > 0) {
      return this.isAvailable;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.config.ollamaUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      this.isAvailable = response.ok;
      this.lastHealthCheck = now;
      return this.isAvailable;
    } catch (error) {
      this.isAvailable = false;
      this.lastHealthCheck = now;
      return false;
    }
  }

  private async ensureModelLoaded(): Promise<void> {
    try {
      const response = await fetch(`${this.config.ollamaUrl}/api/tags`);
      if (!response.ok) return;

      const data = await response.json();
      const models = data.models || [];
      const modelLoaded = models.some((m: any) => 
        m.name === this.config.model || m.name.startsWith(`${this.config.model}:`)
      );

      if (modelLoaded) {
        console.log(`[LocalAI] ✓ Model '${this.config.model}' is available`);
      } else {
        console.warn(`[LocalAI] ⚠ Model '${this.config.model}' not found locally`);
        console.warn(`[LocalAI]   Available models: ${models.map((m: any) => m.name).join(', ') || 'none'}`);
        console.warn(`[LocalAI]   Run: ollama pull ${this.config.model}`);
      }
    } catch (error) {
      console.error('[LocalAI] Error checking model availability:', error);
    }
  }

  async chat(options: ChatCompletionOptions): Promise<string> {
    if (!this.config.enabled) {
      throw new Error(
        'AI features are disabled. LOCAL_AI_ONLY mode is required but not enabled. ' +
        'Set LOCAL_AI_ONLY=true and ensure Ollama is running.'
      );
    }

    const available = await this.checkHealth();
    if (!available) {
      throw new Error(
        `Local AI service unavailable. Ollama is not running at ${this.config.ollamaUrl}. ` +
        'Please start Ollama with: ollama serve'
      );
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(`${this.config.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          messages: options.messages,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.maxTokens ?? 500,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data.message?.content || '';
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`Local AI request timed out after ${this.config.timeout}ms`);
      }
      throw error;
    }
  }

  async generate(prompt: string, options?: { temperature?: number; maxTokens?: number }): Promise<string> {
    return this.chat({
      messages: [{ role: 'user', content: prompt }],
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    });
  }

  getStatus(): { 
    enabled: boolean; 
    available: boolean; 
    config: Partial<LocalAIConfig>;
    connectivity: ConnectivityStatus;
  } {
    return {
      enabled: this.config.enabled,
      available: this.isAvailable,
      config: {
        ollamaUrl: this.config.ollamaUrl,
        model: this.config.model,
      },
      connectivity: { ...this.connectivityStatus },
    };
  }

  getConnectivityStatus(): ConnectivityStatus {
    return { ...this.connectivityStatus };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getUserFriendlyError(): string {
    if (!this.config.enabled) {
      return '🤖 AI features are currently disabled. The bot is running in LOCAL_AI_ONLY mode but the service is not configured.';
    }
    
    if (!this.isAvailable) {
      if (this.connectivityStatus.errorMessage?.includes('Tailscale')) {
        return '🔌 Cannot connect to AI service. The Windows VM may be offline or Tailscale is not connected. Please try again later.';
      }
      if (this.connectivityStatus.errorMessage?.includes('refused')) {
        return '💻 AI service is temporarily unavailable. The host machine may be starting up. Please try again in a few minutes.';
      }
      return '⚡ AI service is currently offline. Please try again later or contact an admin.';
    }
    
    return '';
  }
}

export const localAIClient = new LocalAIClient();

export async function initializeLocalAI(): Promise<void> {
  await localAIClient.initialize();
}

export async function checkLocalAIConnectivity(): Promise<ConnectivityStatus> {
  await localAIClient.checkTailscaleConnectivity();
  await localAIClient.checkHealth();
  return localAIClient.getConnectivityStatus();
}
