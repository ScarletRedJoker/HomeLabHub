import { NextRequest, NextResponse } from "next/server";

async function checkEndpoint(url: string, timeout = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

async function getOllamaModels(endpoint: string): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${endpoint}/api/tags`, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      return data.models?.map((m: { name: string }) => m.name) || [];
    }
    return [];
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const windowsVmIp = process.env.WINDOWS_VM_TAILSCALE_IP;
    const defaultEndpoint = windowsVmIp ? `http://${windowsVmIp}:11434` : "";

    const [ollamaAvailable, comfyuiAvailable] = await Promise.all([
      defaultEndpoint ? checkEndpoint(`${defaultEndpoint}/api/tags`) : Promise.resolve(false),
      windowsVmIp ? checkEndpoint(`http://${windowsVmIp}:8188/`) : Promise.resolve(false),
    ]);

    let ollamaModels: string[] = [];
    if (ollamaAvailable) {
      ollamaModels = await getOllamaModels(defaultEndpoint);
    }

    return NextResponse.json({
      ollama: {
        available: ollamaAvailable,
        endpoint: defaultEndpoint,
        models: ollamaModels,
      },
      comfyui: {
        available: comfyuiAvailable,
        endpoint: windowsVmIp ? `http://${windowsVmIp}:8188` : undefined,
      },
      openai: {
        configured: !!process.env.OPENAI_API_KEY,
      },
    });
  } catch (error) {
    console.error("[Setup AI API] Error:", error);
    return NextResponse.json({
      ollama: { available: false, models: [] },
      comfyui: { available: false },
      openai: { configured: false },
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ollamaEndpoint, action } = body;

    if (action === "download-model") {
      const { model } = body;
      if (!model || !ollamaEndpoint) {
        return NextResponse.json(
          { success: false, error: "Model and endpoint required" },
          { status: 400 }
        );
      }

      const response = await fetch(`${ollamaEndpoint}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: model }),
      });

      return NextResponse.json({
        success: response.ok,
        message: response.ok ? `Started downloading ${model}` : "Download failed",
      });
    }

    if (!ollamaEndpoint) {
      return NextResponse.json({
        ollama: { available: false, models: [] },
        comfyui: { available: false },
        openai: { configured: !!process.env.OPENAI_API_KEY },
      });
    }

    const ollamaAvailable = await checkEndpoint(`${ollamaEndpoint}/api/tags`);
    let ollamaModels: string[] = [];
    
    if (ollamaAvailable) {
      ollamaModels = await getOllamaModels(ollamaEndpoint);
    }

    const windowsVmIp = process.env.WINDOWS_VM_TAILSCALE_IP;
    const comfyuiAvailable = windowsVmIp 
      ? await checkEndpoint(`http://${windowsVmIp}:8188/`)
      : false;

    return NextResponse.json({
      ollama: {
        available: ollamaAvailable,
        endpoint: ollamaEndpoint,
        models: ollamaModels,
      },
      comfyui: {
        available: comfyuiAvailable,
        endpoint: windowsVmIp ? `http://${windowsVmIp}:8188` : undefined,
      },
      openai: {
        configured: !!process.env.OPENAI_API_KEY,
      },
    });
  } catch (error) {
    console.error("[Setup AI API] Error:", error);
    return NextResponse.json(
      { success: false, error: "AI service check failed" },
      { status: 500 }
    );
  }
}
