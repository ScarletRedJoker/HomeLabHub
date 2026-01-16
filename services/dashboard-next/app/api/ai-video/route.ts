import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import {
  VideoPipelineManager,
  VideoPipelineConfig,
  PipelineState,
  PipelineStatus,
} from "@/lib/ai-video-pipeline";
import { FaceSwapService, LipSyncService, FaceSwapConfig, LipSyncConfig } from "@/lib/face-swap";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type AIVideoAction =
  | "start_pipeline"
  | "stop_pipeline"
  | "get_status"
  | "create_pipeline"
  | "delete_pipeline"
  | "update_step"
  | "generate_video"
  | "swap_face"
  | "sync_lips"
  | "get_models"
  | "get_metrics";

interface AIVideoRequest {
  action: AIVideoAction;
  pipelineId?: string;
  config?: Partial<VideoPipelineConfig>;
  stepId?: string;
  params?: Record<string, any>;
  source?: string;
  target?: string;
  faceSwapConfig?: Partial<FaceSwapConfig>;
  lipSyncConfig?: Partial<LipSyncConfig>;
  prompt?: string;
  model?: string;
}

interface AIVideoResponse {
  success: boolean;
  data?: any;
  error?: string;
  timestamp: string;
}

const pipelineManager = new VideoPipelineManager();
const faceSwapService = new FaceSwapService();
const lipSyncService = new LipSyncService(faceSwapService);

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

function validateAction(action: string): action is AIVideoAction {
  const validActions: AIVideoAction[] = [
    "start_pipeline",
    "stop_pipeline",
    "get_status",
    "create_pipeline",
    "delete_pipeline",
    "update_step",
    "generate_video",
    "swap_face",
    "sync_lips",
    "get_models",
    "get_metrics",
  ];
  return validActions.includes(action as AIVideoAction);
}

