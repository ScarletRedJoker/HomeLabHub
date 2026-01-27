/**
 * Game Engine Extension Interface
 * 
 * Defines interfaces for game engine integrations including Unity, Unreal, Godot,
 * and custom engines. Provides abstractions for scene management, asset loading,
 * game loop handling, and rendering.
 * 
 * Extension Points:
 * - Implement IGameEngineExtension to create a game engine integration
 * - Implement IGameScene to provide scene management
 * - Extend GameComponent for custom component types
 * 
 * @module core/extensions/game-engine
 * 
 * @example
 * // Implementing a Unity game engine extension
 * class UnityEngineExtension implements IGameEngineExtension {
 *   readonly type = 'game-engine';
 *   readonly engineName = 'Unity';
 *   readonly engineVersion = '2023.3';
 *   
 *   async createScene(): Promise<IGameScene> {
 *     return new UnityScene();
 *   }
 * }
 */

import type { IExtension } from '../interfaces/extension';
import type { Vector3, Quaternion } from '../interfaces/rendering-service';

/**
 * 3D Transform component for game objects.
 * Uses position, rotation (quaternion), and scale.
 */
export interface Transform3D {
  /** World position */
  position: Vector3;
  /** Rotation as quaternion */
  rotation: Quaternion;
  /** Non-uniform scale */
  scale: Vector3;
  /** Parent transform ID (for hierarchies) */
  parent?: string;
}

/**
 * Base interface for game object components.
 * Components define behavior and data for game objects.
 * 
 * Extension Point: Extend this interface for custom component types.
 * 
 * @typeParam TData - Type of component-specific data
 */
export interface GameComponent<TData = unknown> {
  /** Component type identifier */
  type: string;
  /** Whether the component is enabled */
  enabled: boolean;
  /** Component-specific data */
  data: TData;
}

/**
 * Mesh renderer component for rendering 3D geometry.
 */
export interface MeshRendererComponent extends GameComponent<{
  meshId: string;
  materialIds: string[];
  castShadows: boolean;
  receiveShadows: boolean;
}> {
  type: 'mesh-renderer';
}

/**
 * Collider component for physics collision detection.
 */
export interface ColliderComponent extends GameComponent<{
  shape: 'box' | 'sphere' | 'capsule' | 'mesh' | 'convex';
  dimensions?: Vector3;
  radius?: number;
  height?: number;
  isTrigger: boolean;
}> {
  type: 'collider';
}

/**
 * Rigidbody component for physics simulation.
 */
export interface RigidbodyComponent extends GameComponent<{
  mass: number;
  drag: number;
  angularDrag: number;
  useGravity: boolean;
  isKinematic: boolean;
  interpolation: 'none' | 'interpolate' | 'extrapolate';
}> {
  type: 'rigidbody';
}

/**
 * Light component for scene lighting.
 */
export interface LightComponent extends GameComponent<{
  lightType: 'directional' | 'point' | 'spot' | 'area';
  color: { r: number; g: number; b: number };
  intensity: number;
  range?: number;
  spotAngle?: number;
  castShadows: boolean;
}> {
  type: 'light';
}

/**
 * Camera component for viewpoints.
 */
export interface CameraComponent extends GameComponent<{
  projection: 'perspective' | 'orthographic';
  fov: number;
  near: number;
  far: number;
  orthoSize?: number;
  clearColor: { r: number; g: number; b: number; a: number };
}> {
  type: 'camera';
}

/**
 * Audio source component for 3D audio.
 */
export interface AudioSourceComponent extends GameComponent<{
  clipId: string;
  volume: number;
  pitch: number;
  loop: boolean;
  spatial: boolean;
  minDistance: number;
  maxDistance: number;
}> {
  type: 'audio-source';
}

/**
 * Script component for custom behavior.
 */
export interface ScriptComponent extends GameComponent<{
  scriptId: string;
  properties: Record<string, unknown>;
}> {
  type: 'script';
}

/**
 * Game object representing an entity in the game scene.
 * Contains transform, components, and hierarchical relationships.
 */
