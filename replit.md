# Nebula Command

## Overview
Nebula Command is a creation engine designed for homelab management, AI-powered content creation, Discord community integration, and multi-platform streaming. It functions as a custom development and automation platform optimized for homelab environments, supporting distributed deployment across cloud and local infrastructure. Its core capabilities include a web-based dashboard for homelab control, a Discord bot for community management, a Stream bot for multi-platform streaming, and hybrid cloud/local AI services.

## User Preferences
- **Development Workflow:** Edit in Replit → Push to GitHub → Pull on servers
- **Database:** Shared PostgreSQL (Neon in dev, self-hosted in prod)
- **Secrets:** .env file (never commit), Replit Secrets in dev

## System Architecture

### Core Services
The platform is composed of three main services designed for distributed deployment:
*   **Dashboard (Next.js 14):** A web interface for homelab management, featuring real-time statistics, Docker container controls, SSH-based server metrics, deployment pipelines, a Monaco code editor, a visual website designer, and an OpenAI-powered AI chat assistant (Jarvis AI).
*   **Discord Bot (Node.js/React):** A highly customizable "swiss army knife" Discord bot with per-server identity and granular feature toggles for community management (tickets, music, stream notifications, analytics, leveling, giveaways, polls, moderation).
*   **Stream Bot (Node.js/React/Vite):** Handles multi-platform content posting and interaction across Twitch, YouTube, and Kick, supporting OAuth, token encryption, and rate limiting, along with an OBS overlay editor.

### Cross-Service Integration
Services utilize a shared PostgreSQL database and Redis for caching. The Stream Bot uses webhooks for Discord notifications, and the Dashboard and Discord Bot communicate via APIs.

### Deployment Architecture
The system employs a distributed deployment model where a cloud server hosts the Dashboard, Discord Bot, and Stream Bot, while a local Ubuntu Homelab hosts Plex, MinIO, Home Assistant, Ollama, and Stable Diffusion. Tailscale provides secure mesh networking for cloud services to access local homelab resources.

### Database Schema
A shared PostgreSQL instance organizes data into distinct databases for each core service: `homelab_jarvis` (Dashboard), `discord_bot`, and `stream_bot`.

### Platform Architecture Expansion
The system features a three-layer design (Experience, Control Plane, Execution Plane) with an event-driven spine. It includes a Marketplace API for Docker packages, an Agent Orchestrator API for AI agents with function calling, and Service Discovery via a `service-map.yml`. A Creative Studio offers AI-powered content creation with multi-model support (OpenAI GPT-4o, Ollama, Stable Diffusion) and image generation (DALL-E 3).

### Universal Creation Engine
The platform includes:
- **Quick Start Wizard:** One-click creator kits for various user types with pre-configured bundles.
- **Universal Builder:** Allows building various applications (websites, mobile, desktop, bots) with framework and feature selections.
- **App Factory:** Visual project scaffolding with AI-powered code generation.
- **AI Code Assistant:** For code refactoring, debugging, optimization, documentation, and language conversion.
- **Deploy Pipelines:** One-click deployment to Docker/PM2 with real-time logs.
- **Template Marketplace:** Community templates for one-click installation.
- **Project Manager:** For project organization, status tracking, and resource monitoring.

### Auto-Deployment System
Includes a Server Provisioning API for SSH key generation, Docker installation, and Tailscale setup, and a Deployment Execution API for Docker/PM2 deployments with real-time logging.

### Deployment Script Features
Both Linode and local deployment scripts (`deploy/linode/deploy.sh`, `deploy/local/deploy.sh`) include:
- **Preflight checks:** Validates Docker, disk space, and prerequisites
- **Auto-secret generation:** Internal secrets (Postgres, JWT, session, per-service session secrets) auto-generated
- **Authelia first-run setup:** Auto-creates users_database.yml with random admin credentials on first deploy
- **Health check retries:** Extended wait with retry logic (up to 60s) for slow-starting services
- **Commands:**
  - `deploy` - Full deployment with build and health checks
  - `doctor` - Check all required secrets and configuration
  - `test` - Run smoke tests for all services
  - `monitor` - Start continuous health monitoring daemon with Discord alerts
  - `verify` - Extended health checks with retries (up to 60s)
  - `status` - Show service status
  - `up`, `down`, `restart` - Service lifecycle commands
  - `logs` - View service logs
  - `prune` - Clean up Docker resources
- **Cloudflare DNS sync:** Automatic DNS record management (requires `CLOUDFLARE_API_TOKEN` in .env)
- **Smoke tests:** Automated validation of all service endpoints and container health
- **Health monitoring:** Continuous monitoring with Discord webhook alerts for service state changes

