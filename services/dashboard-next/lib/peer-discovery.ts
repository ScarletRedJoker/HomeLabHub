/**
 * Peer Discovery - High-level service discovery with caching and fallback
 * Enables auto-discovery of services across environments with graceful degradation
 */

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

type ServiceChangeCallback = (service: PeerService, event: "added" | "updated" | "removed") => void;

const CACHE_TTL = 60000;
const HEALTH_CHECK_TIMEOUT = 5000;
const FALLBACK_ENDPOINTS: Record<string, EndpointConfig[]> = {
  ai: [
    { host: process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102", port: 9765 },
  ],
  ollama: [
    { host: process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102", port: 11434 },
  ],
  "stable-diffusion": [
    { host: process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102", port: 7860 },
  ],
  comfyui: [
    { host: process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102", port: 8188 },
  ],
  wol: [
    { host: process.env.HOME_SSH_HOST || "host.evindrake.net", port: 22 },
  ],
  dashboard: [
    { host: process.env.DASHBOARD_HOST || "localhost", port: 5000 },
  ],
};

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
      console.warn(`[PeerDiscovery] Registry unavailable for ${serviceName}:`, error);
      this.registryAvailable = false;
    }

    if (cached) {
      console.log(`[PeerDiscovery] Using stale cache for ${serviceName}`);
      return cached.service;
    }

    return null;
  }

  async discoverByCapability(capability: string): Promise<PeerService[]> {
    const cached = this.capabilityCache.get(capability);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
      return cached.services;
    }

    try {
      const { discoverByCapability } = await import("./service-registry");
      const services = await discoverByCapability(capability);
      
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
    } catch (error) {
      console.warn(`[PeerDiscovery] Registry unavailable for capability ${capability}:`, error);
      this.registryAvailable = false;
    }

    if (cached) {
      console.log(`[PeerDiscovery] Using stale cache for capability ${capability}`);
      return cached.services;
    }

    return [];
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

    const fallbackEndpoints = FALLBACK_ENDPOINTS[capability];
    if (fallbackEndpoints) {
      for (const config of fallbackEndpoints) {
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

    const envEndpoint = this.getEnvEndpoint(capability);
    if (envEndpoint) {
      return { endpoint: envEndpoint, source: "env" };
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

    const fallback = FALLBACK_ENDPOINTS["wol"]?.[0];
    if (fallback) {
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

    return {
      host: process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102",
      port: parseInt(process.env.WINDOWS_AGENT_PORT || "9765", 10),
    };
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
    const configs = FALLBACK_ENDPOINTS[capability];
    if (!configs?.length) return null;

    const config = configs[0];
    return `${config.protocol || "http"}://${config.host}:${config.port}`;
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
