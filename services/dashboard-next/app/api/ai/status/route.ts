import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

interface AIProviderStatus {
  name: string;
  status: "connected" | "error" | "not_configured";
  model?: string;
  latency?: number;
  error?: string;
}

async function checkOpenAI(): Promise<AIProviderStatus> {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const directKey = process.env.OPENAI_API_KEY;

  if (!apiKey && !directKey) {
    return { name: "OpenAI", status: "not_configured", error: "No API key configured" };
  }

  try {
    const openai = new OpenAI({
      baseURL: baseURL || undefined,
      apiKey: apiKey || directKey,
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
    return {
      name: "OpenAI",
      status: "error",
      error: error.message || "Connection failed",
    };
  }
}

async function checkOllama(): Promise<AIProviderStatus> {
  const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
  const ollamaUrl = process.env.OLLAMA_URL || `http://${WINDOWS_VM_IP}:11434`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const start = Date.now();
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { name: "Ollama", status: "error", error: `HTTP ${response.status}` };
    }

    const latency = Date.now() - start;
    const data = await response.json();
    const models = data.models?.map((m: any) => m.name) || [];

    return {
      name: "Ollama",
      status: "connected",
      model: models.length > 0 ? models.join(", ") : "No models loaded",
      latency,
    };
  } catch (error: any) {
    if (error.name === "AbortError") {
      return { name: "Ollama", status: "error", error: "Connection timeout" };
    }
    return { name: "Ollama", status: "not_configured", error: "Ollama not reachable" };
  }
}

async function checkImageGeneration(): Promise<AIProviderStatus> {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return { name: "DALL-E 3", status: "not_configured", error: "No API key" };
  }

  return {
    name: "DALL-E 3",
    status: "connected",
    model: "dall-e-3",
  };
}

async function checkStableDiffusion(): Promise<AIProviderStatus> {
  const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
  const sdUrl = process.env.STABLE_DIFFUSION_URL || `http://${WINDOWS_VM_IP}:7860`;

  // Try multiple endpoints - API may vary by SD WebUI version
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
  const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
  const comfyUrl = process.env.COMFYUI_URL || `http://${WINDOWS_VM_IP}:8188`;

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
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [openai, ollama, dalle, sd, comfyui] = await Promise.all([
    checkOpenAI(),
    checkOllama(),
    checkImageGeneration(),
    checkStableDiffusion(),
    checkComfyUI(),
  ]);

  // Check for Replicate API token
  const replicateToken = process.env.REPLICATE_API_TOKEN;
  const replicateStatus: AIProviderStatus = replicateToken
    ? { name: "Replicate", status: "connected", model: "WAN 2.1" }
    : { name: "Replicate", status: "not_configured", error: "No API token" };

  const providers = {
    text: [openai, ollama],
    image: [dalle, sd],
    video: [comfyui, replicateStatus],
  };

  const overallStatus = openai.status === "connected" ? "healthy" : "degraded";

  return NextResponse.json({
    status: overallStatus,
    providers,
    capabilities: {
      chat: openai.status === "connected" || ollama.status === "connected",
      imageGeneration: dalle.status === "connected" || sd.status === "connected",
      videoGeneration: comfyui.status === "connected" || replicateStatus.status === "connected",
      localLLM: ollama.status === "connected",
    },
  });
}
