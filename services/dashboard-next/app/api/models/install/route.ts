import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { aiModels, modelDownloads } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";

const WINDOWS_AGENT_URL = process.env.WINDOWS_AGENT_URL || "http://100.118.44.102:9765";

const MODEL_DIRECTORIES = {
  sd_forge: {
    checkpoint: "C:\\AI\\stable-diffusion-webui-forge\\models\\Stable-diffusion",
    lora: "C:\\AI\\stable-diffusion-webui-forge\\models\\Lora",
    vae: "C:\\AI\\stable-diffusion-webui-forge\\models\\VAE",
    embedding: "C:\\AI\\stable-diffusion-webui-forge\\embeddings",
    controlnet: "C:\\AI\\stable-diffusion-webui-forge\\models\\ControlNet",
  },
  comfyui: {
    checkpoint: "C:\\AI\\ComfyUI\\models\\checkpoints",
    lora: "C:\\AI\\ComfyUI\\models\\loras",
    vae: "C:\\AI\\ComfyUI\\models\\vae",
    embedding: "C:\\AI\\ComfyUI\\models\\embeddings",
    controlnet: "C:\\AI\\ComfyUI\\models\\controlnet",
    clip: "C:\\AI\\ComfyUI\\models\\clip",
    upscale: "C:\\AI\\ComfyUI\\models\\upscale_models",
  },
};

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

function getInstallPath(type: string, target: "sd_forge" | "comfyui" = "sd_forge", subfolder?: string): string {
  const dirs = MODEL_DIRECTORIES[target];
  const baseDir = dirs[type as keyof typeof dirs] || dirs.checkpoint;
  return subfolder ? `${baseDir}\\${subfolder}` : baseDir;
}

interface InstallRequest {
  downloadId?: string;
  modelId?: string;
  sourcePath?: string;
  type: "checkpoint" | "lora" | "vae" | "embedding" | "controlnet";
  target?: "sd_forge" | "comfyui" | "both";
  subfolder?: string;
  validateChecksum?: boolean;
  expectedChecksum?: string;
  refreshAfterInstall?: boolean;
  metadata?: {
    name?: string;
    source?: string;
    sourceId?: string;
    version?: string;
    thumbnailUrl?: string;
    creator?: string;
  };
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: InstallRequest = await request.json();

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

    const target = body.target || "sd_forge";
    const targets = target === "both" ? ["sd_forge", "comfyui"] : [target];
    const installPaths: string[] = [];
    const results: any[] = [];

    for (const t of targets) {
      const installPath = getInstallPath(body.type, t as "sd_forge" | "comfyui", body.subfolder);
      installPaths.push(installPath);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
      };
      const agentToken = process.env.NEBULA_AGENT_TOKEN;
      if (agentToken) {
        headers["Authorization"] = `Bearer ${agentToken}`;
      }

      const installPayload: any = {
        destination: installPath,
        type: body.type,
      };

      if (body.downloadId) {
        installPayload.downloadId = body.downloadId;
      } else if (body.sourcePath) {
        installPayload.sourcePath = body.sourcePath;
      } else if (body.modelId) {
        const [model] = await db
          .select()
          .from(aiModels)
          .where(eq(aiModels.id, body.modelId))
          .limit(1);

        if (!model) {
          return NextResponse.json({ error: "Model not found" }, { status: 404 });
        }
        installPayload.sourcePath = model.installedPath;
      }

      if (body.validateChecksum && body.expectedChecksum) {
        installPayload.validateChecksum = true;
        installPayload.expectedChecksum = body.expectedChecksum;
      }

      try {
        const response = await fetch(`${WINDOWS_AGENT_URL}/api/models/install`, {
          method: "POST",
          headers,
          body: JSON.stringify(installPayload),
          signal: AbortSignal.timeout(60000),
        });

        if (!response.ok) {
          const errorText = await response.text();
          results.push({
            target: t,
            success: false,
            error: errorText,
          });
          continue;
        }

        const data = await response.json();
        results.push({
          target: t,
          success: true,
          path: installPath,
          ...data,
        });

        if (body.refreshAfterInstall !== false) {
          try {
            await fetch(`${WINDOWS_AGENT_URL}/api/models/refresh`, {
              method: "POST",
              headers,
              body: JSON.stringify({ target: t }),
              signal: AbortSignal.timeout(10000),
            });
          } catch (refreshError) {
            console.error("Model refresh failed:", refreshError);
          }
        }
      } catch (error: any) {
        results.push({
          target: t,
          success: false,
          error: error.message,
        });
      }
    }

    const anySuccess = results.some(r => r.success);

    if (anySuccess && body.metadata?.name) {
      try {
        const [model] = await db.insert(aiModels).values({
          name: body.metadata.name,
          type: body.type,
          source: (body.metadata.source as "civitai" | "huggingface" | "local") || "local",
          sourceId: body.metadata.sourceId,
          version: body.metadata.version,
          thumbnailUrl: body.metadata.thumbnailUrl,
          creator: body.metadata.creator,
          installedPath: installPaths[0],
          nodeId: "windows-vm",
          status: "installed",
          downloadedAt: new Date(),
        }).returning();

        return NextResponse.json({
          success: true,
          modelId: model.id,
          results,
          installPaths,
        });
      } catch (dbError) {
        console.error("Database error:", dbError);
      }
    }

    if (!anySuccess) {
      return NextResponse.json(
        { error: "Installation failed on all targets", results },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      results,
      installPaths,
    });
  } catch (error: any) {
    console.error("Install error:", error);
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

  return NextResponse.json({
    directories: MODEL_DIRECTORIES,
    supportedTypes: ["checkpoint", "lora", "vae", "embedding", "controlnet"],
    targets: ["sd_forge", "comfyui", "both"],
  });
}
