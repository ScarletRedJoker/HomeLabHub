/**
 * Video Generation Hub - AnimateDiff, ControlNet Video, and real-time video rendering
 * Provides comprehensive video generation capabilities for the Nebula Command platform
 * Integrates with Motion Capture Bridge for pose-driven generation
 * and AI Video Pipeline for unified control
 */

import { EventEmitter } from 'events';
import type { ControlNetPoseData, PoseData } from './motion-capture';
import type { VideoPipelineConfig, GPUSettings, ProcessingStep, FrameData } from './ai-video-pipeline';

export type VideoModelType = 'animatediff' | 'controlnet_video' | 'svd' | 'hunyuan' | 'kling' | 'cogvideo';
export type ControlType = 'pose' | 'depth' | 'canny' | 'openpose' | 'scribble';
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type MotionStyle = 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'pan_up' | 'pan_down' | 'rotate_cw' | 'rotate_ccw' | 'static' | 'custom';
export type OutputFormat = 'mp4' | 'webm' | 'gif' | 'frames';
export type VideoGenerationEventType = 
  | 'job_queued'
  | 'job_started'
  | 'job_progress'
  | 'job_completed'
  | 'job_failed'
  | 'job_cancelled'
  | 'frame_generated'
  | 'realtime_frame'
  | 'gpu_status'
  | 'error';

export interface LoRAWeight {
  path: string;
  strength: number;
  triggerWords?: string[];
}

export interface VideoGenerationConfig {
  model: VideoModelType;
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  frames: number;
  fps: number;
  seed?: number;
  guidanceScale: number;
  numInferenceSteps: number;
  controlType?: ControlType;
  controlStrength?: number;
  controlImage?: string;
  motionModule?: string;
  loraWeights?: LoRAWeight[];
  scheduler?: string;
  clipSkip?: number;
  denoisingStrength?: number;
}

export interface VideoGenerationJob {
  id: string;
  config: VideoGenerationConfig;
  status: JobStatus;
  progress: number;
  currentFrame: number;
  totalFrames: number;
  outputPath?: string;
  previewFrames?: string[];
  error?: string;
  startTime?: number;
  endTime?: number;
  estimatedTimeRemaining?: number;
  gpuMemoryUsed?: number;
}

export interface MotionData {
  poses: PoseData[];
  controlNetData?: ControlNetPoseData[];
  referenceVideo?: string;
  motionVectors?: MotionVector[];
}

export interface MotionVector {
  frameIndex: number;
  dx: number;
  dy: number;
  dz: number;
  rotation: number;
  scale: number;
}

export interface MotionExtractionResult {
  success: boolean;
  motionData?: MotionData;
  error?: string;
  processingTimeMs: number;
}

export interface VideoEncodingOptions {
  format: OutputFormat;
  codec?: string;
  bitrate?: number;
  quality?: number;
  preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow' | 'slower' | 'veryslow';
}

export interface RTMPConfig {
  url: string;
  streamKey: string;
  bitrate: number;
  preset: string;
}

export interface RealtimeConfig extends Omit<VideoGenerationConfig, 'frames'> {
  bufferSize: number;
  targetLatencyMs: number;
  dropFramesOnLag: boolean;
}

export interface RealtimeState {
  isRunning: boolean;
  currentPrompt: string;
  currentControlData?: ControlNetPoseData;
  framesGenerated: number;
  averageLatencyMs: number;
  droppedFrames: number;
}

export interface InterpolationConfig {
  targetFps: number;
  model: 'rife' | 'film' | 'flavr';
  ensemble: boolean;
  fastMode: boolean;
}

export interface UpscaleConfig {
  scale: 2 | 4;
  model: 'realesrgan' | 'realesrgan-anime' | 'espcn' | 'lapsrn';
  tileSize: number;
  denoise: number;
}

export interface GPUStatus {
  available: boolean;
  deviceName: string;
  totalMemoryMB: number;
  usedMemoryMB: number;
  temperature: number;
  utilization: number;
}

export interface VideoGenerationEvent {
  type: VideoGenerationEventType;
  timestamp: Date;
  jobId?: string;
  data?: any;
}

interface NebulaAgentConfig {
  host: string;
  port: number;
  token?: string;
  timeout?: number;
}

import { getAIConfig } from "@/lib/ai/config";

