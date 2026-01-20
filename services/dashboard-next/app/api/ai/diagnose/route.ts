import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// LOCAL_AI_ONLY mode: When true, NEVER use cloud AI providers
const LOCAL_AI_ONLY = process.env.LOCAL_AI_ONLY !== "false";

export async function GET() {
  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    localAIOnly: LOCAL_AI_ONLY,
    checks: {} as Record<string, unknown>,
  };

  const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const directKey = process.env.OPENAI_API_KEY;
  
  const effectiveKey = (integrationKey && integrationKey.startsWith('sk-')) 
    ? integrationKey 
    : directKey;
  
  diagnostics.checks = {
    integrationKeySet: !!integrationKey,
    integrationKeyValid: integrationKey?.startsWith('sk-') ?? false,
    directKeySet: !!directKey,
    directKeyValid: directKey?.startsWith('sk-') ?? false,
    effectiveKeySource: (integrationKey && integrationKey.startsWith('sk-')) 
      ? 'AI_INTEGRATIONS_OPENAI_API_KEY' 
      : directKey 
        ? 'OPENAI_API_KEY' 
        : 'none',
    effectiveKeyValid: effectiveKey?.startsWith('sk-') ?? false,
  };

  // LOCAL_AI_ONLY MODE: Skip OpenAI API calls entirely
  if (LOCAL_AI_ONLY) {
    diagnostics.openaiTest = {
      success: false,
      skipped: true,
      error: 'Cloud AI providers disabled (LOCAL_AI_ONLY=true)',
    };
  } else if (effectiveKey && effectiveKey.startsWith('sk-')) {
    try {
      const client = new OpenAI({ apiKey: effectiveKey });
      const models = await client.models.list();
      const modelList = [];
      for await (const model of models) {
        modelList.push(model.id);
        if (modelList.length >= 5) break;
      }
      diagnostics.openaiTest = {
        success: true,
        modelsFound: modelList.length,
        sampleModels: modelList,
      };
    } catch (error: unknown) {
      diagnostics.openaiTest = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  } else {
    diagnostics.openaiTest = {
      success: false,
      error: 'No valid OpenAI API key configured',
    };
  }

  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (response.ok) {
      const data = await response.json();
      diagnostics.ollamaTest = {
        success: true,
        modelsFound: data.models?.length ?? 0,
      };
    } else {
      diagnostics.ollamaTest = {
        success: false,
        error: `HTTP ${response.status}`,
      };
    }
  } catch (error: unknown) {
    diagnostics.ollamaTest = {
      success: false,
      error: error instanceof Error ? error.message : 'Unreachable',
    };
  }

  return NextResponse.json(diagnostics);
}
