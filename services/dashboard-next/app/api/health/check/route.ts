/**
 * Health Check API
 * Comprehensive health check across all deployments with auto-remediation
 */

import { NextRequest, NextResponse } from "next/server";
import { healthMonitor, type HealthIssue, type DeploymentTarget, type ServiceType } from "@/lib/health-monitor";
import { notificationService, type NotificationChannel } from "@/lib/notification-service";

interface AutoRemediationAction {
  id: string;
  name: string;
  description: string;
  target: DeploymentTarget;
  service: ServiceType | string;
  isSafe: boolean;
  requiresConfirmation: boolean;
  steps: string[];
  command?: string;
  apiEndpoint?: string;
}

const AUTO_REMEDIATION_ACTIONS: Record<string, AutoRemediationAction> = {
  restart_ollama: {
    id: "restart_ollama",
    name: "Restart Ollama",
    description: "Restart the Ollama LLM service on Windows VM",
    target: "windows-vm",
    service: "ollama",
    isSafe: true,
    requiresConfirmation: false,
    steps: [
      "Stop existing Ollama process",
      "Clear any stuck model loading",
      "Start Ollama service",
      "Verify service is responding",
    ],
    apiEndpoint: "/api/ai/node-manager",
  },
  "restart_stable-diffusion": {
    id: "restart_stable-diffusion",
    name: "Restart Stable Diffusion",
    description: "Restart the Stable Diffusion WebUI on Windows VM",
    target: "windows-vm",
    service: "stable-diffusion",
    isSafe: true,
    requiresConfirmation: false,
    steps: [
      "Stop SD WebUI process",
      "Clear any stuck generation jobs",
      "Start SD WebUI with API enabled",
      "Verify service health endpoint",
    ],
    apiEndpoint: "/api/ai/node-manager",
  },
  restart_comfyui: {
    id: "restart_comfyui",
    name: "Restart ComfyUI",
    description: "Restart the ComfyUI service on Windows VM",
    target: "windows-vm",
    service: "comfyui",
    isSafe: true,
    requiresConfirmation: false,
    steps: [
      "Stop ComfyUI process",
      "Clear workflow queue",
      "Start ComfyUI with network access",
      "Verify system stats endpoint",
    ],
    apiEndpoint: "/api/ai/node-manager",
  },
  restart_whisper: {
    id: "restart_whisper",
    name: "Restart Whisper",
    description: "Restart the Whisper STT service on Windows VM",
    target: "windows-vm",
    service: "whisper",
    isSafe: true,
    requiresConfirmation: false,
    steps: [
      "Stop Whisper API server",
      "Clear audio processing queue",
      "Start Whisper API",
      "Verify health endpoint",
    ],
    apiEndpoint: "/api/ai/node-manager",
  },
  docker_prune: {
    id: "docker_prune",
    name: "Docker Cleanup",
    description: "Clean up unused Docker images, containers, and volumes",
    target: "linode",
    service: "docker",
    isSafe: false,
    requiresConfirmation: true,
    steps: [
      "Remove stopped containers",
      "Remove dangling images",
      "Remove unused volumes",
      "Remove unused networks",
    ],
    command: "docker system prune -af --volumes",
  },
  clear_logs: {
    id: "clear_logs",
    name: "Clear Old Logs",
    description: "Remove log files older than 30 days",
    target: "linode",
    service: "system",
    isSafe: true,
    requiresConfirmation: true,
    steps: [
      "Find log files older than 30 days",
      "Remove old log files",
      "Compress remaining large logs",
    ],
    command: "find /var/log -type f -mtime +30 -delete && journalctl --vacuum-time=7d",
  },
};

interface Runbook {
  id: string;
  title: string;
  description: string;
  issueType: string;
  target: DeploymentTarget;
  service: string;
  estimatedTime: string;
  difficulty: "easy" | "medium" | "hard";
  steps: Array<{
    order: number;
    title: string;
    description: string;
    command?: string;
    verification?: string;
    rollback?: string;
  }>;
}

