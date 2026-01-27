/**
 * ComfyUI Client - API client for ComfyUI workflow execution
 * Provides WebSocket progress tracking, queue management, and workflow execution
 */

import { EventEmitter } from 'events';

export interface ComfyUIConfig {
  host: string;
  port: number;
  useSSL?: boolean;
  timeout?: number;
}

export interface WorkflowParams {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  frames?: number;
  fps?: number;
  seed?: number;
  steps?: number;
  cfg?: number;
  checkpoint?: string;
  motionModule?: string;
}

export interface VideoGenerationParams extends WorkflowParams {
  inputImage?: string;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  model?: 'animatediff' | 'svd' | 'animatediff-lightning';
}

export interface QueuedJob {
  id: string;
  promptId: string;
  clientId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentNode?: string;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  outputUrl?: string;
  model: string;
}

export interface QueueStatus {
  queueRemaining: number;
  queueRunning: number;
  jobs: QueuedJob[];
}

export interface ProgressEvent {
  type: 'progress' | 'executing' | 'executed' | 'execution_start' | 'execution_cached' | 'execution_error';
  promptId: string;
  nodeId?: string;
  progress?: number;
  max?: number;
  error?: string;
}

export interface ComfyUISystemStats {
  system: {
    os: string;
    python_version: string;
    embedded_python: boolean;
  };
  devices: Array<{
    name: string;
    type: string;
    index: number;
    vram_total: number;
    vram_free: number;
    torch_vram_total: number;
    torch_vram_free: number;
  }>;
}

import { getAIConfig } from "@/lib/ai/config";

const aiConfig = getAIConfig();
const DEFAULT_CONFIG: ComfyUIConfig = {
  host: aiConfig.windowsVM.ip || 'localhost',
  port: 8188,
  useSSL: false,
  timeout: aiConfig.comfyui.timeout,
};

const ANIMATEDIFF_WORKFLOW_TEMPLATE = {
  "1": {
    "class_type": "CheckpointLoaderSimple",
    "inputs": { "ckpt_name": "dreamshaper_8.safetensors" }
  },
  "2": {
    "class_type": "ADE_AnimateDiffLoaderWithContext",
    "inputs": {
      "model": ["1", 0],
      "model_name": "mm_sd_v15_v2.ckpt",
      "beta_schedule": "sqrt_linear (AnimateDiff)",
      "context_length": 16,
      "context_stride": 1,
      "context_overlap": 4,
      "closed_loop": false
    }
  },
  "3": {
    "class_type": "CLIPTextEncode",
    "inputs": { "clip": ["1", 1], "text": "" }
  },
  "4": {
    "class_type": "CLIPTextEncode",
    "inputs": { "clip": ["1", 1], "text": "blurry, low quality, distorted, ugly, watermark, text" }
  },
  "5": {
    "class_type": "EmptyLatentImage",
    "inputs": { "batch_size": 16, "height": 320, "width": 512 }
  },
  "6": {
    "class_type": "KSampler",
    "inputs": {
      "cfg": 7.5,
      "denoise": 1,
      "latent_image": ["5", 0],
      "model": ["2", 0],
      "negative": ["4", 0],
      "positive": ["3", 0],
      "sampler_name": "euler_ancestral",
      "scheduler": "normal",
      "seed": 0,
      "steps": 20
    }
  },
  "7": {
    "class_type": "VAEDecode",
    "inputs": { "samples": ["6", 0], "vae": ["1", 2] }
  },
  "8": {
    "class_type": "VHS_VideoCombine",
    "inputs": {
      "images": ["7", 0],
      "frame_rate": 8,
      "loop_count": 0,
      "filename_prefix": "AnimateDiff",
      "format": "video/h264-mp4",
      "save_output": true,
      "pingpong": false,
      "crf": 19
    }
  }
};

