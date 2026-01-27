import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { getAIConfig } from "@/lib/ai/config";

const config = getAIConfig();
const WINDOWS_VM_IP = config.windowsVM.ip;
const NEBULA_AGENT_URL = config.windowsVM.nebulaAgentUrl;
const SD_WEBUI_URL = config.stableDiffusion.url;
const AGENT_TOKEN = process.env.NEBULA_AGENT_TOKEN || "";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

async function sdDirectFetch(path: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${SD_WEBUI_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response;
  } catch (error: any) {
    clearTimeout(timeout);
    throw error;
  }
}

async function agentFetch(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(AGENT_TOKEN ? { Authorization: `Bearer ${AGENT_TOKEN}` } : {}),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${NEBULA_AGENT_URL}${path}`, {
      ...options,
      headers: { ...headers, ...options.headers },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response;
  } catch (error: any) {
    clearTimeout(timeout);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "models";

  // Try agent first, fall back to direct SD WebUI queries
  try {
    let response;
    let usedDirect = false;

    // Map actions to SD WebUI direct endpoints
    const directEndpoints: Record<string, string> = {
      models: "/sdapi/v1/sd-models",
      status: "/sdapi/v1/options",
      vae: "/sdapi/v1/sd-vae",
      settings: "/sdapi/v1/options",
    };

    // Try agent first
    try {
      switch (action) {
        case "models":
          response = await agentFetch("/api/sd/models");
          break;
        case "status":
          response = await agentFetch("/api/sd/status");
          break;
        case "vae":
          response = await agentFetch("/api/sd/vae");
          break;
        case "settings":
          response = await agentFetch("/api/sd/settings");
          break;
        case "downloads":
          response = await agentFetch("/api/sd/downloads");
          break;
        case "disk":
          response = await agentFetch("/api/sd/disk");
          break;
        default:
          return NextResponse.json({ error: "Invalid action" }, { status: 400 });
      }
    } catch (agentError: any) {
      // Agent failed, try direct SD WebUI for supported actions
      const directPath = directEndpoints[action];
      if (directPath) {
        console.log(`[SD Models API] Agent unavailable, using direct SD WebUI for ${action}`);
        response = await sdDirectFetch(directPath);
        usedDirect = true;
      } else {
        throw agentError;
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Request failed", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Transform direct SD WebUI response to match expected format if needed
    if (usedDirect && action === "models") {
      return NextResponse.json({ 
        models: data,
        source: "direct"
      });
    }
    if (usedDirect && action === "status") {
      return NextResponse.json({
        current_model: data.sd_model_checkpoint || null,
        current_vae: data.sd_vae || "Automatic",
        source: "direct"
      });
    }
    
    return NextResponse.json(data);
  } catch (error: any) {
    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Connection to Windows VM timed out" },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: "Failed to connect to Windows VM", details: error.message },
      { status: 502 }
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, ...params } = body;

    if (!action) {
      return NextResponse.json({ error: "Action is required" }, { status: 400 });
    }

    let response;

    // Try agent first, fall back to direct SD WebUI for supported actions
    const tryAgentFirst = async (agentPath: string, agentBody: any, directPath?: string, directBody?: any) => {
      try {
        return await agentFetch(agentPath, {
          method: "POST",
          body: JSON.stringify(agentBody),
        });
      } catch (agentError: any) {
        if (directPath) {
          console.log(`[SD Models API] Agent unavailable, using direct SD WebUI for ${action}`);
          return await sdDirectFetch(directPath, {
            method: "POST",
            body: JSON.stringify(directBody || agentBody),
          });
        }
        throw agentError;
      }
    };

    switch (action) {
      case "switch-model":
        if (!params.model) {
          return NextResponse.json({ error: "Model name is required" }, { status: 400 });
        }
        response = await tryAgentFirst(
          "/api/sd/switch-model",
          { model: params.model },
          "/sdapi/v1/options",
          { sd_model_checkpoint: params.model }
        );
        break;

      case "switch-vae":
        response = await tryAgentFirst(
          "/api/sd/vae/switch",
          { vae: params.vae },
          "/sdapi/v1/options",
          { sd_vae: params.vae || "Automatic" }
        );
        break;

      case "update-settings":
        response = await tryAgentFirst(
          "/api/sd/settings",
          params.settings || {},
          "/sdapi/v1/options",
          params.settings || {}
        );
        break;

      case "refresh":
        response = await tryAgentFirst(
          "/api/sd/refresh",
          {},
          "/sdapi/v1/refresh-checkpoints",
          {}
        );
        break;

      case "download":
        if (!params.url) {
          return NextResponse.json({ error: "Download URL is required" }, { status: 400 });
        }
        // Download only available through agent
        response = await agentFetch("/api/sd/download", {
          method: "POST",
          body: JSON.stringify({
            url: params.url,
            filename: params.filename,
            type: params.type || "checkpoint",
          }),
        });
        break;

      case "cancel-download":
        if (!params.downloadId) {
          return NextResponse.json({ error: "Download ID is required" }, { status: 400 });
        }
        response = await agentFetch(`/api/sd/downloads/${params.downloadId}`, {
          method: "DELETE",
        });
        break;

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Request failed", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Connection to Windows VM timed out" },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: "Failed to connect to Windows VM", details: error.message },
      { status: 502 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { type, filename } = body;

    if (!type || !filename) {
      return NextResponse.json(
        { error: "Type and filename are required" },
        { status: 400 }
      );
    }

    const response = await agentFetch(`/api/sd/models/${type}/${encodeURIComponent(filename)}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to delete model", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to delete model", details: error.message },
      { status: 500 }
    );
  }
}
