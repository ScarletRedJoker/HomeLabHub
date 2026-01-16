import * as os from "os";
import * as path from "path";

export type Platform = "windows" | "linux" | "darwin";

export function detectPlatform(): Platform {
  const platform = process.platform;
  switch (platform) {
    case "win32":
      return "windows";
    case "darwin":
      return "darwin";
    default:
      return "linux";
  }
}

export interface ServiceCommand {
  start: string;
  stop: string;
  status: string;
  restart?: string;
}

export interface ServiceCommands {
  ollama: ServiceCommand;
  comfyui: ServiceCommand;
  "stable-diffusion": ServiceCommand;
  sunshine: ServiceCommand;
}

const serviceCommands: Record<Platform, ServiceCommands> = {
  windows: {
    ollama: {
      start: "net start ollama",
      stop: "net stop ollama",
      status: 'tasklist /FI "IMAGENAME eq ollama.exe" /FO CSV /NH',
      restart: "net stop ollama & net start ollama",
    },
    comfyui: {
      start: "cd C:\\AI\\ComfyUI && start python main.py --listen",
      stop: 'taskkill /F /IM python.exe /FI "WINDOWTITLE eq ComfyUI"',
      status: 'tasklist /FI "IMAGENAME eq python.exe" /FO CSV /NH',
    },
    "stable-diffusion": {
      start: "cd C:\\AI\\stable-diffusion-webui && start webui.bat",
      stop: 'taskkill /F /IM python.exe /FI "WINDOWTITLE eq Stable*"',
      status: 'netstat -an | findstr :7860',
    },
    sunshine: {
      start: "net start sunshine",
      stop: "net stop sunshine",
      status: 'netstat -an | findstr :47989',
    },
  },
  linux: {
    ollama: {
      start: "systemctl start ollama",
      stop: "systemctl stop ollama",
      status: "systemctl status ollama",
      restart: "systemctl restart ollama",
    },
    comfyui: {
      start: "cd /opt/ComfyUI && python main.py --listen &",
      stop: "pkill -f 'ComfyUI/main.py'",
      status: "pgrep -f 'ComfyUI/main.py'",
    },
    "stable-diffusion": {
      start: "cd /opt/stable-diffusion-webui && ./webui.sh &",
      stop: "pkill -f 'stable-diffusion-webui'",
      status: "ss -tlnp | grep :7860",
    },
    sunshine: {
      start: "systemctl start sunshine",
      stop: "systemctl stop sunshine",
      status: "systemctl status sunshine",
    },
  },
  darwin: {
    ollama: {
      start: "brew services start ollama",
      stop: "brew services stop ollama",
      status: "brew services list | grep ollama",
      restart: "brew services restart ollama",
    },
    comfyui: {
      start: "cd ~/ComfyUI && python main.py --listen &",
      stop: "pkill -f 'ComfyUI/main.py'",
      status: "pgrep -f 'ComfyUI/main.py'",
    },
    "stable-diffusion": {
      start: "cd ~/stable-diffusion-webui && ./webui.sh &",
      stop: "pkill -f 'stable-diffusion-webui'",
      status: "lsof -i :7860",
    },
    sunshine: {
      start: "echo 'Sunshine not supported on macOS'",
      stop: "echo 'Sunshine not supported on macOS'",
      status: "echo 'Sunshine not supported on macOS'",
    },
  },
};

export function getServiceCommands(platform: Platform): ServiceCommands {
  return serviceCommands[platform];
}

export interface DefaultPaths {
  ollama: string;
  comfyui: string;
  stableDiffusion: string;
  models: string;
  tokenFile: string;
}

const defaultPaths: Record<Platform, DefaultPaths> = {
  windows: {
    ollama: "C:\\Users\\*\\AppData\\Local\\Programs\\Ollama",
    comfyui: "C:\\AI\\ComfyUI",
    stableDiffusion: "C:\\AI\\stable-diffusion-webui",
    models: "C:\\AI\\models",
    tokenFile: "C:\\AI\\nebula-agent\\agent-token.txt",
  },
  linux: {
    ollama: "/usr/local/bin/ollama",
    comfyui: "/opt/ComfyUI",
    stableDiffusion: "/opt/stable-diffusion-webui",
    models: "/opt/models",
    tokenFile: path.join(os.homedir(), ".nebula-agent", "agent-token.txt"),
  },
  darwin: {
    ollama: "/usr/local/bin/ollama",
    comfyui: path.join(os.homedir(), "ComfyUI"),
    stableDiffusion: path.join(os.homedir(), "stable-diffusion-webui"),
    models: path.join(os.homedir(), "models"),
    tokenFile: path.join(os.homedir(), ".nebula-agent", "agent-token.txt"),
  },
};

export function getDefaultPaths(platform: Platform): DefaultPaths {
  return defaultPaths[platform];
}

export function getShell(platform: Platform): string {
  switch (platform) {
    case "windows":
      return "cmd.exe";
    case "darwin":
    case "linux":
    default:
      return "/bin/bash";
  }
}

export interface GpuCommand {
  nvidia: string;
  amd: string;
}

const gpuCommands: Record<Platform, GpuCommand> = {
  windows: {
    nvidia: "nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu --format=csv,noheader,nounits",
    amd: "echo AMD not supported on Windows via CLI",
  },
  linux: {
    nvidia: "nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu --format=csv,noheader,nounits",
    amd: "rocm-smi --showmeminfo vram --showuse --csv",
  },
  darwin: {
    nvidia: "echo NVIDIA not typically available on macOS",
    amd: "echo AMD not supported on macOS",
  },
};

export function getGpuCommands(platform: Platform): GpuCommand {
  return gpuCommands[platform];
}

export interface PortCheckCommand {
  check: (port: number) => string;
}

export function getPortCheckCommand(platform: Platform, port: number): string {
  switch (platform) {
    case "windows":
      return `netstat -an | findstr :${port}`;
    case "linux":
      return `ss -tlnp | grep :${port}`;
    case "darwin":
      return `lsof -i :${port}`;
    default:
      return `netstat -an | grep :${port}`;
  }
}

export interface ProcessCheckResult {
  running: boolean;
  pid?: number;
}

export function getProcessCheckCommand(platform: Platform, processName: string): string {
  switch (platform) {
    case "windows":
      return `tasklist /FI "IMAGENAME eq ${processName}.exe" /FO CSV /NH`;
    case "linux":
    case "darwin":
      return `pgrep -x ${processName}`;
    default:
      return `pgrep -x ${processName}`;
  }
}

export function parseProcessCheckResult(platform: Platform, stdout: string, processName: string): ProcessCheckResult {
  if (platform === "windows") {
    if (stdout.includes(processName)) {
      const match = stdout.match(/"[^"]+","(\d+)"/);
      return { running: true, pid: match ? parseInt(match[1]) : undefined };
    }
    return { running: false };
  } else {
    const pid = parseInt(stdout.trim());
    return { running: !isNaN(pid), pid: isNaN(pid) ? undefined : pid };
  }
}

export function getEnvironmentInfo(platform: Platform): string {
  switch (platform) {
    case "windows":
      return "windows-vm";
    case "linux":
      return "linux-server";
    case "darwin":
      return "macos-workstation";
    default:
      return "unknown";
  }
}
