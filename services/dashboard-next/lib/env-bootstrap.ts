/**
 * Environment Detection and Bootstrap System
 * Auto-configures Nebula Command services based on deployment environment
 */

import { existsSync } from "fs";
import os from "os";

export type Environment = "linode" | "ubuntu-home" | "windows-vm" | "replit";
export type ServiceRole = "dashboard" | "discord-bot" | "stream-bot" | "agent" | "relay";

export interface PeerConfig {
  name: string;
  environment: Environment;
  endpoint: string;
  capabilities: string[];
}

export interface EnvironmentConfig {
  environment: Environment;
  role: ServiceRole;
  isProduction: boolean;
  tailscaleNetwork: boolean;
  sshKeyPath: string | null;
  secretsSource: "env" | "file" | "vault";
  registryUrl: string | null;
  peers: PeerConfig[];
  hostname: string;
  platform: NodeJS.Platform;
}

export interface BootstrapResult {
  ready: boolean;
  environment: Environment;
  role: ServiceRole;
  config: EnvironmentConfig;
  registeredServices: string[];
  discoveredPeers: PeerConfig[];
  errors: string[];
}

const ENV_DETECTION_CACHE: { env: Environment | null; timestamp: number } = {
  env: null,
  timestamp: 0,
};
const CACHE_TTL = 60000;

export function detectEnvironment(): Environment {
  if (ENV_DETECTION_CACHE.env && Date.now() - ENV_DETECTION_CACHE.timestamp < CACHE_TTL) {
    return ENV_DETECTION_CACHE.env;
  }

  let detected: Environment;

  if (process.env.REPL_ID || process.env.REPLIT_DEV_DOMAIN) {
    detected = "replit";
  } else if (process.platform === "win32" || existsSync("C:\\Windows")) {
    detected = "windows-vm";
  } else {
    const hostname = os.hostname().toLowerCase();
    
    if (existsSync("/opt/homelab") || hostname.includes("linode") || hostname.includes("prod")) {
      detected = "linode";
    } else if (
      existsSync("/etc/libvirt") ||
      hostname.includes("ubuntu") ||
      hostname.includes("home") ||
      hostname.includes("server") ||
      existsSync("/home/evin")
    ) {
      detected = "ubuntu-home";
    } else {
      detected = existsSync("/opt/homelab") ? "linode" : "ubuntu-home";
    }
  }

  ENV_DETECTION_CACHE.env = detected;
  ENV_DETECTION_CACHE.timestamp = Date.now();

  console.log(`[EnvBootstrap] Detected environment: ${detected}`);
  return detected;
}

export function detectRole(): ServiceRole {
  const explicitRole = process.env.NEBULA_SERVICE_ROLE as ServiceRole;
  if (explicitRole && ["dashboard", "discord-bot", "stream-bot", "agent", "relay"].includes(explicitRole)) {
    return explicitRole;
  }

  const cwd = process.cwd();
  if (cwd.includes("discord-bot")) return "discord-bot";
  if (cwd.includes("stream-bot")) return "stream-bot";
  if (cwd.includes("dashboard")) return "dashboard";
  if (cwd.includes("agent") || cwd.includes("nebula-agent")) return "agent";

  return "dashboard";
}

function getSSHKeyPath(env: Environment): string | null {
  switch (env) {
    case "linode":
      return "/root/.ssh/homelab";
    case "ubuntu-home":
      return "/home/evin/.ssh/homelab";
    case "windows-vm":
      return "C:\\Users\\evin\\.ssh\\homelab";
    case "replit":
      return process.env.SSH_KEY_PATH || `${process.env.HOME}/.ssh/homelab`;
    default:
      return null;
  }
}

function getSecretsSource(env: Environment): "env" | "file" | "vault" {
  switch (env) {
    case "replit":
      return "env";
    case "linode":
    case "ubuntu-home":
      return existsSync("/opt/homelab/secrets") ? "file" : "env";
    case "windows-vm":
      return "env";
    default:
      return "env";
  }
}

