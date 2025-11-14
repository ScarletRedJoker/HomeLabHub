# Homelab Dashboard Project

## Overview
This project provides a comprehensive web-based dashboard for managing a Ubuntu 25.10 homelab server, offering a unified, user-friendly interface to reduce operational overhead and enhance server reliability. It includes all source code for production services, enabling easy development, testing, and deployment. The vision is to provide intelligent automation and monitoring for complex homelab setups, with capabilities such as one-click database deployments, game streaming integration, and robust domain health monitoring.

## Recent Changes (November 2025)

**🏠 Smart Home Control Dashboard (BRAND NEW - November 14, 2025):**
- 🎛️ Visual dashboard for controlling all smart home devices (lights, switches, climate, sensors)
- 🤖 Full Home Assistant integration with real-time device status
- 🗣️ Google Home voice command support with natural language processing
- ⚡ 8 pre-made automation templates (Good Morning, Good Night, Movie Time, etc.)
- 🎨 Beautiful device control cards with sliders for brightness and color
- 🔍 Search and filter devices by type or name
- 📊 Real-time device count statistics
- 🎯 One-click automation triggers
- 📱 Google Home setup instructions and display cards
- 🛠️ API endpoints for programmatic device control
- See: SMART_HOME_SETUP.md for complete setup guide

**🎙️ Voice-Controlled Smart Home Integration:**
- 🏠 Home Assistant integration for IoT automation and Google Home voice control
- 🗣️ Jarvis Voice API - Deploy websites, create databases, manage SSL via voice commands
- 🔐 Secure API key authentication for Home Assistant integration
- 🤖 Conversational AI sessions with context tracking
- 📡 RESTful command integration for "Hey Google, tell Jarvis to..." commands
- ⚡ Async Celery-powered deployments triggered by voice
- 🎯 Production-ready and architect-approved security implementation

**UI Transformation:**
- ✨ Candy-themed UI for Stream Bot - delicious gradients, glassmorphism, smooth animations
- 🌌 Cosmic-themed UI for Dashboard - animated starfield, nebula gradients, glassmorphic panels
- 🎨 Cohesive design language across entire platform

**Production Readiness:**
- 🔒 Comprehensive security audit (Score: 8.2/10)
- ⚡ Rate limiting on all API endpoints
- 🛡️ Error boundaries for React applications
- 🏥 Health check endpoints for monitoring
- 📝 Production logging with rotation
- 🔐 Enhanced secrets management
- 🚀 Optimized Docker builds

**Infrastructure:**
- 📦 MinIO object storage for file uploads
- ⚙️ Redis + Celery workflow engine
- 🔌 WebSocket real-time updates
- 🗄️ PostgreSQL with Alembic migrations
- 🤖 Intelligent deployment analyzer

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
  - **Home Assistant (home.evindrake.net) - Smart home automation hub with Google Home integration**
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
- **Stack**: Flask, Python, Bootstrap 5, Chart.js, SQLAlchemy, Alembic, Redis, Celery, MinIO
- **Purpose**: Web UI for managing all homelab services with intelligent automation
- **Core Features**: 
  - Docker management, system monitoring, AI assistant
  - Network analytics, domain health checks
  - One-click database deployments (PostgreSQL, MySQL, MongoDB, Redis)
  - Game streaming integration (Moonlight/Sunshine setup)
  - Intelligent deployment analyzer (detects 8+ project types)
  - Secure file upload with MinIO object storage (S3-compatible)
  - Workflow engine with Redis + Celery for background jobs
  - Real-time WebSocket updates for deployment progress
- **Security**: Session-based auth + API key, secure file validation, antivirus scanning, rate limiting, audit logging.
- **Design System**: Cosmic theme with deep space backgrounds, animated starfields (Canvas API + CSS animations), nebula gradients (purple/pink/blue), glassmorphic UI panels with backdrop blur, smooth micro-animations (fade-in, slide-in, pulse, shimmer), cosmic loading spinners, and candy-inspired polish. Features twinkling stars (200 animated), flowing gradient headers, and glassmorphic navigation. All styled with `cosmic-theme.css` and `starfield.js`.

**Discord Ticket Bot (services/discord-bot/)**
- **Stack**: TypeScript, React, Express, Discord.js, Drizzle ORM, PostgreSQL
- **Purpose**: Support ticket system for Discord servers with web dashboard, plus multi-platform streamer go-live notifications.
- **Features**: Ticket management, stream go-live detection for Twitch, YouTube, Kick with rich embeds, admin commands, and a web dashboard for managing stream notification settings, custom message templates, and tracked streamers.
- **Production Features**: Rate limiting, error boundaries, health checks, secure CORS, production logging

