import { NextRequest, NextResponse } from "next/server";
import { aiOrchestrator } from "@/lib/ai-orchestrator";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

function getAssetsDir() {
  const baseDir = process.env.REPL_ID ? "./data" : "/opt/homelab/HomeLabHub";
  const assetsDir = join(baseDir, "generated-assets");
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
    const { prompt, negativePrompt, size, style, provider, saveLocally } = body;

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    let selectedProvider = provider || "auto";
    
    if (selectedProvider === "auto") {
      const sdAvailable = await aiOrchestrator.checkStableDiffusion();
      if (sdAvailable) {
        selectedProvider = "stable-diffusion";
        console.log("[Image API] Using local Stable Diffusion - no content restrictions");
      } else if (aiOrchestrator.hasOpenAI()) {
        selectedProvider = "openai";
        console.log("[Image API] Falling back to DALL-E 3 (local SD not available)");
      } else {
        return NextResponse.json(
          { error: "No image generation provider available", details: "Configure Stable Diffusion on Windows VM or add OpenAI API key" },
          { status: 503 }
        );
      }
    }

    const result = await aiOrchestrator.generateImage({
      prompt,
      negativePrompt,
      size: size || "1024x1024",
      style: style || "vivid",
      provider: selectedProvider,
    });

    if (saveLocally && (result.url || result.base64)) {
      try {
        const assetsDir = getAssetsDir();
        const filename = `image_${Date.now()}.png`;
        const filepath = join(assetsDir, filename);

        if (result.base64) {
          const buffer = Buffer.from(result.base64, "base64");
          writeFileSync(filepath, buffer);
        } else if (result.url) {
          const response = await fetch(result.url);
          const buffer = Buffer.from(await response.arrayBuffer());
          writeFileSync(filepath, buffer);
        }

        return NextResponse.json({
          ...result,
          savedPath: filepath,
          filename,
        });
      } catch (saveError: any) {
        console.error("Failed to save image locally:", saveError);
      }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Image generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate image", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const sdAvailable = await aiOrchestrator.checkStableDiffusion();

  const providers = [
    {
      id: "auto",
      name: "Auto (Local First)",
      description: "Uses local Stable Diffusion if available, falls back to DALL-E",
      sizes: ["512x512", "768x768", "1024x1024", "1792x1024", "1024x1792"],
      styles: ["vivid", "natural"],
      available: true,
      recommended: true,
    },
    {
      id: "stable-diffusion",
      name: "Stable Diffusion (Local)",
      description: "Self-hosted on RTX 3060 - No content restrictions",
      sizes: ["512x512", "768x768", "1024x1024"],
      styles: [],
      available: sdAvailable,
      unrestricted: true,
    },
    {
      id: "openai",
      name: "DALL-E 3 (Cloud)",
      description: "OpenAI's image generation - Has content moderation",
      sizes: ["1024x1024", "1792x1024", "1024x1792"],
      styles: ["vivid", "natural"],
      available: aiOrchestrator.hasOpenAI(),
    },
  ];

  return NextResponse.json({ providers, sdAvailable });
}
