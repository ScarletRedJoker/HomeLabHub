import { NextResponse } from "next/server";

const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
const AGENT_PORT = 9765;
const OLLAMA_PORT = 11434;
const SD_PORT = 7860;
const COMFYUI_PORT = 8188;

interface ProbeResult {
  endpoint: string;
  status: "online" | "offline" | "error";
  responseTimeMs: number;
  statusCode?: number;
  error?: string;
  data?: unknown;
}

async function probeEndpoint(url: string, timeout = 5000): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: { "Accept": "application/json" }
    });
    clearTimeout(timeoutId);
    
    const responseTime = Date.now() - start;
    let data: unknown = null;
    
    try {
      data = await response.json();
    } catch {
      try {
        data = await response.text();
      } catch {}
    }
    
    return {
      endpoint: url,
      status: response.ok ? "online" : "error",
      responseTimeMs: responseTime,
      statusCode: response.status,
      data: data,
    };
  } catch (error: any) {
    return {
      endpoint: url,
      status: "offline",
      responseTimeMs: Date.now() - start,
      error: error.name === "AbortError" 
        ? `Timeout after ${timeout}ms` 
        : error.message || "Connection failed",
    };
  }
}

export async function GET() {
  const results: Record<string, ProbeResult> = {};
  const diagnostics: string[] = [];
  
  diagnostics.push(`Windows VM Tailscale IP: ${WINDOWS_VM_IP}`);
  diagnostics.push(`Environment: ${process.env.NODE_ENV || "development"}`);
  diagnostics.push(`Running on: ${process.env.HOSTNAME || "unknown"}`);
  
  const probes = await Promise.all([
    probeEndpoint(`http://${WINDOWS_VM_IP}:${AGENT_PORT}/health`),
    probeEndpoint(`http://${WINDOWS_VM_IP}:${OLLAMA_PORT}/api/tags`),
    probeEndpoint(`http://${WINDOWS_VM_IP}:${SD_PORT}/sdapi/v1/options`),
    probeEndpoint(`http://${WINDOWS_VM_IP}:${COMFYUI_PORT}/system_stats`),
  ]);
  
  results["nebula-agent"] = probes[0];
  results["ollama"] = probes[1];
  results["stable-diffusion"] = probes[2];
  results["comfyui"] = probes[3];
  
  const onlineCount = probes.filter(p => p.status === "online").length;
  const allOffline = onlineCount === 0;
  const allOnline = onlineCount === probes.length;
  
  if (allOffline) {
    diagnostics.push("❌ ALL services unreachable - Likely causes:");
    diagnostics.push("  1. Windows VM is powered off or asleep");
    diagnostics.push("  2. Tailscale not connected on Windows VM");
    diagnostics.push("  3. Tailscale IP changed - run 'tailscale status' on Linode to check");
    diagnostics.push("  4. Windows Firewall blocking all ports");
  } else if (results["nebula-agent"].status === "offline") {
    diagnostics.push("⚠️ Nebula Agent offline but other services online:");
    diagnostics.push("  - Run Start-NebulaAgent.ps1 on Windows VM");
    diagnostics.push("  - Or: cd deploy/windows/agent && npm run pm2:start");
    diagnostics.push("  - Check Windows Firewall allows port 9765");
  } else if (allOnline) {
    diagnostics.push("✅ All Windows VM services are online!");
    diagnostics.push("  If dashboard still shows offline, check registry heartbeats");
  }
  
  let registryStatus: any = null;
  try {
    const { getAllServices } = await import("@/lib/service-registry");
    const services = await getAllServices();
    const windowsServices = services.filter(s => 
      s.environment === "windows-vm" || 
      s.name.includes("windows") || 
      s.name.includes("agent")
    );
    
    registryStatus = {
      totalServices: services.length,
      windowsServices: windowsServices.map(s => ({
        name: s.name,
        environment: s.environment,
        isHealthy: s.isHealthy,
        lastSeen: s.lastSeen,
        ageSeconds: Math.round((Date.now() - new Date(s.lastSeen).getTime()) / 1000),
        capabilities: s.capabilities,
      })),
    };
    
    if (windowsServices.length === 0) {
      diagnostics.push("⚠️ No Windows services registered in database");
      diagnostics.push("  - Nebula Agent needs to send heartbeats to registry");
    } else {
      const staleServices = windowsServices.filter(s => 
        (Date.now() - new Date(s.lastSeen).getTime()) > 90000
      );
      if (staleServices.length > 0) {
        diagnostics.push(`⚠️ ${staleServices.length} Windows services have stale heartbeats (>90s)`);
      }
    }
  } catch (error: any) {
    registryStatus = { error: error.message };
  }
  
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    windowsVmIp: WINDOWS_VM_IP,
    summary: {
      onlineServices: onlineCount,
      totalServices: probes.length,
      overallStatus: allOnline ? "online" : allOffline ? "offline" : "degraded",
    },
    probeResults: results,
    registryStatus,
    diagnostics,
    troubleshooting: {
      steps: [
        "1. SSH to Linode: ssh root@linode.evindrake.net",
        "2. Check Tailscale: tailscale status",
        "3. Verify Windows VM IP matches WINDOWS_VM_TAILSCALE_IP env var",
        "4. Test agent: curl http://<windows-ip>:9765/health",
        "5. If agent down, RDP to Windows VM and run: deploy/windows/agent/run.ps1",
        "6. Check Windows Firewall allows ports: 9765, 11434, 7860, 8188",
      ],
    },
  });
}
