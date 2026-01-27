/**
 * AI Developer Tools - Interfaces for autonomous code modification
 * Provides file operations, code search, test execution, and command running
 */

import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { aiLogger } from '../logger';
import type { ToolDefinition } from './provider-registry';
import { remoteExecutor, type RemoteExecutionConfig } from './remote-executor';

const execAsync = promisify(exec);

export interface ToolResult {
  success: boolean;
  output: unknown;
  error?: string;
  durationMs: number;
}

export interface FileReadParams {
  path: string;
  encoding?: BufferEncoding;
}

export interface FileWriteParams {
  path: string;
  content: string;
  createDirectories?: boolean;
}

export interface FileSearchParams {
  pattern: string;
  directory?: string;
  maxResults?: number;
  fileTypes?: string[];
}

export interface CodeSearchParams {
  query: string;
  directory?: string;
  filePattern?: string;
  contextLines?: number;
}

export interface CommandParams {
  command: string;
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

export interface TestRunParams {
  testPath?: string;
  testPattern?: string;
  coverage?: boolean;
}

export interface GitDiffParams {
  staged?: boolean;
  filePath?: string;
}

const WORKSPACE_ROOT = process.cwd();
const ALLOWED_PATHS = [
  'services/dashboard-next',
  'services/discord-bot',
  'services/stream-bot',
  'services/nebula-agent',
];

function isPathAllowed(targetPath: string): boolean {
  const normalizedPath = path.normalize(targetPath);
  const absolutePath = path.isAbsolute(normalizedPath)
    ? normalizedPath
    : path.join(WORKSPACE_ROOT, normalizedPath);
  
  const relativePath = path.relative(WORKSPACE_ROOT, absolutePath);
  
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return false;
  }
  
  return ALLOWED_PATHS.some(allowed => relativePath.startsWith(allowed));
}

function sanitizePath(targetPath: string): string {
  const normalized = path.normalize(targetPath);
  if (path.isAbsolute(normalized)) {
    return normalized;
  }
  return path.join(WORKSPACE_ROOT, normalized);
}

