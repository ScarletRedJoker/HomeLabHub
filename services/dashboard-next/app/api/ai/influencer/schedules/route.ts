import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";
import { db, isDbConnected } from "@/lib/db";
import { contentPipelines, influencerPersonas } from "@/lib/db/platform-schema";
import { pipelineScheduler } from "@/lib/ai/pipeline-scheduler";
import { eq, desc, and } from "drizzle-orm";
import { CronExpressionParser } from "cron-parser";

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
    const activeOnly = searchParams.get("active") !== "false";
    const scheduledOnly = searchParams.get("scheduled") !== "false";

    const conditions = [];

    if (activeOnly) {
      conditions.push(eq(contentPipelines.isActive, true));
    }

    if (scheduledOnly) {
      conditions.push(eq(contentPipelines.isScheduled, true));
    }

    let query = db
      .select({
        pipeline: contentPipelines,
        persona: influencerPersonas,
      })
      .from(contentPipelines)
      .leftJoin(influencerPersonas, eq(contentPipelines.personaId, influencerPersonas.id))
      .orderBy(desc(contentPipelines.nextRunAt));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const results = await query;

    const schedulerStats = pipelineScheduler.getStats();
    const queue = pipelineScheduler.getQueue();

    const schedules = results.map(r => {
      const isQueued = queue.some(q => q.pipelineId === r.pipeline.id);
      return {
        id: r.pipeline.id,
        name: r.pipeline.name,
        personaId: r.pipeline.personaId,
        personaName: r.persona?.name || null,
        pipelineType: r.pipeline.pipelineType,
        isScheduled: r.pipeline.isScheduled,
        cronExpression: r.pipeline.cronExpression,
        timezone: r.pipeline.timezone,
        nextRunAt: r.pipeline.nextRunAt,
        lastRunAt: r.pipeline.lastRunAt,
        isActive: r.pipeline.isActive,
        isQueued,
      };
    });

    return NextResponse.json({
      schedules,
      count: schedules.length,
      scheduler: {
        isRunning: schedulerStats.isRunning,
        queueSize: schedulerStats.queueSize,
        activeExecutions: schedulerStats.activeExecutions,
      },
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
    const { pipelineId, cronExpression, timezone, isScheduled } = body;

    if (!pipelineId) {
      return NextResponse.json({ error: "pipelineId is required" }, { status: 400 });
    }

    const existing = await db
      .select()
      .from(contentPipelines)
      .where(eq(contentPipelines.id, pipelineId))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
    }

    let nextRunAt: Date | null = null;

    if (isScheduled && cronExpression) {
      try {
        const interval = CronExpressionParser.parse(cronExpression, {
          tz: timezone || "UTC",
          currentDate: new Date(),
        });
        nextRunAt = interval.next().toDate();
      } catch (err) {
        return NextResponse.json(
          { error: `Invalid cron expression: ${cronExpression}` },
          { status: 400 }
        );
      }
    }

    const [updated] = await db
      .update(contentPipelines)
      .set({
        isScheduled: isScheduled ?? existing[0].isScheduled,
        cronExpression: cronExpression ?? existing[0].cronExpression,
        timezone: timezone ?? existing[0].timezone ?? "UTC",
        nextRunAt,
        updatedAt: new Date(),
      })
      .where(eq(contentPipelines.id, pipelineId))
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
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const body = await request.json();
    const { pipelineId, cronExpression, timezone, isScheduled } = body;

    if (!pipelineId) {
      return NextResponse.json({ error: "pipelineId is required" }, { status: 400 });
    }

    const existing = await db
      .select()
      .from(contentPipelines)
      .where(eq(contentPipelines.id, pipelineId))
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
      .where(eq(contentPipelines.id, pipelineId))
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
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
