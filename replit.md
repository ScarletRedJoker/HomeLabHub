# Nebula Command Dashboard Project

## Overview
The Nebula Command Dashboard is a web-based interface for managing a Ubuntu 25.10 server, designed to streamline operations, enhance reliability, and enable intelligent automation and monitoring. Key capabilities include one-click database deployments, game streaming integration, robust domain health monitoring, and integrations with Google Services and Smart Home platforms. The project aims to become an AI-first infrastructure copilot, "Jarvis," providing autonomous diagnosis, remediation, and execution of infrastructure issues, acting as a mission control for actionable intelligence and streamlined automation.

## Recent Changes (November 19, 2025)

### 🤖 Autonomous Features Activation (COMPLETE!)
- ✅ **Autonomous Monitoring System**: Continuous health checks every 5 minutes with self-healing capabilities. Automatically restarts containers, creates repair tasks, monitors database/network/disk health.
- ✅ **Continuous Optimization Engine**: Analyzes resource usage every 30 minutes, identifies over/under-provisioned containers, suggests database optimizations, tracks performance trends.
- ✅ **Autonomous Security Scanning**: Hourly vulnerability scans, SSL monitoring, failed login tracking, security scoring (0-100), automatic remediation task creation.
- ✅ **Multi-Agent Collaboration**: Five specialist AI agents (Jarvis Prime, Athena, Mercury, Atlas, Sentinel) work together to diagnose and fix complex issues autonomously.
- ✅ **Task Approval Workflow**: Server-side approval enforcement with API endpoints for approving/rejecting autonomous actions. System requests permission for destructive operations.
- ✅ **Celery Periodic Tasks**: Six background jobs running continuously (health check, monitoring, optimization, security, daily reports) in dedicated autonomous queue.
- ✅ **Comprehensive Documentation**: Created `AUTONOMOUS_FEATURES_GUIDE.md` with complete usage instructions, API docs, and best practices.

### Critical Bug Fixes
- ✅ **Database Migration Race Condition Fixed**: Resolved critical bug where both dashboard and celery-worker ran migrations concurrently, causing duplicate enum type errors and preventing Jarvis from starting. Migration 005 now uses idempotent SQL, and only dashboard runs migrations.
- ✅ **Stream-Bot OpenAI Configuration Fixed**: Added fallback from `AI_INTEGRATIONS_OPENAI_API_KEY` to `OPENAI_API_KEY` so Stream-Bot works with both variable naming conventions. Previously caused bot to use demo "octopus facts" instead of real AI-generated Snapple facts.
- ✅ **Production Database Cleanup Script**: Created `scripts/fix-database-migration-state.sh` to safely repair orphaned enum types and rerun migration 005 cleanly on Ubuntu production server.

### Configuration & Documentation
- ✅ **Home Assistant Environment Configuration**: Added HOME_ASSISTANT_URL, HOME_ASSISTANT_TOKEN, and HOME_ASSISTANT_VERIFY_SSL to `deployment/generate-unified-env.sh` with detailed setup instructions.
- ✅ **Stream-Bot TypeScript Fixes**: Resolved all 12 LSP errors in `bot-worker.ts` including missing shoutoutService import, Set iteration compatibility, and type conversions.
- ✅ **Comprehensive Deployment Fix Guide**: Created `URGENT_FIX_DEPLOYMENT_ISSUES.md` explaining root causes of deployment failures and providing clear recovery steps for production.

