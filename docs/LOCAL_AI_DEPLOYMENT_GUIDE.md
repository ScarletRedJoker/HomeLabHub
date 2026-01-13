# Local AI Deployment Guide

Complete guide for deploying and managing the Nebula Command local AI infrastructure on your Windows VM with RTX 3060.

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                      LINODE (Cloud)                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Dashboard (Next.js)                                     │   │
│  │  ├── AI Orchestrator (routes requests)                   │   │
│  │  ├── Health Webhook API (receives status)                │   │
│  │  └── Control API (remote start/stop)                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           │ Tailscale VPN                       │
│                           ▼                                     │
└────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────────┐
│                   UBUNTU HOST (Homelab)                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  KVM Orchestrator                                        │   │
│  │  ├── VM lifecycle management                             │   │
│  │  ├── Health polling (systemd timer)                      │   │
│  │  └── State file updates                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           │ vfio-pci passthrough                │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Windows 11 VM (RTX 3060 - 12GB VRAM)                    │   │
│  │  ├── AI Supervisor (PowerShell service manager)          │   │
│  │  ├── Health Daemon (reports to webhook)                  │   │
│  │  ├── Ollama (port 11434) - LLM inference                 │   │
│  │  ├── Stable Diffusion WebUI (port 7860) - Images         │   │
│  │  └── ComfyUI (port 8188) - Video/Workflows               │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Install Windows AI Services

On your Windows VM, run in PowerShell (Admin):

```powershell
# Install Ollama
winget install Ollama.Ollama

# Configure network access
[Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0", "Machine")

# Pull essential models
ollama pull llama3.2:3b
ollama pull qwen2.5-coder:7b
ollama pull nomic-embed-text
```

For Stable Diffusion and ComfyUI, see `docs/WINDOWS_VM_AI_SETUP.md`.

### 2. Install AI Supervisor (Auto-Start Services)

Copy the supervisor script to your Windows VM:

```powershell
# From Windows VM
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/yourusername/HomeLabHub/main/deploy/local/scripts/windows-ai-supervisor.ps1" -OutFile "C:\ProgramData\NebulaCommand\windows-ai-supervisor.ps1"

# Install as startup task
powershell -ExecutionPolicy Bypass -File "C:\ProgramData\NebulaCommand\windows-ai-supervisor.ps1" install
```

### 3. Install Health Daemon

The health daemon reports status every 30 seconds to the Linode dashboard:

```powershell
# Set webhook URL (replace with your dashboard URL)
[Environment]::SetEnvironmentVariable("NEBULA_HEALTH_WEBHOOK", "https://dashboard.yourdomain.com/api/ai/health-webhook", "Machine")

# Install daemon
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/yourusername/HomeLabHub/main/deploy/local/scripts/vm-ai-health-daemon.ps1" -OutFile "C:\ProgramData\NebulaCommand\vm-ai-health-daemon.ps1"

# Create scheduled task for daemon
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File C:\ProgramData\NebulaCommand\vm-ai-health-daemon.ps1"
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 3
Register-ScheduledTask -TaskName "NebulaCommand-AI-Health" -Action $action -Trigger $trigger -Settings $settings -Force
```

### 4. Install Ubuntu Health Monitor

On your Ubuntu host:

```bash
cd /opt/homelab/HomeLabHub/deploy/local/scripts
chmod +x install-ai-health-monitor.sh
sudo ./install-ai-health-monitor.sh
```

## Services Reference

| Service | Port | Description | VRAM |
|---------|------|-------------|------|
| Ollama | 11434 | LLM inference (llama, codellama, mistral) | 2-10GB |
| Stable Diffusion | 7860 | Image generation (AUTOMATIC1111) | 4-8GB |
| ComfyUI | 8188 | Video/workflow generation | 6-12GB |

## Model Recommendations

See `docs/LOCAL_AI_CAPABILITY_MATRIX.md` for complete model list.

### Quick Install Commands

