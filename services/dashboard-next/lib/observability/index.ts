/**
 * Observability Module - Central initialization and exports
 * Provides unified access to metrics collection, alerting, and incident tracking
 */

export { 
  metricsCollector, 
  recordAIRequest, 
  recordGPUMetrics, 
  recordJobExecution, 
  recordQueueDepth, 
  recordServiceHealth,
  type MetricPoint,
  type AIUsageMetrics,
  type GPUMetrics,
  type JobMetrics,
  type ServiceHealthMetrics,
  type TimeRange,
  type AggregatedMetrics,
} from './metrics-collector';

export { 
  alertManager,
  type Alert,
  type AlertRule,
  type AlertSeverity,
  type AlertCategory,
  type AlertCondition,
  type AlertAction,
} from './alerting';

export {
  incidentTracker,
  type Incident,
  type IncidentSeverity,
  type IncidentStatus,
  type IncidentTimeline,
} from './incident-tracker';

interface ServiceHealthCheck {
  name: string;
  url: string;
  timeout: number;
}

const AI_SERVICES: ServiceHealthCheck[] = [
  { name: 'ollama', url: process.env.OLLAMA_URL || 'http://localhost:11434', timeout: 5000 },
  { name: 'stable-diffusion', url: process.env.SD_URL || 'http://localhost:7860', timeout: 5000 },
  { name: 'comfyui', url: process.env.COMFYUI_URL || 'http://localhost:8188', timeout: 5000 },
  { name: 'dashboard', url: process.env.DASHBOARD_URL || 'http://localhost:5000/api/health', timeout: 5000 },
  { name: 'discord-bot', url: process.env.DISCORD_BOT_URL || 'http://localhost:3001/health', timeout: 5000 },
  { name: 'stream-bot', url: process.env.STREAM_BOT_URL || 'http://localhost:3000/health', timeout: 5000 },
];

let healthCheckInterval: NodeJS.Timeout | null = null;
let isInitialized = false;
let isShuttingDown = false;
let globalErrorHandlersInstalled = false;

async function checkServiceHealth(service: ServiceHealthCheck): Promise<{ healthy: boolean; responseTimeMs: number }> {
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), service.timeout);
    
    const url = service.url.endsWith('/') ? service.url : service.url;
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    return {
      healthy: response.ok,
      responseTimeMs: Date.now() - startTime,
    };
  } catch {
    return {
      healthy: false,
      responseTimeMs: Date.now() - startTime,
    };
  }
}

async function runHealthChecks(): Promise<void> {
  const { recordServiceHealth } = await import('./metrics-collector');
  
  for (const service of AI_SERVICES) {
    try {
      const result = await checkServiceHealth(service);
      recordServiceHealth(service.name, result.healthy, result.responseTimeMs);
    } catch (error) {
      console.error(`[Observability] Health check failed for ${service.name}:`, error);
      recordServiceHealth(service.name, false, 0);
    }
  }
}

function setupGlobalErrorHandler(): void {
  if (globalErrorHandlersInstalled || typeof process === 'undefined') {
    return;
  }
  
  globalErrorHandlersInstalled = true;
  
  process.on('uncaughtException', async (error) => {
    if (isShuttingDown) return;
    console.error('[Observability] Uncaught exception:', error);
    try {
      const { incidentTracker } = await import('./incident-tracker');
      await incidentTracker.createIncident({
        title: 'Uncaught Exception',
        description: error.message || 'Unknown error',
        severity: 'critical',
        source: 'global-error-handler',
        metadata: {
          stack: error.stack,
          name: error.name,
        },
      });
    } catch (e) {
      console.error('[Observability] Failed to track incident:', e);
    }
  });

  process.on('unhandledRejection', async (reason) => {
    if (isShuttingDown) return;
    console.error('[Observability] Unhandled rejection:', reason);
    try {
      const { incidentTracker } = await import('./incident-tracker');
      await incidentTracker.createIncident({
        title: 'Unhandled Promise Rejection',
        description: reason instanceof Error ? reason.message : String(reason),
        severity: 'warning',
        source: 'global-error-handler',
        metadata: {
          reason: reason instanceof Error ? { message: reason.message, stack: reason.stack } : reason,
        },
      });
    } catch (e) {
      console.error('[Observability] Failed to track incident:', e);
    }
  });
}

export async function initializeObservability(): Promise<void> {
  if (isInitialized) {
    console.log('[Observability] Already initialized, skipping');
    return;
  }

  if (isShuttingDown) {
    console.log('[Observability] Shutdown in progress, cannot initialize');
    return;
  }

  console.log('[Observability] Initializing observability system...');

  try {
    const { alertManager } = await import('./alerting');
    await alertManager.start();
    console.log('[Observability] Alert manager started');
  } catch (error) {
    console.warn('[Observability] Failed to start alert manager:', error);
  }

  setupGlobalErrorHandler();
  if (globalErrorHandlersInstalled) {
    console.log('[Observability] Global error handler installed');
  }

  try {
    await runHealthChecks();
  } catch (error) {
    console.warn('[Observability] Initial health check failed:', error);
  }
  
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }
  
  healthCheckInterval = setInterval(async () => {
    if (isShuttingDown) return;
    try {
      await runHealthChecks();
    } catch (error) {
      console.error('[Observability] Health check error:', error);
    }
  }, 60000);
  
  console.log('[Observability] Health check interval started (60s)');
  
  isInitialized = true;
  console.log('[Observability] Initialization complete');
}

export async function shutdownObservability(): Promise<void> {
  if (isShuttingDown) {
    console.log('[Observability] Shutdown already in progress');
    return;
  }
  
  isShuttingDown = true;
  console.log('[Observability] Beginning shutdown...');
  
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    console.log('[Observability] Health check interval cleared');
  }
  
  try {
    const { alertManager } = await import('./alerting');
    alertManager.stop();
    console.log('[Observability] Alert manager stopped');
  } catch (error) {
    console.warn('[Observability] Error stopping alert manager:', error);
  }
  
  try {
    const { metricsCollector } = await import('./metrics-collector');
    metricsCollector.shutdown();
    console.log('[Observability] Metrics collector stopped');
  } catch (error) {
    console.warn('[Observability] Error stopping metrics collector:', error);
  }
  
  isInitialized = false;
  isShuttingDown = false;
  console.log('[Observability] Shutdown complete');
}

export function isObservabilityInitialized(): boolean {
  return isInitialized;
}
