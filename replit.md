# Nebula Command

## Overview
Nebula Command is a creation engine designed for homelab management, AI-powered content creation, Discord community integration, and multi-platform streaming. It functions as a custom development and automation platform, similar to Replit but optimized for homelab environments, supporting distributed deployment across cloud and local infrastructure. Its core capabilities include a web-based dashboard for homelab control, a Discord bot for community management, a Stream bot for multi-platform streaming, and hybrid cloud/local AI services.

## User Preferences
- **Development Workflow:** Edit in Replit → Push to GitHub → Pull on servers
- **Database:** Shared PostgreSQL (Neon in dev, self-hosted in prod)
- **Secrets:** .env file (never commit), Replit Secrets in dev

## System Architecture

### Core Services
The platform is composed of three main services designed for distributed deployment:
*   **Dashboard (Next.js 14):** A web interface for homelab management, featuring real-time statistics, Docker container controls, SSH-based server metrics, deployment pipelines, a Monaco code editor, a visual website designer, and an OpenAI-powered AI chat assistant (Jarvis AI). It uses JWT-signed sessions and restricts file system access.
*   **Discord Bot (Node.js/React):** Manages Discord community features, including a ticket system, music, stream notifications, and analytics. It integrates with the Stream Bot for go-live alerts and with Plex and Lanyard for rich presence.
*   **Stream Bot (Node.js/React/Vite):** Handles multi-platform content posting and interaction across Twitch, YouTube, and Kick, supporting OAuth, token encryption, and rate limiting, along with an OBS overlay editor.

### Cross-Service Integration
Services utilize a shared PostgreSQL database and Redis for caching. The Stream Bot uses webhooks for Discord notifications, and the Dashboard and Discord Bot communicate via APIs.

### Deployment Architecture
The system employs a distributed deployment model where a cloud server hosts the Dashboard, Discord Bot, and Stream Bot, while a local Ubuntu Homelab hosts Plex, MinIO, Home Assistant, Ollama, and Stable Diffusion. Tailscale provides secure mesh networking, enabling cloud services to access local homelab resources.

### Database Schema
A shared PostgreSQL instance organizes data into distinct databases for each core service: `homelab_jarvis` (Dashboard), `discord_bot`, and `stream_bot`.

### Platform Architecture Expansion
The system features a three-layer design (Experience, Control Plane, Execution Plane) with an event-driven spine. It includes a Marketplace API for Docker packages, an Agent Orchestrator API for AI agents with function calling, and Service Discovery via a `service-map.yml`. A Creative Studio offers AI-powered content creation with multi-model support (OpenAI GPT-4o, Ollama, Stable Diffusion) and image generation (DALL-E 3).

### Remote Operations & Security
Capabilities include an SSH Terminal with xterm.js, an SFTP File Browser, server power controls (restart/shutdown), and Wake-on-LAN. Security enhancements involve JWT token validation for terminal access and `posixPath` resolution for SFTP to prevent path traversal. Secrets are managed via `.env` files and Replit Secrets, with pre-commit hooks and protected patterns safeguarding sensitive information.

### Production Build & Dashboard Enhancements
All API routes use a unified server configuration store. The dashboard includes real-time integration status, server management (add/edit/delete homelab servers), detailed health monitoring via SSH, activity logs, skeleton loaders, and improved error handling with mobile responsiveness.

### Universal Creation Engine
- **Quick Start Wizard** (`/quick-start`): One-click creator kits for YouTubers, Streamers, Developers, Musicians, and communities
  - Pre-configured bundles with websites, Discord bots, stream overlays, and branding
  - Automated asset and service generation with progress tracking
- **Universal Builder** (`/builder`): Build anything - websites, web apps, mobile apps, desktop apps, browser extensions, games, bots, APIs, CLI tools
  - 9 project categories with framework selection
  - Feature checkboxes for common functionality (auth, database, payments, etc.)
- **App Factory** (`/factory`): Visual project scaffolding with AI-powered code generation using templates
- **AI Code Assistant** (`/code-assist`): Code refactoring, debugging, optimization, documentation, and language conversion
- **Deploy Pipelines** (`/pipelines`): One-click deployment to Docker/PM2 with real-time logs
- **Template Marketplace** (`/templates`): Community templates with one-click installation
- **Project Manager** (`/projects`): Organize projects with status tracking and resource monitoring

### Auto-Deployment System
- **Server Provisioning API** (`/api/deploy/auto-provision`): SSH key generation, Docker installation, Tailscale setup
- **Deployment Execution API** (`/api/deploy/execute`): Docker/PM2 deployment with real-time logging
- SSH key path configured via `SSH_KEY_PATH` environment variable for security

### SSH Key Management (Development)
The dashboard uses SSH keys for remote server management. In the Replit development environment:
- **SSH Key Location**: `~/.ssh/homelab` (auto-detected based on environment)
- **SSH API** (`/api/ssh`): Manage SSH keys via REST API
  - `GET ?action=status`: Check key existence and get public key
  - `POST action=generate`: Generate new ed25519 keypair
  - `POST action=test`: Test SSH connectivity to a server
- **Environment Variable**: `SSH_KEY_PATH` overrides default location

