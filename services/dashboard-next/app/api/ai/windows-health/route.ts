/**
 * Windows AI Stack Health Check API
 * Comprehensive diagnostics for Windows VM AI services
 */

import { NextRequest, NextResponse } from 'next/server';

const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || '100.118.44.102';
const AGENT_PORT = process.env.WINDOWS_AGENT_PORT || '9765';
const AGENT_TOKEN = process.env.NEBULA_AGENT_TOKEN || process.env.KVM_AGENT_TOKEN;

interface ServiceStatus {
  name: string;
  status: 'running' | 'stopped' | 'error' | 'unknown';
  port: number;
  url: string;
  latencyMs?: number;
  version?: string;
  details?: Record<string, unknown>;
  error?: string;
}

interface DependencyStatus {
  name: string;
  status: 'installed' | 'missing' | 'outdated' | 'error' | 'unknown';
  currentVersion?: string;
  requiredVersion?: string;
  error?: string;
}

interface GpuStats {
  name: string;
  driver: string;
  cudaVersion: string;
  vramTotalMb: number;
  vramUsedMb: number;
  vramFreeMb: number;
  utilizationPercent: number;
  temperatureC: number;
  status: 'healthy' | 'warning' | 'error';
}

interface DiagnosticCheck {
  name: string;
  passed: boolean;
  message: string;
  command?: string;
  output?: string;
}

interface RepairAction {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  actionType: 'restart' | 'install' | 'update' | 'fix' | 'manual';
  actionCommand?: string;
  autoFixable: boolean;
}

interface LogEntry {
  timestamp: string;
  level: 'error' | 'warning' | 'info';
  service: string;
  message: string;
}

interface WindowsHealthReport {
  success: boolean;
  timestamp: string;
  vmIp: string;
  vmReachable: boolean;
  agentVersion?: string;
  services: ServiceStatus[];
  dependencies: DependencyStatus[];
  gpu: GpuStats | null;
  diagnostics: DiagnosticCheck[];
  repairActions: RepairAction[];
  recentLogs: LogEntry[];
  summary: {
    servicesOnline: number;
    servicesTotal: number;
    criticalIssues: number;
    warningIssues: number;
    overallHealth: 'healthy' | 'degraded' | 'critical';
  };
  error?: string;
}

const SERVICE_CONFIGS = [
  { name: 'Ollama', port: 11434, healthPath: '/api/tags', key: 'ollama' },
  { name: 'Stable Diffusion WebUI', port: 7860, healthPath: '/sdapi/v1/options', key: 'stable_diffusion' },
  { name: 'ComfyUI', port: 8188, healthPath: '/system_stats', key: 'comfyui' },
  { name: 'Nebula Agent', port: 9765, healthPath: '/api/health', key: 'nebula_agent' },
];

const REQUIRED_DEPENDENCIES = [
  { name: 'numpy', requiredVersion: '1.26.4', pythonEnv: 'sd' },
  { name: 'torch', requiredVersion: '2.3.1', pythonEnv: 'sd' },
  { name: 'xformers', requiredVersion: '0.0.28', pythonEnv: 'sd' },
  { name: 'opencv-python', requiredVersion: '4.8.0', pythonEnv: 'sd' },
  { name: 'diffusers', requiredVersion: '0.30.3', pythonEnv: 'sd' },
  { name: 'transformers', requiredVersion: '4.44.2', pythonEnv: 'sd' },
  { name: 'protobuf', requiredVersion: '5.28.3', pythonEnv: 'sd' },
  { name: 'ffmpeg', requiredVersion: 'any', pythonEnv: 'system' },
];

