import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

const STATE_FILE = process.env.LOCAL_AI_STATE_FILE || "/opt/homelab/HomeLabHub/deploy/shared/state/local-ai.json";
const KVM_CONFIG = process.env.KVM_CONFIG || "/etc/kvm-orchestrator.conf";

interface WindowsVMState {
  vmName: string | null;
  vmIp: string | null;
  vmState: string;
  winrmAvailable: boolean;
  sshAvailable: boolean;
  services: {
    ollama?: { status: string; version?: string };
  };
}

async function getVMConfig(): Promise<{ vmName: string; vmIp: string } | null> {
  try {
    const content = await fs.readFile(KVM_CONFIG, "utf-8");
    const lines = content.split("\n");
    let vmName = "";
    let vmIp = "";
    
    for (const line of lines) {
      if (line.startsWith("VM_NAME=")) {
        vmName = line.split("=")[1]?.replace(/"/g, "").trim() || "";
      }
      if (line.startsWith("VM_IP=")) {
        vmIp = line.split("=")[1]?.replace(/"/g, "").trim() || "";
      }
    }
    
    if (vmName && vmIp) {
      return { vmName, vmIp };
    }
    return null;
  } catch {
    return null;
  }
}

async function checkPort(host: string, port: number, timeout = 2000): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `timeout ${timeout / 1000} bash -c "echo >/dev/tcp/${host}/${port}" 2>/dev/null && echo "open" || echo "closed"`,
      { timeout: timeout + 1000 }
    );
    return stdout.trim() === "open";
  } catch {
    return false;
  }
}

async function executeWinRM(vmIp: string, command: string, username?: string, password?: string): Promise<{ success: boolean; output: string; error?: string }> {
  const user = username || process.env.WINDOWS_USER || "Evin";
  const pass = password || process.env.WINDOWS_PASSWORD;
  
  if (!pass) {
    return { success: false, output: "", error: "Windows password not configured. Set WINDOWS_PASSWORD environment variable." };
  }
  
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  const configPath = `/tmp/.winrm_config_${timestamp}_${randomId}.json`;
  const scriptPath = `/tmp/.winrm_exec_${timestamp}_${randomId}.py`;
  
  const config = JSON.stringify({
    host: vmIp,
    user: user,
    pass: pass,
    cmd: command,
  });
  
  const script = `
import json
import sys
import os

config_path = sys.argv[1]
with open(config_path, 'r') as f:
    cfg = json.load(f)
os.unlink(config_path)

try:
    import winrm
    session = winrm.Session(
        f'http://{cfg["host"]}:5985/wsman',
        auth=(cfg["user"], cfg["pass"]),
        transport='ntlm'
    )
    result = session.run_ps(cfg["cmd"])
    output = {
        'success': result.status_code == 0,
        'output': result.std_out.decode('utf-8', errors='replace'),
        'error': result.std_err.decode('utf-8', errors='replace') if result.std_err else None
    }
    print(json.dumps(output))
except ImportError:
    print(json.dumps({'success': False, 'output': '', 'error': 'pywinrm not installed. Run: pip install pywinrm'}))
except Exception as e:
    print(json.dumps({'success': False, 'output': '', 'error': str(e)}))
`;

  try {
    await fs.writeFile(configPath, config, { mode: 0o600 });
    await fs.writeFile(scriptPath, script, { mode: 0o600 });
    
    const { stdout } = await execAsync(`python3 ${scriptPath} ${configPath}`, {
      timeout: 30000,
    });
    
    await fs.unlink(scriptPath).catch(() => {});
    await fs.unlink(configPath).catch(() => {});
    
    const result = JSON.parse(stdout.trim());
    return result;
  } catch (error: any) {
    await fs.unlink(scriptPath).catch(() => {});
    await fs.unlink(configPath).catch(() => {});
    return { success: false, output: "", error: error.message || "WinRM execution failed" };
  }
}

