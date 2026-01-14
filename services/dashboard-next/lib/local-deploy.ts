/**
 * Local Deployment Manager
 * Deploy to Ubuntu homelab and Windows VM without cloud costs
 */

import { exec } from "child_process";
import { promisify } from "util";
import { getServerById, getAllServers, ServerConfig } from "./server-config-store";
import { checkServerOnline, sendWolViaRelay } from "./wol-relay";

const execAsync = promisify(exec);

export interface DeployTarget {
  id: string;
  name: string;
  type: "ubuntu" | "windows" | "docker";
  host: string;
  port: number;
  user: string;
  deployPath: string;
  deployCommand?: string;
  healthCheckUrl?: string;
  status: "online" | "offline" | "deploying" | "unknown";
}

export interface DeployResult {
  success: boolean;
  target: string;
  service: string;
  output?: string;
  error?: string;
  duration?: number;
  timestamp: Date;
}

export interface DeployStatus {
  target: string;
  status: "online" | "offline" | "deploying" | "unknown";
  lastDeploy?: Date;
  lastDeploySuccess?: boolean;
  version?: string;
  services: ServiceStatus[];
}

export interface ServiceStatus {
  name: string;
  status: "running" | "stopped" | "error";
  uptime?: number;
  lastRestart?: Date;
}

export interface HealthCheckResult {
  target: string;
  healthy: boolean;
  latencyMs?: number;
  services: { name: string; healthy: boolean; error?: string }[];
  timestamp: Date;
}

export interface RollbackInfo {
  target: string;
  previousVersion: string;
  currentVersion: string;
  timestamp: Date;
}

interface DeploymentHistory {
  target: string;
  service: string;
  version: string;
  timestamp: Date;
  success: boolean;
  gitCommit?: string;
}

// Whitelist of allowed service names to prevent command injection
const ALLOWED_SERVICES = new Set([
  // Dashboard services (Linode)
  "dashboard-next",
  "discord-bot", 
  "stream-bot",
  "terminal-server",
  "postgres",
  "redis",
  "caddy",
  "authelia",
  // Ubuntu host services (KVM hypervisor)
  "libvirt",
  "libvirtd",
  "windows-vm",
  "plex",
  "transmission",
  "vnc",
  "vnc-server",
  "xrdp",
  "docker",
  "nas-mounts",
  // Windows AI services (VM guest)
  "ollama",
  "comfyui",
  "stable-diffusion",
  "agent",
  "nebula-agent",
  "sunshine",
  // General
  "all",
]);

// Remote access protocols
export interface RemoteAccessConfig {
  type: "vnc" | "rdp" | "sunshine" | "ssh";
  host: string;
  port: number;
  url: string;
  description?: string;
}

export function getRemoteAccessConfigs(): Record<string, RemoteAccessConfig[]> {
  const UBUNTU_IP = process.env.UBUNTU_TAILSCALE_IP || "100.66.61.51";
  const WINDOWS_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
  
  return {
    ubuntu: [
      {
        type: "vnc",
        host: UBUNTU_IP,
        port: 5901,
        url: `vnc://${UBUNTU_IP}:5901`,
        description: "TigerVNC - Full desktop access",
      },
      {
        type: "rdp",
        host: UBUNTU_IP,
        port: 3389,
        url: `rdp://${UBUNTU_IP}:3389`,
        description: "xrdp - Windows Remote Desktop compatible",
      },
      {
        type: "ssh",
        host: UBUNTU_IP,
        port: 22,
        url: `ssh://${UBUNTU_IP}:22`,
        description: "SSH terminal access",
      },
    ],
    windows: [
      {
        type: "rdp",
        host: WINDOWS_IP,
        port: 3389,
        url: `rdp://${WINDOWS_IP}:3389`,
        description: "Windows Remote Desktop",
      },
      {
        type: "sunshine",
        host: WINDOWS_IP,
        port: 47989,
        url: `https://${WINDOWS_IP}:47989`,
        description: "Sunshine - GPU-accelerated streaming (use Moonlight client)",
      },
    ],
  };
}

// Sanitize service name - only allow alphanumeric and dash
function sanitizeServiceName(service: string): string {
  const sanitized = service.replace(/[^a-zA-Z0-9-]/g, "");
  if (!ALLOWED_SERVICES.has(sanitized)) {
    throw new Error(`Service '${sanitized}' is not in the allowed services list`);
  }
  return sanitized;
}

class LocalDeployManager {
  private targets: Map<string, DeployTarget> = new Map();
  private deploymentHistory: DeploymentHistory[] = [];
  private activeDeployments: Map<string, boolean> = new Map();

  constructor() {
    this.initializeTargets();
  }

  private async initializeTargets(): Promise<void> {
    const servers = await getAllServers();
    
    for (const server of servers) {
      const target: DeployTarget = {
        id: server.id,
        name: server.name,
        type: server.serverType === "windows" ? "windows" : "ubuntu",
        host: server.tailscaleIp || server.host,
        port: server.port || (server.serverType === "windows" ? 9765 : 22),
        user: server.user,
        deployPath: server.deployPath || "/opt/homelab",
        status: "unknown",
      };
      
      this.targets.set(server.id, target);
    }
  }

