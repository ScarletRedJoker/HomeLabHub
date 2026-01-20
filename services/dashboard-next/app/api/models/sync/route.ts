import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { aiModels, modelDownloads } from "@/lib/db/platform-schema";
import { eq, and } from "drizzle-orm";

const WINDOWS_AGENT_URL = process.env.WINDOWS_AGENT_URL || "http://100.118.44.102:9765";

// Windows model directory mapping
const WINDOWS_MODEL_DIRS: Record<string, string> = {
  checkpoint: "C:\\AI\\stable-diffusion-webui-forge\\models\\Stable-diffusion\\",
  lora: "C:\\AI\\stable-diffusion-webui-forge\\models\\Lora\\",
  vae: "C:\\AI\\stable-diffusion-webui-forge\\models\\VAE\\",
  embedding: "C:\\AI\\stable-diffusion-webui-forge\\embeddings\\",
  controlnet: "C:\\AI\\stable-diffusion-webui-forge\\models\\ControlNet\\",
};

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

interface ScannedModel {
  path: string;
  name: string;
  type: string;
  size: number;
  modifiedAt: string;
}

async function scanWindowsDirectories(): Promise<{
  models: ScannedModel[];
  directories: Record<string, string>;
}> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const agentToken = process.env.NEBULA_AGENT_TOKEN;
  if (agentToken) headers["Authorization"] = `Bearer ${agentToken}`;

  try {
    const response = await fetch(`${WINDOWS_AGENT_URL}/api/models/scan`, {
      headers,
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.error("Scan failed:", await response.text());
      return { models: [], directories: WINDOWS_MODEL_DIRS };
    }

    const data = await response.json();
    return {
      models: data.models || [],
      directories: data.directories || WINDOWS_MODEL_DIRS,
    };
  } catch (error) {
    console.error("Scan error:", error);
    return { models: [], directories: WINDOWS_MODEL_DIRS };
  }
}

// GET - Scan and compare model directories
export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (action === "scan") {
      // Scan Windows VM directories
      const { models: scannedModels, directories } =
        await scanWindowsDirectories();

      // Get database models
      const dbModels = await db.select().from(aiModels).where(
        and(eq(aiModels.nodeId, "windows-vm"), eq(aiModels.status, "installed"))
      );

      // Identify missing and orphaned models
      const scannedPaths = new Set(scannedModels.map((m) => m.path.toLowerCase()));
      const dbPaths = new Map(
        dbModels.map((m) => [
          (m.installedPath || "").toLowerCase(),
          m.id,
        ])
      );

      const missing = scannedModels.filter(
        (m) => !dbPaths.has(m.path.toLowerCase())
      );
      const orphaned = dbModels.filter(
        (m) => m.installedPath && !scannedPaths.has(m.installedPath.toLowerCase())
      );

      return NextResponse.json({
        scanned: scannedModels,
        database: dbModels,
        missing,
        orphaned: orphaned.map((m) => ({ id: m.id, name: m.name, path: m.installedPath })),
        directories,
      });
    } else if (action === "refresh") {
      // Refresh installed models list by scanning and updating database
      const { models: scannedModels } = await scanWindowsDirectories();

      // Get existing database models
      const existing = await db
        .select()
        .from(aiModels)
        .where(
          and(eq(aiModels.nodeId, "windows-vm"), eq(aiModels.status, "installed"))
        );

      const existingMap = new Map(existing.map((m) => [m.installedPath?.toLowerCase(), m]));

      // Add new models from scan
      const newModels = scannedModels.filter(
        (m) => !existingMap.has(m.path.toLowerCase())
      );

      let addedCount = 0;
      for (const model of newModels) {
        try {
          await db.insert(aiModels).values({
            name: model.name,
            type: model.type,
            source: "local",
            installedPath: model.path,
            fileSize: String(model.size),
            nodeId: "windows-vm",
            status: "installed",
            downloadedAt: new Date(model.modifiedAt),
            nsfw: false,
          });
          addedCount++;
        } catch (err) {
          console.error("Failed to add model:", err);
        }
      }

      // Mark orphaned models as missing
      const scannedPaths = new Set(scannedModels.map((m) => m.path.toLowerCase()));
      const orphaned = existing.filter(
        (m) => m.installedPath && !scannedPaths.has(m.installedPath.toLowerCase())
      );

      for (const model of orphaned) {
        await db
          .update(aiModels)
          .set({ status: "missing" })
          .where(eq(aiModels.id, model.id));
      }

      return NextResponse.json({
        success: true,
        message: `Refreshed model list: ${addedCount} added, ${orphaned.length} marked as missing`,
        added: addedCount,
        removed: orphaned.length,
        total: scannedModels.length,
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Use ?action=scan or ?action=refresh" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync models", details: error.message },
      { status: 500 }
    );
  }
}

// POST - Sync model between nodes
export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { modelId, sourceNode, targetNode, sourcePath, modelType } = body;

    if (!modelId || !sourceNode || !targetNode) {
      return NextResponse.json(
        { error: "modelId, sourceNode, and targetNode are required" },
        { status: 400 }
      );
    }

    if (sourceNode === targetNode) {
      return NextResponse.json(
        { error: "Source and target nodes must be different" },
        { status: 400 }
      );
    }

    const model = await db.query.aiModels.findFirst({
      where: eq(aiModels.id, modelId),
    });

    if (!model && !sourcePath) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const agentToken = process.env.NEBULA_AGENT_TOKEN;
    if (agentToken) headers["Authorization"] = `Bearer ${agentToken}`;

    const syncPayload = {
      sourcePath: sourcePath || model?.installedPath,
      sourceNode,
      targetNode,
      modelType: modelType || model?.type || "checkpoint",
    };

    const agentRes = await fetch(`${WINDOWS_AGENT_URL}/api/models/sync`, {
      method: "POST",
      headers,
      body: JSON.stringify(syncPayload),
      signal: AbortSignal.timeout(30000),
    });

    if (!agentRes.ok) {
      const errorText = await agentRes.text();
      return NextResponse.json(
        { error: "Sync request failed", details: errorText },
        { status: 500 }
      );
    }

    const result = await agentRes.json();

    if (model) {
      const newModel = await db
        .insert(aiModels)
        .values({
          name: model.name,
          type: model.type,
          source: model.source,
          sourceUrl: model.sourceUrl,
          sourceId: model.sourceId,
          version: model.version,
          description: model.description,
          thumbnailUrl: model.thumbnailUrl,
          fileSize: model.fileSize,
          nodeId: targetNode,
          status: "downloading",
          creator: model.creator,
          license: model.license,
          nsfw: model.nsfw,
          tags: model.tags,
        })
        .returning();

      return NextResponse.json({
        success: true,
        message: "Sync started",
        syncJobId: result.jobId || result.id,
        newModelId: newModel[0]?.id,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Sync started",
      syncJobId: result.jobId || result.id,
    });
  } catch (error: any) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync model", details: error.message },
      { status: 500 }
    );
  }
}
