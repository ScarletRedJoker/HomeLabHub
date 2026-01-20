import { NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export interface Capability {
  id: string;
  name: string;
  description: string;
  category: string;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
  category: string;
  requiresNode?: string;
}

export interface Model {
  id: string;
  name: string;
  provider: string;
  description: string;
  contextWindow: number;
  capabilities: string[];
  recommended: boolean;
}

const CAPABILITIES: Capability[] = [
  { id: "general", name: "General", description: "General-purpose assistance and conversation", category: "Core" },
  { id: "infrastructure", name: "Infrastructure", description: "Server and infrastructure management", category: "DevOps" },
  { id: "automation", name: "Automation", description: "Task and workflow automation", category: "DevOps" },
  { id: "creative", name: "Creative", description: "Creative content generation", category: "Content" },
  { id: "coding", name: "Coding", description: "Code generation and assistance", category: "Development" },
  { id: "debugging", name: "Debugging", description: "Bug finding and fixing", category: "Development" },
  { id: "refactoring", name: "Refactoring", description: "Code refactoring and optimization", category: "Development" },
  { id: "code-review", name: "Code Review", description: "Code quality and best practices review", category: "Development" },
  { id: "image-generation", name: "Image Generation", description: "AI image generation and editing", category: "Creative" },
  { id: "copywriting", name: "Copywriting", description: "Marketing and promotional content", category: "Content" },
  { id: "design", name: "Design", description: "Design concepts and visual ideas", category: "Creative" },
  { id: "creative-writing", name: "Creative Writing", description: "Stories, scripts, and creative content", category: "Content" },
  { id: "docker", name: "Docker", description: "Container management and orchestration", category: "DevOps" },
  { id: "ci-cd", name: "CI/CD", description: "Continuous integration and deployment", category: "DevOps" },
  { id: "monitoring", name: "Monitoring", description: "System and application monitoring", category: "DevOps" },
  { id: "research", name: "Research", description: "Information gathering and analysis", category: "Research" },
  { id: "summarization", name: "Summarization", description: "Content summarization and extraction", category: "Research" },
  { id: "fact-checking", name: "Fact Checking", description: "Verification and fact-checking", category: "Research" },
  { id: "analysis", name: "Analysis", description: "Data and information analysis", category: "Research" },
];

const TOOLS: Tool[] = [
  {
    id: "docker_manage",
    name: "Docker Management",
    description: "Manage Docker containers (start, stop, restart, logs, list)",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["start", "stop", "restart", "logs", "list", "inspect"] },
        container: { type: "string", description: "Container name or ID" },
        tail: { type: "number", description: "Number of log lines to return" },
      },
      required: ["action"],
    },
    category: "Infrastructure",
    requiresNode: "any",
  },
  {
    id: "file_read",
    name: "File Read",
    description: "Read contents of a file from the filesystem",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to read" },
        encoding: { type: "string", description: "File encoding (default: utf-8)" },
      },
      required: ["path"],
    },
    category: "Files",
  },
  {
    id: "file_write",
    name: "File Write",
    description: "Write or update a file on the filesystem",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to write" },
        content: { type: "string", description: "Content to write" },
        mode: { type: "string", enum: ["write", "append"], description: "Write mode" },
      },
      required: ["path", "content"],
    },
    category: "Files",
  },
  {
    id: "ssh_execute",
    name: "SSH Execute",
    description: "Execute command on remote server via SSH",
    parameters: {
      type: "object",
      properties: {
        server: { type: "string", enum: ["linode", "homelab", "windows"], description: "Target server" },
        command: { type: "string", description: "Command to execute" },
        timeout: { type: "number", description: "Command timeout in seconds" },
      },
      required: ["server", "command"],
    },
    category: "Infrastructure",
  },
  {
    id: "grep_search",
    name: "Grep Search",
    description: "Search for patterns in files using grep",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Search pattern (regex supported)" },
        path: { type: "string", description: "Directory or file to search" },
        recursive: { type: "boolean", description: "Search recursively" },
        ignoreCase: { type: "boolean", description: "Case-insensitive search" },
      },
      required: ["pattern"],
    },
    category: "Files",
  },
  {
    id: "generate_image",
    name: "Generate Image",
    description: "Generate an image using AI (Stable Diffusion)",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Image description prompt" },
        negativePrompt: { type: "string", description: "What to avoid in the image" },
        size: { type: "string", enum: ["512x512", "768x768", "1024x1024"] },
        steps: { type: "number", description: "Number of diffusion steps" },
        cfgScale: { type: "number", description: "Classifier free guidance scale" },
      },
      required: ["prompt"],
    },
    category: "AI",
    requiresNode: "windows",
  },
  {
    id: "web_search",
    name: "Web Search",
    description: "Search the web for information",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Maximum results to return" },
      },
      required: ["query"],
    },
    category: "Research",
  },
  {
    id: "code_execute",
    name: "Code Execute",
    description: "Execute code in a sandboxed environment",
    parameters: {
      type: "object",
      properties: {
        language: { type: "string", enum: ["python", "javascript", "bash", "typescript"] },
        code: { type: "string", description: "Code to execute" },
        timeout: { type: "number", description: "Execution timeout in seconds" },
      },
      required: ["language", "code"],
    },
    category: "Development",
  },
  {
    id: "kubernetes_manage",
    name: "Kubernetes Management",
    description: "Manage Kubernetes resources",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["get", "describe", "apply", "delete", "scale"] },
        resource: { type: "string", description: "Resource type (pods, deployments, services)" },
        name: { type: "string", description: "Resource name" },
        namespace: { type: "string", description: "Kubernetes namespace" },
      },
      required: ["action", "resource"],
    },
    category: "Infrastructure",
  },
];

