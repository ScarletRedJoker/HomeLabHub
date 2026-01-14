/**
 * Jarvis Orchestrator - Multi-agent orchestration and task management
 * Handles job queuing, subagent spawning, task prioritization, and resource management
 */

import { localAIRuntime, RuntimeHealth } from "./local-ai-runtime";

export type JobPriority = "low" | "normal" | "high" | "critical";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type SubagentStatus = "idle" | "busy" | "stopped" | "error";

export interface JarvisJob {
  id: string;
  type: "code_analysis" | "code_fix" | "file_operation" | "command_execution" | "ai_generation" | "subagent_task";
  priority: JobPriority;
  status: JobStatus;
  progress: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  params: Record<string, any>;
  result?: any;
  error?: string;
  subagentId?: string;
  retries: number;
  maxRetries: number;
  timeout: number;
  notifyOnComplete: boolean;
}

export interface Subagent {
  id: string;
  name: string;
  type: "code" | "research" | "automation" | "creative";
  status: SubagentStatus;
  currentJobId?: string;
  capabilities: string[];
  createdAt: Date;
  lastActiveAt: Date;
  tasksCompleted: number;
  tasksRunning: number;
  preferLocalAI: boolean;
}

export interface AIResource {
  provider: string;
  type: "local" | "cloud";
  status: "available" | "busy" | "offline";
  capabilities: string[];
  priority: number;
  latencyMs?: number;
  costPerRequest?: number;
}

export interface OrchestratorStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  runningJobs: number;
  queuedJobs: number;
  activeSubagents: number;
  localAIAvailable: boolean;
  cloudAIAvailable: boolean;
}

interface JobQueueOptions {
  maxConcurrent: number;
  defaultTimeout: number;
  defaultRetries: number;
}

const DEFAULT_OPTIONS: JobQueueOptions = {
  maxConcurrent: 5,
  defaultTimeout: 120000,
  defaultRetries: 2,
};

const PRIORITY_WEIGHTS: Record<JobPriority, number> = {
  critical: 1000,
  high: 100,
  normal: 10,
  low: 1,
};

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

class JarvisOrchestrator {
  private jobs: Map<string, JarvisJob> = new Map();
  private subagents: Map<string, Subagent> = new Map();
  private aiResources: AIResource[] = [];
  private options: JobQueueOptions;
  private processing: boolean = false;
  private listeners: Map<string, ((job: JarvisJob) => void)[]> = new Map();
  private resourceCheckInterval?: NodeJS.Timeout;

  constructor(options: Partial<JobQueueOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.initializeResources();
  }

  private async initializeResources(): Promise<void> {
    this.aiResources = [
      {
        provider: "ollama",
        type: "local",
        status: "offline",
        capabilities: ["text-generation", "code-completion", "embedding"],
        priority: 100,
      },
      {
        provider: "stable-diffusion",
        type: "local",
        status: "offline",
        capabilities: ["image-generation"],
        priority: 100,
      },
      {
        provider: "comfyui",
        type: "local",
        status: "offline",
        capabilities: ["image-generation", "video-generation"],
        priority: 100,
      },
      {
        provider: "openai",
        type: "cloud",
        status: "available",
        capabilities: ["text-generation", "code-completion", "image-generation", "embedding"],
        priority: 50,
        costPerRequest: 0.01,
      },
      {
        provider: "replicate",
        type: "cloud",
        status: "available",
        capabilities: ["image-generation", "video-generation"],
        priority: 40,
        costPerRequest: 0.05,
      },
    ];
    await this.refreshResourceStatus();
  }

  async refreshResourceStatus(): Promise<AIResource[]> {
    try {
      const runtimes = await localAIRuntime.checkAllRuntimes();
      
      for (const runtime of runtimes) {
        const resource = this.aiResources.find(r => r.provider === runtime.provider);
        if (resource) {
          resource.status = runtime.status === "online" ? "available" : "offline";
          resource.latencyMs = runtime.latencyMs;
        }
      }

      const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      const openaiResource = this.aiResources.find(r => r.provider === "openai");
      if (openaiResource) {
        openaiResource.status = openaiKey ? "available" : "offline";
      }

      const replicateKey = process.env.REPLICATE_API_TOKEN;
      const replicateResource = this.aiResources.find(r => r.provider === "replicate");
      if (replicateResource) {
        replicateResource.status = replicateKey ? "available" : "offline";
      }
    } catch (error) {
      console.error("[Orchestrator] Failed to refresh resource status:", error);
    }
    
    return this.aiResources;
  }

