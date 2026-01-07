import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { workflows, workflowExecutions } from "@/lib/db/platform-schema";
import { eq, desc, and } from "drizzle-orm";
import { Client } from "ssh2";
import { readFileSync, existsSync } from "fs";
import { getServerById, getDefaultSshKeyPath } from "@/lib/server-config-store";

interface ActionResult {
  actionId: string;
  actionType: string;
  actionName: string;
  status: "completed" | "failed" | "skipped";
  message: string;
  output?: unknown;
  error?: string;
  durationMs?: number;
}

interface HttpRequestConfig {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

interface SshCommandConfig {
  serverId: string;
  command: string;
}

interface DiscordNotifyConfig {
  webhookUrl: string;
  message?: string;
  embed?: {
    title?: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
  };
}

interface EmailConfig {
  to: string;
  subject: string;
  body: string;
}

async function executeHttpRequest(config: HttpRequestConfig): Promise<{ success: boolean; output?: unknown; error?: string }> {
  try {
    const { url, method = "GET", headers = {}, body } = config;
    
    if (!url) {
      return { success: false, error: "URL is required" };
    }

    const fetchOptions: RequestInit = {
      method: method.toUpperCase(),
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };

    if (body && method.toUpperCase() !== "GET") {
      fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);
    const contentType = response.headers.get("content-type") || "";
    
    let responseData: unknown;
    if (contentType.includes("application/json")) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    if (!response.ok) {
      return {
        success: false,
        output: responseData,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    return { success: true, output: responseData };
  } catch (error: any) {
    return { success: false, error: error.message || "HTTP request failed" };
  }
}

async function executeSSHCommand(
  host: string,
  user: string,
  keyPath: string,
  command: string
): Promise<{ success: boolean; output?: string; error?: string }> {
  return new Promise((resolve) => {
    if (!existsSync(keyPath)) {
      resolve({ success: false, error: `SSH key not found: ${keyPath}` });
      return;
    }

    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.end();
      resolve({ success: false, error: "Connection timeout" });
    }, 60000);

    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          resolve({ success: false, error: err.message });
          return;
        }

        let output = "";
        let errorOutput = "";

        stream.on("data", (data: Buffer) => {
          output += data.toString();
        });

        stream.stderr.on("data", (data: Buffer) => {
          errorOutput += data.toString();
        });

        stream.on("close", (code: number) => {
          clearTimeout(timeout);
          conn.end();
          if (code === 0) {
            resolve({ success: true, output: output.trim() });
          } else {
            resolve({
              success: false,
              output: output.trim(),
              error: errorOutput.trim() || `Command exited with code ${code}`,
            });
          }
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });

    try {
      conn.connect({
        host,
        port: 22,
        username: user,
        privateKey: readFileSync(keyPath),
        readyTimeout: 30000,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    }
  });
}

async function executeSshCommandAction(config: SshCommandConfig): Promise<{ success: boolean; output?: string; error?: string }> {
  const { serverId, command } = config;

  if (!serverId || !command) {
    return { success: false, error: "serverId and command are required" };
  }

  const server = await getServerById(serverId);
  if (!server) {
    return { success: false, error: `Server not found: ${serverId}. Available servers can be configured in Settings.` };
  }

  const keyPath = server.keyPath || getDefaultSshKeyPath();
  
  if (!existsSync(keyPath)) {
    return { 
      success: false, 
      error: `SSH key not found at ${keyPath}. Please configure the SSH key path in Settings > Servers.` 
    };
  }

  return executeSSHCommand(server.host, server.user, keyPath, command);
}

async function executeDiscordNotify(config: DiscordNotifyConfig): Promise<{ success: boolean; output?: unknown; error?: string }> {
  try {
    const { webhookUrl, message, embed } = config;

    if (!webhookUrl) {
      return { success: false, error: "webhookUrl is required" };
    }

    const payload: Record<string, unknown> = {};

    if (message) {
      payload.content = message;
    }

    if (embed) {
      payload.embeds = [{
        title: embed.title,
        description: embed.description,
        color: embed.color || 0x5865F2,
        fields: embed.fields,
        timestamp: new Date().toISOString(),
      }];
    }

    if (!payload.content && !payload.embeds) {
      return { success: false, error: "Either message or embed is required" };
    }

    const maxRetries = 3;
    let lastError = "";
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return { success: true, output: { sent: true, attempt } };
      }

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get("Retry-After") || "2", 10);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          continue;
        }
        lastError = `Rate limited after ${maxRetries} attempts`;
      } else if (response.status >= 500 && attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      } else {
        const errorText = await response.text();
        lastError = `Discord webhook failed: ${response.status} - ${errorText}`;
        break;
      }
    }

    return { success: false, error: lastError };
  } catch (error: any) {
    return { success: false, error: error.message || "Discord notification failed" };
  }
}

