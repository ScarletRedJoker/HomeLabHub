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
    ],
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔════════════════════════════════════════════════╗
║           Nebula Agent v1.0.0                  ║
║   Windows VM Management Service                ║
╠════════════════════════════════════════════════╣
║   Listening on: http://0.0.0.0:${PORT}            ║
║   Auth: ${AUTH_TOKEN ? "Enabled" : "Disabled (set NEBULA_AGENT_TOKEN)"}                 ║
╚════════════════════════════════════════════════╝
  `);
});
