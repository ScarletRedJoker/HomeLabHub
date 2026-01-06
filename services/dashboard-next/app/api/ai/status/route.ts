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
    const models = await openai.models.list();
    const latency = Date.now() - start;

    const hasGPT4 = models.data.some(m => m.id.includes("gpt-4"));

    return {
      name: "OpenAI",
      status: "connected",
      model: hasGPT4 ? "gpt-4o" : "gpt-3.5-turbo",
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
  const ollamaUrl = process.env.OLLAMA_URL || "http://host.evindrake.net:11434";

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
  const sdUrl = process.env.STABLE_DIFFUSION_URL || "http://host.evindrake.net:7860";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${sdUrl}/sdapi/v1/sd-models`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { name: "Stable Diffusion", status: "error", error: `HTTP ${response.status}` };
    }

    const models = await response.json();
    const modelName = models[0]?.model_name || "Default";

    return {
      name: "Stable Diffusion",
      status: "connected",
      model: modelName,
    };
  } catch (error: any) {
    return { name: "Stable Diffusion", status: "not_configured", error: "Not reachable" };
  }
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [openai, ollama, dalle, sd] = await Promise.all([
    checkOpenAI(),
    checkOllama(),
    checkImageGeneration(),
    checkStableDiffusion(),
  ]);

  const providers = {
    text: [openai, ollama],
    image: [dalle, sd],
    video: [
      { name: "Runway", status: "not_configured" as const, error: "API key not set" },
    ],
  };

  const overallStatus = openai.status === "connected" ? "healthy" : "degraded";

  return NextResponse.json({
    status: overallStatus,
    providers,
    capabilities: {
      chat: openai.status === "connected" || ollama.status === "connected",
      imageGeneration: dalle.status === "connected" || sd.status === "connected",
      videoGeneration: false,
      localLLM: ollama.status === "connected",
    },
  });
}
