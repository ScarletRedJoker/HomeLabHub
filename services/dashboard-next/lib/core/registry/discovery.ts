/**
 * Service Discovery - Distributed node discovery and monitoring
 * 
 * Enables discovery of services across distributed nodes with
 * automatic refresh and change notification.
 * 
 * @module core/registry/discovery
 */

import type { IService, ServiceType, ServiceCapability, ServiceHealth } from '../interfaces';

function isBuildTime(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build' ||
         process.argv.some(arg => arg.includes('next') && arg.includes('build')) ||
         (!process.env.DATABASE_URL && process.env.NODE_ENV === 'production');
}

export interface DiscoveryConfig {
  endpoints: string[];
  refreshInterval: number;
  timeout: number;
  retryAttempts?: number;
  retryDelayMs?: number;
}

export interface DiscoveredService {
  id: string;
  name: string;
  type: ServiceType;
  endpoint: string;
  capabilities: ServiceCapability[];
  health: ServiceHealth;
  metadata?: Record<string, unknown>;
  discoveredAt: Date;
  lastSeen: Date;
}

export type ServiceChangeType = 'added' | 'removed' | 'updated' | 'health-changed';

export interface ServiceChange {
  type: ServiceChangeType;
  service: DiscoveredService;
  previousHealth?: ServiceHealth;
  timestamp: Date;
}

export type ServiceChangeCallback = (changes: ServiceChange[]) => void;

const DEFAULT_CONFIG: DiscoveryConfig = {
  endpoints: [],
  refreshInterval: 30000,
  timeout: 10000,
  retryAttempts: 3,
  retryDelayMs: 1000,
};

