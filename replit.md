# Nebula Command Dashboard Project

## Overview
The Nebula Command Dashboard is a web-based interface for managing a Ubuntu 25.10 server, designed to streamline operations, enhance reliability, and enable intelligent automation and monitoring. Key capabilities include one-click database deployments, game streaming integration, robust domain health monitoring, and integrations with Google Services and Smart Home platforms. The project aims to become an AI-first infrastructure copilot, "Jarvis," providing autonomous diagnosis, remediation, and execution of infrastructure issues, acting as a mission control for actionable intelligence and streamlined automation.

## User Preferences
- User: Evin
- Ubuntu 25.10 desktop with Twingate VPN and dynamic DNS (ZoneEdit)
- **Note:** Also supports Ubuntu 20.10 with proper Docker Compose plugin installation (see UBUNTU_STARTUP_GUIDE.md)
- Manages domains: rig-city.com, evindrake.net, scarletredjoker.com
- All projects stored in: `/home/evin/contain/` (production) and cloud development environment
- Development workflow: **Edit in cloud IDE → Auto-sync to Ubuntu every 5 minutes**
- **Docker Compose:** All scripts use the Docker Compose plugin (`docker compose` with space), requiring docker-compose-plugin installation
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
- **Database Architecture**: Industry-standard PostgreSQL architecture with `homelab-postgres` container (PostgreSQL 16 Alpine) using standard `postgres` superuser. Manages multiple databases (`ticketbot`, `streambot`, `homelab_jarvis`) with automatic provisioning via DatabaseProvisioner service. Features include secure database management API, zero-downtime migrations, automated backups, comprehensive health checks, and Jarvis AI-powered autonomous database operations. **All services connect to `homelab-postgres` directly (legacy `discord-bot-db` alias removed to prevent orphan container conflicts)**. Includes zero-failure tolerance migration system with idempotent ENUM handling, advisory locks, and universal recovery script. Deployment automated via `deploy_database_architecture.sh` with full idempotency, rollback capability, and comprehensive verification.
- **Unified Deployment System**: Managed by `homelab-manager.sh` and orchestrated by `docker-compose.unified.yml`, utilizing Caddy for automatic SSL. Automated cloud-to-Ubuntu sync every 5 minutes maintains alignment between development and production. Deployment is handled by `auto-deploy.sh` (smart deployment with auto-healing) and `linear-deploy.sh` (manual control), which perform validation, provisioning, deployment, and verification. `homelab-manager.sh` now includes comprehensive integration status checking and setup guidance for all services. The auto-deploy system provides one-command deployment with comprehensive error checking, auto-healing (PostgreSQL user fixes, database provisioning, VNC password setup), and full visibility with detailed logging.
- **Production Readiness**: Emphasizes comprehensive security audits, environment variable-based secrets, robust OAuth (including token refresh), automatic HTTPS, SQL injection prevention, secure Docker configurations, secure session management, and input validation. Performance is ensured via health check endpoints, database connection pooling, and optimized Docker images. Error handling includes React Error Boundaries, comprehensive logging, user-friendly messages, automatic retry logic with exponential backoff, and circuit breaker patterns. Critical production fixes have been implemented for Discord ticket spam, VNC/Code-Server access, and Home Assistant connection.
- **Autonomous Features**: Includes an Autonomous Monitoring System (continuous health checks, self-healing), Continuous Optimization Engine (resource usage analysis, optimization suggestions), Autonomous Security Scanning (vulnerability scans, SSL monitoring, security scoring), and Multi-Agent Collaboration (five specialist AI agents for complex issue resolution). Tasks require server-side approval for destructive operations. Celery periodic tasks manage background jobs.
- **Security Monitoring**: The dashboard includes comprehensive security monitoring features such as optional rate limiting, SSL certificate monitoring, failed login monitoring (Redis-based), and service health monitoring.
- **Lifecycle Management**: `homelab-manager.sh` includes automatic cleanup of orphaned containers/images and comprehensive diagnostics (database migrations, orphaned resources, disk space, log rotation).
- **Comprehensive System Optimization**: Includes 60+ database indexes, N+1 query elimination, pagination, service health check monitoring with a REST API, Redis caching with graceful degradation, MinIO storage lifecycle policies, and unified logging aggregation with full-text search and real-time WebSocket streaming.
- **Environment Variable Validation**: A script `scripts/validate-env-vars.sh` exists for comprehensive secret validation of all critical environment variables.

## External Dependencies

**Dashboard:**
- Flask, Flask-CORS, Flask-SocketIO, Flask-Session, Flask-WTF, Flask-Limiter, docker (SDK), psutil, dnspython, paramiko, openai, tenacity
- SQLAlchemy, Alembic, psycopg2-binary
- Redis, Celery, eventlet
- MinIO (S3-compatible object storage)
- Google APIs: `google-api-python-client`, `google-auth`, `google-auth-httplib2`, `google-auth-oauthlib` (for Calendar, Gmail, Drive)
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
- Home Assistant