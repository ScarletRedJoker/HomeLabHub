/**
 * Rendering Backend Extension Interface
 * 
 * Defines interfaces for pluggable rendering backends including WebGPU, WebGL,
 * Vulkan, Metal, and OpenGL. Provides abstractions for context creation,
 * shader compilation, and render pipeline management.
 * 
 * Extension Points:
 * - Implement IRenderingBackendExtension to create a rendering backend
 * - Implement IRenderContext for context management
 * - Extend shader types for custom shader languages
 * 
 * @module core/extensions/rendering-backend
 * 
 * @example
 * // Implementing a WebGPU rendering backend
 * class WebGPUBackend implements IRenderingBackendExtension {
 *   readonly type = 'rendering-backend';
 *   readonly backend = 'webgpu';
 *   
 *   async createContext(canvas) {
 *     const adapter = await navigator.gpu?.requestAdapter();
 *     const device = await adapter?.requestDevice();
 *     return new WebGPURenderContext(canvas, device);
 *   }
 * }
 */

import type { IExtension } from '../interfaces/extension';

/**
 * Supported rendering backend types.
 */
export type RenderingBackendType = 'webgpu' | 'webgl' | 'webgl2' | 'vulkan' | 'metal' | 'opengl' | 'directx';

/**
 * Shader stage types.
 */
export type ShaderStage = 'vertex' | 'fragment' | 'compute' | 'geometry' | 'tessellation-control' | 'tessellation-evaluation';

/**
 * Shader source code definition.
 */
export interface ShaderSource {
  /** Shader stage */
  stage: ShaderStage;
  /** Shader source code */
  code: string;
  /** Shader language */
  language: 'wgsl' | 'glsl' | 'hlsl' | 'spirv' | 'msl';
  /** Entry point function name */
  entryPoint?: string;
  /** Preprocessor defines */
  defines?: Record<string, string | number | boolean>;
  /** Include paths for shader imports */
  includePaths?: string[];
}

/**
 * Compiled shader ready for use in pipelines.
 */
export interface CompiledShader {
  /** Shader ID */
  id: string;
  /** Shader stage */
  stage: ShaderStage;
  /** Whether compilation succeeded */
  success: boolean;
  /** Compilation errors */
  errors?: ShaderCompilationError[];
  /** Compilation warnings */
  warnings?: string[];
  /** Native shader handle (backend-specific) */
  handle: unknown;
  /** Reflection data */
  reflection?: ShaderReflection;
}

/**
 * Shader compilation error.
 */
export interface ShaderCompilationError {
  /** Error message */
  message: string;
  /** Line number */
  line?: number;
  /** Column number */
  column?: number;
  /** Error severity */
  severity: 'error' | 'warning' | 'info';
}

/**
 * Shader reflection data for automatic binding.
 */
export interface ShaderReflection {
  /** Uniform blocks */
  uniformBlocks: UniformBlockInfo[];
  /** Samplers */
  samplers: SamplerInfo[];
  /** Storage buffers */
  storageBuffers: BufferInfo[];
  /** Input attributes */
  inputs: AttributeInfo[];
  /** Output attributes */
  outputs: AttributeInfo[];
}

/**
 * Uniform block reflection info.
 */
export interface UniformBlockInfo {
  /** Block name */
  name: string;
  /** Binding index */
  binding: number;
  /** Set index (for Vulkan) */
  set?: number;
  /** Block size in bytes */
  size: number;
  /** Member variables */
  members: UniformMemberInfo[];
}

/**
 * Uniform member variable info.
 */
export interface UniformMemberInfo {
  /** Member name */
  name: string;
  /** Data type */
  type: string;
  /** Offset in bytes */
  offset: number;
  /** Size in bytes */
  size: number;
  /** Array count (1 for non-arrays) */
  arrayCount: number;
}

/**
 * Sampler reflection info.
 */
export interface SamplerInfo {
  /** Sampler name */
  name: string;
  /** Binding index */
  binding: number;
  /** Set index */
  set?: number;
  /** Sampler type */
  type: '1d' | '2d' | '3d' | 'cube' | '2d-array' | 'cube-array';
  /** Whether it's a shadow sampler */
  shadow?: boolean;
}

