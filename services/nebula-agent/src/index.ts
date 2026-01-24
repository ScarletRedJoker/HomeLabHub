import express from "express";
import cors from "cors";
import helmet from "helmet";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const execAsync = promisify(exec);

const app = express();
const PORT = parseInt(process.env.AGENT_PORT || "9765", 10);

/**
 * Per-node token system
 * Token file location on Windows: C:\AI\nebula-agent\agent-token.txt
 */
const TOKEN_FILE_PATH = process.platform === "win32" 
  ? "C:\\AI\\nebula-agent\\agent-token.txt"
  : path.join(os.homedir(), ".nebula-agent", "agent-token.txt");

interface TokenInfo {
  token: string;
  nodeId: string;
  createdAt: string;
  expiresAt: string | null;
}

function generateNodeToken(nodeId: string): TokenInfo {
  const tokenBytes = crypto.randomBytes(32);
  const token = tokenBytes.toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  return {
    token,
    nodeId,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

function loadTokenFromFile(filePath: string): TokenInfo | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as TokenInfo;
  } catch {
    return null;
  }
}

function saveTokenToFile(tokenInfo: TokenInfo, outputPath: string): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(tokenInfo, null, 2));
  console.log(`[TokenManager] Token saved to: ${outputPath}`);
}

function loadOrGenerateToken(): TokenInfo {
  let tokenInfo = loadTokenFromFile(TOKEN_FILE_PATH);
  
  if (!tokenInfo) {
    const nodeId = `${os.hostname()}-${os.platform()}`;
    console.log(`[TokenManager] No token found, generating new one for node: ${nodeId}`);
    tokenInfo = generateNodeToken(nodeId);
    saveTokenToFile(tokenInfo, TOKEN_FILE_PATH);
  } else {
    console.log(`[TokenManager] Loaded existing token for node: ${tokenInfo.nodeId}`);
  }

  return tokenInfo;
}

const tokenInfo = loadOrGenerateToken();
const AUTH_TOKEN = tokenInfo.token;

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

const serviceCommands: Record<string, { stop: string; start: string; port: number }> = {
  ollama: {
    stop: "net stop ollama",
    start: "net start ollama",
    port: 11434,
  },
  "stable-diffusion": {
    stop: 'taskkill /F /IM python.exe /FI "WINDOWTITLE eq Stable*"',
    start: "cd C:\\AI\\stable-diffusion-webui && start webui.bat",
    port: 7860,
  },
  comfyui: {
    stop: 'taskkill /F /IM python.exe /FI "WINDOWTITLE eq ComfyUI"',
    start: "cd C:\\AI\\ComfyUI && start python main.py --listen",
    port: 8188,
  },
  sunshine: {
    stop: "net stop sunshine",
    start: "net start sunshine",
    port: 47989,
  },
};

interface WatchdogEvent {
  id: string;
  timestamp: string;
  type: "health_check" | "restart_attempt" | "restart_success" | "restart_failure" | "watchdog_start" | "watchdog_stop";
  service: string;
  message: string;
  details?: Record<string, any>;
}

interface WatchdogConfig {
  checkIntervalMs: number;
  failureThreshold: number;
  restartTimeoutMs: number;
  services: string[];
  cooldownMs?: number;
  maxRestartsPerWindow?: number;
  restartWindowMs?: number;
}

interface ServiceHealth {
  consecutiveFailures: number;
  lastCheck: string | null;
  lastStatus: "online" | "offline" | null;
  lastRestart: string | null;
  restartCount: number;
  lastRestartAttempt: string | null;
  needsManualIntervention: boolean;
  restartCountInWindow: number;
  cooldownUntil: string | null;
}

class ServiceWatchdog {
  private config: WatchdogConfig & {
    cooldownMs: number;
    maxRestartsPerWindow: number;
    restartWindowMs: number;
  };
  private running: boolean = false;
  private checkTimer: NodeJS.Timeout | null = null;
  private serviceHealth: Map<string, ServiceHealth> = new Map();
  private restartHistory: Map<string, number[]> = new Map();
  private eventLog: WatchdogEvent[] = [];
  private readonly MAX_EVENTS = 100;

