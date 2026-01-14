export type ModelProvider = "ollama" | "stable-diffusion" | "comfyui" | "openai" | "huggingface" | "civitai";

export type ModelType = 
  | "checkpoint" 
  | "lora" 
  | "textual_inversion" 
  | "vae" 
  | "controlnet" 
  | "llm"
  | "embedding"
  | "diffuser";

export type ModelCapability = 
  | "text-generation" 
  | "text-to-image" 
  | "image-to-image"
  | "inpainting"
  | "upscaling"
  | "video-generation"
  | "embedding"
  | "chat";

export type ModelFormat = "safetensors" | "ckpt" | "pt" | "pth" | "bin" | "gguf" | "onnx";

export interface ModelMetadata {
  id: string;
  name: string;
  provider: ModelProvider;
  source: "local" | "catalog";
  type: ModelType;
  capabilities: ModelCapability[];
  format?: ModelFormat;
  sizeBytes?: number;
  sizeFormatted?: string;
  vramRequirementGB?: number;
  precision?: "fp32" | "fp16" | "bf16" | "int8" | "int4";
  baseModel?: string;
  version?: string;
  description?: string;
  thumbnailUrl?: string;
  downloadUrl?: string;
  modelCardUrl?: string;
  author?: string;
  license?: string;
  tags?: string[];
  downloads?: number;
  rating?: number;
  ratingCount?: number;
  createdAt?: string;
  updatedAt?: string;
  loaded?: boolean;
  installed?: boolean;
}

export interface HuggingFaceModel {
  _id: string;
  id: string;
  modelId: string;
  author?: string;
  sha?: string;
  lastModified?: string;
  private: boolean;
  disabled?: boolean;
  gated?: boolean | "auto" | "manual";
  pipeline_tag?: string;
  tags?: string[];
  downloads?: number;
  library_name?: string;
  likes?: number;
  cardData?: {
    license?: string;
    tags?: string[];
    datasets?: string[];
  };
  siblings?: Array<{
    rfilename: string;
    size?: number;
  }>;
}

export interface HuggingFaceSearchParams {
  search?: string;
  author?: string;
  filter?: string;
  sort?: "downloads" | "likes" | "lastModified" | "trending";
  direction?: "asc" | "desc";
  limit?: number;
  pipeline_tag?: string;
  library?: string;
}

export interface CivitaiModel {
  id: number;
  name: string;
  description?: string;
  type: "Checkpoint" | "LoRA" | "TextualInversion" | "VAE" | "Controlnet" | "Upscaler" | "Poses" | "Wildcards" | "Workflows" | "Other";
  nsfw: boolean;
  allowNoCredit: boolean;
  allowCommercialUse: "None" | "Image" | "Rent" | "Sell";
  allowDerivatives: boolean;
  allowDifferentLicense: boolean;
  stats: {
    downloadCount: number;
    favoriteCount: number;
    thumbsUpCount: number;
    thumbsDownCount: number;
    commentCount: number;
    ratingCount: number;
    rating: number;
  };
  creator: {
    username: string;
    image?: string;
  };
  tags: string[];
  modelVersions: CivitaiModelVersion[];
}

export interface CivitaiModelVersion {
  id: number;
  modelId: number;
  name: string;
  createdAt: string;
  updatedAt?: string;
  trainedWords?: string[];
  baseModel?: string;
  baseModelType?: string;
  earlyAccessTimeFrame?: number;
  description?: string;
  stats: {
    downloadCount: number;
    ratingCount: number;
    rating: number;
  };
  files: CivitaiFile[];
  images: CivitaiImage[];
  downloadUrl: string;
}

export interface CivitaiFile {
  id: number;
  sizeKB: number;
  name: string;
  type: "Model" | "Pruned Model" | "Training Data" | "Config" | "VAE";
  metadata?: {
    fp?: "fp16" | "fp32";
    size?: "full" | "pruned";
    format?: "SafeTensor" | "PickleTensor" | "Other";
  };
  pickleScanResult?: "Success" | "Pending" | "Error";
  pickleScanMessage?: string;
  virusScanResult?: "Success" | "Pending" | "Error";
  virusScanMessage?: string;
  scannedAt?: string;
  hashes?: {
    AutoV1?: string;
    AutoV2?: string;
    SHA256?: string;
    CRC32?: string;
    BLAKE3?: string;
  };
  downloadUrl?: string;
  primary?: boolean;
}

export interface CivitaiImage {
  id: number;
  url: string;
  nsfw: "None" | "Soft" | "Mature" | "X";
  width: number;
  height: number;
  hash: string;
  meta?: Record<string, unknown>;
}

export interface CivitaiSearchParams {
  query?: string;
  tag?: string;
  username?: string;
  types?: ("Checkpoint" | "LoRA" | "TextualInversion" | "VAE" | "Controlnet" | "Upscaler")[];
  sort?: "Highest Rated" | "Most Downloaded" | "Newest";
  period?: "AllTime" | "Year" | "Month" | "Week" | "Day";
  nsfw?: boolean;
  limit?: number;
  page?: number;
  baseModels?: string[];
}

export interface CatalogSearchResult {
  models: ModelMetadata[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  source: "huggingface" | "civitai";
}

export interface ModelInstallRequest {
  modelId: string;
  source: "huggingface" | "civitai";
  downloadUrl: string;
  targetType: "checkpoint" | "lora" | "textual_inversion" | "vae" | "controlnet";
  filename?: string;
  targetPath?: "sd" | "comfy";
}

export interface ModelInstallJob {
  id: string;
  modelId: string;
  modelName: string;
  source: "huggingface" | "civitai";
  status: "pending" | "downloading" | "completed" | "failed";
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  speedMbps: number;
  etaSeconds?: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
  destination?: string;
}

export interface LocalModelInventory {
  stableDiffusion: {
    checkpoints: ModelMetadata[];
    loras: ModelMetadata[];
    vaes: ModelMetadata[];
    embeddings: ModelMetadata[];
  };
  comfyui: {
    checkpoints: ModelMetadata[];
    loras: ModelMetadata[];
    controlnets: ModelMetadata[];
  };
  ollama: ModelMetadata[];
  summary: {
    totalModels: number;
    totalSizeGB: number;
    byProvider: Record<string, number>;
    byType: Record<string, number>;
  };
}
