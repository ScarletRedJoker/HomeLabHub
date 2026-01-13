/**
 * Knowledge Retriever
 * Semantic search and document indexing for RAG
 */

import { EmbeddingService, EmbeddingOptions } from './embeddings';
import { TextChunker, ChunkOptions, TextChunk } from './chunker';

export interface RetrievalResult {
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
  sourceId?: string;
  chunkIndex?: number;
}

export interface IndexedChunk extends TextChunk {
  embedding: number[];
  sourceId: string;
  metadata?: Record<string, unknown>;
}

export interface SourceInfo {
  id: string;
  name: string;
  type: 'document' | 'url' | 'text';
  chunkCount: number;
  status: 'indexed' | 'processing' | 'error';
  createdAt: string;
}

let retrieverInstance: KnowledgeRetriever | null = null;

export function getKnowledgeRetriever(options?: { ollamaUrl?: string; openaiApiKey?: string; embeddingOptions?: EmbeddingOptions }): KnowledgeRetriever {
  if (!retrieverInstance) {
    retrieverInstance = new KnowledgeRetriever(options);
  }
  return retrieverInstance;
}

export function resetKnowledgeRetriever(): void {
  retrieverInstance = null;
}

export class KnowledgeRetriever {
  private embeddingService: EmbeddingService;
  private textChunker: TextChunker;
  private indexedChunks: IndexedChunk[] = [];
  private embeddingOptions?: EmbeddingOptions;
  private sourceRegistry: Map<string, SourceInfo> = new Map();

  constructor(options?: { ollamaUrl?: string; openaiApiKey?: string; embeddingOptions?: EmbeddingOptions }) {
    this.embeddingService = new EmbeddingService({
      ollamaUrl: options?.ollamaUrl,
      openaiApiKey: options?.openaiApiKey,
    });
    this.textChunker = new TextChunker();
    this.embeddingOptions = options?.embeddingOptions;
  }

  /**
   * Add a document to the knowledge base
   * Automatically chunks and embeds the text
   */
  async addDocument(
    sourceId: string,
    text: string,
    metadata?: Record<string, unknown>,
    chunkOptions?: ChunkOptions,
  ): Promise<void> {
    const sourceName = (metadata?.name as string) || sourceId;
    const sourceType = (metadata?.type as 'document' | 'url' | 'text') || 'text';
    
    this.sourceRegistry.set(sourceId, {
      id: sourceId,
      name: sourceName,
      type: sourceType,
      chunkCount: 0,
      status: 'processing',
      createdAt: new Date().toISOString(),
    });

    try {
      const chunks = this.textChunker.chunkText(text, chunkOptions);

      if (chunks.length === 0) {
        console.warn(`No chunks generated for document ${sourceId}`);
        this.sourceRegistry.set(sourceId, {
          ...this.sourceRegistry.get(sourceId)!,
          status: 'error',
        });
        return;
      }

      const chunkTexts = chunks.map((c) => c.text);
      const embeddings = await this.embeddingService.generateBatchEmbeddings(chunkTexts, this.embeddingOptions);

      for (let i = 0; i < chunks.length; i++) {
        this.indexedChunks.push({
          ...chunks[i],
          embedding: embeddings[i],
          sourceId,
          metadata,
        });
      }
      
      this.sourceRegistry.set(sourceId, {
        ...this.sourceRegistry.get(sourceId)!,
        chunkCount: chunks.length,
        status: 'indexed',
      });
    } catch (error) {
      this.sourceRegistry.set(sourceId, {
        ...this.sourceRegistry.get(sourceId)!,
        status: 'error',
      });
      throw error;
    }
  }

  /**
   * Add multiple documents in batch
   */
  async addDocuments(
    documents: Array<{
      sourceId: string;
      text: string;
      metadata?: Record<string, unknown>;
    }>,
    chunkOptions?: ChunkOptions,
  ): Promise<void> {
    for (const doc of documents) {
      await this.addDocument(doc.sourceId, doc.text, doc.metadata, chunkOptions);
    }
  }

  /**
   * Search for similar chunks using cosine similarity
   */
  async search(query: string, topK: number = 5): Promise<RetrievalResult[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    if (this.indexedChunks.length === 0) {
      console.warn('No indexed chunks available for search');
      return [];
    }

    // Generate embedding for query
    const queryEmbedding = await this.embeddingService.generateEmbedding(query, this.embeddingOptions);

    // Validate query embedding
    if (!queryEmbedding || queryEmbedding.length === 0) {
      throw new Error('Failed to generate query embedding');
    }

    // Calculate similarity scores
    const results: RetrievalResult[] = this.indexedChunks
      .map((chunk) => ({
        text: chunk.text,
        score: this.cosineSimilarity(queryEmbedding, chunk.embedding),
        metadata: chunk.metadata,
        sourceId: chunk.sourceId,
        chunkIndex: chunk.index,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return results;
  }

  /**
   * Search by source ID only
   */
  searchBySource(sourceId: string): RetrievalResult[] {
    return this.indexedChunks
      .filter((chunk) => chunk.sourceId === sourceId)
      .map((chunk) => ({
        text: chunk.text,
        score: 1.0,
        metadata: chunk.metadata,
        sourceId: chunk.sourceId,
        chunkIndex: chunk.index,
      }))
      .sort((a, b) => (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0));
  }

  /**
   * Remove a document from the knowledge base
   */
  removeDocument(sourceId: string): number {
    const initialLength = this.indexedChunks.length;
    this.indexedChunks = this.indexedChunks.filter((chunk) => chunk.sourceId !== sourceId);
    this.sourceRegistry.delete(sourceId);
    return initialLength - this.indexedChunks.length;
  }

  /**
   * Get all registered sources
   */
  getSources(): SourceInfo[] {
    return Array.from(this.sourceRegistry.values());
  }

  /**
   * Get a single source by ID
   */
  getSource(sourceId: string): SourceInfo | undefined {
    return this.sourceRegistry.get(sourceId);
  }

  /**
   * Clear all indexed chunks
   */
  clear(): void {
    this.indexedChunks = [];
    this.sourceRegistry.clear();
  }

  /**
   * Get retriever statistics
   */
  getStats(): {
    totalChunks: number;
    uniqueSources: number;
    embeddingDimension: number;
  } {
    const uniqueSources = new Set(this.indexedChunks.map((c) => c.sourceId));
    const embeddingDimension = this.indexedChunks[0]?.embedding?.length ?? 0;

    return {
      totalChunks: this.indexedChunks.length,
      uniqueSources: uniqueSources.size,
      embeddingDimension,
    };
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    if (a.length === 0) {
      return 0;
    }

    // Calculate dot product
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Batch search multiple queries
   */
  async batchSearch(queries: string[], topK: number = 5): Promise<Map<string, RetrievalResult[]>> {
    const results = new Map<string, RetrievalResult[]>();

    for (const query of queries) {
      results.set(query, await this.search(query, topK));
    }

    return results;
  }

  /**
   * Re-rank results using a custom scoring function
   */
  reRank(
    results: RetrievalResult[],
    scoringFn: (result: RetrievalResult, index: number) => number,
  ): RetrievalResult[] {
    return results
      .map((result, index) => ({
        ...result,
        score: scoringFn(result, index),
      }))
      .sort((a, b) => b.score - a.score);
  }
}
