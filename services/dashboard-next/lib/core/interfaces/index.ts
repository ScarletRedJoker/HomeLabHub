/**
 * Core Service Interfaces
 * 
 * This module exports all core interface definitions for the service abstraction layer.
 * These interfaces enable extensibility toward game engines, AR/VR runtimes,
 * simulation systems, and other compute-intensive backends.
 * 
 * @module core/interfaces
 * 
 * @example
 * // Import specific interfaces
 * import { IService, IAIService, IRenderingService } from '@/lib/core/interfaces';
 * 
 * // Implement a custom AI service
 * class MyAIService implements IAIService {
 *   // ...
 * }
 */

// Base service abstractions
export type {
  ServiceCapability,
  ServiceHealth,
  ResourceMetrics,
  ServiceType,
  ServiceConfig,
  IService,
  IServiceRegistry,
  IServiceFactory,
} from './service';

// AI service abstractions
export type {
  ChatMessage,
  ToolCall,
  ChatRequest,
  ToolDefinition,
  ResponseFormat,
  ChatResponse,
  TokenUsage,
  StreamChunk,
  EmbeddingRequest,
  EmbeddingResponse,
  ImageRequest,
  ImageResponse,
  ImageOutput,
  VideoRequest,
  VideoResponse,
  Model3DRequest,
  Model3DResponse,
  IAIService,
  ModelInfo,
  CostEstimate,
  AIServiceConfig,
} from './ai-service';

// Rendering service abstractions
export type {
  Vector3,
  Quaternion,
  Matrix4x4,
  Transform,
  Material,
  Geometry,
  SceneObject,
  CameraConfig,
  DepthOfFieldConfig,
  MotionBlurConfig,
  LightType,
  Light,
  LightingConfig,
  EnvironmentConfig,
  FogConfig,
  RenderScene,
  PostProcessingConfig,
  RenderOptions,
  RenderResult,
  RenderPass,
  RenderStats,
  RenderFrame,
  GPUStats,
  IRenderingService,
  RenderingFeatures,
} from './rendering-service';

// Pipeline abstractions
export type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  PipelineContext,
  ExecutionEnvironment,
  PipelineResult,
  PipelineError,
  PipelineMetadata,
  ResourceUsage,
  StageResult,
  PipelineProgress,
  PipelineStage,
  RetryConfig,
  IPipeline,
  PipelineEstimate,
  IPipelineBuilder,
  IPipelineRegistry,
  StageType,
} from './pipeline';

// Extension system abstractions
export type {
  ExtensionType,
  ExtensionState,
  ExtensionMetadata,
  ExtensionConfigSchema,
  ConfigProperty,
  IExtension,
  ExtensionHealth,
  IExtensionRegistry,
  IPipelineExtensionPoint,
  IServiceExtensionPoint,
  ExtensionEventType,
  ExtensionEvent,
  IExtensionEventListener,
  IGameEngineExtension,
  GameEngineConnectionConfig,
  IXRExtension,
  XRFeature,
  XRSessionConfig,
} from './extension';
