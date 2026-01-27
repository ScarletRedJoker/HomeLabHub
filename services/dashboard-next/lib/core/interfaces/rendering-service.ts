/**
 * Rendering Service Abstraction Layer
 * 
 * Defines interfaces for rendering services including real-time 3D rendering,
 * ray tracing, and image processing. Designed for abstraction over multiple
 * rendering backends (Unreal, Unity, Blender, custom GPU pipelines).
 * 
 * Future use cases:
 * - Cloud rendering for games and simulations
 * - AR/VR content streaming
 * - AI-driven scene composition
 * - Distributed rendering farms
 * - Real-time collaborative 3D editing
 * 
 * @module core/interfaces/rendering-service
 */

import type { IService } from './service';

/**
 * 3D vector representation.
 */
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Quaternion for rotation representation.
 */
export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * 4x4 transformation matrix (column-major order).
 */
export type Matrix4x4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number
];

/**
 * Transform component for scene objects.
 */
export interface Transform {
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
}

/**
 * Material definition for rendering.
 * Supports PBR (Physically Based Rendering) workflow.
 */
export interface Material {
  /** Material identifier */
  id: string;
  /** Material name */
  name?: string;
  /** Base color (albedo) */
  baseColor?: { r: number; g: number; b: number; a: number };
  /** Base color texture URL */
  baseColorTexture?: string;
  /** Metallic factor (0-1) */
  metallic?: number;
  /** Roughness factor (0-1) */
  roughness?: number;
  /** Normal map texture URL */
  normalTexture?: string;
  /** Emissive color */
  emissive?: { r: number; g: number; b: number };
  /** Emissive intensity */
  emissiveIntensity?: number;
  /** Alpha mode */
  alphaMode?: 'opaque' | 'mask' | 'blend';
  /** Alpha cutoff for mask mode */
  alphaCutoff?: number;
  /** Custom shader parameters */
  shaderParams?: Record<string, unknown>;
}

/**
 * Mesh/geometry definition.
 */
export interface Geometry {
  /** Geometry identifier */
  id: string;
  /** Primitive type */
  type: 'mesh' | 'primitive';
  /** For primitives: box, sphere, cylinder, plane, etc. */
  primitive?: 'box' | 'sphere' | 'cylinder' | 'plane' | 'capsule' | 'torus';
  /** Primitive dimensions */
  dimensions?: Record<string, number>;
  /** URL to mesh asset (GLTF, FBX, OBJ, etc.) */
  meshUrl?: string;
  /** Inline vertex data (for procedural geometry) */
  vertices?: Float32Array;
  /** Inline index data */
  indices?: Uint32Array;
  /** Vertex normals */
  normals?: Float32Array;
  /** UV coordinates */
  uvs?: Float32Array;
}

/**
 * Scene object representing an entity in the 3D scene.
 */
export interface SceneObject {
  /** Unique object identifier */
  id: string;
  /** Object name */
  name?: string;
  /** Object transform */
  transform: Transform;
  /** Geometry reference */
  geometry?: Geometry;
  /** Material reference or ID */
  material?: Material | string;
  /** Child objects for hierarchies */
  children?: SceneObject[];
  /** Object visibility */
  visible?: boolean;
  /** Cast shadows */
  castShadows?: boolean;
  /** Receive shadows */
  receiveShadows?: boolean;
  /** Layer/render group */
  layer?: number;
  /** Custom properties */
  userData?: Record<string, unknown>;
}

/**
 * Camera configuration for rendering.
 */
export interface CameraConfig {
  /** Camera type */
  type: 'perspective' | 'orthographic';
  /** Camera position */
  position: Vector3;
  /** Look-at target */
  target?: Vector3;
  /** Up vector */
  up?: Vector3;
  /** Field of view in degrees (perspective) */
  fov?: number;
  /** Near clipping plane */
  near?: number;
  /** Far clipping plane */
  far?: number;
  /** Orthographic size (orthographic) */
  orthoSize?: number;
  /** Aspect ratio override */
  aspectRatio?: number;
  /** Depth of field settings */
  dof?: DepthOfFieldConfig;
  /** Motion blur settings */
  motionBlur?: MotionBlurConfig;
}

/**
 * Depth of field configuration.
 */
export interface DepthOfFieldConfig {
  enabled: boolean;
  focusDistance: number;
  aperture: number;
  bladeCount?: number;
}

/**
 * Motion blur configuration.
 */
export interface MotionBlurConfig {
  enabled: boolean;
  intensity: number;
  sampleCount?: number;
}

/**
 * Light types supported by the rendering system.
 */
