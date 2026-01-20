import { NextResponse } from "next/server";
import OpenAI from "openai";

// LOCAL_AI_ONLY mode: When true, NEVER use cloud AI providers
const LOCAL_AI_ONLY = process.env.LOCAL_AI_ONLY !== "false";

interface ProviderStatus {
  name: string;
  available: boolean;
  connected: boolean;
  authenticated: boolean;
  modelsAvailable: string[];
  currentModel?: string | null;
  latencyMs?: number;
  error?: string;
  details?: Record<string, any>;
  disabled?: boolean;
}

interface Issue {
  severity: "error" | "warning" | "info";
  provider: string;
  problem: string;
  suggestion: string;
}

interface DiagnosticsResponse {
  timestamp: string;
  providers: ProviderStatus[];
  issues: Issue[];
  recommendations: string[];
  summary: {
    allHealthy: boolean;
    chatAvailable: boolean;
    imageAvailable: boolean;
    videoAvailable: boolean;
  };
}

class AIProviderDiagnostics {
  private windowsVmIp: string;
  private ollamaUrl: string;
  private sdUrl: string;
  private comfyuiUrl: string;

  constructor() {
    this.windowsVmIp = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
    this.ollamaUrl = process.env.OLLAMA_URL || `http://${this.windowsVmIp}:11434`;
    this.sdUrl = process.env.STABLE_DIFFUSION_URL || `http://${this.windowsVmIp}:7860`;
    this.comfyuiUrl = process.env.COMFYUI_URL || `http://${this.windowsVmIp}:8188`;
  }

  async runDiagnostics(): Promise<DiagnosticsResponse> {
    const providers: ProviderStatus[] = [];
    const issues: Issue[] = [];
    const recommendations: Set<string> = new Set();

    const openaiStatus = await this.checkOpenAI();
    providers.push(openaiStatus);
    if (!openaiStatus.authenticated) {
      issues.push({
        severity: "error",
        provider: "OpenAI",
        problem: "OpenAI API key not configured or invalid",
        suggestion: "Set OPENAI_API_KEY or use Replit's AI integration for OpenAI access",
      });
      recommendations.add(
        "Add OpenAI API key via settings or use Replit's native OpenAI integration"
      );
    }
    if (!openaiStatus.connected && openaiStatus.authenticated) {
      issues.push({
        severity: "error",
        provider: "OpenAI",
        problem: "Cannot reach OpenAI API",
        suggestion: "Check internet connection and API endpoint configuration",
      });
      recommendations.add("Verify internet connectivity and firewall rules");
    }

    const ollamaStatus = await this.checkOllama();
    providers.push(ollamaStatus);
    if (!ollamaStatus.available) {
      issues.push({
        severity: "warning",
        provider: "Ollama",
        problem: `Ollama is offline at ${this.ollamaUrl}`,
        suggestion: "Start Ollama service: RDP to Windows VM and run ollama serve",
      });
      recommendations.add(
        "Start Ollama service on Windows VM (port 11434)"
      );
    } else if (ollamaStatus.modelsAvailable.length === 0) {
      issues.push({
        severity: "warning",
        provider: "Ollama",
        problem: "Ollama running but no models loaded",
        suggestion:
          'Download models: ollama pull llama3.2 (or other model)',
      });
      recommendations.add(
        "Download Ollama models via ollama pull command or use AI Nodes page"
      );
    }

    const sdStatus = await this.checkStableDiffusion();
    providers.push(sdStatus);
    if (!sdStatus.available) {
      issues.push({
        severity: "warning",
        provider: "Stable Diffusion",
        problem: `Stable Diffusion is offline at ${this.sdUrl}`,
        suggestion:
          "Start Stable Diffusion WebUI on Windows VM: python -m venv venv && python launch.py --api",
      });
      recommendations.add(
        "Start Stable Diffusion WebUI on Windows VM (port 7860)"
      );
    } else if (sdStatus.modelsAvailable.length === 0) {
      issues.push({
        severity: "warning",
        provider: "Stable Diffusion",
        problem: "Stable Diffusion running but no models loaded",
        suggestion:
          "Add .safetensors or .ckpt files to Stable Diffusion models/Stable-diffusion/ folder, or download via SD WebUI",
      });
      recommendations.add(
        "Download Stable Diffusion models via WebUI or place .safetensors files in models/Stable-diffusion/ folder"
      );
    }

    const comfyuiStatus = await this.checkComfyUI();
    providers.push(comfyuiStatus);
    if (!comfyuiStatus.available) {
      issues.push({
        severity: "info",
        provider: "ComfyUI",
        problem: `ComfyUI is offline at ${this.comfyuiUrl}`,
        suggestion: "ComfyUI is optional. Start if needed for advanced image workflows",
      });
    }

    const summary = {
      allHealthy: providers.every(p => p.available || p.name === "ComfyUI"),
      chatAvailable: openaiStatus.connected || ollamaStatus.available,
      imageAvailable: sdStatus.available || openaiStatus.connected,
      videoAvailable: comfyuiStatus.available,
    };

    return {
      timestamp: new Date().toISOString(),
      providers,
      issues,
      recommendations: Array.from(recommendations),
      summary,
    };
  }

