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

### Creation Engine Features (Legacy)
- **Ollama Model Catalog**: Manages local LLM models.
- **AI Code Generation**: Natural language code creation with templates and preview.
- **Prompt Library**: Reusable text snippets for various AI tasks.
- **Workflow Automation**: Triggers, actions, and execution history for automated tasks.
- **Quick Start Templates**: One-click project starters for common application types.

## Production Deployment

### Deployment Status: Beta-Ready
All services are containerized and ready for production deployment.

### Quick Deploy to Linode
```bash
# On Linode server
cd /opt/homelab/HomeLabHub/deploy/linode
./scripts/verify-production-ready.sh  # Verify configuration
./scripts/deploy.sh --dry-run          # Preview deployment
./scripts/deploy.sh                    # Full deployment
```

### Key Production Files
- `deploy/linode/docker-compose.yml` - Main Docker stack
- `deploy/linode/.env.example` - Environment template
- `deploy/linode/Caddyfile` - Reverse proxy configuration
- `deploy/linode/scripts/deploy.sh` - Deployment automation
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