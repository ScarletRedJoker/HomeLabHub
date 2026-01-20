import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { jarvisAgents, jarvisAgentExecutions } from "@/lib/db/platform-schema";
import { eq, count, desc, and, gte } from "drizzle-orm";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const agentId = parseInt(id, 10);

    if (isNaN(agentId)) {
      return NextResponse.json(
        { error: "Invalid agent ID. Expected a numeric value." },
        { status: 400 }
      );
    }

    const [agent] = await db
      .select()
      .from(jarvisAgents)
      .where(eq(jarvisAgents.id, agentId))
      .limit(1);

    if (!agent) {
      return NextResponse.json(
        { error: `Agent with ID ${agentId} not found` },
        { status: 404 }
      );
    }

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [totalStats, last24hStats, last7dStats, recentExecutions] = await Promise.all([
      db
        .select({
          totalExecutions: count(jarvisAgentExecutions.id),
        })
        .from(jarvisAgentExecutions)
        .where(eq(jarvisAgentExecutions.agentId, agentId)),
      db
        .select({
          count: count(jarvisAgentExecutions.id),
        })
        .from(jarvisAgentExecutions)
        .where(
          and(
            eq(jarvisAgentExecutions.agentId, agentId),
            gte(jarvisAgentExecutions.createdAt, last24h)
          )
        ),
      db
        .select({
          count: count(jarvisAgentExecutions.id),
        })
        .from(jarvisAgentExecutions)
        .where(
          and(
            eq(jarvisAgentExecutions.agentId, agentId),
            gte(jarvisAgentExecutions.createdAt, last7d)
          )
        ),
      db
        .select()
        .from(jarvisAgentExecutions)
        .where(eq(jarvisAgentExecutions.agentId, agentId))
        .orderBy(desc(jarvisAgentExecutions.createdAt))
        .limit(10),
    ]);

    const successfulExecutions = recentExecutions.filter(e => e.status === "completed").length;
    const failedExecutions = recentExecutions.filter(e => e.status === "failed").length;
    const avgExecutionTime = recentExecutions
      .filter(e => e.executionTimeMs)
      .reduce((acc, e) => acc + (e.executionTimeMs || 0), 0) / (recentExecutions.length || 1);

    return NextResponse.json({
      agent: {
        id: agent.id,
        name: agent.name,
        persona: agent.persona,
        description: agent.description,
        capabilities: agent.capabilities,
        tools: agent.tools,
        modelPreference: agent.modelPreference,
        temperature: parseFloat(agent.temperature?.toString() || "0.7"),
        maxTokens: agent.maxTokens,
        nodeAffinity: agent.nodeAffinity,
        isActive: agent.isActive,
        isSystem: agent.isSystem,
        createdBy: agent.createdBy,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
      },
      stats: {
        totalExecutions: totalStats[0]?.totalExecutions || 0,
        last24hExecutions: last24hStats[0]?.count || 0,
        last7dExecutions: last7dStats[0]?.count || 0,
        successRate: recentExecutions.length > 0
          ? Math.round((successfulExecutions / recentExecutions.length) * 100)
          : 0,
        avgExecutionTimeMs: Math.round(avgExecutionTime),
      },
      recentExecutions: recentExecutions.map(e => ({
        id: e.id,
        task: e.task.substring(0, 100) + (e.task.length > 100 ? "..." : ""),
        status: e.status,
        executionTimeMs: e.executionTimeMs,
        tokensUsed: e.tokensUsed,
        createdAt: e.createdAt,
        completedAt: e.completedAt,
        error: e.error,
      })),
    });
  } catch (error: any) {
    console.error("[Agents] Error fetching agent:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch agent details" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const agentId = parseInt(id, 10);

    if (isNaN(agentId)) {
      return NextResponse.json(
        { error: "Invalid agent ID. Expected a numeric value." },
        { status: 400 }
      );
    }

    const [existingAgent] = await db
      .select()
      .from(jarvisAgents)
      .where(eq(jarvisAgents.id, agentId))
      .limit(1);

    if (!existingAgent) {
      return NextResponse.json(
        { error: `Agent with ID ${agentId} not found` },
        { status: 404 }
      );
    }

    if (existingAgent.isSystem) {
      return NextResponse.json(
        { error: "Cannot modify system agents. Create a custom agent instead." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      name,
      persona,
      description,
      capabilities,
      tools,
      modelPreference,
      temperature,
      maxTokens,
      nodeAffinity,
      isActive,
    } = body;

    const updates: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json(
          { error: "Agent name must be a non-empty string" },
          { status: 400 }
        );
      }
      const trimmedName = name.trim().toLowerCase();
      if (trimmedName !== existingAgent.name) {
        const nameExists = await db
          .select()
          .from(jarvisAgents)
          .where(eq(jarvisAgents.name, trimmedName))
          .limit(1);
        if (nameExists.length > 0) {
          return NextResponse.json(
            { error: `An agent with name "${name}" already exists` },
            { status: 409 }
          );
        }
      }
      updates.name = trimmedName;
    }

    if (persona !== undefined) {
      if (typeof persona !== "string" || persona.trim().length === 0) {
        return NextResponse.json(
          { error: "Agent persona must be a non-empty string" },
          { status: 400 }
        );
      }
      updates.persona = persona.trim();
    }

    if (description !== undefined) {
      updates.description = description?.trim() || null;
    }

    if (capabilities !== undefined) {
      if (!Array.isArray(capabilities)) {
        return NextResponse.json(
          { error: "Capabilities must be an array of strings" },
          { status: 400 }
        );
      }
      updates.capabilities = capabilities;
    }

    if (tools !== undefined) {
      if (!Array.isArray(tools)) {
        return NextResponse.json(
          { error: "Tools must be an array of strings" },
          { status: 400 }
        );
      }
      updates.tools = tools;
    }

    if (modelPreference !== undefined) {
      updates.modelPreference = modelPreference || "llama3.2";
    }

    if (temperature !== undefined) {
      if (typeof temperature !== "number" || temperature < 0 || temperature > 2) {
        return NextResponse.json(
          { error: "Temperature must be a number between 0 and 2" },
          { status: 400 }
        );
      }
      updates.temperature = temperature.toString();
    }

    if (maxTokens !== undefined) {
      if (typeof maxTokens !== "number" || maxTokens <= 0) {
        return NextResponse.json(
          { error: "maxTokens must be a positive number" },
          { status: 400 }
        );
      }
      updates.maxTokens = maxTokens;
    }

    if (nodeAffinity !== undefined) {
      if (!["any", "linode", "home", "windows"].includes(nodeAffinity)) {
        return NextResponse.json(
          { error: "nodeAffinity must be one of: any, linode, home, windows" },
          { status: 400 }
        );
      }
      updates.nodeAffinity = nodeAffinity;
    }

    if (isActive !== undefined) {
      updates.isActive = Boolean(isActive);
    }

    const [updated] = await db
      .update(jarvisAgents)
      .set(updates)
      .where(eq(jarvisAgents.id, agentId))
      .returning();

    return NextResponse.json({
      message: "Agent updated successfully",
      agent: {
        id: updated.id,
        name: updated.name,
        persona: updated.persona,
        description: updated.description,
        capabilities: updated.capabilities,
        tools: updated.tools,
        modelPreference: updated.modelPreference,
        temperature: parseFloat(updated.temperature?.toString() || "0.7"),
        maxTokens: updated.maxTokens,
        nodeAffinity: updated.nodeAffinity,
        isActive: updated.isActive,
        isSystem: updated.isSystem,
        createdBy: updated.createdBy,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("[Agents] Error updating agent:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update agent" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const agentId = parseInt(id, 10);

    if (isNaN(agentId)) {
      return NextResponse.json(
        { error: "Invalid agent ID. Expected a numeric value." },
        { status: 400 }
      );
    }

    const [existingAgent] = await db
      .select()
      .from(jarvisAgents)
      .where(eq(jarvisAgents.id, agentId))
      .limit(1);

    if (!existingAgent) {
      return NextResponse.json(
        { error: `Agent with ID ${agentId} not found` },
        { status: 404 }
      );
    }

    if (existingAgent.isSystem) {
      return NextResponse.json(
        { error: "Cannot delete system agents. You can only deactivate them." },
        { status: 403 }
      );
    }

    await db
      .delete(jarvisAgentExecutions)
      .where(eq(jarvisAgentExecutions.agentId, agentId));

    const [deleted] = await db
      .delete(jarvisAgents)
      .where(eq(jarvisAgents.id, agentId))
      .returning();

    return NextResponse.json({
      message: "Agent deleted successfully",
      deletedAgent: {
        id: deleted.id,
        name: deleted.name,
      },
    });
  } catch (error: any) {
    console.error("[Agents] Error deleting agent:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete agent" },
      { status: 500 }
    );
  }
}
