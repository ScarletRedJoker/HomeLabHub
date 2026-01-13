const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const PORT = process.env.AGENT_PORT || 8765;
const AUTH_TOKEN = process.env.NEBULA_AGENT_TOKEN;

const MODEL_PATHS = {
  sd_checkpoints: 'C:\\AI\\stable-diffusion-webui\\models\\Stable-diffusion',
  sd_loras: 'C:\\AI\\stable-diffusion-webui\\models\\Lora',
  comfy_checkpoints: 'C:\\AI\\ComfyUI\\models\\checkpoints',
  comfy_loras: 'C:\\AI\\ComfyUI\\models\\loras'
};

const downloads = new Map();

function isTailscaleSubnet(ip) {
  if (!ip) return false;
  const cleanIp = ip.replace(/^::ffff:/, '');
  if (cleanIp === '127.0.0.1' || cleanIp === '::1') return true;
  const parts = cleanIp.split('.').map(Number);
  if (parts.length !== 4) return false;
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  return false;
}

function authMiddleware(req, res, next) {
  const clientIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  
  if (!isTailscaleSubnet(clientIp)) {
    console.log(`[AUTH] Blocked request from non-Tailscale IP: ${clientIp}`);
    return res.status(403).json({ error: 'Access denied: Must connect via Tailscale' });
  }

  if (!AUTH_TOKEN) {
    console.warn('[AUTH] NEBULA_AGENT_TOKEN not set - security warning');
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.substring(7);
  if (token !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  next();
}

app.use(authMiddleware);

function estimateVramUsage(fileSizeBytes) {
  const sizeGB = fileSizeBytes / (1024 * 1024 * 1024);
  if (sizeGB > 6) return { estimated_vram_gb: 12, precision: 'fp16' };
  if (sizeGB > 3) return { estimated_vram_gb: 8, precision: 'fp16' };
  if (sizeGB > 1.5) return { estimated_vram_gb: 6, precision: 'fp16' };
  return { estimated_vram_gb: 4, precision: 'fp16' };
}

function scanDirectory(dirPath, modelType) {
  const models = [];
  
  if (!fs.existsSync(dirPath)) {
    return models;
  }

  try {
    const files = fs.readdirSync(dirPath);
    const modelExtensions = ['.safetensors', '.ckpt', '.pt', '.pth', '.bin'];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!modelExtensions.includes(ext)) continue;

      const filePath = path.join(dirPath, file);
      try {
        const stats = fs.statSync(filePath);
        const vramEstimate = estimateVramUsage(stats.size);
        
        models.push({
          name: path.basename(file, ext),
          filename: file,
          path: filePath,
          type: modelType,
          size_bytes: stats.size,
          size_mb: Math.round(stats.size / (1024 * 1024)),
          size_gb: (stats.size / (1024 * 1024 * 1024)).toFixed(2),
          estimated_vram_gb: vramEstimate.estimated_vram_gb,
          precision: vramEstimate.precision,
          modified: stats.mtime.toISOString(),
          modified_unix: Math.floor(stats.mtime.getTime() / 1000)
        });
      } catch (statErr) {
        console.error(`[SCAN] Error reading file stats: ${filePath}`, statErr.message);
      }
    }
  } catch (err) {
    console.error(`[SCAN] Error scanning directory: ${dirPath}`, err.message);
  }

  return models;
}

async function getOllamaModels() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: 11434,
      path: '/api/tags',
      method: 'GET',
      timeout: 5000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const models = (parsed.models || []).map(m => ({
            name: m.name,
            type: 'ollama',
            size_bytes: m.size || 0,
            size_gb: m.size ? (m.size / (1024 * 1024 * 1024)).toFixed(2) : '0',
            modified: m.modified_at || null,
            digest: m.digest,
            details: m.details || {}
          }));
          resolve(models);
        } catch (e) {
          console.error('[OLLAMA] Parse error:', e.message);
          resolve([]);
        }
      });
    });

    req.on('error', (err) => {
      console.error('[OLLAMA] Connection error:', err.message);
      resolve([]);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve([]);
    });

    req.end();
  });
}

