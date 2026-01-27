/**
 * Pipeline Scheduler Service
 * 
 * Manages automated scheduling and execution of content pipelines.
 * - Polls for scheduled pipelines with nextRunAt <= now
 * - Executes pipelines via influencerPipeline.executeFullPipeline()
 * - Updates nextRunAt based on cronExpression and timezone
 * - Priority queue with concurrency control and backpressure
 */

import { randomUUID } from 'crypto';
import { eq, and, lte, isNotNull } from 'drizzle-orm';
import { CronExpressionParser } from 'cron-parser';
import { db, isDbConnected } from '../db';
import { contentPipelines, type ContentPipeline } from '../db/platform-schema';
import { influencerPipeline, type PipelineRunResult } from './influencer-pipeline';
import { recordJobExecution, recordQueueDepth } from '@/lib/observability/metrics-collector';

function log(level: 'info' | 'warn' | 'error' | 'debug', operation: string, message: string, metadata?: Record<string, unknown>): void {
  const prefix = `[PipelineScheduler:${operation}]`;
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

export interface SchedulerConfig {
  pollIntervalMs: number;
  maxConcurrentExecutions: number;
  maxQueueSize: number;
  retryDelayMs: number;
  maxRetries: number;
}

export interface QueuedPipeline {
  id: string;
  pipelineId: string;
  priority: number;
  scheduledAt: Date;
  retryCount: number;
  addedAt: Date;
}

export interface SchedulerStats {
  isRunning: boolean;
  queueSize: number;
  activeExecutions: number;
  totalExecuted: number;
  totalFailed: number;
  lastPollAt: Date | null;
  uptime: number;
}

export interface ExecutionResult {
  queuedPipeline: QueuedPipeline;
  result: PipelineRunResult | null;
  error: string | null;
  executedAt: Date;
  durationMs: number;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  pollIntervalMs: 30000,
  maxConcurrentExecutions: 2,
  maxQueueSize: 100,
  retryDelayMs: 60000,
  maxRetries: 3,
};

export class SchedulerService {
  private config: SchedulerConfig;
  private isRunning: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private startedAt: Date | null = null;
  private lastPollAt: Date | null = null;
  
  private queue: QueuedPipeline[] = [];
  private activeExecutions: Map<string, Promise<ExecutionResult>> = new Map();
  
  private stats = {
    totalExecuted: 0,
    totalFailed: 0,
  };

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the scheduler service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      log('warn', 'start', 'Scheduler is already running');
      return;
    }

    if (!isDbConnected()) {
      log('error', 'start', 'Database not connected, cannot start scheduler');
      return;
    }

    const tablesExist = await this.verifyTablesExist();
    if (!tablesExist) {
      log('warn', 'start', 'Required tables do not exist yet, scheduler will start but polling may fail');
    }

    this.isRunning = true;
    this.startedAt = new Date();
    log('info', 'start', 'Starting pipeline scheduler', { config: this.config });

    try {
      await this.poll();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log('warn', 'start', `Initial poll failed (non-fatal): ${errorMessage}`);
    }

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    this.pollInterval = setInterval(() => {
      this.poll().catch(err => {
        log('error', 'poll-interval', `Poll error: ${err instanceof Error ? err.message : 'Unknown'}`);
      });
    }, this.config.pollIntervalMs);
  }

  /**
   * Verify that required database tables exist
   */
  private async verifyTablesExist(): Promise<boolean> {
    try {
      await db.select().from(contentPipelines).limit(1);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('does not exist') || errorMessage.includes('relation') || errorMessage.includes('no such table')) {
        log('warn', 'verifyTablesExist', 'content_pipelines table does not exist');
        return false;
      }
      log('error', 'verifyTablesExist', `Table verification failed: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Stop the scheduler service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      log('warn', 'stop', 'Scheduler is not running');
      return;
    }

    log('info', 'stop', 'Stopping pipeline scheduler');
    this.isRunning = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    if (this.activeExecutions.size > 0) {
      log('info', 'stop', 'Waiting for active executions to complete', {
        count: this.activeExecutions.size,
      });
      await Promise.allSettled(Array.from(this.activeExecutions.values()));
    }

    this.startedAt = null;
    log('info', 'stop', 'Scheduler stopped');
  }

  /**
   * Get current scheduler statistics
   */
  getStats(): SchedulerStats {
    return {
      isRunning: this.isRunning,
      queueSize: this.queue.length,
      activeExecutions: this.activeExecutions.size,
      totalExecuted: this.stats.totalExecuted,
      totalFailed: this.stats.totalFailed,
      lastPollAt: this.lastPollAt,
      uptime: this.startedAt ? Date.now() - this.startedAt.getTime() : 0,
    };
  }

  /**
   * Manually trigger a poll for due pipelines
   */
  async triggerPoll(): Promise<number> {
    return this.poll();
  }

  /**
   * Add a pipeline to the queue manually
   */
  addToQueue(pipelineId: string, priority: number = 0): boolean {
    if (this.queue.length >= this.config.maxQueueSize) {
      log('warn', 'addToQueue', 'Queue is full, rejecting pipeline', {
        pipelineId,
        queueSize: this.queue.length,
        maxSize: this.config.maxQueueSize,
      });
      return false;
    }

    const exists = this.queue.some(q => q.pipelineId === pipelineId) ||
                   this.activeExecutions.has(pipelineId);
    
    if (exists) {
      log('debug', 'addToQueue', 'Pipeline already in queue or executing', { pipelineId });
      return false;
    }

    const queued: QueuedPipeline = {
      id: randomUUID(),
      pipelineId,
      priority,
      scheduledAt: new Date(),
      retryCount: 0,
      addedAt: new Date(),
    };

    this.insertByPriority(queued);
    log('info', 'addToQueue', 'Pipeline added to queue', { pipelineId, priority, queueSize: this.queue.length });
    
    recordQueueDepth('pipeline-scheduler', this.queue.length);
    
    this.processQueue();
    return true;
  }

  /**
   * Remove a pipeline from the queue
   */
  removeFromQueue(pipelineId: string): boolean {
    const index = this.queue.findIndex(q => q.pipelineId === pipelineId);
    if (index === -1) {
      return false;
    }
    this.queue.splice(index, 1);
    log('info', 'removeFromQueue', 'Pipeline removed from queue', { pipelineId });
    return true;
  }

  /**
   * Get the current queue
   */
  getQueue(): QueuedPipeline[] {
    return [...this.queue];
  }

  /**
   * Clear the queue
   */
  clearQueue(): void {
    const count = this.queue.length;
    this.queue = [];
    log('info', 'clearQueue', 'Queue cleared', { removedCount: count });
  }

  /**
   * Poll for due pipelines and add to queue
   */
  private async poll(): Promise<number> {
    if (!this.isRunning) {
      return 0;
    }
    
    if (!isDbConnected()) {
      log('debug', 'poll', 'Database not connected, skipping poll');
      return 0;
    }

    this.lastPollAt = new Date();
    log('debug', 'poll', 'Polling for due pipelines');

    try {
      const now = new Date();
      
      const duePipelines = await db.select()
        .from(contentPipelines)
        .where(
          and(
            eq(contentPipelines.isScheduled, true),
            eq(contentPipelines.isActive, true),
            isNotNull(contentPipelines.nextRunAt),
            lte(contentPipelines.nextRunAt, now)
          )
        );

      if (duePipelines.length === 0) {
        log('debug', 'poll', 'No due pipelines found');
        return 0;
      }

      log('info', 'poll', 'Found due pipelines', { count: duePipelines.length });

      let addedCount = 0;
      for (const pipeline of duePipelines) {
        if (this.addToQueue(pipeline.id, 0)) {
          addedCount++;
        }
      }

      return addedCount;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('does not exist') || errorMessage.includes('relation') || errorMessage.includes('no such table')) {
        log('debug', 'poll', 'Table not ready yet, will retry on next poll');
        return 0;
      }
      
      log('error', 'poll', `Failed to poll pipelines: ${errorMessage}`);
      return 0;
    }
  }

  /**
   * Process items from the queue
   */
  private processQueue(): void {
    if (!this.isRunning) {
      return;
    }

    while (
      this.queue.length > 0 &&
      this.activeExecutions.size < this.config.maxConcurrentExecutions
    ) {
      const item = this.queue.shift();
      if (!item) break;

      const execution = this.executePipeline(item);
      this.activeExecutions.set(item.pipelineId, execution);

      execution.finally(() => {
        this.activeExecutions.delete(item.pipelineId);
        this.processQueue();
      });
    }
  }

  /**
   * Execute a single pipeline
   */
  private async executePipeline(queued: QueuedPipeline): Promise<ExecutionResult> {
    const startTime = Date.now();
    log('info', 'executePipeline', 'Executing pipeline', {
      pipelineId: queued.pipelineId,
      retryCount: queued.retryCount,
    });

    try {
      const pipeline = await this.getPipelineById(queued.pipelineId);
      if (!pipeline) {
        throw new Error(`Pipeline not found: ${queued.pipelineId}`);
      }

      const result = await influencerPipeline.executeFullPipeline(queued.pipelineId);

      await this.updatePipelineSchedule(pipeline);

      const durationMs = Date.now() - startTime;
      this.stats.totalExecuted++;
      log('info', 'executePipeline', 'Pipeline executed successfully', {
        pipelineId: queued.pipelineId,
        runId: result.runId,
        status: result.status,
      });

      recordJobExecution('pipeline', 'success', durationMs);

      return {
        queuedPipeline: queued,
        result,
        error: null,
        executedAt: new Date(),
        durationMs,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log('error', 'executePipeline', `Pipeline execution failed: ${errorMessage}`, {
        pipelineId: queued.pipelineId,
      });

      const durationMs = Date.now() - startTime;
      
      if (queued.retryCount < this.config.maxRetries) {
        setTimeout(() => {
          const retryQueued: QueuedPipeline = {
            ...queued,
            id: randomUUID(),
            retryCount: queued.retryCount + 1,
            addedAt: new Date(),
          };
          this.insertByPriority(retryQueued);
          log('info', 'executePipeline', 'Scheduled retry', {
            pipelineId: queued.pipelineId,
            retryCount: retryQueued.retryCount,
          });
        }, this.config.retryDelayMs);
      } else {
        this.stats.totalFailed++;
        log('error', 'executePipeline', 'Max retries exceeded', {
          pipelineId: queued.pipelineId,
          maxRetries: this.config.maxRetries,
        });
        
        recordJobExecution('pipeline', 'failure', durationMs);
      }

      return {
        queuedPipeline: queued,
        result: null,
        error: errorMessage,
        executedAt: new Date(),
        durationMs,
      };
    }
  }

  /**
   * Update pipeline schedule after execution
   */
  private async updatePipelineSchedule(pipeline: ContentPipeline): Promise<void> {
    if (!pipeline.cronExpression) {
      log('debug', 'updatePipelineSchedule', 'No cron expression, skipping schedule update', {
        pipelineId: pipeline.id,
      });
      return;
    }

    try {
      const nextRunAt = this.calculateNextRun(
        pipeline.cronExpression,
        pipeline.timezone || 'UTC'
      );

      await db.update(contentPipelines)
        .set({
          lastRunAt: new Date(),
          nextRunAt,
          updatedAt: new Date(),
        })
        .where(eq(contentPipelines.id, pipeline.id));

      log('info', 'updatePipelineSchedule', 'Updated pipeline schedule', {
        pipelineId: pipeline.id,
        nextRunAt: nextRunAt?.toISOString(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log('error', 'updatePipelineSchedule', `Failed to update schedule: ${errorMessage}`, {
        pipelineId: pipeline.id,
      });
    }
  }

  /**
   * Calculate next run time from cron expression
   */
  private calculateNextRun(cronExpression: string, timezone: string): Date | null {
    try {
      const interval = CronExpressionParser.parse(cronExpression, {
        tz: timezone,
        currentDate: new Date(),
      });
      
      return interval.next().toDate();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log('error', 'calculateNextRun', `Failed to parse cron expression: ${errorMessage}`, {
        cronExpression,
        timezone,
      });
      return null;
    }
  }

  /**
   * Insert item into queue by priority (higher priority first)
   */
  private insertByPriority(item: QueuedPipeline): void {
    let insertIndex = this.queue.length;
    
    for (let i = 0; i < this.queue.length; i++) {
      if (item.priority > this.queue[i].priority) {
        insertIndex = i;
        break;
      }
    }
    
    this.queue.splice(insertIndex, 0, item);
  }

  /**
   * Get pipeline by ID
   */
  private async getPipelineById(pipelineId: string): Promise<ContentPipeline | null> {
    try {
      const results = await db.select()
        .from(contentPipelines)
        .where(eq(contentPipelines.id, pipelineId))
        .limit(1);
      
      return results[0] || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if scheduler is running
   */
  isSchedulerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get available capacity in queue
   */
  getQueueCapacity(): number {
    return this.config.maxQueueSize - this.queue.length;
  }

  /**
   * Check if queue has capacity (for backpressure)
   */
  hasQueueCapacity(): boolean {
    return this.queue.length < this.config.maxQueueSize;
  }

  /**
   * Update scheduler configuration
   */
  updateConfig(config: Partial<SchedulerConfig>): void {
    const wasRunning = this.isRunning;
    
    if (wasRunning && config.pollIntervalMs && config.pollIntervalMs !== this.config.pollIntervalMs) {
      if (this.pollInterval) {
        clearInterval(this.pollInterval);
      }
      this.pollInterval = setInterval(() => {
        this.poll();
      }, config.pollIntervalMs);
    }
    
    this.config = { ...this.config, ...config };
    log('info', 'updateConfig', 'Configuration updated', { config: this.config });
  }

  /**
   * Get current configuration
   */
  getConfig(): SchedulerConfig {
    return { ...this.config };
  }
}

export const pipelineScheduler = new SchedulerService();