## User Preferences
- User: Evin
- Ubuntu 25.10 desktop with Twingate VPN and dynamic DNS (ZoneEdit)
- Manages domains: rig-city.com, evindrake.net, scarletredjoker.com
- All projects stored in: `/home/evin/contain/` (production) and Replit (development)
- Development workflow: **Edit on Replit → Agent makes changes → Auto-sync to Ubuntu every 5 minutes**
- **Authentication:** Code-Server and VNC Desktop require password authentication (see FIX_CODE_SERVER_AND_VNC.md)
- **ZoneEdit DNS:** Dynamic DNS updates are now fully integrated into the .env generator (`deployment/generate-unified-env.sh`) - prompts for ZONEEDIT_USERNAME (email) and ZONEEDIT_API_TOKEN during setup (see `docs/ZONEEDIT_SETUP.md`)
- Services to manage:
  - Discord Ticket Bot (bot.rig-city.com) - Custom support bot with PostgreSQL
  - Stream Bot / SnappleBotAI (stream.rig-city.com) - AI Snapple facts for Twitch/Kick
  - Plex Server (plex.evindrake.net) - Media streaming
  - n8n Automation (n8n.evindrake.net) - Workflow automation
  - Static Website (scarletredjoker.com) - Personal website
  - VNC Desktop (vnc.evindrake.net) - Remote desktop access (password-protected)
  - Code-Server (code.evindrake.net) - VS Code in browser (password-protected)
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
- **Nebula Command Dashboard**: Built with Flask, Python, Bootstrap 5, Chart.js, SQLAlchemy, Alembic, Redis, Celery, MinIO. It includes Docker management, system monitoring, an AI assistant (Jarvis, powered by gpt-5), network analytics, domain health checks, one-click database deployments, game streaming integration, intelligent deployment analysis, secure file uploads, NAS integration, Plex media import, service quick actions, disk space monitoring, game streaming enhancements, and database management. It integrates with Google Services (Calendar, Gmail, Drive) and Home Assistant.
- **Discord Ticket Bot**: Uses TypeScript, React, Express, Discord.js, Drizzle ORM, and PostgreSQL for support tickets and streamer notifications, focusing on security headers and atomic transactions.
- **Stream Bot / SnappleBotAI**: Developed with TypeScript, React, Express, tmi.js, @retconned/kick-js, OpenAI GPT-5, Spotify Web API, Drizzle ORM, and PostgreSQL. It provides multi-tenant SaaS for AI-powered stream bot management across Twitch, YouTube, and Kick, offering custom commands, AI auto-moderation, giveaways, and advanced analytics.
- **Other Services**: Includes a Static Website, n8n for workflow automation, Plex for media streaming, and a custom Dockerized VNC Desktop for remote access.

### System Design Choices
- **Database Architecture**: A single PostgreSQL container manages multiple databases (`ticketbot`, `streambot`, `jarvis`), with automatic provisioning and concurrency protection.
- **Unified Deployment System**: Managed by `homelab-manager.sh` and orchestrated by `docker-compose.unified.yml`, utilizing Caddy for automatic SSL. An automated Replit to Ubuntu sync every 5 minutes maintains alignment between development and production. Deployment is handled by `linear-deploy.sh`, which performs validation, provisioning, deployment, and verification. **Integration Management**: `homelab-manager.sh` now includes comprehensive integration status checking (option 20) and setup guidance (option 21) for all services including ZoneEdit DNS, Home Assistant, Discord Bot, OpenAI, Spotify, and Twitch.
- **Production Readiness**: Emphasizes comprehensive security audits, environment variable-based secrets, robust OAuth, automatic HTTPS, SQL injection prevention, secure Docker configurations, secure session management, and input validation. Performance is ensured via health check endpoints, database connection pooling, and optimized Docker images. Error handling includes React Error Boundaries, comprehensive logging, user-friendly messages, automatic retry logic with exponential backoff, and circuit breaker patterns.
- **Security Monitoring**: The dashboard includes comprehensive security monitoring features such as optional rate limiting, SSL certificate monitoring, failed login monitoring (Redis-based), and service health monitoring.
- **Lifecycle Management**: `homelab-manager.sh` includes automatic cleanup of orphaned containers/images and comprehensive diagnostics (database migrations, orphaned resources, disk space, log rotation).

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
- Zyxel NAS326 (1TB) via SMB/CIFS