/**
 * AI Orchestrator - Unified interface for multiple AI providers
 * Supports OpenAI, Ollama (local), Replicate (video), and future providers
 */
import OpenAI from "openai";
import Replicate from "replicate";
import { readFileSync, existsSync } from "fs";

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
  private static readonly STATE_CACHE_TTL = 30000;
  private static readonly STATE_FILE_PATH = process.env.LOCAL_AI_STATE_FILE || "/opt/homelab/HomeLabHub/deploy/shared/state/local-ai.json";

  constructor() {
    const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
    this.ollamaUrl = process.env.OLLAMA_URL || `http://${WINDOWS_VM_IP}:11434`;
    this.comfyuiUrl = process.env.COMFYUI_URL || `http://${WINDOWS_VM_IP}:8188`;
    this.stableDiffusionUrl = process.env.STABLE_DIFFUSION_URL || `http://${WINDOWS_VM_IP}:7860`;
    this.initOpenAI();
    this.initReplicate();
    this.loadLocalAIState();
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
    const provider = request.provider || "auto";

    // Auto mode: try local SD first if available, fall back to DALL-E
    if (provider === "auto") {
      const sdAvailable = await this.checkStableDiffusion();
      if (sdAvailable) {
        console.log("[AI Orchestrator] Auto: Using local Stable Diffusion (GPU)");
        try {
          return await this.generateWithSD(request);
        } catch (err) {
          console.log(`[AI Orchestrator] SD failed, falling back to DALL-E: ${err instanceof Error ? err.message : err}`);
          if (this.hasOpenAI()) {
            return this.generateWithDALLE(request);
          }
          throw err;
        }
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

    // OpenAI/DALL-E
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
}

export const aiOrchestrator = new AIOrchestrator();
