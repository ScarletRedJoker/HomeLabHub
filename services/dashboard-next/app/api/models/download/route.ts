import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { aiModels, modelDownloads } from "@/lib/db/platform-schema";
import { eq, desc, and } from "drizzle-orm";

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
  source?: "civitai" | "huggingface" | "direct";
  resume?: boolean;
  validateChecksum?: boolean;
  autoInstall?: boolean;
  installTarget?: "sd_forge" | "comfyui" | "both";
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
    fileSize?: number;
  };
}

function detectModelType(url: string, filename?: string): string | null {
  const name = filename || url.split("/").pop() || "";
  const lower = name.toLowerCase();
  
  if (lower.includes("lora") || lower.includes("_lora")) return "lora";
  if (lower.includes("vae") || lower.includes("_vae")) return "vae";
  if (lower.includes("embedding") || lower.includes("ti_")) return "embedding";
  if (lower.includes("controlnet") || lower.includes("control_")) return "controlnet";
  if (lower.includes(".safetensors") || lower.includes(".ckpt")) return "checkpoint";
  
  return null;
}

function detectSource(url: string): "civitai" | "huggingface" | "direct" {
  if (url.includes("civitai.com")) return "civitai";
  if (url.includes("huggingface.co")) return "huggingface";
  return "direct";
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

    let modelType = body.type;
    if (!modelType) {
      modelType = detectModelType(body.url, body.filename) as any;
      if (!modelType) {
        return NextResponse.json({ 
          error: "Could not detect model type. Please specify type parameter." 
        }, { status: 400 });
      }
    }

    const validTypes = ["checkpoint", "lora", "vae", "embedding", "controlnet"];
    if (!validTypes.includes(modelType)) {
      return NextResponse.json(
        { error: `Invalid model type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const source = body.source || detectSource(body.url);
    const shouldResume = body.resume !== false;
    const shouldValidateChecksum = body.validateChecksum !== false && !!body.metadata?.checksum;

    let savedModel = null;
    let downloadRecord = null;

    try {
      if (body.metadata?.name) {
        const existingModel = body.metadata.sourceId ? await db
          .select()
          .from(aiModels)
          .where(and(
            eq(aiModels.sourceId, body.metadata.sourceId),
            eq(aiModels.source, body.metadata.source as any || source)
          ))
          .limit(1) : [];

        if (existingModel.length > 0) {
          savedModel = existingModel[0];
          await db.update(aiModels)
            .set({ status: "downloading", updatedAt: new Date() })
            .where(eq(aiModels.id, savedModel.id));
        } else {
          const [model] = await db.insert(aiModels).values({
            name: body.metadata.name || body.filename || "Unknown Model",
            type: modelType,
            source: (body.metadata.source as "civitai" | "huggingface" | "local") || source === "direct" ? "local" : source,
            sourceUrl: body.url,
            sourceId: body.metadata.sourceId,
            version: body.metadata.version,
            description: body.metadata.description,
            thumbnailUrl: body.metadata.thumbnailUrl,
            fileSize: body.metadata.fileSize ? String(body.metadata.fileSize) : null,
            nodeId: "windows-vm",
            status: "downloading",
            creator: body.metadata.creator,
            nsfw: false,
          }).returning();
          savedModel = model;
        }

        const [download] = await db.insert(modelDownloads).values({
          modelId: savedModel.id,
          status: "queued",
          downloadUrl: body.url,
          checksum: body.metadata.checksum,
          totalBytes: body.metadata.fileSize ? String(body.metadata.fileSize) : null,
        }).returning();
        downloadRecord = download;
      }
    } catch (dbError) {
      console.error("Database tracking error:", dbError);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
    const agentToken = process.env.NEBULA_AGENT_TOKEN;
    if (agentToken) {
      headers["Authorization"] = `Bearer ${agentToken}`;
    }

    const downloadPayload: any = {
      url: body.url,
      type: modelType,
      filename: body.filename,
      subfolder: body.subfolder,
      resume: shouldResume,
      source,
    };

    if (shouldValidateChecksum && body.metadata?.checksum) {
      downloadPayload.validateChecksum = true;
      downloadPayload.expectedChecksum = body.metadata.checksum;
      downloadPayload.checksumAlgorithm = "sha256";
    }

    if (body.autoInstall) {
      downloadPayload.autoInstall = true;
      downloadPayload.installTarget = body.installTarget || "sd_forge";
    }

    const response = await fetch(`${WINDOWS_AGENT_URL}/api/models/download`, {
      method: "POST",
      headers,
      body: JSON.stringify(downloadPayload),
      signal: AbortSignal.timeout(30000),
    });

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
      detectedType: modelType,
      source,
      checksumValidation: shouldValidateChecksum,
      resumeEnabled: shouldResume,
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

  const { searchParams } = new URL(request.url);
  const includeHistory = searchParams.get("history") === "true";

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
    const agentToken = process.env.NEBULA_AGENT_TOKEN;
    if (agentToken) {
      headers["Authorization"] = `Bearer ${agentToken}`;
    }

    const response = await fetch(`${WINDOWS_AGENT_URL}/api/models/downloads`, {
      signal: AbortSignal.timeout(10000),
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to fetch downloads", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    let history: any[] = [];
    if (includeHistory) {
      const dbDownloads = await db
        .select()
        .from(modelDownloads)
        .orderBy(desc(modelDownloads.createdAt))
        .limit(50);
      
      history = dbDownloads.map(d => ({
        id: d.id,
        status: d.status,
        url: d.downloadUrl,
        progress: d.progress,
        checksum: d.checksum,
        checksumVerified: d.checksumVerified,
        startedAt: d.startedAt,
        completedAt: d.completedAt,
        error: d.error,
      }));
    }

    return NextResponse.json({
      downloads: (data.downloads || []).map((d: any) => ({
        id: d.id,
        url: d.url,
        filename: d.filename,
        type: d.type,
        status: d.status,
        progress: d.progress || 0,
        bytesDownloaded: d.bytesDownloaded || d.bytes_downloaded || 0,
        totalBytes: d.totalBytes || d.total_bytes || 0,
        speed: d.speed || 0,
        eta: d.eta || 0,
        error: d.error,
        startedAt: d.startedAt || d.started_at,
        checksumStatus: d.checksumStatus,
      })),
      activeCount: data.active_count || data.activeCount || 0,
      history: includeHistory ? history : undefined,
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

export async function PUT(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { downloadId, action } = body;

    if (!downloadId) {
      return NextResponse.json({ error: "Download ID required" }, { status: 400 });
    }

    if (!["pause", "resume", "cancel", "retry"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
    const agentToken = process.env.NEBULA_AGENT_TOKEN;
    if (agentToken) {
      headers["Authorization"] = `Bearer ${agentToken}`;
    }

    const response = await fetch(`${WINDOWS_AGENT_URL}/api/models/downloads/${downloadId}/${action}`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Failed to ${action} download`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      message: data.message || `Download ${action} successful`,
      status: data.status,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Action failed", details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const downloadId = searchParams.get("id");

    if (!downloadId) {
      return NextResponse.json({ error: "Download ID required" }, { status: 400 });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
    const agentToken = process.env.NEBULA_AGENT_TOKEN;
    if (agentToken) {
      headers["Authorization"] = `Bearer ${agentToken}`;
    }

    const response = await fetch(`${WINDOWS_AGENT_URL}/api/models/downloads/${downloadId}`, {
      method: "DELETE",
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to cancel download", details: errorText },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true, message: "Download cancelled" });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to cancel download", details: error.message },
      { status: 500 }
    );
  }
}
