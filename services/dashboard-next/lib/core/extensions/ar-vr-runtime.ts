/**
 * AR/VR Runtime Extension Interface
 * 
 * Defines interfaces for AR/VR runtime integrations including WebXR, OpenXR,
 * ARKit, ARCore, Meta Quest, and Apple Vision Pro. Provides abstractions for
 * session management, device capabilities, pose tracking, and frame submission.
 * 
 * Extension Points:
 * - Implement IARVRExtension to create an XR runtime integration
 * - Extend XRFeature for custom tracking features
 * - Implement custom XRInputSource handlers
 * 
 * @module core/extensions/ar-vr-runtime
 * 
 * @example
 * // Implementing a WebXR runtime extension
 * class WebXRExtension implements IARVRExtension {
 *   readonly type = 'ar-vr-runtime';
 *   
 *   async initializeSession(config) {
 *     const session = await navigator.xr?.requestSession(
 *       config.mode === 'vr' ? 'immersive-vr' : 'immersive-ar',
 *       { requiredFeatures: config.features }
 *     );
 *     return this.wrapSession(session);
 *   }
 * }
 */

import type { IExtension } from '../interfaces/extension';
import type { Vector3, Quaternion, Matrix4x4 } from '../interfaces/rendering-service';

/**
 * XR feature capabilities that can be enabled for a session.
 */
export type XRFeature =
  | 'hand-tracking'
  | 'eye-tracking'
  | 'face-tracking'
  | 'body-tracking'
  | 'plane-detection'
  | 'image-tracking'
  | 'mesh-detection'
  | 'spatial-anchors'
  | 'passthrough'
  | 'depth-sensing'
  | 'hit-test'
  | 'light-estimation'
  | 'dom-overlay'
  | 'layers'
  | 'haptics';

/**
 * XR reference space types for coordinate systems.
 */
export type XRReferenceSpace =
  | 'viewer'
  | 'local'
  | 'local-floor'
  | 'bounded-floor'
  | 'unbounded';

/**
 * Configuration for initializing an XR session.
 */
export interface XRSessionConfig {
  /** Session mode */
  mode: 'ar' | 'vr' | 'mr';
  /** Required features that must be supported */
  features: XRFeature[];
  /** Optional features to enable if supported */
  optionalFeatures?: XRFeature[];
  /** Reference space for tracking */
  referenceSpace: XRReferenceSpace;
  /** Frame rate preference */
  frameRate?: 60 | 72 | 90 | 120;
  /** Foveated rendering level */
  foveatedRendering?: 'off' | 'low' | 'medium' | 'high';
  /** Enable passthrough in VR */
  enablePassthrough?: boolean;
  /** Depth sensing configuration */
  depthSensing?: {
    usagePreference: ('cpu-optimized' | 'gpu-optimized')[];
    dataFormat: 'luminance-alpha' | 'float32';
  };
}

/**
 * XR device capabilities and specifications.
 */
export interface XRDeviceCapabilities {
  /** Device name */
  deviceName: string;
  /** Device manufacturer */
  manufacturer: string;
  /** Supports VR mode */
  supportsVR: boolean;
  /** Supports AR mode */
  supportsAR: boolean;
  /** Supports mixed reality */
  supportsMR: boolean;
  /** Supported features */
  supportedFeatures: XRFeature[];
  /** Display specifications */
  display: {
    resolution: { width: number; height: number };
    refreshRates: number[];
    fov: { horizontal: number; vertical: number };
  };
  /** Tracking specifications */
  tracking: {
    positionTracking: boolean;
    rotationTracking: boolean;
    degrees: 3 | 6;
    playAreaBounds?: { width: number; height: number };
  };
  /** Controller specifications */
  controllers: {
    count: number;
    hasHaptics: boolean;
    hasTracking: boolean;
    buttons: string[];
    axes: string[];
  };
  /** Hand tracking specifications */
  handTracking?: {
    supported: boolean;
    jointCount: number;
  };
  /** Eye tracking specifications */
  eyeTracking?: {
    supported: boolean;
    calibrationRequired: boolean;
  };
}

/**
 * XR pose representing position and orientation in space.
 */
export interface XRPose {
  /** Pose position in reference space */
  position: Vector3;
  /** Pose orientation as quaternion */
  orientation: Quaternion;
  /** Full transformation matrix */
  transform: Matrix4x4;
  /** Linear velocity (if available) */
  linearVelocity?: Vector3;
  /** Angular velocity (if available) */
  angularVelocity?: Vector3;
  /** Whether pose is tracked or estimated */
  emulatedPosition: boolean;
}

/**
 * XR view for a single eye/display.
 */
