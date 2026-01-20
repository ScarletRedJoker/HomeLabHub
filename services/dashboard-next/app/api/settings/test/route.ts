import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import OpenAI from "openai";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// LOCAL_AI_ONLY mode: When true, NEVER use cloud AI providers
const LOCAL_AI_ONLY = process.env.LOCAL_AI_ONLY !== "false";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

interface TestResult {
  service: string;
  status: "success" | "error" | "not_configured" | "disabled";
  message: string;
  latency?: number;
  details?: Record<string, any>;
}

async function testOpenAI(): Promise<TestResult> {
  // LOCAL_AI_ONLY MODE: Skip OpenAI test entirely
  if (LOCAL_AI_ONLY) {
    return {
      service: "openai",
      status: "disabled",
      message: "Cloud AI providers disabled (LOCAL_AI_ONLY=true)",
    };
  }

  const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const directKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = (integrationKey && integrationKey.startsWith('sk-')) ? integrationKey : directKey;

  if (!apiKey || !apiKey.startsWith('sk-')) {
    return { 
      service: "openai", 
      status: "not_configured", 
      message: "No valid OpenAI API key configured" 
    };
  }

  try {
    const openai = new OpenAI({
      baseURL: baseURL || undefined,
      apiKey: apiKey.trim(),
    });

    const start = Date.now();
    await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Say OK" }],
      max_tokens: 3,
    });
    const latency = Date.now() - start;

    return {
      service: "openai",
      status: "success",
      message: "OpenAI connection successful",
      latency,
      details: {
        keyPrefix: apiKey.substring(0, 10) + "...",
        hasBaseURL: !!baseURL,
      }
    };
  } catch (error: any) {
    return {
      service: "openai",
      status: "error",
      message: error.message || "OpenAI connection failed",
    };
  }
}

async function testOllama(customUrl?: string): Promise<TestResult> {
  const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
  const ollamaUrl = customUrl || process.env.OLLAMA_URL || `http://${WINDOWS_VM_IP}:11434`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const start = Date.now();
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { 
        service: "ollama", 
        status: "error", 
        message: `Ollama returned HTTP ${response.status}` 
      };
    }

    const latency = Date.now() - start;
    const data = await response.json();
    const models = data.models?.map((m: any) => m.name) || [];

    return {
      service: "ollama",
      status: "success",
      message: `Ollama connected with ${models.length} model(s)`,
      latency,
      details: {
        url: ollamaUrl,
        models: models.slice(0, 5),
      }
    };
  } catch (error: any) {
    if (error.name === "AbortError") {
      return { service: "ollama", status: "error", message: "Connection timeout" };
    }
    return { 
      service: "ollama", 
      status: "not_configured", 
      message: `Cannot connect to Ollama at ${ollamaUrl}` 
    };
  }
}

async function testStableDiffusion(customUrl?: string): Promise<TestResult> {
  const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
  const sdUrl = customUrl || process.env.STABLE_DIFFUSION_URL || `http://${WINDOWS_VM_IP}:7860`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const start = Date.now();
    const response = await fetch(`${sdUrl}/sdapi/v1/sd-models`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { 
        service: "stable_diffusion", 
        status: "error", 
        message: `Stable Diffusion returned HTTP ${response.status}` 
      };
    }

    const latency = Date.now() - start;
    const models = await response.json();

    return {
      service: "stable_diffusion",
      status: "success",
      message: `Stable Diffusion connected with ${models.length} model(s)`,
      latency,
      details: {
        url: sdUrl,
        modelCount: models.length,
      }
    };
  } catch (error: any) {
    if (error.name === "AbortError") {
      return { service: "stable_diffusion", status: "error", message: "Connection timeout" };
    }
    return { 
      service: "stable_diffusion", 
      status: "not_configured", 
      message: `Cannot connect to Stable Diffusion at ${sdUrl}` 
    };
  }
}

async function testDiscord(): Promise<TestResult> {
  const discordBotUrl = process.env.DISCORD_BOT_URL || 
    (process.env.NODE_ENV === "production" ? "http://discord-bot:4000" : "http://localhost:4000");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const start = Date.now();
    const res = await fetch(`${discordBotUrl}/health`, {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const latency = Date.now() - start;
      const data = await res.json();
      const isReady = data.status === "healthy" || data.bot?.ready === true;

      return {
        service: "discord",
        status: isReady ? "success" : "error",
        message: isReady ? "Discord bot is online and ready" : "Discord bot is offline",
        latency,
        details: {
          botReady: data.bot?.ready,
          guilds: data.bot?.guilds,
        }
      };
    }

    return { 
      service: "discord", 
      status: "error", 
      message: `Discord bot returned HTTP ${res.status}` 
    };
  } catch (error: any) {
    return { 
      service: "discord", 
      status: "not_configured", 
      message: "Cannot connect to Discord bot service" 
    };
  }
}

