import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { localAIRuntime } from "@/lib/local-ai-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

  if (baseURL && apiKey) {
    return new OpenAI({ baseURL, apiKey });
  }

  const directKey = process.env.OPENAI_API_KEY;
  if (directKey) {
    return new OpenAI({ apiKey: directKey });
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
    const runtimes = await localAIRuntime.checkAllRuntimes();
    const ollama = runtimes.find(r => r.provider === "ollama");
    return ollama?.status === "online";
  } catch {
    return false;
  }
}

async function selectProvider(requestedProvider: AIProvider): Promise<{ provider: "openai" | "ollama"; fallback: boolean }> {
  if (requestedProvider === "openai") {
    return { provider: "openai", fallback: false };
  }

  if (requestedProvider === "ollama") {
    const available = await isOllamaAvailable();
    if (available) {
      return { provider: "ollama", fallback: false };
    }
    return { provider: "openai", fallback: true };
  }

  const ollamaAvailable = await isOllamaAvailable();
  if (ollamaAvailable) {
    return { provider: "ollama", fallback: false };
  }
  return { provider: "openai", fallback: false };
}

const systemPrompt = `You are Jarvis, an AI assistant for Nebula Command - a comprehensive homelab management platform.

**YOUR ROLE:**
You help users manage their homelab by providing information, suggestions, and actionable commands.

**SERVICES OVERVIEW:**
- Linode Server: Discord Bot (port 4000), Stream Bot (port 3000), Dashboard, PostgreSQL, Redis, Caddy
- Home Server: Plex (port 32400), Home Assistant (port 8123), MinIO, Tailscale, Ollama, Stable Diffusion

**WHAT YOU CAN HELP WITH:**
1. Explain how to check container status (user goes to Services page)
2. Explain how to deploy (user goes to Deploy page or clicks Quick Actions)
3. Explain how to check server metrics (user goes to Servers page)
4. Generate code and debug issues
5. Answer questions about homelab setup and configuration
6. Provide Docker commands, SSH commands, and configuration help
7. Manage local AI models via the AI Models page

**GUIDELINES:**
1. Be helpful and concise
2. Use markdown for formatting
3. When users ask about status, guide them to the appropriate dashboard page
4. For complex operations, explain the steps
5. Never include raw action tags or executable commands in your response - just explain what to do

You're a knowledgeable assistant focused on helping users understand and manage their homelab!`;

async function chatWithOpenAI(
  messages: { role: string; content: string }[],
  model: string,
  stream: boolean
): Promise<Response | { content: string; provider: string; model: string }> {
  const openai = getOpenAIClient();
  if (!openai) {
    throw new Error("OpenAI not configured");
  }

  const formattedMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages.slice(-10).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  if (stream) {
    const completion = await openai.chat.completions.create({
      model,
      messages: formattedMessages,
      temperature: 0.7,
      max_tokens: 2000,
      stream: true,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content, provider: "openai", model })}\n\n`));
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
    temperature: 0.7,
    max_tokens: 2000,
  });

  return {
    content: completion.choices[0]?.message?.content || "",
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

    const messages = [...history, { role: "user", content: message }];

    let result: Response | { content: string; provider: string; model: string };
    let usedFallback = false;

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
    } else {
      const { provider: selectedProvider, fallback } = await selectProvider(provider as AIProvider);
      usedFallback = fallback;

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

    return NextResponse.json({
      response: result.content,
      provider: result.provider,
      model: result.model,
      fallback: usedFallback,
      codeBlocks: codeBlocks.length > 0 ? codeBlocks : undefined,
    });
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
      models: ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"],
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