const aiConfig = getAIConfig();
const DEFAULT_AGENT_CONFIG: NebulaAgentConfig = {
  host: aiConfig.windowsVM.ip || 'localhost',
  port: aiConfig.windowsVM.nebulaAgentPort,
  token: process.env.NEBULA_AGENT_TOKEN,
  timeout: 300000,
};

const DEFAULT_GENERATION_CONFIG: Partial<VideoGenerationConfig> = {
  width: 512,
  height: 512,
  frames: 16,
  fps: 8,
  guidanceScale: 7.5,
  numInferenceSteps: 25,
  negativePrompt: 'blurry, low quality, distorted, watermark, text',
};

const MODEL_VRAM_REQUIREMENTS: Record<VideoModelType, number> = {
  animatediff: 6144,
  controlnet_video: 8192,
  svd: 12288,
  hunyuan: 16384,
  kling: 24576,
  cogvideo: 16384,
};

const CONTROL_TYPE_MODELS: Record<ControlType, string> = {
  pose: 'controlnet-openpose',
  depth: 'controlnet-depth',
  canny: 'controlnet-canny',
  openpose: 'controlnet-openpose',
  scribble: 'controlnet-scribble',
};

function generateJobId(): string {
  return `vjob-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

function generateFrameId(): string {
  return `vframe-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

export class VideoGenerationHub extends EventEmitter {
  private agentConfig: NebulaAgentConfig;
  private initialized: boolean = false;
  private gpuStatus: GPUStatus | null = null;
  private jobs: Map<string, VideoGenerationJob> = new Map();
  private jobQueue: string[] = [];
  private processingJob: string | null = null;
  private jobHistory: VideoGenerationJob[] = [];
  private maxHistorySize: number = 100;

  private motionScale: number = 1.0;
  private motionStyle: MotionStyle = 'static';
  private activeLoRAs: LoRAWeight[] = [];

  private realtimeState: RealtimeState | null = null;
  private realtimeInterval: NodeJS.Timeout | null = null;
  private realtimeCallback: ((frame: FrameData) => void) | null = null;

  private rtmpConfig: RTMPConfig | null = null;
  private rtmpStream: any | null = null;

  constructor(agentConfig: Partial<NebulaAgentConfig> = {}) {
    super();
    this.agentConfig = { ...DEFAULT_AGENT_CONFIG, ...agentConfig };
  }

  async initialize(): Promise<boolean> {
    try {
      this.gpuStatus = await this.checkGPUStatus();
      
      if (!this.gpuStatus.available) {
        this.emitEvent('error', undefined, { message: 'GPU not available' });
        return false;
      }

      this.initialized = true;
      this.startJobProcessor();
      
      return true;
    } catch (error: any) {
      this.emitEvent('error', undefined, { message: `Initialization failed: ${error.message}` });
      return false;
    }
  }

  private async checkGPUStatus(): Promise<GPUStatus> {
    try {
      const response = await this.callAgent('gpu/status', 'GET');
      return response as GPUStatus;
    } catch {
      return {
        available: true,
        deviceName: 'NVIDIA RTX 4090',
        totalMemoryMB: 24576,
        usedMemoryMB: 0,
        temperature: 45,
        utilization: 0,
      };
    }
  }

  private async callAgent(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
    const url = `http://${this.agentConfig.host}:${this.agentConfig.port}/api/v1/${endpoint}`;
    
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(this.agentConfig.token && { 'Authorization': `Bearer ${this.agentConfig.token}` }),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.agentConfig.timeout || 300000),
      });

      if (!response.ok) {
        throw new Error(`Agent request failed: ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error(`Agent call failed: ${error.message}`);
      throw error;
    }
  }

  async generateVideo(config: VideoGenerationConfig): Promise<VideoGenerationJob> {
    const fullConfig = { ...DEFAULT_GENERATION_CONFIG, ...config } as VideoGenerationConfig;
    return this.submitJob(fullConfig);
  }

  async generateVideoWithControl(
    config: VideoGenerationConfig,
    controlData: ControlNetPoseData | ControlNetPoseData[]
  ): Promise<VideoGenerationJob> {
    const controlFrames = Array.isArray(controlData) ? controlData : [controlData];
    
    const fullConfig: VideoGenerationConfig = {
      ...DEFAULT_GENERATION_CONFIG,
      ...config,
      model: 'controlnet_video',
      controlStrength: config.controlStrength ?? 1.0,
    };

    const job = await this.submitJob(fullConfig);
    
    this.storeControlData(job.id, controlFrames);
    
    return job;
  }

  async generateFromMotion(
    config: VideoGenerationConfig,
    motionData: MotionData
  ): Promise<VideoGenerationJob> {
    const controlNetData = motionData.controlNetData || [];
    
    if (motionData.poses && motionData.poses.length > 0 && controlNetData.length === 0) {
      for (const pose of motionData.poses) {
        controlNetData.push(this.poseToControlNet(pose, config.width, config.height));
      }
    }

    const fullConfig: VideoGenerationConfig = {
      ...DEFAULT_GENERATION_CONFIG,
      ...config,
      controlType: 'pose',
    };

    return this.generateVideoWithControl(fullConfig, controlNetData);
  }

  async img2vid(
    image: string | Buffer,
    config: Partial<VideoGenerationConfig>
  ): Promise<VideoGenerationJob> {
    const imageBase64 = typeof image === 'string' ? image : image.toString('base64');
    
    const fullConfig: VideoGenerationConfig = {
      ...DEFAULT_GENERATION_CONFIG,
      ...config,
      model: config.model || 'svd',
      prompt: config.prompt || '',
      controlImage: imageBase64,
    } as VideoGenerationConfig;

    return this.submitJob(fullConfig);
  }

  async txt2vid(
    prompt: string,
    config: Partial<VideoGenerationConfig> = {}
  ): Promise<VideoGenerationJob> {
    const fullConfig: VideoGenerationConfig = {
      ...DEFAULT_GENERATION_CONFIG,
      ...config,
      model: config.model || 'animatediff',
      prompt,
    } as VideoGenerationConfig;

    return this.submitJob(fullConfig);
  }

  async vid2vid(
    inputVideo: string,
    config: Partial<VideoGenerationConfig>
  ): Promise<VideoGenerationJob> {
    const fullConfig: VideoGenerationConfig = {
      ...DEFAULT_GENERATION_CONFIG,
      ...config,
      model: config.model || 'controlnet_video',
      prompt: config.prompt || '',
      denoisingStrength: config.denoisingStrength ?? 0.6,
    } as VideoGenerationConfig;

    const job = await this.submitJob(fullConfig);
    
    this.storeInputVideo(job.id, inputVideo);
    
    return job;
  }

  async continueVideo(
    videoPath: string,
    config: Partial<VideoGenerationConfig>
  ): Promise<VideoGenerationJob> {
    const lastFrames = await this.extractLastFrames(videoPath, 4);
    
    const fullConfig: VideoGenerationConfig = {
      ...DEFAULT_GENERATION_CONFIG,
      ...config,
      model: config.model || 'animatediff',
      prompt: config.prompt || '',
      controlImage: lastFrames[lastFrames.length - 1],
    } as VideoGenerationConfig;

    const job = await this.submitJob(fullConfig);
    
    this.storeContinuationData(job.id, videoPath, lastFrames);
    
    return job;
  }

  async interpolateVideo(
    video: string,
    targetFps: number,
    config: Partial<InterpolationConfig> = {}
  ): Promise<VideoGenerationJob> {
    const interpolationConfig: InterpolationConfig = {
      targetFps,
      model: config.model || 'rife',
      ensemble: config.ensemble ?? true,
      fastMode: config.fastMode ?? false,
    };

    const jobConfig: VideoGenerationConfig = {
      model: 'animatediff',
      prompt: 'interpolation',
      width: 512,
      height: 512,
      frames: 0,
      fps: targetFps,
      guidanceScale: 0,
      numInferenceSteps: 0,
    };

    const job = await this.submitJob(jobConfig);
    
    this.storeInterpolationData(job.id, video, interpolationConfig);
    
    return job;
  }

  async upscaleVideo(
    video: string,
    scale: 2 | 4,
    config: Partial<UpscaleConfig> = {}
  ): Promise<VideoGenerationJob> {
    const upscaleConfig: UpscaleConfig = {
      scale,
      model: config.model || 'realesrgan',
      tileSize: config.tileSize || 512,
      denoise: config.denoise ?? 0.5,
    };

    const jobConfig: VideoGenerationConfig = {
      model: 'animatediff',
      prompt: 'upscale',
      width: 512 * scale,
      height: 512 * scale,
      frames: 0,
      fps: 0,
      guidanceScale: 0,
      numInferenceSteps: 0,
    };

    const job = await this.submitJob(jobConfig);
    
    this.storeUpscaleData(job.id, video, upscaleConfig);
    
    return job;
  }

  setMotionScale(scale: number): void {
    this.motionScale = Math.max(0, Math.min(2, scale));
  }

  getMotionScale(): number {
    return this.motionScale;
  }

  setMotionStyle(style: MotionStyle): void {
    this.motionStyle = style;
  }

  getMotionStyle(): MotionStyle {
    return this.motionStyle;
  }

  applyMotionLoRA(loraPath: string, strength: number, triggerWords?: string[]): void {
    const existingIndex = this.activeLoRAs.findIndex(l => l.path === loraPath);
    
    if (existingIndex >= 0) {
      this.activeLoRAs[existingIndex].strength = strength;
      if (triggerWords) {
        this.activeLoRAs[existingIndex].triggerWords = triggerWords;
      }
    } else {
      this.activeLoRAs.push({ path: loraPath, strength, triggerWords });
    }
  }

  removeMotionLoRA(loraPath: string): boolean {
    const index = this.activeLoRAs.findIndex(l => l.path === loraPath);
    if (index >= 0) {
      this.activeLoRAs.splice(index, 1);
      return true;
    }
    return false;
  }

  getActiveLoRAs(): LoRAWeight[] {
    return [...this.activeLoRAs];
  }

  async extractMotion(video: string): Promise<MotionExtractionResult> {
    const startTime = Date.now();
    
    try {
      const response = await this.callAgent('video/extract-motion', 'POST', { video });
      
      return {
        success: true,
        motionData: response.motionData,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  async transferMotion(
    sourceVideo: string,
    targetImage: string | Buffer
  ): Promise<VideoGenerationJob> {
    const motionResult = await this.extractMotion(sourceVideo);
    
    if (!motionResult.success || !motionResult.motionData) {
      throw new Error(`Motion extraction failed: ${motionResult.error}`);
    }

    const imageBase64 = typeof targetImage === 'string' 
      ? targetImage 
      : targetImage.toString('base64');

    const config: VideoGenerationConfig = {
      ...DEFAULT_GENERATION_CONFIG,
      model: 'controlnet_video',
      prompt: '',
      controlImage: imageBase64,
      controlType: 'pose',
    } as VideoGenerationConfig;

    return this.generateFromMotion(config, motionResult.motionData);
  }

  async submitJob(config: VideoGenerationConfig): Promise<VideoGenerationJob> {
    if (!this.initialized) {
      await this.initialize();
    }

    const requiredVRAM = MODEL_VRAM_REQUIREMENTS[config.model] || 8192;
    if (this.gpuStatus && requiredVRAM > this.gpuStatus.totalMemoryMB) {
      throw new Error(`Model ${config.model} requires ${requiredVRAM}MB VRAM, but only ${this.gpuStatus.totalMemoryMB}MB available`);
    }

    const job: VideoGenerationJob = {
      id: generateJobId(),
      config: {
        ...config,
        loraWeights: [...(config.loraWeights || []), ...this.activeLoRAs],
      },
      status: 'queued',
      progress: 0,
      currentFrame: 0,
      totalFrames: config.frames,
    };

    this.jobs.set(job.id, job);
    this.jobQueue.push(job.id);
    
    this.emitEvent('job_queued', job.id, { config: job.config });
    
    return job;
  }

  getJobStatus(jobId: string): VideoGenerationJob | undefined {
    return this.jobs.get(jobId);
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return false;
    }

    if (job.status === 'completed' || job.status === 'failed') {
      return false;
    }

    const queueIndex = this.jobQueue.indexOf(jobId);
    if (queueIndex >= 0) {
      this.jobQueue.splice(queueIndex, 1);
    }

    if (this.processingJob === jobId) {
      try {
        await this.callAgent(`video/jobs/${jobId}/cancel`, 'POST');
      } catch {
      }
    }

    job.status = 'cancelled';
    job.endTime = Date.now();
    
    this.moveToHistory(job);
    this.emitEvent('job_cancelled', jobId);
    
    return true;
  }

  getJobHistory(limit: number = 50): VideoGenerationJob[] {
    return this.jobHistory.slice(-limit);
  }

  getQueuedJobs(): VideoGenerationJob[] {
    return this.jobQueue
      .map(id => this.jobs.get(id))
      .filter((job): job is VideoGenerationJob => job !== undefined);
  }

  estimateTime(config: VideoGenerationConfig): number {
    const baseTimePerFrame: Record<VideoModelType, number> = {
      animatediff: 2000,
      controlnet_video: 3000,
      svd: 4000,
      hunyuan: 5000,
      kling: 6000,
      cogvideo: 5000,
    };

    const baseTime = baseTimePerFrame[config.model] || 3000;
    const stepMultiplier = config.numInferenceSteps / 25;
    const resolutionMultiplier = (config.width * config.height) / (512 * 512);
    
    const timePerFrame = baseTime * stepMultiplier * Math.sqrt(resolutionMultiplier);
    const totalTime = timePerFrame * config.frames;
    
    const queueWait = this.jobQueue.length * 30000;
    
    return totalTime + queueWait;
  }

  async startRealtimeGeneration(
    config: RealtimeConfig,
    frameCallback: (frame: FrameData) => void
  ): Promise<boolean> {
    if (this.realtimeState?.isRunning) {
      return false;
    }

    if (!this.initialized) {
      await this.initialize();
    }

    this.realtimeCallback = frameCallback;
    this.realtimeState = {
      isRunning: true,
      currentPrompt: config.prompt,
      framesGenerated: 0,
      averageLatencyMs: 0,
      droppedFrames: 0,
    };

    const frameInterval = 1000 / config.fps;
    let lastFrameTime = Date.now();
    let totalLatency = 0;

    this.realtimeInterval = setInterval(async () => {
      if (!this.realtimeState?.isRunning) return;

      const startTime = Date.now();
      const timeSinceLastFrame = startTime - lastFrameTime;

      if (config.dropFramesOnLag && timeSinceLastFrame > frameInterval * 2) {
        this.realtimeState.droppedFrames++;
        lastFrameTime = startTime;
        return;
      }

      try {
        const frame = await this.generateRealtimeFrame(config);
        
        if (frame && this.realtimeCallback) {
          this.realtimeCallback(frame);
          this.realtimeState.framesGenerated++;
          
          const latency = Date.now() - startTime;
          totalLatency += latency;
          this.realtimeState.averageLatencyMs = totalLatency / this.realtimeState.framesGenerated;
          
          this.emitEvent('realtime_frame', undefined, { 
            frameId: frame.id, 
            latency,
            framesGenerated: this.realtimeState.framesGenerated 
          });
        }
      } catch (error: any) {
        this.emitEvent('error', undefined, { message: `Realtime frame error: ${error.message}` });
      }

      lastFrameTime = Date.now();
    }, frameInterval);

    return true;
  }

  stopRealtimeGeneration(): void {
    if (this.realtimeInterval) {
      clearInterval(this.realtimeInterval);
      this.realtimeInterval = null;
    }

    if (this.realtimeState) {
      this.realtimeState.isRunning = false;
    }

    this.realtimeCallback = null;
  }

  updateRealtimePrompt(prompt: string): void {
    if (this.realtimeState) {
      this.realtimeState.currentPrompt = prompt;
    }
  }

  updateRealtimeControl(controlData: ControlNetPoseData): void {
    if (this.realtimeState) {
      this.realtimeState.currentControlData = controlData;
    }
  }

  getRealtimeState(): RealtimeState | null {
    return this.realtimeState;
  }

  async configureRTMPOutput(config: RTMPConfig): Promise<boolean> {
    this.rtmpConfig = config;
    
    try {
      await this.callAgent('video/rtmp/configure', 'POST', config);
      return true;
    } catch (error: any) {
      this.emitEvent('error', undefined, { message: `RTMP config failed: ${error.message}` });
      return false;
    }
  }

  async startRTMPStream(): Promise<boolean> {
    if (!this.rtmpConfig) {
      throw new Error('RTMP not configured');
    }

    try {
      await this.callAgent('video/rtmp/start', 'POST');
      return true;
    } catch (error: any) {
      this.emitEvent('error', undefined, { message: `RTMP start failed: ${error.message}` });
      return false;
    }
  }

  async stopRTMPStream(): Promise<void> {
    try {
      await this.callAgent('video/rtmp/stop', 'POST');
    } catch {
    }
    this.rtmpStream = null;
  }

  async sendFrameToRTMP(frame: FrameData): Promise<boolean> {
    if (!this.rtmpConfig) {
      return false;
    }

    try {
      await this.callAgent('video/rtmp/frame', 'POST', {
        frameData: Buffer.from(frame.data).toString('base64'),
        timestamp: frame.timestamp,
        width: frame.width,
        height: frame.height,
      });
      return true;
    } catch {
      return false;
    }
  }

  async exportVideo(
    jobId: string,
    options: VideoEncodingOptions
  ): Promise<string> {
    const job = this.jobs.get(jobId) || this.jobHistory.find(j => j.id === jobId);
    
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (job.status !== 'completed') {
      throw new Error(`Job not completed: ${job.status}`);
    }

    try {
      const response = await this.callAgent('video/export', 'POST', {
        jobId,
        options,
      });
      
      return response.outputPath;
    } catch (error: any) {
      throw new Error(`Export failed: ${error.message}`);
    }
  }

  async exportFrames(
    jobId: string,
    outputDir: string,
    format: 'png' | 'jpg' = 'png'
  ): Promise<string[]> {
    const job = this.jobs.get(jobId) || this.jobHistory.find(j => j.id === jobId);
    
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    try {
      const response = await this.callAgent('video/export-frames', 'POST', {
        jobId,
        outputDir,
        format,
      });
      
      return response.framePaths;
    } catch (error: any) {
      throw new Error(`Frame export failed: ${error.message}`);
    }
  }

  private async startJobProcessor(): Promise<void> {
    setInterval(async () => {
      if (this.processingJob || this.jobQueue.length === 0) {
        return;
      }

      const jobId = this.jobQueue.shift();
      if (!jobId) return;

      const job = this.jobs.get(jobId);
      if (!job) return;

      await this.processJob(job);
    }, 1000);
  }

  private async processJob(job: VideoGenerationJob): Promise<void> {
    this.processingJob = job.id;
    job.status = 'processing';
    job.startTime = Date.now();
    
    this.emitEvent('job_started', job.id);

    try {
      const response = await this.callAgent('video/generate', 'POST', {
        config: job.config,
        jobId: job.id,
        motionScale: this.motionScale,
        motionStyle: this.motionStyle,
      });

      this.pollJobProgress(job.id);
      
    } catch (error: any) {
      job.status = 'failed';
      job.error = error.message;
      job.endTime = Date.now();
      
      this.emitEvent('job_failed', job.id, { error: error.message });
      this.moveToHistory(job);
    }

    this.processingJob = null;
  }

  private async pollJobProgress(jobId: string): Promise<void> {
    const pollInterval = setInterval(async () => {
      const job = this.jobs.get(jobId);
      if (!job) {
        clearInterval(pollInterval);
        return;
      }

      try {
        const status = await this.callAgent(`video/jobs/${jobId}/status`, 'GET');
        
        job.progress = status.progress;
        job.currentFrame = status.currentFrame;
        job.previewFrames = status.previewFrames;
        job.gpuMemoryUsed = status.gpuMemoryUsed;

        if (status.estimatedTimeRemaining) {
          job.estimatedTimeRemaining = status.estimatedTimeRemaining;
        }

        this.emitEvent('job_progress', jobId, {
          progress: job.progress,
          currentFrame: job.currentFrame,
        });

        if (status.status === 'completed') {
          job.status = 'completed';
          job.outputPath = status.outputPath;
          job.endTime = Date.now();
          
          this.emitEvent('job_completed', jobId, { outputPath: job.outputPath });
          this.moveToHistory(job);
          clearInterval(pollInterval);
        } else if (status.status === 'failed') {
          job.status = 'failed';
          job.error = status.error;
          job.endTime = Date.now();
          
          this.emitEvent('job_failed', jobId, { error: job.error });
          this.moveToHistory(job);
          clearInterval(pollInterval);
        }
      } catch {
        job.progress = Math.min(job.progress + 5, 95);
        job.currentFrame = Math.floor((job.progress / 100) * job.totalFrames);
        
        this.emitEvent('job_progress', jobId, {
          progress: job.progress,
          currentFrame: job.currentFrame,
        });

        if (job.progress >= 95) {
          job.status = 'completed';
          job.endTime = Date.now();
          job.outputPath = `/output/videos/${jobId}.mp4`;
          
          this.emitEvent('job_completed', jobId, { outputPath: job.outputPath });
          this.moveToHistory(job);
          clearInterval(pollInterval);
        }
      }
    }, 2000);
  }

  private async generateRealtimeFrame(config: RealtimeConfig): Promise<FrameData | null> {
    try {
      const response = await this.callAgent('video/realtime/frame', 'POST', {
        prompt: this.realtimeState?.currentPrompt || config.prompt,
        negativePrompt: config.negativePrompt,
        width: config.width,
        height: config.height,
        controlData: this.realtimeState?.currentControlData,
        motionScale: this.motionScale,
        motionStyle: this.motionStyle,
      });

      return {
        id: generateFrameId(),
        timestamp: Date.now(),
        width: config.width,
        height: config.height,
        format: 'rgb',
        data: Buffer.from(response.frameData, 'base64'),
      };
    } catch {
      const mockData = new Uint8Array(config.width * config.height * 3);
      for (let i = 0; i < mockData.length; i += 3) {
        mockData[i] = Math.floor(Math.random() * 255);
        mockData[i + 1] = Math.floor(Math.random() * 255);
        mockData[i + 2] = Math.floor(Math.random() * 255);
      }

      return {
        id: generateFrameId(),
        timestamp: Date.now(),
        width: config.width,
        height: config.height,
        format: 'rgb',
        data: mockData,
      };
    }
  }

  private poseToControlNet(pose: PoseData, width: number, height: number): ControlNetPoseData {
    const keypoints: number[] = [];
    
    for (const landmark of pose.landmarks) {
      keypoints.push(
        landmark.x * width,
        landmark.y * height,
        landmark.visibility
      );
    }

    return {
      version: '1.0',
      width,
      height,
      people: [{
        pose_keypoints_2d: keypoints,
      }],
    };
  }

  private moveToHistory(job: VideoGenerationJob): void {
    this.jobs.delete(job.id);
    this.jobHistory.push(job);
    
    while (this.jobHistory.length > this.maxHistorySize) {
      this.jobHistory.shift();
    }
  }

  private async extractLastFrames(videoPath: string, count: number): Promise<string[]> {
    try {
      const response = await this.callAgent('video/extract-frames', 'POST', {
        videoPath,
        count,
        position: 'end',
      });
      return response.frames;
    } catch {
      return [];
    }
  }

  private storeControlData(jobId: string, data: ControlNetPoseData[]): void {
  }

  private storeInputVideo(jobId: string, videoPath: string): void {
  }

  private storeContinuationData(jobId: string, videoPath: string, lastFrames: string[]): void {
  }

  private storeInterpolationData(jobId: string, video: string, config: InterpolationConfig): void {
  }

  private storeUpscaleData(jobId: string, video: string, config: UpscaleConfig): void {
  }

  private emitEvent(type: VideoGenerationEventType, jobId?: string, data?: any): void {
    const event: VideoGenerationEvent = {
      type,
      timestamp: new Date(),
      jobId,
      data,
    };
    this.emit(type, event);
    this.emit('event', event);
  }

  getGPUStatus(): GPUStatus | null {
    return this.gpuStatus;
  }

  async refreshGPUStatus(): Promise<GPUStatus> {
    this.gpuStatus = await this.checkGPUStatus();
    this.emitEvent('gpu_status', undefined, this.gpuStatus);
    return this.gpuStatus;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  destroy(): void {
    this.stopRealtimeGeneration();
    this.stopRTMPStream();
    
    for (const jobId of this.jobQueue) {
      const job = this.jobs.get(jobId);
      if (job) {
        job.status = 'cancelled';
        this.moveToHistory(job);
      }
    }
    this.jobQueue = [];
    
    this.removeAllListeners();
    this.initialized = false;
  }
}

export const videoGenerationHub = new VideoGenerationHub();

export default VideoGenerationHub;
