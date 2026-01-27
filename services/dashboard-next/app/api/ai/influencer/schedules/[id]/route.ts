import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";
import { db, isDbConnected } from "@/lib/db";
import { contentPipelines, influencerPersonas, contentPipelineRuns } from "@/lib/db/platform-schema";
import { pipelineScheduler } from "@/lib/ai/pipeline-scheduler";
import { eq, desc } from "drizzle-orm";
import { CronExpressionParser } from "cron-parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const { id } = await params;

    const results = await db
      .select({
        pipeline: contentPipelines,
        persona: influencerPersonas,
      })
      .from(contentPipelines)
      .leftJoin(influencerPersonas, eq(contentPipelines.personaId, influencerPersonas.id))
      .where(eq(contentPipelines.id, id))
      .limit(1);

    if (results.length === 0) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
    }

    const { pipeline, persona } = results[0];

    const recentRuns = await db
      .select()
      .from(contentPipelineRuns)
      .where(eq(contentPipelineRuns.pipelineId, id))
      .orderBy(desc(contentPipelineRuns.createdAt))
      .limit(5);

    const queue = pipelineScheduler.getQueue();
    const isQueued = queue.some(q => q.pipelineId === id);
    const queuePosition = queue.findIndex(q => q.pipelineId === id);

    return NextResponse.json({
      schedule: {
        id: pipeline.id,
        name: pipeline.name,
        description: pipeline.description,
        pipelineType: pipeline.pipelineType,
        personaId: pipeline.personaId,
        personaName: persona?.name || null,
        isScheduled: pipeline.isScheduled,
        cronExpression: pipeline.cronExpression,
        timezone: pipeline.timezone,
        nextRunAt: pipeline.nextRunAt,
        lastRunAt: pipeline.lastRunAt,
        isActive: pipeline.isActive,
        isQueued,
        queuePosition: isQueued ? queuePosition + 1 : null,
      },
      recentRuns: recentRuns.map(run => ({
        id: run.id,
        status: run.status,
        triggeredBy: run.triggeredBy,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        totalDurationMs: run.totalDurationMs,
        errorMessage: run.errorMessage,
      })),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { cronExpression, timezone, isScheduled, isActive } = body;

    const existing = await db
      .select()
      .from(contentPipelines)
      .where(eq(contentPipelines.id, id))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
    }

    const pipeline = existing[0];
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (cronExpression !== undefined) {
      updates.cronExpression = cronExpression;
    }

    if (timezone !== undefined) {
      updates.timezone = timezone;
    }

    if (isScheduled !== undefined) {
      updates.isScheduled = isScheduled;
    }

    if (isActive !== undefined) {
      updates.isActive = isActive;
    }

    const effectiveCron = cronExpression ?? pipeline.cronExpression;
    const effectiveTimezone = timezone ?? pipeline.timezone ?? "UTC";
    const effectiveScheduled = isScheduled ?? pipeline.isScheduled;

    if (effectiveScheduled && effectiveCron) {
      try {
        const interval = CronExpressionParser.parse(effectiveCron, {
          tz: effectiveTimezone,
          currentDate: new Date(),
        });
        updates.nextRunAt = interval.next().toDate();
      } catch (err) {
        return NextResponse.json(
          { error: `Invalid cron expression: ${effectiveCron}` },
          { status: 400 }
        );
      }
    } else if (!effectiveScheduled) {
      updates.nextRunAt = null;
    }

    const [updated] = await db
      .update(contentPipelines)
      .set(updates)
      .where(eq(contentPipelines.id, id))
      .returning();

    return NextResponse.json({
      schedule: {
        id: updated.id,
        name: updated.name,
        isScheduled: updated.isScheduled,
        cronExpression: updated.cronExpression,
        timezone: updated.timezone,
        nextRunAt: updated.nextRunAt,
        lastRunAt: updated.lastRunAt,
        isActive: updated.isActive,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const { id } = await params;

    const existing = await db
      .select()
      .from(contentPipelines)
      .where(eq(contentPipelines.id, id))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
    }

    pipelineScheduler.removeFromQueue(id);

    const [updated] = await db
      .update(contentPipelines)
      .set({
        isScheduled: false,
        nextRunAt: null,
        updatedAt: new Date(),
      })
      .where(eq(contentPipelines.id, id))
      .returning();

    return NextResponse.json({
      success: true,
      message: "Schedule disabled",
      schedule: {
        id: updated.id,
        name: updated.name,
        isScheduled: updated.isScheduled,
        cronExpression: updated.cronExpression,
        timezone: updated.timezone,
        nextRunAt: updated.nextRunAt,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
