/**
 * Plugin Sandbox
 * Nebula Command - Sandboxed plugin execution with permission controls
 */

import { 
  PluginPermission, 
  PluginExecutionContext, 
  PluginExecutionResult 
} from './types';
import { pluginRegistry } from './registry';
import path from 'path';

const DEFAULT_TIMEOUT = 5000;
const MAX_TIMEOUT = 30000;

interface SandboxApi {
  log: (...args: any[]) => void;
  fetch?: typeof fetch;
  db?: {
    query: (sql: string, params?: any[]) => Promise<any>;
  };
  fs?: {
    readFile: (path: string) => Promise<string>;
    writeFile: (path: string, content: string) => Promise<void>;
    exists: (path: string) => Promise<boolean>;
  };
  secrets?: {
    get: (key: string) => Promise<string | undefined>;
  };
  shell?: {
    exec: (command: string) => Promise<{ stdout: string; stderr: string; code: number }>;
  };
}

function createSandboxApi(context: PluginExecutionContext): SandboxApi {
  const api: SandboxApi = {
    log: (...args: any[]) => {
      console.log(`[Plugin:${context.pluginId}]`, ...args);
    },
  };

  if (context.permissions.includes('network')) {
    api.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), context.timeout);
      
      try {
        const response = await fetch(input, {
          ...init,
          signal: controller.signal,
        });
        return response;
      } finally {
        clearTimeout(timeoutId);
      }
    };
  }

  if (context.permissions.includes('database')) {
    api.db = {
      query: async (sql: string, params?: any[]) => {
        const isReadOnly = /^\s*(SELECT|SHOW|DESCRIBE|EXPLAIN)/i.test(sql);
        if (!isReadOnly) {
          throw new Error('Plugin database access is read-only');
        }
        console.log(`[Plugin:${context.pluginId}] DB Query:`, sql);
        return { rows: [], rowCount: 0 };
      },
    };
  }

  if (context.permissions.includes('filesystem')) {
    const pluginDir = path.resolve(process.cwd(), 'plugins', context.pluginId);
    
    const resolveSafePath = (inputPath: string): string => {
      let targetPath: string;
      if (inputPath.startsWith('./') || inputPath.startsWith('../') || !inputPath.startsWith('/')) {
        targetPath = path.resolve(pluginDir, inputPath);
      } else {
        targetPath = path.resolve(inputPath);
      }
      
      const normalizedTarget = path.normalize(targetPath);
      const normalizedPluginDir = path.normalize(pluginDir);
      
      if (!normalizedTarget.startsWith(normalizedPluginDir + path.sep) && 
          normalizedTarget !== normalizedPluginDir) {
        throw new Error('Filesystem access restricted to plugin directory');
      }
      
      return normalizedTarget;
    };
    
    api.fs = {
      readFile: async (inputPath: string) => {
        const safePath = resolveSafePath(inputPath);
        const { readFile } = await import('fs/promises');
        return await readFile(safePath, 'utf-8');
      },
      writeFile: async (inputPath: string, content: string) => {
        const safePath = resolveSafePath(inputPath);
        const { writeFile } = await import('fs/promises');
        await writeFile(safePath, content, 'utf-8');
      },
      exists: async (inputPath: string) => {
        try {
          const safePath = resolveSafePath(inputPath);
          const { access } = await import('fs/promises');
          await access(safePath);
          return true;
        } catch {
          return false;
        }
      },
    };
  }

  if (context.permissions.includes('secrets')) {
    api.secrets = {
      get: async (key: string) => {
        const prefixedKey = `PLUGIN_${context.pluginId.toUpperCase()}_${key}`;
        return process.env[prefixedKey];
      },
    };
  }

  if (context.permissions.includes('shell')) {
    api.shell = {
      exec: async (command: string) => {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        const allowedCommands = ['echo', 'date', 'whoami'];
        const cmd = command.split(' ')[0];
        if (!allowedCommands.includes(cmd)) {
          throw new Error(`Shell command "${cmd}" not allowed`);
        }
        
        try {
          const { stdout, stderr } = await execAsync(command, { timeout: context.timeout });
          return { stdout, stderr, code: 0 };
        } catch (error: any) {
          return { stdout: '', stderr: error.message, code: error.code || 1 };
        }
      },
    };
  }

  return api;
}

