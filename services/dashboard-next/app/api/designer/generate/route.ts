import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { aiGenerator, type ComponentType } from '@/lib/designer/ai-generator';
import { createSSEHeaders, formatSSEMessage, formatSSEDone, formatSSEError } from '@/lib/ai/streaming';

const GenerateSchema = z.object({
  prompt: z.string().min(1).max(5000),
  type: z.enum(['hero', 'pricing', 'features', 'contact', 'testimonials', 'navbar', 'footer', 'cta', 'gallery', 'stats', 'custom']).default('custom'),
  stream: z.boolean().default(false),
  presetId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = GenerateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    let { prompt, type, stream, presetId } = parsed.data;

    if (presetId) {
      const preset = aiGenerator.getPresetById(presetId);
      if (preset) {
        prompt = preset.prompt;
        type = preset.type;
      }
    }

    if (stream) {
      return streamResponse(prompt, type as ComponentType);
    }

    const component = await aiGenerator.generate(prompt, type as ComponentType);

    return NextResponse.json({
      success: true,
      component,
    });
  } catch (error: any) {
    console.error('[Designer API] Error:', error);
    return NextResponse.json(
      { error: 'Generation failed', message: error.message },
      { status: 500 }
    );
  }
}

function streamResponse(prompt: string, type: ComponentType): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const generator = aiGenerator.generateStream(prompt, type);

        for await (const chunk of generator) {
          const data = formatSSEMessage({
            content: chunk.content,
            done: chunk.done,
            component: chunk.component,
          });
          controller.enqueue(encoder.encode(data));
        }

        controller.enqueue(encoder.encode(formatSSEDone()));
        controller.close();
      } catch (error: any) {
        controller.enqueue(encoder.encode(formatSSEError('Stream error', error.message)));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: createSSEHeaders(),
  });
}

export async function GET() {
  return NextResponse.json({
    name: 'AI Component Designer',
    version: '1.0.0',
    presets: aiGenerator.presets.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      description: p.description,
    })),
    types: ['hero', 'pricing', 'features', 'contact', 'testimonials', 'navbar', 'footer', 'cta', 'gallery', 'stats', 'custom'],
  });
}
