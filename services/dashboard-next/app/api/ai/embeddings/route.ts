/**
 * Embeddings API
 * GET /api/ai/embeddings - Get stats and list sources
 * POST /api/ai/embeddings - Manage embeddings (add, search, chunk, delete)
 * DELETE /api/ai/embeddings/[id] - Delete a source
 */

import { NextRequest, NextResponse } from 'next/server';
import { EmbeddingService, TextChunker, getKnowledgeRetriever } from '@/lib/rag';

const embeddingService = new EmbeddingService();
const chunker = new TextChunker();

function getRetriever() {
  return getKnowledgeRetriever();
}

interface EmbeddingRequest {
  text: string | string[];
  model?: 'nomic-embed-text' | 'text-embedding-ada-002';
}

interface SearchRequest {
  query: string;
  topK?: number;
  sourceId?: string;
}

interface AddSourceRequest {
  name: string;
  type: 'document' | 'url' | 'text';
  content: string;
  chunkSize?: number;
  overlap?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (body.action === 'add_source') {
      const { name, type, content, chunkSize = 512, overlap = 50 } = body as AddSourceRequest;
      
      if (!name || !content) {
        return NextResponse.json(
          { error: 'Name and content are required' },
          { status: 400 }
        );
      }
      
      const sourceId = `src_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      console.log(`[Embeddings API] Adding source: ${name} (${type})`);
      
      await getRetriever().addDocument(sourceId, content, { name, type }, { chunkSize, overlap });
      
      const source = getRetriever().getSource(sourceId);
      
      return NextResponse.json({
        success: true,
        source,
        message: `Source "${name}" added successfully`,
      });
    }
    
    if (body.action === 'delete_source') {
      const { sourceId } = body;
      
      if (!sourceId) {
        return NextResponse.json(
          { error: 'Source ID is required' },
          { status: 400 }
        );
      }
      
      console.log(`[Embeddings API] Deleting source: ${sourceId}`);
      
      const removedCount = getRetriever().removeDocument(sourceId);
      
      return NextResponse.json({
        success: true,
        removedChunks: removedCount,
        message: `Source deleted, ${removedCount} chunks removed`,
      });
    }
    
    if (body.action === 'embed') {
      const { text, model } = body as EmbeddingRequest;
      
      if (!text) {
        return NextResponse.json(
          { error: 'Text is required' },
          { status: 400 }
        );
      }
      
      console.log(`[Embeddings API] Generating embeddings for ${Array.isArray(text) ? text.length + ' texts' : '1 text'}`);
      
      if (Array.isArray(text)) {
        const embeddings = await embeddingService.generateBatchEmbeddings(text, { model });
        return NextResponse.json({
          success: true,
          embeddings,
          count: embeddings.length,
          dimensions: embeddings[0]?.length || 0,
        });
      } else {
        const embedding = await embeddingService.generateEmbedding(text, { model });
        return NextResponse.json({
          success: true,
          embedding,
          dimensions: embedding.length,
        });
      }
    }
    
    if (body.action === 'search') {
      const { query, topK = 5 } = body as SearchRequest;
      
      if (!query) {
        return NextResponse.json(
          { error: 'Search query is required' },
          { status: 400 }
        );
      }
      
      console.log(`[Embeddings API] Searching for "${query.substring(0, 50)}..."`);
      
      const results = await getRetriever().search(query, topK);
      
      return NextResponse.json({
        success: true,
        results,
        query,
        count: results.length,
      });
    }
    
    if (body.action === 'chunk') {
      const { text, chunkSize = 512, overlap = 50 } = body;
      
      if (!text) {
        return NextResponse.json(
          { error: 'Text is required' },
          { status: 400 }
        );
      }
      
      const chunks = chunker.chunkText(text, { chunkSize, overlap });
      
      return NextResponse.json({
        success: true,
        chunks,
        count: chunks.length,
      });
    }
    
    return NextResponse.json(
      { error: 'Invalid action. Use: add_source, delete_source, embed, search, chunk' },
      { status: 400 }
    );
    
  } catch (error) {
    console.error('[Embeddings API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Embedding operation failed',
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    const stats = getRetriever().getStats();
    const sources = getRetriever().getSources();
    
    return NextResponse.json({
      success: true,
      stats,
      sources,
      models: ['nomic-embed-text', 'text-embedding-ada-002'],
      description: 'Embeddings API for semantic search and RAG',
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get stats',
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceId = searchParams.get('id');
    
    if (!sourceId) {
      return NextResponse.json(
        { error: 'Source ID is required' },
        { status: 400 }
      );
    }
    
    console.log(`[Embeddings API] Deleting source: ${sourceId}`);
    
    const removedCount = getRetriever().removeDocument(sourceId);
    
    return NextResponse.json({
      success: true,
      removedChunks: removedCount,
      message: `Source deleted, ${removedCount} chunks removed`,
    });
    
  } catch (error) {
    console.error('[Embeddings API] Delete error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete source',
    }, { status: 500 });
  }
}
