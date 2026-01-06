import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { workflows, workflowExecutions } from "@/lib/db/platform-schema";
import { eq, desc, and } from "drizzle-orm";

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
      const results: any[] = [];

      for (const actionItem of actions) {
        results.push({
          actionId: actionItem.id,
          actionType: actionItem.type,
          actionName: actionItem.name,
          status: "completed",
          message: `Action "${actionItem.name}" executed successfully (stubbed)`,
        });
      }

      const durationMs = Date.now() - startTime;

      const [execution] = await db
        .insert(workflowExecutions)
        .values({
          workflowId,
          status: "completed",
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
