/**
 * Capability Matcher - Match services by capability requirements
 * 
 * Provides intelligent service selection based on required and preferred
 * capabilities, with version-aware matching and scoring.
 * 
 * @module core/registry/capability-matcher
 */

import type { IService, ServiceCapability } from '../interfaces';

export interface CapabilityQuery {
  required: string[];
  preferred?: string[];
  minVersion?: string;
}

export interface CapabilityScore {
  service: IService;
  score: number;
  matchedRequired: string[];
  matchedPreferred: string[];
  missingRequired: string[];
  versionMatch: boolean;
}

function compareVersions(version1: string, version2: string): number {
  const normalize = (v: string) => v.replace(/[^0-9.]/g, '').split('.').map(n => parseInt(n, 10) || 0);
  const v1Parts = normalize(version1);
  const v2Parts = normalize(version2);
  
  const maxLength = Math.max(v1Parts.length, v2Parts.length);
  
  for (let i = 0; i < maxLength; i++) {
    const v1Part = v1Parts[i] || 0;
    const v2Part = v2Parts[i] || 0;
    
    if (v1Part > v2Part) return 1;
    if (v1Part < v2Part) return -1;
  }
  
  return 0;
}

export class CapabilityMatcher {
  private readonly requiredWeight: number;
  private readonly preferredWeight: number;
  private readonly versionWeight: number;

  constructor(options?: {
    requiredWeight?: number;
    preferredWeight?: number;
    versionWeight?: number;
  }) {
    this.requiredWeight = options?.requiredWeight ?? 100;
    this.preferredWeight = options?.preferredWeight ?? 10;
    this.versionWeight = options?.versionWeight ?? 5;
  }

  findBestMatch(query: CapabilityQuery, services: IService[]): IService | null {
    if (services.length === 0) {
      return null;
    }

    const scores = this.scoreAllServices(query, services);
    const validMatches = scores.filter(s => s.missingRequired.length === 0);

    if (validMatches.length === 0) {
      return null;
    }

    validMatches.sort((a, b) => b.score - a.score);
    return validMatches[0].service;
  }

  findAllMatching(query: CapabilityQuery, services: IService[]): IService[] {
    const scores = this.scoreAllServices(query, services);
    
    return scores
      .filter(s => s.missingRequired.length === 0)
      .sort((a, b) => b.score - a.score)
      .map(s => s.service);
  }

  scoreService(service: IService, query: CapabilityQuery): number {
    const result = this.calculateScore(service, query);
    return result.score;
  }

  getDetailedScore(service: IService, query: CapabilityQuery): CapabilityScore {
    return this.calculateScore(service, query);
  }

  private scoreAllServices(query: CapabilityQuery, services: IService[]): CapabilityScore[] {
    return services.map(service => this.calculateScore(service, query));
  }

  private calculateScore(service: IService, query: CapabilityQuery): CapabilityScore {
    const capabilities = service.getCapabilities();
    const capabilityNames = new Set<string>();
    const capabilityFeatures = new Set<string>();
    let highestVersion = '';

    for (const cap of capabilities) {
      capabilityNames.add(cap.name);
      for (const feature of cap.features) {
        capabilityFeatures.add(feature);
      }
      if (!highestVersion || compareVersions(cap.version, highestVersion) > 0) {
        highestVersion = cap.version;
      }
    }

    const matchedRequired: string[] = [];
    const missingRequired: string[] = [];

    for (const required of query.required) {
      if (capabilityNames.has(required) || capabilityFeatures.has(required)) {
        matchedRequired.push(required);
      } else {
        missingRequired.push(required);
      }
    }

    const matchedPreferred: string[] = [];
    const preferred = query.preferred || [];

    for (const pref of preferred) {
      if (capabilityNames.has(pref) || capabilityFeatures.has(pref)) {
        matchedPreferred.push(pref);
      }
    }

    let versionMatch = true;
    if (query.minVersion && highestVersion) {
      versionMatch = compareVersions(highestVersion, query.minVersion) >= 0;
    }

    let score = 0;
    
    if (missingRequired.length === 0) {
      score += matchedRequired.length * this.requiredWeight;
      score += matchedPreferred.length * this.preferredWeight;
      if (versionMatch) {
        score += this.versionWeight;
      }
    }

    return {
      service,
      score,
      matchedRequired,
      matchedPreferred,
      missingRequired,
      versionMatch,
    };
  }

  matchCapability(capability: ServiceCapability, query: CapabilityQuery): boolean {
    const capNames = new Set([capability.name, ...capability.features]);
    
    for (const required of query.required) {
      if (!capNames.has(required)) {
        return false;
      }
    }
    
    if (query.minVersion) {
      if (compareVersions(capability.version, query.minVersion) < 0) {
        return false;
      }
    }
    
    return true;
  }

  findServicesWithAllCapabilities(
    capabilities: string[],
    services: IService[]
  ): IService[] {
    return this.findAllMatching({ required: capabilities }, services);
  }

  findServicesWithAnyCapability(
    capabilities: string[],
    services: IService[]
  ): IService[] {
    return services.filter(service => {
      const serviceCaps = service.getCapabilities();
      const allNames = new Set<string>();
      
      for (const cap of serviceCaps) {
        allNames.add(cap.name);
        for (const feature of cap.features) {
          allNames.add(feature);
        }
      }
      
      return capabilities.some(c => allNames.has(c));
    });
  }

  groupByCapability(services: IService[]): Map<string, IService[]> {
    const groups = new Map<string, IService[]>();
    
    for (const service of services) {
      const capabilities = service.getCapabilities();
      
      for (const cap of capabilities) {
        if (!groups.has(cap.name)) {
          groups.set(cap.name, []);
        }
        groups.get(cap.name)!.push(service);
        
        for (const feature of cap.features) {
          if (!groups.has(feature)) {
            groups.set(feature, []);
          }
          groups.get(feature)!.push(service);
        }
      }
    }
    
    return groups;
  }
}

export const capabilityMatcher = new CapabilityMatcher();
