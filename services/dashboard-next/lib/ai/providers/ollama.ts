import type {
  AIProvider,
  ChatRequest,
  ChatResponse,
  StreamingChunk,
  EmbeddingRequest,
  EmbeddingResponse,
  ProviderHealthStatus,
} from '../types';

const DEFAULT_OLLAMA_URL = 'http://100.118.44.102:11434';
const TIMEOUT_MS = 60000;

export class OllamaProvider {
  private baseURL: string;
  private healthStatus: ProviderHealthStatus;

  constructor(baseURL?: string) {
    this.baseURL = baseURL || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_URL;
    this.healthStatus = {
      available: false,
      lastCheck: new Date(0),
      consecutiveFailures: 0,
    };
  }

  getProviderInfo(): AIProvider {
    return {
      name: 'ollama',
      baseURL: this.baseURL,
      available: this.healthStatus.available,
      priority: 1,
      supports: {
        chat: true,
        streaming: true,
        images: false,
        embeddings: true,
      },
    };
  }

  async healthCheck(): Promise<ProviderHealthStatus> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.baseURL}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const latencyMs = Date.now() - start;

      if (response.ok) {
        this.healthStatus = {
          available: true,
          lastCheck: new Date(),
          consecutiveFailures: 0,
          latencyMs,
        };
      } else {
        this.healthStatus.consecutiveFailures++;
        this.healthStatus.available = this.healthStatus.consecutiveFailures < 3;
        this.healthStatus.lastCheck = new Date();
        this.healthStatus.error = `HTTP ${response.status}`;
      }
    } catch (error: any) {
      this.healthStatus.consecutiveFailures++;
      this.healthStatus.available = false;
      this.healthStatus.lastCheck = new Date();
      this.healthStatus.error = error.message;
      this.healthStatus.latencyMs = Date.now() - start;
    }

    return this.healthStatus;
  }

  getHealthStatus(): ProviderHealthStatus {
    return { ...this.healthStatus };
  }

  isAvailable(): boolean {
    return this.healthStatus.available;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const start = Date.now();
    const model = request.model || process.env.OLLAMA_DEFAULT_MODEL || 'qwen2.5:latest';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseURL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: request.messages,
          stream: false,
          options: {
            temperature: request.temperature ?? 0.7,
            num_predict: request.maxTokens ?? 2000,
          },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Ollama chat error: HTTP ${response.status}`);
      }

      const data = await response.json();
      const latency = Date.now() - start;

      return {
        content: data.message?.content || '',
        provider: 'ollama',
        model,
        latency,
        tokensUsed: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        usage: {
          promptTokens: data.prompt_eval_count || 0,
          completionTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
      };
    } catch (error: any) {
      clearTimeout(timeout);
      throw new Error(`Ollama chat failed: ${error.message}`);
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<StreamingChunk> {
    const model = request.model || process.env.OLLAMA_DEFAULT_MODEL || 'qwen2.5:latest';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseURL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: request.messages,
          stream: true,
          options: {
            temperature: request.temperature ?? 0.7,
            num_predict: request.maxTokens ?? 2000,
          },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Ollama stream error: HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            yield {
              content: data.message?.content || '',
              done: data.done || false,
              provider: 'ollama',
              model,
            };
          } catch {
            continue;
          }
        }
      }

      yield { content: '', done: true, provider: 'ollama', model };
    } catch (error: any) {
      clearTimeout(timeout);
      throw new Error(`Ollama stream failed: ${error.message}`);
    }
  }

  async embeddings(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const start = Date.now();
    const model = request.model || 'nomic-embed-text';
    const inputs = Array.isArray(request.input) ? request.input : [request.input];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const embeddings: number[][] = [];

      for (const input of inputs) {
        const response = await fetch(`${this.baseURL}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt: input }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Ollama embeddings error: HTTP ${response.status}`);
        }

        const data = await response.json();
        embeddings.push(data.embedding);
      }

      clearTimeout(timeout);

      return {
        embeddings,
        provider: 'ollama',
        model,
        latency: Date.now() - start,
      };
    } catch (error: any) {
      clearTimeout(timeout);
      throw new Error(`Ollama embeddings failed: ${error.message}`);
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseURL}/api/tags`);
      if (!response.ok) return [];
      const data = await response.json();
      return (data.models || []).map((m: any) => m.name);
    } catch {
      return [];
    }
  }
}

export const ollamaProvider = new OllamaProvider();
