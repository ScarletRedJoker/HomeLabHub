import { NextRequest, NextResponse } from "next/server";
import Docker from "dockerode";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { Client } from "ssh2";
import { readFileSync, existsSync } from "fs";
import { getDefaultSshKeyPath } from "@/lib/server-config-store";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

interface RemoteServer {
  id: string;
  name: string;
  host: string;
  user: string;
  keyPath: string;
}

const REMOTE_SERVERS: RemoteServer[] = [
  {
    id: "home",
    name: "Home Server",
    host: process.env.HOME_SSH_HOST || "host.evindrake.net",
    user: process.env.HOME_SSH_USER || "evin",
    keyPath: getDefaultSshKeyPath(),
  },
];

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

async function getRemoteContainers(server: RemoteServer): Promise<any[]> {
  return new Promise((resolve) => {
    const keyPath = server.keyPath;
    
    if (!existsSync(keyPath)) {
      console.log(`SSH key not found for ${server.name} at ${keyPath}`);
      resolve([]);
      return;
    }

    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.end();
      resolve([]);
    }, 15000);

    conn.on("ready", () => {
      const dockerCmd = `docker ps -a --format '{{json .}}' 2>/dev/null || echo '[]'`;
      
      conn.exec(dockerCmd, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          console.error(`SSH exec error for ${server.name}:`, err.message);
          resolve([]);
          return;
        }

        let output = "";
        stream.on("data", (data: Buffer) => {
          output += data.toString();
        });

        stream.on("close", () => {
          clearTimeout(timeout);
          conn.end();

          try {
            const containers = output
              .trim()
              .split("\n")
              .filter((line) => line.startsWith("{"))
              .map((line) => {
                const c = JSON.parse(line);
                const state = c.State?.toLowerCase() || "unknown";
                return {
                  id: c.ID?.substring(0, 12) || "unknown",
                  name: c.Names || "unknown",
                  image: c.Image || "unknown",
                  status: state === "running" ? "running" : state === "exited" ? "stopped" : state,
                  state: state,
                  ports: c.Ports || "",
                  uptime: c.Status || "",
                  cpu: 0,
                  memory: 0,
                  created: c.CreatedAt || "",
                  server: server.id,
                  serverName: server.name,
                };
              });
            resolve(containers);
          } catch (parseErr) {
            console.error(`Failed to parse docker output from ${server.name}:`, parseErr);
            resolve([]);
          }
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timeout);
      console.error(`SSH connection error for ${server.name}:`, err.message);
      resolve([]);
    });

    try {
      conn.connect({
        host: server.host,
        port: 22,
        username: server.user,
        privateKey: readFileSync(keyPath),
        readyTimeout: 10000,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      console.error(`SSH connect error for ${server.name}:`, err.message);
      resolve([]);
    }
  });
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serverFilter = request.nextUrl.searchParams.get("server");

  if (process.env.NODE_ENV !== "production") {
    return NextResponse.json({
      services: [],
      server: "development",
      message: "Docker not available in development. Containers will show in production.",
    });
  }

  try {
    const allServices: any[] = [];

    if (!serverFilter || serverFilter === "linode" || serverFilter === "all") {
      const containers = await docker.listContainers({ all: true });
      
      const localServices = await Promise.all(
        containers.map(async (container) => {
          const stats = await docker.getContainer(container.Id).stats({ stream: false }).catch(() => null);
          
          const cpuPercent = stats ? calculateCpuPercent(stats) : 0;
          const memoryMB = stats ? Math.round((stats.memory_stats.usage || 0) / 1024 / 1024) : 0;
          
          const status = container.State === "running" ? "running" 
            : container.State === "exited" ? "stopped" 
            : container.State;
          
          const uptimeSeconds = container.State === "running" && container.Status 
            ? parseUptime(container.Status) 
            : 0;

          return {
            id: container.Id.substring(0, 12),
            name: container.Names[0]?.replace(/^\//, "") || "unknown",
            image: container.Image,
            status,
            state: container.State,
            ports: container.Ports.map(p => `${p.PublicPort || p.PrivatePort}/${p.Type}`).filter(Boolean),
            uptime: formatUptime(uptimeSeconds),
            cpu: Math.round(cpuPercent),
            memory: memoryMB,
            created: new Date(container.Created * 1000).toISOString(),
            server: "linode",
            serverName: "Linode Server",
          };
        })
      );
      allServices.push(...localServices);
    }

    if (!serverFilter || serverFilter === "home" || serverFilter === "all") {
      const remotePromises = REMOTE_SERVERS
        .filter(s => !serverFilter || serverFilter === "all" || s.id === serverFilter)
        .map(getRemoteContainers);
      
      const remoteResults = await Promise.all(remotePromises);
      remoteResults.forEach(containers => allServices.push(...containers));
    }

    return NextResponse.json({ 
      services: allServices, 
      servers: ["linode", ...REMOTE_SERVERS.map(s => s.id)],
    });
  } catch (error: any) {
    console.error("Docker API error:", error);
    return NextResponse.json(
      { error: "Failed to connect to Docker", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { action, containerId, server } = await request.json();
    
    if (!containerId || !action) {
      return NextResponse.json({ error: "Missing containerId or action" }, { status: 400 });
    }

    if (server && server !== "linode") {
      const remoteServer = REMOTE_SERVERS.find(s => s.id === server);
      if (!remoteServer) {
        return NextResponse.json({ error: "Unknown server" }, { status: 400 });
      }
      
      const result = await executeRemoteDockerAction(remoteServer, containerId, action);
      return NextResponse.json(result);
    }

    const container = docker.getContainer(containerId);

    switch (action) {
      case "start":
        await container.start();
        break;
      case "stop":
        await container.stop();
        break;
      case "restart":
        await container.restart();
        break;
      case "logs":
        const logs = await container.logs({
          stdout: true,
          stderr: true,
          tail: 100,
          timestamps: true,
        });
        return NextResponse.json({ logs: logs.toString() });
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ success: true, action, containerId });
  } catch (error: any) {
    console.error("Docker action error:", error);
    return NextResponse.json(
      { error: "Docker action failed", details: error.message },
      { status: 500 }
    );
  }
}

async function executeRemoteDockerAction(server: RemoteServer, containerId: string, action: string): Promise<any> {
  return new Promise((resolve) => {
    const keyPath = server.keyPath;
    
    if (!existsSync(keyPath)) {
      resolve({ error: "SSH key not found", success: false });
      return;
    }

    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.end();
      resolve({ error: "Connection timeout", success: false });
    }, 15000);

    conn.on("ready", () => {
      let cmd = "";
      switch (action) {
        case "start":
          cmd = `docker start ${containerId}`;
          break;
        case "stop":
          cmd = `docker stop ${containerId}`;
          break;
        case "restart":
          cmd = `docker restart ${containerId}`;
          break;
        case "logs":
          cmd = `docker logs --tail 100 --timestamps ${containerId}`;
          break;
        default:
          clearTimeout(timeout);
          conn.end();
          resolve({ error: "Invalid action", success: false });
          return;
      }
      
      conn.exec(cmd, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          resolve({ error: err.message, success: false });
          return;
        }

        let output = "";
        stream.on("data", (data: Buffer) => {
          output += data.toString();
        });

        stream.on("close", (code: number) => {
          clearTimeout(timeout);
          conn.end();
          
          if (action === "logs") {
            resolve({ logs: output, success: true });
          } else {
            resolve({ success: code === 0, action, containerId, output: output.trim() });
          }
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timeout);
      resolve({ error: err.message, success: false });
    });

    try {
      conn.connect({
        host: server.host,
        port: 22,
        username: server.user,
        privateKey: readFileSync(keyPath),
        readyTimeout: 10000,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      resolve({ error: err.message, success: false });
    }
  });
}

function calculateCpuPercent(stats: any): number {
  if (!stats.cpu_stats || !stats.precpu_stats) return 0;
  
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const cpuCount = stats.cpu_stats.online_cpus || 1;
  
  if (systemDelta > 0 && cpuDelta > 0) {
    return (cpuDelta / systemDelta) * cpuCount * 100;
  }
  return 0;
}

function parseUptime(status: string): number {
  const match = status.match(/Up (\d+) (second|minute|hour|day|week|month)/);
  if (!match) return 0;
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  switch (unit) {
    case "second": return value;
    case "minute": return value * 60;
    case "hour": return value * 3600;
    case "day": return value * 86400;
    case "week": return value * 604800;
    case "month": return value * 2592000;
    default: return 0;
  }
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}
