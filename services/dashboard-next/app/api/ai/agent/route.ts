import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { AIAgent, AgentConfig, AgentResponse } from "@/lib/ai-agent/agent";
import { tools, getToolByName } from "@/lib/ai-agent/tools";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

function getWorkingDir(): string {
  if (process.env.REPL_ID) {
    return process.cwd();
  }
  return process.env.AGENT_WORKING_DIR || "/opt/homelab/HomeLabHub";
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { 
      message, 
      provider = "auto", 
      model,
      autoApprove = false,
      workingDir,
    } = body;

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const config: AgentConfig = {
      provider,
      model,
      workingDir: workingDir || getWorkingDir(),
      autoApprove,
      maxIterations: 15,
    };

    const agent = new AIAgent(config);
    const response = await agent.run(message);

    return NextResponse.json({
      success: response.success,
      response: response.response,
      steps: response.steps.map(s => ({
        type: s.type,
        content: s.content.slice(0, 5000),
        toolCall: s.toolCall,
        toolResult: s.toolResult ? {
          success: s.toolResult.success,
          output: s.toolResult.output.slice(0, 3000),
          error: s.toolResult.error,
        } : undefined,
        timestamp: s.timestamp,
      })),
      toolsUsed: response.toolsUsed,
      provider: response.provider,
      model: response.model,
      pendingApprovals: response.pendingApprovals,
    });
  } catch (error: any) {
    console.error("Agent error:", error);
    return NextResponse.json(
      { error: "Agent execution failed", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const toolList = tools.map(t => ({
    name: t.name,
    description: t.description,
    category: t.category,
    parameters: t.parameters,
    requiresApproval: t.requiresApproval,
  }));

  const categories = {
    codebase: toolList.filter(t => t.category === "codebase"),
    file: toolList.filter(t => t.category === "file"),
    shell: toolList.filter(t => t.category === "shell"),
    research: toolList.filter(t => t.category === "research"),
  };

  return NextResponse.json({
    tools: toolList,
    categories,
    totalTools: toolList.length,
    capabilities: [
      "Search and explore codebase",
      "Read and understand code",
      "Write and edit files",
      "Run shell commands",
      "Web research with DuckDuckGo",
      "Git operations",
    ],
    providers: ["openai", "ollama", "auto"],
  });
}
