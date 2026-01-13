/**
 * AI Agent Core
 * Autonomous agent that can use tools to complete tasks
 * Supports both local (Ollama) and cloud (OpenAI) models
 */

import OpenAI from "openai";
import { tools, getToolByName, getToolsSchema, formatToolsForPrompt, Tool, ToolResult, ToolCall } from "./tools";

export type AgentProvider = "openai" | "ollama" | "auto";

export interface AgentConfig {
  provider: AgentProvider;
  model?: string;
  workingDir: string;
  maxIterations?: number;
  autoApprove?: boolean;
  systemPrompt?: string;
}

export interface AgentMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface AgentStep {
  type: "thinking" | "tool_call" | "tool_result" | "response" | "approval_needed";
  content: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  timestamp: Date;
}

export interface AgentResponse {
  success: boolean;
  response: string;
  steps: AgentStep[];
  toolsUsed: string[];
  provider: string;
  model: string;
  pendingApprovals?: ToolCall[];
}

const DEFAULT_SYSTEM_PROMPT = `You are an autonomous AI coding assistant with access to tools for interacting with a codebase.

Your capabilities:
- Search and explore the codebase
- Read and understand code
- Write and edit files
- Run shell commands
- Research documentation online

Guidelines:
1. ALWAYS explore the codebase first before making changes
2. Read existing code to understand patterns and conventions
3. Make minimal, focused changes
4. Explain your reasoning and what you're doing
5. Be careful with destructive operations

When using tools:
- Use search_codebase to find relevant code
- Use read_file to understand existing implementations
- Use edit_file for small changes, write_file for new files
- Use run_command sparingly and carefully

Available tools:
${formatToolsForPrompt()}

Respond with your analysis and then call appropriate tools. Always explain what you're doing.`;

export class AIAgent {
  private openaiClient: OpenAI | null = null;
  private ollamaUrl: string;
  private config: AgentConfig;
  private messages: AgentMessage[] = [];
  private steps: AgentStep[] = [];

  constructor(config: AgentConfig) {
    this.config = {
      maxIterations: 10,
      autoApprove: false,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      ...config,
    };
    const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
    this.ollamaUrl = process.env.OLLAMA_URL || `http://${WINDOWS_VM_IP}:11434`;
    this.initOpenAI();
  }

  private initOpenAI() {
    const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    const projectId = process.env.OPENAI_PROJECT_ID;

    if (apiKey) {
      this.openaiClient = new OpenAI({
        baseURL: baseURL || undefined,
        apiKey: apiKey.trim(),
        ...(projectId && { project: projectId.trim() }),
      });
    }
  }

  private async isOllamaAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async selectProvider(): Promise<{ provider: "openai" | "ollama"; model: string }> {
    if (this.config.provider === "openai") {
      return { provider: "openai", model: this.config.model || "gpt-4o" };
    }

    if (this.config.provider === "ollama") {
      return { provider: "ollama", model: this.config.model || "llama3.2:latest" };
    }

    const ollamaAvailable = await this.isOllamaAvailable();
    if (ollamaAvailable) {
      return { provider: "ollama", model: this.config.model || "llama3.2:latest" };
    }

    if (this.openaiClient) {
      return { provider: "openai", model: this.config.model || "gpt-4o" };
    }

    throw new Error("No AI provider available");
  }

  private addStep(step: Omit<AgentStep, "timestamp">) {
    this.steps.push({ ...step, timestamp: new Date() });
  }

