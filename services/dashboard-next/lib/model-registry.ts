import type {
  ModelMetadata,
  ModelProvider,
  ModelType,
  ModelCapability,
  HuggingFaceModel,
  HuggingFaceSearchParams,
  CivitaiModel,
  CivitaiSearchParams,
  CatalogSearchResult,
  ModelInstallRequest,
  ModelInstallJob,
  LocalModelInventory,
} from "@/types/models";

const HUGGINGFACE_API_BASE = "https://huggingface.co/api";
const CIVITAI_API_BASE = "https://civitai.com/api/v1";

const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
const AGENT_PORT = process.env.WINDOWS_AGENT_PORT || "9765";
const AGENT_TOKEN = process.env.NEBULA_AGENT_TOKEN;

interface WindowsAgentModel {
  name: string;
  filename: string;
  path: string;
  type: string;
  size_bytes: number;
  size_mb: number;
  size_gb: string;
  estimated_vram_gb: number;
  precision: string;
  modified: string;
}

interface WindowsAgentInventory {
  stable_diffusion: {
    checkpoints: WindowsAgentModel[];
    loras: WindowsAgentModel[];
  };
  comfyui: {
    checkpoints: WindowsAgentModel[];
    loras: WindowsAgentModel[];
  };
  ollama: {
    models: Array<{
      name: string;
      type: string;
      size_bytes: number;
      size_gb: string;
      digest?: string;
      details?: Record<string, unknown>;
    }>;
  };
  summary: Record<string, number>;
}

class ModelRegistry {
  private modelCache: Map<string, ModelMetadata> = new Map();
  private catalogCache: Map<string, CatalogSearchResult> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000;
  private agentAvailable: boolean = false;
  private lastAgentCheckTime: number = 0;
  private readonly AGENT_RECHECK_INTERVAL = 5 * 60 * 1000;

