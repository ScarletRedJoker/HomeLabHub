/**
 * Service Registry - PostgreSQL-backed service discovery with remote API fallback
 * Enables auto-discovery of Nebula Command services across environments
 * 
 * Discovery chain: local db → remote registry API → cache → config → env vars
 */

import { detectEnvironment, type Environment } from "./env-bootstrap";

let db: any = null;
let serviceRegistryTable: any = null;

try {
  const dbModule = require("./db");
  db = dbModule.db;
} catch (error) {
  console.warn("[ServiceRegistry] Database module not available - will use remote API fallback");
}

try {
  const schema = require("./db/platform-schema");
  serviceRegistryTable = schema.serviceRegistry;
} catch (error) {
  console.warn("[ServiceRegistry] Schema module not available - will use remote API fallback");
}

const drizzleORM = (() => {
  try {
    return require("drizzle-orm");
  } catch {
    return { eq: null, and: null, gte: null, desc: null, arrayContains: null, lt: null };
  }
})();

const DEFAULT_REGISTRY_API_URL = "https://dash.evindrake.net/api/registry";
const REMOTE_API_TIMEOUT = 10000;

export function getRegistryApiUrl(): string {
  return process.env.NEBULA_REGISTRY_API_URL || 
         process.env.REGISTRY_API_URL || 
         DEFAULT_REGISTRY_API_URL;
}

function getAgentToken(): string | null {
  return process.env.NEBULA_AGENT_TOKEN || null;
}

export function isDatabaseAvailable(): boolean {
  return db !== null && serviceRegistryTable !== null && drizzleORM.eq !== null;
}

