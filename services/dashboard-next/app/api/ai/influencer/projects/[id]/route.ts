import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";
import { db, isDbConnected } from "@/lib/db";
import { videoProjects, contentPipelines, influencerPersonas, contentPipelineRuns } from "@/lib/db/platform-schema";
import { eq, desc } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const { id } = await params;

    const [result] = await db
      .select({
        project: videoProjects,
        pipeline: contentPipelines,
        persona: influencerPersonas,
      })
      .from(videoProjects)
      .leftJoin(contentPipelines, eq(videoProjects.pipelineId, contentPipelines.id))
      .leftJoin(influencerPersonas, eq(videoProjects.personaId, influencerPersonas.id))
      .where(eq(videoProjects.id, id))
      .limit(1);

    if (!result) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const runs = await db
      .select()
      .from(contentPipelineRuns)
      .where(eq(contentPipelineRuns.videoProjectId, id))
      .orderBy(desc(contentPipelineRuns.createdAt))
      .limit(10);

    return NextResponse.json({
      ...result.project,
      pipeline: result.pipeline,
      persona: result.persona,
      pipelineRuns: runs,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const { id } = await params;
    const body = await request.json();

    const [existing] = await db
      .select()
      .from(videoProjects)
      .where(eq(videoProjects.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    const allowedFields = [
      "pipelineId", "personaId", "title", "description", "script", "promptChain",
      "generatedFrames", "audioPath", "musicPath", "finalVideoPath", "thumbnailPath",
      "hashtags", "targetPlatform", "publishConfig", "status", "currentStage",
      "progress", "errorMessage", "scheduledPublishAt"
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === "scheduledPublishAt" && body[field]) {
          updateData[field] = new Date(body[field]);
        } else {
          updateData[field] = body[field];
        }
      }
    }

    const [updated] = await db
      .update(videoProjects)
      .set(updateData)
      .where(eq(videoProjects.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const { id } = await params;

    await db
      .delete(contentPipelineRuns)
      .where(eq(contentPipelineRuns.videoProjectId, id));

    const [deleted] = await db
      .delete(videoProjects)
      .where(eq(videoProjects.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, deleted });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
