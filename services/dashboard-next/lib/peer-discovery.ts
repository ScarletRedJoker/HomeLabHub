/**
 * Peer Discovery - High-level service discovery with caching and fallback
 * Enables auto-discovery of services across environments with graceful degradation
 * 
 * Discovery chain: local registry → remote registry API → cache → environment config → static fallback
 */

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { type Environment, detectEnvironment } from "./env-bootstrap";

export interface PeerService {
  name: string;
  environment: string;
  endpoint: string;
  capabilities: string[];
  healthy: boolean;
  lastSeen: Date;
  metadata?: Record<string, unknown>;
}

interface CacheEntry {
  service: PeerService;
  cachedAt: number;
}

interface EndpointConfig {
  host: string;
  port: number;
  protocol?: "http" | "https";
}

interface PeerConfig {
  discovery?: string;
  endpoint?: string;
  capabilities?: string[];
  vmName?: string;
  macAddress?: string;
  requiresVpn?: boolean;
}

interface EnvironmentConfig {
  environment: string;
  description?: string;
  isProduction?: boolean;
  registryApiUrl?: string;
  services?: string[];
  ports?: Record<string, number>;
  paths?: Record<string, string | Record<string, string>>;
  peers?: Record<string, PeerConfig>;
  capabilities?: string[];
  networking?: Record<string, unknown>;
}

type ServiceChangeCallback = (service: PeerService, event: "added" | "updated" | "removed") => void;

const CACHE_TTL = 60000;
const HEALTH_CHECK_TIMEOUT = 5000;
const REMOTE_REGISTRY_TIMEOUT = 10000;
const DEFAULT_REGISTRY_API_URL = "https://dash.evindrake.net/api/registry";

let environmentConfigCache: { config: EnvironmentConfig | null; loadedAt: number } | null = null;
const ENV_CONFIG_CACHE_TTL = 300000;

function resolveEnvVariables(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    return process.env[varName] || "";
  });
}

async function loadEnvironmentConfig(): Promise<EnvironmentConfig | null> {
  if (environmentConfigCache && Date.now() - environmentConfigCache.loadedAt < ENV_CONFIG_CACHE_TTL) {
    return environmentConfigCache.config;
  }

  const env = detectEnvironment();
  const configPaths = [
    join(process.cwd(), `config/environments/${env}.json`),
    join(process.cwd(), `../../config/environments/${env}.json`),
    `/opt/homelab/NebulaCommand/config/environments/${env}.json`,
    `/opt/nebula/config/environments/${env}.json`,
  ];

  for (const configPath of configPaths) {
    try {
      if (existsSync(configPath)) {
        const content = await readFile(configPath, "utf-8");
        const config = JSON.parse(content) as EnvironmentConfig;
        console.log(`[PeerDiscovery] Loaded environment config from ${configPath}`);
        environmentConfigCache = { config, loadedAt: Date.now() };
        return config;
      }
    } catch (error) {
      console.warn(`[PeerDiscovery] Failed to load config from ${configPath}:`, error);
    }
  }

  console.warn(`[PeerDiscovery] No environment config found for ${env}`);
  environmentConfigCache = { config: null, loadedAt: Date.now() };
  return null;
}

function parseEndpointFromConfig(endpoint: string): EndpointConfig | null {
  const resolved = resolveEnvVariables(endpoint);
  if (!resolved) return null;

  const match = resolved.match(/^(?:(https?):\/\/)?([^:\/]+)(?::(\d+))?/);
  if (!match) return null;

  return {
    protocol: (match[1] as "http" | "https") || "http",
    host: match[2],
    port: match[3] ? parseInt(match[3], 10) : 80,
  };
}

async function getEndpointsFromEnvironmentConfig(capability: string): Promise<EndpointConfig[]> {
  const config = await loadEnvironmentConfig();
  if (!config?.peers) return [];

  const endpoints: EndpointConfig[] = [];

  for (const [peerName, peerConfig] of Object.entries(config.peers)) {
    if (peerConfig.capabilities?.includes(capability) && peerConfig.endpoint) {
      const parsed = parseEndpointFromConfig(peerConfig.endpoint);
      if (parsed) {
        endpoints.push(parsed);
      }
    }
  }

  return endpoints;
}

