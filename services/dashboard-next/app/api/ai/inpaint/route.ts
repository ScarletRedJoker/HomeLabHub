import { NextRequest, NextResponse } from "next/server";
import { getAIConfig } from "@/lib/ai/config";

const SD_WEBUI_URL = process.env.STABLE_DIFFUSION_URL || 
  (process.env.WINDOWS_VM_TAILSCALE_IP 
    ? `http://${process.env.WINDOWS_VM_TAILSCALE_IP}:7860`
    : "http://100.118.44.102:7860");

interface InpaintRequest {
  image: string;
  mask: string;
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  denoisingStrength?: number;
  sampler?: string;
  seed?: number;
  maskBlur?: number;
  inpaintingFill?: number;
  inpaintFullRes?: boolean;
  inpaintFullResPadding?: number;
}

export async function GET() {
  try {
    const response = await fetch(`${SD_WEBUI_URL}/sdapi/v1/options`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      return NextResponse.json({
        available: true,
        url: SD_WEBUI_URL,
        message: "Stable Diffusion WebUI is available for inpainting",
      });
    }

    return NextResponse.json({
      available: false,
      error: "Stable Diffusion WebUI not responding",
    });
  } catch (error: any) {
    return NextResponse.json({
      available: false,
      error: error.message || "Failed to connect to Stable Diffusion WebUI",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: InpaintRequest = await request.json();
    const {
      image,
      mask,
      prompt,
      negativePrompt = "blurry, low quality, distorted, ugly, deformed",
      width = 512,
      height = 512,
      steps = 30,
      cfgScale = 7,
      denoisingStrength = 0.75,
      sampler = "DPM++ 2M Karras",
      seed = -1,
      maskBlur = 4,
      inpaintingFill = 1,
      inpaintFullRes = true,
      inpaintFullResPadding = 32,
    } = body;

    if (!image || !mask || !prompt) {
      return NextResponse.json(
        { error: "Missing required fields: image, mask, and prompt are required" },
        { status: 400 }
      );
    }

    const imageBase64 = image.startsWith("data:") 
      ? image.split(",")[1] 
      : image;
    const maskBase64 = mask.startsWith("data:") 
      ? mask.split(",")[1] 
      : mask;

    const sdPayload = {
      init_images: [`data:image/png;base64,${imageBase64}`],
      mask: `data:image/png;base64,${maskBase64}`,
      prompt,
      negative_prompt: negativePrompt,
      width,
      height,
      steps,
      cfg_scale: cfgScale,
      denoising_strength: denoisingStrength,
      sampler_name: sampler,
      seed,
      mask_blur: maskBlur,
      inpainting_fill: inpaintingFill,
      inpaint_full_res: inpaintFullRes,
      inpaint_full_res_padding: inpaintFullResPadding,
      resize_mode: 1,
      inpainting_mask_invert: 0,
    };

    console.log(`[Inpaint] Sending request to ${SD_WEBUI_URL}/sdapi/v1/img2img`);
    console.log(`[Inpaint] Prompt: ${prompt}`);
    console.log(`[Inpaint] Size: ${width}x${height}, Steps: ${steps}, CFG: ${cfgScale}`);

    const response = await fetch(`${SD_WEBUI_URL}/sdapi/v1/img2img`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sdPayload),
      signal: AbortSignal.timeout(180000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Inpaint] SD WebUI error: ${response.status}`, errorText);
      return NextResponse.json(
        { 
          error: "Stable Diffusion WebUI error", 
          details: errorText,
          status: response.status 
        },
        { status: response.status }
      );
    }

    const result = await response.json();

    if (!result.images || result.images.length === 0) {
      return NextResponse.json(
        { error: "No images generated" },
        { status: 500 }
      );
    }

    const generatedImage = result.images[0];
    const info = result.info ? JSON.parse(result.info) : {};

    console.log(`[Inpaint] Successfully generated image with seed: ${info.seed || "unknown"}`);

    return NextResponse.json({
      success: true,
      image: generatedImage,
      info: {
        seed: info.seed,
        prompt: info.prompt,
        negative_prompt: info.negative_prompt,
        steps: info.steps,
        cfg_scale: info.cfg_scale,
        denoising_strength: info.denoising_strength,
        sampler: info.sampler_name,
        width: info.width,
        height: info.height,
      },
    });
  } catch (error: any) {
    console.error("[Inpaint] Error:", error);

    if (error.name === "AbortError" || error.message?.includes("timeout")) {
      return NextResponse.json(
        { error: "Request timed out. The image generation may be taking too long." },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { 
        error: "Failed to inpaint image", 
        details: error.message || "Unknown error" 
      },
      { status: 500 }
    );
  }
}
