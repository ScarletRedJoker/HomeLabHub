import { cookies } from "next/headers";
import { jarvisOrchestrator } from "./jarvis-orchestrator";
import { localAIRuntime } from "./local-ai-runtime";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

export interface JarvisTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

export const jarvisTools: JarvisTool[] = [
  {
    name: "generate_image",
    description: "Generate an image using AI based on a text description. Use this when the user asks to create, generate, or make an image.",
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
    name: "generate_video",
    description: "Generate a short video using AI based on a text description. Use this when the user asks to create a video.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Detailed description of the video to generate",
        },
        duration: {
          type: "string",
          description: "Video duration in seconds",
          enum: ["3", "5", "10"],
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "docker_action",
    description: "Control Docker containers - start, stop, restart, or get logs. Use this when the user asks to manage containers.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Action to perform on the container",
          enum: ["start", "stop", "restart", "logs"],
        },
        container: {
          type: "string",
          description: "Container name (e.g., discord-bot, stream-bot, homelab-dashboard, plex, jellyfin)",
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
    name: "deploy",
    description: "Trigger a deployment to a server. Use when user asks to deploy or update services.",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "Deployment target server",
          enum: ["linode", "home"],
        },
      },
      required: ["target"],
    },
  },
  {
    name: "get_server_status",
    description: "Get the current status of services, containers, and server health. Use when user asks about status or what's running.",
    parameters: {
      type: "object",
      properties: {
        server: {
          type: "string",
          description: "Which server to check (optional - defaults to all)",
          enum: ["linode", "home", "all"],
        },
      },
      required: [],
    },
  },
  {
    name: "get_container_logs",
    description: "Get recent logs from a Docker container for debugging.",
    parameters: {
      type: "object",
      properties: {
        container: {
          type: "string",
          description: "Container name to get logs from",
        },
        server: {
          type: "string",
          description: "Server where container runs",
          enum: ["linode", "home", "local"],
        },
        lines: {
          type: "string",
          description: "Number of log lines to retrieve (default 50)",
        },
      },
      required: ["container"],
    },
  },
  {
    name: "analyze_code",
    description: "Analyze code for issues, bugs, security vulnerabilities, and suggest improvements. Use when user asks to review, analyze, or check code quality.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Path to the file to analyze (relative to project root)",
        },
        analysis_type: {
          type: "string",
          description: "Type of analysis to perform",
          enum: ["bugs", "security", "performance", "style", "all"],
        },
        language: {
          type: "string",
          description: "Programming language (auto-detected if not specified)",
          enum: ["typescript", "javascript", "python", "go", "rust", "auto"],
        },
      },
      required: ["file_path"],
    },
  },
  {
    name: "fix_code",
    description: "Automatically fix bugs, issues, or apply improvements to code. Use when user asks to fix, repair, or improve code.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Path to the file to fix",
        },
        issue_description: {
          type: "string",
          description: "Description of the issue to fix or improvement to make",
        },
        auto_apply: {
          type: "string",
          description: "Whether to automatically apply the fix (default: false for preview)",
          enum: ["true", "false"],
        },
      },
      required: ["file_path", "issue_description"],
    },
  },
  {
    name: "search_codebase",
    description: "Search through project files for code, patterns, or text. Use when user asks to find, search, or locate code.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (supports regex)",
        },
        file_pattern: {
          type: "string",
          description: "File pattern to search (e.g., *.ts, *.py)",
        },
        search_type: {
          type: "string",
          description: "Type of search",
          enum: ["text", "regex", "filename"],
        },
        max_results: {
          type: "string",
          description: "Maximum number of results (default: 20)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "create_subagent",
    description: "Create a specialized AI subagent to work on a specific task autonomously. Use for complex, multi-step tasks.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name for the subagent",
        },
        task: {
          type: "string",
          description: "Task description for the subagent to complete",
        },
        agent_type: {
          type: "string",
          description: "Type of specialized agent",
          enum: ["code", "research", "automation", "creative"],
        },
        prefer_local: {
          type: "string",
          description: "Prefer local AI resources over cloud (default: true)",
          enum: ["true", "false"],
        },
      },
      required: ["name", "task"],
    },
  },
  {
    name: "check_ai_services",
    description: "Check the status of all AI services - both local (Ollama, Stable Diffusion, ComfyUI) and cloud (OpenAI, Replicate).",
    parameters: {
      type: "object",
      properties: {
        refresh: {
          type: "string",
          description: "Force refresh the status (default: true)",
          enum: ["true", "false"],
        },
      },
      required: [],
    },
  },
  {
    name: "browse_models",
    description: "Browse available AI models from HuggingFace or local catalogs. Use when user wants to explore or find models.",
    parameters: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: "Where to browse models",
          enum: ["huggingface", "ollama", "local", "all"],
        },
        model_type: {
          type: "string",
          description: "Type of model to browse",
          enum: ["llm", "image", "embedding", "all"],
        },
        search_query: {
          type: "string",
          description: "Search query to filter models",
        },
      },
      required: [],
    },
  },
  {
    name: "install_model",
    description: "Install/download a model from a catalog to local storage. Use when user wants to add a new AI model.",
    parameters: {
      type: "object",
      properties: {
        model_name: {
          type: "string",
          description: "Name of the model to install (e.g., llama3.2, mistral, codellama)",
        },
        source: {
          type: "string",
          description: "Source to install from",
          enum: ["ollama", "huggingface"],
        },
      },
      required: ["model_name"],
    },
  },
];

