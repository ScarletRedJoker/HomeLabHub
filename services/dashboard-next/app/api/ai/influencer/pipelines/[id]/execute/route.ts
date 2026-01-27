import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";
import { db, isDbConnected } from "@/lib/db";
import { contentPipelines, contentPipelineRuns, videoProjects } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const [pipeline] = await db
      .select()
      .from(contentPipelines)
      .where(eq(contentPipelines.id, id))
      .limit(1);

    if (!pipeline) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
    }

    if (!pipeline.isActive) {
      return NextResponse.json({ error: "Pipeline is not active" }, { status: 400 });
    }

    const {
      title,
      description,
      script,
      promptChain,
      batchId,
      batchIndex,
      batchTotal,
      overrides,
    } = body;

    const [videoProject] = await db
      .insert(videoProjects)
      .values({
        pipelineId: pipeline.id,
        personaId: pipeline.personaId,
        title: title || `Generated Video - ${new Date().toISOString()}`,
        description: description || null,
        script: script || null,
        promptChain: promptChain || null,
        status: "generating",
        currentStage: "initializing",
        progress: 0,
      })
      .returning();

    const stages = (pipeline.stages as Array<{ type: string; config?: Record<string, unknown> }>).map((stage, index) => ({
      name: stage.type,
      status: index === 0 ? "pending" : "waiting",
      config: { ...stage.config, ...overrides },
      startedAt: null,
      completedAt: null,
      output: null,
    }));

    const [pipelineRun] = await db
      .insert(contentPipelineRuns)
      .values({
        pipelineId: pipeline.id,
        videoProjectId: videoProject.id,
        batchId: batchId || null,
        batchIndex: batchIndex || null,
        batchTotal: batchTotal || null,
        triggeredBy: "manual",
        stages,
        currentStageIndex: 0,
        status: "pending",
        startedAt: new Date(),
      })
      .returning();

    await db
      .update(contentPipelines)
      .set({ lastRunAt: new Date() })
      .where(eq(contentPipelines.id, id));

    return NextResponse.json({
      success: true,
      pipelineRun,
      videoProject,
      message: "Pipeline execution started",
    }, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
