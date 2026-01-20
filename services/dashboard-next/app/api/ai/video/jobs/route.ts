import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { videoJobs } from "@/lib/db/platform-schema";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { desc, eq, and, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const batchId = searchParams.get("batchId");

    let whereConditions = [];

    if (status) {
      const statuses = status.split(",").map(s => s.trim());
      if (statuses.length === 1) {
        whereConditions.push(eq(videoJobs.status, statuses[0]));
      } else {
        whereConditions.push(
          or(...statuses.map(s => eq(videoJobs.status, s)))
        );
      }
    }

    if (batchId) {
      whereConditions.push(eq(videoJobs.batchId, batchId));
    }

    const query = db
      .select({
        id: videoJobs.id,
        mode: videoJobs.mode,
        status: videoJobs.status,
        progress: videoJobs.progress,
        prompt: videoJobs.prompt,
        duration: videoJobs.duration,
        fps: videoJobs.fps,
        width: videoJobs.width,
        height: videoJobs.height,
        outputUrl: videoJobs.outputUrl,
        thumbnailUrl: videoJobs.thumbnailUrl,
        error: videoJobs.error,
        batchId: videoJobs.batchId,
        batchIndex: videoJobs.batchIndex,
        createdAt: videoJobs.createdAt,
        startedAt: videoJobs.startedAt,
        completedAt: videoJobs.completedAt,
        processingTimeMs: videoJobs.processingTimeMs,
      })
      .from(videoJobs)
      .orderBy(desc(videoJobs.createdAt))
      .limit(limit)
      .offset(offset);

    const jobs = whereConditions.length > 0
      ? await query.where(and(...whereConditions))
      : await query;

    const activeCount = await db
      .select({ count: require("drizzle-orm").count() })
      .from(videoJobs)
      .where(
        or(
          eq(videoJobs.status, "queued"),
          eq(videoJobs.status, "processing")
        )
      );

    return NextResponse.json({
      success: true,
      jobs,
      pagination: {
        limit,
        offset,
        total: jobs.length,
      },
      activeCount: activeCount[0]?.count || 0,
    });
  } catch (error: any) {
    console.error("[Video Jobs API] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}
