export type AIProviderName = 'ollama' | 'openai' | 'stable-diffusion' | 'comfyui';

export interface AIProviderCapabilities {
  chat: boolean;
  streaming: boolean;
  images: boolean;
  embeddings: boolean;
}

export interface AIProvider {
  name: AIProviderName;
  baseURL: string;
  available: boolean;
  priority: number;
  supports: AIProviderCapabilities;
}

export interface ProviderHealthStatus {
  available: boolean;
  lastCheck: Date;
  consecutiveFailures: number;
  latencyMs?: number;
  error?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatResponse {
  content: string;
  provider: AIProviderName;
  model: string;
  latency: number;
  tokensUsed: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface StreamingChunk {
  content: string;
  done: boolean;
  provider?: AIProviderName;
  model?: string;
}

export interface EmbeddingRequest {
  input: string | string[];
  model?: string;
}

export interface EmbeddingResponse {
  embeddings: number[][];
  provider: AIProviderName;
  model: string;
  latency: number;
}

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  sampler?: string;
}

export interface ImageGenerationResponse {
  images: string[];
  provider: AIProviderName;
  latency: number;
  seed?: number;
}

export interface OrchestratorMetadata {
  provider: string;
  latency: number;
  tokensUsed: number;
  fallbackUsed?: boolean;
  retryCount?: number;
  cost?: number;
  localOnlyMode?: boolean;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 4000,
  backoffMultiplier: 2,
};
