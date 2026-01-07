# Nebula Command

## Overview
Nebula Command is a self-managing, self-evolving creation engine for homelab management, AI-powered content creation, Discord community integration, and multi-platform streaming. It aims to be a custom development and automation engine, similar to Replit but tailored for homelab enthusiasts, supporting distributed deployment across cloud and local infrastructure.

**Core Capabilities:**
*   **Dashboard:** Web interface for homelab control, AI tools, and remote operations.
*   **Discord Bot:** Manages community, ticketing, notifications, and music.
*   **Stream Bot:** Facilitates multi-platform streaming management (Twitch/YouTube/Kick).
*   **AI Services:** Leverages a hybrid cloud/local AI setup (OpenAI + Ollama on GPU).

## User Preferences
- **Development Workflow:** Edit in Replit → Push to GitHub → Pull on servers
- **Database:** Shared PostgreSQL (Neon in dev, self-hosted in prod)
- **Secrets:** .env file (never commit), Replit Secrets in dev

### Deployment
1.  **Cloud (Linode)**: `ssh root@your-server → cd /opt/homelab/nebula-command/deploy/linode && ./deploy.sh`
2.  **Local Ubuntu**: `ssh user@your-server → cd /opt/homelab/nebula-command/deploy/local && ./deploy.sh`

Each server deploys ONLY its own services. They are separate and independent.

## System Architecture

### Core Services
The platform is built around three main services, designed for distributed deployment:

*   **Dashboard (Next.js 14):** A modern web interface (`services/dashboard-next/`) for homelab management. It features real-time stats, Docker container controls, SSH-based server metrics, deployment pipelines, a Monaco code editor, a visual website designer, and an OpenAI-powered AI chat assistant (Jarvis AI). It uses JWT-signed sessions for security and restricts file system access.
*   **Discord Bot (Node.js/React):** Located at (`services/discord-bot/`), this bot manages Discord community features including a ticket system, music, stream notifications, and analytics. It integrates with the Stream Bot for go-live alerts and with Plex and Lanyard for rich presence.
*   **Stream Bot (Node.js/React/Vite):** Found in (`services/stream-bot/`), this service handles multi-platform content posting and interaction across Twitch, YouTube, and Kick. It supports OAuth, token encryption, rate limiting, and an OBS overlay editor.

### Cross-Service Integration
Services share a PostgreSQL database and Redis for caching. The Stream Bot uses webhooks for Discord notifications. The Dashboard and Discord Bot communicate via APIs.

### Deployment Architecture
The system utilizes a distributed deployment model:
*   **Cloud Server:** Hosts the Dashboard, Discord Bot, and Stream Bot.
*   **Local Ubuntu Homelab:** Hosts Plex, MinIO, Home Assistant, Ollama, and Stable Diffusion.

Tailscale provides secure mesh networking, allowing cloud services to access local homelab resources via a sidecar container in `network_mode: host`.

### Database Schema
A shared PostgreSQL instance organizes data into distinct databases for each core service: `homelab_jarvis` (Dashboard), `discord_bot`, and `stream_bot`.

### Platform Architecture Expansion
The system has evolved to a three-layer design (Experience, Control Plane, Execution Plane) with an event-driven spine. New features include a Marketplace API for Docker packages, an Agent Orchestrator API for AI agents with function calling, and a Service Discovery mechanism for cross-server routing defined by a `service-map.yml`. The platform also includes a Creative Studio for AI-powered content creation with multi-model support (OpenAI GPT-4o, Ollama, Stable Diffusion) and image generation (DALL-E 3).

### Remote Operations & Security
New capabilities include an SSH Terminal with xterm.js, an SFTP File Browser for secure file management, server power controls (restart/shutdown), and Wake-on-LAN. Security enhancements include JWT token validation for terminal access and `posixPath` resolution for SFTP to prevent path traversal.

