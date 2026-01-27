/**
 * Core Service Abstraction Layer
 * 
 * This module defines the foundational interfaces for all services in the system.
 * Designed for extensibility toward game engines, AR/VR runtimes, simulation systems,
 * and other compute-intensive backends.
 * 
 * @module core/interfaces/service
 */

/**
 * Represents a capability that a service can provide.
 * Used for service discovery and compatibility checking.
 * 
 * @example
 * // Game engine capability
 * const unityCapability: ServiceCapability = {
 *   name: 'realtime-rendering',
 *   version: '2023.3',
 *   features: ['ray-tracing', 'physics', 'audio-3d']
 * };
 */
export interface ServiceCapability {
  /** Unique name identifying the capability */
  name: string;
  /** Semantic version of the capability */
  version: string;
  /** List of specific features within this capability */
  features: string[];
  /** Optional metadata for extended capability information */
  metadata?: Record<string, unknown>;
}

/**
 * Health status of a service, used for monitoring and load balancing.
 * 
 * @example
 * // Healthy GPU rendering service
 * const health: ServiceHealth = {
 *   status: 'healthy',
 *   latency: 12,
 *   lastCheck: new Date(),
 *   details: { gpuUtilization: 0.45, vramUsed: '8GB' }
 * };
 */
export interface ServiceHealth {
  /** Current operational status */
  status: 'healthy' | 'degraded' | 'offline';
  /** Response latency in milliseconds */
  latency?: number;
  /** Timestamp of the last health check */
  lastCheck: Date;
  /** Additional service-specific health details */
  details?: Record<string, unknown>;
  /** Error message if service is degraded or offline */
  error?: string;
  /** Resource utilization metrics */
  resources?: ResourceMetrics;
}

/**
 * Resource utilization metrics for capacity planning and autoscaling.
 * Extensible for GPU clusters, distributed systems, and edge computing.
 */
export interface ResourceMetrics {
  /** CPU utilization percentage (0-100) */
  cpuPercent?: number;
  /** Memory utilization percentage (0-100) */
  memoryPercent?: number;
  /** GPU utilization percentage (0-100) - critical for rendering/AI services */
  gpuPercent?: number;
  /** GPU memory used in bytes */
  gpuMemoryUsed?: number;
  /** Network bandwidth utilization */
  networkBandwidth?: number;
  /** Active connections or sessions */
  activeConnections?: number;
  /** Queue depth for async operations */
  queueDepth?: number;
}

/**
 * Categories of services in the system.
 * Extensible for future service types like physics, audio, networking, etc.
 */
export type ServiceType = 
  | 'ai'           // Language models, vision, embeddings
  | 'rendering'    // 2D/3D graphics, ray tracing, rasterization
  | 'storage'      // Object storage, databases, caching
  | 'compute'      // General purpose compute, batch processing
  | 'streaming'    // Real-time data streaming, video, audio
  | 'simulation'   // Physics, particles, procedural generation
  | 'xr'           // AR/VR runtime services
  | 'audio'        // Audio processing, synthesis, spatial audio
  | 'networking';  // Multiplayer, real-time sync, WebRTC

/**
 * Configuration options for service initialization.
 * Override for service-specific configuration needs.
 */
export interface ServiceConfig {
  /** Unique identifier for this service instance */
  id?: string;
  /** Human-readable name */
  name?: string;
  /** Connection timeout in milliseconds */
  timeoutMs?: number;
  /** Maximum retry attempts for failed operations */
  maxRetries?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Service-specific configuration */
  options?: Record<string, unknown>;
}

/**
 * Base interface for all services in the system.
 * Implement this interface to create services that can be discovered,
 * monitored, and orchestrated by the service registry.
 * 
 * @example
 * // Implementing a Unity rendering service
 * class UnityRenderingService implements IService {
 *   readonly id = 'unity-renderer-01';
 *   readonly name = 'Unity HDRP Renderer';
 *   readonly type: ServiceType = 'rendering';
 *   
 *   async initialize() {
 *     // Connect to Unity Editor or runtime
 *   }
 * }
 */
export interface IService {
  /** Unique identifier for this service instance */
  readonly id: string;
  /** Human-readable service name */
  readonly name: string;
  /** Service category */
  readonly type: ServiceType;
  
  /**
   * Get the capabilities this service provides.
   * Used for service discovery and feature negotiation.
   */
  getCapabilities(): ServiceCapability[];
  
  /**
   * Check the current health status of the service.
   * Should complete within reasonable timeout (e.g., 5 seconds).
   */
  getHealth(): Promise<ServiceHealth>;
  
  /**
   * Initialize the service and establish connections.
   * Called once before the service is used.
   */
  initialize(): Promise<void>;
  
  /**
   * Gracefully shutdown the service.
   * Should clean up resources and close connections.
   */
  shutdown(): Promise<void>;
  
  /**
   * Optional: Reconnect to the service after connection loss.
   */
  reconnect?(): Promise<void>;
  
  /**
   * Optional: Get current configuration.
   */
  getConfig?(): ServiceConfig;
}

/**
 * Service registry for managing service instances.
 * Provides service discovery, load balancing, and health monitoring.
 * 
 * Future use cases:
 * - Distributed game server orchestration
 * - Multi-GPU rendering farm management
 * - Edge computing node discovery
 */
export interface IServiceRegistry {
  /**
   * Register a service with the registry.
   */
  register(service: IService): Promise<void>;
  
  /**
   * Unregister a service from the registry.
   */
  unregister(serviceId: string): Promise<void>;
  
  /**
   * Get a service by ID.
   */
  get<T extends IService>(serviceId: string): T | undefined;
  
  /**
   * Find services by type.
   */
  findByType<T extends IService>(type: ServiceType): T[];
  
  /**
   * Find services by capability.
   */
  findByCapability<T extends IService>(capability: string): T[];
  
  /**
   * Get all registered services.
   */
  getAll(): IService[];
  
  /**
   * Get health status of all services.
   */
  getHealthStatus(): Promise<Map<string, ServiceHealth>>;
}

/**
 * Service factory for creating service instances.
 * Enables dependency injection and service composition.
 */
export interface IServiceFactory<T extends IService, TConfig = ServiceConfig> {
  /**
   * Create a new service instance.
   */
  create(config: TConfig): Promise<T>;
  
  /**
   * Get the service type this factory creates.
   */
  getServiceType(): ServiceType;
}
