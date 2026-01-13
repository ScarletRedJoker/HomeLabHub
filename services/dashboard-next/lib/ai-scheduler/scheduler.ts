/**
 * GPU Job Scheduler
 * Manages AI job queuing, worker task claiming, and VRAM allocation
 * Supports multi-node GPU clusters with fair scheduling and lock-based resource management
 */

import {
  AIJob,
  NewAIJob,
  AINode,
  AIJobLock,
  AIGpuSnapshot,
  aiJobs,
  aiNodes,
  aiJobLocks,
  aiGpuSnapshots,
} from '../db/ai-cluster-schema';

/**
 * Queue status information
 */
export interface QueueStatus {
  totalQueued: number;
  totalRunning: number;
  totalCompleted: number;
  totalFailed: number;
  averageWaitTimeMs: number;
  oldestQueuedJobAgeMs: number;
  nodeStats: Array<{
    nodeId: string;
    nodeName: string;
    runningJobs: number;
    queuedJobs: number;
    utilizationPercent: number;
  }>;
}

/**
 * Job claim result returned to worker
 */
export interface JobClaim {
  jobId: string;
  lockToken: string;
  nodeId: string;
  jobType: string;
  model: string | null;
  payload: Record<string, unknown>;
  estimatedVramMb: number | null;
  priority: number;
}

/**
 * VRAM allocation result
 */
export interface VRAMAllocation {
  lockId: string;
  jobId: string;
  nodeId: string;
  vramAllocatedMb: number;
  vramAvailableMb: number;
  canProceed: boolean;
}

/**
 * VRAMManager handles VRAM allocation, locks, and cleanup
 * Ensures no overallocation by tracking active locks against GPU snapshots
 */
export class VRAMManager {
  private databaseUrl: string;

  constructor(databaseUrl?: string) {
    this.databaseUrl = databaseUrl || process.env.DATABASE_URL || '';
  }

  /**
   * Query current free VRAM for a node based on latest snapshot
   * Returns the most recent GPU snapshot for the node
   */
  async getAvailableVram(nodeId: string): Promise<number> {
    // TODO: Drizzle query
    // const snapshot = await db
    //   .select()
    //   .from(aiGpuSnapshots)
    //   .where(eq(aiGpuSnapshots.nodeId, nodeId))
    //   .orderBy(desc(aiGpuSnapshots.createdAt))
    //   .limit(1)
    //   .then(rows => rows[0]);
    //
    // if (!snapshot) {
    //   throw new Error(`No GPU snapshot found for node ${nodeId}`);
    // }
    //
    // return snapshot.freeVramMb - snapshot.reservedVramMb;

    console.log(`[VRAMManager] Getting available VRAM for node ${nodeId}`);
    throw new Error('Database connection not initialized. Use with actual DB connection.');
  }

  /**
   * Check if a job with given VRAM requirement can fit on a node
   * Considers both GPU snapshot and active locks
   */
  async canAllocate(nodeId: string, requiredMb: number): Promise<boolean> {
    // TODO: Drizzle query
    // const availableVram = await this.getAvailableVram(nodeId);
    //
    // const activeLocks = await db
    //   .select({ totalLocked: sql<number>`SUM(${aiJobLocks.vramLockedMb})` })
    //   .from(aiJobLocks)
    //   .where(
    //     and(
    //       eq(aiJobLocks.nodeId, nodeId),
    //       eq(aiJobLocks.released, false),
    //       isNull(aiJobLocks.releasedAt)
    //     )
    //   )
    //   .then(rows => rows[0]?.totalLocked || 0);
    //
    // const effectiveAvailable = availableVram - activeLocks;
    // return effectiveAvailable >= requiredMb;

    console.log(`[VRAMManager] Checking if ${requiredMb}MB can be allocated on node ${nodeId}`);
    throw new Error('Database connection not initialized. Use with actual DB connection.');
  }

  /**
   * Create a VRAM lock for a job on a specific node
   * Returns the lock ID and allocation details
   */
  async acquireLock(jobId: string, nodeId: string, vramMb: number): Promise<VRAMAllocation> {
    // TODO: Drizzle query
    // const canAllocate = await this.canAllocate(nodeId, vramMb);
    // if (!canAllocate) {
    //   throw new Error(`Insufficient VRAM on node ${nodeId} for ${vramMb}MB allocation`);
    // }
    //
    // const lockId = generateUUID();
    // const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minute lock
    //
    // await db.insert(aiJobLocks).values({
    //   id: lockId,
    //   jobId,
    //   nodeId,
    //   resourceType: 'vram',
    //   vramLockedMb: vramMb,
    //   expiresAt,
    // });
    //
    // const availableVram = await this.getAvailableVram(nodeId);
    //
    // return {
    //   lockId,
    //   jobId,
    //   nodeId,
    //   vramAllocatedMb: vramMb,
    //   vramAvailableMb: availableVram - vramMb,
    //   canProceed: true,
    // };

    console.log(`[VRAMManager] Acquiring VRAM lock for job ${jobId} on node ${nodeId} (${vramMb}MB)`);
    throw new Error('Database connection not initialized. Use with actual DB connection.');
  }

