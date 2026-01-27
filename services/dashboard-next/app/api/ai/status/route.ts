import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/session";
import { 
  handleOllamaStatusChange, 
  getStatusCache, 
  setStatusCache, 
  STATUS_CACHE_TTL_MS 
} from "@/lib/ai-status";
import { getAIConfig } from "@/lib/ai/config";

const aiConfig = getAIConfig();
const LOCAL_AI_ONLY = aiConfig.fallback.localOnlyMode;

interface AIProviderStatus {
  name: string;
  status: "connected" | "error" | "not_configured";
  model?: string;
  latency?: number;
  error?: string;
  troubleshooting?: string[];
  url?: string;
}

async function checkOpenAI(): Promise<AIProviderStatus> {
  if (LOCAL_AI_ONLY) {
    return {
      name: "OpenAI",
      status: "not_configured",
      error: "Cloud AI providers disabled (LOCAL_AI_ONLY=true)",
    };
  }

  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const directKey = process.env.OPENAI_API_KEY;
  const projectId = process.env.OPENAI_PROJECT_ID;
  
  const isReplitIntegration = baseURL && baseURL.includes('modelfarm');
  const apiKey = integrationKey || directKey;

  if (!apiKey && !isReplitIntegration) {
    return { name: "OpenAI", status: "not_configured", error: "No valid API key configured" };
  }
  
  if (!isReplitIntegration && apiKey && !apiKey.startsWith('sk-')) {
    return { name: "OpenAI", status: "not_configured", error: "API key must start with 'sk-'" };
  }

  if (isReplitIntegration) {
    return {
      name: "OpenAI",
      status: "connected",
      model: "gpt-4o (via Replit)",
    };
  }

  try {
    const openai = new OpenAI({
      baseURL: baseURL || undefined,
      apiKey: apiKey?.trim() || '',
      ...(projectId && { project: projectId.trim() }),
      timeout: 10000,
    });

    const start = Date.now();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Say OK" }],
      max_tokens: 3,
    });
    const latency = Date.now() - start;

    return {
      name: "OpenAI",
      status: "connected",
      model: "gpt-4o",
      latency,
    };
  } catch (error: any) {
    const errorMsg = error.message || "Connection failed";
    const isTimeoutError = error.name === "AbortError" || errorMsg.includes("timeout") || errorMsg.includes("ETIMEDOUT");
    return {
      name: "OpenAI",
      status: "error",
      error: isTimeoutError ? `Connection timeout (${errorMsg})` : errorMsg,
    };
  }
}

async function checkOllama(): Promise<AIProviderStatus> {
  const ollamaUrl = aiConfig.ollama.url;
  const windowsVMIP = aiConfig.windowsVM.ip;

  const troubleshootingSteps = [
    "Check if Windows VM is powered on",
    `Verify Tailscale connection${windowsVMIP ? ` (ping ${windowsVMIP})` : ""}`,
    "Start Ollama: 'ollama serve' in Windows terminal",
    "Check Windows Firewall allows port 11434",
    `Test: curl ${ollamaUrl}/api/tags`,
  ];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const start = Date.now();
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const result: AIProviderStatus = { 
        name: "Ollama", 
        status: "error", 
        error: `HTTP ${response.status}`,
        url: ollamaUrl,
        troubleshooting: troubleshootingSteps,
      };
      handleOllamaStatusChange(result.status);
      return result;
    }

    const latency = Date.now() - start;
    const data = await response.json();
    const models = data.models?.map((m: any) => m.name) || [];

    const result: AIProviderStatus = {
      name: "Ollama",
      status: "connected",
      model: models.length > 0 ? models.join(", ") : "No models loaded",
      latency,
      url: ollamaUrl,
    };
    handleOllamaStatusChange(result.status);
    return result;
  } catch (error: any) {
    let errorMsg: string;
    if (error.name === "AbortError") {
      errorMsg = `Connection timeout after 5s to ${ollamaUrl}`;
    } else if (error.code === "ECONNREFUSED") {
      errorMsg = `Connection refused - Ollama not running at ${ollamaUrl}`;
    } else if (error.code === "ENOTFOUND" || error.code === "ENETUNREACH") {
      errorMsg = `Cannot reach Windows VM - check Tailscale connection`;
    } else {
      errorMsg = error.message || "Ollama not reachable";
    }
    
    const result: AIProviderStatus = { 
      name: "Ollama", 
      status: "error", 
      error: errorMsg,
      url: ollamaUrl,
      troubleshooting: troubleshootingSteps,
    };
    handleOllamaStatusChange(result.status);
    return result;
  }
}

