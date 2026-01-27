/**
 * AI Influencer Pipeline Orchestrator
 * 
 * Manages automated content generation through multiple stages:
 * 1. Script Generation - Uses LLM to generate scripts based on persona personality
 * 2. Prompt Chaining - Breaks scripts into shots with individual prompts
 * 3. Frame Generation - Executes ComfyUI workflows for each shot
 * 4. Video Assembly - Combines frames with TTS audio
 * 5. Batch Processing - Handles multiple content pieces in parallel
 */

import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db, isDbConnected } from '../db';
import { 
  contentPipelines, 
  videoProjects, 
  influencerPersonas,
  type ContentPipeline,
  type VideoProject,
  type InfluencerPersona,
  type NewVideoProject,
} from '../db/platform-schema';
import { comfyUIOrchestrator, type ComfyUIOutputAsset } from './comfyui-orchestrator';
import { aiOrchestrator, type ChatMessage } from '../ai-orchestrator';

function isBuildTime(): boolean {
  return !process.env.DATABASE_URL || 
         process.env.NEXT_PHASE === 'phase-production-build' ||
         process.argv.some(arg => arg.includes('next') && arg.includes('build'));
}

function log(level: 'info' | 'warn' | 'error' | 'debug', operation: string, message: string, metadata?: Record<string, unknown>): void {
  const prefix = `[InfluencerPipeline:${operation}]`;
  const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : '';
  switch (level) {
    case 'debug':
      console.debug(`${prefix} ${message}${metaStr}`);
      break;
    case 'info':
      console.log(`${prefix} ${message}${metaStr}`);
      break;
    case 'warn':
      console.warn(`${prefix} ${message}${metaStr}`);
      break;
    case 'error':
      console.error(`${prefix} ${message}${metaStr}`);
      break;
  }
}

export type PipelineRunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type VideoProjectStatus = 'draft' | 'generating' | 'review' | 'approved' | 'published' | 'failed';

export interface ExecutionOptions {
  topic?: string;
  priority?: number;
  skipScriptGeneration?: boolean;
  customScript?: string;
  dryRun?: boolean;
}

export interface BatchOptions extends ExecutionOptions {
  concurrency?: number;
  topics?: string[];
}

export interface ScriptOptions {
  length?: 'short' | 'medium' | 'long';
  tone?: string;
  includeHooks?: boolean;
  includeCallToAction?: boolean;
  targetDuration?: number;
}

export interface GeneratedScript {
  id: string;
  personaId: string;
  topic: string;
  script: string;
  title: string;
  description: string;
  hashtags: string[];
  estimatedDuration: number;
  createdAt: Date;
}

export interface PromptChainItem {
  shotIndex: number;
  prompt: string;
  negativePrompt?: string;
  duration: number;
  transitionType?: 'cut' | 'fade' | 'dissolve';
  cameraMovement?: string;
  narration?: string;
}

export interface GeneratedFrame {
  shotIndex: number;
  jobId: string;
  status: 'pending' | 'completed' | 'failed';
  outputAssets: ComfyUIOutputAsset[] | null;
  localPath?: string;
  thumbnailPath?: string;
}

export interface PipelineRunResult {
  runId: string;
  pipelineId: string;
  videoProjectId: string;
  status: PipelineRunStatus;
  stages: StageResult[];
  totalDurationMs: number;
  error?: string;
}

export interface StageResult {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: Date;
  completedAt?: Date;
  output?: unknown;
  error?: string;
}

export interface BatchResult {
  batchId: string;
  pipelineId: string;
  runs: PipelineRunResult[];
  totalCount: number;
  completedCount: number;
  failedCount: number;
  status: 'pending' | 'running' | 'completed' | 'partial' | 'failed';
}

