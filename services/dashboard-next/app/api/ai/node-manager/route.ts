/**
 * AI Node Manager API
 * Comprehensive diagnostics, repair, and management for Windows AI services
 */

import { NextRequest, NextResponse } from 'next/server';

const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || '100.118.44.102';
const AGENT_PORT = process.env.WINDOWS_AGENT_PORT || '8765';
const AGENT_TOKEN = process.env.NEBULA_AGENT_TOKEN || process.env.KVM_AGENT_TOKEN;

interface ServiceHealth {
  name: string;
  status: 'online' | 'offline' | 'error' | 'unknown';
  port: number;
  url: string;
  latency_ms?: number;
  details?: Record<string, unknown>;
  error?: string;
}

interface DetectedIssue {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  pattern: string;
  fix_action: string;
  auto_fixable: boolean;
}

interface PackageVersion {
  name: string;
  current: string | null;
  target: string;
  status: 'ok' | 'mismatch' | 'missing' | 'unknown';
}

interface GpuInfo {
  name: string;
  memory_used_mb: number;
  memory_total_mb: number;
  utilization_percent: number;
  temperature_c: number;
  status: 'online' | 'offline' | 'error';
  error?: string;
}

interface DiagnosticResult {
  timestamp: string;
  vm_ip: string;
  vm_reachable: boolean;
  services: Record<string, ServiceHealth>;
  gpu: GpuInfo | null;
  issues: DetectedIssue[];
  packages: PackageVersion[];
  repair_logs?: string[];
}

const KNOWN_ISSUES: Omit<DetectedIssue, 'id'>[] = [
  {
    severity: 'critical',
    title: 'NumPy 2.x Incompatibility',
    description: 'PyTorch compiled against NumPy 1.x ABI. NumPy 2.x breaks binary compatibility.',
    pattern: 'numpy>=2.0.0',
    fix_action: 'downgrade_numpy',
    auto_fixable: true,
  },
  {
    severity: 'critical',
    title: 'torch.library custom_op Error',
    description: 'Torch library missing custom_op attribute, usually caused by version mismatch.',
    pattern: "torch.library has no attribute 'custom_op'",
    fix_action: 'reinstall_torch',
    auto_fixable: true,
  },
  {
    severity: 'warning',
    title: 'Triton Module Missing',
    description: 'Triton kernel compiler not installed. Required for optimal GPU performance.',
    pattern: "No module named 'triton'",
    fix_action: 'install_triton',
    auto_fixable: true,
  },
  {
    severity: 'warning',
    title: 'xformers Version Mismatch',
    description: 'xformers version incompatible with installed PyTorch version.',
    pattern: 'xformers',
    fix_action: 'reinstall_xformers',
    auto_fixable: true,
  },
  {
    severity: 'warning',
    title: 'Protobuf Version Conflict',
    description: 'Protobuf version incompatible with TensorFlow/other packages.',
    pattern: "cannot import name 'runtime_version'",
    fix_action: 'fix_protobuf',
    auto_fixable: true,
  },
  {
    severity: 'info',
    title: 'comfy_kitchen Incompatibility',
    description: 'comfy_kitchen custom node may conflict with newer ComfyUI versions.',
    pattern: 'comfy_kitchen',
    fix_action: 'remove_comfy_kitchen',
    auto_fixable: true,
  },
];

const TARGET_PACKAGES: Record<string, string> = {
  numpy: '1.26.4',
  torch: '2.3.1',
  protobuf: '5.28.3',
  xformers: '0.0.28',
  transformers: '4.44.2',
  diffusers: '0.30.3',
};