  constructor(config?: Partial<WatchdogConfig>) {
    this.config = {
      checkIntervalMs: config?.checkIntervalMs ?? 60000,
      failureThreshold: config?.failureThreshold ?? 3,
      restartTimeoutMs: config?.restartTimeoutMs ?? 60000,
      services: config?.services ?? ["ollama", "stable-diffusion", "comfyui"],
      cooldownMs: config?.cooldownMs ?? 300000,
      maxRestartsPerWindow: config?.maxRestartsPerWindow ?? 3,
      restartWindowMs: config?.restartWindowMs ?? 3600000,
    };

    for (const service of this.config.services) {
      this.serviceHealth.set(service, {
        consecutiveFailures: 0,
        lastCheck: null,
        lastStatus: null,
        lastRestart: null,
        restartCount: 0,
        lastRestartAttempt: null,
        needsManualIntervention: false,
        restartCountInWindow: 0,
        cooldownUntil: null,
      });
      this.restartHistory.set(service, []);
    }
  }

  private addEvent(event: Omit<WatchdogEvent, "id" | "timestamp">): void {
    const fullEvent: WatchdogEvent = {
      id: crypto.randomBytes(8).toString("hex"),
      timestamp: new Date().toISOString(),
      ...event,
    };
    this.eventLog.unshift(fullEvent);
    if (this.eventLog.length > this.MAX_EVENTS) {
      this.eventLog = this.eventLog.slice(0, this.MAX_EVENTS);
    }
    console.log(`[Watchdog] ${event.type}: ${event.service} - ${event.message}`);
  }

  private getRestartCountInWindow(serviceName: string): number {
    const now = Date.now();
    const history = this.restartHistory.get(serviceName) || [];
    return history.filter(timestamp => now - timestamp < this.config.restartWindowMs).length;
  }

  private updateRestartCountInWindow(serviceName: string): void {
    const health = this.serviceHealth.get(serviceName);
    if (health) {
      health.restartCountInWindow = this.getRestartCountInWindow(serviceName);
    }
  }

  private isInCooldown(serviceName: string): boolean {
    const health = this.serviceHealth.get(serviceName);
    if (!health || !health.cooldownUntil) return false;
    return Date.now() < new Date(health.cooldownUntil).getTime();
  }

  private getCooldownRemainingMs(serviceName: string): number {
    const health = this.serviceHealth.get(serviceName);
    if (!health || !health.cooldownUntil) return 0;
    const remaining = new Date(health.cooldownUntil).getTime() - Date.now();
    return Math.max(0, remaining);
  }

  private async checkPort(port: number): Promise<boolean> {
    try {
      const cmd = process.platform === "win32"
        ? `netstat -an | findstr :${port}`
        : `netstat -an | grep :${port}`;
      await execAsync(cmd);
      return true;
    } catch {
      return false;
    }
  }

