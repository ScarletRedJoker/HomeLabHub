/**
 * Motion Capture Bridge - Real-time pose and gesture processing
 * Provides motion capture integration for the Nebula Command AI Video Pipeline
 * Supports MediaPipe, OpenPose, and external mocap devices
 * Designed for ControlNet/AnimateDiff motion-controlled video generation
 */

import { EventEmitter } from 'events';

export type InputType = 'webcam' | 'mediapipe' | 'openpose' | 'mocap_device' | 'video_file';
export type ModelType = 'pose' | 'hands' | 'face' | 'holistic';
export type TrackingMode = 'realtime' | 'accurate';
export type Handedness = 'left' | 'right';
export type MotionCaptureStatus = 'idle' | 'initializing' | 'capturing' | 'paused' | 'stopped' | 'error';

export type MotionCaptureEventType =
  | 'pose_detected'
  | 'gesture_recognized'
  | 'face_detected'
  | 'hands_detected'
  | 'tracking_lost'
  | 'status_changed'
  | 'error';

export interface MotionCaptureConfig {
  inputType: InputType;
  modelType: ModelType;
  smoothing: number;
  minConfidence: number;
  trackingMode: TrackingMode;
  frameRate?: number;
  maxHistoryFrames?: number;
  enableSegmentation?: boolean;
  enableWorldLandmarks?: boolean;
}

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
  name: string;
}

export interface PoseData {
  timestamp: number;
  landmarks: Landmark[];
  worldLandmarks?: Landmark[];
  segmentationMask?: Float32Array;
  confidence: number;
}

export interface GestureResult {
  gesture: string;
  confidence: number;
  landmarks: Landmark[];
}

export interface FaceData {
  landmarks: Landmark[];
  blendshapes: Record<string, number>;
  transform: { rotation: number[]; translation: number[] };
}

export interface HandData {
  landmarks: Landmark[];
  handedness: Handedness;
  gestures: GestureResult[];
}

export interface GestureTemplate {
  name: string;
  landmarks: Partial<Landmark>[];
  tolerance: number;
  requiredLandmarks: string[];
}

export interface BoneAngle {
  boneName: string;
  startLandmark: string;
  endLandmark: string;
  angle: number;
  angleX: number;
  angleY: number;
  angleZ: number;
}

export interface SkeletonDefinition {
  name: string;
  bones: Array<{
    name: string;
    parentName: string | null;
    headLandmark: string;
    tailLandmark: string;
  }>;
  landmarkMapping: Record<string, string>;
}

export interface ControlNetPoseData {
  version: string;
  width: number;
  height: number;
  people: Array<{
    pose_keypoints_2d: number[];
    face_keypoints_2d?: number[];
    hand_left_keypoints_2d?: number[];
    hand_right_keypoints_2d?: number[];
  }>;
}

export interface OpenPoseKeypoints {
  version: number;
  people: Array<{
    person_id: number[];
    pose_keypoints_2d: number[];
    face_keypoints_2d: number[];
    hand_left_keypoints_2d: number[];
    hand_right_keypoints_2d: number[];
    pose_keypoints_3d: number[];
    face_keypoints_3d: number[];
    hand_left_keypoints_3d: number[];
    hand_right_keypoints_3d: number[];
  }>;
}

export interface MotionCaptureEvent {
  type: MotionCaptureEventType;
  timestamp: Date;
  data?: any;
}

const POSE_LANDMARK_NAMES = [
  'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer',
  'right_eye_inner', 'right_eye', 'right_eye_outer',
  'left_ear', 'right_ear', 'mouth_left', 'mouth_right',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky',
  'left_index', 'right_index', 'left_thumb', 'right_thumb',
  'left_hip', 'right_hip', 'left_knee', 'right_knee',
  'left_ankle', 'right_ankle', 'left_heel', 'right_heel',
  'left_foot_index', 'right_foot_index'
];