function getTailscaleStatus(env: Environment): boolean {
  switch (env) {
    case "windows-vm":
    case "ubuntu-home":
      return true;
    case "linode":
      return existsSync("/var/run/tailscale/tailscaled.sock");
    case "replit":
      return false;
    default:
      return false;
  }
}

function getRegistryUrl(env: Environment): string | null {
  const explicitUrl = process.env.NEBULA_REGISTRY_URL;
  if (explicitUrl) return explicitUrl;

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) return "database";

  return null;
}

function getDefaultPeers(env: Environment, role: ServiceRole): PeerConfig[] {
  const { getAIConfig } = require("@/lib/ai/config");
  const aiConfig = getAIConfig();
  const windowsAgentEndpoint = aiConfig.windowsVM.nebulaAgentUrl || "http://localhost:9765";
  const peers: PeerConfig[] = [];

  switch (env) {
    case "linode":
      peers.push({
        name: "windows-agent",
        environment: "windows-vm",
        endpoint: windowsAgentEndpoint,
        capabilities: ["ai", "ollama", "comfyui", "stable-diffusion"],
      });
      peers.push({
        name: "ubuntu-home",
        environment: "ubuntu-home",
        endpoint: `ssh://${process.env.HOME_SSH_HOST || "host.evindrake.net"}:22`,
        capabilities: ["plex", "homeassistant", "docker", "kvm"],
      });
      break;

    case "ubuntu-home":
      peers.push({
        name: "windows-vm",
        environment: "windows-vm",
        endpoint: windowsAgentEndpoint,
        capabilities: ["ai", "ollama", "comfyui", "stable-diffusion"],
      });
      peers.push({
        name: "linode",
        environment: "linode",
        endpoint: `https://${process.env.LINODE_SSH_HOST || "linode.evindrake.net"}`,
        capabilities: ["dashboard", "discord-bot", "stream-bot"],
      });
      break;

    case "windows-vm":
      peers.push({
        name: "linode-dashboard",
        environment: "linode",
        endpoint: `https://${process.env.LINODE_SSH_HOST || "linode.evindrake.net"}`,
        capabilities: ["dashboard", "registry"],
      });
      break;

    case "replit":
      if (process.env.WINDOWS_VM_TAILSCALE_IP) {
        peers.push({
          name: "windows-agent",
          environment: "windows-vm",
          endpoint: `http://${process.env.WINDOWS_VM_TAILSCALE_IP}:9765`,
          capabilities: ["ai", "ollama", "comfyui"],
        });
      }
      break;
  }

  return peers;
}

export function getEnvironmentConfig(): EnvironmentConfig {
  const environment = detectEnvironment();
  const role = detectRole();

  return {
    environment,
    role,
    isProduction: environment === "linode" || process.env.NODE_ENV === "production",
    tailscaleNetwork: getTailscaleStatus(environment),
    sshKeyPath: getSSHKeyPath(environment),
    secretsSource: getSecretsSource(environment),
    registryUrl: getRegistryUrl(environment),
    peers: getDefaultPeers(environment, role),
    hostname: os.hostname(),
    platform: process.platform,
  };
}

let serviceRegistry: any = null;

async function loadServiceRegistry() {
  if (!serviceRegistry) {
    try {
      const module = await import("./service-registry");
      serviceRegistry = module;
    } catch (error) {
      console.warn("[EnvBootstrap] Service registry module not available");
      return null;
    }
  }
  return serviceRegistry;
}

