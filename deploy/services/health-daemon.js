#!/usr/bin/env node
/**
 * Nebula Command Health Daemon
 * Reports node health to central dashboard
 * Collects metrics: CPU, RAM, GPU utilization, service status
 */

const http = require('http');
const https = require('https');
const os = require('os');
const { exec, execSync } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const PORT = parseInt(process.env.HEALTH_PORT || '3500', 10);
const DASHBOARD_URL = process.env.DASHBOARD_URL || '';
const NODE_ID = process.env.NODE_ID || generateNodeId();
const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL || '60000', 10);
const METRICS_INTERVAL = parseInt(process.env.METRICS_INTERVAL || '10000', 10);

const SERVICES = {
  ollama: { url: 'http://localhost:11434/api/version', timeout: 10000 },
  comfyui: { url: 'http://localhost:8188/system_stats', timeout: 15000 },
  'stable-diffusion': { url: 'http://localhost:7860/sdapi/v1/sd-models', timeout: 30000 },
};

let currentMetrics = {
  timestamp: new Date().toISOString(),
  nodeId: NODE_ID,
  platform: os.platform(),
  uptime: 0,
  cpu: {},
  memory: {},
  gpu: {},
  services: {},
  network: {},
};

let lastCpuInfo = null;

function generateNodeId() {
  const hostname = os.hostname();
  const interfaces = os.networkInterfaces();
  let macSuffix = '';
  
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (name === 'lo' || name.startsWith('docker')) continue;
    for (const addr of addrs) {
      if (addr.mac && addr.mac !== '00:00:00:00:00:00') {
        macSuffix = addr.mac.replace(/:/g, '').slice(-6);
        break;
      }
    }
    if (macSuffix) break;
  }
  
  if (!macSuffix) {
    macSuffix = Date.now().toString(36).slice(-6);
  }
  
  return `${hostname}-${macSuffix}`.toLowerCase();
}

async function getCpuUsage() {
  const cpus = os.cpus();
  
  let totalUser = 0, totalNice = 0, totalSys = 0, totalIdle = 0, totalIrq = 0;
  
  for (const cpu of cpus) {
    totalUser += cpu.times.user;
    totalNice += cpu.times.nice;
    totalSys += cpu.times.sys;
    totalIdle += cpu.times.idle;
    totalIrq += cpu.times.irq;
  }
  
  const total = totalUser + totalNice + totalSys + totalIdle + totalIrq;
  const idle = totalIdle;
  
  if (lastCpuInfo) {
    const diffTotal = total - lastCpuInfo.total;
    const diffIdle = idle - lastCpuInfo.idle;
    const usage = diffTotal > 0 ? ((diffTotal - diffIdle) / diffTotal) * 100 : 0;
    
    lastCpuInfo = { total, idle };
    
    return {
      cores: cpus.length,
      model: cpus[0]?.model || 'Unknown',
      speed: cpus[0]?.speed || 0,
      usage: Math.round(usage * 100) / 100,
    };
  }
  
  lastCpuInfo = { total, idle };
  
  return {
    cores: cpus.length,
    model: cpus[0]?.model || 'Unknown',
    speed: cpus[0]?.speed || 0,
    usage: 0,
  };
}

function getMemoryUsage() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  
  return {
    total_mb: Math.round(totalMem / 1024 / 1024),
    used_mb: Math.round(usedMem / 1024 / 1024),
    free_mb: Math.round(freeMem / 1024 / 1024),
    usage_percent: Math.round((usedMem / totalMem) * 100 * 100) / 100,
  };
}

async function getGpuInfo() {
  try {
    const { stdout } = await execAsync(
      'nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu --format=csv,noheader,nounits',
      { timeout: 5000 }
    );
    
    const lines = stdout.trim().split('\n');
    const gpus = [];
    
    for (const line of lines) {
      const [name, totalMem, usedMem, freeMem, utilization, temperature] = line.split(',').map(s => s.trim());
      gpus.push({
        name,
        memory_total_mb: parseInt(totalMem, 10),
        memory_used_mb: parseInt(usedMem, 10),
        memory_free_mb: parseInt(freeMem, 10),
        utilization_percent: parseInt(utilization, 10),
        temperature_c: parseInt(temperature, 10),
      });
    }
    
    return {
      vendor: 'nvidia',
      count: gpus.length,
      gpus,
      total_vram_mb: gpus.reduce((sum, g) => sum + g.memory_total_mb, 0),
      total_used_mb: gpus.reduce((sum, g) => sum + g.memory_used_mb, 0),
      avg_utilization: gpus.length > 0 
        ? Math.round(gpus.reduce((sum, g) => sum + g.utilization_percent, 0) / gpus.length)
        : 0,
    };
  } catch (error) {
    try {
      const { stdout } = await execAsync('rocm-smi --showmeminfo vram --showuse --showtemp --json', { timeout: 5000 });
      const data = JSON.parse(stdout);
      return {
        vendor: 'amd',
        count: Object.keys(data).length,
        gpus: [],
        total_vram_mb: 0,
        total_used_mb: 0,
        avg_utilization: 0,
      };
    } catch {
      return {
        vendor: 'none',
        count: 0,
        gpus: [],
        total_vram_mb: 0,
        total_used_mb: 0,
        avg_utilization: 0,
      };
    }
  }
}

