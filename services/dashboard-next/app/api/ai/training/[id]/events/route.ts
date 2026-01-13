/**
 * Training Run Events SSE API
 * GET /api/ai/training/[id]/events - Server-Sent Events stream for training progress
 */

import { NextRequest } from 'next/server';
import { getTrainingEventBus } from '@/lib/training';

const trainingEventBus = getTrainingEventBus();

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id: runId } = await params;
  
  if (!runId) {
    return new Response('Run ID required', { status: 400 });
  }
  
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    start(controller) {
      console.log(`[Training Events] SSE connection opened for run ${runId}`);
      
      const unsubscribe = trainingEventBus.subscribe(runId, (event) => {
        const data = JSON.stringify({
          type: event.eventType,
          payload: event.payload,
          timestamp: event.createdAt.toISOString(),
        });
        
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      });
      
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(pingInterval);
        }
      }, 30000);
      
      request.signal.addEventListener('abort', () => {
        console.log(`[Training Events] SSE connection closed for run ${runId}`);
        clearInterval(pingInterval);
        unsubscribe();
        controller.close();
      });
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
