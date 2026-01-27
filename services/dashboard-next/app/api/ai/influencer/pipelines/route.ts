import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";
import { db, isDbConnected } from "@/lib/db";
import { contentPipelines, influencerPersonas } from "@/lib/db/platform-schema";
import { eq, desc, and } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const { searchParams } = request.nextUrl;
    const personaId = searchParams.get("personaId");
    const pipelineType = searchParams.get("type");
    const activeOnly = searchParams.get("active") !== "false";

    const conditions = [];

    if (activeOnly) {
      conditions.push(eq(contentPipelines.isActive, true));
    }

    if (personaId) {
      conditions.push(eq(contentPipelines.personaId, personaId));
    }

    if (pipelineType) {
      conditions.push(eq(contentPipelines.pipelineType, pipelineType));
    }

    let query = db
      .select({
        pipeline: contentPipelines,
        persona: influencerPersonas,
      })
      .from(contentPipelines)
      .leftJoin(influencerPersonas, eq(contentPipelines.personaId, influencerPersonas.id))
      .orderBy(desc(contentPipelines.createdAt));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const results = await query;

    const pipelines = results.map(r => ({
      ...r.pipeline,
      persona: r.persona,
    }));

    return NextResponse.json({
      pipelines,
      count: pipelines.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const body = await request.json();
    const {
      name,
      description,
      personaId,
      pipelineType,
      stages,
      workflowId,
      workflowOverrides,
      outputFormat,
      outputResolution,
      aspectRatio,
      batchSize,
      parallelExecution,
      isScheduled,
      cronExpression,
      timezone,
    } = body;

    if (!name || !pipelineType || !stages) {
      return NextResponse.json(
        { error: "Missing required fields: name, pipelineType, and stages are required" },
        { status: 400 }
      );
    }

    const [pipeline] = await db
      .insert(contentPipelines)
      .values({
        name,
        description: description || null,
        personaId: personaId || null,
        pipelineType,
        stages,
        workflowId: workflowId || null,
        workflowOverrides: workflowOverrides || null,
        outputFormat: outputFormat || "mp4",
        outputResolution: outputResolution || "1080p",
        aspectRatio: aspectRatio || "16:9",
        batchSize: batchSize || 1,
        parallelExecution: parallelExecution || false,
        isScheduled: isScheduled || false,
        cronExpression: cronExpression || null,
        timezone: timezone || "UTC",
      })
      .returning();

    return NextResponse.json(pipeline, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
