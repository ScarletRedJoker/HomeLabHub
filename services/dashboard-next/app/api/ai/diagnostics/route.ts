import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function GET(request: NextRequest) {
  const diagnostics: Record<string, any> = {
    timestamp: new Date().toISOString(),
    environment: {},
    tests: {},
  };

  diagnostics.environment = {
    hasOpenAIKey: !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    hasOpenAIBaseURL: !!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    hasLegacyKey: !!process.env.OPENAI_API_KEY,
    ollamaUrl: process.env.OLLAMA_URL || "not set (using default)",
    sdUrl: process.env.STABLE_DIFFUSION_URL || "not set",
    nodeEnv: process.env.NODE_ENV,
  };

  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const directKey = process.env.OPENAI_API_KEY;
  // Skip dummy/placeholder keys
  const apiKey = (integrationKey && integrationKey.startsWith('sk-')) ? integrationKey : directKey;
  const projectId = process.env.OPENAI_PROJECT_ID;

  if (apiKey && apiKey.startsWith('sk-')) {
    const openai = new OpenAI({
      baseURL: baseURL || undefined,
      apiKey: apiKey.trim(),
      ...(projectId && { project: projectId.trim() }),
    });

    diagnostics.environment.baseURLUsed = baseURL || "default (api.openai.com)";

    try {
      const chatStart = Date.now();
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Say 'OK' and nothing else." }],
        max_tokens: 5,
      });
      const chatLatency = Date.now() - chatStart;

      diagnostics.tests.openai = {
        status: "success",
        latency: `${chatLatency}ms`,
        model: "gpt-4o-mini",
      };

      diagnostics.tests.chatCompletion = {
        status: "success",
        latency: `${chatLatency}ms`,
        response: completion.choices[0]?.message?.content,
        usage: completion.usage,
      };
    } catch (error: any) {
      diagnostics.tests.openai = {
        status: "error",
        error: error.message,
        code: error.code,
        type: error.type,
        statusCode: error.status,
      };
      diagnostics.tests.chatCompletion = {
        status: "error",
        error: error.message,
      };
    }
  } else {
    diagnostics.tests.openai = {
      status: "not_configured",
      reason: "No API key found in AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY",
    };
  }

  const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
  const ollamaUrl = process.env.OLLAMA_URL || `http://${WINDOWS_VM_IP}:11434`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${ollamaUrl}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      diagnostics.tests.ollama = {
        status: "reachable",
        models: data.models?.map((m: any) => m.name) || [],
      };
    } else {
      diagnostics.tests.ollama = {
        status: "error",
        httpStatus: response.status,
      };
    }
  } catch (error: any) {
    diagnostics.tests.ollama = {
      status: "unreachable",
      error: error.name === "AbortError" ? "timeout" : error.message,
    };
  }

  const allTestsPassed = diagnostics.tests.openai?.status === "success" &&
    diagnostics.tests.chatCompletion?.status === "success";

  diagnostics.summary = {
    aiReady: allTestsPassed,
    openaiConnected: diagnostics.tests.openai?.status === "success",
    ollamaAvailable: diagnostics.tests.ollama?.status === "reachable",
  };

  return NextResponse.json(diagnostics, {
    status: allTestsPassed ? 200 : 503,
  });
}
