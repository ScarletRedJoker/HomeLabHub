import OpenAI from 'openai';
import type {
  AIProvider,
  ChatRequest,
  ChatResponse,
  StreamingChunk,
  ProviderHealthStatus,
} from '../types';

const TIMEOUT_MS = 30000;

export class OpenAIProvider {
  private client: OpenAI | null = null;
  private healthStatus: ProviderHealthStatus;

  constructor() {
    this.healthStatus = {
      available: false,
      lastCheck: new Date(0),
      consecutiveFailures: 0,
    };
    this.initClient();
  }

  private initClient(): void {
    const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    const directKey = process.env.OPENAI_API_KEY;
    const apiKey = integrationKey?.startsWith('sk-') ? integrationKey : directKey;

    if (apiKey?.startsWith('sk-')) {
      this.client = new OpenAI({
        apiKey,
        timeout: TIMEOUT_MS,
      });
      this.healthStatus.available = true;
    }
  }

  getProviderInfo(): AIProvider {
    return {
      name: 'openai',
      baseURL: 'https://api.openai.com',
      available: this.healthStatus.available && this.client !== null,
      priority: 2,
      supports: {
        chat: true,
        streaming: true,
        images: true,
        embeddings: true,
      },
    };
  }

  async healthCheck(): Promise<ProviderHealthStatus> {
    if (!this.client) {
      this.initClient();
    }

    if (!this.client) {
      this.healthStatus = {
        available: false,
        lastCheck: new Date(),
        consecutiveFailures: this.healthStatus.consecutiveFailures + 1,
        error: 'No API key configured',
      };
      return this.healthStatus;
    }

    try {
      const start = Date.now();
      await this.client.models.list();
      
      this.healthStatus = {
        available: true,
        lastCheck: new Date(),
        consecutiveFailures: 0,
        latencyMs: Date.now() - start,
      };
    } catch (error: any) {
      this.healthStatus.consecutiveFailures++;
      this.healthStatus.available = this.healthStatus.consecutiveFailures < 3;
      this.healthStatus.lastCheck = new Date();
      this.healthStatus.error = error.message;
    }

    return this.healthStatus;
  }

  getHealthStatus(): ProviderHealthStatus {
    return { ...this.healthStatus };
  }

  isAvailable(): boolean {
    return this.healthStatus.available && this.client !== null;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const start = Date.now();
    const model = request.model || 'gpt-4o-mini';

    try {
      const response = await this.client.chat.completions.create({
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2000,
      });

      const latency = Date.now() - start;
      const content = response.choices[0]?.message?.content || '';

      return {
        content,
        provider: 'openai',
        model,
        latency,
        tokensUsed: response.usage?.total_tokens || 0,
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
      };
    } catch (error: any) {
      throw new Error(`OpenAI chat failed: ${error.message}`);
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<StreamingChunk> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const model = request.model || 'gpt-4o-mini';

    try {
      const stream = await this.client.chat.completions.create({
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2000,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        const done = chunk.choices[0]?.finish_reason !== null;
        
        yield {
          content,
          done,
          provider: 'openai',
          model,
        };
      }
    } catch (error: any) {
      throw new Error(`OpenAI stream failed: ${error.message}`);
    }
  }

  async generateImage(prompt: string, size: '1024x1024' | '1792x1024' | '1024x1792' = '1024x1024'): Promise<{
    url: string;
    revisedPrompt?: string;
    latency: number;
  }> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const start = Date.now();

    try {
      const response = await this.client.images.generate({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size,
      });

      const imageData = response.data?.[0];
      return {
        url: imageData?.url || '',
        revisedPrompt: imageData?.revised_prompt,
        latency: Date.now() - start,
      };
    } catch (error: any) {
      throw new Error(`OpenAI image generation failed: ${error.message}`);
    }
  }

  async embeddings(input: string | string[]): Promise<{
    embeddings: number[][];
    latency: number;
  }> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const start = Date.now();

    try {
      const response = await this.client.embeddings.create({
        model: 'text-embedding-3-small',
        input,
      });

      return {
        embeddings: response.data.map(d => d.embedding),
        latency: Date.now() - start,
      };
    } catch (error: any) {
      throw new Error(`OpenAI embeddings failed: ${error.message}`);
    }
  }
}

export const openaiProvider = new OpenAIProvider();