export async function readFile(params: FileReadParams): Promise<ToolResult> {
  const startTime = Date.now();
  const context = aiLogger.startRequest('ollama', 'read_file', { path: params.path });
  
  try {
    if (!isPathAllowed(params.path)) {
      throw new Error(`Path not allowed: ${params.path}`);
    }
    
    const fullPath = sanitizePath(params.path);
    const content = await fs.readFile(fullPath, params.encoding || 'utf-8');
    
    aiLogger.endRequest(context, true, { 
      size: content.length,
    });
    
    return {
      success: true,
      output: content,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    aiLogger.logError(context, errorMessage);
    
    return {
      success: false,
      output: null,
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
  }
}

export async function writeFile(params: FileWriteParams): Promise<ToolResult> {
  const startTime = Date.now();
  const context = aiLogger.startRequest('ollama', 'write_file', { path: params.path });
  
  try {
    if (!isPathAllowed(params.path)) {
      throw new Error(`Path not allowed: ${params.path}`);
    }
    
    const fullPath = sanitizePath(params.path);
    
    if (params.createDirectories) {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
    }
    
    await fs.writeFile(fullPath, params.content, 'utf-8');
    
    aiLogger.endRequest(context, true, { 
      size: params.content.length,
      bytesWritten: params.content.length,
    });
    
    return {
      success: true,
      output: { path: params.path, bytesWritten: params.content.length },
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    aiLogger.logError(context, errorMessage);
    
    return {
      success: false,
      output: null,
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
  }
}

export async function searchFiles(params: FileSearchParams): Promise<ToolResult> {
  const startTime = Date.now();
  const context = aiLogger.startRequest('ollama', 'search_files', { pattern: params.pattern, directory: params.directory });
  
  try {
    const directory = params.directory || 'services/dashboard-next';
    if (!isPathAllowed(directory)) {
      throw new Error(`Path not allowed: ${directory}`);
    }
    
    const fullPath = sanitizePath(directory);
    const maxResults = params.maxResults || 50;
    
    let command = `find "${fullPath}" -type f -name "${params.pattern}"`;
    
    if (params.fileTypes?.length) {
      const typeFilters = params.fileTypes.map(t => `-name "*.${t}"`).join(' -o ');
      command = `find "${fullPath}" -type f \\( ${typeFilters} \\) -name "*${params.pattern}*"`;
    }
    
    command += ` | head -n ${maxResults}`;
    
    const { stdout } = await execAsync(command, { timeout: 30000 });
    const files = stdout.trim().split('\n').filter(Boolean);
    
    aiLogger.endRequest(context, true, { 
      filesFound: files.length,
    });
    
    return {
      success: true,
      output: files.map(f => path.relative(WORKSPACE_ROOT, f)),
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    aiLogger.logError(context, errorMessage);
    
    return {
      success: false,
      output: [],
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
  }
}

export async function searchCode(params: CodeSearchParams): Promise<ToolResult> {
  const startTime = Date.now();
  const context = aiLogger.startRequest('ollama', 'search_code', { query: params.query, directory: params.directory });
  
  try {
    const directory = params.directory || 'services/dashboard-next';
    if (!isPathAllowed(directory)) {
      throw new Error(`Path not allowed: ${directory}`);
    }
    
    const fullPath = sanitizePath(directory);
    const contextLines = params.contextLines || 3;
    
    let command = `grep -rn --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" -C ${contextLines} "${params.query}" "${fullPath}"`;
    
    if (params.filePattern) {
      command = `grep -rn --include="${params.filePattern}" -C ${contextLines} "${params.query}" "${fullPath}"`;
    }
    
    command += ' | head -n 200';
    
    const { stdout } = await execAsync(command, { timeout: 30000 });
    
    const matches = stdout.trim().split('\n--\n').filter(Boolean).map(block => {
      const lines = block.split('\n');
      const firstLine = lines[0] || '';
      const match = firstLine.match(/^(.+?):(\d+):/);
      
      return {
        file: match ? path.relative(WORKSPACE_ROOT, match[1]) : 'unknown',
        line: match ? parseInt(match[2], 10) : 0,
        context: block,
      };
    });
    
    aiLogger.endRequest(context, true, { 
      matchesFound: matches.length,
    });
    
    return {
      success: true,
      output: matches,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('exit code 1')) {
      aiLogger.endRequest(context, true, { matchesFound: 0 });
      return {
        success: true,
        output: [],
        durationMs: Date.now() - startTime,
      };
    }
    
    aiLogger.logError(context, errorMessage);
    
    return {
      success: false,
      output: [],
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
  }
}

export async function runCommand(params: CommandParams): Promise<ToolResult> {
  const startTime = Date.now();
  const context = aiLogger.startRequest('ollama', 'run_command', { command: params.command.substring(0, 100) });
  
  const FORBIDDEN_PATTERNS = [
    /rm\s+-rf\s+\//,
    /rm\s+.*\s+\/(?!home)/,
    /dd\s+if=/,
    /mkfs/,
    /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/,
    /chmod\s+777\s+\//,
    /curl.*\|\s*(?:ba)?sh/,
    /wget.*\|\s*(?:ba)?sh/,
  ];
  
  try {
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(params.command)) {
        throw new Error('Command contains forbidden pattern');
      }
    }
    
    const cwd = params.cwd ? sanitizePath(params.cwd) : WORKSPACE_ROOT;
    const timeout = params.timeout || 60000;
    
    const { stdout, stderr } = await execAsync(params.command, {
      cwd,
      timeout,
      env: { ...process.env, ...params.env },
      maxBuffer: 10 * 1024 * 1024,
    });
    
    aiLogger.endRequest(context, true, { 
      hasStderr: !!stderr,
      stdoutLength: stdout.length,
    });
    
    return {
      success: true,
      output: { stdout, stderr },
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    aiLogger.logError(context, errorMessage);
    
    return {
      success: false,
      output: null,
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
  }
}

export async function runTests(params: TestRunParams): Promise<ToolResult> {
  const startTime = Date.now();
  const context = aiLogger.startRequest('ollama', 'run_tests', { testPath: params.testPath, testPattern: params.testPattern });
  
  try {
    const testDir = 'services/dashboard-next';
    let command = 'npm test';
    
    if (params.testPath) {
      command = `npm test -- ${params.testPath}`;
    } else if (params.testPattern) {
      command = `npm test -- --testPathPattern="${params.testPattern}"`;
    }
    
    if (params.coverage) {
      command += ' --coverage';
    }
    
    const cwd = sanitizePath(testDir);
    
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: 300000,
      maxBuffer: 50 * 1024 * 1024,
    });
    
    const passed = !stderr.includes('FAIL') && stdout.includes('PASS');
    
    aiLogger.endRequest(context, true, { 
      passed,
    });
    
    return {
      success: true,
      output: { stdout, stderr, passed },
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    aiLogger.logError(context, errorMessage);
    
    return {
      success: false,
      output: { passed: false },
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
  }
}

export async function gitDiff(params: GitDiffParams = {}): Promise<ToolResult> {
  const startTime = Date.now();
  const context = aiLogger.startRequest('ollama', 'git_diff', { staged: params.staged, filePath: params.filePath });
  
  try {
    let command = 'git diff';
    
    if (params.staged) {
      command = 'git diff --staged';
    }
    
    if (params.filePath) {
      if (!isPathAllowed(params.filePath)) {
        throw new Error(`Path not allowed: ${params.filePath}`);
      }
      command += ` -- "${params.filePath}"`;
    }
    
    const { stdout } = await execAsync(command, {
      cwd: WORKSPACE_ROOT,
      timeout: 30000,
    });
    
    aiLogger.endRequest(context, true, { 
      diffSize: stdout.length,
    });
    
    return {
      success: true,
      output: stdout,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    aiLogger.logError(context, errorMessage);
    
    return {
      success: false,
      output: null,
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
  }
}

export async function listDirectory(dirPath: string): Promise<ToolResult> {
  const startTime = Date.now();
  const context = aiLogger.startRequest('ollama', 'list_directory', { path: dirPath });
  
  try {
    if (!isPathAllowed(dirPath)) {
      throw new Error(`Path not allowed: ${dirPath}`);
    }
    
    const fullPath = sanitizePath(dirPath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    
    const result = entries.map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      path: path.join(dirPath, entry.name),
    }));
    
    aiLogger.endRequest(context, true, { 
      entriesFound: result.length,
    });
    
    return {
      success: true,
      output: result,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    aiLogger.logError(context, errorMessage);
    
    return {
      success: false,
      output: [],
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
  }
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file at the specified path',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path to the file' },
          encoding: { type: 'string', description: 'File encoding (default: utf-8)' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file at the specified path',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path to the file' },
          content: { type: 'string', description: 'Content to write' },
          createDirectories: { type: 'boolean', description: 'Create parent directories if they do not exist' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search for files matching a pattern',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'File name pattern to search for' },
          directory: { type: 'string', description: 'Directory to search in' },
          maxResults: { type: 'number', description: 'Maximum number of results' },
          fileTypes: { type: 'array', items: { type: 'string' }, description: 'File extensions to include' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_code',
      description: 'Search for code patterns in the codebase',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (regex supported)' },
          directory: { type: 'string', description: 'Directory to search in' },
          filePattern: { type: 'string', description: 'File pattern to search in (e.g., "*.ts")' },
          contextLines: { type: 'number', description: 'Number of context lines to show' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run a shell command',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to run' },
          cwd: { type: 'string', description: 'Working directory' },
          timeout: { type: 'number', description: 'Timeout in milliseconds' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_tests',
      description: 'Run the test suite',
      parameters: {
        type: 'object',
        properties: {
          testPath: { type: 'string', description: 'Specific test file to run' },
          testPattern: { type: 'string', description: 'Pattern to match test files' },
          coverage: { type: 'boolean', description: 'Generate coverage report' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: 'Get the git diff of changes',
      parameters: {
        type: 'object',
        properties: {
          staged: { type: 'boolean', description: 'Show staged changes only' },
          filePath: { type: 'string', description: 'Specific file to diff' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List contents of a directory',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path to list' },
        },
        required: ['path'],
      },
    },
  },
];

export async function executeTool(
  name: string, 
  args: Record<string, unknown>,
  remoteConfig?: RemoteExecutionConfig
): Promise<ToolResult> {
  if (remoteConfig) {
    const remoteResult = await executeToolRemote(name, args, remoteConfig);
    if (remoteResult.success || !remoteResult.error?.includes('Connection')) {
      return remoteResult;
    }
  }
  
  return executeToolLocal(name, args);
}

async function executeToolLocal(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  switch (name) {
    case 'read_file':
      return readFile(args as unknown as FileReadParams);
    case 'write_file':
      return writeFile(args as unknown as FileWriteParams);
    case 'search_files':
      return searchFiles(args as unknown as FileSearchParams);
    case 'search_code':
      return searchCode(args as unknown as CodeSearchParams);
    case 'run_command':
      return runCommand(args as unknown as CommandParams);
    case 'run_tests':
      return runTests(args as unknown as TestRunParams);
    case 'git_diff':
      return gitDiff(args as unknown as GitDiffParams);
    case 'list_directory':
      return listDirectory(args.path as string);
    default:
      return {
        success: false,
        output: null,
        error: `Unknown tool: ${name}`,
        durationMs: 0,
      };
  }
}

async function executeToolRemote(
  name: string, 
  args: Record<string, unknown>,
  remoteConfig: RemoteExecutionConfig
): Promise<ToolResult> {
  const startTime = Date.now();
  
  try {
    let result;
    
    switch (name) {
      case 'read_file':
        result = await remoteExecutor.readRemoteFile(remoteConfig, args.path as string);
        break;
      case 'write_file':
        result = await remoteExecutor.writeRemoteFile(
          remoteConfig, 
          args.path as string, 
          args.content as string
        );
        break;
      case 'search_code':
        result = await remoteExecutor.searchRemoteCode(
          remoteConfig,
          args.query as string,
          args.directory as string | undefined,
          args.filePattern as string | undefined
        );
        break;
      case 'run_command':
        result = await remoteExecutor.executeRemoteCommand(
          remoteConfig,
          args.command as string,
          args.cwd as string | undefined,
          args.timeout as number | undefined
        );
        break;
      case 'list_directory':
        result = await remoteExecutor.listRemoteDirectory(remoteConfig, args.path as string);
        break;
      default:
        return {
          success: false,
          output: null,
          error: `Tool ${name} not supported for remote execution, falling back to local`,
          durationMs: Date.now() - startTime,
        };
    }
    
    return {
      success: result.success,
      output: result.output,
      error: result.error,
      durationMs: result.durationMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown remote execution error';
    return {
      success: false,
      output: null,
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
  }
}