  private async waitForPort(port: number, timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 2000;

    while (Date.now() - startTime < timeoutMs) {
      if (await this.checkPort(port)) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    return false;
  }

  private async restartService(serviceName: string): Promise<boolean> {
    const cmds = serviceCommands[serviceName];
    if (!cmds) {
      this.addEvent({
        type: "restart_failure",
        service: serviceName,
        message: `Unknown service: ${serviceName}`,
      });
      return false;
    }

    const health = this.serviceHealth.get(serviceName);
    if (!health) return false;

    // Check if we're in cooldown
    if (this.isInCooldown(serviceName)) {
      const remainingMs = this.getCooldownRemainingMs(serviceName);
      this.addEvent({
        type: "health_check",
        service: serviceName,
        message: `Cooldown active - ${Math.ceil(remainingMs / 1000)}s remaining, skipping restart`,
        details: { cooldownRemainingMs: remainingMs },
      });
      return false;
    }

    // Check restart limit in time window
    this.updateRestartCountInWindow(serviceName);
    if (health.restartCountInWindow >= this.config.maxRestartsPerWindow) {
      health.needsManualIntervention = true;
      this.addEvent({
        type: "restart_failure",
        service: serviceName,
        message: `Maximum restart attempts exceeded (${health.restartCountInWindow}/${this.config.maxRestartsPerWindow} in last ${this.config.restartWindowMs / 60000}min) - manual intervention needed`,
        details: { 
          restartCount: health.restartCountInWindow,
          maxRestarts: this.config.maxRestartsPerWindow,
          windowMs: this.config.restartWindowMs,
        },
      });
      return false;
    }

    health.lastRestartAttempt = new Date().toISOString();

    this.addEvent({
      type: "restart_attempt",
      service: serviceName,
      message: `Attempting restart (failure count: ${health.consecutiveFailures}, restart ${health.restartCountInWindow + 1}/${this.config.maxRestartsPerWindow})`,
    });

    try {
      try {
        await execAsync(cmds.stop, { shell: "cmd.exe", timeout: 10000 });
      } catch {}

      await new Promise(resolve => setTimeout(resolve, 3000));
      await execAsync(cmds.start, { shell: "cmd.exe" });

      const cameOnline = await this.waitForPort(cmds.port, this.config.restartTimeoutMs);

      if (cameOnline) {
        // Success - record restart attempt and clear cooldown
        const history = this.restartHistory.get(serviceName) || [];
        history.push(Date.now());
        this.restartHistory.set(serviceName, history);
        
        health.lastRestart = new Date().toISOString();
        health.restartCount++;
        health.consecutiveFailures = 0;
        health.lastStatus = "online";
        health.cooldownUntil = null;
        health.needsManualIntervention = false;
        this.updateRestartCountInWindow(serviceName);
        
        this.addEvent({
          type: "restart_success",
          service: serviceName,
          message: `Service restarted and responding on port ${cmds.port}`,
        });
        return true;
      } else {
        // Failed to start - activate cooldown
        const history = this.restartHistory.get(serviceName) || [];
        history.push(Date.now());
        this.restartHistory.set(serviceName, history);
        
        health.lastRestart = new Date().toISOString();
        health.restartCount++;
        health.cooldownUntil = new Date(Date.now() + this.config.cooldownMs).toISOString();
        this.updateRestartCountInWindow(serviceName);
        
        this.addEvent({
          type: "restart_failure",
          service: serviceName,
          message: `Service started but not responding on port ${cmds.port} after ${this.config.restartTimeoutMs}ms - cooldown activated for ${this.config.cooldownMs / 1000}s`,
          details: { cooldownMs: this.config.cooldownMs },
        });
        return false;
      }
    } catch (error: any) {
      // Exception during restart - activate cooldown
      const history = this.restartHistory.get(serviceName) || [];
      history.push(Date.now());
      this.restartHistory.set(serviceName, history);
      
      health.lastRestart = new Date().toISOString();
      health.restartCount++;
      health.cooldownUntil = new Date(Date.now() + this.config.cooldownMs).toISOString();
      this.updateRestartCountInWindow(serviceName);
      
      this.addEvent({
        type: "restart_failure",
        service: serviceName,
        message: `Restart failed: ${error.message} - cooldown activated for ${this.config.cooldownMs / 1000}s`,
        details: { error: error.message, cooldownMs: this.config.cooldownMs },
      });
      return false;
    }
  }

  private async performHealthCheck(): Promise<void> {
    for (const serviceName of this.config.services) {
      const cmds = serviceCommands[serviceName];
      if (!cmds) continue;

      const isOnline = await this.checkPort(cmds.port);
      const health = this.serviceHealth.get(serviceName);
      
      if (!health) continue;

      health.lastCheck = new Date().toISOString();
      health.lastStatus = isOnline ? "online" : "offline";

      if (isOnline) {
        health.consecutiveFailures = 0;
        this.addEvent({
          type: "health_check",
          service: serviceName,
          message: `Service healthy (port ${cmds.port})`,
        });
      } else {
        health.consecutiveFailures++;
        this.addEvent({
          type: "health_check",
          service: serviceName,
          message: `Service offline - failure ${health.consecutiveFailures}/${this.config.failureThreshold}`,
        });

        if (health.consecutiveFailures >= this.config.failureThreshold) {
          await this.restartService(serviceName);
        }
      }
    }
  }

  start(config?: Partial<WatchdogConfig>): void {
    if (this.running) {
      this.stop();
    }

    if (config) {
      this.config = { ...this.config, ...config };
      for (const service of this.config.services) {
        if (!this.serviceHealth.has(service)) {
          this.serviceHealth.set(service, {
            consecutiveFailures: 0,
            lastCheck: null,
            lastStatus: null,
            lastRestart: null,
            restartCount: 0,
            lastRestartAttempt: null,
            needsManualIntervention: false,
            restartCountInWindow: 0,
            cooldownUntil: null,
          });
          this.restartHistory.set(service, []);
        }
      }
    }

    this.running = true;
    this.addEvent({
      type: "watchdog_start",
      service: "watchdog",
      message: `Started monitoring ${this.config.services.join(", ")} every ${this.config.checkIntervalMs / 1000}s`,
      details: this.config,
    });

    this.performHealthCheck();

    this.checkTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.checkIntervalMs);
  }

  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    this.running = false;
    this.addEvent({
      type: "watchdog_stop",
      service: "watchdog",
      message: "Watchdog stopped",
    });
  }

  isRunning(): boolean {
    return this.running;
  }

  getConfig(): WatchdogConfig {
    return { ...this.config };
  }

  getStatus(): {
    running: boolean;
    config: WatchdogConfig;
    services: Record<string, ServiceHealth>;
    recentEvents: WatchdogEvent[];
  } {
    const services: Record<string, ServiceHealth> = {};
    for (const [name, health] of this.serviceHealth.entries()) {
      services[name] = { ...health };
    }

    return {
      running: this.running,
      config: { ...this.config },
      services,
      recentEvents: this.eventLog.slice(0, 20),
    };
  }

  getEvents(limit: number = 100): WatchdogEvent[] {
    return this.eventLog.slice(0, limit);
  }

  async repairService(serviceName: string): Promise<{ success: boolean; message: string; online: boolean }> {
    const cmds = serviceCommands[serviceName];
    if (!cmds) {
      return { success: false, message: `Unknown service: ${serviceName}`, online: false };
    }

    const wasOnline = await this.checkPort(cmds.port);
    if (wasOnline) {
      return { success: true, message: `Service ${serviceName} is already online`, online: true };
    }

    const restarted = await this.restartService(serviceName);
    const isNowOnline = await this.checkPort(cmds.port);

    return {
      success: restarted,
      message: restarted 
        ? `Service ${serviceName} repaired and online` 
        : `Failed to repair service ${serviceName}`,
      online: isNowOnline,
    };
  }

  resetService(serviceName: string): { success: boolean; message: string } {
    const health = this.serviceHealth.get(serviceName);
    
    if (!health) {
      return { success: false, message: `Service ${serviceName} not found` };
    }

    // Clear cooldown
    health.cooldownUntil = null;
    
    // Clear restart history and counters
    this.restartHistory.set(serviceName, []);
    health.restartCountInWindow = 0;
    
    // Clear manual intervention flag
    health.needsManualIntervention = false;
    
    this.addEvent({
      type: "health_check",
      service: serviceName,
      message: `Watchdog reset: cooldown cleared, restart history cleared, manual intervention flag cleared`,
    });

    return {
      success: true,
      message: `Watchdog reset for service ${serviceName} - cooldown cleared, restart counters reset`,
    };
  }
}

