/**
 * Remote Deployment Manager
 * Comprehensive deployment system for Nebula Command
 * Supports Linode, Ubuntu Home, and Windows VM environments
 */

import { Client } from "ssh2";
import { getAllServers, getServerById, getSSHPrivateKey, ServerConfig } from "./server-config-store";

export type Environment = "linode" | "ubuntu-home" | "windows-vm" | "all";

export interface DeployStep {
  name: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  message?: string;
  duration?: number;
  startedAt?: string;
  completedAt?: string;
}

export interface ProbeResult {
  name: string;
  success: boolean;
  message: string;
  latencyMs?: number;
  details?: Record<string, unknown>;
}

export interface DeployResult {
  success: boolean;
  environment: string;
  steps: DeployStep[];
  verificationResults?: ProbeResult[];
  duration: number;
  timestamp: string;
  rollbackAvailable?: boolean;
  gitCommit?: string;
  previousCommit?: string;
  error?: string;
}

export interface DeployOptions {
  skipBuild?: boolean;
  skipVerify?: boolean;
  force?: boolean;
  services?: string[];
  branch?: string;
}

export interface DeploymentRecord {
  id: string;
  environment: Environment;
  gitCommit: string;
  previousCommit?: string;
  timestamp: Date;
  success: boolean;
  duration: number;
  services: string[];
  triggeredBy?: string;
}

interface SSHCommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

const ENVIRONMENT_CONFIGS: Record<string, { serverId: string; deployPath: string; services: string[] }> = {
  linode: {
    serverId: "linode",
    deployPath: "/opt/homelab/HomeLabHub",
    services: ["dashboard-next", "discord-bot", "stream-bot", "terminal-server"],
  },
  "ubuntu-home": {
    serverId: "home",
    deployPath: "/opt/homelab/HomeLabHub",
    services: ["plex", "docker", "libvirt", "vnc-server"],
  },
  "windows-vm": {
    serverId: "windows",
    deployPath: "C:\\HomeLabHub",
    services: ["nebula-agent", "ollama", "comfyui", "stable-diffusion"],
  },
};

const deploymentHistory: DeploymentRecord[] = [];
let deploymentIdCounter = 0;

function generateDeploymentId(): string {
  deploymentIdCounter++;
  return `deploy-${Date.now()}-${deploymentIdCounter}`;
}

async function runSSHCommand(
  config: ServerConfig,
  command: string,
  timeout: number = 120000
): Promise<SSHCommandResult> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const privateKey = getSSHPrivateKey();

    if (!privateKey) {
      reject(new Error("SSH private key not found"));
      return;
    }

    let stdout = "";
    let stderr = "";
    let timeoutHandle: NodeJS.Timeout | null = null;

    conn.on("ready", () => {
      timeoutHandle = setTimeout(() => {
        conn.end();
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeoutHandle!);
          conn.end();
          reject(err);
          return;
        }

        stream.on("close", (code: number) => {
          clearTimeout(timeoutHandle!);
          conn.end();
          resolve({ stdout, stderr, code });
        });

        stream.on("data", (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });
      });
    });

    conn.on("error", (err) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(err);
    });

    conn.connect({
      host: config.tailscaleIp || config.host,
      port: config.port || 22,
      username: config.user,
      privateKey,
      readyTimeout: 30000,
    });
  });
}