export async function bootstrap(): Promise<BootstrapResult> {
  const errors: string[] = [];
  const registeredServices: string[] = [];
  let discoveredPeers: PeerConfig[] = [];

  const config = getEnvironmentConfig();

  console.log(`[EnvBootstrap] Bootstrapping ${config.role} in ${config.environment} environment`);
  console.log(`[EnvBootstrap] Production: ${config.isProduction}, Tailscale: ${config.tailscaleNetwork}`);

  const registry = await loadServiceRegistry();

  if (registry && config.registryUrl === "database") {
    try {
      const endpoint = getServiceEndpoint(config);
      const capabilities = getServiceCapabilities(config.role);

      await registry.registerService(config.role, capabilities, endpoint, {
        environment: config.environment,
        hostname: config.hostname,
        platform: config.platform,
        startedAt: new Date().toISOString(),
      });

      registeredServices.push(config.role);
      console.log(`[EnvBootstrap] Registered service: ${config.role}`);

      const peers = await registry.getHealthyPeers();
      discoveredPeers = peers.map((p: any) => ({
        name: p.serviceName,
        environment: p.environment as Environment,
        endpoint: p.endpoint,
        capabilities: p.capabilities || [],
      }));

      console.log(`[EnvBootstrap] Discovered ${discoveredPeers.length} peer services`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown registry error";
      errors.push(`Registry error: ${errorMsg}`);
      console.warn(`[EnvBootstrap] Registry error: ${errorMsg}`);
      discoveredPeers = config.peers;
    }
  } else {
    discoveredPeers = config.peers;
    console.log(`[EnvBootstrap] Using static peer configuration (${config.peers.length} peers)`);
  }

  return {
    ready: errors.length === 0,
    environment: config.environment,
    role: config.role,
    config,
    registeredServices,
    discoveredPeers,
    errors,
  };
}

function getServiceEndpoint(config: EnvironmentConfig): string {
  const port = process.env.PORT || "5000";
  const domain = process.env.REPLIT_DEV_DOMAIN;

  if (domain) {
    return `https://${domain}`;
  }

  switch (config.environment) {
    case "linode":
      return `https://${process.env.LINODE_SSH_HOST || "linode.evindrake.net"}`;
    case "ubuntu-home":
      return `http://${config.hostname}:${port}`;
    case "windows-vm": {
      const { getAIConfig } = require("@/lib/ai/config");
      const aiConfig = getAIConfig();
      const vmIp = aiConfig.windowsVM.ip || "localhost";
      return `http://${vmIp}:${port}`;
    }
    default:
      return `http://localhost:${port}`;
  }
}

function getServiceCapabilities(role: ServiceRole): string[] {
  switch (role) {
    case "dashboard":
      return ["ui", "api", "registry", "health-monitor", "deploy"];
    case "discord-bot":
      return ["discord", "commands", "music", "moderation"];
    case "stream-bot":
      return ["twitch", "obs", "stream-control", "alerts"];
    case "agent":
      return ["ai", "ollama", "comfyui", "stable-diffusion", "whisper"];
    case "relay":
      return ["proxy", "tunnel", "wol", "ssh-relay"];
    default:
      return [];
  }
}

export function isReplit(): boolean {
  return detectEnvironment() === "replit";
}

export function isProduction(): boolean {
  return getEnvironmentConfig().isProduction;
}

export function getSecretPath(secretName: string): string | null {
  const config = getEnvironmentConfig();

  switch (config.secretsSource) {
    case "file":
      const basePath = config.environment === "windows-vm" 
        ? "C:\\HomeLabHub\\secrets"
        : "/opt/homelab/secrets";
      return `${basePath}/${secretName}`;
    case "env":
      return null;
    case "vault":
      return `vault://secrets/${secretName}`;
    default:
      return null;
  }
}

export function loadSecret(secretName: string): string | null {
  const envValue = process.env[secretName];
  if (envValue) return envValue;

  const config = getEnvironmentConfig();
  if (config.secretsSource === "file") {
    const secretPath = getSecretPath(secretName);
    if (secretPath && existsSync(secretPath)) {
      try {
        const fs = require("fs");
        return fs.readFileSync(secretPath, "utf-8").trim();
      } catch {
        return null;
      }
    }
  }

  return null;
}
