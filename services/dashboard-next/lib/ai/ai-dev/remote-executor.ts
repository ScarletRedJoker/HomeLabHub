/**
 * Remote Executor - Execute AI Developer operations on remote Nebula Agent instances
 * Supports file operations, code search, and command execution on remote servers
 */

import { aiLogger } from '../logger';

export interface RemoteExecutionConfig {
  targetHost: string;
  agentPort?: number;
  sshEnabled?: boolean;
  authToken?: string;
}

export interface RemoteExecutionResult {
  success: boolean;
  output: any;
  error?: string;
  executedOn: string;
  durationMs: number;
}

export interface RemoteHealthStatus {
  hostname: string;
  platform: string;
  uptime: number;
  memory: {
    total: number;
    free: number;
    used: number;
  };
  gpu?: {
    name: string;
    memoryTotal: number;
    memoryUsed: number;
    memoryFree: number;
    utilization: number;
  } | null;
  timestamp: string;
}

export interface RemoteDirectoryEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
}

const DEFAULT_AGENT_PORT = 3456;
const DEFAULT_TIMEOUT = 30000;
const CONNECTION_TIMEOUT = 10000;

export class RemoteExecutor {
  private buildUrl(config: RemoteExecutionConfig, path: string): string {
    const port = config.agentPort || DEFAULT_AGENT_PORT;
    const protocol = config.sshEnabled ? 'https' : 'http';
    return `${protocol}://${config.targetHost}:${port}${path}`;
  }

  private buildHeaders(config: RemoteExecutionConfig): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (config.authToken) {
      headers['Authorization'] = `Bearer ${config.authToken}`;
    }

