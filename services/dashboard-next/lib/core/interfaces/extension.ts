/**
 * Extension System Abstraction Layer
 * 
 * Defines interfaces for the extension/plugin system that enables integration
 * with external engines, runtimes, and services. Designed for a modular
 * architecture where capabilities can be added at runtime.
 * 
 * Future use cases:
 * - Game engine integrations (Unity, Unreal, Godot)
 * - AR/VR runtime plugins (ARKit, ARCore, WebXR, Meta Quest)
 * - Rendering backend plugins (Blender, Houdini, custom GPU pipelines)
 * - Simulation engine integrations (physics, particles, AI)
 * - Content pipeline extensions (custom asset processors)
 * - AI provider plugins (custom model integrations)
 * 
 * @module core/interfaces/extension
 */

import type { IService, IServiceRegistry, ServiceType, ServiceCapability } from './service';
import type { IPipeline, PipelineStage } from './pipeline';

/**
 * Categories of extensions.
 * Extensible for new extension types as the system grows.
 */
export type ExtensionType = 
  | 'game-engine'        // Unity, Unreal, Godot, custom engines
  | 'ar-vr-runtime'      // ARKit, ARCore, WebXR, OpenXR, Quest
  | 'rendering-backend'  // Blender, Houdini, custom renderers
  | 'simulation-engine'  // Physics, particles, AI simulation
  | 'content-pipeline'   // Asset processors, converters
  | 'ai-provider'        // LLM providers, image/video generators
  | 'storage-backend'    // Custom storage providers
  | 'streaming-backend'  // Live streaming, WebRTC, HLS
  | 'audio-engine'       // Audio synthesis, spatial audio
  | 'analytics'          // Telemetry, metrics, logging
  | 'auth-provider';     // Authentication providers

/**
 * Extension lifecycle state.
 */
export type ExtensionState = 
  | 'unloaded'      // Extension not loaded
  | 'loading'       // Extension is loading
  | 'loaded'        // Extension loaded but not initialized
  | 'initializing'  // Extension is initializing
  | 'active'        // Extension is active and running
  | 'error'         // Extension encountered an error
  | 'disabled';     // Extension explicitly disabled

/**
 * Extension metadata for discovery and compatibility checking.
 */
export interface ExtensionMetadata {
  /** Extension unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Extension description */
  description?: string;
  /** Semantic version */
  version: string;
  /** Extension author */
  author?: string;
  /** Homepage or documentation URL */
  homepage?: string;
  /** Repository URL */
  repository?: string;
  /** License */
  license?: string;
  /** Keywords for discovery */
  keywords?: string[];
  /** Icon URL */
  icon?: string;
  /** Extension type */
  type: ExtensionType;
  /** Required system version */
  requiredSystemVersion?: string;
  /** Platform compatibility */
  platforms?: ('windows' | 'macos' | 'linux' | 'web' | 'mobile')[];
}

/**
 * Extension configuration schema.
 */
export interface ExtensionConfigSchema {
  /** Configuration properties */
  properties: Record<string, ConfigProperty>;
  /** Required properties */
  required?: string[];
}

/**
 * Individual configuration property definition.
 */
export interface ConfigProperty {
  /** Property type */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  /** Property description */
  description?: string;
  /** Default value */
  default?: unknown;
  /** Enum values for string type */
  enum?: string[];
  /** Minimum value for number type */
  minimum?: number;
  /** Maximum value for number type */
  maximum?: number;
  /** Is this property a secret */
  secret?: boolean;
}

/**
 * Extension interface.
 * Implement this to create extensions that can be loaded into the system.
 * 
 * @example
 * // Unity game engine extension
 * class UnityExtension implements IExtension {
 *   readonly id = 'unity-engine';
 *   readonly name = 'Unity Game Engine';
 *   readonly version = '1.0.0';
 *   readonly type: ExtensionType = 'game-engine';
 *   readonly dependencies = ['rendering-core'];
 *   
 *   async register(registry: IServiceRegistry) {
 *     registry.register(new UnityRenderingService());
 *     registry.register(new UnityAssetImporter());
 *   }
 * }
 */