  selectBestResource(capability: string, preferLocal: boolean = true): AIResource | null {
    const available = this.aiResources
      .filter(r => r.status === "available" && r.capabilities.includes(capability))
      .sort((a, b) => {
        if (preferLocal) {
          if (a.type === "local" && b.type !== "local") return -1;
          if (b.type === "local" && a.type !== "local") return 1;
        }
        return b.priority - a.priority;
      });
    
    return available[0] || null;
  }

  async createJob(
    type: JarvisJob["type"],
    params: Record<string, any>,
    options: Partial<Pick<JarvisJob, "priority" | "timeout" | "maxRetries" | "notifyOnComplete" | "subagentId">> = {}
  ): Promise<JarvisJob> {
    const job: JarvisJob = {
      id: generateId(),
      type,
      priority: options.priority || "normal",
      status: "queued",
      progress: 0,
      createdAt: new Date(),
      params,
      retries: 0,
      maxRetries: options.maxRetries ?? this.options.defaultRetries,
      timeout: options.timeout ?? this.options.defaultTimeout,
      notifyOnComplete: options.notifyOnComplete ?? false,
      subagentId: options.subagentId,
    };

    this.jobs.set(job.id, job);
    console.log(`[Orchestrator] Created job ${job.id} of type ${type} with priority ${job.priority}`);
    
    this.processQueue();
    
    return job;
  }

  getJob(jobId: string): JarvisJob | undefined {
    return this.jobs.get(jobId);
  }

  getJobsByStatus(status: JobStatus): JarvisJob[] {
    return Array.from(this.jobs.values()).filter(j => j.status === status);
  }

  getJobsBySubagent(subagentId: string): JarvisJob[] {
    return Array.from(this.jobs.values()).filter(j => j.subagentId === subagentId);
  }

  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    
    if (job.status === "queued") {
      job.status = "cancelled";
      job.completedAt = new Date();
      return true;
    }
    
