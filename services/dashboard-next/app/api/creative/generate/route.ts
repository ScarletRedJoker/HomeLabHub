/**
 * Unified Creative Generation API
 * POST /api/creative/generate - Generate creative content
 * Types: text-to-image, image-to-image, inpainting, controlnet, upscale, face-swap
 * Saves results to creative_jobs table
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { creativeJobs, type NewCreativeJob } from "@/lib/db/platform-schema";
import { aiOrchestrator } from "@/lib/ai-orchestrator";
import { eq } from "drizzle-orm";

type GenerationType =
  | "text-to-image"
  | "image-to-image"
  | "inpainting"
  | "controlnet"
  | "upscale"
  | "face-swap";

interface GenerateRequest {
  type: GenerationType;
  prompt?: string;
  negativePrompt?: string;
  image?: string;
  mask?: string;
  sourceImage?: string;
  targetImage?: string;
  controlNets?: Array<{
    image: string;
    controlType: string;
    weight?: number;
    guidanceStart?: number;
    guidanceEnd?: number;
  }>;
  size?: string;
  steps?: number;
  cfgScale?: number;
  denoisingStrength?: number;
  scaleFactor?: 2 | 4;
  upscaler?: string;
  userId?: string;
  saveToDb?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();

    const { type, saveToDb = true } = body;

    if (!type) {
      return NextResponse.json(
        { success: false, error: "Generation type is required" },
        { status: 400 }
      );
    }

    const validTypes: GenerationType[] = [
      "text-to-image",
      "image-to-image",
      "inpainting",
      "controlnet",
      "upscale",
      "face-swap",
    ];

    if (!validTypes.includes(type)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const localAIOnly = process.env.LOCAL_AI_ONLY !== "false";
    const sdStatus = await aiOrchestrator.getSDStatus();

    if (!sdStatus.available) {
      const errorMsg = localAIOnly
        ? "Local Stable Diffusion is offline. Start SD WebUI on your Windows VM (port 7860) or set LOCAL_AI_ONLY=false."
        : "Stable Diffusion is offline. Please start SD WebUI.";
      return NextResponse.json(
        { success: false, error: errorMsg, sdStatus },
        { status: 503 }
      );
    }

    if (!sdStatus.modelLoaded) {
      const availableModels = sdStatus.availableModels?.slice(0, 5).join(", ") || "none found";
      return NextResponse.json(
        {
          success: false,
          error: `No model loaded in Stable Diffusion. Available models: ${availableModels}. Load a model in SD WebUI first.`,
          sdStatus,
        },
        { status: 503 }
      );
    }

    let jobId: number | null = null;
    if (saveToDb) {
      try {
        const newJob: NewCreativeJob = {
          type,
          status: "processing",
          prompt: body.prompt || "",
          negativePrompt: body.negativePrompt || null,
          parameters: {
            size: body.size,
            steps: body.steps,
            cfgScale: body.cfgScale,
            denoisingStrength: body.denoisingStrength,
            scaleFactor: body.scaleFactor,
            upscaler: body.upscaler,
          },
          inputImages: getInputImages(body),
          outputImages: [],
          userId: body.userId || null,
          controlnetConfig: body.controlNets || null,
        };

        const [insertedJob] = await db.insert(creativeJobs).values(newJob).returning();
        jobId = insertedJob.id;
        console.log(`[Creative Generate API] Created job ${jobId} for ${type}`);
      } catch (dbError) {
        console.warn(`[Creative Generate API] Could not save job to database (table may not exist): ${dbError}`);
      }
    }

    let result;
    try {
      result = await executeGeneration(type, body);
    } catch (genError) {
      if (jobId) {
        try {
          await db
            .update(creativeJobs)
            .set({
              status: "failed",
              error: genError instanceof Error ? genError.message : "Generation failed",
              updatedAt: new Date(),
            })
            .where(eq(creativeJobs.id, jobId));
        } catch {
          console.warn("[Creative Generate API] Could not update job status");
        }
      }
      throw genError;
    }

    if (jobId && result) {
      try {
        const outputImages = [];
        if (result.base64) {
          outputImages.push({
            type: "base64",
            data: result.base64,
            provider: result.provider,
          });
        }
        if (result.url) {
          outputImages.push({
            type: "url",
            url: result.url,
            provider: result.provider,
          });
        }

        await db
          .update(creativeJobs)
          .set({
            status: "completed",
            outputImages,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(creativeJobs.id, jobId));

        console.log(`[Creative Generate API] Completed job ${jobId}`);
      } catch {
        console.warn("[Creative Generate API] Could not update job completion status");
      }
    }

    const images: Array<{ base64?: string; url?: string; provider: string }> = [];
    
    if (result?.base64 || result?.url) {
      images.push({
        base64: result.base64,
        url: result.url,
        provider: result.provider || "stable-diffusion",
      });
    }

    const response: Record<string, unknown> = {
      success: true,
      type,
      provider: result?.provider || "stable-diffusion",
      jobId: jobId ?? undefined,
      images,
      base64: result?.base64,
      url: result?.url,
      revisedPrompt: result?.revisedPrompt,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Creative Generate API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Generation failed",
        images: [],
        jobId: null,
      },
      { status: 500 }
    );
  }
}

function getInputImages(body: GenerateRequest): string[] {
  const images: string[] = [];

  if (body.image) {
    images.push(body.image.substring(0, 100) + "...");
  }
  if (body.mask) {
    images.push("mask:" + body.mask.substring(0, 50) + "...");
  }
  if (body.sourceImage) {
    images.push("source:" + body.sourceImage.substring(0, 50) + "...");
  }
  if (body.targetImage) {
    images.push("target:" + body.targetImage.substring(0, 50) + "...");
  }
  if (body.controlNets) {
    body.controlNets.forEach((cn, i) => {
      images.push(`controlnet_${i}:${cn.controlType}`);
    });
  }

  return images;
}

async function executeGeneration(type: GenerationType, body: GenerateRequest) {
  switch (type) {
    case "text-to-image":
      if (!body.prompt) {
        throw new Error("Prompt is required for text-to-image generation");
      }
      return await aiOrchestrator.generateImage({
        prompt: body.prompt,
        negativePrompt: body.negativePrompt,
        size: parseSize(body.size),
        provider: "stable-diffusion",
      });

    case "image-to-image":
      if (!body.image) {
        throw new Error("Input image is required for image-to-image generation");
      }
      if (!body.prompt) {
        throw new Error("Prompt is required for image-to-image generation");
      }
      return await aiOrchestrator.img2img({
        image: body.image,
        prompt: body.prompt,
        negativePrompt: body.negativePrompt,
        denoisingStrength: body.denoisingStrength,
        size: parseImg2ImgSize(body.size),
        steps: body.steps,
        cfgScale: body.cfgScale,
      });

    case "inpainting":
      if (!body.image) {
        throw new Error("Input image is required for inpainting");
      }
      if (!body.mask) {
        throw new Error("Mask image is required for inpainting");
      }
      if (!body.prompt) {
        throw new Error("Prompt is required for inpainting");
      }
      return await aiOrchestrator.inpaint({
        image: body.image,
        mask: body.mask,
        prompt: body.prompt,
        negativePrompt: body.negativePrompt,
        denoisingStrength: body.denoisingStrength,
        steps: body.steps,
        cfgScale: body.cfgScale,
      });

    case "controlnet":
      if (!body.prompt) {
        throw new Error("Prompt is required for ControlNet generation");
      }
      if (!body.controlNets || body.controlNets.length === 0) {
        throw new Error("At least one ControlNet unit is required");
      }
      return await aiOrchestrator.controlnet({
        prompt: body.prompt,
        negativePrompt: body.negativePrompt,
        controlNets: body.controlNets.map((cn) => ({
          image: cn.image,
          controlType: cn.controlType as any,
          weight: cn.weight,
          guidanceStart: cn.guidanceStart,
          guidanceEnd: cn.guidanceEnd,
        })),
        size: parseImg2ImgSize(body.size),
        steps: body.steps,
        cfgScale: body.cfgScale,
        inputImage: body.image,
        denoisingStrength: body.denoisingStrength,
      });

    case "upscale":
      if (!body.image) {
        throw new Error("Input image is required for upscaling");
      }
      return await aiOrchestrator.upscale({
        image: body.image,
        scaleFactor: body.scaleFactor,
        upscaler: body.upscaler,
      });

    case "face-swap":
      if (!body.sourceImage) {
        throw new Error("Source image (face to use) is required for face swap");
      }
      if (!body.targetImage) {
        throw new Error("Target image (image to swap face into) is required for face swap");
      }
      return await aiOrchestrator.faceSwap({
        sourceImage: body.sourceImage,
        targetImage: body.targetImage,
      });

    default:
      throw new Error(`Unsupported generation type: ${type}`);
  }
}

function parseSize(size?: string): "1024x1024" | "1792x1024" | "1024x1792" | "512x512" {
  const valid = ["1024x1024", "1792x1024", "1024x1792", "512x512"];
  if (size && valid.includes(size)) {
    return size as any;
  }
  return "512x512";
}

function parseImg2ImgSize(size?: string): "512x512" | "768x768" | "1024x1024" {
  const valid = ["512x512", "768x768", "1024x1024"];
  if (size && valid.includes(size)) {
    return size as any;
  }
  return "512x512";
}
