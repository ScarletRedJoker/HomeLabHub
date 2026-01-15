import express from "express";
import cors from "cors";
import helmet from "helmet";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";

const execAsync = promisify(exec);

const app = express();
const PORT = parseInt(process.env.AGENT_PORT || "9765", 10);
const AUTH_TOKEN = process.env.NEBULA_AGENT_TOKEN;

app.use(helmet());
app.use(cors());
app.use(express.json());

function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!AUTH_TOKEN) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Missing authorization header" });
  }

  const token = authHeader.slice(7);
  if (token !== AUTH_TOKEN) {
    return res.status(403).json({ success: false, error: "Invalid token" });
  }

  next();
}

app.use(authMiddleware);

app.get("/api/health", async (req, res) => {
  try {
    const uptime = os.uptime();
    const hostname = os.hostname();
    const platform = os.platform();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    let gpu = null;
    try {
      const { stdout } = await execAsync("nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu --format=csv,noheader,nounits");
      const [name, memTotal, memUsed, memFree, utilization] = stdout.trim().split(", ");
      gpu = {
        name: name.trim(),
        memoryTotal: parseInt(memTotal),
        memoryUsed: parseInt(memUsed),
        memoryFree: parseInt(memFree),
        utilization: parseInt(utilization),
      };
    } catch {
      gpu = null;
    }

    res.json({
      success: true,
      hostname,
      platform,
      uptime,
      memory: {
        total: Math.round(totalMem / 1024 / 1024 / 1024),
        free: Math.round(freeMem / 1024 / 1024 / 1024),
        used: Math.round((totalMem - freeMem) / 1024 / 1024 / 1024),
      },
      gpu,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/execute", async (req, res) => {
  const { command, cwd, timeout = 120000 } = req.body;

  if (!command) {
    return res.status(400).json({ success: false, error: "Missing command parameter" });
  }

  console.log(`[Execute] Running: ${command.substring(0, 100)}...`);

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: cwd || process.cwd(),
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
    });

    res.json({
      success: true,
      output: stdout + (stderr ? `\nSTDERR:\n${stderr}` : ""),
    });
  } catch (error: any) {
    console.error(`[Execute] Error: ${error.message}`);
    res.json({
      success: false,
      error: error.message,
      output: error.stdout || "",
      stderr: error.stderr || "",
    });
  }
});