/**
 * Buffer reflection info.
 */
export interface BufferInfo {
  /** Buffer name */
  name: string;
  /** Binding index */
  binding: number;
  /** Set index */
  set?: number;
  /** Access mode */
  access: 'read' | 'write' | 'read-write';
}

/**
 * Vertex attribute reflection info.
 */
export interface AttributeInfo {
  /** Attribute name */
  name: string;
  /** Location index */
  location: number;
  /** Data type */
  type: string;
  /** Component count */
  components: number;
}

/**
 * Render pipeline configuration.
 */
export interface PipelineConfig {
  /** Pipeline name for debugging */
  name?: string;
  /** Vertex shader */
  vertexShader: CompiledShader;
  /** Fragment shader */
  fragmentShader: CompiledShader;
  /** Vertex input layout */
  vertexLayout: VertexLayout;
  /** Primitive topology */
  primitive?: PrimitiveConfig;
  /** Depth/stencil state */
  depthStencil?: DepthStencilConfig;
  /** Color blend state */
  blend?: BlendConfig[];
  /** Rasterization state */
  rasterizer?: RasterizerConfig;
  /** Multi-sample anti-aliasing */
  multisample?: MultisampleConfig;
}

/**
 * Vertex input layout configuration.
 */
export interface VertexLayout {
  /** Vertex buffer bindings */
  buffers: VertexBufferLayout[];
}

/**
 * Single vertex buffer layout.
 */
export interface VertexBufferLayout {
  /** Stride in bytes between vertices */
  stride: number;
  /** Step mode */
  stepMode: 'vertex' | 'instance';
  /** Attributes in this buffer */
  attributes: VertexAttribute[];
}

/**
 * Vertex attribute definition.
 */
export interface VertexAttribute {
  /** Shader location */
  location: number;
  /** Data format */
  format: VertexFormat;
  /** Offset in bytes */
  offset: number;
}

/**
 * Vertex attribute formats.
 */
export type VertexFormat =
  | 'float32' | 'float32x2' | 'float32x3' | 'float32x4'
  | 'sint32' | 'sint32x2' | 'sint32x3' | 'sint32x4'
  | 'uint32' | 'uint32x2' | 'uint32x3' | 'uint32x4'
  | 'float16x2' | 'float16x4'
  | 'sint16x2' | 'sint16x4'
  | 'uint16x2' | 'uint16x4'
  | 'sint8x2' | 'sint8x4'
  | 'uint8x2' | 'uint8x4'
  | 'unorm8x2' | 'unorm8x4'
  | 'snorm8x2' | 'snorm8x4';

/**
 * Primitive topology configuration.
 */
export interface PrimitiveConfig {
  /** Topology type */
  topology: 'point-list' | 'line-list' | 'line-strip' | 'triangle-list' | 'triangle-strip';
  /** Index format (if using index buffer) */
  indexFormat?: 'uint16' | 'uint32';
  /** Front face winding */
  frontFace?: 'ccw' | 'cw';
  /** Culling mode */
  cullMode?: 'none' | 'front' | 'back';
}

/**
 * Depth/stencil state configuration.
 */
export interface DepthStencilConfig {
  /** Depth texture format */
  format: 'depth16' | 'depth24' | 'depth32' | 'depth24-stencil8' | 'depth32-stencil8';
  /** Enable depth writes */
  depthWriteEnabled: boolean;
  /** Depth comparison function */
  depthCompare: CompareFunction;
  /** Stencil front face */
  stencilFront?: StencilFaceConfig;
  /** Stencil back face */
  stencilBack?: StencilFaceConfig;
  /** Stencil read mask */
  stencilReadMask?: number;
  /** Stencil write mask */
  stencilWriteMask?: number;
  /** Depth bias */
  depthBias?: number;
  /** Depth bias slope scale */
  depthBiasSlopeScale?: number;
  /** Depth bias clamp */
  depthBiasClamp?: number;
}

/**
 * Comparison functions.
 */
export type CompareFunction = 'never' | 'less' | 'equal' | 'less-equal' | 'greater' | 'not-equal' | 'greater-equal' | 'always';

/**
 * Stencil face configuration.
 */