function createResponse(success: boolean, data?: any, error?: string): NextResponse<AIVideoResponse> {
  return NextResponse.json({
    success,
    data,
    error,
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: AIVideoRequest = await request.json();
    const { action } = body;

    if (!action) {
      return createResponse(false, undefined, "Missing required field: action");
    }

    if (!validateAction(action)) {
      return createResponse(false, undefined, `Invalid action: ${action}`);
    }

    console.log(`[AI-Video API] Action: ${action} by user: ${user.username}`);

    switch (action) {
      case "create_pipeline": {
        if (!body.config) {
          return createResponse(false, undefined, "Pipeline config is required");
        }
        const defaultConfig: VideoPipelineConfig = {
          inputSources: body.config.inputSources || [],
          processingSteps: body.config.processingSteps || [],
          outputTargets: body.config.outputTargets || [],
          gpuSettings: body.config.gpuSettings || {
            device: 0,
            memoryLimit: 8192,
            batchSize: 1,
            precision: "fp16",
          },
        };
        const pipeline = await pipelineManager.createPipeline(defaultConfig);
        return createResponse(true, { pipeline });
      }

      case "start_pipeline": {
        if (!body.pipelineId) {
          return createResponse(false, undefined, "Pipeline ID is required");
        }
        const started = await pipelineManager.startPipeline(body.pipelineId);
        return createResponse(true, { started, pipelineId: body.pipelineId });
      }

      case "stop_pipeline": {
        if (!body.pipelineId) {
          return createResponse(false, undefined, "Pipeline ID is required");
        }
        const stopped = await pipelineManager.stopPipeline(body.pipelineId);
        return createResponse(true, { stopped, pipelineId: body.pipelineId });
      }

      case "get_status": {
        if (body.pipelineId) {
          const status = pipelineManager.getPipelineStatus(body.pipelineId);
          if (!status) {
            return createResponse(false, undefined, `Pipeline not found: ${body.pipelineId}`);
          }
          return createResponse(true, { pipeline: status });
        }
        const allPipelines = pipelineManager.getAllPipelines();
        const runningPipelines = pipelineManager.getRunningPipelines();
        return createResponse(true, {
          total: allPipelines.length,
          running: runningPipelines.length,
          pipelines: allPipelines.map((p) => ({
            id: p.id,
            status: p.status,
            createdAt: p.createdAt,
            startedAt: p.startedAt,
            stoppedAt: p.stoppedAt,
            error: p.error,
          })),
        });
      }

      case "delete_pipeline": {
        if (!body.pipelineId) {
          return createResponse(false, undefined, "Pipeline ID is required");
        }
        const deleted = pipelineManager.deletePipeline(body.pipelineId);
        return createResponse(true, { deleted, pipelineId: body.pipelineId });
      }

      case "update_step": {
        if (!body.pipelineId || !body.stepId) {
          return createResponse(false, undefined, "Pipeline ID and Step ID are required");
        }
        const updated = await pipelineManager.updateStep(
          body.pipelineId,
          body.stepId,
          body.params || {}
        );
        return createResponse(true, { updated, pipelineId: body.pipelineId, stepId: body.stepId });
      }

      case "get_metrics": {
        const metrics = await pipelineManager.getMetrics(body.pipelineId);
        return createResponse(true, { metrics });
      }

      case "get_models": {
        const registry = pipelineManager.getModelRegistry();
        const models = registry.getAllModels();
        return createResponse(true, { models });
      }

      case "swap_face": {
        if (!body.source || !body.target) {
          return createResponse(false, undefined, "Source and target are required for face swap");
        }
        try {
          await faceSwapService.initialize();
          const result = await faceSwapService.swapFace(
            body.source,
            body.target,
            body.faceSwapConfig
          );
          return createResponse(true, { result });
        } catch (swapError: any) {
          return createResponse(false, undefined, `Face swap failed: ${swapError.message}`);
        }
      }

      case "sync_lips": {
        if (!body.source) {
          return createResponse(false, undefined, "Source video/image is required for lip sync");
        }
        if (!body.lipSyncConfig?.audioPath) {
          return createResponse(false, undefined, "Audio path is required for lip sync");
        }
        try {
          await lipSyncService.initialize();
          const lipSyncConfig: LipSyncConfig = {
            model: body.lipSyncConfig?.model || "wav2lip",
            audioSource: body.lipSyncConfig?.audioSource || "file",
            audioPath: body.lipSyncConfig?.audioPath,
            enhanceOutput: body.lipSyncConfig?.enhanceOutput ?? true,
            faceRestoration: body.lipSyncConfig?.faceRestoration ?? true,
          };
          const result = await lipSyncService.syncLips(body.source, body.lipSyncConfig.audioPath, lipSyncConfig);
          return createResponse(true, { result });
        } catch (lipSyncError: any) {
          return createResponse(false, undefined, `Lip sync failed: ${lipSyncError.message}`);
        }
      }

      case "generate_video": {
        if (!body.prompt && !body.source) {
          return createResponse(false, undefined, "Prompt or source is required for video generation");
        }
        const videoConfig: Partial<VideoPipelineConfig> = {
          inputSources: body.source
            ? [{ type: "video_file", url: body.source, settings: {} }]
            : [],
          processingSteps: [
            {
              id: "gen-1",
              type: "video_generation",
              model: body.model || "animatediff-v3",
              params: { prompt: body.prompt },
              enabled: true,
            },
          ],
          outputTargets: [{ type: "file", config: { format: "mp4" } }],
          gpuSettings: {
            device: 0,
            memoryLimit: 8192,
            batchSize: 1,
            precision: "fp16",
          },
        };
        const pipeline = await pipelineManager.createPipeline(videoConfig as VideoPipelineConfig);
        const started = await pipelineManager.startPipeline(pipeline.id);
        return createResponse(true, {
          pipelineId: pipeline.id,
          status: pipeline.status,
          started,
          message: "Video generation pipeline started",
        });
      }

      default:
        return createResponse(false, undefined, `Unhandled action: ${action}`);
    }
  } catch (error: any) {
    console.error("[AI-Video API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const pipelineId = searchParams.get("pipelineId");

  try {
    if (pipelineId) {
      const pipeline = pipelineManager.getPipelineStatus(pipelineId);
      if (!pipeline) {
        return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
      }
      return NextResponse.json({ pipeline });
    }

    const allPipelines = pipelineManager.getAllPipelines();
    const runningPipelines = pipelineManager.getRunningPipelines();
    const registry = pipelineManager.getModelRegistry();

    return NextResponse.json({
      pipelines: {
        total: allPipelines.length,
        running: runningPipelines.length,
        list: allPipelines.map((p) => ({
          id: p.id,
          status: p.status,
          createdAt: p.createdAt,
        })),
      },
      availableModels: registry.getAllModels().length,
      faceSwapInitialized: faceSwapService !== null,
    });
  } catch (error: any) {
    console.error("[AI-Video API] GET Error:", error);
    return NextResponse.json(
      { error: "Failed to get status", details: error.message },
      { status: 500 }
    );
  }
}
