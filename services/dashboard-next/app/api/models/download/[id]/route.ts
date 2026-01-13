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
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Download ID is required" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${WINDOWS_AGENT_URL}/models/download/${id}`, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: "Download not found" },
          { status: 404 }
        );
      }
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to fetch download status", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      id: data.id || id,
      url: data.url,
      filename: data.filename,
      type: data.type,
      status: data.status,
      progress: data.progress || 0,
      bytesDownloaded: data.bytes_downloaded || data.bytesDownloaded || 0,
      totalBytes: data.total_bytes || data.totalBytes || 0,
      speed: data.speed,
      eta: data.eta,
      error: data.error,
      startedAt: data.started_at || data.startedAt,
      completedAt: data.completed_at || data.completedAt,
    });
  } catch (error: any) {
    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Connection to Windows agent timed out" },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch download status", details: error.message },
      { status: 502 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Download ID is required" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${WINDOWS_AGENT_URL}/models/download/${id}`, {
      method: "DELETE",
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to cancel download", details: errorText },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Download cancelled",
    });
  } catch (error: any) {
    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Connection to Windows agent timed out" },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: "Failed to cancel download", details: error.message },
      { status: 502 }
    );
  }
}
