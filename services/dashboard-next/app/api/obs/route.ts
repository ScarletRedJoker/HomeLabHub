import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import {
  OBSController,
  OBSConfig,
  OBSScene,
  StreamStatus,
  AIOverlayConfig,
  SceneAutomationRule,
} from "@/lib/obs-controller";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type OBSAction =
  | "connect"
  | "disconnect"
  | "get_status"
  | "get_scenes"
  | "set_scene"
  | "get_sources"
  | "toggle_source"
  | "start_stream"
  | "stop_stream"
  | "start_recording"
  | "stop_recording"
  | "create_ai_overlay"
  | "update_ai_overlay"
  | "sync_pipeline"
  | "unsync_pipeline"
  | "add_automation"
  | "remove_automation"
  | "get_automations";

interface OBSRequest {
  action: OBSAction;
  config?: Partial<OBSConfig>;
  sceneName?: string;
  sourceName?: string;
  enabled?: boolean;
  overlayName?: string;
  overlayConfig?: AIOverlayConfig;
  overlayContent?: string | { url?: string; html?: string };
  pipelineId?: string;
  automationRules?: Partial<SceneAutomationRule>[];
  automationId?: string;
}

interface OBSResponse {
  success: boolean;
  data?: any;
  error?: string;
  timestamp: string;
}

const obsController = new OBSController();

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

function validateAction(action: string): action is OBSAction {
  const validActions: OBSAction[] = [
    "connect",
    "disconnect",
    "get_status",
    "get_scenes",
    "set_scene",
    "get_sources",
    "toggle_source",
    "start_stream",
    "stop_stream",
    "start_recording",
    "stop_recording",
    "create_ai_overlay",
    "update_ai_overlay",
    "sync_pipeline",
    "unsync_pipeline",
    "add_automation",
    "remove_automation",
    "get_automations",
  ];
  return validActions.includes(action as OBSAction);
}

