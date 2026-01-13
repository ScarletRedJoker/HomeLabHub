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

export interface ModelInfo {
  name: string;
  type: "checkpoint" | "lora" | "vae" | "embedding" | "controlnet" | "ollama";
  path: string;
  size: number;
  sizeFormatted: string;
  modifiedAt?: string;
  vramEstimate?: string;
  metadata?: {
    baseModel?: string;
    triggerWords?: string[];
    description?: string;
  };
}

export interface DownloadInfo {
  id: string;
  url: string;
  filename: string;
  type: string;
  status: "pending" | "downloading" | "completed" | "failed";
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  error?: string;
  startedAt?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const modelType = searchParams.get("type");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const url = modelType 
      ? `${WINDOWS_AGENT_URL}/models?type=${modelType}`
      : `${WINDOWS_AGENT_URL}/models`;

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to fetch models from Windows agent", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    const models: ModelInfo[] = (data.models || []).map((m: any) => ({
      name: m.name || m.filename,
      type: m.type || "checkpoint",
      path: m.path,
      size: m.size || 0,
      sizeFormatted: formatBytes(m.size || 0),
      modifiedAt: m.modified_at || m.modifiedAt,
      vramEstimate: m.vram_estimate || m.vramEstimate,
      metadata: m.metadata,
    }));

    return NextResponse.json({
      models,
      count: models.length,
      agentUrl: WINDOWS_AGENT_URL,
      agentStatus: "connected",
    });
  } catch (error: any) {
    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Connection to Windows agent timed out", agentStatus: "timeout" },
        { status: 504 }
      );
    }
    
    return NextResponse.json(
      { 
        error: "Failed to connect to Windows agent", 
        details: error.message,
        agentUrl: WINDOWS_AGENT_URL,
        agentStatus: "offline",
      },
      { status: 502 }
    );
  }
}