async function executeSSH(vmIp: string, command: string, username?: string): Promise<{ success: boolean; output: string; error?: string }> {
  const user = username || process.env.WINDOWS_USER || "Evin";
  
  const allowedCommands = [
    /^powershell\s+-Command\s+/,
    /^tasklist\s+/,
    /^shutdown\s+/,
    /^ollama\s+(pull|list|run|serve|show|ps|stop)\s*/,
    /^systeminfo$/,
    /^whoami$/,
    /^hostname$/,
    /^dir\s*/,
    /^ls\s*/,
    /^cat\s+/,
    /^type\s+/,
  ];
  
  const isAllowed = allowedCommands.some(pattern => pattern.test(command));
  if (!isAllowed) {
    const dangerousPatterns = [/[;&|`$(){}[\]<>]/, /\beval\b/, /\bexec\b/, /\brm\b/, /\bdel\b/];
    const isDangerous = dangerousPatterns.some(pattern => pattern.test(command));
    if (isDangerous) {
      return { success: false, output: "", error: "Command contains potentially dangerous characters or patterns" };
    }
  }
  
  const { spawn } = require("child_process");
  
  return new Promise((resolve) => {
    const sshArgs = [
      "-o", "ConnectTimeout=5",
      "-o", "StrictHostKeyChecking=no",
      "-o", "BatchMode=yes",
      `${user}@${vmIp}`,
      command
    ];
    
    const proc = spawn("ssh", sshArgs, {
      timeout: 30000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    
    let stdout = "";
    let stderr = "";
    
    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    
    proc.on("error", (error: Error) => {
      resolve({ success: false, output: "", error: error.message });
    });
    
    proc.on("close", (code: number | null) => {
      if (code === 0) {
        resolve({ success: true, output: stdout, error: stderr || undefined });
      } else {
        resolve({ success: false, output: stdout, error: stderr || `Process exited with code ${code}` });
      }
    });
    
    setTimeout(() => {
      proc.kill("SIGTERM");
      resolve({ success: false, output: "", error: "Command timed out" });
    }, 30000);
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "status";
  
  try {
    const vmConfig = await getVMConfig();
    
    if (!vmConfig) {
      return NextResponse.json({
        success: false,
        error: "Windows VM not configured. Run kvm-orchestrator.sh discover",
        vmState: null
      });
    }
    
    const { vmName, vmIp } = vmConfig;
    
    switch (action) {
      case "status": {
        const [winrmHttp, winrmHttps, ssh, rdp, ollama] = await Promise.all([
          checkPort(vmIp, 5985),
          checkPort(vmIp, 5986),
          checkPort(vmIp, 22),
          checkPort(vmIp, 3389),
          checkPort(vmIp, 11434),
        ]);
        
        let ollamaVersion: string | undefined;
        if (ollama) {
          try {
            const { stdout } = await execAsync(`curl -sf --connect-timeout 2 http://${vmIp}:11434/api/version`);
            const data = JSON.parse(stdout);
            ollamaVersion = data.version;
          } catch {}
        }
        
        let vmState = "unknown";
        try {
          const { stdout } = await execAsync(`virsh domstate "${vmName}" 2>/dev/null || echo "unknown"`);
          vmState = stdout.trim();
        } catch {}
        
        const state: WindowsVMState = {
          vmName,
          vmIp,
          vmState,
          winrmAvailable: winrmHttp || winrmHttps,
          sshAvailable: ssh,
          services: {
            ollama: ollama ? { status: "online", version: ollamaVersion } : { status: "offline" }
          }
        };
        
        return NextResponse.json({
          success: true,
          ...state,
          ports: {
            winrmHttp: { port: 5985, available: winrmHttp },
            winrmHttps: { port: 5986, available: winrmHttps },
            ssh: { port: 22, available: ssh },
            rdp: { port: 3389, available: rdp },
            ollama: { port: 11434, available: ollama }
          }
        });
      }
      
      case "processes": {
        const result = await executeSSH(vmIp, "tasklist /FO CSV | head -20");
        return NextResponse.json(result);
      }
      
      case "services": {
        const result = await executeSSH(vmIp, "powershell -Command \"Get-Service | Where-Object {$_.Status -eq 'Running'} | Select-Object -First 20 Name,DisplayName,Status | ConvertTo-Json\"");
        if (result.success) {
          try {
            result.output = JSON.parse(result.output);
          } catch {}
        }
        return NextResponse.json(result);
      }
      
      case "system-info": {
        const result = await executeSSH(vmIp, "powershell -Command \"Get-ComputerInfo | Select-Object CsName,WindowsVersion,OsArchitecture,CsProcessors,CsTotalPhysicalMemory | ConvertTo-Json\"");
        if (result.success) {
          try {
            result.output = JSON.parse(result.output);
          } catch {}
        }
        return NextResponse.json(result);
      }
      
      default:
        return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, command, package: packageName, method } = body;
    
    const vmConfig = await getVMConfig();
    if (!vmConfig) {
      return NextResponse.json({
        success: false,
        error: "Windows VM not configured"
      }, { status: 400 });
    }
    
    const { vmIp } = vmConfig;
    
    switch (action) {
      case "execute": {
        if (!command) {
          return NextResponse.json({ success: false, error: "Command required" }, { status: 400 });
        }
        
        const execMethod = method || "ssh";
        let result;
        
        if (execMethod === "winrm") {
          result = await executeWinRM(vmIp, command);
        } else {
          result = await executeSSH(vmIp, command);
        }
        
        return NextResponse.json(result);
      }
      
      case "install": {
        if (!packageName) {
          return NextResponse.json({ success: false, error: "Package name required" }, { status: 400 });
        }
        
        const installCmd = `powershell -Command "winget install --accept-package-agreements --accept-source-agreements ${packageName}"`;
        const result = await executeSSH(vmIp, installCmd);
        return NextResponse.json(result);
      }
      
      case "uninstall": {
        if (!packageName) {
          return NextResponse.json({ success: false, error: "Package name required" }, { status: 400 });
        }
        
        const uninstallCmd = `powershell -Command "winget uninstall ${packageName}"`;
        const result = await executeSSH(vmIp, uninstallCmd);
        return NextResponse.json(result);
      }
      
      case "start-service": {
        const { serviceName } = body;
        if (!serviceName) {
          return NextResponse.json({ success: false, error: "Service name required" }, { status: 400 });
        }
        
        const result = await executeSSH(vmIp, `powershell -Command "Start-Service '${serviceName}'"`);
        return NextResponse.json(result);
      }
      
      case "stop-service": {
        const { serviceName } = body;
        if (!serviceName) {
          return NextResponse.json({ success: false, error: "Service name required" }, { status: 400 });
        }
        
        const result = await executeSSH(vmIp, `powershell -Command "Stop-Service '${serviceName}'"`);
        return NextResponse.json(result);
      }
      
      case "restart": {
        const result = await executeSSH(vmIp, "shutdown /r /t 5 /c \"Remote restart from dashboard\"");
        return NextResponse.json(result);
      }
      
      case "shutdown": {
        const result = await executeSSH(vmIp, "shutdown /s /t 5 /c \"Remote shutdown from dashboard\"");
        return NextResponse.json(result);
      }
      
      case "ollama-pull": {
        const { model } = body;
        if (!model) {
          return NextResponse.json({ success: false, error: "Model name required" }, { status: 400 });
        }
        
        const result = await executeSSH(vmIp, `ollama pull ${model}`);
        return NextResponse.json(result);
      }
      
      case "ollama-list": {
        const result = await executeSSH(vmIp, "ollama list");
        return NextResponse.json(result);
      }
      
      default:
        return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
