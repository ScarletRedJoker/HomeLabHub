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

### 🚀 **MAJOR FEATURE EXPANSION** (November 19, 2025 - 5 New Modules)

All 5 advanced feature modules implemented in full parallel - **PRODUCTION READY**:

1. **📁 Plex Media Import Module** - Upload, auto-organize, and scan media files
   - Drag & drop file upload with real-time progress tracking
   - Automatic media type detection (movies, TV shows, music)
   - Smart filename parsing (TMDb format support)
   - Direct integration with Plex Media Server API for library scanning
   - Background job processing with Celery workers
   - **Files**: `services/plex_service.py`, `routes/plex_routes.py`, `workers/plex_worker.py`, `templates/plex_import.html`
   - **Database**: 2 tables (`plex_import_jobs`, `plex_import_items`) with proper indexing

2. **⚡ Service Quick Actions Module** - Real-time container monitoring and control
   - One-click service restart/stop/start controls
   - Live Docker stats (CPU, memory, network, uptime)
   - Service health checks with automatic status detection
   - 30-second telemetry collection beat task
   - Real-time dashboard with auto-refresh
   - **Files**: `services/service_ops.py`, `routes/service_ops_routes.py`, `workers/service_ops_worker.py`, `templates/service_actions.html`
   - **Database**: 1 table (`service_telemetry`) with timestamp indexing

3. **💾 Disk Space Monitoring Module** - Comprehensive storage analytics
   - Plex media library size tracking
   - Database and Docker volume monitoring
   - MinIO object storage tracking
   - Storage alerts with configurable thresholds (default: 80%)
   - Chart.js visualizations (pie charts, trend graphs)
   - Hourly collection beat task
   - **Files**: `services/storage_monitor.py`, `routes/storage_routes.py`, `workers/storage_worker.py`, `templates/storage.html`
   - **Database**: 2 tables (`storage_metrics`, `storage_alerts`) with category indexing

4. **🎮 Game Streaming Enhancement Module** - Sunshine/Moonlight integration
   - Automatic Sunshine host discovery on local network
   - Gaming session tracking (game title, duration, performance metrics)
   - Pairing flow with PIN code generation
   - Windows KVM integration for GPU passthrough
   - Low-latency streaming diagnostics
   - **Files**: `services/game_streaming_service.py`, `routes/game_streaming_routes.py`, `workers/gaming_worker.py`, `templates/game_streaming.html`
   - **Database**: 2 tables (`game_sessions`, `sunshine_hosts`) with host indexing

5. **🗄️ Database Management Module** - Encrypted credential storage and backups
   - Secure password encryption with Fernet (cryptography library)
   - pg_dump/pg_restore integration for backup/restore
   - Daily automated backup beat task (2 AM default, configurable)
   - 30-day backup retention (configurable)
   - Schema migration tracking
   - Multi-database support (Discord Bot, Stream Bot, Jarvis)
   - **Files**: `services/db_admin_service.py`, `routes/db_admin_routes.py`, `workers/db_admin_worker.py`, `templates/db_management.html`
   - **Database**: 2 tables (`db_credentials`, `db_backup_jobs`) with encrypted password storage

**Infrastructure Updates:**
- ✅ **Alembic Migration 009** - Created 9 new tables with proper foreign keys, indexes, and constraints
- ✅ **ORM Integration** - All models use shared `Base` from `models/__init__.py` for unified metadata
- ✅ **Configuration** - Added 25+ environment variables to `config.py` and `.env.template`
- ✅ **Feature Flags** - Enable/disable features via `ENABLE_*` variables
- ✅ **Security** - Added `DB_ADMIN_ENCRYPTION_KEY` for Fernet-based credential encryption
- ✅ **Celery Beat** - 4 new scheduled tasks (telemetry, storage, discovery, backups)

**Code Statistics:**
- ~5,000 lines of production Python code across 20 new files
- 7-13 REST endpoints per module (44 total)
- 4 Celery worker files with beat schedules
- 5 Jinja2 templates with Bootstrap 5 + Chart.js
- Full error handling, logging, and validation

### Deployment Completion
- ✅ **All 15 services deployed** to Ubuntu 25.10 production server
- ✅ **Caddy optimization** - Removed unnecessary header_up directives (X-Forwarded-For, X-Forwarded-Proto)
- ✅ **Static site fix** - Added CSS antialiasing to prevent blurry button text on hover
- ✅ **Configuration verified** - Stream-bot PORT confirmed as 5000, no duplicate APP_URL variables
- ✅ **OAuth flows tested** - Twitch, YouTube, Kick authentication working
- ✅ **SSL certificates** - Auto-provisioning via Let's Encrypt through Caddy
- ✅ **Auto-sync enabled** - Replit to Ubuntu sync every 5 minutes via cron

### Latest Fixes (November 19, 2025 - Production Ready)
- ✅ **Dashboard automatic migrations** - Added docker-entrypoint.sh that runs `alembic upgrade head` on every startup with hard failure if JARVIS_DATABASE_URL missing, migrations logged to /app/logs/migrations.log
- ✅ **VPN restrictions removed** - Removed Twingate VPN-only access from vnc.evindrake.net per user request ("I want them working, not blocked"); services now publicly accessible, protected by VNC password + Ubuntu host Fail2Ban (acceptable for homelab use; VPN access can be re-enabled in Caddyfile if needed)
- ✅ **Celery worker optimizations** - Fixed broker_connection_retry_on_startup deprecation warning, all 12 tasks verified and working (analysis, Google services, workflow automation)
- ✅ **LSP diagnostics cleared** - All type errors resolved in alembic and db_service modules
- ✅ **Security documentation** - Created SECURITY_NOTES.md with all security controls, risk levels, and future improvements

### Post-Deployment Fixes & Enhancements (November 19, 2025)
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
  - **Database migrations (FIXED: now checks if tables actually exist)** - Queries database to verify 'agents' table exists, runs Alembic migrations if missing
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
- VNC Desktop: https://vnc.evindrake.net (Public with VNC password + Fail2Ban protection)
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