  async refreshTargets(): Promise<DeployTarget[]> {
    await this.initializeTargets();
    
    const statusChecks = Array.from(this.targets.values()).map(async (target) => {
      const online = await checkServerOnline(target.host, target.port, 5000);
      target.status = online ? "online" : "offline";
      return target;
    });
    
    const results = await Promise.all(statusChecks);
    return results;
  }

  getTargets(): DeployTarget[] {
    return Array.from(this.targets.values());
  }

  getTarget(id: string): DeployTarget | undefined {
    return this.targets.get(id);
  }

  async deploy(service: string, targetId: string, options?: {
    gitPull?: boolean;
    restart?: boolean;
    build?: boolean;
  }): Promise<DeployResult> {
    const startTime = Date.now();
    
    // Validate and sanitize service name to prevent command injection
    let sanitizedService: string;
    try {
      sanitizedService = sanitizeServiceName(service);
    } catch (error: any) {
      return {
        success: false,
        target: targetId,
        service,
        error: error.message,
        timestamp: new Date(),
      };
    }
    
    const target = this.targets.get(targetId);
    
    if (!target) {
      return {
        success: false,
        target: targetId,
        service,
        error: `Target '${targetId}' not found`,
        timestamp: new Date(),
      };
    }
    
    if (this.activeDeployments.get(targetId)) {
      return {
        success: false,
        target: targetId,
        service,
        error: `Deployment already in progress for ${targetId}`,
        timestamp: new Date(),
      };
    }
    
    this.activeDeployments.set(targetId, true);
    target.status = "deploying";
    
    try {
      const server = await getServerById(targetId);
      if (!server) {
        throw new Error(`Server config not found for ${targetId}`);
      }
      
      let output = "";
      
      if (target.type === "windows") {
        output = await this.deployToWindows(server, sanitizedService, options);
      } else {
        output = await this.deployToLinux(server, sanitizedService, options);
      }
      
      const duration = Date.now() - startTime;
      target.status = "online";
      
      this.deploymentHistory.push({
        target: targetId,
        service: sanitizedService,
        version: new Date().toISOString(),
        timestamp: new Date(),
        success: true,
      });
      
      return {
        success: true,
        target: targetId,
        service: sanitizedService,
        output,
        duration,
        timestamp: new Date(),
      };
    } catch (error: any) {
      target.status = "online";
      
      this.deploymentHistory.push({
        target: targetId,
        service: sanitizedService,
        version: new Date().toISOString(),
        timestamp: new Date(),
        success: false,
      });
      
      return {
        success: false,
        target: targetId,
        service: sanitizedService,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    } finally {
      this.activeDeployments.set(targetId, false);
    }
  }

  private async deployToWindows(server: ServerConfig, service: string, options?: {
    gitPull?: boolean;
    restart?: boolean;
    build?: boolean;
  }): Promise<string> {
    const agentHost = server.tailscaleIp || server.host;
    const agentPort = server.agentPort || 9765;
    const agentToken = server.agentToken || process.env.NEBULA_AGENT_TOKEN;
    
    const commands: string[] = [];
    
    if (options?.gitPull) {
      commands.push(`cd ${server.deployPath} && git pull`);
    }
    
    if (options?.build) {
      commands.push(`cd ${server.deployPath} && npm install && npm run build`);
    }
    
    if (options?.restart) {
      const serviceCommands: Record<string, string> = {
        ollama: "net stop ollama & net start ollama",
        comfyui: "taskkill /F /IM python.exe /FI \"WINDOWTITLE eq ComfyUI\" & cd C:\\AI\\ComfyUI && start python main.py",
        agent: "cd C:\\HomeLabHub\\agent && pm2 restart nebula-agent",
        all: "pm2 restart all",
      };
      commands.push(serviceCommands[service] || `pm2 restart ${service}`);
    }
    
    let output = "";
    for (const command of commands) {
      const response = await fetch(`http://${agentHost}:${agentPort}/api/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(agentToken ? { Authorization: `Bearer ${agentToken}` } : {}),
        },
        body: JSON.stringify({ command }),
        signal: AbortSignal.timeout(120000),
      });
      
      if (!response.ok) {
        throw new Error(`Windows agent returned ${response.status}`);
      }
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Command failed");
      }
      output += `${command}:\n${result.output || ""}\n\n`;
    }
    
    return output;
  }

  private async deployToLinux(server: ServerConfig, service: string, options?: {
    gitPull?: boolean;
    restart?: boolean;
    build?: boolean;
  }): Promise<string> {
    const { NodeSSH } = await import("node-ssh");
    const ssh = new NodeSSH();
    
    const { getSSHPrivateKey } = await import("./server-config-store");
    const privateKey = getSSHPrivateKey();
    
    if (!privateKey) {
      throw new Error("SSH private key not found");
    }
    
    await ssh.connect({
      host: server.host,
      username: server.user,
      privateKey: privateKey.toString(),
      port: server.port || 22,
      readyTimeout: 30000,
    });
    
    let output = "";
    
    try {
      if (options?.gitPull) {
        const result = await ssh.execCommand(`cd ${server.deployPath} && git pull`);
        output += `git pull:\n${result.stdout}\n${result.stderr}\n\n`;
      }
      
      if (options?.build) {
        const result = await ssh.execCommand(`cd ${server.deployPath} && npm install && npm run build`);
        output += `build:\n${result.stdout}\n${result.stderr}\n\n`;
      }
      
      if (options?.restart) {
        const restartCmd = service === "all"
          ? `cd ${server.deployPath} && docker-compose restart`
          : `cd ${server.deployPath} && docker-compose restart ${service}`;
        const result = await ssh.execCommand(restartCmd);
        output += `restart:\n${result.stdout}\n${result.stderr}\n\n`;
      }
      
      return output;
    } finally {
      ssh.dispose();
    }
  }

  async rollback(targetId: string): Promise<DeployResult> {
    const target = this.targets.get(targetId);
    if (!target) {
      return {
        success: false,
        target: targetId,
        service: "all",
        error: `Target '${targetId}' not found`,
        timestamp: new Date(),
      };
    }
    
    const server = await getServerById(targetId);
    if (!server) {
      return {
        success: false,
        target: targetId,
        service: "all",
        error: `Server config not found`,
        timestamp: new Date(),
      };
    }
    
    try {
      let output = "";
      
      if (target.type === "windows") {
        const agentHost = server.tailscaleIp || server.host;
        const agentPort = server.agentPort || 9765;
        const agentToken = server.agentToken || process.env.NEBULA_AGENT_TOKEN;
        
        const response = await fetch(`http://${agentHost}:${agentPort}/api/execute`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(agentToken ? { Authorization: `Bearer ${agentToken}` } : {}),
          },
          body: JSON.stringify({ command: `cd ${server.deployPath} && git reset --hard HEAD~1` }),
          signal: AbortSignal.timeout(60000),
        });
        
        const result = await response.json();
        output = result.output || "";
      } else {
        const { NodeSSH } = await import("node-ssh");
        const ssh = new NodeSSH();
        const { getSSHPrivateKey } = await import("./server-config-store");
        const privateKey = getSSHPrivateKey();
        
        if (!privateKey) {
          throw new Error("SSH private key not found");
        }
        
        await ssh.connect({
          host: server.host,
          username: server.user,
          privateKey: privateKey.toString(),
          port: server.port || 22,
        });
        
        const result = await ssh.execCommand(`cd ${server.deployPath} && git reset --hard HEAD~1`);
        output = `${result.stdout}\n${result.stderr}`;
        ssh.dispose();
      }
      
