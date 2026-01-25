import type {
  AIProvider,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ProviderHealthStatus,
} from '../types';

const DEFAULT_SD_URL = 'http://100.118.44.102:7860';
const TIMEOUT_MS = 120000;

export interface SDModel {
  title: string;
  model_name: string;
  hash?: string;
  sha256?: string;
  filename?: string;
}

export class StableDiffusionProvider {
  private baseURL: string;
  private healthStatus: ProviderHealthStatus;

  constructor(baseURL?: string) {
    this.baseURL = baseURL || process.env.STABLE_DIFFUSION_URL || DEFAULT_SD_URL;
    this.healthStatus = {
      available: false,
      lastCheck: new Date(0),
      consecutiveFailures: 0,
    };
  }

  getProviderInfo(): AIProvider {
    return {
      name: 'stable-diffusion',
      baseURL: this.baseURL,
      available: this.healthStatus.available,
      priority: 1,
      supports: {
        chat: false,
        streaming: false,
        images: true,
        embeddings: false,
      },
    };
  }

  async healthCheck(): Promise<ProviderHealthStatus> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.baseURL}/sdapi/v1/sd-models`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const latencyMs = Date.now() - start;

      if (response.ok) {
        this.healthStatus = {
          available: true,
          lastCheck: new Date(),
          consecutiveFailures: 0,
          latencyMs,
        };
      } else {
        this.healthStatus.consecutiveFailures++;
        this.healthStatus.available = this.healthStatus.consecutiveFailures < 3;
        this.healthStatus.lastCheck = new Date();
        this.healthStatus.error = `HTTP ${response.status}`;
      }
    } catch (error: any) {
      this.healthStatus.consecutiveFailures++;
      this.healthStatus.available = false;
      this.healthStatus.lastCheck = new Date();
      this.healthStatus.error = error.message;
      this.healthStatus.latencyMs = Date.now() - start;
    }

    return this.healthStatus;
  }

  getHealthStatus(): ProviderHealthStatus {
    return { ...this.healthStatus };
  }

  isAvailable(): boolean {
    return this.healthStatus.available;
  }

  async listModels(): Promise<SDModel[]> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${this.baseURL}/sdapi/v1/sd-models`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return [];
      }

      return await response.json();
    } catch {
      return [];
    }
  }

  async getCurrentModel(): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseURL}/sdapi/v1/options`);
      if (!response.ok) return null;
      const data = await response.json();
      return data.sd_model_checkpoint || null;
    } catch {
      return null;
    }
  }

  async setModel(modelName: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/sdapi/v1/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sd_model_checkpoint: modelName }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const start = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const payload = {
        prompt: request.prompt,
        negative_prompt: request.negativePrompt || '',
        width: request.width || 512,
        height: request.height || 512,
        steps: request.steps || 20,
        cfg_scale: request.cfgScale || 7,
        sampler_name: request.sampler || 'Euler a',
      };

      const response = await fetch(`${this.baseURL}/sdapi/v1/txt2img`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`SD generation error: HTTP ${response.status}`);
      }

      const data = await response.json();

      return {
        images: data.images || [],
        provider: 'stable-diffusion',
        latency: Date.now() - start,
        seed: data.info ? JSON.parse(data.info).seed : undefined,
      };
    } catch (error: any) {
      clearTimeout(timeout);
      throw new Error(`SD generation failed: ${error.message}`);
    }
  }

  async img2img(
    image: string,
    prompt: string,
    options: {
      negativePrompt?: string;
      denoisingStrength?: number;
      steps?: number;
      cfgScale?: number;
    } = {}
  ): Promise<ImageGenerationResponse> {
    const start = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const payload = {
        init_images: [image],
        prompt,
        negative_prompt: options.negativePrompt || '',
        denoising_strength: options.denoisingStrength || 0.75,
        steps: options.steps || 20,
        cfg_scale: options.cfgScale || 7,
      };

      const response = await fetch(`${this.baseURL}/sdapi/v1/img2img`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`SD img2img error: HTTP ${response.status}`);
      }

      const data = await response.json();

      return {
        images: data.images || [],
        provider: 'stable-diffusion',
        latency: Date.now() - start,
        seed: data.info ? JSON.parse(data.info).seed : undefined,
      };
    } catch (error: any) {
      clearTimeout(timeout);
      throw new Error(`SD img2img failed: ${error.message}`);
    }
  }

  async getProgress(): Promise<{
    progress: number;
    eta: number;
    state: { sampling_step: number; sampling_steps: number };
  } | null> {
    try {
      const response = await fetch(`${this.baseURL}/sdapi/v1/progress`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async interrupt(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/sdapi/v1/interrupt`, {
        method: 'POST',
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const stableDiffusionProvider = new StableDiffusionProvider();
