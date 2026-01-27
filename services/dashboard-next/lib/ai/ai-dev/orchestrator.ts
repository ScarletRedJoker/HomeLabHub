/**
 * AI Developer Orchestrator - Core execution engine for autonomous code modification
 * Manages job queue, planning, execution, and approval workflows
 */

import { db } from '@/lib/db';
import { 
  aiDevJobs, 
  aiDevPatches, 
  aiDevRuns,
  aiDevApprovals,
  type AIDevJob,
  type NewAIDevJob,
  type AIDevPatch,
  type NewAIDevPatch,
  type NewAIDevApproval,
} from '@/lib/db/platform-schema';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { providerRegistry, type ChatMessage, type CompletionResponse } from './provider-registry';
import { TOOL_DEFINITIONS, executeTool, type ToolResult } from './tools';
import { repoManager, type FilePatch } from './repo-manager';
import { aiLogger } from '../logger';

export type JobStatus = 
  | 'pending'
  | 'planning'
  | 'executing'
  | 'review'
  | 'approved'
  | 'applied'
  | 'rejected'
  | 'rolled_back'
  | 'failed';

export type JobType = 'feature' | 'bugfix' | 'refactor' | 'test' | 'docs';

export interface CreateJobParams {
  title: string;
  description?: string;
  type: JobType;
  targetPaths?: string[];
  provider?: string;
  model?: string;
  createdBy?: string;
}

export interface JobExecutionResult {
  success: boolean;
  patches: FilePatch[];
  testsRun: boolean;
  testsPassed: boolean;
  tokensUsed: number;
  durationMs: number;
  error?: string;
}

const SYSTEM_PROMPT = `You are an expert software engineer working on the Nebula Command platform.
Your task is to analyze code, understand architecture, and make precise modifications.

Guidelines:
1. Read and understand the codebase before making changes
2. Follow existing code patterns and conventions
3. Make minimal, focused changes
4. Write clean, well-documented code
5. Consider error handling and edge cases
6. Run tests when appropriate

You have access to tools for reading files, searching code, writing files, running commands, and running tests.
Use these tools to accomplish your task.

When you're done making changes, provide a summary of what you changed and why.`;

export class AIDevOrchestrator {
  private activeJobs: Map<string, AbortController> = new Map();

  async createJob(params: CreateJobParams): Promise<AIDevJob> {
    const context = aiLogger.startRequest('ollama', 'create_job', { ...params } as Record<string, unknown>);

    const [job] = await db.insert(aiDevJobs).values({
      title: params.title,
      description: params.description,
      type: params.type,
      status: 'pending',
      targetPaths: params.targetPaths,
      provider: params.provider || 'ollama',
      model: params.model,
      createdBy: params.createdBy,
    }).returning();

    aiLogger.endRequest(context, true, { jobId: job.id });

    return job;
  }

  async getJob(jobId: string): Promise<AIDevJob | null> {
    const [job] = await db.select().from(aiDevJobs).where(eq(aiDevJobs.id, jobId));
    return job || null;
  }

  async listJobs(status?: JobStatus, limit = 50): Promise<AIDevJob[]> {
    let query = db.select().from(aiDevJobs);
    
    if (status) {
      query = query.where(eq(aiDevJobs.status, status)) as typeof query;
    }
    
    return query.orderBy(desc(aiDevJobs.createdAt)).limit(limit);
  }

  async getJobPatches(jobId: string): Promise<AIDevPatch[]> {
    return db.select().from(aiDevPatches).where(eq(aiDevPatches.jobId, jobId));
  }

  async getJobApprovals(jobId: string) {
    return db.select().from(aiDevApprovals).where(eq(aiDevApprovals.jobId, jobId)).orderBy(desc(aiDevApprovals.reviewedAt));
  }

  async updateJobStatus(jobId: string, status: JobStatus, extra?: Partial<AIDevJob>): Promise<void> {
    await db.update(aiDevJobs)
      .set({ 
        status, 
        updatedAt: new Date(),
        ...extra,
      })
      .where(eq(aiDevJobs.id, jobId));
  }

