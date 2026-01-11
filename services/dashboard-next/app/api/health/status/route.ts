import { NextResponse } from "next/server";
import { Pool } from "pg";
import { Client } from "ssh2";
import { readFileSync, existsSync } from "fs";

interface ServiceHealth {
  id: string;
  name: string;
  status: "healthy" | "unhealthy" | "unknown";
  responseTime?: number;
  lastChecked: string;
  uptime?: number;
  details?: string;
  error?: string;
}

interface ServerSystemMetrics {
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  disk: {
    used: string;
    total: string;
    percentage: number;
  };
  network?: {
    bytesIn: string;
    bytesOut: string;
  };
  uptime: string;
  uptimeSeconds: number;
}

interface ServerHealth {
  id: string;
  name: string;
  status: "online" | "offline" | "error";
  lastChecked: string;
  metrics?: ServerSystemMetrics;
  error?: string;
}

interface ServerConfig {
  id: string;
  name: string;
  host: string;
  user: string;
  keyPath: string;
}

const DEFAULT_SSH_KEY_PATH = process.env.SSH_KEY_PATH || 
  (process.env.REPL_ID ? `${process.env.HOME}/.ssh/homelab` : "/root/.ssh/homelab");

const servers: ServerConfig[] = [
  {
    id: "linode",
    name: "Linode Server",
    host: process.env.LINODE_SSH_HOST || "linode.evindrake.net",
    user: process.env.LINODE_SSH_USER || "root",
    keyPath: DEFAULT_SSH_KEY_PATH,
  },
  {
    id: "home",
    name: "Home Server",
    host: process.env.HOME_SSH_HOST || "host.evindrake.net",
    user: process.env.HOME_SSH_USER || "evin",
    keyPath: DEFAULT_SSH_KEY_PATH,
  },
];

const SSH_TIMEOUT = 5000;
const serverHealthCache = new Map<string, { health: ServerHealth; expires: number }>();
const CACHE_TTL = 30000;

async function quickPortCheck(host: string, port: number = 22, timeout: number = 2000): Promise<boolean> {
  const net = await import("net");
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeout);
    
    socket.on("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    
    socket.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    
    socket.connect(port, host);
  });
}

