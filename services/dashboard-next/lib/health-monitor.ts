/**
 * Cross-Deployment Health Monitor Service
 * Monitors all deployment targets and services for issues
 */

let db: any = null;
try {
  db = require("./db").db;
} catch (error) {
  console.warn("[HealthMonitor] Database module unavailable, running in degraded mode");
}

let serverMetricsHistory: any = null;
let homelabServers: any = null;
let events: any = null;
let incidents: any = null;
try {
  const schema = require("./db/platform-schema");
  serverMetricsHistory = schema.serverMetricsHistory;
  homelabServers = schema.homelabServers;
  events = schema.events;
  incidents = schema.incidents;
} catch (error) {
  console.warn("[HealthMonitor] Database schema unavailable, running in degraded mode");
}

const drizzleORM = (() => {
  try {
    return require("drizzle-orm");
  } catch {
    return { eq: null, desc: null, and: null, gte: null };
  }
})();

export type DeploymentTarget = "windows-vm" | "linode" | "ubuntu-homelab" | "replit";

export type ServiceType = 
  | "ollama" 
  | "stable-diffusion" 
  | "comfyui" 
  | "whisper" 
  | "postgresql" 
  | "redis" 
  | "docker" 
  | "discord-bot" 
  | "stream-bot";

export type IssueSeverity = "critical" | "warning" | "info";

export type IssueType = 
  | "service_down" 
  | "high_cpu" 
  | "high_memory" 
  | "high_disk" 
  | "high_gpu_usage" 
  | "high_gpu_temp"
  | "version_mismatch" 
  | "config_drift" 
  | "slow_response"
  | "model_not_loaded"
  | "connection_failed";

export interface HealthIssue {
  id: string;
  type: IssueType;
  severity: IssueSeverity;
  target: DeploymentTarget;
  service: ServiceType | string;
  title: string;
  description: string;
  detectedAt: Date;
  lastSeen: Date;
  count: number;
  fixInstructions: string[];
  autoFixable: boolean;
  autoFixAction?: string;
  metadata?: Record<string, unknown>;
  acknowledged?: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

export interface ServiceHealth {
  id: string;
  name: string;
  type: ServiceType | string;
  target: DeploymentTarget;
  status: "healthy" | "unhealthy" | "degraded" | "unknown";
  responseTimeMs?: number;
  lastChecked: Date;
  version?: string;
  details?: string;
  error?: string;
  metrics?: {
    cpuPercent?: number;
    memoryPercent?: number;
    gpuPercent?: number;
    gpuTempC?: number;
    gpuMemoryMb?: number;
    diskPercent?: number;
  };
}

export interface DeploymentHealth {
  target: DeploymentTarget;
  name: string;
  status: "online" | "offline" | "degraded";
  reachable: boolean;
  lastChecked: Date;
  services: ServiceHealth[];
  systemMetrics?: {
    cpu: { usage: number; loadAverage: number[] };
    memory: { usedMb: number; totalMb: number; percent: number };
    disk: { usedGb: number; totalGb: number; percent: number };
    uptime: string;
  };
}

export interface HealthCheckResult {
  timestamp: Date;
  deployments: DeploymentHealth[];
  issues: HealthIssue[];
  summary: {
    totalDeployments: number;
    onlineDeployments: number;
    totalServices: number;
    healthyServices: number;
    criticalIssues: number;
    warningIssues: number;
  };
}

const THRESHOLDS = {
  cpu: { warning: 80, critical: 95 },
  memory: { warning: 85, critical: 95 },
  disk: { warning: 85, critical: 95 },
  gpu: { warning: 90, critical: 98 },
  gpuTemp: { warning: 80, critical: 90 },
  responseTime: { warning: 2000, critical: 5000 },
};

const DEPLOYMENT_CONFIGS: Record<DeploymentTarget, { name: string; host?: string; port?: number }> = {
  "windows-vm": {
    name: "Windows AI VM",
    host: process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102",
    port: 9765,
  },
  "linode": {
    name: "Linode Production",
    host: process.env.LINODE_SSH_HOST || "linode.evindrake.net",
  },
  "ubuntu-homelab": {
    name: "Ubuntu Homelab",
    host: process.env.HOME_SSH_HOST || "host.evindrake.net",
  },
  "replit": {
    name: "Replit Development",
  },
};

const SERVICE_ENDPOINTS: Record<ServiceType, { path: string; port: number; targets: DeploymentTarget[] }> = {
  "ollama": { path: "/api/tags", port: 11434, targets: ["windows-vm"] },
  "stable-diffusion": { path: "/sdapi/v1/options", port: 7860, targets: ["windows-vm"] },
  "comfyui": { path: "/system_stats", port: 8188, targets: ["windows-vm"] },
  "whisper": { path: "/health", port: 8765, targets: ["windows-vm"] },
  "postgresql": { path: "", port: 5432, targets: ["linode", "replit"] },
  "redis": { path: "", port: 6379, targets: ["linode", "replit"] },
  "docker": { path: "", port: 0, targets: ["linode", "ubuntu-homelab"] },
  "discord-bot": { path: "/health", port: 4000, targets: ["replit", "linode"] },
  "stream-bot": { path: "/health", port: 3000, targets: ["replit"] },
};

class HealthMonitor {
  private issues: Map<string, HealthIssue> = new Map();
  private healthHistory: Map<string, ServiceHealth[]> = new Map();
  private lastCheck: Date | null = null;
  private isChecking = false;
  private checkInterval: NodeJS.Timeout | null = null;

