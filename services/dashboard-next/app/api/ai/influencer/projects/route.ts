import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";
import { db, isDbConnected } from "@/lib/db";
import { videoProjects, contentPipelines, influencerPersonas } from "@/lib/db/platform-schema";
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
    const status = searchParams.get("status");
    const personaId = searchParams.get("personaId");
    const pipelineId = searchParams.get("pipelineId");
    const platform = searchParams.get("platform");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
    const offset = (page - 1) * limit;

    const conditions = [];

    if (status) {
      conditions.push(eq(videoProjects.status, status));
    }

    if (personaId) {
      conditions.push(eq(videoProjects.personaId, personaId));
    }

    if (pipelineId) {
      conditions.push(eq(videoProjects.pipelineId, pipelineId));
    }

    if (platform) {
      conditions.push(eq(videoProjects.targetPlatform, platform));
    }

    let query = db
      .select({
        project: videoProjects,
        pipeline: contentPipelines,
        persona: influencerPersonas,
      })
      .from(videoProjects)
      .leftJoin(contentPipelines, eq(videoProjects.pipelineId, contentPipelines.id))
      .leftJoin(influencerPersonas, eq(videoProjects.personaId, influencerPersonas.id))
      .orderBy(desc(videoProjects.createdAt))
      .limit(limit)
      .offset(offset);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const results = await query;

    const projects = results.map(r => ({
      ...r.project,
      pipeline: r.pipeline,
      persona: r.persona,
    }));

    let countQuery = db.select({ count: videoProjects.id }).from(videoProjects);
    if (conditions.length > 0) {
      countQuery = countQuery.where(and(...conditions)) as typeof countQuery;
    }
    const countResult = await countQuery;
    const totalCount = countResult.length;

    return NextResponse.json({
      projects,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
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
    const {
      pipelineId,
      personaId,
      title,
      description,
      script,
      promptChain,
      hashtags,
      targetPlatform,
      publishConfig,
      scheduledPublishAt,
    } = body;

    if (!title) {
      return NextResponse.json(
        { error: "Missing required field: title" },
        { status: 400 }
      );
    }

    const [project] = await db
      .insert(videoProjects)
      .values({
        pipelineId: pipelineId || null,
        personaId: personaId || null,
        title,
        description: description || null,
        script: script || null,
        promptChain: promptChain || null,
        hashtags: hashtags || [],
        targetPlatform: targetPlatform || null,
        publishConfig: publishConfig || null,
        scheduledPublishAt: scheduledPublishAt ? new Date(scheduledPublishAt) : null,
        status: "draft",
      })
      .returning();

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
