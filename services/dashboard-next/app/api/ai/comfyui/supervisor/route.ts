import { NextRequest, NextResponse } from "next/server";
import { 
  getComfyUISupervisor, 
  safeComfyUIOperation,
  SupervisorStatus 
} from "@/lib/ai/comfyui-supervisor";
import { ComfyUIServiceState } from "@/lib/ai/comfyui-manager";
import { getAIConfig } from "@/lib/ai/config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supervisor = getComfyUISupervisor();
    const status = supervisor.getStatus();
    const config = getAIConfig();

    return NextResponse.json({
      success: true,
      supervisor: {
        ...status,
        config: {
          host: config.windowsVM.ip || 'localhost',
          port: 8188,
          url: config.comfyui.url,
        }
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { action } = body;

    const supervisor = getComfyUISupervisor();

    switch (action) {
      case 'ensure-running': {
        const result = await safeComfyUIOperation(
          () => supervisor.ensureRunning(),
          { success: false, reused: false, error: 'Operation failed' },
          'ensure_running'
        );
        
        if (!result.success) {
          return NextResponse.json({
            success: false,
            error: result.error,
            status: supervisor.getStatus(),
          }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          result: result.result,
          status: supervisor.getStatus(),
        });
      }

      case 'check-agent': {
        const result = await safeComfyUIOperation(
          () => supervisor.checkAgentAvailability(),
          false,
          'check_agent'
        );

        return NextResponse.json({
          success: result.success,
          agentAvailable: result.result,
          status: supervisor.getStatus(),
        });
      }

      case 'start-service': {
        const result = await safeComfyUIOperation(
          () => supervisor.startService(),
          { success: false, error: 'Operation failed' },
          'start_service'
        );

        return NextResponse.json({
          success: result.success,
          result: result.result,
          status: supervisor.getStatus(),
        });
      }

      case 'stop-service': {
        const result = await safeComfyUIOperation(
          () => supervisor.stopService(),
          { success: false, error: 'Operation failed' },
          'stop_service'
        );

        return NextResponse.json({
          success: result.success,
          result: result.result,
          status: supervisor.getStatus(),
        });
      }

      case 'restart-service': {
        const result = await safeComfyUIOperation(
          () => supervisor.restartService(),
          { success: false, error: 'Operation failed' },
          'restart_service'
        );

        return NextResponse.json({
          success: result.success,
          result: result.result,
          status: supervisor.getStatus(),
        });
      }

      case 'detect-instance': {
        const result = await safeComfyUIOperation(
          () => supervisor.detectExistingInstance(),
          { running: false, healthy: false },
          'detect_instance'
        );

        return NextResponse.json({
          success: result.success,
          instance: result.result,
          status: supervisor.getStatus(),
        });
      }

      case 'acquire-lock': {
        const result = await safeComfyUIOperation(
          () => supervisor.acquireLock(),
          false,
          'acquire_lock'
        );

        return NextResponse.json({
          success: result.success,
          lockAcquired: result.result,
          status: supervisor.getStatus(),
        });
      }

      case 'release-lock': {
        supervisor.releaseLock();
        return NextResponse.json({
          success: true,
          status: supervisor.getStatus(),
        });
      }

      case 'shutdown': {
        await safeComfyUIOperation(
          () => supervisor.shutdown(),
          undefined,
          'shutdown'
        );

        return NextResponse.json({
          success: true,
          status: supervisor.getStatus(),
        });
      }

      case 'reset-restart-count': {
        supervisor.resetRestartCount();
        return NextResponse.json({
          success: true,
          status: supervisor.getStatus(),
        });
      }

      case 'health-check': {
        const serviceManager = supervisor.getServiceManager();
        const state = await safeComfyUIOperation(
          () => serviceManager.checkHealth(),
          ComfyUIServiceState.OFFLINE,
          'health_check'
        );

        return NextResponse.json({
          success: state.success,
          state: state.result,
          readinessInfo: serviceManager.getReadinessInfo(),
          status: supervisor.getStatus(),
        });
      }

      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action: ${action}`,
          validActions: [
            'ensure-running',
            'check-agent',
            'start-service',
            'stop-service',
            'restart-service',
            'detect-instance',
            'acquire-lock',
            'release-lock',
            'shutdown',
            'reset-restart-count',
            'health-check',
          ],
        }, { status: 400 });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: errorMessage,
    }, { status: 500 });
  }
}
