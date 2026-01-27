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
import { contextManager, type ContextSummary } from './context-manager';
import { remoteExecutor, type RemoteExecutionConfig } from './remote-executor';

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

export interface AutoApprovalRule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: {
    maxFilesChanged?: number;
    maxLinesChanged?: number;
    allowedPaths?: string[];
    excludedPaths?: string[];
    requireTestsPass?: boolean;
    requireBuildPass?: boolean;
    jobTypes?: string[];
  };
}

export interface BuildVerificationResult {
  success: boolean;
  output: string;
  errors: string[];
  buildSystem: 'npm' | 'cargo' | 'go' | 'python' | 'unknown';
}

export const DEFAULT_AUTO_APPROVAL_RULES: AutoApprovalRule[] = [
  {
    id: 'docs-only',
    name: 'Documentation Only',
    enabled: true,
    conditions: {
      allowedPaths: ['**/*.md', '**/README*', '**/docs/**'],
      jobTypes: ['docs'],
    },
  },
  {
    id: 'test-only',
    name: 'Test Only Changes',
    enabled: true,
    conditions: {
      allowedPaths: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx', '**/tests/**', '**/__tests__/**'],
      jobTypes: ['test'],
      requireTestsPass: true,
    },
  },
  {
    id: 'small-changes',
    name: 'Small Safe Changes',
    enabled: true,
    conditions: {
      maxFilesChanged: 2,
      maxLinesChanged: 50,
      excludedPaths: ['**/lib/db/**', '**/lib/auth/**', '**/migrations/**', '**/*.sql'],
      requireTestsPass: true,
      requireBuildPass: true,
    },
  },
];

export interface CreateJobParams {
  title: string;
  description?: string;
  type: JobType;
  targetPaths?: string[];
  provider?: string;
  model?: string;
  createdBy?: string;
  useBranchIsolation?: boolean;
  branchPrefix?: string;
  remoteConfig?: RemoteExecutionConfig;
}

export interface BranchIsolationMetadata {
  branchName?: string;
  originalBranch?: string;
  branchMerged?: boolean;
}

export interface JobExecutionResult {
  success: boolean;
  patches: FilePatch[];
  testsRun: boolean;
  testsPassed: boolean;
  buildRun: boolean;
  buildPassed: boolean;
  buildOutput?: string;
  autoApproved: boolean;
  autoApprovalRule?: string;
  tokensUsed: number;
  durationMs: number;
  error?: string;
  contextSummary?: ContextSummary;
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

