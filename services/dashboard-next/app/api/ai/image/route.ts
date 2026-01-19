import { NextRequest, NextResponse } from "next/server";
import { aiOrchestrator } from "@/lib/ai-orchestrator";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { demoMode } from "@/lib/demo-mode";

function isMotionModule(modelName: string): boolean {
  if (!modelName) return false;
  const lower = modelName.toLowerCase();
  return lower.startsWith("mm_") || 
         lower.startsWith("mm-") || 
         lower.includes("motion") ||
         lower.includes("animatediff") ||
         lower.includes("_motion_");
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
    const body = await request.json();
    let { prompt, negativePrompt, size, style, provider } = body;

    prompt = (prompt || "").trim();
    negativePrompt = (negativePrompt || "").trim();

    if (demoMode.isEnabled()) {
      console.log("[Image API] Demo mode active, returning sample image");
      const demoImage = await demoMode.getImageByPrompt(prompt || "");
      if (demoImage) {
        return NextResponse.json({
          url: demoImage.url,
          provider: "demo",
          model: "demo-sdxl",
          isDemo: true,
          style: demoImage.style,
          originalPrompt: demoImage.prompt,
          message: "Demo mode: Showing pre-generated sample image",
        });
      }
    }

    if (!prompt || prompt.length === 0) {
      console.error("[Image API] Empty prompt received");
      return NextResponse.json(
        { error: "Prompt is required", details: "Please enter a description of the image you want to generate" },
        { status: 400 }
      );
    }

    console.log(`[Image API] Received prompt: "${prompt.substring(0, 50)}..." (${prompt.length} chars)`);

    let selectedProvider = provider || "auto";
    
    // If a specific provider was requested, validate it's available and fallback if needed
    const sdStatus = await aiOrchestrator.getSDStatus();
    const hasMotionModule = sdStatus.currentModel && isMotionModule(sdStatus.currentModel);
    const sdAvailable = sdStatus.available && sdStatus.modelLoaded && !hasMotionModule;
    const hasOpenAI = aiOrchestrator.hasOpenAI();
    
    // Handle force-local provider - NO FALLBACK to OpenAI
    if (selectedProvider === "force-local") {
      console.log(`[Image API] Force Local mode - NO fallback to cloud providers`);
      if (!sdStatus.available) {
        return NextResponse.json(
          { 
            error: "Local Stable Diffusion is offline",
            details: "Start Stable Diffusion WebUI on Windows VM (port 7860). Force Local mode does not fall back to cloud providers."
          },
          { status: 503 }
        );
      }
      if (hasMotionModule) {
        return NextResponse.json(
          { 
            error: `Motion module loaded: ${sdStatus.currentModel}`,
            details: "Load a checkpoint model (Dreamshaper, RealisticVision, SDXL) in SD WebUI. Motion modules are for video generation only."
          },
          { status: 503 }
        );
      }
      if (!sdStatus.modelLoaded) {
        const availableModels = sdStatus.availableModels?.slice(0, 5).join(", ") || "none found";
        return NextResponse.json(
          { 
            error: "No checkpoint model loaded in Stable Diffusion",
            details: `SD is running but no model is loaded. Available models: ${availableModels}. Load a model in SD WebUI.`
          },
          { status: 503 }
        );
      }
      // Force local mode - use SD directly
      selectedProvider = "stable-diffusion";
    }

    if (selectedProvider === "stable-diffusion" && hasMotionModule) {
      console.log(`[Image API] Motion module detected: ${sdStatus.currentModel}`);
      return NextResponse.json(
        { 
          error: `"${sdStatus.currentModel}" is a motion/video module, not an image checkpoint`,
          details: "Load a standard SD model instead. Download a checkpoint model like Dreamshaper, RealisticVision, or SD 1.5/SDXL."
        },
        { status: 400 }
      );
    }
    
    if (selectedProvider !== "auto" && selectedProvider !== "force-local") {
      if (selectedProvider === "openai" && !hasOpenAI) {
        console.log(`[Image API] OpenAI requested but not configured. Checking for fallback...`);
        if (sdAvailable) {
          console.log(`[Image API] Falling back to Stable Diffusion`);
          selectedProvider = "stable-diffusion";
        } else {
          return NextResponse.json(
            { error: "OpenAI not configured", details: "OpenAI API key is not configured and Stable Diffusion is not available. Please configure OpenAI or start Stable Diffusion." },
            { status: 503 }
          );
        }
      } else if (selectedProvider === "stable-diffusion" && !sdAvailable) {
        console.log(`[Image API] Stable Diffusion requested but not available. NO FALLBACK for unrestricted content`);
        const reason = hasMotionModule 
          ? "Current model is a motion module - load a checkpoint like Dreamshaper or RealisticVision."
          : !sdStatus.available 
            ? "Stable Diffusion WebUI is offline. Start SD on Windows VM (port 7860)."
            : "No checkpoint model loaded in SD WebUI. Load a model first.";
        return NextResponse.json(
          { error: "Stable Diffusion not available", details: reason },
          { status: 503 }
        );
      }
    }
    
    // For auto mode, if SD has motion module loaded, skip to OpenAI
    if (selectedProvider === "auto" && hasMotionModule && hasOpenAI) {
      console.log(`[Image API] Auto mode: Motion module detected, using OpenAI instead`);
      selectedProvider = "openai";
    } else if (selectedProvider === "auto" && hasMotionModule && !hasOpenAI) {
      return NextResponse.json(
        { 
          error: "No valid image provider available",
          details: `Current SD model "${sdStatus.currentModel}" is a motion module (for video). Load a checkpoint model or configure OpenAI.`
        },
        { status: 503 }
      );
    }
    
    console.log(`[Image API] Generating with provider: ${selectedProvider}, size: ${size || "1024x1024"}`);
    
    const result = await aiOrchestrator.generateImage({
      prompt,
      negativePrompt,
      size: size || "1024x1024",
      style: style || "vivid",
      provider: selectedProvider,
    });

    if (result.base64) {
      const buffer = Buffer.from(result.base64, "base64");
      console.log(`[Image API] Generated image: ${buffer.length} bytes from ${result.provider}`);
      
      if (buffer.length < 1000) {
        console.error(`[Image API] Image too small (${buffer.length} bytes) - likely generation failed`);
        return NextResponse.json(
          { error: "Image generation failed", details: "Generated image is too small - check SD WebUI model is loaded" },
          { status: 500 }
        );
      }

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Content-Length": buffer.length.toString(),
          "X-Provider": result.provider || selectedProvider,
          "X-Image-Size": buffer.length.toString(),
          "Cache-Control": "no-store",
        },
      });
    }

    if (result.url) {
      const isInternalUrl = result.url.includes("100.118.44.102") || 
                            result.url.includes("100.66.61.51") ||
                            result.url.includes("localhost") ||
                            result.url.includes("127.0.0.1");

      if (isInternalUrl) {
        console.log(`[Image API] Proxying from internal URL: ${result.url}`);
        const response = await fetch(result.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch from internal URL: ${response.status}`);
        }
        
        const buffer = Buffer.from(await response.arrayBuffer());
        console.log(`[Image API] Proxied image: ${buffer.length} bytes`);

        return new NextResponse(buffer, {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Content-Length": buffer.length.toString(),
            "X-Provider": result.provider || selectedProvider,
            "Cache-Control": "no-store",
          },
        });
      }

      return NextResponse.json({ url: result.url, provider: result.provider });
    }

    return NextResponse.json(
      { error: "No image data received", details: "Provider returned empty response" },
      { status: 500 }
    );
  } catch (error: any) {
    console.error("[Image API] Generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate image", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  const sdStatus = await aiOrchestrator.getSDStatus();
  const hasMotionModule = sdStatus.currentModel && isMotionModule(sdStatus.currentModel);
  const sdAvailable = sdStatus.available && sdStatus.modelLoaded && !hasMotionModule;

  let sdDescription = "";
  let motionModuleWarning = "";
  if (!sdStatus.available) {
    sdDescription = sdStatus.error || "Not reachable - start Stable Diffusion WebUI on Windows VM";
  } else if (sdStatus.modelLoading) {
    sdDescription = "Model is currently loading... Please wait.";
  } else if (!sdStatus.modelLoaded) {
    const availableList = sdStatus.availableModels?.slice(0, 3).join(", ") || "none";
    sdDescription = `No model loaded. Available: ${availableList}`;
  } else if (hasMotionModule) {
    sdDescription = `⚠️ Motion module loaded: ${sdStatus.currentModel} - Cannot generate images`;
    motionModuleWarning = "Load a checkpoint model (Dreamshaper, RealisticVision, SDXL) to generate images";
  } else {
    sdDescription = `Using ${sdStatus.currentModel} on RTX 3060 - No content restrictions`;
  }

  // LOCAL ONLY - No cloud providers (OpenAI/DALL-E removed per user requirement)
  const providers = [
    {
      id: "force-local",
      name: "Force Local (Unrestricted)",
      description: sdAvailable 
        ? `NO RESTRICTIONS - Using ${sdStatus.currentModel} on RTX 3060`
        : hasMotionModule 
          ? `Load a checkpoint model first (current: ${sdStatus.currentModel} is a motion module)`
          : sdStatus.available 
            ? "SD online but no checkpoint loaded - load a model in WebUI"
            : "SD offline - start Stable Diffusion WebUI on Windows VM",
      sizes: ["512x512", "768x768", "1024x1024"],
      styles: [],
      available: sdAvailable,
      unrestricted: true,
      noFallback: true,
      currentModel: sdStatus.currentModel,
      modelLoading: sdStatus.modelLoading,
      recommended: true,
    },
    {
      id: "stable-diffusion",
      name: "Stable Diffusion (Local GPU)",
      description: sdDescription,
      sizes: ["512x512", "768x768", "1024x1024"],
      styles: [],
      available: sdAvailable,
      unrestricted: true,
      currentModel: sdStatus.currentModel,
      modelLoading: sdStatus.modelLoading,
    },
  ];

  return NextResponse.json({ 
    providers, 
    sdAvailable,
    sdStatus: {
      available: sdStatus.available,
      modelLoaded: sdStatus.modelLoaded && !hasMotionModule,
      currentModel: sdStatus.currentModel,
      modelLoading: sdStatus.modelLoading,
      availableModels: sdStatus.availableModels,
      error: sdStatus.error,
      vram: sdStatus.vram,
      url: sdStatus.url,
      hasMotionModule,
      motionModuleWarning: motionModuleWarning || undefined,
    }
  });
}
