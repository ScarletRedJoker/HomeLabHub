import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { localAIRuntime } from "@/lib/local-ai-runtime";
import { modelRegistry } from "@/lib/model-registry";

const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
const OLLAMA_URL = process.env.OLLAMA_URL || `http://${WINDOWS_VM_IP}:11434`;

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model?: string;
    format: string;
    family: string;
    families?: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider");
  const includeInventory = searchParams.get("inventory") === "true";

  try {
    if (includeInventory) {
      const inventory = await modelRegistry.getLocalModels();
      return NextResponse.json({
        inventory,
        timestamp: new Date().toISOString(),
      });
    }

    if (provider === "all" || !provider) {
      const models = await localAIRuntime.getAllModels();
      return NextResponse.json({
        models: models.map(m => ({
          name: m.id,
          sizeFormatted: m.size,
          parameterSize: m.parameters ? `${Math.round(m.parameters / 1e9)}B` : undefined,
          quantization: m.quantization,
          provider: m.provider,
          type: m.type,
          loaded: m.loaded,
        })),
        count: models.length,
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to connect to Ollama", status: response.status },
        { status: 502 }
      );
    }

    const data = await response.json();
    const ollamaModels: OllamaModel[] = data.models || [];

    const runningResponse = await fetch(`${OLLAMA_URL}/api/ps`).catch(() => null);
    const loadedNames = new Set<string>();
    if (runningResponse?.ok) {
      const running = await runningResponse.json();
      (running.models || []).forEach((m: { name: string }) => loadedNames.add(m.name));
    }

    const formattedModels = ollamaModels.map((model) => ({
      name: model.name,
      model: model.model,
      modifiedAt: model.modified_at,
      size: model.size,
      sizeFormatted: formatBytes(model.size),
      digest: model.digest,
      details: model.details,
      parameterSize: model.details?.parameter_size || "Unknown",
      quantization: model.details?.quantization_level || "Unknown",
      family: model.details?.family || "Unknown",
      loaded: loadedNames.has(model.name),
    }));

    return NextResponse.json({
      models: formattedModels,
      ollamaUrl: OLLAMA_URL,
      count: formattedModels.length,
    });
  } catch (error: any) {
    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Connection to Ollama timed out" },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: "Failed to fetch models", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { model, action } = body;

    if (!model) {
      return NextResponse.json({ error: "Model name is required" }, { status: 400 });
    }

    if (action === "pull") {
      const result = await localAIRuntime.pullOllamaModel(model);
      if (!result.success) {
        return NextResponse.json(
          { error: "Failed to pull model", details: result.message },
          { status: 500 }
        );
      }
      return NextResponse.json({
        success: true,
        message: result.message,
      });
    }

    if (action === "load") {
      const result = await localAIRuntime.loadOllamaModel(model);
      if (!result.success) {
        return NextResponse.json(
          { error: "Failed to load model", details: result.message },
          { status: 500 }
        );
      }
      return NextResponse.json({
        success: true,
        message: result.message,
      });
    }

    if (action === "unload") {
      const result = await localAIRuntime.unloadOllamaModel(model);
      if (!result.success) {
        return NextResponse.json(
          { error: "Failed to unload model", details: result.message },
          { status: 500 }
        );
      }
      return NextResponse.json({
        success: true,
        message: result.message,
      });
    }

    if (action === "pull-stream") {
      const response = await fetch(`${OLLAMA_URL}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: model, stream: true }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json(
          { error: "Failed to start pull", details: errorText },
          { status: response.status }
        );
      }

      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body?.getReader();
          if (!reader) {
            controller.close();
            return;
          }

          const decoder = new TextDecoder();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const text = decoder.decode(value, { stream: true });
              controller.enqueue(new TextEncoder().encode(text));
            }
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Transfer-Encoding": "chunked",
        },
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to process request", details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { model, modelId } = body;

    const targetModel = modelId || model;
    if (!targetModel) {
      return NextResponse.json({ error: "Model name or modelId is required" }, { status: 400 });
    }

    if (modelId && modelId.includes(":")) {
      const result = await modelRegistry.deleteLocalModel(modelId);
      if (!result.success) {
        return NextResponse.json(
          { error: "Failed to delete model", details: result.message },
          { status: 500 }
        );
      }
      return NextResponse.json({
        success: true,
        message: result.message,
      });
    }

    const result = await localAIRuntime.deleteOllamaModel(targetModel);
    if (!result.success) {
      return NextResponse.json(
        { error: "Failed to delete model", details: result.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to delete model", details: error.message },
      { status: 500 }
    );
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