export class ServiceDiscovery {
  private config: DiscoveryConfig;
  private discoveredServices: Map<string, DiscoveredService> = new Map();
  private listeners: Set<ServiceChangeCallback> = new Set();
  private refreshIntervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config: Partial<DiscoveryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    if (this.config.endpoints.length === 0) {
      this.config.endpoints = this.getDefaultEndpoints();
    }
  }

  private getDefaultEndpoints(): string[] {
    if (isBuildTime()) {
      return [];
    }

    const endpoints: string[] = [];
    
    const envEndpoints = process.env.SERVICE_DISCOVERY_ENDPOINTS;
    if (envEndpoints) {
      endpoints.push(...envEndpoints.split(',').map(e => e.trim()).filter(Boolean));
    }
    
    const windowsVMIP = process.env.WINDOWS_VM_TAILSCALE_IP;
    if (windowsVMIP) {
      const agentPort = process.env.WINDOWS_AGENT_PORT || '9765';
      endpoints.push(`http://${windowsVMIP}:${agentPort}/api/services/discover`);
    }
    
    return endpoints;
  }

  async discoverServices(): Promise<DiscoveredService[]> {
    if (isBuildTime()) {
      return [];
    }

    const allDiscovered: DiscoveredService[] = [];
    const changes: ServiceChange[] = [];
    const previousServices = new Map(this.discoveredServices);

    for (const endpoint of this.config.endpoints) {
      try {
        const services = await this.discoverFromEndpoint(endpoint);
        allDiscovered.push(...services);
      } catch (error) {
        console.error(`[ServiceDiscovery] Failed to discover from ${endpoint}:`, error);
      }
    }

    for (const service of allDiscovered) {
      const previous = previousServices.get(service.id);
      
      if (!previous) {
        changes.push({
          type: 'added',
          service,
          timestamp: new Date(),
        });
      } else if (previous.health.status !== service.health.status) {
        changes.push({
          type: 'health-changed',
          service,
          previousHealth: previous.health,
          timestamp: new Date(),
        });
      }
      
      this.discoveredServices.set(service.id, service);
      previousServices.delete(service.id);
    }

    const previousEntries = Array.from(previousServices.entries());
    for (const [id, service] of previousEntries) {
      changes.push({
        type: 'removed',
        service,
        timestamp: new Date(),
      });
      this.discoveredServices.delete(id);
    }

    if (changes.length > 0) {
      this.notifyListeners(changes);
    }

    return allDiscovered;
  }

  private async discoverFromEndpoint(endpoint: string): Promise<DiscoveredService[]> {
    const retryAttempts = this.config.retryAttempts || 3;
    const retryDelayMs = this.config.retryDelayMs || 1000;

    for (let attempt = 0; attempt < retryAttempts; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'X-Discovery-Client': 'dashboard-next',
          },
          signal: AbortSignal.timeout(this.config.timeout),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const now = new Date();

        if (Array.isArray(data)) {
          return data.map(s => this.normalizeService(s, endpoint, now));
        } else if (data.services && Array.isArray(data.services)) {
          return data.services.map((s: any) => this.normalizeService(s, endpoint, now));
        }

        return [];
      } catch (error) {
        if (attempt < retryAttempts - 1) {
          await this.delay(retryDelayMs * (attempt + 1));
        } else {
          throw error;
        }
      }
    }

    return [];
  }

  private normalizeService(data: any, endpoint: string, timestamp: Date): DiscoveredService {
    return {
      id: data.id || `${endpoint}-${Date.now()}`,
      name: data.name || data.id || 'Unknown Service',
      type: data.type || 'compute',
      endpoint,
      capabilities: data.capabilities || [],
      health: data.health || {
        status: 'offline',
        lastCheck: timestamp,
      },
      metadata: data.metadata,
      discoveredAt: timestamp,
      lastSeen: timestamp,
    };
  }

  async registerLocal(service: IService): Promise<void> {
    if (isBuildTime()) {
      return;
    }

    const registrationPayload = {
      id: service.id,
      name: service.name,
      type: service.type,
      capabilities: service.getCapabilities(),
    };

    for (const endpoint of this.config.endpoints) {
      try {
        const registerUrl = endpoint.replace('/discover', '/register');
        
        const response = await fetch(registerUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Discovery-Client': 'dashboard-next',
          },
          body: JSON.stringify(registrationPayload),
          signal: AbortSignal.timeout(this.config.timeout),
        });

        if (response.ok) {
          console.log(`[ServiceDiscovery] Registered ${service.id} with ${endpoint}`);
        } else {
          console.warn(`[ServiceDiscovery] Failed to register with ${endpoint}: HTTP ${response.status}`);
        }
      } catch (error) {
        console.error(`[ServiceDiscovery] Error registering with ${endpoint}:`, error);
      }
    }
  }

  watchForChanges(callback: ServiceChangeCallback): () => void {
    if (isBuildTime()) {
      return () => {};
    }

    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(changes: ServiceChange[]): void {
    const listenersArray = Array.from(this.listeners);
    for (const listener of listenersArray) {
      try {
        listener(changes);
      } catch (error) {
        console.error('[ServiceDiscovery] Error in change listener:', error);
      }
    }
  }

  startAutoRefresh(): void {
    if (isBuildTime() || this.isRunning) {
      return;
    }

    this.isRunning = true;
    console.log(`[ServiceDiscovery] Starting auto-refresh (interval: ${this.config.refreshInterval}ms)`);

    this.discoverServices().catch(err => {
      console.error('[ServiceDiscovery] Initial discovery failed:', err);
    });

    this.refreshIntervalId = setInterval(async () => {
      try {
        await this.discoverServices();
      } catch (error) {
        console.error('[ServiceDiscovery] Periodic discovery failed:', error);
      }
    }, this.config.refreshInterval);
  }

  stopAutoRefresh(): void {
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }
    this.isRunning = false;
    console.log('[ServiceDiscovery] Stopped auto-refresh');
  }

  getDiscoveredServices(): DiscoveredService[] {
    return Array.from(this.discoveredServices.values());
  }

  getServiceById(id: string): DiscoveredService | undefined {
    return this.discoveredServices.get(id);
  }

  getServicesByType(type: ServiceType): DiscoveredService[] {
    return Array.from(this.discoveredServices.values())
      .filter(s => s.type === type);
  }

  getHealthyServices(): DiscoveredService[] {
    return Array.from(this.discoveredServices.values())
      .filter(s => s.health.status === 'healthy');
  }

  clearCache(): void {
    this.discoveredServices.clear();
  }

  getConfig(): DiscoveryConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<DiscoveryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export function createServiceDiscovery(config?: Partial<DiscoveryConfig>): ServiceDiscovery {
  return new ServiceDiscovery(config);
}
