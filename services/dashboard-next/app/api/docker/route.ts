import { NextRequest, NextResponse } from "next/server";
import Docker from "dockerode";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

export async function GET() {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const containers = await docker.listContainers({ all: true });
    
    const services = await Promise.all(
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
        };
      })
    );

    return NextResponse.json({ services, server: "local" });
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
    const { action, containerId } = await request.json();
    
    if (!containerId || !action) {
      return NextResponse.json({ error: "Missing containerId or action" }, { status: 400 });
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
