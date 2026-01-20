import { NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export interface BuiltInAgent {
  id: string;
  name: string;
  displayName: string;
  persona: string;
  description: string;
  capabilities: string[];
  tools: string[];
  modelPreference: string;
  temperature: number;
  maxTokens: number;
  nodeAffinity: string;
  icon: string;
  color: string;
}

const BUILTIN_AGENTS: BuiltInAgent[] = [
  {
    id: "jarvis",
    name: "jarvis",
    displayName: "Jarvis",
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
    icon: "Bot",
    color: "#6366f1",
  },
  {
    id: "coder",
    name: "coder",
    displayName: "Code Assistant",
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
    icon: "Code",
    color: "#10b981",
  },
  {
    id: "creative",
    name: "creative",
    displayName: "Creative Studio",
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
    icon: "Palette",
    color: "#f59e0b",
  },
  {
    id: "devops",
    name: "devops",
    displayName: "DevOps Assistant",
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
    icon: "Server",
    color: "#3b82f6",
  },
  {
    id: "researcher",
    name: "researcher",
    displayName: "Research Assistant",
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
    icon: "Search",
    color: "#8b5cf6",
  },
];

export async function GET() {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    agents: BUILTIN_AGENTS,
    count: BUILTIN_AGENTS.length,
    description: "These are the default Jarvis AI agent configurations. They cannot be modified but can be used as templates for custom agents.",
  });
}
