/**
 * Service Registry - Dynamic service registration and discovery
 * 
 * Implements the singleton pattern with lazy initialization.
 * Supports remote service discovery via API and event emission for service changes.
 * 
 * @module core/registry/service-registry
 */

import type { IService, ServiceType, ServiceHealth } from '../interfaces';

function isBuildTime(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build' ||
         process.argv.some(arg => arg.includes('next') && arg.includes('build')) ||
         (!process.env.DATABASE_URL && process.env.NODE_ENV === 'production');
}

export interface DiscoveryResult {
  services: IService[];
  timestamp: Date;
  source: 'local' | 'remote' | 'cached';
  errors?: string[];
}

export type ServiceChangeType = 'registered' | 'unregistered' | 'updated' | 'health-changed';

export interface ServiceChange {
  type: ServiceChangeType;
  serviceId: string;
  service?: IService;
  previousHealth?: ServiceHealth;
  currentHealth?: ServiceHealth;
  timestamp: Date;
}

export type ServiceChangeCallback = (change: ServiceChange) => void;

export interface IServiceRegistry {
  register<T extends IService>(service: T): void;
  unregister(serviceId: string): void;
  get<T extends IService>(serviceId: string): T | undefined;
  getByType<T extends IService>(type: ServiceType): T[];
  getByCapability(capability: string): IService[];
  getAll(): IService[];
  discover(): Promise<DiscoveryResult>;
  onServiceChange(callback: ServiceChangeCallback): () => void;
  getHealthStatus(): Promise<Map<string, ServiceHealth>>;
  shutdown(): Promise<void>;
}

export class ServiceRegistry implements IServiceRegistry {
  private static instance: ServiceRegistry | null = null;
  private services: Map<string, IService> = new Map();
  private listeners: Set<ServiceChangeCallback> = new Set();
  private healthCache: Map<string, ServiceHealth> = new Map();
  private discoveryEndpoints: string[] = [];
  private isInitialized = false;

  private constructor() {
    if (isBuildTime()) {
      return;
    }
    this.discoveryEndpoints = this.getDiscoveryEndpoints();
  }

  static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  static resetInstance(): void {
    if (ServiceRegistry.instance) {
      ServiceRegistry.instance.services.clear();
      ServiceRegistry.instance.listeners.clear();
      ServiceRegistry.instance.healthCache.clear();
      ServiceRegistry.instance = null;
    }
  }

  private getDiscoveryEndpoints(): string[] {
    const endpoints: string[] = [];
    
    const envEndpoints = process.env.SERVICE_DISCOVERY_ENDPOINTS;
    if (envEndpoints) {
      endpoints.push(...envEndpoints.split(',').map(e => e.trim()).filter(Boolean));
    }
    
    const windowsVMIP = process.env.WINDOWS_VM_TAILSCALE_IP;
    if (windowsVMIP) {
      const agentPort = process.env.WINDOWS_AGENT_PORT || '9765';
      endpoints.push(`http://${windowsVMIP}:${agentPort}/api/services`);
    }
    
    return endpoints;
  }

  private emit(change: ServiceChange): void {
    const listenersArray = Array.from(this.listeners);
    for (const listener of listenersArray) {
      try {
        listener(change);
      } catch (error) {
        console.error('[ServiceRegistry] Error in change listener:', error);
      }
    }
  }

  register<T extends IService>(service: T): void {
    if (isBuildTime()) {
      return;
    }

    const existing = this.services.get(service.id);
    this.services.set(service.id, service);

    this.emit({
      type: existing ? 'updated' : 'registered',
      serviceId: service.id,
      service,
      timestamp: new Date(),
    });

    console.log(`[ServiceRegistry] ${existing ? 'Updated' : 'Registered'} service: ${service.id} (${service.name})`);
  }

  unregister(serviceId: string): void {
    if (isBuildTime()) {
      return;
    }

    const service = this.services.get(serviceId);
    if (service) {
      this.services.delete(serviceId);
      this.healthCache.delete(serviceId);

      this.emit({
        type: 'unregistered',
        serviceId,
        service,
        timestamp: new Date(),
      });

      console.log(`[ServiceRegistry] Unregistered service: ${serviceId}`);
    }
  }

  get<T extends IService>(serviceId: string): T | undefined {
    if (isBuildTime()) {
      return undefined;
    }
    return this.services.get(serviceId) as T | undefined;
  }