export function getOpenAITools() {
  return jarvisTools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

async function getBaseUrl(): Promise<string> {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  
  if (process.env.DASHBOARD_URL) {
    return process.env.DASHBOARD_URL;
  }
  
  if (process.env.REPL_SLUG) {
    return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER?.toLowerCase()}.repl.co`;
  }
  
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  
  if (process.env.NODE_ENV === "production") {
    return "https://dashboard.evindrake.net";
  }
  
  return "http://localhost:5000";
}

async function internalFetch(path: string, options: RequestInit = {}) {
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}${path}`;
  
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session");
  
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(sessionCookie && { Cookie: `session=${sessionCookie.value}` }),
      ...options.headers,
    },
  });
}

const BLOCKED_COMMANDS = [
  /\brm\s+-rf\s+[\/~]/i,
  /\brm\s+-r\s+[\/~]/i,
  /\bsudo\b/i,
  /\bchmod\s+777/i,
  /\bdd\s+if=/i,
  /\bmkfs\b/i,
  /\bformat\b/i,
  /\bfdisk\b/i,
  /\bparted\b/i,
  />\s*\/dev\/[sh]d[a-z]/i,
  /\bcurl\b.*\|\s*(bash|sh)/i,
  /\bwget\b.*\|\s*(bash|sh)/i,
  /\beval\b/i,
  /\bexec\b.*</i,
  /\bpoweroff\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bkill\s+-9\s+-1/i,
  /\bpkill\s+-9/i,
  /\brm\s+-rf\s+\*/i,
];

function isCommandSafe(command: string): { safe: boolean; reason?: string } {
  for (const pattern of BLOCKED_COMMANDS) {
    if (pattern.test(command)) {
      return { safe: false, reason: `Command matches blocked pattern: ${pattern.source}` };
    }
  }
  return { safe: true };
}

const PROJECT_ROOT = process.cwd();

function sanitizePath(filePath: string): { valid: boolean; absolutePath: string; reason?: string } {
  const normalized = path.normalize(filePath);
  const absolute = path.isAbsolute(normalized) ? normalized : path.join(PROJECT_ROOT, normalized);
  
  if (!absolute.startsWith(PROJECT_ROOT)) {
    return { valid: false, absolutePath: "", reason: "Path traversal detected - access denied" };
  }
  
  const blockedPaths = ["/etc", "/var", "/usr", "/bin", "/sbin", "/boot", "/root", "/home"];
  for (const blocked of blockedPaths) {
    if (absolute.startsWith(blocked)) {
      return { valid: false, absolutePath: "", reason: `Access to ${blocked} is blocked` };
    }
  }
  
  return { valid: true, absolutePath: absolute };
}

const FILE_TEMPLATES: Record<string, (name: string) => string> = {
  "react-component": (name) => `import React from 'react';

interface ${name}Props {
  className?: string;
}

export function ${name}({ className }: ${name}Props) {
  return (
    <div className={className}>
      <h1>${name}</h1>
    </div>
  );
}
`,
  "api-route": (name) => `import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({ message: "Success" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return NextResponse.json({ message: "Created", data: body });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
`,
  "typescript-module": (name) => `/**
 * ${name} module
 */

export interface ${name}Config {
  enabled: boolean;
}

export class ${name} {
  private config: ${name}Config;

  constructor(config: Partial<${name}Config> = {}) {
    this.config = { enabled: true, ...config };
  }

  async initialize(): Promise<void> {
    console.log("[${name}] Initialized");
  }
}

export const ${name.toLowerCase()} = new ${name}();
`,
  "python-script": (name) => `#!/usr/bin/env python3
"""
${name} script
"""

import argparse
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="${name}")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    logger.info("${name} started")


if __name__ == "__main__":
    main()
`,
  "test-file": (name) => `import { describe, it, expect, beforeEach } from "vitest";

describe("${name}", () => {
  beforeEach(() => {
    // Setup
  });

  it("should work correctly", () => {
    expect(true).toBe(true);
  });

  it("should handle edge cases", () => {
    // Test edge cases
  });
});
`,
};