export interface XRView {
  /** View eye */
  eye: 'left' | 'right' | 'none';
  /** View pose relative to reference space */
  pose: XRPose;
  /** Projection matrix */
  projectionMatrix: Matrix4x4;
  /** Viewport */
  viewport: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * XR input source (controller, hand, etc.).
 */
export interface XRInputSource {
  /** Input source ID */
  id: string;
  /** Handedness */
  handedness: 'left' | 'right' | 'none';
  /** Target ray mode */
  targetRayMode: 'tracked-pointer' | 'gaze' | 'screen';
  /** Target ray pose */
  targetRayPose?: XRPose;
  /** Grip pose */
  gripPose?: XRPose;
  /** Hand tracking data */
  hand?: XRHandData;
  /** Gamepad state */
  gamepad?: XRGamepad;
}

/**
 * Hand tracking joint data.
 */
export interface XRHandData {
  /** All joint poses indexed by joint name */
  joints: Map<XRHandJoint, XRPose>;
  /** Pinch gesture strength (0-1) */
  pinchStrength?: number;
  /** Grip gesture strength (0-1) */
  gripStrength?: number;
}

/**
 * Hand joint names.
 */
export type XRHandJoint =
  | 'wrist'
  | 'thumb-metacarpal' | 'thumb-phalanx-proximal' | 'thumb-phalanx-distal' | 'thumb-tip'
  | 'index-finger-metacarpal' | 'index-finger-phalanx-proximal' | 'index-finger-phalanx-intermediate' | 'index-finger-phalanx-distal' | 'index-finger-tip'
  | 'middle-finger-metacarpal' | 'middle-finger-phalanx-proximal' | 'middle-finger-phalanx-intermediate' | 'middle-finger-phalanx-distal' | 'middle-finger-tip'
  | 'ring-finger-metacarpal' | 'ring-finger-phalanx-proximal' | 'ring-finger-phalanx-intermediate' | 'ring-finger-phalanx-distal' | 'ring-finger-tip'
  | 'pinky-finger-metacarpal' | 'pinky-finger-phalanx-proximal' | 'pinky-finger-phalanx-intermediate' | 'pinky-finger-phalanx-distal' | 'pinky-finger-tip';

/**
 * XR gamepad state for controllers.
 */
export interface XRGamepad {
  /** Button states */
  buttons: XRButtonState[];
  /** Axis values (-1 to 1) */
  axes: number[];
}

/**
 * XR button state.
 */
export interface XRButtonState {
  /** Button is pressed */
  pressed: boolean;
  /** Button is touched */
  touched: boolean;
  /** Analog value (0-1) */
  value: number;
}

/**
 * XR frame containing all data for one render frame.
 */
export interface XRFrame {
  /** Frame timestamp */
  timestamp: number;
  /** Frame number */
  frameNumber: number;
  /** Views to render */
  views: XRView[];
  /** Active input sources */
  inputSources: XRInputSource[];
  /** Detected planes (if plane detection enabled) */
  planes?: XRPlane[];
  /** Detected meshes (if mesh detection enabled) */
  meshes?: XRMesh[];
  /** Depth data (if depth sensing enabled) */
  depthData?: XRDepthData;
  /** Light estimation (if enabled) */
  lightEstimation?: XRLightEstimation;
  /** Predicted display time */
  predictedDisplayTime: number;
}

/**
 * Detected plane in AR.
 */
export interface XRPlane {
  /** Plane ID */
  id: string;
  /** Plane orientation */
  orientation: 'horizontal' | 'vertical';
  /** Plane pose */
  pose: XRPose;
  /** Plane polygon vertices */
  polygon: Vector3[];
  /** Semantic label if available */
  semanticLabel?: 'floor' | 'ceiling' | 'wall' | 'table' | 'seat' | 'door' | 'window';
}

/**
 * Detected mesh in AR.
 */
export interface XRMesh {
  /** Mesh ID */
  id: string;
  /** Mesh pose */
  pose: XRPose;
  /** Vertex positions */
  vertices: Float32Array;
  /** Triangle indices */
  indices: Uint32Array;
  /** Vertex normals */
  normals?: Float32Array;
}

/**
 * Depth sensing data.
 */
export interface XRDepthData {
  /** Depth texture width */
  width: number;
  /** Depth texture height */
  height: number;
  /** Raw depth values */
  rawValueToMeters: number;
  /** Depth data array */
  data: Float32Array | Uint16Array;
  /** Normalization matrix */
  normDepthBufferFromNormView: Matrix4x4;
}

/**
 * Light estimation data for AR.
 */
export interface XRLightEstimation {
  /** Primary light direction */
  primaryLightDirection?: Vector3;
  /** Primary light intensity */
  primaryLightIntensity?: number;
  /** Ambient light spherical harmonics */
  sphericalHarmonicsCoefficients?: Float32Array;
  /** Main light color */
  primaryLightColor?: { r: number; g: number; b: number };
}

/**
 * XR session interface for managing an active XR experience.
 */
export interface IXRSession {
  /** Session ID */
  readonly id: string;
  /** Session mode */
  readonly mode: 'ar' | 'vr' | 'mr';
  /** Active features */
  readonly activeFeatures: XRFeature[];
  /** Whether session is running */
  readonly isRunning: boolean;

