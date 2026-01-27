/**
 * Service Registry and Capability Discovery
 * 
 * This module provides dynamic service registration, capability matching,
 * and distributed service discovery functionality.
 * 
 * @module core/registry
 * 
 * @example
 * // Register a service
 * import { serviceRegistry, capabilityMatcher, ServiceDiscovery } from '@/lib/core/registry';
 * 
 * serviceRegistry.register(myService);
 * 
 * // Find services by capability
 * const aiServices = serviceRegistry.getByCapability('text-generation');
 * 
 * // Use capability matcher for complex queries
 * const bestMatch = capabilityMatcher.findBestMatch(
 *   { required: ['text-generation'], preferred: ['streaming'] },
 *   aiServices
 * );
 * 
 * // Discover remote services
 * const discovery = new ServiceDiscovery({ endpoints: ['http://node1:8080/api/services'] });
 * const services = await discovery.discoverServices();
 */

export {
  ServiceRegistry,
  serviceRegistry,
  type IServiceRegistry,
  type DiscoveryResult,
  type ServiceChange,
  type ServiceChangeType,
  type ServiceChangeCallback,
} from './service-registry';

export {
  CapabilityMatcher,
  capabilityMatcher,
  type CapabilityQuery,
  type CapabilityScore,
} from './capability-matcher';

export {
  ServiceDiscovery,
  createServiceDiscovery,
  type DiscoveryConfig,
  type DiscoveredService,
  type ServiceChange as DiscoveryServiceChange,
  type ServiceChangeType as DiscoveryServiceChangeType,
  type ServiceChangeCallback as DiscoveryServiceChangeCallback,
} from './discovery';
