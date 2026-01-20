/**
 * Local Development Pipeline API
 * Handles autonomous development, testing, and deployment without cloud costs
 */

import { NextRequest, NextResponse } from "next/server";
import { openCodeIntegration } from "@/lib/opencode-integration";
import { jarvisOrchestrator } from "@/lib/jarvis-orchestrator";
import { localDeployManager } from "@/lib/local-deploy";
import { localAIRuntime } from "@/lib/local-ai-runtime";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

type PipelineAction = "develop" | "test" | "deploy" | "rollback" | "status";

interface DevelopParams {
  spec: string;
  targetService: string;
  model?: string;
  useLocalAI?: boolean;
}

interface TestParams {
  service: string;
  testType: "unit" | "integration" | "e2e";
  path?: string;
}

interface DeployParams {
  target: "local" | "windows" | "home" | "all";
  service: string;
  gitPull?: boolean;
  build?: boolean;
  restart?: boolean;
}

interface RollbackParams {
  target: string;
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, params } = body as { action: PipelineAction; params: any };

    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    switch (action) {
      case "develop": {
        const { spec, targetService, model, useLocalAI = true } = params as DevelopParams;
        
        if (!spec) {
          return NextResponse.json({ error: "Missing spec" }, { status: 400 });
        }

        const providerInfo = await openCodeIntegration.selectBestProvider();
        
        if (useLocalAI && providerInfo.provider !== "ollama") {
          console.log("[Pipeline] Local AI requested but not available, using cloud fallback");
        }

        const job = await jarvisOrchestrator.createJob(
          "opencode_task",
          {
            taskType: "generate",
            spec,
            targetService,
            model: model || providerInfo.model,
            provider: providerInfo.provider,
          },
          { priority: "normal" }
        );

        const result = await openCodeIntegration.developFeature(spec);

        jarvisOrchestrator.completeJob(job.id, result);

        return NextResponse.json({
          success: true,
          jobId: job.id,
          provider: providerInfo.provider,
          model: providerInfo.model,
          result: {
            files: result.files.map(f => f.path),
            commands: result.commands,
            tests: result.tests,
          },
        });
      }

      case "test": {
        const { service, testType, path } = params as TestParams;
        
        if (!service || !testType) {
          return NextResponse.json({ error: "Missing service or testType" }, { status: 400 });
        }

        const testCommands: Record<string, Record<string, string>> = {
          "dashboard-next": {
            unit: "npm run test",
            integration: "npm run test:integration",
            e2e: "npm run test:e2e",
          },
          "discord-bot": {
            unit: "npm run test",
            integration: "npm run test:integration",
            e2e: "npm run test:e2e",
          },
          "stream-bot": {
            unit: "npm run test",
            integration: "npm run test:integration",
            e2e: "npm run test:e2e",
          },
        };

        const command = testCommands[service]?.[testType] || `npm run test`;
        const testPath = path || `services/${service}`;

        const job = await jarvisOrchestrator.createJob(
          "command_execution",
          {
            command: `cd ${testPath} && ${command}`,
            service,
            testType,
          },
          { priority: "normal" }
        );

        return NextResponse.json({
          success: true,
          jobId: job.id,
          service,
          testType,
          command,
          status: "queued",
        });
      }

      case "deploy": {
        const { target, service, gitPull = true, build = false, restart = true } = params as DeployParams;
        
        if (!target || !service) {
          return NextResponse.json({ error: "Missing target or service" }, { status: 400 });
        }

        const targets = target === "all" 
          ? ["home", "windows"]
          : [target === "local" ? "home" : target];

        const results: { target: string; result: any }[] = [];

        for (const t of targets) {
          const result = await localDeployManager.deploy(service, t, {
            gitPull,
            build,
            restart,
          });
          results.push({ target: t, result });
        }

        const allSuccess = results.every(r => r.result.success);

        return NextResponse.json({
          success: allSuccess,
          deployments: results,
        });
      }

      case "rollback": {
        const { target } = params as RollbackParams;
        
        if (!target) {
          return NextResponse.json({ error: "Missing target" }, { status: 400 });
        }

        const result = await localDeployManager.rollback(target);

        return NextResponse.json({
          success: result.success,
          result,
        });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error("[Pipeline] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("forceRefresh") === "true";
    
    if (forceRefresh) {
      console.log("[Pipeline] Force refresh requested");
    }

    const [localAIStatus, openCodeStatus, targets, healthChecks] = await Promise.all([
      localAIRuntime.checkAllRuntimes(),
      openCodeIntegration.checkInstallation(),
      localDeployManager.refreshTargets(),
      localDeployManager.runHealthChecks(),
    ]);

    const providerInfo = await openCodeIntegration.selectBestProvider();
    const stats = jarvisOrchestrator.getStats();

    const ollamaStatus = localAIStatus.find(s => s.provider === "ollama");
    const sdStatus = localAIStatus.find(s => s.provider === "stable-diffusion");
    const comfyStatus = localAIStatus.find(s => s.provider === "comfyui");

    const ollamaOnline = ollamaStatus?.status === "online";
    const sdOnline = sdStatus?.status === "online";
    const comfyOnline = comfyStatus?.status === "online";
    const anyLocalAIOnline = ollamaOnline || sdOnline || comfyOnline;
    
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY || !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    const fallbackAvailable = hasOpenAIKey && providerInfo.provider !== "none";

    let actionableMessage = "";
    if (!anyLocalAIOnline && !fallbackAvailable) {
      actionableMessage = "All AI services are offline. Start Ollama on your Windows VM or configure an OpenAI API key to enable AI features.";
    } else if (!anyLocalAIOnline && fallbackAvailable) {
      actionableMessage = "Local AI services are offline. Using cloud fallback (OpenAI). Start Ollama for local inference.";
    } else if (!ollamaOnline) {
      actionableMessage = "Ollama is offline. Text generation will use cloud fallback if available.";
    } else if (ollamaOnline && !sdOnline && !comfyOnline) {
      actionableMessage = "Image generation services (Stable Diffusion, ComfyUI) are offline. Text generation is available via Ollama.";
    }

    return NextResponse.json({
      status: "ready",
      localAI: {
        available: anyLocalAIOnline,
        ollama: ollamaStatus ? {
          status: ollamaStatus.status,
          url: ollamaStatus.url,
          latencyMs: ollamaStatus.latencyMs,
          modelsLoaded: ollamaStatus.modelsLoaded,
          vramUsed: ollamaStatus.vramUsed,
        } : { status: "offline", url: "", modelsLoaded: 0 },
        stableDiffusion: sdStatus ? {
          status: sdStatus.status,
          url: sdStatus.url,
          latencyMs: sdStatus.latencyMs,
          gpuUsage: sdStatus.gpuUsage,
          vramUsed: sdStatus.vramUsed,
          vramTotal: sdStatus.vramTotal,
        } : { status: "offline", url: "", gpuUsage: 0 },
        comfyUI: comfyStatus ? {
          status: comfyStatus.status,
          url: comfyStatus.url,
        } : { status: "offline", url: "" },
      },
      fallbackAvailable,
      actionableMessage,
      opencode: {
        available: openCodeStatus,
        selectedProvider: providerInfo.provider,
        selectedModel: providerInfo.model,
        endpoint: providerInfo.endpoint,
      },
      targets: targets.map(t => ({
        id: t.id,
        name: t.name,
        type: t.type,
        host: t.host,
        status: t.status,
      })),
      healthChecks: healthChecks.map(h => ({
        target: h.target,
        healthy: h.healthy,
        latencyMs: h.latencyMs,
      })),
      orchestrator: {
        totalJobs: stats.totalJobs,
        runningJobs: stats.runningJobs,
        queuedJobs: stats.queuedJobs,
        completedJobs: stats.completedJobs,
        failedJobs: stats.failedJobs,
      },
      deploymentHistory: localDeployManager.getDeploymentHistory(undefined, 5),
    });
  } catch (error: any) {
    console.error("[Pipeline] GET Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