export interface GameObject {
  /** Unique object identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Object transform */
  transform: Transform3D;
  /** Attached components */
  components: GameComponent[];
  /** Object tags for categorization */
  tags?: string[];
  /** Object layer for rendering/physics */
  layer?: number;
  /** Whether the object is active */
  active?: boolean;
  /** Child object IDs */
  children?: string[];
  /** Custom user data */
  userData?: Record<string, unknown>;
}

/**
 * Serialized scene data for saving/loading.
 */
export interface SceneData {
  /** Scene identifier */
  id: string;
  /** Scene name */
  name: string;
  /** Scene version for migrations */
  version: number;
  /** All objects in the scene */
  objects: GameObject[];
  /** Scene-level settings */
  settings?: SceneSettings;
  /** Asset references */
  assets?: AssetReference[];
  /** Creation timestamp */
  createdAt?: string;
  /** Last modification timestamp */
  modifiedAt?: string;
}

/**
 * Scene-level settings.
 */
export interface SceneSettings {
  /** Gravity vector */
  gravity?: Vector3;
  /** Ambient light color */
  ambientLight?: { r: number; g: number; b: number };
  /** Skybox configuration */
  skybox?: {
    type: 'color' | 'cubemap' | 'hdri';
    color?: { r: number; g: number; b: number };
    textureId?: string;
  };
  /** Fog settings */
  fog?: {
    enabled: boolean;
    color: { r: number; g: number; b: number };
    density: number;
    near?: number;
    far?: number;
  };
  /** Post-processing preset */
  postProcessing?: string;
}

/**
 * Reference to an asset used in the scene.
 */
export interface AssetReference {
  /** Asset ID */
  id: string;
  /** Asset type */
  type: 'mesh' | 'texture' | 'material' | 'audio' | 'script' | 'prefab';
  /** Asset path or URL */
  path: string;
}

/**
 * Descriptor for loading assets.
 */
export interface AssetDescriptor {
  /** Asset identifier */
  id: string;
  /** Asset type */
  type: 'mesh' | 'texture' | 'material' | 'audio' | 'script' | 'prefab' | 'animation';
  /** Asset path or URL */
  path: string;
  /** Asset format */
  format?: string;
  /** Loading priority */
  priority?: 'low' | 'normal' | 'high';
  /** Whether to cache the asset */
  cache?: boolean;
}

/**
 * Loaded game asset.
 * 
 * @typeParam TData - Type of asset-specific data
 */
export interface GameAsset<TData = unknown> {
  /** Asset identifier */
  id: string;
  /** Asset type */
  type: string;
  /** Whether the asset is loaded */
  loaded: boolean;
  /** Asset data */
  data: TData;
  /** Memory size in bytes */
  memorySize?: number;
  /** Reference count for resource management */
  refCount?: number;
}

/**
 * Render target for rendering output.
 */
export interface RenderTarget {
  /** Target type */
  type: 'screen' | 'texture' | 'cubemap';
  /** Target width */
  width: number;
  /** Target height */
  height: number;
  /** Texture ID (for texture targets) */
  textureId?: string;
  /** Pixel format */
  format?: 'rgba8' | 'rgba16f' | 'rgba32f';
  /** Number of samples for MSAA */
  samples?: number;
  /** Whether to use depth buffer */
  depth?: boolean;
  /** Whether to use stencil buffer */
  stencil?: boolean;
}

/**
 * Game scene interface for managing scene objects.
 * Provides methods for adding, removing, and updating objects.
 * 
 * Extension Point: Implement this interface for engine-specific scene management.
 */
export interface IGameScene {
  /** Scene identifier */
  readonly id: string;
  /** Scene name */
  readonly name: string;

  /**
   * Add a game object to the scene.
   * 
   * @param object - Object to add
   */
  addObject(object: GameObject): void;

  /**
   * Remove a game object from the scene.
   * 
   * @param objectId - ID of object to remove
   */
  removeObject(objectId: string): void;

  /**
   * Get a game object by ID.
   * 
   * @param objectId - Object ID
   * @returns The object or undefined if not found
   */
  getObject(objectId: string): GameObject | undefined;