const MODELS: Model[] = [
  {
    id: "llama3.2",
    name: "Llama 3.2",
    provider: "ollama",
    description: "Meta's latest open model, great for general tasks",
    contextWindow: 128000,
    capabilities: ["general", "coding", "analysis"],
    recommended: true,
  },
  {
    id: "llama3.1",
    name: "Llama 3.1",
    provider: "ollama",
    description: "Previous Llama version, stable and reliable",
    contextWindow: 128000,
    capabilities: ["general", "coding"],
    recommended: false,
  },
  {
    id: "codellama",
    name: "Code Llama",
    provider: "ollama",
    description: "Specialized for code generation and understanding",
    contextWindow: 16000,
    capabilities: ["coding", "debugging", "refactoring"],
    recommended: true,
  },
  {
    id: "mistral",
    name: "Mistral 7B",
    provider: "ollama",
    description: "Efficient model with strong performance",
    contextWindow: 32000,
    capabilities: ["general", "analysis"],
    recommended: false,
  },
  {
    id: "mixtral",
    name: "Mixtral 8x7B",
    provider: "ollama",
    description: "Mixture of experts model for complex tasks",
    contextWindow: 32000,
    capabilities: ["general", "coding", "analysis"],
    recommended: false,
  },
  {
    id: "deepseek-coder",
    name: "DeepSeek Coder",
    provider: "ollama",
    description: "Specialized for code with strong performance",
    contextWindow: 16000,
    capabilities: ["coding", "debugging"],
    recommended: true,
  },
  {
    id: "phi3",
    name: "Phi-3",
    provider: "ollama",
    description: "Microsoft's efficient small language model",
    contextWindow: 4096,
    capabilities: ["general"],
    recommended: false,
  },
  {
    id: "gemma2",
    name: "Gemma 2",
    provider: "ollama",
    description: "Google's open model, good for varied tasks",
    contextWindow: 8192,
    capabilities: ["general", "analysis"],
    recommended: false,
  },
  {
    id: "qwen2.5",
    name: "Qwen 2.5",
    provider: "ollama",
    description: "Alibaba's latest model with strong multilingual support",
    contextWindow: 32768,
    capabilities: ["general", "coding", "analysis"],
    recommended: true,
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    description: "OpenAI's flagship model (requires API key)",
    contextWindow: 128000,
    capabilities: ["general", "coding", "analysis", "creative"],
    recommended: false,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    description: "Faster, cheaper GPT-4 variant (requires API key)",
    contextWindow: 128000,
    capabilities: ["general", "coding"],
    recommended: false,
  },
];

const NODE_AFFINITIES = [
  { id: "any", name: "Any", description: "Run on any available node" },
  { id: "linode", name: "Linode", description: "Cloud server (web hosting, databases)" },
  { id: "home", name: "Home Server", description: "Local homelab (KVM, Plex, NAS)" },
  { id: "windows", name: "Windows VM", description: "GPU compute (Ollama, Stable Diffusion, ComfyUI)" },
];

export async function GET() {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const capabilityCategories = [...new Set(CAPABILITIES.map(c => c.category))];
  const toolCategories = [...new Set(TOOLS.map(t => t.category))];

  return NextResponse.json({
    capabilities: {
      list: CAPABILITIES,
      categories: capabilityCategories,
      count: CAPABILITIES.length,
    },
    tools: {
      list: TOOLS,
      categories: toolCategories,
      count: TOOLS.length,
    },
    models: {
      list: MODELS,
      providers: [...new Set(MODELS.map(m => m.provider))],
      recommended: MODELS.filter(m => m.recommended),
      count: MODELS.length,
    },
    nodeAffinities: NODE_AFFINITIES,
    config: {
      localAiOnly: process.env.LOCAL_AI_ONLY === "true",
      defaultModel: "llama3.2",
      defaultTemperature: 0.7,
      defaultMaxTokens: 4096,
    },
  });
}
