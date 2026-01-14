import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { modelRegistry } from "@/lib/model-registry";
import type { ModelInstallRequest } from "@/types/models";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { modelId, source, downloadUrl, targetType, filename, targetPath } = body;

    if (!downloadUrl) {
      return NextResponse.json(
        { error: "downloadUrl is required" },
        { status: 400 }
      );
    }

    if (!targetType) {
      return NextResponse.json(
        { error: "targetType is required (checkpoint, lora, textual_inversion, vae, controlnet)" },
        { status: 400 }
      );
    }

    const installRequest: ModelInstallRequest = {
      modelId: modelId || "unknown",
      source: source || "civitai",
      downloadUrl,
      targetType,
      filename,
      targetPath: targetPath || "sd",
    };

    const job = await modelRegistry.installModel(installRequest);

    if (job.status === "failed") {
      return NextResponse.json(
        { error: "Failed to start download", details: job.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Download started",
      job,
    });
  } catch (error: any) {
    console.error("[API] Model install error:", error);
    return NextResponse.json(
      { error: "Failed to install model", details: error.message },
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
  const downloadId = searchParams.get("id");

  try {
    if (downloadId) {
      const progress = await modelRegistry.getInstallProgress(downloadId);
      if (!progress) {
        return NextResponse.json({ error: "Download not found" }, { status: 404 });
      }
      return NextResponse.json(progress);
    }

    const downloads = await modelRegistry.getActiveDownloads();
    return NextResponse.json({ downloads });
  } catch (error: any) {
    console.error("[API] Get install progress error:", error);
    return NextResponse.json(
      { error: "Failed to get download progress", details: error.message },
      { status: 500 }
    );
  }
}