  /**
   * Find objects by tag.
   * 
   * @param tag - Tag to search for
   * @returns Array of matching objects
   */
  findByTag(tag: string): GameObject[];

  /**
   * Find objects by component type.
   * 
   * @param componentType - Component type to search for
   * @returns Array of matching objects
   */
  findByComponent(componentType: string): GameObject[];

  /**
   * Update the scene (called each frame).
   * 
   * @param deltaTime - Time since last update in seconds
   */
  update(deltaTime: number): void;

  /**
   * Serialize the scene to data format.
   * 
   * @returns Serialized scene data
   */
  serialize(): SceneData;

  /**
   * Load scene from serialized data.
   * 
   * @param data - Scene data to load
   */
  deserialize(data: SceneData): void;

  /**
   * Clear all objects from the scene.
   */
  clear(): void;

  /**
   * Get all objects in the scene.
   * 
   * @returns Array of all objects
   */
  getAllObjects(): GameObject[];
}

/**
 * Game engine extension interface.
 * Implement this to integrate a game engine with the system.
 * 
 * Extension Points:
 * - createScene: Factory for creating game scenes
 * - loadAsset: Custom asset loading logic
 * - tick: Game loop update
 * - render: Custom rendering logic
 * 
 * @example
 * class GodotEngineExtension implements IGameEngineExtension {
 *   readonly id = 'godot-engine';
 *   readonly name = 'Godot Game Engine';
 *   readonly version = '4.2';
 *   readonly type = 'game-engine';
 *   readonly engineName = 'Godot';
 *   readonly engineVersion = '4.2.0';
 *   
 *   async createScene() {
 *     return new GodotScene();
 *   }
 * }
 */
export interface IGameEngineExtension extends IExtension {
  /** Extension type is always 'game-engine' */
  readonly type: 'game-engine';
  /** Name of the game engine */
  readonly engineName: string;
  /** Version of the game engine */
  readonly engineVersion: string;

  /**
   * Create a new game scene.
   * 
   * @returns Promise resolving to the created scene
   */
  createScene(): Promise<IGameScene>;

  /**
   * Load a game asset.
   * 
   * @typeParam T - Type of asset data
   * @param asset - Asset descriptor
   * @returns Promise resolving to the loaded asset
   */
  loadAsset<T = unknown>(asset: AssetDescriptor): Promise<GameAsset<T>>;

  /**
   * Unload a game asset.
   * 
   * @param assetId - ID of asset to unload
   */
  unloadAsset?(assetId: string): void;

  /**
   * Process one game tick.
   * 
   * @param deltaTime - Time since last tick in seconds
   */
  tick(deltaTime: number): void;

  /**
   * Render the current frame.
   * 
   * @param target - Render target
   * @returns Promise resolving when render is complete
   */
  render(target: RenderTarget): Promise<void>;

  /**
   * Get supported asset formats.
   * 
   * @returns Array of supported format extensions
   */
  getSupportedAssetFormats(): string[];

  /**
   * Get engine capabilities.
   * 
   * @returns Engine capabilities object
   */
  getEngineCapabilities?(): EngineCapabilities;

  /**
   * Start the game loop.
   */
  start?(): void;

  /**
   * Stop the game loop.
   */
  stop?(): void;

  /**
   * Pause the game loop.
   */
  pause?(): void;

  /**
   * Resume the game loop.
   */
  resume?(): void;
}

/**
 * Engine capabilities and features.
 */
export interface EngineCapabilities {
  /** Supports real-time rendering */
  realTimeRendering: boolean;
  /** Supports ray tracing */
  rayTracing: boolean;
  /** Supports physics simulation */
  physics: boolean;
  /** Supports 3D audio */
  spatialAudio: boolean;
  /** Supports networking */
  networking: boolean;
  /** Supports VR */
  vr: boolean;
  /** Supports AR */
  ar: boolean;
  /** Maximum texture size */
  maxTextureSize: number;
  /** Maximum bone count for skeletal animation */
  maxBones: number;
  /** Supported shader models */
  shaderModels: string[];
}