async function runAgentCommand(
  config: ServerConfig,
  command: string,
  timeout: number = 120000
): Promise<SSHCommandResult> {
  const agentHost = config.tailscaleIp || config.host;
  const agentPort = config.agentPort || 9765;
  const agentToken = config.agentToken || process.env.NEBULA_AGENT_TOKEN;

  const response = await fetch(`http://${agentHost}:${agentPort}/api/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(agentToken ? { Authorization: `Bearer ${agentToken}` } : {}),
    },
    body: JSON.stringify({ command, timeout }),
    signal: AbortSignal.timeout(timeout),
  });

  if (!response.ok) {
    throw new Error(`Windows agent returned ${response.status}: ${response.statusText}`);
  }

  const result = await response.json();
  return {
    stdout: result.output || "",
    stderr: result.stderr || "",
    code: result.success ? 0 : 1,
  };
}

async function getGitCommit(config: ServerConfig, deployPath: string, isWindows: boolean): Promise<string> {
  try {
    const command = isWindows
      ? `cd "${deployPath}" && git rev-parse HEAD`
      : `cd ${deployPath} && git rev-parse HEAD`;
    
    const result = isWindows
      ? await runAgentCommand(config, command)
      : await runSSHCommand(config, command);
    
    return result.stdout.trim().substring(0, 8);
  } catch {
    return "unknown";
  }
}

async function checkHttpEndpoint(
  url: string,
  timeout: number = 5000
): Promise<{ success: boolean; latencyMs: number; status?: number; error?: string }> {
  const start = Date.now();
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeout),
      headers: { Accept: "application/json" },
    });
    return {
      success: response.ok,
      latencyMs: Date.now() - start,
      status: response.status,
    };
  } catch (error) {
    return {
      success: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export class RemoteDeployer {
  private activeDeployments: Map<string, boolean> = new Map();

  async deployToLinode(options: DeployOptions = {}): Promise<DeployResult> {
    return this.deployToEnvironment("linode", options);
  }

  async deployToUbuntuHome(options: DeployOptions = {}): Promise<DeployResult> {
    return this.deployToEnvironment("ubuntu-home", options);
  }

  async deployToWindowsVM(options: DeployOptions = {}): Promise<DeployResult> {
    return this.deployToEnvironment("windows-vm", options);
  }

  async deployToAll(options: DeployOptions = {}): Promise<DeployResult[]> {
    const environments: Environment[] = ["linode", "ubuntu-home", "windows-vm"];
    const results = await Promise.allSettled(
      environments.map((env) => this.deployToEnvironment(env, options))
    );

    return results.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      return {
        success: false,
        environment: environments[index],
        steps: [],
        duration: 0,
        timestamp: new Date().toISOString(),
        error: result.reason?.message || "Deployment failed",
      };
    });
  }

  private async deployToEnvironment(environment: Environment, options: DeployOptions = {}): Promise<DeployResult> {
    const startTime = Date.now();
    const steps: DeployStep[] = [];
    const envConfig = ENVIRONMENT_CONFIGS[environment];

    if (!envConfig) {
      return {
        success: false,
        environment,
        steps: [],
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        error: `Unknown environment: ${environment}`,
      };
    }

    if (this.activeDeployments.get(environment)) {
      return {
        success: false,
        environment,
        steps: [],
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        error: `Deployment already in progress for ${environment}`,
      };
    }

    this.activeDeployments.set(environment, true);

    try {
      const server = await getServerById(envConfig.serverId);
      if (!server) {
        throw new Error(`Server config not found for ${environment}`);
      }

      const isWindows = server.serverType === "windows";
      const deployPath = envConfig.deployPath;
      const services = options.services?.length ? options.services : envConfig.services;

      const previousCommit = await getGitCommit(server, deployPath, isWindows);

      const gitPullStep: DeployStep = {
        name: "git_pull",
        status: "running",
        startedAt: new Date().toISOString(),
      };
      steps.push(gitPullStep);

      try {
        const branch = options.branch || "main";
        const gitCommand = isWindows
          ? `cd "${deployPath}" && git fetch origin && git reset --hard origin/${branch}`
          : `cd ${deployPath} && git fetch origin && git reset --hard origin/${branch}`;

        const gitResult = isWindows
          ? await runAgentCommand(server, gitCommand)
          : await runSSHCommand(server, gitCommand);

        gitPullStep.status = gitResult.code === 0 ? "success" : "failed";
        gitPullStep.message = gitResult.code === 0 ? "Code synced successfully" : gitResult.stderr;
        gitPullStep.completedAt = new Date().toISOString();
        gitPullStep.duration = Date.now() - new Date(gitPullStep.startedAt!).getTime();
      } catch (error: unknown) {
        gitPullStep.status = "failed";
        gitPullStep.message = error instanceof Error ? error.message : "Git pull failed";
        gitPullStep.completedAt = new Date().toISOString();
      }

      if (gitPullStep.status === "failed" && !options.force) {
        throw new Error(`Git pull failed: ${gitPullStep.message}`);
      }

      if (!options.skipBuild) {
        const installStep: DeployStep = {
          name: "npm_install",
          status: "running",
          startedAt: new Date().toISOString(),
        };
        steps.push(installStep);

        try {
          const installCommand = isWindows
            ? `cd "${deployPath}" && npm ci --prefer-offline`
            : `cd ${deployPath} && npm ci --prefer-offline`;

          const installResult = isWindows
            ? await runAgentCommand(server, installCommand, 300000)
            : await runSSHCommand(server, installCommand, 300000);

          installStep.status = installResult.code === 0 ? "success" : "failed";
          installStep.message = installResult.code === 0 ? "Dependencies installed" : installResult.stderr;
          installStep.completedAt = new Date().toISOString();
          installStep.duration = Date.now() - new Date(installStep.startedAt!).getTime();
        } catch (error: unknown) {
          installStep.status = "failed";
          installStep.message = error instanceof Error ? error.message : "Install failed";
          installStep.completedAt = new Date().toISOString();
        }

        const buildStep: DeployStep = {
          name: "npm_build",
          status: "running",
          startedAt: new Date().toISOString(),
        };
        steps.push(buildStep);

        try {
          const buildCommand = isWindows
            ? `cd "${deployPath}" && npm run build`
            : `cd ${deployPath} && npm run build`;

          const buildResult = isWindows
            ? await runAgentCommand(server, buildCommand, 600000)
            : await runSSHCommand(server, buildCommand, 600000);

          buildStep.status = buildResult.code === 0 ? "success" : "failed";
          buildStep.message = buildResult.code === 0 ? "Build completed" : buildResult.stderr;
          buildStep.completedAt = new Date().toISOString();
          buildStep.duration = Date.now() - new Date(buildStep.startedAt!).getTime();
        } catch (error: unknown) {
          buildStep.status = "failed";
          buildStep.message = error instanceof Error ? error.message : "Build failed";
          buildStep.completedAt = new Date().toISOString();
        }
      }

      const restartStep: DeployStep = {
        name: "restart_services",
        status: "running",
        startedAt: new Date().toISOString(),
      };
      steps.push(restartStep);

      try {
        let restartCommand: string;
        if (isWindows) {
          restartCommand = `pm2 restart all`;
        } else if (environment === "linode") {
          restartCommand = `cd ${deployPath} && pm2 restart all`;
        } else {
          restartCommand = `cd ${deployPath}/deploy/local && docker-compose restart`;
        }

        const restartResult = isWindows
          ? await runAgentCommand(server, restartCommand)
          : await runSSHCommand(server, restartCommand);

        restartStep.status = restartResult.code === 0 ? "success" : "failed";
        restartStep.message = restartResult.code === 0 
          ? `Services restarted: ${services.join(", ")}` 
          : restartResult.stderr;
        restartStep.completedAt = new Date().toISOString();
        restartStep.duration = Date.now() - new Date(restartStep.startedAt!).getTime();
      } catch (error: unknown) {
        restartStep.status = "failed";
        restartStep.message = error instanceof Error ? error.message : "Restart failed";
        restartStep.completedAt = new Date().toISOString();
      }

      const gitCommit = await getGitCommit(server, deployPath, isWindows);

      let verificationResults: ProbeResult[] | undefined;
      if (!options.skipVerify) {
        verificationResults = await this.runRemoteVerification(environment);
      }

      const allStepsSucceeded = steps.every((s) => s.status === "success" || s.status === "skipped");
      const duration = Date.now() - startTime;

      const record: DeploymentRecord = {
        id: generateDeploymentId(),
        environment: environment as Environment,
        gitCommit,
        previousCommit,
        timestamp: new Date(),
        success: allStepsSucceeded,
        duration,
        services,
      };
      deploymentHistory.unshift(record);
      if (deploymentHistory.length > 100) {
        deploymentHistory.pop();
      }

      return {
        success: allStepsSucceeded,
        environment,
        steps,
        verificationResults,
        duration,
        timestamp: new Date().toISOString(),
        rollbackAvailable: true,
        gitCommit,
        previousCommit,
      };
    } catch (error: unknown) {
      return {
        success: false,
        environment,
        steps,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Deployment failed",
      };
    } finally {
      this.activeDeployments.set(environment, false);
    }
  }

  async syncCode(environment: Environment): Promise<DeployResult> {
    const startTime = Date.now();
    const steps: DeployStep[] = [];
    const envConfig = ENVIRONMENT_CONFIGS[environment];

    if (!envConfig) {
      return {
        success: false,
        environment,
        steps: [],
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        error: `Unknown environment: ${environment}`,
      };
    }

    try {
      const server = await getServerById(envConfig.serverId);
      if (!server) {
        throw new Error(`Server config not found for ${environment}`);
      }

      const isWindows = server.serverType === "windows";
      const deployPath = envConfig.deployPath;

      const gitPullStep: DeployStep = {
        name: "git_pull",
        status: "running",
        startedAt: new Date().toISOString(),
      };
      steps.push(gitPullStep);

      const gitCommand = isWindows
        ? `cd "${deployPath}" && git pull origin main`
        : `cd ${deployPath} && git pull origin main`;

      const gitResult = isWindows
        ? await runAgentCommand(server, gitCommand)
        : await runSSHCommand(server, gitCommand);

      gitPullStep.status = gitResult.code === 0 ? "success" : "failed";
      gitPullStep.message = gitResult.code === 0 ? gitResult.stdout : gitResult.stderr;
      gitPullStep.completedAt = new Date().toISOString();
      gitPullStep.duration = Date.now() - new Date(gitPullStep.startedAt!).getTime();

      const gitCommit = await getGitCommit(server, deployPath, isWindows);

      return {
        success: gitResult.code === 0,
        environment,
        steps,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        gitCommit,
      };
    } catch (error: unknown) {
      return {
        success: false,
        environment,
        steps,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Sync failed",
      };
    }
  }

  async runRemoteVerification(environment: Environment): Promise<ProbeResult[]> {
    const results: ProbeResult[] = [];

    const probeConfigs: Record<string, Array<{ name: string; url: string }>> = {
      linode: [
        { name: "dashboard", url: "http://localhost:5000/api/health" },
        { name: "discord-bot", url: "http://localhost:4000/health" },
        { name: "stream-bot", url: "http://localhost:3000/health" },
      ],
      "ubuntu-home": [
        { name: "plex", url: "http://localhost:32400/web" },
        { name: "docker", url: "http://localhost:2375/version" },
      ],
      "windows-vm": [
        { name: "nebula-agent", url: `http://${process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102"}:9765/api/health` },
        { name: "ollama", url: `http://${process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102"}:11434/api/tags` },
        { name: "comfyui", url: `http://${process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102"}:8188/system_stats` },
      ],
    };

    const probes = probeConfigs[environment] || [];

    for (const probe of probes) {
      try {
        const result = await checkHttpEndpoint(probe.url, 10000);
        results.push({
          name: probe.name,
          success: result.success,
          message: result.success 
            ? `Healthy (${result.latencyMs}ms)` 
            : `Failed: ${result.error || `HTTP ${result.status}`}`,
          latencyMs: result.latencyMs,
          details: { url: probe.url, status: result.status },
        });
      } catch (error: unknown) {
        results.push({
          name: probe.name,
          success: false,
          message: error instanceof Error ? error.message : "Probe failed",
        });
      }
    }

    return results;
  }

  async verifyAll(): Promise<Record<string, ProbeResult[]>> {
    const environments: Environment[] = ["linode", "ubuntu-home", "windows-vm"];
    const results: Record<string, ProbeResult[]> = {};

    for (const env of environments) {
      results[env] = await this.runRemoteVerification(env);
    }

    return results;
  }

  async rollback(environment: Environment): Promise<DeployResult> {
    const startTime = Date.now();
    const steps: DeployStep[] = [];
    const envConfig = ENVIRONMENT_CONFIGS[environment];

    if (!envConfig) {
      return {
        success: false,
        environment,
        steps: [],
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        error: `Unknown environment: ${environment}`,
      };
    }

    const lastSuccessfulDeploy = deploymentHistory.find(
      (d) => d.environment === environment && d.success && d.previousCommit
    );

    if (!lastSuccessfulDeploy?.previousCommit) {
      return {
        success: false,
        environment,
        steps: [],
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        error: "No previous deployment found to rollback to",
        rollbackAvailable: false,
      };
    }

    try {
      const server = await getServerById(envConfig.serverId);
      if (!server) {
        throw new Error(`Server config not found for ${environment}`);
      }

      const isWindows = server.serverType === "windows";
      const deployPath = envConfig.deployPath;

      const rollbackStep: DeployStep = {
        name: "git_rollback",
        status: "running",
        startedAt: new Date().toISOString(),
      };
      steps.push(rollbackStep);

      const currentCommit = await getGitCommit(server, deployPath, isWindows);

      const rollbackCommand = isWindows
        ? `cd "${deployPath}" && git reset --hard HEAD~1`
        : `cd ${deployPath} && git reset --hard HEAD~1`;

      const rollbackResult = isWindows
        ? await runAgentCommand(server, rollbackCommand)
        : await runSSHCommand(server, rollbackCommand);

      rollbackStep.status = rollbackResult.code === 0 ? "success" : "failed";
      rollbackStep.message = rollbackResult.code === 0 
        ? `Rolled back from ${currentCommit}` 
        : rollbackResult.stderr;
      rollbackStep.completedAt = new Date().toISOString();
      rollbackStep.duration = Date.now() - new Date(rollbackStep.startedAt!).getTime();

      if (rollbackResult.code !== 0) {
        throw new Error(`Rollback failed: ${rollbackResult.stderr}`);
      }

      const restartStep: DeployStep = {
        name: "restart_services",
        status: "running",
        startedAt: new Date().toISOString(),
      };
      steps.push(restartStep);

      const restartCommand = isWindows
        ? "pm2 restart all"
        : environment === "linode"
          ? `cd ${deployPath} && pm2 restart all`
          : `cd ${deployPath}/deploy/local && docker-compose restart`;

      const restartResult = isWindows
        ? await runAgentCommand(server, restartCommand)
        : await runSSHCommand(server, restartCommand);

      restartStep.status = restartResult.code === 0 ? "success" : "failed";
      restartStep.message = restartResult.code === 0 ? "Services restarted" : restartResult.stderr;
      restartStep.completedAt = new Date().toISOString();
      restartStep.duration = Date.now() - new Date(restartStep.startedAt!).getTime();

      const newCommit = await getGitCommit(server, deployPath, isWindows);

      return {
        success: true,
        environment,
        steps,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        rollbackAvailable: true,
        gitCommit: newCommit,
        previousCommit: currentCommit,
      };
    } catch (error: unknown) {
      return {
        success: false,
        environment,
        steps,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Rollback failed",
      };
    }
  }

  async getStatus(environment?: Environment): Promise<Record<string, {
    status: "online" | "offline" | "deploying" | "unknown";
    lastDeploy?: DeploymentRecord;
    services: Array<{ name: string; status: string }>;
  }>> {
    const environments: Environment[] = environment 
      ? [environment] 
      : ["linode", "ubuntu-home", "windows-vm"];
    
    const status: Record<string, {
      status: "online" | "offline" | "deploying" | "unknown";
      lastDeploy?: DeploymentRecord;
      services: Array<{ name: string; status: string }>;
    }> = {};

    for (const env of environments) {
      const envConfig = ENVIRONMENT_CONFIGS[env];
      if (!envConfig) continue;

      const isDeploying = this.activeDeployments.get(env) || false;
      const lastDeploy = deploymentHistory.find((d) => d.environment === env);

      let serverStatus: "online" | "offline" | "deploying" | "unknown" = "unknown";
      const services: Array<{ name: string; status: string }> = [];

      if (isDeploying) {
        serverStatus = "deploying";
      } else {
        try {
          const server = await getServerById(envConfig.serverId);
          if (server) {
            if (server.serverType === "windows") {
              const agentHost = server.tailscaleIp || server.host;
              const agentPort = server.agentPort || 9765;
              const healthResult = await checkHttpEndpoint(
                `http://${agentHost}:${agentPort}/api/health`,
                5000
              );
              serverStatus = healthResult.success ? "online" : "offline";

              if (healthResult.success) {
                try {
                  const servicesResult = await runAgentCommand(server, "pm2 jlist", 10000);
                  if (servicesResult.code === 0) {
                    const processes = JSON.parse(servicesResult.stdout);
                    for (const proc of processes) {
                      services.push({
                        name: proc.name,
                        status: proc.pm2_env?.status || "unknown",
                      });
                    }
                  }
                } catch {
                }
              }
            } else {
              const probes = await this.runRemoteVerification(env);
              serverStatus = probes.some((p) => p.success) ? "online" : "offline";
              for (const probe of probes) {
                services.push({
                  name: probe.name,
                  status: probe.success ? "running" : "stopped",
                });
              }
            }
          }
        } catch {
          serverStatus = "offline";
        }
      }

      status[env] = {
        status: serverStatus,
        lastDeploy,
        services,
      };
    }

    return status;
  }

  isDeploying(environment: Environment): boolean {
    return this.activeDeployments.get(environment) || false;
  }

  getDeploymentHistory(environment?: Environment, limit: number = 20): DeploymentRecord[] {
    let history = deploymentHistory;
    if (environment) {
      history = history.filter((d) => d.environment === environment);
    }
    return history.slice(0, limit);
  }
}

export const remoteDeployer = new RemoteDeployer();