  async run(userMessage: string): Promise<AgentResponse> {
    this.messages = [
      { role: "system", content: this.config.systemPrompt! },
      { role: "user", content: userMessage },
    ];
    this.steps = [];
    const toolsUsed: string[] = [];
    const pendingApprovals: ToolCall[] = [];

    const { provider, model } = await this.selectProvider();
    let iterations = 0;

    while (iterations < this.config.maxIterations!) {
      iterations++;

      let response: { content: string; toolCalls?: ToolCall[] };

      if (provider === "ollama") {
        response = await this.runWithOllama(model);
      } else {
        response = await this.runWithOpenAI(model);
      }

      if (response.content) {
        this.addStep({ type: "thinking", content: response.content });
      }

      if (!response.toolCalls || response.toolCalls.length === 0) {
        return {
          success: true,
          response: response.content,
          steps: this.steps,
          toolsUsed: Array.from(new Set(toolsUsed)),
          provider,
          model,
          pendingApprovals: pendingApprovals.length > 0 ? pendingApprovals : undefined,
        };
      }

      for (const toolCall of response.toolCalls) {
        const tool = getToolByName(toolCall.tool);
        if (!tool) {
          this.addStep({
            type: "tool_result",
            content: `Tool not found: ${toolCall.tool}`,
            toolResult: { success: false, output: "", error: `Unknown tool: ${toolCall.tool}` },
          });
          continue;
        }

        toolsUsed.push(tool.name);
        this.addStep({ type: "tool_call", content: `Calling ${tool.name}`, toolCall });

        if (tool.requiresApproval && !this.config.autoApprove) {
          pendingApprovals.push(toolCall);
          this.addStep({
            type: "approval_needed",
            content: `Tool ${tool.name} requires approval`,
            toolCall,
          });
          continue;
        }

        const result = await tool.execute(toolCall.parameters, this.config.workingDir);
        this.addStep({ type: "tool_result", content: result.output, toolResult: result });

        this.messages.push({
          role: "tool",
          content: JSON.stringify(result),
          name: tool.name,
        });
      }

      if (pendingApprovals.length > 0) {
        return {
          success: true,
          response: response.content + "\n\nSome actions require your approval before proceeding.",
          steps: this.steps,
          toolsUsed: Array.from(new Set(toolsUsed)),
          provider,
          model,
          pendingApprovals,
        };
      }
    }

    return {
      success: false,
      response: "Maximum iterations reached without completing the task.",
      steps: this.steps,
      toolsUsed: Array.from(new Set(toolsUsed)),
      provider,
      model,
    };
  }

  private async runWithOpenAI(model: string): Promise<{ content: string; toolCalls?: ToolCall[] }> {
    if (!this.openaiClient) {
      throw new Error("OpenAI client not initialized");
    }

    const response = await this.openaiClient.chat.completions.create({
      model,
      messages: this.messages.map(m => ({
        role: m.role as any,
        content: m.content,
        name: m.name,
        tool_calls: m.tool_calls,
        tool_call_id: m.tool_call_id,
      })),
      tools: getToolsSchema() as any,
      tool_choice: "auto",
      temperature: 0.7,
      max_tokens: 4000,
    });

    const message = response.choices[0]?.message;
    const content = message?.content || "";
    const toolCalls: ToolCall[] = [];

    if (message?.tool_calls) {
      for (const tc of message.tool_calls) {
        try {
          const params = JSON.parse(tc.function.arguments);
          toolCalls.push({
            tool: tc.function.name,
            parameters: params,
          });
        } catch {
        }
      }
    }

    this.messages.push({
      role: "assistant",
      content,
      tool_calls: message?.tool_calls,
    });

    return { content, toolCalls };
  }

  private async runWithOllama(model: string): Promise<{ content: string; toolCalls?: ToolCall[] }> {
    const response = await fetch(`${this.ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: this.messages,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 4000,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.message?.content || "";

    const toolCalls = this.parseToolCallsFromText(content);

    this.messages.push({
      role: "assistant",
      content,
    });

    return { content, toolCalls };
  }

  private parseToolCallsFromText(text: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    const patterns = [
      /<tool_call>\s*(\w+)\s*\(([\s\S]*?)\)\s*<\/tool_call>/g,
      /```tool\s*\n(\w+)\(([\s\S]*?)\)\s*```/g,
      /\[TOOL:\s*(\w+)\s*\]\s*```json\s*([\s\S]*?)```/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const toolName = match[1];
        try {
          const params = JSON.parse(match[2]);
          if (getToolByName(toolName)) {
            toolCalls.push({ tool: toolName, parameters: params });
          }
        } catch {
          const paramLines = match[2].split(",").map(l => l.trim());
          const params: Record<string, any> = {};
          for (const line of paramLines) {
            const [key, ...valueParts] = line.split("=");
            if (key && valueParts.length > 0) {
              const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
              params[key.trim()] = value;
            }
          }
          if (Object.keys(params).length > 0 && getToolByName(toolName)) {
            toolCalls.push({ tool: toolName, parameters: params });
          }
        }
      }
    }

    return toolCalls;
  }

  async continueWithApproval(approvedTools: string[]): Promise<AgentResponse> {
    return this.run("Continue with the approved tools.");
  }
}

export async function createAgent(config: AgentConfig): Promise<AIAgent> {
  return new AIAgent(config);
}
