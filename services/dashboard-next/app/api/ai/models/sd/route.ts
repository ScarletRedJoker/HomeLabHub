import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
const NEBULA_AGENT_URL = `http://${WINDOWS_VM_IP}:9765`;
const AGENT_TOKEN = process.env.NEBULA_AGENT_TOKEN || "";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

async function agentFetch(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(AGENT_TOKEN ? { Authorization: `Bearer ${AGENT_TOKEN}` } : {}),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

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

  try {
    let response;

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

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Agent request failed", details: errorText },
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

    switch (action) {
      case "switch-model":
        if (!params.model) {
          return NextResponse.json({ error: "Model name is required" }, { status: 400 });
        }
        response = await agentFetch("/api/sd/switch-model", {
          method: "POST",
          body: JSON.stringify({ model: params.model }),
        });
        break;

      case "switch-vae":
        response = await agentFetch("/api/sd/vae/switch", {
          method: "POST",
          body: JSON.stringify({ vae: params.vae }),
        });
        break;

      case "update-settings":
        response = await agentFetch("/api/sd/settings", {
          method: "POST",
          body: JSON.stringify(params.settings || {}),
        });
        break;

      case "refresh":
        response = await agentFetch("/api/sd/refresh", {
          method: "POST",
        });
        break;

      case "download":
        if (!params.url) {
          return NextResponse.json({ error: "Download URL is required" }, { status: 400 });
        }
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
        { error: "Agent request failed", details: errorText },
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