  private async fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  private getAgentHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (AGENT_TOKEN) {
      headers["Authorization"] = `Bearer ${AGENT_TOKEN}`;
    }
    return headers;
  }

  async getLocalModels(): Promise<LocalModelInventory> {
    try {
      const now = Date.now();
      
      if (!WINDOWS_VM_IP || !AGENT_PORT) {
        console.warn("[ModelRegistry] Windows VM IP or Agent Port not configured, returning empty inventory");
        return this.getEmptyInventory();
      }

      if (!this.agentAvailable && (now - this.lastAgentCheckTime) < this.AGENT_RECHECK_INTERVAL) {
        console.debug("[ModelRegistry] Windows agent marked as unavailable, skipping check");
        return this.getEmptyInventory();
      }

      const response = await this.fetchWithTimeout(
        `http://${WINDOWS_VM_IP}:${AGENT_PORT}/api/models`,
        { headers: this.getAgentHeaders() },
        8000
      );

      if (!response.ok) {
        throw new Error(`Agent returned ${response.status}`);
      }

      const data: WindowsAgentInventory = await response.json();
      this.agentAvailable = true;
      this.lastAgentCheckTime = now;
      return this.transformAgentInventory(data);
    } catch (error) {
      const now = Date.now();
      this.agentAvailable = false;
      this.lastAgentCheckTime = now;
      
      console.warn(
        "[ModelRegistry] Windows agent unavailable:",
        error instanceof Error ? error.message : String(error)
      );
      console.info("[ModelRegistry] Returning empty inventory - system will continue operating without local models");
      
      return this.getEmptyInventory();
    }
  }

  private transformAgentInventory(data: WindowsAgentInventory): LocalModelInventory {
    const transformModel = (m: WindowsAgentModel, provider: ModelProvider, type: ModelType): ModelMetadata => ({
      id: `${provider}:${m.filename}`,
      name: m.name,
      provider,
      source: "local",
      type,
      capabilities: this.inferCapabilities(type),
      sizeBytes: m.size_bytes,
      sizeFormatted: `${m.size_gb} GB`,
      vramRequirementGB: m.estimated_vram_gb,
      precision: m.precision as ModelMetadata["precision"],
      updatedAt: m.modified,
      installed: true,
    });

    const sdCheckpoints = (data.stable_diffusion?.checkpoints || []).map(m => 
      transformModel(m, "stable-diffusion", "checkpoint")
    );
    const sdLoras = (data.stable_diffusion?.loras || []).map(m => 
      transformModel(m, "stable-diffusion", "lora")
    );
    const comfyCheckpoints = (data.comfyui?.checkpoints || []).map(m => 
      transformModel(m, "comfyui", "checkpoint")
    );
    const comfyLoras = (data.comfyui?.loras || []).map(m => 
      transformModel(m, "comfyui", "lora")
    );
    const ollamaModels = (data.ollama?.models || []).map(m => ({
      id: `ollama:${m.name}`,
      name: m.name,
      provider: "ollama" as ModelProvider,
      source: "local" as const,
      type: "llm" as ModelType,
      capabilities: ["text-generation", "chat"] as ModelCapability[],
      sizeBytes: m.size_bytes,
      sizeFormatted: `${m.size_gb} GB`,
      installed: true,
    }));

    const allModels = [...sdCheckpoints, ...sdLoras, ...comfyCheckpoints, ...comfyLoras, ...ollamaModels];
    const totalSizeBytes = allModels.reduce((sum, m) => sum + (m.sizeBytes || 0), 0);

    return {
      stableDiffusion: {
        checkpoints: sdCheckpoints,
        loras: sdLoras,
        vaes: [],
        embeddings: [],
      },
      comfyui: {
        checkpoints: comfyCheckpoints,
        loras: comfyLoras,
        controlnets: [],
      },
      ollama: ollamaModels,
      summary: {
        totalModels: allModels.length,
        totalSizeGB: Math.round(totalSizeBytes / 1024 / 1024 / 1024 * 100) / 100,
        byProvider: {
          "stable-diffusion": sdCheckpoints.length + sdLoras.length,
          "comfyui": comfyCheckpoints.length + comfyLoras.length,
          "ollama": ollamaModels.length,
        },
        byType: {
          checkpoint: sdCheckpoints.length + comfyCheckpoints.length,
          lora: sdLoras.length + comfyLoras.length,
          llm: ollamaModels.length,
        },
      },
    };
  }

  private getEmptyInventory(): LocalModelInventory {
    return {
      stableDiffusion: { checkpoints: [], loras: [], vaes: [], embeddings: [] },
      comfyui: { checkpoints: [], loras: [], controlnets: [] },
      ollama: [],
      summary: { totalModels: 0, totalSizeGB: 0, byProvider: {}, byType: {} },
    };
  }

  private inferCapabilities(type: ModelType): ModelCapability[] {
    switch (type) {
      case "checkpoint":
        return ["text-to-image", "image-to-image"];
      case "lora":
        return ["text-to-image"];
      case "textual_inversion":
        return ["text-to-image"];
      case "vae":
        return ["text-to-image"];
      case "controlnet":
        return ["image-to-image"];
      case "llm":
        return ["text-generation", "chat"];
      case "embedding":
        return ["embedding"];
      default:
        return [];
    }
  }

  async searchHuggingFace(params: HuggingFaceSearchParams): Promise<CatalogSearchResult> {
    const cacheKey = `hf:${JSON.stringify(params)}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const queryParams = new URLSearchParams();
      if (params.search) queryParams.set("search", params.search);
      if (params.author) queryParams.set("author", params.author);
      if (params.filter) queryParams.set("filter", params.filter);
      if (params.sort) queryParams.set("sort", params.sort);
      if (params.direction) queryParams.set("direction", params.direction === "desc" ? "-1" : "1");
      if (params.limit) queryParams.set("limit", String(params.limit));
      if (params.pipeline_tag) queryParams.set("pipeline_tag", params.pipeline_tag);
      if (params.library) queryParams.set("library", params.library);

      const url = `${HUGGINGFACE_API_BASE}/models?${queryParams.toString()}`;
      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        throw new Error(`HuggingFace API returned ${response.status}`);
      }

      const models: HuggingFaceModel[] = await response.json();
      const result = this.transformHuggingFaceResults(models, params.limit || 20);
      
      this.setCache(cacheKey, result);
      return result;
    } catch (error) {
      console.error("[ModelRegistry] HuggingFace search failed:", error);
      return { models: [], total: 0, page: 1, pageSize: params.limit || 20, hasMore: false, source: "huggingface" };
    }
  }

  private transformHuggingFaceResults(models: HuggingFaceModel[], limit: number): CatalogSearchResult {
    const transformed: ModelMetadata[] = models.map(m => ({
      id: `hf:${m.id}`,
      name: m.id.split("/").pop() || m.id,
      provider: "huggingface",
      source: "catalog",
      type: this.inferHuggingFaceModelType(m),
      capabilities: this.inferHuggingFaceCapabilities(m.pipeline_tag),
      description: m.pipeline_tag || undefined,
      author: m.author,
      tags: m.tags,
      downloads: m.downloads,
      rating: m.likes,
      updatedAt: m.lastModified,
      modelCardUrl: `https://huggingface.co/${m.id}`,
      downloadUrl: `https://huggingface.co/${m.id}/resolve/main`,
      license: m.cardData?.license,
      format: this.inferHuggingFaceFormat(m),
      installed: false,
    }));

    return {
      models: transformed,
      total: models.length,
      page: 1,
      pageSize: limit,
      hasMore: models.length === limit,
      source: "huggingface",
    };
  }

  private inferHuggingFaceModelType(model: HuggingFaceModel): ModelType {
    const tags = model.tags || [];
    const library = model.library_name || "";
    
    if (tags.includes("lora") || model.id.toLowerCase().includes("lora")) return "lora";
    if (tags.includes("textual-inversion")) return "textual_inversion";
    if (library === "diffusers" || tags.includes("diffusers")) return "diffuser";
    if (library === "transformers" && model.pipeline_tag?.includes("text")) return "llm";
    if (tags.includes("gguf") || model.id.toLowerCase().includes("gguf")) return "llm";
    return "checkpoint";
  }

  private inferHuggingFaceCapabilities(pipelineTag?: string): ModelCapability[] {
    if (!pipelineTag) return [];
    const mapping: Record<string, ModelCapability[]> = {
      "text-generation": ["text-generation", "chat"],
      "text-to-image": ["text-to-image"],
      "image-to-image": ["image-to-image"],
      "text2text-generation": ["text-generation"],
      "feature-extraction": ["embedding"],
      "sentence-similarity": ["embedding"],
    };
    return mapping[pipelineTag] || [];
  }

  private inferHuggingFaceFormat(model: HuggingFaceModel): ModelMetadata["format"] {
    const siblings = model.siblings || [];
    for (const file of siblings) {
      const name = file.rfilename.toLowerCase();
      if (name.endsWith(".safetensors")) return "safetensors";
      if (name.endsWith(".gguf")) return "gguf";
      if (name.endsWith(".ckpt")) return "ckpt";
      if (name.endsWith(".bin")) return "bin";
      if (name.endsWith(".pt")) return "pt";
    }
    return undefined;
  }

  async searchCivitai(params: CivitaiSearchParams): Promise<CatalogSearchResult> {
    const cacheKey = `civitai:${JSON.stringify(params)}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const queryParams = new URLSearchParams();
      if (params.query) queryParams.set("query", params.query);
      if (params.tag) queryParams.set("tag", params.tag);
      if (params.username) queryParams.set("username", params.username);
      if (params.types?.length) queryParams.set("types", params.types.join(","));
      if (params.sort) queryParams.set("sort", params.sort);
      if (params.period) queryParams.set("period", params.period);
      if (params.nsfw !== undefined) queryParams.set("nsfw", String(params.nsfw));
      if (params.limit) queryParams.set("limit", String(params.limit));
      if (params.page) queryParams.set("page", String(params.page));
      if (params.baseModels?.length) queryParams.set("baseModels", params.baseModels.join(","));

      const url = `${CIVITAI_API_BASE}/models?${queryParams.toString()}`;
      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        throw new Error(`Civitai API returned ${response.status}`);
      }

      const data = await response.json();
      const result = this.transformCivitaiResults(data.items || [], params.limit || 20, params.page || 1);
      result.hasMore = !!data.metadata?.nextPage;
      
      this.setCache(cacheKey, result);
      return result;
    } catch (error) {
      console.error("[ModelRegistry] Civitai search failed:", error);
      return { models: [], total: 0, page: params.page || 1, pageSize: params.limit || 20, hasMore: false, source: "civitai" };
    }
  }

  private transformCivitaiResults(models: CivitaiModel[], limit: number, page: number): CatalogSearchResult {
    const transformed: ModelMetadata[] = models.map(m => {
      const latestVersion = m.modelVersions?.[0];
      const primaryFile = latestVersion?.files?.find(f => f.primary) || latestVersion?.files?.[0];
      const previewImage = latestVersion?.images?.find(img => img.nsfw === "None") || latestVersion?.images?.[0];

      return {
        id: `civitai:${m.id}`,
        name: m.name,
        provider: "civitai",
        source: "catalog",
        type: this.mapCivitaiType(m.type),
        capabilities: this.inferCivitaiCapabilities(m.type),
        description: m.description?.substring(0, 500),
        author: m.creator?.username,
        tags: m.tags,
        downloads: m.stats?.downloadCount,
        rating: m.stats?.rating,
        ratingCount: m.stats?.ratingCount,
        thumbnailUrl: previewImage?.url,
        modelCardUrl: `https://civitai.com/models/${m.id}`,
        downloadUrl: latestVersion?.downloadUrl || primaryFile?.downloadUrl,
        sizeBytes: primaryFile?.sizeKB ? primaryFile.sizeKB * 1024 : undefined,
        sizeFormatted: primaryFile?.sizeKB ? this.formatBytes(primaryFile.sizeKB * 1024) : undefined,
        format: this.mapCivitaiFormat(primaryFile?.metadata?.format),
        precision: primaryFile?.metadata?.fp as ModelMetadata["precision"],
        baseModel: latestVersion?.baseModel,
        version: latestVersion?.name,
        installed: false,
      };
    });

    return {
      models: transformed,
      total: models.length,
      page,
      pageSize: limit,
      hasMore: models.length === limit,
      source: "civitai",
    };
  }

  private mapCivitaiType(type: CivitaiModel["type"]): ModelType {
    const mapping: Record<string, ModelType> = {
      "Checkpoint": "checkpoint",
      "LoRA": "lora",
      "TextualInversion": "textual_inversion",
      "VAE": "vae",
      "Controlnet": "controlnet",
    };
    return mapping[type] || "checkpoint";
  }

  private mapCivitaiFormat(format?: string): ModelMetadata["format"] {
    if (!format) return undefined;
    if (format === "SafeTensor") return "safetensors";
    if (format === "PickleTensor") return "ckpt";
    return undefined;
  }

  private inferCivitaiCapabilities(type: CivitaiModel["type"]): ModelCapability[] {
    const mapping: Record<string, ModelCapability[]> = {
      "Checkpoint": ["text-to-image", "image-to-image"],
      "LoRA": ["text-to-image"],
      "TextualInversion": ["text-to-image"],
      "VAE": ["text-to-image"],
      "Controlnet": ["image-to-image"],
      "Upscaler": ["upscaling"],
    };
    return mapping[type] || [];
  }

  async installModel(request: ModelInstallRequest): Promise<ModelInstallJob> {
    const downloadId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    const targetTypeMap: Record<string, string> = {
      checkpoint: request.targetPath === "comfy" ? "comfy_checkpoint" : "sd_checkpoint",
      lora: request.targetPath === "comfy" ? "comfy_lora" : "sd_lora",
    };

    try {
      const response = await this.fetchWithTimeout(
        `http://${WINDOWS_VM_IP}:${AGENT_PORT}/api/models/download`,
        {
          method: "POST",
          headers: this.getAgentHeaders(),
          body: JSON.stringify({
            url: request.downloadUrl,
            target_type: targetTypeMap[request.targetType] || request.targetType,
            filename: request.filename,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Agent returned ${response.status}: ${error}`);
      }

      const result = await response.json();
      
      return {
        id: result.download_id || downloadId,
        modelId: request.modelId,
        modelName: request.filename || request.modelId,
        source: request.source,
        status: "pending",
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        speedMbps: 0,
        startedAt: new Date().toISOString(),
        destination: result.destination,
      };
    } catch (error: any) {
      return {
        id: downloadId,
        modelId: request.modelId,
        modelName: request.filename || request.modelId,
        source: request.source,
        status: "failed",
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        speedMbps: 0,
        startedAt: new Date().toISOString(),
        error: error.message,
      };
    }
  }

  async getInstallProgress(downloadId: string): Promise<ModelInstallJob | null> {
    try {
      const response = await this.fetchWithTimeout(
        `http://${WINDOWS_VM_IP}:${AGENT_PORT}/api/models/download/${downloadId}`,
        { headers: this.getAgentHeaders() }
      );

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Agent returned ${response.status}`);
      }

      const data = await response.json();
      
      return {
        id: data.id,
        modelId: data.filename,
        modelName: data.filename,
        source: "civitai",
        status: data.status === "completed" ? "completed" 
             : data.status === "downloading" ? "downloading"
             : data.status === "failed" ? "failed" 
             : "pending",
        progress: data.progress || 0,
        downloadedBytes: data.downloaded_bytes || 0,
        totalBytes: data.total_bytes || 0,
        speedMbps: parseFloat(data.speed_mbps) || 0,
        etaSeconds: data.eta_seconds,
        startedAt: data.started_at,
        completedAt: data.completed_at,
        destination: data.destination,
        error: data.error,
      };
    } catch (error) {
      console.error("[ModelRegistry] Failed to get install progress:", error);
      return null;
    }
  }

  async getActiveDownloads(): Promise<ModelInstallJob[]> {
    try {
      const response = await this.fetchWithTimeout(
        `http://${WINDOWS_VM_IP}:${AGENT_PORT}/api/downloads`,
        { headers: this.getAgentHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Agent returned ${response.status}`);
      }

      const data = await response.json();
      return (data.downloads || []).map((d: any) => ({
        id: d.id,
        modelId: d.filename,
        modelName: d.filename,
        source: "unknown",
        status: d.status,
        progress: d.progress || 0,
        downloadedBytes: 0,
        totalBytes: 0,
        speedMbps: 0,
        startedAt: d.started_at,
      }));
    } catch (error) {
      console.error("[ModelRegistry] Failed to get active downloads:", error);
      return [];
    }
  }

  async deleteLocalModel(modelId: string): Promise<{ success: boolean; message: string }> {
    const [provider, ...rest] = modelId.split(":");
    const filename = rest.join(":");

    if (provider === "ollama") {
      const OLLAMA_URL = process.env.OLLAMA_URL || `http://${WINDOWS_VM_IP}:11434`;
      try {
        const response = await this.fetchWithTimeout(
          `${OLLAMA_URL}/api/delete`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: filename }),
          }
        );
        if (!response.ok) {
          const error = await response.text();
          return { success: false, message: error };
        }
        return { success: true, message: `Deleted ${filename}` };
      } catch (error: any) {
        return { success: false, message: error.message };
      }
    }

    return { success: false, message: "Model deletion not yet supported for this provider" };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  private getFromCache(key: string): CatalogSearchResult | null {
    const expiry = this.cacheExpiry.get(key);
    if (!expiry || Date.now() > expiry) {
      this.catalogCache.delete(key);
      this.cacheExpiry.delete(key);
      return null;
    }
    return this.catalogCache.get(key) || null;
  }

  private setCache(key: string, result: CatalogSearchResult): void {
    this.catalogCache.set(key, result);
    this.cacheExpiry.set(key, Date.now() + this.CACHE_TTL);
  }

  clearCache(): void {
    this.catalogCache.clear();
    this.cacheExpiry.clear();
    this.modelCache.clear();
  }
}

export const modelRegistry = new ModelRegistry();
export type { ModelRegistry };
