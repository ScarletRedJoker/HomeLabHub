/**
 * Jarvis API - Autonomous orchestration endpoint
 * Connects chat interface to full orchestration capabilities
 * 
 * Routes requests to:
 * - AI Dev Orchestrator (code tasks)
 * - Jarvis Orchestrator (infrastructure tasks)
 * - Local Deploy Manager (deployments)
 */

import { NextRequest, NextResponse } from "next/server";
import { jarvisOrchestrator } from "@/lib/jarvis-orchestrator";
import { aiDevOrchestrator } from "@/lib/ai/ai-dev/orchestrator";
import { localDeployManager } from "@/lib/local-deploy";
import { executeJarvisTool } from "@/lib/jarvis-tools";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import OpenAI from "openai";

const openai = new OpenAI();

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export type JarvisIntent = 
  | "develop"
  | "fix_code"
  | "deploy"
  | "create_website"
  | "run_command"
  | "check_status"
  | "generate_image"
  | "generate_video"
  | "manage_infrastructure"
  | "docker_action"
  | "analyze_code"
  | "refactor"
  | "review_code"
  | "install_model"
  | "wake_node"
  | "vm_control"
  | "unknown";

interface ParsedIntent {
  intent: JarvisIntent;
  confidence: number;
  params: Record<string, any>;
  orchestrator: "ai_dev" | "jarvis" | "deploy" | "direct_tool";
}

interface JarvisRequest {
  message: string;
  conversationId?: string;
  context?: {
    previousMessages?: { role: string; content: string }[];
    activeProject?: string;
    targetService?: string;
  };
  stream?: boolean;
}

interface JarvisToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

const jarvisToolDefinitions: JarvisToolDefinition[] = [
  {
    name: "deploy_service",
    description: "Deploy a service to a target server. Use this when the user asks to deploy, push, or update a service to a server.",
    parameters: {
      type: "object",
      properties: {
        service: {
          type: "string",
          description: "Service name to deploy (e.g., dashboard-next, discord-bot, stream-bot, ollama, comfyui)",
        },
        target: {
          type: "string",
          description: "Target server for deployment",
          enum: ["linode", "home", "windows"],
        },
        options: {
          type: "string",
          description: "Deployment options as JSON: {gitPull?: boolean, restart?: boolean, build?: boolean}",
        },
      },
      required: ["service", "target"],
    },
  },
  {
    name: "create_website",
    description: "Create a new website or web application. Use when user wants to build, create, or start a new website project.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the website/project",
        },
        type: {
          type: "string",
          description: "Type of website to create",
          enum: ["landing", "dashboard", "portfolio", "blog", "ecommerce", "api", "fullstack"],
        },
        technology: {
          type: "string",
          description: "Technology stack to use",
          enum: ["nextjs", "react", "vue", "static", "nodejs"],
        },
        description: {
          type: "string",
          description: "Detailed description of what the website should do",
        },
      },
      required: ["name", "type"],
    },
  },
  {
    name: "fix_code",
    description: "Fix bugs or issues in code files. Use when user reports a bug, error, or wants something fixed.",
    parameters: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "Description of the bug or issue to fix",
        },
        files: {
          type: "string",
          description: "Comma-separated list of file paths to analyze and fix (optional)",
        },
        autoApply: {
          type: "string",
          description: "Whether to automatically apply the fix",
          enum: ["true", "false"],
        },
      },
      required: ["description"],
    },
  },
  {
    name: "run_command",
    description: "Execute a command on a specific node in the cluster. Use for direct server control.",
    parameters: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Target node to run the command on",
          enum: ["linode", "home", "windows", "local"],
        },
        command: {
          type: "string",
          description: "The command to execute",
        },
      },
      required: ["node", "command"],
    },
  },
  {
    name: "check_status",
    description: "Check the status of a service, server, or the entire cluster. Use when user asks about status, health, or what's running.",
    parameters: {
      type: "object",
      properties: {
        service: {
          type: "string",
          description: "Specific service to check (optional - defaults to all services)",
        },
        target: {
          type: "string",
          description: "Which server to check",
          enum: ["linode", "home", "windows", "all"],
        },
      },
      required: [],
    },
  },
  {
    name: "develop_feature",
    description: "Create a new feature using AI-powered code generation. Use when user wants to develop, create, or build a new feature.",
    parameters: {
      type: "object",
      properties: {
        specification: {
          type: "string",
          description: "Detailed specification of the feature to develop",
        },
        targetDirectory: {
          type: "string",
          description: "Directory where files should be created",
        },
        technology: {
          type: "string",
          description: "Technology stack to use",
          enum: ["react", "nextjs", "typescript", "python", "nodejs", "auto"],
        },
      },
      required: ["specification"],
    },
  },
  {
    name: "docker_action",
    description: "Control Docker containers - start, stop, restart, or get logs.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Action to perform on the container",
          enum: ["start", "stop", "restart", "logs", "status"],
        },
        container: {
          type: "string",
          description: "Container name (e.g., discord-bot, stream-bot, homelab-dashboard, plex)",
        },
        server: {
          type: "string",
          description: "Which server to target",
          enum: ["linode", "home", "local"],
        },
      },
      required: ["action", "container"],
    },
  },
  {
    name: "analyze_code",
    description: "Analyze code for issues, bugs, security vulnerabilities, and suggest improvements.",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Path to the file to analyze",
        },
        analysisType: {
          type: "string",
          description: "Type of analysis to perform",
          enum: ["bugs", "security", "performance", "style", "all"],
        },
      },
      required: ["filePath"],
    },
  },
  {
    name: "generate_image",
    description: "Generate an image using AI based on a text description.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Detailed description of the image to generate",
        },
        style: {
          type: "string",
          description: "Art style for the image",
          enum: ["realistic", "artistic", "anime", "digital-art", "photographic", "cinematic"],
        },
        size: {
          type: "string",
          description: "Image dimensions",
          enum: ["1024x1024", "1792x1024", "1024x1792"],
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "wake_node",
    description: "Wake up a sleeping node using Wake-on-LAN.",
    parameters: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Node to wake up",
          enum: ["home", "windows"],
        },
      },
      required: ["node"],
    },
  },
  {
    name: "get_cluster_status",
    description: "Get the status of all nodes in the cluster (Linode, Ubuntu Home, Windows VM).",
    parameters: {
      type: "object",
      properties: {
        refresh: {
          type: "string",
          description: "Force refresh node status",
          enum: ["true", "false"],
        },
      },
      required: [],
    },
  },
];