async function callAgent(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: unknown, timeout = 15000): Promise<unknown> {
  const url = `http://${WINDOWS_VM_IP}:${AGENT_PORT}${endpoint}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(AGENT_TOKEN && { 'Authorization': `Bearer ${AGENT_TOKEN}` }),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Agent returned ${response.status}: ${await response.text()}`);
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function checkServiceHealth(config: typeof SERVICE_CONFIGS[0]): Promise<ServiceStatus> {
  const url = `http://${WINDOWS_VM_IP}:${config.port}${config.healthPath}`;
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    const latency = Date.now() - start;

    if (response.ok) {
      let details = {};
      try {
        details = await response.json();
      } catch {}

      return {
        name: config.name,
        status: 'running',
        port: config.port,
        url: `http://${WINDOWS_VM_IP}:${config.port}`,
        latencyMs: latency,
        details,
      };
    }

    return {
      name: config.name,
      status: 'error',
      port: config.port,
      url: `http://${WINDOWS_VM_IP}:${config.port}`,
      error: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      name: config.name,
      status: 'stopped',
      port: config.port,
      url: `http://${WINDOWS_VM_IP}:${config.port}`,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

async function getGpuStats(): Promise<GpuStats | null> {
  try {
    const health = await callAgent('/api/health') as {
      success?: boolean;
      gpu?: {
        name: string;
        memoryTotal: number;
        memoryUsed: number;
        memoryFree: number;
        utilization: number;
      };
    };

    if (!health.gpu) return null;

    let cudaVersion = 'Unknown';
    let driverVersion = 'Unknown';
    let temperature = 0;

    try {
      const result = await callAgent('/api/execute', 'POST', {
        command: 'nvidia-smi --query-gpu=driver_version,temperature.gpu --format=csv,noheader,nounits',
        timeout: 5000,
      }) as { success: boolean; output?: string };

      if (result.success && result.output) {
        const parts = result.output.trim().split(',').map(s => s.trim());
        driverVersion = parts[0] || 'Unknown';
        temperature = parseInt(parts[1]) || 0;
      }
    } catch {}

    try {
      const cudaResult = await callAgent('/api/execute', 'POST', {
        command: 'nvcc --version 2>nul || echo "CUDA not in PATH"',
        timeout: 5000,
      }) as { success: boolean; output?: string };

      if (cudaResult.success && cudaResult.output) {
        const match = cudaResult.output.match(/release (\d+\.\d+)/);
        if (match) cudaVersion = match[1];
      }
    } catch {}

    const utilizationPercent = health.gpu.utilization || 0;
    const vramUsedPercent = (health.gpu.memoryUsed / health.gpu.memoryTotal) * 100;

    let status: 'healthy' | 'warning' | 'error' = 'healthy';
    if (temperature > 85 || vramUsedPercent > 95) status = 'error';
    else if (temperature > 75 || vramUsedPercent > 85) status = 'warning';

    return {
      name: health.gpu.name,
      driver: driverVersion,
      cudaVersion,
      vramTotalMb: health.gpu.memoryTotal,
      vramUsedMb: health.gpu.memoryUsed,
      vramFreeMb: health.gpu.memoryFree,
      utilizationPercent,
      temperatureC: temperature,
      status,
    };
  } catch {
    return null;
  }
}

async function checkDependencies(): Promise<DependencyStatus[]> {
  const results: DependencyStatus[] = [];

  for (const dep of REQUIRED_DEPENDENCIES) {
    if (dep.pythonEnv === 'system') {
      try {
        const result = await callAgent('/api/execute', 'POST', {
          command: dep.name === 'ffmpeg' ? 'ffmpeg -version' : `${dep.name} --version`,
          timeout: 5000,
        }) as { success: boolean; output?: string; error?: string };

        if (result.success && result.output && !result.output.includes('not recognized')) {
          const versionMatch = result.output.match(/version\s+([^\s]+)/i) || 
                              result.output.match(/(\d+\.\d+(\.\d+)?)/);
          results.push({
            name: dep.name,
            status: 'installed',
            currentVersion: versionMatch ? versionMatch[1] : 'installed',
            requiredVersion: dep.requiredVersion,
          });
        } else {
          results.push({
            name: dep.name,
            status: 'missing',
            requiredVersion: dep.requiredVersion,
            error: result.error || 'Not found in PATH',
          });
        }
      } catch {
        results.push({
          name: dep.name,
          status: 'unknown',
          requiredVersion: dep.requiredVersion,
        });
      }
    } else {
      try {
        const result = await callAgent('/api/execute', 'POST', {
          command: `python -c "import ${dep.name.replace('-', '_').split('[')[0]}; print(${dep.name.replace('-', '_').split('[')[0]}.__version__)"`,
          timeout: 10000,
        }) as { success: boolean; output?: string; error?: string };

        if (result.success && result.output && !result.output.includes('ModuleNotFoundError')) {
          const version = result.output.trim().split('\n').pop() || '';
          const versionClean = version.replace(/[^0-9.]/g, '');

          let status: DependencyStatus['status'] = 'installed';
          if (dep.requiredVersion !== 'any') {
            const currentMajorMinor = versionClean.split('.').slice(0, 2).join('.');
            const requiredMajorMinor = dep.requiredVersion.split('.').slice(0, 2).join('.');
            if (currentMajorMinor !== requiredMajorMinor) {
              status = 'outdated';
            }
          }

          results.push({
            name: dep.name,
            status,
            currentVersion: versionClean || 'installed',
            requiredVersion: dep.requiredVersion,
          });
        } else {
          results.push({
            name: dep.name,
            status: 'missing',
            requiredVersion: dep.requiredVersion,
            error: 'Module not found',
          });
        }
      } catch {
        results.push({
          name: dep.name,
          status: 'unknown',
          requiredVersion: dep.requiredVersion,
        });
      }
    }
  }

  return results;
}

async function runDiagnostics(): Promise<DiagnosticCheck[]> {
  const checks: DiagnosticCheck[] = [];

  const diagnosticCommands = [
    {
      name: 'cv2 Import',
      command: 'python -c "import cv2; print(cv2.__version__)"',
      successPattern: /\d+\.\d+/,
    },
    {
      name: 'ffmpeg in PATH',
      command: 'where ffmpeg',
      successPattern: /ffmpeg/i,
    },
    {
      name: 'CUDA Available (PyTorch)',
      command: 'python -c "import torch; print(torch.cuda.is_available())"',
      successPattern: /True/,
    },
    {
      name: 'CUDA Device Count',
      command: 'python -c "import torch; print(f\'GPU Count: {torch.cuda.device_count()}\')"',
      successPattern: /GPU Count: \d+/,
    },
    {
      name: 'xformers Load',
      command: 'python -c "import xformers; print(xformers.__version__)"',
      successPattern: /\d+\.\d+/,
    },
    {
      name: 'GPU VRAM Access',
      command: 'nvidia-smi --query-gpu=memory.free --format=csv,noheader',
      successPattern: /\d+ MiB/,
    },
    {
      name: 'Triton Compiler',
      command: 'python -c "import triton; print(triton.__version__)"',
      successPattern: /\d+\.\d+/,
    },
  ];

  for (const diag of diagnosticCommands) {
    try {
      const result = await callAgent('/api/execute', 'POST', {
        command: diag.command,
        timeout: 15000,
      }) as { success: boolean; output?: string; error?: string };

      const output = result.output || result.error || '';
      const passed = result.success && diag.successPattern.test(output);

      checks.push({
        name: diag.name,
        passed,
        message: passed ? 'Check passed' : `Failed: ${output.substring(0, 200)}`,
        command: diag.command,
        output: output.substring(0, 500),
      });
    } catch (error) {
      checks.push({
        name: diag.name,
        passed: false,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        command: diag.command,
      });
    }
  }

  return checks;
}

function generateRepairActions(
  services: ServiceStatus[],
  dependencies: DependencyStatus[],
  diagnostics: DiagnosticCheck[],
  gpu: GpuStats | null
): RepairAction[] {
  const actions: RepairAction[] = [];
  let actionId = 0;

  for (const service of services) {
    if (service.status === 'stopped' || service.status === 'error') {
      actions.push({
        id: `action-${actionId++}`,
        severity: service.name === 'Ollama' || service.name === 'Stable Diffusion WebUI' ? 'critical' : 'warning',
        title: `Start ${service.name}`,
        description: `${service.name} is ${service.status}. ${service.error || ''}`,
        actionType: 'restart',
        actionCommand: service.name.toLowerCase().replace(/\s+/g, '_'),
        autoFixable: true,
      });
    }
  }

  for (const dep of dependencies) {
    if (dep.status === 'missing') {
      actions.push({
        id: `action-${actionId++}`,
        severity: dep.name === 'torch' || dep.name === 'numpy' ? 'critical' : 'warning',
        title: `Install ${dep.name}`,
        description: `${dep.name} is not installed. Required version: ${dep.requiredVersion}`,
        actionType: 'install',
        actionCommand: `pip install ${dep.name}==${dep.requiredVersion}`,
        autoFixable: true,
      });
    } else if (dep.status === 'outdated') {
      const isNumpyVersion2 = dep.name === 'numpy' && dep.currentVersion?.startsWith('2.');
      actions.push({
        id: `action-${actionId++}`,
        severity: isNumpyVersion2 ? 'critical' : 'warning',
        title: `Update ${dep.name}`,
        description: `${dep.name} version ${dep.currentVersion} needs to be ${dep.requiredVersion}`,
        actionType: 'update',
        actionCommand: `pip install ${dep.name}==${dep.requiredVersion}`,
        autoFixable: true,
      });
    }
  }

  for (const check of diagnostics) {
    if (!check.passed) {
      if (check.name === 'cv2 Import') {
        actions.push({
          id: `action-${actionId++}`,
          severity: 'warning',
          title: 'Fix OpenCV',
          description: 'OpenCV (cv2) import failed. Try reinstalling opencv-python.',
          actionType: 'fix',
          actionCommand: 'pip install --force-reinstall opencv-python-headless',
          autoFixable: true,
        });
      }
      if (check.name === 'xformers Load') {
        actions.push({
          id: `action-${actionId++}`,
          severity: 'warning',
          title: 'Fix xformers',
          description: 'xformers failed to load. May need reinstall matching PyTorch version.',
          actionType: 'fix',
          actionCommand: 'pip install --force-reinstall xformers==0.0.28',
          autoFixable: true,
        });
      }
      if (check.name === 'ffmpeg in PATH') {
        actions.push({
          id: `action-${actionId++}`,
          severity: 'warning',
          title: 'Install ffmpeg',
          description: 'ffmpeg not found in PATH. Required for video processing.',
          actionType: 'install',
          autoFixable: false,
        });
      }
      if (check.name === 'CUDA Available (PyTorch)') {
        actions.push({
          id: `action-${actionId++}`,
          severity: 'critical',
          title: 'Fix CUDA/PyTorch',
          description: 'CUDA is not available to PyTorch. May need to reinstall PyTorch with CUDA support.',
          actionType: 'fix',
          autoFixable: false,
        });
      }
    }
  }

  if (gpu && gpu.status === 'error') {
    actions.push({
      id: `action-${actionId++}`,
      severity: 'critical',
      title: 'GPU Overheating or VRAM Full',
      description: `GPU temperature: ${gpu.temperatureC}°C, VRAM usage: ${Math.round((gpu.vramUsedMb / gpu.vramTotalMb) * 100)}%`,
      actionType: 'manual',
      autoFixable: false,
    });
  }

  return actions;
}

async function getRecentLogs(): Promise<LogEntry[]> {
  const logs: LogEntry[] = [];

  try {
    const result = await callAgent('/api/execute', 'POST', {
      command: 'type "C:\\AI\\logs\\ai-health.log" 2>nul || echo "No logs"',
      timeout: 5000,
    }) as { success: boolean; output?: string };

    if (result.success && result.output && !result.output.includes('No logs')) {
      const lines = result.output.trim().split('\n').slice(-20);
      for (const line of lines) {
        const match = line.match(/^\[(.*?)\]\s*\[(.*?)\]\s*\[(.*?)\]\s*(.*)/);
        if (match) {
          logs.push({
            timestamp: match[1],
            level: (match[2].toLowerCase() as 'error' | 'warning' | 'info') || 'info',
            service: match[3],
            message: match[4],
          });
        }
      }
    }
  } catch {}

  return logs;
}

async function runFullHealthCheck(): Promise<WindowsHealthReport> {
  const timestamp = new Date().toISOString();

  let vmReachable = false;
  let agentVersion: string | undefined;

  try {
    const health = await callAgent('/api/health', 'GET', undefined, 5000) as {
      success?: boolean;
      hostname?: string;
    };
    vmReachable = true;
    if (health.hostname) agentVersion = '1.0.0';
  } catch {}

  if (!vmReachable) {
    return {
      success: false,
      timestamp,
      vmIp: WINDOWS_VM_IP,
      vmReachable: false,
      services: SERVICE_CONFIGS.map(c => ({
        name: c.name,
        status: 'unknown' as const,
        port: c.port,
        url: `http://${WINDOWS_VM_IP}:${c.port}`,
        error: 'VM not reachable',
      })),
      dependencies: REQUIRED_DEPENDENCIES.map(d => ({
        name: d.name,
        status: 'unknown' as const,
        requiredVersion: d.requiredVersion,
      })),
      gpu: null,
      diagnostics: [],
      repairActions: [{
        id: 'action-vm-offline',
        severity: 'critical',
        title: 'Windows VM Offline',
        description: `Cannot reach Windows VM at ${WINDOWS_VM_IP}:${AGENT_PORT}. Ensure the VM is running and Tailscale is connected.`,
        actionType: 'manual',
        autoFixable: false,
      }],
      recentLogs: [],
      summary: {
        servicesOnline: 0,
        servicesTotal: SERVICE_CONFIGS.length,
        criticalIssues: 1,
        warningIssues: 0,
        overallHealth: 'critical',
      },
      error: 'Windows VM not reachable',
    };
  }

  const [services, gpu, dependencies, diagnostics, recentLogs] = await Promise.all([
    Promise.all(SERVICE_CONFIGS.map(checkServiceHealth)),
    getGpuStats(),
    checkDependencies(),
    runDiagnostics(),
    getRecentLogs(),
  ]);

  const repairActions = generateRepairActions(services, dependencies, diagnostics, gpu);

  const servicesOnline = services.filter(s => s.status === 'running').length;
  const criticalIssues = repairActions.filter(a => a.severity === 'critical').length;
  const warningIssues = repairActions.filter(a => a.severity === 'warning').length;

  let overallHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';
  if (criticalIssues > 0) overallHealth = 'critical';
  else if (warningIssues > 0 || servicesOnline < services.length) overallHealth = 'degraded';

  return {
    success: true,
    timestamp,
    vmIp: WINDOWS_VM_IP,
    vmReachable,
    agentVersion,
    services,
    dependencies,
    gpu,
    diagnostics,
    repairActions,
    recentLogs,
    summary: {
      servicesOnline,
      servicesTotal: services.length,
      criticalIssues,
      warningIssues,
      overallHealth,
    },
  };
}

export async function GET() {
  try {
    const report = await runFullHealthCheck();
    return NextResponse.json(report);
  } catch (error) {
    console.error('[Windows Health] GET error:', error);
    return NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      vmIp: WINDOWS_VM_IP,
      vmReachable: false,
      services: [],
      dependencies: [],
      gpu: null,
      diagnostics: [],
      repairActions: [],
      recentLogs: [],
      summary: {
        servicesOnline: 0,
        servicesTotal: 0,
        criticalIssues: 1,
        warningIssues: 0,
        overallHealth: 'critical',
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    } satisfies WindowsHealthReport, { status: 500 });
  }
}

interface RepairRequest {
  action: 'repair_all' | 'restart_service' | 'fix_dependency' | 'run_command';
  service?: string;
  dependency?: string;
  command?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: RepairRequest = await request.json();

    if (!AGENT_TOKEN) {
      return NextResponse.json({
        success: false,
        error: 'Agent token not configured. Set NEBULA_AGENT_TOKEN or KVM_AGENT_TOKEN.',
      }, { status: 503 });
    }

    switch (body.action) {
      case 'repair_all': {
        const result = await callAgent('/api/execute', 'POST', {
          command: 'powershell -File "C:\\AI\\scripts\\Repair-AIStack.ps1"',
          timeout: 120000,
        });
        return NextResponse.json({
          success: true,
          action: 'repair_all',
          result,
          message: 'Full repair script triggered',
        });
      }

      case 'restart_service': {
        if (!body.service) {
          return NextResponse.json({ success: false, error: 'Service name required' }, { status: 400 });
        }

        const serviceCommands: Record<string, string> = {
          ollama: 'net stop ollama & net start ollama',
          stable_diffusion: 'taskkill /F /IM python.exe /FI "WINDOWTITLE eq *stable*" & start "" "C:\\AI\\stable-diffusion-webui\\webui-user.bat"',
          comfyui: 'taskkill /F /IM python.exe /FI "WINDOWTITLE eq *comfy*" & start "" "C:\\AI\\ComfyUI\\run_nvidia_gpu.bat"',
          nebula_agent: 'powershell Restart-Service nebula-agent',
        };

        const command = serviceCommands[body.service];
        if (!command) {
          return NextResponse.json({ success: false, error: `Unknown service: ${body.service}` }, { status: 400 });
        }

        const result = await callAgent('/api/execute', 'POST', { command, timeout: 30000 });
        return NextResponse.json({
          success: true,
          action: 'restart_service',
          service: body.service,
          result,
        });
      }

      case 'fix_dependency': {
        if (!body.dependency) {
          return NextResponse.json({ success: false, error: 'Dependency name required' }, { status: 400 });
        }

        const dep = REQUIRED_DEPENDENCIES.find(d => d.name === body.dependency);
        if (!dep) {
          return NextResponse.json({ success: false, error: `Unknown dependency: ${body.dependency}` }, { status: 400 });
        }

        const command = dep.pythonEnv === 'system'
          ? `winget install -e --id Gyan.FFmpeg`
          : `pip install --force-reinstall ${dep.name}==${dep.requiredVersion}`;

        const result = await callAgent('/api/execute', 'POST', { command, timeout: 300000 });
        return NextResponse.json({
          success: true,
          action: 'fix_dependency',
          dependency: body.dependency,
          result,
        });
      }

      case 'run_command': {
        if (!body.command) {
          return NextResponse.json({ success: false, error: 'Command required' }, { status: 400 });
        }

        const result = await callAgent('/api/execute', 'POST', {
          command: body.command,
          timeout: 60000,
        });
        return NextResponse.json({
          success: true,
          action: 'run_command',
          result,
        });
      }

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Valid actions: repair_all, restart_service, fix_dependency, run_command',
        }, { status: 400 });
    }
  } catch (error) {
    console.error('[Windows Health] POST error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
