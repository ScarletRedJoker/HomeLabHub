# Nebula Command Dashboard Project

## Overview
The Nebula Command Dashboard is a web-based interface for managing a Ubuntu 25.10 server hosting 15 Docker-based services. These services are accessible via custom subdomains and include homelab management, Discord/Twitch bots, media streaming, remote desktop access, and home automation. The project aims to provide a centralized, robust, and secure platform for managing a comprehensive homelab environment, integrating various functionalities for personal and community use.

## Recent Changes (November 2025)
- **Stream-bot OAuth Complete:** All platforms (Twitch, YouTube, Spotify, Kick) properly store refresh tokens with encrypted storage, token health endpoint, and warning banners for legacy connections
- **Fact Length Enforcement:** Hard enforcement of 90-character limit for Snapple facts with smart truncation at sentence boundaries
- **Token Refresh Service:** Added public isRunning() method for health checks, runs every 30 minutes to auto-refresh expiring tokens
- **Plex Media Import:** Fixed chunked upload bug (file pre-allocation with seek), added 'plex-media' MinIO bucket, SHA256 checksum verification, retry logic with exponential backoff
- **Discord-bot Verified:** All 15 slash commands registered globally, health check fixed, background jobs running (ticket reconciliation every 15min, auto-close hourly)
- **Dashboard API Fixed:** SQLAlchemy 2.0 compatibility, CSRF exemptions for API blueprints, all core endpoints returning 200
- **Static Sites Ready:** rig-city.com and scarletredjoker.com configured with Caddy SSL
- **VNC Access Configured:** vnc.evindrake.net routing to host port 6080 with WebSocket support

## Previous Changes (November 2024)
- **Jarvis Control Plane API:** Created `/api/jarvis/control/*` endpoints for code-server AI integration
- **Code-Server AI Integration:** Updated Continue.dev config with GPT-4o and custom homelab commands
- **Docker Compose Mounts:** Added Continue config mount at `/config/.continue/config.json`
- **Database Orchestration Engine:** Proper database startup sequencing with wait-for-schema utilities
- **PostgreSQL Init Scripts Consolidated:** Single `00-init-all-databases.sh` for all 3 databases
- **YouTube OAuth Fixed:** Resolved "missing code verifier" PKCE issue
- **n8n Security:** Added basic auth requirement for production

## User Preferences
- User: Evin
- Ubuntu 25.10 server at host.evindrake.net
- Project location: `/home/evin/contain/HomeLabHub`
- Development: Edit in cloud IDE → Push to GitHub → Pull on Ubuntu server
- All services use shared PostgreSQL (homelab-postgres) with individual databases
- Main password: `Brs=2729` (used for most services)
- Managed domains: rig-city.com, evindrake.net, scarletredjoker.com

## Database Architecture
- **PostgreSQL 16 Alpine** - Centralized database server (`homelab-postgres`)
- **Databases:**
  - `streambot` (user: streambot) - Stream Bot service
  - `homelab_jarvis` (user: jarvis) - Dashboard & Jarvis AI
  - `ticketbot` (user: ticketbot) - Discord Bot
- **Orchestration:** `services/dashboard/services/database_orchestrator.py` handles migrations, health checks, and schema verification
- **Init Scripts:** `config/postgres-init/00-init-all-databases.sh` provisions all databases on first startup

## System Architecture

### UI/UX Decisions
The dashboard is a Flask-based management UI using Bootstrap 5 and Chart.js for visualization. Bot interfaces are built with React, Vite, Tailwind CSS, and Radix UI.

### Technical Implementations
The core system relies on Docker Compose for orchestrating 15 services. A `bootstrap-homelab.sh` script provides idempotent fresh installations with pre-flight checks, rollback capabilities, and comprehensive validation. A `./homelab` script offers day-to-day management, including fixing issues, checking status, viewing logs, restarting services, health checks, database operations (backup/restore), and updates.

### Feature Specifications
- **Dashboard & AI:** Flask UI with Jarvis AI assistant (GPT-4o), Agent Swarm (5 specialized AI agents), Voice Interface, Docker/system monitoring, JWT token management UI.
- **Storage & Data:** NAS Management, Storage Monitor, Database Admin (PostgreSQL management), File Manager, Plex Media Import (drag-and-drop), Automated backup system.
- **Bots:** Discord ticket bot and multi-platform stream bot (SnappleBotAI for Twitch/Kick/YouTube).
- **Services:** Remote Ubuntu desktop (Host VNC - TigerVNC + noVNC, not containerized), VS Code in browser (code-server), Plex media server, n8n workflow automation, Home Assistant.
- **App Marketplace:** One-click deployment of 5 pre-configured applications (WordPress, Nextcloud, Gitea, Uptime Kuma, Portainer).
- **Static Sites:** Hosting for rig-city.com and scarletredjoker.com.
- **Notification System:** Multi-channel alerts (Discord, Email) for service health, storage thresholds, backup failures, and OAuth token expiry.
- **Monitoring & Alerts:** Prometheus with 15+ alert rules, Grafana dashboards, Loki log aggregation, automated alerting.
- **DNS Automation:** Auto-sync DNS records to Cloudflare when services change, Traefik route watching.
- **Security:** Automatic SSL via Caddy/Let's Encrypt, environment-based secrets, isolated database credentials, password-protected VNC/Code Server, rate limiting, CSRF protection, JWT authentication.

### System Design Choices
- **Containerization:** All services are Dockerized and managed by Docker Compose.
- **Centralized Database:** A single PostgreSQL container (`homelab-postgres`) serves as the shared database for all services.
- **Reverse Proxy:** Caddy handles reverse proxying and automatic SSL.
- **Environment Management:** All configuration is managed via a single `.env` file at the project root.
- **Modular Architecture:** Designed for easy addition of new services.
- **Authentication:** Centralized session-based authentication using `session['authenticated']`.
- **Homelab Transformation:** Implemented an 8-phase roadmap covering configuration foundation (SOPS, Jinja2 templates), modular service packaging, service discovery & networking (Consul, Traefik), database platform upgrade (pgBouncer, pgBackRest), observability & auto-recovery (Prometheus, Grafana, Loki), deployment & rollback automation (GitHub Actions), API Gateway & Auth (Traefik, JWT), and DNS Automation (Cloudflare API integration). Each service is designed to own its data, UI, and API.

## External Dependencies

- **PostgreSQL 16 Alpine:** Shared database for all services.
- **Redis:** Used for caching.
- **MinIO:** S3-compatible object storage.
- **Caddy:** Reverse proxy with automatic SSL via Let's Encrypt.
- **GPT-4o (OpenAI API):** Powers the Jarvis AI assistant and stream bot's fact generation.
- **Discord API:** For the Discord ticket bot.
- **Twitch/Kick/YouTube APIs:** For the multi-platform stream bot.
- **Plex Media Server:** Integrated for media streaming.
- **n8n:** Workflow automation tool.
- **Home Assistant:** Smart home hub integration.
- **Cloudflare API:** For DNS automation.
- **Consul:** Service registry.
- **Traefik:** Unified API gateway and reverse proxy.
- **Prometheus:** Metrics collection.
- **Grafana:** Dashboards for monitoring.
- **Loki:** Log aggregation.
- **Tailscale:** VPN integration.