import { NextRequest, NextResponse } from "next/server";
import { aiOrchestrator } from "@/lib/ai-orchestrator";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { 
  getVideoJob, 
  getAllVideoJobs, 
  getActiveVideoJobs,
  checkComfyUIStatus,
  queueVideoGeneration,
  cancelVideoJob,
  type VideoGenerationJob
} from "@/lib/ai-video-pipeline";
import { demoMode } from "@/lib/demo-mode";
import { getAIConfig } from "@/lib/ai/config";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const config = getAIConfig();

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
    const body = await request.json();
    let { prompt, inputImage, aspectRatio, model, async: asyncMode, frames, fps, steps, seed } = body;

    prompt = (prompt || "").trim();

    if (demoMode.isEnabled()) {
      console.log("[Video API] Demo mode active, returning sample video");
      const demoVideo = await demoMode.getRandomVideo();
      if (demoVideo) {
        return NextResponse.json({
          url: demoVideo.url,
          provider: "demo",
          model: "demo-animatediff",
          isDemo: true,
          duration: demoVideo.duration,
          prompt: demoVideo.prompt,
          thumbnail: demoVideo.thumbnail,
          message: "Demo mode: Showing pre-generated sample video",
        });
      }
    }

    if (!prompt && !inputImage) {
      console.error("[Video API] No prompt or input image provided");
      return NextResponse.json(
        { error: "Prompt or input image is required" },
        { status: 400 }
      );
    }

    console.log(`[Video API] Prompt: "${(prompt || "").substring(0, 50)}..." (${prompt?.length || 0} chars)`);
    console.log(`[Video API] Model: ${model}, Has input image: ${!!inputImage}, Async: ${!!asyncMode}`);

    const comfyStatus = await checkComfyUIStatus();
    const comfyAvailable = comfyStatus.online;
    
    let selectedModel = model;
    
    if (!selectedModel || selectedModel === "auto") {
      console.log(`[Video API] ComfyUI available: ${comfyAvailable}`);
      if (comfyAvailable) {
        selectedModel = inputImage ? "svd" : "animatediff";
      } else if (aiOrchestrator.hasReplicate()) {
        selectedModel = inputImage ? "wan-i2v" : "wan-t2v";
      } else {
        return NextResponse.json(
          { 
            error: "No video generation provider available", 
            details: "ComfyUI is offline on Windows VM. Start ComfyUI or add Replicate API key.",
            comfyuiStatus: comfyStatus
          },
          { status: 503 }
        );
      }
    }

    if ((selectedModel === "animatediff" || selectedModel === "svd" || selectedModel === "svd-local") && !comfyAvailable) {
      return NextResponse.json(
        { 
          error: "ComfyUI is offline", 
          details: "ComfyUI on Windows VM is not reachable. Make sure ComfyUI is running and Tailscale is connected.",
          comfyuiStatus: comfyStatus
        },
        { status: 503 }
      );
    }

    console.log(`[Video API] Generating with model: ${selectedModel}`);

    if (asyncMode && (selectedModel === "animatediff" || selectedModel === "svd" || selectedModel === "svd-local")) {
      const job = await queueVideoGeneration({
        prompt: prompt || "Animate this image with natural motion",
        inputImage,
        aspectRatio: aspectRatio || "16:9",
        model: selectedModel === "svd-local" ? "svd" : selectedModel as any,
        frames,
        fps,
        steps,
        seed,
      });

      return NextResponse.json({
        jobId: job.id,
        status: job.status,
        model: job.model,
        message: "Video generation queued. Use GET /api/ai/video?jobId={jobId} to check status.",
      });
    }
    
    const result = await aiOrchestrator.generateVideo({
      prompt: prompt || "Animate this image with natural motion",
      inputImage,
      aspectRatio: aspectRatio || "16:9",
      model: selectedModel,
      provider: selectedModel?.includes("local") || selectedModel === "animatediff" || selectedModel === "svd" ? "local" : undefined,
    });

    console.log(`[Video API] Generation complete, URL: ${result.url}`);

    const isInternalUrl = result.url && (
      (config.windowsVM.ip && result.url.includes(config.windowsVM.ip)) || 
      result.url.includes("100.66.61.51") ||
      result.url.includes("localhost") ||
      result.url.includes("127.0.0.1")
    );

    if (isInternalUrl) {
      console.log(`[Video API] Proxying video from internal URL: ${result.url}`);
      
      const response = await fetch(result.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
      }
      
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        const text = await response.text();
        console.error("[Video API] ComfyUI returned HTML:", text.substring(0, 200));
        throw new Error("ComfyUI returned an error page instead of video");
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      console.log(`[Video API] Proxied video: ${buffer.length} bytes`);
      
      if (buffer.length < 10000) {
        throw new Error(`Video file too small (${buffer.length} bytes) - generation may have failed`);
      }

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": buffer.length.toString(),
          "X-Provider": result.provider || "comfyui",
          "X-Model": result.model || selectedModel,
          "Cache-Control": "no-store",
        },
      });
    }

    if (result.url) {
      return NextResponse.json({
        url: result.url,
        provider: result.provider,
        model: result.model,
      });
    }

    return NextResponse.json(
      { error: "No video data received", details: "Provider returned empty response" },
      { status: 500 }
    );
  } catch (error: any) {
    console.error("[Video API] Generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate video", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  const action = searchParams.get("action");

  if (action === "status") {
    const comfyStatus = await checkComfyUIStatus();
    const providers = await aiOrchestrator.getVideoProviders();
    const activeJobs = getActiveVideoJobs();
    
    return NextResponse.json({
      comfyui: comfyStatus,
      providers,
      activeJobs: activeJobs.length,
      jobs: activeJobs,
    });
  }

  if (action === "cancel" && jobId) {
    const cancelled = await cancelVideoJob(jobId);
    return NextResponse.json({ cancelled, jobId });
  }

  if (action === "jobs") {
    const all = searchParams.get("all") === "true";
    const jobs = all ? getAllVideoJobs() : getActiveVideoJobs();
    return NextResponse.json({ jobs });
  }

  if (jobId) {
    const job = getVideoJob(jobId);
    
    if (!job) {
      return NextResponse.json(
        { error: "Job not found", jobId },
        { status: 404 }
      );
    }

    const response: Record<string, any> = {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      model: job.model,
      createdAt: job.createdAt,
    };

    if (job.status === "completed" && job.outputUrl) {
      const isInternalUrl = job.outputUrl && (
        (config.windowsVM.ip && job.outputUrl.includes(config.windowsVM.ip)) || 
        job.outputUrl.includes("100.66.61.51") ||
        job.outputUrl.includes("localhost") ||
        job.outputUrl.includes("127.0.0.1")
      );

      if (isInternalUrl) {
        response.videoUrl = `/api/ai/video/download?jobId=${job.id}`;
      } else {
        response.videoUrl = job.outputUrl;
      }
      response.completedAt = job.completedAt;
    }

    if (job.status === "failed") {
      response.error = job.error;
      response.completedAt = job.completedAt;
    }

    if (job.startedAt) {
      response.startedAt = job.startedAt;
    }

    return NextResponse.json(response);
  }

  const providers = await aiOrchestrator.getVideoProviders();
  const comfyStatus = await checkComfyUIStatus();
  
  return NextResponse.json({ 
    providers,
    comfyui: comfyStatus,
    usage: {
      "GET /api/ai/video?jobId={id}": "Get job status",
      "GET /api/ai/video?action=status": "Get ComfyUI and provider status",
      "GET /api/ai/video?action=jobs": "Get active jobs",
      "GET /api/ai/video?action=jobs&all=true": "Get all jobs",
      "GET /api/ai/video?action=cancel&jobId={id}": "Cancel a job",
      "POST /api/ai/video": "Generate video (add async=true for async mode)",
    }
  });
}