export interface IExtension {
  /** Unique extension identifier */
  readonly id: string;
  /** Human-readable extension name */
  readonly name: string;
  /** Semantic version */
  readonly version: string;
  /** Extension type for categorization */
  readonly type: ExtensionType;
  /** Dependencies on other extensions (by ID) */
  readonly dependencies?: string[];
  /** Extension metadata */
  readonly metadata?: ExtensionMetadata;
  
  /**
   * Register services and capabilities with the system.
   * Called when the extension is activated.
   * @param registry Service registry to register with
   */
  register(registry: IServiceRegistry): Promise<void>;
  
  /**
   * Unregister services and clean up resources.
   * Called when the extension is deactivated.
   * @param registry Service registry to unregister from
   */
  unregister(registry: IServiceRegistry): Promise<void>;
  
  /**
   * Get the configuration schema for this extension.
   * Optional: Implement if the extension is configurable.
   */
  getConfigSchema?(): ExtensionConfigSchema;
  
  /**
   * Configure the extension with user settings.
   * @param config User-provided configuration
   */
  configure?(config: Record<string, unknown>): Promise<void>;
  
  /**
   * Get current extension state.
   */
  getState?(): ExtensionState;
  
  /**
   * Health check for the extension.
   */
  healthCheck?(): Promise<ExtensionHealth>;
  
  /**
   * Get capabilities provided by this extension.
   */
  getCapabilities?(): ServiceCapability[];
}

/**
 * Extension health information.
 */
export interface ExtensionHealth {
  /** Current state */
  state: ExtensionState;
  /** Health status */
  healthy: boolean;
  /** Error message if unhealthy */
  error?: string;
  /** Services registered by this extension */
  services: string[];
  /** Last activity timestamp */
  lastActivity?: Date;
  /** Resource usage */
  resourceUsage?: {
    memoryBytes?: number;
    cpuPercent?: number;
  };
}

/**
 * Extension registry for managing installed extensions.
 */
export interface IExtensionRegistry {
  /**
   * Install an extension.
   * Downloads and registers the extension but does not activate it.
   */
  install(extensionOrUrl: IExtension | string): Promise<void>;
  
  /**
   * Uninstall an extension.
   * Deactivates and removes the extension.
   */
  uninstall(extensionId: string): Promise<void>;
  
  /**
   * Activate an installed extension.
   */
  activate(extensionId: string): Promise<void>;
  
  /**
   * Deactivate an active extension.
   */
  deactivate(extensionId: string): Promise<void>;
  
  /**
   * Get an extension by ID.
   */
  get(extensionId: string): IExtension | undefined;
  
  /**
   * Get all extensions of a specific type.
   */
  getByType(type: ExtensionType): IExtension[];
  
  /**
   * Get all installed extensions.
   */
  getAll(): IExtension[];
  
  /**
   * Get all active extensions.
   */
  getActive(): IExtension[];
  
  /**
   * Check if an extension is installed.
   */
  isInstalled(extensionId: string): boolean;
  
  /**
   * Check if an extension is active.
   */
  isActive(extensionId: string): boolean;
  
  /**
   * Search for available extensions.
   */
  search?(query: string): Promise<ExtensionMetadata[]>;
  
  /**
   * Get extension health status.
   */
  getHealth(extensionId: string): Promise<ExtensionHealth | undefined>;
}

/**
 * Extension point for pipeline stage contributions.
 * Allows extensions to contribute stages to pipelines.
 */
export interface IPipelineExtensionPoint {
  /**
   * Register a pipeline stage that can be used in pipelines.
   */
  registerStage<TIn, TOut>(stage: PipelineStage<TIn, TOut>): void;
  
  /**
   * Get all registered stages.
   */
  getStages(): PipelineStage<unknown, unknown>[];
  
