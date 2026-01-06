import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://host.evindrake.net:11434";

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

  try {
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
    const models: OllamaModel[] = data.models || [];

    const formattedModels = models.map((model) => ({
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
      const response = await fetch(`${OLLAMA_URL}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: model, stream: false }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json(
          { error: "Failed to pull model", details: errorText },
          { status: response.status }
        );
      }

      const result = await response.json();
      return NextResponse.json({
        success: true,
        message: `Model ${model} pulled successfully`,
        result,
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
    const { model } = body;

    if (!model) {
      return NextResponse.json({ error: "Model name is required" }, { status: 400 });
    }

    const response = await fetch(`${OLLAMA_URL}/api/delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to delete model", details: errorText },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Model ${model} deleted successfully`,
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