async function callWindowsAgent(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<unknown> {
  const url = `http://${WINDOWS_VM_IP}:${AGENT_PORT}${endpoint}`;
  
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(AGENT_TOKEN && { 'Authorization': `Bearer ${AGENT_TOKEN}` }),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  
  if (!response.ok) {
    throw new Error(`Agent returned ${response.status}: ${await response.text()}`);
  }
  
  return response.json();
}

async function checkServiceHealth(name: string, port: number, healthPath: string): Promise<ServiceHealth> {
  const url = `http://${WINDOWS_VM_IP}:${port}${healthPath}`;
  const start = Date.now();
  
  try {
    const response = await fetch(url, { 
      signal: AbortSignal.timeout(5000),
    });
    const latency = Date.now() - start;
    
    if (response.ok) {
      let details = {};
      try {
        details = await response.json();
      } catch {}
      
      return {
        name,
        status: 'online',
        port,
        url: `http://${WINDOWS_VM_IP}:${port}`,
        latency_ms: latency,
        details,
      };
    }
    
    return {
      name,
      status: 'error',
      port,
      url: `http://${WINDOWS_VM_IP}:${port}`,
      error: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      name,
      status: 'offline',
      port,
      url: `http://${WINDOWS_VM_IP}:${port}`,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

async function getGpuInfo(): Promise<GpuInfo | null> {
  try {
    const health = await callWindowsAgent('/health') as { gpu?: GpuInfo };
    return health.gpu || null;
  } catch {
    return null;
  }
}

async function getPackageVersions(): Promise<PackageVersion[]> {
  const packages: PackageVersion[] = [];
  
  for (const [name, target] of Object.entries(TARGET_PACKAGES)) {
    packages.push({
      name,
      current: null,
      target,
      status: 'unknown',
    });
  }
  
  try {
    const result = await callWindowsAgent('/ai/packages') as { packages?: Record<string, string> };
    if (result.packages) {
      for (const pkg of packages) {
        const current = result.packages[pkg.name];
        if (current) {
          pkg.current = current;
          pkg.status = current === pkg.target ? 'ok' : 'mismatch';
        } else {
          pkg.status = 'missing';
        }
      }
    }
  } catch {
    // Agent may not support this endpoint yet
  }
  
  return packages;
}

interface DaemonIssue {
  id: string;
  severity: string;
  title: string;
  pattern?: string;
  source?: string;
}

async function detectIssues(services: Record<string, ServiceHealth>, packages: PackageVersion[]): Promise<DetectedIssue[]> {
  const issues: DetectedIssue[] = [];
  let issueId = 0;
  
  // Check for package version issues
  for (const pkg of packages) {
    if (pkg.name === 'numpy' && pkg.current && pkg.current.startsWith('2.')) {
      issues.push({
        id: `issue-${issueId++}`,
        ...KNOWN_ISSUES.find(i => i.pattern === 'numpy>=2.0.0')!,
      });
    }
    
    if (pkg.status === 'mismatch') {
      const knownIssue = KNOWN_ISSUES.find(i => i.pattern.includes(pkg.name));
      if (knownIssue && !issues.find(i => i.fix_action === knownIssue.fix_action)) {
        issues.push({
          id: `issue-${issueId++}`,
          ...knownIssue,
        });
      }
    }
  }
  
  // Check for offline services
  for (const [key, service] of Object.entries(services)) {
    if (service.status === 'offline') {
      issues.push({
        id: `issue-${issueId++}`,
        severity: 'warning',
        title: `${service.name} Offline`,
        description: `${service.name} service is not responding on port ${service.port}.`,
        pattern: `${key}_offline`,
        fix_action: `restart_${key}`,
        auto_fixable: true,
      });
    } else if (service.status === 'error') {
      issues.push({
        id: `issue-${issueId++}`,
        severity: 'warning',
        title: `${service.name} Error`,
        description: `${service.name} returned an error: ${service.error}`,
        pattern: `${key}_error`,
        fix_action: `restart_${key}`,
        auto_fixable: true,
      });
    }
  }
  
  // Fetch daemon-reported issues from the Windows agent (log scanning)
  try {
    const daemonData = await callWindowsAgent('/ai/detected-issues') as { detected_issues?: DaemonIssue[] };
    if (daemonData.detected_issues && Array.isArray(daemonData.detected_issues)) {
      for (const daemonIssue of daemonData.detected_issues) {
        // Match with known issues for additional metadata
        const matchingKnown = KNOWN_ISSUES.find(ki => 
          ki.pattern.toLowerCase().includes(daemonIssue.id.toLowerCase()) ||
          daemonIssue.title.toLowerCase().includes(ki.title.toLowerCase().split(' ')[0])
        );
        
        // Avoid duplicates
        if (!issues.find(i => i.title === daemonIssue.title)) {
          issues.push({
            id: `issue-${issueId++}`,
            severity: daemonIssue.severity as 'critical' | 'warning' | 'info',
            title: daemonIssue.title,
            description: matchingKnown?.description || `Detected from log scanning: ${daemonIssue.pattern || daemonIssue.title}`,
            pattern: daemonIssue.pattern || daemonIssue.id,
            fix_action: matchingKnown?.fix_action || `fix_${daemonIssue.id}`,
            auto_fixable: !!matchingKnown?.auto_fixable,
          });
        }
      }
    }
  } catch {
    // Agent may not support this endpoint yet
  }
  
  return issues;
}

async function runDiagnostics(): Promise<DiagnosticResult> {
  const timestamp = new Date().toISOString();
  
  // Check VM reachability
  let vmReachable = false;
  try {
    await fetch(`http://${WINDOWS_VM_IP}:${AGENT_PORT}/health`, { 
      signal: AbortSignal.timeout(5000) 
    });
    vmReachable = true;
  } catch {}
  
  // Check all services in parallel
  const [ollama, stableDiffusion, comfyui, whisper, gpu, packages] = await Promise.all([
    checkServiceHealth('Ollama', 11434, '/api/version'),
    checkServiceHealth('Stable Diffusion', 7860, '/sdapi/v1/sd-models'),
    checkServiceHealth('ComfyUI', 8188, '/system_stats'),
    checkServiceHealth('Whisper', 8765, '/health'),
    getGpuInfo(),
    getPackageVersions(),
  ]);
  
  const services: Record<string, ServiceHealth> = {
    ollama,
    stable_diffusion: stableDiffusion,
    comfyui,
    whisper,
  };
  
  const issues = await detectIssues(services, packages);
  
  return {
    timestamp,
    vm_ip: WINDOWS_VM_IP,
    vm_reachable: vmReachable,
    services,
    gpu,
    issues,
    packages,
  };
}

export async function GET() {
  try {
    const diagnostics = await runDiagnostics();
    
    return NextResponse.json({
      success: true,
      ...diagnostics,
    });
  } catch (error) {
    console.error('[Node Manager] GET error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      vm_ip: WINDOWS_VM_IP,
      vm_reachable: false,
      services: {},
      gpu: null,
      issues: [],
      packages: [],
    }, { status: 500 });
  }
}

interface PostAction {
  action: string;
  service?: string;
  issue_id?: string;
}

const VALID_ACTIONS = ['diagnose', 'repair', 'restart-service', 'update-deps', 'fix-issue'] as const;
type ValidAction = typeof VALID_ACTIONS[number];

function isValidAction(action: string): action is ValidAction {
  return VALID_ACTIONS.includes(action as ValidAction);
}

export async function POST(request: NextRequest) {
  try {
    const body: PostAction = await request.json();
    const { action, service, issue_id } = body;
    
    if (!action || !isValidAction(action)) {
      return NextResponse.json({
        success: false,
        error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}`,
        valid_actions: VALID_ACTIONS,
      }, { status: 400 });
    }
    
    switch (action) {
      case 'diagnose': {
        const diagnostics = await runDiagnostics();
        return NextResponse.json({
          success: true,
          action: 'diagnose',
          ...diagnostics,
        });
      }
      
      case 'repair': {
        if (!AGENT_TOKEN) {
          return NextResponse.json({
            success: false,
            error: 'Agent token not configured',
            hint: 'Set KVM_AGENT_TOKEN to enable repair commands',
          }, { status: 503 });
        }
        
        try {
          const result = await callWindowsAgent('/ai/repair', 'POST');
          return NextResponse.json({
            success: true,
            action: 'repair',
            result,
            message: 'Repair command triggered on Windows VM',
          });
        } catch (error) {
          return NextResponse.json({
            success: false,
            action: 'repair',
            error: error instanceof Error ? error.message : 'Failed to trigger repair',
          }, { status: 500 });
        }
      }
      
      case 'restart-service': {
        if (!service) {
          return NextResponse.json({
            success: false,
            error: 'Service name required',
          }, { status: 400 });
        }
        
        if (!AGENT_TOKEN) {
          return NextResponse.json({
            success: false,
            error: 'Agent token not configured',
          }, { status: 503 });
        }
        
        try {
          const result = await callWindowsAgent(`/ai/restart/${service}`, 'POST');
          return NextResponse.json({
            success: true,
            action: 'restart-service',
            service,
            result,
          });
        } catch (error) {
          return NextResponse.json({
            success: false,
            action: 'restart-service',
            service,
            error: error instanceof Error ? error.message : 'Failed to restart service',
          }, { status: 500 });
        }
      }
      
      case 'update-deps': {
        if (!AGENT_TOKEN) {
          return NextResponse.json({
            success: false,
            error: 'Agent token not configured',
          }, { status: 503 });
        }
        
        try {
          const result = await callWindowsAgent('/ai/update-deps', 'POST', {
            packages: TARGET_PACKAGES,
          });
          return NextResponse.json({
            success: true,
            action: 'update-deps',
            result,
            message: 'Dependency update triggered',
          });
        } catch (error) {
          return NextResponse.json({
            success: false,
            action: 'update-deps',
            error: error instanceof Error ? error.message : 'Failed to update dependencies',
          }, { status: 500 });
        }
      }
      
      case 'fix-issue': {
        if (!issue_id) {
          return NextResponse.json({
            success: false,
            error: 'Issue ID required',
          }, { status: 400 });
        }
        
        if (!AGENT_TOKEN) {
          return NextResponse.json({
            success: false,
            error: 'Agent token not configured',
          }, { status: 503 });
        }
        
        try {
          const result = await callWindowsAgent('/ai/fix-issue', 'POST', { issue_id });
          return NextResponse.json({
            success: true,
            action: 'fix-issue',
            issue_id,
            result,
          });
        } catch (error) {
          return NextResponse.json({
            success: false,
            action: 'fix-issue',
            issue_id,
            error: error instanceof Error ? error.message : 'Failed to fix issue',
          }, { status: 500 });
        }
      }
      
      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action: ${action}`,
          valid_actions: ['diagnose', 'repair', 'restart-service', 'update-deps', 'fix-issue'],
        }, { status: 400 });
    }
  } catch (error) {
    console.error('[Node Manager] POST error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