  /**
   * Get stages by type.
   */
  getStagesByType(type: string): PipelineStage<unknown, unknown>[];
  
  /**
   * Register a complete pipeline.
   */
  registerPipeline<TIn, TOut>(pipeline: IPipeline<TIn, TOut>): void;
  
  /**
   * Get all registered pipelines.
   */
  getPipelines(): IPipeline<unknown, unknown>[];
}

/**
 * Extension point for service contributions.
 * Allows extensions to contribute services.
 */
export interface IServiceExtensionPoint {
  /**
   * Register a service.
   */
  registerService(service: IService): void;
  
  /**
   * Get all registered services.
   */
  getServices(): IService[];
  
  /**
   * Get services by type.
   */
  getServicesByType(type: ServiceType): IService[];
}

/**
 * Extension event types.
 */
export type ExtensionEventType = 
  | 'installed'
  | 'uninstalled'
  | 'activated'
  | 'deactivated'
  | 'configured'
  | 'error';

/**
 * Extension event data.
 */
export interface ExtensionEvent {
  /** Event type */
  type: ExtensionEventType;
  /** Extension ID */
  extensionId: string;
  /** Event timestamp */
  timestamp: Date;
  /** Additional event data */
  data?: Record<string, unknown>;
  /** Error information if type is 'error' */
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
}

/**
 * Extension event listener.
 */
export interface IExtensionEventListener {
  /**
   * Handle extension event.
   */
  onExtensionEvent(event: ExtensionEvent): void;
}

/**
 * Game engine extension interface.
 * Specialized interface for game engine integrations.
 */
export interface IGameEngineExtension extends IExtension {
  readonly type: 'game-engine';
  
  /** Engine name (Unity, Unreal, Godot, etc.) */
  readonly engineName: string;
  /** Engine version */
  readonly engineVersion: string;
  
  /**
   * Connect to the game engine.
   */
  connect(connectionConfig: GameEngineConnectionConfig): Promise<void>;
  
  /**
   * Disconnect from the game engine.
   */
  disconnect(): Promise<void>;
  
  /**
   * Execute a command in the game engine.
   */
  executeCommand?(command: string, args?: unknown): Promise<unknown>;
  
  /**
   * Get supported asset formats.
   */
  getSupportedAssetFormats(): string[];
}

/**
 * Game engine connection configuration.
 */
export interface GameEngineConnectionConfig {
  /** Host address */
  host: string;
  /** Port number */
  port: number;
  /** Authentication token */
  authToken?: string;
  /** Connection timeout in milliseconds */
  timeoutMs?: number;
  /** Enable TLS */
  tls?: boolean;
}

/**
 * AR/VR runtime extension interface.
 * Specialized interface for AR/VR integrations.
 */
export interface IXRExtension extends IExtension {
  readonly type: 'ar-vr-runtime';
  
  /** XR runtime type */
  readonly runtimeType: 'arkit' | 'arcore' | 'webxr' | 'openxr' | 'quest' | 'visionos';
  
  /**
   * Get supported XR features.
   */
  getSupportedFeatures(): XRFeature[];
  
  /**
   * Start XR session.
   */
  startSession?(sessionConfig: XRSessionConfig): Promise<void>;
  
  /**
   * End XR session.
   */
  endSession?(): Promise<void>;
}

/**
 * XR feature types.
 */
export type XRFeature = 
  | 'hand-tracking'
  | 'eye-tracking'
  | 'plane-detection'
  | 'image-tracking'
  | 'face-tracking'
  | 'body-tracking'
  | 'spatial-anchors'
  | 'passthrough'
  | 'depth-sensing';

/**
 * XR session configuration.
 */
export interface XRSessionConfig {
  /** Session mode */
  mode: 'immersive-vr' | 'immersive-ar' | 'inline';
  /** Required features */
  requiredFeatures?: XRFeature[];
  /** Optional features */
  optionalFeatures?: XRFeature[];
}
