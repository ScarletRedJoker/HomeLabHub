# Homelab Dashboard Project

## Overview
This Replit workspace is the centralized development environment for all homelab services. It provides a comprehensive web-based dashboard for managing a Ubuntu 25.10 homelab server, plus all source code for production services. The workspace structure allows for easy development, testing, and deployment. The business vision is to provide a unified, user-friendly interface for managing complex homelab setups, reducing operational overhead, and enhancing server reliability through intelligent automation and monitoring. Key capabilities include one-click database deployments, game streaming integration, and robust domain health monitoring.

## Recent Production Fixes & Features (Nov 13, 2025)

### Latest Updates
- 🔧 **Dashboard Docker Subprocess Fix**: Rewrote Docker operations to use subprocess calls instead of docker-py SDK to fix persistent urllib3 incompatibility issues in containerized environments (ready for deployment)
- ✅ **Stream Notification Web Dashboard**: Complete web UI for managing stream notifications with channel selection, custom message templates (@user mentions, {game}, {platform} tokens), and tracked user management
- ✅ **Discord Stream Notifications**: Complete presence-based go-live detection system with rich embeds, slash commands, and per-user customization
- ✅ **Twitch OAuth Integration**: Complete PKCE-secured OAuth flow with encrypted token storage and auto-refresh
- ✅ **Multi-Platform Streaming**: Stream bot now supports Twitch, Kick, and YouTube with unified OAuth management
- ✅ **Dashboard Database API Fix**: Fixed connection examples endpoint to correctly extract credentials from container metadata
- ✅ **Security Hardening**: Rotated Discord bot secrets after leak detection, made repository private, cleaned Git history

### Previous Fixes
- ✅ **scarletredjoker.com 403 Error**: Fixed file permissions (chmod -R go+rX) - nginx can now read static files
- ✅ **Stream Bot Database**: Created complete PostgreSQL schema (users, platform_connections, bot_configs, bot_instances, message_history)
- ✅ **Stream Bot Crash Loop**: Replaced Neon WebSocket driver with node-postgres for local PostgreSQL compatibility
- ✅ **Discord Bot OAuth**: Verified database connection and session management - login working at https://bot.rig-city.com
- ✅ **n8n Update System**: Added update scripts for easy service updates (update-service.sh, update-n8n.sh)
- ✅ **All Services Healthy**: Discord bot, static site, VNC desktop, and reverse proxy all operational

## User Preferences
- User: Evin
- Ubuntu 25.10 desktop homelab with Twingate VPN and dynamic DNS (ZoneEdit)
- Manages domains: rig-city.com, evindrake.net, scarletredjoker.com
- All projects stored in: `/home/evin/contain/` (production) and Replit (development)
- Development workflow: **Edit on Replit → Agent makes changes → Auto-sync to Ubuntu every 5 minutes**
- Services to manage:
  - Discord Ticket Bot (bot.rig-city.com) - Custom support bot with PostgreSQL
  - Stream Bot / SnappleBotAI (stream.rig-city.com) - AI Snapple facts for Twitch/Kick
  - Plex Server (plex.evindrake.net) - Media streaming
  - n8n Automation (n8n.evindrake.net) - Workflow automation
  - Static Website (scarletredjoker.com) - Personal website
  - VNC Desktop (vnc.evindrake.net) - Remote desktop access
  - Homelab Dashboard (host.evindrake.net) - Management UI
- Prefers centralized development environment with clean structure
- Needs public HTTPS access with automatic SSL (port forwarding configured)

## System Architecture

### Directory Structure
```
HomeLabHub/                      ← Replit Workspace Root
├── services/                    ← All service code
│   ├── dashboard/              ← Homelab Dashboard (Flask/Python)
│   ├── discord-bot/            ← Discord Ticket Bot (TypeScript/React)
│   ├── stream-bot/             ← SnappleBotAI (TypeScript/React)
│   ├── static-site/            ← scarletredjoker.com (HTML/CSS/JS)
│   ├── n8n/                    ← n8n Automation config
│   └── plex/                   ← Plex Media Server config
│
├── deployment/                  ← Deployment scripts
├── docs/                        ← Documentation
├── config/                      ← Configuration files
├── docker-compose.unified.yml   ← Main deployment file
├── Caddyfile                    ← Reverse proxy config
└── README.md                    ← Workspace overview
```

### Technical Implementations

**Dashboard (services/dashboard/)**
- **Stack**: Flask, Python, Bootstrap 5, Chart.js
- **Purpose**: Web UI for managing all homelab services
- **Features**: Docker management, system monitoring, AI assistant, network analytics, domain health checks
- **Security**: Username/password web login, API key for programmatic access