app.get('/api/models', async (req, res) => {
  console.log('[API] GET /api/models');
  
  try {
    const [ollamaModels] = await Promise.all([getOllamaModels()]);

    const inventory = {
      timestamp: new Date().toISOString(),
      stable_diffusion: {
        checkpoints: scanDirectory(MODEL_PATHS.sd_checkpoints, 'sd_checkpoint'),
        loras: scanDirectory(MODEL_PATHS.sd_loras, 'sd_lora')
      },
      comfyui: {
        checkpoints: scanDirectory(MODEL_PATHS.comfy_checkpoints, 'comfy_checkpoint'),
        loras: scanDirectory(MODEL_PATHS.comfy_loras, 'comfy_lora')
      },
      ollama: {
        models: ollamaModels
      },
      summary: {
        total_sd_checkpoints: 0,
        total_sd_loras: 0,
        total_comfy_checkpoints: 0,
        total_comfy_loras: 0,
        total_ollama_models: ollamaModels.length
      }
    };

    inventory.summary.total_sd_checkpoints = inventory.stable_diffusion.checkpoints.length;
    inventory.summary.total_sd_loras = inventory.stable_diffusion.loras.length;
    inventory.summary.total_comfy_checkpoints = inventory.comfyui.checkpoints.length;
    inventory.summary.total_comfy_loras = inventory.comfyui.loras.length;

    res.json(inventory);
  } catch (err) {
    console.error('[API] Error in /api/models:', err);
    res.status(500).json({ error: 'Failed to scan models', details: err.message });
  }
});

function getDownloadPath(targetType) {
  switch (targetType) {
    case 'sd_checkpoint':
    case 'checkpoint':
      return MODEL_PATHS.sd_checkpoints;
    case 'sd_lora':
    case 'lora':
      return MODEL_PATHS.sd_loras;
    case 'comfy_checkpoint':
      return MODEL_PATHS.comfy_checkpoints;
    case 'comfy_lora':
      return MODEL_PATHS.comfy_loras;
    default:
      return null;
  }
}

function downloadFile(url, destPath, downloadId) {
  return new Promise((resolve, reject) => {
    const download = downloads.get(downloadId);
    if (!download) {
      return reject(new Error('Download not found'));
    }

    const protocol = url.startsWith('https') ? https : http;
    
    const makeRequest = (requestUrl, redirectCount = 0) => {
      if (redirectCount > 5) {
        download.status = 'failed';
        download.error = 'Too many redirects';
        return reject(new Error('Too many redirects'));
      }

      const req = protocol.get(requestUrl, { 
        headers: { 
          'User-Agent': 'Nebula-Model-Agent/1.0'
        }
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return makeRequest(res.headers.location, redirectCount + 1);
        }

        if (res.statusCode !== 200) {
          download.status = 'failed';
          download.error = `HTTP ${res.statusCode}`;
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
        download.total_bytes = totalBytes;
        download.status = 'downloading';

        const file = fs.createWriteStream(destPath);
        let downloadedBytes = 0;
        let lastUpdate = Date.now();
        let lastBytes = 0;

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          download.downloaded_bytes = downloadedBytes;
          
          if (totalBytes > 0) {
            download.progress = Math.round((downloadedBytes / totalBytes) * 100);
          }

          const now = Date.now();
          const elapsed = (now - lastUpdate) / 1000;
          if (elapsed >= 1) {
            const bytesPerSecond = (downloadedBytes - lastBytes) / elapsed;
            download.speed_mbps = (bytesPerSecond / (1024 * 1024)).toFixed(2);
            
            if (totalBytes > 0 && bytesPerSecond > 0) {
              const remainingBytes = totalBytes - downloadedBytes;
              download.eta_seconds = Math.round(remainingBytes / bytesPerSecond);
            }
            
            lastUpdate = now;
            lastBytes = downloadedBytes;
          }
        });

        res.pipe(file);

        file.on('finish', () => {
          file.close();
          download.status = 'completed';
          download.progress = 100;
          download.completed_at = new Date().toISOString();
          resolve(destPath);
        });

        file.on('error', (err) => {
          fs.unlink(destPath, () => {});
          download.status = 'failed';
          download.error = err.message;
          reject(err);
        });
      });

      req.on('error', (err) => {
        download.status = 'failed';
        download.error = err.message;
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        download.status = 'failed';
        download.error = 'Request timeout';
        reject(new Error('Request timeout'));
      });
    };

    makeRequest(url);
  });
}