  /**
   * Get the current frame.
   * @returns Current XR frame
   */
  getCurrentFrame(): XRFrame;

  /**
   * Get input sources.
   * @returns Array of active input sources
   */
  getInputSources(): XRInputSource[];

  /**
   * Request a hit test against real-world geometry.
   * @param ray - Ray origin and direction
   * @returns Hit test results
   */
  hitTest(ray: { origin: Vector3; direction: Vector3 }): Promise<XRHitTestResult[]>;

  /**
   * Create a spatial anchor.
   * @param pose - Anchor pose
   * @returns Anchor ID
   */
  createAnchor(pose: XRPose): Promise<string>;

  /**
   * Delete a spatial anchor.
   * @param anchorId - Anchor to delete
   */
  deleteAnchor(anchorId: string): Promise<void>;

  /**
   * Trigger haptic feedback.
   * @param sourceId - Input source ID
   * @param intensity - Vibration intensity (0-1)
   * @param duration - Duration in milliseconds
   */
  triggerHaptic(sourceId: string, intensity: number, duration: number): void;

  /**
   * Request a new reference space.
   * @param type - Reference space type
   */
  requestReferenceSpace(type: XRReferenceSpace): Promise<void>;

  /**
   * End the session.
   */
  end(): Promise<void>;
}

/**
 * Hit test result.
 */
export interface XRHitTestResult {
  /** Hit pose */
  pose: XRPose;
  /** Distance from ray origin */
  distance: number;
  /** Hit plane (if available) */
  plane?: XRPlane;
}

/**
 * AR/VR Runtime Extension interface.
 * Implement this to integrate an XR runtime with the system.
 * 
 * Extension Points:
 * - initializeSession: Custom session initialization
 * - getDeviceCapabilities: Device discovery
 * - trackPose: Custom pose tracking
 * - submitFrame: Custom frame submission
 * 
 * @example
 * class MetaQuestExtension implements IARVRExtension {
 *   readonly id = 'meta-quest';
 *   readonly name = 'Meta Quest Runtime';
 *   readonly version = '1.0.0';
 *   readonly type = 'ar-vr-runtime';
 *   
 *   async initializeSession(config) {
 *     // Initialize Quest-specific session
 *   }
 * }
 */
export interface IARVRExtension extends IExtension {
  /** Extension type is always 'ar-vr-runtime' */
  readonly type: 'ar-vr-runtime';

  /**
   * Initialize an XR session with the given configuration.
   * 
   * @param config - Session configuration
   * @returns Promise resolving to the initialized session
   */
  initializeSession(config: XRSessionConfig): Promise<IXRSession>;

  /**
   * Get device capabilities and specifications.
   * 
   * @returns Device capabilities object
   */
  getDeviceCapabilities(): XRDeviceCapabilities;

  /**
   * Track the current head/controller pose.
   * 
   * @returns Promise resolving to the current pose
   */
  trackPose(): Promise<XRPose>;

  /**
   * Submit a rendered frame to the XR display.
   * 
   * @param frame - Frame data to submit
   * @returns Promise resolving when frame is submitted
   */
  submitFrame(frame: XRFrame): Promise<void>;

  /**
   * Check if a specific feature is supported.
   * 
   * @param feature - Feature to check
   * @returns Whether the feature is supported
   */
  isFeatureSupported?(feature: XRFeature): boolean;

  /**
   * Get the active session.
   * 
   * @returns Current session or undefined
   */
  getActiveSession?(): IXRSession | undefined;

  /**
   * Register a callback for session events.
   * 
   * @param event - Event type
   * @param callback - Event handler
   */
  onSessionEvent?(
    event: 'started' | 'ended' | 'inputsourceschange' | 'visibilitychange',
    callback: (data: unknown) => void
  ): void;

  /**
   * Calibrate the device (if required).
   * 
   * @returns Promise resolving when calibration is complete
   */
  calibrate?(): Promise<void>;
}