export interface StencilFaceConfig {
  /** Comparison function */
  compare: CompareFunction;
  /** Stencil fail operation */
  failOp: StencilOperation;
  /** Depth fail operation */
  depthFailOp: StencilOperation;
  /** Pass operation */
  passOp: StencilOperation;
}

/**
 * Stencil operations.
 */
export type StencilOperation = 'keep' | 'zero' | 'replace' | 'invert' | 'increment-clamp' | 'decrement-clamp' | 'increment-wrap' | 'decrement-wrap';

/**
 * Color blend configuration for a render target.
 */
export interface BlendConfig {
  /** Color format */
  format: TextureFormat;
  /** Enable blending */
  blendEnabled?: boolean;
  /** Color blend operation */
  colorBlend?: BlendComponent;
  /** Alpha blend operation */
  alphaBlend?: BlendComponent;
  /** Color write mask */
  writeMask?: ColorWriteFlags;
}

/**
 * Blend component configuration.
 */
export interface BlendComponent {
  /** Blend operation */
  operation: BlendOperation;
  /** Source factor */
  srcFactor: BlendFactor;
  /** Destination factor */
  dstFactor: BlendFactor;
}

/**
 * Blend operations.
 */
export type BlendOperation = 'add' | 'subtract' | 'reverse-subtract' | 'min' | 'max';

/**
 * Blend factors.
 */
export type BlendFactor =
  | 'zero' | 'one'
  | 'src' | 'one-minus-src'
  | 'src-alpha' | 'one-minus-src-alpha'
  | 'dst' | 'one-minus-dst'
  | 'dst-alpha' | 'one-minus-dst-alpha'
  | 'src-alpha-saturated'
  | 'constant' | 'one-minus-constant';

/**
 * Color write flags.
 */
export type ColorWriteFlags = number; // Bitfield: 1=R, 2=G, 4=B, 8=A, 15=ALL

/**
 * Rasterizer state configuration.
 */
export interface RasterizerConfig {
  /** Fill mode */
  fillMode?: 'solid' | 'wireframe';
  /** Cull mode */
  cullMode?: 'none' | 'front' | 'back';
  /** Front face winding */
  frontFace?: 'ccw' | 'cw';
  /** Enable scissor test */
  scissorTest?: boolean;
  /** Conservative rasterization */
  conservative?: boolean;
}

/**
 * Multisample configuration.
 */
export interface MultisampleConfig {
  /** Sample count */
  count: 1 | 2 | 4 | 8 | 16;
  /** Sample mask */
  mask?: number;
  /** Alpha to coverage */
  alphaToCoverage?: boolean;
}

/**
 * Texture formats.
 */
export type TextureFormat =
  | 'rgba8unorm' | 'rgba8snorm' | 'rgba8uint' | 'rgba8sint'
  | 'bgra8unorm'
  | 'rgba16float' | 'rgba32float'
  | 'r8unorm' | 'r16float' | 'r32float'
  | 'rg8unorm' | 'rg16float' | 'rg32float'
  | 'depth16' | 'depth24' | 'depth32' | 'depth24-stencil8' | 'depth32-stencil8';

/**
 * Compiled render pipeline.
 */
export interface RenderPipeline {
  /** Pipeline ID */
  id: string;
  /** Pipeline name */
  name?: string;
  /** Whether compilation succeeded */
  success: boolean;
  /** Compilation errors */
  errors?: string[];
  /** Native pipeline handle */
  handle: unknown;
  /** Pipeline layout info */
  layout?: PipelineLayoutInfo;
}

/**
 * Pipeline layout information.
 */
export interface PipelineLayoutInfo {
  /** Bind group layouts */
  bindGroupLayouts: BindGroupLayoutInfo[];
  /** Push constant ranges */
  pushConstants?: PushConstantRange[];
}

/**
 * Bind group layout info.
 */
export interface BindGroupLayoutInfo {
  /** Group index */
  index: number;
  /** Entries in this group */
  entries: BindGroupEntry[];
}

/**
 * Bind group entry.
 */
export interface BindGroupEntry {
  /** Binding index */
  binding: number;
  /** Resource type */
  type: 'uniform-buffer' | 'storage-buffer' | 'sampler' | 'texture' | 'storage-texture';
  /** Shader visibility */
  visibility: ShaderStage[];
}

