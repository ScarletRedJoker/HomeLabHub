import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execAsync = promisify(exec);

interface RepairRequest {
  components?: ("stableDiffusion" | "comfyui" | "ffmpeg" | "all")[];
  sdPath?: string;
  comfyuiPath?: string;
  ffmpegPath?: string;
  force?: boolean;
}

// Windows VM connection details from environment
const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
const WINDOWS_VM_USER = process.env.WINDOWS_VM_USER || "Administrator";
const WINDOWS_SCRIPTS_PATH = "C:\\scripts\\windows-repair";

interface RepairLog {
  timestamp: string;
  level: "INFO" | "SUCCESS" | "ERROR" | "WARN";
  message: string;
  component?: string;
}

function createLog(message: string, level: "INFO" | "SUCCESS" | "ERROR" | "WARN" = "INFO", component?: string): RepairLog {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    component
  };
}

async function runSSHCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    // First try direct execution if this is running on Windows
    if (process.platform === "win32") {
      const { stdout, stderr } = await execAsync(command, { shell: "powershell.exe" });
      return { stdout, stderr, exitCode: 0 };
    }

    // For non-Windows, attempt SSH connection via Tailscale
    const sshCommand = `ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no ${WINDOWS_VM_USER}@${WINDOWS_VM_IP} "${command}"`;
    const { stdout, stderr } = await execAsync(sshCommand, { timeout: 600000 }); // 10 minute timeout
    return { stdout, stderr, exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout || "",
      stderr: error.stderr || error.message || "Unknown error",
      exitCode: error.code || 1
    };
  }
}

async function repairStableDiffusion(sdPath: string, force: boolean): Promise<RepairLog[]> {
  const logs: RepairLog[] = [];

  logs.push(createLog("Starting Stable Diffusion repair...", "INFO", "sd"));

  const scriptPath = `${WINDOWS_SCRIPTS_PATH}\\Fix-SD-Complete.ps1`;
  const forceArg = force ? "-Force" : "";
  const command = `powershell -ExecutionPolicy Bypass -File "${scriptPath}" -SDPath "${sdPath}" ${forceArg}`;

  const result = await runSSHCommand(command);

  if (result.exitCode === 0) {
    logs.push(createLog("Stable Diffusion repair completed successfully", "SUCCESS", "sd"));
    if (result.stdout) {
      result.stdout.split("\n").forEach(line => {
        if (line.trim()) logs.push(createLog(line.trim(), "INFO", "sd"));
      });
    }
  } else {
    logs.push(createLog(`Stable Diffusion repair failed: ${result.stderr}`, "ERROR", "sd"));
  }

  return logs;
}

async function repairComfyUI(comfyuiPath: string, ffmpegPath: string, force: boolean): Promise<RepairLog[]> {
  const logs: RepairLog[] = [];

  logs.push(createLog("Starting ComfyUI repair...", "INFO", "comfyui"));

  const scriptPath = `${WINDOWS_SCRIPTS_PATH}\\Fix-ComfyUI-Complete.ps1`;
  const forceArg = force ? "-Force" : "";
  const command = `powershell -ExecutionPolicy Bypass -File "${scriptPath}" -ComfyUIPath "${comfyuiPath}" -FFmpegPath "${ffmpegPath}" ${forceArg}`;

  const result = await runSSHCommand(command);

  if (result.exitCode === 0) {
    logs.push(createLog("ComfyUI repair completed successfully", "SUCCESS", "comfyui"));
    if (result.stdout) {
      result.stdout.split("\n").forEach(line => {
        if (line.trim()) logs.push(createLog(line.trim(), "INFO", "comfyui"));
      });
    }
  } else {
    logs.push(createLog(`ComfyUI repair failed: ${result.stderr}`, "ERROR", "comfyui"));
  }

  return logs;
}

