# Nebula Command - HomeLabHub Platform

## Overview
Nebula Command, also known as the HomeLabHub Platform, is a comprehensive suite for homelab management, Discord community integration, and multi-platform streaming. It comprises a Dashboard for homelab control and AI assistance, a Discord Bot for community and notification management, and a Stream Bot for automated content posting across streaming platforms. The platform's vision is to offer a unified control plane for homelab enthusiasts, providing advanced features for automation, monitoring, and interaction within their digital environments.

## User Preferences
- **User:** Evin
- **Managed Domains:** rig-city.com, evindrake.net, scarletredjoker.com
- **Development Workflow:** Edit in Replit → Push to GitHub → Pull on Ubuntu servers
- **Database:** Shared PostgreSQL (Neon in dev, homelab-postgres in prod)
- **Secrets:** .env file (never commit), Replit Secrets in dev

### Deployment Preference
When Evin asks to "deploy", this means:
1. **Linode**: `ssh root@linode.evindrake.net` → `cd /opt/homelab/HomeLabHub/deploy/linode && ./deploy.sh`
2. **Local Ubuntu**: `ssh evin@host.evindrake.net` → `cd /opt/homelab/HomeLabHub/deploy/local && ./deploy.sh`

Each server deploys ONLY its own services. They are separate and independent.

## System Architecture

### Core Services
The platform consists of three main services:

#### Dashboard (Next.js 14) - `services/dashboard-next/`
Modern web interface for homelab management built with TypeScript, shadcn/ui, and Tailwind CSS.

**Real-Time Features (All Functional):**
- **Dashboard Home**: Live stats from Docker/SSH APIs - container counts, server status, CPU/RAM metrics, quick deploy actions
- **Services Page**: Real Docker container list with start/stop/restart controls via Docker socket
- **Servers Page**: Live SSH-based metrics from Linode and Home servers (CPU, RAM, disk usage)
- **Deploy Page**: One-click deployments to Linode/Home with live log streaming via SSH
- **Editor Page**: Monaco code editor with file tree navigation, multi-file tabs, syntax highlighting, save to server
- **Designer Page**: Visual drag-drop website builder with 14 component types, export to HTML, save/load projects
- **Websites Page**: CRUD API for managing websites (create, update, publish/unpublish, delete)
- **Jarvis AI**: OpenAI-powered chat assistant (uses Replit AI Integration or direct API key)
- **Settings Page**: Server connection testing, API integration status, profile/appearance/notification preferences

**API Routes (All Real Integrations):**
- `/api/docker` - Docker container management via socket
- `/api/servers` - SSH-based server metrics collection
- `/api/deploy` - SSH-based deployment execution
- `/api/files` - File system read/write for editor
- `/api/designer` - Design project CRUD (file-based storage)
- `/api/websites` - Website management CRUD (file-based storage)
- `/api/ai/chat` - OpenAI chat integration
- `/api/health` - Health check endpoint

**Security:**
- JWT-signed sessions (HMAC-SHA256)
- All API routes require authentication
- SSH keys accessed server-side only
- File system restricted to allowed base paths

#### Discord Bot (Node.js/React) - `services/discord-bot/`
Handles Discord community management, including ticket system, music bot, stream notifications, and analytics. Integrates with Stream Bot for go-live alerts.

#### Stream Bot (Node.js/React/Vite) - `services/stream-bot/`
Manages multi-platform content posting and interaction across Twitch, YouTube, and Kick. Supports OAuth, token encryption, rate limiting, and OBS overlay editor.

### Cross-Service Integration
Services share a PostgreSQL database and Redis for caching. The Stream Bot uses webhooks for Discord go-live notifications. The Dashboard and Discord Bot communicate via APIs. The Discord Bot integrates with Plex for "Now Playing" status and Lanyard for rich presence.

### Deployment and Hosting
The system is deployed on two independent servers:
- **Linode Cloud**: Hosts Dashboard, Discord Bot, Stream Bot
- **Local Ubuntu**: Hosts Plex, MinIO, Home Assistant

Docker configuration: `deploy/linode/docker-compose.yml` and `deploy/local/docker-compose.yml`

