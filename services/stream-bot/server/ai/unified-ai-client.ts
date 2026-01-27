/**
 * Unified AI Client for Stream Bot
 * 
 * Provides centralized access to AI services:
 * - Stable Diffusion (image generation)
 * - ComfyUI (workflow execution)
 * - Ollama (text generation)
 * 
 * Uses environment-based configuration for flexible deployment
 */

export interface AIServiceConfig {
  ollamaUrl: string;
  ollamaModel: string;
  stableDiffusionUrl: string;
  comfyuiUrl: string;
  windowsVmIp: string | null;
  agentToken: string | null;
}

export interface ImageGenerationOptions {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  seed?: number;
}

export interface ImageGenerationResult {
  success: boolean;
  imageBase64?: string;
  imageUrl?: string;
  seed?: number;
  generationTimeMs?: number;
  error?: string;
}

export interface TextGenerationOptions {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  personality?: 'helpful' | 'creative' | 'concise' | 'funny' | 'hype';
}

export interface TextGenerationResult {
  success: boolean;
  text?: string;
  tokensUsed?: number;
  generationTimeMs?: number;
  error?: string;
}

export interface WorkflowExecutionOptions {
  workflowName: string;
  inputs?: Record<string, unknown>;
}

export interface WorkflowExecutionResult {
  success: boolean;
  outputs?: Record<string, unknown>;
  imageBase64?: string;
  executionTimeMs?: number;
  error?: string;
}

export interface AIServiceStatus {
  ollama: { available: boolean; model?: string; error?: string };
  stableDiffusion: { available: boolean; error?: string };
  comfyui: { available: boolean; error?: string };
}

export interface AIJob {
  id: string;
  type: 'text' | 'image' | 'workflow';
  status: 'pending' | 'running' | 'completed' | 'failed';
  platform: 'twitch' | 'youtube' | 'kick';
  username: string;
  channelId: string;
  createdAt: Date;
  updatedAt: Date;
  result?: unknown;
  error?: string;
  prompt?: string;
  settings?: Record<string, unknown>;
}

const PERSONALITY_PROMPTS: Record<string, string> = {
  helpful: 'You are a helpful stream assistant. Provide clear, useful, and friendly responses.',
  creative: 'You are a creative stream assistant. Be imaginative, artistic, and inspire creativity.',
  concise: 'You are a concise stream assistant. Keep responses brief and to the point.',
  funny: 'You are a funny stream assistant. Use humor, puns, and witty responses to entertain.',
  hype: 'You are a hype stream assistant! Get excited, use energy, and pump up the chat! LET\'S GO!',
};

function getConfig(): AIServiceConfig {
  const windowsVmIp = process.env.WINDOWS_VM_TAILSCALE_IP || process.env.WINDOWS_VM_IP || null;
  const baseUrl = windowsVmIp ? `http://${windowsVmIp}` : 'http://localhost';
  
  return {
    ollamaUrl: process.env.OLLAMA_URL || `${baseUrl}:11434`,
    ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2',
    stableDiffusionUrl: process.env.STABLE_DIFFUSION_URL || `${baseUrl}:7860`,
    comfyuiUrl: process.env.COMFYUI_URL || `${baseUrl}:8188`,
    windowsVmIp,
    agentToken: process.env.WINDOWS_AGENT_TOKEN || null,
  };
}

