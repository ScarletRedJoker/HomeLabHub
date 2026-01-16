/**
 * AI Video Pipeline - Real-time AI video generation with motion control
 * Provides the foundation for video processing pipelines on the Nebula Command platform
 * Integrates with Windows VM AI services via the Nebula Agent API
 */

import { EventEmitter } from 'events';

export type InputSourceType = 'webcam' | 'screen' | 'video_file' | 'motion_capture' | 'audio' | 'image_sequence';
export type ProcessingStepType = 'motion_control' | 'face_swap' | 'lip_sync' | 'style_transfer' | 'background_replace' | 'pose_estimation' | 'video_generation';
export type OutputTargetType = 'obs' | 'file' | 'stream' | 'preview' | 'rtmp';
export type PrecisionType = 'fp16' | 'fp32' | 'int8';
export type PipelineStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

export interface InputSource {
  type: InputSourceType;
  deviceId?: string;
  url?: string;
  settings: Record<string, any>;
}

export interface ProcessingStep {
  id: string;
  type: ProcessingStepType;
  model: string;
  params: Record<string, any>;
  enabled: boolean;
}

export interface OutputTarget {
  type: OutputTargetType;
  config: Record<string, any>;
}

export interface GPUSettings {
  device: number;
  memoryLimit: number;
  batchSize: number;
  precision: PrecisionType;
}

export interface VideoPipelineConfig {
  inputSources: InputSource[];
  processingSteps: ProcessingStep[];
  outputTargets: OutputTarget[];
  gpuSettings: GPUSettings;
}

export interface PipelineMetrics {
  fps: number;
  latencyMs: number;
  gpuUsagePercent: number;
  gpuMemoryUsedMB: number;
  gpuMemoryTotalMB: number;
  framesProcessed: number;
  droppedFrames: number;
  averageStepLatency: Record<string, number>;
}

export interface PipelineState {
  id: string;
  status: PipelineStatus;
  config: VideoPipelineConfig;
  metrics: PipelineMetrics;
  createdAt: Date;
  startedAt?: Date;
  stoppedAt?: Date;
  error?: string;
}

export interface FrameData {
  id: string;
  timestamp: number;
  width: number;
  height: number;
  format: 'rgb' | 'rgba' | 'bgr' | 'bgra' | 'yuv420' | 'nv12';
  data: Buffer | Uint8Array;
  metadata?: Record<string, any>;
}

export interface ProcessedFrame extends FrameData {
  sourceFrameId: string;
  processingTimeMs: number;
  stepsApplied: string[];
}

export interface FrameProcessingResult {
  success: boolean;
  frame?: ProcessedFrame;
  error?: string;
  stepResults: Record<string, { success: boolean; timeMs: number; error?: string }>;
}

export interface BatchProcessingResult {
  success: boolean;
  frames: ProcessedFrame[];
  errors: string[];
  totalTimeMs: number;
  averageFrameTimeMs: number;
}

export interface InterpolationResult {
  success: boolean;
  frames: FrameData[];
  error?: string;
  interpolationTimeMs: number;
}

export type PipelineEventType = 
  | 'frame_processed'
  | 'pipeline_started'
  | 'pipeline_stopped'
  | 'error'
  | 'gpu_warning'
  | 'step_updated'
  | 'metrics_updated';

export interface PipelineEvent {
  type: PipelineEventType;
  pipelineId: string;
  timestamp: Date;
  data?: any;
}

export type VideoModelCategory = 
  | 'animatediff'
  | 'controlnet_video'
  | 'face'
  | 'lip_sync'
  | 'upscaling'
  | 'interpolation';

export interface VideoModel {
  id: string;
  name: string;
  category: VideoModelCategory;
  version: string;
  description: string;
  inputTypes: InputSourceType[];
  outputType: 'frames' | 'video' | 'audio' | 'pose_data';
  requiredVRAM: number;
  supportedPrecisions: PrecisionType[];
  defaultParams: Record<string, any>;
  comfyuiNode?: string;
  huggingfaceId?: string;
}