### Dashboard File Structure
```
services/dashboard-next/
├── app/
│   ├── (dashboard)/        # Protected dashboard routes
│   │   ├── page.tsx        # Home with live stats
│   │   ├── services/       # Docker container management
│   │   ├── servers/        # SSH server metrics
│   │   ├── deploy/         # Deployment pipeline
│   │   ├── editor/         # Monaco code editor
│   │   ├── designer/       # Visual website builder
│   │   ├── websites/       # Website management
│   │   ├── ai/             # Jarvis chat
│   │   └── settings/       # Configuration
│   ├── api/                # API routes
│   └── login/              # Authentication
├── components/             # UI components (shadcn/ui)
├── lib/                    # Utilities and session management
└── Dockerfile              # Multi-stage production build
```

### Tailscale Connectivity
Linode utilizes a Tailscale sidecar container to access local services on the Ubuntu homelab, including Plex, Home Assistant, MinIO, and KVM gaming VM. The `tailscale` container operates in `network_mode: host` to route all Linode container traffic through the Tailscale network.

### Database Schema
A shared PostgreSQL instance organizes data into distinct databases:
- `homelab_jarvis`: Dashboard data (AI conversations, Docker, audit logs)
- `discord_bot`: Discord Bot data (tickets, messages, server configs, stream notifications)
- `stream_bot`: Stream Bot data (configurations, platform connections, message history)

### KVM Gaming VM (Sunshine/Moonlight)
A KVM VM named `RDPWindows` is configured with GPU passthrough (NVIDIA RTX 3060) and a Tailscale IP (`100.118.44.102`). Moonlight can connect via Tailscale or local LAN.

### Recent Changes (January 2026)

**Next.js Dashboard Rewrite:**
- Replaced Flask dashboard with Next.js 14 App Router
- Full TypeScript implementation with shadcn/ui components
- Real API integrations for Docker, SSH, deployments, files
- Visual website designer with drag-drop components
- Monaco code editor with file tree and syntax highlighting
- Jarvis AI using Replit's OpenAI integration
- Settings page for server connections and preferences

**Security Fixes:**
- Jarvis AI no longer auto-executes actions (prevents prompt injection)
- All API routes require JWT authentication
- SSH keys never exposed to client

**Stream Bot Fixes:**
- Rate limiter increased from 5 to 50 requests for OAuth
- Legacy route handler for OAuth success URLs
- Production config corrected

**Discord Bot Fixes:**
- Dashboard simplified to 5 core tabs
- CORS fixed for dashboard access

## Security & Secret Management

### Critical Security Incident (January 4, 2026)
The Discord bot token was accidentally exposed when the GitHub repository was briefly made public. Token was immediately regenerated and rotated across all environments.

### Implemented Protections
1. **Git Pre-commit Hooks**: Run `./scripts/setup-git-secrets.sh` on any new machine
2. **Protected Patterns**: Discord tokens, OpenAI keys, Tailscale keys, Cloudflare tokens, OAuth secrets, AWS credentials, private keys
3. **Environment Files**: All `.env` files in `.gitignore`, use `.env.template` for documentation

### Secret Rotation Procedure
1. Regenerate the secret in provider's dashboard
2. Update Replit Secrets (development)
3. Update `.env` on Linode: `/opt/homelab/HomeLabHub/deploy/linode/.env`
4. Update `.env` on Local Ubuntu: `/opt/homelab/HomeLabHub/deploy/local/.env`
5. Restart affected services

## External Dependencies
- **PostgreSQL**: Primary database (Neon dev, homelab-postgres prod)
- **Redis**: Caching and session management
- **OpenAI API**: Jarvis AI assistant
- **Discord API (discord.js)**: Discord Bot functionality
- **Twitch/YouTube/Kick APIs**: Stream Bot integrations
- **Spotify API**: Music bot features
- **Plex API**: "Now Playing" integration
- **Home Assistant API**: Homelab automation
- **Cloudflare API**: DNS management
- **Tailscale**: Secure network access
- **Caddy**: Reverse proxy

## Development Notes
- Dashboard runs on port 5000
- Discord Bot runs on port 4000
- Stream Bot runs on port 3000 (internal), 5000 (production)
- Use `npm run dev` in services/dashboard-next for development
- Docker socket required for container management
- SSH keys required for server metrics and deployments