      return {
        success: true,
        target: targetId,
        service: "all",
        output,
        timestamp: new Date(),
      };
    } catch (error: any) {
      return {
        success: false,
        target: targetId,
        service: "all",
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  async getStatus(targetId: string): Promise<DeployStatus> {
    const target = this.targets.get(targetId);
    
    if (!target) {
      return {
        target: targetId,
        status: "unknown",
        services: [],
      };
    }
    
    const online = await checkServerOnline(target.host, target.port, 5000);
    target.status = online ? "online" : "offline";
    
    const lastDeploy = this.deploymentHistory
      .filter(d => d.target === targetId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
    
    return {
      target: targetId,
      status: target.status,
      lastDeploy: lastDeploy?.timestamp,
      lastDeploySuccess: lastDeploy?.success,
      services: [],
    };
  }

  async runHealthChecks(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];
    
    const targetEntries = Array.from(this.targets.entries());
    for (const [id, target] of targetEntries) {
      const startTime = Date.now();
      const online = await checkServerOnline(target.host, target.port, 5000);
      const latencyMs = Date.now() - startTime;
      
      results.push({
        target: id,
        healthy: online,
        latencyMs: online ? latencyMs : undefined,
        services: [],
        timestamp: new Date(),
      });
    }
    
    return results;
  }

  async wakeTarget(targetId: string): Promise<{ success: boolean; message: string }> {
    const server = await getServerById(targetId);
    if (!server) {
      return { success: false, message: `Server ${targetId} not found` };
    }
    
    if (!server.supportsWol || !server.macAddress) {
      return { success: false, message: `Server ${targetId} doesn't support WoL` };
    }
    
    const result = await sendWolViaRelay({
      macAddress: server.macAddress,
      broadcastAddress: server.broadcastAddress,
      relayServerId: server.wolRelayServer,
    });
    
    return {
      success: result.success,
      message: result.message || result.error || "WoL packet sent",
    };
  }

  getDeploymentHistory(targetId?: string, limit: number = 10): DeploymentHistory[] {
    let history = this.deploymentHistory;
    
    if (targetId) {
      history = history.filter(d => d.target === targetId);
    }
    
    return history
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  isDeploying(targetId: string): boolean {
    return this.activeDeployments.get(targetId) || false;
  }
}

export const localDeployManager = new LocalDeployManager();
