import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { localAIRuntime } from "@/lib/local-ai-runtime";
import { getOpenAITools, executeJarvisTool } from "@/lib/jarvis-tools";
import { aiFallbackManager, type FallbackDecision } from "@/lib/ai-fallback";
import { demoMode } from "@/lib/demo-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCAL_AI_ONLY = process.env.LOCAL_AI_ONLY !== "false";

type AIProvider = "openai" | "ollama" | "auto" | "custom";

interface ChatRequestBody {
  message: string;
  history?: { role: string; content: string }[];
  provider?: AIProvider;
  model?: string;
  stream?: boolean;
  customEndpoint?: string;
}

function getOllamaEndpoints(): string[] {
  const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
  const UBUNTU_IP = process.env.UBUNTU_TAILSCALE_IP || "100.66.61.51";
  
  const endpoints: string[] = [];
  
  if (process.env.OLLAMA_URL) {
    endpoints.push(process.env.OLLAMA_URL);
  } else {
    endpoints.push(`http://${WINDOWS_VM_IP}:11434`);
  }
  
  if (process.env.OLLAMA_FALLBACK_URL) {
    endpoints.push(process.env.OLLAMA_FALLBACK_URL);
  } else {
    endpoints.push(`http://${UBUNTU_IP}:11434`);
  }
  
  return endpoints;
}

const ALLOWED_CUSTOM_ENDPOINTS = [
  "api.groq.com",
  "api.together.xyz",
  "api.fireworks.ai",
  "api.mistral.ai",
  "api.perplexity.ai",
  "api.deepseek.com",
  "api.anthropic.com",
  "generativelanguage.googleapis.com",
  "openrouter.ai",
  "api.cohere.ai",
];

