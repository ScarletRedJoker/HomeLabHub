/**
 * AI Service Control API
 * Remote start/stop/restart for AI services on Windows VM
 * Works with the Windows AI Supervisor and KVM Orchestrator
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';

const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || '100.118.44.102';
const AGENT_PORT = process.env.WINDOWS_AGENT_PORT || '9765';
const AGENT_TOKEN = process.env.KVM_AGENT_TOKEN;

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get('session');
  if (!session?.value) return null;
  return await verifySession(session.value);
}

if (!AGENT_TOKEN) {
  console.warn('[AI Control] KVM_AGENT_TOKEN not set - control API will be disabled');
}

interface ControlRequest {
  action: 'start' | 'stop' | 'restart' | 'status';
  service?: 'ollama' | 'stable_diffusion' | 'comfyui' | 'all';
}

async function callWindowsAgent(endpoint: string, method: 'GET' | 'POST' = 'POST'): Promise<unknown> {
  const url = `http://${WINDOWS_VM_IP}:${AGENT_PORT}${endpoint}`;
  
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AGENT_TOKEN}`,
      'Content-Length': '0',
    },
    signal: AbortSignal.timeout(30000),
  });
  
  if (!response.ok) {
    throw new Error(`Agent returned ${response.status}: ${await response.text()}`);
  }
  
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await checkAuth();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!AGENT_TOKEN) {
      return NextResponse.json({
        success: false,
        error: 'AI control API not configured',
        hint: 'Set KVM_AGENT_TOKEN environment variable to enable remote AI service control',
      }, { status: 503 });
    }
    
    const body: ControlRequest = await request.json();
    const { action, service = 'all' } = body;
    
    if (!['start', 'stop', 'restart', 'status'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Use: start, stop, restart, status' },
        { status: 400 }
      );
    }
    
    // Check if Windows VM is reachable
    try {
      await callWindowsAgent('/health', 'GET');
    } catch (error) {
      return NextResponse.json({
        success: false,
        error: 'Windows VM agent not reachable',
        details: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Ensure the Windows VM is running and the AI supervisor agent is active',
      }, { status: 503 });
    }
    
    // Execute action
    let result: unknown;
    
    switch (action) {
      case 'start':
        if (service === 'all') {
          result = await callWindowsAgent('/ai/start-all');
        } else {
          result = await callWindowsAgent(`/ai/start/${service}`);
        }
        break;
        
      case 'stop':
        if (service === 'all') {
          result = await callWindowsAgent('/ai/stop-all');
        } else {
          result = await callWindowsAgent(`/ai/stop/${service}`);
        }
        break;
        
      case 'restart':
        if (service === 'all') {
          result = await callWindowsAgent('/ai/restart-all');
        } else {
          result = await callWindowsAgent(`/ai/restart/${service}`);
        }
        break;
        
      case 'status':
        result = await callWindowsAgent('/health', 'GET');
        break;
    }
    
    return NextResponse.json({
      success: true,
      action,
      service,
      result,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('[AI Control] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function GET() {
  // Quick status check - read-only, no token required
  if (!AGENT_TOKEN) {
    return NextResponse.json({
      configured: false,
      reachable: false,
      vm_ip: WINDOWS_VM_IP,
      agent_port: AGENT_PORT,
      hint: 'KVM_AGENT_TOKEN not set - control API disabled',
    });
  }
  
  try {
    const health = await callWindowsAgent('/health', 'GET');
    
    return NextResponse.json({
      configured: true,
      reachable: true,
      health,
      vm_ip: WINDOWS_VM_IP,
      agent_port: AGENT_PORT,
    });
  } catch (error) {
    return NextResponse.json({
      configured: true,
      reachable: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      vm_ip: WINDOWS_VM_IP,
      agent_port: AGENT_PORT,
      hint: 'Windows VM may be offline or agent not running',
    }, { status: 503 });
  }
}