    return false;
  }

  updateJobProgress(jobId: string, progress: number, result?: any): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    
    job.progress = Math.min(100, Math.max(0, progress));
    if (result !== undefined) {
      job.result = result;
    }
    
    this.notifyListeners(jobId, job);
  }

  completeJob(jobId: string, result: any): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    
    job.status = "completed";
    job.progress = 100;
    job.result = result;
    job.completedAt = new Date();
    
    console.log(`[Orchestrator] Job ${jobId} completed successfully`);
    this.notifyListeners(jobId, job);
    
    if (job.subagentId) {
      const subagent = this.subagents.get(job.subagentId);
      if (subagent) {
        subagent.tasksCompleted++;
        subagent.tasksRunning = Math.max(0, subagent.tasksRunning - 1);
        subagent.status = subagent.tasksRunning > 0 ? "busy" : "idle";
        subagent.lastActiveAt = new Date();
      }
    }
    
    this.processQueue();
  }

  failJob(jobId: string, error: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    
    job.retries++;
    
    if (job.retries < job.maxRetries) {
      console.log(`[Orchestrator] Job ${jobId} failed, retrying (${job.retries}/${job.maxRetries})`);
      job.status = "queued";
      job.error = error;
    } else {
      job.status = "failed";
      job.error = error;
      job.completedAt = new Date();
      console.log(`[Orchestrator] Job ${jobId} failed permanently: ${error}`);
    }
    
    this.notifyListeners(jobId, job);
    
    if (job.subagentId) {
      const subagent = this.subagents.get(job.subagentId);
      if (subagent) {
        subagent.tasksRunning = Math.max(0, subagent.tasksRunning - 1);
        subagent.status = job.retries >= job.maxRetries ? "error" : "idle";
        subagent.lastActiveAt = new Date();
      }
    }
    
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    
    try {
      const runningJobs = this.getJobsByStatus("running");
      const availableSlots = this.options.maxConcurrent - runningJobs.length;
      
      if (availableSlots <= 0) return;
      
      const queuedJobs = this.getJobsByStatus("queued")
        .sort((a, b) => {
          const priorityDiff = PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority];
          if (priorityDiff !== 0) return priorityDiff;
          return a.createdAt.getTime() - b.createdAt.getTime();
        });
      
      const toProcess = queuedJobs.slice(0, availableSlots);
      
      for (const job of toProcess) {
        job.status = "running";
        job.startedAt = new Date();
        
        if (job.subagentId) {
          const subagent = this.subagents.get(job.subagentId);
          if (subagent) {
            subagent.tasksRunning++;
            subagent.status = "busy";
            subagent.currentJobId = job.id;
          }
        }
        
        this.notifyListeners(job.id, job);
      }
    } finally {
      this.processing = false;
    }
  }

  createSubagent(
    name: string,
    type: Subagent["type"],
    capabilities: string[] = [],
    preferLocalAI: boolean = true
  ): Subagent {
    const subagent: Subagent = {
      id: generateId(),
      name,
      type,
      status: "idle",
      capabilities,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      tasksCompleted: 0,
      tasksRunning: 0,
      preferLocalAI,
    };
    
    this.subagents.set(subagent.id, subagent);
    console.log(`[Orchestrator] Created subagent ${subagent.id} (${name}) of type ${type}`);
    
    return subagent;
  }

  getSubagent(subagentId: string): Subagent | undefined {
    return this.subagents.get(subagentId);
  }

  getAllSubagents(): Subagent[] {
    return Array.from(this.subagents.values());
  }

  getActiveSubagents(): Subagent[] {
    return Array.from(this.subagents.values()).filter(s => s.status === "busy" || s.status === "idle");
  }

  stopSubagent(subagentId: string): boolean {
    const subagent = this.subagents.get(subagentId);
    if (!subagent) return false;
    
    subagent.status = "stopped";
    
    const jobs = this.getJobsBySubagent(subagentId);
    for (const job of jobs) {
      if (job.status === "queued" || job.status === "running") {
        job.status = "cancelled";
        job.completedAt = new Date();
      }
    }
    
    return true;
  }

  removeSubagent(subagentId: string): boolean {
    this.stopSubagent(subagentId);
    return this.subagents.delete(subagentId);
  }

  onJobUpdate(jobId: string, listener: (job: JarvisJob) => void): () => void {
    if (!this.listeners.has(jobId)) {
      this.listeners.set(jobId, []);
    }
    this.listeners.get(jobId)!.push(listener);
    
    return () => {
      const listeners = this.listeners.get(jobId);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index > -1) listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(jobId: string, job: JarvisJob): void {
    const listeners = this.listeners.get(jobId);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(job);
        } catch (error) {
          console.error("[Orchestrator] Listener error:", error);
        }
      }
    }
  }

  getStats(): OrchestratorStats {
    const jobs = Array.from(this.jobs.values());
    const localAI = this.aiResources.filter(r => r.type === "local" && r.status === "available");
    const cloudAI = this.aiResources.filter(r => r.type === "cloud" && r.status === "available");
    
    return {
      totalJobs: jobs.length,
      completedJobs: jobs.filter(j => j.status === "completed").length,
      failedJobs: jobs.filter(j => j.status === "failed").length,
      runningJobs: jobs.filter(j => j.status === "running").length,
      queuedJobs: jobs.filter(j => j.status === "queued").length,
      activeSubagents: this.getActiveSubagents().length,
      localAIAvailable: localAI.length > 0,
      cloudAIAvailable: cloudAI.length > 0,
    };
  }

  getResources(): AIResource[] {
    return [...this.aiResources];
  }

  async checkAllAIServices(): Promise<{
    local: RuntimeHealth[];
    cloud: { provider: string; status: string; hasKey: boolean }[];
  }> {
    const localRuntimes = await localAIRuntime.checkAllRuntimes();
    
    const cloudServices = [
      {
        provider: "openai",
        status: (process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY) ? "configured" : "not_configured",
        hasKey: !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY),
      },
      {
        provider: "replicate",
        status: process.env.REPLICATE_API_TOKEN ? "configured" : "not_configured",
        hasKey: !!process.env.REPLICATE_API_TOKEN,
      },
      {
        provider: "anthropic",
        status: process.env.ANTHROPIC_API_KEY ? "configured" : "not_configured",
        hasKey: !!process.env.ANTHROPIC_API_KEY,
      },
    ];
    
    return {
      local: localRuntimes,
      cloud: cloudServices,
    };
  }

  clearCompletedJobs(olderThanMs: number = 3600000): number {
    const now = Date.now();
    let cleared = 0;
    
    const entries = Array.from(this.jobs.entries());
    for (const [id, job] of entries) {
      if (
        (job.status === "completed" || job.status === "failed" || job.status === "cancelled") &&
        job.completedAt &&
        now - job.completedAt.getTime() > olderThanMs
      ) {
        this.jobs.delete(id);
        this.listeners.delete(id);
        cleared++;
      }
    }
    
    return cleared;
  }

  startResourceMonitoring(intervalMs: number = 30000): void {
    if (this.resourceCheckInterval) {
      clearInterval(this.resourceCheckInterval);
    }
    
    this.resourceCheckInterval = setInterval(() => {
      this.refreshResourceStatus();
    }, intervalMs);
  }

  stopResourceMonitoring(): void {
    if (this.resourceCheckInterval) {
      clearInterval(this.resourceCheckInterval);
      this.resourceCheckInterval = undefined;
    }
  }

  destroy(): void {
    this.stopResourceMonitoring();
    this.jobs.clear();
    this.subagents.clear();
    this.listeners.clear();
  }
}

export const jarvisOrchestrator = new JarvisOrchestrator();