  private getIssueId(type: IssueType, target: DeploymentTarget, service: string): string {
    return `${type}:${target}:${service}`;
  }

  async checkServiceHealth(
    service: ServiceType,
    target: DeploymentTarget
  ): Promise<ServiceHealth> {
    const config = SERVICE_ENDPOINTS[service];
    const deployConfig = DEPLOYMENT_CONFIGS[target];
    
    if (!config || !deployConfig.host) {
      return {
        id: `${target}-${service}`,
        name: service,
        type: service,
        target,
        status: "unknown",
        lastChecked: new Date(),
        details: "No configuration available",
      };
    }

    const url = `http://${deployConfig.host}:${config.port}${config.path}`;
    const start = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timeout);

      const responseTime = Date.now() - start;
      
      if (!response.ok) {
        return {
          id: `${target}-${service}`,
          name: this.getServiceDisplayName(service),
          type: service,
          target,
          status: "unhealthy",
          responseTimeMs: responseTime,
          lastChecked: new Date(),
          error: `HTTP ${response.status}`,
        };
      }

      let data: Record<string, unknown> = {};
      try {
        data = await response.json();
      } catch {}

      const health = this.parseServiceResponse(service, data, responseTime);
      
      return {
        id: `${target}-${service}`,
        name: this.getServiceDisplayName(service),
        type: service,
        target,
        status: responseTime > THRESHOLDS.responseTime.critical ? "degraded" : "healthy",
        responseTimeMs: responseTime,
        lastChecked: new Date(),
        version: health.version,
        details: health.details,
        metrics: health.metrics,
      };
    } catch (error) {
      return {
        id: `${target}-${service}`,
        name: this.getServiceDisplayName(service),
        type: service,
        target,
        status: "unhealthy",
        responseTimeMs: Date.now() - start,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : "Connection failed",
      };
    }
  }

  private getServiceDisplayName(service: ServiceType): string {
    const names: Record<ServiceType, string> = {
      "ollama": "Ollama LLM",
      "stable-diffusion": "Stable Diffusion WebUI",
      "comfyui": "ComfyUI",
      "whisper": "Whisper STT",
      "postgresql": "PostgreSQL",
      "redis": "Redis Cache",
      "docker": "Docker Engine",
      "discord-bot": "Discord Bot",
      "stream-bot": "Stream Bot",
    };
    return names[service] || service;
  }

  private parseServiceResponse(
    service: ServiceType,
    data: Record<string, unknown>,
    responseTime: number
  ): { version?: string; details?: string; metrics?: ServiceHealth["metrics"] } {
    switch (service) {
      case "ollama": {
        const models = data.models as Array<unknown> || [];
        return {
          details: `${models.length} models loaded`,
        };
      }
      case "stable-diffusion": {
        const model = data.sd_model_checkpoint as string;
        return {
          details: model ? `Model: ${model}` : "Ready",
        };
      }
      case "comfyui": {
        const system = data.system as Record<string, unknown> || {};
        const devices = data.devices as Array<Record<string, unknown>> || [];
        const gpuDevice = devices[0] || {};
        return {
          details: `${devices.length} GPU(s)`,
          metrics: {
            gpuMemoryMb: typeof gpuDevice.vram_used === "number" 
              ? Math.round(gpuDevice.vram_used as number / (1024 * 1024))
              : undefined,
          },
        };
      }
      case "whisper": {
        return { details: "Ready" };
      }
      default:
        return { details: `Response time: ${responseTime}ms` };
    }
  }

  async checkDatabaseHealth(): Promise<ServiceHealth> {
    const start = Date.now();
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      return {
        id: "replit-postgresql",
        name: "PostgreSQL",
        type: "postgresql",
        target: "replit",
        status: "unknown",
        lastChecked: new Date(),
        details: "DATABASE_URL not configured",
      };
    }

    try {
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
      const result = await pool.query("SELECT 1 as check");
      await pool.end();

      return {
        id: "replit-postgresql",
        name: "PostgreSQL",
        type: "postgresql",
        target: "replit",
        status: result.rows[0]?.check === 1 ? "healthy" : "unhealthy",
        responseTimeMs: Date.now() - start,
        lastChecked: new Date(),
        details: "Connection successful",
      };
    } catch (error) {
      return {
        id: "replit-postgresql",
        name: "PostgreSQL",
        type: "postgresql",
        target: "replit",
        status: "unhealthy",
        responseTimeMs: Date.now() - start,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : "Connection failed",
      };
    }
  }

  async checkRedisHealth(): Promise<ServiceHealth> {
    const start = Date.now();
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      return {
        id: "replit-redis",
        name: "Redis",
        type: "redis",
        target: "replit",
        status: "unknown",
        lastChecked: new Date(),
        details: "REDIS_URL not configured",
      };
    }

    try {
      const Redis = (await import("ioredis")).default;
      const redis = new Redis(redisUrl, { connectTimeout: 3000, lazyConnect: true });
      await redis.connect();
      const pong = await redis.ping();
      await redis.quit();

      return {
        id: "replit-redis",
        name: "Redis",
        type: "redis",
        target: "replit",
        status: pong === "PONG" ? "healthy" : "unhealthy",
        responseTimeMs: Date.now() - start,
        lastChecked: new Date(),
        details: "Connection successful",
      };
    } catch (error) {
      return {
        id: "replit-redis",
        name: "Redis",
        type: "redis",
        target: "replit",
        status: "unhealthy",
        responseTimeMs: Date.now() - start,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : "Connection failed",
      };
    }
  }

  private async checkWindowsRegistryHeartbeat(): Promise<{ 
    hasFreshHeartbeat: boolean; 
    lastSeen: Date | null;
    services: string[];
    ageSeconds: number | null;
  }> {
    try {
      const { getAllServices } = await import("./service-registry");
      const allServices = await getAllServices();
      
      const windowsServices = allServices.filter(s => 
        s.environment === "windows-vm" || 
        s.name.includes("windows") || 
        s.name.includes("agent") ||
        s.capabilities.some(c => ["ai", "ollama", "comfyui", "stable-diffusion"].includes(c))
      );
      
      if (windowsServices.length === 0) {
        return { hasFreshHeartbeat: false, lastSeen: null, services: [], ageSeconds: null };
      }
      
      const mostRecent = windowsServices.reduce((latest, svc) => {
        const svcTime = new Date(svc.lastSeen).getTime();
        return svcTime > latest.time ? { time: svcTime, date: svc.lastSeen, name: svc.name } : latest;
      }, { time: 0, date: new Date(0), name: "" });
      
      const ageMs = Date.now() - mostRecent.time;
      const ageSeconds = Math.round(ageMs / 1000);
      const HEARTBEAT_TIMEOUT = 90000;
      
      return {
        hasFreshHeartbeat: ageMs < HEARTBEAT_TIMEOUT,
        lastSeen: mostRecent.date,
        services: windowsServices.map(s => s.name),
        ageSeconds,
      };
    } catch (error) {
      console.warn("[HealthMonitor] Failed to check registry heartbeat:", error);
      return { hasFreshHeartbeat: false, lastSeen: null, services: [], ageSeconds: null };
    }
  }

  async checkWindowsVmHealth(): Promise<DeploymentHealth> {
    const target: DeploymentTarget = "windows-vm";
    const config = DEPLOYMENT_CONFIGS[target];
    const services: ServiceHealth[] = [];
    let diagnostics: string[] = [];

    const [probeResults, registryStatus] = await Promise.all([
      Promise.all([
        this.checkServiceHealth("ollama", target),
        this.checkServiceHealth("stable-diffusion", target),
        this.checkServiceHealth("comfyui", target),
        this.checkServiceHealth("whisper", target),
      ]),
      this.checkWindowsRegistryHeartbeat(),
    ]);

    const [ollama, stableDiffusion, comfyui, whisper] = probeResults;
    services.push(ollama, stableDiffusion, comfyui, whisper);

    let systemMetrics: DeploymentHealth["systemMetrics"];
    let agentReachable = false;
    
    try {
      const agentUrl = `http://${config.host}:${config.port}/health`;
      const response = await fetch(agentUrl, { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        agentReachable = true;
        const data = await response.json();
        if (data.gpu) {
          const gpu = data.gpu;
          services.forEach(s => {
            if (!s.metrics) s.metrics = {};
            s.metrics.gpuPercent = gpu.utilization_percent;
            s.metrics.gpuTempC = gpu.temperature_c;
            s.metrics.gpuMemoryMb = gpu.memory_used_mb;
          });
        }
      }
    } catch (agentError: any) {
      diagnostics.push(`Agent probe failed: ${agentError.message || "connection refused"}`);
    }

    const healthyCount = services.filter(s => s.status === "healthy").length;
    const allProbesFailed = healthyCount === 0;
    
    let status: "online" | "offline" | "degraded";
    let reachable: boolean;
    
    if (healthyCount === services.length) {
      status = "online";
      reachable = true;
      diagnostics.push("All services responding via direct probe");
    } else if (healthyCount > 0) {
      status = "degraded";
      reachable = true;
      const downServices = services.filter(s => s.status !== "healthy").map(s => s.name);
      diagnostics.push(`Some services down: ${downServices.join(", ")}`);
    } else if (allProbesFailed && registryStatus.hasFreshHeartbeat) {
      status = "degraded";
      reachable = false;
      diagnostics.push(`Direct probes FAILED but registry heartbeat is fresh (${registryStatus.ageSeconds}s ago)`);
      diagnostics.push(`Services registered in DB: ${registryStatus.services.join(", ")}`);
      diagnostics.push("VM is alive (heartbeat) but unreachable from dashboard - check Tailscale/firewall");
      
      services.forEach(s => {
        if (s.status === "unhealthy") {
          s.details = `Probe failed - but service registered ${registryStatus.ageSeconds}s ago`;
        }
      });
    } else {
      status = "offline";
      reachable = false;
      if (registryStatus.ageSeconds !== null) {
        diagnostics.push(`Last registry heartbeat: ${registryStatus.ageSeconds}s ago (stale)`);
      } else {
        diagnostics.push("No registry heartbeats found for Windows services");
      }
      diagnostics.push("Check: Windows VM powered on, Tailscale connected, Nebula Agent running");
    }

    const healthWithDiagnostics = {
      target,
      name: config.name,
      status,
      reachable,
      lastChecked: new Date(),
      services,
      systemMetrics,
      metadata: {
        diagnostics,
        agentReachable,
        registryStatus: {
          hasFreshHeartbeat: registryStatus.hasFreshHeartbeat,
          lastSeen: registryStatus.lastSeen,
          services: registryStatus.services,
          ageSeconds: registryStatus.ageSeconds,
        },
        probeHost: config.host,
        probePort: config.port,
      },
    } as DeploymentHealth & { metadata: unknown };

    return healthWithDiagnostics;
  }

  private detectIssues(deployments: DeploymentHealth[]): HealthIssue[] {
    const detectedIssues: HealthIssue[] = [];
    const now = new Date();

    for (const deployment of deployments) {
      if (!deployment.reachable) {
        const issueId = this.getIssueId("connection_failed", deployment.target, "deployment");
        const existing = this.issues.get(issueId);
        
        detectedIssues.push({
          id: issueId,
          type: "connection_failed",
          severity: "critical",
          target: deployment.target,
          service: "deployment",
          title: `${deployment.name} Unreachable`,
          description: `Cannot connect to ${deployment.name}. All services on this deployment may be affected.`,
          detectedAt: existing?.detectedAt || now,
          lastSeen: now,
          count: (existing?.count || 0) + 1,
          fixInstructions: [
            `Check if ${deployment.name} is powered on`,
            "Verify network connectivity and firewall rules",
            "Check VPN/Tailscale connection if applicable",
            "Review system logs on the deployment target",
          ],
          autoFixable: false,
        });
        continue;
      }

      for (const service of deployment.services) {
        if (service.status === "unhealthy") {
          const issueId = this.getIssueId("service_down", deployment.target, service.type);
          const existing = this.issues.get(issueId);

          detectedIssues.push({
            id: issueId,
            type: "service_down",
            severity: "critical",
            target: deployment.target,
            service: service.type,
            title: `${service.name} Down`,
            description: service.error || `${service.name} is not responding on ${deployment.name}`,
            detectedAt: existing?.detectedAt || now,
            lastSeen: now,
            count: (existing?.count || 0) + 1,
            fixInstructions: this.getFixInstructions(service.type, "service_down"),
            autoFixable: this.isAutoFixable(service.type, "service_down"),
            autoFixAction: this.getAutoFixAction(service.type, "service_down"),
            metadata: { error: service.error },
          });
        }

        if (service.metrics) {
          const { gpuPercent, gpuTempC, cpuPercent, memoryPercent, diskPercent } = service.metrics;

          if (gpuPercent !== undefined && gpuPercent >= THRESHOLDS.gpu.warning) {
            const severity = gpuPercent >= THRESHOLDS.gpu.critical ? "critical" : "warning";
            const issueId = this.getIssueId("high_gpu_usage", deployment.target, service.type);
            const existing = this.issues.get(issueId);

            detectedIssues.push({
              id: issueId,
              type: "high_gpu_usage",
              severity,
              target: deployment.target,
              service: service.type,
              title: `High GPU Usage on ${service.name}`,
              description: `GPU utilization is at ${gpuPercent}%`,
              detectedAt: existing?.detectedAt || now,
              lastSeen: now,
              count: (existing?.count || 0) + 1,
              fixInstructions: [
                "Check for stuck or runaway AI generation jobs",
                "Review ComfyUI/SD queue for queued tasks",
                "Consider reducing batch sizes or queue length",
                "Monitor if usage returns to normal after current jobs complete",
              ],
              autoFixable: false,
              metadata: { gpuPercent },
            });
          }

          if (gpuTempC !== undefined && gpuTempC >= THRESHOLDS.gpuTemp.warning) {
            const severity = gpuTempC >= THRESHOLDS.gpuTemp.critical ? "critical" : "warning";
            const issueId = this.getIssueId("high_gpu_temp", deployment.target, service.type);
            const existing = this.issues.get(issueId);

            detectedIssues.push({
              id: issueId,
              type: "high_gpu_temp",
              severity,
              target: deployment.target,
              service: service.type,
              title: `High GPU Temperature`,
              description: `GPU temperature is at ${gpuTempC}°C`,
              detectedAt: existing?.detectedAt || now,
              lastSeen: now,
              count: (existing?.count || 0) + 1,
              fixInstructions: [
                "Check GPU fan speeds and case ventilation",
                "Reduce GPU workload temporarily",
                "Clean dust from GPU heatsink and fans",
                "Consider improving case airflow",
              ],
              autoFixable: false,
              metadata: { gpuTempC },
            });
          }
        }

        if (service.responseTimeMs && service.responseTimeMs >= THRESHOLDS.responseTime.warning) {
          const severity = service.responseTimeMs >= THRESHOLDS.responseTime.critical ? "critical" : "warning";
          const issueId = this.getIssueId("slow_response", deployment.target, service.type);
          const existing = this.issues.get(issueId);

          detectedIssues.push({
            id: issueId,
            type: "slow_response",
            severity,
            target: deployment.target,
            service: service.type,
            title: `Slow Response from ${service.name}`,
            description: `Response time is ${service.responseTimeMs}ms (threshold: ${THRESHOLDS.responseTime.warning}ms)`,
            detectedAt: existing?.detectedAt || now,
            lastSeen: now,
            count: (existing?.count || 0) + 1,
            fixInstructions: [
              "Check network latency between services",
              "Review service logs for errors or warnings",
              "Check system resource usage (CPU, memory)",
              "Consider restarting the service if issue persists",
            ],
            autoFixable: false,
            metadata: { responseTimeMs: service.responseTimeMs },
          });
        }
      }

      if (deployment.systemMetrics) {
        const { cpu, memory, disk } = deployment.systemMetrics;

        if (cpu.usage >= THRESHOLDS.cpu.warning) {
          const severity = cpu.usage >= THRESHOLDS.cpu.critical ? "critical" : "warning";
          const issueId = this.getIssueId("high_cpu", deployment.target, "system");
          const existing = this.issues.get(issueId);

          detectedIssues.push({
            id: issueId,
            type: "high_cpu",
            severity,
            target: deployment.target,
            service: "system",
            title: `High CPU Usage on ${deployment.name}`,
            description: `CPU usage is at ${cpu.usage.toFixed(1)}%`,
            detectedAt: existing?.detectedAt || now,
            lastSeen: now,
            count: (existing?.count || 0) + 1,
            fixInstructions: [
              "Identify high CPU processes using htop or Task Manager",
              "Check for runaway or stuck processes",
              "Review scheduled tasks or cron jobs",
              "Consider scaling resources if sustained high usage",
            ],
            autoFixable: false,
            metadata: { cpuUsage: cpu.usage, loadAverage: cpu.loadAverage },
          });
        }

        if (memory.percent >= THRESHOLDS.memory.warning) {
          const severity = memory.percent >= THRESHOLDS.memory.critical ? "critical" : "warning";
          const issueId = this.getIssueId("high_memory", deployment.target, "system");
          const existing = this.issues.get(issueId);

          detectedIssues.push({
            id: issueId,
            type: "high_memory",
            severity,
            target: deployment.target,
            service: "system",
            title: `High Memory Usage on ${deployment.name}`,
            description: `Memory usage is at ${memory.percent.toFixed(1)}% (${Math.round(memory.usedMb / 1024)}GB / ${Math.round(memory.totalMb / 1024)}GB)`,
            detectedAt: existing?.detectedAt || now,
            lastSeen: now,
            count: (existing?.count || 0) + 1,
            fixInstructions: [
              "Identify high memory processes",
              "Check for memory leaks in applications",
              "Consider restarting memory-heavy services",
              "Review and optimize application memory settings",
            ],
            autoFixable: false,
            metadata: { memoryPercent: memory.percent, usedMb: memory.usedMb },
          });
        }

        if (disk.percent >= THRESHOLDS.disk.warning) {
          const severity = disk.percent >= THRESHOLDS.disk.critical ? "critical" : "warning";
          const issueId = this.getIssueId("high_disk", deployment.target, "system");
          const existing = this.issues.get(issueId);

          detectedIssues.push({
            id: issueId,
            type: "high_disk",
            severity,
            target: deployment.target,
            service: "system",
            title: `Low Disk Space on ${deployment.name}`,
            description: `Disk usage is at ${disk.percent}% (${disk.usedGb}GB / ${disk.totalGb}GB)`,
            detectedAt: existing?.detectedAt || now,
            lastSeen: now,
            count: (existing?.count || 0) + 1,
            fixInstructions: [
              "Clean up Docker images and volumes: docker system prune -a",
              "Remove old log files: find /var/log -type f -mtime +30 -delete",
              "Check for large files: du -sh /* | sort -h",
              "Archive or delete unused data",
            ],
            autoFixable: deployment.target !== "replit",
            autoFixAction: "docker_prune",
            metadata: { diskPercent: disk.percent, usedGb: disk.usedGb },
          });
        }
      }
    }

    for (const issue of detectedIssues) {
      this.issues.set(issue.id, issue);
    }

    const activeIssueIds = new Set(detectedIssues.map(i => i.id));
    const issueIds = Array.from(this.issues.keys());
    for (const id of issueIds) {
      if (!activeIssueIds.has(id)) {
        this.issues.delete(id);
      }
    }

    return detectedIssues;
  }

  private getFixInstructions(service: ServiceType | string, issueType: IssueType): string[] {
    if (issueType === "service_down") {
      const instructions: Record<string, string[]> = {
        "ollama": [
          "SSH to Windows VM and check Ollama service status",
          "Restart Ollama: ollama serve",
          "Check if port 11434 is blocked by firewall",
          "Review Ollama logs for errors",
        ],
        "stable-diffusion": [
          "Check if Stable Diffusion WebUI is running",
          "Restart the SD WebUI: python launch.py --api",
          "Verify port 7860 is accessible",
          "Check for Python package conflicts",
        ],
        "comfyui": [
          "Check if ComfyUI process is running",
          "Restart ComfyUI: python main.py --listen 0.0.0.0",
          "Check port 8188 accessibility",
          "Review ComfyUI logs for errors",
        ],
        "whisper": [
          "Check Whisper service status",
          "Restart the Whisper API server",
          "Verify port 8765 is accessible",
          "Check for audio processing errors",
        ],
        "postgresql": [
          "Check PostgreSQL service status",
          "Verify connection string is correct",
          "Check database logs for errors",
          "Ensure database server is running",
        ],
        "redis": [
          "Check Redis service status",
          "Verify Redis URL is correct",
          "Check Redis logs for errors",
          "Ensure Redis server is running",
        ],
      };
      return instructions[service] || ["Check service logs", "Restart the service", "Verify network connectivity"];
    }
    return ["Review system metrics", "Check service logs", "Contact support if issue persists"];
  }

  private isAutoFixable(service: ServiceType | string, issueType: IssueType): boolean {
    if (issueType === "service_down") {
      return ["ollama", "stable-diffusion", "comfyui", "whisper"].includes(service);
    }
    return false;
  }

  private getAutoFixAction(service: ServiceType | string, issueType: IssueType): string | undefined {
    if (issueType === "service_down") {
      return `restart_${service}`;
    }
    return undefined;
  }

  async runHealthCheck(): Promise<HealthCheckResult> {
    if (this.isChecking) {
      return {
        timestamp: new Date(),
        deployments: [],
        issues: Array.from(this.issues.values()),
        summary: { totalDeployments: 0, onlineDeployments: 0, totalServices: 0, healthyServices: 0, criticalIssues: 0, warningIssues: 0 },
      };
    }

    this.isChecking = true;
    const timestamp = new Date();

    try {
      const [windowsVm, postgres, redis] = await Promise.all([
        this.checkWindowsVmHealth(),
        this.checkDatabaseHealth(),
        this.checkRedisHealth(),
      ]);

      const replitDeployment: DeploymentHealth = {
        target: "replit",
        name: "Replit Development",
        status: postgres.status === "healthy" ? "online" : "degraded",
        reachable: true,
        lastChecked: timestamp,
        services: [postgres, redis],
      };

      const deployments = [windowsVm, replitDeployment];
      const issues = this.detectIssues(deployments);

      const totalServices = deployments.reduce((sum, d) => sum + d.services.length, 0);
      const healthyServices = deployments.reduce(
        (sum, d) => sum + d.services.filter(s => s.status === "healthy").length,
        0
      );
      const onlineDeployments = deployments.filter(d => d.status === "online").length;

      this.lastCheck = timestamp;

      return {
        timestamp,
        deployments,
        issues,
        summary: {
          totalDeployments: deployments.length,
          onlineDeployments,
          totalServices,
          healthyServices,
          criticalIssues: issues.filter(i => i.severity === "critical").length,
          warningIssues: issues.filter(i => i.severity === "warning").length,
        },
      };
    } finally {
      this.isChecking = false;
    }
  }

  getActiveIssues(): HealthIssue[] {
    return Array.from(this.issues.values())
      .filter(i => !i.acknowledged)
      .sort((a, b) => {
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });
  }

  acknowledgeIssue(issueId: string, userId?: string): boolean {
    const issue = this.issues.get(issueId);
    if (issue) {
      issue.acknowledged = true;
      issue.acknowledgedBy = userId;
      issue.acknowledgedAt = new Date();
      return true;
    }
    return false;
  }

  dismissIssue(issueId: string): boolean {
    return this.issues.delete(issueId);
  }

  getLastCheckTime(): Date | null {
    return this.lastCheck;
  }

  startPeriodicChecks(intervalMs: number = 60000): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    this.runHealthCheck().catch(console.error);
    
    this.checkInterval = setInterval(() => {
      this.runHealthCheck().catch(console.error);
    }, intervalMs);
  }

  stopPeriodicChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

export const healthMonitor = new HealthMonitor();