function validateCustomEndpoint(endpoint: string): { valid: boolean; error?: string } {
  try {
    const url = new URL(endpoint);
    
    if (!["http:", "https:"].includes(url.protocol)) {
      return { valid: false, error: "Only HTTP/HTTPS protocols allowed" };
    }
    
    if (url.hostname === "localhost" || 
        url.hostname === "127.0.0.1" || 
        url.hostname.startsWith("192.168.") ||
        url.hostname.startsWith("10.") ||
        url.hostname.startsWith("172.16.") ||
        url.hostname.endsWith(".local") ||
        url.hostname.includes("169.254.") ||
        url.hostname.includes("metadata")) {
      return { valid: false, error: "Internal/private endpoints not allowed" };
    }
    
    const isAllowed = ALLOWED_CUSTOM_ENDPOINTS.some(allowed => 
      url.hostname === allowed || url.hostname.endsWith(`.${allowed}`)
    );
    
    const customAllowed = process.env.CUSTOM_AI_ENDPOINTS?.split(",").map(s => s.trim()) || [];
    const isCustomAllowed = customAllowed.some(allowed => 
      url.hostname === allowed || url.hostname.endsWith(`.${allowed}`)
    );
    
    if (!isAllowed && !isCustomAllowed) {
      return { 
        valid: false, 
        error: `Endpoint not in allowlist. Allowed: ${ALLOWED_CUSTOM_ENDPOINTS.join(", ")}` 
      };
    }
    
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

function getOpenAIClient() {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const directKey = process.env.OPENAI_API_KEY;
  // Skip dummy/placeholder keys
  const apiKey = (integrationKey && integrationKey.startsWith('sk-')) ? integrationKey : directKey;
  const projectId = process.env.OPENAI_PROJECT_ID;

  if (apiKey && apiKey.startsWith('sk-')) {
    return new OpenAI({
      baseURL: baseURL || undefined,
      apiKey: apiKey.trim(),
      ...(projectId && { project: projectId.trim() }),
    });
  }

  return null;
}

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

async function isOllamaAvailable(): Promise<boolean> {
  try {
    const result = await localAIRuntime.isOllamaOnline();
    return result.online;
  } catch {
    return false;
  }
}

function detectToolIntent(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  
  const toolKeywords = [
    "generate image", "create image", "make image", "draw", "picture of",
    "generate video", "create video", "make video",
    "restart", "stop", "start", "reboot",
    "deploy", "redeploy", "push", "update services",
    "status", "running", "health", "check",
    "logs", "show log", "view log", "debug",
    "container", "docker", "service",
    "linode", "home server", "windows vm",
    "discord bot", "stream bot", "plex", "jellyfin",
    "dashboard",
    "analyze code", "review code", "check code", "code review",
    "fix code", "fix bug", "fix issue", "repair",
    "create file", "new file", "scaffold", "generate component",
    "edit file", "modify file", "change file", "update file",
    "run command", "execute", "npm", "pip", "yarn", "pnpm",
    "search code", "find code", "grep", "search codebase",
    "subagent", "spawn agent", "create agent", "worker",
    "ai services", "ai status", "ollama", "stable diffusion",
    "browse models", "list models", "available models",
    "install model", "download model", "pull model",
    "todo", "fixme",
  ];

  const toolPatterns = [
    /generate\s+(an?\s+)?image/i,
    /create\s+(an?\s+)?image/i,
    /make\s+(an?\s+)?image/i,
    /make\s+(me\s+)?(an?\s+)?picture/i,
    /draw\s+(an?\s+)?/i,
    /picture\s+of/i,
    /generate\s+(a\s+)?video/i,
    /create\s+(a\s+)?video/i,
    /make\s+(a\s+)?video/i,
    /restart\s+(the\s+)?[\w-]+/i,
    /stop\s+(the\s+)?[\w-]+/i,
    /start\s+(the\s+)?[\w-]+/i,
    /reboot\s+(the\s+)?[\w-]+/i,
    /deploy\s+to\s+[\w]+/i,
    /deploy\s+[\w]+/i,
    /redeploy/i,
    /push\s+(to\s+)?production/i,
    /update\s+(the\s+)?services/i,
    /check\s+(the\s+)?(server\s+)?status/i,
    /what('s|\s+is)\s+running/i,
    /what\s+services/i,
    /server\s+status/i,
    /container\s+status/i,
    /are\s+.*\s+running/i,
    /is\s+.*\s+running/i,
    /is\s+.*\s+up/i,
    /is\s+.*\s+down/i,
    /show\s+(me\s+)?(the\s+)?logs/i,
    /get\s+(the\s+)?logs/i,
    /view\s+(the\s+)?logs/i,
    /container\s+logs/i,
    /logs\s+for\s+[\w-]+/i,
    /debug\s+[\w-]+/i,
    /what's\s+wrong\s+with/i,
    /docker\s+(ps|status|logs)/i,
    /analyze\s+(the\s+)?code/i,
    /review\s+(the\s+)?(code|file)/i,
    /check\s+(the\s+)?(code|file)\s+for/i,
    /fix\s+(the\s+)?(bug|issue|error|code)/i,
    /create\s+(a\s+)?(new\s+)?file/i,
    /create\s+(a\s+)?(react|api|typescript|python)\s+(component|route|module|script)/i,
    /edit\s+(the\s+)?file/i,
    /modify\s+(the\s+)?file/i,
    /run\s+(the\s+)?(command|test|build|script)/i,
    /npm\s+(run|test|build|install)/i,
    /search\s+(the\s+)?(code|codebase|files?)/i,
    /find\s+(all\s+)?(todos?|fixmes?|functions?|classes?)/i,
    /grep\s+/i,
    /spawn\s+(a\s+)?subagent/i,
    /create\s+(a\s+)?subagent/i,
    /what\s+ai\s+(is\s+)?(available|running|online)/i,
    /check\s+(the\s+)?ai\s+services/i,
    /ollama\s+(status|models?)/i,
    /stable\s+diffusion\s+(status|models?)/i,
    /browse\s+(available\s+)?models/i,
    /list\s+(available\s+)?models/i,
    /what\s+models\s+(are\s+)?available/i,
    /install\s+(the\s+)?model/i,
    /download\s+(the\s+)?model/i,
    /pull\s+(the\s+)?model/i,
  ];

  if (toolKeywords.some(keyword => lowerMessage.includes(keyword))) {
    return true;
  }

  return toolPatterns.some(pattern => pattern.test(message));
}

async function selectProvider(requestedProvider: AIProvider): Promise<{ provider: "openai" | "ollama"; fallback: boolean; reason: string }> {
  try {
    const decision = await aiFallbackManager.selectProvider(
      requestedProvider === "custom" ? "openai" : requestedProvider,
      undefined,
      LOCAL_AI_ONLY
    );
    
    console.log(`[AIChat] Provider selection: ${decision.provider} (fallback: ${decision.isFallback}, reason: ${decision.reason}, localOnly: ${LOCAL_AI_ONLY})`);
    
    return {
      provider: decision.provider === "custom" ? "openai" : decision.provider,
      fallback: decision.isFallback,
      reason: decision.reason,
    };
  } catch (error: any) {
    console.error(`[AIChat] Provider selection failed: ${error.message}`);
    
    if (LOCAL_AI_ONLY && requestedProvider !== "openai") {
      const ollamaOnline = await localAIRuntime.isOllamaOnline();
      if (!ollamaOnline.online) {
        throw new Error("Local AI is offline. Please start Ollama on your Windows VM or set LOCAL_AI_ONLY=false to allow cloud fallback.");
      }
      return { provider: "ollama", fallback: false, reason: "Ollama available (local-only mode)" };
    }
    
    if (requestedProvider === "openai") {
      return { provider: "openai", fallback: false, reason: "OpenAI explicitly requested" };
    }
    
    const ollamaOnline = await localAIRuntime.isOllamaOnline();
    if (ollamaOnline.online) {
      return { provider: "ollama", fallback: false, reason: "Ollama available" };
    }
    
    return { provider: "openai", fallback: true, reason: `Fallback to OpenAI: ${error.message}` };
  }
}

const systemPrompt = `You are Jarvis, an advanced AI assistant for Nebula Command - a comprehensive homelab management and development platform.

**YOUR IDENTITY:**
You are a powerful, autonomous AI development assistant with multi-agent orchestration capabilities. You can manage infrastructure, write and analyze code, control local AI resources, and spawn subagents for complex tasks.

**CORE CAPABILITIES:**

📸 **Creative Generation:**
- generate_image - Generate images using DALL-E or local Stable Diffusion (prefers local GPU)
- generate_video - Generate short videos from text descriptions

🐳 **Infrastructure Management:**
- docker_action - Start, stop, restart containers or view logs
- deploy - Trigger deployments to Linode or Home servers
- get_server_status - Check health of all services and containers
- get_container_logs - Get logs from specific containers for debugging

💻 **Code Development Automation:**
- analyze_code - Analyze code for bugs, security issues, performance, and style
- fix_code - Automatically fix issues or apply improvements to code
- create_file - Create new files using templates (React, API, TypeScript, Python, tests)
- edit_file - Make targeted edits (replace, insert_before, insert_after, delete)
- run_command - Execute safe shell commands (npm, pip, git, build tools)
- search_codebase - Search project files by text, regex, or filename

🤖 **Multi-Agent Orchestration:**
- create_subagent - Spawn specialized AI subagents for complex tasks
- check_ai_services - Check status of all AI services (local GPU + cloud)

🧠 **AI Model Management:**
- browse_models - Browse available models from Ollama, HuggingFace, local catalogs
- install_model - Install/download models to local storage

**SERVICES OVERVIEW:**
- Linode Server: Discord Bot (4000), Stream Bot (3000), Dashboard, PostgreSQL, Redis, Caddy
- Home Server: Plex (32400), Home Assistant (8123), MinIO, Tailscale, Ollama, Stable Diffusion
- Windows VM (GPU): Ollama LLMs, ComfyUI, Stable Diffusion WebUI - primary local AI

**LOCAL-ONLY AI POLICY:**
This instance runs in LOCAL-ONLY mode - cloud AI fallback is disabled:
1. All text generation uses Ollama on the Windows VM (GPU)
2. All image generation uses local Stable Diffusion
3. If local AI is offline, users must start the Windows VM - NO cloud fallback
4. Use check_ai_services to verify local AI status before operations

**WHEN TO USE TOOLS:**
- "Generate an image of X" → generate_image (auto-selects local SD or DALL-E)
- "Analyze this code" → analyze_code with appropriate analysis_type
- "Fix the bug in file.ts" → fix_code with issue_description
- "Create a React component" → create_file with template="react-component"
- "Run the tests" → run_command with "npm test"
- "Find all TODO comments" → search_codebase with query="TODO"
- "Work on this complex task" → create_subagent for multi-step work
- "What AI is available?" → check_ai_services
- "Install llama3" → install_model with model_name="llama3.2"
- "What models are available?" → browse_models

**GUIDELINES:**
1. ALWAYS use tools when the user asks for an action you can perform
2. Be proactive - execute actions, don't just explain how to do them manually
3. Use markdown for formatting responses with appropriate emojis
4. After executing a tool, summarize what happened clearly
5. For complex multi-step operations, create a subagent or execute tools in sequence
6. Prefer local AI resources (Ollama, SD) over cloud to save costs and latency
7. When analyzing or fixing code, provide clear explanations

**SAFETY:**
- Dangerous shell commands are blocked (rm -rf, sudo, etc.)
- File operations are sandboxed to project directory
- Credentials and secrets are never exposed

You are an AUTONOMOUS development assistant - take action, don't just advise!`;

async function chatWithOpenAI(
  messages: { role: string; content: string }[],
  model: string,
  stream: boolean
): Promise<Response | { content: string; provider: string; model: string; toolResults?: any[] }> {
  const openai = getOpenAIClient();
  if (!openai) {
    throw new Error("OpenAI not configured");
  }

  const formattedMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system" as const, content: systemPrompt },
    ...messages.slice(-10).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  const tools = getOpenAITools();

  if (stream) {
    const completion = await openai.chat.completions.create({
      model,
      messages: formattedMessages,
      tools,
      tool_choice: "auto",
      temperature: 0.7,
      max_tokens: 2000,
      stream: true,
    });

    const encoder = new TextEncoder();
    let toolCalls: any[] = [];
    let accumulatedContent = "";

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta;
            
            if (delta?.content) {
              accumulatedContent += delta.content;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: delta.content, provider: "openai", model })}\n\n`));
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (tc.index !== undefined) {
                  if (!toolCalls[tc.index]) {
                    toolCalls[tc.index] = { id: tc.id, function: { name: "", arguments: "" } };
                  }
                  if (tc.id) toolCalls[tc.index].id = tc.id;
                  if (tc.function?.name) toolCalls[tc.index].function.name = tc.function.name;
                  if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
                }
              }
            }

            if (chunk.choices[0]?.finish_reason === "tool_calls" && toolCalls.length > 0) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ toolExecuting: true })}\n\n`));
              
              for (const tc of toolCalls) {
                if (tc?.function?.name) {
                  try {
                    const args = JSON.parse(tc.function.arguments || "{}");
                    const result = await executeJarvisTool(tc.function.name, args);
                    
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                      toolResult: { 
                        tool: tc.function.name, 
                        success: result.success,
                        result: result.result 
                      } 
                    })}\n\n`));
                    
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: "\n\n" + result.result, provider: "openai", model })}\n\n`));
                  } catch (e: any) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: `\n\nError: ${e.message}`, provider: "openai", model })}\n\n`));
                  }
                }
              }
            }
          }
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const completion = await openai.chat.completions.create({
    model,
    messages: formattedMessages,
    tools,
    tool_choice: "auto",
    temperature: 0.7,
    max_tokens: 2000,
  });

  const message = completion.choices[0]?.message;
  
  if (message?.tool_calls && message.tool_calls.length > 0) {
    const toolResults: any[] = [];
    let responseContent = message.content || "";

    for (const tc of message.tool_calls) {
      const args = JSON.parse(tc.function.arguments || "{}");
      const result = await executeJarvisTool(tc.function.name, args);
      toolResults.push({
        tool: tc.function.name,
        success: result.success,
        result: result.result,
        data: result.data,
      });
      responseContent += (responseContent ? "\n\n" : "") + result.result;
    }

    return {
      content: responseContent,
      provider: "openai",
      model,
      toolResults,
    };
  }

  return {
    content: message?.content || "",
    provider: "openai",
    model,
  };
}

async function tryOllamaEndpoint(
  endpoint: string,
  messages: { role: string; content: string }[],
  model: string,
  stream: boolean
): Promise<Response | { content: string; provider: string; model: string }> {
  const ollamaUrl = endpoint;

  const formattedMessages = [
    { role: "system", content: systemPrompt },
    ...messages.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ];

  if (stream) {
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: formattedMessages,
        stream: true,
        options: {
          temperature: 0.7,
          num_predict: 2000,
        },
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value, { stream: true });
            const lines = text.split("\n").filter((l) => l.trim());

            for (const line of lines) {
              try {
                const data = JSON.parse(line);
                if (data.message?.content) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ content: data.message.content, provider: "ollama", model })}\n\n`
                    )
                  );
                }
                if (data.done) {
                  controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                }
              } catch {
              }
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: formattedMessages,
      stream: false,
      options: {
        temperature: 0.7,
        num_predict: 2000,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.statusText}`);
  }

  const data = await response.json();

  return {
    content: data.message?.content || "",
    provider: "ollama",
    model,
  };
}

async function chatWithOllama(
  messages: { role: string; content: string }[],
  model: string,
  stream: boolean
): Promise<Response | { content: string; provider: string; model: string }> {
  const endpoints = getOllamaEndpoints();
  let lastError: Error | null = null;
  
  for (const endpoint of endpoints) {
    try {
      console.log(`Trying Ollama endpoint: ${endpoint}`);
      const result = await tryOllamaEndpoint(endpoint, messages, model, stream);
      console.log(`Successfully used Ollama endpoint: ${endpoint}`);
      return result;
    } catch (error: any) {
      console.warn(`Ollama endpoint ${endpoint} failed: ${error.message}`);
      lastError = error;
    }
  }
  
  throw lastError || new Error("All Ollama endpoints failed");
}

async function chatWithCustomEndpoint(
  endpoint: string,
  messages: { role: string; content: string }[],
  model: string,
  stream: boolean
): Promise<Response | { content: string; provider: string; model: string }> {
  const formattedMessages = [
    { role: "system", content: systemPrompt },
    ...messages.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ];

  const response = await fetch(`${endpoint}/v1/chat/completions`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      ...(process.env.CUSTOM_AI_API_KEY && { "Authorization": `Bearer ${process.env.CUSTOM_AI_API_KEY}` }),
    },
    body: JSON.stringify({
      model,
      messages: formattedMessages,
      temperature: 0.7,
      max_tokens: 2000,
      stream,
    }),
  });

  if (!response.ok) {
    throw new Error(`Custom endpoint error: ${response.statusText}`);
  }

  if (stream) {
    return response;
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || "",
    provider: "custom",
    model,
  };
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: ChatRequestBody = await request.json();
    const { message, history = [], provider = "auto", model, stream = false, customEndpoint } = body;

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    if (demoMode.isEnabled()) {
      console.log("[AIChat] Demo mode active, returning cached response");
      const demoResponse = await demoMode.getChatResponse(message);
      if (demoResponse) {
        if (stream) {
          const encoder = new TextEncoder();
          const readable = new ReadableStream({
            async start(controller) {
              const words = demoResponse.content.split(" ");
              for (let i = 0; i < words.length; i++) {
                const chunk = words[i] + (i < words.length - 1 ? " " : "");
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ content: chunk, provider: "demo", model: "jarvis-demo" })}\n\n`)
                );
                await new Promise((r) => setTimeout(r, 30 + Math.random() * 20));
              }
              controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
              controller.close();
            },
          });
          return new Response(readable, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
        }
        return NextResponse.json({
          ...demoResponse,
          isDemo: true,
          timestamp: new Date().toISOString(),
        });
      }
    }

    const messages = [...history, { role: "user", content: message }];

    let result: Response | { content: string; provider: string; model: string; toolResults?: any[] };
    let usedFallback = false;
    let fallbackReason = "";
    let actualProvider = "";

    const messageRequiresTool = detectToolIntent(message);
    
    if (provider === "custom" && customEndpoint) {
      const validation = validateCustomEndpoint(customEndpoint);
      if (!validation.valid) {
        return NextResponse.json(
          { error: "Invalid custom endpoint", details: validation.error },
          { status: 400 }
        );
      }
      const customModel = model || "default";
      result = await chatWithCustomEndpoint(customEndpoint, messages, customModel, stream);
    } else if (messageRequiresTool) {
      console.log("[Jarvis] Message requires tool use, forcing OpenAI for function calling");
      const openaiModel = model || "gpt-4o";
      result = await chatWithOpenAI(messages, openaiModel, stream);
      actualProvider = "openai";
    } else {
      const { provider: selectedProvider, fallback, reason } = await selectProvider(provider as AIProvider);
      usedFallback = fallback;
      fallbackReason = reason;
      actualProvider = selectedProvider;

      const defaultModel = selectedProvider === "openai" ? "gpt-4o" : "llama3.2:latest";
      const finalModel = model || defaultModel;

      if (selectedProvider === "ollama") {
        try {
          result = await chatWithOllama(messages, finalModel, stream);
        } catch (ollamaError: any) {
          console.warn("All Ollama endpoints failed, falling back to OpenAI:", ollamaError.message);
          const openaiModel = "gpt-4o";
          try {
            result = await chatWithOpenAI(messages, openaiModel, stream);
            usedFallback = true;
          } catch (openaiError: any) {
            console.error("Both Ollama and OpenAI failed:", openaiError.message);
            return NextResponse.json(
              { error: "AI service unavailable", details: "Both local and cloud AI providers are unavailable" },
              { status: 503 }
            );
          }
        }
      } else {
        result = await chatWithOpenAI(messages, finalModel, stream);
      }
    }

    if (result instanceof Response) {
      return result;
    }

    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const codeBlocks: { language: string; code: string }[] = [];
    let match;

    while ((match = codeBlockRegex.exec(result.content)) !== null) {
      codeBlocks.push({
        language: match[1] || "plaintext",
        code: match[2].trim(),
      });
    }

    const response = NextResponse.json({
      response: result.content,
      provider: result.provider,
      model: result.model,
      fallback: usedFallback,
      fallbackReason: usedFallback ? fallbackReason : undefined,
      actualProvider: actualProvider || result.provider,
      codeBlocks: codeBlocks.length > 0 ? codeBlocks : undefined,
      toolResults: result.toolResults,
    });
    
    response.headers.set("X-AI-Provider", actualProvider || result.provider);
    if (usedFallback) {
      response.headers.set("X-AI-Fallback", "true");
      response.headers.set("X-AI-Fallback-Reason", fallbackReason);
    }
    
    return response;
  } catch (error: any) {
    console.error("AI Chat error:", error);
    return NextResponse.json(
      { error: "Failed to process request", details: error.message },
      { status: 500 }
    );
  }
}