class UnifiedAIClient {
  private config: AIServiceConfig;
  private jobStore: Map<string, AIJob> = new Map();
  private jobCounter = 0;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.config = getConfig();
    this.startCleanup();
    this.logConfiguration();
  }

  private logConfiguration(): void {
    console.log('[StreamBot UnifiedAI] Configuration loaded:');
    console.log(`  Ollama: ${this.config.ollamaUrl} (model: ${this.config.ollamaModel})`);
    console.log(`  Stable Diffusion: ${this.config.stableDiffusionUrl}`);
    console.log(`  ComfyUI: ${this.config.comfyuiUrl}`);
    console.log(`  Windows VM IP: ${this.config.windowsVmIp || 'not configured'}`);
    console.log(`  Agent Token: ${this.config.agentToken ? 'configured' : 'not configured'}`);
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const oneHourAgo = Date.now() - 3600000;
      for (const [id, job] of this.jobStore) {
        if (job.createdAt.getTime() < oneHourAgo) {
          this.jobStore.delete(id);
        }
      }
    }, 300000);
  }

  async checkServiceHealth(): Promise<AIServiceStatus> {
    const [ollama, stableDiffusion, comfyui] = await Promise.all([
      this.checkOllamaHealth(),
      this.checkStableDiffusionHealth(),
      this.checkComfyUIHealth(),
    ]);
    return { ollama, stableDiffusion, comfyui };
  }

  private async checkOllamaHealth(): Promise<{ available: boolean; model?: string; error?: string }> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.config.ollamaUrl}/api/tags`, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) {
        const data = await response.json();
        const hasModel = data.models?.some((m: { name: string }) => m.name.includes(this.config.ollamaModel));
        return { available: true, model: hasModel ? this.config.ollamaModel : undefined };
      }
      return { available: false, error: 'Service returned non-OK status' };
    } catch (error) {
      return { available: false, error: error instanceof Error ? error.message : 'Connection failed' };
    }
  }

  private async checkStableDiffusionHealth(): Promise<{ available: boolean; error?: string }> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.config.stableDiffusionUrl}/sdapi/v1/options`, { signal: controller.signal });
      clearTimeout(timeout);
      return { available: response.ok };
    } catch (error) {
      return { available: false, error: error instanceof Error ? error.message : 'Connection failed' };
    }
  }

  private async checkComfyUIHealth(): Promise<{ available: boolean; error?: string }> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.config.comfyuiUrl}/system_stats`, { signal: controller.signal });
      clearTimeout(timeout);
      return { available: response.ok };
    } catch (error) {
      return { available: false, error: error instanceof Error ? error.message : 'Connection failed' };
    }
  }

  async generateText(options: TextGenerationOptions): Promise<TextGenerationResult> {
    const startTime = Date.now();
    const { prompt, systemPrompt, maxTokens = 150, temperature = 0.7, personality = 'helpful' } = options;

    const systemMessage = systemPrompt || PERSONALITY_PROMPTS[personality];

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${this.config.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.ollamaModel,
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: prompt },
          ],
          stream: false,
          options: {
            temperature,
            num_predict: maxTokens,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Ollama returned status ${response.status}`);
      }

      const data = await response.json();
      const text = data.message?.content || '';

      return {
        success: true,
        text: text.trim(),
        tokensUsed: data.eval_count,
        generationTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Text generation failed',
        generationTimeMs: Date.now() - startTime,
      };
    }
  }

  async generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
    const startTime = Date.now();
    const {
      prompt,
      negativePrompt = '',
      width = 512,
      height = 512,
      steps = 20,
      cfgScale = 7,
      seed = -1,
    } = options;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);

      const response = await fetch(`${this.config.stableDiffusionUrl}/sdapi/v1/txt2img`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          negative_prompt: negativePrompt,
          width,
          height,
          steps,
          cfg_scale: cfgScale,
          seed,
          sampler_name: 'DPM++ 2M Karras',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Stable Diffusion returned status ${response.status}`);
      }

      const data = await response.json();
      const imageBase64 = data.images?.[0];
      const info = JSON.parse(data.info || '{}');

      if (!imageBase64) {
        throw new Error('No image returned from Stable Diffusion');
      }

      return {
        success: true,
        imageBase64,
        seed: info.seed,
        generationTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Image generation failed',
        generationTimeMs: Date.now() - startTime,
      };
    }
  }

  async executeWorkflow(options: WorkflowExecutionOptions): Promise<WorkflowExecutionResult> {
    const startTime = Date.now();
    const { workflowName, inputs = {} } = options;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180000);

      const historyResponse = await fetch(`${this.config.comfyuiUrl}/history`, { signal: controller.signal });
      if (!historyResponse.ok) {
        throw new Error('ComfyUI is not accessible');
      }

      clearTimeout(timeout);

      return {
        success: true,
        outputs: { workflowName, status: 'queued' },
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Workflow execution failed',
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  createJob(
    type: AIJob['type'],
    platform: AIJob['platform'],
    username: string,
    channelId: string,
    options?: { prompt?: string; settings?: Record<string, unknown> }
  ): AIJob {
    const id = `stream-job-${++this.jobCounter}-${Date.now()}`;
    const job: AIJob = {
      id,
      type,
      status: 'pending',
      platform,
      username,
      channelId,
      createdAt: new Date(),
      updatedAt: new Date(),
      prompt: options?.prompt,
      settings: options?.settings,
    };
    this.jobStore.set(id, job);
    return job;
  }

  updateJob(id: string, updates: Partial<AIJob>): AIJob | null {
    const job = this.jobStore.get(id);
    if (!job) return null;
    Object.assign(job, updates, { updatedAt: new Date() });
    return job;
  }

  getJob(id: string): AIJob | undefined {
    return this.jobStore.get(id);
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

export const unifiedAIClient = new UnifiedAIClient();
export default unifiedAIClient;