  async executeJob(jobId: string): Promise<JobExecutionResult> {
    const context = aiLogger.startRequest('ollama', 'execute_job', { jobId });
    const startTime = Date.now();
    const abortController = new AbortController();
    
    this.activeJobs.set(jobId, abortController);

    try {
      const job = await this.getJob(jobId);
      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      await this.updateJobStatus(jobId, 'planning');

      const provider = providerRegistry.getProvider(job.provider || undefined);
      const patches: FilePatch[] = [];
      let totalTokens = 0;

      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { 
          role: 'user', 
          content: this.buildTaskPrompt(job),
        },
      ];

      await this.updateJobStatus(jobId, 'executing');

      let iterations = 0;
      const maxIterations = 20;

      while (iterations < maxIterations) {
        if (abortController.signal.aborted) {
          throw new Error('Job cancelled');
        }

        iterations++;

        const stepStartTime = Date.now();
        let response: CompletionResponse;

        try {
          response = await provider.complete({
            messages,
            tools: TOOL_DEFINITIONS,
            temperature: 0.3,
            maxTokens: 4096,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'AI provider error';
          aiLogger.logError(context, new Error(errorMessage));
          throw error;
        }

        totalTokens += response.tokensUsed.total;

        await db.insert(aiDevRuns).values({
          jobId,
          stepIndex: iterations,
          stepName: `iteration_${iterations}`,
          action: response.toolCalls?.length ? 'tool_calls' : 'response',
          input: { messages: messages.slice(-2) },
          output: response,
          status: 'completed',
          tokensUsed: response.tokensUsed.total,
          durationMs: Date.now() - stepStartTime,
          startedAt: new Date(stepStartTime),
          completedAt: new Date(),
        });

        if (!response.toolCalls?.length) {
          messages.push({ role: 'assistant', content: response.content });
          break;
        }

        messages.push({ 
          role: 'assistant', 
          content: response.content,
          toolCalls: response.toolCalls,
        });

        for (const toolCall of response.toolCalls) {
          const args = JSON.parse(toolCall.function.arguments);
          const toolResult = await executeTool(toolCall.function.name, args);

          if (toolCall.function.name === 'write_file' && toolResult.success) {
            const patch = await repoManager.generatePatch(
              args.path,
              args.content
            );
            patches.push(patch);

            await db.insert(aiDevPatches).values({
              jobId,
              filePath: patch.filePath,
              patchType: patch.patchType,
              originalContent: patch.originalContent,
              newContent: patch.newContent,
              diffUnified: patch.diffUnified,
              diffStats: patch.diffStats,
              status: 'pending',
            });
          }

          messages.push({
            role: 'tool',
            content: JSON.stringify(toolResult.output),
            toolCallId: toolCall.id,
          });
        }
      }

      let testsRun = false;
      let testsPassed = true;

      if (patches.length > 0) {
        const testResult = await executeTool('run_tests', {});
        testsRun = true;
        testsPassed = testResult.success && (testResult.output as { passed?: boolean })?.passed !== false;
      }

      const filesModified = patches.map(p => p.filePath);

      await this.updateJobStatus(jobId, 'review', {
        filesModified,
        testsRun,
        testsPassed,
        tokensUsed: totalTokens,
        durationMs: Date.now() - startTime,
        completedAt: new Date(),
      });

      aiLogger.endRequest(context, true, {
        patchCount: patches.length,
        testsRun,
        testsPassed,
        tokensUsed: totalTokens,
        durationMs: Date.now() - startTime,
      });

      return {
        success: true,
        patches,
        testsRun,
        testsPassed,
        tokensUsed: totalTokens,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      await this.updateJobStatus(jobId, 'failed', {
        errorMessage,
        durationMs: Date.now() - startTime,
      });

      aiLogger.logError(context, error as Error);

      return {
        success: false,
        patches: [],
        testsRun: false,
        testsPassed: false,
        tokensUsed: 0,
        durationMs: Date.now() - startTime,
        error: errorMessage,
      };
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const controller = this.activeJobs.get(jobId);
    if (controller) {
      controller.abort();
      await this.updateJobStatus(jobId, 'rejected', {
        errorMessage: 'Cancelled by user',
      });
      return true;
    }
    return false;
  }

  async approveJob(jobId: string, reviewerId?: string, comments?: string): Promise<boolean> {
    const job = await this.getJob(jobId);
    if (!job || job.status !== 'review') {
      return false;
    }

    const patches = await this.getJobPatches(jobId);

    for (const patch of patches) {
      const filePatch: FilePatch = {
        filePath: patch.filePath,
        patchType: patch.patchType as 'create' | 'modify' | 'delete' | 'rename',
        originalContent: patch.originalContent,
        newContent: patch.newContent,
        diffUnified: patch.diffUnified || '',
        diffStats: (patch.diffStats as { additions: number; deletions: number; hunks: number; files: number }) || { additions: 0, deletions: 0, hunks: 0, files: 0 },
      };

      const result = await repoManager.applyPatch(filePatch);
      
      if (!result.success) {
        await this.updateJobStatus(jobId, 'failed', {
          errorMessage: `Failed to apply patch ${patch.filePath}: ${result.error}`,
        });
        return false;
      }

      await db.update(aiDevPatches)
        .set({ status: 'applied', appliedAt: new Date() })
        .where(eq(aiDevPatches.id, patch.id));
    }

    // Create approval record
    await db.insert(aiDevApprovals).values({
      jobId,
      decision: 'approved',
      comments: comments || null,
      reviewedPatches: patches.map(p => p.id),
      reviewedBy: reviewerId ? (reviewerId as any) : null,
      reviewedAt: new Date(),
      isAutoApproved: false,
      autoApprovalRule: null,
    });

    await this.updateJobStatus(jobId, 'applied');
    return true;
  }

  async rejectJob(jobId: string, reason?: string, reviewerId?: string): Promise<boolean> {
    const job = await this.getJob(jobId);
    if (!job || !['review', 'pending', 'planning'].includes(job.status || '')) {
      return false;
    }

    // Create approval record with rejection decision
    await db.insert(aiDevApprovals).values({
      jobId,
      decision: 'rejected',
      comments: reason || null,
      reviewedPatches: [],
      reviewedBy: reviewerId ? (reviewerId as any) : null,
      reviewedAt: new Date(),
      isAutoApproved: false,
      autoApprovalRule: null,
    });

    await this.updateJobStatus(jobId, 'rejected', {
      errorMessage: reason || 'Rejected by user',
    });
    return true;
  }

  async rollbackJob(jobId: string): Promise<boolean> {
    const job = await this.getJob(jobId);
    if (!job || job.status !== 'applied') {
      return false;
    }

    const patches = await this.getJobPatches(jobId);

    for (const patch of patches.reverse()) {
      const filePatch: FilePatch = {
        filePath: patch.filePath,
        patchType: patch.patchType as 'create' | 'modify' | 'delete' | 'rename',
        originalContent: patch.originalContent,
        newContent: patch.newContent,
        diffUnified: patch.diffUnified || '',
        diffStats: (patch.diffStats as { additions: number; deletions: number; hunks: number; files: number }) || { additions: 0, deletions: 0, hunks: 0, files: 0 },
      };

      const result = await repoManager.rollbackPatch(filePatch);
      
      if (!result.success) {
        return false;
      }

      await db.update(aiDevPatches)
        .set({ status: 'rolled_back', rolledBackAt: new Date() })
        .where(eq(aiDevPatches.id, patch.id));
    }

    await this.updateJobStatus(jobId, 'rolled_back');
    return true;
  }

  private buildTaskPrompt(job: AIDevJob): string {
    let prompt = `Task: ${job.title}\n`;
    
    if (job.description) {
      prompt += `\nDescription: ${job.description}\n`;
    }

    prompt += `\nType: ${job.type}\n`;

    if (job.targetPaths?.length) {
      prompt += `\nTarget files/directories:\n`;
      job.targetPaths.forEach(p => {
        prompt += `- ${p}\n`;
      });
    }

    prompt += `\nInstructions:
1. First, explore the codebase to understand the current implementation
2. Plan your changes carefully
3. Implement the changes using the write_file tool
4. Run tests to verify your changes work correctly
5. Provide a summary of what you changed

Begin by reading the relevant files to understand the codebase.`;

    return prompt;
  }

  async getJobRuns(jobId: string): Promise<Array<{
    id: string;
    stepIndex: number | null;
    stepName: string | null;
    action: string;
    status: string | null;
    durationMs: number | null;
    createdAt: Date | null;
  }>> {
    return db.select({
      id: aiDevRuns.id,
      stepIndex: aiDevRuns.stepIndex,
      stepName: aiDevRuns.stepName,
      action: aiDevRuns.action,
      status: aiDevRuns.status,
      durationMs: aiDevRuns.durationMs,
      createdAt: aiDevRuns.createdAt,
    })
    .from(aiDevRuns)
    .where(eq(aiDevRuns.jobId, jobId))
    .orderBy(aiDevRuns.stepIndex);
  }
}

export const aiDevOrchestrator = new AIDevOrchestrator();
