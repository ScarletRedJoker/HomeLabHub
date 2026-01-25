import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { 
  codeAgent, 
  type CodeGenRequest, 
  type CodeGenResponse, 
  type StreamingCodeGenChunk 
} from '@/lib/ai/agents/code-agent';
import { createSSEHeaders, formatSSEMessage, formatSSEDone, formatSSEError } from '@/lib/ai/streaming';

const CodeGenRequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(10000, 'Prompt too long'),
  type: z.enum(['component', 'api-route', 'docker-compose', 'script']),
  framework: z.enum(['nextjs', 'react', 'express']).optional(),
  styling: z.enum(['tailwind', 'css-modules', 'styled-components']).optional(),
  includeTests: z.boolean().optional().default(false),
  stream: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = CodeGenRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { stream, ...codeGenRequest } = parsed.data;

    if (stream) {
      return streamResponse(codeGenRequest);
    }

    return nonStreamResponse(codeGenRequest);
  } catch (error: any) {
    console.error('[CodeGen API] Error:', error);
    return NextResponse.json(
      { error: 'Code generation failed', message: error.message },
      { status: 500 }
    );
  }
}

async function nonStreamResponse(request: CodeGenRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    const response = await codeAgent.generate(request);
    
    return NextResponse.json({
      success: true,
      data: response,
      metadata: {
        ...response.metadata,
        requestType: request.type,
        framework: request.framework,
        includeTests: request.includeTests,
        totalLatency: Date.now() - startTime,
      },
    });
  } catch (error: any) {
    throw error;
  }
}

function streamResponse(request: CodeGenRequest): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const generator = codeAgent.generateStream(request);
        
        for await (const chunk of generator) {
          const sseData = formatSSEChunk(chunk);
          controller.enqueue(encoder.encode(sseData));
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
  });

  return new Response(stream, {
    headers: createSSEHeaders(),
  });
}

function formatSSEChunk(chunk: StreamingCodeGenChunk): string {
  return formatSSEMessage({
    content: chunk.content,
    done: chunk.type === 'complete',
    ...(chunk.type === 'file' && { file: chunk.file }),
    ...(chunk.type === 'complete' && { 
      response: chunk.response,
      provider: chunk.metadata?.provider,
    }),
    ...(chunk.type === 'error' && { error: chunk.error }),
  });
}

export async function GET() {
  return NextResponse.json({
    name: 'AI Code Generation Agent',
    version: '1.0.0',
    description: 'Generate production-ready code from natural language prompts',
    endpoints: {
      POST: {
        description: 'Generate code based on prompt',
        body: {
          prompt: 'string (required) - Natural language description of the code to generate',
          type: "'component' | 'api-route' | 'docker-compose' | 'script' (required)",
          framework: "'nextjs' | 'react' | 'express' (optional)",
          styling: "'tailwind' | 'css-modules' | 'styled-components' (optional, for components)",
          includeTests: 'boolean (optional, default: false) - Generate unit tests',
          stream: 'boolean (optional, default: false) - Stream the response',
        },
        response: {
          files: 'Array<{ path: string, content: string, language: string }>',
          instructions: 'string - Setup instructions',
          dependencies: 'string[] (optional) - Required npm packages',
          warnings: 'string[] (optional) - Validation warnings',
          metadata: '{ provider: string, latency: number, tokensUsed: number }',
        },
      },
    },
    supportedTypes: {
      component: 'React/Next.js components with TypeScript, styling, and accessibility',
      'api-route': 'Next.js API routes with Zod validation and Drizzle ORM',
      'docker-compose': 'Docker Compose configurations with healthchecks and volumes',
      script: 'Node.js or Python scripts with proper error handling',
    },
  });
}
