import { NextResponse } from "next/server";
import { aiOrchestrator } from "@/lib/ai-orchestrator";
import { localAIRuntime } from "@/lib/local-ai-runtime";

export async function GET() {
  const diagnostics: string[] = [];
  const errors: string[] = [];
  
  let openaiStatus = { available: false, models: [] as string[], error: null as string | null };
  let ollamaStatus = { available: false, models: [] as string[], error: null as string | null };
  let sdStatus = { available: false, currentModel: null as string | null, models: [] as string[], error: null as string | null };
  let comfyStatus = { available: false, error: null as string | null };
  
  try {
    const hasOpenAI = aiOrchestrator.hasOpenAI();
    openaiStatus.available = hasOpenAI;
    
    if (hasOpenAI) {
      try {
        const models = await aiOrchestrator.getAvailableModels();
        const openaiModels = models.find(m => m.provider === "openai");
        openaiStatus.models = openaiModels?.models || [];
        diagnostics.push(`✅ OpenAI: ${openaiStatus.models.length} models available`);
      } catch (e: any) {
        openaiStatus.error = e.message;
        errors.push(`OpenAI models check failed: ${e.message}`);
      }
    } else {
      diagnostics.push("❌ OpenAI: Not configured (no API key)");
    }
  } catch (e: any) {
    openaiStatus.error = e.message;
    errors.push(`OpenAI check failed: ${e.message}`);
  }
  
  try {
    const runtimes = await localAIRuntime.checkAllRuntimes();
    
    const ollamaRuntime = runtimes.find(r => r.provider === "ollama");
    if (ollamaRuntime) {
      ollamaStatus.available = ollamaRuntime.status === "online";
      if (ollamaRuntime.error) ollamaStatus.error = ollamaRuntime.error;
      
      if (ollamaStatus.available) {
        const models = await localAIRuntime.getOllamaModels();
        ollamaStatus.models = models.map(m => m.id);
        diagnostics.push(`✅ Ollama: ${ollamaStatus.models.length} models (${ollamaRuntime.latencyMs}ms latency)`);
      } else {
        diagnostics.push(`❌ Ollama: ${ollamaRuntime.error || "Offline"} at ${ollamaRuntime.url}`);
      }
    }
    
    const sdRuntime = runtimes.find(r => r.provider === "stable-diffusion");
    if (sdRuntime) {
      sdStatus.available = sdRuntime.status === "online";
      if (sdRuntime.error) sdStatus.error = sdRuntime.error;
      
      if (sdStatus.available) {
        const fullSdStatus = await aiOrchestrator.getSDStatus();
        sdStatus.currentModel = fullSdStatus.currentModel;
        sdStatus.models = fullSdStatus.availableModels;
        diagnostics.push(`✅ Stable Diffusion: Model "${sdStatus.currentModel}" loaded (${sdRuntime.latencyMs}ms)`);
      } else {
        diagnostics.push(`❌ Stable Diffusion: ${sdRuntime.error || "Offline"} at ${sdRuntime.url}`);
      }
    }
    
    const comfyRuntime = runtimes.find(r => r.provider === "comfyui");
    if (comfyRuntime) {
      comfyStatus.available = comfyRuntime.status === "online";
      if (comfyRuntime.error) comfyStatus.error = comfyRuntime.error;
      
      if (comfyStatus.available) {
        diagnostics.push(`✅ ComfyUI: Online (${comfyRuntime.latencyMs}ms, GPU: ${comfyRuntime.gpuUsage || 0}%)`);
      } else {
        diagnostics.push(`❌ ComfyUI: ${comfyRuntime.error || "Offline"} at ${comfyRuntime.url}`);
      }
    }
  } catch (e: any) {
    errors.push(`Runtime check failed: ${e.message}`);
  }
  
  const chatProvider = openaiStatus.available ? "OpenAI" : (ollamaStatus.available ? "Ollama" : "None");
  const imageProvider = sdStatus.available ? "Stable Diffusion" : (openaiStatus.available ? "DALL-E 3" : "None");
  
  diagnostics.push("");
  diagnostics.push("=== Available Capabilities ===");
  diagnostics.push(`Chat/Text: ${chatProvider}`);
  diagnostics.push(`Image Generation: ${imageProvider}`);
  diagnostics.push(`Video Generation: ${comfyStatus.available ? "ComfyUI" : "Unavailable"}`);
  
  if (errors.length > 0) {
    diagnostics.push("");
    diagnostics.push("=== Errors ===");
    errors.forEach(e => diagnostics.push(`⚠️ ${e}`));
  }
  
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    summary: {
      chatAvailable: openaiStatus.available || ollamaStatus.available,
      imageAvailable: sdStatus.available || openaiStatus.available,
      videoAvailable: comfyStatus.available,
      preferredChatProvider: chatProvider,
      preferredImageProvider: imageProvider,
    },
    providers: {
      openai: openaiStatus,
      ollama: ollamaStatus,
      stableDiffusion: sdStatus,
      comfyui: comfyStatus,
    },
    diagnostics,
    errors,
  });
}
