# Nebula Command

## Overview
Nebula Command is a creation engine designed for comprehensive homelab management, AI-powered content creation, Discord community integration, and multi-platform streaming. It provides a unified, integrated solution for digital creators and homelab enthusiasts, streamlining content generation, distribution, and community engagement. The platform is optimized for distributed deployment across cloud and local infrastructure.

## Quick Start Guide

### 1. Run the Setup Wizard
Navigate to `/setup` to run the interactive OOTB Setup Wizard. The wizard guides you through:
- Environment detection (Replit/Linode/Home)
- Secrets configuration (API keys for Discord, Twitch, YouTube, etc.)
- Database setup and migrations
- AI services configuration (Ollama, ComfyUI)
- Platform connections
- Deployment targets

### 2. Access the Dashboard
After setup, access the main dashboard at `/` to manage all services.

### 3. Configure Services
- **Discord Bot**: Configure via `/bot-editor`
- **Stream Bot**: Set up platforms at `/stream-config`
- **AI Services**: Manage models at `/ai-models`

## User Preferences
- **Development Workflow:** Edit in Replit → Push to GitHub → Pull on servers
- **Database:** Shared PostgreSQL (Neon in dev, self-hosted in prod)
- **Secrets:** .env file (never commit), Replit Secrets in dev

## Features

### Core Dashboard Features
- **OOTB Setup Wizard** (`/setup`): 7-step guided configuration wizard
- **Command Center** (`/command-center`): Unified control of all environments
- **Deploy Center** (`/deploy`): Remote deployment and verification
- **Services Manager** (`/services`): Container and service management
- **Secrets Manager** (`/secrets-manager`): Secure credential management

### AI & Creative
- **Jarvis AI** (`/jarvis`): AI chat assistant with tool calling
- **Creative Studio** (`/creative`): AI image generation with ComfyUI/SD
- **AI Models** (`/ai-models`): Model marketplace and management
- **AI Training** (`/ai-training`): Fine-tuning and LoRA training
- **AI Speech** (`/ai-speech`): Text-to-speech and speech-to-text

### Automation & Development
- **Workflows** (`/workflows`): Multi-step AI automation
- **Agent Builder** (`/agents`): Custom AI agent configuration
- **Pipelines** (`/pipelines`): Deployment automation
- **Bot Editor** (`/bot-editor`): Discord bot customization

### Infrastructure
- **Servers** (`/servers`): Server monitoring and control
- **Windows VM** (`/windows`): GPU server management
- **Domains** (`/domains`): DNS and SSL management
- **Marketplace** (`/marketplace`): Docker package installation

## System Architecture

### Core Services
*   **Dashboard (Next.js 14):** Web interface for homelab management, Docker controls, SSH metrics, deployment pipelines, code editor, visual website designer, and Jarvis AI assistant.
*   **Discord Bot (Node.js/React):** Customizable bot for community management with per-server identity and granular feature toggles.
*   **Stream Bot (Node.js/React/Vite):** Multi-platform content posting across Twitch, YouTube, and Kick.

### Cross-Service Integration and Deployment
Services share a PostgreSQL database and Redis for caching, communicating via webhooks and APIs. The system uses a three-tier distributed deployment model:
- **Ubuntu Host (Home)**: Windows 11 VM with GPU passthrough
- **Linode (Cloud)**: Dashboard, Discord bot, Stream bot
- **Tailscale**: Secure mesh networking between all nodes

### Platform Architecture
Three-layer design (Experience, Control Plane, Execution Plane) with:
- Marketplace API for Docker packages
- Agent Orchestrator API for AI agents
- Service Discovery via `service-map.yml`
- Creative Studio for AI content creation

### AI Node Management
- Monitors service health, GPU statistics, package versions
- PowerShell script (`Start-NebulaAiStack.ps1`) for Windows AI startup
- APIs for Speech, Job Scheduling, Training, Embeddings/RAG
- Unified model management via dashboard and Windows Model Agent

### Creative Engine
Content generation at `/creative-studio`:
- Text-to-image, Image-to-image, Inpainting
- ControlNet, Upscaling, Face Swap
- Database-backed pipeline for job persistence

### Jarvis AI Orchestrator
- Multi-agent AI with job queue and subagent management
- Local-first resource selection and progress tracking
- OpenCode integration for autonomous code development

### Nebula Agent
Node.js/Express agent on Windows VM (port 9765 via Tailscale):
- Health monitoring
- Command execution
- Model management
- Service control

## Deployment Instructions

### Prerequisites
- Node.js 20+
- PostgreSQL database
- Redis (optional, for caching)

