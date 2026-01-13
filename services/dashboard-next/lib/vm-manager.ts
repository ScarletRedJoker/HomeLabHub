/**
 * VM and Windows Service Management Library
 * Provides control over libvirt VMs on Ubuntu host and Windows services via SSH
 */

import { Client } from "ssh2";
import { getSSHPrivateKey } from "./server-config-store";

// Configuration
const UBUNTU_HOST = process.env.VM_HOST || "100.66.61.51";
const UBUNTU_USER = process.env.VM_HOST_USER || "evin";
const WINDOWS_HOST = process.env.WINDOWS_VM_HOST || "100.118.44.102";
const WINDOWS_USER = process.env.WINDOWS_VM_USER || "Evin";
const DEFAULT_TIMEOUT = 10000;

// Pre-defined managed services on Windows
export const MANAGED_SERVICES = {
  ollama: {
    name: 'Ollama',
    processName: 'ollama',
    startCommand: 'ollama serve',
    port: 11434,
    healthEndpoint: '/api/version'
  },
  'stable-diffusion': {
    name: 'Stable Diffusion WebUI',
    processName: 'python',
    startCommand: 'cd C:\\stable-diffusion-webui && .\\webui-user.bat',
    port: 7860,
    healthEndpoint: '/sdapi/v1/options'
  },
  comfyui: {
    name: 'ComfyUI',
    processName: 'python',
    startCommand: 'cd C:\\Users\\Evin\\Documents\\ComfyUI_windows_portable && .\\python_embeded\\python.exe -s ComfyUI\\main.py --windows-standalone-build --listen 0.0.0.0',
    port: 8188,
    healthEndpoint: '/system_stats'
  }
} as const;

export type ManagedServiceId = keyof typeof MANAGED_SERVICES;

export interface ManagedService {
  name: string;
  processName: string;
  startCommand: string;
  port: number;
  healthEndpoint: string;
}

export interface CommandResult {
  success: boolean;
  output?: string;
  error?: string;
}

export interface VMStatus {
  name: string;
  status: 'running' | 'stopped' | 'paused' | 'starting' | 'stopping' | 'unknown';
}

export interface VMInfo {
  name: string;
  status: 'running' | 'stopped' | 'paused' | 'starting' | 'stopping' | 'unknown';
  autostart: boolean;
}

export interface WindowsServiceStatus {
  name: string;
  running: boolean;
  processId?: number;
}

export interface StartupTask {
  name: string;
  command: string;
  enabled: boolean;
}

/**
 * Execute a command over SSH
 */
async function executeSSH(
  host: string,
  user: string,
  command: string,
  timeout: number = DEFAULT_TIMEOUT
): Promise<CommandResult> {
  const privateKey = getSSHPrivateKey();
  
  if (!privateKey) {
    return {
      success: false,
      error: "SSH private key not found"
    };
  }

  return new Promise((resolve) => {
    const conn = new Client();
    let timeoutId: NodeJS.Timeout;

    const cleanup = () => {
      clearTimeout(timeoutId);
      conn.end();
    };

    timeoutId = setTimeout(() => {
      cleanup();
      resolve({
        success: false,
        error: `Connection timeout after ${timeout}ms`
      });
    }, timeout);

    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          cleanup();
          resolve({
            success: false,
            error: err.message
          });
          return;
        }

        let stdout = "";
        let stderr = "";

        stream.on("data", (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });

        stream.on("close", (code: number) => {
          cleanup();
          if (code === 0) {
            resolve({
              success: true,
              output: stdout.trim()
            });
          } else {
            resolve({
              success: false,
              output: stdout.trim(),
              error: stderr.trim() || `Command exited with code ${code}`
            });
          }
        });
      });
    });

    conn.on("error", (err) => {
      cleanup();
      resolve({
        success: false,
        error: err.message
      });
    });

    try {
      conn.connect({
        host,
        port: 22,
        username: user,
        privateKey,
        readyTimeout: timeout,
      });
    } catch (err: any) {
      cleanup();
      resolve({
        success: false,
        error: err.message
      });
    }
  });
}

/**
 * Execute a command on the Ubuntu/libvirt host
 */