export type LightType = 'directional' | 'point' | 'spot' | 'area' | 'ambient';

/**
 * Individual light configuration.
 */
export interface Light {
  /** Light identifier */
  id: string;
  /** Light type */
  type: LightType;
  /** Light color */
  color: { r: number; g: number; b: number };
  /** Light intensity */
  intensity: number;
  /** Light position (not used for directional/ambient) */
  position?: Vector3;
  /** Light direction (for directional/spot) */
  direction?: Vector3;
  /** Range/radius (for point/spot) */
  range?: number;
  /** Spot angle in degrees (for spot) */
  spotAngle?: number;
  /** Inner spot angle (for soft edges) */
  innerSpotAngle?: number;
  /** Area light dimensions */
  areaSize?: { width: number; height: number };
  /** Cast shadows */
  castShadows?: boolean;
  /** Shadow map resolution */
  shadowResolution?: number;
  /** Shadow softness */
  shadowSoftness?: number;
}

/**
 * Scene lighting configuration.
 */
export interface LightingConfig {
  /** Lights in the scene */
  lights: Light[];
  /** Ambient light color */
  ambientColor?: { r: number; g: number; b: number };
  /** Ambient light intensity */
  ambientIntensity?: number;
  /** Enable global illumination */
  globalIllumination?: boolean;
  /** GI bounces */
  giBounces?: number;
}

/**
 * Environment/skybox configuration.
 */
export interface EnvironmentConfig {
  /** Environment type */
  type: 'hdri' | 'skybox' | 'color' | 'procedural';
  /** HDRI texture URL */
  hdriUrl?: string;
  /** Skybox texture URLs (6 faces) */
  skyboxUrls?: string[];
  /** Solid color */
  color?: { r: number; g: number; b: number };
  /** Environment rotation */
  rotation?: number;
  /** Environment intensity */
  intensity?: number;
  /** Use as lighting (IBL) */
  useAsLighting?: boolean;
  /** Blur level for reflections */
  blurLevel?: number;
  /** Fog settings */
  fog?: FogConfig;
}

/**
 * Fog configuration.
 */
export interface FogConfig {
  enabled: boolean;
  type: 'linear' | 'exponential' | 'exponential2';
  color: { r: number; g: number; b: number };
  near?: number;
  far?: number;
  density?: number;
}

/**
 * Complete scene definition for rendering.
 */
export interface RenderScene {
  /** Scene identifier */
  id?: string;
  /** Scene name */
  name?: string;
  /** Objects in the scene */
  objects: SceneObject[];
  /** Camera configuration */
  camera: CameraConfig;
  /** Lighting configuration */
  lighting: LightingConfig;
  /** Environment configuration */
  environment?: EnvironmentConfig;
  /** Scene-level post-processing */
  postProcessing?: PostProcessingConfig;
}

/**
 * Post-processing effects configuration.
 */
export interface PostProcessingConfig {
  /** Tone mapping mode */
  toneMapping?: 'none' | 'aces' | 'filmic' | 'reinhard';
  /** Exposure adjustment */
  exposure?: number;
  /** Bloom settings */
  bloom?: {
    enabled: boolean;
    intensity: number;
    threshold: number;
    radius?: number;
  };
  /** Color grading */
  colorGrading?: {
    saturation?: number;
    contrast?: number;
    brightness?: number;
    temperature?: number;
    tint?: number;
  };
  /** Vignette */
  vignette?: {
    enabled: boolean;
    intensity: number;
    smoothness?: number;
  };
  /** Anti-aliasing mode */
  antiAliasing?: 'none' | 'fxaa' | 'smaa' | 'taa' | 'msaa';
  /** MSAA samples */
  msaaSamples?: 2 | 4 | 8;
}

/**
 * Rendering options for a render request.
 */
