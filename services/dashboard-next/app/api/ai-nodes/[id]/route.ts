import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || '100.118.44.102';
const AGENT_PORT = 9765;
const AGENT_TOKEN = process.env.NEBULA_AGENT_TOKEN;

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    if (id === 'windows' || id === 'gpu') {
      const [health, services, models] = await Promise.all([
        fetchAgent('/api/health').catch(() => null),
        fetchAgent('/api/services').catch(() => null),
        fetchAgent('/api/models').catch(() => null),
      ]);
      
      return NextResponse.json({
        id,
        name: 'Windows AI Node',
        ip: WINDOWS_VM_IP,
        status: health ? 'online' : 'offline',
        health,
        services,
        models: models?.summary || null,
        timestamp: new Date().toISOString(),
      });
    }
    
    return NextResponse.json({ error: 'Node not found' }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({
      id,
      name: 'Windows AI Node',
      ip: WINDOWS_VM_IP,
      status: 'offline',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}