async function getServerSystemMetrics(server: ServerConfig): Promise<ServerHealth> {
  const cached = serverHealthCache.get(server.id);
  if (cached && cached.expires > Date.now()) {
    return cached.health;
  }

  const keyPath = server.keyPath;

  if (!existsSync(keyPath)) {
    const result: ServerHealth = {
      id: server.id,
      name: server.name,
      status: "error",
      lastChecked: new Date().toISOString(),
      error: "SSH key not found",
    };
    serverHealthCache.set(server.id, { health: result, expires: Date.now() + CACHE_TTL });
    return result;
  }

  const isReachable = await quickPortCheck(server.host, 22, 2000);
  if (!isReachable) {
    const result: ServerHealth = {
      id: server.id,
      name: server.name,
      status: "offline",
      lastChecked: new Date().toISOString(),
      error: "Host unreachable",
    };
    serverHealthCache.set(server.id, { health: result, expires: Date.now() + CACHE_TTL });
    return result;
  }

  return new Promise((resolve) => {
    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.end();
      const result: ServerHealth = {
        id: server.id,
        name: server.name,
        status: "offline",
        lastChecked: new Date().toISOString(),
        error: "Connection timeout",
      };
      serverHealthCache.set(server.id, { health: result, expires: Date.now() + CACHE_TTL });
      resolve(result);
    }, SSH_TIMEOUT);

    conn.on("ready", () => {
      const commands = `
        echo "CPU:$(top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1 || echo 0)"
        echo "LOAD:$(cat /proc/loadavg)"
        echo "MEM_USED:$(free -b | grep Mem | awk '{print $3}')"
        echo "MEM_TOTAL:$(free -b | grep Mem | awk '{print $2}')"
        echo "MEM_PCT:$(free | grep Mem | awk '{printf \"%.1f\", $3/$2 * 100}')"
        echo "DISK_USED:$(df -h / | tail -1 | awk '{print $3}')"
        echo "DISK_TOTAL:$(df -h / | tail -1 | awk '{print $2}')"
        echo "DISK_PCT:$(df -h / | tail -1 | awk '{print $5}' | tr -d '%')"
        echo "UPTIME_SECONDS:$(cat /proc/uptime | awk '{print $1}')"
        echo "UPTIME_HUMAN:$(uptime -p | sed 's/up //')"
        echo "NET_RX:$(cat /proc/net/dev | grep -E 'eth0|ens|enp' | head -1 | awk '{print $2}')"
        echo "NET_TX:$(cat /proc/net/dev | grep -E 'eth0|ens|enp' | head -1 | awk '{print $10}')"
      `;

      conn.exec(commands, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          resolve({
            id: server.id,
            name: server.name,
            status: "error",
            lastChecked: new Date().toISOString(),
            error: err.message,
          });
          return;
        }

        let output = "";
        stream.on("data", (data: Buffer) => {
          output += data.toString();
        });

        stream.on("close", () => {
          clearTimeout(timeout);
          conn.end();

          const lines = output.trim().split("\n");
          const data: Record<string, string> = {};

          for (const line of lines) {
            const colonIndex = line.indexOf(":");
            if (colonIndex > 0) {
              const key = line.substring(0, colonIndex).trim();
              const value = line.substring(colonIndex + 1).trim();
              data[key] = value;
            }
          }

          const loadParts = (data.LOAD || "0 0 0").split(" ");

          const formatBytes = (bytes: number): string => {
            if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
            if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
            if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
            return `${bytes} B`;
          };

          const result: ServerHealth = {
            id: server.id,
            name: server.name,
            status: "online",
            lastChecked: new Date().toISOString(),
            metrics: {
              cpu: {
                usage: parseFloat(data.CPU) || 0,
                loadAverage: [
                  parseFloat(loadParts[0]) || 0,
                  parseFloat(loadParts[1]) || 0,
                  parseFloat(loadParts[2]) || 0,
                ],
              },
              memory: {
                used: parseInt(data.MEM_USED) || 0,
                total: parseInt(data.MEM_TOTAL) || 0,
                percentage: parseFloat(data.MEM_PCT) || 0,
              },
              disk: {
                used: data.DISK_USED || "0",
                total: data.DISK_TOTAL || "0",
                percentage: parseInt(data.DISK_PCT) || 0,
              },
              network: {
                bytesIn: formatBytes(parseInt(data.NET_RX) || 0),
                bytesOut: formatBytes(parseInt(data.NET_TX) || 0),
              },
              uptime: data.UPTIME_HUMAN || "Unknown",
              uptimeSeconds: parseFloat(data.UPTIME_SECONDS) || 0,
            },
          };
          serverHealthCache.set(server.id, { health: result, expires: Date.now() + CACHE_TTL });
          resolve(result);
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timeout);
      console.log(`SSH connection error: ${err.message}`);
      const result: ServerHealth = {
        id: server.id,
        name: server.name,
        status: "offline",
        lastChecked: new Date().toISOString(),
        error: err.message,
      };
      serverHealthCache.set(server.id, { health: result, expires: Date.now() + CACHE_TTL });
      resolve(result);
    });

    try {
      conn.connect({
        host: server.host,
        port: 22,
        username: server.user,
        privateKey: readFileSync(keyPath),
        readyTimeout: SSH_TIMEOUT,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      resolve({
        id: server.id,
        name: server.name,
        status: "error",
        lastChecked: new Date().toISOString(),
        error: err.message,
      });
    }
  });
}

async function checkServiceHealth(
  url: string,
  timeout: number = 5000
): Promise<Omit<ServiceHealth, "id" | "name">> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - start;

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      return {
        status: "healthy",
        responseTime,
        lastChecked: new Date().toISOString(),
        details: data.version ? `Version: ${data.version}` : undefined,
      };
    } else {
      return {
        status: "unhealthy",
        responseTime,
        lastChecked: new Date().toISOString(),
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
  } catch (error) {
    return {
      status: "unhealthy",
      responseTime: Date.now() - start,
      lastChecked: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

async function checkDatabaseHealth(): Promise<Omit<ServiceHealth, "id" | "name">> {
  const start = Date.now();
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return {
      status: "unknown",
      lastChecked: new Date().toISOString(),
      details: "DATABASE_URL not configured",
    };
  }

  try {
    const pool = new Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
    });

    const result = await pool.query("SELECT 1 as check");
    await pool.end();

    return {
      status: result.rows[0]?.check === 1 ? "healthy" : "unhealthy",
      responseTime: Date.now() - start,
      lastChecked: new Date().toISOString(),
      details: "PostgreSQL connection successful",
    };
  } catch (error) {
    return {
      status: "unhealthy",
      responseTime: Date.now() - start,
      lastChecked: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Database connection failed",
    };
  }
}

function checkRedisHealth(): Omit<ServiceHealth, "id" | "name"> {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return {
      status: "unknown",
      lastChecked: new Date().toISOString(),
      details: "REDIS_URL not configured",
    };
  }

  return {
    status: "unknown",
    lastChecked: new Date().toISOString(),
    details: "Redis client not installed",
  };
}

function checkDockerHealth(): Omit<ServiceHealth, "id" | "name"> {
  if (process.env.NODE_ENV !== "production") {
    return {
      status: "unknown",
      lastChecked: new Date().toISOString(),
      details: "Docker check only available in production",
    };
  }

  return {
    status: "unknown",
    lastChecked: new Date().toISOString(),
    details: "Docker socket check unavailable",
  };
}

export async function GET() {
  const services: ServiceHealth[] = [];

  services.push({
    id: "dashboard",
    name: "Dashboard",
    status: "healthy",
    responseTime: 0,
    lastChecked: new Date().toISOString(),
    details: "Self-check - always healthy if responding",
    uptime: 100,
  });

  const [discordBot, streamBot, database, serverMetrics] = await Promise.all([
    checkServiceHealth("http://localhost:4000/health"),
    checkServiceHealth("http://localhost:3000/health"),
    checkDatabaseHealth(),
    Promise.all(servers.map(getServerSystemMetrics)),
  ]);

  const redis = checkRedisHealth();
  const docker = checkDockerHealth();

  services.push(
    { id: "discord-bot", name: "Discord Bot", ...discordBot },
    { id: "stream-bot", name: "Stream Bot", ...streamBot },
    { id: "database", name: "PostgreSQL", ...database },
    { id: "redis", name: "Redis Cache", ...redis },
    { id: "docker", name: "Docker Engine", ...docker }
  );

  const healthyCount = services.filter((s) => s.status === "healthy").length;
  const totalCount = services.length;

  return NextResponse.json({
    services,
    servers: serverMetrics,
    summary: {
      healthy: healthyCount,
      total: totalCount,
      serversOnline: serverMetrics.filter((s) => s.status === "online").length,
      serversTotal: serverMetrics.length,
      timestamp: new Date().toISOString(),
    },
  });
}