async function executeOnUbuntu(command: string, timeout?: number): Promise<CommandResult> {
  return executeSSH(UBUNTU_HOST, UBUNTU_USER, command, timeout);
}

/**
 * Execute a PowerShell command on the Windows VM
 */
async function executeOnWindows(
  command: string,
  timeout?: number,
  user: string = WINDOWS_USER
): Promise<CommandResult> {
  const psCommand = `powershell -NoProfile -NonInteractive -Command "${command.replace(/"/g, '\\"')}"`;
  return executeSSH(WINDOWS_HOST, user, psCommand, timeout);
}

// ============================================
// VM Control Functions (libvirt on Ubuntu)
// ============================================

/**
 * Get the status of a specific VM
 */
export async function getVMStatus(vmName: string): Promise<CommandResult & { status?: VMStatus }> {
  const result = await executeOnUbuntu(`virsh domstate "${vmName}"`);
  
  if (!result.success) {
    return result;
  }

  // virsh states → UI states mapping
  const stateMap: Record<string, VMStatus['status']> = {
    'running': 'running',
    'shut off': 'stopped',
    'paused': 'paused',
    'starting': 'starting',       // When VM is booting
    'shutting down': 'stopping',  // When VM is shutting down
    'in shutdown': 'stopping',    // Alternative shutdown state
    'pmsuspended': 'paused',      // Power management suspended
    'crashed': 'stopped',         // Crashed → stopped
    'dying': 'stopping',          // About to stop
    'idle': 'running',            // Idle is still running
  };

  const rawState = result.output?.toLowerCase().trim() || '';
  const status = stateMap[rawState] || 'unknown';

  return {
    ...result,
    status: {
      name: vmName,
      status
    }
  };
}

/**
 * Start a VM
 */
export async function startVM(vmName: string): Promise<CommandResult> {
  return executeOnUbuntu(`virsh start "${vmName}"`);
}

/**
 * Gracefully shutdown a VM
 */
export async function stopVM(vmName: string): Promise<CommandResult> {
  return executeOnUbuntu(`virsh shutdown "${vmName}"`);
}

/**
 * Restart a VM (reboot)
 */
export async function restartVM(vmName: string): Promise<CommandResult> {
  return executeOnUbuntu(`virsh reboot "${vmName}"`);
}

/**
 * Force stop (destroy) a VM
 */
export async function forceStopVM(vmName: string): Promise<CommandResult> {
  return executeOnUbuntu(`virsh destroy "${vmName}"`);
}

/**
 * Check if autostart is enabled for a VM
 */
export async function getVMAutostart(vmName: string): Promise<CommandResult & { enabled?: boolean }> {
  const result = await executeOnUbuntu(`virsh dominfo "${vmName}" | grep -i autostart`);
  
  if (!result.success) {
    return result;
  }

  const enabled = result.output?.toLowerCase().includes('enable') || false;
  
  return {
    ...result,
    enabled
  };
}

/**
 * Enable or disable autostart for a VM
 */
export async function setVMAutostart(vmName: string, enabled: boolean): Promise<CommandResult> {
  const command = enabled ? `virsh autostart "${vmName}"` : `virsh autostart --disable "${vmName}"`;
  return executeOnUbuntu(command);
}

/**
 * List all VMs with their status
 */
export async function listVMs(): Promise<CommandResult & { vms?: VMInfo[] }> {
  const result = await executeOnUbuntu(`virsh list --all`);
  
  if (!result.success) {
    console.error('[VM Manager] Failed to list VMs:', result.error);
    return result;
  }

  const lines = result.output?.split('\n') || [];
  const vms: VMInfo[] = [];

  // virsh states → UI states mapping
  const stateMap: Record<string, VMInfo['status']> = {
    'running': 'running',
    'shut off': 'stopped',
    'paused': 'paused',
    'starting': 'starting',       // When VM is booting
    'shutting down': 'stopping',  // When VM is shutting down
    'in shutdown': 'stopping',    // Alternative shutdown state
    'pmsuspended': 'paused',      // Power management suspended
    'crashed': 'stopped',         // Crashed → stopped
    'dying': 'stopping',          // About to stop
    'idle': 'running',            // Idle is still running
  };

  for (const line of lines) {
    const match = line.trim().match(/^\s*(\d+|-)\s+(\S+)\s+(.+)$/);
    if (match) {
      const [, , name, stateStr] = match;
      const state = stateStr.trim().toLowerCase();

      const autostartResult = await getVMAutostart(name);
      
      if (!autostartResult.success) {
        console.warn(`[VM Manager] Failed to get autostart status for VM "${name}":`, autostartResult.error);
      }
      
      vms.push({
        name,
        status: stateMap[state] || 'unknown',
        autostart: autostartResult.enabled || false
      });
    }
  }

  return {
    ...result,
    vms
  };
}

