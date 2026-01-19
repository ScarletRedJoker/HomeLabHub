/**
 * Service Locator - Centralized service discovery and agent configuration
 * Provides ONE place for service discovery logic used across health-monitor, ai-orchestrator, command-center, etc.
 */

import { discoverService } from "./service-registry";

export type DeploymentTarget = "windows-vm" | "linode" | "ubuntu-home";
export type ServiceType = "ollama" | "stable-diffusion" | "comfyui" | "whisper" | "agent";

export interface AgentConfig {
  host: string;
  port: number;
  token: string | undefined;
  getAuthHeaders(): Record<string, string>;
}

export interface ConnectionTestResult {
  reachable: boolean;
  authValid: boolean;
  error?: string;
}

const DEPLOYMENT_CONFIGS: Record<DeploymentTarget, { name: string; host: string; port: number }> = {
  "windows-vm": {
    name: "Windows AI VM",
    host: process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102",
    port: parseInt(process.env.WINDOWS_AGENT_PORT || "9765", 10),
  },
  "linode": {
    name: "Linode Production",
    host: process.env.LINODE_SSH_HOST || "linode.evindrake.net",
    port: 22,
  },
  "ubuntu-home": {
    name: "Ubuntu Homelab",
    host: process.env.HOME_SSH_HOST || "host.evindrake.net",
    port: 22,
  },
};

const SERVICE_PORTS: Record<ServiceType, number> = {
  "ollama": 11434,
  "stable-diffusion": 7860,
  "comfyui": 8188,
  "whisper": 8765,
  "agent": 9765,
};

const SERVICE_PATHS: Record<ServiceType, string> = {
  "ollama": "",
  "stable-diffusion": "",
  "comfyui": "",
  "whisper": "",
  "agent": "",
};

function getAgentToken(): string | undefined {
  return process.env.NEBULA_AGENT_TOKEN;
}

function log(message: string, ...args: unknown[]): void {
  console.log(`[ServiceLocator] ${message}`, ...args);
}

function warn(message: string, ...args: unknown[]): void {
  console.warn(`[ServiceLocator] ${message}`, ...args);
}

export function getAgentConfig(target: DeploymentTarget): AgentConfig {
  const config = DEPLOYMENT_CONFIGS[target];
  const token = getAgentToken();

  if (!config) {
    warn(`Unknown deployment target: ${target}, using defaults`);
    return {
      host: "localhost",
      port: 9765,
      token,
      getAuthHeaders(): Record<string, string> {
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    };
  }

  log(`Getting agent config for ${target}: ${config.host}:${config.port}`);

  return {
    host: config.host,
    port: config.port,
    token,
    getAuthHeaders(): Record<string, string> {
      return token ? { Authorization: `Bearer ${token}` } : {};
    },
  };
}

export async function getAgentConfigWithDiscovery(target: DeploymentTarget): Promise<AgentConfig> {
  const staticConfig = getAgentConfig(target);

  try {
    const serviceName = `nebula-agent-${target}`;
    const discovered = await discoverService(serviceName);

    if (discovered && discovered.isHealthy) {
      log(`Using discovered endpoint for ${target}: ${discovered.endpoint}`);
      const url = new URL(discovered.endpoint);
      return {
        host: url.hostname,
        port: parseInt(url.port, 10) || staticConfig.port,
        token: staticConfig.token,
        getAuthHeaders: staticConfig.getAuthHeaders,
      };
    }
  } catch (error) {
    warn(`Service discovery failed for ${target}, using static config:`, error);
  }

  return staticConfig;
}

export function getServiceUrl(
  service: ServiceType,
  target: DeploymentTarget = "windows-vm"
): string {
  const config = DEPLOYMENT_CONFIGS[target];
  const port = SERVICE_PORTS[service];
  const path = SERVICE_PATHS[service];

  if (!config) {
    warn(`Unknown target ${target} for service ${service}`);
    return `http://localhost:${port}${path}`;
  }

  const host = config.host;
  const url = `http://${host}:${port}${path}`;

  log(`Service URL for ${service}@${target}: ${url}`);
  return url;
}

export async function getServiceUrlWithDiscovery(
  service: ServiceType,
  target: DeploymentTarget = "windows-vm"
): Promise<string> {
  try {
    const discovered = await discoverService(service);

    if (discovered && discovered.isHealthy) {
      log(`Using discovered endpoint for ${service}: ${discovered.endpoint}`);
      return discovered.endpoint;
    }
  } catch (error) {
    warn(`Service discovery failed for ${service}, using static config:`, error);
  }

  return getServiceUrl(service, target);
}

export async function testAgentConnection(
  target: DeploymentTarget
): Promise<ConnectionTestResult> {
  const config = getAgentConfig(target);
  const url = `http://${config.host}:${config.port}/health`;

  log(`Testing agent connection for ${target} at ${url}`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...config.getAuthHeaders(),
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        log(`Agent at ${target} reachable but auth failed (${response.status})`);
        return {
          reachable: true,
          authValid: false,
          error: `Authentication failed: HTTP ${response.status}`,
        };
      }

      log(`Agent at ${target} returned error: HTTP ${response.status}`);
      return {
        reachable: true,
        authValid: false,
        error: `HTTP ${response.status}`,
      };
    }

    log(`Agent at ${target} is reachable and authenticated`);
    return {
      reachable: true,
      authValid: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (errorMessage.includes("abort")) {
      warn(`Agent connection to ${target} timed out`);
      return {
        reachable: false,
        authValid: false,
        error: "Connection timed out",
      };
    }

    warn(`Agent connection to ${target} failed:`, errorMessage);
    return {
      reachable: false,
      authValid: false,
      error: errorMessage,
    };
  }
}

export async function testAllAgentConnections(): Promise<Record<DeploymentTarget, ConnectionTestResult>> {
  const targets: DeploymentTarget[] = ["windows-vm", "linode", "ubuntu-home"];
  const results: Record<string, ConnectionTestResult> = {};

  log("Testing all agent connections...");

  await Promise.all(
    targets.map(async (target) => {
      results[target] = await testAgentConnection(target);
    })
  );

  return results as Record<DeploymentTarget, ConnectionTestResult>;
}

export function getDeploymentConfig(target: DeploymentTarget) {
  return DEPLOYMENT_CONFIGS[target];
}

export function getAllDeploymentTargets(): DeploymentTarget[] {
  return Object.keys(DEPLOYMENT_CONFIGS) as DeploymentTarget[];
}

export function getServicePort(service: ServiceType): number {
  return SERVICE_PORTS[service];
}

export { DEPLOYMENT_CONFIGS, SERVICE_PORTS };