const VIDEO_MODEL_REGISTRY: VideoModel[] = [
  {
    id: 'animatediff-motion-adapter',
    name: 'AnimateDiff Motion Adapter',
    category: 'animatediff',
    version: '1.5.3',
    description: 'Motion module adapter for adding temporal consistency to image models',
    inputTypes: ['video_file', 'image_sequence'],
    outputType: 'frames',
    requiredVRAM: 4096,
    supportedPrecisions: ['fp16', 'fp32'],
    defaultParams: { motionScale: 1.0, frameCount: 16 },
    comfyuiNode: 'ADE_AnimateDiffLoaderWithContext',
    huggingfaceId: 'guoyww/animatediff-motion-adapter-v1-5-3',
  },
  {
    id: 'animatediff-v3',
    name: 'AnimateDiff v3',
    category: 'animatediff',
    version: '3.0',
    description: 'Third generation AnimateDiff with improved motion quality',
    inputTypes: ['video_file', 'image_sequence', 'webcam'],
    outputType: 'frames',
    requiredVRAM: 6144,
    supportedPrecisions: ['fp16', 'fp32'],
    defaultParams: { motionScale: 1.0, frameCount: 24, fps: 8 },
    comfyuiNode: 'ADE_AnimateDiffLoaderV3',
    huggingfaceId: 'guoyww/animatediff-motion-v3',
  },
  {
    id: 'animatediff-lightning',
    name: 'AnimateDiff Lightning',
    category: 'animatediff',
    version: '1.0',
    description: 'Fast inference AnimateDiff with 4-step generation',
    inputTypes: ['video_file', 'image_sequence', 'webcam'],
    outputType: 'frames',
    requiredVRAM: 4096,
    supportedPrecisions: ['fp16'],
    defaultParams: { steps: 4, motionScale: 1.0 },
    comfyuiNode: 'ADE_AnimateDiffLightning',
    huggingfaceId: 'ByteDance/AnimateDiff-Lightning',
  },
  {
    id: 'controlnet-pose',
    name: 'ControlNet Pose',
    category: 'controlnet_video',
    version: '1.1',
    description: 'Pose-guided video generation using OpenPose skeleton',
    inputTypes: ['video_file', 'motion_capture', 'webcam'],
    outputType: 'frames',
    requiredVRAM: 3072,
    supportedPrecisions: ['fp16', 'fp32'],
    defaultParams: { strength: 1.0, startPercent: 0, endPercent: 1 },
    comfyuiNode: 'ControlNetApplyAdvanced',
    huggingfaceId: 'lllyasviel/control_v11p_sd15_openpose',
  },
  {
    id: 'controlnet-depth',
    name: 'ControlNet Depth',
    category: 'controlnet_video',
    version: '1.1',
    description: 'Depth-guided video generation for 3D-aware synthesis',
    inputTypes: ['video_file', 'webcam', 'screen'],
    outputType: 'frames',
    requiredVRAM: 3072,
    supportedPrecisions: ['fp16', 'fp32'],
    defaultParams: { strength: 1.0, depthEstimator: 'midas' },
    comfyuiNode: 'ControlNetApplyAdvanced',
    huggingfaceId: 'lllyasviel/control_v11f1p_sd15_depth',
  },
  {
    id: 'controlnet-canny',
    name: 'ControlNet Canny',
    category: 'controlnet_video',
    version: '1.1',
    description: 'Edge-guided video generation using Canny edge detection',
    inputTypes: ['video_file', 'webcam', 'screen', 'image_sequence'],
    outputType: 'frames',
    requiredVRAM: 2560,
    supportedPrecisions: ['fp16', 'fp32'],
    defaultParams: { strength: 1.0, lowThreshold: 100, highThreshold: 200 },
    comfyuiNode: 'ControlNetApplyAdvanced',
    huggingfaceId: 'lllyasviel/control_v11p_sd15_canny',
  },
  {
    id: 'controlnet-openpose',
    name: 'ControlNet OpenPose Full',
    category: 'controlnet_video',
    version: '1.1',
    description: 'Full body pose control with hands and face',
    inputTypes: ['video_file', 'motion_capture', 'webcam'],
    outputType: 'frames',
    requiredVRAM: 4096,
    supportedPrecisions: ['fp16', 'fp32'],
    defaultParams: { strength: 1.0, includeHands: true, includeFace: true },
    comfyuiNode: 'ControlNetApplyAdvanced',
    huggingfaceId: 'lllyasviel/control_v11p_sd15_openpose',
  },
  {
    id: 'insightface',
    name: 'InsightFace',
    category: 'face',
    version: '0.7.3',
    description: 'Face detection, recognition, and analysis',
    inputTypes: ['video_file', 'webcam', 'image_sequence'],
    outputType: 'pose_data',
    requiredVRAM: 2048,
    supportedPrecisions: ['fp16', 'fp32'],
    defaultParams: { detectorBackend: 'retinaface', alignMode: 'arcface' },
    comfyuiNode: 'ReActorFaceSwap',
  },
  {
    id: 'gfpgan',
    name: 'GFPGAN',
    category: 'face',
    version: '1.4',
    description: 'Face restoration and enhancement GAN',
    inputTypes: ['video_file', 'webcam', 'image_sequence'],
    outputType: 'frames',
    requiredVRAM: 2048,
    supportedPrecisions: ['fp16', 'fp32'],
    defaultParams: { upscale: 2, bgUpsampler: 'realesrgan' },
    comfyuiNode: 'FaceRestoreWithGFPGAN',
    huggingfaceId: 'TencentARC/GFPGAN',
  },
  {
    id: 'codeformer',
    name: 'CodeFormer',
    category: 'face',
    version: '0.1.0',
    description: 'Robust face restoration with codebook lookup',
    inputTypes: ['video_file', 'webcam', 'image_sequence'],
    outputType: 'frames',
    requiredVRAM: 2560,
    supportedPrecisions: ['fp16', 'fp32'],
    defaultParams: { fidelity: 0.5, upscale: 2 },
    comfyuiNode: 'FaceRestoreWithCodeFormer',
    huggingfaceId: 'sczhou/CodeFormer',
  },
  {
    id: 'wav2lip',
    name: 'Wav2Lip',
    category: 'lip_sync',
    version: '1.0',
    description: 'Audio-driven lip synchronization',
    inputTypes: ['video_file', 'audio', 'webcam'],
    outputType: 'video',
    requiredVRAM: 2048,
    supportedPrecisions: ['fp16', 'fp32'],
    defaultParams: { padTop: 0, padBottom: 10, padLeft: 0, padRight: 0 },
  },
  {
    id: 'sadtalker',
    name: 'SadTalker',
    category: 'lip_sync',
    version: '1.0',
    description: 'Audio-driven talking head generation with expression',
    inputTypes: ['video_file', 'audio', 'image_sequence'],
    outputType: 'video',
    requiredVRAM: 4096,
    supportedPrecisions: ['fp16', 'fp32'],
    defaultParams: { expressionScale: 1.0, stillMode: false, preprocess: 'crop' },
    huggingfaceId: 'vinthony/SadTalker',
  },
  {
    id: 'liveportrait',
    name: 'LivePortrait',
    category: 'lip_sync',
    version: '1.0',
    description: 'Real-time portrait animation with motion transfer',
    inputTypes: ['video_file', 'webcam', 'motion_capture'],
    outputType: 'video',
    requiredVRAM: 4096,
    supportedPrecisions: ['fp16'],
    defaultParams: { stitchingMode: 'standard', eyeRetargeting: true },
    comfyuiNode: 'LivePortraitProcess',
  },
  {
    id: 'realesrgan-video',
    name: 'Real-ESRGAN Video',
    category: 'upscaling',
    version: '0.3.0',
    description: 'Video upscaling with Real-ESRGAN',
    inputTypes: ['video_file', 'image_sequence'],
    outputType: 'frames',
    requiredVRAM: 3072,
    supportedPrecisions: ['fp16', 'fp32'],
    defaultParams: { scale: 4, tileSize: 512, denoiseStrength: 0.5 },
    comfyuiNode: 'UpscaleModelLoader',
    huggingfaceId: 'ai-forever/Real-ESRGAN',
  },
  {
    id: 'rife',
    name: 'RIFE',
    category: 'interpolation',
    version: '4.6',
    description: 'Real-time intermediate flow estimation for frame interpolation',
    inputTypes: ['video_file', 'image_sequence'],
    outputType: 'frames',
    requiredVRAM: 2048,
    supportedPrecisions: ['fp16', 'fp32'],
    defaultParams: { multiplier: 2, fastMode: false, ensemble: true },
    comfyuiNode: 'RIFE VFI',
    huggingfaceId: 'hzwer/ECCV2022-RIFE',
  },
];