async function runMasterRepair(request: RepairRequest): Promise<{ logs: RepairLog[]; status: "success" | "partial" | "failed"; results: Record<string, string> }> {
  const allLogs: RepairLog[] = [];
  const results: Record<string, string> = {};
  let failureCount = 0;

  allLogs.push(createLog("Starting Windows AI Stack repair", "INFO"));
  allLogs.push(createLog(`Components to repair: ${request.components?.join(", ") || "all"}`, "INFO"));

  // Determine which components to repair
  const repairAll = !request.components || request.components.includes("all");
  const repairSD = repairAll || request.components?.includes("stableDiffusion");
  const repairComfy = repairAll || request.components?.includes("comfyui");

  // Run repairs in sequence
  if (repairSD) {
    const sdPath = request.sdPath || "C:\\AI\\stable-diffusion-webui";
    const sdLogs = await repairStableDiffusion(sdPath, request.force || false);
    allLogs.push(...sdLogs);

    if (sdLogs.some(log => log.level === "ERROR")) {
      results.stableDiffusion = "FAILED";
      failureCount++;
    } else {
      results.stableDiffusion = "SUCCESS";
    }
  }

  if (repairComfy) {
    const comfyPath = request.comfyuiPath || "C:\\AI\\ComfyUI";
    const ffmpegPath = request.ffmpegPath || "C:\\ffmpeg";
    const comfyLogs = await repairComfyUI(comfyPath, ffmpegPath, request.force || false);
    allLogs.push(...comfyLogs);

    if (comfyLogs.some(log => log.level === "ERROR")) {
      results.comfyui = "FAILED";
      failureCount++;
    } else {
      results.comfyui = "SUCCESS";
    }
  }

  allLogs.push(createLog(`Repair completed with ${failureCount} failure(s)`, failureCount === 0 ? "SUCCESS" : "WARN"));

  const status = failureCount === 0 ? "success" : failureCount === Object.keys(results).length ? "failed" : "partial";

  return { logs: allLogs, status, results };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RepairRequest;

    // Validate Windows VM accessibility
    if (!process.platform === "win32" && !WINDOWS_VM_IP) {
      return NextResponse.json(
        {
          error: "Windows VM not configured",
          logs: [createLog("Windows VM Tailscale IP not configured", "ERROR")],
          status: "failed"
        },
        { status: 503 }
      );
    }

    // Run the repair
    const result = await runMasterRepair(body);

    return NextResponse.json(
      {
        status: result.status,
        results: result.results,
        logs: result.logs,
        timestamp: new Date().toISOString()
      },
      {
        status: result.status === "success" ? 200 : 207
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: errorMessage,
        logs: [createLog(`Repair request failed: ${errorMessage}`, "ERROR")],
        status: "failed"
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/ai/windows-repair",
    description: "Run Windows AI Stack repairs (Stable Diffusion, ComfyUI, FFmpeg)",
    method: "POST",
    requestBody: {
      components: "['stableDiffusion' | 'comfyui' | 'all'] (default: all)",
      sdPath: "Path to Stable Diffusion WebUI (default: C:\\AI\\stable-diffusion-webui)",
      comfyuiPath: "Path to ComfyUI (default: C:\\AI\\ComfyUI)",
      ffmpegPath: "Path to FFmpeg installation (default: C:\\ffmpeg)",
      force: "Force reinstall even if components exist (default: false)"
    },
    responseFormat: {
      status: "success | partial | failed",
      results: {
        stableDiffusion: "SUCCESS | FAILED",
        comfyui: "SUCCESS | FAILED"
      },
      logs: [
        {
          timestamp: "ISO-8601",
          level: "INFO | SUCCESS | ERROR | WARN",
          message: "Log message",
          component: "sd | comfyui (optional)"
        }
      ]
    },
    example: {
      request: {
        components: ["stableDiffusion", "comfyui"],
        force: false
      },
      response: {
        status: "success",
        results: {
          stableDiffusion: "SUCCESS",
          comfyui: "SUCCESS"
        },
        logs: [
          {
            timestamp: "2026-01-20T12:00:00Z",
            level: "INFO",
            message: "Starting Windows AI Stack repair"
          }
        ]
      }
    }
  });
}
