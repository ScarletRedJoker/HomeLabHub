import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { aiModels, modelDownloads } from "@/lib/db/platform-schema";
import { eq, desc } from "drizzle-orm";

const WINDOWS_AGENT_URL = process.env.WINDOWS_AGENT_URL || "http://100.118.44.102:9765";

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
  metadata?: {
    modelId?: string;
    name?: string;
    source?: string;
    sourceId?: string;
    version?: string;
    checksum?: string;
    thumbnailUrl?: string;
    creator?: string;
    description?: string;
  };
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

    let savedModel = null;
    let downloadRecord = null;

    try {
      if (body.metadata?.name) {
        const [model] = await db.insert(aiModels).values({
          name: body.metadata.name || body.filename || "Unknown Model",
          type: body.type,
          source: (body.metadata.source as "civitai" | "huggingface" | "local") || "local",
          sourceUrl: body.url,
          sourceId: body.metadata.sourceId,
          version: body.metadata.version,
          description: body.metadata.description,
          thumbnailUrl: body.metadata.thumbnailUrl,
          nodeId: "windows-vm",
          status: "downloading",
          creator: body.metadata.creator,
          nsfw: false,
        }).returning();
        savedModel = model;

        const [download] = await db.insert(modelDownloads).values({
          modelId: savedModel.id,
          status: "queued",
          downloadUrl: body.url,
          checksum: body.metadata.checksum,
        }).returning();
        downloadRecord = download;
      }
    } catch (dbError) {
      console.error("Database tracking error:", dbError);
    }

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

    const response = await fetch(`${WINDOWS_AGENT_URL}/api/models/download`, {
      method: "POST",
      headers,
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

      if (savedModel) {
        await db.update(aiModels)
          .set({ status: "error" })
          .where(eq(aiModels.id, savedModel.id));
      }
      if (downloadRecord) {
        await db.update(modelDownloads)
          .set({ status: "failed", error: errorData.error || errorText })
          .where(eq(modelDownloads.id, downloadRecord.id));
      }

      return NextResponse.json(
        { error: "Failed to queue download", details: errorData.error || errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (downloadRecord) {
      await db.update(modelDownloads)
        .set({ status: "downloading", startedAt: new Date() })
        .where(eq(modelDownloads.id, downloadRecord.id));
    }

    return NextResponse.json({
      success: true,
      downloadId: data.download_id || data.downloadId || data.id,
      modelId: savedModel?.id,
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

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
    const agentToken = process.env.NEBULA_AGENT_TOKEN;
    if (agentToken) {
      headers["Authorization"] = `Bearer ${agentToken}`;
    }

    const response = await fetch(`${WINDOWS_AGENT_URL}/api/models/downloads`, {
      signal: controller.signal,
      headers,
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