  /**
   * Release a VRAM lock, freeing up the reserved VRAM
   * Sets released flag and releasedAt timestamp
   */
  async releaseLock(lockId: string): Promise<void> {
    // TODO: Drizzle query
    // await db
    //   .update(aiJobLocks)
    //   .set({
    //     released: true,
    //     releasedAt: new Date(),
    //   })
    //   .where(eq(aiJobLocks.id, lockId));

    console.log(`[VRAMManager] Releasing VRAM lock ${lockId}`);
    throw new Error('Database connection not initialized. Use with actual DB connection.');
  }

  /**
   * Clean up stale locks that have expired or whose jobs are no longer running
   * Removes locks older than maxAgeMinutes or without a corresponding active job
   */
  async cleanupStaleLocks(maxAgeMinutes: number = 30): Promise<number> {
    // TODO: Drizzle query
    // const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
    //
    // // Find locks that have expired or jobs that are no longer in 'running' state
    // const staleLocks = await db
    //   .select({ id: aiJobLocks.id })
    //   .from(aiJobLocks)
    //   .leftJoin(aiJobs, eq(aiJobLocks.jobId, aiJobs.id))
    //   .where(
    //     or(
    //       and(
    //         isNull(aiJobs.id), // Job doesn't exist
    //         eq(aiJobLocks.released, false)
    //       ),
    //       and(
    //         ne(aiJobs.status, 'running'), // Job is no longer running
    //         eq(aiJobLocks.released, false)
    //       ),
    //       and(
    //         lt(aiJobLocks.acquiredAt, cutoffTime), // Lock is too old
    //         eq(aiJobLocks.released, false)
    //       )
    //     )
    //   );
    //
    // for (const lock of staleLocks) {
    //   await this.releaseLock(lock.id);
    // }
    //
    // return staleLocks.length;

    console.log(`[VRAMManager] Cleaning up stale locks older than ${maxAgeMinutes} minutes`);
    throw new Error('Database connection not initialized. Use with actual DB connection.');
  }
}

/**
 * GPUJobScheduler manages the AI job queue and worker task assignment
 * Implements fair scheduling with priority queue support
 */
export class GPUJobScheduler {
  private databaseUrl: string;
  private vramManager: VRAMManager;

  constructor(databaseUrl?: string) {
    this.databaseUrl = databaseUrl || process.env.DATABASE_URL || '';
    this.vramManager = new VRAMManager(this.databaseUrl);
  }

  /**
   * Add a new job to the queue
   * Job starts in 'queued' state, waiting for worker assignment
   */
  async enqueueJob(jobData: {
    jobType: string;
    model?: string;
    payload?: Record<string, unknown>;
    estimatedVramMb?: number;
    priority?: number;
    callerId?: string;
    callerType?: string;
  }): Promise<string> {
    // TODO: Drizzle query
    // const jobId = generateUUID();
    //
    // await db.insert(aiJobs).values({
    //   id: jobId,
    //   jobType: jobData.jobType,
    //   model: jobData.model,
    //   payload: jobData.payload || {},
    //   estimatedVramMb: jobData.estimatedVramMb,
    //   priority: jobData.priority || 50,
    //   status: 'queued',
    //   callerId: jobData.callerId,
    //   callerType: jobData.callerType,
    // });
    //
    // console.log(`[GPUJobScheduler] Job ${jobId} enqueued (${jobData.jobType})`);
    // return jobId;

    console.log(`[GPUJobScheduler] Enqueueing job: ${jobData.jobType}`);
    throw new Error('Database connection not initialized. Use with actual DB connection.');
  }

