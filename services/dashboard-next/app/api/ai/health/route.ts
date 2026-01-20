import { NextRequest, NextResponse } from "next/server";
import { localAIRuntime } from "@/lib/local-ai-runtime";
import { aiFallbackManager } from "@/lib/ai-fallback";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCAL_AI_ONLY = process.env.LOCAL_AI_ONLY === "true";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

function getOllamaEndpoints(): string[] {
  const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
  const UBUNTU_IP = process.env.UBUNTU_TAILSCALE_IP || "100.66.61.51";
  
  const endpoints: string[] = [];
  
  if (process.env.OLLAMA_URL) {
    endpoints.push(process.env.OLLAMA_URL);
  } else {
    endpoints.push(`http://${WINDOWS_VM_IP}:11434`);
  }
  
  if (process.env.OLLAMA_FALLBACK_URL) {
    endpoints.push(process.env.OLLAMA_FALLBACK_URL);
  } else {
    endpoints.push(`http://${UBUNTU_IP}:11434`);
  }
  
  return endpoints;
}

interface EndpointStatus {
  url: string;
  status: "online" | "offline" | "degraded";
  latencyMs?: number;
  error?: string;
  models?: string[];
}

async function testEndpoint(url: string): Promise<EndpointStatus> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${url}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      return {
        url,
        status: "offline",
        latencyMs,
        error: `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    const models = (data.models || []).map((m: { name: string }) => m.name);

    return {
      url,
      status: latencyMs > 2000 ? "degraded" : "online",
      latencyMs,
      models,
    };
  } catch (error: any) {
    return {
      url,
      status: "offline",
      latencyMs: Date.now() - start,
      error: error.name === "AbortError" ? "Connection timeout (5s)" : error.message,
    };
  }
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "true";

  if (forceRefresh) {
    aiFallbackManager.invalidateCache();
    localAIRuntime.invalidateOllamaHealthCache();
  }

  const endpoints = getOllamaEndpoints();
  const endpointResults = await Promise.all(endpoints.map(testEndpoint));

  const ollamaHealth = await aiFallbackManager.checkOllamaHealth(forceRefresh);
  const openaiHealth = await aiFallbackManager.checkOpenAIHealth();
  const metrics = aiFallbackManager.getMetrics();

  const anyOllamaOnline = endpointResults.some(e => e.status === "online" || e.status === "degraded");
  const allModels = Array.from(new Set(endpointResults.flatMap(e => e.models || [])));

  const troubleshooting = [];
  
  if (!anyOllamaOnline) {
    troubleshooting.push({
      issue: "Local AI (Ollama) is offline",
      steps: [
        "1. Check if the Windows VM is running (KVM/QEMU)",
        "2. Verify Tailscale connection is active on both machines",
        "3. SSH into Windows VM and run: ollama serve",
        "4. Check Windows firewall allows port 11434",
        "5. Test manually: curl http://<VM_IP>:11434/api/tags",
      ],
    });
  }

  if (openaiHealth.status === "offline") {
    troubleshooting.push({
      issue: "OpenAI cloud is not configured",
      steps: [
        "1. Set OPENAI_API_KEY environment variable",
        "2. Or set AI_INTEGRATIONS_OPENAI_API_KEY",
        "3. Ensure the API key starts with 'sk-'",
      ],
    });
  }

  const fallbackAvailable = !LOCAL_AI_ONLY && openaiHealth.status === "online";

  return NextResponse.json({
    localAIOnly: LOCAL_AI_ONLY,
    fallbackAvailable,
    timestamp: new Date().toISOString(),
    providers: {
      ollama: {
        status: anyOllamaOnline ? "online" : "offline",
        health: ollamaHealth,
        endpoints: endpointResults,
        availableModels: allModels,
      },
      openai: {
        status: openaiHealth.status,
        configured: openaiHealth.status !== "offline",
        error: openaiHealth.error,
      },
    },
    metrics,
    troubleshooting: troubleshooting.length > 0 ? troubleshooting : undefined,
    recommendation: LOCAL_AI_ONLY && !anyOllamaOnline
      ? "Local AI is required but offline. Start Ollama on your Windows VM."
      : anyOllamaOnline
      ? "Using local AI (preferred)"
      : fallbackAvailable
      ? "Using OpenAI cloud fallback (local AI offline)"
      : "No AI providers available. Configure OPENAI_API_KEY for cloud fallback.",
  });
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { action, endpoint } = await request.json();

  if (action === "test") {
    const url = endpoint || getOllamaEndpoints()[0];
    const result = await testEndpoint(url);
    
    return NextResponse.json({
      success: result.status !== "offline",
      result,
    });
  }

  if (action === "refresh") {
    aiFallbackManager.invalidateCache();
    localAIRuntime.invalidateOllamaHealthCache();
    
    const ollamaHealth = await aiFallbackManager.checkOllamaHealth(true);
    const openaiHealth = await aiFallbackManager.checkOpenAIHealth();
    
    return NextResponse.json({
      success: true,
      ollama: ollamaHealth,
      openai: openaiHealth,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
