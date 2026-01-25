const http = require('http');
const https = require('https');
const { exec, spawn } = require('child_process');
const EventEmitter = require('events');

const SERVICES = [
  {
    name: 'Ollama',
    port: 11434,
    healthUrl: 'http://localhost:11434/api/version',
    startCmd: 'net start Ollama',
    stopCmd: 'net stop Ollama',
    maxRestarts: 3,
    startDelay: 10000,
    healthTimeout: 5000
  },
  {
    name: 'StableDiffusion',
    port: 7860,
    healthUrl: 'http://localhost:7860/sdapi/v1/options',
    startCmd: 'C:\\AI\\stable-diffusion-webui\\webui-user.bat',
    stopCmd: 'taskkill /F /IM python.exe /FI "WINDOWTITLE eq Stable*"',
    maxRestarts: 2,
    startDelay: 60000,
    healthTimeout: 10000
  },
  {
    name: 'ComfyUI',
    port: 8188,
    healthUrl: 'http://localhost:8188/system_stats',
    startCmd: 'C:\\AI\\ComfyUI\\run_nvidia_gpu.bat',
    stopCmd: 'taskkill /F /IM python.exe /FI "WINDOWTITLE eq ComfyUI*"',
    maxRestarts: 2,
    startDelay: 30000,
    healthTimeout: 10000
  }
];

class ServiceOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.services = options.services || SERVICES;
    this.checkInterval = options.checkInterval || 10000;
    this.unhealthyThreshold = options.unhealthyThreshold || 30000;
    this.cooldownPeriod = options.cooldownPeriod || 300000;
    this.dashboardWebhook = options.dashboardWebhook || process.env.DASHBOARD_WEBHOOK_URL;
    
    this.serviceState = new Map();
    this.restartCounts = new Map();
    this.lastRestarts = new Map();
    this.isRunning = false;
    this.monitorInterval = null;
    
    this.initializeState();
  }

  initializeState() {
    for (const service of this.services) {
      this.serviceState.set(service.name, {
        healthy: null,
        lastCheck: null,
        lastHealthy: null,
        unhealthySince: null,
        consecutiveFailures: 0
      });
      this.restartCounts.set(service.name, 0);
      this.lastRestarts.set(service.name, 0);
    }
  }

  async checkHealth(service) {
    return new Promise((resolve) => {
      const url = new URL(service.healthUrl);
      const protocol = url.protocol === 'https:' ? https : http;
      
      const req = protocol.get({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        timeout: service.healthTimeout
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve(res.statusCode >= 200 && res.statusCode < 300);
        });
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  async executeCommand(cmd, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const child = exec(cmd, { timeout: timeoutMs, shell: 'powershell.exe' }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Command failed: ${error.message}`));
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  }

  async spawnDetached(cmd) {
    return new Promise((resolve) => {
      const child = spawn('cmd.exe', ['/c', 'start', '/MIN', cmd], {
        detached: true,
        stdio: 'ignore',
        shell: true
      });
      child.unref();
      setTimeout(() => resolve(), 1000);
    });
  }

  isInCooldown(serviceName) {
    const lastRestart = this.lastRestarts.get(serviceName) || 0;
    return Date.now() - lastRestart < this.cooldownPeriod;
  }

  async restartService(service) {
    const count = this.restartCounts.get(service.name) || 0;
    const state = this.serviceState.get(service.name);

    if (count >= service.maxRestarts) {
      console.log(`[ORCHESTRATOR] ${service.name}: Max restarts (${service.maxRestarts}) reached - alerting dashboard`);
      await this.notifyDashboard(service, 'critical', `Max restarts exceeded after ${count} attempts`);
      this.emit('critical', { service: service.name, restarts: count });
      return false;
    }

    if (this.isInCooldown(service.name)) {
      console.log(`[ORCHESTRATOR] ${service.name}: In cooldown period, skipping restart`);
      return false;
    }

    console.log(`[ORCHESTRATOR] ${service.name}: Attempting restart (${count + 1}/${service.maxRestarts})`);
    this.emit('restarting', { service: service.name, attempt: count + 1 });

    try {
      console.log(`[ORCHESTRATOR] ${service.name}: Stopping...`);
      await this.executeCommand(service.stopCmd, 15000).catch(() => {});
      
      await this.sleep(2000);

      console.log(`[ORCHESTRATOR] ${service.name}: Starting...`);
      if (service.name === 'Ollama') {
        await this.executeCommand(service.startCmd);
      } else {
        await this.spawnDetached(service.startCmd);
      }

      console.log(`[ORCHESTRATOR] ${service.name}: Waiting ${service.startDelay}ms for startup...`);
      await this.sleep(service.startDelay);

      const healthy = await this.checkHealth(service);
      
      this.restartCounts.set(service.name, count + 1);
      this.lastRestarts.set(service.name, Date.now());

      if (healthy) {
        console.log(`[ORCHESTRATOR] ${service.name}: Restart successful`);
        state.healthy = true;
        state.unhealthySince = null;
        state.consecutiveFailures = 0;
        state.lastHealthy = Date.now();
        await this.notifyDashboard(service, 'recovered', `Service recovered after restart`);
        this.emit('recovered', { service: service.name });
        return true;
      } else {
        console.log(`[ORCHESTRATOR] ${service.name}: Restart failed - still unhealthy`);
        await this.notifyDashboard(service, 'warning', `Restart attempt ${count + 1} failed`);
        this.emit('restart_failed', { service: service.name, attempt: count + 1 });
        return false;
      }
    } catch (error) {
      console.error(`[ORCHESTRATOR] ${service.name}: Restart error:`, error.message);
      this.emit('error', { service: service.name, error: error.message });
      return false;
    }
  }

  async notifyDashboard(service, severity, message) {
    if (!this.dashboardWebhook) return;

    const payload = {
      type: 'ai_service_alert',
      service: service.name,
      severity,
      message,
      timestamp: new Date().toISOString(),
      state: this.serviceState.get(service.name),
      restartCount: this.restartCounts.get(service.name)
    };

    try {
      const url = new URL(this.dashboardWebhook);
      const protocol = url.protocol === 'https:' ? https : http;

      await new Promise((resolve, reject) => {
        const req = protocol.request({
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000
        }, (res) => {
          res.on('data', () => {});
          res.on('end', () => resolve());
        });

        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Webhook timeout'));
        });

        req.write(JSON.stringify(payload));
        req.end();
      });

      console.log(`[ORCHESTRATOR] Dashboard notified: ${severity} - ${message}`);
    } catch (error) {
      console.error(`[ORCHESTRATOR] Failed to notify dashboard:`, error.message);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async runHealthCheck() {
    const now = Date.now();
    const results = [];

    for (const service of this.services) {
      const state = this.serviceState.get(service.name);
      const healthy = await this.checkHealth(service);

      state.lastCheck = now;
      state.healthy = healthy;

      if (healthy) {
        state.lastHealthy = now;
        state.unhealthySince = null;
        state.consecutiveFailures = 0;
      } else {
        state.consecutiveFailures++;
        if (!state.unhealthySince) {
          state.unhealthySince = now;
        }

        const unhealthyDuration = now - state.unhealthySince;
        
        if (unhealthyDuration > this.unhealthyThreshold) {
          console.log(`[ORCHESTRATOR] ${service.name}: Unhealthy for ${Math.round(unhealthyDuration / 1000)}s - triggering restart`);
          await this.restartService(service);
        }
      }

      results.push({
        name: service.name,
        port: service.port,
        healthy,
        unhealthySince: state.unhealthySince,
        consecutiveFailures: state.consecutiveFailures,
        restartCount: this.restartCounts.get(service.name)
      });
    }

    return results;
  }

  async start() {
    if (this.isRunning) {
      console.log('[ORCHESTRATOR] Already running');
      return;
    }

    console.log('[ORCHESTRATOR] Starting service monitoring...');
    console.log(`[ORCHESTRATOR] Check interval: ${this.checkInterval}ms`);
    console.log(`[ORCHESTRATOR] Unhealthy threshold: ${this.unhealthyThreshold}ms`);
    console.log(`[ORCHESTRATOR] Cooldown period: ${this.cooldownPeriod}ms`);

    this.isRunning = true;

    const check = async () => {
      if (!this.isRunning) return;
      
      try {
        await this.runHealthCheck();
      } catch (error) {
        console.error('[ORCHESTRATOR] Health check error:', error.message);
      }
    };

    await check();
    this.monitorInterval = setInterval(check, this.checkInterval);

    this.emit('started');
    console.log('[ORCHESTRATOR] Monitoring started');
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    this.emit('stopped');
    console.log('[ORCHESTRATOR] Monitoring stopped');
  }

  resetRestartCounts(serviceName = null) {
    if (serviceName) {
      this.restartCounts.set(serviceName, 0);
      this.lastRestarts.set(serviceName, 0);
      console.log(`[ORCHESTRATOR] Reset restart count for ${serviceName}`);
    } else {
      for (const service of this.services) {
        this.restartCounts.set(service.name, 0);
        this.lastRestarts.set(service.name, 0);
      }
      console.log('[ORCHESTRATOR] Reset all restart counts');
    }
  }

  getStatus() {
    const status = {
      running: this.isRunning,
      checkInterval: this.checkInterval,
      unhealthyThreshold: this.unhealthyThreshold,
      services: []
    };

    for (const service of this.services) {
      const state = this.serviceState.get(service.name);
      status.services.push({
        name: service.name,
        port: service.port,
        healthy: state.healthy,
        lastCheck: state.lastCheck ? new Date(state.lastCheck).toISOString() : null,
        lastHealthy: state.lastHealthy ? new Date(state.lastHealthy).toISOString() : null,
        unhealthySince: state.unhealthySince ? new Date(state.unhealthySince).toISOString() : null,
        consecutiveFailures: state.consecutiveFailures,
        restartCount: this.restartCounts.get(service.name),
        maxRestarts: service.maxRestarts,
        inCooldown: this.isInCooldown(service.name)
      });
    }

    return status;
  }

  async forceRestart(serviceName) {
    const service = this.services.find(s => s.name === serviceName);
    if (!service) {
      throw new Error(`Service not found: ${serviceName}`);
    }

    this.resetRestartCounts(serviceName);

    return this.restartService(service);
  }
}

module.exports = { ServiceOrchestrator, SERVICES };
