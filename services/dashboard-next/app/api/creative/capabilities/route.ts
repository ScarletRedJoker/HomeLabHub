/**
 * Creative Capabilities API
 * GET /api/creative/capabilities - Get available creative features and SD status
 * GET /api/creative/capabilities?refresh=true - Force refresh SD status (bypass cache)
 */

import { NextRequest, NextResponse } from "next/server";
import { aiOrchestrator } from "@/lib/ai-orchestrator";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";
    const localAIOnly = process.env.LOCAL_AI_ONLY !== "false";

    if (refresh) {
      await aiOrchestrator.refreshEndpoints();
    }

    const [sdStatus, advancedCapabilities] = await Promise.all([
      aiOrchestrator.getSDStatus(refresh ? 3 : 2),
      aiOrchestrator.getAdvancedCapabilities(),
    ]);

    const hasMotionModule = sdStatus.currentModel?.toLowerCase().includes("motion") ||
      sdStatus.currentModel?.toLowerCase().startsWith("mm_") ||
      sdStatus.currentModel?.toLowerCase().startsWith("mm-");

    const sdReady = sdStatus.available && sdStatus.modelLoaded && !hasMotionModule;

    const capabilities = {
      stableDiffusion: {
        available: sdStatus.available,
        modelLoaded: sdStatus.modelLoaded,
        currentModel: sdStatus.currentModel,
        modelLoading: sdStatus.modelLoading,
        availableModels: sdStatus.availableModels || [],
        url: sdStatus.url,
        vram: sdStatus.vram,
        error: sdStatus.error,
        hasMotionModule,
        ready: sdReady,
      },
      features: {
        textToImage: {
          available: sdReady,
          description: sdReady
            ? `Generate images from text prompts using ${sdStatus.currentModel}`
            : "Requires Stable Diffusion with a loaded checkpoint model",
        },
        imageToImage: {
          available: advancedCapabilities.img2img,
          description: advancedCapabilities.img2img
            ? "Transform existing images based on prompts"
            : "Requires Stable Diffusion to be available",
        },
        inpainting: {
          available: advancedCapabilities.inpainting,
          description: advancedCapabilities.inpainting
            ? "Fill in masked areas of images with AI-generated content"
            : "Requires Stable Diffusion to be available",
        },
        controlnet: {
          available: advancedCapabilities.controlnet.available,
          models: advancedCapabilities.controlnet.models,
          description: advancedCapabilities.controlnet.available
            ? `ControlNet enabled with ${advancedCapabilities.controlnet.models.length} model(s)`
            : "ControlNet extension not installed or no models found",
          supportedTypes: [
            "canny",
            "depth",
            "openpose",
            "softedge",
            "scribble",
            "lineart",
            "tile",
            "ip2p",
            "shuffle",
            "reference",
          ],
        },
        upscaling: {
          available: advancedCapabilities.upscaling.available,
          upscalers: advancedCapabilities.upscaling.upscalers,
          description: advancedCapabilities.upscaling.available
            ? `${advancedCapabilities.upscaling.upscalers.length} upscaler(s) available`
            : "No upscalers found in Stable Diffusion",
        },
        faceSwap: {
          available: advancedCapabilities.faceSwap.available,
          extension: advancedCapabilities.faceSwap.extension,
          description: advancedCapabilities.faceSwap.available
            ? "ReActor face swap extension available"
            : "ReActor extension not installed - install sd-webui-reactor for face swap",
        },
      },
      configuration: {
        localAIOnly,
        message: localAIOnly
          ? "Running in local-only mode. Cloud fallbacks disabled."
          : "Cloud fallbacks enabled if local SD is unavailable.",
      },
      generationTypes: [
        {
          id: "text-to-image",
          name: "Text to Image",
          description: "Generate images from text descriptions",
          available: sdReady,
          requiredFields: ["prompt"],
          optionalFields: ["negativePrompt", "size", "steps", "cfgScale"],
        },
        {
          id: "image-to-image",
          name: "Image to Image",
          description: "Transform an input image based on a prompt",
          available: advancedCapabilities.img2img,
          requiredFields: ["prompt", "image"],
          optionalFields: ["negativePrompt", "denoisingStrength", "size", "steps", "cfgScale"],
        },
        {
          id: "inpainting",
          name: "Inpainting",
          description: "Fill masked areas of an image",
          available: advancedCapabilities.inpainting,
          requiredFields: ["prompt", "image", "mask"],
          optionalFields: ["negativePrompt", "denoisingStrength", "steps", "cfgScale"],
        },
        {
          id: "controlnet",
          name: "ControlNet",
          description: "Control image generation with reference images",
          available: advancedCapabilities.controlnet.available,
          requiredFields: ["prompt", "controlNets"],
          optionalFields: ["negativePrompt", "image", "denoisingStrength", "size", "steps", "cfgScale"],
        },
        {
          id: "upscale",
          name: "Upscale",
          description: "Increase image resolution",
          available: advancedCapabilities.upscaling.available,
          requiredFields: ["image"],
          optionalFields: ["scaleFactor", "upscaler"],
        },
        {
          id: "face-swap",
          name: "Face Swap",
          description: "Swap faces between images",
          available: advancedCapabilities.faceSwap.available,
          requiredFields: ["sourceImage", "targetImage"],
          optionalFields: ["faceIndex", "restoreFace", "upscale"],
        },
      ],
    };

    return NextResponse.json({
      success: true,
      ...capabilities,
    });
  } catch (error) {
    console.error("[Creative Capabilities API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get capabilities",
      },
      { status: 500 }
    );
  }
}