async function checkImageGeneration(): Promise<AIProviderStatus> {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const directKey = process.env.OPENAI_API_KEY;
  const projectId = process.env.OPENAI_PROJECT_ID;
  
  const isReplitIntegration = baseURL && baseURL.includes('modelfarm');
  const apiKey = integrationKey || directKey;

  if (!apiKey && !isReplitIntegration) {
    return { name: "DALL-E 3", status: "not_configured", error: "No valid API key configured" };
  }
  
  if (!isReplitIntegration && apiKey && !apiKey.startsWith('sk-')) {
    return { name: "DALL-E 3", status: "not_configured", error: "API key must start with 'sk-'" };
  }

  if (isReplitIntegration) {
    return {
      name: "DALL-E 3",
      status: "connected",
      model: "dall-e-3 (via Replit)",
    };
  }

  try {
    const openai = new OpenAI({
      baseURL: baseURL || undefined,
      apiKey: apiKey?.trim() || '',
      ...(projectId && { project: projectId.trim() }),
      timeout: 10000,
    });
    
    const models = await openai.models.list();
    const hasDALLE = models.data.some(m => m.id.includes("dall-e"));
    
    if (!hasDALLE) {
      return { name: "DALL-E 3", status: "error", error: "DALL-E not available on this key" };
    }
    
    return {
      name: "DALL-E 3",
      status: "connected",
      model: "dall-e-3",
    };
  } catch (error: any) {
    const errorMsg = error.message || "Validation failed";
    const isTimeoutError = error.name === "AbortError" || errorMsg.includes("timeout") || errorMsg.includes("ETIMEDOUT");
    return {
      name: "DALL-E 3",
      status: "error",
      error: isTimeoutError ? `Connection timeout (${errorMsg})` : errorMsg,
    };
  }
}

async function checkStableDiffusion(): Promise<AIProviderStatus> {
  const sdUrl = aiConfig.stableDiffusion.url;

  const endpoints = [
    { url: `${sdUrl}/sdapi/v1/sd-models`, parseModels: true },
    { url: `${sdUrl}/internal/ping`, parseModels: false },
    { url: `${sdUrl}/`, parseModels: false },
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(endpoint.url, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      
      if (response.ok) {
        if (endpoint.parseModels) {
          try {
            const models = await response.json();
            const modelName = models[0]?.model_name || "Default";
            return {
              name: "Stable Diffusion",
              status: "connected",
              model: modelName,
            };
          } catch {
            return {
              name: "Stable Diffusion",
              status: "connected",
              model: "WebUI Online",
            };
          }
        }
        
        return {
          name: "Stable Diffusion",
          status: "connected",
          model: "WebUI Online",
        };
      }
    } catch {
      // Try next endpoint
    }
  }

  return { name: "Stable Diffusion", status: "not_configured", error: "Not reachable" };
}

async function checkComfyUI(): Promise<AIProviderStatus> {
  const comfyUrl = aiConfig.comfyui.url;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${comfyUrl}/system_stats`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      return {
        name: "ComfyUI",
        status: "connected",
        model: "Video Generation Ready",
      };
    }

    return { name: "ComfyUI", status: "error", error: `HTTP ${response.status}` };
  } catch (error: any) {
    return { name: "ComfyUI", status: "not_configured", error: "Not reachable" };
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "true";
  
  const statusCache = getStatusCache();
  if (!forceRefresh && statusCache && (Date.now() - statusCache.timestamp) < STATUS_CACHE_TTL_MS) {
    console.log(`[AI Status] Returning cached status (age: ${Math.round((Date.now() - statusCache.timestamp) / 1000)}s)`);
    return NextResponse.json({
      ...statusCache.data,
      cached: true,
      cacheAge: Date.now() - statusCache.timestamp,
    });
  }

  const [openai, ollama, dalle, sd, comfyui] = await Promise.all([
    checkOpenAI(),
    checkOllama(),
    checkImageGeneration(),
    checkStableDiffusion(),
    checkComfyUI(),
  ]);

  const replicateToken = process.env.REPLICATE_API_TOKEN;
  const replicateStatus: AIProviderStatus = replicateToken
    ? { name: "Replicate", status: "connected", model: "WAN 2.1" }
    : { name: "Replicate", status: "not_configured", error: "No API token" };

  const providers = {
    text: [openai, ollama],
    image: [dalle, sd],
    video: [comfyui, replicateStatus],
  };

  let overallStatus: "healthy" | "degraded" | "local_only" | "offline";
  
  if (LOCAL_AI_ONLY) {
    if (ollama.status === "connected") {
      overallStatus = "local_only";
    } else {
      overallStatus = "offline";
    }
  } else {
    if (openai.status === "connected" || ollama.status === "connected") {
      overallStatus = "healthy";
    } else {
      overallStatus = "degraded";
    }
  }

  const responseData = {
    status: overallStatus,
    localAIOnly: LOCAL_AI_ONLY,
    providers,
    capabilities: {
      chat: ollama.status === "connected" || (!LOCAL_AI_ONLY && openai.status === "connected"),
      imageGeneration: sd.status === "connected" || (!LOCAL_AI_ONLY && dalle.status === "connected"),
      videoGeneration: comfyui.status === "connected" || (!LOCAL_AI_ONLY && replicateStatus.status === "connected"),
      localLLM: ollama.status === "connected",
      localImageGen: sd.status === "connected",
      localVideoGen: comfyui.status === "connected",
    },
    localAI: {
      ollama: {
        online: ollama.status === "connected",
        url: (ollama as any).url,
        latency: ollama.latency,
        models: ollama.model,
        error: ollama.error,
        troubleshooting: (ollama as any).troubleshooting,
      },
      stableDiffusion: {
        online: sd.status === "connected",
        model: sd.model,
        error: sd.error,
      },
      comfyUI: {
        online: comfyui.status === "connected",
        error: comfyui.error,
      },
    },
    timestamp: new Date().toISOString(),
  };

  setStatusCache(responseData);

  return NextResponse.json(responseData);
}
