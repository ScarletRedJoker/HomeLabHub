import type { ChatMessage, StreamingChunk, AIProviderName } from './types';

export interface SSEChunk {
  content?: string;
  provider?: AIProviderName;
  model?: string;
  done?: boolean;
  error?: string;
  toolExecuting?: boolean;
  toolResult?: {
    tool: string;
    success: boolean;
    result: string;
  };
}

export interface StreamOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export function createSSEHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}

export function formatSSEMessage(data: SSEChunk): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export function formatSSEDone(): string {
  return 'data: [DONE]\n\n';
}

export function formatSSEError(error: string, details?: string): string {
  return `data: ${JSON.stringify({ error, details })}\n\n`;
}

export function createSSEStream(
  generator: AsyncGenerator<SSEChunk, void, unknown>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          controller.enqueue(encoder.encode(formatSSEMessage(chunk)));
        }
        controller.enqueue(encoder.encode(formatSSEDone()));
        controller.close();
      } catch (error: any) {
        controller.enqueue(
          encoder.encode(formatSSEError('Stream error', error.message))
        );
        controller.close();
      }
    },
    cancel() {
      generator.return(undefined);
    },
  });
}

export interface OllamaNDJSONChunk {
  model: string;
  created_at: string;
  message?: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
}

export function parseOllamaNDJSON(line: string): OllamaNDJSONChunk | null {
  if (!line.trim()) return null;
  
  try {
    return JSON.parse(line) as OllamaNDJSONChunk;
  } catch {
    console.warn('[Streaming] Failed to parse NDJSON line:', line);
    return null;
  }
}

export async function* parseOllamaStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  model: string = 'unknown'
): AsyncGenerator<StreamingChunk> {
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      
      if (done) {
        if (buffer.trim()) {
          const chunk = parseOllamaNDJSON(buffer);
          if (chunk?.message?.content) {
            yield {
              content: chunk.message.content,
              done: chunk.done,
              provider: 'ollama',
              model: chunk.model || model,
            };
          }
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const chunk = parseOllamaNDJSON(line);
        if (chunk?.message?.content) {
          yield {
            content: chunk.message.content,
            done: chunk.done,
            provider: 'ollama',
            model: chunk.model || model,
          };
        }
        if (chunk?.done) {
          yield {
            content: '',
            done: true,
            provider: 'ollama',
            model: chunk.model || model,
          };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<SSEChunk> {
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          
          if (data === '[DONE]') {
            yield { done: true };
            return;
          }

          try {
            const parsed = JSON.parse(data) as SSEChunk;
            yield parsed;
          } catch {
            console.warn('[Streaming] Failed to parse SSE data:', data);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export class StreamingError extends Error {
  public readonly isRetryable: boolean;
  public readonly statusCode?: number;

  constructor(message: string, isRetryable = true, statusCode?: number) {
    super(message);
    this.name = 'StreamingError';
    this.isRetryable = isRetryable;
    this.statusCode = statusCode;
  }
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<Response> {
  let lastError: Error | null = null;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const isRetryable = response.status >= 500 || response.status === 429;
        throw new StreamingError(
          `HTTP ${response.status}: ${response.statusText}`,
          isRetryable,
          response.status
        );
      }
      
      return response;
    } catch (error: any) {
      lastError = error;
      
      const isRetryable = 
        error instanceof StreamingError ? error.isRetryable :
        error.name === 'AbortError' ? false :
        error.name === 'TypeError' ? true : 
        true;

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      console.log(`[Streaming] Retry ${attempt + 1}/${maxRetries}: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 8000);
    }
  }

  throw lastError || new Error('Fetch failed after retries');
}

export function createAbortController(timeoutMs?: number): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | undefined;

  if (timeoutMs) {
    timeoutId = setTimeout(() => {
      controller.abort(new Error(`Request timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  }

  return {
    controller,
    cleanup: () => {
      if (timeoutId) clearTimeout(timeoutId);
    },
  };
}
