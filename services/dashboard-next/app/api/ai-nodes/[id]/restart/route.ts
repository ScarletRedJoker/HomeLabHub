import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || '100.118.44.102';
const AGENT_PORT = 9765;
const AGENT_TOKEN = process.env.NEBULA_AGENT_TOKEN;

const RestartSchema = z.object({
  service: z.enum(['Ollama', 'StableDiffusion', 'ComfyUI', 'all']),
});

async function fetchAgent(path: string, options: RequestInit = {}) {
  const url = `http://${WINDOWS_VM_IP}:${AGENT_PORT}${path}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (AGENT_TOKEN) {
    headers['Authorization'] = `Bearer ${AGENT_TOKEN}`;
  }
  
  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Agent request failed: ${response.status} - ${error}`);
  }
  
  return response.json();
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  if (id !== 'windows' && id !== 'gpu') {
    return NextResponse.json({ error: 'Node not found' }, { status: 404 });
  }
  
  try {
    const body = await request.json();
    const parsed = RestartSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    
    const { service } = parsed.data;
    
    if (service === 'all') {
      const services = ['Ollama', 'StableDiffusion', 'ComfyUI'];
      const results = await Promise.all(
        services.map(s => 
          fetchAgent(`/api/services/${s}/restart`, { method: 'POST' })
            .catch(err => ({ success: false, error: err.message, service: s }))
        )
      );
      
      return NextResponse.json({
        success: true,
        message: 'All services restart initiated',
        results,
        timestamp: new Date().toISOString(),
      });
    }
    
    const result = await fetchAgent(`/api/services/${service}/restart`, { method: 'POST' });
    
    return NextResponse.json({
      success: true,
      message: `${service} restart initiated`,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to restart service', message: error.message },
      { status: 500 }
    );
  }
}