  getByType<T extends IService>(type: ServiceType): T[] {
    if (isBuildTime()) {
      return [];
    }
    return Array.from(this.services.values())
      .filter(s => s.type === type) as T[];
  }

  getByCapability(capability: string): IService[] {
    if (isBuildTime()) {
      return [];
    }
    return Array.from(this.services.values())
      .filter(service => {
        const capabilities = service.getCapabilities();
        return capabilities.some(cap => 
          cap.name === capability || cap.features.includes(capability)
        );
      });
  }

  getAll(): IService[] {
    if (isBuildTime()) {
      return [];
    }
    return Array.from(this.services.values());
  }

  async discover(): Promise<DiscoveryResult> {
    if (isBuildTime()) {
      return {
        services: [],
        timestamp: new Date(),
        source: 'local',
        errors: ['Discovery unavailable during build time'],
      };
    }

    const errors: string[] = [];
    const discoveredServices: IService[] = [];

    const localServices = Array.from(this.services.values());
    discoveredServices.push(...localServices);

    for (const endpoint of this.discoveryEndpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.services)) {
            for (const remoteService of data.services) {
              if (remoteService.id && !this.services.has(remoteService.id)) {
                const proxyService = this.createRemoteServiceProxy(remoteService, endpoint);
                discoveredServices.push(proxyService);
              }
            }
          }
        } else {
          errors.push(`Endpoint ${endpoint} returned ${response.status}`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to discover from ${endpoint}: ${msg}`);
      }
    }

    return {
      services: discoveredServices,
      timestamp: new Date(),
      source: this.discoveryEndpoints.length > 0 ? 'remote' : 'local',
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private createRemoteServiceProxy(serviceData: any, endpoint: string): IService {
    return {
      id: serviceData.id,
      name: serviceData.name || serviceData.id,
      type: serviceData.type || 'compute',
      getCapabilities: () => serviceData.capabilities || [],
      getHealth: async () => {
        try {
          const healthUrl = `${endpoint}/${serviceData.id}/health`;
          const response = await fetch(healthUrl, {
            signal: AbortSignal.timeout(5000),
          });
          if (response.ok) {
            return await response.json();
          }
        } catch (error) {
        }
        return {
          status: 'offline' as const,
          lastCheck: new Date(),
          error: 'Remote service unreachable',
        };
      },
      initialize: async () => {},
      shutdown: async () => {},
    };
  }

  onServiceChange(callback: ServiceChangeCallback): () => void {
    if (isBuildTime()) {
      return () => {};
    }

    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  async getHealthStatus(): Promise<Map<string, ServiceHealth>> {
    if (isBuildTime()) {
      return new Map();
    }

    const healthMap = new Map<string, ServiceHealth>();

    const healthChecks = Array.from(this.services.entries()).map(async ([id, service]) => {
      try {
        const health = await service.getHealth();
        const previousHealth = this.healthCache.get(id);
        
        healthMap.set(id, health);
        this.healthCache.set(id, health);

        if (previousHealth && previousHealth.status !== health.status) {
          this.emit({
            type: 'health-changed',
            serviceId: id,
            service,
            previousHealth,
            currentHealth: health,
            timestamp: new Date(),
          });
        }
      } catch (error) {
        const errorHealth: ServiceHealth = {
          status: 'offline',
          lastCheck: new Date(),
          error: error instanceof Error ? error.message : 'Health check failed',
        };
        healthMap.set(id, errorHealth);
      }
    });

    await Promise.all(healthChecks);
    return healthMap;
  }

  async shutdown(): Promise<void> {
    if (isBuildTime()) {
      return;
    }

    console.log('[ServiceRegistry] Shutting down...');

    const shutdownPromises = Array.from(this.services.values()).map(async service => {
      try {
        await service.shutdown();
        console.log(`[ServiceRegistry] Shut down service: ${service.id}`);
      } catch (error) {
        console.error(`[ServiceRegistry] Error shutting down ${service.id}:`, error);
      }
    });

    await Promise.all(shutdownPromises);
    
    this.services.clear();
    this.listeners.clear();
    this.healthCache.clear();

    console.log('[ServiceRegistry] Shutdown complete');
  }
}

export const serviceRegistry = ServiceRegistry.getInstance();
