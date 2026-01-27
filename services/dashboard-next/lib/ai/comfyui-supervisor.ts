import { EventEmitter } from 'events';
import { getAIConfig } from './config';
import { aiLogger } from './logger';
import { ComfyUIServiceManager, ComfyUIServiceState, ReadinessInfo } from './comfyui-manager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SupervisorConfig {
  port: number;
  host: string;
  lockFilePath: string;
  healthCheckIntervalMs: number;
  startupTimeoutMs: number;
  maxRestartAttempts: number;
  restartCooldownMs: number;
  gracefulShutdownTimeoutMs: number;
  agentPort: number;
  agentToken: string | null;
}

export enum SupervisorState {
  IDLE = 'IDLE',
  CHECKING_HEALTH = 'CHECKING_HEALTH',
  ACQUIRING_LOCK = 'ACQUIRING_LOCK',
  STARTING = 'STARTING',
  RUNNING = 'RUNNING',
  RESTARTING = 'RESTARTING',
  STOPPING = 'STOPPING',
  ERROR = 'ERROR',
}

export interface SupervisorStatus {
  state: SupervisorState;
  serviceState: ComfyUIServiceState;
  processId: number | null;
  port: number;
  host: string;
  isHealthy: boolean;
  hasLock: boolean;
  lastStartTime: Date | null;
  restartCount: number;
  consecutiveFailures: number;
  uptime: number | null;
  readinessInfo: ReadinessInfo | null;
  error: string | null;
  agentAvailable: boolean;
}

export interface HealthCheckResult {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
}

export interface LockInfo {
  host: string;
  port: number;
  startTime: string;
  version: string;
}

const DEFAULT_CONFIG: SupervisorConfig = {
  port: 8188,
  host: 'localhost',
  lockFilePath: path.join(os.tmpdir(), 'comfyui-supervisor.lock'),
  healthCheckIntervalMs: 30000,
  startupTimeoutMs: 120000,
  maxRestartAttempts: 3,
  restartCooldownMs: 5000,
  gracefulShutdownTimeoutMs: 30000,
  agentPort: 3456,
  agentToken: null,
};

export class ComfyUISupervisor extends EventEmitter {
  private config: SupervisorConfig;
  private state: SupervisorState = SupervisorState.IDLE;
  private serviceManager: ComfyUIServiceManager;
  private processId: number | null = null;
  private hasLock: boolean = false;
  private lastStartTime: Date | null = null;
  private restartCount: number = 0;
  private consecutiveFailures: number = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private error: string | null = null;
  private isShuttingDown: boolean = false;
  private agentAvailable: boolean = false;

  constructor(config?: Partial<SupervisorConfig>) {
    super();
    const aiConfig = getAIConfig();
    this.config = {
      ...DEFAULT_CONFIG,
      host: aiConfig.windowsVM.ip || 'localhost',
      healthCheckIntervalMs: aiConfig.comfyui.healthCheckInterval,
      startupTimeoutMs: aiConfig.comfyui.timeout,
      agentPort: aiConfig.windowsVM.nebulaAgentPort,
      agentToken: process.env.KVM_AGENT_TOKEN || process.env.NEBULA_AGENT_TOKEN || null,
      ...config,
    };
    this.serviceManager = new ComfyUIServiceManager();
  }

  getStatus(): SupervisorStatus {
    const uptime = this.lastStartTime 
      ? Date.now() - this.lastStartTime.getTime()
      : null;

    return {
      state: this.state,
      serviceState: this.serviceManager.getServiceState(),
      processId: this.processId,
      port: this.config.port,
      host: this.config.host,
      isHealthy: this.serviceManager.getServiceState() !== ComfyUIServiceState.OFFLINE,
      hasLock: this.hasLock,
      lastStartTime: this.lastStartTime,
      restartCount: this.restartCount,
      consecutiveFailures: this.consecutiveFailures,
      uptime,
      readinessInfo: this.serviceManager.getReadinessInfo(),
      error: this.error,
      agentAvailable: this.agentAvailable,
    };
  }

