/**
 * Extension System
 * 
 * This module provides the extension system for integrating game engines,
 * AR/VR runtimes, simulation engines, and rendering backends.
 * 
 * The extension system enables modular, pluggable architecture where capabilities
 * can be added at runtime without modifying core code.
 * 
 * @module core/extensions
 * 
 * @example
 * // Load and use a game engine extension
 * import { ExtensionLoader, IGameEngineExtension } from '@/lib/core/extensions';
 * 
 * const loader = new ExtensionLoader(serviceRegistry);
 * const engine = await loader.loadFromManifest<IGameEngineExtension>({
 *   id: 'unity-engine',
 *   name: 'Unity',
 *   version: '2023.3',
 *   type: 'game-engine',
 *   entryPoint: './extensions/unity/index.js'
 * });
 * 
 * const scene = await engine.createScene();
 * scene.addObject({ id: 'player', ... });
 * 
 * @example
 * // Initialize an AR session
 * import { IARVRExtension } from '@/lib/core/extensions';
 * 
 * const xr = loader.getLoadedByType<IARVRExtension>('ar-vr-runtime')[0];
 * const session = await xr.initializeSession({
 *   mode: 'ar',
 *   features: ['plane-detection', 'hit-test'],
 *   referenceSpace: 'local-floor'
 * });
 */

export {
  ExtensionLoader,
  type ExtensionManifest,
  type ExtensionLoadResult,
  type ExtensionLoadOptions,
  type LoadedExtensionInfo,
} from './extension-loader';

export {
  type IGameEngineExtension,
  type IGameScene,
  type GameObject,
  type GameComponent,
  type Transform3D,
  type GameAsset,
  type AssetDescriptor,
  type RenderTarget,
  type SceneData,
  type SceneSettings,
  type AssetReference,
  type EngineCapabilities,
  type MeshRendererComponent,
  type ColliderComponent,
  type RigidbodyComponent,
  type LightComponent,
  type CameraComponent,
  type AudioSourceComponent,
  type ScriptComponent,
} from './game-engine';

export {
  type IARVRExtension,
  type IXRSession,
  type XRSessionConfig,
  type XRDeviceCapabilities,
  type XRPose,
  type XRFrame,
  type XRView,
  type XRInputSource,
  type XRHandData,
  type XRHandJoint,
  type XRGamepad,
  type XRButtonState,
  type XRPlane,
  type XRMesh,
  type XRDepthData,
  type XRLightEstimation,
  type XRHitTestResult,
  type XRFeature,
  type XRReferenceSpace,
} from './ar-vr-runtime';

export {
  type ISimulationExtension,
  type IPhysicsWorld,
  type WorldConfig,
  type RigidBody,
  type CollisionShape,
  type Contact,
  type ContactPoint,
  type RaycastHit,
  type Constraint,
  type ConstraintType,
  type PhysicsMaterial,
  type CollisionFilter,
  type BodyType,
  type ShapeType,
  type ForceMode,
  type QueryFilter,
  type SimulationStats,
  type SimulationFeatures,
  type BoxShapeParams,
  type SphereShapeParams,
  type CapsuleShapeParams,
  type ConvexShapeParams,
  type MeshShapeParams,
} from './simulation-engine';

export {
  type IRenderingBackendExtension,
  type IRenderContext,
  type RenderingBackendType,
  type ShaderSource,
  type ShaderStage,
  type CompiledShader,
  type ShaderCompilationError,
  type ShaderReflection,
  type PipelineConfig,
  type RenderPipeline,
  type VertexLayout,
  type VertexBufferLayout,
  type VertexAttribute,
  type VertexFormat,
  type PrimitiveConfig,
  type DepthStencilConfig,
  type BlendConfig,
  type BlendComponent,
  type BlendOperation,
  type BlendFactor,
  type RasterizerConfig,
  type MultisampleConfig,
  type TextureFormat,
  type TextureUsage,
  type TextureConfig,
  type BufferConfig,
  type BufferUsage,
  type BackendCapabilities,
  type DeviceInfo,
  type RenderContextOptions,
  type CompareFunction,
  type StencilOperation,
  type PipelineLayoutInfo,
  type BindGroupLayoutInfo,
  type BindGroupEntry,
} from './rendering-backend';