async function fetchOllamaModels(): Promise<string[]> {
  const endpoints = getOllamaEndpoints();
  
  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(`${endpoint}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      
      if (response.ok) {
        const data = await response.json();
        return (data.models || []).map((m: { name: string }) => m.name);
      }
    } catch {
      continue;
    }
  }
  
  return [];
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const openai = getOpenAIClient();
  
  const [ollamaAvailable, ollamaModels] = await Promise.all([
    isOllamaAvailable(),
    fetchOllamaModels(),
  ]);

  const ollamaEndpoints = getOllamaEndpoints();
  
  const providers = [
    {
      id: "openai",
      name: "OpenAI",
      description: "Cloud-based GPT models",
      models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"],
      available: openai !== null,
      type: "cloud",
    },
    {
      id: "ollama",
      name: "Ollama (Local GPU)",
      description: `Self-hosted LLMs on homelab (${ollamaEndpoints.length} endpoints)`,
      models: ollamaModels.length > 0 ? ollamaModels : ["llama3.2:latest", "mistral:latest", "codellama:latest"],
      available: ollamaAvailable,
      type: "local",
      endpoints: ollamaEndpoints,
    },
    {
      id: "custom",
      name: "Custom Endpoint",
      description: "OpenAI-compatible APIs (Groq, Together, Fireworks, etc)",
      models: [],
      available: true,
      type: "custom",
      allowedDomains: ALLOWED_CUSTOM_ENDPOINTS,
    },
  ];

  return NextResponse.json({
    providers,
    defaultProvider: ollamaAvailable ? "ollama" : "openai",
    fallbackEnabled: true,
    fallbackChain: ["ollama (primary)", "ollama (fallback)", "openai"],
  });
}