/**
 * Push constant range (Vulkan/WebGPU).
 */
export interface PushConstantRange {
  /** Shader stages */
  stages: ShaderStage[];
  /** Offset in bytes */
  offset: number;
  /** Size in bytes */
  size: number;
}

/**
 * Render context for issuing draw commands.
 * 
 * Extension Point: Implement this for backend-specific context management.
 */
export interface IRenderContext {
  /** Context ID */
  readonly id: string;
  /** Canvas/surface dimensions */
  readonly width: number;
  readonly height: number;
  /** Device pixel ratio */
  readonly devicePixelRatio: number;

  /**
   * Begin a new frame.
   * @returns Frame command encoder or similar
   */
  beginFrame(): unknown;

  /**
   * End the frame and present.
   */
  endFrame(): void;

  /**
   * Resize the context.
   * @param width - New width
   * @param height - New height
   */
  resize(width: number, height: number): void;

  /**
   * Set the active pipeline.
   * @param pipeline - Pipeline to use
   */
  setPipeline(pipeline: RenderPipeline): void;

  /**
   * Set viewport.
   * @param x - X offset
   * @param y - Y offset
   * @param width - Viewport width
   * @param height - Viewport height
   * @param minDepth - Minimum depth (0-1)
   * @param maxDepth - Maximum depth (0-1)
   */
  setViewport(x: number, y: number, width: number, height: number, minDepth?: number, maxDepth?: number): void;

  /**
   * Set scissor rect.
   * @param x - X offset
   * @param y - Y offset
   * @param width - Scissor width
   * @param height - Scissor height
   */
  setScissor(x: number, y: number, width: number, height: number): void;

  /**
   * Draw primitives.
   * @param vertexCount - Number of vertices
   * @param instanceCount - Number of instances
   * @param firstVertex - First vertex index
   * @param firstInstance - First instance index
   */
  draw(vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number): void;

  /**
   * Draw indexed primitives.
   * @param indexCount - Number of indices
   * @param instanceCount - Number of instances
   * @param firstIndex - First index
   * @param baseVertex - Base vertex offset
   * @param firstInstance - First instance index
   */
  drawIndexed(indexCount: number, instanceCount?: number, firstIndex?: number, baseVertex?: number, firstInstance?: number): void;

  /**
   * Get the current swap chain texture.
   * @returns Current texture handle
   */
  getCurrentTexture(): unknown;

  /**
   * Destroy the context and release resources.
   */
  destroy(): void;
}

/**
 * Backend capabilities and limits.
 */
export interface BackendCapabilities {
  /** Maximum texture dimensions */
  maxTextureDimension2D: number;
  maxTextureDimension3D: number;
  maxTextureDimensionCube: number;
  /** Maximum texture array layers */
  maxTextureArrayLayers: number;
  /** Maximum bind groups */
  maxBindGroups: number;
  /** Maximum uniform buffer binding size */
  maxUniformBufferBindingSize: number;
  /** Maximum storage buffer binding size */
  maxStorageBufferBindingSize: number;
  /** Maximum vertex buffers */
  maxVertexBuffers: number;
  /** Maximum vertex attributes */
  maxVertexAttributes: number;
  /** Maximum color attachments */
  maxColorAttachments: number;
  /** Supports compute shaders */
  computeShaders: boolean;
  /** Supports indirect draw */
  indirectDraw: boolean;
  /** Supports timestamp queries */
  timestampQueries: boolean;
  /** Supports pipeline statistics queries */
  pipelineStatisticsQueries: boolean;
  /** Shader model version */
  shaderModel: string;
}

/**
 * Rendering Backend Extension interface.
 * Implement this to create a rendering backend integration.
 * 
 * Extension Points:
 * - createContext: Factory for render contexts
 * - compileShader: Custom shader compilation
 * - createPipeline: Pipeline creation
 * 
 * @example
 * class VulkanBackend implements IRenderingBackendExtension {
 *   readonly id = 'vulkan-backend';
 *   readonly name = 'Vulkan Rendering Backend';
 *   readonly version = '1.3';
 *   readonly type = 'rendering-backend';
 *   readonly backend = 'vulkan';
 *   
 *   async createContext(canvas) {
 *     return new VulkanContext(canvas);
 *   }
 * }
 */
