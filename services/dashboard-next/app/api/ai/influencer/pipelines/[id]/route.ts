import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";
import { db, isDbConnected } from "@/lib/db";
import { contentPipelines, influencerPersonas } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";

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
        pipeline: contentPipelines,
        persona: influencerPersonas,
      })
      .from(contentPipelines)
      .leftJoin(influencerPersonas, eq(contentPipelines.personaId, influencerPersonas.id))
      .where(eq(contentPipelines.id, id))
      .limit(1);

    if (!result) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...result.pipeline,
      persona: result.persona,
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
      .from(contentPipelines)
      .where(eq(contentPipelines.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    const allowedFields = [
      "name", "description", "personaId", "pipelineType", "stages",
      "workflowId", "workflowOverrides", "outputFormat", "outputResolution",
      "aspectRatio", "batchSize", "parallelExecution", "isScheduled",
      "cronExpression", "timezone", "isActive"
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const [updated] = await db
      .update(contentPipelines)
      .set(updateData)
      .where(eq(contentPipelines.id, id))
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

    const [deleted] = await db
      .delete(contentPipelines)
      .where(eq(contentPipelines.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, deleted });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