// ============================================
// Windows Service Control Functions
// ============================================

/**
 * Check if a process/service is running on Windows
 */
export async function getWindowsServiceStatus(
  serviceName: string,
  user?: string
): Promise<CommandResult & { status?: WindowsServiceStatus }> {
  const command = `Get-Process -Name '${serviceName}' -ErrorAction SilentlyContinue | Select-Object -First 1 Id`;
  const result = await executeOnWindows(command, DEFAULT_TIMEOUT, user);

  if (!result.success && !result.error?.includes('Cannot find a process')) {
    return result;
  }

  const processId = result.output ? parseInt(result.output.trim(), 10) : undefined;
  const running = !isNaN(processId as number);

  return {
    success: true,
    status: {
      name: serviceName,
      running,
      processId: running ? processId : undefined
    }
  };
}

/**
 * Start a service/application on Windows
 * Runs the command in the background using Start-Process
 */
export async function startWindowsService(
  serviceName: string,
  command: string,
  user?: string
): Promise<CommandResult> {
  const psCommand = `Start-Process -FilePath cmd.exe -ArgumentList '/c ${command.replace(/'/g, "''")}' -WindowStyle Hidden`;
  return executeOnWindows(psCommand, DEFAULT_TIMEOUT, user);
}

/**
 * Stop a process by name on Windows
 */
export async function stopWindowsService(
  serviceName: string,
  user?: string
): Promise<CommandResult> {
  const command = `Stop-Process -Name '${serviceName}' -Force -ErrorAction SilentlyContinue`;
  return executeOnWindows(command, DEFAULT_TIMEOUT, user);
}

/**
 * List scheduled tasks in the startup folder or Task Scheduler
 */
export async function getWindowsStartupTasks(user?: string): Promise<CommandResult & { tasks?: StartupTask[] }> {
  const command = `Get-ScheduledTask | Where-Object {$_.TaskPath -like '*\\Startup\\*' -or $_.TaskName -like '*startup*'} | Select-Object TaskName,State,@{N='Command';E={(Get-ScheduledTaskInfo $_.TaskName -ErrorAction SilentlyContinue).NextRunTime}} | ConvertTo-Json -Compress`;
  const result = await executeOnWindows(command, DEFAULT_TIMEOUT, user);

  if (!result.success) {
    return result;
  }

  try {
    const tasks: StartupTask[] = [];
    if (result.output) {
      const parsed = JSON.parse(result.output);
      const taskArray = Array.isArray(parsed) ? parsed : [parsed];
      
      for (const task of taskArray) {
        if (task && task.TaskName) {
          tasks.push({
            name: task.TaskName,
            command: task.Command || '',
            enabled: task.State === 'Ready' || task.State === 3
          });
        }
      }
    }
    
    return {
      ...result,
      tasks
    };
  } catch (e) {
    return {
      success: true,
      output: result.output,
      tasks: []
    };
  }
}

/**
 * Create or modify a scheduled task for startup
 */
export async function setWindowsStartupTask(
  name: string,
  command: string,
  enabled: boolean,
  user?: string
): Promise<CommandResult> {
  if (enabled) {
    const psCommand = `
      $action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c ${command.replace(/'/g, "''")}'
      $trigger = New-ScheduledTaskTrigger -AtLogOn
      $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
      Register-ScheduledTask -TaskName '${name}' -Action $action -Trigger $trigger -Settings $settings -Force
    `.replace(/\n/g, '; ');
    return executeOnWindows(psCommand, DEFAULT_TIMEOUT, user);
  } else {
    const psCommand = `Unregister-ScheduledTask -TaskName '${name}' -Confirm:$false -ErrorAction SilentlyContinue`;
    return executeOnWindows(psCommand, DEFAULT_TIMEOUT, user);
  }
}

