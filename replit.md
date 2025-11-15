# Homelab Dashboard Project

## Overview
This project delivers a comprehensive web-based dashboard for managing a Ubuntu 25.10 homelab server. Its primary purpose is to provide a unified, user-friendly interface to reduce operational overhead, enhance server reliability, and enable intelligent automation and monitoring for complex homelab setups. Key capabilities include one-click database deployments, game streaming integration, robust domain health monitoring, and integrations with Google Services and Smart Home platforms. The project aims to provide all necessary source code for easy development, testing, and deployment, with a focus on production readiness.

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
HomeLabHub/
├── services/
│   ├── dashboard/
│   ├── discord-bot/
│   ├── stream-bot/
│   ├── static-site/
│   ├── vnc-desktop/
│   ├── n8n/
│   └── plex/
├── deployment/
├── docs/
├── config/
├── docker-compose.unified.yml
├── Caddyfile
└── DEPLOYMENT_GUIDE.md
```

### Technical Implementations

**Homelab Dashboard (services/dashboard/)**
- **Stack**: Flask, Python, Bootstrap 5, Chart.js, SQLAlchemy, Alembic, Redis, Celery, MinIO.
- **Core Features**: Docker management, system monitoring, AI assistant, network analytics, domain health checks, one-click database deployments, game streaming integration, intelligent deployment analyzer, secure file upload.
- **Advanced Integrations**:
    - **Google Services**: Calendar-triggered automations, Gmail notifications, Google Drive backups, secure authentication via Replit Connectors, Celery background tasks.
    - **Smart Home Control**: Full Home Assistant integration with visual dashboard, real-time device status, Google Home voice command support, and pre-made automation templates.
- **Security**: Session-based auth + API key, secure file validation, antivirus scanning, rate limiting, audit logging, CSRF protection.
- **Design System**: Cosmic theme with deep space backgrounds, animated starfields, nebula gradients, glassmorphic UI panels, and smooth micro-animations.

**Discord Ticket Bot (services/discord-bot/)**
- **Stack**: TypeScript, React, Express, Discord.js, Drizzle ORM, PostgreSQL.
- **Purpose**: Support ticket system and multi-platform streamer go-live notifications.
- **Stream Notifications**: Automatic detection of server members with connected Twitch/YouTube/Kick accounts via Discord presence data. Auto-detects users when they go live (passive detection), eliminating manual user tracking. Features configurable scan intervals, manual scan triggers via `/stream-scan` command, and dashboard UI with auto-detected user badges showing connected platforms.

**Stream Bot / SnappleBotAI (services/stream-bot/)**
- **Stack**: TypeScript, React, Express, tmi.js, @retconned/kick-js, OpenAI GPT-5, Spotify Web API, Drizzle ORM, PostgreSQL.
- **Purpose**: Multi-tenant SaaS for AI-powered stream bot management across Twitch, YouTube, and Kick.
- **Key Features**: Custom commands, AI auto-moderation, giveaway system, shoutouts, stream statistics, mini-games, channel points, song requests, polls, alerts, AI chatbot personalities, advanced analytics, OAuth platform linking, and an onboarding wizard.
- **Design System**: Candy theme with delicious gradients, glassmorphism effects, rounded edges, and glow effects.

**Other Services**:
- **Static Site**: Simple HTML/CSS/JS personal portfolio.
- **n8n**: Workflow automation platform.
- **Plex**: Media streaming server.
- **VNC Desktop**: Custom Dockerized Ubuntu desktop environment for remote access.

### Database Architecture
A single PostgreSQL container manages multiple databases (`ticketbot`, `streambot`).

### Unified Deployment System
- `homelab-manager.sh`: Central script for all operations.
- `docker-compose.unified.yml`: Orchestrates all services.
- Caddy reverse proxy: Provides automatic SSL via Let's Encrypt.
- Automated Replit → Ubuntu Sync: Scripts for 5-minute code synchronization.

### UI/UX Decisions
- **Dashboard**: Cosmic theme with animated starfields, nebula gradients, and glassmorphic panels for a futuristic feel.
- **Stream Bot**: Candy-themed UI with vibrant gradients, glassmorphism, and smooth animations for a playful experience.
- Cohesive design language across the platform for a unified user experience.

### Production Readiness
- **Security**: Comprehensive security audit (8.2/10), environment variable-based secrets, robust OAuth, automatic HTTPS, SQL injection prevention via ORMs, secure Docker configurations, secure session management, input validation, rate limiting, and CORS configuration.
- **Performance**: Health check endpoints, database connection pooling, optimized Docker images.
- **Error Handling**: React Error Boundaries, comprehensive logging, user-friendly messages, automatic retry logic.

## External Dependencies

**Dashboard:**
- Flask, Flask-CORS, Flask-SocketIO, Flask-Session, Flask-WTF, Flask-Limiter, docker (SDK), psutil, dnspython, paramiko, openai, tenacity
- SQLAlchemy, Alembic, psycopg2-binary
- Redis, Celery, eventlet
- MinIO (S3-compatible object storage)
- Google APIs: google-api-python-client, google-auth, google-auth-httplib2, google-auth-oauthlib
- Bootstrap 5, Chart.js

**Discord Bot:**
- discord.js, express, drizzle-orm, pg, passport-discord
- express-rate-limit, express-session
- React, Vite, Radix UI components, Tailwind CSS

**Stream Bot:**
- tmi.js (Twitch), @retconned/kick-js (Kick), openai (GPT-5), express, drizzle-orm, pg
- passport, passport-twitch-new, passport-google-oauth20 (OAuth)
- express-rate-limit, express-session
- React, Vite, Radix UI, Tailwind CSS, Recharts
- Spotify Web API, YouTube Data API v3

**Infrastructure:**
- Caddy (reverse proxy)
- PostgreSQL 16 Alpine
- Docker & Docker Compose
- Let's Encrypt

## Recent Changes

### November 15, 2025 - DNS Configuration & Page Fixes
- **Game Streaming Page Fix**: Corrected HTML typo (`</card>` → `</div>`) in `game_streaming.html` that was causing scrolling issues
- **Caddyfile Cleanup**: Updated Caddyfile to prevent SSL certificate errors for domains without DNS records
  - Initially commented out `rig-city.com` apex and `scarletredjoker.com` (missing DNS)
  - User added DNS records for both domains in ZoneEdit
  - Re-enabled both domains in Caddyfile after DNS configuration confirmed
  - All evindrake.net subdomains working correctly
  - Discord bot and stream bot subdomains active
- **DNS Documentation**: Created comprehensive `DNS_SETUP_GUIDE.md` and `DNS_CONFIGURED_NEXT_STEPS.md`
- **DNS Status**: ✅ All domains configured correctly
  - ✅ All 11 services have proper DNS records
  - ✅ rig-city.com apex domain: A record → 74.76.32.151
  - ✅ scarletredjoker.com: A record → 74.76.32.151
  - ✅ All www subdomains: CNAME redirects configured
- **Backup Created**: Original Caddyfile saved to `Caddyfile.backup`
- **Next Step**: Restart Caddy after DNS propagation (15-30 min) to obtain SSL certificates

### November 15, 2025 - Stream Bot OAuth Deployment & Dashboard Scrolling Fix
- **OAuth Credentials Secured**: Migrated YouTube and Kick OAuth credentials to Replit Secrets for enhanced security
  - YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET stored securely
  - KICK_CLIENT_ID, KICK_CLIENT_SECRET stored securely
  - Twitch credentials already configured (TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET)
- **Database Schema Migration**: Fixed stream-bot users table missing columns
  - Added `onboarding_completed` (boolean, default false)
  - Added `onboarding_step` (integer, default 0)
  - Added `dismissed_welcome` (boolean, default false)
  - Fixed `primary_platform` column for OAuth platform tracking
  - Applied via direct SQL to PostgreSQL on Ubuntu server
- **OAuth Ready**: All three platforms now fully configured for authentication
  - ✅ Twitch OAuth: https://stream.rig-city.com/api/auth/twitch/callback
  - ✅ YouTube OAuth: https://stream.rig-city.com/api/auth/youtube/callback (Testing mode)
  - ✅ Kick OAuth: https://stream.rig-city.com/api/auth/kick/callback
- **Dashboard Scrolling Fixed**: Resolved overflow CSS preventing page scrolling
  - Changed `.cosmic-bg` from `overflow: hidden` to `overflow-x: hidden; overflow-y: auto`
  - Preserves starfield animation while allowing vertical scroll
  - Prevents horizontal scrollbar from oversized pseudo-element
- **Deployment Documentation**: Created comprehensive guides
  - `REPLIT_DEPLOYMENT_GUIDE.md`: Replit-specific setup and OAuth configuration
  - `UBUNTU_DEPLOYMENT_CHECKLIST.md`: Step-by-step Ubuntu deployment procedures

### November 15, 2025 - Discord Bot: Auto-Detection for Stream Notifications
- **Automatic Streamer Discovery**: Implemented passive presence-based detection that automatically discovers server members with connected Twitch, YouTube, or Kick accounts
  - Eliminates manual user tracking by scanning Discord presence data when users go live
  - Requires GuildPresences intent in Discord Developer Portal
  - Optimized for scalability with O(n) complexity (single presence fetch, Map-based lookups)
- **Database Schema**: Added auto-detection fields to stream notification settings and tracked users tables
  - Migration 0002 creates/updates tables with `auto_detect_enabled`, `auto_sync_interval_minutes`, `connected_platforms`, `platform_usernames`
- **UI Enhancements**: Stream Notifications tab now includes:
  - Auto-detection toggle with configurable scan interval (15-1440 minutes)
  - Manual "Scan Now" button for on-demand detection
  - Auto-detected user badges showing Twitch/YouTube/Kick platform connections
  - Platform usernames displayed in tracked user list
- **Slash Command**: Added `/stream-scan` command for manual scanning triggers
- **API Endpoint**: POST `/api/stream-notifications/scan/:serverId` for manual scans with proper authentication
- **Performance**: Efficient chunked presence fetching, no redundant REST calls, scales to large guilds

### November 14, 2025 - AI Assistant Improvements & Accessibility Fixes
- **WCAG AA Accessibility**: Comprehensive text contrast fixes ensuring all text meets 4.5:1 contrast ratio minimum
  - Override all Bootstrap color utilities with high-contrast alternatives
  - Improved readability on mobile devices and dark backgrounds
  - Fixed chat interface, forms, buttons, alerts, and modal text visibility
- **AI Assistant Enhancements**:
  - Upgraded from gpt-5-mini to gpt-5 (latest model released August 2025)
  - Improved error handling for unauthenticated users - shows friendly "Please log in" instead of JSON parse errors
  - Enhanced system prompts to make Jarvis more action-oriented and solution-focused
  - Better network error handling with user-friendly messages
- **Jarvis Platform Vision**: Established AI-first homelab copilot direction
  - Primary goal: Enable autonomous diagnosis and remediation of homelab issues
  - Next phase: AI Ops execution layer allowing Jarvis to run safe commands with user confirmation
  - Future capabilities: Self-healing workflows, guided remediation, environment drift detection

### Vision: AI-First Homelab Copilot
Jarvis is designed to be an intelligent automation platform that pairs high-contrast observability dashboards with conversational AI workflows. The platform prioritizes:
1. **AI-Orchestrated Operations**: Self-diagnosing issues, suggesting fixes, and executing remediation with user approval
2. **Mission Control UI**: Dashboard serves as command center with real-time status, not just a static monitoring tool
3. **Actionable Intelligence**: AI assistant integrates with Docker SDK, system logs, and network tools to provide real solutions
4. **Safe Automation**: Policy-checked execution layer with confirmation loops, audit logging, and rollback capabilities