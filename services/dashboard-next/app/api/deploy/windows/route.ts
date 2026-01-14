import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { getServerById } from "@/lib/server-config-store";
import { checkServerOnline, wakeAndWaitForOnline } from "@/lib/wol-relay";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

type DeployAction =
  | "status"
  | "git-pull"
  | "restart-service"
  | "restart-all"
  | "execute"
  | "models"
  | "ollama-pull"
  | "wake";

interface DeployRequest {
  action: DeployAction;
  service?: string;
  command?: string;
  model?: string;
  waitForOnline?: boolean;
}

interface AgentResponse {
  success: boolean;
  output?: string;
  error?: string;
  [key: string]: any;
}

async function callWindowsAgent(
  host: string,
  port: number,
  endpoint: string,
  method: "GET" | "POST" = "GET",
  body?: any,
  token?: string
): Promise<AgentResponse> {
  const url = `http://${host}:${port}${endpoint}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        error: `Agent returned ${response.status}: ${text}`,
      };
    }

    return await response.json();
  } catch (err: any) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return { success: false, error: "Request timed out after 60 seconds" };
    }
    return { success: false, error: `Failed to reach agent: ${err.message}` };
  }
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: DeployRequest = await request.json();
    const { action, service, command, model, waitForOnline = true } = body;

    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    const server = await getServerById("windows");
    if (!server) {
      return NextResponse.json(
        { error: "Windows server not configured" },
        { status: 404 }
      );
    }

    const agentHost = server.tailscaleIp || server.host;
    const agentPort = server.agentPort || 9765;
    const agentToken = server.agentToken || process.env.NEBULA_AGENT_TOKEN;

    if (action === "wake") {
      if (!server.supportsWol || !server.macAddress) {
        return NextResponse.json(
          { error: "WoL not configured for Windows VM" },
          { status: 400 }
        );
      }

      const result = await wakeAndWaitForOnline({
        macAddress: server.macAddress,
        broadcastAddress: server.broadcastAddress,
        relayServerId: server.wolRelayServer,
        targetHost: agentHost,
        checkPort: agentPort,
        waitTimeoutMs: waitForOnline ? 180000 : 0,
      });

      return NextResponse.json({
        success: result.success,
        message: result.message,
        online: result.online,
        method: result.method,
      });
    }

    const online = await checkServerOnline(agentHost, agentPort);
    if (!online) {
      return NextResponse.json(
        {
          error: "Windows VM is offline",
          hint: "Use action 'wake' to start the VM first",
        },
        { status: 503 }
      );
    }

    switch (action) {
      case "status": {
        const modelsResponse = await callWindowsAgent(
          agentHost,
          agentPort,
          "/api/models",
          "GET",
          undefined,
          agentToken
        );

        const healthResponse = await callWindowsAgent(
          agentHost,
          agentPort,
          "/api/health",
          "GET",
          undefined,
          agentToken
        );

        return NextResponse.json({
          success: true,
          online: true,
          models: modelsResponse.success ? modelsResponse : null,
          health: healthResponse.success ? healthResponse : null,
        });
      }

      case "git-pull": {
        const response = await callWindowsAgent(
          agentHost,
          agentPort,
          "/api/execute",
          "POST",
          {
            command: `cd ${server.deployPath || "C:\\HomeLabHub"} && git pull`,
          },
          agentToken
        );

        return NextResponse.json({
          success: response.success,
          output: response.output,
          error: response.error,
        });
      }

      case "restart-service": {
        if (!service) {
          return NextResponse.json(
            { error: "Missing service parameter" },
            { status: 400 }
          );
        }

        const serviceCommands: Record<string, string> = {
          ollama: "net stop ollama && net start ollama",
          comfyui: "taskkill /F /IM python.exe /FI \"WINDOWTITLE eq ComfyUI\" & cd C:\\AI\\ComfyUI && start python main.py",
          "stable-diffusion": "taskkill /F /IM python.exe /FI \"WINDOWTITLE eq Stable*\" & cd C:\\AI\\stable-diffusion-webui && start webui.bat",
          sunshine: "net stop sunshine && net start sunshine",
          agent: "cd C:\\HomeLabHub\\agent && pm2 restart nebula-agent",
        };

        const cmd = serviceCommands[service];
        if (!cmd) {
          return NextResponse.json(
            { error: `Unknown service: ${service}` },
            { status: 400 }
          );
        }

        const response = await callWindowsAgent(
          agentHost,
          agentPort,
          "/api/execute",
          "POST",
          { command: cmd },
          agentToken
        );

        return NextResponse.json({
          success: response.success,
          service,
          output: response.output,
          error: response.error,
        });
      }

      case "restart-all": {
        const services = ["ollama", "comfyui", "stable-diffusion", "sunshine"];
        const results: Record<string, any> = {};

        for (const svc of services) {
          const response = await callWindowsAgent(
            agentHost,
            agentPort,
            "/api/execute",
            "POST",
            { command: `net stop ${svc} & net start ${svc}` },
            agentToken
          );
          results[svc] = {
            success: response.success,
            output: response.output,
            error: response.error,
          };
        }

        return NextResponse.json({
          success: true,
          results,
        });
      }

      case "execute": {
        if (!command) {
          return NextResponse.json(
            { error: "Missing command parameter" },
            { status: 400 }
          );
        }

        const response = await callWindowsAgent(
          agentHost,
          agentPort,
          "/api/execute",
          "POST",
          { command },
          agentToken
        );

        return NextResponse.json({
          success: response.success,
          output: response.output,
          error: response.error,
        });
      }

      case "models": {
        const response = await callWindowsAgent(
          agentHost,
          agentPort,
          "/api/models",
          "GET",
          undefined,
          agentToken
        );

        return NextResponse.json(response);
      }

      case "ollama-pull": {
        if (!model) {
          return NextResponse.json(
            { error: "Missing model parameter" },
            { status: 400 }
          );
        }

        const response = await callWindowsAgent(
          agentHost,
          agentPort,
          "/api/execute",
          "POST",
          { command: `ollama pull ${model}` },
          agentToken
        );

        return NextResponse.json({
          success: response.success,
          model,
          output: response.output,
          error: response.error,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error("Windows deploy error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const server = await getServerById("windows");
    if (!server) {
      return NextResponse.json(
        { error: "Windows server not configured" },
        { status: 404 }
      );
    }

    const agentHost = server.tailscaleIp || server.host;
    const agentPort = server.agentPort || 9765;
    const agentToken = server.agentToken || process.env.NEBULA_AGENT_TOKEN;

    const online = await checkServerOnline(agentHost, agentPort);

    if (!online) {
      return NextResponse.json({
        success: true,
        online: false,
        server: {
          id: server.id,
          name: server.name,
          description: server.description,
          host: agentHost,
          port: agentPort,
          supportsWol: server.supportsWol,
          wolRelayServer: server.wolRelayServer,
        },
      });
    }

    const modelsResponse = await callWindowsAgent(
      agentHost,
      agentPort,
      "/api/models",
      "GET",
      undefined,
      agentToken
    );

    return NextResponse.json({
      success: true,
      online: true,
      server: {
        id: server.id,
        name: server.name,
        description: server.description,
        host: agentHost,
        port: agentPort,
        supportsWol: server.supportsWol,
        wolRelayServer: server.wolRelayServer,
      },
      models: modelsResponse.success ? modelsResponse : null,
    });
  } catch (error: any) {
    console.error("Windows deploy status error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