function generateRunbook(issue: HealthIssue): Runbook {
  const baseSteps = issue.fixInstructions.map((instruction, index) => ({
    order: index + 1,
    title: `Step ${index + 1}`,
    description: instruction,
  }));

  const runbooks: Record<string, Partial<Runbook>> = {
    "service_down:windows-vm:ollama": {
      title: "Restore Ollama Service",
      description: "Steps to diagnose and restore the Ollama LLM service",
      estimatedTime: "5-10 minutes",
      difficulty: "easy",
      steps: [
        { order: 1, title: "Check Process", description: "Check if Ollama process is running", command: "tasklist | findstr ollama" },
        { order: 2, title: "Check Logs", description: "Review Ollama logs for errors", command: "type %USERPROFILE%\\.ollama\\logs\\server.log | tail -50" },
        { order: 3, title: "Start Service", description: "Start Ollama if not running", command: "ollama serve" },
        { order: 4, title: "Verify", description: "Test the API endpoint", verification: "curl http://localhost:11434/api/tags" },
      ],
    },
    "service_down:windows-vm:stable-diffusion": {
      title: "Restore Stable Diffusion WebUI",
      description: "Steps to diagnose and restore Stable Diffusion WebUI",
      estimatedTime: "5-15 minutes",
      difficulty: "medium",
      steps: [
        { order: 1, title: "Check Process", description: "Check if SD WebUI is running", command: "tasklist | findstr python" },
        { order: 2, title: "Check Port", description: "Verify port 7860 is available", command: "netstat -an | findstr 7860" },
        { order: 3, title: "Navigate", description: "Go to SD WebUI directory", command: "cd C:\\AI\\stable-diffusion-webui" },
        { order: 4, title: "Start", description: "Start the WebUI with API enabled", command: "webui-user.bat" },
        { order: 5, title: "Verify", description: "Test the API", verification: "curl http://localhost:7860/sdapi/v1/sd-models" },
      ],
    },
    "service_down:windows-vm:comfyui": {
      title: "Restore ComfyUI",
      description: "Steps to diagnose and restore ComfyUI",
      estimatedTime: "5-10 minutes",
      difficulty: "easy",
      steps: [
        { order: 1, title: "Check Process", description: "Check if ComfyUI is running" },
        { order: 2, title: "Navigate", description: "Go to ComfyUI directory", command: "cd C:\\AI\\ComfyUI" },
        { order: 3, title: "Start", description: "Start ComfyUI with network access", command: "python main.py --listen 0.0.0.0" },
        { order: 4, title: "Verify", description: "Check system stats", verification: "curl http://localhost:8188/system_stats" },
      ],
    },
    "high_disk": {
      title: "Free Disk Space",
      description: "Steps to identify and free up disk space",
      estimatedTime: "15-30 minutes",
      difficulty: "medium",
      steps: [
        { order: 1, title: "Analyze Usage", description: "Find large directories", command: "du -sh /* 2>/dev/null | sort -h | tail -20" },
        { order: 2, title: "Docker Cleanup", description: "Remove unused Docker resources", command: "docker system prune -af --volumes" },
        { order: 3, title: "Log Cleanup", description: "Clear old logs", command: "journalctl --vacuum-time=7d" },
        { order: 4, title: "Verify", description: "Check disk space", verification: "df -h" },
      ],
    },
  };

  const key = `${issue.type}:${issue.target}:${issue.service}`;
  const simpleKey = issue.type;
  const template = runbooks[key] || runbooks[simpleKey];

  return {
    id: `runbook-${issue.id}`,
    title: template?.title || `Fix ${issue.title}`,
    description: template?.description || issue.description,
    issueType: issue.type,
    target: issue.target,
    service: issue.service,
    estimatedTime: template?.estimatedTime || "10-20 minutes",
    difficulty: template?.difficulty || "medium",
    steps: template?.steps || baseSteps,
  };
}

