# Nebula Command Dashboard Project

## Overview
The Nebula Command Dashboard is a web-based interface for managing a Ubuntu 25.10 server hosting 15 Docker-based services. These services are accessible via custom subdomains and include homelab management, Discord/Twitch bots, media streaming, remote desktop access, and home automation. The project aims to provide a centralized, robust, and secure platform for managing a comprehensive homelab environment, integrating various functionalities for personal and community use.

## Major Upgrade (November 26, 2025)

### Dashboard Enhancements
- **RBAC System:** User roles (admin/operator/viewer), permission decorators, service ownership tracking
- **Docker Lifecycle APIs:** Complete container management (start/stop/restart/logs/stats)
- **Marketplace Deployment Queue:** Background job processing with rollback capability
- **Audit Trail System:** Full API call logging with filtering, export, and cleanup
- **WebSocket Improvements:** Heartbeat/ping-pong, reconnection logic, state broadcasting
- **Agentic Remediation (Jarvis):** AI-powered service diagnosis and auto-repair
- **Anomaly Detection:** Z-score based metrics monitoring with health scoring
- **Multi-Model Routing:** OpenAI + Ollama support with complexity-based routing
- **Offline Fallbacks:** Cached responses and request queuing when AI unavailable
- **Mobile-First UI:** Collapsible sidebar, bottom navigation, skeleton loading, responsive grids

### Discord-bot Enhancements  
- **Ticket SLA Automation:** Response time tracking, auto-escalation, SLA breach alerts
- **Escalation Rules:** Keyword detection, time-based escalation, path tracking
- **Cross-Service Webhooks:** Incoming webhook endpoint, signature verification
- **Enhanced Health Probes:** /ready, /live, /metrics endpoints with detailed status
- **Guild Provisioning:** Auto-setup of ticket categories and channels for new servers
- **LLM-Assisted Triage:** AI-powered priority assignment and category suggestion
- **Thread Summarization:** Automatic summary with key points and action items
- **Sentiment Analysis:** Real-time sentiment tracking with trend reporting
- **Auto-Draft Responses:** AI-generated response suggestions
- **Retention System:** 30-day ticket archival, 90-day log cleanup
- **Mobile-First UI:** Bottom navigation, pull-to-refresh, connection status indicator

### Stream-bot Enhancements
- **Broadcaster Onboarding Wizard:** Multi-step guided setup with progress tracking
- **Feature Toggles:** 17 toggleable features with per-user configuration
- **Circuit Breaker:** Platform failover with message queuing and retry
- **Job Queue System:** Background task processing with priorities and scheduling
- **Enhanced Token Management:** Rotation history, expiry alerts, health dashboard
- **Intent Detection:** Real-time message classification and routing
- **Enhanced Moderation:** OpenAI Moderation API with configurable sensitivity
- **Personalized Facts:** User preference learning, 20 topic categories, 90-char limit
- **Speech-to-Text Prep:** Queue-based architecture for Whisper integration
- **Overlay Editor:** Visual drag-and-drop positioning tool
- **Mobile-First UI:** Bottom navigation, connection quality indicator, platform cards

### Static Sites
- **SEO Optimization:** Meta tags, Open Graph, Twitter Cards, JSON-LD structured data
- **Responsive Design:** Mobile-first layouts, touch-friendly navigation
- **Accessibility:** Skip links, ARIA labels, focus states, reduced motion support
- **Performance:** Lazy loading, script deferral, ad scripts removed from scarletredjoker.com
- **Sitemaps:** sitemap.xml and robots.txt for both sites

### Lifecycle Management
- **homelab-doctor.sh:** Comprehensive diagnostics with JSON output
- **check-dependencies.sh:** System package and version validation
- **Structured Logging:** JSON format, logrotate, aggregation scripts
- **Enhanced homelab script:** New commands (logs --json, health --full, backup --full, doctor)

## Previous Changes (November 2025)
- **Stream-bot OAuth Complete:** All platforms properly store refresh tokens with encrypted storage
- **Fact Length Enforcement:** Hard 90-character limit with smart truncation
- **Token Refresh Service:** 30-minute refresh cycle for expiring tokens
- **Plex Media Import:** Chunked uploads, SHA256 verification, MinIO integration
- **Discord-bot Verified:** 15 slash commands, background jobs, safeguard checks
- **Dashboard API Fixed:** SQLAlchemy 2.0 compatibility, CSRF exemptions
- **Static Sites Ready:** rig-city.com and scarletredjoker.com configured
- **VNC Access Configured:** vnc.evindrake.net routing with WebSocket

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