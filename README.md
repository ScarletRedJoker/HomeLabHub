# Nebula Command

A comprehensive homelab management and creation engine - empowering anyone to build, deploy, and manage services, websites, and applications from anywhere.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)
![Python](https://img.shields.io/badge/python-%3E%3D3.10-blue.svg)

## Vision

Nebula Command is designed to be a universal creation platform where anyone can:
- Spin up a server and start creating in an afternoon
- Manage and deploy services without DevOps expertise
- Build websites, bots, and applications with visual tools
- Automate infrastructure with AI-powered assistance
- Run local GPU AI services (Ollama, Stable Diffusion, ComfyUI)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         NEBULA COMMAND                          │
├─────────────────────────────────────────────────────────────────┤
│  Dashboard (Next.js)  │  Discord Bot  │  Stream Bot             │
│  Port 5000            │  Port 3000    │  Port 3001              │
├─────────────────────────────────────────────────────────────────┤
│                    PostgreSQL + Redis                           │
├─────────────────────────────────────────────────────────────────┤
│  Windows AI Node (via Tailscale)                                │
│  - Ollama (11434) - Stable Diffusion (7860) - ComfyUI (8188)    │
└─────────────────────────────────────────────────────────────────┘
```

## Features

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
| **Marketplace** | One-click installation of Docker-based services |
| **AI Nodes** | Monitor and repair Windows GPU AI services |
| **AI Agents** | Configurable AI assistants (Jarvis, Coder, Creative, DevOps) |
| **Incidents** | Service health monitoring and auto-remediation |
| **Terminal** | Web-based SSH terminal access |

### Discord Bot
Full-featured community management bot.

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
Multi-platform streaming management.

| Feature | Description |
|---------|-------------|
| Platform Connections | OAuth for Twitch, YouTube, Kick, Spotify |
| Stream Info Editor | Edit title/game/tags across all platforms |
| OBS Overlays | Now Playing, alerts, chat overlays |
| AI Content | Generate titles, descriptions, social posts |
| Clips | Clip management with social sharing |

---

## Quick Start

### Prerequisites

- **Node.js** 20+ and npm
- **Python** 3.10+ (for AI services)
- **PostgreSQL** 14+ (or use [Neon](https://neon.tech) for cloud database)
- **Redis** (optional, for caching)
- **Tailscale** (optional, for secure AI node access)

### Option 1: Deploy to Cloud (Linode/VPS)

1. **Create a server** (Ubuntu 22.04, 4GB RAM minimum)

2. **SSH into your server:**
```bash
ssh root@YOUR_SERVER_IP
```

3. **Install Docker:**
```bash
curl -fsSL https://get.docker.com | sh
```

4. **Clone and deploy:**
```bash
mkdir -p /opt/homelab && cd /opt/homelab
git clone https://github.com/yourusername/nebula-command.git
cd nebula-command/deploy/linode
./deploy.sh
```

The deploy script will:
- Auto-generate all internal secrets (database passwords, JWT keys, etc.)
- Prompt for required external tokens (Discord)
- Build and deploy all services

### Option 2: Local Development

```bash
# Clone repository
git clone https://github.com/yourusername/nebula-command.git
cd nebula-command

# Copy environment template
cp .env.example .env

# Edit with your values
nano .env

# Install dependencies for each service
cd services/dashboard-next && npm install
cd ../discord-bot && npm install  
cd ../stream-bot && npm install
```

---

## Configuration

### Required Environment Variables

| Variable | Description | How to Get |
|----------|-------------|------------|
| `POSTGRES_PASSWORD` | Database superuser password | `openssl rand -hex 32` |
| `DISCORD_BOT_TOKEN` | Discord bot token | [Discord Developer Portal](https://discord.com/developers/applications) |
| `DISCORD_CLIENT_ID` | Discord OAuth client ID | Discord Developer Portal → OAuth2 |
| `DISCORD_CLIENT_SECRET` | Discord OAuth secret | Discord Developer Portal → OAuth2 |
| `SESSION_SECRET` | Session encryption key | `openssl rand -hex 32` |

### Optional Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for AI features |
| `TAILSCALE_AUTHKEY` | For local homelab connectivity |
| `CLOUDFLARE_API_TOKEN` | For DNS management |
| `TWITCH_CLIENT_ID/SECRET` | Twitch integration |
| `YOUTUBE_CLIENT_ID/SECRET` | YouTube integration |
| `SPOTIFY_CLIENT_ID/SECRET` | Spotify integration |

See `.env.example` for all configuration options.

### Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application** → Name it → Create
3. Go to **Bot** → Click **Add Bot** → Copy Token
4. Enable these **Privileged Gateway Intents**:
   - Presence Intent
   - Server Members Intent
   - Message Content Intent
5. Go to **OAuth2** → **URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Permissions: `Administrator` (or specific permissions you need)
6. Copy the generated URL and open it to invite bot to your server

### Dashboard Configuration

Create `services/dashboard-next/.env`:

```env
# Required
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password
SESSION_SECRET=your_32_char_minimum_secret
DATABASE_URL=postgresql://user:password@localhost:5432/homelab_jarvis

# AI Features
OPENAI_API_KEY=sk-proj-your_key

# SSH Server Management (optional)
LINODE_SSH_HOST=your-server-ip
LINODE_SSH_USER=root
LINODE_SSH_KEY_PATH=/path/to/ssh/key

# Windows AI Node (optional)
WINDOWS_VM_TAILSCALE_IP=100.x.x.x
NEBULA_AGENT_TOKEN=your_secure_token
```

---

## Windows AI Node Setup

For GPU-accelerated AI services (Ollama, Stable Diffusion, ComfyUI), set up a Windows machine with an NVIDIA GPU.

### Prerequisites

- Windows 10/11 with NVIDIA GPU (8GB+ VRAM recommended)
- [NVIDIA Drivers](https://www.nvidia.com/drivers) + [CUDA 12.1](https://developer.nvidia.com/cuda-downloads)
- [Python 3.10](https://www.python.org/downloads/)
- [Node.js 20+](https://nodejs.org/)
- [Tailscale](https://tailscale.com/download) for secure remote access

### Step 1: Install Tailscale

```powershell
# Download and install from https://tailscale.com/download
# Then connect:
tailscale up
```

Note your Tailscale IP (e.g., `100.x.x.x`) - you'll need this for dashboard configuration.

### Step 2: Install AI Services

```powershell
# Create AI directory
mkdir C:\AI
cd C:\AI

# Install Ollama (LLM inference)
winget install Ollama.Ollama

# Clone Stable Diffusion WebUI
git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui.git
cd stable-diffusion-webui
# Run first time setup (downloads models, creates venv)
.\webui-user.bat

# Clone ComfyUI
cd C:\AI
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI
pip install -r requirements.txt
```

### Step 3: Fix AI Dependencies

Python AI packages often have version conflicts. Install in this order:

```powershell
# Core packages (version order matters!)
pip install numpy==1.26.4 protobuf==5.28.3

# PyTorch with CUDA 12.1
pip install torch==2.3.1+cu121 torchvision==0.18.1+cu121 torchaudio==2.3.1+cu121 --index-url https://download.pytorch.org/whl/cu121

# Memory-efficient attention
pip install xformers --no-build-isolation

# Triton for Windows (optional optimization)
pip install triton-windows

# ComfyUI extras
pip install aiohttp alembic pyyaml sqlalchemy
```

### Step 4: Deploy Nebula Agent

The agent allows the dashboard to monitor and control AI services remotely.

```powershell
# Clone the repo or copy agent files
git clone https://github.com/yourusername/nebula-command.git C:\NebulaCommand

# Navigate to agent directory
cd C:\NebulaCommand\deploy\windows\agent

# Install dependencies
npm install

# Set authentication token (generate a secure random string)
[Environment]::SetEnvironmentVariable("NEBULA_AGENT_TOKEN", "your_secure_token_here", "Machine")
[Environment]::SetEnvironmentVariable("AGENT_PORT", "9765", "Machine")

# Start the agent (run as Administrator)
.\start.ps1
```

**Important:** Use the same `NEBULA_AGENT_TOKEN` value in your dashboard's environment variables.

### Step 5: Start All Services (Unified Startup)

Use the unified startup script that validates dependencies and starts everything:

```powershell
# Run as Administrator - validates Python, repairs PyTorch/CUDA, starts all services
cd C:\NebulaCommand\deploy\windows\scripts
.\Start-NebulaAiStack.ps1 start
```

The script will:
1. **Validate Python version** (requires 3.10-3.12, rejects 3.14+)
2. **Check PyTorch CUDA** and repair if needed (installs correct CUDA build)
3. **Start all services** in order: Ollama → Stable Diffusion → ComfyUI → Agent

Other commands:
```powershell
.\Start-NebulaAiStack.ps1 status    # Check all service status
.\Start-NebulaAiStack.ps1 stop      # Stop all services
.\Start-NebulaAiStack.ps1 repair    # Fix dependencies without starting
.\Start-NebulaAiStack.ps1 install   # Install as auto-start on boot
```

### Step 6: Troubleshoot Common Errors

**"Torch not compiled with CUDA enabled"**

This means PyTorch was installed without GPU support. The unified script fixes this automatically, but you can also run:
```powershell
# Must use Python 3.10-3.12 (NOT 3.14)
pip uninstall torch torchvision torchaudio -y
pip install torch==2.3.1+cu121 torchvision==0.18.1+cu121 torchaudio==2.3.1+cu121 --index-url https://download.pytorch.org/whl/cu121
```

**Python 3.14 Issues**

PyTorch doesn't have CUDA wheels for Python 3.14 yet. Install Python 3.10:
- Download from: https://www.python.org/downloads/release/python-31011/
- Install to `C:\Python310`
- Use `C:\Python310\python.exe` for AI apps

### Step 7: Auto-Start on Boot (Optional)

Install as a scheduled task to start automatically:

```powershell
cd C:\NebulaCommand\deploy\windows\scripts
.\Start-NebulaAiStack.ps1 install
```

---

## Database Setup

### Using PostgreSQL (Local)

```bash
# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Create databases
sudo -u postgres psql
CREATE DATABASE homelab_jarvis;
CREATE DATABASE ticketbot;
CREATE DATABASE streambot;
\q

# Run migrations
cd services/discord-bot && npm run db:push
cd services/dashboard-next && npm run db:push
```

### Using Neon (Cloud)

1. Create account at [neon.tech](https://neon.tech)
2. Create a new project
3. Copy the connection string
4. Set `DATABASE_URL` in your `.env`

---

## Running Services

### Development Mode

```bash
# Dashboard (http://localhost:5000)
cd services/dashboard-next && npm run dev

# Discord Bot
cd services/discord-bot && npm run dev

# Stream Bot
cd services/stream-bot && npm run dev
```

### Production (Docker Compose)

```bash
cd deploy/linode
docker-compose up -d

# View logs
docker-compose logs -f
```

### Production (PM2)

```bash
npm install -g pm2

# Start all services
pm2 start ecosystem.config.js

# Enable startup on boot
pm2 save
pm2 startup
```

---

## Deployment Commands

```bash
./deploy.sh          # Full deployment (setup + build + deploy)
./deploy.sh setup    # Interactive environment setup only
./deploy.sh check    # Health check
./deploy.sh build    # Build images only
./deploy.sh up       # Start services only
./deploy.sh down     # Stop services
./deploy.sh logs     # View service logs
./deploy.sh help     # Show all commands
```

---

## Reverse Proxy Setup

### Caddy (Recommended)

Create `/etc/caddy/Caddyfile`:

```
dash.yourdomain.com {
    reverse_proxy localhost:5000
}

bot.yourdomain.com {
    reverse_proxy localhost:3000
}

stream.yourdomain.com {
    reverse_proxy localhost:3001
}
```

Then:
```bash
sudo systemctl restart caddy
```

### Nginx

```nginx
server {
    listen 80;
    server_name dash.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

---

## Project Structure

```
nebula-command/
├── services/
│   ├── dashboard-next/     # Next.js 14 dashboard
│   │   ├── app/            # App router pages
│   │   └── components/     # React components
│   ├── discord-bot/        # Discord.js bot
│   │   ├── client/         # React admin panel
│   │   ├── server/         # Express + Discord.js
│   │   └── shared/         # Shared types/schema
│   └── stream-bot/         # Stream management
├── deploy/
│   ├── windows/            # Windows AI node scripts
│   │   ├── agent/          # Node.js agent for remote control
│   │   ├── scripts/        # PowerShell setup scripts
│   │   └── ai-dependencies.json  # Pinned AI package versions
│   ├── linode/             # Cloud deployment configs
│   └── local/              # Local development configs
├── deployment/             # Environment-specific configs
│   ├── dev/                # Development environment
│   └── prod/               # Production environment
├── .env.example            # Environment template
└── README.md               # This file
```

---

## Troubleshooting

### Database Connection Issues

```bash
# Test PostgreSQL connection
psql -U postgres -h localhost -c "SELECT version();"

# Check if database exists
psql -U postgres -c "\l"
```

### Discord Bot Not Responding

1. Verify bot token is correct in `.env`
2. Check bot has correct permissions in server
3. Ensure intents are enabled in Discord Developer Portal
4. Check logs: `cd services/discord-bot && npm run dev`

### AI Node Not Connecting

1. Verify Tailscale is connected: `tailscale status`
2. Check agent is running: `netstat -ano | findstr 9765`
3. Verify token matches on both sides
4. Test connectivity: `curl http://100.x.x.x:9765/health`

### ComfyUI/Stable Diffusion Errors

| Error | Fix |
|-------|-----|
| `numpy.core.multiarray failed to import` | `pip install numpy==1.26.4` |
| `No module named 'triton'` | `pip install triton-windows` |
| `xFormers can't load C++/CUDA extensions` | `pip install xformers --no-build-isolation` |
| `No module named 'aiohttp'` | `pip install aiohttp alembic pyyaml sqlalchemy` |
| `torch.library has no attribute 'custom_op'` | `pip uninstall comfy_kitchen -y` |

### Port Already in Use

```powershell
# Check what's using a port
netstat -ano | findstr :PORT_NUMBER

# Kill process by PID
taskkill /PID PROCESS_ID /F
```

---

## API Reference

### Dashboard API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ai/node-manager` | GET | Get AI node diagnostics |
| `/api/ai/node-manager` | POST | Execute repair actions |
| `/api/servers` | GET | List configured servers |
| `/api/docker/containers` | GET | List Docker containers |

### Discord Bot API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/guilds` | GET | List bot guilds |
| `/api/guilds/:id/settings` | GET | Get guild settings |
| `/api/guilds/:id/settings` | POST | Update guild settings |

---

## Security

- JWT authentication for all API endpoints
- Sandboxed plugin execution with path traversal protection
- Command injection prevention
- Secret management via environment variables
- Pre-commit hooks for secret detection
- Tailscale for secure node-to-node communication

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## License

MIT License - See [LICENSE](LICENSE) file for details.

---

## Support

- Open an [Issue](https://github.com/yourusername/nebula-command/issues) for bug reports
- Use [Discussions](https://github.com/yourusername/nebula-command/discussions) for questions
- Check the [Wiki](https://github.com/yourusername/nebula-command/wiki) for detailed documentation

---

Built with Next.js, Discord.js, Express, and PostgreSQL.