**Stream Bot / SnappleBotAI (services/stream-bot/)**
- **Stack**: TypeScript, React, Express, tmi.js, @retconned/kick-js, OpenAI GPT-5, Spotify Web API, Drizzle ORM, PostgreSQL
- **Purpose**: Multi-tenant SaaS platform for AI-powered stream bot management across Twitch, YouTube, and Kick.
- **Authentication**: OAuth-only sign-in (Twitch/YouTube/Kick), email matching for account linking, no email/password auth.
- **Kick Integration** (November 14, 2025): Complete Kick platform support with OAuth2 authentication using Passport.js (passport-oauth2 strategy), chat bot service using @retconned/kick-js library, WebSocket-based chat connection, custom command execution, and full UI integration. Environment variables: KICK_CLIENT_ID, KICK_CLIENT_SECRET (with STREAMBOT_ prefix support).
- **Design System**: Candy theme with delicious gradients (cotton candy pink, blue raspberry, lime green), smooth glassmorphism effects, rounded edges, glow effects, and micro-animations (fade-in, bounce, pulse). Features gradient buttons, platform-specific card styling, and animated background gradients. All styled with `candy-theme.css` and candy-themed loading components.
- **15 Major Features**:
  1. Custom Commands - User-defined commands with variables, cooldowns, permissions
  2. AI Auto-Moderation - Toxic language detection, spam filter, link blocking, caps/symbol filters
  3. Giveaway & Raffle System - Keyword entry, subscriber mode, multi-winner raffles
  4. Shoutout System - Auto-fetch streamer info from Twitch API, raid/host auto-shoutouts
  5. Stream Statistics - Viewer tracking, peak viewers, chat activity heatmap, top chatters
  6. Mini-Games - 8ball, trivia, duel, slots, roulette with AI enhancements
  7. Channel Points & Currency - Custom currency, earn/gamble/redeem system, leaderboards
  8. Song Requests - Spotify/YouTube integration, queue management, AI profanity filter
  9. Polls & Predictions - Native Twitch polls, custom system for Kick/YouTube, betting integration
  10. Alerts & Notifications - Sub/raid/milestone alerts with custom templates and variables
  11. AI Chatbot Personality - 5 personalities (Friendly, Snarky, Professional, Enthusiastic, Chill), context-aware responses
  12. Advanced Analytics - AI sentiment analysis, growth predictions, engagement metrics, health score dashboard
  13. OAuth Platform Linking - Connect/disconnect Twitch/YouTube/Kick from dashboard
  14. Onboarding Wizard - 4-step guided setup for new users
  15. Feature Discovery UI - Welcome cards, quick actions, what's new section, organized navigation
- **Architecture**: Per-user bot instances with isolated configurations, WebSocket real-time updates, session-based auth with Passport.js.
- **Production Features**:
  - Rate limiting: 100 API requests/15min, 5 auth attempts/15min
  - Error boundaries for graceful failure handling
  - Health check endpoints (/health, /ready)
  - Secure CORS with whitelisted origins
  - Production logging with rotation
  - Graceful shutdown handlers

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
- Flask, Flask-CORS, Flask-SocketIO, Flask-Session, docker (SDK), psutil, dnspython, paramiko, openai, tenacity
- SQLAlchemy, Alembic, psycopg2-binary
- Redis, Celery, eventlet
- MinIO (S3-compatible object storage)
- Bootstrap 5, Chart.js

**Discord Bot:**
- discord.js, express, drizzle-orm, pg, passport-discord
- express-rate-limit, express-session
- React, Vite, Radix UI components, Tailwind CSS

**Stream Bot:**
- tmi.js (Twitch), @retconned/kick-js (Kick), openai (GPT-5), express, drizzle-orm, pg
- passport, passport-twitch-new, passport-google-oauth20 (OAuth)
- express-rate-limit, express-session
- React, Vite, Radix UI (Sidebar, Dialog, Card, Select), Tailwind CSS, Recharts (analytics visualization)
- Spotify Web API, YouTube Data API v3

**Infrastructure:**
- Caddy (reverse proxy with automatic HTTPS)
- PostgreSQL 16 Alpine
- Docker & Docker Compose
- Let's Encrypt

## Production Readiness

**Security (Score: 8.2/10):**
- ✅ No hardcoded credentials - all secrets via environment variables
- ✅ Robust OAuth authentication (Discord, Twitch, Google) with token encryption
- ✅ Automatic HTTPS via Caddy for all domains with Let's Encrypt
- ✅ SQL injection prevention via ORM (Drizzle, SQLAlchemy)
- ✅ Secure Docker configuration (non-root users, network isolation)
- ✅ Session management with secure cookies (httpOnly, sameSite)
- ✅ Input validation with comprehensive file upload security
- ✅ Rate limiting on all API endpoints
- ✅ CORS configuration with whitelisted origins
- ✅ No sensitive data in logs

**Performance:**
- Health check endpoints for monitoring (/health, /ready)
- Database connection pooling
- Optimized Docker images with .dockerignore
- Graceful shutdown handlers
- Production logging with rotation

**Error Handling:**
- React Error Boundaries for graceful failure
- Comprehensive error logging
- User-friendly error messages
- Automatic retry logic for transient failures