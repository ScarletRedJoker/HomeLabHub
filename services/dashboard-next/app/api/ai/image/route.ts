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

    const result = await aiOrchestrator.generateImage({
      prompt,
      negativePrompt,
      size: size || "1024x1024",
      style: style || "vivid",
      provider: provider || "openai",
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
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const providers = [
    {
      id: "openai",
      name: "DALL-E 3",
      description: "OpenAI's state-of-the-art image generation",
      sizes: ["1024x1024", "1792x1024", "1024x1792"],
      styles: ["vivid", "natural"],
      available: aiOrchestrator.hasOpenAI(),
    },
    {
      id: "stable-diffusion",
      name: "Stable Diffusion",
      description: "Self-hosted on RTX 3060 (when available)",
      sizes: ["512x512", "768x768", "1024x1024"],
      styles: [],
      available: false,
    },
  ];

  return NextResponse.json({ providers });
}