const HAND_LANDMARK_NAMES = [
  'wrist', 'thumb_cmc', 'thumb_mcp', 'thumb_ip', 'thumb_tip',
  'index_finger_mcp', 'index_finger_pip', 'index_finger_dip', 'index_finger_tip',
  'middle_finger_mcp', 'middle_finger_pip', 'middle_finger_dip', 'middle_finger_tip',
  'ring_finger_mcp', 'ring_finger_pip', 'ring_finger_dip', 'ring_finger_tip',
  'pinky_finger_mcp', 'pinky_finger_pip', 'pinky_finger_dip', 'pinky_finger_tip'
];

const OPENPOSE_BODY_MAPPING = [
  'nose', 'neck', 'right_shoulder', 'right_elbow', 'right_wrist',
  'left_shoulder', 'left_elbow', 'left_wrist', 'right_hip', 'right_knee',
  'right_ankle', 'left_hip', 'left_knee', 'left_ankle', 'right_eye',
  'left_eye', 'right_ear', 'left_ear'
];

const BUILT_IN_GESTURES: GestureTemplate[] = [
  {
    name: 'wave',
    landmarks: [
      { name: 'right_wrist', y: 0.3, visibility: 0.8 },
      { name: 'right_elbow', visibility: 0.8 }
    ],
    tolerance: 0.2,
    requiredLandmarks: ['right_wrist', 'right_elbow', 'right_shoulder']
  },
  {
    name: 'thumbs_up',
    landmarks: [
      { name: 'thumb_tip', visibility: 0.8 }
    ],
    tolerance: 0.15,
    requiredLandmarks: ['thumb_tip', 'thumb_ip', 'index_finger_tip']
  },
  {
    name: 'peace',
    landmarks: [
      { name: 'index_finger_tip', visibility: 0.8 },
      { name: 'middle_finger_tip', visibility: 0.8 }
    ],
    tolerance: 0.15,
    requiredLandmarks: ['index_finger_tip', 'middle_finger_tip', 'ring_finger_tip']
  },
  {
    name: 'pointing',
    landmarks: [
      { name: 'index_finger_tip', visibility: 0.9 }
    ],
    tolerance: 0.1,
    requiredLandmarks: ['index_finger_tip', 'index_finger_mcp', 'wrist']
  },
  {
    name: 'fist',
    landmarks: [],
    tolerance: 0.2,
    requiredLandmarks: ['wrist', 'thumb_tip', 'index_finger_tip', 'middle_finger_tip', 'ring_finger_tip', 'pinky_finger_tip']
  },
  {
    name: 'open_palm',
    landmarks: [],
    tolerance: 0.15,
    requiredLandmarks: ['wrist', 'thumb_tip', 'index_finger_tip', 'middle_finger_tip', 'ring_finger_tip', 'pinky_finger_tip']
  }
];

const DEFAULT_SKELETON: SkeletonDefinition = {
  name: 'mediapipe_pose',
  bones: [
    { name: 'spine', parentName: null, headLandmark: 'left_hip', tailLandmark: 'left_shoulder' },
    { name: 'neck', parentName: 'spine', headLandmark: 'left_shoulder', tailLandmark: 'nose' },
    { name: 'left_upper_arm', parentName: 'spine', headLandmark: 'left_shoulder', tailLandmark: 'left_elbow' },
    { name: 'left_forearm', parentName: 'left_upper_arm', headLandmark: 'left_elbow', tailLandmark: 'left_wrist' },
    { name: 'right_upper_arm', parentName: 'spine', headLandmark: 'right_shoulder', tailLandmark: 'right_elbow' },
    { name: 'right_forearm', parentName: 'right_upper_arm', headLandmark: 'right_elbow', tailLandmark: 'right_wrist' },
    { name: 'left_thigh', parentName: 'spine', headLandmark: 'left_hip', tailLandmark: 'left_knee' },
    { name: 'left_shin', parentName: 'left_thigh', headLandmark: 'left_knee', tailLandmark: 'left_ankle' },
    { name: 'right_thigh', parentName: 'spine', headLandmark: 'right_hip', tailLandmark: 'right_knee' },
    { name: 'right_shin', parentName: 'right_thigh', headLandmark: 'right_knee', tailLandmark: 'right_ankle' }
  ],
  landmarkMapping: Object.fromEntries(POSE_LANDMARK_NAMES.map(name => [name, name]))
};

