import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

const WINDOWS_AGENT_URL = process.env.WINDOWS_AGENT_URL || "http://100.118.44.102:8765";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; name: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type, name } = await params;

  if (!type || !name) {
    return NextResponse.json({ error: "Model type and name are required" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
    const agentToken = process.env.NEBULA_AGENT_TOKEN;
    if (agentToken) {
      headers["Authorization"] = `Bearer ${agentToken}`;
    }

    const response = await fetch(
      `${WINDOWS_AGENT_URL}/api/models/${encodeURIComponent(type)}/${encodeURIComponent(name)}`,
      {
        signal: controller.signal,
        headers,
      }
    );
    clearTimeout(timeout);

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: "Model not found" }, { status: 404 });
      }
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to fetch model details", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      name: data.name,
      type: data.type,
      path: data.path,
      size: data.size,
      sizeFormatted: formatBytes(data.size || 0),
      modifiedAt: data.modified_at || data.modifiedAt,
      vramEstimate: data.vram_estimate || data.vramEstimate,
      metadata: data.metadata,
    });
  } catch (error: any) {
    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Connection to Windows agent timed out" },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch model details", details: error.message },
      { status: 502 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; name: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type, name } = await params;

  if (!type || !name) {
    return NextResponse.json({ error: "Model type and name are required" }, { status: 400 });
  }

  const validTypes = ["checkpoint", "lora", "vae", "embedding", "controlnet", "ollama"];
  if (!validTypes.includes(type)) {
    return NextResponse.json(
      { error: `Invalid model type. Must be one of: ${validTypes.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
    const agentToken = process.env.NEBULA_AGENT_TOKEN;
    if (agentToken) {
      headers["Authorization"] = `Bearer ${agentToken}`;
    }

    const response = await fetch(
      `${WINDOWS_AGENT_URL}/api/models/${encodeURIComponent(type)}/${encodeURIComponent(name)}`,
      {
        method: "DELETE",
        signal: controller.signal,
        headers,
      }
    );
    clearTimeout(timeout);

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: "Model not found" }, { status: 404 });
      }
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      return NextResponse.json(
        { error: "Failed to delete model", details: errorData.error || errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      message: data.message || `Model ${name} deleted successfully`,
    });
  } catch (error: any) {
    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Connection to Windows agent timed out" },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: "Failed to delete model", details: error.message },
      { status: 500 }
    );
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
