# Homelab Dashboard Project

## Overview
This project provides a comprehensive web-based dashboard for managing a Ubuntu 25.10 homelab server, offering a unified, user-friendly interface to reduce operational overhead and enhance server reliability. It includes all source code for production services, enabling easy development, testing, and deployment. The vision is to provide intelligent automation and monitoring for complex homelab setups, with capabilities such as one-click database deployments, game streaming integration, and robust domain health monitoring.

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
│   ├── vnc-desktop/            ← Custom VNC Desktop (Dockerfile + bootstrap)
│   ├── n8n/                    ← n8n Automation config
│   └── plex/                   ← Plex Media Server config
│
├── deployment/                  ← Deployment scripts
├── docs/                        ← Documentation
├── config/                      ← Configuration files
├── docker-compose.unified.yml   ← Main deployment file
├── Caddyfile                    ← Reverse proxy config
├── DEPLOYMENT_GUIDE.md          ← VNC + Gaming deployment instructions
└── README.md                    ← Workspace overview
```

### Technical Implementations

**Homelab Dashboard (services/dashboard/)**
- **Stack**: Flask, Python, Bootstrap 5, Chart.js
- **Purpose**: Web UI for managing all homelab services
- **Features**: Docker management, system monitoring, AI assistant, network analytics, domain health checks, one-click database deployments (PostgreSQL, MySQL, MongoDB, Redis), game streaming integration (Moonlight/Sunshine setup).
- **Security**: Username/password web login, API key for programmatic access.

**Discord Ticket Bot (services/discord-bot/)**
- **Stack**: TypeScript, React, Express, Discord.js, Drizzle ORM, PostgreSQL
- **Purpose**: Support ticket system for Discord servers with web dashboard, plus multi-platform streamer go-live notifications.
- **Features**: Ticket management, stream go-live detection for Twitch, YouTube, Kick with rich embeds, admin commands, and a web dashboard for managing stream notification settings, custom message templates, and tracked streamers.

**Stream Bot (services/stream-bot/)**
- **Stack**: TypeScript, React, Express, tmi.js, @retconned/kick-js, OpenAI API, Spotify Web API
- **Purpose**: AI-powered Snapple facts bot for Twitch and Kick streams with Spotify "now playing" OBS overlay.
- **Features**: Multi-platform streaming, OpenAI fact generation, Spotify integration, web dashboard for configuration.

**Static Site (services/static-site/)**
- **Stack**: HTML, CSS, JavaScript
- **Purpose**: Personal portfolio website.

**n8n (services/n8n/)**
- **Stack**: Node.js workflow automation platform
- **Purpose**: Automate tasks across services.

**Plex (services/plex/)**
- **Stack**: Plex Media Server
- **Purpose**: Media streaming.

**VNC Desktop (services/vnc-desktop/)**
- **Stack**: Custom Ubuntu desktop environment (LXDE/LXQt) via Docker.
- **Features**: Pre-installed applications for development and productivity, persistent storage, selective host mounting, and security via VNC password and HTTPS.

### Database Architecture
A single PostgreSQL container (`discord-bot-db`) hosts multiple databases (`ticketbot`, `streambot`). Init scripts auto-configure databases and users.

### Unified Deployment System
- `homelab-manager.sh`: A single control panel for all operations including deployment, service control, database management, configuration, troubleshooting, code syncing, and updates.
- `docker-compose.unified.yml`: Orchestrates all 8 services.
- Caddy reverse proxy: Provides automatic SSL via Let's Encrypt.
- Automated Replit → Ubuntu Sync: Scripts (`sync-from-replit.sh`, `install-auto-sync.sh`) facilitate automatic code synchronization every 5 minutes.

## External Dependencies

**Dashboard:**
- Flask, Flask-CORS, docker (SDK), psutil, dnspython, paramiko, openai, tenacity
- Bootstrap 5, Chart.js

**Discord Bot:**
- discord.js, express, drizzle-orm, pg, passport-discord
- React, Vite, Radix UI components, Tailwind CSS

**Stream Bot:**
- tmi.js (Twitch), @retconned/kick-js (Kick), openai, express, drizzle-orm, pg
- React, Vite, Radix UI components, Tailwind CSS
- Spotify Web API

**Infrastructure:**
- Caddy (reverse proxy with automatic HTTPS)
- PostgreSQL 16 Alpine
- Docker & Docker Compose
- Let's Encrypt