function createResponse(success: boolean, data?: any, error?: string): NextResponse<OBSResponse> {
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
    const body: OBSRequest = await request.json();
    const { action } = body;

    if (!action) {
      return createResponse(false, undefined, "Missing required field: action");
    }

    if (!validateAction(action)) {
      return createResponse(false, undefined, `Invalid action: ${action}`);
    }

    console.log(`[OBS API] Action: ${action} by user: ${user.username}`);

    switch (action) {
      case "connect": {
        const config: OBSConfig = {
          host: body.config?.host || process.env.OBS_HOST || "localhost",
          port: body.config?.port || parseInt(process.env.OBS_PORT || "4455", 10),
          password: body.config?.password || process.env.OBS_PASSWORD,
          autoReconnect: body.config?.autoReconnect ?? true,
          reconnectInterval: body.config?.reconnectInterval || 5000,
        };
        await obsController.connect(config);
        return createResponse(true, {
          message: "Connected to OBS",
          host: config.host,
          port: config.port,
        });
      }

      case "disconnect": {
        await obsController.disconnect();
        return createResponse(true, { message: "Disconnected from OBS" });
      }

      case "get_status": {
        const connectionStatus = obsController.getConnectionStatus();
        let streamStatus: StreamStatus | null = null;
        let currentScene: string | null = null;

        if (connectionStatus.connected) {
          try {
            streamStatus = await obsController.getStreamStatus();
            const scenes = await obsController.getScenes();
            currentScene = scenes.length > 0 ? scenes[0].name : null;
          } catch (e) {
            console.warn("[OBS API] Could not get full status:", e);
          }
        }

        return createResponse(true, {
          connection: connectionStatus,
          stream: streamStatus,
          currentScene,
        });
      }

      case "get_scenes": {
        const connectionStatus = obsController.getConnectionStatus();
        if (!connectionStatus.connected) {
          return createResponse(false, undefined, "Not connected to OBS");
        }
        const scenes = await obsController.getScenes();
        return createResponse(true, { scenes });
      }

      case "set_scene": {
        if (!body.sceneName) {
          return createResponse(false, undefined, "Scene name is required");
        }
        const connectionStatus = obsController.getConnectionStatus();
        if (!connectionStatus.connected) {
          return createResponse(false, undefined, "Not connected to OBS");
        }
        await obsController.setCurrentScene(body.sceneName);
        return createResponse(true, { message: `Switched to scene: ${body.sceneName}` });
      }

      case "get_sources": {
        if (!body.sceneName) {
          return createResponse(false, undefined, "Scene name is required");
        }
        const connectionStatus = obsController.getConnectionStatus();
        if (!connectionStatus.connected) {
          return createResponse(false, undefined, "Not connected to OBS");
        }
        const sources = await obsController.getSources(body.sceneName);
        return createResponse(true, { sceneName: body.sceneName, sources });
      }

      case "toggle_source": {
        if (!body.sceneName || !body.sourceName) {
          return createResponse(false, undefined, "Scene name and source name are required");
        }
        const connectionStatus = obsController.getConnectionStatus();
        if (!connectionStatus.connected) {
          return createResponse(false, undefined, "Not connected to OBS");
        }
        const enabled = body.enabled ?? true;
        await obsController.setSourceVisibility(body.sceneName, body.sourceName, enabled);
        return createResponse(true, {
          message: `Source visibility set to ${enabled}`,
          sceneName: body.sceneName,
          sourceName: body.sourceName,
          enabled,
        });
      }

      case "start_stream": {
        const connectionStatus = obsController.getConnectionStatus();
        if (!connectionStatus.connected) {
          return createResponse(false, undefined, "Not connected to OBS");
        }
        await obsController.startStreaming();
        return createResponse(true, { message: "Stream started" });
      }

      case "stop_stream": {
        const connectionStatus = obsController.getConnectionStatus();
        if (!connectionStatus.connected) {
          return createResponse(false, undefined, "Not connected to OBS");
        }
        await obsController.stopStreaming();
        return createResponse(true, { message: "Stream stopped" });
      }

      case "start_recording": {
        const connectionStatus = obsController.getConnectionStatus();
        if (!connectionStatus.connected) {
          return createResponse(false, undefined, "Not connected to OBS");
        }
        await obsController.startRecording();
        return createResponse(true, { message: "Recording started" });
      }

      case "stop_recording": {
        const connectionStatus = obsController.getConnectionStatus();
        if (!connectionStatus.connected) {
          return createResponse(false, undefined, "Not connected to OBS");
        }
        await obsController.stopRecording();
        return createResponse(true, { message: "Recording stopped" });
      }

      case "create_ai_overlay": {
        if (!body.overlayName || !body.overlayConfig) {
          return createResponse(false, undefined, "Overlay name and config are required");
        }
        const connectionStatus = obsController.getConnectionStatus();
        if (!connectionStatus.connected) {
          return createResponse(false, undefined, "Not connected to OBS");
        }
        await obsController.createAIOverlay(body.overlayName, body.overlayConfig);
        return createResponse(true, {
          message: "AI overlay created",
          overlayName: body.overlayName,
        });
      }

      case "update_ai_overlay": {
        if (!body.overlayName || !body.overlayContent) {
          return createResponse(false, undefined, "Overlay name and content are required");
        }
        const connectionStatus = obsController.getConnectionStatus();
        if (!connectionStatus.connected) {
          return createResponse(false, undefined, "Not connected to OBS");
        }
        await obsController.updateAIOverlay(body.overlayName, body.overlayContent);
        return createResponse(true, {
          message: "AI overlay updated",
          overlayName: body.overlayName,
        });
      }

      case "sync_pipeline": {
        if (!body.pipelineId) {
          return createResponse(false, undefined, "Pipeline ID is required");
        }
        const connectionStatus = obsController.getConnectionStatus();
        if (!connectionStatus.connected) {
          return createResponse(false, undefined, "Not connected to OBS");
        }
        await obsController.syncWithPipeline(body.pipelineId);
        return createResponse(true, {
          message: "Pipeline synced with OBS",
          pipelineId: body.pipelineId,
        });
      }

      case "unsync_pipeline": {
        if (!body.pipelineId) {
          return createResponse(false, undefined, "Pipeline ID is required");
        }
        obsController.unsyncFromPipeline(body.pipelineId);
        return createResponse(true, {
          message: "Pipeline unsynced from OBS",
          pipelineId: body.pipelineId,
        });
      }

      case "add_automation": {
        if (!body.automationRules || body.automationRules.length === 0) {
          return createResponse(false, undefined, "Automation rules are required");
        }
        const rules: SceneAutomationRule[] = body.automationRules.map((r) => ({
          id: r.id || `auto_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          name: r.name || "Unnamed Rule",
          trigger: r.trigger || { type: "stream_event", config: {} },
          action: r.action || { type: "switch_scene", config: {} },
          enabled: r.enabled ?? true,
          cooldownMs: r.cooldownMs,
        }));
        obsController.createSceneAutomation(rules);
        return createResponse(true, { message: "Automation rules added", rules });
      }

      case "remove_automation": {
        if (!body.automationId) {
          return createResponse(false, undefined, "Automation ID is required");
        }
        const removed = obsController.removeSceneAutomation(body.automationId);
        return createResponse(true, {
          message: removed ? "Automation rule removed" : "Rule not found",
          removed,
          automationId: body.automationId,
        });
      }

      case "get_automations": {
        const rules = obsController.getSceneAutomations();
        return createResponse(true, { automations: rules });
      }

      default:
        return createResponse(false, undefined, `Unhandled action: ${action}`);
    }
  } catch (error: any) {
    console.error("[OBS API] Error:", error);
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

  try {
    const connectionStatus = obsController.getConnectionStatus();
    let streamStatus: StreamStatus | null = null;
    let scenes: OBSScene[] = [];

    if (connectionStatus.connected) {
      try {
        streamStatus = await obsController.getStreamStatus();
        scenes = await obsController.getScenes();
      } catch (e) {
        console.warn("[OBS API] Could not get full status:", e);
      }
    }

    const automations = obsController.getSceneAutomations();

    return NextResponse.json({
      connection: connectionStatus,
      stream: streamStatus,
      scenes: scenes.map((s) => ({ name: s.name, index: s.index })),
      automations: automations.length,
    });
  } catch (error: any) {
    console.error("[OBS API] GET Error:", error);
    return NextResponse.json(
      { error: "Failed to get OBS status", details: error.message },
      { status: 500 }
    );
  }
}
