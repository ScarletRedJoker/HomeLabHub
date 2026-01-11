/**
 * AI Agent Tool Registry
 * Defines tools that the AI agent can use to interact with the system
 */

import { execSync, spawn } from "child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";
import path, { join, resolve, relative } from "path";

export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "array";
  description: string;
  required: boolean;
}

export interface Tool {
  name: string;
  description: string;
  category: "codebase" | "shell" | "research" | "file";
  parameters: ToolParameter[];
  requiresApproval: boolean;
  execute: (params: Record<string, any>, workingDir: string) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  data?: any;
}

export interface ToolCall {
  tool: string;
  parameters: Record<string, any>;
  reasoning?: string;
}

const ALLOWED_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".scss",
  ".html", ".py", ".go", ".rs", ".yaml", ".yml", ".toml", ".sh",
  ".sql", ".prisma", ".graphql", ".env.example"
];

const DANGEROUS_PATTERNS = [
  /rm\s+-rf/i,
  /rm\s+.*--no-preserve-root/i,
  /dd\s+if=/i,
  /mkfs/i,
  /:\(\)\{.*\}/,
  />\s*\/dev\/sd/,
  /chmod\s+777/,
  /curl.*\|\s*sh/,
  /wget.*\|\s*sh/,
];

const BLOCKED_PATHS = [
  "/etc",
  "/root",
  "/var",
  "/usr",
  "/bin",
  "/sbin",
  "/boot",
  "/dev",
  "/proc",
  "/sys",
  "/home",
];

function isPathSafe(inputPath: string, workingDir: string): boolean {
  if (!inputPath || !workingDir) return false;
  
  if (inputPath.startsWith("/")) {
    return false;
  }
  
  const normalizedWorkingDir = resolve(workingDir);
  const resolvedPath = resolve(normalizedWorkingDir, inputPath);
  
  const relativePath = relative(normalizedWorkingDir, resolvedPath);
  
  if (relativePath.startsWith("..")) {
    return false;
  }
  
  if (path.isAbsolute(relativePath)) {
    return false;
  }
  
  if (!resolvedPath.startsWith(normalizedWorkingDir)) {
    return false;
  }
  
  if (inputPath.includes(".env") && !inputPath.endsWith(".env.example")) {
    return false;
  }
  
  return true;
}

function isCommandSafe(command: string): { safe: boolean; reason?: string } {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { safe: false, reason: `Blocked dangerous pattern: ${pattern}` };
    }
  }
  return { safe: true };
}

