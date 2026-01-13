# Windows AI Deployment

Deploy and manage GPU-accelerated AI services on Windows 11 with RTX 3060 (or similar NVIDIA GPU).

## Overview

This deployment bundle turns your Windows machine into a powerful AI inference and training node that integrates with the Nebula Command dashboard via Tailscale.

### Capabilities

| Category | Service | VRAM | Description |
|----------|---------|------|-------------|
| **Inference** | Ollama | 4-10GB | LLM inference (Llama, Qwen, Mistral, CodeLlama) |
| **Inference** | Stable Diffusion WebUI | 4-8GB | Image generation (SDXL, SD 1.5) |
| **Inference** | ComfyUI | 4-10GB | Video generation, advanced workflows |
| **Inference** | Whisper | 1-4GB | Speech-to-text transcription |
| **Training** | kohya_ss | 8-12GB | LoRA/SDXL fine-tuning |
| **Training** | Unsloth | 10-12GB | LLM fine-tuning (QLoRA) |

## One-Line Install (Recommended)

The fastest way to set up your Windows AI node:

```powershell
# Open PowerShell as Administrator and run:
# First, set your repository URL
$env:NEBULA_REPO_URL = "https://github.com/your-org/nebula-command.git"

# Then run the bootstrap
Set-ExecutionPolicy Bypass -Scope Process -Force
irm https://raw.githubusercontent.com/your-org/nebula-command/main/deploy/windows/bootstrap.ps1 | iex
```

Or with explicit parameters:
```powershell
.\bootstrap.ps1 -RepoUrl "https://github.com/your-org/nebula-command.git"
```

This automatically:
- Checks system requirements (GPU, VRAM, disk space)
- Installs all dependencies (Git, Python, Tailscale)
- Deploys AI services (Ollama, Stable Diffusion, ComfyUI)
- Configures firewall and auto-start
- Runs verification tests
- Starts the health daemon

### One-Line Install Options

```powershell
# With dashboard webhook pre-configured:
$env:WEBHOOK = "https://your-dashboard.com/api/ai/health-webhook"
irm https://raw.githubusercontent.com/.../bootstrap.ps1 | iex

# Unattended mode (no prompts):
powershell -Command "& { irm https://raw.githubusercontent.com/.../bootstrap.ps1 | iex } -Unattended"

# Skip specific services:
.\bootstrap.ps1 -SkipStableDiffusion -SkipComfyUI
```

## Prerequisites

1. **Windows 11** (Windows 10 may work but untested)
2. **NVIDIA GPU** with 8GB+ VRAM (RTX 3060 12GB recommended)
3. **NVIDIA Drivers** (535+ for CUDA 12.x support)
4. **Administrator PowerShell** access

The installer automatically handles: Tailscale, Git, Python 3.11, Visual C++ Runtime

## Manual Installation

If you prefer step-by-step control:

### 1. Clone Repository
```powershell
git clone https://github.com/YOUR_ORG/nebula-command.git C:\NebulaCommand
cd C:\NebulaCommand\deploy\windows
```

### 2. Run Unified Installer
```powershell
# Run as Administrator
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
.\scripts\install-ai-node.ps1
```

**Installer Options:**
```powershell
# Preview changes without making them
.\scripts\install-ai-node.ps1 -WhatIf

# Skip specific services
.\scripts\install-ai-node.ps1 -SkipStableDiffusion -SkipWhisper

# Include training tools (kohya_ss, Unsloth)
.\scripts\install-ai-node.ps1 -InstallTraining

# Unattended with webhook
.\scripts\install-ai-node.ps1 -Unattended -DashboardWebhook "https://your-dashboard.com/api/ai/health-webhook"
```

### 3. Verify Installation
```powershell
# Check service status
.\scripts\windows-ai-supervisor.ps1 -Action status

# View installation report
Get-Content C:\ProgramData\NebulaCommand\logs\install.log -Tail 50

# Check node manifest
Get-Content C:\ProgramData\NebulaCommand\node-manifest.json | ConvertFrom-Json
```

The installer performs these phases:
1. **Preflight** - Validates GPU, VRAM, disk space, Windows version
2. **Dependencies** - Installs Git, Python 3.11, VC++ Runtime, Tailscale
3. **AI Services** - Deploys Ollama, Stable Diffusion, ComfyUI, Whisper
4. **Configuration** - Sets up environment, firewall rules for Tailscale
5. **Verification** - Smoke tests each service
6. **Startup** - Launches supervisor and health daemon

## Folder Structure

```
deploy/windows/
├── scripts/           # PowerShell automation scripts
│   ├── setup-windows-ai.ps1      # Main installer
│   ├── windows-ai-supervisor.ps1 # Service manager
│   ├── vm-ai-health-daemon.ps1   # Health reporting daemon
│   ├── windows-agent.ps1         # Remote control agent
│   └── *.ps1                     # Other utility scripts
├── services/          # Docker/native service configurations
│   ├── ollama/        # Ollama configuration
│   ├── stable-diffusion/  # SD WebUI setup
│   ├── comfyui/       # ComfyUI configuration
│   └── whisper/       # Whisper.cpp setup
├── configs/           # Environment and configuration templates
│   ├── environment.ps1.example
│   ├── models.json    # Recommended model list
│   └── scheduled-tasks.xml  # Windows Task Scheduler exports
├── training/          # AI training pipelines
│   ├── lora/          # LoRA fine-tuning scripts
│   ├── sdxl/          # SDXL training configs
│   └── llm/           # LLM fine-tuning (Unsloth)
└── docs/              # Documentation
    └── TRAINING_GUIDE.md
```