async function executeAutoFix(issueId: string, fixAction: string): Promise<{ success: boolean; message: string; details?: unknown }> {
  const action = AUTO_REMEDIATION_ACTIONS[fixAction];
  
  if (!action) {
    return { success: false, message: `Unknown auto-fix action: ${fixAction}` };
  }

  if (!action.isSafe && action.requiresConfirmation) {
    return { 
      success: false, 
      message: "This action requires confirmation as it may affect running services",
      details: { requiresConfirmation: true, action }
    };
  }

  if (action.apiEndpoint) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
      const response = await fetch(`${baseUrl}${action.apiEndpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "restart-service", 
          service: action.service,
          issue_id: issueId
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, message: `API call failed: ${error}` };
      }

      const result = await response.json();
      return { 
        success: true, 
        message: `Auto-fix initiated: ${action.name}`,
        details: result
      };
    } catch (error) {
      return { 
        success: false, 
        message: `Failed to execute auto-fix: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
  }

  return { 
    success: false, 
    message: "Auto-fix not implemented for this action type. Please follow the manual runbook."
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const includeNotifications = searchParams.get("notifications") === "true";
  const targetFilter = searchParams.get("target") as DeploymentTarget | null;

  try {
    const healthResult = await healthMonitor.runHealthCheck();

    let filteredDeployments = healthResult.deployments;
    let filteredIssues = healthResult.issues;

    if (targetFilter) {
      filteredDeployments = filteredDeployments.filter(d => d.target === targetFilter);
      filteredIssues = filteredIssues.filter(i => i.target === targetFilter);
    }

    if (filteredIssues.length > 0) {
      const criticalIssues = filteredIssues.filter(i => i.severity === "critical");
      const channels: NotificationChannel[] = criticalIssues.length > 0 
        ? ["in-app", "discord"] 
        : ["in-app"];
      
      await notificationService.notifyMultipleIssues(filteredIssues, channels);
    }

    const issuesWithRecommendations = filteredIssues.map(issue => ({
      ...issue,
      runbook: generateRunbook(issue),
      availableFixes: issue.autoFixable 
        ? [AUTO_REMEDIATION_ACTIONS[issue.autoFixAction || ""]]?.filter(Boolean)
        : [],
    }));

    const response: Record<string, unknown> = {
      success: true,
      timestamp: healthResult.timestamp,
      summary: healthResult.summary,
      deployments: filteredDeployments.map(d => ({
        target: d.target,
        name: d.name,
        status: d.status,
        reachable: d.reachable,
        lastChecked: d.lastChecked,
        serviceCount: d.services.length,
        healthyServices: d.services.filter(s => s.status === "healthy").length,
        services: d.services,
        systemMetrics: d.systemMetrics,
      })),
      issues: issuesWithRecommendations,
      activeIssueCount: filteredIssues.length,
    };

    if (includeNotifications) {
      response.notifications = notificationService.getNotifications({ limit: 20 });
      response.notificationStats = notificationService.getStats();
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Health Check] Error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Health check failed",
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}

interface PostBody {
  action: "acknowledge" | "dismiss" | "auto-fix" | "mark-read" | "generate-runbook";
  issueId?: string;
  notificationId?: string;
  fixAction?: string;
  confirmed?: boolean;
  userId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: PostBody = await request.json();
    const { action, issueId, notificationId, fixAction, confirmed, userId } = body;

    switch (action) {
      case "acknowledge": {
        if (!issueId) {
          return NextResponse.json({ success: false, error: "issueId is required" }, { status: 400 });
        }
        const acknowledged = healthMonitor.acknowledgeIssue(issueId, userId);
        if (notificationId) {
          notificationService.markAsRead(notificationId);
        }
        return NextResponse.json({ 
          success: acknowledged, 
          message: acknowledged ? "Issue acknowledged" : "Issue not found" 
        });
      }

      case "dismiss": {
        if (!issueId) {
          return NextResponse.json({ success: false, error: "issueId is required" }, { status: 400 });
        }
        const dismissed = healthMonitor.dismissIssue(issueId);
        if (notificationId) {
          notificationService.dismiss(notificationId);
        }
        return NextResponse.json({ 
          success: dismissed, 
          message: dismissed ? "Issue dismissed" : "Issue not found" 
        });
      }

      case "auto-fix": {
        if (!issueId || !fixAction) {
          return NextResponse.json({ 
            success: false, 
            error: "issueId and fixAction are required" 
          }, { status: 400 });
        }

        const remediation = AUTO_REMEDIATION_ACTIONS[fixAction];
        if (remediation?.requiresConfirmation && !confirmed) {
          return NextResponse.json({
            success: false,
            requiresConfirmation: true,
            message: `This action requires confirmation: ${remediation.description}`,
            action: remediation,
          });
        }

        const result = await executeAutoFix(issueId, fixAction);
        return NextResponse.json(result);
      }

      case "mark-read": {
        if (notificationId) {
          notificationService.markAsRead(notificationId);
        } else {
          notificationService.markAllAsRead();
        }
        return NextResponse.json({ success: true, message: "Notifications marked as read" });
      }

      case "generate-runbook": {
        if (!issueId) {
          return NextResponse.json({ success: false, error: "issueId is required" }, { status: 400 });
        }
        const issues = healthMonitor.getActiveIssues();
        const issue = issues.find(i => i.id === issueId);
        if (!issue) {
          return NextResponse.json({ success: false, error: "Issue not found" }, { status: 404 });
        }
        const runbook = generateRunbook(issue);
        return NextResponse.json({ success: true, runbook });
      }

      default:
        return NextResponse.json({ 
          success: false, 
          error: `Unknown action: ${action}`,
          validActions: ["acknowledge", "dismiss", "auto-fix", "mark-read", "generate-runbook"]
        }, { status: 400 });
    }
  } catch (error) {
    console.error("[Health Check POST] Error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Request failed" 
      },
      { status: 500 }
    );
  }
}