### Environment Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-repo/nebula-command.git
   cd nebula-command
   ```

2. **Install dependencies**:
   ```bash
   cd services/dashboard-next && npm install
   cd ../discord-bot && npm install
   cd ../stream-bot && npm install
   ```

3. **Configure environment variables** (see Environment Variables section)

4. **Run the setup wizard**:
   ```bash
   npm run dev
   # Navigate to http://localhost:5000/setup
   ```

### Deployment Targets

#### Replit (Development)
- Automatic configuration via Replit environment
- Uses Replit Secrets for credentials
- Database via Replit PostgreSQL or Neon

#### Linode (Production)
```bash
./deploy/scripts/bootstrap-linode.sh
```

#### Ubuntu Home Server
```bash
./deploy/local/deploy.sh
```

#### Windows VM (GPU)
1. Start Tailscale and ensure connectivity
2. Run `Start-NebulaAiStack.ps1` for AI services
3. Nebula Agent auto-starts on port 9765

## Environment Variables Reference

### Required Variables
| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `SESSION_SECRET` | Session encryption key | Random 32+ char string |

### Discord Bot
| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Bot authentication token |
| `DISCORD_CLIENT_ID` | OAuth2 client ID |
| `DISCORD_CLIENT_SECRET` | OAuth2 client secret |

### Streaming Platforms
| Variable | Description |
|----------|-------------|
| `TWITCH_CLIENT_ID` | Twitch application client ID |
| `TWITCH_CLIENT_SECRET` | Twitch application secret |
| `YOUTUBE_API_KEY` | YouTube Data API key |

### Spotify Integration
| Variable | Description |
|----------|-------------|
| `SPOTIFY_CLIENT_ID` | Spotify application client ID |
| `SPOTIFY_CLIENT_SECRET` | Spotify application secret |

### AI Services
| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key (fallback) |
| `WINDOWS_VM_TAILSCALE_IP` | Windows VM IP for local AI |

### Deployment Servers
| Variable | Description |
|----------|-------------|
| `LINODE_SSH_HOST` | Linode server hostname/IP |
| `HOME_SSH_HOST` | Home server hostname/IP |
| `SSH_PRIVATE_KEY` | SSH private key for deployment |

### Optional Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection string | - |
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Dashboard port | `5000` |

## Troubleshooting Guide

### Common Issues

#### Database Connection Failed
**Symptoms**: "DATABASE_URL not configured" or connection errors
**Solutions**:
1. Verify `DATABASE_URL` is set correctly
2. Check database server is running
3. Ensure network connectivity to database host
4. For Replit: Check PostgreSQL addon is enabled

#### AI Services Unavailable
**Symptoms**: Ollama/ComfyUI not detected
**Solutions**:
1. Verify Windows VM is running and Tailscale connected
2. Check `WINDOWS_VM_TAILSCALE_IP` is set
3. Ensure Ollama is running on port 11434
4. Test: `curl http://<VM_IP>:11434/api/tags`

#### Discord Bot Not Responding
**Symptoms**: Bot online but not responding to commands
**Solutions**:
1. Verify `DISCORD_TOKEN` is valid
2. Check bot has proper permissions in server
3. Ensure bot is in the correct guild
4. Check dashboard logs for errors

#### Platform OAuth Failures
**Symptoms**: "Invalid credentials" for Twitch/Spotify/YouTube
**Solutions**:
1. Regenerate API credentials from developer portal
2. Verify redirect URIs match your deployment URL
3. Check credentials are not expired
4. Ensure all required scopes are granted

#### Deployment Target Unreachable
**Symptoms**: SSH connection failures
**Solutions**:
1. Verify target server is online
2. Check SSH key is properly configured
3. Ensure firewall allows SSH (port 22)
4. For Windows VM: Verify Tailscale connection

### Debug Commands

```bash
# Check database connection
curl http://localhost:5000/api/health/check

# Test AI services
curl http://localhost:5000/api/ai/health

# Verify environment detection
curl http://localhost:5000/api/setup/detect

# Check secrets status
curl http://localhost:5000/api/setup/step/secrets
```

### Log Locations
- Dashboard: Console output / `/tmp/logs/`
- Discord Bot: `services/discord-bot/logs/`
- Stream Bot: `services/stream-bot/logs/`

## External Dependencies
*   **PostgreSQL:** Primary relational database
*   **Redis:** Caching and session management
*   **OpenAI API:** AI services (cloud fallback)
*   **Discord API (discord.js):** Discord Bot functionality
*   **Twitch/YouTube/Kick APIs:** Stream Bot integration
*   **Spotify API:** Music bot features
*   **Plex API:** "Now Playing" status
*   **Home Assistant API:** Homelab automation
*   **Cloudflare API:** DNS management
*   **Tailscale:** Secure network connectivity
*   **Caddy:** Reverse proxy
*   **Ollama:** Local LLM inference
*   **Stable Diffusion/ComfyUI:** Local image generation

## Recent Changes
- **January 20, 2026**: Major AI features overhaul:
  - Fixed Creative Studio model validation - properly distinguishes base checkpoints from motion modules/LoRA/VAE
  - Added model switch warning banner in Creative Studio when invalid model is loaded
  - Enabled AI cloud fallback - OpenAI fallback now works when local AI is offline (unless LOCAL_AI_ONLY=true)
  - Improved Jarvis AI status indicators - clear service status banners and actionable error messages
  - Added health gating to disable UI actions when required AI services are offline
- **January 2026**: Added comprehensive OOTB Setup Wizard with 7-step guided configuration
- **January 2026**: Updated API routes for setup wizard steps (secrets, database, AI, platforms, deployment)
- **January 2026**: Added environment detection and service connectivity testing
- **January 2026**: Comprehensive documentation update with quick start guide and troubleshooting

## Project Structure
```
nebula-command/
├── services/
│   ├── dashboard-next/     # Main Next.js dashboard
│   ├── discord-bot/        # Discord bot service
│   ├── stream-bot/         # Multi-platform stream bot
│   └── nebula-agent/       # Windows VM agent
├── deploy/
│   ├── linode/             # Linode deployment configs
│   ├── local/              # Home server deployment
│   └── nebula-deployer/    # CLI deployment tool
├── config/                 # Shared configuration files
└── docs/                   # Additional documentation
```
