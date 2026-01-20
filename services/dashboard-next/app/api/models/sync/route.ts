import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { aiModels, modelDownloads } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";

const WINDOWS_AGENT_URL = process.env.WINDOWS_AGENT_URL || "http://100.118.44.102:9765";

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

    const headers: Record<string, string> = { "Content-Type": "application/json" };
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
      const newModel = await db.insert(aiModels).values({
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
      }).returning();

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
