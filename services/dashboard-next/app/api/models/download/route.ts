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

export interface DownloadRequest {
  url: string;
  type: "checkpoint" | "lora" | "vae" | "embedding" | "controlnet";
  filename?: string;
  subfolder?: string;
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: DownloadRequest = await request.json();

    if (!body.url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    if (!body.type) {
      return NextResponse.json({ error: "Model type is required" }, { status: 400 });
    }

    const validTypes = ["checkpoint", "lora", "vae", "embedding", "controlnet"];
    if (!validTypes.includes(body.type)) {
      return NextResponse.json(
        { error: `Invalid model type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`${WINDOWS_AGENT_URL}/models/download`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        url: body.url,
        type: body.type,
        filename: body.filename,
        subfolder: body.subfolder,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      return NextResponse.json(
        { error: "Failed to queue download", details: errorData.error || errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      downloadId: data.download_id || data.downloadId || data.id,
      message: data.message || "Download queued successfully",
      status: data.status || "pending",
    });
  } catch (error: any) {
    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Request to Windows agent timed out" },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: "Failed to queue download", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${WINDOWS_AGENT_URL}/models/downloads`, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to fetch downloads", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      downloads: data.downloads || [],
      activeCount: data.active_count || data.activeCount || 0,
    });
  } catch (error: any) {
    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Connection to Windows agent timed out" },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch downloads", details: error.message },
      { status: 502 }
    );
  }
}
