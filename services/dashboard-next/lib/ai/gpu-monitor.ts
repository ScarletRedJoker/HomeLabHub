const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || '100.118.44.102';
const AGENT_PORT = process.env.WINDOWS_AGENT_PORT || '9765';
const AGENT_TOKEN = process.env.KVM_AGENT_TOKEN;

export interface GPUStats {
  name: string;
  memoryTotal: number;
  memoryUsed: number;
  memoryFree: number;
  utilization: number;
  memoryUsagePercent: number;
}

export interface GPUMonitorState {
  available: boolean;
  lastCheck: Date;
  stats: GPUStats | null;
  error?: string;
}

class GPUMonitor {
  private state: GPUMonitorState = {
    available: false,
    lastCheck: new Date(0),
    stats: null,
  };
  
  private intervalId: NodeJS.Timeout | null = null;

  async checkGPU(): Promise<GPUMonitorState> {
    if (!AGENT_TOKEN) {
      this.state = {
        available: false,
        lastCheck: new Date(),
        stats: null,
        error: 'KVM_AGENT_TOKEN not configured',
      };
      return this.state;
    }

    try {
      const url = `http://${WINDOWS_VM_IP}:${AGENT_PORT}/api/health`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${AGENT_TOKEN}`,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.gpu && data.gpu.memoryTotal > 0) {
        const stats: GPUStats = {
          name: data.gpu.name || 'Unknown GPU',
          memoryTotal: data.gpu.memoryTotal || 0,
          memoryUsed: data.gpu.memoryUsed || 0,
          memoryFree: data.gpu.memoryFree || 0,
          utilization: data.gpu.utilization || 0,
          memoryUsagePercent: data.gpu.memoryTotal > 0 
            ? Math.round((data.gpu.memoryUsed / data.gpu.memoryTotal) * 100) 
            : 0,
        };

        this.state = {
          available: true,
          lastCheck: new Date(),
          stats,
        };
      } else {
        this.state = {
          available: false,
          lastCheck: new Date(),
          stats: null,
          error: 'No GPU data in response',
        };
      }
    } catch (error: any) {
      this.state = {
        available: false,
        lastCheck: new Date(),
        stats: null,
        error: error.message,
      };
    }

    return this.state;
  }

  getState(): GPUMonitorState {
    return { ...this.state };
  }

  isVRAMCritical(thresholdPercent = 90): boolean {
    if (!this.state.stats) return false;
    return this.state.stats.memoryUsagePercent >= thresholdPercent;
  }

  getVRAMFree(): number {
    return this.state.stats?.memoryFree || 0;
  }

  start(intervalMs = 60000): void {
    if (this.intervalId) {
      this.stop();
    }

    console.log(`[GPUMonitor] Starting GPU monitoring (interval: ${intervalMs}ms)`);
    
    this.checkGPU();
    
    this.intervalId = setInterval(() => {
      this.checkGPU();
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('[GPUMonitor] Stopped GPU monitoring');
  }
}

export const gpuMonitor = new GPUMonitor();
