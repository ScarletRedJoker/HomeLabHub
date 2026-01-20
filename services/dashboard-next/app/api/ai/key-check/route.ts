import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

// LOCAL_AI_ONLY mode: When true, NEVER use cloud AI providers
const LOCAL_AI_ONLY = process.env.LOCAL_AI_ONLY !== "false";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // LOCAL_AI_ONLY MODE: Skip OpenAI key check entirely
  if (LOCAL_AI_ONLY) {
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      localAIOnly: true,
      validation: "DISABLED",
      message: "OpenAI key check skipped - cloud AI providers are disabled (LOCAL_AI_ONLY=true)",
    });
  }

  const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const legacyKey = process.env.OPENAI_API_KEY;
  const activeKey = integrationKey || legacyKey;

  const projectId = process.env.OPENAI_PROJECT_ID;
  
  const diagnostics: Record<string, any> = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    keySource: integrationKey ? "AI_INTEGRATIONS_OPENAI_API_KEY" : legacyKey ? "OPENAI_API_KEY" : "none",
    keyPresent: !!activeKey,
    projectId: projectId ? { present: true, prefix: projectId.substring(0, 10) } : { present: false },
  };

  if (activeKey) {
    const trimmedKey = activeKey.trim();
    diagnostics.keyInfo = {
      originalLength: activeKey.length,
      trimmedLength: trimmedKey.length,
      hasLeadingWhitespace: activeKey !== activeKey.trimStart(),
      hasTrailingWhitespace: activeKey !== activeKey.trimEnd(),
      prefix: trimmedKey.substring(0, 7),
      suffix: trimmedKey.substring(trimmedKey.length - 4),
      startsWithSk: trimmedKey.startsWith("sk-"),
      hasNewlines: activeKey.includes("\n") || activeKey.includes("\r"),
    };

    if (!trimmedKey.startsWith("sk-")) {
      diagnostics.error = "API key does not start with 'sk-' - invalid format";
      diagnostics.validation = "INVALID_FORMAT";
      return NextResponse.json(diagnostics, { status: 400 });
    }

    try {
      const openai = new OpenAI({
        apiKey: trimmedKey,
        ...(projectId && { project: projectId.trim() }),
      });

      const start = Date.now();
      const models = await openai.models.list();
      const latency = Date.now() - start;

      diagnostics.validation = "VALID";
      diagnostics.test = {
        status: "success",
        latency: `${latency}ms`,
        modelsAvailable: models.data.length,
      };

      const hasImageModel = models.data.some(m => m.id.includes("dall-e"));
      diagnostics.capabilities = {
        hasChat: models.data.some(m => m.id.includes("gpt")),
        hasImages: hasImageModel,
        hasWhisper: models.data.some(m => m.id.includes("whisper")),
      };

      if (!hasImageModel) {
        diagnostics.warning = "No DALL-E models available - image generation may fail. Check your OpenAI billing and plan.";
      }

    } catch (error: any) {
      diagnostics.validation = "INVALID";
      diagnostics.test = {
        status: "error",
        error: error.message,
        code: error.code,
        type: error.type,
        statusCode: error.status,
      };

      if (error.status === 401) {
        diagnostics.error = "API key is invalid or expired";
        diagnostics.suggestion = "Generate a new API key at https://platform.openai.com/api-keys";
      } else if (error.status === 429) {
        diagnostics.error = "Rate limited or quota exceeded";
        diagnostics.suggestion = "Check your OpenAI billing at https://platform.openai.com/usage";
      }
    }
  } else {
    diagnostics.error = "No OpenAI API key configured";
    diagnostics.suggestion = "Set OPENAI_API_KEY environment variable";
  }

  return NextResponse.json(diagnostics);
}
