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
  const baseDir = process.env.REPL_ID ? "./public" : "/opt/homelab/HomeLabHub/services/dashboard-next/public";
  const assetsDir = join(baseDir, "generated-images");
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
    const { prompt, negativePrompt, size, style, provider } = body;

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

    if (result.base64) {
      try {
        console.log("[Image API] Saving base64 image to file...");
        const assetsDir = getAssetsDir();
        const filename = `image_${Date.now()}.png`;
        const filepath = join(assetsDir, filename);

        const buffer = Buffer.from(result.base64, "base64");
        if (buffer.length < 100) {
          throw new Error(`Image data too small (${buffer.length} bytes)`);
        }
        
        writeFileSync(filepath, buffer);
        console.log(`[Image API] Saved image to ${filepath} (${buffer.length} bytes)`);

        const publicUrl = `/generated-images/${filename}`;
        
        return NextResponse.json({
          url: publicUrl,
          provider: result.provider,
          savedPath: filepath,
          filename,
        });
      } catch (saveError: any) {
        console.error("[Image API] Failed to save image:", saveError);
        return NextResponse.json({
          ...result,
          warning: "Failed to save image locally: " + saveError.message
        });
      }
    }

    if (result.url) {
      const isInternalUrl = result.url.includes("100.118.44.102") || 
                            result.url.includes("100.66.61.51") ||
                            result.url.includes("localhost") ||
                            result.url.includes("127.0.0.1");

      if (isInternalUrl) {
        try {
          console.log(`[Image API] Proxying image from internal URL: ${result.url}`);
          const assetsDir = getAssetsDir();
          const filename = `image_${Date.now()}.png`;
          const filepath = join(assetsDir, filename);

          const response = await fetch(result.url);
          if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status}`);
          }
          
          const buffer = Buffer.from(await response.arrayBuffer());
          writeFileSync(filepath, buffer);
          console.log(`[Image API] Saved proxied image to ${filepath}`);

          const publicUrl = `/generated-images/${filename}`;
          
          return NextResponse.json({
            url: publicUrl,
            provider: result.provider,
            savedPath: filepath,
            filename,
          });
        } catch (proxyError: any) {
          console.error("[Image API] Failed to proxy image:", proxyError);
        }
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