  /**
   * Worker claims the next available job from the queue
   * Selects highest priority queued job that fits on the node
   * Returns job details and creates a VRAM lock if needed
   */
  async claimJob(nodeId: string): Promise<JobClaim | null> {
    // TODO: Drizzle query
    // Verify node exists and is enabled
    // const node = await db
    //   .select()
    //   .from(aiNodes)
    //   .where(and(eq(aiNodes.id, nodeId), eq(aiNodes.enabled, true)))
    //   .then(rows => rows[0]);
    //
    // if (!node) {
    //   throw new Error(`Node ${nodeId} not found or is disabled`);
    // }
    //
    // // Get highest priority queued job that fits on this node
    // const queuedJob = await db
    //   .select()
    //   .from(aiJobs)
    //   .where(eq(aiJobs.status, 'queued'))
    //   .orderBy(asc(aiJobs.priority), asc(aiJobs.createdAt))
    //   .limit(1)
    //   .then(rows => rows[0]);
    //
    // if (!queuedJob) {
    //   return null; // No jobs in queue
    // }
    //
    // // Check if job fits in VRAM
    // const jobVramRequired = queuedJob.estimatedVramMb || 1000;
    // const canFit = await this.vramManager.canAllocate(nodeId, jobVramRequired);
    //
    // if (!canFit) {
    //   return null; // Job doesn't fit, try next in queue or wait
    // }
    //
    // // Acquire VRAM lock
    // const allocation = await this.vramManager.acquireLock(
    //   queuedJob.id,
    //   nodeId,
    //   jobVramRequired
    // );
    //
    // // Update job to running state
    // await db
    //   .update(aiJobs)
    //   .set({
    //     status: 'running',
    //     nodeId: nodeId,
    //     startedAt: new Date(),
    //   })
    //   .where(eq(aiJobs.id, queuedJob.id));
    //
    // return {
    //   jobId: queuedJob.id,
    //   lockToken: allocation.lockId,
    //   nodeId,
    //   jobType: queuedJob.jobType,
    //   model: queuedJob.model,
    //   payload: queuedJob.payload,
    //   estimatedVramMb: jobVramRequired,
    //   priority: queuedJob.priority,
    // };

    console.log(`[GPUJobScheduler] Attempting to claim job for node ${nodeId}`);
    throw new Error('Database connection not initialized. Use with actual DB connection.');
  }

  /**
   * Complete a job and release its VRAM lock
   * Updates job status to 'completed' and stores the result
   */
  async releaseJob(jobId: string, result: Record<string, unknown>, lockToken: string): Promise<void> {
    // TODO: Drizzle query
    // // Release VRAM lock
    // await this.vramManager.releaseLock(lockToken);
    //
    // // Update job to completed
    // await db
    //   .update(aiJobs)
    //   .set({
    //     status: 'completed',
    //     completedAt: new Date(),
    //     result,
    //   })
    //   .where(eq(aiJobs.id, jobId));
    //
    // console.log(`[GPUJobScheduler] Job ${jobId} released and marked completed`);

    console.log(`[GPUJobScheduler] Releasing job ${jobId}`);
    throw new Error('Database connection not initialized. Use with actual DB connection.');
  }

  /**
   * Get a job by ID
   * Returns job details or null if not found
   */
  async getJob(jobId: string): Promise<AIJob | null> {
    // TODO: Drizzle query when database is connected
    // const job = await db
    //   .select()
    //   .from(aiJobs)
    //   .where(eq(aiJobs.id, jobId))
    //   .then(rows => rows[0] || null);
    // return job;
    
    console.log(`[GPUJobScheduler] Getting job ${jobId}`);
    // Return null for now until database is connected
    return null;
  }

  /**
   * Cancel a pending or running job
   * Updates job status to 'cancelled' and releases any VRAM locks
   */
  async cancelJob(jobId: string): Promise<boolean> {
    // TODO: Drizzle query
    // // Get job to check current state
    // const job = await db
    //   .select()
    //   .from(aiJobs)
    //   .where(eq(aiJobs.id, jobId))
    //   .then(rows => rows[0]);
    //
    // if (!job) {
    //   throw new Error(`Job ${jobId} not found`);
    // }
    //
    // if (!['queued', 'running'].includes(job.status)) {
    //   throw new Error(`Cannot cancel job in ${job.status} state`);
    // }
    //
    // // Release any associated locks
    // const locks = await db
    //   .select()
    //   .from(aiJobLocks)
    //   .where(and(
    //     eq(aiJobLocks.jobId, jobId),
    //     eq(aiJobLocks.released, false)
    //   ));
    //
    // for (const lock of locks) {
    //   await this.vramManager.releaseLock(lock.id);
    // }
    //
    // // Update job to cancelled
    // await db
    //   .update(aiJobs)
    //   .set({
    //     status: 'cancelled',
    //     completedAt: new Date(),
    //   })
    //   .where(eq(aiJobs.id, jobId));
    //
    // console.log(`[GPUJobScheduler] Job ${jobId} cancelled`);

    console.log(`[GPUJobScheduler] Cancelling job ${jobId}`);
    // Return true for now until database is connected
    return true;
  }