export class VideoModelRegistry {
  private models: Map<string, VideoModel> = new Map();

  constructor() {
    for (const model of VIDEO_MODEL_REGISTRY) {
      this.models.set(model.id, model);
    }
  }

  getModel(id: string): VideoModel | undefined {
    return this.models.get(id);
  }

  getModelsByCategory(category: VideoModelCategory): VideoModel[] {
    return Array.from(this.models.values()).filter(m => m.category === category);
  }

  getAllModels(): VideoModel[] {
    return Array.from(this.models.values());
  }

  getModelsForInputType(inputType: InputSourceType): VideoModel[] {
    return Array.from(this.models.values()).filter(m => m.inputTypes.includes(inputType));
  }

  getModelsForVRAM(availableVRAM: number): VideoModel[] {
    return Array.from(this.models.values()).filter(m => m.requiredVRAM <= availableVRAM);
  }

  registerCustomModel(model: VideoModel): void {
    this.models.set(model.id, model);
  }

  unregisterModel(id: string): boolean {
    return this.models.delete(id);
  }
}

export interface NebulaAgentConfig {
  host: string;
  port: number;
  token?: string;
  timeout?: number;
}

const DEFAULT_AGENT_CONFIG: NebulaAgentConfig = {
  host: process.env.NEBULA_AGENT_HOST || '100.118.44.102',
  port: parseInt(process.env.NEBULA_AGENT_PORT || '9765', 10),
  token: process.env.NEBULA_AGENT_TOKEN,
  timeout: 120000,
};