async function testTwitch(): Promise<TestResult> {
  const streamBotUrl = process.env.STREAM_BOT_URL || 
    (process.env.NODE_ENV === "production" ? "http://stream-bot:5000" : "http://localhost:3000");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const start = Date.now();
    const res = await fetch(`${streamBotUrl}/api/platforms/overview`, {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const latency = Date.now() - start;
      const data = await res.json();
      const twitch = data.platforms?.find((p: any) => p.platform === "twitch");

      if (twitch?.isConnected) {
        return {
          service: "twitch",
          status: "success",
          message: "Twitch OAuth is connected",
          latency,
          details: { needsReauth: twitch.needsReauth }
        };
      }
      return { 
        service: "twitch", 
        status: "not_configured", 
        message: "Twitch OAuth not connected" 
      };
    }

    return { 
      service: "twitch", 
      status: "error", 
      message: `Stream bot returned HTTP ${res.status}` 
    };
  } catch (error: any) {
    return { 
      service: "twitch", 
      status: "not_configured", 
      message: "Cannot connect to stream bot service" 
    };
  }
}

async function testYouTube(): Promise<TestResult> {
  const streamBotUrl = process.env.STREAM_BOT_URL || 
    (process.env.NODE_ENV === "production" ? "http://stream-bot:5000" : "http://localhost:3000");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const start = Date.now();
    const res = await fetch(`${streamBotUrl}/api/platforms/overview`, {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const latency = Date.now() - start;
      const data = await res.json();
      const youtube = data.platforms?.find((p: any) => p.platform === "youtube");

      if (youtube?.isConnected) {
        return {
          service: "youtube",
          status: "success",
          message: "YouTube OAuth is connected",
          latency,
          details: { needsReauth: youtube.needsReauth }
        };
      }
      return { 
        service: "youtube", 
        status: "not_configured", 
        message: "YouTube OAuth not connected" 
      };
    }

    return { 
      service: "youtube", 
      status: "error", 
      message: `Stream bot returned HTTP ${res.status}` 
    };
  } catch (error: any) {
    return { 
      service: "youtube", 
      status: "not_configured", 
      message: "Cannot connect to stream bot service" 
    };
  }
}

async function testSSH(serverId: string): Promise<TestResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const start = Date.now();
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/servers`, {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const latency = Date.now() - start;
      const data = await res.json();
      const server = data.servers?.find((s: any) => s.id === serverId);

      if (server) {
        const isOnline = server.status === "online";
        return {
          service: `ssh:${serverId}`,
          status: isOnline ? "success" : "error",
          message: isOnline 
            ? `SSH connection to ${server.name} successful`
            : `SSH connection to ${server.name} failed`,
          latency,
          details: {
            host: server.host,
            status: server.status,
          }
        };
      }
      return { 
        service: `ssh:${serverId}`, 
        status: "error", 
        message: `Server ${serverId} not found` 
      };
    }

    return { 
      service: `ssh:${serverId}`, 
      status: "error", 
      message: `Server API returned HTTP ${res.status}` 
    };
  } catch (error: any) {
    return { 
      service: `ssh:${serverId}`, 
      status: "error", 
      message: error.message || "SSH test failed" 
    };
  }
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { service, options } = body;

    let result: TestResult;

    switch (service) {
      case "openai":
        result = await testOpenAI();
        break;
      case "ollama":
        result = await testOllama(options?.url);
        break;
      case "stable_diffusion":
        result = await testStableDiffusion(options?.url);
        break;
      case "discord":
        result = await testDiscord();
        break;
      case "twitch":
        result = await testTwitch();
        break;
      case "youtube":
        result = await testYouTube();
        break;
      case "ssh":
        if (!options?.serverId) {
          return NextResponse.json({ error: "Server ID required for SSH test" }, { status: 400 });
        }
        result = await testSSH(options.serverId);
        break;
      case "all":
        const [openai, ollama, sd, discord, twitch, youtube] = await Promise.all([
          testOpenAI(),
          testOllama(options?.ollamaUrl),
          testStableDiffusion(options?.sdUrl),
          testDiscord(),
          testTwitch(),
          testYouTube(),
        ]);
        return NextResponse.json({
          success: true,
          results: { openai, ollama, stable_diffusion: sd, discord, twitch, youtube },
          timestamp: new Date().toISOString(),
        });
      default:
        return NextResponse.json({ error: `Unknown service: ${service}` }, { status: 400 });
    }

    return NextResponse.json({
      success: result.status === "success",
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Settings Test API] Error:", error);
    return NextResponse.json({ 
      error: error.message || "Test failed",
      success: false,
    }, { status: 500 });
  }
}
