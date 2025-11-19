# Nebula Command Dashboard Project

## ✅ **PROJECT STATUS: PRODUCTION READY** (November 19, 2025)

All 15 services successfully deployed and running on Ubuntu 25.10 homelab server!

## Overview
The Nebula Command Dashboard provides a comprehensive web-based interface for managing a Ubuntu 25.10 server. Its core purpose is to streamline server operations, enhance reliability, and enable intelligent automation and monitoring for complex infrastructure. Key features include one-click database deployments, game streaming integration, robust domain health monitoring, and integrations with Google Services and Smart Home platforms. The project aims to evolve into an AI-first infrastructure copilot, "Jarvis," offering autonomous diagnosis, remediation, and execution of infrastructure issues, serving as a mission control UI for actionable intelligence and streamlined automation.

## User Preferences
- User: Evin
- Ubuntu 25.10 desktop with Twingate VPN and dynamic DNS (ZoneEdit)
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
  - Nebula Command Dashboard (host.evindrake.net) - Management UI
  - **Home Assistant (home.evindrake.net) - Smart home automation hub with Google Home integration**
- Prefers centralized development environment with clean structure
- Needs public HTTPS access with automatic SSL (port forwarding configured)

## System Architecture

### UI/UX Decisions
- **Nebula Command Dashboard**: Features a Nebular cloud theme with interconnected nodes, particle star effects, black hole vortex gradients, and glassmorphic UI panels. It is dark mode only and adheres to WCAG AA Accessibility standards.
- **Stream Bot**: Uses a "candy theme" with gradients, glassmorphism, rounded edges, and glow effects.
- **Discord Bot**: Utilizes React, Radix UI components, and Tailwind CSS.

### Technical Implementations
- **Nebula Command Dashboard**: Built with Flask, Python, Bootstrap 5, Chart.js, SQLAlchemy, Alembic, Redis, Celery, MinIO. It includes Docker management, system monitoring, an AI assistant (Jarvis, powered by gpt-5), network analytics, domain health checks, one-click database deployments, game streaming integration, intelligent deployment analysis, and secure file uploads. It integrates with Google Services (Calendar, Gmail, Drive) and Home Assistant, incorporating robust security measures.
- **Discord Ticket Bot**: Uses TypeScript, React, Express, Discord.js, Drizzle ORM, and PostgreSQL for support tickets and streamer notifications, with focus on security headers and atomic transactions.
- **Stream Bot / SnappleBotAI**: Developed with TypeScript, React, Express, tmi.js, @retconned/kick-js, OpenAI GPT-5, Spotify Web API, Drizzle ORM, and PostgreSQL. It provides multi-tenant SaaS for AI-powered stream bot management across Twitch, YouTube, and Kick, offering custom commands, AI auto-moderation, giveaways, and advanced analytics, emphasizing strong OAuth security and multi-tenant isolation.
- **Other Services**: Includes a Static Website, n8n for workflow automation, Plex for media streaming, and a custom Dockerized VNC Desktop for remote access.

### System Design Choices
- **Database Architecture**: A single PostgreSQL container manages multiple databases (`ticketbot`, `streambot`, `jarvis`), with automatic provisioning and concurrency protection.
- **Unified Deployment System**: Managed by `homelab-manager.sh` and orchestrated by `docker-compose.unified.yml`, utilizing Caddy for automatic SSL. An automated Replit to Ubuntu sync every 5 minutes maintains alignment between development and production. Deployment is handled by `linear-deploy.sh`, which performs validation, provisioning, deployment, and verification.
- **Production Readiness**: Emphasizes comprehensive security audits, environment variable-based secrets, robust OAuth, automatic HTTPS, SQL injection prevention, secure Docker configurations, secure session management, and input validation. Performance is ensured via health check endpoints, database connection pooling, and optimized Docker images. Error handling includes React Error Boundaries, comprehensive logging, user-friendly messages, automatic retry logic with exponential backoff, and circuit breaker patterns.
- **Security Monitoring**: The dashboard includes comprehensive security monitoring features such as VPN-only access configuration, optional rate limiting, SSL certificate monitoring, failed login monitoring (Redis-based), and service health monitoring.