async function checkServiceHealth(name, config) {
  return new Promise((resolve) => {
    const url = new URL(config.url);
    const protocol = url.protocol === 'https:' ? https : http;
    
    const req = protocol.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'GET',
      timeout: config.timeout,
    }, (res) => {
      resolve({
        name,
        status: res.statusCode === 200 ? 'healthy' : 'degraded',
        statusCode: res.statusCode,
        responseTime: Date.now() - startTime,
      });
    });
    
    const startTime = Date.now();
    
    req.on('error', () => {
      resolve({
        name,
        status: 'down',
        statusCode: 0,
        responseTime: Date.now() - startTime,
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({
        name,
        status: 'timeout',
        statusCode: 0,
        responseTime: config.timeout,
      });
    });
    
    req.end();
  });
}

async function checkAllServices() {
  const results = {};
  
  const checks = Object.entries(SERVICES).map(async ([name, config]) => {
    const result = await checkServiceHealth(name, config);
    results[name] = result;
  });
  
  await Promise.all(checks);
  return results;
}

function getNetworkInfo() {
  const interfaces = os.networkInterfaces();
  const result = {
    hostname: os.hostname(),
    interfaces: [],
  };
  
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (name === 'lo') continue;
    
    for (const addr of addrs) {
      if (addr.family === 'IPv4') {
        result.interfaces.push({
          name,
          address: addr.address,
          internal: addr.internal,
        });
      }
    }
  }
  
  result.primary_ip = result.interfaces.find(i => !i.internal)?.address || '127.0.0.1';
  
  return result;
}

async function collectMetrics() {
  const [cpu, gpu, services] = await Promise.all([
    getCpuUsage(),
    getGpuInfo(),
    checkAllServices(),
  ]);
  
  currentMetrics = {
    timestamp: new Date().toISOString(),
    nodeId: NODE_ID,
    platform: os.platform(),
    uptime: Math.round(os.uptime()),
    cpu,
    memory: getMemoryUsage(),
    gpu,
    services,
    network: getNetworkInfo(),
  };
  
  return currentMetrics;
}

async function sendHeartbeat() {
  if (!DASHBOARD_URL) return;
  
  try {
    const url = new URL('/api/nodes/heartbeat', DASHBOARD_URL);
    const protocol = url.protocol === 'https:' ? https : http;
    
    const data = JSON.stringify({
      nodeId: NODE_ID,
      metrics: currentMetrics,
      timestamp: new Date().toISOString(),
    });
    
    const req = protocol.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: 10000,
    }, (res) => {
      if (res.statusCode !== 200) {
        console.error(`Heartbeat failed: ${res.statusCode}`);
      }
    });
    
    req.on('error', (err) => {
      console.error(`Heartbeat error: ${err.message}`);
    });
    
    req.write(data);
    req.end();
  } catch (error) {
    console.error(`Heartbeat exception: ${error.message}`);
  }
}

async function registerWithDashboard() {
  if (!DASHBOARD_URL) {
    console.log('No DASHBOARD_URL configured, skipping registration');
    return;
  }
  
  try {
    await collectMetrics();
    
    const url = new URL('/api/nodes/register', DASHBOARD_URL);
    const protocol = url.protocol === 'https:' ? https : http;
    
    const data = JSON.stringify({
      nodeId: NODE_ID,
      platform: os.platform(),
      hostname: os.hostname(),
      capabilities: {
        hasGpu: currentMetrics.gpu.count > 0,
        gpuVendor: currentMetrics.gpu.vendor,
        vramMb: currentMetrics.gpu.total_vram_mb,
        ramMb: currentMetrics.memory.total_mb,
        cpuCores: currentMetrics.cpu.cores,
      },
      endpoint: `http://${currentMetrics.network.primary_ip}:${PORT}`,
      timestamp: new Date().toISOString(),
    });
    
    const req = protocol.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: 10000,
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          console.log(`Registered with dashboard as ${NODE_ID}`);
        } else {
          console.error(`Registration failed: ${res.statusCode} - ${body}`);
        }
      });
    });
    
    req.on('error', (err) => {
      console.error(`Registration error: ${err.message}`);
    });
    
    req.write(data);
    req.end();
  } catch (error) {
    console.error(`Registration exception: ${error.message}`);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  switch (url.pathname) {
    case '/health':
    case '/':
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'healthy',
        nodeId: NODE_ID,
        uptime: Math.round(os.uptime()),
        timestamp: new Date().toISOString(),
      }));
      break;
      
    case '/metrics':
      await collectMetrics();
      res.writeHead(200);
      res.end(JSON.stringify(currentMetrics));
      break;
      
    case '/services':
      const services = await checkAllServices();
      res.writeHead(200);
      res.end(JSON.stringify({
        nodeId: NODE_ID,
        services,
        timestamp: new Date().toISOString(),
      }));
      break;
      
    case '/gpu':
      const gpu = await getGpuInfo();
      res.writeHead(200);
      res.end(JSON.stringify(gpu));
      break;
      
    default:
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Nebula Health Daemon running on port ${PORT}`);
  console.log(`Node ID: ${NODE_ID}`);
  console.log(`Platform: ${os.platform()}`);
  console.log(`Dashboard URL: ${DASHBOARD_URL || '(not configured)'}`);
  
  registerWithDashboard();
  
  setInterval(collectMetrics, METRICS_INTERVAL);
  
  if (DASHBOARD_URL) {
    setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
  }
  
  collectMetrics();
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...');
  server.close(() => {
    process.exit(0);
  });
});