function getOpenAITools() {
  return jarvisToolDefinitions.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function parseIntent(message: string): ParsedIntent {
  const lowerMessage = message.toLowerCase();
  
  const deployPatterns = [
    /deploy\s+(?:the\s+)?(\w+)/i,
    /push\s+(?:to\s+)?(\w+)/i,
    /update\s+(?:the\s+)?(\w+)\s+(?:on|to)/i,
    /release\s+(\w+)/i,
  ];
  
  for (const pattern of deployPatterns) {
    const match = message.match(pattern);
    if (match) {
      const service = match[1];
      const targetMatch = message.match(/(?:to|on)\s+(linode|home|windows|production|staging)/i);
      return {
        intent: "deploy",
        confidence: 0.9,
        params: { 
          service, 
          target: targetMatch?.[1] || "linode" 
        },
        orchestrator: "deploy",
      };
    }
  }
  
  const developPatterns = [
    /(?:create|build|develop|make)\s+(?:a\s+)?(?:new\s+)?(\w+\s+)?(?:feature|component|module|page)/i,
    /(?:implement|add)\s+(?:a\s+)?(?:new\s+)?/i,
    /(?:write|generate)\s+(?:code|a\s+function|a\s+class)/i,
  ];
  
  for (const pattern of developPatterns) {
    if (pattern.test(message)) {
      return {
        intent: "develop",
        confidence: 0.85,
        params: { specification: message },
        orchestrator: "ai_dev",
      };
    }
  }
  
  const fixPatterns = [
    /(?:fix|repair|debug|resolve)\s+(?:the\s+)?(?:bug|issue|error|problem)/i,
    /(?:something|it|this)\s+(?:is|isn't)\s+(?:broken|working)/i,
    /(?:there's|there is)\s+(?:a|an)\s+(?:bug|error|issue)/i,
    /(?:bug|error|crash|exception)/i,
  ];
  
  for (const pattern of fixPatterns) {
    if (pattern.test(message)) {
      const fileMatch = message.match(/(?:in|at)\s+([^\s,]+\.(ts|tsx|js|jsx|py|go))/i);
      return {
        intent: "fix_code",
        confidence: 0.85,
        params: { 
          description: message,
          files: fileMatch ? fileMatch[1] : undefined,
        },
        orchestrator: "ai_dev",
      };
    }
  }
  
  const createWebsitePatterns = [
    /(?:create|build|make)\s+(?:a\s+)?(?:new\s+)?(?:website|site|web\s*app|landing\s*page)/i,
    /(?:design|setup)\s+(?:a\s+)?(?:new\s+)?(?:website|portfolio|blog)/i,
  ];
  
  for (const pattern of createWebsitePatterns) {
    if (pattern.test(message)) {
      const nameMatch = message.match(/(?:called|named)\s+["']?(\w+)["']?/i);
      const typeMatch = message.match(/(landing|dashboard|portfolio|blog|ecommerce)/i);
      return {
        intent: "create_website",
        confidence: 0.85,
        params: {
          name: nameMatch?.[1] || "new-website",
          type: typeMatch?.[1] || "landing",
          description: message,
        },
        orchestrator: "ai_dev",
      };
    }
  }
  
  const statusPatterns = [
    /(?:what's|what is)\s+(?:the\s+)?status/i,
    /(?:check|show|get)\s+(?:the\s+)?status/i,
    /(?:how|what)\s+(?:is|are)\s+(?:the\s+)?(?:servers?|services?|nodes?)/i,
    /(?:is|are)\s+(?:the\s+)?(?:\w+)\s+(?:running|online|up|down)/i,
  ];
  
  for (const pattern of statusPatterns) {
    if (pattern.test(message)) {
      const targetMatch = message.match(/(linode|home|windows|all|cluster)/i);
      return {
        intent: "check_status",
        confidence: 0.9,
        params: { target: targetMatch?.[1] || "all" },
        orchestrator: "jarvis",
      };
    }
  }
  
  const dockerPatterns = [
    /(?:start|stop|restart)\s+(?:the\s+)?(\w+)\s+(?:container|service)/i,
    /(?:docker|container)\s+(start|stop|restart|logs)\s+(\w+)/i,
    /(?:get|show)\s+(?:the\s+)?logs?\s+(?:for|from)\s+(\w+)/i,
  ];
  
  for (const pattern of dockerPatterns) {
    const match = message.match(pattern);
    if (match) {
      return {
        intent: "docker_action",
        confidence: 0.9,
        params: { 
          action: match[1] || "status",
          container: match[2] || match[1],
        },
        orchestrator: "jarvis",
      };
    }
  }
  
  const imagePatterns = [
    /(?:generate|create|make)\s+(?:an?\s+)?image/i,
    /(?:draw|design)\s+/i,
  ];
  
  for (const pattern of imagePatterns) {
    if (pattern.test(message)) {
      return {
        intent: "generate_image",
        confidence: 0.85,
        params: { prompt: message },
        orchestrator: "direct_tool",
      };
    }
  }
  
  const analyzePatterns = [
    /(?:analyze|review)\s+(?:the\s+)?(?:code|file)/i,
    /(?:check|scan)\s+(?:for\s+)?(?:bugs|issues|security)/i,
  ];
  
  for (const pattern of analyzePatterns) {
    if (pattern.test(message)) {
      const fileMatch = message.match(/([^\s,]+\.(ts|tsx|js|jsx|py|go))/i);
      return {
        intent: "analyze_code",
        confidence: 0.85,
        params: { 
          filePath: fileMatch?.[1],
          analysisType: message.includes("security") ? "security" : "all",
        },
        orchestrator: "ai_dev",
      };
    }
  }
  
  const wakePatterns = [
    /wake\s+(?:up\s+)?(?:the\s+)?(\w+)/i,
    /(?:turn|power)\s+on\s+(?:the\s+)?(\w+)/i,
  ];
  
  for (const pattern of wakePatterns) {
    const match = message.match(pattern);
    if (match) {
      return {
        intent: "wake_node",
        confidence: 0.9,
        params: { node: match[1] },
        orchestrator: "jarvis",
      };
    }
  }
  
  const commandPatterns = [
    /(?:run|execute)\s+(?:the\s+)?(?:command\s+)?["']?(.+?)["']?\s+(?:on|at)\s+(\w+)/i,
    /(?:on|at)\s+(\w+)\s+(?:run|execute)\s+["']?(.+?)["']?/i,
  ];
  
  for (const pattern of commandPatterns) {
    const match = message.match(pattern);
    if (match) {
      return {
        intent: "run_command",
        confidence: 0.85,
        params: { 
          command: match[1] || match[2],
          node: match[2] || match[1],
        },
        orchestrator: "jarvis",
      };
    }
  }
  
  return {
    intent: "unknown",
    confidence: 0.3,
    params: { message },
    orchestrator: "jarvis",
  };
}

async function executeToolCall(
  toolName: string,
  args: Record<string, any>
): Promise<{ success: boolean; result: string; data?: any }> {
  try {
    switch (toolName) {
      case "deploy_service": {
        const options = args.options ? JSON.parse(args.options) : { gitPull: true, restart: true };
        const result = await localDeployManager.deploy(args.service, args.target, options);
        return {
          success: result.success,
          result: result.success 
            ? `✅ Successfully deployed ${args.service} to ${args.target}\n\nOutput:\n${result.output || "Deployment completed"}`
            : `❌ Deployment failed: ${result.error}`,
          data: result,
        };
      }
      
      case "create_website": {
        const job = await aiDevOrchestrator.createJob({
          title: `Create website: ${args.name}`,
          description: args.description || `Create a ${args.type} website named ${args.name} using ${args.technology || "nextjs"}`,
          type: "feature",
          targetPaths: [`services/${args.name}`],
        });
        
        aiDevOrchestrator.executeJob(job.id).catch(console.error);
        
        return {
          success: true,
          result: `🚀 Website creation started!\n\n**Project:** ${args.name}\n**Type:** ${args.type}\n**Technology:** ${args.technology || "nextjs"}\n**Job ID:** ${job.id}\n\nThe AI is now generating your website. Check the AI Jobs panel for progress.`,
          data: { jobId: job.id },
        };
      }
      
      case "fix_code": {
        const job = await jarvisOrchestrator.fixCodeBugs(
          args.description, 
          args.files ? args.files.split(",").map((f: string) => f.trim()) : undefined
        );
        
        return {
          success: true,
          result: `🔧 Bug fix started!\n\n**Job ID:** ${job.id}\n**Description:** ${args.description}\n${args.files ? `**Files:** ${args.files}` : ""}\n\nAnalyzing the issue and generating fixes...`,
          data: { jobId: job.id },
        };
      }
      
      case "run_command": {
        if (args.node === "local") {
          const { exec } = await import("child_process");
          const { promisify } = await import("util");
          const execAsync = promisify(exec);
          
          try {
            const { stdout, stderr } = await execAsync(args.command, { timeout: 30000 });
            return {
              success: true,
              result: `✅ Command executed on local:\n\n\`\`\`\n${stdout || stderr || "Command completed"}\n\`\`\``,
              data: { stdout, stderr },
            };
          } catch (error: any) {
            return {
              success: false,
              result: `❌ Command failed: ${error.message}`,
            };
          }
        }
        
        const result = await jarvisOrchestrator.executeOnNode(
          args.node,
          "execute_command",
          { command: args.command }
        );
        
        return {
          success: result.success,
          result: result.success 
            ? `✅ Command executed on ${args.node}:\n\n\`\`\`\n${result.output || "Command completed"}\n\`\`\``
            : `❌ Command failed: ${result.error}`,
          data: result,
        };
      }
      
      case "check_status": {
        const target = args.target || "all";
        
        if (target === "all" || target === "cluster") {
          const clusterStatus = await jarvisOrchestrator.getClusterStatus();
          let statusText = `## 🌐 Cluster Status\n\n`;
          statusText += `**Nodes:** ${clusterStatus.onlineNodes}/${clusterStatus.totalNodes} online\n\n`;
          
          for (const node of clusterStatus.nodes) {
            const icon = node.status === "online" ? "🟢" : node.status === "sleeping" ? "😴" : "🔴";
            statusText += `${icon} **${node.name}** (${node.id}): ${node.status}`;
            if (node.latencyMs) statusText += ` - ${node.latencyMs}ms`;
            statusText += "\n";
          }
          
          return {
            success: true,
            result: statusText,
            data: clusterStatus,
          };
        }
        
        const status = await localDeployManager.getStatus(target);
        return {
          success: true,
          result: `## Status: ${target}\n\n**Status:** ${status.status}\n**Last Deploy:** ${status.lastDeploy || "Never"}\n**Last Success:** ${status.lastDeploySuccess ? "Yes" : "No"}`,
          data: status,
        };
      }
      
      case "develop_feature": {
        const job = await jarvisOrchestrator.developFeature(args.specification);
        
        return {
          success: true,
          result: `🚀 Feature development started!\n\n**Job ID:** ${job.id}\n**Status:** ${job.status}\n\nAnalyzing requirements and generating code...`,
          data: { jobId: job.id },
        };
      }
      
      case "docker_action": {
        const result = await executeJarvisTool("docker_action", {
          action: args.action,
          container: args.container,
          server: args.server || "linode",
        });
        
        return result;
      }
      
      case "analyze_code": {
        if (!args.filePath) {
          return {
            success: false,
            result: "Please specify a file path to analyze.",
          };
        }
        
        const result = await executeJarvisTool("analyze_code", {
          file_path: args.filePath,
          analysis_type: args.analysisType || "all",
        });
        
        return result;
      }
      
      case "generate_image": {
        const result = await executeJarvisTool("generate_image", {
          prompt: args.prompt,
          style: args.style || "realistic",
          size: args.size || "1024x1024",
        });
        
        return result;
      }
      
      case "wake_node": {
        const result = await jarvisOrchestrator.wakeNode(args.node);
        
        return {
          success: result.success,
          result: result.success 
            ? `✅ Wake signal sent to ${args.node}. ${result.message}`
            : `❌ Failed to wake ${args.node}: ${result.error}`,
          data: result,
        };
      }
      
      case "get_cluster_status": {
        const clusterStatus = await jarvisOrchestrator.getClusterStatus();
        let statusText = `## 🌐 Cluster Status\n\n`;
        statusText += `**Total Nodes:** ${clusterStatus.totalNodes}\n`;
        statusText += `**Online:** ${clusterStatus.onlineNodes} | **Offline:** ${clusterStatus.offlineNodes}\n\n`;
        
        for (const node of clusterStatus.nodes) {
          const icon = node.status === "online" ? "🟢" : node.status === "sleeping" ? "😴" : "🔴";
          statusText += `${icon} **${node.name}** (${node.id})\n`;
          statusText += `   - Type: ${node.type} | Status: ${node.status}\n`;
          statusText += `   - Host: ${node.host}:${node.port}\n`;
          if (node.latencyMs) statusText += `   - Latency: ${node.latencyMs}ms\n`;
          statusText += `   - Capabilities: ${node.capabilities.slice(0, 5).map(c => c.id).join(", ")}${node.capabilities.length > 5 ? "..." : ""}\n\n`;
        }
        
        return {
          success: true,
          result: statusText,
          data: clusterStatus,
        };
      }
      
      default: {
        const legacyResult = await executeJarvisTool(toolName, args);
        return legacyResult;
      }
    }
  } catch (error: any) {
    console.error(`[Jarvis] Tool execution error for ${toolName}:`, error);
    return {
      success: false,
      result: `Error executing ${toolName}: ${error.message}`,
    };
  }
}

async function processWithAI(
  message: string,
  context?: JarvisRequest["context"]
): Promise<{ response: string; toolCalls?: any[]; data?: any }> {
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are Jarvis, an intelligent AI assistant for the Nebula Command homelab platform.

You have access to powerful tools for:
- Deploying services to servers (Linode cloud, Ubuntu home server, Windows AI VM)
- Creating websites and applications using AI code generation
- Fixing bugs and analyzing code
- Running commands on remote servers
- Checking system status and health
- Generating images using Stable Diffusion
- Managing Docker containers
- Controlling virtual machines

When a user asks you to do something, use the appropriate tools to accomplish their request.
Be proactive and helpful. If you need clarification, ask specific questions.
Always provide clear feedback about what you're doing and the results.

The infrastructure includes:
- Linode: Production cloud server (Docker, PM2, web hosting)
- Home: Ubuntu home server (KVM, Plex, NAS, WoL relay)
- Windows: Windows VM with GPU (Ollama, Stable Diffusion, ComfyUI)`,
    },
  ];
  
  if (context?.previousMessages) {
    for (const msg of context.previousMessages.slice(-10)) {
      messages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    }
  }
  
  messages.push({ role: "user", content: message });
  
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools: getOpenAITools(),
      tool_choice: "auto",
      temperature: 0.7,
      max_tokens: 2048,
    });
    
    const assistantMessage = completion.choices[0].message;
    
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const toolResults: { name: string; result: any }[] = [];
      
      for (const toolCall of assistantMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        const result = await executeToolCall(toolCall.function.name, args);
        toolResults.push({ name: toolCall.function.name, result });
      }
      
      const toolMessages: OpenAI.ChatCompletionMessageParam[] = [
        ...messages,
        assistantMessage,
        ...assistantMessage.tool_calls.map((tc, i) => ({
          role: "tool" as const,
          content: JSON.stringify(toolResults[i].result),
          tool_call_id: tc.id,
        })),
      ];
      
      const finalCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: toolMessages,
        temperature: 0.7,
        max_tokens: 2048,
      });
      
      return {
        response: finalCompletion.choices[0].message.content || "Task completed.",
        toolCalls: toolResults,
        data: toolResults.reduce((acc, tr) => ({ ...acc, [tr.name]: tr.result.data }), {}),
      };
    }
    
    return {
      response: assistantMessage.content || "I'm not sure how to help with that. Could you provide more details?",
    };
  } catch (error: any) {
    console.error("[Jarvis] AI processing error:", error);
    
    const parsedIntent = parseIntent(message);
    if (parsedIntent.intent !== "unknown" && parsedIntent.confidence > 0.7) {
      let toolName: string;
      let args: Record<string, any>;
      
      switch (parsedIntent.intent) {
        case "deploy":
          toolName = "deploy_service";
          args = parsedIntent.params;
          break;
        case "check_status":
          toolName = "check_status";
          args = parsedIntent.params;
          break;
        case "fix_code":
          toolName = "fix_code";
          args = parsedIntent.params;
          break;
        case "develop":
          toolName = "develop_feature";
          args = { specification: parsedIntent.params.specification };
          break;
        default:
          return {
            response: `I understood you want to "${parsedIntent.intent}" but encountered an error processing your request. Error: ${error.message}`,
          };
      }
      
      const result = await executeToolCall(toolName, args);
      return {
        response: result.result,
        data: result.data,
      };
    }
    
    return {
      response: `I encountered an error processing your request: ${error.message}. Please try again or rephrase your request.`,
    };
  }
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  try {
    const body: JarvisRequest = await request.json();
    const { message, conversationId, context, stream = false } = body;
    
    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required and must be a string" },
        { status: 400 }
      );
    }
    
    const parsedIntent = parseIntent(message);
    
    console.log(`[Jarvis] Processing message: "${message.substring(0, 100)}..."`);
    console.log(`[Jarvis] Parsed intent: ${parsedIntent.intent} (confidence: ${parsedIntent.confidence})`);
    
    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "intent", intent: parsedIntent })}\n\n`));
            
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", message: "Processing your request..." })}\n\n`));
            
            const result = await processWithAI(message, context);
            
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "response", content: result.response, data: result.data })}\n\n`));
            
            if (result.toolCalls) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "tools", calls: result.toolCalls })}\n\n`));
            }
            
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
            controller.close();
          } catch (error: any) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`));
            controller.close();
          }
        },
      });
      
      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }
    
    const result = await processWithAI(message, context);
    
    return NextResponse.json({
      success: true,
      response: result.response,
      intent: parsedIntent,
      toolCalls: result.toolCalls,
      data: result.data,
      conversationId: conversationId || `conv-${Date.now()}`,
    });
  } catch (error: any) {
    console.error("[Jarvis] API Error:", error);
    return NextResponse.json(
      { 
        error: error.message || "Internal server error",
        success: false,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  try {
    const [clusterStatus, orchestratorStats, aiServices] = await Promise.all([
      jarvisOrchestrator.getClusterStatus(),
      jarvisOrchestrator.getStats(),
      jarvisOrchestrator.checkAllAIServices(),
    ]);
    
    return NextResponse.json({
      status: "operational",
      capabilities: jarvisToolDefinitions.map(t => ({
        name: t.name,
        description: t.description,
      })),
      cluster: {
        totalNodes: clusterStatus.totalNodes,
        onlineNodes: clusterStatus.onlineNodes,
        offlineNodes: clusterStatus.offlineNodes,
      },
      orchestrator: orchestratorStats,
      aiServices: {
        localAvailable: aiServices.local.some(s => s.status === "online"),
        cloudAvailable: aiServices.cloud.some(s => s.status === "configured"),
      },
    });
  } catch (error: any) {
    console.error("[Jarvis] Status check error:", error);
    return NextResponse.json(
      { 
        error: error.message,
        status: "degraded",
      },
      { status: 500 }
    );
  }
}
