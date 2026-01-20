import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { jarvisAgents, jarvisAgentExecutions } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";
import { aiOrchestrator } from "@/lib/ai-orchestrator";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

const LOCAL_AI_ONLY = process.env.LOCAL_AI_ONLY === "true";

interface ExecuteRequest {
  task: string;
  context?: Record<string, any>;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  let executionId: number | null = null;

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

    if (!agent.isActive) {
      return NextResponse.json(
        { error: "This agent is currently inactive. Enable it before running tasks." },
        { status: 400 }
      );
    }

    const body: ExecuteRequest = await request.json();
    const { task, context } = body;

    if (!task || typeof task !== "string" || task.trim().length === 0) {
      return NextResponse.json(
        { error: "Task is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    const [execution] = await db
      .insert(jarvisAgentExecutions)
      .values({
        agentId: agent.id,
        task: task.trim(),
        status: "running",
        input: context || {},
      })
      .returning();

    executionId = execution.id;

    let contextPrompt = "";
    if (context && Object.keys(context).length > 0) {
      contextPrompt = "\n\n## Context:\n" + JSON.stringify(context, null, 2);
    }

    const fullPrompt = task.trim() + contextPrompt;

    let provider: "ollama" | "openai" | "auto" = "auto";
    let model = agent.modelPreference || "llama3.2";

    if (LOCAL_AI_ONLY) {
      provider = "ollama";
    }

    const response = await aiOrchestrator.chat({
      messages: [
        { role: "system", content: agent.persona },
        { role: "user", content: fullPrompt },
      ],
      config: {
        provider,
        model,
        temperature: parseFloat(agent.temperature?.toString() || "0.7"),
        maxTokens: agent.maxTokens || 4096,
      },
    });

    const executionTimeMs = Date.now() - startTime;

    await db
      .update(jarvisAgentExecutions)
      .set({
        status: "completed",
        output: {
          content: response.content,
          model: response.model,
          provider: response.provider,
        },
        tokensUsed: response.usage?.totalTokens || null,
        executionTimeMs,
        completedAt: new Date(),
      })
      .where(eq(jarvisAgentExecutions.id, executionId));

    return NextResponse.json({
      executionId,
      agentId: agent.id,
      agentName: agent.name,
      task: task.trim(),
      result: {
        content: response.content,
        model: response.model,
        provider: response.provider,
      },
      usage: response.usage,
      executionTimeMs,
      status: "completed",
    });
  } catch (error: any) {
    console.error("[AgentExecute] Error executing task:", error);

    const executionTimeMs = Date.now() - startTime;

    if (executionId) {
      try {
        await db
          .update(jarvisAgentExecutions)
          .set({
            status: "failed",
            error: error.message || "Execution failed",
            executionTimeMs,
            completedAt: new Date(),
          })
          .where(eq(jarvisAgentExecutions.id, executionId));
      } catch (dbError) {
        console.error("[AgentExecute] Failed to update execution status:", dbError);
      }
    }

    let errorMessage = error.message || "Failed to execute task";
    let statusCode = 500;

    if (error.message?.includes("connection") || error.message?.includes("ECONNREFUSED")) {
      errorMessage = "AI service is not available. Please check if Ollama is running.";
      statusCode = 503;
    } else if (error.message?.includes("model")) {
      errorMessage = `Model "${error.message}" is not available. Try a different model.`;
      statusCode = 400;
    }

    return NextResponse.json(
      {
        error: errorMessage,
        executionId,
        executionTimeMs,
        status: "failed",
      },
      { status: statusCode }
    );
  }
}
