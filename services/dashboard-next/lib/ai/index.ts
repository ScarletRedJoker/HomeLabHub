export * from './types';
export * from './orchestrator';
export { ollamaProvider, OllamaProvider } from './providers/ollama';
export { openaiProvider, OpenAIProvider } from './providers/openai';
export { stableDiffusionProvider, StableDiffusionProvider, sdClient } from './providers/stable-diffusion';
export type { SDModel } from './providers/stable-diffusion';
export { ComfyUIClient, comfyClient } from './providers/comfyui';
export type { ComfyUISystemStats, ComfyUIPromptResponse, ComfyUIHistoryItem } from './providers/comfyui';
export { ComfyUIJobOrchestrator, comfyUIOrchestrator } from './comfyui-orchestrator';
export type { ComfyUIJob, ComfyUIBatchResult, ComfyUIJobStatus, ComfyUIOutputAsset, ComfyUIQueueStatus, ExecuteWorkflowOptions, ExecuteBatchOptions } from './comfyui-orchestrator';
export { healthChecker } from './health-checker';
export type { HealthCheckResult, HealthMonitorState } from './health-checker';
export { responseCache, getCacheKey, AIResponseCache } from './cache';
export { costTracker, MODEL_COSTS, LOCAL_MODELS, CLOUD_MODELS } from './cost-tracker';
export type { CostSummary, UsageRecord, ModelCost, DailyStats } from './cost-tracker';
export { promptOptimizer, optimizePrompt, optimizeMessages, compressSystemPrompt, truncateContext } from './prompt-optimizer';
export type { OptimizationResult, OptimizationOptions } from './prompt-optimizer';
export { modelRouter, selectModel, detectTaskType, getLocalModels, getCloudModels, AVAILABLE_MODELS } from './model-router';
export type { ModelConfig, TaskType, RouterOptions } from './model-router';
export { aiOptimizer, optimizeAndExecute } from './optimizer';
export type { OptimizedRequest, OptimizerConfig } from './optimizer';

export { getAIConfig, validateAIConfig, logConfigStatus } from './config';
export type { AIConfig, AIEndpointConfig } from './config';
export { aiLogger } from './logger';
export type { AILogEntry, AIRequestContext, LogLevel } from './logger';

// Influencer Pipeline
export { influencerPipelineOrchestrator, influencerPipeline } from './influencer-pipeline';
export type { 
  PipelineRunStatus, 
  VideoProjectStatus, 
  ExecutionOptions, 
  BatchOptions, 
  GeneratedScript, 
  PromptChainItem, 
  GeneratedFrame, 
  PipelineRunResult, 
  BatchResult 
} from './influencer-pipeline';

// Pipeline Scheduler
export { pipelineScheduler } from './pipeline-scheduler';
export type { 
  QueuedPipeline, 
  SchedulerConfig, 
  SchedulerStats, 
  ExecutionResult 
} from './pipeline-scheduler';

// ComfyUI Workflow Helpers
export { 
  buildPersonaWorkflowParams, 
  createImageSequenceParams, 
  buildVideoFrameParams,
  toComfyUINodeInputs,
  toAnimateDiffInputs,
  createBatchParams,
  buildWorkflowOverrides
} from './comfyui-workflows';
export type { 
  PersonaWorkflowParams, 
  ImageSequenceParams, 
  VideoFrameParams, 
  AnimateDiffConfig 
} from './comfyui-workflows';

// Video Assembly
export { videoAssemblyService } from './video-assembly';
export type { 
  AssemblyOptions, 
  VideoAssemblyResult, 
  AudioMixResult, 
  ThumbnailResult 
} from './video-assembly';