  private async checkOpenAI(): Promise<ProviderStatus> {
    const status: ProviderStatus = {
      name: "OpenAI",
      available: false,
      connected: false,
      authenticated: false,
      modelsAvailable: [],
    };

    // LOCAL_AI_ONLY MODE: Skip OpenAI check entirely - no cloud API calls allowed
    if (LOCAL_AI_ONLY) {
      status.disabled = true;
      status.error = "Cloud AI providers disabled (LOCAL_AI_ONLY=true)";
      return status;
    }

    const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    const directKey = process.env.OPENAI_API_KEY;

    const apiKey =
      (integrationKey && integrationKey.startsWith("sk-")) ? integrationKey : directKey;

    if (!apiKey || !apiKey.startsWith("sk-")) {
      status.authenticated = false;
      status.error = "No valid API key configured";
      return status;
    }

    status.authenticated = true;

    try {
      const projectId = process.env.OPENAI_PROJECT_ID;
      const openai = new OpenAI({
        baseURL: baseURL || undefined,
        apiKey: apiKey.trim(),
        ...(projectId && { project: projectId.trim() }),
      });

      const start = Date.now();

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Say 'OK'." }],
        max_tokens: 2,
      });

      status.latencyMs = Date.now() - start;
      status.connected = true;
      status.available = true;
      status.modelsAvailable = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"];
      status.currentModel = "gpt-4o-mini";

      return status;
    } catch (error: any) {
      status.connected = false;
      status.available = false;

      if (error.status === 401 || error.status === 403) {
        status.authenticated = false;
        status.error = `Authentication failed (HTTP ${error.status}): ${error.message}`;
      } else if (error.code === "ERR_INVALID_URL" || error.message?.includes("fetch")) {
        status.error = `Network error: ${error.message}`;
      } else {
        status.error = error.message || "Unknown error";
      }

      return status;
    }
  }

  private async checkOllama(): Promise<ProviderStatus> {
    const status: ProviderStatus = {
      name: "Ollama",
      available: false,
      connected: false,
      authenticated: true,
      modelsAvailable: [],
    };

    try {
      const start = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.ollamaUrl}/api/tags`, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      });

      clearTimeout(timeout);
      status.latencyMs = Date.now() - start;

      if (!response.ok) {
        status.error = `HTTP ${response.status}`;
        status.connected = false;
        return status;
      }

      const data = await response.json();
      status.connected = true;
      status.available = true;

      if (Array.isArray(data.models) && data.models.length > 0) {
        status.modelsAvailable = data.models.map(
          (m: any) => m.name || m.model || "unknown"
        );
      }

      status.details = {
        modelCount: data.models?.length || 0,
        models: status.modelsAvailable,
      };

      return status;
    } catch (error: any) {
      status.connected = false;
      status.available = false;
      status.error =
        error.name === "AbortError"
          ? `Timeout connecting to ${this.ollamaUrl}`
          : error.message || "Connection failed";
      return status;
    }
  }

  private async checkStableDiffusion(): Promise<ProviderStatus> {
    const status: ProviderStatus = {
      name: "Stable Diffusion",
      available: false,
      connected: false,
      authenticated: true,
      modelsAvailable: [],
    };

    try {
      const start = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.sdUrl}/sdapi/v1/sd-models`, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      });

      clearTimeout(timeout);
      status.latencyMs = Date.now() - start;

      if (!response.ok) {
        status.error = `HTTP ${response.status}`;
        status.connected = false;
        return status;
      }

      const data = await response.json();
      status.connected = true;
      status.available = true;

      if (Array.isArray(data) && data.length > 0) {
        status.modelsAvailable = data.map((m: any) => m.title || m.model_name || "unknown");
        const currentModel = data.find((m: any) => m.model_name === data[0]?.model_name);
        status.currentModel = currentModel?.title || data[0]?.title || null;
      }

      status.details = {
        modelCount: data?.length || 0,
        models: status.modelsAvailable,
      };

      return status;
    } catch (error: any) {
      status.connected = false;
      status.available = false;
      status.error =
        error.name === "AbortError"
          ? `Timeout connecting to ${this.sdUrl}`
          : error.message || "Connection failed";
      return status;
    }
  }

  private async checkComfyUI(): Promise<ProviderStatus> {
    const status: ProviderStatus = {
      name: "ComfyUI",
      available: false,
      connected: false,
      authenticated: true,
      modelsAvailable: [],
    };

    try {
      const start = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.comfyuiUrl}/system_stats`, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      });

      clearTimeout(timeout);
      status.latencyMs = Date.now() - start;

      if (!response.ok) {
        status.error = `HTTP ${response.status}`;
        status.connected = false;
        return status;
      }

      const data = await response.json();
      status.connected = true;
      status.available = true;

      status.details = {
        gpuDevices: data.devices?.length || 0,
        ramAvailable: data.ram?.total || null,
      };

      return status;
    } catch (error: any) {
      status.connected = false;
      status.available = false;
      status.error =
        error.name === "AbortError"
          ? `Timeout connecting to ${this.comfyuiUrl}`
          : error.message || "Connection failed";
      return status;
    }
  }
}

export async function GET() {
  try {
    const diagnostics = new AIProviderDiagnostics();
    const result = await diagnostics.runDiagnostics();

    const httpStatus =
      result.issues.some((i) => i.severity === "error") ||
      !result.summary.chatAvailable
        ? 503
        : 200;

    return NextResponse.json(result, { status: httpStatus });
  } catch (error: any) {
    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        error: error.message || "Diagnostics failed",
        providers: [],
        issues: [],
        recommendations: [],
        summary: {
          allHealthy: false,
          chatAvailable: false,
          imageAvailable: false,
          videoAvailable: false,
        },
      },
      { status: 500 }
    );
  }
}
