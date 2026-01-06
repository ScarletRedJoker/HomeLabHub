/**
 * AI Orchestrator - Unified interface for multiple AI providers
 * Supports OpenAI, Ollama (local), and future providers
 */
import OpenAI from "openai";

export type AIProvider = "openai" | "ollama" | "auto";
export type AICapability = "chat" | "image" | "video" | "embedding";

export interface AIConfig {
  provider: AIProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  config?: Partial<AIConfig>;
}

export interface ChatResponse {
  content: string;
  provider: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ImageRequest {
  prompt: string;
  negativePrompt?: string;
  size?: "1024x1024" | "1792x1024" | "1024x1792" | "512x512";
  style?: "vivid" | "natural";
  provider?: "openai" | "stable-diffusion";
}

export interface ImageResponse {
  url?: string;
  base64?: string;
  provider: string;
  revisedPrompt?: string;
}

const DEFAULT_CONFIG: AIConfig = {
  provider: "auto",
  temperature: 0.7,
  maxTokens: 2000,
};

class AIOrchestrator {
  private openaiClient: OpenAI | null = null;
  private ollamaUrl: string;

  constructor() {
    this.ollamaUrl = process.env.OLLAMA_URL || "http://host.evindrake.net:11434";
    this.initOpenAI();
  }

  private initOpenAI() {
    const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

    if (apiKey) {
      this.openaiClient = new OpenAI({
        baseURL: baseURL || undefined,
        apiKey,
      });
    }
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const config = { ...DEFAULT_CONFIG, ...request.config };
    const provider = config.provider === "auto" ? await this.selectBestProvider("chat") : config.provider;

    if (provider === "ollama") {
      return this.chatWithOllama(request.messages, config);
    }

    return this.chatWithOpenAI(request.messages, config);
  }

  private async chatWithOpenAI(messages: ChatMessage[], config: AIConfig): Promise<ChatResponse> {
    if (!this.openaiClient) {
      throw new Error("OpenAI not configured");
    }

    const model = config.model || "gpt-4o";
    const response = await this.openaiClient.chat.completions.create({
      model,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    });

    return {
      content: response.choices[0]?.message?.content || "",
      provider: "openai",
      model,
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      } : undefined,
    };
  }

  private async chatWithOllama(messages: ChatMessage[], config: AIConfig): Promise<ChatResponse> {
    const model = config.model || "llama3.2";

    const response = await fetch(`${this.ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature: config.temperature,
          num_predict: config.maxTokens,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      content: data.message?.content || "",
      provider: "ollama",
      model,
      usage: data.eval_count ? {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      } : undefined,
    };
  }

  async generateImage(request: ImageRequest): Promise<ImageResponse> {
    const provider = request.provider || "openai";

    if (provider === "stable-diffusion") {
      return this.generateWithSD(request);
    }

    return this.generateWithDALLE(request);
  }

  private async generateWithDALLE(request: ImageRequest): Promise<ImageResponse> {
    if (!this.openaiClient) {
      throw new Error("OpenAI not configured");
    }

    const response = await this.openaiClient.images.generate({
      model: "dall-e-3",
      prompt: request.prompt,
      size: request.size || "1024x1024",
      style: request.style || "vivid",
      quality: "hd",
      n: 1,
    });

    return {
      url: response.data[0]?.url,
      provider: "openai",
      revisedPrompt: response.data[0]?.revised_prompt,
    };
  }

  private async generateWithSD(request: ImageRequest): Promise<ImageResponse> {
    const sdUrl = process.env.STABLE_DIFFUSION_URL || "http://host.evindrake.net:7860";

    const response = await fetch(`${sdUrl}/sdapi/v1/txt2img`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: request.prompt,
        negative_prompt: request.negativePrompt || "blurry, low quality, distorted",
        width: 1024,
        height: 1024,
        steps: 30,
        cfg_scale: 7,
      }),
    });

    if (!response.ok) {
      throw new Error(`Stable Diffusion error: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      base64: data.images?.[0],
      provider: "stable-diffusion",
    };
  }

  async getAvailableModels(): Promise<{ provider: string; models: string[] }[]> {
    const results: { provider: string; models: string[] }[] = [];

    if (this.openaiClient) {
      try {
        const models = await this.openaiClient.models.list();
        const chatModels = models.data
          .filter(m => m.id.includes("gpt"))
          .map(m => m.id);
        results.push({ provider: "openai", models: chatModels });
      } catch {
        results.push({ provider: "openai", models: [] });
      }
    }

    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        const models = data.models?.map((m: any) => m.name) || [];
        results.push({ provider: "ollama", models });
      }
    } catch {
      results.push({ provider: "ollama", models: [] });
    }

    return results;
  }

  private async selectBestProvider(capability: AICapability): Promise<AIProvider> {
    if (capability === "chat") {
      try {
        const response = await fetch(`${this.ollamaUrl}/api/tags`, {
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) {
          const data = await response.json();
          if (data.models?.length > 0) {
            return "ollama";
          }
        }
      } catch {
      }
    }

    return "openai";
  }

  hasOpenAI(): boolean {
    return this.openaiClient !== null;
  }
}

export const aiOrchestrator = new AIOrchestrator();