export interface PipelineStatusResult {
  runId: string;
  pipelineId: string;
  status: PipelineRunStatus;
  currentStageIndex: number;
  stages: StageResult[];
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

interface InMemoryPipelineRun {
  id: string;
  pipelineId: string;
  videoProjectId: string | null;
  triggeredBy: string;
  status: PipelineRunStatus;
  stages: StageResult[];
  currentStageIndex: number;
  currentStage?: string;
  comfyuiJobIds: string[];
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  totalDurationMs: number | null;
  createdAt: Date;
}

const DEFAULT_SCRIPT_LENGTH_WORDS = {
  short: 50,
  medium: 150,
  long: 300,
};

class InfluencerPipelineOrchestrator {
  private inMemoryRuns: Map<string, InMemoryPipelineRun> = new Map();
  private inMemoryProjects: Map<string, VideoProject> = new Map();

  /**
   * Execute a full content pipeline from script to video
   */
  async executeFullPipeline(
    pipelineId: string,
    options: ExecutionOptions = {}
  ): Promise<PipelineRunResult> {
    const startTime = Date.now();
    log('info', 'executeFullPipeline', 'Starting pipeline execution', { pipelineId });

    try {
      const pipeline = await this.getPipelineById(pipelineId);
      if (!pipeline) {
        throw new Error(`Pipeline not found: ${pipelineId}`);
      }

      const persona = pipeline.personaId 
        ? await this.getPersonaById(pipeline.personaId) 
        : null;

      const videoProject = await this.createVideoProject(pipeline, persona, options);
      const run = await this.createPipelineRun(pipelineId, videoProject.id, 'manual');

      const stages: StageResult[] = [];
      let currentScript = options.customScript || '';
      let promptChain: PromptChainItem[] = [];
      let generatedFrames: GeneratedFrame[] = [];

      try {
        if (!options.skipScriptGeneration && !options.customScript && persona) {
          const scriptStage = await this.executeStage(run.id, 'script_generation', async () => {
            const topic = options.topic || this.generateDefaultTopic(persona);
            const scriptResult = await this.generateScript(persona.id, topic);
            currentScript = scriptResult.script;
            
            await this.updateVideoProject(videoProject.id, {
              script: currentScript,
              title: scriptResult.title,
              description: scriptResult.description,
              hashtags: scriptResult.hashtags,
            });
            
            return scriptResult;
          });
          stages.push(scriptStage);
        }

        if (currentScript && persona) {
          const chainStage = await this.executeStage(run.id, 'prompt_chaining', async () => {
            promptChain = await this.createPromptChain(currentScript, persona);
            
            await this.updateVideoProject(videoProject.id, {
              promptChain,
            });
            
            return { promptChain, shotCount: promptChain.length };
          });
          stages.push(chainStage);
        }

        if (promptChain.length > 0 && pipeline.workflowId) {
          const frameStage = await this.executeStage(run.id, 'frame_generation', async () => {
            generatedFrames = await this.generateFrames(promptChain, pipeline.workflowId!);
            
            await this.updateVideoProject(videoProject.id, {
              generatedFrames: generatedFrames.map(f => ({
                shotIndex: f.shotIndex,
                path: f.localPath,
                thumbnail: f.thumbnailPath,
                status: f.status,
              })),
            });
            
            return { frameCount: generatedFrames.length, completed: generatedFrames.filter(f => f.status === 'completed').length };
          });
          stages.push(frameStage);
        }

        const assemblyStage = await this.executeStage(run.id, 'video_assembly', async () => {
          return { message: 'Video assembly placeholder - implement with ffmpeg' };
        });
        stages.push(assemblyStage);

        const hasFailure = stages.some(s => s.status === 'failed');
        const finalStatus: PipelineRunStatus = hasFailure ? 'failed' : 'completed';

        await this.updatePipelineRun(run.id, {
          status: finalStatus,
          stages,
          completedAt: new Date(),
          totalDurationMs: Date.now() - startTime,
        });

        await this.updateVideoProject(videoProject.id, {
          status: hasFailure ? 'failed' : 'review',
          progress: 100,
        });

        const result: PipelineRunResult = {
          runId: run.id,
          pipelineId,
          videoProjectId: videoProject.id,
          status: finalStatus,
          stages,
          totalDurationMs: Date.now() - startTime,
        };

        log('info', 'executeFullPipeline', 'Pipeline completed', { runId: run.id, status: finalStatus });
        return result;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        await this.updatePipelineRun(run.id, {
          status: 'failed',
          errorMessage,
          completedAt: new Date(),
          totalDurationMs: Date.now() - startTime,
        });

        await this.updateVideoProject(videoProject.id, {
          status: 'failed',
          errorMessage,
        });

        throw error;
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log('error', 'executeFullPipeline', errorMessage);
      throw error;
    }
  }

  /**
   * Execute batch pipeline runs
   */
  async executeBatch(
    pipelineId: string,
    count: number,
    options: BatchOptions = {}
  ): Promise<BatchResult> {
    const batchId = randomUUID();
    const { concurrency = 2, topics = [] } = options;
    log('info', 'executeBatch', 'Starting batch execution', { pipelineId, count, batchId });

    const runs: PipelineRunResult[] = [];
    const executing: Promise<PipelineRunResult>[] = [];

    try {
      for (let i = 0; i < count; i++) {
        const runOptions: ExecutionOptions = {
          ...options,
          topic: topics[i] || options.topic,
        };

        const executeRun = async (): Promise<PipelineRunResult> => {
          return this.executeFullPipeline(pipelineId, runOptions);
        };

        executing.push(executeRun());

        if (executing.length >= concurrency || i === count - 1) {
          const results = await Promise.allSettled(executing);
          
          for (const result of results) {
            if (result.status === 'fulfilled') {
              runs.push(result.value);
            } else {
              runs.push({
                runId: randomUUID(),
                pipelineId,
                videoProjectId: '',
                status: 'failed',
                stages: [],
                totalDurationMs: 0,
                error: result.reason?.message || 'Unknown error',
              });
            }
          }
          
          executing.length = 0;
        }
      }

      const completedCount = runs.filter(r => r.status === 'completed').length;
      const failedCount = runs.filter(r => r.status === 'failed').length;

      let status: BatchResult['status'];
      if (failedCount === 0 && completedCount === runs.length) {
        status = 'completed';
      } else if (completedCount === 0) {
        status = 'failed';
      } else {
        status = 'partial';
      }

      const result: BatchResult = {
        batchId,
        pipelineId,
        runs,
        totalCount: count,
        completedCount,
        failedCount,
        status,
      };

      log('info', 'executeBatch', 'Batch completed', { batchId, completedCount, failedCount });
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log('error', 'executeBatch', errorMessage);
      throw error;
    }
  }

  /**
   * Generate a script based on persona personality
   */
  async generateScript(
    personaId: string,
    topic: string,
    options: ScriptOptions = {}
  ): Promise<GeneratedScript> {
    log('info', 'generateScript', 'Generating script', { personaId, topic });

    try {
      const persona = await this.getPersonaById(personaId);
      if (!persona) {
        throw new Error(`Persona not found: ${personaId}`);
      }

      const {
        length = 'medium',
        tone = 'engaging',
        includeHooks = true,
        includeCallToAction = true,
        targetDuration = 60,
      } = options;

      const wordCount = DEFAULT_SCRIPT_LENGTH_WORDS[length];
      
      const systemPrompt = this.buildScriptSystemPrompt(persona, {
        wordCount,
        tone,
        includeHooks,
        includeCallToAction,
        targetDuration,
      });

      const userPrompt = `Create a video script about: ${topic}`;

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      const response = await aiOrchestrator.chat({ messages });
      const parsed = this.parseScriptResponse(response.content, topic);

      const result: GeneratedScript = {
        id: randomUUID(),
        personaId,
        topic,
        script: parsed.script,
        title: parsed.title,
        description: parsed.description,
        hashtags: parsed.hashtags,
        estimatedDuration: this.estimateScriptDuration(parsed.script),
        createdAt: new Date(),
      };

      log('info', 'generateScript', 'Script generated', { scriptLength: result.script.length });
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log('error', 'generateScript', errorMessage);
      throw error;
    }
  }

  /**
   * Break a script into a chain of prompts for individual shots
   */
  async createPromptChain(
    script: string,
    persona: InfluencerPersona
  ): Promise<PromptChainItem[]> {
    log('info', 'createPromptChain', 'Creating prompt chain', { 
      scriptLength: script.length,
      personaId: persona.id,
    });

    try {
      const systemPrompt = `You are a visual director breaking down a video script into individual shots.
For each shot, provide:
1. A detailed image generation prompt
2. Duration in seconds
3. Camera movement if any
4. The narration text for that shot

Style reference: ${persona.stylePrompt || 'cinematic, high quality'}
Character description: ${persona.description || 'professional presenter'}

Respond in JSON format:
{
  "shots": [
    {
      "prompt": "detailed image prompt...",
      "negativePrompt": "things to avoid...",
      "duration": 5,
      "cameraMovement": "slow zoom in",
      "narration": "the text spoken during this shot"
    }
  ]
}`;

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Break down this script into visual shots:\n\n${script}` },
      ];

      const response = await aiOrchestrator.chat({ messages });
      const promptChain = this.parsePromptChainResponse(response.content, persona);

      log('info', 'createPromptChain', 'Prompt chain created', { shotCount: promptChain.length });
      return promptChain;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log('error', 'createPromptChain', errorMessage);
      throw error;
    }
  }

  /**
   * Generate frames for each prompt in the chain using ComfyUI
   */
  async generateFrames(
    promptChain: PromptChainItem[],
    workflowId: string
  ): Promise<GeneratedFrame[]> {
    log('info', 'generateFrames', 'Generating frames', {
      shotCount: promptChain.length,
      workflowId,
    });

    try {
      const paramsList = promptChain.map((item, index) => ({
        prompt: item.prompt,
        negative_prompt: item.negativePrompt || '',
        shot_index: index,
      }));

      const batchResult = await comfyUIOrchestrator.executeBatch(workflowId, paramsList, {
        concurrency: 2,
        maxRetries: 2,
      });

      const frames: GeneratedFrame[] = batchResult.jobs.map((job, index) => ({
        shotIndex: index,
        jobId: job.id,
        status: job.status === 'completed' ? 'completed' : job.status === 'failed' ? 'failed' : 'pending',
        outputAssets: job.outputAssets,
        localPath: job.outputAssets?.[0]?.localPath,
        thumbnailPath: job.outputAssets?.[0]?.localPath,
      }));

      log('info', 'generateFrames', 'Frames generated', {
        totalFrames: frames.length,
        completedFrames: frames.filter(f => f.status === 'completed').length,
      });

      return frames;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log('error', 'generateFrames', errorMessage);
      throw error;
    }
  }

  /**
   * Get the current status of a pipeline run
   */
  async getPipelineStatus(runId: string): Promise<PipelineStatusResult> {
    const run = await this.getPipelineRunById(runId);
    if (!run) {
      throw new Error(`Pipeline run not found: ${runId}`);
    }

    const stages = run.stages || [];
    const completedStages = stages.filter(s => s.status === 'completed').length;
    const progress = stages.length > 0 ? Math.round((completedStages / stages.length) * 100) : 0;

    return {
      runId: run.id,
      pipelineId: run.pipelineId,
      status: run.status,
      currentStageIndex: run.currentStageIndex || 0,
      stages,
      progress,
      startedAt: run.startedAt || undefined,
      completedAt: run.completedAt || undefined,
      error: run.errorMessage || undefined,
    };
  }

  /**
   * Cancel a running pipeline
   */
  async cancelRun(runId: string): Promise<void> {
    log('info', 'cancelRun', 'Cancelling pipeline run', { runId });

    try {
      const run = await this.getPipelineRunById(runId);
      if (!run) {
        throw new Error(`Pipeline run not found: ${runId}`);
      }

      if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
        throw new Error(`Cannot cancel run with status: ${run.status}`);
      }

      const comfyJobIds = run.comfyuiJobIds || [];
      for (const jobId of comfyJobIds) {
        try {
          await comfyUIOrchestrator.cancelJob(jobId);
        } catch (e) {
          console.warn(`Failed to cancel ComfyUI job ${jobId}:`, e);
        }
      }

      await this.updatePipelineRun(runId, {
        status: 'cancelled',
        completedAt: new Date(),
      });

      if (run.videoProjectId) {
        await this.updateVideoProject(run.videoProjectId, {
          status: 'draft',
        });
      }

      log('info', 'cancelRun', 'Pipeline run cancelled', { runId });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log('error', 'cancelRun', errorMessage);
      throw error;
    }
  }

  private async executeStage(
    runId: string,
    stageName: string,
    executor: () => Promise<unknown>
  ): Promise<StageResult> {
    const startedAt = new Date();
    
    await this.updatePipelineRun(runId, {
      currentStage: stageName,
    });

    try {
      const output = await executor();
      
      return {
        name: stageName,
        status: 'completed',
        startedAt,
        completedAt: new Date(),
        output,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      return {
        name: stageName,
        status: 'failed',
        startedAt,
        completedAt: new Date(),
        error: errorMessage,
      };
    }
  }

  private buildScriptSystemPrompt(
    persona: InfluencerPersona,
    options: {
      wordCount: number;
      tone: string;
      includeHooks: boolean;
      includeCallToAction: boolean;
      targetDuration: number;
    }
  ): string {
    const traits = persona.personalityTraits?.join(', ') || 'friendly, knowledgeable';
    const style = persona.writingStyle || 'conversational';
    const focus = persona.topicFocus?.join(', ') || 'general topics';

    return `You are ${persona.name}, a content creator with the following characteristics:
- Personality: ${traits}
- Writing style: ${style}
- Focus areas: ${focus}

Create a video script with:
- Target length: approximately ${options.wordCount} words (${options.targetDuration} seconds spoken)
- Tone: ${options.tone}
${options.includeHooks ? '- Start with an attention-grabbing hook' : ''}
${options.includeCallToAction ? '- End with a clear call to action' : ''}

Respond in JSON format:
{
  "title": "Video title",
  "script": "The full script text...",
  "description": "Video description for posting",
  "hashtags": ["tag1", "tag2", "tag3"]
}`;
  }

  private parseScriptResponse(
    content: string,
    topic: string
  ): { script: string; title: string; description: string; hashtags: string[] } {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          script: parsed.script || content,
          title: parsed.title || `Video about ${topic}`,
          description: parsed.description || '',
          hashtags: parsed.hashtags || [],
        };
      }
    } catch {
      // Fall through to default
    }

    return {
      script: content,
      title: `Video about ${topic}`,
      description: content.substring(0, 200),
      hashtags: [],
    };
  }

  private parsePromptChainResponse(
    content: string,
    persona: InfluencerPersona
  ): PromptChainItem[] {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        if (parsed.shots && Array.isArray(parsed.shots)) {
          return parsed.shots.map((shot: Record<string, unknown>, index: number) => ({
            shotIndex: index,
            prompt: this.enhancePromptWithPersona(String(shot.prompt || ''), persona),
            negativePrompt: String(shot.negativePrompt || persona.negativePrompt || ''),
            duration: Number(shot.duration) || 5,
            transitionType: 'cut' as const,
            cameraMovement: String(shot.cameraMovement || ''),
            narration: String(shot.narration || ''),
          }));
        }
      }
    } catch {
      // Fall through to default
    }

    return [{
      shotIndex: 0,
      prompt: this.enhancePromptWithPersona('scene from video', persona),
      negativePrompt: persona.negativePrompt || '',
      duration: 10,
      transitionType: 'cut',
    }];
  }

  private enhancePromptWithPersona(basePrompt: string, persona: InfluencerPersona): string {
    const parts = [basePrompt];
    
    if (persona.stylePrompt) {
      parts.push(persona.stylePrompt);
    }
    
    if (persona.embeddingName) {
      parts.unshift(persona.embeddingName);
    }
    
    return parts.join(', ');
  }

  private estimateScriptDuration(script: string): number {
    const words = script.split(/\s+/).length;
    const wordsPerSecond = 2.5;
    return Math.ceil(words / wordsPerSecond);
  }

  private generateDefaultTopic(persona: InfluencerPersona): string {
    const topics = persona.topicFocus || ['interesting topic'];
    return topics[Math.floor(Math.random() * topics.length)];
  }

  private async getPipelineById(pipelineId: string): Promise<ContentPipeline | null> {
    if (isBuildTime() || !isDbConnected()) {
      return null;
    }

    try {
      const [pipeline] = await db
        .select()
        .from(contentPipelines)
        .where(eq(contentPipelines.id, pipelineId))
        .limit(1);

      return pipeline || null;
    } catch (error) {
      console.warn('Failed to get pipeline from DB:', error);
      return null;
    }
  }

  private async getPersonaById(personaId: string): Promise<InfluencerPersona | null> {
    if (isBuildTime() || !isDbConnected()) {
      return null;
    }

    try {
      const [persona] = await db
        .select()
        .from(influencerPersonas)
        .where(eq(influencerPersonas.id, personaId))
        .limit(1);

      return persona || null;
    } catch (error) {
      console.warn('Failed to get persona from DB:', error);
      return null;
    }
  }

  private async getPipelineRunById(runId: string): Promise<InMemoryPipelineRun | null> {
    return this.inMemoryRuns.get(runId) || null;
  }

  private async createVideoProject(
    pipeline: ContentPipeline,
    persona: InfluencerPersona | null,
    options: ExecutionOptions
  ): Promise<VideoProject> {
    const id = randomUUID();
    const now = new Date();

    const project: NewVideoProject = {
      id,
      pipelineId: pipeline.id,
      personaId: persona?.id || null,
      title: options.topic ? `Video: ${options.topic}` : 'New Video Project',
      status: 'generating',
      currentStage: 'initializing',
      progress: 0,
      createdAt: now,
      updatedAt: now,
    };

    if (isBuildTime() || !isDbConnected()) {
      const memoryProject = project as VideoProject;
      this.inMemoryProjects.set(id, memoryProject);
      return memoryProject;
    }

    try {
      await db.insert(videoProjects).values(project);
      const [created] = await db
        .select()
        .from(videoProjects)
        .where(eq(videoProjects.id, id))
        .limit(1);
      
      return created;
    } catch (error) {
      console.warn('Failed to create video project in DB:', error);
      const memoryProject = project as VideoProject;
      this.inMemoryProjects.set(id, memoryProject);
      return memoryProject;
    }
  }

  private async updateVideoProject(
    projectId: string,
    updates: Partial<VideoProject>
  ): Promise<void> {
    if (this.inMemoryProjects.has(projectId)) {
      const existing = this.inMemoryProjects.get(projectId)!;
      this.inMemoryProjects.set(projectId, { ...existing, ...updates, updatedAt: new Date() });
    }

    if (isBuildTime() || !isDbConnected()) {
      return;
    }

    try {
      await db
        .update(videoProjects)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(videoProjects.id, projectId));
    } catch (error) {
      console.warn('Failed to update video project in DB:', error);
    }
  }

  private async createPipelineRun(
    pipelineId: string,
    videoProjectId: string,
    triggeredBy: string
  ): Promise<InMemoryPipelineRun> {
    const id = randomUUID();
    const now = new Date();

    const run: InMemoryPipelineRun = {
      id,
      pipelineId,
      videoProjectId,
      triggeredBy,
      status: 'running',
      stages: [],
      currentStageIndex: 0,
      comfyuiJobIds: [],
      errorMessage: null,
      startedAt: now,
      completedAt: null,
      totalDurationMs: null,
      createdAt: now,
    };

    this.inMemoryRuns.set(id, run);
    return run;
  }

  private async updatePipelineRun(
    runId: string,
    updates: Partial<InMemoryPipelineRun>
  ): Promise<void> {
    if (this.inMemoryRuns.has(runId)) {
      const existing = this.inMemoryRuns.get(runId)!;
      this.inMemoryRuns.set(runId, { ...existing, ...updates });
    }
  }
}

export const influencerPipelineOrchestrator = new InfluencerPipelineOrchestrator();

export default influencerPipelineOrchestrator;
