import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { jarvisAgents, jarvisAgentExecutions } from "@/lib/db/platform-schema";
import { eq, and, sql, count, desc, ilike, inArray } from "drizzle-orm";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export interface JarvisAgentConfig {
  id: number;
  name: string;
  persona: string;
  description: string | null;
  capabilities: string[];
  tools: string[];
  modelPreference: string | null;
  temperature: number;
  maxTokens: number | null;
  nodeAffinity: string | null;
  isActive: boolean | null;
  isSystem: boolean | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export const BUILTIN_AGENT_CONFIGS: Omit<JarvisAgentConfig, "id" | "createdAt" | "updatedAt">[] = [
  {
    name: "jarvis",
    persona: `You are Jarvis, the AI assistant for Nebula Command - a comprehensive homelab management platform. You help users with:
- Managing Docker containers and services across multiple servers
- Troubleshooting deployment issues and infrastructure problems
- Writing and debugging code
- Automating tasks and workflows
- Creative content generation

You have access to the homelab infrastructure and can provide specific, actionable advice. Be concise but thorough.`,
    description: "General-purpose AI assistant for Nebula Command",
    capabilities: ["general", "infrastructure", "automation", "creative"],
    tools: ["docker_manage", "file_read", "file_write", "ssh_execute", "web_search"],
    modelPreference: "llama3.2",
    temperature: 0.7,
    maxTokens: 4096,
    nodeAffinity: "any",
    isActive: true,
    isSystem: true,
    createdBy: "system",
  },
  {
    name: "coder",
    persona: `You are an expert software engineer. You help users:
- Write clean, efficient code following best practices
- Debug issues and fix errors
- Refactor and optimize existing code
- Explain complex programming concepts

Always provide complete, working code examples. Use proper error handling and comments.`,
    description: "Specialized in code generation and debugging",
    capabilities: ["coding", "debugging", "refactoring", "code-review"],
    tools: ["file_read", "file_write", "grep_search", "code_execute"],
    modelPreference: "codellama",
    temperature: 0.3,
    maxTokens: 8192,
    nodeAffinity: "any",
    isActive: true,
    isSystem: true,
    createdBy: "system",
  },
  {
    name: "creative",
    persona: `You are a creative AI assistant specializing in digital content. You help users:
- Generate images with detailed prompts
- Write compelling copy and marketing content
- Create social media posts and captions
- Design concepts and visual ideas

Be creative and inspiring while following brand guidelines when provided.`,
    description: "AI for content creation and digital media",
    capabilities: ["image-generation", "copywriting", "design", "creative-writing"],
    tools: ["generate_image", "file_write", "web_search"],
    modelPreference: "llama3.2",
    temperature: 0.9,
    maxTokens: 4096,
    nodeAffinity: "windows",
    isActive: true,
    isSystem: true,
    createdBy: "system",
  },
  {
    name: "devops",
    persona: `You are a DevOps engineer AI. You help users with:
- Docker and container management
- CI/CD pipeline configuration
- Server monitoring and troubleshooting
- Infrastructure as code (Terraform, Ansible)
- Kubernetes and container orchestration

Provide production-ready configurations with proper security practices.`,
    description: "Infrastructure and deployment automation",
    capabilities: ["docker", "ci-cd", "monitoring", "infrastructure"],
    tools: ["docker_manage", "ssh_execute", "file_read", "file_write", "kubernetes_manage"],
    modelPreference: "llama3.2",
    temperature: 0.5,
    maxTokens: 4096,
    nodeAffinity: "linode",
    isActive: true,
    isSystem: true,
    createdBy: "system",
  },
  {
    name: "researcher",
    persona: `You are a research assistant AI. You help users:
- Find and summarize information from multiple sources
- Conduct in-depth research on technical topics
- Compare options and provide recommendations
- Fact-check and verify information

Be thorough, cite sources when possible, and present balanced viewpoints.`,
    description: "Research and information gathering specialist",
    capabilities: ["research", "summarization", "fact-checking", "analysis"],
    tools: ["web_search", "file_read", "file_write"],
    modelPreference: "llama3.2",
    temperature: 0.4,
    maxTokens: 8192,
    nodeAffinity: "any",
    isActive: true,
    isSystem: true,
    createdBy: "system",
  },
];

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active") === "true";
    const capability = searchParams.get("capability");
    const search = searchParams.get("search");
    const includeBuiltin = searchParams.get("includeBuiltin") !== "false";

    let query = db.select().from(jarvisAgents);

    const conditions = [];
    if (activeOnly) {
      conditions.push(eq(jarvisAgents.isActive, true));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const dbAgents = await query.orderBy(desc(jarvisAgents.createdAt));

    let allAgents: JarvisAgentConfig[] = dbAgents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      persona: agent.persona,
      description: agent.description,
      capabilities: (agent.capabilities as string[]) || [],
      tools: (agent.tools as string[]) || [],
      modelPreference: agent.modelPreference,
      temperature: parseFloat(agent.temperature?.toString() || "0.7"),
      maxTokens: agent.maxTokens,
      nodeAffinity: agent.nodeAffinity,
      isActive: agent.isActive,
      isSystem: agent.isSystem,
      createdBy: agent.createdBy,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    }));

    if (capability) {
      allAgents = allAgents.filter(agent => 
        agent.capabilities.includes(capability)
      );
    }

    if (search) {
      const searchLower = search.toLowerCase();
      allAgents = allAgents.filter(agent =>
        agent.name.toLowerCase().includes(searchLower) ||
        agent.description?.toLowerCase().includes(searchLower)
      );
    }

    const executionStats = await db
      .select({
        agentId: jarvisAgentExecutions.agentId,
        totalExecutions: count(jarvisAgentExecutions.id),
      })
      .from(jarvisAgentExecutions)
      .groupBy(jarvisAgentExecutions.agentId);

    const statsMap = new Map(executionStats.map(s => [s.agentId, s.totalExecutions]));

    const agentsWithStats = allAgents.map(agent => ({
      ...agent,
      executionCount: statsMap.get(agent.id) || 0,
    }));

    return NextResponse.json({
      agents: agentsWithStats,
      total: agentsWithStats.length,
      filters: {
        activeOnly,
        capability,
        search,
        includeBuiltin,
      },
    });
  } catch (error: any) {
    console.error("[Agents] Error fetching agents:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch agents" },
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
    } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Agent name is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    if (!persona || typeof persona !== "string" || persona.trim().length === 0) {
      return NextResponse.json(
        { error: "Agent persona (system prompt) is required" },
        { status: 400 }
      );
    }

    const existing = await db
      .select()
      .from(jarvisAgents)
      .where(eq(jarvisAgents.name, name.trim().toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: `An agent with name "${name}" already exists` },
        { status: 409 }
      );
    }

    const validCapabilities = Array.isArray(capabilities) ? capabilities : [];
    const validTools = Array.isArray(tools) ? tools : [];
    const validTemperature = typeof temperature === "number" && temperature >= 0 && temperature <= 2
      ? temperature.toString()
      : "0.7";
    const validMaxTokens = typeof maxTokens === "number" && maxTokens > 0 ? maxTokens : 4096;
    const validNodeAffinity = ["any", "linode", "home", "windows"].includes(nodeAffinity)
      ? nodeAffinity
      : "any";

    const [created] = await db
      .insert(jarvisAgents)
      .values({
        name: name.trim().toLowerCase(),
        persona: persona.trim(),
        description: description?.trim() || null,
        capabilities: validCapabilities,
        tools: validTools,
        modelPreference: modelPreference || "llama3.2",
        temperature: validTemperature,
        maxTokens: validMaxTokens,
        nodeAffinity: validNodeAffinity,
        isActive: true,
        isSystem: false,
        createdBy: user.username || "user",
      })
      .returning();

    return NextResponse.json({
      message: "Agent created successfully",
      agent: {
        id: created.id,
        name: created.name,
        persona: created.persona,
        description: created.description,
        capabilities: created.capabilities,
        tools: created.tools,
        modelPreference: created.modelPreference,
        temperature: parseFloat(created.temperature?.toString() || "0.7"),
        maxTokens: created.maxTokens,
        nodeAffinity: created.nodeAffinity,
        isActive: created.isActive,
        isSystem: created.isSystem,
        createdBy: created.createdBy,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
    }, { status: 201 });
  } catch (error: any) {
    console.error("[Agents] Error creating agent:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create agent" },
      { status: 500 }
    );
  }
}
