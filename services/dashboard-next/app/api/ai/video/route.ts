import { NextRequest, NextResponse } from "next/server";
import { aiOrchestrator } from "@/lib/ai-orchestrator";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

function getAssetsDir() {
  const baseDir = process.env.REPL_ID ? "./data" : "/opt/homelab/HomeLabHub";
  const assetsDir = join(baseDir, "generated-assets", "videos");
  if (!existsSync(assetsDir)) {
    mkdirSync(assetsDir, { recursive: true });
  }
  return assetsDir;
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { prompt, inputImage, aspectRatio, model, saveLocally } = body;

    if (!prompt && !inputImage) {
      return NextResponse.json(
        { error: "Prompt or input image is required" },
        { status: 400 }
      );
    }

    let selectedModel = model;
    
    if (!selectedModel || selectedModel === "auto") {
      const comfyAvailable = await aiOrchestrator.checkComfyUI();
      if (comfyAvailable) {
        selectedModel = inputImage ? "svd-local" : "animatediff";
      } else if (aiOrchestrator.hasReplicate()) {
        selectedModel = inputImage ? "wan-i2v" : "wan-t2v";
      }
    }

    const result = await aiOrchestrator.generateVideo({
      prompt: prompt || "Animate this image with natural motion",
      inputImage,
      aspectRatio: aspectRatio || "16:9",
      model: selectedModel || (inputImage ? "wan-i2v" : "wan-t2v"),
      provider: selectedModel?.includes("local") || selectedModel === "animatediff" ? "local" : undefined,
    });

    if (saveLocally && result.url) {
      try {
        const assetsDir = getAssetsDir();
        const filename = `video_${Date.now()}.mp4`;
        const filepath = join(assetsDir, filename);

        const response = await fetch(result.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        writeFileSync(filepath, buffer);

        return NextResponse.json({
          ...result,
          savedPath: filepath,
          filename,
        });
      } catch (saveError: any) {
        console.error("Failed to save video locally:", saveError);
      }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Video generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate video", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  const providers = await aiOrchestrator.getVideoProviders();
  return NextResponse.json({ providers });
}
