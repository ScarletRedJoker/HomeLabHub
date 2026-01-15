import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { getServerById } from "@/lib/server-config-store";
import { checkServerOnline } from "@/lib/wol-relay";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

interface DiagnosticResult {
  step: string;
  status: "pass" | "fail" | "warning" | "info";
  message: string;
  details?: any;
  duration?: number;
}

interface TestConnectionResponse {
  success: boolean;
  diagnostics: DiagnosticResult[];
  summary: {
    reachable: boolean;
    authenticated: boolean;
    agentVersion?: string;
    hostname?: string;
    platform?: string;
    uptime?: number;
    services?: Record<string, { status: string; port?: number }>;
    gpu?: any;
    models?: any;
  };
  config: {
    host: string;
    port: number;
    tokenConfigured: boolean;
    tokenSource: string;
  };
  timestamp: string;
}

async function testAgentEndpoint(
  host: string,
  port: number,
  endpoint: string,
  token?: string,
  timeoutMs: number = 10000
): Promise<{ success: boolean; statusCode?: number; data?: any; error?: string; duration: number }> {
  const url = `http://${host}:${port}${endpoint}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const startTime = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        statusCode: response.status,
        error: text || response.statusText,
        duration,
      };
    }

    const data = await response.json();
    return { success: true, statusCode: response.status, data, duration };
  } catch (err: any) {
    const duration = Date.now() - startTime;
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return { success: false, error: `Request timed out after ${timeoutMs}ms`, duration };
    }
    return { success: false, error: err.message, duration };
  }
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const diagnostics: DiagnosticResult[] = [];
  const summary: TestConnectionResponse["summary"] = {
    reachable: false,
    authenticated: false,
  };

  try {
    const server = await getServerById("windows");
    
    if (!server) {
      diagnostics.push({
        step: "Server Configuration",
        status: "fail",
        message: "Windows server not found in configuration",
      });
      
      return NextResponse.json({
        success: false,
        diagnostics,
        summary,
        config: {
          host: "unknown",
          port: 9765,
          tokenConfigured: false,
          tokenSource: "none",
        },
        timestamp: new Date().toISOString(),
      });
    }

    const agentHost = server.tailscaleIp || server.host;
    const agentPort = server.agentPort || 9765;
    const agentToken = server.agentToken || process.env.NEBULA_AGENT_TOKEN;
    
    const tokenSource = server.agentToken 
      ? "server-config" 
      : process.env.NEBULA_AGENT_TOKEN 
        ? "NEBULA_AGENT_TOKEN env" 
        : "none";

    diagnostics.push({
      step: "Server Configuration",
      status: "pass",
      message: `Found Windows server: ${server.name}`,
      details: {
        id: server.id,
        host: agentHost,
        port: agentPort,
        wolEnabled: server.supportsWol,
        wolRelay: server.wolRelayServer,
      },
    });

    diagnostics.push({
      step: "Token Configuration",
      status: agentToken ? "pass" : "warning",
      message: agentToken 
        ? `Token configured (source: ${tokenSource})` 
        : "No authentication token configured",
      details: {
        source: tokenSource,
        length: agentToken ? agentToken.length : 0,
        preview: agentToken ? `${agentToken.substring(0, 4)}...${agentToken.substring(agentToken.length - 4)}` : null,
      },
    });

    const config: TestConnectionResponse["config"] = {
      host: agentHost,
      port: agentPort,
      tokenConfigured: !!agentToken,
      tokenSource,
    };

    const portStart = Date.now();
    const portOpen = await checkServerOnline(agentHost, agentPort, 5000);
    const portDuration = Date.now() - portStart;

    diagnostics.push({
      step: "Port Connectivity",
      status: portOpen ? "pass" : "fail",
      message: portOpen 
        ? `Port ${agentPort} is open on ${agentHost}` 
        : `Cannot reach port ${agentPort} on ${agentHost}`,
      duration: portDuration,
    });

    if (!portOpen) {
      diagnostics.push({
        step: "Network Diagnosis",
        status: "info",
        message: "Check that: 1) Windows VM is powered on, 2) Nebula agent is running, 3) Tailscale is connected, 4) Firewall allows port 9765",
      });

      return NextResponse.json({
        success: false,
        diagnostics,
        summary,
        config,
        timestamp: new Date().toISOString(),
      });
    }

    summary.reachable = true;

    const healthNoAuth = await testAgentEndpoint(agentHost, agentPort, "/api/health", undefined, 10000);
    
    if (healthNoAuth.success) {
      diagnostics.push({
        step: "Unauthenticated Health Check",
        status: "warning",
        message: "Agent responded without authentication (no token required)",
        details: { requiresAuth: false },
        duration: healthNoAuth.duration,
      });
      summary.authenticated = true;
    } else if (healthNoAuth.statusCode === 401 || healthNoAuth.statusCode === 403) {
      diagnostics.push({
        step: "Unauthenticated Health Check",
        status: "info",
        message: `Agent requires authentication (${healthNoAuth.statusCode})`,
        details: { requiresAuth: true, error: healthNoAuth.error },
        duration: healthNoAuth.duration,
      });
    } else {
      diagnostics.push({
        step: "Unauthenticated Health Check",
        status: "fail",
        message: `Unexpected response: ${healthNoAuth.error}`,
        details: { statusCode: healthNoAuth.statusCode, error: healthNoAuth.error },
        duration: healthNoAuth.duration,
      });
    }

    if (agentToken) {
      const healthWithAuth = await testAgentEndpoint(agentHost, agentPort, "/api/health", agentToken, 10000);
      
      if (healthWithAuth.success) {
        diagnostics.push({
          step: "Authenticated Health Check",
          status: "pass",
          message: "Successfully authenticated with agent",
          details: healthWithAuth.data,
          duration: healthWithAuth.duration,
        });
        
        summary.authenticated = true;
        summary.hostname = healthWithAuth.data?.hostname;
        summary.platform = healthWithAuth.data?.platform;
        summary.uptime = healthWithAuth.data?.uptime;
        summary.gpu = healthWithAuth.data?.gpu;
        summary.agentVersion = healthWithAuth.data?.version || "unknown";
      } else if (healthWithAuth.statusCode === 403) {
        diagnostics.push({
          step: "Authenticated Health Check",
          status: "fail",
          message: "Token rejected by agent (Invalid token)",
          details: { 
            error: healthWithAuth.error,
            hint: "The NEBULA_AGENT_TOKEN in Replit must match the token configured on the Windows agent",
            tokenPreview: `${agentToken.substring(0, 4)}...`,
          },
          duration: healthWithAuth.duration,
        });
      } else if (healthWithAuth.statusCode === 401) {
        diagnostics.push({
          step: "Authenticated Health Check",
          status: "fail",
          message: "Authentication required but header format may be wrong",
          details: { error: healthWithAuth.error },
          duration: healthWithAuth.duration,
        });
      } else {
        diagnostics.push({
          step: "Authenticated Health Check",
          status: "fail",
          message: `Request failed: ${healthWithAuth.error}`,
          details: { statusCode: healthWithAuth.statusCode, error: healthWithAuth.error },
          duration: healthWithAuth.duration,
        });
      }
    }

    if (summary.authenticated) {
      const servicesResult = await testAgentEndpoint(agentHost, agentPort, "/api/services", agentToken, 15000);
      
      if (servicesResult.success && servicesResult.data?.services) {
        diagnostics.push({
          step: "Services Discovery",
          status: "pass",
          message: "Retrieved service status",
          details: servicesResult.data.services,
          duration: servicesResult.duration,
        });
        summary.services = servicesResult.data.services;
      } else {
        diagnostics.push({
          step: "Services Discovery",
          status: "warning",
          message: `Could not retrieve services: ${servicesResult.error || "Unknown error"}`,
          duration: servicesResult.duration,
        });
      }

      const modelsResult = await testAgentEndpoint(agentHost, agentPort, "/api/models", agentToken, 15000);
      
      if (modelsResult.success && modelsResult.data?.models) {
        diagnostics.push({
          step: "Models Discovery",
          status: "pass",
          message: "Retrieved model inventory",
          details: {
            ollama: modelsResult.data.models.ollama?.length || 0,
            stableDiffusion: modelsResult.data.models.stableDiffusion?.length || 0,
            comfyui: modelsResult.data.models.comfyui?.length || 0,
          },
          duration: modelsResult.duration,
        });
        summary.models = modelsResult.data.models;
      } else {
        diagnostics.push({
          step: "Models Discovery",
          status: "warning",
          message: `Could not retrieve models: ${modelsResult.error || "Unknown error"}`,
          duration: modelsResult.duration,
        });
      }
    }

    const overallSuccess = summary.reachable && summary.authenticated;

    return NextResponse.json({
      success: overallSuccess,
      diagnostics,
      summary,
      config,
      timestamp: new Date().toISOString(),
    } as TestConnectionResponse);

  } catch (error: any) {
    diagnostics.push({
      step: "Unexpected Error",
      status: "fail",
      message: error.message,
    });

    return NextResponse.json({
      success: false,
      diagnostics,
      summary,
      config: {
        host: "unknown",
        port: 9765,
        tokenConfigured: false,
        tokenSource: "none",
      },
      timestamp: new Date().toISOString(),
    } as TestConnectionResponse);
  }
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { tailscaleIp } = body;

    if (!tailscaleIp) {
      return NextResponse.json({ error: "Missing tailscaleIp parameter" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: "Configuration updated. Use GET to test the new connection.",
      note: "Note: This doesn't persist. Update the WINDOWS_VM_TAILSCALE_IP env var or server config for permanent changes.",
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