  /**
   * Get current queue status and statistics
   * Returns queue depth, running jobs, and node utilization
   */
  async getQueueStatus(): Promise<QueueStatus> {
    // TODO: Drizzle query
    // // Get job counts by status
    // const jobCounts = await db
    //   .select({
    //     status: aiJobs.status,
    //     count: sql<number>`COUNT(*)`,
    //   })
    //   .from(aiJobs)
    //   .groupBy(aiJobs.status);
    //
    // const countsByStatus = Object.fromEntries(
    //   jobCounts.map(row => [row.status, row.count])
    // );
    //
    // // Get oldest queued job age
    // const oldestQueued = await db
    //   .select()
    //   .from(aiJobs)
    //   .where(eq(aiJobs.status, 'queued'))
    //   .orderBy(asc(aiJobs.createdAt))
    //   .limit(1)
    //   .then(rows => rows[0]);
    //
    // const oldestQueuedAge = oldestQueued
    //   ? Date.now() - oldestQueued.createdAt.getTime()
    //   : 0;
    //
    // // Get average wait time for completed jobs in last hour
    // const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    // const completedJobs = await db
    //   .select()
    //   .from(aiJobs)
    //   .where(
    //     and(
    //       eq(aiJobs.status, 'completed'),
    //       gte(aiJobs.completedAt, oneHourAgo)
    //     )
    //   );
    //
    // const avgWaitTime = completedJobs.length > 0
    //   ? completedJobs.reduce((sum, job) => {
    //       const waitTime = (job.startedAt?.getTime() || 0) - job.createdAt.getTime();
    //       return sum + waitTime;
    //     }, 0) / completedJobs.length
    //   : 0;
    //
    // // Get per-node stats
    // const allNodes = await db
    //   .select()
    //   .from(aiNodes)
    //   .where(eq(aiNodes.enabled, true));
    //
    // const nodeStats = await Promise.all(
    //   allNodes.map(async (node) => {
    //     const running = await db
    //       .select({ count: sql<number>`COUNT(*)` })
    //       .from(aiJobs)
    //       .where(
    //         and(
    //           eq(aiJobs.nodeId, node.id),
    //           eq(aiJobs.status, 'running')
    //         )
    //       )
    //       .then(rows => rows[0]?.count || 0);
    //
    //     const queued = await db
    //       .select({ count: sql<number>`COUNT(*)` })
    //       .from(aiJobs)
    //       .where(
    //         and(
    //           eq(aiJobs.nodeId, node.id),
    //           eq(aiJobs.status, 'queued')
    //         )
    //       )
    //       .then(rows => rows[0]?.count || 0);
    //
    //     const snapshot = await db
    //       .select()
    //       .from(aiGpuSnapshots)
    //       .where(eq(aiGpuSnapshots.nodeId, node.id))
    //       .orderBy(desc(aiGpuSnapshots.createdAt))
    //       .limit(1)
    //       .then(rows => rows[0]);
    //
    //     const utilization = snapshot
    //       ? Math.round((snapshot.usedVramMb / snapshot.totalVramMb) * 100)
    //       : 0;
    //
    //     return {
    //       nodeId: node.id,
    //       nodeName: node.name,
    //       runningJobs: running,
    //       queuedJobs: queued,
    //       utilizationPercent: utilization,
    //     };
    //   })
    // );
    //
    // return {
    //   totalQueued: countsByStatus['queued'] || 0,
    //   totalRunning: countsByStatus['running'] || 0,
    //   totalCompleted: countsByStatus['completed'] || 0,
    //   totalFailed: countsByStatus['failed'] || 0,
    //   averageWaitTimeMs: avgWaitTime,
    //   oldestQueuedJobAgeMs: oldestQueuedAge,
    //   nodeStats,
    // };

    console.log(`[GPUJobScheduler] Getting queue status`);
    throw new Error('Database connection not initialized. Use with actual DB connection.');
  }

  /**
   * Get the VRAM manager instance for direct access
   */
  getVRAMManager(): VRAMManager {
    return this.vramManager;
  }
}

/**
 * Export factory function for creating scheduler instances
 */
export function createGPUJobScheduler(databaseUrl?: string): GPUJobScheduler {
  return new GPUJobScheduler(databaseUrl);
}

/**
 * Export factory function for creating VRAM manager instances
 */
export function createVRAMManager(databaseUrl?: string): VRAMManager {
  return new VRAMManager(databaseUrl);
}
