/**
 * AI Service Abstraction Layer
 * 
 * Defines interfaces for AI services including language models, vision,
 * embeddings, and generative AI capabilities. Designed to abstract over
 * multiple providers (OpenAI, Anthropic, local models, etc.) and enable
 * future integration with game engines and real-time AI systems.
 * 
 * Future use cases:
 * - Real-time NPC dialogue in games
 * - AI-driven procedural content generation
 * - AR/VR intelligent assistants
 * - Simulation AI controllers
 * 
 * @module core/interfaces/ai-service
 */

import type { IService, ServiceType } from './service';

/**
 * Message in a chat conversation.
 */
export interface ChatMessage {
  /** Role of the message sender */
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  /** Text content of the message */
  content: string;
  /** Optional name for function/tool messages */
  name?: string;
  /** Optional tool call information */
  toolCalls?: ToolCall[];
  /** Optional function call result */
  functionCallResult?: unknown;
}

/**
 * Tool/function call made by the AI.
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Request for chat completion.
 */
export interface ChatRequest {
  /** Conversation messages */
  messages: ChatMessage[];
  /** Model to use (provider-specific) */
  model?: string;
  /** Sampling temperature (0-2) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Enable streaming response */
  stream?: boolean;
  /** Stop sequences */
  stop?: string[];
  /** Presence penalty (-2 to 2) */
  presencePenalty?: number;
  /** Frequency penalty (-2 to 2) */
  frequencyPenalty?: number;
  /** Available tools/functions */
  tools?: ToolDefinition[];
  /** Response format constraint */
  responseFormat?: ResponseFormat;
  /** Request metadata for tracking */
  metadata?: Record<string, unknown>;
}

/**
 * Tool/function definition for AI function calling.
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Response format specification.
 */
export interface ResponseFormat {
  type: 'text' | 'json_object' | 'json_schema';
  schema?: Record<string, unknown>;
}

/**
 * Response from chat completion.
 */
export interface ChatResponse {
  /** Generated content */
  content: string;
  /** Provider that generated the response */
  provider: string;
  /** Model used */
  model: string;
  /** Response latency in milliseconds */
  latency: number;
  /** Total tokens used */
  tokensUsed: number;
  /** Detailed token usage */
  usage?: TokenUsage;
  /** Tool calls if any */
  toolCalls?: ToolCall[];
  /** Finish reason */
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
}

/**
 * Token usage breakdown.
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Streaming chunk from chat completion.
 */
export interface StreamChunk {
  /** Partial content */
  content: string;
  /** Is this the final chunk */
  done: boolean;
  /** Provider (included in final chunk) */
  provider?: string;
  /** Model (included in final chunk) */
  model?: string;
  /** Delta tool calls */
  toolCallDelta?: Partial<ToolCall>;
  /** Finish reason (in final chunk) */
  finishReason?: string;
}

/**
 * Request for text embeddings.
 */
export interface EmbeddingRequest {
  /** Text(s) to embed */
  input: string | string[];
  /** Model to use */
  model?: string;
  /** Embedding dimensions (if model supports it) */
  dimensions?: number;
}

/**
 * Response from embedding generation.
 */
export interface EmbeddingResponse {
  /** Generated embeddings (one per input) */
  embeddings: number[][];
  /** Provider used */
  provider: string;
  /** Model used */
  model: string;
  /** Response latency in milliseconds */
  latency: number;
  /** Token usage */
  tokensUsed?: number;
}

/**
 * Request for image generation.
 * Extensible for various image generation models (DALL-E, Stable Diffusion, Midjourney, etc.)
 */
export interface ImageRequest {
  /** Text prompt describing the image */
  prompt: string;
  /** Negative prompt (what to avoid) */
  negativePrompt?: string;
  /** Image width in pixels */
  width?: number;
  /** Image height in pixels */
  height?: number;
  /** Number of images to generate */
  count?: number;
  /** Generation style/quality preset */
  style?: string;
  /** Seed for reproducibility */
  seed?: number;
  /** Model-specific parameters */
  parameters?: Record<string, unknown>;
}

/**
 * Response from image generation.
 */
export interface ImageResponse {
  /** Generated image URLs or base64 data */
  images: ImageOutput[];
  /** Provider used */
  provider: string;
  /** Model used */
  model: string;
  /** Generation latency in milliseconds */
  latency: number;
  /** Seed used (for reproducibility) */
  seed?: number;
}

/**
 * Individual generated image output.
 */
export interface ImageOutput {
  /** URL to the generated image */
  url?: string;
  /** Base64-encoded image data */
  base64?: string;
  /** Image format */
  format: 'png' | 'jpg' | 'webp';
  /** Revised prompt (if model modified it) */
  revisedPrompt?: string;
}

/**
 * Request for video generation.
 * Future use: AI-generated game cinematics, AR experiences, etc.
 */
