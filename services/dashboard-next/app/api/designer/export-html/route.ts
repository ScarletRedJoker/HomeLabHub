import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateStaticHtml } from '@/lib/designer/ai-generator';

const ExportSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1).default('Component'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ExportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { code, name } = parsed.data;
    const html = generateStaticHtml(code, name);

    return NextResponse.json({ 
      success: true, 
      html,
      filename: `${name}.html`
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Export failed', message: error.message },
      { status: 500 }
    );
  }
}