const SVD_WORKFLOW_TEMPLATE = {
  "1": {
    "class_type": "LoadImage",
    "inputs": { "image": "" }
  },
  "2": {
    "class_type": "ImageOnlyCheckpointLoader",
    "inputs": { "ckpt_name": "svd_xt_1_1.safetensors" }
  },
  "3": {
    "class_type": "SVD_img2vid_Conditioning",
    "inputs": {
      "augmentation_level": 0,
      "fps": 8,
      "init_image": ["1", 0],
      "motion_bucket_id": 127,
      "video_frames": 25,
      "width": 1024,
      "height": 576
    }
  },
  "4": {
    "class_type": "KSampler",
    "inputs": {
      "cfg": 2.5,
      "denoise": 1,
      "latent_image": ["3", 2],
      "model": ["2", 0],
      "negative": ["3", 1],
      "positive": ["3", 0],
      "sampler_name": "euler",
      "scheduler": "karras",
      "seed": 0,
      "steps": 20
    }
  },
  "5": {
    "class_type": "VAEDecode",
    "inputs": { "samples": ["4", 0], "vae": ["2", 2] }
  },
  "6": {
    "class_type": "VHS_VideoCombine",
    "inputs": {
      "images": ["5", 0],
      "frame_rate": 8,
      "loop_count": 0,
      "filename_prefix": "SVD",
      "format": "video/h264-mp4",
      "save_output": true,
      "pingpong": false,
      "crf": 19
    }
  }
};

export class ComfyUIClient extends EventEmitter {
  private config: ComfyUIConfig;
  private jobs: Map<string, QueuedJob> = new Map();
  private ws: WebSocket | null = null;
  private wsConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;