```bash
# Essential LLMs
ollama pull llama3.2:3b           # Fast chat (2.5GB)
ollama pull qwen2.5-coder:7b      # Code assist (5GB)
ollama pull nomic-embed-text      # Embeddings (0.5GB)

# Optional but recommended
ollama pull deepseek-coder-v2:16b # Best code quality (10GB)
ollama pull deepseek-r1:8b        # Reasoning/planning (5.5GB)
```

## API Endpoints

### Dashboard APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ai/status` | GET | Current AI service status |
| `/api/ai/health-webhook` | POST | Receive health reports |
| `/api/ai/control` | POST | Remote service control |
| `/api/ai/chat` | POST | Chat completion |
| `/api/ai/image` | POST | Image generation |

### Control API Examples

**Required Environment Variable:**
```bash
# Set a secure token (must match on Windows VM agent)
export KVM_AGENT_TOKEN="your-secure-random-token-here"
```

The control API is disabled until `KVM_AGENT_TOKEN` is set. Generate a secure token:
```bash
openssl rand -hex 32
```

```bash
# Check status (read-only, no token required)
curl -X GET https://dashboard.yourdomain.com/api/ai/control

# Start all services (requires KVM_AGENT_TOKEN to be configured)
curl -X POST https://dashboard.yourdomain.com/api/ai/control \
  -H "Content-Type: application/json" \
  -d '{"action": "start", "service": "all"}'

# Restart Ollama
curl -X POST https://dashboard.yourdomain.com/api/ai/control \
  -H "Content-Type: application/json" \
  -d '{"action": "restart", "service": "ollama"}'
```

## VRAM Management

With 12GB VRAM on RTX 3060, only run one major model at a time:

| Concurrent Tasks | Status |
|-----------------|--------|
| Ollama 3B + Embeddings | ✅ OK (3GB total) |
| Ollama 8B alone | ✅ OK (5.5GB) |
| SD Image Gen | ✅ OK (4-8GB) |
| Ollama 16B alone | ⚠️ Tight (10GB) |
| Ollama + SD together | ❌ VRAM error |

### Auto-Unload Settings

Configure Ollama to unload models after inactivity:

```bash
# Keep model loaded for 5 minutes after last use
export OLLAMA_KEEP_ALIVE=5m
```

## Troubleshooting

### Services Not Starting

1. Check GPU is available:
```powershell
nvidia-smi
```

2. Check supervisor status:
```powershell
C:\ProgramData\NebulaCommand\windows-ai-supervisor.ps1 status
```

3. View logs:
```powershell
Get-Content C:\ProgramData\NebulaCommand\logs\ai-supervisor.log -Tail 50
```

### Dashboard Can't Connect

1. Verify Tailscale is running:
```powershell
tailscale status
```

2. Check firewall:
```powershell
netsh advfirewall firewall show rule name="Ollama API"
```

3. Test connectivity from Linode:
```bash
curl -v http://100.118.44.102:11434/api/version
```

### Out of VRAM

1. Unload unused models:
```bash
ollama stop llama3.1:8b
```

2. Use smaller quantization:
```bash
ollama pull llama3.2:3b-q4_0  # Smaller than default
```

## Scaling to Multiple GPUs

The architecture supports adding more compute nodes:

1. Each new node runs its own Ollama/SD instance
2. Register node in `ai_nodes` database table
3. Job controller routes requests based on availability
4. Shared model cache via MinIO (optional)

See `services/dashboard-next/lib/db/ai-cluster-schema.ts` for the node registry schema.

## Files Reference

| File | Location | Purpose |
|------|----------|---------|
| `windows-ai-supervisor.ps1` | Windows VM | Service manager |
| `vm-ai-health-daemon.ps1` | Windows VM | Status reporter |
| `create-local-ai-state.sh` | Ubuntu host | Polls all services |
| `kvm-orchestrator.sh` | Ubuntu host | VM lifecycle |
| `ai-orchestrator.ts` | Dashboard | Routes AI requests |
| `ai-cluster-schema.ts` | Dashboard | Node registry DB |