  async executeJob(jobId: string, options?: { useBranchIsolation?: boolean; branchPrefix?: string; remoteConfig?: RemoteExecutionConfig }): Promise<JobExecutionResult> {
    const logContext = aiLogger.startRequest('ollama', 'execute_job', { jobId });
    const startTime = Date.now();
    const abortController = new AbortController();
    
    this.activeJobs.set(jobId, abortController);

    const useBranchIsolation = options?.useBranchIsolation ?? true;
    const branchPrefix = options?.branchPrefix ?? 'ai-dev';
    const remoteConfig = options?.remoteConfig;
    let originalBranch: string | undefined;
    let jobBranchName: string | undefined;

    contextManager.createContext(jobId);

    try {
      const job = await this.getJob(jobId);
      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      await this.updateJobStatus(jobId, 'planning');

      if (useBranchIsolation) {
        originalBranch = await repoManager.getCurrentBranch();
        const branchResult = await repoManager.createJobBranch(jobId, branchPrefix);
        
        if (!branchResult.success) {
          throw new Error(`Failed to create job branch: ${branchResult.error}`);
        }
        
        jobBranchName = branchResult.branchName;
        
        const branchMetadata: BranchIsolationMetadata = {
          branchName: jobBranchName,
          originalBranch,
          branchMerged: false,
        };
        
        await this.updateJobStatus(jobId, 'planning', {
          branchMetadata: branchMetadata as any,
        });
      }

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
          aiLogger.logError(logContext, new Error(errorMessage));
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
          const toolResult = await executeTool(toolCall.function.name, args, remoteConfig);

          await contextManager.recordDecision(
            jobId,
            iterations,
            toolCall.function.name,
            `Called ${toolCall.function.name} with args: ${JSON.stringify(args).substring(0, 200)}`
          );

          if (toolCall.function.name === 'read_file' && toolResult.success) {
            await contextManager.recordFileRead(
              jobId,
              args.path,
              typeof toolResult.output === 'string' ? toolResult.output : JSON.stringify(toolResult.output)
            );
          }

          if ((toolCall.function.name === 'search_code' || toolCall.function.name === 'search_files') && toolResult.success) {
            await contextManager.recordSearch(
              jobId,
              args.query || args.pattern || '',
              Array.isArray(toolResult.output) ? toolResult.output : []
            );
          }

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
      let buildRun = false;
      let buildPassed = true;
      let buildOutput = '';

      if (patches.length > 0) {
        const testResult = await executeTool('run_tests', {});
        testsRun = true;
        testsPassed = testResult.success && (testResult.output as { passed?: boolean })?.passed !== false;

        const targetDir = job.targetRepo || 'services/dashboard-next';
        const buildResult = await this.runBuildVerification(targetDir);
        buildRun = true;
        buildPassed = buildResult.success;
        buildOutput = buildResult.output.substring(0, 10000);
      }

      const filesModified = patches.map(p => p.filePath);

      await this.updateJobStatus(jobId, 'review', {
        filesModified,
        testsRun,
        testsPassed,
        buildRun,
        buildPassed,
        buildOutput,
        tokensUsed: totalTokens,
        durationMs: Date.now() - startTime,
        completedAt: new Date(),
      });

      const jobPatches = await this.getJobPatches(jobId);
      const updatedJob = await this.getJob(jobId);
      
      const autoApprovalResult = this.evaluateAutoApprovalRules(
        updatedJob!,
        jobPatches,
        testsRun,
        testsPassed,
        buildRun,
        buildPassed
      );

      let autoApproved = false;
      let autoApprovalRule: string | undefined;

      if (autoApprovalResult.approved && autoApprovalResult.rule) {
        const approvalSuccess = await this.autoApproveJob(jobId, autoApprovalResult.rule);
        if (approvalSuccess) {
          autoApproved = true;
          autoApprovalRule = autoApprovalResult.rule.id;
        }
      }

      const ctxSummary = await contextManager.summarizeContext(jobId);

      aiLogger.endRequest(logContext, true, {
        patchCount: patches.length,
        testsRun,
        testsPassed,
        buildRun,
        buildPassed,
        autoApproved,
        autoApprovalRule,
        tokensUsed: totalTokens,
        durationMs: Date.now() - startTime,
      });

      return {
        success: true,
        patches,
        testsRun,
        testsPassed,
        buildRun,
        buildPassed,
        buildOutput,
        autoApproved,
        autoApprovalRule,
        tokensUsed: totalTokens,
        durationMs: Date.now() - startTime,
        contextSummary: ctxSummary || undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      await this.updateJobStatus(jobId, 'failed', {
        errorMessage,
        durationMs: Date.now() - startTime,
      });

      aiLogger.logError(logContext, error as Error);

      return {
        success: false,
        patches: [],
        testsRun: false,
        testsPassed: false,
        buildRun: false,
        buildPassed: false,
        autoApproved: false,
        tokensUsed: 0,
        durationMs: Date.now() - startTime,
        error: errorMessage,
      };
    } finally {
      this.activeJobs.delete(jobId);
      await contextManager.clearContext(jobId);
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

  async approveJob(jobId: string, reviewerId?: string, comments?: string, options?: { mergeBranch?: boolean }): Promise<boolean> {
    const job = await this.getJob(jobId);
    if (!job || job.status !== 'review') {
      return false;
    }

    const patches = await this.getJobPatches(jobId);
    const branchMetadata = job.branchMetadata as BranchIsolationMetadata | null;
    const shouldMergeBranch = options?.mergeBranch ?? true;

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

    if (branchMetadata?.branchName && branchMetadata?.originalBranch && shouldMergeBranch) {
      const mergeResult = await repoManager.mergeJobBranch(
        branchMetadata.branchName,
        branchMetadata.originalBranch
      );
      
      if (mergeResult.success) {
        const updatedMetadata: BranchIsolationMetadata = {
          ...branchMetadata,
          branchMerged: true,
        };
        
        await this.updateJobStatus(jobId, job.status as JobStatus, {
          branchMetadata: updatedMetadata as any,
        });
      }
    }

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

  async rollbackJob(jobId: string, options?: { deleteBranch?: boolean }): Promise<boolean> {
    const job = await this.getJob(jobId);
    if (!job || job.status !== 'applied') {
      return false;
    }

    const patches = await this.getJobPatches(jobId);
    const branchMetadata = job.branchMetadata as BranchIsolationMetadata | null;
    const shouldDeleteBranch = options?.deleteBranch ?? false;

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

    if (branchMetadata?.originalBranch) {
      await repoManager.switchBranch(branchMetadata.originalBranch);
    }

    if (branchMetadata?.branchName && shouldDeleteBranch) {
      await repoManager.deleteJobBranch(branchMetadata.branchName);
    }

    await this.updateJobStatus(jobId, 'rolled_back');
    return true;
  }

  async runBuildVerification(targetDir: string = 'services/dashboard-next'): Promise<BuildVerificationResult> {
    const context = aiLogger.startRequest('ollama', 'build_verification', { targetDir });
    
    try {
      const checkFile = async (filePath: string): Promise<boolean> => {
        const result = await executeTool('run_command', { 
          command: `test -f "${filePath}" && echo "exists"`,
          timeout: 5000 
        });
        return result.success && (result.output as { stdout?: string })?.stdout?.includes('exists');
      };

      const hasPackageJson = await checkFile(`${targetDir}/package.json`);
      const hasCargoToml = await checkFile(`${targetDir}/Cargo.toml`);
      const hasGoMod = await checkFile(`${targetDir}/go.mod`);
      const hasPyProject = await checkFile(`${targetDir}/pyproject.toml`) || await checkFile(`${targetDir}/setup.py`);

      let buildCommand: string;
      let buildSystem: BuildVerificationResult['buildSystem'];

      if (hasPackageJson) {
        buildSystem = 'npm';
        const pkgJsonResult = await executeTool('read_file', { path: `${targetDir}/package.json` });
        if (pkgJsonResult.success) {
          const pkgJson = JSON.parse(pkgJsonResult.output as string);
          if (pkgJson.scripts?.typecheck) {
            buildCommand = `cd ${targetDir} && npm run typecheck`;
          } else if (pkgJson.scripts?.build) {
            buildCommand = `cd ${targetDir} && npm run build`;
          } else {
            buildCommand = `cd ${targetDir} && npx tsc --noEmit`;
          }
        } else {
          buildCommand = `cd ${targetDir} && npx tsc --noEmit`;
        }
      } else if (hasCargoToml) {
        buildSystem = 'cargo';
        buildCommand = `cd ${targetDir} && cargo build --release`;
      } else if (hasGoMod) {
        buildSystem = 'go';
        buildCommand = `cd ${targetDir} && go build ./...`;
      } else if (hasPyProject) {
        buildSystem = 'python';
        buildCommand = `cd ${targetDir} && python -m py_compile *.py`;
      } else {
        buildSystem = 'unknown';
        aiLogger.endRequest(context, true, { buildSystem, skipped: true });
        return { success: true, output: 'No build system detected, skipping build verification', errors: [], buildSystem };
      }

      const result = await executeTool('run_command', {
        command: buildCommand,
        timeout: 300000,
      });

      const output = result.output as { stdout?: string; stderr?: string } | null;
      const stdout = output?.stdout || '';
      const stderr = output?.stderr || '';
      const errors: string[] = [];

      if (!result.success) {
        const errorLines = stderr.split('\n').filter(line => 
          line.toLowerCase().includes('error') || 
          line.includes('TS') ||
          line.includes('cannot find')
        );
        errors.push(...errorLines.slice(0, 20));
      }

      aiLogger.endRequest(context, result.success, { buildSystem, errorCount: errors.length });

      return {
        success: result.success,
        output: stdout + '\n' + stderr,
        errors,
        buildSystem,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown build error';
      aiLogger.logError(context, errorMessage);
      return {
        success: false,
        output: errorMessage,
        errors: [errorMessage],
        buildSystem: 'unknown',
      };
    }
  }

  private matchesGlobPattern(filePath: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/\{\{GLOBSTAR\}\}/g, '.*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }

  evaluateAutoApprovalRules(
    job: AIDevJob,
    patches: AIDevPatch[],
    testsRun: boolean,
    testsPassed: boolean,
    buildRun: boolean,
    buildPassed: boolean,
    rules: AutoApprovalRule[] = DEFAULT_AUTO_APPROVAL_RULES
  ): { approved: boolean; rule?: AutoApprovalRule } {
    for (const rule of rules) {
      if (!rule.enabled) continue;

      const { conditions } = rule;
      let matches = true;

      if (conditions.jobTypes?.length) {
        if (!conditions.jobTypes.includes(job.type || '')) {
          matches = false;
          continue;
        }
      }

      if (conditions.maxFilesChanged !== undefined) {
        if (patches.length > conditions.maxFilesChanged) {
          matches = false;
          continue;
        }
      }

      if (conditions.maxLinesChanged !== undefined) {
        const totalLines = patches.reduce((sum, patch) => {
          const stats = patch.diffStats as { additions?: number; deletions?: number } | null;
          return sum + (stats?.additions || 0) + (stats?.deletions || 0);
        }, 0);
        if (totalLines > conditions.maxLinesChanged) {
          matches = false;
          continue;
        }
      }

      if (conditions.allowedPaths?.length) {
        const allFilesMatch = patches.every(patch => 
          conditions.allowedPaths!.some(pattern => this.matchesGlobPattern(patch.filePath, pattern))
        );
        if (!allFilesMatch) {
          matches = false;
          continue;
        }
      }

      if (conditions.excludedPaths?.length) {
        const anyFileExcluded = patches.some(patch => 
          conditions.excludedPaths!.some(pattern => this.matchesGlobPattern(patch.filePath, pattern))
        );
        if (anyFileExcluded) {
          matches = false;
          continue;
        }
      }

      if (conditions.requireTestsPass) {
        if (!testsRun || !testsPassed) {
          matches = false;
          continue;
        }
      }

      if (conditions.requireBuildPass) {
        if (!buildRun || !buildPassed) {
          matches = false;
          continue;
        }
      }

      if (matches) {
        return { approved: true, rule };
      }
    }

    return { approved: false };
  }

  async autoApproveJob(jobId: string, rule: AutoApprovalRule): Promise<boolean> {
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
          errorMessage: `Auto-approval failed: ${result.error}`,
        });
        return false;
      }

      await db.update(aiDevPatches)
        .set({ status: 'applied', appliedAt: new Date() })
        .where(eq(aiDevPatches.id, patch.id));
    }

    await db.insert(aiDevApprovals).values({
      jobId,
      decision: 'approved',
      comments: `Auto-approved by rule: ${rule.name}`,
      reviewedPatches: patches.map(p => p.id),
      reviewedBy: null,
      reviewedAt: new Date(),
      isAutoApproved: true,
      autoApprovalRule: rule.id,
    });

    await this.updateJobStatus(jobId, 'applied', {
      autoApprovalRule: rule.id,
    });

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
    tokensUsed: number | null;
    input: unknown;
    output: unknown;
    errorMessage: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date | null;
  }>> {
    return db.select({
      id: aiDevRuns.id,
      stepIndex: aiDevRuns.stepIndex,
      stepName: aiDevRuns.stepName,
      action: aiDevRuns.action,
      status: aiDevRuns.status,
      durationMs: aiDevRuns.durationMs,
      tokensUsed: aiDevRuns.tokensUsed,
      input: aiDevRuns.input,
      output: aiDevRuns.output,
      errorMessage: aiDevRuns.errorMessage,
      startedAt: aiDevRuns.startedAt,
      completedAt: aiDevRuns.completedAt,
      createdAt: aiDevRuns.createdAt,
    })
    .from(aiDevRuns)
    .where(eq(aiDevRuns.jobId, jobId))
    .orderBy(aiDevRuns.stepIndex);
  }
}

export const aiDevOrchestrator = new AIDevOrchestrator();