  constructor(config: Partial<ComfyUIConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  get baseUrl(): string {
    const protocol = this.config.useSSL ? 'https' : 'http';
    return `${protocol}://${this.config.host}:${this.config.port}`;
  }

  get wsUrl(): string {
    const protocol = this.config.useSSL ? 'wss' : 'ws';
    return `${protocol}://${this.config.host}:${this.config.port}/ws`;
  }

  async isOnline(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.baseUrl}/system_stats`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  async getSystemStats(): Promise<ComfyUISystemStats | null> {
    try {
      const response = await fetch(`${this.baseUrl}/system_stats`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async getQueue(): Promise<QueueStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/queue`);
      if (!response.ok) {
        return { queueRemaining: 0, queueRunning: 0, jobs: [] };
      }
      const data = await response.json();
      return {
        queueRemaining: data.queue_pending?.length || 0,
        queueRunning: data.queue_running?.length || 0,
        jobs: Array.from(this.jobs.values()),
      };
    } catch {
      return { queueRemaining: 0, queueRunning: 0, jobs: Array.from(this.jobs.values()) };
    }
  }

  async uploadImage(imageData: Buffer | ArrayBuffer, filename?: string): Promise<string> {
    const name = filename || `input_${Date.now()}.png`;
    const formData = new FormData();
    const arrayBuffer = imageData instanceof ArrayBuffer 
      ? imageData 
      : imageData.buffer.slice(imageData.byteOffset, imageData.byteOffset + imageData.length);
    const blob = new Blob([arrayBuffer as ArrayBuffer], { type: 'image/png' });
    formData.append('image', blob, name);

    const response = await fetch(`${this.baseUrl}/upload/image`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload image: ${response.status}`);
    }

    const result = await response.json();
    return result.name || name;
  }

  async uploadImageFromUrl(imageUrl: string): Promise<string> {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error('Failed to download input image');
    const buffer = await response.arrayBuffer();
    return this.uploadImage(buffer);
  }

  buildAnimateDiffWorkflow(params: VideoGenerationParams): Record<string, any> {
    const workflow = JSON.parse(JSON.stringify(ANIMATEDIFF_WORKFLOW_TEMPLATE));
    
    if (params.checkpoint) {
      workflow["1"].inputs.ckpt_name = params.checkpoint;
    }
    if (params.motionModule) {
      workflow["2"].inputs.model_name = params.motionModule;
    }
    workflow["3"].inputs.text = params.prompt;
    workflow["4"].inputs.text = params.negativePrompt || "blurry, low quality, distorted, ugly, watermark, text";
    
    const frames = params.frames || 16;
    workflow["5"].inputs.batch_size = frames;
    
    if (params.aspectRatio === '9:16') {
      workflow["5"].inputs.width = 320;
      workflow["5"].inputs.height = 512;
    } else if (params.aspectRatio === '1:1') {
      workflow["5"].inputs.width = 512;
      workflow["5"].inputs.height = 512;
    } else {
      workflow["5"].inputs.width = 512;
      workflow["5"].inputs.height = 320;
    }
    
    workflow["6"].inputs.seed = params.seed ?? Math.floor(Math.random() * 1000000000);
    workflow["6"].inputs.steps = params.steps || 20;
    workflow["6"].inputs.cfg = params.cfg || 7.5;
    workflow["8"].inputs.frame_rate = params.fps || 8;
    
    return workflow;
  }

  buildSVDWorkflow(params: VideoGenerationParams, uploadedImageName: string): Record<string, any> {
    const workflow = JSON.parse(JSON.stringify(SVD_WORKFLOW_TEMPLATE));
    
    workflow["1"].inputs.image = uploadedImageName;
    workflow["4"].inputs.seed = params.seed ?? Math.floor(Math.random() * 1000000000);
    workflow["4"].inputs.steps = params.steps || 20;
    workflow["3"].inputs.video_frames = params.frames || 25;
    workflow["3"].inputs.fps = params.fps || 8;
    workflow["6"].inputs.frame_rate = params.fps || 8;
    
    return workflow;
  }

  async queueWorkflow(workflow: Record<string, any>, clientId?: string): Promise<{ promptId: string; jobId: string }> {
    const cid = clientId || `nebula-${Date.now()}`;
    
    const response = await fetch(`${this.baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: workflow,
        client_id: cid,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let parsedError;
      try {
        parsedError = JSON.parse(errorText);
      } catch {
        parsedError = { error: errorText };
      }
      
      if (parsedError.node_errors || errorText.includes('does not exist')) {
        const nodeError = JSON.stringify(parsedError.node_errors || parsedError);
        if (nodeError.includes('ADE_AnimateDiff') || nodeError.includes('AnimateDiff')) {
          throw new Error('AnimateDiff nodes not installed in ComfyUI. Install "AnimateDiff Evolved" via ComfyUI Manager.');
        }
        if (nodeError.includes('VHS_VideoCombine')) {
          throw new Error('VideoHelperSuite nodes not installed in ComfyUI. Install via ComfyUI Manager.');
        }
        throw new Error(`ComfyUI missing required nodes: ${nodeError.substring(0, 200)}`);
      }
      
      throw new Error(`ComfyUI queue error: ${errorText.substring(0, 300)}`);
    }

    const { prompt_id } = await response.json();
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    const job: QueuedJob = {
      id: jobId,
      promptId: prompt_id,
      clientId: cid,
      status: 'queued',
      progress: 0,
      startedAt: new Date(),
      model: 'comfyui',
    };
    
    this.jobs.set(jobId, job);
    this.emit('job_queued', job);
    
    return { promptId: prompt_id, jobId };
  }

  async generateVideo(params: VideoGenerationParams): Promise<QueuedJob> {
    const isAnimateDiff = params.model === 'animatediff' || params.model === 'animatediff-lightning' || !params.inputImage;
    
    let workflow: Record<string, any>;
    let uploadedImageName = '';
    
    if (isAnimateDiff) {
      workflow = this.buildAnimateDiffWorkflow(params);
    } else {
      if (!params.inputImage) {
        throw new Error('SVD requires an input image');
      }
      uploadedImageName = await this.uploadImageFromUrl(params.inputImage);
      workflow = this.buildSVDWorkflow(params, uploadedImageName);
    }
    
    const { promptId, jobId } = await this.queueWorkflow(workflow);
    const job = this.jobs.get(jobId)!;
    job.model = isAnimateDiff ? 'animatediff' : 'svd';
    
    return job;
  }

  async waitForCompletion(jobId: string, timeoutMs?: number): Promise<QueuedJob> {
    const timeout = timeoutMs || this.config.timeout || 300000;
    const pollInterval = 2000;
    let elapsed = 0;
    
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    while (elapsed < timeout) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      elapsed += pollInterval;

      const historyResponse = await fetch(`${this.baseUrl}/history/${job.promptId}`);
      if (!historyResponse.ok) continue;

      const history = await historyResponse.json();
      const result = history[job.promptId];

      if (result?.outputs) {
        for (const nodeId of Object.keys(result.outputs)) {
          const output = result.outputs[nodeId];
          if (output.gifs || output.videos) {
            const videos = output.gifs || output.videos;
            if (videos.length > 0) {
              const video = videos[0];
              job.status = 'completed';
              job.progress = 100;
              job.completedAt = new Date();
              job.outputUrl = `${this.baseUrl}/view?filename=${encodeURIComponent(video.filename)}&subfolder=${encodeURIComponent(video.subfolder || '')}&type=${video.type || 'output'}`;
              this.emit('job_completed', job);
              return job;
            }
          }
        }
      }

      if (result?.status?.status_str === 'error') {
        job.status = 'failed';
        job.error = result.status.messages?.[0]?.[1] || 'Unknown error';
        job.completedAt = new Date();
        this.emit('job_failed', job);
        throw new Error(job.error);
      }

      job.status = 'running';
      const queueRes = await fetch(`${this.baseUrl}/queue`);
      if (queueRes.ok) {
        const queueData = await queueRes.json();
        const running = queueData.queue_running || [];
        const pending = queueData.queue_pending || [];
        const total = running.length + pending.length;
        if (total > 0) {
          job.progress = Math.min(90, 100 - (total * 10));
        }
      }
      this.emit('job_progress', job);
    }

    job.status = 'failed';
    job.error = 'Timeout waiting for video generation';
    job.completedAt = new Date();
    this.emit('job_failed', job);
    throw new Error('Timeout waiting for video generation');
  }

  async generateVideoAndWait(params: VideoGenerationParams): Promise<{ url: string; job: QueuedJob }> {
    const job = await this.generateVideo(params);
    const completedJob = await this.waitForCompletion(job.id);
    
    if (!completedJob.outputUrl) {
      throw new Error('No video output received');
    }
    
    return { url: completedJob.outputUrl, job: completedJob };
  }

  getJob(jobId: string): QueuedJob | undefined {
    return this.jobs.get(jobId);
  }

  getAllJobs(): QueuedJob[] {
    return Array.from(this.jobs.values());
  }

  getActiveJobs(): QueuedJob[] {
    return Array.from(this.jobs.values()).filter(j => j.status === 'queued' || j.status === 'running');
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    
    try {
      const response = await fetch(`${this.baseUrl}/interrupt`, {
        method: 'POST',
      });
      
      if (response.ok) {
        job.status = 'cancelled';
        job.completedAt = new Date();
        this.emit('job_cancelled', job);
        return true;
      }
    } catch (error) {
      console.error('[ComfyUI] Failed to cancel job:', error);
    }
    
    return false;
  }

  async clearQueue(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear: true }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getHistory(promptId?: string): Promise<Record<string, any>> {
    try {
      const url = promptId ? `${this.baseUrl}/history/${promptId}` : `${this.baseUrl}/history`;
      const response = await fetch(url);
      if (!response.ok) return {};
      return await response.json();
    } catch {
      return {};
    }
  }

  async getObjectInfo(): Promise<Record<string, any>> {
    try {
      const response = await fetch(`${this.baseUrl}/object_info`);
      if (!response.ok) return {};
      return await response.json();
    } catch {
      return {};
    }
  }

  async getAvailableCheckpoints(): Promise<string[]> {
    try {
      const objectInfo = await this.getObjectInfo();
      const checkpointLoader = objectInfo['CheckpointLoaderSimple'];
      if (checkpointLoader?.input?.required?.ckpt_name?.[0]) {
        return checkpointLoader.input.required.ckpt_name[0];
      }
      return [];
    } catch {
      return [];
    }
  }

  async getAvailableMotionModules(): Promise<string[]> {
    try {
      const objectInfo = await this.getObjectInfo();
      const animateDiffLoader = objectInfo['ADE_AnimateDiffLoaderWithContext'];
      if (animateDiffLoader?.input?.required?.model_name?.[0]) {
        return animateDiffLoader.input.required.model_name[0];
      }
      return [];
    } catch {
      return [];
    }
  }

  cleanupOldJobs(maxAgeMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;
    const entries = Array.from(this.jobs.entries());
    
    for (const [id, job] of entries) {
      const completedAt = job.completedAt?.getTime() || 0;
      const startedAt = job.startedAt?.getTime() || 0;
      const age = now - (completedAt || startedAt);
      
      if (age > maxAgeMs && (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled')) {
        this.jobs.delete(id);
        cleaned++;
      }
    }
    
    return cleaned;
  }
}

export const comfyuiClient = new ComfyUIClient();

export async function checkComfyUIStatus(): Promise<{ online: boolean; stats?: ComfyUISystemStats }> {
  const online = await comfyuiClient.isOnline();
  if (!online) return { online: false };
  
  const stats = await comfyuiClient.getSystemStats();
  return { online: true, stats: stats || undefined };
}

export async function generateVideoWithComfyUI(params: VideoGenerationParams): Promise<{ url: string; model: string }> {
  const { url, job } = await comfyuiClient.generateVideoAndWait(params);
  return { url, model: job.model };
}