export class MotionCaptureBridge extends EventEmitter {
  private config: MotionCaptureConfig | null = null;
  private status: MotionCaptureStatus = 'idle';
  private latestPose: PoseData | null = null;
  private latestFace: FaceData | null = null;
  private latestLeftHand: HandData | null = null;
  private latestRightHand: HandData | null = null;
  private poseHistory: PoseData[] = [];
  private customGestures: GestureTemplate[] = [];
  private captureInterval: NodeJS.Timeout | null = null;
  private frameCount = 0;
  private lastFrameTime = 0;
  private trackingLostTimeout: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.customGestures = [...BUILT_IN_GESTURES];
  }

  async initialize(config: MotionCaptureConfig): Promise<boolean> {
    try {
      this.setStatus('initializing');
      
      this.config = {
        ...config,
        frameRate: config.frameRate || 30,
        maxHistoryFrames: config.maxHistoryFrames || 30,
        enableSegmentation: config.enableSegmentation ?? false,
        enableWorldLandmarks: config.enableWorldLandmarks ?? true
      };

      this.poseHistory = [];
      this.frameCount = 0;
      this.lastFrameTime = Date.now();

      this.setStatus('idle');
      return true;
    } catch (error) {
      this.setStatus('error');
      this.emitEvent('error', { message: `Failed to initialize: ${error}` });
      return false;
    }
  }

  async start(): Promise<boolean> {
    if (!this.config) {
      this.emitEvent('error', { message: 'Motion capture not initialized' });
      return false;
    }

    if (this.status === 'capturing') {
      return true;
    }

    try {
      this.setStatus('capturing');
      
      const frameInterval = 1000 / (this.config.frameRate || 30);
      this.captureInterval = setInterval(() => {
        this.processFrame();
      }, frameInterval);

      return true;
    } catch (error) {
      this.setStatus('error');
      this.emitEvent('error', { message: `Failed to start capture: ${error}` });
      return false;
    }
  }

  async stop(): Promise<void> {
    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }

    if (this.trackingLostTimeout) {
      clearTimeout(this.trackingLostTimeout);
      this.trackingLostTimeout = null;
    }

    this.setStatus('stopped');
  }

  pause(): void {
    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }
    this.setStatus('paused');
  }

  resume(): void {
    if (this.config && this.status === 'paused') {
      this.start();
    }
  }

  getStatus(): MotionCaptureStatus {
    return this.status;
  }

  getConfig(): MotionCaptureConfig | null {
    return this.config;
  }

  getLatestPose(): PoseData | null {
    return this.latestPose;
  }

  getLatestFace(): FaceData | null {
    return this.latestFace;
  }

  getLatestHands(): { left: HandData | null; right: HandData | null } {
    return {
      left: this.latestLeftHand,
      right: this.latestRightHand
    };
  }

  getPoseHistory(frames: number = 10): PoseData[] {
    return this.poseHistory.slice(-frames);
  }

  detectGesture(landmarks: Landmark[]): GestureResult | null {
    return this.matchGesture(landmarks, this.customGestures);
  }

  registerCustomGesture(name: string, template: Omit<GestureTemplate, 'name'>): void {
    const existingIndex = this.customGestures.findIndex(g => g.name === name);
    const newGesture: GestureTemplate = { name, ...template };
    
    if (existingIndex >= 0) {
      this.customGestures[existingIndex] = newGesture;
    } else {
      this.customGestures.push(newGesture);
    }
  }

  unregisterGesture(name: string): boolean {
    const index = this.customGestures.findIndex(g => g.name === name);
    if (index >= 0) {
      this.customGestures.splice(index, 1);
      return true;
    }
    return false;
  }

  matchGesture(landmarks: Landmark[], templates: GestureTemplate[]): GestureResult | null {
    const landmarkMap = new Map(landmarks.map(l => [l.name, l]));
    let bestMatch: GestureResult | null = null;
    let bestConfidence = 0;

    for (const template of templates) {
      const hasRequired = template.requiredLandmarks.every(name => {
        const landmark = landmarkMap.get(name);
        return landmark && landmark.visibility >= (this.config?.minConfidence || 0.5);
      });

      if (!hasRequired) continue;

      let matchScore = 0;
      let totalChecks = 0;

      if (template.name === 'fist') {
        const fingerTips = ['thumb_tip', 'index_finger_tip', 'middle_finger_tip', 'ring_finger_tip', 'pinky_finger_tip'];
        const wrist = landmarkMap.get('wrist');
        if (wrist) {
          const avgFingerDistance = fingerTips.reduce((sum, name) => {
            const tip = landmarkMap.get(name);
            if (tip) {
              return sum + Math.sqrt(Math.pow(tip.x - wrist.x, 2) + Math.pow(tip.y - wrist.y, 2));
            }
            return sum;
          }, 0) / fingerTips.length;
          matchScore = avgFingerDistance < 0.1 ? 1 : 0;
          totalChecks = 1;
        }
      } else if (template.name === 'open_palm') {
        const fingerTips = ['thumb_tip', 'index_finger_tip', 'middle_finger_tip', 'ring_finger_tip', 'pinky_finger_tip'];
        const wrist = landmarkMap.get('wrist');
        if (wrist) {
          const avgFingerDistance = fingerTips.reduce((sum, name) => {
            const tip = landmarkMap.get(name);
            if (tip) {
              return sum + Math.sqrt(Math.pow(tip.x - wrist.x, 2) + Math.pow(tip.y - wrist.y, 2));
            }
            return sum;
          }, 0) / fingerTips.length;
          matchScore = avgFingerDistance > 0.2 ? 1 : 0;
          totalChecks = 1;
        }
      } else if (template.name === 'thumbs_up') {
        const thumbTip = landmarkMap.get('thumb_tip');
        const indexTip = landmarkMap.get('index_finger_tip');
        const thumbIp = landmarkMap.get('thumb_ip');
        if (thumbTip && indexTip && thumbIp) {
          const thumbUp = thumbTip.y < thumbIp.y;
          const indexCurled = indexTip.y > thumbTip.y;
          matchScore = thumbUp && indexCurled ? 1 : 0;
          totalChecks = 1;
        }
      } else if (template.name === 'peace') {
        const indexTip = landmarkMap.get('index_finger_tip');
        const middleTip = landmarkMap.get('middle_finger_tip');
        const ringTip = landmarkMap.get('ring_finger_tip');
        const wrist = landmarkMap.get('wrist');
        if (indexTip && middleTip && ringTip && wrist) {
          const indexExtended = Math.sqrt(Math.pow(indexTip.x - wrist.x, 2) + Math.pow(indexTip.y - wrist.y, 2)) > 0.2;
          const middleExtended = Math.sqrt(Math.pow(middleTip.x - wrist.x, 2) + Math.pow(middleTip.y - wrist.y, 2)) > 0.2;
          const ringCurled = Math.sqrt(Math.pow(ringTip.x - wrist.x, 2) + Math.pow(ringTip.y - wrist.y, 2)) < 0.15;
          matchScore = indexExtended && middleExtended && ringCurled ? 1 : 0;
          totalChecks = 1;
        }
      } else if (template.name === 'pointing') {
        const indexTip = landmarkMap.get('index_finger_tip');
        const middleTip = landmarkMap.get('middle_finger_tip');
        const wrist = landmarkMap.get('wrist');
        if (indexTip && middleTip && wrist) {
          const indexExtended = Math.sqrt(Math.pow(indexTip.x - wrist.x, 2) + Math.pow(indexTip.y - wrist.y, 2)) > 0.25;
          const middleCurled = Math.sqrt(Math.pow(middleTip.x - wrist.x, 2) + Math.pow(middleTip.y - wrist.y, 2)) < 0.15;
          matchScore = indexExtended && middleCurled ? 1 : 0;
          totalChecks = 1;
        }
      } else if (template.name === 'wave') {
        const wrist = landmarkMap.get('right_wrist');
        const shoulder = landmarkMap.get('right_shoulder');
        if (wrist && shoulder) {
          const armRaised = wrist.y < shoulder.y;
          matchScore = armRaised ? 1 : 0;
          totalChecks = 1;
        }
      } else {
        for (const templateLandmark of template.landmarks) {
          if (!templateLandmark.name) continue;
          const landmark = landmarkMap.get(templateLandmark.name);
          if (!landmark) continue;

          totalChecks++;
          let matches = true;

          if (templateLandmark.y !== undefined) {
            matches = matches && Math.abs(landmark.y - templateLandmark.y) <= template.tolerance;
          }
          if (templateLandmark.x !== undefined) {
            matches = matches && Math.abs(landmark.x - templateLandmark.x) <= template.tolerance;
          }
          if (templateLandmark.visibility !== undefined) {
            matches = matches && landmark.visibility >= templateLandmark.visibility;
          }

          if (matches) matchScore++;
        }
      }

      const confidence = totalChecks > 0 ? matchScore / totalChecks : 0;
      
      if (confidence > bestConfidence && confidence >= 0.7) {
        bestConfidence = confidence;
        bestMatch = {
          gesture: template.name,
          confidence,
          landmarks
        };
      }
    }

    return bestMatch;
  }

  exportToControlNet(poseData: PoseData, width: number = 512, height: number = 512): ControlNetPoseData {
    const keypoints: number[] = [];
    
    for (const landmark of poseData.landmarks) {
      keypoints.push(
        landmark.x * width,
        landmark.y * height,
        landmark.visibility
      );
    }

    const leftHandKeypoints: number[] = [];
    const rightHandKeypoints: number[] = [];
    
    if (this.latestLeftHand) {
      for (const landmark of this.latestLeftHand.landmarks) {
        leftHandKeypoints.push(landmark.x * width, landmark.y * height, landmark.visibility);
      }
    }
    
    if (this.latestRightHand) {
      for (const landmark of this.latestRightHand.landmarks) {
        rightHandKeypoints.push(landmark.x * width, landmark.y * height, landmark.visibility);
      }
    }

    const faceKeypoints: number[] = [];
    if (this.latestFace) {
      for (const landmark of this.latestFace.landmarks) {
        faceKeypoints.push(landmark.x * width, landmark.y * height, landmark.visibility);
      }
    }

    return {
      version: '1.0',
      width,
      height,
      people: [{
        pose_keypoints_2d: keypoints,
        face_keypoints_2d: faceKeypoints.length > 0 ? faceKeypoints : undefined,
        hand_left_keypoints_2d: leftHandKeypoints.length > 0 ? leftHandKeypoints : undefined,
        hand_right_keypoints_2d: rightHandKeypoints.length > 0 ? rightHandKeypoints : undefined
      }]
    };
  }

  exportToOpenPose(poseData: PoseData): OpenPoseKeypoints {
    const landmarkMap = new Map(poseData.landmarks.map(l => [l.name, l]));
    const pose2d: number[] = [];
    const pose3d: number[] = [];

    const neckX = ((landmarkMap.get('left_shoulder')?.x || 0) + (landmarkMap.get('right_shoulder')?.x || 0)) / 2;
    const neckY = ((landmarkMap.get('left_shoulder')?.y || 0) + (landmarkMap.get('right_shoulder')?.y || 0)) / 2;
    const neckZ = ((landmarkMap.get('left_shoulder')?.z || 0) + (landmarkMap.get('right_shoulder')?.z || 0)) / 2;
    const neckVis = Math.min(
      landmarkMap.get('left_shoulder')?.visibility || 0,
      landmarkMap.get('right_shoulder')?.visibility || 0
    );

    for (const boneName of OPENPOSE_BODY_MAPPING) {
      if (boneName === 'neck') {
        pose2d.push(neckX, neckY, neckVis);
        pose3d.push(neckX, neckY, neckZ, neckVis);
      } else {
        const landmark = landmarkMap.get(boneName);
        if (landmark) {
          pose2d.push(landmark.x, landmark.y, landmark.visibility);
          pose3d.push(landmark.x, landmark.y, landmark.z, landmark.visibility);
        } else {
          pose2d.push(0, 0, 0);
          pose3d.push(0, 0, 0, 0);
        }
      }
    }

    const leftHand2d: number[] = [];
    const leftHand3d: number[] = [];
    const rightHand2d: number[] = [];
    const rightHand3d: number[] = [];

    if (this.latestLeftHand) {
      for (const landmark of this.latestLeftHand.landmarks) {
        leftHand2d.push(landmark.x, landmark.y, landmark.visibility);
        leftHand3d.push(landmark.x, landmark.y, landmark.z, landmark.visibility);
      }
    }

    if (this.latestRightHand) {
      for (const landmark of this.latestRightHand.landmarks) {
        rightHand2d.push(landmark.x, landmark.y, landmark.visibility);
        rightHand3d.push(landmark.x, landmark.y, landmark.z, landmark.visibility);
      }
    }

    const face2d: number[] = [];
    const face3d: number[] = [];
    if (this.latestFace) {
      for (const landmark of this.latestFace.landmarks) {
        face2d.push(landmark.x, landmark.y, landmark.visibility);
        face3d.push(landmark.x, landmark.y, landmark.z, landmark.visibility);
      }
    }

    return {
      version: 1.3,
      people: [{
        person_id: [-1],
        pose_keypoints_2d: pose2d,
        face_keypoints_2d: face2d,
        hand_left_keypoints_2d: leftHand2d,
        hand_right_keypoints_2d: rightHand2d,
        pose_keypoints_3d: pose3d,
        face_keypoints_3d: face3d,
        hand_left_keypoints_3d: leftHand3d,
        hand_right_keypoints_3d: rightHand3d
      }]
    };
  }

  applySmoothing<T extends { x: number; y: number; z: number }>(data: T[], factor: number): T[] {
    if (data.length === 0 || factor <= 0 || factor > 1) return data;

    const smoothed: T[] = [];
    const alpha = 1 - factor;

    for (let i = 0; i < data.length; i++) {
      if (i === 0) {
        smoothed.push({ ...data[i] });
      } else {
        smoothed.push({
          ...data[i],
          x: alpha * data[i].x + factor * smoothed[i - 1].x,
          y: alpha * data[i].y + factor * smoothed[i - 1].y,
          z: alpha * data[i].z + factor * smoothed[i - 1].z
        });
      }
    }

    return smoothed;
  }

  calculateBoneAngles(landmarks: Landmark[]): BoneAngle[] {
    const landmarkMap = new Map(landmarks.map(l => [l.name, l]));
    const angles: BoneAngle[] = [];

    for (const bone of DEFAULT_SKELETON.bones) {
      const head = landmarkMap.get(bone.headLandmark);
      const tail = landmarkMap.get(bone.tailLandmark);

      if (head && tail) {
        const dx = tail.x - head.x;
        const dy = tail.y - head.y;
        const dz = tail.z - head.z;

        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        const angleX = Math.atan2(dy, dz) * (180 / Math.PI);
        const angleY = Math.atan2(dx, dz) * (180 / Math.PI);
        const angleZ = Math.atan2(dy, dx) * (180 / Math.PI);
        const angle = Math.acos(dz / (length || 1)) * (180 / Math.PI);

        angles.push({
          boneName: bone.name,
          startLandmark: bone.headLandmark,
          endLandmark: bone.tailLandmark,
          angle,
          angleX,
          angleY,
          angleZ
        });
      }
    }

    return angles;
  }

  normalizePose(landmarks: Landmark[]): Landmark[] {
    if (landmarks.length === 0) return landmarks;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const landmark of landmarks) {
      minX = Math.min(minX, landmark.x);
      minY = Math.min(minY, landmark.y);
      minZ = Math.min(minZ, landmark.z);
      maxX = Math.max(maxX, landmark.x);
      maxY = Math.max(maxY, landmark.y);
      maxZ = Math.max(maxZ, landmark.z);
    }

    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const rangeZ = maxZ - minZ || 1;
    const maxRange = Math.max(rangeX, rangeY, rangeZ);

    return landmarks.map(landmark => ({
      ...landmark,
      x: (landmark.x - minX) / maxRange,
      y: (landmark.y - minY) / maxRange,
      z: (landmark.z - minZ) / maxRange
    }));
  }

  interpolatePose(pose1: PoseData, pose2: PoseData, t: number): PoseData {
    const clampedT = Math.max(0, Math.min(1, t));
    const interpolatedLandmarks: Landmark[] = [];

    const pose1Map = new Map(pose1.landmarks.map(l => [l.name, l]));
    const pose2Map = new Map(pose2.landmarks.map(l => [l.name, l]));

    const allNames = new Set(Array.from(pose1Map.keys()).concat(Array.from(pose2Map.keys())));

    allNames.forEach(name => {
      const l1 = pose1Map.get(name);
      const l2 = pose2Map.get(name);

      if (l1 && l2) {
        interpolatedLandmarks.push({
          name,
          x: l1.x + (l2.x - l1.x) * clampedT,
          y: l1.y + (l2.y - l1.y) * clampedT,
          z: l1.z + (l2.z - l1.z) * clampedT,
          visibility: l1.visibility + (l2.visibility - l1.visibility) * clampedT
        });
      } else if (l1) {
        interpolatedLandmarks.push({ ...l1, visibility: l1.visibility * (1 - clampedT) });
      } else if (l2) {
        interpolatedLandmarks.push({ ...l2, visibility: l2.visibility * clampedT });
      }
    });

    return {
      timestamp: pose1.timestamp + (pose2.timestamp - pose1.timestamp) * clampedT,
      landmarks: interpolatedLandmarks,
      worldLandmarks: pose1.worldLandmarks && pose2.worldLandmarks
        ? this.interpolateLandmarks(pose1.worldLandmarks, pose2.worldLandmarks, clampedT)
        : undefined,
      confidence: pose1.confidence + (pose2.confidence - pose1.confidence) * clampedT
    };
  }

  mirrorPose(landmarks: Landmark[]): Landmark[] {
    const mirrorMap: Record<string, string> = {
      'left_eye_inner': 'right_eye_inner',
      'left_eye': 'right_eye',
      'left_eye_outer': 'right_eye_outer',
      'left_ear': 'right_ear',
      'left_shoulder': 'right_shoulder',
      'left_elbow': 'right_elbow',
      'left_wrist': 'right_wrist',
      'left_pinky': 'right_pinky',
      'left_index': 'right_index',
      'left_thumb': 'right_thumb',
      'left_hip': 'right_hip',
      'left_knee': 'right_knee',
      'left_ankle': 'right_ankle',
      'left_heel': 'right_heel',
      'left_foot_index': 'right_foot_index',
      'mouth_left': 'mouth_right'
    };

    Object.entries(mirrorMap).forEach(([left, right]) => {
      mirrorMap[right] = left;
    });

    return landmarks.map(landmark => {
      const mirroredName = mirrorMap[landmark.name] || landmark.name;
      return {
        ...landmark,
        name: mirroredName,
        x: 1 - landmark.x
      };
    });
  }

  retargetPose(srcLandmarks: Landmark[], targetSkeleton: SkeletonDefinition): Landmark[] {
    const srcMap = new Map(srcLandmarks.map(l => [l.name, l]));
    const retargetedLandmarks: Landmark[] = [];

    for (const [targetName, srcName] of Object.entries(targetSkeleton.landmarkMapping)) {
      const srcLandmark = srcMap.get(srcName);
      if (srcLandmark) {
        retargetedLandmarks.push({
          ...srcLandmark,
          name: targetName
        });
      }
    }

    return retargetedLandmarks;
  }

  getFrameRate(): number {
    const now = Date.now();
    const elapsed = now - this.lastFrameTime;
    return elapsed > 0 ? 1000 / elapsed : 0;
  }

  getFrameCount(): number {
    return this.frameCount;
  }

  updatePoseData(poseData: PoseData): void {
    const smoothing = this.config?.smoothing || 0;
    
    if (smoothing > 0 && this.latestPose) {
      poseData.landmarks = this.applySmoothing(
        [...this.latestPose.landmarks, ...poseData.landmarks].slice(-2),
        smoothing
      ).slice(-poseData.landmarks.length);
    }

    this.latestPose = poseData;
    this.poseHistory.push(poseData);

    const maxHistory = this.config?.maxHistoryFrames || 30;
    if (this.poseHistory.length > maxHistory) {
      this.poseHistory = this.poseHistory.slice(-maxHistory);
    }

    this.emitEvent('pose_detected', poseData);

    const gesture = this.detectGesture(poseData.landmarks);
    if (gesture) {
      this.emitEvent('gesture_recognized', gesture);
    }

    this.resetTrackingLostTimer();
  }

  updateFaceData(faceData: FaceData): void {
    this.latestFace = faceData;
    this.emitEvent('face_detected', faceData);
    this.resetTrackingLostTimer();
  }

  updateHandData(handData: HandData): void {
    if (handData.handedness === 'left') {
      this.latestLeftHand = handData;
    } else {
      this.latestRightHand = handData;
    }
    
    this.emitEvent('hands_detected', {
      left: this.latestLeftHand,
      right: this.latestRightHand
    });

    const gesture = this.detectGesture(handData.landmarks);
    if (gesture) {
      this.emitEvent('gesture_recognized', gesture);
    }

    this.resetTrackingLostTimer();
  }

  private processFrame(): void {
    this.frameCount++;
    this.lastFrameTime = Date.now();
  }

  private interpolateLandmarks(l1: Landmark[], l2: Landmark[], t: number): Landmark[] {
    const map1 = new Map(l1.map(l => [l.name, l]));
    const map2 = new Map(l2.map(l => [l.name, l]));
    const result: Landmark[] = [];

    const allNames = new Set(Array.from(map1.keys()).concat(Array.from(map2.keys())));
    
    allNames.forEach(name => {
      const a = map1.get(name);
      const b = map2.get(name);
      
      if (a && b) {
        result.push({
          name,
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          z: a.z + (b.z - a.z) * t,
          visibility: a.visibility + (b.visibility - a.visibility) * t
        });
      }
    });

    return result;
  }

  private resetTrackingLostTimer(): void {
    if (this.trackingLostTimeout) {
      clearTimeout(this.trackingLostTimeout);
    }

    this.trackingLostTimeout = setTimeout(() => {
      this.emitEvent('tracking_lost', {
        lastPose: this.latestPose,
        lastFace: this.latestFace,
        lastHands: { left: this.latestLeftHand, right: this.latestRightHand }
      });
    }, 1000);
  }

  private setStatus(status: MotionCaptureStatus): void {
    const previousStatus = this.status;
    this.status = status;
    this.emitEvent('status_changed', { previousStatus, currentStatus: status });
  }

  private emitEvent(type: MotionCaptureEventType, data?: any): void {
    const event: MotionCaptureEvent = {
      type,
      timestamp: new Date(),
      data
    };
    this.emit(type, event);
  }
}

let motionCaptureBridgeInstance: MotionCaptureBridge | null = null;

export function getMotionCaptureBridge(): MotionCaptureBridge {
  if (!motionCaptureBridgeInstance) {
    motionCaptureBridgeInstance = new MotionCaptureBridge();
  }
  return motionCaptureBridgeInstance;
}

export function createMotionCaptureBridge(): MotionCaptureBridge {
  return new MotionCaptureBridge();
}

export {
  POSE_LANDMARK_NAMES,
  HAND_LANDMARK_NAMES,
  OPENPOSE_BODY_MAPPING,
  BUILT_IN_GESTURES,
  DEFAULT_SKELETON
};