function getRegistryApiUrl(): string {
  return process.env.NEBULA_REGISTRY_API_URL || 
         process.env.REGISTRY_API_URL || 
         DEFAULT_REGISTRY_API_URL;
}

function getAgentToken(): string | null {
  return process.env.NEBULA_AGENT_TOKEN || null;
}

async function fetchRemoteRegistryDirect(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const baseUrl = getRegistryApiUrl();
  const url = path ? `${baseUrl}${path}` : baseUrl;
  const token = getAgentToken();
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_REGISTRY_TIMEOUT);
  
  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

function parseRemoteServiceToPeer(data: any): PeerService {
  const lastSeen = new Date(data.lastHeartbeat || data.lastSeen || Date.now());
  const HEALTH_TIMEOUT = 90000;
  
  return {
    name: data.serviceName || data.name,
    environment: data.environment || "unknown",
    endpoint: data.endpoint,
    capabilities: data.capabilities || [],
    lastSeen,
    healthy: data.isHealthy !== undefined ? data.isHealthy : (Date.now() - lastSeen.getTime() < HEALTH_TIMEOUT),
    metadata: data.metadata || {},
  };
}

const STATIC_FALLBACK_ENDPOINTS: Record<string, EndpointConfig[]> = {
  ai: [
    { host: "localhost", port: 9765 },
  ],
  ollama: [
    { host: "localhost", port: 11434 },
  ],
  "stable-diffusion": [
    { host: "localhost", port: 7860 },
  ],
  comfyui: [
    { host: "localhost", port: 8188 },
  ],
  wol: [
    { host: "localhost", port: 22 },
  ],
  dashboard: [
    { host: "localhost", port: 5000 },
  ],
};

function getEnvFallbackEndpoints(capability: string): EndpointConfig[] {
  const envHost = process.env.WINDOWS_VM_TAILSCALE_IP;
  const homeHost = process.env.HOME_SSH_HOST;
  const dashHost = process.env.DASHBOARD_HOST;

  switch (capability) {
    case "ai":
      return envHost ? [{ host: envHost, port: 9765 }] : [];
    case "ollama":
      return envHost ? [{ host: envHost, port: 11434 }] : [];
    case "stable-diffusion":
      return envHost ? [{ host: envHost, port: 7860 }] : [];
    case "comfyui":
      return envHost ? [{ host: envHost, port: 8188 }] : [];
    case "wol":
    case "ssh":
    case "ssh-gateway":
      return homeHost ? [{ host: homeHost, port: 22 }] : [];
    case "dashboard":
    case "registry":
      return dashHost ? [{ host: dashHost, port: 5000 }] : [];
    default:
      return [];
  }
}

class PeerDiscovery {
  private cache: Map<string, CacheEntry> = new Map();
  private capabilityCache: Map<string, { services: PeerService[]; cachedAt: number }> = new Map();
  private listeners: ServiceChangeCallback[] = [];
  private registryAvailable: boolean | null = null;
  private lastRegistryCheck: number = 0;

  async discover(serviceName: string): Promise<PeerService | null> {
    const cached = this.cache.get(serviceName);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
      return cached.service;
    }

    try {
      const { discoverService } = await import("./service-registry");
      const service = await discoverService(serviceName);
      
      if (service) {
        const peerService: PeerService = {
          name: service.name,
          environment: service.environment,
          endpoint: service.endpoint,
          capabilities: service.capabilities,
          healthy: service.isHealthy,
          lastSeen: service.lastSeen,
          metadata: service.metadata,
        };
        
        this.cache.set(serviceName, { service: peerService, cachedAt: Date.now() });
        this.registryAvailable = true;
        return peerService;
      }
    } catch (error) {
      console.warn(`[PeerDiscovery] Local registry unavailable for ${serviceName}:`, error);
      this.registryAvailable = false;
    }

    const remoteService = await this.discoverViaRemoteRegistryApi(serviceName);
    if (remoteService) {
      this.cache.set(serviceName, { service: remoteService, cachedAt: Date.now() });
      return remoteService;
    }

    if (cached) {
      console.log(`[PeerDiscovery] Using stale cache for ${serviceName}`);
      return cached.service;
    }

