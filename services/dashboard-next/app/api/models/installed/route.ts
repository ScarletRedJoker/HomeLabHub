import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { aiModels } from "@/lib/db/platform-schema";
import { eq, desc, and } from "drizzle-orm";

const WINDOWS_AGENT_URL = process.env.WINDOWS_AGENT_URL || "http://100.118.44.102:9765";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const nodeId = searchParams.get("node");

  try {
    const conditions = [eq(aiModels.status, "installed")];
    if (type) conditions.push(eq(aiModels.type, type));
    if (nodeId) conditions.push(eq(aiModels.nodeId, nodeId));

    const installed = await db
      .select()
      .from(aiModels)
      .where(and(...conditions))
      .orderBy(desc(aiModels.downloadedAt));

    let agentModels: any[] = [];
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const agentToken = process.env.NEBULA_AGENT_TOKEN;
      if (agentToken) headers["Authorization"] = `Bearer ${agentToken}`;

      const agentRes = await fetch(`${WINDOWS_AGENT_URL}/api/models`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (agentRes.ok) {
        const data = await agentRes.json();
        agentModels = (data.models || []).map((m: any) => ({
          id: `agent-${m.name}`,
          name: m.name,
          type: m.type || "checkpoint",
          source: "local",
          installedPath: m.path,
          fileSize: m.size,
          fileSizeFormatted: formatBytes(m.size || 0),
          nodeId: "windows-vm",
          status: "installed",
          lastUsed: m.modifiedAt,
        }));
      }
    } catch (err) {
      console.error("Agent models fetch failed:", err);
    }

    const dbModels = installed.map(m => ({
      ...m,
      fileSizeFormatted: m.fileSize ? formatBytes(Number(m.fileSize)) : null,
    }));

    const existingPaths = new Set(dbModels.map(m => m.installedPath));
    const uniqueAgentModels = agentModels.filter(m => !existingPaths.has(m.installedPath));

    const allModels = [...dbModels, ...uniqueAgentModels];

    const byType = {
      checkpoint: allModels.filter(m => m.type === "checkpoint"),
      lora: allModels.filter(m => m.type === "lora"),
      embedding: allModels.filter(m => m.type === "embedding"),
      controlnet: allModels.filter(m => m.type === "controlnet"),
      vae: allModels.filter(m => m.type === "vae"),
    };

    return NextResponse.json({
      models: allModels,
      count: allModels.length,
      byType,
    });
  } catch (error: any) {
    console.error("Get installed models error:", error);
    return NextResponse.json(
      { error: "Failed to fetch installed models", details: error.message },
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
    const body = await request.json();
    const { modelId, path } = body;

    if (!modelId && !path) {
      return NextResponse.json({ error: "Model ID or path required" }, { status: 400 });
    }

    if (path) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const agentToken = process.env.NEBULA_AGENT_TOKEN;
      if (agentToken) headers["Authorization"] = `Bearer ${agentToken}`;

      const agentRes = await fetch(`${WINDOWS_AGENT_URL}/api/models/delete`, {
        method: "POST",
        headers,
        body: JSON.stringify({ path }),
        signal: AbortSignal.timeout(30000),
      });

      if (!agentRes.ok) {
        const error = await agentRes.text();
        return NextResponse.json(
          { error: "Failed to delete model from agent", details: error },
          { status: 500 }
        );
      }
    }

    if (modelId && !modelId.startsWith("agent-")) {
      await db
        .delete(aiModels)
        .where(eq(aiModels.id, modelId));
    }

    return NextResponse.json({ success: true, message: "Model deleted" });
  } catch (error: any) {
    console.error("Delete model error:", error);
    return NextResponse.json(
      { error: "Failed to delete model", details: error.message },
      { status: 500 }
    );
  }
}