## Scripts Reference

### windows-ai-supervisor.ps1
Manages AI service lifecycle:
```powershell
.\scripts\windows-ai-supervisor.ps1 -Action start   # Start all services
.\scripts\windows-ai-supervisor.ps1 -Action stop    # Stop all services
.\scripts\windows-ai-supervisor.ps1 -Action restart # Restart all services
.\scripts\windows-ai-supervisor.ps1 -Action status  # Check service status
```

### vm-ai-health-daemon.ps1
Reports health to dashboard:
```powershell
# Run continuously (as scheduled task)
.\scripts\vm-ai-health-daemon.ps1 -IntervalSeconds 30

# One-time status
.\scripts\vm-ai-health-daemon.ps1 -IntervalSeconds 0
```

### windows-agent.ps1
Receives commands from dashboard:
```powershell
# Start agent (listens on port 8765)
.\scripts\windows-agent.ps1 -Port 8765
```

## VRAM Management

With 12GB VRAM on RTX 3060, only run **one major model at a time**:

| Scenario | Active Services | VRAM Usage |
|----------|-----------------|------------|
| Chat Only | Ollama (8B model) | ~6GB |
| Image Gen | Stable Diffusion | ~6-8GB |
| Video Gen | ComfyUI + AnimateDiff | ~8-10GB |
| Transcription | Whisper + Ollama (small) | ~4GB |
| Training | kohya_ss only | 10-12GB |

### Model Hot-Swapping

The dashboard can request model unloads before starting new tasks:
```powershell
# Unload Ollama model to free VRAM
Invoke-RestMethod -Uri "http://localhost:11434/api/unload"

# ComfyUI automatically manages VRAM
# Stable Diffusion: Use the "Unload Checkpoint" button or API
```

## Dashboard Integration

### Health Webhook
The health daemon POSTs status to your dashboard every 30 seconds:
```json
{
  "timestamp": "2026-01-13T14:30:00Z",
  "hostname": "GAMING-PC",
  "services": {
    "ollama": { "status": "online", "models": ["llama3.2:8b"] },
    "stable_diffusion": { "status": "online" },
    "comfyui": { "status": "offline" }
  },
  "gpu": {
    "memory_used_mb": 4096,
    "memory_total_mb": 12288,
    "utilization_percent": 45
  }
}
```

### Remote Control API
Dashboard can send commands:
- `POST /api/ai/control` → `{"action": "restart", "service": "ollama"}`
- Requires `KVM_AGENT_TOKEN` environment variable on both sides

## Training Pipelines (Future)

### LoRA Training
```powershell
# Prepare dataset
.\training\lora\prepare-dataset.ps1 -InputDir "C:\Training\Images" -OutputDir "C:\Training\Dataset"

# Train LoRA
.\training\lora\train.ps1 -Dataset "C:\Training\Dataset" -OutputName "my-style-lora"
```

### LLM Fine-tuning
```powershell
# Uses Unsloth for efficient QLoRA training
.\training\llm\finetune.ps1 -BaseModel "llama3.2:8b" -Dataset "C:\Training\conversations.jsonl"
```

## Troubleshooting

### Ollama "server not responding" during setup
The Ollama server needs time to start before pulling models:
```powershell
# Start Ollama manually
ollama serve

# In another terminal, pull models
ollama pull qwen2.5-coder:7b
ollama pull nomic-embed-text
```

### Stable Diffusion git authentication failure
The Stability-AI repo requires a GitHub Personal Access Token:
```powershell
# Option 1: Use SSH (recommended)
git config --global url."git@github.com:".insteadOf "https://github.com/"

# Option 2: Create a GitHub PAT with 'repo' scope
# Go to: https://github.com/settings/tokens
# Then set credential helper:
git config --global credential.helper manager

# Option 3: Skip the problematic repo (SD will use a fallback)
# Delete the partial clone and restart:
Remove-Item -Recurse C:\AI\stable-diffusion-webui
# Then run webui.bat manually (not with --exit)
```

### SSH from Linux fails with "Too many authentication failures"
```bash
# Limit SSH to password-only:
ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no Evin@100.118.44.102

# Or limit identity attempts:
ssh -o IdentitiesOnly=yes Evin@100.118.44.102
```

### Service won't start
```powershell
# Check Windows Event Log
Get-EventLog -LogName Application -Source "NebulaAI" -Newest 20

# Check service-specific logs
Get-Content C:\ProgramData\NebulaCommand\logs\ollama.log -Tail 50
```

### VRAM exhausted
```powershell
# Force unload all models
.\scripts\windows-ai-supervisor.ps1 -Action unload-all

# Check GPU status
nvidia-smi
```

### Health daemon not reporting
```powershell
# Test webhook manually
$body = @{ test = $true } | ConvertTo-Json
Invoke-RestMethod -Uri $env:NEBULA_HEALTH_WEBHOOK -Method Post -Body $body -ContentType "application/json"
```

## Security Notes

1. **Token Management**: Generate secure tokens with `openssl rand -hex 32`
2. **Firewall**: Only Tailscale traffic should reach AI service ports
3. **Updates**: Regularly update NVIDIA drivers and AI frameworks
4. **Isolation**: Consider Windows Sandbox for untrusted model testing

## Next Steps

- [ ] Configure scheduled tasks for auto-start on boot
- [ ] Set up the training pipelines for your use case
- [ ] Add your Windows machine to the dashboard's node registry
- [ ] Test remote control from dashboard