    return null;
  }

  private async discoverViaRemoteRegistryApi(serviceName: string): Promise<PeerService | null> {
    try {
      console.log(`[PeerDiscovery] Trying remote registry API for ${serviceName}`);
      const response = await fetchRemoteRegistryDirect(`?name=${encodeURIComponent(serviceName)}`, {
        method: "GET",
      });

      if (!response.ok) {
        console.warn(`[PeerDiscovery] Remote registry API returned ${response.status}`);
        return null;
      }

      const result = await response.json();
      if (result.success && result.service) {
        console.log(`[PeerDiscovery] Found ${serviceName} via remote registry API`);
        return parseRemoteServiceToPeer(result.service);
      }
      return null;
    } catch (error) {
      console.warn(`[PeerDiscovery] Remote registry API error for ${serviceName}:`, error);
      return null;
    }
  }

  async discoverByCapability(capability: string): Promise<PeerService[]> {
    const cached = this.capabilityCache.get(capability);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
      return cached.services;
    }

    try {
      const { discoverByCapability } = await import("./service-registry");
      const services = await discoverByCapability(capability);
      
      if (services.length > 0) {
        const peerServices: PeerService[] = services.map(s => ({
          name: s.name,
          environment: s.environment,
          endpoint: s.endpoint,
          capabilities: s.capabilities,
          healthy: s.isHealthy,
          lastSeen: s.lastSeen,
          metadata: s.metadata,
        }));
        
        this.capabilityCache.set(capability, { services: peerServices, cachedAt: Date.now() });
        this.registryAvailable = true;
        
        for (const service of peerServices) {
          this.cache.set(service.name, { service, cachedAt: Date.now() });
        }
        
        return peerServices;
      }
    } catch (error) {
      console.warn(`[PeerDiscovery] Local registry unavailable for capability ${capability}:`, error);
      this.registryAvailable = false;
    }

    const remoteServices = await this.discoverByCapabilityViaRemoteApi(capability);
    if (remoteServices.length > 0) {
      this.capabilityCache.set(capability, { services: remoteServices, cachedAt: Date.now() });
      for (const service of remoteServices) {
        this.cache.set(service.name, { service, cachedAt: Date.now() });
      }
      return remoteServices;
    }

    if (cached) {
      console.log(`[PeerDiscovery] Using stale cache for capability ${capability}`);
      return cached.services;
    }

    return [];
  }

  private async discoverByCapabilityViaRemoteApi(capability: string): Promise<PeerService[]> {
    try {
      const response = await fetchRemoteRegistryDirect(`?capability=${encodeURIComponent(capability)}`, {
        method: "GET",
      });

      if (!response.ok) {
        return [];
      }

      // Validate content-type before parsing JSON to avoid errors from HTML error pages
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        return [];
      }

      const result = await response.json();
      if (result.success && Array.isArray(result.services)) {
        return result.services.map(parseRemoteServiceToPeer);
      }
      return [];
    } catch (error) {
      // Silently return empty for remote API errors (expected when remote is unreachable)
      return [];
    }
  }

  async getBestEndpoint(capability: string): Promise<string | null> {
    const services = await this.discoverByCapability(capability);
    
    const healthyServices = services.filter(s => s.healthy);
    if (healthyServices.length > 0) {
      const sorted = healthyServices.sort((a, b) => 
        b.lastSeen.getTime() - a.lastSeen.getTime()
      );
      return sorted[0].endpoint;
    }

    if (services.length > 0) {
      console.log(`[PeerDiscovery] No healthy services for ${capability}, using most recent`);
      const sorted = services.sort((a, b) => 
        b.lastSeen.getTime() - a.lastSeen.getTime()
      );
      return sorted[0].endpoint;
    }

    const fallback = await this.getFallbackEndpoint(capability);
    if (fallback) {
      console.log(`[PeerDiscovery] Using fallback endpoint for ${capability}: ${fallback}`);
      return fallback;
    }

    return null;
  }

  async getEndpointWithFallback(
    capability: string,
    options?: { preferEnvironment?: Environment; healthCheck?: boolean }
  ): Promise<{ endpoint: string; source: "registry" | "cache" | "config" | "env" } | null> {
    const services = await this.discoverByCapability(capability);
    
    let selectedService: PeerService | undefined;
    
    if (options?.preferEnvironment) {
      selectedService = services.find(s => 
        s.environment === options.preferEnvironment && s.healthy
      );
    }
    
    if (!selectedService) {
      selectedService = services.find(s => s.healthy);
    }
    
    if (!selectedService && services.length > 0) {
      selectedService = services[0];
    }
    
    if (selectedService) {
      if (options?.healthCheck) {
        const isHealthy = await this.checkEndpointHealth(selectedService.endpoint);
        if (isHealthy) {
          return { endpoint: selectedService.endpoint, source: "registry" };
        }
      } else {
        return { endpoint: selectedService.endpoint, source: "registry" };
      }
    }

    const cached = this.capabilityCache.get(capability);
    if (cached?.services?.length) {
      for (const svc of cached.services) {
        if (!options?.healthCheck) {
          return { endpoint: svc.endpoint, source: "cache" };
        }
        const isHealthy = await this.checkEndpointHealth(svc.endpoint);
        if (isHealthy) {
          return { endpoint: svc.endpoint, source: "cache" };
        }
      }
    }

    const configEndpoints = await getEndpointsFromEnvironmentConfig(capability);
    if (configEndpoints.length > 0) {
      for (const config of configEndpoints) {
        const endpoint = `${config.protocol || "http"}://${config.host}:${config.port}`;
        if (!options?.healthCheck) {
          return { endpoint, source: "config" };
        }
        const isHealthy = await this.checkEndpointHealth(endpoint);
        if (isHealthy) {
          return { endpoint, source: "config" };
        }
      }
    }

    const envEndpoints = getEnvFallbackEndpoints(capability);
    if (envEndpoints.length > 0) {
      for (const config of envEndpoints) {
        const endpoint = `${config.protocol || "http"}://${config.host}:${config.port}`;
        if (!options?.healthCheck) {
          return { endpoint, source: "env" };
        }
        const isHealthy = await this.checkEndpointHealth(endpoint);
        if (isHealthy) {
          return { endpoint, source: "env" };
        }
      }
    }

    const staticEndpoints = STATIC_FALLBACK_ENDPOINTS[capability];
    if (staticEndpoints) {
      for (const config of staticEndpoints) {
        const endpoint = `${config.protocol || "http"}://${config.host}:${config.port}`;
        return { endpoint, source: "config" };
      }
    }

    return null;
  }

  async discoverAIServices(): Promise<PeerService[]> {
    const aiServices = await this.discoverByCapability("ai");
    const ollamaServices = await this.discoverByCapability("ollama");
    const sdServices = await this.discoverByCapability("stable-diffusion");
    const comfyServices = await this.discoverByCapability("comfyui");

    const all = [...aiServices, ...ollamaServices, ...sdServices, ...comfyServices];
    const unique = new Map<string, PeerService>();
    for (const svc of all) {
      if (!unique.has(svc.name)) {
        unique.set(svc.name, svc);
      }
    }
    
    return Array.from(unique.values());
  }

  async discoverWoLRelayServer(): Promise<PeerService | null> {
    const wolServices = await this.discoverByCapability("wol");
    if (wolServices.length > 0) {
      const healthy = wolServices.filter(s => s.healthy);
      return healthy.length > 0 ? healthy[0] : wolServices[0];
    }

    const configEndpoints = await getEndpointsFromEnvironmentConfig("wol");
    if (configEndpoints.length > 0) {
      const fallback = configEndpoints[0];
      return {
        name: "home",
        environment: "ubuntu-home",
        endpoint: `ssh://${fallback.host}:${fallback.port}`,
        capabilities: ["wol", "ssh", "relay"],
        healthy: true,
        lastSeen: new Date(),
      };
    }

    const envEndpoints = getEnvFallbackEndpoints("wol");
    if (envEndpoints.length > 0) {
      const fallback = envEndpoints[0];
      return {
        name: "home",
        environment: "ubuntu-home",
        endpoint: `ssh://${fallback.host}:${fallback.port}`,
        capabilities: ["wol", "ssh", "relay"],
        healthy: true,
        lastSeen: new Date(),
      };
    }

    return null;
  }

  async getWindowsAgentEndpoint(): Promise<{ host: string; port: number } | null> {
    const result = await this.getEndpointWithFallback("ai", {
      preferEnvironment: "windows-vm",
    });

    if (result) {
      const url = result.endpoint.replace(/^https?:\/\//, "");
      const [host, portStr] = url.split(":");
      return { host, port: portStr ? parseInt(portStr, 10) : 9765 };
    }

    const configEndpoints = await getEndpointsFromEnvironmentConfig("ai");
    if (configEndpoints.length > 0) {
      return { host: configEndpoints[0].host, port: configEndpoints[0].port };
    }

    const envHost = process.env.WINDOWS_VM_TAILSCALE_IP;
    if (envHost) {
      return {
        host: envHost,
        port: parseInt(process.env.WINDOWS_AGENT_PORT || "9765", 10),
      };
    }

    return null;
  }

  onServiceChange(callback: ServiceChangeCallback): () => void {
    this.listeners.push(callback);
    return () => {
      const idx = this.listeners.indexOf(callback);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  notifyChange(service: PeerService, event: "added" | "updated" | "removed"): void {
    for (const listener of this.listeners) {
      try {
        listener(service, event);
      } catch (error) {
        console.error("[PeerDiscovery] Listener error:", error);
      }
    }
  }

  clearCache(): void {
    this.cache.clear();
    this.capabilityCache.clear();
  }

  isRegistryAvailable(): boolean {
    return this.registryAvailable === true;
  }

  private async checkEndpointHealth(endpoint: string): Promise<boolean> {
    try {
      const url = endpoint.includes("://") ? endpoint : `http://${endpoint}`;
      const healthUrl = `${url}/api/health`;
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);
      
      try {
        const response = await fetch(healthUrl, { 
          method: "GET",
          signal: controller.signal,
        });
        clearTimeout(timeout);
        return response.ok;
      } catch {
        clearTimeout(timeout);
        return false;
      }
    } catch {
      return false;
    }
  }

  private async getFallbackEndpoint(capability: string): Promise<string | null> {
    const configEndpoints = await getEndpointsFromEnvironmentConfig(capability);
    if (configEndpoints.length > 0) {
      const config = configEndpoints[0];
      return `${config.protocol || "http"}://${config.host}:${config.port}`;
    }

    const envEndpoints = getEnvFallbackEndpoints(capability);
    if (envEndpoints.length > 0) {
      const config = envEndpoints[0];
      return `${config.protocol || "http"}://${config.host}:${config.port}`;
    }

    const staticConfigs = STATIC_FALLBACK_ENDPOINTS[capability];
    if (staticConfigs?.length) {
      const config = staticConfigs[0];
      return `${config.protocol || "http"}://${config.host}:${config.port}`;
    }

    return null;
  }

  private getEnvEndpoint(capability: string): string | null {
    switch (capability) {
      case "ai":
      case "ollama":
        return process.env.OLLAMA_URL || null;
      case "stable-diffusion":
        return process.env.STABLE_DIFFUSION_URL || null;
      case "comfyui":
        return process.env.COMFYUI_URL || null;
      case "wol":
        return process.env.WOL_RELAY_HOST || null;
      default:
        return null;
    }
  }
}

export const peerDiscovery = new PeerDiscovery();

export async function registerSelfWithCapabilities(
  name: string,
  capabilities: string[],
  port: number,
  metadata: Record<string, unknown> = {}
): Promise<boolean> {
  try {
    const { registerService } = await import("./service-registry");
    const env = detectEnvironment();
    
    let host = "localhost";
    if (process.env.REPLIT_DEV_DOMAIN) {
      host = process.env.REPLIT_DEV_DOMAIN;
    } else if (process.env.TAILSCALE_IP) {
      host = process.env.TAILSCALE_IP;
    } else if (process.env.PUBLIC_HOST) {
      host = process.env.PUBLIC_HOST;
    }
    
    const protocol = process.env.REPLIT_DEV_DOMAIN ? "https" : "http";
    const endpoint = `${protocol}://${host}:${port}`;
    
    const registered = await registerService(name, capabilities, endpoint, {
      ...metadata,
      environment: env,
      startedAt: new Date().toISOString(),
    });
    
    if (registered) {
      console.log(`[PeerDiscovery] Registered ${name} with capabilities: ${capabilities.join(", ")}`);
    }
    
    return registered;
  } catch (error) {
    console.error("[PeerDiscovery] Failed to register service:", error);
    return false;
  }
}

export async function unregisterSelf(): Promise<boolean> {
  try {
    const { unregisterService } = await import("./service-registry");
    return await unregisterService();
  } catch (error) {
    console.error("[PeerDiscovery] Failed to unregister:", error);
    return false;
  }
}

export { PeerDiscovery };
