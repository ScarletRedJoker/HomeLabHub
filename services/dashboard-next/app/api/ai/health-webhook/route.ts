/**
 * AI Health Webhook Endpoint
 * Receives health reports from Windows VM AI daemon
 * Updates node registry and state file
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

interface HealthReport {
  timestamp: string;
  hostname: string;
  node_type?: string;
  tailscale_ip?: string;
  services: {
    [key: string]: {
      name: string;
      status: string;
      port: number;
      url: string;
      latency_ms?: number;
      details?: Record<string, unknown>;
      error?: string;
    };
  };
  gpu?: {
    name?: string;
    memory_used_mb?: number;
    memory_total_mb?: number;
    utilization_percent?: number;
    temperature_c?: number;
    status?: string;
    error?: string;
  };
  system?: {
    cpu_percent?: number;
    memory_used_gb?: number;
    memory_total_gb?: number;
    uptime_hours?: number;
  };
  health?: {
    status: string;
    services_online: number;
    services_total: number;
  };
}

const STATE_FILE_PATH = process.env.LOCAL_AI_STATE_FILE || '/opt/homelab/HomeLabHub/deploy/shared/state/local-ai.json';

// In-memory cache for quick status checks
let lastReport: HealthReport | null = null;
let lastReportTime: Date | null = null;

export async function POST(request: NextRequest) {
  try {
    const report: HealthReport = await request.json();
    
    // Validate report structure
    if (!report.timestamp || !report.services) {
      return NextResponse.json(
        { error: 'Invalid report: missing timestamp or services' },
        { status: 400 }
      );
    }
    
    // Store in memory cache
    lastReport = report;
    lastReportTime = new Date();
    
    // Convert to state file format
    const stateData = convertToStateFormat(report);
    
    // Write state file (for AI orchestrator to read)
    try {
      const stateDir = dirname(STATE_FILE_PATH);
      if (!existsSync(stateDir)) {
        mkdirSync(stateDir, { recursive: true });
      }
      writeFileSync(STATE_FILE_PATH, JSON.stringify(stateData, null, 2));
    } catch (writeError) {
      console.warn('[Health Webhook] Could not write state file:', writeError);
      // Don't fail the request, state file is optional enhancement
    }
    
    // Log summary
    const onlineServices = Object.values(report.services).filter(s => s.status === 'online').length;
    console.log(
      `[Health Webhook] ${report.hostname}: ${onlineServices}/${Object.keys(report.services).length} services online`,
      report.gpu?.memory_used_mb ? `| GPU: ${report.gpu.memory_used_mb}MB` : ''
    );
    
    return NextResponse.json({
      success: true,
      received: report.timestamp,
      processed: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Health Webhook] Error processing report:', error);
    return NextResponse.json(
      { error: 'Failed to process health report' },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Return current cached health status
  if (!lastReport || !lastReportTime) {
    return NextResponse.json({
      status: 'no_data',
      message: 'No health reports received yet',
    });
  }
  
  const ageSeconds = Math.floor((Date.now() - lastReportTime.getTime()) / 1000);
  const isStale = ageSeconds > 120; // 2 minutes
  
  return NextResponse.json({
    status: isStale ? 'stale' : 'current',
    age_seconds: ageSeconds,
    report: lastReport,
    received_at: lastReportTime.toISOString(),
  });
}

function convertToStateFormat(report: HealthReport) {
  const windowsVmIp = report.tailscale_ip || '100.118.44.102';
  
  return {
    timestamp: report.timestamp,
    windows_vm: {
      ip: windowsVmIp,
      reachable: true,
      hostname: report.hostname,
      ollama: {
        status: report.services.ollama?.status || 'offline',
        url: report.services.ollama?.url || `http://${windowsVmIp}:11434`,
        models: report.services.ollama?.details?.models || [],
        latency_ms: report.services.ollama?.latency_ms,
      },
      stable_diffusion: {
        status: report.services.stable_diffusion?.status || 'offline',
        url: report.services.stable_diffusion?.url || `http://${windowsVmIp}:7860`,
        vram_used_gb: report.services.stable_diffusion?.details?.vram_used_gb,
        vram_total_gb: report.services.stable_diffusion?.details?.vram_total_gb,
      },
      comfyui: {
        status: report.services.comfyui?.status || 'offline',
        url: report.services.comfyui?.url || `http://${windowsVmIp}:8188`,
        vram_used_gb: report.services.comfyui?.details?.vram_used_gb,
        vram_total_gb: report.services.comfyui?.details?.vram_total_gb,
      },
    },
    gpu: report.gpu,
    system: report.system,
    health: report.health,
    summary: {
      any_llm_available: report.services.ollama?.status === 'online',
      image_generation_available: report.services.stable_diffusion?.status === 'online',
      video_generation_available: report.services.comfyui?.status === 'online',
      preferred_llm: report.services.ollama?.status === 'online' ? 'windows_vm' : null,
    },
  };
}