async function executeEmail(config: EmailConfig): Promise<{ success: boolean; output?: unknown; error?: string }> {
  const { to, subject, body } = config;

  if (!to || !subject || !body) {
    return { success: false, error: "to, subject, and body are required" };
  }

  const smtpHost = process.env.SMTP_HOST;
  if (!smtpHost) {
    return {
      success: true,
      output: { 
        skipped: true, 
        reason: "Email not configured - SMTP_HOST not set. Configure self-hosted email in Settings to enable." 
      },
    };
  }

  return {
    success: true,
    output: { 
      skipped: true, 
      reason: "Email sending not yet implemented - SMTP integration pending",
      to,
      subject,
    },
  };
}

async function executeAction(action: WorkflowAction): Promise<ActionResult> {
  const startTime = Date.now();
  
  try {
    let result: { success: boolean; output?: unknown; error?: string };

    switch (action.type) {
      case "http-request":
        result = await executeHttpRequest(action.config as unknown as HttpRequestConfig);
        break;
      case "ssh-command":
        result = await executeSshCommandAction(action.config as unknown as SshCommandConfig);
        break;
      case "discord-notify":
        result = await executeDiscordNotify(action.config as unknown as DiscordNotifyConfig);
        break;
      case "email":
        result = await executeEmail(action.config as unknown as EmailConfig);
        break;
      default:
        result = { success: false, error: `Unknown action type: ${action.type}` };
    }

    const durationMs = Date.now() - startTime;

    if (result.success) {
      return {
        actionId: action.id,
        actionType: action.type,
        actionName: action.name,
        status: "completed",
        message: `Action "${action.name}" executed successfully`,
        output: result.output,
        durationMs,
      };
    } else {
      return {
        actionId: action.id,
        actionType: action.type,
        actionName: action.name,
        status: "failed",
        message: `Action "${action.name}" failed`,
        error: result.error,
        output: result.output,
        durationMs,
      };
    }
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    return {
      actionId: action.id,
      actionType: action.type,
      actionName: action.name,
      status: "failed",
      message: `Action "${action.name}" threw an exception`,
      error: error.message || "Unknown error",
      durationMs,
    };
  }
}

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export interface WorkflowTrigger {
  type: "schedule" | "webhook" | "event";
  config: {
    cron?: string;
    webhookUrl?: string;
    eventType?: "server-status" | "container-status";
    eventConfig?: Record<string, unknown>;
  };
}

export interface WorkflowAction {
  id: string;
  type: "http-request" | "ssh-command" | "discord-notify" | "email";
  name: string;
  config: Record<string, unknown>;
}

export interface WorkflowData {
  id: string;
  userId: string;
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  actions: WorkflowAction[];
  enabled: boolean;
  lastRun: Date | null;
  runCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get("id");
    const includeHistory = searchParams.get("history") === "true";

    if (workflowId) {
      const [workflow] = await db
        .select()
        .from(workflows)
        .where(and(eq(workflows.id, workflowId), eq(workflows.userId, user.username || "")));

      if (!workflow) {
        return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
      }

      let history: any[] = [];
      if (includeHistory) {
        history = await db
          .select()
          .from(workflowExecutions)
          .where(eq(workflowExecutions.workflowId, workflowId))
          .orderBy(desc(workflowExecutions.startedAt))
          .limit(20);
      }

      return NextResponse.json({
        workflow: {
          id: workflow.id,
          userId: workflow.userId,
          name: workflow.name,
          description: workflow.description || "",
          trigger: workflow.trigger as WorkflowTrigger,
          actions: workflow.actions as WorkflowAction[],
          enabled: workflow.enabled ?? true,
          lastRun: workflow.lastRun,
          runCount: workflow.runCount ?? 0,
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt,
        },
        history,
      });
    }

    const userWorkflows = await db
      .select()
      .from(workflows)
      .where(eq(workflows.userId, user.username || ""))
      .orderBy(desc(workflows.createdAt));

    const workflowsWithHistory = await Promise.all(
      userWorkflows.map(async (wf) => {
        const recentExecutions = await db
          .select()
          .from(workflowExecutions)
          .where(eq(workflowExecutions.workflowId, wf.id))
          .orderBy(desc(workflowExecutions.startedAt))
          .limit(3);

        return {
          id: wf.id,
          userId: wf.userId,
          name: wf.name,
          description: wf.description || "",
          trigger: wf.trigger as WorkflowTrigger,
          actions: wf.actions as WorkflowAction[],
          enabled: wf.enabled ?? true,
          lastRun: wf.lastRun,
          runCount: wf.runCount ?? 0,
          createdAt: wf.createdAt,
          updatedAt: wf.updatedAt,
          recentExecutions,
        };
      })
    );