    return headers;
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number = DEFAULT_TIMEOUT
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async checkRemoteHealth(config: RemoteExecutionConfig): Promise<RemoteExecutionResult> {
    const startTime = Date.now();
    const context = aiLogger.startRequest('ollama', 'remote_check_health', { host: config.targetHost });

    try {
      const url = this.buildUrl(config, '/api/health');
      const response = await this.fetchWithTimeout(
        url,
        {
          method: 'GET',
          headers: this.buildHeaders(config),
        },
        CONNECTION_TIMEOUT
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Health check failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as RemoteHealthStatus & { success?: boolean };
      
      aiLogger.endRequest(context, true, { 
        hostname: data.hostname,
        platform: data.platform,
      });

      return {
        success: true,
        output: data,
        executedOn: data.hostname || config.targetHost,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = this.formatError(error);
      aiLogger.logError(context, errorMessage);

      return {
        success: false,
        output: null,
        error: errorMessage,
        executedOn: config.targetHost,
        durationMs: Date.now() - startTime,
      };
    }
  }

  async executeRemoteCommand(
    config: RemoteExecutionConfig,
    command: string,
    cwd?: string,
    timeout?: number
  ): Promise<RemoteExecutionResult> {
    const startTime = Date.now();
    const context = aiLogger.startRequest('ollama', 'remote_execute_command', { 
      host: config.targetHost,
      command: command.substring(0, 100),
    });

    try {
      const url = this.buildUrl(config, '/api/cmd');
      const response = await this.fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: this.buildHeaders(config),
          body: JSON.stringify({
            command,
            cwd,
            timeout: timeout || 60000,
          }),
        },
        timeout || DEFAULT_TIMEOUT
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Command execution failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      aiLogger.endRequest(context, data.success !== false, { 
        hasStdout: !!data.stdout,
        hasStderr: !!data.stderr,
      });

      return {
        success: data.success !== false,
        output: {
          stdout: data.stdout || '',
          stderr: data.stderr || '',
          exitCode: data.exitCode,
        },
        error: data.error,
        executedOn: data.hostname || config.targetHost,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = this.formatError(error);
      aiLogger.logError(context, errorMessage);

      return {
        success: false,
        output: null,
        error: errorMessage,
        executedOn: config.targetHost,
        durationMs: Date.now() - startTime,
      };
    }
  }

  async readRemoteFile(
    config: RemoteExecutionConfig,
    filePath: string
  ): Promise<RemoteExecutionResult> {
    const startTime = Date.now();
    const context = aiLogger.startRequest('ollama', 'remote_read_file', { 
      host: config.targetHost,
      path: filePath,
    });

    try {
      const encodedPath = encodeURIComponent(filePath);
      const url = this.buildUrl(config, `/api/files/${encodedPath}`);
      
      const response = await this.fetchWithTimeout(
        url,
        {
          method: 'GET',
          headers: this.buildHeaders(config),
        },
        DEFAULT_TIMEOUT
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`File read failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      aiLogger.endRequest(context, true, { 
        size: data.content?.length || 0,
      });

      return {
        success: true,
        output: data.content,
        executedOn: data.hostname || config.targetHost,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = this.formatError(error);
      aiLogger.logError(context, errorMessage);

      return {
        success: false,
        output: null,
        error: errorMessage,
        executedOn: config.targetHost,
        durationMs: Date.now() - startTime,
      };
    }
  }

  async writeRemoteFile(
    config: RemoteExecutionConfig,
    filePath: string,
    content: string
  ): Promise<RemoteExecutionResult> {
    const startTime = Date.now();
    const context = aiLogger.startRequest('ollama', 'remote_write_file', { 
      host: config.targetHost,
      path: filePath,
    });

    try {
      const encodedPath = encodeURIComponent(filePath);
      const url = this.buildUrl(config, `/api/files/${encodedPath}`);
      
      const response = await this.fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: this.buildHeaders(config),
          body: JSON.stringify({
            content,
            createDirectories: true,
          }),
        },
        DEFAULT_TIMEOUT
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`File write failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      aiLogger.endRequest(context, true, { 
        bytesWritten: content.length,
      });

      return {
        success: true,
        output: {
          path: filePath,
          bytesWritten: content.length,
        },
        executedOn: data.hostname || config.targetHost,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = this.formatError(error);
      aiLogger.logError(context, errorMessage);

      return {
        success: false,
        output: null,
        error: errorMessage,
        executedOn: config.targetHost,
        durationMs: Date.now() - startTime,
      };
    }
  }

  async listRemoteDirectory(
    config: RemoteExecutionConfig,
    dirPath: string
  ): Promise<RemoteExecutionResult> {
    const startTime = Date.now();
    const context = aiLogger.startRequest('ollama', 'remote_list_directory', { 
      host: config.targetHost,
      path: dirPath,
    });

    try {
      const encodedPath = encodeURIComponent(dirPath);
      const url = this.buildUrl(config, `/api/files/${encodedPath}?list=true`);
      
      const response = await this.fetchWithTimeout(
        url,
        {
          method: 'GET',
          headers: this.buildHeaders(config),
        },
        DEFAULT_TIMEOUT
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Directory listing failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const entries: RemoteDirectoryEntry[] = data.entries || [];
      
      aiLogger.endRequest(context, true, { 
        entriesCount: entries.length,
      });

      return {
        success: true,
        output: entries,
        executedOn: data.hostname || config.targetHost,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = this.formatError(error);
      aiLogger.logError(context, errorMessage);

      return {
        success: false,
        output: [],
        error: errorMessage,
        executedOn: config.targetHost,
        durationMs: Date.now() - startTime,
      };
    }
  }

  async searchRemoteCode(
    config: RemoteExecutionConfig,
    query: string,
    directory?: string,
    filePattern?: string
  ): Promise<RemoteExecutionResult> {
    const startTime = Date.now();
    const context = aiLogger.startRequest('ollama', 'remote_search_code', { 
      host: config.targetHost,
      query,
    });

    try {
      const grepCommand = this.buildGrepCommand(query, directory, filePattern);
      const result = await this.executeRemoteCommand(config, grepCommand, directory);
      
      if (!result.success) {
        throw new Error(result.error || 'Code search failed');
      }

      const matches = this.parseGrepOutput(result.output?.stdout || '');
      
      aiLogger.endRequest(context, true, { 
        matchesFound: matches.length,
      });

      return {
        success: true,
        output: matches,
        executedOn: result.executedOn,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = this.formatError(error);
      
      if (errorMessage.includes('exit code 1') || errorMessage.includes('no matches')) {
        aiLogger.endRequest(context, true, { matchesFound: 0 });
        return {
          success: true,
          output: [],
          executedOn: config.targetHost,
          durationMs: Date.now() - startTime,
        };
      }

      aiLogger.logError(context, errorMessage);

      return {
        success: false,
        output: [],
        error: errorMessage,
        executedOn: config.targetHost,
        durationMs: Date.now() - startTime,
      };
    }
  }

  async isRemoteAvailable(config: RemoteExecutionConfig): Promise<boolean> {
    const result = await this.checkRemoteHealth(config);
    return result.success;
  }

  async executeWithFallback(
    config: RemoteExecutionConfig | null,
    localExecutor: () => Promise<RemoteExecutionResult>,
    remoteOperation: (config: RemoteExecutionConfig) => Promise<RemoteExecutionResult>
  ): Promise<RemoteExecutionResult> {
    if (!config) {
      return localExecutor();
    }

    const isAvailable = await this.isRemoteAvailable(config);
    
    if (isAvailable) {
      return remoteOperation(config);
    }

    return localExecutor();
  }

  private buildGrepCommand(query: string, directory?: string, filePattern?: string): string {
    const escapedQuery = query.replace(/"/g, '\\"');
    const searchDir = directory || '.';
    const pattern = filePattern || '*.{ts,tsx,js,jsx,py,go,rs}';
    
    return `grep -rn --include="${pattern}" -C 3 "${escapedQuery}" "${searchDir}" | head -n 200`;
  }

  private parseGrepOutput(output: string): Array<{
    file: string;
    line: number;
    context: string;
  }> {
    if (!output.trim()) {
      return [];
    }

    return output.trim().split('\n--\n').filter(Boolean).map(block => {
      const lines = block.split('\n');
      const firstLine = lines[0] || '';
      const match = firstLine.match(/^(.+?):(\d+):/);
      
      return {
        file: match ? match[1] : 'unknown',
        line: match ? parseInt(match[2], 10) : 0,
        context: block,
      };
    });
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return 'Request timed out';
      }
      if (error.message.includes('ECONNREFUSED')) {
        return `Connection refused - agent not reachable`;
      }
      if (error.message.includes('ENOTFOUND')) {
        return `Host not found - check hostname`;
      }
      if (error.message.includes('ETIMEDOUT')) {
        return `Connection timed out - host unreachable`;
      }
      return error.message;
    }
    return 'Unknown error';
  }
}

export const remoteExecutor = new RemoteExecutor();
