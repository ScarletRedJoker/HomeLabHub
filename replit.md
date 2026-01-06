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

### Dashboard Enhancements
- **Real-time Integration Status**: Settings page now shows live Twitch/YouTube/Discord connection status from Stream Bot API (`/api/platforms/overview`)
- **Server Management**: Add/edit/delete homelab servers directly from Settings page with persistent storage
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