**To enable SSH from Replit to your servers**, add this public key to `~/.ssh/authorized_keys` on each remote server:
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJL8fIGHczJbg2r8xFPNb7tRXA4wpCvCcokk0e3PIsK+ replit-dev-20260111
```

### Phase 1 Infrastructure (Completed)
- **Local AI Runtime Manager** (`/ai-models`): Unified service for Ollama LLMs, Stable Diffusion, and ComfyUI with health monitoring, GPU metrics, model management (pull/load/unload)
- **Server Registry**: Database-backed homelab server inventory with CRUD operations, health checking, auto-seeds from file config
- **Unified Event Bus** (`/notifications`): Redis-based pub/sub notification system with:
  - Real-time SSE streaming to dashboard
  - Discord webhook delivery with category/severity filtering
  - Database persistence for event history
  - Subscription management for notification routing

### AI Gateway Architecture (Completed)
- **Unified AI Chat** (`/ai`): GPT-like chat interface with provider selection
  - Provider selector: OpenAI (cloud), Ollama (local), Auto (best available)
  - Model selector based on available models per provider
  - Real-time streaming responses with SSE
  - Provider status badges showing online/offline state
  - Automatic fallback from local to cloud if Ollama is unavailable
- **API Endpoint** (`/api/ai/chat`):
  - GET: Returns provider metadata, available models, and health status
  - POST: Handles chat with provider/model selection and streaming support
- **Circuit Breaker Pattern**: Auto provider selection checks Ollama health first, falls back to OpenAI

### Tailscale Local AI Integration (Production Setup)
To connect your local Ollama/Stable Diffusion to the cloud dashboard:

**1. On Homelab Server:**
```bash
# Ensure Tailscale is running
tailscale status

# Start Ollama (listens on all interfaces)
ollama serve  # Default port 11434

# Start Stable Diffusion WebUI with API enabled
./webui.sh --api --listen  # Default port 7860
```

**2. Environment Variables on Linode:**
```bash
# Add to deploy/linode/.env
OLLAMA_URL=http://100.x.x.x:11434           # Your homelab Tailscale IP
STABLE_DIFFUSION_URL=http://100.x.x.x:7860   # Your homelab Tailscale IP
COMFYUI_URL=http://100.x.x.x:8188            # Optional ComfyUI
```

**3. Verify Connection:**
- Dashboard will auto-discover local services via `/api/ai/runtime`
- Green badges appear for online services on `/ai` page
- Chat will automatically route to local Ollama when available

### Creation Engine Features (Legacy)
- **Ollama Model Catalog**: Manages local LLM models.
- **AI Code Generation**: Natural language code creation with templates and preview.
- **Prompt Library**: Reusable text snippets for various AI tasks.
- **Workflow Automation**: Triggers, actions, and execution history for automated tasks.
- **Quick Start Templates**: One-click project starters for common application types.

## Production Deployment

### Deployment Status: Beta-Ready
All services are containerized and ready for production deployment.

### Deploy Scripts (Jan 2026 - Improved)
Both Linode and Local deployments now use a shared library with improved reliability:
- **Shared Library** (`deploy/shared/lib.sh`): Common preflight checks, health verification, safe Docker operations
- **Preflight Checks**: Docker/compose availability, disk space, memory verification
- **Health Reports**: Post-deployment service health checks with actionable diagnostics
- **Structured Logging**: Build/deploy logs saved for debugging failures

### Quick Deploy to Linode
```bash
# On Linode server
cd /opt/homelab/HomeLabHub/deploy/linode
./deploy.sh preflight   # Check prerequisites
./deploy.sh setup       # Interactive environment setup
./deploy.sh             # Full deployment (preflight + build + deploy + health check)
./deploy.sh -v          # Verbose mode for debugging
./deploy.sh status      # Check service health
```

### Quick Deploy to Local Ubuntu
```bash
# On homelab server
cd /opt/homelab/HomeLabHub/deploy/local
./deploy.sh                           # Core services only
./deploy.sh --with-torrents           # Include torrent services
./deploy.sh --with-gamestream         # Include gamestream services
./deploy.sh --with-monitoring -v      # Include monitoring + verbose
./deploy.sh dns-sync                  # Update Cloudflare DNS records
./deploy.sh install                   # Install systemd service for auto-start
```

### Key Production Files
- `deploy/shared/lib.sh` - Shared deployment library with common functions
- `deploy/shared/env-lib.sh` - Environment variable and secrets management
- `deploy/linode/deploy.sh` - Linode deployment script
- `deploy/linode/docker-compose.yml` - Linode Docker stack
- `deploy/local/deploy.sh` - Local Ubuntu deployment script
- `deploy/local/docker-compose.yml` - Local Docker stack
- `docs/PRODUCTION_DEPLOYMENT.md` - Full deployment guide

### Service URLs (Production)
- Dashboard: `https://evindrake.net`
- Discord Bot: `https://bot.rig-city.com`
- Stream Bot: `https://stream.rig-city.com`
- Grafana: `https://grafana.evindrake.net`

### Required Secrets
1. `DISCORD_BOT_TOKEN` - Discord developer portal
2. `OPENAI_API_KEY` - OpenAI platform
3. `TAILSCALE_AUTHKEY` - Tailscale admin console
4. Platform OAuth credentials (Twitch, YouTube, Spotify, Kick)

## External Dependencies
*   **PostgreSQL:** Primary relational database (Neon for development, self-hosted for production).
*   **Redis:** Caching and session management.
*   **OpenAI API:** Powers AI services.
*   **Discord API (discord.js):** Discord Bot functionality.
*   **Twitch/YouTube/Kick APIs:** Stream Bot multi-platform integration.
*   **Spotify API:** Music bot features.
*   **Plex API:** "Now Playing" status for Discord Bot.
*   **Home Assistant API:** Homelab automation.
*   **Cloudflare API:** DNS management.
*   **Tailscale:** Secure network connectivity.
*   **Caddy:** Reverse proxy.
*   **Ollama:** Local large language model (LLM) inference.
*   **Stable Diffusion:** Local image generation.