function generatePipelineId(): string {
  return `pipeline-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

function generateFrameId(): string {
  return `frame-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

export class VideoPipelineManager extends EventEmitter {
  private pipelines: Map<string, PipelineState> = new Map();
  private modelRegistry: VideoModelRegistry;
  private agentConfig: NebulaAgentConfig;
  private metricsInterval?: NodeJS.Timeout;
  private processingLoops: Map<string, boolean> = new Map();

  constructor(agentConfig: Partial<NebulaAgentConfig> = {}) {
    super();
    this.modelRegistry = new VideoModelRegistry();
    this.agentConfig = { ...DEFAULT_AGENT_CONFIG, ...agentConfig };
  }

  async createPipeline(config: VideoPipelineConfig): Promise<PipelineState> {
    const id = generatePipelineId();
    
    for (const step of config.processingSteps) {
      const model = this.modelRegistry.getModel(step.model);
      if (!model) {
        throw new Error(`Unknown model: ${step.model}`);
      }
      if (model.requiredVRAM > config.gpuSettings.memoryLimit) {
        throw new Error(`Model ${step.model} requires ${model.requiredVRAM}MB VRAM, but limit is ${config.gpuSettings.memoryLimit}MB`);
      }
    }

    const state: PipelineState = {
      id,
      status: 'idle',
      config,
      metrics: {
        fps: 0,
        latencyMs: 0,
        gpuUsagePercent: 0,
        gpuMemoryUsedMB: 0,
        gpuMemoryTotalMB: config.gpuSettings.memoryLimit,
        framesProcessed: 0,
        droppedFrames: 0,
        averageStepLatency: {},
      },
      createdAt: new Date(),
    };

    this.pipelines.set(id, state);
    return state;
  }

  async startPipeline(pipelineId: string): Promise<boolean> {
    const state = this.pipelines.get(pipelineId);
    if (!state) {
      throw new Error(`Pipeline not found: ${pipelineId}`);
    }

    if (state.status === 'running') {
      return true;
    }

    state.status = 'starting';
    state.startedAt = new Date();
    
    try {
      const gpuStatus = await this.checkGPUStatus();
      if (!gpuStatus.available) {
        throw new Error('GPU not available on remote agent');
      }

      this.processingLoops.set(pipelineId, true);
      state.status = 'running';

      this.emitEvent('pipeline_started', pipelineId, { config: state.config });
      this.startMetricsCollection(pipelineId);

      return true;
    } catch (error: any) {
      state.status = 'error';
      state.error = error.message;
      this.emitEvent('error', pipelineId, { error: error.message });
      return false;
    }
  }

  async stopPipeline(pipelineId: string): Promise<boolean> {
    const state = this.pipelines.get(pipelineId);
    if (!state) {
      throw new Error(`Pipeline not found: ${pipelineId}`);
    }

    if (state.status === 'stopped' || state.status === 'idle') {
      return true;
    }

    state.status = 'stopping';
    this.processingLoops.set(pipelineId, false);

    this.stopMetricsCollection(pipelineId);

    state.status = 'stopped';
    state.stoppedAt = new Date();

    this.emitEvent('pipeline_stopped', pipelineId, { metrics: state.metrics });
    return true;
  }

  async updateStep(pipelineId: string, stepId: string, params: Record<string, any>): Promise<boolean> {
    const state = this.pipelines.get(pipelineId);
    if (!state) {
      throw new Error(`Pipeline not found: ${pipelineId}`);
    }

    const step = state.config.processingSteps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Step not found: ${stepId}`);
    }

    step.params = { ...step.params, ...params };
    
    this.emitEvent('step_updated', pipelineId, { stepId, params: step.params });
    return true;
  }

  getPipelineStatus(pipelineId: string): PipelineState | undefined {
    return this.pipelines.get(pipelineId);
  }

  getAllPipelines(): PipelineState[] {
    return Array.from(this.pipelines.values());
  }

  getRunningPipelines(): PipelineState[] {
    return Array.from(this.pipelines.values()).filter(p => p.status === 'running');
  }

  async getMetrics(pipelineId?: string): Promise<PipelineMetrics | Record<string, PipelineMetrics>> {
    if (pipelineId) {
      const state = this.pipelines.get(pipelineId);
      if (!state) {
        throw new Error(`Pipeline not found: ${pipelineId}`);
      }
      return state.metrics;
    }

    const allMetrics: Record<string, PipelineMetrics> = {};
    this.pipelines.forEach((state, id) => {
      allMetrics[id] = state.metrics;
    });
    return allMetrics;
  }

  async processFrame(frame: FrameData, steps: ProcessingStep[]): Promise<FrameProcessingResult> {
    const startTime = Date.now();
    const stepResults: Record<string, { success: boolean; timeMs: number; error?: string }> = {};
    let currentFrame = frame;
    const stepsApplied: string[] = [];

    for (const step of steps) {
      if (!step.enabled) continue;

      const stepStart = Date.now();
      try {
        const result = await this.executeProcessingStep(currentFrame, step);
        stepResults[step.id] = { success: true, timeMs: Date.now() - stepStart };
        stepsApplied.push(step.id);
        
        if (result.frame) {
          currentFrame = result.frame;
        }
      } catch (error: any) {
        stepResults[step.id] = { success: false, timeMs: Date.now() - stepStart, error: error.message };
        return {
          success: false,
          error: `Step ${step.id} failed: ${error.message}`,
          stepResults,
        };
      }
    }

    const processedFrame: ProcessedFrame = {
      ...currentFrame,
      id: generateFrameId(),
      sourceFrameId: frame.id,
      processingTimeMs: Date.now() - startTime,
      stepsApplied,
    };

    return { success: true, frame: processedFrame, stepResults };
  }

  async processBatch(frames: FrameData[], steps: ProcessingStep[]): Promise<BatchProcessingResult> {
    const startTime = Date.now();
    const processedFrames: ProcessedFrame[] = [];
    const errors: string[] = [];

    const batchPromises = frames.map(async (frame) => {
      const result = await this.processFrame(frame, steps);
      return { frame, result };
    });

    const results = await Promise.all(batchPromises);

    for (const { frame, result } of results) {
      if (result.success && result.frame) {
        processedFrames.push(result.frame);
      } else {
        errors.push(`Frame ${frame.id}: ${result.error}`);
      }
    }

    const totalTimeMs = Date.now() - startTime;
    return {
      success: errors.length === 0,
      frames: processedFrames,
      errors,
      totalTimeMs,
      averageFrameTimeMs: totalTimeMs / frames.length,
    };
  }

  async interpolateFrames(frame1: FrameData, frame2: FrameData, count: number): Promise<InterpolationResult> {
    const startTime = Date.now();

    try {
      const response = await this.callAgent('/api/ai/interpolate', 'POST', {
        frame1: {
          width: frame1.width,
          height: frame1.height,
          format: frame1.format,
          data: Buffer.isBuffer(frame1.data) ? frame1.data.toString('base64') : Buffer.from(frame1.data).toString('base64'),
        },
        frame2: {
          width: frame2.width,
          height: frame2.height,
          format: frame2.format,
          data: Buffer.isBuffer(frame2.data) ? frame2.data.toString('base64') : Buffer.from(frame2.data).toString('base64'),
        },
        count,
        model: 'rife',
      });

      if (!response.success) {
        return {
          success: false,
          frames: [],
          error: response.error || 'Interpolation failed',
          interpolationTimeMs: Date.now() - startTime,
        };
      }

      const interpolatedFrames: FrameData[] = (response.frames || []).map((f: any, i: number) => ({
        id: generateFrameId(),
        timestamp: frame1.timestamp + ((frame2.timestamp - frame1.timestamp) * (i + 1)) / (count + 1),
        width: f.width || frame1.width,
        height: f.height || frame1.height,
        format: f.format || frame1.format,
        data: Buffer.from(f.data, 'base64'),
      }));

      return {
        success: true,
        frames: interpolatedFrames,
        interpolationTimeMs: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        frames: [],
        error: error.message,
        interpolationTimeMs: Date.now() - startTime,
      };
    }
  }

  getModelRegistry(): VideoModelRegistry {
    return this.modelRegistry;
  }

  deletePipeline(pipelineId: string): boolean {
    const state = this.pipelines.get(pipelineId);
    if (!state) return false;

    if (state.status === 'running') {
      this.stopPipeline(pipelineId);
    }

    return this.pipelines.delete(pipelineId);
  }

  private async executeProcessingStep(frame: FrameData, step: ProcessingStep): Promise<{ success: boolean; frame?: FrameData }> {
    const model = this.modelRegistry.getModel(step.model);
    if (!model) {
      throw new Error(`Unknown model: ${step.model}`);
    }

    const endpoint = this.getEndpointForStepType(step.type);
    const payload = {
      frame: {
        width: frame.width,
        height: frame.height,
        format: frame.format,
        data: Buffer.isBuffer(frame.data) ? frame.data.toString('base64') : Buffer.from(frame.data).toString('base64'),
      },
      model: step.model,
      params: step.params,
    };

    const response = await this.callAgent(endpoint, 'POST', payload);

    if (!response.success) {
      throw new Error(response.error || 'Processing step failed');
    }

    if (response.frame) {
      return {
        success: true,
        frame: {
          id: generateFrameId(),
          timestamp: frame.timestamp,
          width: response.frame.width || frame.width,
          height: response.frame.height || frame.height,
          format: response.frame.format || frame.format,
          data: Buffer.from(response.frame.data, 'base64'),
          metadata: { ...frame.metadata, ...response.metadata },
        },
      };
    }

    return { success: true };
  }

  private getEndpointForStepType(type: ProcessingStepType): string {
    const endpoints: Record<ProcessingStepType, string> = {
      motion_control: '/api/ai/video/motion',
      face_swap: '/api/ai/video/faceswap',
      lip_sync: '/api/ai/video/lipsync',
      style_transfer: '/api/ai/video/style',
      background_replace: '/api/ai/video/background',
      pose_estimation: '/api/ai/video/pose',
      video_generation: '/api/ai/video/generate',
    };
    return endpoints[type] || '/api/ai/video/process';
  }

  private async callAgent(endpoint: string, method: 'GET' | 'POST', body?: any): Promise<any> {
    const url = `http://${this.agentConfig.host}:${this.agentConfig.port}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (this.agentConfig.token) {
      headers['Authorization'] = `Bearer ${this.agentConfig.token}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.agentConfig.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return { success: false, error: `Agent returned ${response.status}` };
      }

      return await response.json();
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        return { success: false, error: 'Request timeout' };
      }
      return { success: false, error: error.message };
    }
  }

  private async checkGPUStatus(): Promise<{ available: boolean; memory?: { used: number; total: number }; utilization?: number }> {
    try {
      const response = await this.callAgent('/api/health', 'GET');
      
      if (!response.success || !response.gpu) {
        return { available: false };
      }

      const gpu = response.gpu;
      return {
        available: true,
        memory: {
          used: gpu.memoryUsed || 0,
          total: gpu.memoryTotal || 0,
        },
        utilization: gpu.utilization || 0,
      };
    } catch {
      return { available: false };
    }
  }

  private startMetricsCollection(pipelineId: string): void {
    const collectMetrics = async () => {
      const state = this.pipelines.get(pipelineId);
      if (!state || state.status !== 'running') return;

      try {
        const gpuStatus = await this.checkGPUStatus();
        if (gpuStatus.available) {
          state.metrics.gpuUsagePercent = gpuStatus.utilization || 0;
          state.metrics.gpuMemoryUsedMB = gpuStatus.memory?.used || 0;
          state.metrics.gpuMemoryTotalMB = gpuStatus.memory?.total || state.config.gpuSettings.memoryLimit;

          if (gpuStatus.memory && gpuStatus.memory.used / gpuStatus.memory.total > 0.9) {
            this.emitEvent('gpu_warning', pipelineId, {
              message: 'GPU memory usage above 90%',
              memoryUsed: gpuStatus.memory.used,
              memoryTotal: gpuStatus.memory.total,
            });
          }
        }

        this.emitEvent('metrics_updated', pipelineId, { metrics: state.metrics });
      } catch (error) {
        console.error(`[Pipeline ${pipelineId}] Metrics collection error:`, error);
      }
    };

    this.metricsInterval = setInterval(collectMetrics, 1000);
    collectMetrics();
  }

  private stopMetricsCollection(pipelineId: string): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }
  }

  private emitEvent(type: PipelineEventType, pipelineId: string, data?: any): void {
    const event: PipelineEvent = {
      type,
      pipelineId,
      timestamp: new Date(),
      data,
    };
    this.emit(type, event);
    this.emit('event', event);
  }

  onEvent(type: PipelineEventType, callback: (event: PipelineEvent) => void): void {
    this.on(type, callback);
  }

  offEvent(type: PipelineEventType, callback: (event: PipelineEvent) => void): void {
    this.off(type, callback);
  }
}

export const videoModelRegistry = new VideoModelRegistry();
export const videoPipelineManager = new VideoPipelineManager();

export function createVideoPipeline(config: VideoPipelineConfig): Promise<PipelineState> {
  return videoPipelineManager.createPipeline(config);
}

export function getVideoModels(category?: VideoModelCategory): VideoModel[] {
  if (category) {
    return videoModelRegistry.getModelsByCategory(category);
  }
  return videoModelRegistry.getAllModels();
}