// ============================================
// Managed Service Helpers
// ============================================

/**
 * Get the status of a managed service by ID
 */
export async function getManagedServiceStatus(
  serviceId: ManagedServiceId,
  user?: string
): Promise<CommandResult & { status?: WindowsServiceStatus; service?: ManagedService }> {
  const service = MANAGED_SERVICES[serviceId];
  if (!service) {
    return {
      success: false,
      error: `Unknown service: ${serviceId}`
    };
  }

  const result = await getWindowsServiceStatus(service.processName, user);
  return {
    ...result,
    service
  };
}

/**
 * Start a managed service by ID
 */
export async function startManagedService(
  serviceId: ManagedServiceId,
  user?: string
): Promise<CommandResult> {
  const service = MANAGED_SERVICES[serviceId];
  if (!service) {
    return {
      success: false,
      error: `Unknown service: ${serviceId}`
    };
  }

  return startWindowsService(service.processName, service.startCommand, user);
}

/**
 * Stop a managed service by ID
 */
export async function stopManagedService(
  serviceId: ManagedServiceId,
  user?: string
): Promise<CommandResult> {
  const service = MANAGED_SERVICES[serviceId];
  if (!service) {
    return {
      success: false,
      error: `Unknown service: ${serviceId}`
    };
  }

  return stopWindowsService(service.processName, user);
}

/**
 * Check the health of a managed service via HTTP
 */
export async function checkManagedServiceHealth(
  serviceId: ManagedServiceId
): Promise<CommandResult & { healthy?: boolean }> {
  const service = MANAGED_SERVICES[serviceId];
  if (!service) {
    return {
      success: false,
      error: `Unknown service: ${serviceId}`
    };
  }

  try {
    const url = `http://${WINDOWS_HOST}:${service.port}${service.healthEndpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, { 
      signal: controller.signal,
      method: 'GET'
    });
    
    clearTimeout(timeoutId);

    return {
      success: true,
      healthy: response.ok
    };
  } catch (err: any) {
    return {
      success: true,
      healthy: false,
      error: err.message
    };
  }
}

/**
 * Get comprehensive status for all managed services
 */
export async function getAllManagedServicesStatus(user?: string): Promise<{
  success: boolean;
  services: Array<{
    id: ManagedServiceId;
    name: string;
    running: boolean;
    healthy: boolean;
    port: number;
    autostart: boolean;
  }>;
}> {
  const services: Array<{
    id: ManagedServiceId;
    name: string;
    running: boolean;
    healthy: boolean;
    port: number;
    autostart: boolean;
  }> = [];

  const serviceIds = Object.keys(MANAGED_SERVICES) as ManagedServiceId[];
  
  // Get startup tasks once
  const startupTasksResult = await getWindowsStartupTasks(user);
  const startupTaskNames = startupTasksResult.tasks?.map(task => task.name.toLowerCase()) || [];
  
  const results = await Promise.all(
    serviceIds.map(async (id) => {
      const [statusResult, healthResult] = await Promise.all([
        getManagedServiceStatus(id, user),
        checkManagedServiceHealth(id)
      ]);

      const serviceAutostart = startupTaskNames.some(taskName => 
        taskName.includes(id.toLowerCase())
      );

      return {
        id,
        name: MANAGED_SERVICES[id].name,
        running: statusResult.status?.running || false,
        healthy: healthResult.healthy || false,
        port: MANAGED_SERVICES[id].port,
        autostart: serviceAutostart
      };
    })
  );

  return {
    success: true,
    services: results
  };
}

// Export host configuration for API routes
export const VM_CONFIG = {
  ubuntuHost: UBUNTU_HOST,
  ubuntuUser: UBUNTU_USER,
  windowsHost: WINDOWS_HOST,
  windowsUser: WINDOWS_USER,
  defaultTimeout: DEFAULT_TIMEOUT
};
