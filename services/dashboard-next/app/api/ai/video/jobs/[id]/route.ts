import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { videoJobs } from "@/lib/db/platform-schema";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getVideoJob } from "@/lib/ai-video-pipeline";
import { getAIConfig } from "@/lib/ai/config";

export const dynamic = "force-dynamic";

const config = getAIConfig();

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const [job] = await db
      .select()
      .from(videoJobs)
      .where(eq(videoJobs.id, id))
      .limit(1);

    if (!job) {
      return NextResponse.json(
        { success: false, error: "Job not found" },
        { status: 404 }
      );
    }

    let comfyJobProgress = null;
    if (job.comfyJobId && (job.status === "processing" || job.status === "queued")) {
      const pipelineJob = getVideoJob(job.comfyJobId);
      if (pipelineJob) {
        comfyJobProgress = {
          progress: pipelineJob.progress,
          status: pipelineJob.status,
        };

        if (pipelineJob.status === "completed" && pipelineJob.outputUrl) {
          await db
            .update(videoJobs)
            .set({
              status: "completed",
              progress: 100,
              outputUrl: pipelineJob.outputUrl,
              completedAt: new Date(),
              processingTimeMs: job.startedAt
                ? Date.now() - new Date(job.startedAt).getTime()
                : null,
            })
            .where(eq(videoJobs.id, id));
          job.status = "completed";
          job.progress = 100;
          job.outputUrl = pipelineJob.outputUrl;
        } else if (pipelineJob.status === "failed") {
          await db
            .update(videoJobs)
            .set({
              status: "failed",
              error: pipelineJob.error || "Generation failed",
              completedAt: new Date(),
            })
            .where(eq(videoJobs.id, id));
          job.status = "failed";
          job.error = pipelineJob.error || "Generation failed";
        } else {
          await db
            .update(videoJobs)
            .set({ progress: pipelineJob.progress })
            .where(eq(videoJobs.id, id));
          job.progress = pipelineJob.progress;
        }
      }
    }

    const isInternalUrl = job.outputUrl && (
      (config.windowsVM.ip && job.outputUrl.includes(config.windowsVM.ip)) ||
      job.outputUrl.includes("100.66.61.51") ||
      job.outputUrl.includes("localhost") ||
      job.outputUrl.includes("127.0.0.1")
    );

    const videoUrl = isInternalUrl
      ? `/api/ai/video/download?jobId=${job.id}`
      : job.outputUrl;

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        mode: job.mode,
        status: job.status,
        progress: job.progress,
        prompt: job.prompt,
        negativePrompt: job.negativePrompt,
        duration: job.duration,
        fps: job.fps,
        width: job.width,
        height: job.height,
        motionScale: job.motionScale,
        cfgScale: job.cfgScale,
        steps: job.steps,
        scheduler: job.scheduler,
        animateDiffModel: job.animateDiffModel,
        cameraMotion: job.cameraMotion,
        subjectMotion: job.subjectMotion,
        seed: job.seed,
        videoUrl,
        thumbnailUrl: job.thumbnailUrl,
        previewFrames: job.previewFrames,
        error: job.error,
        batchId: job.batchId,
        batchIndex: job.batchIndex,
        processingTimeMs: job.processingTimeMs,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      },
    });
  } catch (error: any) {
    console.error("[Video Job API] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch job" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const [job] = await db
      .select()
      .from(videoJobs)
      .where(eq(videoJobs.id, id))
      .limit(1);

    if (!job) {
      return NextResponse.json(
        { success: false, error: "Job not found" },
        { status: 404 }
      );
    }

    if (job.status === "processing" || job.status === "queued") {
      await db
        .update(videoJobs)
        .set({
          status: "cancelled",
          error: "Cancelled by user",
          completedAt: new Date(),
        })
        .where(eq(videoJobs.id, id));

      return NextResponse.json({
        success: true,
        message: "Job cancelled",
      });
    }

    await db.delete(videoJobs).where(eq(videoJobs.id, id));

    return NextResponse.json({
      success: true,
      message: "Job deleted",
    });
  } catch (error: any) {
    console.error("[Video Job API] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete job" },
      { status: 500 }
    );
  }
}