app.post('/api/models/download', (req, res) => {
  const { url, target_type, filename } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  if (!target_type) {
    return res.status(400).json({ error: 'target_type is required (checkpoint, lora, comfy_checkpoint, comfy_lora)' });
  }

  if (target_type === 'ollama') {
    return res.status(400).json({ 
      error: 'For Ollama models, use: ollama pull <model_name> directly on the VM' 
    });
  }

  const destDir = getDownloadPath(target_type);
  if (!destDir) {
    return res.status(400).json({ error: `Invalid target_type: ${target_type}` });
  }

  if (!fs.existsSync(destDir)) {
    try {
      fs.mkdirSync(destDir, { recursive: true });
    } catch (err) {
      return res.status(500).json({ error: `Cannot create directory: ${destDir}` });
    }
  }

  let destFilename = filename;
  if (!destFilename) {
    try {
      const urlPath = new URL(url).pathname;
      destFilename = path.basename(urlPath);
    } catch {
      destFilename = `model_${Date.now()}.safetensors`;
    }
  }

  const destPath = path.join(destDir, destFilename);
  const downloadId = uuidv4();

  downloads.set(downloadId, {
    id: downloadId,
    url: url,
    target_type: target_type,
    destination: destPath,
    filename: destFilename,
    status: 'pending',
    progress: 0,
    downloaded_bytes: 0,
    total_bytes: 0,
    speed_mbps: 0,
    eta_seconds: null,
    started_at: new Date().toISOString(),
    completed_at: null,
    error: null
  });

  console.log(`[DOWNLOAD] Starting download ${downloadId}: ${url} -> ${destPath}`);

  downloadFile(url, destPath, downloadId)
    .then(() => {
      console.log(`[DOWNLOAD] Completed: ${downloadId}`);
    })
    .catch((err) => {
      console.error(`[DOWNLOAD] Failed ${downloadId}:`, err.message);
    });

  res.json({
    download_id: downloadId,
    status: 'pending',
    message: 'Download started',
    destination: destPath
  });
});

app.get('/api/models/download/:id', (req, res) => {
  const { id } = req.params;
  const download = downloads.get(id);

  if (!download) {
    return res.status(404).json({ error: 'Download not found' });
  }

  res.json({
    id: download.id,
    status: download.status,
    progress: download.progress,
    downloaded_bytes: download.downloaded_bytes,
    total_bytes: download.total_bytes,
    speed_mbps: download.speed_mbps,
    eta_seconds: download.eta_seconds,
    filename: download.filename,
    destination: download.destination,
    started_at: download.started_at,
    completed_at: download.completed_at,
    error: download.error
  });
});

app.get('/api/downloads', (req, res) => {
  const allDownloads = Array.from(downloads.values()).map(d => ({
    id: d.id,
    filename: d.filename,
    status: d.status,
    progress: d.progress,
    target_type: d.target_type,
    started_at: d.started_at
  }));

  res.json({ downloads: allDownloads });
});

app.delete('/api/models/download/:id', (req, res) => {
  const { id } = req.params;
  const download = downloads.get(id);

  if (!download) {
    return res.status(404).json({ error: 'Download not found' });
  }

  if (download.status === 'downloading') {
    return res.status(400).json({ error: 'Cannot remove active download' });
  }

  downloads.delete(id);
  res.json({ message: 'Download record removed' });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'nebula-model-agent',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor(process.uptime())
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=== Nebula Model Agent ===`);
  console.log(`Listening on port ${PORT}`);
  console.log(`Auth token: ${AUTH_TOKEN ? 'Configured' : 'NOT SET (warning)'}`);
  console.log(`Tailscale subnet restriction: Enabled (100.64.0.0/10)`);
  console.log(`Model paths:`);
  Object.entries(MODEL_PATHS).forEach(([key, val]) => {
    const exists = fs.existsSync(val);
    console.log(`  ${key}: ${val} [${exists ? 'exists' : 'missing'}]`);
  });
  console.log(`Ready to serve requests`);
});