export interface IRenderingBackendExtension extends IExtension {
  /** Extension type is always 'rendering-backend' */
  readonly type: 'rendering-backend';
  /** Rendering backend type */
  readonly backend: RenderingBackendType;

  /**
   * Create a render context for a canvas.
   * 
   * @param canvas - HTML canvas element
   * @param options - Context creation options
   * @returns Promise resolving to the render context
   */
  createContext(
    canvas: HTMLCanvasElement,
    options?: RenderContextOptions
  ): Promise<IRenderContext>;

  /**
   * Compile a shader from source.
   * 
   * @param source - Shader source code
   * @returns Promise resolving to compiled shader
   */
  compileShader(source: ShaderSource): Promise<CompiledShader>;

  /**
   * Create a render pipeline.
   * 
   * @param config - Pipeline configuration
   * @returns Promise resolving to the pipeline
   */
  createPipeline(config: PipelineConfig): Promise<RenderPipeline>;

  /**
   * Get backend capabilities and limits.
   * 
   * @returns Backend capabilities
   */
  getBackendCapabilities(): BackendCapabilities;

  /**
   * Check if the backend is available on this system.
   * 
   * @returns Whether the backend is available
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get device info.
   * 
   * @returns Device information
   */
  getDeviceInfo?(): DeviceInfo;

  /**
   * Create a compute pipeline (if supported).
   * 
   * @param computeShader - Compute shader
   * @returns Promise resolving to compute pipeline
   */
  createComputePipeline?(computeShader: CompiledShader): Promise<RenderPipeline>;

  /**
   * Create a texture.
   * 
   * @param config - Texture configuration
   * @returns Promise resolving to texture handle
   */
  createTexture?(config: TextureConfig): Promise<unknown>;

  /**
   * Create a buffer.
   * 
   * @param config - Buffer configuration
   * @returns Promise resolving to buffer handle
   */
  createBuffer?(config: BufferConfig): Promise<unknown>;
}

/**
 * Render context creation options.
 */
export interface RenderContextOptions {
  /** Enable anti-aliasing */
  antialias?: boolean;
  /** Enable depth buffer */
  depth?: boolean;
  /** Enable stencil buffer */
  stencil?: boolean;
  /** Preferred power preference */
  powerPreference?: 'default' | 'low-power' | 'high-performance';
  /** Alpha mode */
  alphaMode?: 'opaque' | 'premultiplied';
  /** Preferred format */
  format?: TextureFormat;
}

/**
 * Device information.
 */
export interface DeviceInfo {
  /** Device name */
  name: string;
  /** Vendor name */
  vendor: string;
  /** Driver version */
  driverVersion?: string;
  /** API version */
  apiVersion?: string;
  /** Device type */
  deviceType?: 'integrated' | 'discrete' | 'virtual' | 'cpu';
  /** Total memory (bytes) */
  totalMemory?: number;
}

/**
 * Texture configuration.
 */
export interface TextureConfig {
  /** Texture width */
  width: number;
  /** Texture height */
  height: number;
  /** Texture depth (for 3D textures) */
  depth?: number;
  /** Texture format */
  format: TextureFormat;
  /** Mip levels */
  mipLevels?: number;
  /** Sample count */
  sampleCount?: 1 | 2 | 4 | 8;
  /** Usage flags */
  usage: TextureUsage[];
  /** Initial data */
  data?: ArrayBuffer;
}

/**
 * Texture usage flags.
 */
export type TextureUsage = 'sampled' | 'storage' | 'render-attachment' | 'copy-src' | 'copy-dst';

/**
 * Buffer configuration.
 */
export interface BufferConfig {
  /** Buffer size in bytes */
  size: number;
  /** Usage flags */
  usage: BufferUsage[];
  /** Map at creation */
  mappedAtCreation?: boolean;
  /** Initial data */
  data?: ArrayBuffer;
}

/**
 * Buffer usage flags.
 */
export type BufferUsage = 'vertex' | 'index' | 'uniform' | 'storage' | 'indirect' | 'copy-src' | 'copy-dst' | 'map-read' | 'map-write';