export const tools: Tool[] = [
  {
    name: "search_codebase",
    description: "Search the codebase for files or content using ripgrep patterns. Use this to find code, functions, or text across the project.",
    category: "codebase",
    parameters: [
      { name: "pattern", type: "string", description: "Regex pattern to search for", required: true },
      { name: "file_pattern", type: "string", description: "Glob pattern for files (e.g., '*.ts')", required: false },
      { name: "max_results", type: "number", description: "Maximum number of results", required: false },
    ],
    requiresApproval: false,
    execute: async (params, workingDir) => {
      try {
        const { pattern, file_pattern, max_results = 50 } = params;
        let cmd = `rg -n --color never --max-count ${max_results}`;
        if (file_pattern) cmd += ` -g '${file_pattern}'`;
        cmd += ` '${pattern.replace(/'/g, "'\\''")}'`;
        
        const output = execSync(cmd, { 
          cwd: workingDir, 
          encoding: "utf-8",
          maxBuffer: 1024 * 1024,
          timeout: 30000,
        });
        
        return { success: true, output: output.slice(0, 10000) };
      } catch (error: any) {
        if (error.status === 1) {
          return { success: true, output: "No matches found" };
        }
        return { success: false, output: "", error: error.message };
      }
    },
  },

  {
    name: "list_files",
    description: "List files and directories in a path. Use this to explore the project structure.",
    category: "codebase",
    parameters: [
      { name: "path", type: "string", description: "Directory path to list (relative to project root)", required: false },
      { name: "recursive", type: "boolean", description: "List recursively", required: false },
      { name: "max_depth", type: "number", description: "Maximum depth for recursive listing", required: false },
    ],
    requiresApproval: false,
    execute: async (params, workingDir) => {
      try {
        const { path = ".", recursive = false, max_depth = 3 } = params;
        const targetPath = resolve(workingDir, path);
        
        if (!isPathSafe(path, workingDir)) {
          return { success: false, output: "", error: "Path is outside allowed directory" };
        }

        let cmd = recursive 
          ? `find '${targetPath}' -maxdepth ${max_depth} -type f -o -type d | head -200`
          : `ls -la '${targetPath}'`;
        
        const output = execSync(cmd, { cwd: workingDir, encoding: "utf-8", timeout: 10000 });
        return { success: true, output };
      } catch (error: any) {
        return { success: false, output: "", error: error.message };
      }
    },
  },

  {
    name: "read_file",
    description: "Read the contents of a file. Use this to understand code before making changes.",
    category: "file",
    parameters: [
      { name: "path", type: "string", description: "File path relative to project root", required: true },
      { name: "start_line", type: "number", description: "Starting line number (1-indexed)", required: false },
      { name: "end_line", type: "number", description: "Ending line number", required: false },
    ],
    requiresApproval: false,
    execute: async (params, workingDir) => {
      try {
        const { path, start_line, end_line } = params;
        
        if (!isPathSafe(path, workingDir)) {
          return { success: false, output: "", error: "Path is outside allowed directory" };
        }

        const fullPath = resolve(workingDir, path);
        if (!existsSync(fullPath)) {
          return { success: false, output: "", error: `File not found: ${path}` };
        }

        const content = readFileSync(fullPath, "utf-8");
        const lines = content.split("\n");
        
        if (start_line && end_line) {
          const slice = lines.slice(start_line - 1, end_line).join("\n");
          return { success: true, output: slice, data: { totalLines: lines.length } };
        }
        
        if (lines.length > 500) {
          return { 
            success: true, 
            output: lines.slice(0, 500).join("\n") + "\n\n[... truncated, file has " + lines.length + " lines]",
            data: { totalLines: lines.length, truncated: true }
          };
        }
        
        return { success: true, output: content };
      } catch (error: any) {
        return { success: false, output: "", error: error.message };
      }
    },
  },

  {
    name: "write_file",
    description: "Write or create a file with the specified content. Use this to make code changes.",
    category: "file",
    parameters: [
      { name: "path", type: "string", description: "File path relative to project root", required: true },
      { name: "content", type: "string", description: "Content to write to the file", required: true },
    ],
    requiresApproval: true,
    execute: async (params, workingDir) => {
      try {
        const { path, content } = params;
        
        if (!isPathSafe(path, workingDir)) {
          return { success: false, output: "", error: "Path is outside allowed directory" };
        }

        const fullPath = resolve(workingDir, path);
        const existed = existsSync(fullPath);
        
        writeFileSync(fullPath, content, "utf-8");
        
        return { 
          success: true, 
          output: existed ? `Updated file: ${path}` : `Created file: ${path}`,
          data: { path, existed, bytesWritten: content.length }
        };
      } catch (error: any) {
        return { success: false, output: "", error: error.message };
      }
    },
  },

  {
    name: "edit_file",
    description: "Edit a file by replacing specific text. Use this for targeted code changes.",
    category: "file",
    parameters: [
      { name: "path", type: "string", description: "File path relative to project root", required: true },
      { name: "old_text", type: "string", description: "Text to find and replace", required: true },
      { name: "new_text", type: "string", description: "Replacement text", required: true },
    ],
    requiresApproval: true,
    execute: async (params, workingDir) => {
      try {
        const { path, old_text, new_text } = params;
        
        if (!isPathSafe(path, workingDir)) {
          return { success: false, output: "", error: "Path is outside allowed directory" };
        }

        const fullPath = resolve(workingDir, path);
        if (!existsSync(fullPath)) {
          return { success: false, output: "", error: `File not found: ${path}` };
        }

        const content = readFileSync(fullPath, "utf-8");
        if (!content.includes(old_text)) {
          return { success: false, output: "", error: "Old text not found in file" };
        }

        const newContent = content.replace(old_text, new_text);
        writeFileSync(fullPath, newContent, "utf-8");
        
        return { success: true, output: `Edited file: ${path}` };
      } catch (error: any) {
        return { success: false, output: "", error: error.message };
      }
    },
  },

  {
    name: "run_command",
    description: "Run a shell command. Use this to execute scripts, run tests, or perform system operations.",
    category: "shell",
    parameters: [
      { name: "command", type: "string", description: "Shell command to execute", required: true },
      { name: "timeout", type: "number", description: "Timeout in seconds (default: 60)", required: false },
    ],
    requiresApproval: true,
    execute: async (params, workingDir) => {
      try {
        const { command, timeout = 60 } = params;
        
        const safetyCheck = isCommandSafe(command);
        if (!safetyCheck.safe) {
          return { success: false, output: "", error: safetyCheck.reason };
        }

        const output = execSync(command, {
          cwd: workingDir,
          encoding: "utf-8",
          timeout: timeout * 1000,
          maxBuffer: 1024 * 1024,
        });
        
        return { success: true, output: output.slice(0, 10000) };
      } catch (error: any) {
        return { 
          success: false, 
          output: error.stdout?.slice(0, 5000) || "", 
          error: error.stderr?.slice(0, 5000) || error.message 
        };
      }
    },
  },

  {
    name: "web_search",
    description: "Search the web for information using DuckDuckGo (privacy-focused). Use this for documentation, tutorials, or research.",
    category: "research",
    parameters: [
      { name: "query", type: "string", description: "Search query", required: true },
      { name: "num_results", type: "number", description: "Number of results (default: 5)", required: false },
    ],
    requiresApproval: false,
    execute: async (params, workingDir) => {
      try {
        const DDG = await import("duck-duck-scrape");
        const { query, num_results = 5 } = params;
        
        const searchResults = await DDG.search(query, {
          safeSearch: DDG.SafeSearchType.MODERATE,
        });

        if (searchResults.noResults || !searchResults.results?.length) {
          return { success: true, output: "No search results found." };
        }

        const results = searchResults.results.slice(0, num_results).map((r: any, i: number) => 
          `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.description || ""}`
        ).join("\n\n");

        return { 
          success: true, 
          output: `Search results for "${query}":\n\n${results}`,
          data: { query, resultCount: searchResults.results.length }
        };
      } catch (error: any) {
        return { success: false, output: "", error: `Search failed: ${error.message}` };
      }
    },
  },

  {
    name: "git_status",
    description: "Get the current git status showing modified, staged, and untracked files.",
    category: "codebase",
    parameters: [],
    requiresApproval: false,
    execute: async (params, workingDir) => {
      try {
        const status = execSync("git status --porcelain", { cwd: workingDir, encoding: "utf-8" });
        const branch = execSync("git branch --show-current", { cwd: workingDir, encoding: "utf-8" }).trim();
        return { 
          success: true, 
          output: `Branch: ${branch}\n\n${status || "Working directory clean"}` 
        };
      } catch (error: any) {
        return { success: false, output: "", error: error.message };
      }
    },
  },

  {
    name: "git_diff",
    description: "Show the diff of uncommitted changes or between commits.",
    category: "codebase",
    parameters: [
      { name: "file", type: "string", description: "Specific file to diff (optional)", required: false },
      { name: "staged", type: "boolean", description: "Show staged changes only", required: false },
    ],
    requiresApproval: false,
    execute: async (params, workingDir) => {
      try {
        const { file, staged } = params;
        let cmd = staged ? "git diff --cached" : "git diff";
        if (file) cmd += ` -- '${file}'`;
        
        const output = execSync(cmd, { cwd: workingDir, encoding: "utf-8", maxBuffer: 1024 * 1024 });
        return { success: true, output: output.slice(0, 15000) || "No changes" };
      } catch (error: any) {
        return { success: false, output: "", error: error.message };
      }
    },
  },
];

export function getToolByName(name: string): Tool | undefined {
  return tools.find(t => t.name === name);
}

export function getToolsSchema(): object[] {
  return tools.map(tool => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties: Object.fromEntries(
          tool.parameters.map(p => [p.name, { type: p.type, description: p.description }])
        ),
        required: tool.parameters.filter(p => p.required).map(p => p.name),
      },
    },
  }));
}

export function formatToolsForPrompt(): string {
  return tools.map(tool => {
    const params = tool.parameters.map(p => 
      `  - ${p.name} (${p.type}${p.required ? ", required" : ""}): ${p.description}`
    ).join("\n");
    return `### ${tool.name}\n${tool.description}\n${params ? "Parameters:\n" + params : "No parameters"}\n${tool.requiresApproval ? "[Requires approval]" : ""}`;
  }).join("\n\n");
}