app.get("/api/models", async (req, res) => {
  try {
    const models: Record<string, any> = {
      ollama: [],
      stableDiffusion: [],
      comfyui: [],
    };

    try {
      const { stdout } = await execAsync("ollama list");
      const lines = stdout.trim().split("\n").slice(1);
      models.ollama = lines.map(line => {
        const parts = line.split(/\s+/);
        return { name: parts[0], size: parts[2], modified: parts.slice(3).join(" ") };
      }).filter(m => m.name);
    } catch {
      models.ollama = [];
    }

    const sdModelsPath = "C:\\AI\\stable-diffusion-webui\\models\\Stable-diffusion";
    try {
      if (fs.existsSync(sdModelsPath)) {
        const files = fs.readdirSync(sdModelsPath);
        models.stableDiffusion = files
          .filter(f => f.endsWith(".safetensors") || f.endsWith(".ckpt"))
          .map(f => ({
            name: f.replace(/\.(safetensors|ckpt)$/, ""),
            file: f,
            path: path.join(sdModelsPath, f),
          }));
      }
    } catch {
      models.stableDiffusion = [];
    }

    const comfyModelsPath = "C:\\AI\\ComfyUI\\models\\checkpoints";
    try {
      if (fs.existsSync(comfyModelsPath)) {
        const files = fs.readdirSync(comfyModelsPath);
        models.comfyui = files
          .filter(f => f.endsWith(".safetensors") || f.endsWith(".ckpt"))
          .map(f => ({
            name: f.replace(/\.(safetensors|ckpt)$/, ""),
            file: f,
            path: path.join(comfyModelsPath, f),
          }));
      }
    } catch {
      models.comfyui = [];
    }

    res.json({ success: true, models });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/services", async (req, res) => {
  const services: Record<string, { status: string; port?: number; pid?: number }> = {};

  const checkPort = async (port: number): Promise<boolean> => {
    try {
      const cmd = process.platform === "win32"
        ? `netstat -an | findstr :${port}`
        : `netstat -an | grep :${port}`;
      await execAsync(cmd);
      return true;
    } catch {
      return false;
    }
  };

  const checkProcess = async (name: string): Promise<{ running: boolean; pid?: number }> => {
    try {
      const cmd = process.platform === "win32"
        ? `tasklist /FI "IMAGENAME eq ${name}.exe" /FO CSV /NH`
        : `pgrep -x ${name}`;
      const { stdout } = await execAsync(cmd);
      if (process.platform === "win32") {
        if (stdout.includes(name)) {
          const match = stdout.match(/"[^"]+","(\d+)"/);
          return { running: true, pid: match ? parseInt(match[1]) : undefined };
        }
      } else {
        return { running: true, pid: parseInt(stdout.trim()) };
      }
    } catch {
      return { running: false };
    }
    return { running: false };
  };

  const ollamaPort = await checkPort(11434);
  const ollamaProc = await checkProcess("ollama");
  services.ollama = {
    status: ollamaPort ? "online" : "offline",
    port: 11434,
    pid: ollamaProc.pid,
  };

  const sdPort = await checkPort(7860);
  services["stable-diffusion"] = {
    status: sdPort ? "online" : "offline",
    port: 7860,
  };

  const comfyPort = await checkPort(8188);
  services.comfyui = {
    status: comfyPort ? "online" : "offline",
    port: 8188,
  };

  const sunshinePort = await checkPort(47989);
  services.sunshine = {
    status: sunshinePort ? "online" : "offline",
    port: 47989,
  };

  res.json({ success: true, services });
});

app.post("/api/services/:name/restart", async (req, res) => {
  const { name } = req.params;

  const serviceCommands: Record<string, { stop: string; start: string }> = {
    ollama: {
      stop: "net stop ollama",
      start: "net start ollama",
    },
    "stable-diffusion": {
      stop: 'taskkill /F /IM python.exe /FI "WINDOWTITLE eq Stable*"',
      start: "cd C:\\AI\\stable-diffusion-webui && start webui.bat",
    },
    comfyui: {
      stop: 'taskkill /F /IM python.exe /FI "WINDOWTITLE eq ComfyUI"',
      start: "cd C:\\AI\\ComfyUI && start python main.py --listen",
    },
    sunshine: {
      stop: "net stop sunshine",
      start: "net start sunshine",
    },
  };

  const cmds = serviceCommands[name];
  if (!cmds) {
    return res.status(400).json({ success: false, error: `Unknown service: ${name}` });
  }

  try {
    console.log(`[Service] Restarting ${name}...`);
    try {
      await execAsync(cmds.stop, { shell: "cmd.exe" });
    } catch {
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
    await execAsync(cmds.start, { shell: "cmd.exe" });
    
    res.json({ success: true, message: `Service ${name} restarted` });
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

app.post("/api/git/pull", async (req, res) => {
  const { path: repoPath = "C:\\HomeLabHub" } = req.body;

  try {
    const { stdout, stderr } = await execAsync(`cd "${repoPath}" && git pull origin main`, {
      shell: "cmd.exe",
    });

    res.json({
      success: true,
      output: stdout + (stderr ? `\n${stderr}` : ""),
    });
  } catch (error: any) {
    res.json({
      success: false,
      error: error.message,
      output: error.stdout || "",
    });
  }
});

const SD_WEBUI_URL = "http://127.0.0.1:7860";
const SD_MODELS_PATH = "C:\\AI\\stable-diffusion-webui\\models\\Stable-diffusion";
const SD_LORA_PATH = "C:\\AI\\stable-diffusion-webui\\models\\Lora";

const REGISTRY_URL = process.env.DASHBOARD_REGISTRY_URL || "https://dashboard.evindrake.net/api/registry";
const SERVICE_NAME = "nebula-agent";
const SERVICE_CAPABILITIES = ["ai", "ollama", "stable-diffusion", "comfyui", "gpu"];
const HEARTBEAT_INTERVAL = 30000;

let heartbeatTimer: NodeJS.Timeout | null = null;
let isShuttingDown = false;

async function getServiceEndpoint(): Promise<string> {
  const tailscaleIp = process.env.TAILSCALE_IP || "100.118.44.102";
  return `http://${tailscaleIp}:${PORT}`;
}

async function registerWithRegistry(): Promise<boolean> {
  try {
    const endpoint = await getServiceEndpoint();
    const response = await fetch(REGISTRY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(AUTH_TOKEN ? { "Authorization": `Bearer ${AUTH_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        action: "register",
        name: SERVICE_NAME,
        capabilities: SERVICE_CAPABILITIES,
        endpoint,
        metadata: {
          environment: "windows-vm",
          hostname: os.hostname(),
          platform: os.platform(),
          startedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`[Registry] Registered as ${SERVICE_NAME}: ${result.message || "success"}`);
      return true;
    } else {
      console.warn(`[Registry] Registration failed: ${response.status}`);
      return false;
    }
  } catch (error: any) {
    console.warn(`[Registry] Registration error: ${error.message}`);
    return false;
  }
}

async function sendHeartbeatToRegistry(): Promise<void> {
  if (isShuttingDown) return;
  
  try {
    const response = await fetch(REGISTRY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(AUTH_TOKEN ? { "Authorization": `Bearer ${AUTH_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        action: "heartbeat",
        name: SERVICE_NAME,
      }),
    });

    if (!response.ok) {
      console.warn(`[Registry] Heartbeat failed: ${response.status}, re-registering...`);
      await registerWithRegistry();
    }
  } catch (error: any) {
    console.warn(`[Registry] Heartbeat error: ${error.message}`);
  }
}

async function unregisterFromRegistry(): Promise<void> {
  try {
    await fetch(REGISTRY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(AUTH_TOKEN ? { "Authorization": `Bearer ${AUTH_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        action: "unregister",
        name: SERVICE_NAME,
      }),
    });
    console.log("[Registry] Unregistered from service registry");
  } catch (error: any) {
    console.warn(`[Registry] Unregistration error: ${error.message}`);
  }
}

function startHeartbeat(): void {
  if (heartbeatTimer) return;
  
  heartbeatTimer = setInterval(() => {
    sendHeartbeatToRegistry();
  }, HEARTBEAT_INTERVAL);
  
  console.log(`[Registry] Heartbeat started (every ${HEARTBEAT_INTERVAL / 1000}s)`);
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function detectModelType(filename: string, folder: string): "checkpoint" | "motion" | "lora" {
  const lower = filename.toLowerCase();
  
  if (folder.toLowerCase().includes("lora")) {
    return "lora";
  }
  
  if (lower.startsWith("mm_") || 
      lower.startsWith("mm-") || 
      lower.includes("motion") ||
      lower.includes("animatediff") ||
      lower.includes("_motion_") ||
      lower.includes("-motion-")) {
    return "motion";
  }
  
  return "checkpoint";
}

app.get("/api/sd/status", async (req, res) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const optionsRes = await fetch(`${SD_WEBUI_URL}/sdapi/v1/options`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    
    if (!optionsRes.ok) {
      return res.json({
        success: true,
        available: false,
        error: `SD WebUI returned ${optionsRes.status}`,
      });
    }
    
    const options = await optionsRes.json();
    
    let progress = null;
    try {
      const progressRes = await fetch(`${SD_WEBUI_URL}/sdapi/v1/progress`);
      if (progressRes.ok) {
        progress = await progressRes.json();
      }
    } catch {}
    
    let memory = null;
    try {
      const memRes = await fetch(`${SD_WEBUI_URL}/sdapi/v1/memory`);
      if (memRes.ok) {
        const memData = await memRes.json();
        if (memData.cuda) {
          memory = {
            total: memData.cuda.system?.total || 0,
            used: memData.cuda.system?.used || 0,
            free: memData.cuda.system?.free || 0,
          };
        }
      }
    } catch {}
    
    res.json({
      success: true,
      available: true,
      currentModel: options.sd_model_checkpoint || null,
      sampler: options.sampler_name || null,
      clipSkip: options.CLIP_stop_at_last_layers || 1,
      isGenerating: progress?.state?.job_count > 0,
      progress: progress?.progress || 0,
      memory,
    });
  } catch (error: any) {
    res.json({
      success: true,
      available: false,
      error: error.message,
    });
  }
});

app.get("/api/sd/models", async (req, res) => {
  try {
    const models: {
      title: string;
      model_name: string;
      filename: string;
      type: "checkpoint" | "motion" | "lora";
      hash?: string;
      isLoaded?: boolean;
    }[] = [];
    
    let currentModel: string | null = null;
    let sdApiModels: any[] = [];
    
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const [optionsRes, modelsRes] = await Promise.all([
        fetch(`${SD_WEBUI_URL}/sdapi/v1/options`, { signal: controller.signal }),
        fetch(`${SD_WEBUI_URL}/sdapi/v1/sd-models`, { signal: controller.signal }),
      ]);
      clearTimeout(timeout);
      
      if (optionsRes.ok) {
        const options = await optionsRes.json();
        currentModel = options.sd_model_checkpoint || null;
      }
      
      if (modelsRes.ok) {
        sdApiModels = await modelsRes.json();
      }
    } catch {}
    
    if (sdApiModels.length > 0) {
      for (const model of sdApiModels) {
        const filename = model.filename ? path.basename(model.filename) : model.title;
        models.push({
          title: model.title,
          model_name: model.model_name,
          filename,
          type: detectModelType(filename, model.filename || ""),
          hash: model.hash,
          isLoaded: currentModel === model.title,
        });
      }
    } else {
      try {
        if (fs.existsSync(SD_MODELS_PATH)) {
          const files = fs.readdirSync(SD_MODELS_PATH);
          for (const file of files) {
            if (file.endsWith(".safetensors") || file.endsWith(".ckpt")) {
              const name = file.replace(/\.(safetensors|ckpt)$/, "");
              models.push({
                title: name,
                model_name: name,
                filename: file,
                type: detectModelType(file, SD_MODELS_PATH),
                isLoaded: currentModel?.includes(name) || false,
              });
            }
          }
        }
      } catch {}
    }
    
    let loras: { name: string; filename: string }[] = [];
    try {
      if (fs.existsSync(SD_LORA_PATH)) {
        const files = fs.readdirSync(SD_LORA_PATH);
        loras = files
          .filter(f => f.endsWith(".safetensors") || f.endsWith(".ckpt"))
          .map(f => ({
            name: f.replace(/\.(safetensors|ckpt)$/, ""),
            filename: f,
          }));
      }
    } catch {}
    
    const checkpoints = models.filter(m => m.type === "checkpoint");
    const motionModules = models.filter(m => m.type === "motion");
    
    res.json({
      success: true,
      currentModel,
      models,
      checkpoints,
      motionModules,
      loras,
      counts: {
        checkpoints: checkpoints.length,
        motionModules: motionModules.length,
        loras: loras.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/sd/switch-model", async (req, res) => {
  const { model } = req.body;
  
  if (!model) {
    return res.status(400).json({ success: false, error: "Model name is required" });
  }
  
  console.log(`[SD] Switching model to: ${model}`);
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const checkRes = await fetch(`${SD_WEBUI_URL}/sdapi/v1/options`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    
    if (!checkRes.ok) {
      return res.status(503).json({
        success: false,
        error: "SD WebUI is not available",
      });
    }
    
    const switchController = new AbortController();
    const switchTimeout = setTimeout(() => switchController.abort(), 120000);
    
    const switchRes = await fetch(`${SD_WEBUI_URL}/sdapi/v1/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sd_model_checkpoint: model,
      }),
      signal: switchController.signal,
    });
    clearTimeout(switchTimeout);
    
    if (!switchRes.ok) {
      const errorText = await switchRes.text();
      return res.status(500).json({
        success: false,
        error: `Failed to switch model: ${errorText}`,
      });
    }
    
    const verifyRes = await fetch(`${SD_WEBUI_URL}/sdapi/v1/options`);
    let verifiedModel = null;
    if (verifyRes.ok) {
      const options = await verifyRes.json();
      verifiedModel = options.sd_model_checkpoint;
    }
    
    console.log(`[SD] Model switched successfully to: ${verifiedModel || model}`);
    
    res.json({
      success: true,
      message: `Model switched to ${model}`,
      currentModel: verifiedModel || model,
    });
  } catch (error: any) {
    console.error(`[SD] Error switching model:`, error);
    
    if (error.name === "AbortError") {
      return res.status(504).json({
        success: false,
        error: "Model switch timed out. The model may still be loading.",
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/", (req, res) => {
  res.json({
    name: "Nebula Agent",
    version: "1.0.0",
    status: "running",
    endpoints: [
      "GET  /api/health",
      "POST /api/execute",
      "GET  /api/models",
      "GET  /api/services",
      "POST /api/services/:name/restart",
      "POST /api/git/pull",
      "GET  /api/sd/status",
      "GET  /api/sd/models",
      "POST /api/sd/switch-model",
    ],
  });
});

const server = app.listen(PORT, "0.0.0.0", async () => {
  console.log(`
╔════════════════════════════════════════════════╗
║           Nebula Agent v1.0.0                  ║
║   Windows VM Management Service                ║
╠════════════════════════════════════════════════╣
║   Listening on: http://0.0.0.0:${PORT}            ║
║   Auth: ${AUTH_TOKEN ? "Enabled" : "Disabled (set NEBULA_AGENT_TOKEN)"}                 ║
╚════════════════════════════════════════════════╝
  `);

  const registered = await registerWithRegistry();
  if (registered) {
    startHeartbeat();
  } else {
    console.warn("[Registry] Running without service registry registration");
    setTimeout(async () => {
      const retried = await registerWithRegistry();
      if (retried) startHeartbeat();
    }, 30000);
  }
});

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`\n[Shutdown] ${signal} received, cleaning up...`);
  
  stopHeartbeat();
  await unregisterFromRegistry();
  
  server.close(() => {
    console.log("[Shutdown] Server closed");
    process.exit(0);
  });
  
  setTimeout(() => {
    console.log("[Shutdown] Force exit after timeout");
    process.exit(1);
  }, 5000);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