### Security & Secret Management
Secrets are managed via `.env` files (gitignore'd) and Replit Secrets. Pre-commit hooks (`./scripts/setup-git-secrets.sh`) and protected patterns safeguard sensitive information. A secret rotation procedure ensures timely updates across all environments.

## Recent Changes (January 2026)

### Configuration & Deployment Fixes (Latest)
- **Authelia Configuration**: Secrets must be hardcoded in `configuration.yml` on the server (not via env vars)
  - The `expand-env` and `template` filters block variables starting with `AUTHELIA_` and ending with `SECRET`/`KEY`
  - Use `configuration.yml.example` as template, copy to `configuration.yml`, replace placeholders with actual values
  - Config files with secrets are gitignored - never commit them
  - Generate password hashes: `docker run --rm authelia/authelia:latest authelia crypto hash generate argon2 --password 'YourPassword'`
- **Authelia Users**: Edit `users_database.yml` with generated password hashes for each user
- **SSH Key Path**: Dashboard uses `/root/.ssh/homelab` as default key path for server connections
- **Local AI Access**: Dashboard connects to Ollama (port 11434) and Stable Diffusion (port 7860) via Tailscale IP
- **Default Domain**: `evindrake.net` set as default throughout configuration files
- **Gamestream Host**: Set `GAMESTREAM_HOST=192.168.0.159` (Windows VM LAN IP) in `.env`

### Sunshine Game Streaming (Windows VM)
- **Architecture**: Sunshine runs on Windows 11 VM with QEMU/KVM + GPU passthrough
- **Networking**: VM uses bridged networking, gets its own LAN IP (e.g., 192.168.0.x)
- **Configuration**: Set `GAMESTREAM_HOST` in `.env` to your VM's LAN IP
- **Full-Bandwidth Remote Access**:
  1. Caddy proxies only the web UI (port 47990) via `gamestream.evindrake.net` for HTTPS pairing
  2. DNS is set to DNS-only (not proxied) for gamestream subdomain - no Cloudflare throttling
  3. Forward ports 47984-48010 (TCP+UDP) on your router to the VM's IP
  4. Moonlight clients connect directly to your public IP for actual game streaming
- **Security**: Web UI protected by Authelia 2FA; streaming ports require Moonlight pairing PIN

### Public Access Infrastructure
- **Unified Reverse Proxy**: Caddy with Cloudflare DNS-01 for automatic SSL on all subdomains
- **Authelia SSO**: Single sign-on with 2FA for protected services (torrent, VNC, SSH, VMs, Sunshine)
- **Automatic DNS Sync**: `scripts/cloudflare-sync.js` reads `config/domains.yml` and creates A records
- **Systemd Auto-Start**: `nebula-stack.service` starts all services on boot via `./deploy.sh install`
- **Service Categories**:
  - Public (native auth): Plex, Jellyfin, Home Assistant, Dashboard
  - Protected (Authelia 2FA): qBittorrent, VNC, SSH terminal, VM manager, game streaming, MinIO
- **Remote Access**: Web VNC (noVNC), Web SSH (ttyd), Cockpit/libvirt VMs, Sunshine game streaming
- **Documentation**: `docs/runbooks/public-access.md` for complete setup guide

### Community Media Network
- **Federated Jellyfin**: Run Jellyfin alongside Plex for community media sharing
- **Node Registration**: Add friends' servers with auto-generated API keys
- **Storage Tracking**: Monitor storage contribution across all nodes
- **Sync Service**: Heartbeat system tracks node status and media counts
- **Deploy Config**: `deploy/local/jellyfin/` with docker-compose for easy setup

### Creation Engine Features
- **Ollama Model Catalog**: New `/models` page to browse, pull, and delete local LLM models with progress tracking
- **AI Code Generation**: New `/generate` page with natural language code creation, templates, and Monaco preview
- **Prompt Library**: New `/prompts` page for reusable text snippets with categories (code, content, image, chat, system)
- **Workflow Automation**: New `/workflows` page with triggers (schedule, webhook, event), actions (HTTP, SSH, Discord), and execution history
- **Quick Start Templates**: New `/quickstart` page with one-click project starters (React, Discord Bot, Flask API, Landing Page, CLI)

### Core Features Wired Up
- **SSH Key Auto-Generation**: Deploy scripts (`deploy/local/deploy.sh`, `deploy/linode/deploy.sh`) now auto-generate ed25519 SSH keys if missing and display the public key for easy server setup
- **Marketplace Real Deployment**: Marketplace API now executes actual SSH commands to deploy Docker apps with proper `docker pull && docker run` chaining, container ID tracking, and error message capture
- **IPMI Power Controls**: Dashboard servers page now shows IPMI power state and provides on/off/reset controls with confirmation dialogs
- **Dynamic Wake-on-LAN**: WoL button visibility now determined by `server.supportsWol` from API rather than hardcoded values
- **AI Agent Persistence**: Custom agents stored in database with full CRUD operations (GET/POST/PUT/DELETE) and execution history tracking
- **qBittorrent VPN Fix**: Updated torrent-vpn config with port forwarding (6881) and DHT troubleshooting guide

### Production Build Fixes
- **Unified Server Config Store**: All API routes now use `lib/server-config-store.ts` for consistent async server lookups
- **Async/Await Fixes**: Fixed `getServerById()` and `getAllServers()` calls that weren't awaited in IPMI, power, and deploy routes
- **Type Safety**: Added `getDefaultSshKeyPath()` fallback for optional `keyPath` fields to prevent TypeScript errors
- **Prerender Compatibility**: Added `force-dynamic` export to platform-status route to prevent static generation errors
- **Deploy Path Security**: Added strict regex validation and shell escaping for deploy paths to prevent command injection
- **Settings Persistence**: Server keyPath and deployPath fields can now be configured per-server and cleared when needed

### Dashboard Enhancements
- **Real-time Integration Status**: Settings page now shows live Twitch/YouTube/Discord connection status from Stream Bot API (`/api/platforms/overview`)
- **Server Management**: Add/edit/delete homelab servers directly from Settings page with persistent storage including SSH key path and deploy path
- **Health Monitoring**: Detailed server metrics (CPU, memory, disk, network, uptime) via SSH with color-coded progress bars
- **Activity Logs**: New `/activity` page showing recent actions and events with filtering
- **Skeleton Loaders**: Improved loading states throughout the dashboard
- **Error Handling**: New `ErrorCard` component with friendly error messages and retry functionality
- **Mobile Responsiveness**: Polished layouts across all pages for mobile devices

### UI Components Added
- `components/ui/skeleton.tsx` - Loading state component
- `components/ui/error-card.tsx` - Error display with retry support
- `components/ui/dropdown-menu.tsx` - User account dropdown
- `components/ui/popover.tsx` - Notifications panel
- `lib/error-utils.ts` - Error message mapping utilities

### API Endpoints Added
- `GET /api/integrations/platform-status` - Aggregated platform connection status
- `GET /api/activity` - Activity log entries with filtering
- `GET /api/platforms/overview` (Stream Bot) - Public platform status endpoint

## External Dependencies
*   **PostgreSQL:** Primary relational database (Neon for development, self-hosted for production).
*   **Redis:** Used for caching and session management.
*   **OpenAI API:** Powers the Jarvis AI assistant and other AI services.
*   **Discord API (discord.js):** Essential for the Discord Bot's functionality.
*   **Twitch/YouTube/Kick APIs:** Integrate with the Stream Bot for multi-platform streaming.
*   **Spotify API:** Used for music bot features within the Discord Bot.
*   **Plex API:** Integrates with the Discord Bot for "Now Playing" status.
*   **Home Assistant API:** For homelab automation features.
*   **Cloudflare API:** Used for DNS management.
*   **Tailscale:** Provides secure network connectivity between cloud and local infrastructure.
*   **Caddy:** Acts as a reverse proxy.
*   **Ollama:** For local large language model (LLM) inference on the homelab GPU.
*   **Stable Diffusion:** For local image generation on the homelab GPU.