### AI Gateway Architecture
Features a unified AI Chat interface with provider selection (OpenAI, Ollama), model selection, real-time streaming responses, and a circuit breaker pattern for automatic fallback from local to cloud AI if local services are unavailable. Local AI services (Ollama, Stable Diffusion, ComfyUI) are automatically discovered and configured between Linode and homelab servers using Tailscale.

### Discord Bot Architecture
Features a per-server customization system allowing server admins to configure the bot's identity and enable/disable 16+ toggleable features across 8 categories (moderation, community, engagement, utility, notifications, tickets, media, logging).

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

## Production Domains
*   **Dashboard:** evindrake.net - Main dashboard and homelab control
*   **Discord Bot:** bot.evindrake.net - Discord bot dashboard and OAuth
*   **Stream Bot:** stream.evindrake.net - Multi-platform streaming bot
*   **Static Landing:** rig-city.com - Static landing page only (no services)

## Infrastructure IPs
*   **Windows VM (GPU):** 100.118.44.102 (Tailscale) - Hosts Ollama with RTX 3060, primary for AI inference
*   **Local Ubuntu Server:** 100.66.61.51 (Tailscale) - Hosts Plex, MinIO, Home Assistant, media services
*   **Linode Cloud:** 69.164.211.205 - Hosts Dashboard, Discord Bot, Stream Bot

## AI Priority Chain
1. Windows VM Ollama (GPU accelerated) - Primary
2. Ubuntu Ollama (CPU fallback) - Secondary
3. OpenAI API - Cloud fallback

## Status Page
The dashboard includes a comprehensive status page at `/status` that monitors:
- Core services (Dashboard, Discord Bot, Stream Bot)
- Databases (PostgreSQL, Redis)
- AI services (Ollama, Stable Diffusion, ComfyUI)
- Server health via SSH (when accessible)

## Production Configuration

### Required Secrets (Production)
- `SESSION_SECRET` - JWT session signing (min 32 chars)
- `SSH_PRIVATE_KEY` - SSH private key for server access (from env var, not file)
- `DATABASE_URL` - PostgreSQL connection string
- `AI_INTEGRATIONS_OPENAI_API_KEY` - OpenAI API key for AI features
- `CLOUDFLARE_API_TOKEN` - DNS management

### Environment Detection
The dashboard automatically detects environment:
- **Replit (dev)**: Uses `REPL_ID` detection, skips local AI (unreachable), uses OpenAI fallback
- **Production (Linode)**: Reads `/opt/homelab/HomeLabHub/deploy/shared/state/local-ai.json` for local AI state, connects to Windows VM via Tailscale

### SSH Key Handling
All SSH-dependent features (terminal, Docker management, deployments) read keys from:
1. `SSH_PRIVATE_KEY` environment variable (preferred)
2. File at `SSH_KEY_PATH` or `/root/.ssh/homelab` (fallback)

### Jarvis AI Tools
Jarvis has 6 autonomous tools with OpenAI function calling:
- `generate_image` - DALL-E 3 or local Stable Diffusion
- `generate_video` - Replicate or local ComfyUI
- `docker_action` - Start/stop/restart containers
- `deploy` - Trigger deployment to Linode or Home server
- `get_server_status` - Health check all services
- `get_container_logs` - Retrieve container logs

### Local AI (Production Only)
When running on Linode (Tailscale network):
- Windows VM Ollama: `http://100.118.44.102:11434`
- Windows VM ComfyUI: `http://100.118.44.102:8188`
- Ubuntu Ollama fallback: `http://100.66.61.51:11434`

## Recent Changes (January 2026)

### Domain Migration (January 12, 2026)
- Migrated all services from rig-city.com subdomains to evindrake.net
- bot.rig-city.com → bot.evindrake.net
- stream.rig-city.com → stream.evindrake.net
- rig-city.com remains as static landing page only
- Updated all OAuth callback URLs, CORS origins, and configuration

### Stream Bot Overlays
- Added OBS overlay endpoints: `/api/overlay/youtube/obs`, `/api/overlay/alerts/obs`, `/api/overlay/chat/obs`
- Token-based authentication for all overlay endpoints
- WebSocket support for real-time alerts and chat

### Discord Bot Presence
- User presence visibility settings now persist to database (survives restarts)
- Added `presenceVisible` and `mediaPreferences` columns to `discord_users` table
- Plex integration added to `/profile` and `/nowplaying` commands - shows what users are watching

### Stable Diffusion Setup (Windows VM)
Requires Python 3.10.6 - run on Windows VM:
```powershell
cd C:\AI\stable-diffusion-webui
winget install Python.Python.3.10
python --version  # Should show 3.10.x
.\webui-user.bat
```