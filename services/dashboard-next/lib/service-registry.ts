/**
 * Service Registry - PostgreSQL-backed service discovery
 * Enables auto-discovery of Nebula Command services across environments
 */

import { detectEnvironment, type Environment } from "./env-bootstrap";

let db: any = null;
let serviceRegistryTable: any = null;

try {
  const dbModule = require("./db");
  db = dbModule.db;
} catch (error) {
  console.warn("[ServiceRegistry] Database module not available");
}

try {
  const schema = require("./db/platform-schema");
  serviceRegistryTable = schema.serviceRegistry;
} catch (error) {
  console.warn("[ServiceRegistry] Schema module not available");
}

const drizzleORM = (() => {
  try {
    return require("drizzle-orm");
  } catch {
    return { eq: null, and: null, gte: null, desc: null, arrayContains: null };
  }
})();

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
  if (!db || !serviceRegistryTable) {
    console.warn("[ServiceRegistry] Database not available, skipping registration");
    return false;
  }

  const environment = detectEnvironment();
  currentServiceName = name;
  currentEnvironment = environment;

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
    console.error("[ServiceRegistry] Failed to register service:", error);
    return false;
  }
}

export async function unregisterService(name?: string, environment?: string): Promise<boolean> {
  if (!db || !serviceRegistryTable) return false;

  const serviceName = name || currentServiceName;
  const env = environment || currentEnvironment || detectEnvironment();

  if (!serviceName) return false;

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
    stopHeartbeat();
    return true;
  } catch (error) {
    console.error("[ServiceRegistry] Failed to unregister:", error);
    return false;
  }
}

export async function discoverService(name: string): Promise<RegisteredService | null> {
  if (!db || !serviceRegistryTable) return null;

  try {
    const results = await db
      .select()
      .from(serviceRegistryTable)
      .where(drizzleORM.eq(serviceRegistryTable.serviceName, name))
      .orderBy(drizzleORM.desc(serviceRegistryTable.lastHeartbeat))
      .limit(1);

    if (results.length === 0) return null;

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
    console.error("[ServiceRegistry] Failed to discover service:", error);
    return null;
  }
}

export async function discoverByCapability(capability: string): Promise<RegisteredService[]> {
  if (!db || !serviceRegistryTable) return [];

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
    console.error("[ServiceRegistry] Failed to discover by capability:", error);
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
  if (!db || !serviceRegistryTable || !currentServiceName || !currentEnvironment) {
    return false;
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
    console.error("[ServiceRegistry] Heartbeat failed:", error);
    return false;
  }
}

export async function getHealthyPeers(): Promise<RegisteredService[]> {
  if (!db || !serviceRegistryTable) return [];

  try {
    const cutoff = new Date(Date.now() - HEALTH_TIMEOUT);

    const results = await db
      .select()
      .from(serviceRegistryTable)
      .where(drizzleORM.gte(serviceRegistryTable.lastHeartbeat, cutoff));

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
    console.error("[ServiceRegistry] Failed to get healthy peers:", error);
    return [];
  }
}

export async function getAllServices(): Promise<RegisteredService[]> {
  if (!db || !serviceRegistryTable) return [];

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
    console.error("[ServiceRegistry] Failed to get all services:", error);
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