async function fetchRemoteRegistry(
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
  const timeout = setTimeout(() => controller.abort(), REMOTE_API_TIMEOUT);
  
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

function parseRemoteService(data: any): RegisteredService {
  return {
    name: data.serviceName || data.name,
    environment: (data.environment || "unknown") as Environment,
    endpoint: data.endpoint,
    capabilities: data.capabilities || [],
    lastSeen: new Date(data.lastHeartbeat || data.lastSeen || Date.now()),
    isHealthy: data.isHealthy !== undefined ? data.isHealthy : isServiceHealthy(new Date(data.lastHeartbeat || Date.now())),
    metadata: data.metadata || {},
  };
}

export interface ServiceRegistryEntry {
  id: number;
  serviceName: string;
  environment: string;
  endpoint: string;
  capabilities: string[];
  lastHeartbeat: Date;
  metadata: Record<string, unknown>;
}

export interface RegisteredService {
  name: string;
  environment: Environment;
  endpoint: string;
  capabilities: string[];
  lastSeen: Date;
  isHealthy: boolean;
  metadata?: Record<string, unknown>;
}

const HEARTBEAT_INTERVAL = 30000;
const HEALTH_TIMEOUT = 90000;

let heartbeatTimer: NodeJS.Timeout | null = null;
let currentServiceName: string | null = null;
let currentEnvironment: string | null = null;

export async function registerService(
  name: string,
  capabilities: string[],
  endpoint: string,
  metadata: Record<string, unknown> = {}
): Promise<boolean> {
  const environment = detectEnvironment();
  currentServiceName = name;
  currentEnvironment = environment;

  if (!isDatabaseAvailable()) {
    console.log("[ServiceRegistry] Database not available, trying remote API registration");
    return registerViaRemoteApi(name, capabilities, endpoint, { ...metadata, environment });
  }

  try {
    const existing = await db
      .select()
      .from(serviceRegistryTable)
      .where(
        drizzleORM.and(
          drizzleORM.eq(serviceRegistryTable.serviceName, name),
          drizzleORM.eq(serviceRegistryTable.environment, environment)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(serviceRegistryTable)
        .set({
          endpoint,
          capabilities,
          lastHeartbeat: new Date(),
          metadata,
        })
        .where(drizzleORM.eq(serviceRegistryTable.id, existing[0].id));

      console.log(`[ServiceRegistry] Updated registration for ${name}@${environment}`);
    } else {
      await db.insert(serviceRegistryTable).values({
        serviceName: name,
        environment,
        endpoint,
        capabilities,
        lastHeartbeat: new Date(),
        metadata,
      });

      console.log(`[ServiceRegistry] Registered new service ${name}@${environment}`);
    }

    startHeartbeat();
    return true;
  } catch (error) {
    console.error("[ServiceRegistry] Local registration failed, trying remote API:", error);
    return registerViaRemoteApi(name, capabilities, endpoint, { ...metadata, environment });
  }
}

export async function registerViaRemoteApi(
  name: string,
  capabilities: string[],
  endpoint: string,
  metadata: Record<string, unknown> = {}
): Promise<boolean> {
  try {
    const response = await fetchRemoteRegistry("", {
      method: "POST",
      body: JSON.stringify({
        name,
        capabilities,
        endpoint,
        metadata,
        action: "register",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[ServiceRegistry] Remote API registration failed:", error);
      return false;
    }

    const result = await response.json();
    if (result.success) {
      console.log(`[ServiceRegistry] Registered ${name} via remote API`);
      startRemoteHeartbeat();
    }
    return result.success;
  } catch (error) {
    console.error("[ServiceRegistry] Remote API registration error:", error);
    return false;
  }
}

export async function unregisterService(name?: string, environment?: string): Promise<boolean> {
  const serviceName = name || currentServiceName;
  const env = environment || currentEnvironment || detectEnvironment();

  if (!serviceName) return false;

  stopHeartbeat();

  if (!isDatabaseAvailable()) {
    return unregisterViaRemoteApi(serviceName);
  }

  try {
    await db
      .delete(serviceRegistryTable)
      .where(
        drizzleORM.and(
          drizzleORM.eq(serviceRegistryTable.serviceName, serviceName),
          drizzleORM.eq(serviceRegistryTable.environment, env)
        )
      );

    console.log(`[ServiceRegistry] Unregistered ${serviceName}@${env}`);
    return true;
  } catch (error) {
    console.error("[ServiceRegistry] Local unregister failed, trying remote API:", error);
    return unregisterViaRemoteApi(serviceName);
  }
}

export async function unregisterViaRemoteApi(name: string): Promise<boolean> {
  try {
    const response = await fetchRemoteRegistry("", {
      method: "POST",
      body: JSON.stringify({
        name,
        action: "unregister",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[ServiceRegistry] Remote API unregister failed:", error);
      return false;
    }

    const result = await response.json();
    console.log(`[ServiceRegistry] Unregistered ${name} via remote API`);
    return result.success;
  } catch (error) {
    console.error("[ServiceRegistry] Remote API unregister error:", error);
    return false;
  }
}

export async function discoverService(name: string): Promise<RegisteredService | null> {
  if (!isDatabaseAvailable()) {
    return discoverViaRemoteApi(name);
  }

  try {
    const results = await db
      .select()
      .from(serviceRegistryTable)
      .where(drizzleORM.eq(serviceRegistryTable.serviceName, name))
      .orderBy(drizzleORM.desc(serviceRegistryTable.lastHeartbeat))
      .limit(1);

    if (results.length === 0) {
      return discoverViaRemoteApi(name);
    }

    const entry = results[0];
    return {
      name: entry.serviceName,
      environment: entry.environment as Environment,
      endpoint: entry.endpoint,
      capabilities: entry.capabilities || [],
      lastSeen: entry.lastHeartbeat,
      isHealthy: isServiceHealthy(entry.lastHeartbeat),
      metadata: entry.metadata,
    };
  } catch (error) {
    console.error("[ServiceRegistry] Local discover failed, trying remote API:", error);
    return discoverViaRemoteApi(name);
  }
}

export async function discoverViaRemoteApi(name: string): Promise<RegisteredService | null> {
  try {
    const response = await fetchRemoteRegistry(`?name=${encodeURIComponent(name)}`, {
      method: "GET",
    });

    if (!response.ok) {
      console.warn("[ServiceRegistry] Remote API discover failed:", response.status);
      return null;
    }

    const result = await response.json();
    if (result.success && result.service) {
      return parseRemoteService(result.service);
    }
    return null;
  } catch (error) {
    console.error("[ServiceRegistry] Remote API discover error:", error);
    return null;
  }
}

export async function discoverByCapability(capability: string): Promise<RegisteredService[]> {
  if (!isDatabaseAvailable()) {
    return discoverByCapabilityViaRemoteApi(capability);
  }

  try {
    const cutoff = new Date(Date.now() - HEALTH_TIMEOUT);

    const results = await db
      .select()
      .from(serviceRegistryTable)
      .where(
        drizzleORM.and(
          drizzleORM.gte(serviceRegistryTable.lastHeartbeat, cutoff),
          drizzleORM.arrayContains(serviceRegistryTable.capabilities, [capability])
        )
      );

    if (results.length === 0) {
      return discoverByCapabilityViaRemoteApi(capability);
    }

    return results.map((entry: any) => ({
      name: entry.serviceName,
      environment: entry.environment as Environment,
      endpoint: entry.endpoint,
      capabilities: entry.capabilities || [],
      lastSeen: entry.lastHeartbeat,
      isHealthy: true,
      metadata: entry.metadata,
    }));
  } catch (error) {
    console.error("[ServiceRegistry] Local discover by capability failed, trying remote API:", error);
    return discoverByCapabilityViaRemoteApi(capability);
  }
}

export async function discoverByCapabilityViaRemoteApi(capability: string): Promise<RegisteredService[]> {
  try {
    const response = await fetchRemoteRegistry(`?capability=${encodeURIComponent(capability)}`, {
      method: "GET",
    });

    if (!response.ok) {
      console.warn("[ServiceRegistry] Remote API discover by capability failed:", response.status);
      return [];
    }

    // Validate content-type before parsing JSON to avoid errors from HTML error pages
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      console.warn("[ServiceRegistry] Remote API returned non-JSON response, skipping");
      return [];
    }

    const result = await response.json();
    if (result.success && Array.isArray(result.services)) {
      return result.services.map(parseRemoteService);
    }
    return [];
  } catch (error) {
    // Silently return empty for remote API errors (expected when remote is unreachable)
    return [];
  }
}

export async function discoverByEnvironment(environment: Environment): Promise<RegisteredService[]> {
  if (!db || !serviceRegistryTable) return [];

  try {
    const results = await db
      .select()
      .from(serviceRegistryTable)
      .where(drizzleORM.eq(serviceRegistryTable.environment, environment));

    return results.map((entry: any) => ({
      name: entry.serviceName,
      environment: entry.environment as Environment,
      endpoint: entry.endpoint,
      capabilities: entry.capabilities || [],
      lastSeen: entry.lastHeartbeat,
      isHealthy: isServiceHealthy(entry.lastHeartbeat),
      metadata: entry.metadata,
    }));
  } catch (error) {
    console.error("[ServiceRegistry] Failed to discover by environment:", error);
    return [];
  }
}

export async function heartbeat(): Promise<boolean> {
  if (!currentServiceName) return false;

  if (!isDatabaseAvailable() || !currentEnvironment) {
    return heartbeatViaRemoteApi(currentServiceName);
  }

  try {
    const result = await db
      .update(serviceRegistryTable)
      .set({ lastHeartbeat: new Date() })
      .where(
        drizzleORM.and(
          drizzleORM.eq(serviceRegistryTable.serviceName, currentServiceName),
          drizzleORM.eq(serviceRegistryTable.environment, currentEnvironment)
        )
      );

    return true;
  } catch (error) {
    console.error("[ServiceRegistry] Local heartbeat failed, trying remote:", error);
    return heartbeatViaRemoteApi(currentServiceName);
  }
}

export async function heartbeatViaRemoteApi(name: string): Promise<boolean> {
  try {
    const response = await fetchRemoteRegistry("", {
      method: "POST",
      body: JSON.stringify({
        name,
        action: "heartbeat",
      }),
    });

    if (!response.ok) {
      return false;
    }

    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error("[ServiceRegistry] Remote API heartbeat error:", error);
    return false;
  }
}

export async function getHealthyPeers(): Promise<RegisteredService[]> {
  if (!isDatabaseAvailable()) {
    return getAllServicesViaRemoteApi();
  }

  try {
    const cutoff = new Date(Date.now() - HEALTH_TIMEOUT);

    const results = await db
      .select()
      .from(serviceRegistryTable)
      .where(drizzleORM.gte(serviceRegistryTable.lastHeartbeat, cutoff));

    if (results.length === 0) {
      return getAllServicesViaRemoteApi();
    }

    return results.map((entry: any) => ({
      name: entry.serviceName,
      environment: entry.environment as Environment,
      endpoint: entry.endpoint,
      capabilities: entry.capabilities || [],
      lastSeen: entry.lastHeartbeat,
      isHealthy: true,
      metadata: entry.metadata,
    }));
  } catch (error) {
    console.error("[ServiceRegistry] Local getHealthyPeers failed, trying remote:", error);
    return getAllServicesViaRemoteApi();
  }
}

export async function getAllServices(): Promise<RegisteredService[]> {
  if (!isDatabaseAvailable()) {
    return getAllServicesViaRemoteApi();
  }

  try {
    const results = await db
      .select()
      .from(serviceRegistryTable)
      .orderBy(drizzleORM.desc(serviceRegistryTable.lastHeartbeat));

    return results.map((entry: any) => ({
      name: entry.serviceName,
      environment: entry.environment as Environment,
      endpoint: entry.endpoint,
      capabilities: entry.capabilities || [],
      lastSeen: entry.lastHeartbeat,
      isHealthy: isServiceHealthy(entry.lastHeartbeat),
      metadata: entry.metadata,
    }));
  } catch (error) {
    console.error("[ServiceRegistry] Local getAllServices failed, trying remote:", error);
    return getAllServicesViaRemoteApi();
  }
}

export async function getAllServicesViaRemoteApi(): Promise<RegisteredService[]> {
  try {
    const response = await fetchRemoteRegistry("", {
      method: "GET",
    });

    if (!response.ok) {
      console.warn("[ServiceRegistry] Remote API getAllServices failed:", response.status);
      return [];
    }

    const result = await response.json();
    if (result.success && Array.isArray(result.services)) {
      return result.services.map(parseRemoteService).filter((s: RegisteredService) => s.isHealthy);
    }
    return [];
  } catch (error) {
    console.error("[ServiceRegistry] Remote API getAllServices error:", error);
    return [];
  }
}

export async function pruneStaleServices(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
  if (!db || !serviceRegistryTable) return 0;

  try {
    const cutoff = new Date(Date.now() - maxAgeMs);

    const result = await db
      .delete(serviceRegistryTable)
      .where(drizzleORM.lt(serviceRegistryTable.lastHeartbeat, cutoff));

    console.log(`[ServiceRegistry] Pruned stale services older than ${maxAgeMs}ms`);
    return result.rowCount || 0;
  } catch (error) {
    console.error("[ServiceRegistry] Failed to prune stale services:", error);
    return 0;
  }
}

function isServiceHealthy(lastHeartbeat: Date): boolean {
  return Date.now() - lastHeartbeat.getTime() < HEALTH_TIMEOUT;
}

function startHeartbeat(): void {
  if (heartbeatTimer) return;

  heartbeatTimer = setInterval(async () => {
    await heartbeat();
  }, HEARTBEAT_INTERVAL);

  console.log(`[ServiceRegistry] Started heartbeat (every ${HEARTBEAT_INTERVAL / 1000}s)`);
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    console.log("[ServiceRegistry] Stopped heartbeat");
  }
}

function startRemoteHeartbeat(): void {
  if (heartbeatTimer) return;

  heartbeatTimer = setInterval(async () => {
    if (currentServiceName) {
      await heartbeatViaRemoteApi(currentServiceName);
    }
  }, HEARTBEAT_INTERVAL);

  console.log(`[ServiceRegistry] Started remote heartbeat (every ${HEARTBEAT_INTERVAL / 1000}s)`);
}

export async function registerServiceRemote(
  name: string,
  capabilities: string[],
  endpoint: string,
  metadata: Record<string, unknown> = {}
): Promise<boolean> {
  if (!db || !serviceRegistryTable) {
    console.warn("[ServiceRegistry] Database not available for remote registration");
    return false;
  }

  const environment = (metadata.environment as string) || "unknown";

  try {
    const existing = await db
      .select()
      .from(serviceRegistryTable)
      .where(
        drizzleORM.and(
          drizzleORM.eq(serviceRegistryTable.serviceName, name),
          drizzleORM.eq(serviceRegistryTable.environment, environment)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(serviceRegistryTable)
        .set({
          endpoint,
          capabilities,
          lastHeartbeat: new Date(),
          metadata,
        })
        .where(drizzleORM.eq(serviceRegistryTable.id, existing[0].id));

      console.log(`[ServiceRegistry] Remote update for ${name}@${environment}`);
    } else {
      await db.insert(serviceRegistryTable).values({
        serviceName: name,
        environment,
        endpoint,
        capabilities,
        lastHeartbeat: new Date(),
        metadata,
      });

      console.log(`[ServiceRegistry] Remote registration for ${name}@${environment}`);
    }

    return true;
  } catch (error) {
    console.error("[ServiceRegistry] Remote registration failed:", error);
    return false;
  }
}

export async function sendHeartbeat(name: string): Promise<boolean> {
  if (!db || !serviceRegistryTable || !name) {
    return false;
  }

  try {
    await db
      .update(serviceRegistryTable)
      .set({ lastHeartbeat: new Date() })
      .where(drizzleORM.eq(serviceRegistryTable.serviceName, name));

    return true;
  } catch (error) {
    console.error("[ServiceRegistry] Remote heartbeat failed:", error);
    return false;
  }
}

export async function unregisterServiceByName(name: string): Promise<boolean> {
  if (!db || !serviceRegistryTable || !name) return false;

  try {
    await db
      .delete(serviceRegistryTable)
      .where(drizzleORM.eq(serviceRegistryTable.serviceName, name));

    console.log(`[ServiceRegistry] Unregistered ${name}`);
    return true;
  } catch (error) {
    console.error("[ServiceRegistry] Failed to unregister by name:", error);
    return false;
  }
}

export async function findAIService(): Promise<RegisteredService | null> {
  const aiServices = await discoverByCapability("ai");
  if (aiServices.length === 0) return null;

  const windowsAgent = aiServices.find(s => s.environment === "windows-vm");
  if (windowsAgent) return windowsAgent;

  return aiServices[0];
}

export async function findDashboard(): Promise<RegisteredService | null> {
  return discoverService("dashboard");
}

export async function getServiceHealth(): Promise<{
  totalServices: number;
  healthyServices: number;
  unhealthyServices: number;
  byEnvironment: Record<string, number>;
}> {
  const all = await getAllServices();
  const healthy = all.filter(s => s.isHealthy);

  const byEnvironment: Record<string, number> = {};
  for (const service of all) {
    byEnvironment[service.environment] = (byEnvironment[service.environment] || 0) + 1;
  }

  return {
    totalServices: all.length,
    healthyServices: healthy.length,
    unhealthyServices: all.length - healthy.length,
    byEnvironment,
  };
}

process.on("SIGINT", async () => {
  console.log("[ServiceRegistry] Shutting down...");
  await unregisterService();
  stopHeartbeat();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("[ServiceRegistry] Terminating...");
  await unregisterService();
  stopHeartbeat();
  process.exit(0);
});
