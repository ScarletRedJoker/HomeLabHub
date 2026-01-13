/**
 * Embedding Generation Service
 * Supports Ollama (nomic-embed-text) and OpenAI (text-embedding-ada-002)
 */

import OpenAI from 'openai';

export interface EmbeddingOptions {
  model?: string;
  provider?: 'ollama' | 'openai' | 'auto';
}

export class EmbeddingService {
  private openaiClient: OpenAI | null = null;
  private ollamaUrl: string;
  private defaultModel: string;

  constructor(options?: { ollamaUrl?: string; openaiApiKey?: string }) {
    this.ollamaUrl = options?.ollamaUrl || process.env.OLLAMA_URL || 'http://localhost:11434';
    this.defaultModel = 'nomic-embed-text';

    // Initialize OpenAI client if API key is available
    const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    const directKey = process.env.OPENAI_API_KEY;
    const apiKey = options?.openaiApiKey || ((integrationKey && integrationKey.startsWith('sk-')) ? integrationKey : directKey);
    const projectId = process.env.OPENAI_PROJECT_ID;
    if (apiKey && apiKey.startsWith('sk-')) {
      this.openaiClient = new OpenAI({
        apiKey: apiKey.trim(),
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
        ...(projectId && { project: projectId.trim() }),
      });
    }
  }

  /**
   * Generate a single embedding for text
   */
  async generateEmbedding(text: string, options?: EmbeddingOptions): Promise<number[]> {
    const embeddings = await this.generateBatchEmbeddings([text], options);
    return embeddings[0];
  }

  /**
   * Generate embeddings for multiple texts
   */
  async generateBatchEmbeddings(texts: string[], options?: EmbeddingOptions): Promise<number[][]> {
    // Filter out empty texts
    const nonEmptyTexts = texts.filter((t) => t && t.trim().length > 0);
    if (nonEmptyTexts.length === 0) {
      return texts.map(() => []);
    }

    const provider = options?.provider === 'auto' ? await this.selectBestProvider() : options?.provider;

    if (provider === 'openai' && this.openaiClient) {
      return this.generateWithOpenAI(nonEmptyTexts, options?.model || 'text-embedding-ada-002');
    }

    // Default to Ollama
    return this.generateWithOllama(nonEmptyTexts, options?.model || this.defaultModel);
  }

  /**
   * Generate embeddings using OpenAI API
   */
  private async generateWithOpenAI(texts: string[], model: string): Promise<number[][]> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized. Provide OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_API_KEY');
    }

    try {
      const response = await this.openaiClient.embeddings.create({
        model,
        input: texts,
      });

      // Sort by index to maintain order
      const sorted = response.data.sort((a, b) => a.index - b.index);
      return sorted.map((item) => item.embedding);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`OpenAI embedding error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Generate embeddings using Ollama API
   */
  private async generateWithOllama(texts: string[], model: string): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (const text of texts) {
      try {
        const response = await fetch(`${this.ollamaUrl}/api/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            input: text,
          }),
        });

        if (!response.ok) {
          throw new Error(`Ollama HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        if (!data.embeddings || data.embeddings.length === 0) {
          throw new Error('Ollama returned empty embeddings');
        }

        embeddings.push(data.embeddings[0]);
      } catch (error) {
        console.error(`Failed to generate embedding for text: ${text.substring(0, 50)}...`, error);
        throw error;
      }
    }

    return embeddings;
  }

  /**
   * Check which embedding provider is available
   */
  private async selectBestProvider(): Promise<'ollama' | 'openai'> {
    // Try Ollama first if available
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.models?.some((m: any) => m.name.includes('embed'))) {
          return 'ollama';
        }
      }
    } catch {
      // Ollama not available
    }

    // Fall back to OpenAI
    if (this.openaiClient) {
      return 'openai';
    }

    throw new Error('No embedding provider available. Ensure Ollama is running or provide OPENAI_API_KEY');
  }

  /**
   * Check if Ollama is available
   */
  async isOllamaAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Check if OpenAI is available
   */
  isOpenAIAvailable(): boolean {
    return this.openaiClient !== null;
  }
}