const watchdog = new ServiceWatchdog();

app.post("/api/services/:name/restart", async (req, res) => {
  const { name } = req.params;

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

app.post("/api/watchdog/start", (req, res) => {
  const { checkIntervalMs, failureThreshold, restartTimeoutMs, services } = req.body;

  const config: Partial<WatchdogConfig> = {};
  if (checkIntervalMs) config.checkIntervalMs = Math.max(10000, checkIntervalMs);
  if (failureThreshold) config.failureThreshold = Math.max(1, failureThreshold);
  if (restartTimeoutMs) config.restartTimeoutMs = Math.max(10000, restartTimeoutMs);
  if (services && Array.isArray(services)) {
    config.services = services.filter(s => serviceCommands[s]);
  }

  watchdog.start(Object.keys(config).length > 0 ? config : undefined);

  res.json({
    success: true,
    message: "Watchdog started",
    config: watchdog.getConfig(),
  });
});

app.post("/api/watchdog/stop", (req, res) => {
  watchdog.stop();
  res.json({ success: true, message: "Watchdog stopped" });
});

app.get("/api/watchdog/status", (req, res) => {
  res.json({
    success: true,
    ...watchdog.getStatus(),
  });
});

app.get("/api/watchdog/events", (req, res) => {
  const limit = Math.min(100, parseInt(req.query.limit as string) || 100);
  res.json({
    success: true,
    events: watchdog.getEvents(limit),
  });
});

app.post("/api/watchdog/reset/:service", (req, res) => {
  const { service } = req.params;
  
  const result = watchdog.resetService(service);
  
  res.json({
    success: result.success,
    message: result.message,
    service,
  });
});

app.post("/api/services/repair/:name", async (req, res) => {
  const { name } = req.params;
  
  const result = await watchdog.repairService(name);
  
  res.json({
    success: result.success,
    message: result.message,
    online: result.online,
    service: name,
  });
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
const SD_BASE_PATH = "C:\\AI\\stable-diffusion-webui-forge";
const SD_MODELS_PATH = `${SD_BASE_PATH}\\models\\Stable-diffusion`;
const SD_LORA_PATH = `${SD_BASE_PATH}\\models\\Lora`;
const SD_VAE_PATH = `${SD_BASE_PATH}\\models\\VAE`;
const SD_EMBEDDINGS_PATH = `${SD_BASE_PATH}\\embeddings`;

// Active downloads tracking
const activeDownloads: Map<string, {
  url: string;
  filename: string;
  destination: string;
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  status: "downloading" | "completed" | "failed" | "cancelled";
  error?: string;
  startedAt: string;
  completedAt?: string;
}> = new Map();

// Clean up completed/failed downloads after 5 minutes
setInterval(() => {
  const now = Date.now();
  const expiryMs = 5 * 60 * 1000;
  
  for (const [id, download] of activeDownloads.entries()) {
    if (download.status !== "downloading" && download.completedAt) {
      const completedTime = new Date(download.completedAt).getTime();
      if (now - completedTime > expiryMs) {
        activeDownloads.delete(id);
        console.log(`[Download] Cleaned up stale entry: ${id}`);
      }
    }
  }
}, 60000);

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

app.get("/api/token-info", (req, res) => {
  res.json({
    success: true,
    nodeId: tokenInfo.nodeId,
    createdAt: tokenInfo.createdAt,
    expiresAt: tokenInfo.expiresAt,
    tokenFile: TOKEN_FILE_PATH,
  });
});

// VAE Management
app.get("/api/sd/vae", async (req, res) => {
  try {
    const vaes: { name: string; filename: string; path: string }[] = [];
    
    // Ensure VAE directory exists
    if (!fs.existsSync(SD_VAE_PATH)) {
      fs.mkdirSync(SD_VAE_PATH, { recursive: true });
    }
    
    const files = fs.readdirSync(SD_VAE_PATH);
    for (const file of files) {
      if (file.endsWith(".safetensors") || file.endsWith(".ckpt") || file.endsWith(".pt")) {
        vaes.push({
          name: file.replace(/\.(safetensors|ckpt|pt)$/, ""),
          filename: file,
          path: path.join(SD_VAE_PATH, file),
        });
      }
    }
    
    // Get current VAE from SD WebUI
    let currentVae = null;
    try {
      const optRes = await fetch(`${SD_WEBUI_URL}/sdapi/v1/options`);
      if (optRes.ok) {
        const options = await optRes.json();
        currentVae = options.sd_vae || null;
      }
    } catch {}
    
    res.json({ success: true, vaes, currentVae });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/sd/vae/switch", async (req, res) => {
  const { vae } = req.body;
  
  try {
    const switchRes = await fetch(`${SD_WEBUI_URL}/sdapi/v1/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sd_vae: vae || "Automatic" }),
    });
    
    if (!switchRes.ok) {
      return res.status(500).json({ success: false, error: "Failed to switch VAE" });
    }
    
    res.json({ success: true, message: `VAE switched to ${vae || "Automatic"}` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// SD Settings Management
app.get("/api/sd/settings", async (req, res) => {
  try {
    const optRes = await fetch(`${SD_WEBUI_URL}/sdapi/v1/options`);
    if (!optRes.ok) {
      return res.status(503).json({ success: false, error: "SD WebUI not available" });
    }
    
    const options = await optRes.json();
    
    // Get available samplers
    let samplers: string[] = [];
    try {
      const samplerRes = await fetch(`${SD_WEBUI_URL}/sdapi/v1/samplers`);
      if (samplerRes.ok) {
        const samplerData = await samplerRes.json();
        samplers = samplerData.map((s: any) => s.name);
      }
    } catch {}
    
    res.json({
      success: true,
      settings: {
        sampler: options.sampler_name || "Euler a",
        steps: options.steps || 20,
        cfgScale: options.cfg_scale || 7,
        clipSkip: options.CLIP_stop_at_last_layers || 1,
        width: options.width || 512,
        height: options.height || 512,
        currentModel: options.sd_model_checkpoint,
        currentVae: options.sd_vae,
      },
      availableSamplers: samplers,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/sd/settings", async (req, res) => {
  const { sampler, steps, cfgScale, clipSkip, width, height } = req.body;
  
  try {
    const payload: Record<string, any> = {};
    if (sampler) payload.sampler_name = sampler;
    if (steps) payload.steps = steps;
    if (cfgScale) payload.cfg_scale = cfgScale;
    if (clipSkip) payload.CLIP_stop_at_last_layers = clipSkip;
    if (width) payload.width = width;
    if (height) payload.height = height;
    
    const switchRes = await fetch(`${SD_WEBUI_URL}/sdapi/v1/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    
    if (!switchRes.ok) {
      return res.status(500).json({ success: false, error: "Failed to update settings" });
    }
    
    res.json({ success: true, message: "Settings updated" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Refresh models in SD WebUI
app.post("/api/sd/refresh", async (req, res) => {
  try {
    const refreshRes = await fetch(`${SD_WEBUI_URL}/sdapi/v1/refresh-checkpoints`, {
      method: "POST",
    });
    
    if (!refreshRes.ok) {
      return res.status(500).json({ success: false, error: "Failed to refresh checkpoints" });
    }
    
    // Also refresh LoRAs
    try {
      await fetch(`${SD_WEBUI_URL}/sdapi/v1/refresh-loras`, { method: "POST" });
    } catch {}
    
    res.json({ success: true, message: "Models refreshed" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Model Download
app.post("/api/sd/download", async (req, res) => {
  const { url, filename, type = "checkpoint" } = req.body;
  
  if (!url) {
    return res.status(400).json({ success: false, error: "URL is required" });
  }
  
  // Determine destination based on type
  let destPath: string;
  switch (type) {
    case "lora":
      destPath = SD_LORA_PATH;
      break;
    case "vae":
      destPath = SD_VAE_PATH;
      break;
    case "embedding":
      destPath = SD_EMBEDDINGS_PATH;
      break;
    default:
      destPath = SD_MODELS_PATH;
  }
  
  // Ensure directory exists
  if (!fs.existsSync(destPath)) {
    fs.mkdirSync(destPath, { recursive: true });
  }
  
  // Extract filename from URL if not provided
  const finalFilename = filename || url.split("/").pop()?.split("?")[0] || `model_${Date.now()}.safetensors`;
  const fullPath = path.join(destPath, finalFilename);
  const downloadId = crypto.randomBytes(8).toString("hex");
  
  console.log(`[Download] Starting: ${finalFilename} to ${destPath}`);
  
  // Track download
  activeDownloads.set(downloadId, {
    url,
    filename: finalFilename,
    destination: fullPath,
    progress: 0,
    bytesDownloaded: 0,
    totalBytes: 0,
    status: "downloading",
    startedAt: new Date().toISOString(),
  });
  
  // Start download in background using PowerShell BITS or curl
  (async () => {
    try {
      // Use PowerShell with progress tracking
      const psScript = `
        $url = "${url.replace(/"/g, '`"')}"
        $output = "${fullPath.replace(/\\/g, "\\\\")}"
        $ProgressPreference = 'SilentlyContinue'
        try {
          Invoke-WebRequest -Uri $url -OutFile $output -UseBasicParsing
          Write-Output "SUCCESS"
        } catch {
          Write-Output "ERROR: $_"
        }
      `;
      
      const { stdout, stderr } = await execAsync(`powershell -Command "${psScript}"`, {
        timeout: 30 * 60 * 1000, // 30 min timeout for large files
        maxBuffer: 50 * 1024 * 1024,
      });
      
      if (stdout.includes("SUCCESS") && fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        const download = activeDownloads.get(downloadId);
        if (download) {
          download.status = "completed";
          download.progress = 100;
          download.bytesDownloaded = stats.size;
          download.totalBytes = stats.size;
          download.completedAt = new Date().toISOString();
        }
        console.log(`[Download] Completed: ${finalFilename} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
        
        // Refresh SD models
        try {
          await fetch(`${SD_WEBUI_URL}/sdapi/v1/refresh-checkpoints`, { method: "POST" });
        } catch {}
      } else {
        const download = activeDownloads.get(downloadId);
        if (download) {
          download.status = "failed";
          download.error = stderr || stdout || "Unknown error";
          download.completedAt = new Date().toISOString();
        }
        console.error(`[Download] Failed: ${finalFilename}`, stderr || stdout);
      }
    } catch (error: any) {
      const download = activeDownloads.get(downloadId);
      if (download) {
        download.status = "failed";
        download.error = error.message;
        download.completedAt = new Date().toISOString();
      }
      console.error(`[Download] Error: ${finalFilename}`, error.message);
    }
  })();
  
  res.json({
    success: true,
    downloadId,
    message: `Download started: ${finalFilename}`,
    destination: fullPath,
  });
});

// Check download status
app.get("/api/sd/downloads", (req, res) => {
  const downloads = Array.from(activeDownloads.entries()).map(([id, info]) => ({
    id,
    ...info,
  }));
  
  res.json({ success: true, downloads });
});

app.get("/api/sd/downloads/:id", (req, res) => {
  const download = activeDownloads.get(req.params.id);
  if (!download) {
    return res.status(404).json({ success: false, error: "Download not found" });
  }
  res.json({ success: true, download });
});

// Cancel download
app.delete("/api/sd/downloads/:id", async (req, res) => {
  const download = activeDownloads.get(req.params.id);
  if (!download) {
    return res.status(404).json({ success: false, error: "Download not found" });
  }
  
  download.status = "cancelled";
  
  // Try to delete partial file
  try {
    if (fs.existsSync(download.destination)) {
      fs.unlinkSync(download.destination);
    }
  } catch {}
  
  res.json({ success: true, message: "Download cancelled" });
});

// Delete a model file
app.delete("/api/sd/models/:type/:filename", async (req, res) => {
  const { type, filename } = req.params;
  
  // Sanitize filename - only allow safe characters
  const sanitizedFilename = path.basename(filename).replace(/[^a-zA-Z0-9_\-\.]/g, "_");
  
  // Validate file extension
  const validExtensions = [".safetensors", ".ckpt", ".pt", ".bin"];
  const ext = path.extname(sanitizedFilename).toLowerCase();
  if (!validExtensions.includes(ext)) {
    return res.status(400).json({ success: false, error: "Invalid file extension" });
  }
  
  let basePath: string;
  switch (type) {
    case "lora":
      basePath = SD_LORA_PATH;
      break;
    case "vae":
      basePath = SD_VAE_PATH;
      break;
    case "embedding":
      basePath = SD_EMBEDDINGS_PATH;
      break;
    case "checkpoint":
      basePath = SD_MODELS_PATH;
      break;
    default:
      return res.status(400).json({ success: false, error: "Invalid model type" });
  }
  
  const fullPath = path.join(basePath, sanitizedFilename);
  const resolvedPath = path.resolve(fullPath);
  const resolvedBase = path.resolve(basePath);
  
  // Security check - ensure resolved path is within expected directory
  if (!resolvedPath.startsWith(resolvedBase)) {
    return res.status(403).json({ success: false, error: "Invalid path" });
  }
  
  try {
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, error: "File not found" });
    }
    
    fs.unlinkSync(fullPath);
    console.log(`[Models] Deleted: ${fullPath}`);
    
    // Refresh SD models
    try {
      await fetch(`${SD_WEBUI_URL}/sdapi/v1/refresh-checkpoints`, { method: "POST" });
    } catch {}
    
    res.json({ success: true, message: `Deleted ${filename}` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Disk space info
app.get("/api/sd/disk", async (req, res) => {
  try {
    const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption', {
      shell: "cmd.exe",
    });
    
    const lines = stdout.trim().split("\n").slice(1);
    const disks: { drive: string; free: number; total: number }[] = [];
    
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        disks.push({
          drive: parts[0],
          free: Math.round(parseInt(parts[1]) / 1024 / 1024 / 1024),
          total: Math.round(parseInt(parts[2]) / 1024 / 1024 / 1024),
        });
      }
    }
    
    // Get size of model directories
    const getDirSize = (dir: string): number => {
      if (!fs.existsSync(dir)) return 0;
      let size = 0;
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const stats = fs.statSync(path.join(dir, file));
          size += stats.size;
        }
      } catch {}
      return size;
    };
    
    res.json({
      success: true,
      disks,
      modelSizes: {
        checkpoints: Math.round(getDirSize(SD_MODELS_PATH) / 1024 / 1024),
        loras: Math.round(getDirSize(SD_LORA_PATH) / 1024 / 1024),
        vaes: Math.round(getDirSize(SD_VAE_PATH) / 1024 / 1024),
        embeddings: Math.round(getDirSize(SD_EMBEDDINGS_PATH) / 1024 / 1024),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/", (req, res) => {
  res.json({
    name: "Nebula Agent",
    version: "1.2.0",
    status: "running",
    nodeId: tokenInfo.nodeId,
    watchdog: {
      running: watchdog.isRunning(),
      config: watchdog.getConfig(),
    },
    endpoints: [
      "GET  /api/health",
      "GET  /api/token-info",
      "POST /api/execute",
      "GET  /api/models",
      "GET  /api/services",
      "POST /api/services/:name/restart",
      "POST /api/services/repair/:name",
      "POST /api/watchdog/start",
      "POST /api/watchdog/stop",
      "GET  /api/watchdog/status",
      "GET  /api/watchdog/events",
      "POST /api/git/pull",
      "GET  /api/sd/status",
      "GET  /api/sd/models",
      "POST /api/sd/switch-model",
      "GET  /api/sd/vae",
      "POST /api/sd/vae/switch",
      "GET  /api/sd/settings",
      "POST /api/sd/settings",
      "POST /api/sd/refresh",
      "POST /api/sd/download",
      "GET  /api/sd/downloads",
      "GET  /api/sd/downloads/:id",
      "DELETE /api/sd/downloads/:id",
      "DELETE /api/sd/models/:type/:filename",
      "GET  /api/sd/disk",
    ],
  });
});

const server = app.listen(PORT, "0.0.0.0", async () => {
  console.log(`
╔════════════════════════════════════════════════╗
║           Nebula Agent v1.2.0                  ║
║   Windows VM Management Service                ║
║   + Auto-Heal Service Recovery                 ║
╠════════════════════════════════════════════════╣
║   Listening on: http://0.0.0.0:${PORT}            ║
║   Node ID: ${tokenInfo.nodeId.substring(0, 30).padEnd(30)}     ║
║   Token: Per-node (loaded from file)           ║
║   Token File: ${TOKEN_FILE_PATH.substring(0, 29).padEnd(29)}  ║
║   Watchdog: Ready (use /api/watchdog/start)    ║
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