  private async callWindowsAgent(endpoint: string, method: 'GET' | 'POST' = 'POST'): Promise<unknown> {
    if (!this.config.agentToken) {
      throw new Error('Windows Agent token not configured (set KVM_AGENT_TOKEN or NEBULA_AGENT_TOKEN)');
    }

    const url = `http://${this.config.host}:${this.config.agentPort}${endpoint}`;
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.agentToken}`,
        'Content-Length': '0',
      },
      signal: AbortSignal.timeout(30000),
    });
    
    if (!response.ok) {
      throw new Error(`Agent returned ${response.status}: ${await response.text()}`);
    }
    
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }

  async checkAgentAvailability(): Promise<boolean> {
    if (!this.config.agentToken) {
      this.agentAvailable = false;
      return false;
    }

    try {
      await this.callWindowsAgent('/health', 'GET');
      this.agentAvailable = true;
      return true;
    } catch {
      this.agentAvailable = false;
      return false;
    }
  }

  async checkHealth(): Promise<HealthCheckResult> {
    const ctx = aiLogger.startRequest('comfyui', 'supervisor_check_health');
    const startTime = Date.now();
    this.state = SupervisorState.CHECKING_HEALTH;

    try {
      const serviceState = await this.serviceManager.checkHealth();
      const latencyMs = Date.now() - startTime;
      
      const healthy = serviceState !== ComfyUIServiceState.OFFLINE;
      
      aiLogger.endRequest(ctx, true, { healthy, latencyMs, state: serviceState });
      
      if (healthy && this.state === SupervisorState.CHECKING_HEALTH) {
        this.state = SupervisorState.RUNNING;
      }
      
      return { healthy, latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      aiLogger.endRequest(ctx, false, { error: errorMessage, latencyMs });
      return { healthy: false, latencyMs, error: errorMessage };
    }
  }

  async detectExistingInstance(): Promise<{ running: boolean; healthy: boolean }> {
    const ctx = aiLogger.startRequest('comfyui', 'supervisor_detect_instance');

    try {
      const lockInfo = this.readLockFile();
      const healthResult = await this.checkHealth();
      
      if (healthResult.healthy) {
        aiLogger.endRequest(ctx, true, { running: true, healthy: true, hasLock: !!lockInfo });
        return { running: true, healthy: true };
      }
      
      if (lockInfo) {
        await this.cleanupStaleLock();
      }
      
      aiLogger.endRequest(ctx, true, { running: false, healthy: false });
      return { running: false, healthy: false };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.endRequest(ctx, false, { error: errorMessage });
      return { running: false, healthy: false };
    }
  }

  async acquireLock(): Promise<boolean> {
    const ctx = aiLogger.startRequest('comfyui', 'supervisor_acquire_lock');
    this.state = SupervisorState.ACQUIRING_LOCK;

    try {
      const existingLock = this.readLockFile();
      if (existingLock) {
        const healthResult = await this.checkHealth();
        if (healthResult.healthy) {
          this.error = 'Another instance is already running and healthy';
          aiLogger.endRequest(ctx, false, { reason: 'instance_running' });
          return false;
        }
        await this.cleanupStaleLock();
      }

      const lockInfo: LockInfo = {
        host: this.config.host,
        port: this.config.port,
        startTime: new Date().toISOString(),
        version: '1.0.0',
      };

      fs.writeFileSync(this.config.lockFilePath, JSON.stringify(lockInfo, null, 2), { mode: 0o644 });
      this.hasLock = true;
      
      aiLogger.endRequest(ctx, true, { lockAcquired: true });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.error = `Failed to acquire lock: ${errorMessage}`;
      aiLogger.endRequest(ctx, false, { error: errorMessage });
      return false;
    }
  }

  releaseLock(): void {
    if (this.hasLock) {
      try {
        if (fs.existsSync(this.config.lockFilePath)) {
          fs.unlinkSync(this.config.lockFilePath);
        }
        this.hasLock = false;
      } catch (error) {
        console.error('[ComfyUI Supervisor] Failed to release lock:', error);
      }
    }
  }

  private readLockFile(): LockInfo | null {
    try {
      if (!fs.existsSync(this.config.lockFilePath)) {
        return null;
      }
      const content = fs.readFileSync(this.config.lockFilePath, 'utf-8');
      return JSON.parse(content) as LockInfo;
    } catch {
      return null;
    }
  }

  private async cleanupStaleLock(): Promise<void> {
    try {
      if (fs.existsSync(this.config.lockFilePath)) {
        fs.unlinkSync(this.config.lockFilePath);
        aiLogger.startRequest('comfyui', 'supervisor_cleanup_stale_lock');
      }
    } catch (error) {
      console.error('[ComfyUI Supervisor] Failed to cleanup stale lock:', error);
    }
  }

  async startService(): Promise<{ success: boolean; error?: string }> {
    const ctx = aiLogger.startRequest('comfyui', 'supervisor_start_service');

    try {
      if (!this.config.agentToken) {
        aiLogger.endRequest(ctx, false, { error: 'agent_not_configured' });
        return { 
          success: false, 
          error: 'Windows Agent not configured. Cannot start ComfyUI remotely.' 
        };
      }

      await this.callWindowsAgent('/ai/start/comfyui');
      
      aiLogger.endRequest(ctx, true, { action: 'start' });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.endRequest(ctx, false, { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  async stopService(): Promise<{ success: boolean; error?: string }> {
    const ctx = aiLogger.startRequest('comfyui', 'supervisor_stop_service');

    try {
      if (!this.config.agentToken) {
        aiLogger.endRequest(ctx, false, { error: 'agent_not_configured' });
        return { 
          success: false, 
          error: 'Windows Agent not configured. Cannot stop ComfyUI remotely.' 
        };
      }

      await this.callWindowsAgent('/ai/stop/comfyui');
      
      aiLogger.endRequest(ctx, true, { action: 'stop' });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.endRequest(ctx, false, { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  async restartService(): Promise<{ success: boolean; error?: string }> {
    const ctx = aiLogger.startRequest('comfyui', 'supervisor_restart_service');

    try {
      if (!this.config.agentToken) {
        aiLogger.endRequest(ctx, false, { error: 'agent_not_configured' });
        return { 
          success: false, 
          error: 'Windows Agent not configured. Cannot restart ComfyUI remotely.' 
        };
      }

      await this.callWindowsAgent('/ai/restart/comfyui');
      
      aiLogger.endRequest(ctx, true, { action: 'restart' });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.endRequest(ctx, false, { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  async ensureRunning(): Promise<{ success: boolean; reused: boolean; error?: string }> {
    const ctx = aiLogger.startRequest('comfyui', 'supervisor_ensure_running');

    try {
      const existingInstance = await this.detectExistingInstance();
      
      if (existingInstance.running && existingInstance.healthy) {
        this.state = SupervisorState.RUNNING;
        this.lastStartTime = this.lastStartTime || new Date();
        this.startHealthMonitoring();
        
        aiLogger.endRequest(ctx, true, { reused: true });
        this.emit('running', { reused: true });
        return { success: true, reused: true };
      }

      const lockAcquired = await this.acquireLock();
      if (!lockAcquired) {
        this.state = SupervisorState.ERROR;
        aiLogger.endRequest(ctx, false, { error: 'lock_failed' });
        return { success: false, reused: false, error: this.error || 'Failed to acquire lock' };
      }

      this.state = SupervisorState.STARTING;
      this.emit('starting');

      const startResult = await this.startService();
      if (!startResult.success) {
        this.releaseLock();
        this.state = SupervisorState.ERROR;
        this.error = startResult.error || 'Failed to start ComfyUI';
        aiLogger.endRequest(ctx, false, { error: this.error });
        this.emit('error', { error: this.error });
        return { success: false, reused: false, error: this.error };
      }

      const waitResult = await this.serviceManager.waitForReady(this.config.startupTimeoutMs);
      
      if (waitResult) {
        this.state = SupervisorState.RUNNING;
        this.lastStartTime = new Date();
        this.consecutiveFailures = 0;
        this.startHealthMonitoring();
        
        aiLogger.endRequest(ctx, true, { reused: false, started: true });
        this.emit('running', { reused: false });
        return { success: true, reused: false };
      } else {
        const serviceState = this.serviceManager.getServiceState();
        if (serviceState !== ComfyUIServiceState.OFFLINE) {
          this.state = SupervisorState.RUNNING;
          this.lastStartTime = new Date();
          this.startHealthMonitoring();
          
          aiLogger.endRequest(ctx, true, { reused: false, partialStart: true, state: serviceState });
          this.emit('running', { reused: false, degraded: true });
          return { success: true, reused: false };
        }

        this.releaseLock();
        this.error = 'ComfyUI failed to become ready within timeout';
        this.state = SupervisorState.ERROR;
        this.consecutiveFailures++;
        
        aiLogger.endRequest(ctx, false, { error: this.error });
        this.emit('error', { error: this.error });
        return { success: false, reused: false, error: this.error };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.releaseLock();
      this.error = errorMessage;
      this.state = SupervisorState.ERROR;
      this.consecutiveFailures++;
      
      aiLogger.endRequest(ctx, false, { error: errorMessage });
      this.emit('error', { error: errorMessage });
      return { success: false, reused: false, error: errorMessage };
    }
  }

  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      if (this.isShuttingDown) return;

      try {
        const healthResult = await this.checkHealth();
        
        if (!healthResult.healthy) {
          this.consecutiveFailures++;
          
          if (this.consecutiveFailures >= 3) {
            this.emit('unhealthy', { failures: this.consecutiveFailures });
            
            if (this.restartCount < this.config.maxRestartAttempts) {
              await this.attemptRestart();
            } else {
              this.state = SupervisorState.ERROR;
              this.error = 'Max restart attempts exceeded';
              this.emit('error', { error: this.error });
            }
          }
        } else {
          if (this.consecutiveFailures > 0) {
            this.emit('recovered', { previousFailures: this.consecutiveFailures });
          }
          this.consecutiveFailures = 0;
          
          const serviceState = this.serviceManager.getServiceState();
          if (serviceState === ComfyUIServiceState.DEGRADED) {
            this.emit('degraded', { state: serviceState });
          }
        }
      } catch (error) {
        this.consecutiveFailures++;
      }
    }, this.config.healthCheckIntervalMs);
  }

  private async attemptRestart(): Promise<boolean> {
    const ctx = aiLogger.startRequest('comfyui', 'supervisor_attempt_restart');
    
    this.state = SupervisorState.RESTARTING;
    this.restartCount++;
    this.emit('restarting', { attempt: this.restartCount });

    await new Promise(resolve => setTimeout(resolve, this.config.restartCooldownMs));

    try {
      const restartResult = await this.restartService();
      
      if (!restartResult.success) {
        aiLogger.endRequest(ctx, false, { error: restartResult.error });
        return false;
      }

      const waitResult = await this.serviceManager.waitForReady(this.config.startupTimeoutMs);
      
      if (waitResult) {
        this.state = SupervisorState.RUNNING;
        this.lastStartTime = new Date();
        this.consecutiveFailures = 0;
        aiLogger.endRequest(ctx, true, { restartSuccessful: true });
        this.emit('running', { restarted: true });
        return true;
      } else {
        aiLogger.endRequest(ctx, false, { restartFailed: true, error: 'Timeout waiting for ready' });
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.endRequest(ctx, false, { error: errorMessage });
      return false;
    }
  }

  async shutdown(): Promise<void> {
    const ctx = aiLogger.startRequest('comfyui', 'supervisor_shutdown');
    
    this.isShuttingDown = true;
    this.state = SupervisorState.STOPPING;
    this.emit('stopping');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    this.releaseLock();

    this.state = SupervisorState.IDLE;
    this.isShuttingDown = false;
    
    aiLogger.endRequest(ctx, true);
    this.emit('stopped');
  }

  getServiceManager(): ComfyUIServiceManager {
    return this.serviceManager;
  }

  resetRestartCount(): void {
    this.restartCount = 0;
    this.consecutiveFailures = 0;
  }
}

let supervisorInstance: ComfyUISupervisor | null = null;

export function getComfyUISupervisor(): ComfyUISupervisor {
  if (!supervisorInstance) {
    supervisorInstance = new ComfyUISupervisor();
  }
  return supervisorInstance;
}

export function resetSupervisorInstance(): void {
  if (supervisorInstance) {
    supervisorInstance.shutdown().catch(console.error);
    supervisorInstance = null;
  }
}

export async function safeComfyUIOperation<T>(
  operation: () => Promise<T>,
  fallback?: T,
  operationName: string = 'unknown'
): Promise<{ success: boolean; result?: T; error?: string }> {
  const ctx = aiLogger.startRequest('comfyui', `supervisor_safe_operation:${operationName}`);
  
  try {
    const result = await operation();
    aiLogger.endRequest(ctx, true);
    return { success: true, result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    aiLogger.endRequest(ctx, false, { error: errorMessage });
    
    if (fallback !== undefined) {
      return { success: false, result: fallback, error: errorMessage };
    }
    return { success: false, error: errorMessage };
  }
}
