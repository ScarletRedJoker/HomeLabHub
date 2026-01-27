/**
 * AI Content Scheduler for Stream Bot
 * 
 * Handles scheduled AI content generation:
 * - Periodic fun facts or tips
 * - Scheduled image generation
 * - Timed AI responses
 */

import * as cron from 'node-cron';
import { unifiedAIClient } from './unified-ai-client';

export interface ScheduledAITask {
  id: string;
  type: 'text' | 'image';
  cronExpression: string;
  config: ScheduledTaskConfig;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
}

export interface ScheduledTaskConfig {
  prompt?: string;
  systemPrompt?: string;
  personality?: 'helpful' | 'creative' | 'concise' | 'funny' | 'hype';
  maxTokens?: number;
  imageWidth?: number;
  imageHeight?: number;
}

export interface SchedulerCallback {
  onTextGenerated: (text: string, taskId: string) => void;
  onImageGenerated: (imageBase64: string, taskId: string) => void;
  onError: (error: string, taskId: string) => void;
}

class AIScheduler {
  private tasks: Map<string, ScheduledAITask> = new Map();
  private cronJobs: Map<string, cron.ScheduledTask> = new Map();
  private callback: SchedulerCallback | null = null;
  private isRunning = false;

  setCallback(callback: SchedulerCallback): void {
    this.callback = callback;
  }

  addTask(task: ScheduledAITask): void {
    this.tasks.set(task.id, task);
    if (task.enabled && this.isRunning) {
      this.scheduleTask(task);
    }
  }

  removeTask(taskId: string): void {
    const existingJob = this.cronJobs.get(taskId);
    if (existingJob) {
      existingJob.stop();
      this.cronJobs.delete(taskId);
    }
    this.tasks.delete(taskId);
  }

  enableTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.enabled = true;
      if (this.isRunning) {
        this.scheduleTask(task);
      }
    }
  }

  disableTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.enabled = false;
      const existingJob = this.cronJobs.get(taskId);
      if (existingJob) {
        existingJob.stop();
        this.cronJobs.delete(taskId);
      }
    }
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[AIScheduler] Starting scheduler...');

    for (const task of this.tasks.values()) {
      if (task.enabled) {
        this.scheduleTask(task);
      }
    }
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    console.log('[AIScheduler] Stopping scheduler...');

    for (const job of this.cronJobs.values()) {
      job.stop();
    }
    this.cronJobs.clear();
  }

  private scheduleTask(task: ScheduledAITask): void {
    const existingJob = this.cronJobs.get(task.id);
    if (existingJob) {
      existingJob.stop();
    }

    if (!cron.validate(task.cronExpression)) {
      console.error(`[AIScheduler] Invalid cron expression for task ${task.id}: ${task.cronExpression}`);
      return;
    }

    const job = cron.schedule(task.cronExpression, async () => {
      await this.executeTask(task);
    });

    this.cronJobs.set(task.id, job);
    console.log(`[AIScheduler] Scheduled task ${task.id} with cron: ${task.cronExpression}`);
  }

  private async executeTask(task: ScheduledAITask): Promise<void> {
    console.log(`[AIScheduler] Executing task ${task.id}...`);
    task.lastRun = new Date();

    try {
      if (task.type === 'text') {
        const result = await unifiedAIClient.generateText({
          prompt: task.config.prompt || 'Generate an interesting fun fact.',
          systemPrompt: task.config.systemPrompt,
          personality: task.config.personality || 'funny',
          maxTokens: task.config.maxTokens || 100,
        });

        if (result.success && result.text && this.callback) {
          this.callback.onTextGenerated(result.text, task.id);
        } else if (!result.success && this.callback) {
          this.callback.onError(result.error || 'Text generation failed', task.id);
        }
      } else if (task.type === 'image') {
        const result = await unifiedAIClient.generateImage({
          prompt: task.config.prompt || 'A beautiful landscape',
          width: task.config.imageWidth || 512,
          height: task.config.imageHeight || 512,
        });

        if (result.success && result.imageBase64 && this.callback) {
          this.callback.onImageGenerated(result.imageBase64, task.id);
        } else if (!result.success && this.callback) {
          this.callback.onError(result.error || 'Image generation failed', task.id);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[AIScheduler] Task ${task.id} failed:`, errorMessage);
      if (this.callback) {
        this.callback.onError(errorMessage, task.id);
      }
    }
  }

  async executeTaskNow(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task) {
      await this.executeTask(task);
    }
  }

  getTasks(): ScheduledAITask[] {
    return Array.from(this.tasks.values());
  }

  getTask(taskId: string): ScheduledAITask | undefined {
    return this.tasks.get(taskId);
  }
}

export const aiScheduler = new AIScheduler();
export default aiScheduler;
