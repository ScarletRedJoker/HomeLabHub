# Nebula Command

A comprehensive creation engine for homelab management, AI-powered content creation, Discord community integration, and multi-platform streaming.

```
    ███╗   ██╗███████╗██████╗ ██╗   ██╗██╗      █████╗ 
    ████╗  ██║██╔════╝██╔══██╗██║   ██║██║     ██╔══██╗
    ██╔██╗ ██║█████╗  ██████╔╝██║   ██║██║     ███████║
    ██║╚██╗██║██╔══╝  ██╔══██╗██║   ██║██║     ██╔══██║
    ██║ ╚████║███████╗██████╔╝╚██████╔╝███████╗██║  ██║
    ╚═╝  ╚═══╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝╚═╝  ╚═╝
                      COMMAND CENTER
```

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)
![Python](https://img.shields.io/badge/python-%3E%3D3.10-blue.svg)

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Deployment Targets](#deployment-targets)
- [Setup Instructions](#setup-instructions)
- [Environment Variables Reference](#environment-variables-reference)
- [Deployment Automation](#deployment-automation)
- [AI Services Setup](#ai-services-setup)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## Overview

Nebula Command is a distributed homelab management platform designed to be a universal creation hub where anyone can:

- **Spin up a server and start creating in an afternoon**
- **Manage and deploy services without DevOps expertise**
- **Build websites, bots, and applications with visual tools**
- **Automate infrastructure with AI-powered assistance**
- **Run local GPU AI services (Ollama, Stable Diffusion, ComfyUI)**

The platform is optimized for distributed deployment across cloud (Linode), local Ubuntu homelab, and Windows AI nodes connected via Tailscale VPN.

---

## Key Features

### Dashboard (Next.js 14)

The central control panel for your entire infrastructure.

| Feature | Description |
|---------|-------------|
| **Home** | Live stats, container counts, server metrics, quick actions |
| **Services** | Docker container management (start/stop/restart/logs) |
| **Servers** | SSH-based metrics from remote servers |
| **Deploy** | One-click deployments with live log streaming |
| **Editor** | Monaco code editor with file tree navigation |
| **Designer** | Visual drag-drop website builder (14 component types) |
| **Marketplace** | One-click installation of Docker-based services (24+ packages) |
| **AI Nodes** | Monitor and repair Windows GPU AI services |
| **AI Agents** | Configurable AI assistants (Jarvis, Coder, Creative, DevOps) |
| **Incidents** | Service health monitoring and auto-remediation |
| **Terminal** | Web-based SSH terminal access |

### Discord Bot

Full-featured community management bot with per-server customization.

| Feature | Description |
|---------|-------------|
| Tickets | Support ticket system with transcripts |
| Welcome Cards | Custom welcome images with @napi-rs/canvas |
| Stream Notifications | Go-live alerts for Twitch/YouTube/Kick |
| AutoMod | Automated content moderation |
| XP/Leveling | Member engagement tracking |
| Economy | Virtual currency system |
| Music | Play music with discord-player |

### Stream Bot

Multi-platform streaming management for content creators.

| Feature | Description |
|---------|-------------|
| Platform Connections | OAuth for Twitch, YouTube, Kick, Spotify |
| Stream Info Editor | Edit title/game/tags across all platforms |
| OBS Overlays | Now Playing, alerts, chat overlays |
| AI Content | Generate titles, descriptions, social posts |
| Clips | Clip management with social sharing |

### AI Gateway

Unified interface for hybrid cloud/local AI processing.

| Feature | Description |
|---------|-------------|
| Provider Fallback | Auto-selects between Stable Diffusion, OpenAI, or Ollama |
| Model Management | Browse, download, and manage AI models |
| Health Monitoring | Cross-deployment monitoring with auto-fix |
| Wake-on-LAN Relay | Remote power control for local servers from cloud |

---

## Architecture

```
                              INTERNET
                                  │
            ┌─────────────────────┴─────────────────────┐
            │                                           │
            ▼                                           ▼
┌───────────────────────────┐        ┌─────────────────────────────┐
│      LINODE SERVER        │        │      LOCAL UBUNTU HOST      │
│      ($20-40/month)       │◄──────►│      (Gaming Priority)      │
│                           │   T    │                             │
│ ┌───────────────────────┐ │   A    │ ┌─────────────────────────┐ │
│ │ Dashboard (Next.js)   │ │   I    │ │ Plex Media Server       │ │
│ │ Discord Bot           │ │   L    │ │ Home Assistant          │ │
│ │ Stream Bot            │ │   S    │ │ MinIO Storage           │ │
│ │ PostgreSQL / Redis    │ │   C    │ │ VNC Desktop             │ │
│ │ n8n Automation        │ │   A    │ └─────────────────────────┘ │
│ │ Code-Server           │ │   L    │              │              │
│ │ Caddy (Reverse Proxy) │ │   E    │              │ KVM/VFIO     │
│ └───────────────────────┘ │   │    │              ▼              │
│                           │   V    │ ┌─────────────────────────┐ │
│ Resources:                │   P    │ │ WINDOWS AI VM           │ │
│ • 4-8GB RAM               │   N    │ │ (RTX 3060 - 12GB VRAM)  │ │
│ • 2-4 vCPUs               │        │ │ ├── Ollama (11434)      │ │
│ • 80GB SSD                │        │ │ ├── Stable Diffusion    │ │
└───────────────────────────┘        │ │ │    (7860)             │ │
                                     │ │ ├── ComfyUI (8188)      │ │
                                     │ │ └── Nebula Agent (9765) │ │
                                     │ └─────────────────────────┘ │
                                     └─────────────────────────────┘
```

### Service Distribution

| Location | Services | Purpose |
|----------|----------|---------|
| **Linode** | Dashboard, Discord Bot, Stream Bot, PostgreSQL, Redis, n8n, Caddy | Always-on cloud services |
| **Ubuntu Host** | Plex, Home Assistant, MinIO, VNC, KVM orchestrator, NAS storage, qBittorrent | Local resources, media, VM management |
| **Windows VM** | Ollama, Stable Diffusion, ComfyUI, Nebula Agent | GPU-accelerated AI |

### Database Schema

```
PostgreSQL Instance
├── homelab_jarvis    # Dashboard data, AI jobs, settings, incidents
├── discord_bot       # Bot configs, tickets, leveling, custom commands
└── stream_bot        # Stream schedules, platform tokens, overlays
```

### Network Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                    TAILSCALE MESH VPN                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────────┐   │
│  │   Linode    │   │   Ubuntu    │   │    Windows VM       │   │
│  │ 100.66.x.x  │◄─►│ 100.110.x.x │◄─►│   100.118.44.102    │   │
│  └─────────────┘   └─────────────┘   └─────────────────────┘   │
│        │                 │                    │                 │
│        ▼                 ▼                    ▼                 │
│   Public Web        WoL Relay           GPU Services            │
│  (via Caddy)       (to Windows)        (AI Inference)           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites Checklist

- [ ] Docker & Docker Compose v2.x
- [ ] Node.js 20+ (for local development)
- [ ] Python 3.10+ (for AI services)
- [ ] PostgreSQL 15+ (or use Docker/Neon)
- [ ] Git for version control
- [ ] Domain with DNS access (Cloudflare recommended)
- [ ] Tailscale account (free tier)

### One-Liner Setup by Platform

```bash
# ═══════════════════════════════════════════════════════════════
# LINODE CLOUD SERVER (Production)
# ═══════════════════════════════════════════════════════════════
curl -fsSL https://raw.githubusercontent.com/ScarletRedJoker/HomeLabHub/main/deploy/scripts/bootstrap.sh | bash -s -- --role cloud --generate-secrets

# ═══════════════════════════════════════════════════════════════
# UBUNTU HOMELAB (Local)
# ═══════════════════════════════════════════════════════════════
curl -fsSL https://raw.githubusercontent.com/ScarletRedJoker/HomeLabHub/main/deploy/scripts/bootstrap.sh | bash -s -- --role local

# ═══════════════════════════════════════════════════════════════
# WINDOWS AI VM
# ═══════════════════════════════════════════════════════════════
# Run in PowerShell as Administrator:
powershell -ExecutionPolicy Bypass -File .\Start-NebulaAiStack.ps1 -Action install
# Or download and run:
powershell -ExecutionPolicy Bypass -Command "& { irm https://raw.githubusercontent.com/ScarletRedJoker/HomeLabHub/main/deploy/windows/scripts/Start-NebulaAiStack.ps1 -OutFile Start-NebulaAiStack.ps1; .\Start-NebulaAiStack.ps1 -Action install }"
```

---

## Deployment Targets

### 1. Linode (Cloud Production)

**Best for:** Production deployment, always-on services

**Recommended Specs:**
| Tier | Plan | Cost | Use Case |
|------|------|------|----------|
| Basic | 4GB Nanode | $20/mo | Light usage, personal |
| Standard | 8GB | $40/mo | Production workloads |
| Premium | 16GB | $80/mo | Multiple databases, heavy traffic |

**Initial Setup:**
```bash
# SSH into your Linode
ssh root@YOUR_LINODE_IP

# Run bootstrap script with auto-generated secrets
curl -fsSL https://raw.githubusercontent.com/ScarletRedJoker/HomeLabHub/main/deploy/scripts/bootstrap.sh | bash -s -- --role cloud --generate-secrets

# Or manual setup:
apt update && apt upgrade -y
mkdir -p /opt/homelab && cd /opt/homelab
git clone https://github.com/ScarletRedJoker/HomeLabHub.git
cd HomeLabHub

# Configure environment
cp .env.example .env
nano .env  # Fill in your values

# Start services
docker compose up -d
```

**Services Running on Linode:**
| Service | Domain | Internal Port |
|---------|--------|---------------|
| Dashboard | dashboard.yourdomain.com | 5000 |
| Discord Bot | bot.yourdomain.com | 4000 |
| Stream Bot | stream.yourdomain.com | 5000 |
| n8n | n8n.yourdomain.com | 5678 |
| Code-Server | code.yourdomain.com | 8443 |
| PostgreSQL | (internal) | 5432 |
| Redis | (internal) | 6379 |

---

### 2. Ubuntu Homelab

**Best for:** Local services requiring hardware access (Plex GPU transcoding, Home Assistant)

**Requirements:**
- Ubuntu 22.04/24.04 LTS
- Minimum 16GB RAM
- GPU with hardware transcoding support (for Plex)
- Tailscale installed

**Setup:**
```bash
# Clone repository
cd ~/contain
git clone https://github.com/ScarletRedJoker/HomeLabHub.git
cd HomeLabHub

# Run local bootstrap
./deploy/scripts/bootstrap.sh --role local

# Configure
cp .env.example .env
nano .env

# Start local services only
docker compose -f deploy/local/docker-compose.yml up -d
```

**Services Running Locally:**
| Service | Port | Purpose |
|---------|------|---------|
| Plex | 32400 | Media streaming (GPU transcoding) |
| Home Assistant | 8123 | Smart home control |
| MinIO | 9000/9001 | Object storage |
| VNC Desktop | 6080 | Remote desktop access |

---

### 3. Windows AI VM

**Best for:** GPU-accelerated AI (Stable Diffusion, Ollama, ComfyUI)

**Requirements:**
- Windows 10/11
- NVIDIA GPU (RTX 3060+ recommended, 12GB+ VRAM)
- Python 3.10.x (3.10-3.12 required, NOT 3.14)
- Tailscale connected

**See [AI Services Setup](#ai-services-setup) for detailed instructions.**

---

## Setup Instructions

### Step 1: Environment Configuration

```bash
# Copy the example file
cp .env.example .env

# Generate secrets (run each command and paste result into .env)
echo "SESSION_SECRET=$(openssl rand -hex 32)"
echo "SECRET_KEY=$(openssl rand -hex 32)"
echo "SERVICE_AUTH_TOKEN=$(openssl rand -hex 32)"
echo "DASHBOARD_API_KEY=$(openssl rand -hex 32)"

# Edit the file
nano .env
```

### Step 2: Database Setup

**Option A: Docker PostgreSQL (Recommended)**
```bash
# PostgreSQL is included in docker-compose, databases are auto-created
docker compose up -d homelab-postgres

# Verify databases were created
docker exec homelab-postgres psql -U postgres -c '\l'
```

**Option B: External PostgreSQL (Neon, Supabase, etc.)**
```bash
# Set DATABASE_URL in .env for each service
DATABASE_URL=postgresql://user:password@host:5432/homelab_jarvis
DISCORD_DB_URL=postgresql://user:password@host:5432/discord_bot
STREAMBOT_DB_URL=postgresql://user:password@host:5432/stream_bot
```

**Run Migrations:**
```bash
# Dashboard migrations
cd services/dashboard-next && npm run db:push

# Discord Bot migrations
cd services/discord-bot && npm run db:push

# Stream Bot migrations
cd services/stream-bot && npm run db:push
```

### Step 3: Service Deployment

```bash
# Start all services
docker compose up -d

# View status
docker compose ps

# Check logs for specific service
docker compose logs -f dashboard

# Rebuild after code changes
docker compose up -d --build dashboard
```

### Step 4: Health Verification

```bash
# Check Dashboard health
curl -I https://dashboard.yourdomain.com/api/health

# Check Discord Bot health
curl -I https://bot.yourdomain.com/health

# Check Stream Bot health
curl -I https://stream.yourdomain.com/health

# Full system status
./deploy/unified/deploy-all.sh status
```

### Step 5: Configure Tailscale

```bash
# Install Tailscale (all platforms)
curl -fsSL https://tailscale.com/install.sh | sh

# Connect to your tailnet
sudo tailscale up

# Note your Tailscale IP
tailscale ip -4
# Example: 100.66.61.51

# Verify mesh connectivity
tailscale status
```

### Step 6: DNS Configuration (Cloudflare)

**Linode Services (Proxied):**
| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | dashboard | LINODE_IP | ✅ Proxied |
| A | code | LINODE_IP | ✅ Proxied |
| A | n8n | LINODE_IP | ✅ Proxied |

**Bot Services (DNS Only - for WebSockets):**
| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | bot | LINODE_IP | ❌ DNS Only |
| A | stream | LINODE_IP | ❌ DNS Only |

**Local Services:**
| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | plex | LOCAL_PUBLIC_IP | ❌ DNS Only |
| A | home | LOCAL_PUBLIC_IP | ❌ DNS Only |

---

## Environment Variables Reference

### Required Variables

```bash
# ═══════════════════════════════════════════════════════════════════
# CORE CONFIGURATION (Required for all deployments)
# ═══════════════════════════════════════════════════════════════════
SERVICE_USER=evin                               # System user
TZ=America/New_York                             # Timezone
PUID=1000                                       # User ID for containers
PGID=1000                                       # Group ID for containers

# PostgreSQL
POSTGRES_PASSWORD=your_secure_password          # Generate: openssl rand -hex 32

# Session Security
SESSION_SECRET=your_session_secret              # Generate: openssl rand -hex 32
SECRET_KEY=your_flask_secret_key                # Generate: openssl rand -hex 32

# Dashboard Credentials
WEB_USERNAME=admin
WEB_PASSWORD=your_web_password

# Service Authentication
SERVICE_AUTH_TOKEN=auto_generated               # Generate: openssl rand -hex 32
DASHBOARD_API_KEY=your_api_key                  # Generate: openssl rand -hex 32

# ═══════════════════════════════════════════════════════════════════
# DATABASE PASSWORDS (One per service)
# ═══════════════════════════════════════════════════════════════════
DISCORD_DB_PASSWORD=your_discord_db_password
STREAMBOT_DB_PASSWORD=your_streambot_db_password
JARVIS_DB_PASSWORD=your_jarvis_db_password

# ═══════════════════════════════════════════════════════════════════
# AI CONFIGURATION
# ═══════════════════════════════════════════════════════════════════
OPENAI_API_KEY=sk-proj-...                      # From platform.openai.com
OPENAI_BASE_URL=https://api.openai.com/v1       # Or custom endpoint
AI_PROVIDER=openai                               # openai, ollama, or auto
AI_MODEL=gpt-4o                                  # Default chat model

# ═══════════════════════════════════════════════════════════════════
# DISCORD BOT (Required if using Discord Bot)
# ═══════════════════════════════════════════════════════════════════
DISCORD_BOT_TOKEN=your_bot_token                # Discord Developer Portal
DISCORD_CLIENT_ID=your_client_id                # OAuth2 Client ID
DISCORD_CLIENT_SECRET=your_client_secret        # OAuth2 Client Secret
```

### Optional Variables by Category

<details>
<summary><b>Stream Bot (Twitch/YouTube/Spotify)</b></summary>

```bash
# Session
STREAMBOT_SESSION_SECRET=your_session_secret
STREAMBOT_PORT=5000
STREAMBOT_NODE_ENV=production

# Twitch
TWITCH_CLIENT_ID=your_twitch_client_id
TWITCH_CLIENT_SECRET=your_twitch_client_secret
TWITCH_CHANNEL=your_channel_name
TWITCH_REDIRECT_URI=https://stream.yourdomain.com/api/auth/twitch/callback

# YouTube
YOUTUBE_CLIENT_ID=your_youtube_client_id
YOUTUBE_CLIENT_SECRET=your_youtube_client_secret
YOUTUBE_REFRESH_TOKEN=your_refresh_token
YOUTUBE_REDIRECT_URI=https://stream.yourdomain.com/api/auth/youtube/callback

# Spotify
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REFRESH_TOKEN=your_refresh_token
SPOTIFY_REDIRECT_URI=https://stream.yourdomain.com/api/auth/spotify/callback

# Kick
KICK_CLIENT_ID=your_kick_client_id
KICK_CLIENT_SECRET=your_kick_client_secret
```
</details>

<details>
<summary><b>Local Services (Ubuntu Host)</b></summary>

```bash
# Tailscale IPs
LOCAL_TAILSCALE_IP=100.110.227.25
TAILSCALE_LOCAL_HOST=100.110.227.25
TAILSCALE_LINODE_HOST=100.66.61.51

# Plex Media Server
PLEX_TOKEN=your_plex_token
PLEX_CLAIM=claim-xxxxx                          # From plex.tv/claim
PLEX_URL=http://100.110.227.25:32400
PLEX_MEDIA_PATH=/data/plex/media

# Home Assistant
HOME_ASSISTANT_URL=http://100.110.227.25:8123
HOME_ASSISTANT_TOKEN=your_long_lived_token
HOME_ASSISTANT_VERIFY_SSL=False

# MinIO Object Storage
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=your_minio_password
MINIO_ENDPOINT=minio:9000
MINIO_USE_SSL=false
MINIO_BUCKET_NAME=homelab-uploads

# VNC Remote Desktop
VNC_PASSWORD=your_vnc_password
VNC_USER=evin
```
</details>

<details>
<summary><b>Windows AI VM</b></summary>

```bash
# Windows VM Connection (via Tailscale)
WINDOWS_VM_TAILSCALE_IP=100.118.44.102
WINDOWS_VM_MAC=XX:XX:XX:XX:XX:XX                # For Wake-on-LAN
WINDOWS_VM_BROADCAST=192.168.1.255              # Local network broadcast

# Nebula Agent Authentication
NEBULA_AGENT_TOKEN=your_secure_agent_token      # Must match on Windows

# Ollama Configuration (on Windows)
OLLAMA_HOST=0.0.0.0:11434
OLLAMA_KEEP_ALIVE=5m                            # Unload models after 5min idle
```
</details>

<details>
<summary><b>n8n Automation</b></summary>

```bash
N8N_HOST=n8n.yourdomain.com
N8N_WEBHOOK_URL=https://n8n.yourdomain.com/
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=your_password
N8N_ENCRYPTION_KEY=your_encryption_key
```
</details>

<details>
<summary><b>Email & Notifications</b></summary>

```bash
EMAIL_PROVIDER=smtp                              # smtp, sendgrid, mailgun
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=Nebula Command
ADMIN_EMAIL=admin@yourdomain.com

# SMTP Settings
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email
SMTP_PASSWORD=your_app_password
SMTP_USE_TLS=true

# Alternative: SendGrid
SENDGRID_API_KEY=your_api_key

# Alternative: Mailgun
MAILGUN_API_KEY=your_api_key
MAILGUN_DOMAIN=mg.yourdomain.com
```
</details>

<details>
<summary><b>Cloudflare DNS Management</b></summary>

```bash
# API Token with Zone.DNS Edit permission
CLOUDFLARE_API_TOKEN=your_api_token

# Zone IDs for your domains
CLOUDFLARE_ZONE_ID_EVINDRAKE=zone_id_here
CLOUDFLARE_ZONE_ID_RIGCITY=zone_id_here
```
</details>

### Generating Secrets

```bash
# Generate a secure 32-byte hex secret
openssl rand -hex 32

# Generate a secure password
openssl rand -base64 24

# Generate all required secrets at once
echo "SESSION_SECRET=$(openssl rand -hex 32)"
echo "SECRET_KEY=$(openssl rand -hex 32)"
echo "SERVICE_AUTH_TOKEN=$(openssl rand -hex 32)"
echo "DASHBOARD_API_KEY=$(openssl rand -hex 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)"
echo "DISCORD_SESSION_SECRET=$(openssl rand -hex 32)"
echo "STREAMBOT_SESSION_SECRET=$(openssl rand -hex 32)"
echo "NEBULA_AGENT_TOKEN=$(openssl rand -hex 32)"
```

---

## Deployment Automation

### Using deploy-all.sh

The unified deployment orchestrator manages all targets from a single control plane:

```bash
# Show help
./deploy/unified/deploy-all.sh --help

# Deploy to all targets (local + linode)
./deploy/unified/deploy-all.sh

# Deploy to specific targets
./deploy/unified/deploy-all.sh -t local
./deploy/unified/deploy-all.sh -t linode
./deploy/unified/deploy-all.sh -t local,linode

# Parallel deployment (faster)
./deploy/unified/deploy-all.sh -p -t local,linode

# Check status of all nodes
./deploy/unified/deploy-all.sh status

# Run health checks
./deploy/unified/deploy-all.sh health

# Sync code without deploying
./deploy/unified/deploy-all.sh sync

# Dry run (show what would happen)
./deploy/unified/deploy-all.sh -n

# Verbose output
./deploy/unified/deploy-all.sh -v
```

### Individual Deployment Commands

```bash
# ═══════════════════════════════════════════════════════════════
# LINODE
# ═══════════════════════════════════════════════════════════════
./deploy/linode/deploy.sh
./deploy/linode/deploy.sh --check    # Health check only

# ═══════════════════════════════════════════════════════════════
# LOCAL UBUNTU
# ═══════════════════════════════════════════════════════════════
./deploy/local/deploy.sh
./deploy/local/deploy.sh --verbose

# ═══════════════════════════════════════════════════════════════
# WINDOWS AI VM (from PowerShell as Admin)
# ═══════════════════════════════════════════════════════════════
.\deploy\windows\scripts\Start-NebulaAiStack.ps1 start
.\deploy\windows\scripts\Start-NebulaAiStack.ps1 status
.\deploy\windows\scripts\Start-NebulaAiStack.ps1 stop
.\deploy\windows\scripts\Start-NebulaAiStack.ps1 repair
```

### Bootstrap Script Options

```bash
./deploy/scripts/bootstrap.sh [OPTIONS]

Options:
  --role cloud|local    Deployment role (required on first run)
  --generate-secrets    Auto-generate all missing secrets
  --skip-cron           Skip self-healing cron job setup
  --skip-health-wait    Skip waiting for Docker health checks
  --setup-iptables      Setup iptables for GameStream (local only)
  --dry-run             Validate environment without deploying
  --verbose             Enable debug output
  --help                Show help message

Examples:
  # First-time cloud deployment with secret generation
  ./deploy/scripts/bootstrap.sh --role cloud --generate-secrets

  # Local deployment with iptables for GameStream
  sudo ./deploy/scripts/bootstrap.sh --role local --setup-iptables

  # Validate environment without deploying
  ./deploy/scripts/bootstrap.sh --role cloud --dry-run
```

### GitHub Actions CI/CD

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy Nebula Command

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy-linode:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy to Linode
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.LINODE_HOST }}
          username: ${{ secrets.LINODE_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /opt/homelab/HomeLabHub
            git pull origin main
            docker compose pull
            docker compose up -d --remove-orphans
            docker system prune -f

  notify:
    needs: deploy-linode
    runs-on: ubuntu-latest
    steps:
      - name: Notify Discord
        uses: sarisia/actions-status-discord@v1
        with:
          webhook: ${{ secrets.DISCORD_WEBHOOK }}
          title: "Deployment Complete"
          description: "Nebula Command deployed to production"
```

---

## AI Services Setup

### Windows VM AI Stack Overview

The Windows VM hosts GPU-accelerated AI services accessible via Tailscale:

| Service | Port | Description | VRAM Usage |
|---------|------|-------------|------------|
| Ollama | 11434 | LLM inference (Llama, Mistral, CodeLlama) | 2-10GB |
| Stable Diffusion | 7860 | Image generation (AUTOMATIC1111 WebUI) | 4-8GB |
| ComfyUI | 8188 | Node-based image/video workflows | 6-12GB |
| Nebula Agent | 9765 | Remote control and health reporting | Minimal |

### One-Command Setup

```powershell
# Run in PowerShell as Administrator
cd C:\NebulaCommand\deploy\windows\scripts
.\Start-NebulaAiStack.ps1 -Action install

# This script:
# 1. Validates Python version (3.10-3.12 required, rejects 3.14+)
# 2. Checks PyTorch CUDA compatibility
# 3. Repairs CPU-only PyTorch with CUDA 12.1 version
# 4. Starts all AI services in order: Ollama → SD → ComfyUI → Agent
# 5. Registers auto-start on Windows boot
```

### Manual Installation

```powershell
# ═══════════════════════════════════════════════════════════════
# 1. INSTALL OLLAMA
# ═══════════════════════════════════════════════════════════════
winget install Ollama.Ollama

# Configure network access (required for Tailscale)
[Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0", "Machine")

# Restart Ollama service
Stop-Service "Ollama" -ErrorAction SilentlyContinue
Start-Service "Ollama"

# Pull essential models
ollama pull llama3.2:3b         # Fast chat (2.5GB)
ollama pull qwen2.5-coder:7b    # Code assist (5GB)
ollama pull nomic-embed-text    # Embeddings (0.5GB)

# ═══════════════════════════════════════════════════════════════
# 2. INSTALL STABLE DIFFUSION WEBUI
# ═══════════════════════════════════════════════════════════════
cd C:\
git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui.git
cd stable-diffusion-webui

# Configure for network access - edit webui-user.bat:
# set COMMANDLINE_ARGS=--api --listen --enable-insecure-extension-access --xformers

# First run (downloads dependencies)
.\webui-user.bat

# ═══════════════════════════════════════════════════════════════
# 3. INSTALL COMFYUI
# ═══════════════════════════════════════════════════════════════
cd C:\Users\Evin\Documents
# Download ComfyUI_windows_portable from GitHub releases
# Extract and run with --listen 0.0.0.0

# ═══════════════════════════════════════════════════════════════
# 4. CONFIGURE FIREWALL
# ═══════════════════════════════════════════════════════════════
netsh advfirewall firewall add rule name="Ollama API" dir=in action=allow protocol=tcp localport=11434
netsh advfirewall firewall add rule name="Stable Diffusion API" dir=in action=allow protocol=tcp localport=7860
netsh advfirewall firewall add rule name="ComfyUI API" dir=in action=allow protocol=tcp localport=8188
netsh advfirewall firewall add rule name="Nebula Agent" dir=in action=allow protocol=tcp localport=9765
```

### Wake-on-LAN Relay Configuration

Wake your Windows VM from anywhere through the Ubuntu host relay:

**On Dashboard (Linode):**
```bash
# Set in .env
WINDOWS_VM_MAC=XX:XX:XX:XX:XX:XX          # Windows VM network adapter MAC
WINDOWS_VM_BROADCAST=192.168.1.255        # Local network broadcast address
WINDOWS_VM_TAILSCALE_IP=100.118.44.102    # Windows Tailscale IP
```

**On Ubuntu Host:**
```bash
# Install and enable WoL relay
./deploy/local/scripts/wol-relay.sh install

# Test manually
wakeonlan -i 192.168.1.255 XX:XX:XX:XX:XX:XX
```

**From Dashboard UI:**
1. Navigate to `/infrastructure`
2. Click "Wake" button on Windows VM card
3. Wait for status to change to "Online" (~30 seconds)

### Model Management

**Via Dashboard UI:**
- Go to `/ai-models` for complete model inventory
- Browse HuggingFace and Civitai catalogs
- Queue downloads to Windows VM with progress tracking
- Monitor VRAM usage per model

**Via Ollama CLI:**
```bash
# List installed models
ollama list

# Pull new model
ollama pull deepseek-coder-v2:16b

# Remove unused model
ollama rm unused-model

# Show model info
ollama show llama3.2:3b
```

### VRAM Guidelines (RTX 3060 - 12GB)

| Concurrent Load | VRAM Usage | Status |
|-----------------|------------|--------|
| Ollama 3B + Embeddings | ~3GB | ✅ Safe |
| Ollama 8B alone | ~5.5GB | ✅ Safe |
| SD Image Generation | 4-8GB | ✅ Safe |
| Ollama 16B alone | ~10GB | ⚠️ Tight |
| Ollama + SD together | 12GB+ | ❌ OOM Error |

**Auto-Unload Configuration:**
```bash
# Keep model in VRAM for 5 minutes after last use
export OLLAMA_KEEP_ALIVE=5m
```

---

## Troubleshooting

### Common Issues and Solutions

#### Container Won't Start

```bash
# Check container logs
docker logs container-name --tail 100

# Check for port conflicts
sudo netstat -tlnp | grep PORT

# Verify environment configuration
docker compose config

# Force rebuild
docker compose up -d --build --force-recreate container-name
```

#### Database Connection Failed

```bash
# Test PostgreSQL connection
docker exec -it homelab-postgres psql -U postgres -c "SELECT version();"

# List databases
docker exec -it homelab-postgres psql -U postgres -c '\l'

# Check DATABASE_URL format
# Correct: postgresql://user:password@host:5432/dbname
echo $DATABASE_URL
```

#### Tailscale Not Connecting

```bash
# Check Tailscale status
tailscale status

# Re-authenticate
sudo tailscale up --reset

# Verify firewall allows Tailscale
sudo ufw allow in on tailscale0

# Test peer connectivity
ping 100.x.x.x  # Other node's Tailscale IP
```

#### AI Services Unreachable

```powershell
# On Windows VM - check services are listening
netstat -an | findstr "LISTENING" | findstr "11434\|7860\|8188"

# Verify Ollama is configured for network access
echo $env:OLLAMA_HOST
# Should be: 0.0.0.0:11434

# Test local access first
curl http://localhost:11434/api/version

# Test from Linode via Tailscale
curl http://100.118.44.102:11434/api/version

# Restart all AI services
.\Start-NebulaAiStack.ps1 restart
```

#### PyTorch CUDA Errors

```powershell
# "Torch not compiled with CUDA enabled"
# This means CPU-only PyTorch was installed

# Fix: Reinstall with CUDA support
pip uninstall torch torchvision torchaudio -y
pip install torch==2.3.1+cu121 torchvision==0.18.1+cu121 torchaudio==2.3.1+cu121 --index-url https://download.pytorch.org/whl/cu121

# Verify CUDA is available
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}')"
```

#### SSL Certificate Issues

```bash
# Check Caddy logs
docker logs caddy --tail 50

# Force certificate renewal
docker exec caddy caddy reload --config /etc/caddy/Caddyfile

# Verify DNS is pointing correctly
dig +short yourdomain.com
```

### Log Locations

| Service | Location | Command |
|---------|----------|---------|
| Dashboard | Container logs | `docker logs homelab-dashboard -f` |
| Discord Bot | Container logs | `docker logs discord-bot -f` |
| Stream Bot | Container logs | `docker logs stream-bot -f` |
| PostgreSQL | Container logs | `docker logs homelab-postgres -f` |
| Caddy | Container logs | `docker logs caddy -f` |
| Windows AI | `C:\ProgramData\NebulaCommand\logs\` | PowerShell |
| Windows AI Supervisor | `C:\ProgramData\NebulaCommand\logs\ai-supervisor.log` | PowerShell |

### Health Check Commands

```bash
# ═══════════════════════════════════════════════════════════════
# QUICK HEALTH CHECKS
# ═══════════════════════════════════════════════════════════════

# Dashboard API
curl https://dashboard.yourdomain.com/api/health

# Full system status via deploy script
./deploy/unified/deploy-all.sh status

# Docker container status
docker compose ps
docker stats --no-stream

# ═══════════════════════════════════════════════════════════════
# AI SERVICE HEALTH
# ═══════════════════════════════════════════════════════════════

# Ollama
curl http://100.118.44.102:11434/api/version

# Stable Diffusion
curl http://100.118.44.102:7860/sdapi/v1/options

# ComfyUI
curl http://100.118.44.102:8188/system_stats

# Nebula Agent
curl http://100.118.44.102:9765/health
```

### Exit Codes Reference

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | .env file missing |
| 3 | Required environment variables missing |
| 4 | Docker not available |
| 5 | Docker Compose failed |
| 6 | Health check failed |
| 7 | iptables setup failed |

### Common AI Dependency Errors

| Error | Solution |
|-------|----------|
| `numpy.core.multiarray failed to import` | `pip install numpy==1.26.4` |
| `No module named 'triton'` | `pip install triton-windows` |
| `xFormers can't load C++/CUDA extensions` | `pip install xformers --no-build-isolation` |
| `No module named 'aiohttp'` | `pip install aiohttp alembic pyyaml sqlalchemy` |
| `torch.library has no attribute 'custom_op'` | `pip uninstall comfy_kitchen -y` |
| `Torch not compiled with CUDA enabled` | See PyTorch CUDA Errors above |

---

## Project Structure

```
nebula-command/
├── services/
│   ├── dashboard-next/         # Next.js 14 dashboard
│   │   ├── app/                # App router pages & API routes
│   │   ├── components/         # React components
│   │   ├── lib/                # Utilities, AI orchestration, DB
│   │   └── drizzle/            # Database migrations
│   ├── discord-bot/            # Discord.js bot
│   │   ├── client/             # React admin panel (Vite)
│   │   ├── server/             # Express + Discord.js
│   │   └── shared/             # Shared types/schema
│   └── stream-bot/             # Stream management
│       ├── client/             # React dashboard (Vite)
│       └── server/             # Express + platform integrations
├── deploy/
│   ├── unified/                # Unified deployment orchestrator
│   │   └── deploy-all.sh       # Multi-target deployment
│   ├── linode/                 # Cloud deployment configs
│   ├── local/                  # Ubuntu homelab configs
│   ├── windows/                # Windows AI VM scripts
│   │   ├── agent/              # Node.js control agent
│   │   └── scripts/            # PowerShell setup scripts
│   └── scripts/                # Bootstrap & utilities
├── config/                     # Service configurations
│   ├── caddy/                  # Reverse proxy configs
│   ├── prometheus/             # Monitoring
│   └── secrets/                # Template secret files
├── docs/                       # Documentation
│   ├── WINDOWS_VM_AI_SETUP.md
│   ├── LOCAL_AI_DEPLOYMENT_GUIDE.md
│   └── API_DOCUMENTATION.md
├── .env.example                # Environment template
└── README.md                   # This file
```

---

## Related Documentation

- [Deployment Guide](./deploy/DEPLOYMENT_GUIDE.md) - Detailed multi-platform deployment
- [API Documentation](./docs/API_DOCUMENTATION.md) - REST API reference
- [Windows AI Setup](./docs/WINDOWS_VM_AI_SETUP.md) - GPU AI service installation
- [Local AI Deployment](./docs/LOCAL_AI_DEPLOYMENT_GUIDE.md) - AI infrastructure guide
- [Stream Bot Setup](./docs/STREAM_BOT_SETUP.md) - Twitch/YouTube/Kick integration
- [Security Guide](./docs/SECURITY.md) - Security best practices
- [Platform Architecture](./docs/PLATFORM_ARCHITECTURE.md) - System design details

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -am 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## License

MIT License - See [LICENSE](LICENSE) file for details.

---

## Support

- Open an [Issue](https://github.com/ScarletRedJoker/HomeLabHub/issues) for bug reports
- Use [Discussions](https://github.com/ScarletRedJoker/HomeLabHub/discussions) for questions
- Check the [Wiki](https://github.com/ScarletRedJoker/HomeLabHub/wiki) for detailed documentation

---

<p align="center">
  <b>Nebula Command</b> - Unified Homelab Management Platform<br>
  <sub>Built with Next.js, Discord.js, Express, PostgreSQL, and ❤️</sub>
</p>