export async function executeInSandbox(
  pluginId: string,
  code: string,
  context?: Partial<PluginExecutionContext>
): Promise<PluginExecutionResult> {
  const startTime = Date.now();
  
  const plugin = pluginRegistry.getPlugin(pluginId);
  if (!plugin) {
    return {
      success: false,
      error: `Plugin ${pluginId} not found`,
      durationMs: Date.now() - startTime,
    };
  }

  if (plugin.status !== 'active') {
    return {
      success: false,
      error: `Plugin ${pluginId} is not active`,
      durationMs: Date.now() - startTime,
    };
  }

  const execContext: PluginExecutionContext = {
    pluginId,
    permissions: plugin.manifest.permissions || [],
    config: plugin.config,
    timeout: Math.min(context?.timeout || DEFAULT_TIMEOUT, MAX_TIMEOUT),
  };

  const api = createSandboxApi(execContext);

  try {
    const result = await executeWithTimeout(
      () => runSandboxedCode(code, api, execContext),
      execContext.timeout
    );

    return {
      success: true,
      result,
      durationMs: Date.now() - startTime,
    };
  } catch (error: any) {
    pluginRegistry.setPluginError(pluginId, error.message);
    
    return {
      success: false,
      error: error.message,
      durationMs: Date.now() - startTime,
    };
  }
}

async function runSandboxedCode(
  code: string,
  api: SandboxApi,
  context: PluginExecutionContext
): Promise<any> {
  const sandboxGlobals = {
    console: {
      log: api.log,
      warn: api.log,
      error: api.log,
      info: api.log,
    },
    fetch: api.fetch,
    db: api.db,
    fs: api.fs,
    secrets: api.secrets,
    shell: api.shell,
    config: context.config,
    setTimeout: undefined,
    setInterval: undefined,
    setImmediate: undefined,
    eval: undefined,
    Function: undefined,
  };

  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  
  const wrappedCode = `
    "use strict";
    return (async () => {
      ${code}
    })();
  `;

  try {
    const fn = new AsyncFunction(...Object.keys(sandboxGlobals), wrappedCode);
    return await fn(...Object.values(sandboxGlobals));
  } catch (error: any) {
    throw new Error(`Sandbox execution error: ${error.message}`);
  }
}

function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Execution timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function executePluginHandler(
  pluginId: string,
  handlerPath: string,
  args: any[] = []
): Promise<PluginExecutionResult> {
  const startTime = Date.now();
  
  const plugin = pluginRegistry.getPlugin(pluginId);
  if (!plugin) {
    return {
      success: false,
      error: `Plugin ${pluginId} not found`,
      durationMs: Date.now() - startTime,
    };
  }

  try {
    const handlerModule = await import(`../../../plugins/${pluginId}/${handlerPath}`);
    const handler = handlerModule.default || handlerModule.handler;
    
    if (typeof handler !== 'function') {
      throw new Error(`Handler at ${handlerPath} is not a function`);
    }

    const execContext: PluginExecutionContext = {
      pluginId,
      permissions: plugin.manifest.permissions || [],
      config: plugin.config,
      timeout: DEFAULT_TIMEOUT,
    };

    const api = createSandboxApi(execContext);
    const result = await handler(api, ...args);

    return {
      success: true,
      result,
      durationMs: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      durationMs: Date.now() - startTime,
    };
  }
}

export class PluginErrorBoundary {
  private pluginId: string;
  private errorCount: number = 0;
  private maxErrors: number;
  private resetInterval: number;
  private lastReset: Date = new Date();

  constructor(pluginId: string, maxErrors = 5, resetIntervalMs = 60000) {
    this.pluginId = pluginId;
    this.maxErrors = maxErrors;
    this.resetInterval = resetIntervalMs;
  }

  recordError(error: Error): boolean {
    const now = new Date();
    if (now.getTime() - this.lastReset.getTime() > this.resetInterval) {
      this.errorCount = 0;
      this.lastReset = now;
    }

    this.errorCount++;
    
    if (this.errorCount >= this.maxErrors) {
      pluginRegistry.setPluginError(
        this.pluginId,
        `Plugin disabled after ${this.maxErrors} errors: ${error.message}`
      );
      pluginRegistry.disablePlugin(this.pluginId);
      return false;
    }

    return true;
  }

  reset(): void {
    this.errorCount = 0;
    this.lastReset = new Date();
  }
}