    return NextResponse.json({ workflows: workflowsWithHistory });
  } catch (error: any) {
    console.error("Error fetching workflows:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch workflows" },
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
    const { action } = body;

    if (action === "execute") {
      const { workflowId } = body;
      if (!workflowId) {
        return NextResponse.json({ error: "Workflow ID is required" }, { status: 400 });
      }

      const [workflow] = await db
        .select()
        .from(workflows)
        .where(and(eq(workflows.id, workflowId), eq(workflows.userId, user.username || "")));

      if (!workflow) {
        return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
      }

      const startTime = Date.now();
      const actions = workflow.actions as WorkflowAction[];
      const results: ActionResult[] = [];
      let hasFailures = false;

      for (const actionItem of actions) {
        const result = await executeAction(actionItem);
        results.push(result);
        if (result.status === "failed") {
          hasFailures = true;
        }
      }

      const durationMs = Date.now() - startTime;
      const overallStatus = hasFailures ? "completed_with_errors" : "completed";

      const [execution] = await db
        .insert(workflowExecutions)
        .values({
          workflowId,
          status: overallStatus,
          triggeredBy: "manual",
          output: { actions: results },
          durationMs,
          completedAt: new Date(),
        })
        .returning();

      await db
        .update(workflows)
        .set({
          lastRun: new Date(),
          runCount: (workflow.runCount ?? 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(workflows.id, workflowId));

      return NextResponse.json({
        message: "Workflow executed successfully",
        execution: {
          id: execution.id,
          workflowId: execution.workflowId,
          status: execution.status,
          triggeredBy: execution.triggeredBy,
          output: execution.output,
          durationMs: execution.durationMs,
          startedAt: execution.startedAt,
          completedAt: execution.completedAt,
        },
      });
    }

    const { name, description, trigger, actions: workflowActions } = body;

    if (!name || !trigger || !workflowActions) {
      return NextResponse.json(
        { error: "Missing required fields: name, trigger, actions" },
        { status: 400 }
      );
    }

    if (!["schedule", "webhook", "event"].includes(trigger.type)) {
      return NextResponse.json(
        { error: "Invalid trigger type. Must be one of: schedule, webhook, event" },
        { status: 400 }
      );
    }

    const validActionTypes = ["http-request", "ssh-command", "discord-notify", "email"];
    for (const action of workflowActions) {
      if (!validActionTypes.includes(action.type)) {
        return NextResponse.json(
          { error: `Invalid action type: ${action.type}. Must be one of: ${validActionTypes.join(", ")}` },
          { status: 400 }
        );
      }
    }

    const [created] = await db
      .insert(workflows)
      .values({
        userId: user.username || "system",
        name,
        description: description || null,
        trigger,
        actions: workflowActions,
        enabled: true,
      })
      .returning();

    return NextResponse.json({
      message: "Workflow created successfully",
      workflow: {
        id: created.id,
        userId: created.userId,
        name: created.name,
        description: created.description,
        trigger: created.trigger as WorkflowTrigger,
        actions: created.actions as WorkflowAction[],
        enabled: created.enabled,
        lastRun: created.lastRun,
        runCount: created.runCount,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
    }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating workflow:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create workflow" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, name, description, trigger, actions: workflowActions, enabled } = body;

    if (!id) {
      return NextResponse.json({ error: "Workflow ID is required" }, { status: 400 });
    }

    const [existing] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, id), eq(workflows.userId, user.username || "")));

    if (!existing) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    const updateData: any = { updatedAt: new Date() };

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (trigger !== undefined) {
      if (!["schedule", "webhook", "event"].includes(trigger.type)) {
        return NextResponse.json(
          { error: "Invalid trigger type. Must be one of: schedule, webhook, event" },
          { status: 400 }
        );
      }
      updateData.trigger = trigger;
    }
    if (workflowActions !== undefined) {
      const validActionTypes = ["http-request", "ssh-command", "discord-notify", "email"];
      for (const action of workflowActions) {
        if (!validActionTypes.includes(action.type)) {
          return NextResponse.json(
            { error: `Invalid action type: ${action.type}` },
            { status: 400 }
          );
        }
      }
      updateData.actions = workflowActions;
    }
    if (enabled !== undefined) updateData.enabled = enabled;

    const [updated] = await db
      .update(workflows)
      .set(updateData)
      .where(eq(workflows.id, id))
      .returning();

    return NextResponse.json({
      message: "Workflow updated successfully",
      workflow: {
        id: updated.id,
        userId: updated.userId,
        name: updated.name,
        description: updated.description,
        trigger: updated.trigger as WorkflowTrigger,
        actions: updated.actions as WorkflowAction[],
        enabled: updated.enabled,
        lastRun: updated.lastRun,
        runCount: updated.runCount,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("Error updating workflow:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update workflow" },
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
    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get("id");

    if (!workflowId) {
      return NextResponse.json({ error: "Workflow ID is required" }, { status: 400 });
    }

    const [existing] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, workflowId), eq(workflows.userId, user.username || "")));

    if (!existing) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    await db.delete(workflowExecutions).where(eq(workflowExecutions.workflowId, workflowId));

    const [deleted] = await db
      .delete(workflows)
      .where(eq(workflows.id, workflowId))
      .returning();

    return NextResponse.json({
      message: "Workflow deleted successfully",
      workflowId: deleted.id,
    });
  } catch (error: any) {
    console.error("Error deleting workflow:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete workflow" },
      { status: 500 }
    );
  }
}