export interface RenderOptions {
  /** Output width in pixels */
  width: number;
  /** Output height in pixels */
  height: number;
  /** Output format */
  format: 'png' | 'jpg' | 'webp' | 'exr' | 'hdr';
  /** Quality (0-100 for lossy formats) */
  quality: number;
  /** Sample count for ray tracing */
  samples?: number;
  /** Enable denoising */
  denoising?: boolean;
  /** Denoiser type */
  denoiserType?: 'intel' | 'optix' | 'oidn';
  /** Render mode */
  renderMode?: 'pathtracing' | 'rasterization' | 'hybrid';
  /** Maximum ray bounces */
  maxBounces?: number;
  /** Enable transparency */
  transparency?: boolean;
  /** Background alpha (for transparent renders) */
  backgroundAlpha?: number;
  /** GPU device index */
  gpuDevice?: number;
  /** Priority level */
  priority?: 'low' | 'normal' | 'high';
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Result from a render operation.
 */
export interface RenderResult {
  /** Rendered image URL */
  imageUrl?: string;
  /** Base64-encoded image data */
  imageData?: string;
  /** Image format */
  format: string;
  /** Image width */
  width: number;
  /** Image height */
  height: number;
  /** Render time in milliseconds */
  renderTime: number;
  /** Samples rendered */
  samples?: number;
  /** Additional render passes */
  passes?: RenderPass[];
  /** Render statistics */
  stats?: RenderStats;
}

/**
 * Additional render passes (depth, normals, etc.).
 */
export interface RenderPass {
  /** Pass type */
  type: 'depth' | 'normal' | 'albedo' | 'emission' | 'ao' | 'motion' | 'id';
  /** Pass image URL */
  imageUrl?: string;
  /** Pass image data */
  imageData?: string;
}

/**
 * Render statistics for profiling.
 */
export interface RenderStats {
  /** Total triangles rendered */
  triangles?: number;
  /** Draw calls */
  drawCalls?: number;
  /** GPU memory used in bytes */
  gpuMemory?: number;
  /** Rays traced (for path tracing) */
  raysTraced?: number;
  /** Time breakdown by stage */
  timeBreakdown?: Record<string, number>;
}

/**
 * Streaming render frame for progressive rendering.
 */
export interface RenderFrame {
  /** Frame number */
  frameNumber: number;
  /** Current sample count */
  currentSamples: number;
  /** Target sample count */
  targetSamples: number;
  /** Progress percentage (0-100) */
  progress: number;
  /** Frame image data (may be lower quality during progressive render) */
  imageData?: string;
  /** Is this the final frame */
  isFinal: boolean;
  /** Estimated time remaining in milliseconds */
  estimatedTimeRemaining?: number;
}

/**
 * GPU statistics for monitoring.
 */
export interface GPUStats {
  /** GPU device name */
  deviceName: string;
  /** GPU vendor */
  vendor: string;
  /** GPU driver version */
  driverVersion?: string;
  /** Total VRAM in bytes */
  totalVRAM: number;
  /** Used VRAM in bytes */
  usedVRAM: number;
  /** GPU utilization percentage */
  utilization: number;
  /** GPU temperature in Celsius */
  temperature?: number;
  /** Power draw in watts */
  powerDraw?: number;
  /** Compute capability (for CUDA) */
  computeCapability?: string;
  /** Ray tracing cores (if applicable) */
  rtCores?: number;
  /** Tensor cores (if applicable) */
  tensorCores?: number;
}

/**
 * Rendering Service interface.
 * Implement this to create rendering backends for games, visualization, etc.
 * 
 * @example
 * // Implementing a Blender rendering service
 * class BlenderRenderService implements IRenderingService {
 *   readonly type = 'rendering';
 *   
 *   async render(scene, options) {
 *     // Send scene to Blender for Cycles rendering
 *   }
 * }
 */
export interface IRenderingService extends IService {
  /** Service type is always 'rendering' */
  readonly type: 'rendering';
  
  /**
   * Render a scene to an image.
   */
  render(scene: RenderScene, options: RenderOptions): Promise<RenderResult>;
  
  /**
   * Render a scene with progressive updates.
   * Essential for interactive previews and long renders.
   */
  renderStream(scene: RenderScene, options: RenderOptions): AsyncIterable<RenderFrame>;
  
  /**
   * Get current GPU statistics.
   */
  getGPUStats(): Promise<GPUStats>;
  
  /**
   * Cancel an ongoing render operation.
   */
  cancelRender?(renderId: string): Promise<void>;
  
  /**
   * Get supported render modes and capabilities.
   */
  getSupportedFeatures?(): Promise<RenderingFeatures>;
  
  /**
   * Preload assets for faster rendering.
   */
  preloadAssets?(assetUrls: string[]): Promise<void>;
}

/**
 * Rendering features and capabilities.
 */
export interface RenderingFeatures {
  /** Supported render modes */
  renderModes: ('pathtracing' | 'rasterization' | 'hybrid')[];
  /** Maximum resolution */
  maxResolution: { width: number; height: number };
  /** Maximum samples */
  maxSamples: number;
  /** Supported output formats */
  outputFormats: string[];
  /** Ray tracing support */
  rayTracing: boolean;
  /** Denoiser types available */
  denoisers: string[];
  /** GPU devices available */
  gpuDevices: GPUStats[];
  /** Maximum concurrent renders */
  maxConcurrentRenders: number;
}