export async function executeJarvisTool(
  toolName: string,
  args: Record<string, any>
): Promise<{ success: boolean; result: string; data?: any }> {
  console.log(`[Jarvis] Executing tool: ${toolName}`, args);

  try {
    switch (toolName) {
      case "generate_image": {
        const response = await internalFetch("/api/ai/image", {
          method: "POST",
          body: JSON.stringify({
            prompt: args.prompt,
            style: args.style || "photographic",
            size: args.size || "1024x1024",
            provider: "auto",
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          return {
            success: false,
            result: `Failed to generate image: ${error.error || "Unknown error"}`,
          };
        }

        const data = await response.json();
        return {
          success: true,
          result: `Image generated successfully! You can view it in the Creative Studio or at: ${data.url || data.imageUrl}`,
          data: { imageUrl: data.url || data.imageUrl, provider: data.provider },
        };
      }

      case "generate_video": {
        const response = await internalFetch("/api/ai/video", {
          method: "POST",
          body: JSON.stringify({
            prompt: args.prompt,
            duration: parseInt(args.duration) || 5,
            model: "auto",
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          return {
            success: false,
            result: `Failed to generate video: ${error.error || "Unknown error"}`,
          };
        }

        const data = await response.json();
        return {
          success: true,
          result: `Video generation started! ${data.status === "pending" ? "Check Creative Studio for progress." : `Video URL: ${data.videoUrl}`}`,
          data,
        };
      }

      case "docker_action": {
        const response = await internalFetch("/api/docker", {
          method: "POST",
          body: JSON.stringify({
            action: args.action,
            containerId: args.container,
            server: args.server || "linode",
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          return {
            success: false,
            result: `Docker action failed: ${error.error || "Unknown error"}`,
          };
        }

        const data = await response.json();
        
        if (args.action === "logs") {
          return {
            success: true,
            result: `Container logs for ${args.container}:\n\`\`\`\n${data.logs?.slice(0, 2000) || "No logs available"}\n\`\`\``,
            data,
          };
        }

        return {
          success: true,
          result: `Successfully performed ${args.action} on container ${args.container}`,
          data,
        };
      }

      case "deploy": {
        const response = await internalFetch("/api/deploy", {
          method: "POST",
          body: JSON.stringify({
            server: args.target,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          return {
            success: false,
            result: `Deployment failed: ${error.error || "Unknown error"}`,
          };
        }

        const data = await response.json();
        return {
          success: true,
          result: `Deployment to ${args.target} initiated! Deployment ID: ${data.deploymentId || data.id}. Check the Deploy page for live progress.`,
          data,
        };
      }

      case "get_server_status": {
        const response = await internalFetch("/api/health/status");

        if (!response.ok) {
          return {
            success: false,
            result: "Failed to fetch server status",
          };
        }

        const data = await response.json();
        
        let statusText = "## Server Status\n\n";
        
        if (data.services) {
          statusText += "### Services\n";
          for (const service of data.services) {
            const icon = service.status === "healthy" ? "✅" : service.status === "degraded" ? "⚠️" : "❌";
            statusText += `${icon} **${service.name}**: ${service.status}\n`;
          }
        }

        if (data.containers) {
          statusText += "\n### Containers\n";
          for (const container of data.containers) {
            const icon = container.state === "running" ? "🟢" : "🔴";
            statusText += `${icon} ${container.name}: ${container.state}\n`;
          }
        }

        return {
          success: true,
          result: statusText,
          data,
        };
      }

      case "get_container_logs": {
        const response = await internalFetch("/api/docker", {
          method: "POST",
          body: JSON.stringify({
            action: "logs",
            containerId: args.container,
            server: args.server || "linode",
            tail: args.lines || "50",
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          return {
            success: false,
            result: `Failed to get logs: ${error.error || "Unknown error"}`,
          };
        }

        const data = await response.json();
        return {
          success: true,
          result: `Logs for ${args.container}:\n\`\`\`\n${data.logs?.slice(0, 3000) || "No logs available"}\n\`\`\``,
          data,
        };
      }

      case "analyze_code": {
        const pathCheck = sanitizePath(args.file_path);
        if (!pathCheck.valid) {
          return { success: false, result: pathCheck.reason || "Invalid path" };
        }

        try {
          const content = await fs.readFile(pathCheck.absolutePath, "utf-8");
          const lines = content.split("\n");
          const analysisType = args.analysis_type || "all";
          
          const issues: string[] = [];
          
          if (analysisType === "all" || analysisType === "bugs") {
            if (content.includes("console.log")) {
              issues.push("⚠️ Found console.log statements - consider removing for production");
            }
            if (content.includes("TODO") || content.includes("FIXME")) {
              issues.push("📝 Found TODO/FIXME comments that may need attention");
            }
            if (/catch\s*\(\s*\w*\s*\)\s*{\s*}/g.test(content)) {
              issues.push("🐛 Found empty catch blocks - errors are being silently ignored");
            }
          }
          
          if (analysisType === "all" || analysisType === "security") {
            if (/eval\s*\(/g.test(content)) {
              issues.push("🔴 SECURITY: eval() usage detected - this is dangerous");
            }
            if (/innerHTML\s*=/g.test(content)) {
              issues.push("🟡 SECURITY: innerHTML assignment - potential XSS vulnerability");
            }
            if (/password|secret|api_key|apikey/i.test(content) && !/process\.env/i.test(content)) {
              issues.push("🔴 SECURITY: Possible hardcoded credentials detected");
            }
          }
          
          if (analysisType === "all" || analysisType === "performance") {
            if (/\.forEach\s*\(.*\.forEach/g.test(content)) {
              issues.push("⚡ PERFORMANCE: Nested forEach loops - consider optimization");
            }
            if (/new RegExp\(/g.test(content)) {
              issues.push("⚡ PERFORMANCE: Dynamic RegExp creation - consider using literal if pattern is static");
            }
          }
          
          if (analysisType === "all" || analysisType === "style") {
            if (content.includes("any")) {
              issues.push("📝 STYLE: 'any' type usage - consider adding proper types");
            }
            const longLines = lines.filter(l => l.length > 120).length;
            if (longLines > 0) {
              issues.push(`📝 STYLE: ${longLines} lines exceed 120 characters`);
            }
          }

          const result = issues.length > 0
            ? `## Code Analysis for \`${args.file_path}\`\n\nFound ${issues.length} issue(s):\n\n${issues.join("\n")}`
            : `## Code Analysis for \`${args.file_path}\`\n\n✅ No issues found! Code looks good.`;

          return {
            success: true,
            result,
            data: { issues, fileSize: content.length, lineCount: lines.length },
          };
        } catch (error: any) {
          return {
            success: false,
            result: `Failed to analyze file: ${error.message}`,
          };
        }
      }

      case "fix_code": {
        const pathCheck = sanitizePath(args.file_path);
        if (!pathCheck.valid) {
          return { success: false, result: pathCheck.reason || "Invalid path" };
        }

        const autoApply = args.auto_apply === "true";

        try {
          const content = await fs.readFile(pathCheck.absolutePath, "utf-8");
          
          const suggestions: { original: string; fixed: string; description: string }[] = [];
          
          if (args.issue_description.toLowerCase().includes("console.log")) {
            const lines = content.split("\n");
            const fixedLines = lines.filter(line => !line.includes("console.log"));
            if (fixedLines.length !== lines.length) {
              suggestions.push({
                original: content,
                fixed: fixedLines.join("\n"),
                description: "Remove console.log statements",
              });
            }
          }
          
          if (suggestions.length === 0) {
            return {
              success: true,
              result: `No automatic fixes available for: "${args.issue_description}". Manual review recommended.`,
              data: { autoFixAvailable: false },
            };
          }

          if (autoApply && suggestions.length > 0) {
            await fs.writeFile(pathCheck.absolutePath, suggestions[0].fixed, "utf-8");
            return {
              success: true,
              result: `✅ Applied fix: ${suggestions[0].description}\n\nFile updated: \`${args.file_path}\``,
              data: { applied: true, suggestion: suggestions[0] },
            };
          }

          return {
            success: true,
            result: `## Suggested Fix for \`${args.file_path}\`\n\n**Issue:** ${args.issue_description}\n\n**Suggestion:** ${suggestions[0].description}\n\nSet \`auto_apply: true\` to apply this fix.`,
            data: { applied: false, suggestions },
          };
        } catch (error: any) {
          return {
            success: false,
            result: `Failed to fix file: ${error.message}`,
          };
        }
      }

      case "create_file":
      case "edit_file":
      case "run_command": {
        return {
          success: false,
          result: `⛔ This tool is currently disabled for security reasons. These tools will be available in a future release with proper sandboxing and strict validation.`,
        };
      }

      case "search_codebase": {
        const searchType = args.search_type || "text";
        const maxResults = parseInt(args.max_results) || 20;
        const filePattern = args.file_pattern || "*";

        try {
          let command: string;
          
          if (searchType === "filename") {
            command = `find . -name "${args.query}" -type f | head -n ${maxResults}`;
          } else if (searchType === "regex") {
            command = `grep -rn --include="${filePattern}" -E "${args.query}" . 2>/dev/null | head -n ${maxResults}`;
          } else {
            command = `grep -rn --include="${filePattern}" "${args.query}" . 2>/dev/null | head -n ${maxResults}`;
          }

          const { stdout } = await execAsync(command, {
            cwd: PROJECT_ROOT,
            timeout: 30000,
            maxBuffer: 1024 * 1024,
          });

          const results = stdout.trim().split("\n").filter(Boolean);
          
          if (results.length === 0) {
            return {
              success: true,
              result: `No results found for: "${args.query}"`,
              data: { results: [], count: 0 },
            };
          }

          const formatted = results.map(r => `- ${r}`).join("\n");

          return {
            success: true,
            result: `## Search Results for "${args.query}"\n\nFound ${results.length} result(s):\n\n${formatted}`,
            data: { results, count: results.length },
          };
        } catch (error: any) {
          if (error.code === 1 && !error.stderr) {
            return {
              success: true,
              result: `No results found for: "${args.query}"`,
              data: { results: [], count: 0 },
            };
          }
          return {
            success: false,
            result: `Search failed: ${error.message}`,
          };
        }
      }

      case "create_subagent": {
        const agentType = (args.agent_type || "code") as "code" | "research" | "automation" | "creative";
        const preferLocal = args.prefer_local !== "false";

        const capabilities = {
          code: ["analyze_code", "fix_code", "create_file", "edit_file", "run_command", "search_codebase"],
          research: ["search_codebase", "browse_models"],
          automation: ["run_command", "docker_action", "deploy"],
          creative: ["generate_image", "generate_video"],
        };

        const subagent = jarvisOrchestrator.createSubagent(
          args.name,
          agentType,
          capabilities[agentType],
          preferLocal
        );

        const job = await jarvisOrchestrator.createJob(
          "subagent_task",
          { task: args.task, subagentId: subagent.id },
          { priority: "normal", subagentId: subagent.id }
        );

        return {
          success: true,
          result: `## Subagent Created\n\n**Name:** ${subagent.name}\n**ID:** ${subagent.id}\n**Type:** ${agentType}\n**Task:** ${args.task}\n**Job ID:** ${job.id}\n\nThe subagent is now working on the task. Check status with \`check_ai_services\`.`,
          data: { subagent, job },
        };
      }

      case "check_ai_services": {
        const refresh = args.refresh !== "false";
        
        if (refresh) {
          await jarvisOrchestrator.refreshResourceStatus();
        }

        const services = await jarvisOrchestrator.checkAllAIServices();
        const stats = jarvisOrchestrator.getStats();
        const subagents = jarvisOrchestrator.getActiveSubagents();

        let result = "## AI Services Status\n\n";
        
        result += "### Local AI (GPU)\n";
        for (const runtime of services.local) {
          const icon = runtime.status === "online" ? "🟢" : "🔴";
          result += `${icon} **${runtime.provider}**: ${runtime.status}`;
          if (runtime.latencyMs) result += ` (${runtime.latencyMs}ms)`;
          if (runtime.vramUsed !== undefined) result += ` | VRAM: ${runtime.vramUsed}GB`;
          result += "\n";
        }

        result += "\n### Cloud AI\n";
        for (const cloud of services.cloud) {
          const icon = cloud.hasKey ? "🟢" : "⚪";
          result += `${icon} **${cloud.provider}**: ${cloud.status}\n`;
        }

        result += "\n### Orchestrator Stats\n";
        result += `- Jobs Running: ${stats.runningJobs}\n`;
        result += `- Jobs Queued: ${stats.queuedJobs}\n`;
        result += `- Jobs Completed: ${stats.completedJobs}\n`;
        result += `- Active Subagents: ${stats.activeSubagents}\n`;

        if (subagents.length > 0) {
          result += "\n### Active Subagents\n";
          for (const agent of subagents) {
            const icon = agent.status === "busy" ? "🔄" : "⏸️";
            result += `${icon} **${agent.name}** (${agent.type}): ${agent.status} | Tasks: ${agent.tasksCompleted} completed\n`;
          }
        }

        return {
          success: true,
          result,
          data: { services, stats, subagents },
        };
      }

      case "browse_models": {
        const source = args.source || "all";
        const modelType = args.model_type || "all";
        
        const models: { name: string; source: string; type: string; size?: string }[] = [];

        if (source === "ollama" || source === "all" || source === "local") {
          try {
            const ollamaModels = await localAIRuntime.getOllamaModels();
            for (const m of ollamaModels) {
              if (modelType === "all" || modelType === "llm") {
                models.push({
                  name: m.name,
                  source: "ollama (local)",
                  type: "llm",
                  size: m.size,
                });
              }
            }
          } catch {
          }
        }

        if (source === "local" || source === "all") {
          try {
            const sdModels = await localAIRuntime.getSDModels();
            for (const m of sdModels) {
              if (modelType === "all" || modelType === "image") {
                models.push({
                  name: m.name,
                  source: "stable-diffusion (local)",
                  type: "image",
                });
              }
            }
          } catch {
          }
        }

        const popularModels = [
          { name: "llama3.2", source: "ollama", type: "llm", size: "2.0GB" },
          { name: "llama3.2:70b", source: "ollama", type: "llm", size: "40GB" },
          { name: "mistral", source: "ollama", type: "llm", size: "4.1GB" },
          { name: "codellama", source: "ollama", type: "llm", size: "3.8GB" },
          { name: "deepseek-coder", source: "ollama", type: "llm", size: "776MB" },
          { name: "nomic-embed-text", source: "ollama", type: "embedding", size: "274MB" },
        ];

        for (const pm of popularModels) {
          if (!models.find(m => m.name === pm.name)) {
            if ((modelType === "all" || modelType === pm.type) && (source === "all" || source === "ollama")) {
              models.push({ ...pm, source: pm.source + " (catalog)" });
            }
          }
        }

        let filtered = models;
        if (args.search_query) {
          const query = args.search_query.toLowerCase();
          filtered = models.filter(m => m.name.toLowerCase().includes(query));
        }

        let result = "## Available AI Models\n\n";
        
        if (filtered.length === 0) {
          result += "No models found matching your criteria.";
        } else {
          const grouped: Record<string, typeof filtered> = {};
          for (const m of filtered) {
            const key = m.type;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(m);
          }

          for (const [type, typeModels] of Object.entries(grouped)) {
            result += `### ${type.toUpperCase()} Models\n`;
            for (const m of typeModels) {
              result += `- **${m.name}** (${m.source})${m.size ? ` - ${m.size}` : ""}\n`;
            }
            result += "\n";
          }
        }

        return {
          success: true,
          result,
          data: { models: filtered, count: filtered.length },
        };
      }

      case "install_model": {
        const source = args.source || "ollama";
        const modelName = args.model_name;

        if (source === "ollama") {
          try {
            const result = await localAIRuntime.pullOllamaModel(modelName);
            
            if (result.success) {
              return {
                success: true,
                result: `✅ Successfully installed model: **${modelName}**\n\n${result.message}`,
                data: { model: modelName, source: "ollama" },
              };
            } else {
              return {
                success: false,
                result: `Failed to install model: ${result.message}`,
              };
            }
          } catch (error: any) {
            return {
              success: false,
              result: `Failed to install model: ${error.message}. Make sure Ollama is running.`,
            };
          }
        }

        return {
          success: false,
          result: `Source "${source}" is not yet supported for model installation. Currently supported: ollama`,
        };
      }

      default:
        return {
          success: false,
          result: `Unknown tool: ${toolName}`,
        };
    }
  } catch (error: any) {
    console.error(`[Jarvis] Tool execution error:`, error);
    return {
      success: false,
      result: `Error executing ${toolName}: ${error.message}`,
    };
  }
}
