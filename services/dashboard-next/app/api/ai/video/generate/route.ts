import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { videoJobs, type NewVideoJob } from "@/lib/db/platform-schema";
import { checkComfyUIStatus, queueVideoGeneration } from "@/lib/ai-video-pipeline";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { demoMode } from "@/lib/demo-mode";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type VideoMode = "text-to-video" | "image-to-video" | "video-to-video";

interface GenerateRequest {
  mode: VideoMode;
  prompt: string;
  negativePrompt?: string;
  inputImage?: string;
  inputVideo?: string;
  duration?: number;
  fps?: number;
  width?: number;
  height?: number;
  motionScale?: number;
  cfgScale?: number;
  steps?: number;
  scheduler?: string;
  animateDiffModel?: string;
  cameraMotion?: { pan?: number; zoom?: number; rotate?: number };
  subjectMotion?: number;
  seed?: number;
  presetId?: string;
  batchCount?: number;
}

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: GenerateRequest = await request.json();
    const {
      mode = "text-to-video",
      prompt,
      negativePrompt = "blurry, low quality, distorted, watermark, text",
      inputImage,
      inputVideo,
      duration = 16,
      fps = 8,
      width = 512,
      height = 512,
      motionScale = 1.0,
      cfgScale = 7.0,
      steps = 25,
      scheduler = "euler",
      animateDiffModel,
      cameraMotion = { pan: 0, zoom: 0, rotate: 0 },
      subjectMotion = 1.0,
      seed = -1,
      presetId,
      batchCount = 1,
    } = body;

    if (!prompt?.trim()) {
      return NextResponse.json(
        { success: false, error: "Prompt is required" },
        { status: 400 }
      );
    }

    if (mode === "image-to-video" && !inputImage) {
      return NextResponse.json(
        { success: false, error: "Input image is required for image-to-video mode" },
        { status: 400 }
      );
    }

    if (mode === "video-to-video" && !inputVideo) {
      return NextResponse.json(
        { success: false, error: "Input video is required for video-to-video mode" },
        { status: 400 }
      );
    }

    if (demoMode.isEnabled()) {
      console.log("[Video Generate API] Demo mode active, returning sample video");
      const demoVideo = await demoMode.getRandomVideo();
      if (demoVideo) {
        return NextResponse.json({
          success: true,
          jobId: `demo-${Date.now()}`,
          status: "completed",
          isDemo: true,
          videoUrl: demoVideo.url,
          message: "Demo mode: Showing pre-generated sample video",
        });
      }
    }

    const comfyStatus = await checkComfyUIStatus();
    if (!comfyStatus.online) {
      return NextResponse.json(
        {
          success: false,
          error: "ComfyUI is offline",
          details: "ComfyUI on Windows VM is not reachable. Make sure ComfyUI is running and Tailscale is connected.",
          comfyuiStatus: comfyStatus,
        },
        { status: 503 }
      );
    }

    const batchId = batchCount > 1 ? crypto.randomUUID() : undefined;
    const jobs: { jobId: string; status: string }[] = [];

    for (let i = 0; i < Math.min(batchCount, 10); i++) {
      const jobSeed = seed === -1 ? Math.floor(Math.random() * 2147483647) : seed + i;

      const newJob: NewVideoJob = {
        mode,
        status: "queued",
        progress: 0,
        prompt: prompt.trim(),
        negativePrompt,
        inputImage: inputImage || null,
        inputVideo: inputVideo || null,
        duration,
        fps,
        width,
        height,
        motionScale: motionScale.toString(),
        cfgScale: cfgScale.toString(),
        steps,
        scheduler,
        animateDiffModel: animateDiffModel || null,
        cameraMotion,
        subjectMotion: subjectMotion.toString(),
        seed: jobSeed,
        presetId: presetId || null,
        userId: user.id || null,
        batchId: batchId || null,
        batchIndex: batchCount > 1 ? i : null,
      };

      const [insertedJob] = await db.insert(videoJobs).values(newJob).returning();
      console.log(`[Video Generate API] Created job ${insertedJob.id} for ${mode}`);

      try {
        const comfyJob = await queueVideoGeneration({
          prompt: prompt.trim(),
          negativePrompt,
          inputImage,
          aspectRatio: width > height ? "16:9" : height > width ? "9:16" : "1:1",
          model: mode === "image-to-video" ? "svd" : "animatediff",
          frames: duration,
          fps,
          steps,
          seed: jobSeed,
        });

        await db
          .update(videoJobs)
          .set({ comfyJobId: comfyJob.id, status: "processing", startedAt: new Date() })
          .where(require("drizzle-orm").eq(videoJobs.id, insertedJob.id));

        jobs.push({ jobId: insertedJob.id, status: "processing" });
      } catch (queueError: any) {
        await db
          .update(videoJobs)
          .set({ status: "failed", error: queueError.message, completedAt: new Date() })
          .where(require("drizzle-orm").eq(videoJobs.id, insertedJob.id));
        
        jobs.push({ jobId: insertedJob.id, status: "failed" });
      }
    }

    return NextResponse.json({
      success: true,
      jobs,
      batchId,
      message: `${jobs.length} video generation job(s) queued. Poll /api/ai/video/jobs/[id] for status.`,
    });
  } catch (error: any) {
    console.error("[Video Generate API] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to queue video generation" },
      { status: 500 }
    );
  }
}
