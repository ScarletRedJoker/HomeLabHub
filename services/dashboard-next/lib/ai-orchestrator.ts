/**
 * AI Orchestrator - Unified interface for multiple AI providers
 * Supports OpenAI, Ollama (local), Replicate (video), and future providers
 * Uses service discovery for automatic endpoint resolution with fallbacks
 */
import OpenAI from "openai";
import Replicate from "replicate";
import { readFileSync, existsSync } from "fs";
import { peerDiscovery, type PeerService } from "./peer-discovery";
import { withResilience } from "./ai-resilience";
import { recordChatUsage } from "./ai-metrics";

interface LocalAIState {
  windows_vm?: {
    ollama?: { status: string; url?: string };
    comfyui?: { status: string; url?: string };
    stable_diffusion?: { status: string; url?: string };
  };
  ubuntu?: {
    ollama?: { status: string; url?: string };
    stable_diffusion?: { status: string; url?: string };
  };
  timestamp?: string;
}

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
  fallbackUsed: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface StreamingChatChunk {
  content: string;
  provider: string;
  model: string;
  done: boolean;
  fallbackUsed?: boolean;
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

export interface SDStatus {
  available: boolean;
  url: string;
  modelLoaded: boolean;
  currentModel: string | null;
  modelLoading: boolean;
  availableModels: string[];
  error: string | null;
  vram?: { total: number; used: number; free: number };
}

export interface SDModel {
  title: string;
  model_name: string;
  hash?: string;
  sha256?: string;
  filename?: string;
}

export interface VideoRequest {
  prompt: string;
  inputImage?: string;
  duration?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  provider?: "replicate" | "local" | "comfyui";
  model?: "wan-t2v" | "wan-i2v" | "svd" | "animatediff" | "svd-local";
}

export interface VideoResponse {
  url: string;
  provider: string;
  model: string;
  duration?: number;
}

// Image-to-Image request interface
export interface Img2ImgRequest {
  image: string; // base64 or URL
  prompt: string;
  negativePrompt?: string;
  denoisingStrength?: number; // 0.0 to 1.0, default 0.75
  size?: "512x512" | "768x768" | "1024x1024";
  steps?: number;
  cfgScale?: number;
  sampler?: string;
}

// Inpainting request interface
export interface InpaintRequest {
  image: string; // base64 or URL - the source image
  mask: string; // base64 or URL - white areas will be inpainted
  prompt: string;
  negativePrompt?: string;
  denoisingStrength?: number; // default 0.75
  maskBlur?: number; // default 4
  inpaintingFill?: number; // 0=fill, 1=original, 2=latent noise, 3=latent nothing
  inpaintFullRes?: boolean; // whether to inpaint at full resolution
  inpaintFullResPadding?: number;
  steps?: number;
  cfgScale?: number;
}

// ControlNet control types
export type ControlNetType = 
  | "canny" 
  | "depth" 
  | "openpose" 
  | "softedge" 
  | "scribble" 
  | "lineart" 
  | "tile" 
  | "ip2p" 
  | "shuffle" 
  | "reference";

// Single ControlNet unit configuration
export interface ControlNetUnit {
  image: string; // base64 or URL
  controlType: ControlNetType;
  weight?: number; // 0.0 to 2.0, default 1.0
  guidanceStart?: number; // 0.0 to 1.0, default 0.0
  guidanceEnd?: number; // 0.0 to 1.0, default 1.0
  preprocessor?: string; // specific preprocessor override
  model?: string; // specific model override
  controlMode?: number; // 0=balanced, 1=prompt more important, 2=controlnet more important
  resizeMode?: number; // 0=just resize, 1=crop and resize, 2=resize and fill
}

// ControlNet generation request
export interface ControlNetRequest {
  prompt: string;
  negativePrompt?: string;
  controlNets: ControlNetUnit[];
  size?: "512x512" | "768x768" | "1024x1024";
  steps?: number;
  cfgScale?: number;
  sampler?: string;
  denoisingStrength?: number; // for img2img with controlnet
  inputImage?: string; // optional base image for img2img mode
}

// Upscale request interface
export interface UpscaleRequest {
  image: string; // base64 or URL
  scaleFactor?: 2 | 4; // default 2
  upscaler?: string; // e.g., "R-ESRGAN 4x+", "ESRGAN_4x", "ScuNET", "SwinIR"
  upscaler2?: string; // secondary upscaler for blending
  upscaler2Visibility?: number; // 0.0 to 1.0, blend ratio
  gfpganVisibility?: number; // 0.0 to 1.0, face enhancement
  codeformerVisibility?: number; // 0.0 to 1.0, face enhancement
  codeformerWeight?: number; // 0.0 to 1.0
}

// Face swap request interface
export interface FaceSwapRequest {
  sourceImage: string; // base64 or URL - the face to use
  targetImage: string; // base64 or URL - the image to swap face into
  faceIndex?: number; // which face to swap in target (default 0)
  sourceFaceIndex?: number; // which face to use from source (default 0)
  restoreFace?: boolean; // apply face restoration after swap
  upscale?: boolean; // upscale result
  upscaleFactor?: 2 | 4;
}

// Upscaler info returned from SD
export interface SDUpscaler {
  name: string;
  model_name: string | null;
  model_path: string | null;
  model_url: string | null;
  scale: number;
}

// ControlNet model info
export interface ControlNetModel {
  model_name: string;
  module_name: string;
}

const DEFAULT_CONFIG: AIConfig = {
  provider: "auto",
  temperature: 0.7,
  maxTokens: 2000,
};

const isReplitEnv = (): boolean => {
  return !!process.env.REPL_ID || !!process.env.REPLIT_DEV_DOMAIN;
};

class AIOrchestrator {
  private openaiClient: OpenAI | null = null;
  private replicateClient: Replicate | null = null;
  private ollamaUrl: string;
  private comfyuiUrl: string;
  private stableDiffusionUrl: string;
  private localAIState: LocalAIState | null = null;
  private stateLastRead: number = 0;
  private discoveredServices: PeerService[] = [];
  private lastDiscoveryTime: number = 0;
  private static readonly STATE_CACHE_TTL = 30000;
  private static readonly DISCOVERY_CACHE_TTL = 60000;
  private static readonly STATE_FILE_PATH = process.env.LOCAL_AI_STATE_FILE || "/opt/homelab/HomeLabHub/deploy/shared/state/local-ai.json";

  constructor() {
    const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
    this.ollamaUrl = process.env.OLLAMA_URL || `http://${WINDOWS_VM_IP}:11434`;
    this.comfyuiUrl = process.env.COMFYUI_URL || `http://${WINDOWS_VM_IP}:8188`;
    this.stableDiffusionUrl = process.env.STABLE_DIFFUSION_URL || `http://${WINDOWS_VM_IP}:7860`;
    this.initOpenAI();
    this.initReplicate();
    this.loadLocalAIState();
    this.initServiceDiscovery();
  }

  private async initServiceDiscovery(): Promise<void> {
    try {
      await this.discoverAIServices();
    } catch (error) {
      console.warn("[AI Orchestrator] Service discovery initialization skipped:", error);
    }
  }

  async discoverAIServices(): Promise<PeerService[]> {
    if (Date.now() - this.lastDiscoveryTime < AIOrchestrator.DISCOVERY_CACHE_TTL) {
      return this.discoveredServices;
    }

    try {
      const services = await peerDiscovery.discoverAIServices();
      
      if (services.length > 0) {
        this.discoveredServices = services;
        this.lastDiscoveryTime = Date.now();
        
        for (const svc of services) {
          if (svc.capabilities.includes("ollama") && svc.healthy) {
            const endpoint = svc.endpoint.replace(/^https?:\/\//, "");
            const [host, portStr] = endpoint.split(":");
            const port = portStr ? parseInt(portStr, 10) : 11434;
            this.ollamaUrl = `http://${host}:${port}`;
            console.log(`[AI Orchestrator] Discovered Ollama at ${this.ollamaUrl}`);
          }
          
          if (svc.capabilities.includes("stable-diffusion") && svc.healthy) {
            const endpoint = svc.endpoint.replace(/^https?:\/\//, "");
            const [host, portStr] = endpoint.split(":");
            const port = portStr ? parseInt(portStr, 10) : 7860;
            this.stableDiffusionUrl = `http://${host}:${port}`;
            console.log(`[AI Orchestrator] Discovered Stable Diffusion at ${this.stableDiffusionUrl}`);
          }
          
          if (svc.capabilities.includes("comfyui") && svc.healthy) {
            const endpoint = svc.endpoint.replace(/^https?:\/\//, "");
            const [host, portStr] = endpoint.split(":");
            const port = portStr ? parseInt(portStr, 10) : 8188;
            this.comfyuiUrl = `http://${host}:${port}`;
            console.log(`[AI Orchestrator] Discovered ComfyUI at ${this.comfyuiUrl}`);
          }
        }
      }
      
      return this.discoveredServices;
    } catch (error) {
      console.warn("[AI Orchestrator] Service discovery failed, using configured endpoints:", error);
      return this.discoveredServices;
    }
  }

  async refreshEndpoints(): Promise<void> {
    this.lastDiscoveryTime = 0;
    await this.discoverAIServices();
  }

  getDiscoveredServices(): PeerService[] {
    return this.discoveredServices;
  }

  private loadLocalAIState(): void {
    try {
      if (existsSync(AIOrchestrator.STATE_FILE_PATH)) {
        const content = readFileSync(AIOrchestrator.STATE_FILE_PATH, "utf-8");
        this.localAIState = JSON.parse(content);
        this.stateLastRead = Date.now();
        console.log("[AI Orchestrator] Loaded local AI state:", this.localAIState);
        
        if (this.localAIState?.windows_vm?.comfyui?.url) {
          this.comfyuiUrl = this.localAIState.windows_vm.comfyui.url;
        }
        if (this.localAIState?.windows_vm?.ollama?.url) {
          this.ollamaUrl = this.localAIState.windows_vm.ollama.url;
        }
        if (this.localAIState?.windows_vm?.stable_diffusion?.url) {
          this.stableDiffusionUrl = this.localAIState.windows_vm.stable_diffusion.url;
        }
      }
    } catch (error) {
      console.warn("[AI Orchestrator] Failed to load local AI state:", error);
    }
  }

  private refreshStateIfNeeded(): void {
    if (Date.now() - this.stateLastRead > AIOrchestrator.STATE_CACHE_TTL) {
      this.loadLocalAIState();
    }
  }

  isComfyUIOnlineFromState(): boolean {
    this.refreshStateIfNeeded();
    return this.localAIState?.windows_vm?.comfyui?.status === "online";
  }

  isOllamaOnlineFromState(): boolean {
    this.refreshStateIfNeeded();
    return (
      this.localAIState?.windows_vm?.ollama?.status === "online" ||
      this.localAIState?.ubuntu?.ollama?.status === "online"
    );
  }

  private initOpenAI() {
    const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    const directKey = process.env.OPENAI_API_KEY;
    const projectId = process.env.OPENAI_PROJECT_ID;
    
    // Check if using Replit's modelfarm integration
    const isReplitIntegration = baseURL && baseURL.includes('modelfarm');
    const apiKey = integrationKey || directKey;

    if (isReplitIntegration && apiKey) {
      console.log(`[AI Orchestrator] OpenAI initialized via Replit modelfarm`);
      this.openaiClient = new OpenAI({
        baseURL,
        apiKey: apiKey.trim(),
      });
    } else if (apiKey && apiKey.startsWith('sk-')) {
      const trimmedKey = apiKey.trim();
      
      console.log(`[AI Orchestrator] OpenAI initialized with key: ${trimmedKey.substring(0, 10)}...${trimmedKey.substring(trimmedKey.length - 4)}${projectId ? ' (with project ID)' : ''}`);
      
      this.openaiClient = new OpenAI({
        baseURL: baseURL || undefined,
        apiKey: trimmedKey,
        ...(projectId && { project: projectId.trim() }),
      });
    } else {
      console.log("[AI Orchestrator] No valid OpenAI API key configured");
    }
  }

  private initReplicate() {
    const apiKey = process.env.REPLICATE_API_TOKEN;
    if (apiKey) {
      this.replicateClient = new Replicate({ auth: apiKey });
    }
  }

  canUseFallback(): boolean {
    return this.openaiClient !== null;
  }

  private isLocalAIOnlyStrict(): boolean {
    return process.env.LOCAL_AI_ONLY === "true";
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const config = { ...DEFAULT_CONFIG, ...request.config };
    const provider = config.provider === "auto" ? await this.selectBestProvider("chat") : config.provider;

    if (provider === "ollama" || config.provider === "auto") {
      try {
        const response = await this.chatWithOllama(request.messages, config);
        return { ...response, fallbackUsed: false };
      } catch (ollamaError: any) {
        console.log(`[AI Orchestrator] Ollama failed: ${ollamaError.message}`);
        
        if (this.canUseFallback() && !this.isLocalAIOnlyStrict()) {
          console.log(`[AI Orchestrator] Falling back to OpenAI`);
          const response = await this.chatWithOpenAI(request.messages, config);
          return { ...response, fallbackUsed: true };
        }
        
        if (this.isLocalAIOnlyStrict()) {
          throw new Error(`Local AI failed and LOCAL_AI_ONLY=true prevents cloud fallback. Ollama error: ${ollamaError.message}`);
        }
        
        throw ollamaError;
      }
    }

    if (provider === "openai") {
      const response = await this.chatWithOpenAI(request.messages, config);
      return { ...response, fallbackUsed: false };
    }

    const response = await this.chatWithOpenAI(request.messages, config);
    return { ...response, fallbackUsed: false };
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
      fallbackUsed: false,
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
      fallbackUsed: false,
      usage: data.eval_count ? {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      } : undefined,
    };
  }

  async *streamChatWithOllama(
    messages: ChatMessage[],
    config: AIConfig
  ): AsyncGenerator<StreamingChatChunk, void, unknown> {
    const model = config.model || "llama3.2";
    const startTime = Date.now();
    let totalContent = "";
    let promptTokens = 0;
    let completionTokens = 0;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch(`${this.ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          options: {
            temperature: config.temperature,
            num_predict: config.maxTokens,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("No response body from Ollama");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const data = JSON.parse(line);

            if (data.message?.content) {
              totalContent += data.message.content;
              yield {
                content: data.message.content,
                provider: "ollama",
                model,
                done: false,
              };
            }

            if (data.done) {
              promptTokens = data.prompt_eval_count || 0;
              completionTokens = data.eval_count || 0;

              yield {
                content: "",
                provider: "ollama",
                model,
                done: true,
                usage: {
                  promptTokens,
                  completionTokens,
                  totalTokens: promptTokens + completionTokens,
                },
              };
            }
          } catch {
            console.warn("[Ollama Stream] Failed to parse NDJSON line:", line);
          }
        }
      }

      const latencyMs = Date.now() - startTime;
      recordChatUsage(
        "ollama",
        true,
        latencyMs,
        promptTokens || completionTokens
          ? { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens }
          : undefined,
        { model }
      );
    } catch (error: any) {
      clearTimeout(timeout);
      const latencyMs = Date.now() - startTime;

      if (error.name === "AbortError") {
        recordChatUsage("ollama", false, latencyMs, undefined, { model });
        throw new Error("Ollama streaming request timed out after 120 seconds");
      }

      recordChatUsage("ollama", false, latencyMs, undefined, { model });
      throw error;
    }
  }

  private async *streamChatWithOpenAI(
    messages: ChatMessage[],
    config: AIConfig
  ): AsyncGenerator<StreamingChatChunk, void, unknown> {
    if (!this.openaiClient) {
      throw new Error("OpenAI not configured");
    }

    const model = config.model || "gpt-4o";
    const startTime = Date.now();
    let totalContent = "";
    let promptTokens = 0;
    let completionTokens = 0;

    try {
      const stream = await this.openaiClient.chat.completions.create({
        model,
        messages,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;

        if (delta) {
          totalContent += delta;
          yield {
            content: delta,
            provider: "openai",
            model,
            done: false,
          };
        }

        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens || 0;
          completionTokens = chunk.usage.completion_tokens || 0;
        }

        if (chunk.choices[0]?.finish_reason) {
          yield {
            content: "",
            provider: "openai",
            model,
            done: true,
            usage: {
              promptTokens,
              completionTokens,
              totalTokens: promptTokens + completionTokens,
            },
          };
        }
      }

      const latencyMs = Date.now() - startTime;
      recordChatUsage(
        "openai",
        true,
        latencyMs,
        { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens },
        { model }
      );
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      recordChatUsage("openai", false, latencyMs, undefined, { model });
      throw error;
    }
  }

  async *streamChat(
    request: ChatRequest
  ): AsyncGenerator<StreamingChatChunk, void, unknown> {
    const config = { ...DEFAULT_CONFIG, ...request.config };
    const provider =
      config.provider === "auto"
        ? await this.selectBestProvider("chat")
        : config.provider;

    if (provider === "ollama" || config.provider === "auto") {
      try {
        const streamGenerator = await withResilience(
          "ollama",
          async () => this.streamChatWithOllama(request.messages, config)
        );

        let hasYielded = false;
        for await (const chunk of streamGenerator) {
          hasYielded = true;
          yield { ...chunk, fallbackUsed: false };
        }

        if (hasYielded) {
          return;
        }
      } catch (ollamaError: any) {
        console.log(`[AI Orchestrator] Ollama streaming failed: ${ollamaError.message}`);

        if (this.canUseFallback() && !this.isLocalAIOnlyStrict()) {
          console.log(`[AI Orchestrator] Falling back to OpenAI streaming`);

          try {
            const fallbackStream = await withResilience(
              "openai",
              async () => this.streamChatWithOpenAI(request.messages, config)
            );

            for await (const chunk of fallbackStream) {
              yield { ...chunk, fallbackUsed: true };
            }
            return;
          } catch (openaiError: any) {
            throw new Error(
              `Both Ollama and OpenAI streaming failed. Ollama: ${ollamaError.message}. OpenAI: ${openaiError.message}`
            );
          }
        }

        if (this.isLocalAIOnlyStrict()) {
          throw new Error(
            `Local AI streaming failed and LOCAL_AI_ONLY=true prevents cloud fallback. Ollama error: ${ollamaError.message}`
          );
        }

        throw ollamaError;
      }
    }

    if (provider === "openai") {
      const streamGenerator = await withResilience(
        "openai",
        async () => this.streamChatWithOpenAI(request.messages, config)
      );

      for await (const chunk of streamGenerator) {
        yield { ...chunk, fallbackUsed: false };
      }
      return;
    }

    const fallbackStream = await withResilience(
      "openai",
      async () => this.streamChatWithOpenAI(request.messages, config)
    );

    for await (const chunk of fallbackStream) {
      yield { ...chunk, fallbackUsed: false };
    }
  }

  async generateImage(request: ImageRequest): Promise<ImageResponse> {
    const provider = request.provider || "auto";
    const localAIOnly = process.env.LOCAL_AI_ONLY === "true";

    // Auto mode: try local SD first if available, fall back to DALL-E (unless LOCAL_AI_ONLY)
    if (provider === "auto") {
      const sdAvailable = await this.checkStableDiffusion();
      if (sdAvailable) {
        console.log("[AI Orchestrator] Auto: Using local Stable Diffusion (GPU)");
        try {
          return await this.generateWithSD(request);
        } catch (err) {
          if (localAIOnly) {
            console.log(`[AI Orchestrator] SD failed, LOCAL_AI_ONLY is set - not falling back to OpenAI`);
            throw new Error(`Local Stable Diffusion failed: ${err instanceof Error ? err.message : err}. LOCAL_AI_ONLY is enabled - no cloud fallback.`);
          }
          console.log(`[AI Orchestrator] SD failed, falling back to DALL-E: ${err instanceof Error ? err.message : err}`);
          if (this.hasOpenAI()) {
            return this.generateWithDALLE(request);
          }
          throw err;
        }
      } else if (localAIOnly) {
        console.log("[AI Orchestrator] Auto: LOCAL_AI_ONLY is set but SD is unavailable - not falling back to OpenAI");
        throw new Error("Local Stable Diffusion is offline. Please start SD WebUI on your Windows VM or set LOCAL_AI_ONLY=false to allow cloud fallback.");
      } else if (this.hasOpenAI()) {
        console.log("[AI Orchestrator] Auto: Local SD unavailable, using DALL-E 3");
        return this.generateWithDALLE(request);
      } else {
        throw new Error("No image provider available. Start Stable Diffusion on Windows VM or add OpenAI API key.");
      }
    }

    // Explicit stable-diffusion selection
    if (provider === "stable-diffusion") {
      console.log(`[AI Orchestrator] Generating image with local Stable Diffusion at ${this.stableDiffusionUrl}`);
      return this.generateWithSD(request);
    }

    // OpenAI/DALL-E - block if LOCAL_AI_ONLY is set
    if (localAIOnly) {
      console.log("[AI Orchestrator] OpenAI provider requested but LOCAL_AI_ONLY is set");
      throw new Error("Local Stable Diffusion is offline. Please start SD WebUI on your Windows VM or set LOCAL_AI_ONLY=false to allow cloud fallback.");
    }
    console.log("[AI Orchestrator] Generating image with DALL-E 3 (cloud)");
    return this.generateWithDALLE(request);
  }

  private async generateWithDALLE(request: ImageRequest): Promise<ImageResponse> {
    if (!this.openaiClient) {
      throw new Error("OpenAI not configured - add OPENAI_API_KEY to environment");
    }

    // Detect if using Replit modelfarm (uses gpt-image-1 instead of dall-e-3)
    const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    const isReplitModelfarm = baseURL && baseURL.includes('modelfarm');
    const modelName = isReplitModelfarm ? "gpt-image-1" : "dall-e-3";

    console.log(`[DALL-E] Generating image with prompt: "${request.prompt.substring(0, 50)}..."`);
    console.log(`[DALL-E] Using model: ${modelName}${isReplitModelfarm ? ' (via Replit modelfarm)' : ''}`);
    
    try {
      // gpt-image-1 has different options (no style/quality parameters)
      const generateParams: any = {
        model: modelName,
        prompt: request.prompt,
        size: request.size || "1024x1024",
        n: 1,
      };
      
      // Only add style/quality for dall-e-3
      if (!isReplitModelfarm) {
        generateParams.style = request.style || "vivid";
        generateParams.quality = "hd";
      }
      
      const response = await this.openaiClient.images.generate(generateParams);

      console.log("[DALL-E] Successfully generated image");
      
      return {
        url: response.data?.[0]?.url,
        provider: "openai",
        revisedPrompt: response.data?.[0]?.revised_prompt,
      };
    } catch (error: any) {
      console.error(`[DALL-E] Generation failed:`, error.message);
      
      if (error.status === 401) {
        const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
        console.error(`[DALL-E] API key check: exists=${!!apiKey}, length=${apiKey?.length || 0}, prefix=${apiKey?.substring(0, 7) || 'none'}`);
        throw new Error("OpenAI API key is invalid or expired. Please verify your OPENAI_API_KEY in the environment.");
      }
      
      if (error.status === 400 && error.message?.includes("safety")) {
        throw new Error("Content was rejected by OpenAI's safety system. Try using local Stable Diffusion for unrestricted generation.");
      }
      
      throw error;
    }
  }

  private async generateWithSD(request: ImageRequest): Promise<ImageResponse> {
    // Pre-flight check: verify SD status before attempting generation
    const sdStatus = await this.getSDStatus(1);
    
    if (!sdStatus.available) {
      throw new Error(`Stable Diffusion is not reachable at ${this.stableDiffusionUrl}. ${sdStatus.error || "Check that SD WebUI is running."}`);
    }
    
    if (sdStatus.modelLoading) {
      throw new Error("Stable Diffusion is currently loading a model. Please wait a few moments and try again.");
    }
    
    if (!sdStatus.modelLoaded) {
      const availableHint = sdStatus.availableModels.length > 0 
        ? ` Available models: ${sdStatus.availableModels.slice(0, 3).join(", ")}${sdStatus.availableModels.length > 3 ? "..." : ""}`
        : " No models found in SD WebUI. Add .safetensors or .ckpt files to models/Stable-diffusion/ folder.";
      throw new Error(`No model loaded in Stable Diffusion.${availableHint}`);
    }

    const sizeMap: Record<string, { width: number; height: number }> = {
      "512x512": { width: 512, height: 512 },
      "768x768": { width: 768, height: 768 },
      "1024x1024": { width: 1024, height: 1024 },
      "1792x1024": { width: 1024, height: 576 },
      "1024x1792": { width: 576, height: 1024 },
    };
    
    const dimensions = sizeMap[request.size || "1024x1024"] || { width: 512, height: 512 };
    
    console.log(`[SD] Generating image at ${this.stableDiffusionUrl}/sdapi/v1/txt2img`);
    console.log(`[SD] Using model: ${sdStatus.currentModel}`);
    console.log(`[SD] Prompt: "${request.prompt}" (${request.prompt?.length || 0} chars)`);
    console.log(`[SD] Dimensions: ${dimensions.width}x${dimensions.height}`);
    
    let response: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000); // 2 minute timeout for generation
      
      response = await fetch(`${this.stableDiffusionUrl}/sdapi/v1/txt2img`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-Requested-With": "XMLHttpRequest"
        },
        body: JSON.stringify({
          prompt: request.prompt,
          negative_prompt: request.negativePrompt || "blurry, low quality, distorted, watermark, text",
          width: dimensions.width,
          height: dimensions.height,
          steps: 25,
          cfg_scale: 7,
          sampler_name: "DPM++ 2M Karras",
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch (fetchError: any) {
      if (fetchError.name === "AbortError") {
        throw new Error("Image generation timed out after 2 minutes. Try a simpler prompt or smaller image size.");
      }
      throw new Error(`Cannot connect to Stable Diffusion at ${this.stableDiffusionUrl}. Ensure SD WebUI is running with --api flag and Tailscale is connected.`);
    }

    const responseText = await response.text();
    
    if (!response.ok) {
      console.error(`[SD] Error response: ${responseText.substring(0, 500)}`);
      
      // Parse common SD errors
      const errorLower = responseText.toLowerCase();
      
      if (errorLower.includes("cuda out of memory") || errorLower.includes("out of memory")) {
        throw new Error(`CUDA out of memory. Try a smaller image size (512x512) or close other GPU applications. VRAM: ${sdStatus.vram ? `${Math.round(sdStatus.vram.free / 1024 / 1024)}MB free` : "unknown"}`);
      }
      
      if (errorLower.includes("failed to recognize model type") || errorLower.includes("not a valid model")) {
        const modelName = sdStatus.currentModel || "unknown";
        const isMotionModule = modelName.toLowerCase().startsWith("mm_") || modelName.toLowerCase().startsWith("mm-") || modelName.includes("motion");
        
        // Filter out motion modules and other non-checkpoint files from suggestions
        const validCheckpoints = (sdStatus.availableModels || []).filter(m => {
          const lower = m.toLowerCase();
          return !lower.startsWith("mm_") && 
                 !lower.startsWith("mm-") && 
                 !lower.includes("motion") &&
                 !lower.includes("lora") &&
                 !lower.includes("vae");
        });
        
        const suggestion = validCheckpoints.length > 0 
          ? ` Available checkpoints: ${validCheckpoints.slice(0, 5).join(", ")}`
          : " Download a checkpoint model like Dreamshaper, RealisticVision, or SD 1.5/SDXL.";
        
        if (isMotionModule) {
          throw new Error(`"${modelName}" is a motion/video module, not an image checkpoint. Load a standard SD model instead.${suggestion}`);
        }
        throw new Error(`The model "${modelName}" is not a valid Stable Diffusion checkpoint.${suggestion}`);
      }
      
      if (errorLower.includes("model") && errorLower.includes("not found")) {
        throw new Error(`Model not found. Current model: ${sdStatus.currentModel || "none"}. Available: ${sdStatus.availableModels.join(", ") || "none"}`);
      }
      
      if (errorLower.includes("oom") || errorLower.includes("killed")) {
        throw new Error("Generation was killed due to insufficient memory. Try smaller dimensions or fewer steps.");
      }
      
      throw new Error(`Stable Diffusion error (${response.status}): ${responseText.substring(0, 200)}`);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`[SD] Invalid JSON response: ${responseText.substring(0, 500)}`);
      throw new Error(`Stable Diffusion returned invalid response. Check that SD WebUI is started with --api flag. Response preview: ${responseText.substring(0, 100)}`);
    }

    if (!data.images?.[0]) {
      console.error(`[SD] No images in response:`, JSON.stringify(data).substring(0, 500));
      throw new Error("Stable Diffusion returned no image data. Check SD WebUI console for errors.");
    }

    const base64Data = data.images[0];
    const estimatedBytes = Math.ceil(base64Data.length * 0.75);
    console.log(`[SD] Successfully generated image with model "${sdStatus.currentModel}" - base64 length: ${base64Data.length}, estimated bytes: ${estimatedBytes}`);
    
    if (base64Data.length < 1000) {
      console.error(`[SD] Image data too small - likely empty or error: ${base64Data.substring(0, 100)}`);
      throw new Error("Stable Diffusion returned empty/corrupt image. The model may have failed to generate. Check SD WebUI console.");
    }
    
    return {
      base64: base64Data,
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
    if (isReplitEnv()) {
      console.log("[AI Orchestrator] Replit environment detected, using OpenAI");
      return "openai";
    }

    if (capability === "chat") {
      // Always do a live probe - state file can be stale or container networking may not reach Tailscale IPs
      try {
        const response = await fetch(`${this.ollamaUrl}/api/tags`, {
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) {
          const data = await response.json();
          if (data.models?.length > 0) {
            console.log(`[AI Orchestrator] Using Ollama at ${this.ollamaUrl} (live probe succeeded, ${data.models.length} models available)`);
            return "ollama";
          }
        }
      } catch (error) {
        // Ollama not reachable - this is expected if running in Docker without Tailscale routing
        console.log(`[AI Orchestrator] Ollama at ${this.ollamaUrl} not reachable, using OpenAI fallback`);
      }
    }

    return "openai";
  }

  hasOpenAI(): boolean {
    return this.openaiClient !== null;
  }

  hasReplicate(): boolean {
    return this.replicateClient !== null;
  }

  async checkComfyUI(): Promise<boolean> {
    if (isReplitEnv()) {
      return false;
    }

    if (this.isComfyUIOnlineFromState()) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(`${this.comfyuiUrl}/system_stats`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (response.ok) return true;
      } catch {
      }
    }
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${this.comfyuiUrl}/system_stats`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  async checkStableDiffusion(): Promise<boolean> {
    const status = await this.getSDStatus();
    return status.available && status.modelLoaded;
  }

  async getSDStatus(retries = 2): Promise<SDStatus> {
    const defaultStatus: SDStatus = {
      available: false,
      url: this.stableDiffusionUrl,
      modelLoaded: false,
      currentModel: null,
      modelLoading: false,
      availableModels: [],
      error: null,
    };

    if (isReplitEnv()) {
      defaultStatus.error = "Local SD not available in Replit environment";
      return defaultStatus;
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Check if SD is reachable first
        const pingController = new AbortController();
        const pingTimeout = setTimeout(() => pingController.abort(), 5000);
        
        const pingResponse = await fetch(`${this.stableDiffusionUrl}/sdapi/v1/options`, {
          signal: pingController.signal,
        });
        clearTimeout(pingTimeout);

        if (!pingResponse.ok) {
          if (attempt < retries) continue;
          defaultStatus.error = `SD WebUI returned ${pingResponse.status}`;
          return defaultStatus;
        }

        const options = await pingResponse.json();
        defaultStatus.available = true;
        
        // Get current model from options
        const currentModel = options.sd_model_checkpoint || null;
        defaultStatus.currentModel = currentModel;
        defaultStatus.modelLoaded = !!currentModel && currentModel.length > 0;

        // Check for model loading state (progress endpoint)
        try {
          const progressController = new AbortController();
          const progressTimeout = setTimeout(() => progressController.abort(), 3000);
          const progressResponse = await fetch(`${this.stableDiffusionUrl}/sdapi/v1/progress`, {
            signal: progressController.signal,
          });
          clearTimeout(progressTimeout);
          
          if (progressResponse.ok) {
            const progress = await progressResponse.json();
            // If job is running and no current_image, it might be loading a model
            defaultStatus.modelLoading = progress.state?.job === "load model" || 
              (progress.progress > 0 && progress.progress < 1 && !progress.current_image);
          }
        } catch {
          // Progress check is optional
        }

        // Get available models
        try {
          const modelsController = new AbortController();
          const modelsTimeout = setTimeout(() => modelsController.abort(), 5000);
          const modelsResponse = await fetch(`${this.stableDiffusionUrl}/sdapi/v1/sd-models`, {
            signal: modelsController.signal,
          });
          clearTimeout(modelsTimeout);
          
          if (modelsResponse.ok) {
            const models: SDModel[] = await modelsResponse.json();
            defaultStatus.availableModels = models.map(m => m.title || m.model_name);
          }
        } catch {
          // Model list is optional
        }

        // Get VRAM info if available
        try {
          const memController = new AbortController();
          const memTimeout = setTimeout(() => memController.abort(), 3000);
          const memResponse = await fetch(`${this.stableDiffusionUrl}/sdapi/v1/memory`, {
            signal: memController.signal,
          });
          clearTimeout(memTimeout);
          
          if (memResponse.ok) {
            const mem = await memResponse.json();
            if (mem.cuda?.system) {
              defaultStatus.vram = {
                total: mem.cuda.system.total || 0,
                used: mem.cuda.system.used || 0,
                free: mem.cuda.system.free || 0,
              };
            }
          }
        } catch {
          // Memory info is optional
        }

        return defaultStatus;

      } catch (error: any) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        
        if (error.name === "AbortError") {
          defaultStatus.error = `Connection timeout to ${this.stableDiffusionUrl}`;
        } else {
          defaultStatus.error = `Cannot connect to SD: ${error.message}`;
        }
        return defaultStatus;
      }
    }

    return defaultStatus;
  }

  async getSDModels(): Promise<SDModel[]> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.stableDiffusionUrl}/sdapi/v1/sd-models`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      
      if (!response.ok) {
        console.error(`[SD] Failed to get models: ${response.status}`);
        return [];
      }
      
      return await response.json();
    } catch (error: any) {
      console.error(`[SD] Error fetching models: ${error.message}`);
      return [];
    }
  }

  async loadSDModel(modelName: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.stableDiffusionUrl}/sdapi/v1/options`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sd_model_checkpoint: modelName }),
      });
      
      if (!response.ok) {
        console.error(`[SD] Failed to load model: ${response.status}`);
        return false;
      }
      
      console.log(`[SD] Model load request sent for: ${modelName}`);
      return true;
    } catch (error: any) {
      console.error(`[SD] Error loading model: ${error.message}`);
      return false;
    }
  }

  private async uploadImageToComfyUI(imageUrl: string): Promise<string> {
    // Download image from URL
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("Failed to download input image");
    const imageBuffer = await response.arrayBuffer();
    
    // Upload to ComfyUI
    const formData = new FormData();
    const filename = `input_${Date.now()}.png`;
    formData.append("image", new Blob([imageBuffer], { type: "image/png" }), filename);
    
    const uploadResponse = await fetch(`${this.comfyuiUrl}/upload/image`, {
      method: "POST",
      body: formData,
    });
    
    if (!uploadResponse.ok) {
      throw new Error("Failed to upload image to ComfyUI");
    }
    
    const result = await uploadResponse.json();
    return result.name || filename;
  }

  private async generateVideoWithComfyUI(request: VideoRequest): Promise<VideoResponse> {
    const isAnimateDiff = request.model === "animatediff" || !request.inputImage;
    
    // AnimateDiff workflow for text-to-video (properly wired)
    // Flow: Checkpoint -> AnimateDiff Loader -> KSampler -> VAEDecode -> VideoCombine
    const animateDiffWorkflow = {
      "1": {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {
          "ckpt_name": "dreamshaper_8.safetensors"
        }
      },
      "2": {
        "class_type": "ADE_AnimateDiffLoaderWithContext",
        "inputs": {
          "model": ["1", 0],
          "model_name": "mm_sd_v15_v2.ckpt",
          "beta_schedule": "sqrt_linear (AnimateDiff)",
          "context_length": 16,
          "context_stride": 1,
          "context_overlap": 4,
          "closed_loop": false
        }
      },
      "3": {
        "class_type": "CLIPTextEncode",
        "inputs": {
          "clip": ["1", 1],
          "text": request.prompt
        }
      },
      "4": {
        "class_type": "CLIPTextEncode",
        "inputs": {
          "clip": ["1", 1],
          "text": "blurry, low quality, distorted, ugly, watermark, text"
        }
      },
      "5": {
        "class_type": "EmptyLatentImage",
        "inputs": {
          "batch_size": 16,
          "height": request.aspectRatio === "9:16" ? 512 : 320,
          "width": request.aspectRatio === "9:16" ? 320 : 512
        }
      },
      "6": {
        "class_type": "KSampler",
        "inputs": {
          "cfg": 7.5,
          "denoise": 1,
          "latent_image": ["5", 0],
          "model": ["2", 0],
          "negative": ["4", 0],
          "positive": ["3", 0],
          "sampler_name": "euler_ancestral",
          "scheduler": "normal",
          "seed": Math.floor(Math.random() * 1000000000),
          "steps": 20
        }
      },
      "7": {
        "class_type": "VAEDecode",
        "inputs": {
          "samples": ["6", 0],
          "vae": ["1", 2]
        }
      },
      "8": {
        "class_type": "VHS_VideoCombine",
        "inputs": {
          "images": ["7", 0],
          "frame_rate": 8,
          "loop_count": 0,
          "filename_prefix": "AnimateDiff",
          "format": "video/h264-mp4",
          "save_output": true,
          "pingpong": false,
          "crf": 19
        }
      }
    };

    // For SVD with image input, we need to upload the image first
    let uploadedImageName = "";
    if (!isAnimateDiff && request.inputImage) {
      uploadedImageName = await this.uploadImageToComfyUI(request.inputImage);
    }

    // SVD workflow for image-to-video
    const svdWorkflow = {
      "1": {
        "class_type": "LoadImage",
        "inputs": {
          "image": uploadedImageName
        }
      },
      "2": {
        "class_type": "ImageOnlyCheckpointLoader",
        "inputs": {
          "ckpt_name": "svd_xt_1_1.safetensors"
        }
      },
      "3": {
        "class_type": "SVD_img2vid_Conditioning",
        "inputs": {
          "augmentation_level": 0,
          "fps": 8,
          "init_image": ["1", 0],
          "motion_bucket_id": 127,
          "video_frames": 25,
          "width": 1024,
          "height": 576
        }
      },
      "4": {
        "class_type": "KSampler",
        "inputs": {
          "cfg": 2.5,
          "denoise": 1,
          "latent_image": ["3", 2],
          "model": ["2", 0],
          "negative": ["3", 1],
          "positive": ["3", 0],
          "sampler_name": "euler",
          "scheduler": "karras",
          "seed": Math.floor(Math.random() * 1000000000),
          "steps": 20
        }
      },
      "5": {
        "class_type": "VAEDecode",
        "inputs": {
          "samples": ["4", 0],
          "vae": ["2", 2]
        }
      },
      "6": {
        "class_type": "VHS_VideoCombine",
        "inputs": {
          "images": ["5", 0],
          "frame_rate": 8,
          "loop_count": 0,
          "filename_prefix": "SVD",
          "format": "video/h264-mp4",
          "save_output": true,
          "pingpong": false,
          "crf": 19
        }
      }
    };

    const workflow = isAnimateDiff ? animateDiffWorkflow : svdWorkflow;
    const clientId = `nebula-${Date.now()}`;

    // Queue the prompt
    const queueResponse = await fetch(`${this.comfyuiUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: workflow,
        client_id: clientId,
      }),
    });

    if (!queueResponse.ok) {
      const errorText = await queueResponse.text();
      let parsedError;
      try {
        parsedError = JSON.parse(errorText);
      } catch {
        parsedError = { error: errorText };
      }
      
      if (parsedError.node_errors || errorText.includes("does not exist")) {
        const nodeError = JSON.stringify(parsedError.node_errors || parsedError);
        if (nodeError.includes("ADE_AnimateDiff") || nodeError.includes("AnimateDiff")) {
          throw new Error(`AnimateDiff nodes not installed in ComfyUI. To fix:\n1. Open ComfyUI Manager (click Manager button in ComfyUI)\n2. Click "Install Custom Nodes"\n3. Search for "AnimateDiff Evolved" and install it\n4. Restart ComfyUI\n5. Also install the motion model: mm_sd_v15_v2.ckpt in ComfyUI/custom_nodes/ComfyUI-AnimateDiff-Evolved/models/`);
        }
        if (nodeError.includes("VHS_VideoCombine")) {
          throw new Error(`VideoHelperSuite nodes not installed in ComfyUI. To fix:\n1. Open ComfyUI Manager\n2. Install "VideoHelperSuite" custom nodes\n3. Restart ComfyUI`);
        }
        throw new Error(`ComfyUI missing required nodes: ${nodeError.substring(0, 200)}`);
      }
      
      throw new Error(`ComfyUI queue error: ${errorText.substring(0, 300)}`);
    }

    const { prompt_id } = await queueResponse.json();

    // Poll for completion (max 5 minutes for video generation)
    const maxWait = 300000;
    const pollInterval = 2000;
    let elapsed = 0;

    while (elapsed < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      elapsed += pollInterval;

      const historyResponse = await fetch(`${this.comfyuiUrl}/history/${prompt_id}`);
      if (!historyResponse.ok) continue;

      const history = await historyResponse.json();
      const result = history[prompt_id];

      if (result?.outputs) {
        // Find the video output
        for (const nodeId of Object.keys(result.outputs)) {
          const output = result.outputs[nodeId];
          if (output.gifs || output.videos) {
            const videos = output.gifs || output.videos;
            if (videos.length > 0) {
              const video = videos[0];
              const videoUrl = `${this.comfyuiUrl}/view?filename=${encodeURIComponent(video.filename)}&subfolder=${encodeURIComponent(video.subfolder || "")}&type=${video.type || "output"}`;
              return {
                url: videoUrl,
                provider: "comfyui",
                model: isAnimateDiff ? "animatediff" : "svd-local",
                duration: isAnimateDiff ? 2 : 3,
              };
            }
          }
        }
      }
    }

    throw new Error("Video generation timed out");
  }

  async generateVideo(request: VideoRequest): Promise<VideoResponse> {
    const comfyAvailable = await this.checkComfyUI();
    const isLocalModel = request.model === "animatediff" || request.model === "svd-local";
    const isLocalProvider = request.provider === "local" || request.provider === "comfyui";
    const isCloudModel = request.model === "wan-t2v" || request.model === "wan-i2v" || request.model === "svd";
    const isAutoMode = !request.model;
    
    console.log(`[AI Orchestrator] Video generation - model: ${request.model}, provider: ${request.provider}, ComfyUI: ${comfyAvailable}, Replicate: ${this.hasReplicate()}`);
    
    // Auto mode: try local first, fall back to cloud
    if (isAutoMode) {
      if (comfyAvailable) {
        console.log("[AI Orchestrator] Auto: Using local ComfyUI for video generation");
        try {
          return await this.generateVideoWithComfyUI(request);
        } catch (err) {
          console.log(`[AI Orchestrator] ComfyUI failed, falling back to Replicate: ${err instanceof Error ? err.message : err}`);
          if (this.hasReplicate()) {
            request.model = "wan-t2v";
            // Fall through to Replicate
          } else {
            throw err;
          }
        }
      } else if (this.hasReplicate()) {
        console.log("[AI Orchestrator] Auto: Local ComfyUI unavailable, using Replicate");
        request.model = "wan-t2v";
        // Fall through to Replicate
      } else {
        throw new Error("No video provider available. Start ComfyUI on Windows VM or add REPLICATE_API_TOKEN.");
      }
    }
    
    // Explicit local model selection
    if (isLocalProvider || isLocalModel) {
      if (comfyAvailable) {
        console.log("[AI Orchestrator] Using local ComfyUI for video generation - no content restrictions");
        return this.generateVideoWithComfyUI(request);
      }
      // If local requested but unavailable, try cloud fallback if available
      if (this.hasReplicate()) {
        console.log("[AI Orchestrator] Local ComfyUI unavailable, falling back to Replicate WAN model");
        request.model = "wan-t2v";
      } else {
        throw new Error(`ComfyUI not reachable at ${this.comfyuiUrl} - ensure ComfyUI is running on your Windows VM with AnimateDiff/SVD installed. Check that Tailscale is connected.`);
      }
    }

    if (!this.replicateClient) {
      if (comfyAvailable) {
        console.log("[AI Orchestrator] Replicate not configured, using local ComfyUI");
        return this.generateVideoWithComfyUI(request);
      }
      throw new Error(`No video generation provider available. Options:\n1. Start ComfyUI on Windows VM (${this.comfyuiUrl}) for local generation\n2. Add REPLICATE_API_TOKEN for cloud generation\n\nTip: Local generation has no content restrictions and is free.`);
    }
    
    console.log(`[AI Orchestrator] Using Replicate for ${request.model}`);

    const modelId = request.model || (request.inputImage ? "wan-i2v" : "wan-t2v");
    
    let output: unknown;
    let modelName: string;

    if (modelId === "wan-i2v" && request.inputImage) {
      modelName = "wavespeedai/wan-2.1-i2v-480p";
      output = await this.replicateClient.run(modelName as `${string}/${string}`, {
        input: {
          image: request.inputImage,
          prompt: request.prompt,
          max_area: "832x480",
          fast_mode: "Balanced",
          frame_num: 81,
          sample_shift: 8,
          sample_steps: 30,
        },
      });
    } else if (modelId === "svd" && request.inputImage) {
      modelName = "stability-ai/stable-video-diffusion";
      output = await this.replicateClient.run(modelName as `${string}/${string}`, {
        input: {
          input_image: request.inputImage,
          frames_per_second: 6,
        },
      });
    } else {
      modelName = "wavespeedai/wan-2.1-t2v-480p";
      output = await this.replicateClient.run(modelName as `${string}/${string}`, {
        input: {
          prompt: request.prompt,
          negative_prompt: "blurry, low quality, distorted, ugly",
          max_area: request.aspectRatio === "9:16" ? "480x832" : 
                    request.aspectRatio === "1:1" ? "640x640" : "832x480",
          fast_mode: "Balanced",
          frame_num: 81,
          sample_shift: 8,
          sample_steps: 30,
        },
      });
    }

    // Normalize Replicate output - different models return different shapes
    let videoUrl = "";
    if (typeof output === "string") {
      videoUrl = output;
    } else if (Array.isArray(output) && output.length > 0) {
      videoUrl = output[0];
    } else if (output && typeof output === "object") {
      // WAN models return { video: "url" }, others may return { url: "url" } or { output: "url" }
      const obj = output as { video?: string; url?: string; output?: string };
      videoUrl = obj.video || obj.url || obj.output || "";
    }

    if (!videoUrl) {
      throw new Error("Video generation failed - no output URL received from Replicate");
    }

    return {
      url: videoUrl,
      provider: "replicate",
      model: modelName,
      duration: 5,
    };
  }

  async getVideoProviders() {
    const comfyAvailable = await this.checkComfyUI();
    
    return [
      {
        id: "animatediff",
        name: "AnimateDiff (Local)",
        description: comfyAvailable 
          ? "Local text-to-video via ComfyUI on Windows VM - no content restrictions"
          : "ComfyUI not reachable - start ComfyUI on Windows VM",
        type: "text-to-video",
        available: comfyAvailable,
        provider: "local",
      },
      {
        id: "svd-local",
        name: "SVD (Local)",
        description: comfyAvailable
          ? "Local image-to-video via ComfyUI on Windows VM - no content restrictions"
          : "ComfyUI not reachable - start ComfyUI on Windows VM",
        type: "image-to-video",
        available: comfyAvailable,
        provider: "local",
      },
      {
        id: "wan-t2v",
        name: "WAN 2.1 Text-to-Video",
        description: "Cloud text-to-video via Replicate (480p)",
        type: "text-to-video",
        available: this.hasReplicate(),
        provider: "replicate",
      },
      {
        id: "wan-i2v",
        name: "WAN 2.1 Image-to-Video",
        description: "Cloud image-to-video via Replicate (480p)",
        type: "image-to-video",
        available: this.hasReplicate(),
        provider: "replicate",
      },
      {
        id: "svd",
        name: "Stable Video Diffusion",
        description: "Cloud high-quality image animation via Replicate",
        type: "image-to-video",
        available: this.hasReplicate(),
        provider: "replicate",
      },
    ];
  }

  /**
   * Ensures LOCAL_AI_ONLY constraint is respected.
   * Throws an error if local SD is required but unavailable.
   */
  private async ensureLocalSDAvailable(operation: string): Promise<SDStatus> {
    const localAIOnly = process.env.LOCAL_AI_ONLY === "true";
    const sdStatus = await this.getSDStatus(1);

    if (!sdStatus.available) {
      const msg = `Stable Diffusion is not reachable at ${this.stableDiffusionUrl}. ${sdStatus.error || "Check that SD WebUI is running."}`;
      if (localAIOnly) {
        throw new Error(`${msg} LOCAL_AI_ONLY is enabled - no cloud fallback available for ${operation}.`);
      }
      throw new Error(msg);
    }

    if (sdStatus.modelLoading) {
      throw new Error("Stable Diffusion is currently loading a model. Please wait a few moments and try again.");
    }

    if (!sdStatus.modelLoaded) {
      const availableHint = sdStatus.availableModels.length > 0
        ? ` Available models: ${sdStatus.availableModels.slice(0, 3).join(", ")}${sdStatus.availableModels.length > 3 ? "..." : ""}`
        : " No models found in SD WebUI.";
      throw new Error(`No model loaded in Stable Diffusion.${availableHint}`);
    }

    return sdStatus;
  }

  /**
   * Converts a URL or data URL to base64 format for SD API.
   */
  private async imageToBase64(image: string): Promise<string> {
    // Already base64 (no URL prefix)
    if (!image.startsWith("http") && !image.startsWith("data:")) {
      return image;
    }

    // Data URL - extract base64 part
    if (image.startsWith("data:")) {
      const match = image.match(/^data:[^;]+;base64,(.+)$/);
      if (match) {
        return match[1];
      }
      throw new Error("Invalid data URL format");
    }

    // URL - fetch and convert
    try {
      const response = await fetch(image);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      return Buffer.from(buffer).toString("base64");
    } catch (error: any) {
      throw new Error(`Failed to download image from URL: ${error.message}`);
    }
  }

  /**
   * Image-to-Image generation using Stable Diffusion.
   * Takes an input image and transforms it based on the prompt.
   */
  async img2img(request: Img2ImgRequest): Promise<ImageResponse> {
    console.log(`[AI Orchestrator] img2img request with denoising strength: ${request.denoisingStrength || 0.75}`);
    
    const sdStatus = await this.ensureLocalSDAvailable("img2img");
    
    const imageBase64 = await this.imageToBase64(request.image);
    
    const sizeMap: Record<string, { width: number; height: number }> = {
      "512x512": { width: 512, height: 512 },
      "768x768": { width: 768, height: 768 },
      "1024x1024": { width: 1024, height: 1024 },
    };
    const dimensions = sizeMap[request.size || "512x512"] || { width: 512, height: 512 };

    console.log(`[SD img2img] Using model: ${sdStatus.currentModel}`);
    console.log(`[SD img2img] Prompt: "${request.prompt.substring(0, 50)}..."`);

    let response: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180000); // 3 minute timeout

      response = await fetch(`${this.stableDiffusionUrl}/sdapi/v1/img2img`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          init_images: [imageBase64],
          prompt: request.prompt,
          negative_prompt: request.negativePrompt || "blurry, low quality, distorted, watermark, text",
          width: dimensions.width,
          height: dimensions.height,
          denoising_strength: request.denoisingStrength ?? 0.75,
          steps: request.steps || 25,
          cfg_scale: request.cfgScale || 7,
          sampler_name: request.sampler || "DPM++ 2M Karras",
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch (fetchError: any) {
      if (fetchError.name === "AbortError") {
        throw new Error("img2img generation timed out after 3 minutes.");
      }
      throw new Error(`Cannot connect to Stable Diffusion: ${fetchError.message}`);
    }

    const responseText = await response.text();
    if (!response.ok) {
      console.error(`[SD img2img] Error: ${responseText.substring(0, 500)}`);
      throw new Error(`Stable Diffusion img2img error (${response.status}): ${responseText.substring(0, 200)}`);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error("Stable Diffusion returned invalid JSON response.");
    }

    if (!data.images?.[0]) {
      throw new Error("Stable Diffusion returned no image data for img2img.");
    }

    console.log(`[SD img2img] Successfully generated image`);
    return {
      base64: data.images[0],
      provider: "stable-diffusion",
    };
  }

  /**
   * Inpainting: Fill in masked areas of an image with AI-generated content.
   * White areas in the mask will be regenerated.
   */
  async inpaint(request: InpaintRequest): Promise<ImageResponse> {
    console.log(`[AI Orchestrator] Inpaint request with mask blur: ${request.maskBlur || 4}`);
    
    const sdStatus = await this.ensureLocalSDAvailable("inpainting");
    
    const imageBase64 = await this.imageToBase64(request.image);
    const maskBase64 = await this.imageToBase64(request.mask);

    console.log(`[SD Inpaint] Using model: ${sdStatus.currentModel}`);
    console.log(`[SD Inpaint] Prompt: "${request.prompt.substring(0, 50)}..."`);

    let response: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180000);

      response = await fetch(`${this.stableDiffusionUrl}/sdapi/v1/img2img`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          init_images: [imageBase64],
          mask: maskBase64,
          prompt: request.prompt,
          negative_prompt: request.negativePrompt || "blurry, low quality, distorted, watermark, text",
          denoising_strength: request.denoisingStrength ?? 0.75,
          mask_blur: request.maskBlur ?? 4,
          inpainting_fill: request.inpaintingFill ?? 1, // 1 = original
          inpaint_full_res: request.inpaintFullRes ?? true,
          inpaint_full_res_padding: request.inpaintFullResPadding ?? 32,
          steps: request.steps || 25,
          cfg_scale: request.cfgScale || 7,
          sampler_name: "DPM++ 2M Karras",
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch (fetchError: any) {
      if (fetchError.name === "AbortError") {
        throw new Error("Inpainting timed out after 3 minutes.");
      }
      throw new Error(`Cannot connect to Stable Diffusion: ${fetchError.message}`);
    }

    const responseText = await response.text();
    if (!response.ok) {
      console.error(`[SD Inpaint] Error: ${responseText.substring(0, 500)}`);
      throw new Error(`Stable Diffusion inpainting error (${response.status}): ${responseText.substring(0, 200)}`);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error("Stable Diffusion returned invalid JSON response.");
    }

    if (!data.images?.[0]) {
      throw new Error("Stable Diffusion returned no image data for inpainting.");
    }

    console.log(`[SD Inpaint] Successfully generated inpainted image`);
    return {
      base64: data.images[0],
      provider: "stable-diffusion",
    };
  }

  /**
   * Get available ControlNet models from SD WebUI.
   */
  async getControlNetModels(): Promise<ControlNetModel[]> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${this.stableDiffusionUrl}/controlnet/model_list`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        console.warn(`[ControlNet] Could not fetch model list: ${response.status}`);
        return [];
      }

      const data = await response.json();
      return (data.model_list || []).map((name: string) => ({
        model_name: name,
        module_name: name.split("_")[0] || "unknown",
      }));
    } catch (error: any) {
      console.warn(`[ControlNet] Failed to get models: ${error.message}`);
      return [];
    }
  }

  /**
   * Check if ControlNet extension is available in SD WebUI.
   */
  async checkControlNet(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(`${this.stableDiffusionUrl}/controlnet/version`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Map control type to preprocessor and model name patterns.
   */
  private getControlNetConfig(controlType: ControlNetType): { preprocessor: string; modelPattern: string } {
    const configs: Record<ControlNetType, { preprocessor: string; modelPattern: string }> = {
      canny: { preprocessor: "canny", modelPattern: "canny" },
      depth: { preprocessor: "depth_midas", modelPattern: "depth" },
      openpose: { preprocessor: "openpose_full", modelPattern: "openpose" },
      softedge: { preprocessor: "softedge_pidinet", modelPattern: "softedge" },
      scribble: { preprocessor: "scribble_pidinet", modelPattern: "scribble" },
      lineart: { preprocessor: "lineart_realistic", modelPattern: "lineart" },
      tile: { preprocessor: "tile_resample", modelPattern: "tile" },
      ip2p: { preprocessor: "none", modelPattern: "ip2p" },
      shuffle: { preprocessor: "shuffle", modelPattern: "shuffle" },
      reference: { preprocessor: "reference_only", modelPattern: "" },
    };
    return configs[controlType] || { preprocessor: "none", modelPattern: controlType };
  }

  /**
   * ControlNet generation: Use control images to guide the generation.
   * Supports multiple ControlNet units for complex control.
   */
  async controlnet(request: ControlNetRequest): Promise<ImageResponse> {
    console.log(`[AI Orchestrator] ControlNet request with ${request.controlNets.length} control unit(s)`);
    
    const sdStatus = await this.ensureLocalSDAvailable("controlnet");
    
    // Check if ControlNet extension is available
    const controlNetAvailable = await this.checkControlNet();
    if (!controlNetAvailable) {
      throw new Error("ControlNet extension is not installed or not responding. Install sd-webui-controlnet extension in SD WebUI.");
    }

    // Get available models to find matching ones
    const availableModels = await this.getControlNetModels();

    // Build ControlNet units
    const controlNetUnits = await Promise.all(
      request.controlNets.map(async (unit) => {
        const imageBase64 = await this.imageToBase64(unit.image);
        const config = this.getControlNetConfig(unit.controlType);
        
        // Find a matching model
        let model = unit.model;
        if (!model && config.modelPattern) {
          const matchingModel = availableModels.find(m => 
            m.model_name.toLowerCase().includes(config.modelPattern.toLowerCase())
          );
          model = matchingModel?.model_name || "";
        }

        return {
          enabled: true,
          input_image: imageBase64,
          module: unit.preprocessor || config.preprocessor,
          model: model || "None",
          weight: unit.weight ?? 1.0,
          guidance_start: unit.guidanceStart ?? 0.0,
          guidance_end: unit.guidanceEnd ?? 1.0,
          control_mode: unit.controlMode ?? 0,
          resize_mode: unit.resizeMode ?? 1,
        };
      })
    );

    const sizeMap: Record<string, { width: number; height: number }> = {
      "512x512": { width: 512, height: 512 },
      "768x768": { width: 768, height: 768 },
      "1024x1024": { width: 1024, height: 1024 },
    };
    const dimensions = sizeMap[request.size || "512x512"] || { width: 512, height: 512 };

    console.log(`[SD ControlNet] Using model: ${sdStatus.currentModel}`);
    console.log(`[SD ControlNet] Control types: ${request.controlNets.map(c => c.controlType).join(", ")}`);

    // Determine if this is txt2img or img2img based on inputImage
    const endpoint = request.inputImage 
      ? `${this.stableDiffusionUrl}/sdapi/v1/img2img`
      : `${this.stableDiffusionUrl}/sdapi/v1/txt2img`;

    const basePayload: any = {
      prompt: request.prompt,
      negative_prompt: request.negativePrompt || "blurry, low quality, distorted, watermark, text",
      width: dimensions.width,
      height: dimensions.height,
      steps: request.steps || 25,
      cfg_scale: request.cfgScale || 7,
      sampler_name: request.sampler || "DPM++ 2M Karras",
      alwayson_scripts: {
        controlnet: {
          args: controlNetUnits,
        },
      },
    };

    if (request.inputImage) {
      const inputBase64 = await this.imageToBase64(request.inputImage);
      basePayload.init_images = [inputBase64];
      basePayload.denoising_strength = request.denoisingStrength ?? 0.75;
    }

    let response: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180000);

      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(basePayload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch (fetchError: any) {
      if (fetchError.name === "AbortError") {
        throw new Error("ControlNet generation timed out after 3 minutes.");
      }
      throw new Error(`Cannot connect to Stable Diffusion: ${fetchError.message}`);
    }

    const responseText = await response.text();
    if (!response.ok) {
      console.error(`[SD ControlNet] Error: ${responseText.substring(0, 500)}`);
      
      if (responseText.toLowerCase().includes("controlnet")) {
        throw new Error("ControlNet processing failed. Ensure ControlNet models are downloaded and the extension is properly configured.");
      }
      throw new Error(`Stable Diffusion ControlNet error (${response.status}): ${responseText.substring(0, 200)}`);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error("Stable Diffusion returned invalid JSON response.");
    }

    if (!data.images?.[0]) {
      throw new Error("Stable Diffusion returned no image data for ControlNet generation.");
    }

    console.log(`[SD ControlNet] Successfully generated image with ${request.controlNets.length} control(s)`);
    return {
      base64: data.images[0],
      provider: "stable-diffusion",
    };
  }

  /**
   * Get available upscaler models from SD WebUI.
   */
  async getUpscalers(): Promise<SDUpscaler[]> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${this.stableDiffusionUrl}/sdapi/v1/upscalers`, {
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

  /**
   * Upscale an image using SD WebUI's extra-single-image endpoint.
   * Uses ESRGAN, Real-ESRGAN, or other available upscalers.
   */
  async upscale(request: UpscaleRequest): Promise<ImageResponse> {
    console.log(`[AI Orchestrator] Upscale request with scale factor: ${request.scaleFactor || 2}x`);
    
    await this.ensureLocalSDAvailable("upscaling");
    
    const imageBase64 = await this.imageToBase64(request.image);
    
    // Get available upscalers to validate/find the requested one
    const upscalers = await this.getUpscalers();
    let upscalerName = request.upscaler || "R-ESRGAN 4x+";
    
    // Try to find a matching upscaler
    if (upscalers.length > 0) {
      const exactMatch = upscalers.find(u => u.name === upscalerName);
      if (!exactMatch) {
        // Try partial match
        const partialMatch = upscalers.find(u => 
          u.name.toLowerCase().includes("esrgan") || 
          u.name.toLowerCase().includes("real")
        );
        if (partialMatch) {
          upscalerName = partialMatch.name;
        } else if (upscalers.length > 0) {
          // Use first available (skip "None" and "Lanczos")
          const validUpscaler = upscalers.find(u => 
            u.name !== "None" && u.name !== "Lanczos"
          );
          if (validUpscaler) {
            upscalerName = validUpscaler.name;
          }
        }
      }
    }

    console.log(`[SD Upscale] Using upscaler: ${upscalerName}`);

    let response: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300000); // 5 min for large upscales

      const payload: any = {
        image: imageBase64,
        upscaling_resize: request.scaleFactor || 2,
        upscaler_1: upscalerName,
        upscaler_2: request.upscaler2 || "None",
        extras_upscaler_2_visibility: request.upscaler2Visibility ?? 0,
        gfpgan_visibility: request.gfpganVisibility ?? 0,
        codeformer_visibility: request.codeformerVisibility ?? 0,
        codeformer_weight: request.codeformerWeight ?? 0,
      };

      response = await fetch(`${this.stableDiffusionUrl}/sdapi/v1/extra-single-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch (fetchError: any) {
      if (fetchError.name === "AbortError") {
        throw new Error("Upscaling timed out after 5 minutes. Try a smaller image or lower scale factor.");
      }
      throw new Error(`Cannot connect to Stable Diffusion: ${fetchError.message}`);
    }

    const responseText = await response.text();
    if (!response.ok) {
      console.error(`[SD Upscale] Error: ${responseText.substring(0, 500)}`);
      
      if (responseText.toLowerCase().includes("out of memory") || responseText.toLowerCase().includes("cuda")) {
        throw new Error("Upscaling ran out of GPU memory. Try a smaller image or use 2x instead of 4x.");
      }
      throw new Error(`Stable Diffusion upscale error (${response.status}): ${responseText.substring(0, 200)}`);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error("Stable Diffusion returned invalid JSON response.");
    }

    if (!data.image) {
      throw new Error("Stable Diffusion returned no image data for upscaling.");
    }

    console.log(`[SD Upscale] Successfully upscaled image ${request.scaleFactor || 2}x`);
    return {
      base64: data.image,
      provider: "stable-diffusion",
    };
  }

  /**
   * Check if ReActor face swap extension is available.
   */
  async checkReActor(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      
      // ReActor adds endpoints under /reactor/
      const response = await fetch(`${this.stableDiffusionUrl}/reactor/models`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Face swap: Replace faces in the target image with faces from the source image.
   * Uses ReActor extension if available, otherwise provides guidance.
   */
  async faceSwap(request: FaceSwapRequest): Promise<ImageResponse> {
    console.log(`[AI Orchestrator] Face swap request`);
    
    const sdStatus = await this.ensureLocalSDAvailable("face swap");
    
    const sourceBase64 = await this.imageToBase64(request.sourceImage);
    const targetBase64 = await this.imageToBase64(request.targetImage);
    
    // Check if ReActor extension is available
    const reactorAvailable = await this.checkReActor();
    
    if (!reactorAvailable) {
      // Provide helpful guidance on installing ReActor
      throw new Error(
        "Face swap requires the ReActor extension. To install:\n" +
        "1. Open SD WebUI Extensions tab\n" +
        "2. Click 'Install from URL'\n" +
        "3. Enter: https://github.com/Gourieff/sd-webui-reactor\n" +
        "4. Click 'Install' and restart SD WebUI\n" +
        "5. Download the inswapper model from the ReActor GitHub page"
      );
    }

    console.log(`[SD FaceSwap] Using ReActor extension`);

    // ReActor works through the img2img endpoint with alwayson_scripts
    let response: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180000);

      const payload = {
        init_images: [targetBase64],
        prompt: "",
        negative_prompt: "",
        denoising_strength: 0, // 0 means no denoising, just face swap
        width: -1, // Use original size
        height: -1,
        steps: 1,
        cfg_scale: 1,
        alwayson_scripts: {
          reactor: {
            args: [
              sourceBase64, // source image
              true, // enable
              "0", // source face index
              String(request.faceIndex ?? 0), // target face index
              "inswapper_128.onnx", // model
              request.restoreFace ? "CodeFormer" : "None", // face restorer
              1, // restorer visibility
              true, // restore face only
              request.upscale ? (request.upscaleFactor === 4 ? "4x-UltraSharp" : "2x-ESRGAN") : "None", // upscaler
              request.upscaleFactor || 1, // upscale factor
              1, // upscaler visibility
              false, // swap in source
              true, // swap in generated
              0, // console log level
              "inswapper_128.onnx", // detection model
            ],
          },
        },
      };

      response = await fetch(`${this.stableDiffusionUrl}/sdapi/v1/img2img`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch (fetchError: any) {
      if (fetchError.name === "AbortError") {
        throw new Error("Face swap timed out after 3 minutes.");
      }
      throw new Error(`Cannot connect to Stable Diffusion: ${fetchError.message}`);
    }

    const responseText = await response.text();
    if (!response.ok) {
      console.error(`[SD FaceSwap] Error: ${responseText.substring(0, 500)}`);
      
      const errorLower = responseText.toLowerCase();
      if (errorLower.includes("reactor") || errorLower.includes("inswapper")) {
        throw new Error(
          "ReActor extension error. Ensure:\n" +
          "1. inswapper_128.onnx model is in models/insightface/\n" +
          "2. ReActor extension is up to date\n" +
          "3. Required dependencies are installed (onnxruntime)"
        );
      }
      if (errorLower.includes("no face")) {
        throw new Error("No face detected in the source or target image. Ensure both images contain clear, visible faces.");
      }
      throw new Error(`Stable Diffusion face swap error (${response.status}): ${responseText.substring(0, 200)}`);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error("Stable Diffusion returned invalid JSON response.");
    }

    if (!data.images?.[0]) {
      throw new Error("Stable Diffusion returned no image data for face swap.");
    }

    console.log(`[SD FaceSwap] Successfully swapped face`);
    return {
      base64: data.images[0],
      provider: "stable-diffusion",
    };
  }

  /**
   * Get capabilities of the current SD WebUI setup.
   * Returns info about available extensions and features.
   */
  async getAdvancedCapabilities(): Promise<{
    img2img: boolean;
    inpainting: boolean;
    controlnet: { available: boolean; models: string[] };
    upscaling: { available: boolean; upscalers: string[] };
    faceSwap: { available: boolean; extension: string | null };
  }> {
    const sdStatus = await this.getSDStatus();
    
    const [controlNetModels, upscalers, reactorAvailable] = await Promise.all([
      this.getControlNetModels(),
      this.getUpscalers(),
      this.checkReActor(),
    ]);

    return {
      img2img: sdStatus.available && sdStatus.modelLoaded,
      inpainting: sdStatus.available && sdStatus.modelLoaded,
      controlnet: {
        available: controlNetModels.length > 0,
        models: controlNetModels.map(m => m.model_name),
      },
      upscaling: {
        available: upscalers.length > 0,
        upscalers: upscalers.map(u => u.name).filter(n => n !== "None"),
      },
      faceSwap: {
        available: reactorAvailable,
        extension: reactorAvailable ? "ReActor" : null,
      },
    };
  }
}

export const aiOrchestrator = new AIOrchestrator();

// Re-export the new orchestrator and all its providers for backward compatibility
export {
  aiOrchestrator as newAIOrchestrator,
  ollamaProvider,
  openaiProvider,
  stableDiffusionProvider,
  healthChecker,
  responseCache,
  costTracker,
  recordAIUsage,
  shouldBlockCloudUsage,
  getCostSummary,
  isLocalOnlyMode,
} from './ai/orchestrator';

// Re-export types from the new type system for backward compatibility
export type {
  AIProviderName,
  AIProviderCapabilities,
  OrchestratorMetadata,
  RetryConfig,
  ProviderHealthStatus,
  AIProvider as NewAIProvider,
  ChatMessage as NewChatMessage,
  ChatRequest as NewChatRequest,
  ChatResponse as NewChatResponse,
  StreamingChunk,
  EmbeddingRequest,
  EmbeddingResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
} from './ai/types';

// Re-export RoutingStrategy and OrchestratorConfig from the new orchestrator
export type { RoutingStrategy, OrchestratorConfig } from './ai/orchestrator';
