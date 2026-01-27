import { NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { getAIConfig } from "@/lib/ai/config";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

interface ServiceStatus {
  name: string;
  status: "online" | "offline" | "unknown";
  responseTimeMs?: number;
  error?: string;
}

interface AgentStatus {
  id: string;
  name: string;
  status: "online" | "offline" | "degraded" | "unknown";
  lastChecked: string;
  services: ServiceStatus[];
  gpuAvailable: boolean;
  gpuInfo?: {
    name?: string;
    memoryMb?: number;
    utilization?: number;
    temperature?: number;
  };
}

interface AgentsStatusResponse {
  agents: {
    "windows-vm": AgentStatus;
    linode?: AgentStatus;
    "ubuntu-homelab"?: AgentStatus;
  };
  summary: {
    gpuServicesOnline: boolean;
    availableServices: string[];
    unavailableServices: string[];
  };
  lastUpdated: string;
}

async function checkServiceHealth(
  host: string,
  port: number,
  path: string,
  timeout: number = 3000
): Promise<{ online: boolean; responseTimeMs: number; error?: string }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(`http://${host}:${port}${path}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(process.env.NEBULA_AGENT_TOKEN ? { Authorization: `Bearer ${process.env.NEBULA_AGENT_TOKEN}` } : {}),
      },
    });
    clearTimeout(timeoutId);
    
    return {
      online: response.ok,
      responseTimeMs: Date.now() - start,
    };
  } catch (error) {
    return {
      online: false,
      responseTimeMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

async function checkWindowsVMAgent(): Promise<AgentStatus> {
  const config = getAIConfig();
  const host = config.windowsVM.ip || "localhost";
  const agentPort = config.windowsVM.nebulaAgentPort;
  
  const services: ServiceStatus[] = [];
  let gpuAvailable = false;
  let overallStatus: "online" | "offline" | "degraded" | "unknown" = "unknown";
  
  const [ollamaCheck, sdCheck, comfyCheck, agentCheck] = await Promise.all([
    checkServiceHealth(host, 11434, "/api/tags"),
    checkServiceHealth(host, 7860, "/sdapi/v1/options"),
    checkServiceHealth(host, 8188, "/system_stats"),
    checkServiceHealth(host, agentPort, "/health"),
  ]);
  
  services.push({
    name: "Ollama",
    status: ollamaCheck.online ? "online" : "offline",
    responseTimeMs: ollamaCheck.responseTimeMs,
    error: ollamaCheck.error,
  });
  
  services.push({
    name: "Stable Diffusion",
    status: sdCheck.online ? "online" : "offline",
    responseTimeMs: sdCheck.responseTimeMs,
    error: sdCheck.error,
  });
  
  services.push({
    name: "ComfyUI",
    status: comfyCheck.online ? "online" : "offline",
    responseTimeMs: comfyCheck.responseTimeMs,
    error: comfyCheck.error,
  });
  
  const onlineCount = services.filter(s => s.status === "online").length;
  if (agentCheck.online || onlineCount > 0) {
    if (onlineCount === services.length) {
      overallStatus = "online";
    } else if (onlineCount > 0) {
      overallStatus = "degraded";
    } else {
      overallStatus = "offline";
    }
    gpuAvailable = onlineCount > 0;
  } else {
    overallStatus = "offline";
  }
  
  return {
    id: "windows-vm",
    name: "Windows AI VM",
    status: overallStatus,
    lastChecked: new Date().toISOString(),
    services,
    gpuAvailable,
  };
}

export async function GET() {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const windowsVm = await checkWindowsVMAgent();
    
    const availableServices = windowsVm.services
      .filter(s => s.status === "online")
      .map(s => s.name);
    
    const unavailableServices = windowsVm.services
      .filter(s => s.status !== "online")
      .map(s => s.name);

    const response: AgentsStatusResponse = {
      agents: {
        "windows-vm": windowsVm,
      },
      summary: {
        gpuServicesOnline: windowsVm.gpuAvailable,
        availableServices,
        unavailableServices,
      },
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[AgentsStatus] Error:", error);
    return NextResponse.json({
      agents: {
        "windows-vm": {
          id: "windows-vm",
          name: "Windows AI VM",
          status: "unknown",
          lastChecked: new Date().toISOString(),
          services: [],
          gpuAvailable: false,
        },
      },
      summary: {
        gpuServicesOnline: false,
        availableServices: [],
        unavailableServices: ["Ollama", "Stable Diffusion", "ComfyUI"],
      },
      lastUpdated: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Failed to check agent status",
    });
  }
}