**Discord Ticket Bot (services/discord-bot/)**
- **Stack**: TypeScript, React, Express, Discord.js, Drizzle ORM, PostgreSQL
- **Purpose**: Support ticket system for Discord servers with web dashboard, plus streamer go-live notifications
- **Features**: 
  - Ticket management with Discord OAuth and web UI
  - Stream go-live notifications: Detect when tracked users start streaming (Twitch, YouTube, Kick) and post rich embeds
  - Admin commands: /stream-setup (configure channel), /stream-track (add users), /stream-untrack (remove), /stream-list (view settings)
  - **NEW: Web Dashboard for Stream Notifications** - Admin-only UI with:
    - Channel selection for go-live notifications
    - Custom message templates with @user mentions and {game}, {platform}, {server} tokens
    - Add/remove tracked streamers with per-user custom messages
    - Enable/disable notifications toggle
    - RESTful API at /api/stream-notifications/* with authentication and server access checks
  - Per-user custom messages and notification tracking
- **Build**: Vite (frontend) + esbuild (backend), Docker deployment

**Stream Bot (services/stream-bot/)**
- **Stack**: TypeScript, React, Express, tmi.js (Twitch), @retconned/kick-js, OpenAI API, Spotify Web API
- **Purpose**: AI-powered Snapple facts bot for Twitch and Kick streams with Spotify "now playing" OBS overlay
- **Features**: Multi-platform streaming, OpenAI-powered fact generation, Spotify "now playing" OBS overlay, web dashboard
- **Integrations**: Replit Spotify connector for seamless OAuth
- **Build**: Vite (frontend) + esbuild (backend), Docker deployment

**Static Site (services/static-site/)**
- **Stack**: HTML, CSS, JavaScript
- **Purpose**: Personal portfolio website (scarletredjoker.com)
- **Deployment**: Served via Nginx/Caddy

**n8n (services/n8n/)**
- **Stack**: Node.js workflow automation platform
- **Purpose**: Automate tasks across services
- **Deployment**: Docker container with persistent volume

**Plex (services/plex/)**
- **Stack**: Plex Media Server
- **Purpose**: Media streaming (movies, TV, music, photos)
- **Storage**: Large media library on Ubuntu server

### Database Architecture

**Single PostgreSQL Container** (`discord-bot-db`) hosts multiple databases:
- `ticketbot` database (Discord Bot)
- `streambot` database (Stream Bot)

**Auto-Configuration System:**
- Init scripts in `config/postgres-init/` create databases and users on first container startup.
- `fix-existing-deployment.sh` is used to add the `streambot` database to existing volumes.

**Unified Deployment System:**
- `homelab-manager.sh` - **ONE UNIFIED CONTROL PANEL** for all operations (primary interface):
  - Full deployment, restart, rebuild options
  - Service control (start, stop, restart individual services)
  - Database management (ensure databases exist, check status)
  - Configuration (generate/edit .env, view current config)
  - Troubleshooting (logs, health checks, full diagnostics)
  - **Code Sync** (sync from Replit, install auto-sync, check sync status)
  - Updates (pull latest Docker images)
  - Information (container details, service URLs)
- `docker-compose.unified.yml` orchestrates all 8 services
- Caddy reverse proxy with automatic SSL via Let's Encrypt
- All deployment scripts now accessible via unified menu (no need to remember separate commands)

**Automated Replit → Ubuntu Sync:**
- `deployment/sync-from-replit.sh` - Manual sync script (pull latest changes and auto-deploy affected services)
- `deployment/install-auto-sync.sh` - Install systemd timer for automatic syncing every 5 minutes
- `deployment/manual-sync.sh` - Quick manual sync shortcut
- `.gitignore` updated to exclude service logs/data and prevent sync conflicts

### Feature Specifications

**Dashboard Features:**
- Docker container management (start, stop, restart, logs, stats)
- Real-time system monitoring (CPU, RAM, disk, network)
- Network management (bandwidth, connections, ports)
- Domain monitoring (uptime, SSL certificates, DNS)
- AI Assistant (OpenAI integration for log analysis)
- Remote script execution via SSH
- Database management (one-click PostgreSQL, MySQL, MongoDB, Redis deployment)
  - DatabaseService implementation complete with container deployment, backup, and connection string generation
  - Supports PostgreSQL 16, MySQL 8.0, MongoDB 7, Redis 7
  - Automatic volume management and secure password generation
  - Multi-language connection examples (Python, Node.js, Docker internal)
- Game streaming integration (Moonlight/Sunshine setup)

**Stream Bot Features:**
- Multi-platform streaming (Twitch, Kick, YouTube) with OAuth integration
- OpenAI-powered Snapple fact generation
- Automated fact delivery to streams
- Web dashboard for configuration
- Multi-user Twitch OAuth for automated chat posting
- Multi-user Spotify OAuth for "now playing" overlays
- Multi-user YouTube OAuth for livestream integration
- Signed overlay tokens with encrypted storage and auto-refresh
- PKCE-secured OAuth flows for all platforms

## External Dependencies

**Dashboard:**
- Flask, Flask-CORS, docker (SDK), psutil, dnspython, paramiko, openai, tenacity
- Bootstrap 5, Chart.js
- Services: docker_service, system_service, ai_service, ssh_service, database_service, network_service, domain_service, deployment_service, caddy_manager, compose_manager, env_manager

**Discord Bot:**
- discord.js, express, drizzle-orm, pg, passport-discord
- React, Vite, Radix UI components, Tailwind CSS

**Stream Bot:**
- tmi.js (Twitch), @retconned/kick-js (Kick), openai, express, drizzle-orm, pg
- React, Vite, Radix UI components, Tailwind CSS
- Spotify Web API

**Infrastructure:**
- Caddy (reverse proxy with automatic HTTPS)
- PostgreSQL 16 Alpine (shared database container)
- Docker & Docker Compose
- Let's Encrypt (SSL certificates via Caddy)