export interface VideoRequest {
  /** Text prompt describing the video */
  prompt: string;
  /** Duration in seconds */
  duration?: number;
  /** Frames per second */
  fps?: number;
  /** Video width */
  width?: number;
  /** Video height */
  height?: number;
  /** Reference image for video generation */
  referenceImage?: string;
  /** Model-specific parameters */
  parameters?: Record<string, unknown>;
}

/**
 * Response from video generation.
 */
export interface VideoResponse {
  /** URL to the generated video */
  url: string;
  /** Video duration in seconds */
  duration: number;
  /** Video format */
  format: 'mp4' | 'webm';
  /** Thumbnail URL */
  thumbnailUrl?: string;
  /** Generation latency in milliseconds */
  latency: number;
}

/**
 * Request for 3D model generation.
 * Future use: Procedural game assets, AR object placement, etc.
 */
export interface Model3DRequest {
  /** Text prompt describing the 3D model */
  prompt: string;
  /** Reference images for the model */
  referenceImages?: string[];
  /** Output format */
  format?: '3d-model-glb' | '3d-model-obj' | '3d-model-fbx' | '3d-model-usdz';
  /** Include textures */
  withTextures?: boolean;
  /** Include rigging for animation */
  withRigging?: boolean;
  /** Level of detail */
  lod?: 'low' | 'medium' | 'high';
  /** Model-specific parameters */
  parameters?: Record<string, unknown>;
}

/**
 * Response from 3D model generation.
 */
export interface Model3DResponse {
  /** URL to the generated 3D model */
  modelUrl: string;
  /** Model format */
  format: string;
  /** Texture URLs if separate */
  textureUrls?: string[];
  /** Polygon count */
  polyCount?: number;
  /** Preview image URL */
  previewUrl?: string;
  /** Generation latency in milliseconds */
  latency: number;
}

/**
 * AI Service interface.
 * Implement this to create an AI provider that can be used by the orchestrator.
 * 
 * @example
 * // Implementing a game-optimized AI service
 * class GameAIService implements IAIService {
 *   readonly type: ServiceType = 'ai';
 *   
 *   async chat(request: ChatRequest) {
 *     // Optimized for low-latency NPC dialogue
 *   }
 * }
 */
export interface IAIService extends IService {
  /** Service type is always 'ai' */
  readonly type: 'ai';
  
  /**
   * Generate a chat completion.
   * Primary method for conversational AI.
   */
  chat(request: ChatRequest): Promise<ChatResponse>;
  
  /**
   * Generate a streaming chat completion.
   * Essential for real-time AI interactions in games/XR.
   */
  chatStream(request: ChatRequest): AsyncIterable<StreamChunk>;
  
  /**
   * Generate text embeddings.
   * Used for semantic search, RAG, similarity matching.
   */
  generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  
  /**
   * Generate images from text prompts.
   * Optional: Not all AI services support image generation.
   */
  generateImage?(request: ImageRequest): Promise<ImageResponse>;
  
  /**
   * Generate videos from text prompts.
   * Optional: For future video generation capabilities.
   */
  generateVideo?(request: VideoRequest): Promise<VideoResponse>;
  
  /**
   * Generate 3D models from text prompts.
   * Optional: For future 3D asset generation (game assets, AR objects).
   */
  generate3D?(request: Model3DRequest): Promise<Model3DResponse>;
  
  /**
   * Get available models for this service.
   */
  getModels?(): Promise<ModelInfo[]>;
  
  /**
   * Estimate cost for a request before execution.
   * Useful for budget-aware applications.
   */
  estimateCost?(request: ChatRequest | ImageRequest): Promise<CostEstimate>;
}

/**
 * Information about an available AI model.
 */
export interface ModelInfo {
  /** Model identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Model provider */
  provider: string;
  /** Maximum context length in tokens */
  contextLength: number;
  /** Supported capabilities */
  capabilities: ('chat' | 'embeddings' | 'images' | 'video' | '3d')[];
  /** Cost per 1M tokens (input) */
  inputCostPer1M?: number;
  /** Cost per 1M tokens (output) */
  outputCostPer1M?: number;
}

/**
 * Cost estimate for an AI operation.
 */
export interface CostEstimate {
  /** Estimated cost in USD */
  estimatedCost: number;
  /** Estimated token usage */
  estimatedTokens?: number;
  /** Confidence level of estimate */
  confidence: 'low' | 'medium' | 'high';
}

/**
 * AI Service factory configuration.
 */
export interface AIServiceConfig {
  /** Provider type */
  provider: string;
  /** API key or authentication */
  apiKey?: string;
  /** Base URL for API */
  baseUrl?: string;
  /** Default model to use */
  defaultModel?: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Maximum retries */
  maxRetries?: number;
  /** Custom headers */
  headers?: Record<string, string>;
}