## Recent Changes (November 19, 2025)

### Deployment Completion
- ✅ **All 15 services deployed** to Ubuntu 25.10 production server
- ✅ **Caddy optimization** - Removed unnecessary header_up directives (X-Forwarded-For, X-Forwarded-Proto)
- ✅ **Static site fix** - Added CSS antialiasing to prevent blurry button text on hover
- ✅ **Configuration verified** - Stream-bot PORT confirmed as 5000, no duplicate APP_URL variables
- ✅ **OAuth flows tested** - Twitch, YouTube, Kick authentication working
- ✅ **SSL certificates** - Auto-provisioning via Let's Encrypt through Caddy
- ✅ **Auto-sync enabled** - Replit to Ubuntu sync every 5 minutes via cron

### Post-Deployment Fixes & Enhancements (Latest - November 19, 2025)
- ✅ **Home Assistant reverse proxy** - Fixed WebSocket support, added X-Forwarded-Host header, increased timeouts for long-polling, added CORS for home.evindrake.net
- ✅ **Stream Bot AI facts diversity** - Rewrote OpenAI prompt to generate diverse facts about life, the universe, science, history, nature, and weird phenomena (removed octopus fact example that was biasing results)
- ✅ **Ollama port conflict** - Commented out Docker service to use host installation at localhost:11434
- ✅ **Stream Bot favicon** - Already present at services/stream-bot/client/public/favicon.png
- ✅ **Enhanced homelab-manager.sh with comprehensive lifecycle management:**
  - Added automatic cleanup of orphaned containers and old images to rebuild_deploy() (Step 3)
  - **NEW: Automatic diagnostics and fixes after rebuild (Step 8)** - Detects and fixes database migrations, orphaned resources, disk space, and more
  - **NEW: Manual diagnostics option (12b)** - Run lifecycle diagnostics on-demand to detect and auto-fix common issues
- ✅ **Fixed LSP type errors** - Added proper type hints to services/dashboard/services/db_service.py
- ✅ **Comprehensive Lifecycle Diagnostics** - Created `homelab-lifecycle-diagnostics.sh` that automatically detects and fixes:
  - Database migrations (runs Alembic migrations if needed)
  - Orphaned containers cleanup
  - Dangling Docker images removal
  - Service health issues detection
  - Disk space management
  - Large log file rotation (>100MB)

### Production URLs
- Dashboard: https://host.evindrake.net
- Discord Bot: https://bot.rig-city.com
- Stream Bot: https://stream.rig-city.com
- n8n Automation: https://n8n.evindrake.net
- Plex Media: https://plex.evindrake.net
- VNC Desktop: https://vnc.evindrake.net (VPN-only)
- Code Server: https://code.evindrake.net
- Rig City: https://rig-city.com
- Scarlet Red Joker: https://scarletredjoker.com
- Home Assistant: https://home.evindrake.net

## External Dependencies

**Dashboard:**
- Flask, Flask-CORS, Flask-SocketIO, Flask-Session, Flask-WTF, Flask-Limiter, docker (SDK), psutil, dnspython, paramiko, openai, tenacity
- SQLAlchemy, Alembic, psycopg2-binary
- Redis, Celery, eventlet
- MinIO (S3-compatible object storage)
- Google APIs: `google-api-python-client`, `google-auth`, `google-auth-httplib2`, `google-auth-oauthlib`
- Bootstrap 5, Chart.js

**Discord Bot:**
- `discord.js`, `express`, `drizzle-orm`, `pg`, `passport-discord`
- `express-rate-limit`, `express-session`
- React, Vite, Radix UI components, Tailwind CSS

**Stream Bot:**
- `tmi.js` (Twitch), `@retconned/kick-js` (Kick), `openai` (GPT-5), `express`, `drizzle-orm`, `pg`
- `passport`, `passport-twitch-new`, `passport-google-oauth20` (OAuth)
- `express-rate-limit`, `express-session`
- React, Vite, Radix UI, Tailwind CSS, Recharts
- Spotify Web API, YouTube Data API v3

**Infrastructure:**
- Caddy (reverse proxy)
- PostgreSQL 16 Alpine
- Docker & Docker Compose
- Let's Encrypt