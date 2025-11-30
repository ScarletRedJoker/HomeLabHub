# Nebula Command Dashboard Project

## Overview
The Nebula Command Dashboard is a web-based interface for managing a homelab environment consisting of a Ubuntu 25.10 server hosting 15 Docker-based services. These services, including homelab management, Discord/Twitch bots, media streaming, remote desktop, and home automation, are accessible via custom subdomains. The project aims to provide a centralized, robust, and secure platform, integrating various functionalities for personal and community use, with a vision to offer an app marketplace for one-click deployments.

## Split Deployment Architecture (NEW - November 30, 2025)

The project now supports splitting services between a Linode cloud server and local Ubuntu host for optimal game streaming performance.

### Service Distribution
**Linode Cloud ($20-40/mo):**
- Discord Bot, Stream Bot, Dashboard/Celery, PostgreSQL, Redis, n8n, Code-Server, Static Sites

**Local Ubuntu Host (Gaming Priority):**
- Plex Media Server, Home Assistant, MinIO Storage, VNC Desktop

### Benefits
- Frees ~6-8GB RAM and 4-6 CPU cores on local machine
- Lower latency for Discord/Twitch webhooks (cloud-to-cloud)
- Better OBS performance for game streaming

### Deployment Files
```
deploy/
├── linode/docker-compose.yml    # Cloud services
├── local/docker-compose.yml     # Local services
├── linode/Caddyfile             # Cloud reverse proxy
├── local/Caddyfile              # Local reverse proxy
└── scripts/
    ├── bootstrap-linode.sh      # Linode server setup
    ├── bootstrap-local.sh       # Local host setup
    ├── migrate-database.sh      # DB migration
    ├── setup-tailscale.sh       # VPN mesh
    └── health-check.sh          # Cross-env monitoring
```

## User Preferences
- User: Evin
- Ubuntu 25.10 server at host.evindrake.net
- Project location: `/home/evin/contain/HomeLabHub`
- Development: Edit in cloud IDE → Push to GitHub → Pull on Ubuntu server
- All services use shared PostgreSQL (homelab-postgres) with individual databases
- Main password: `Brs=2729` (used for most services)
- Managed domains: rig-city.com, evindrake.net, scarletredjoker.com

## System Architecture

### UI/UX Decisions
The dashboard features a Flask-based UI with Bootstrap 5 and Chart.js for visualization. Bot interfaces are built with React, Vite, Tailwind CSS, and Radix UI. UI/UX emphasizes a mobile-first design with responsive layouts, collapsible sidebars, bottom navigation, and skeleton loading states.

### Technical Implementations
The core system leverages Docker Compose for orchestrating 15 services across a split deployment architecture (Linode cloud and local Ubuntu host). A `bootstrap-homelab.sh` script handles idempotent fresh installations, while a `./homelab` script provides day-to-day management, including diagnostics, health checks, and database operations. Key features include an RBAC system, Docker lifecycle APIs, a marketplace deployment queue with rollback, and an audit trail system. The project also incorporates Jarvis, an AI-powered agentic remediation system for service diagnosis and auto-repair, with multi-model routing (OpenAI + Ollama) and offline fallbacks.

### Feature Specifications
- **Dashboard & AI:** Flask UI with Jarvis AI assistant (GPT-4o), Agent Swarm, Voice Interface, Docker/system monitoring, JWT token management, and anomaly detection.
- **Storage & Data:** NAS Management, Storage Monitor, Database Admin, File Manager, Plex Media Import, and automated backup.
- **Bots:** Discord ticket bot with SLA automation, LLM-assisted triage, and sentiment analysis; multi-platform stream bot (Twitch/Kick/YouTube) with broadcaster onboarding, feature toggles, and enhanced moderation.
- **Services:** Remote Ubuntu desktop (Host VNC), VS Code in browser (code-server), Plex media server, n8n workflow automation, and Home Assistant.
- **App Marketplace:** One-click deployment for WordPress, Nextcloud, Gitea, Uptime Kuma, and Portainer.
- **Static Sites:** Hosting for rig-city.com and scarletredjoker.com with SEO, responsive design, and accessibility optimizations.
- **Notifications & Monitoring:** Multi-channel alerts (Discord, Email), Prometheus, Grafana, and Loki for comprehensive observability.
- **Security:** Automatic SSL via Caddy/Let's Encrypt, environment-based secrets, isolated database credentials, rate limiting, and JWT authentication.

### System Design Choices
- **Containerization:** All services are Dockerized and managed by Docker Compose.
- **Centralized Database:** A single PostgreSQL 16 Alpine container (`homelab-postgres`) serves all services, with `database_orchestrator.py` handling migrations and health checks.
- **Reverse Proxy:** Caddy handles reverse proxying and automatic SSL. An Nginx sidecar proxy is used for `code-server` to handle `X-Frame-Options` headers.
- **Environment Management:** All configuration is managed via a single `.env` file.
- **Modular Architecture:** Designed for easy scalability and addition of new services.
- **Homelab Transformation:** Implemented an 8-phase roadmap covering configuration, modular service packaging, service discovery & networking (Consul, Traefik), database platform upgrade, observability, deployment automation, API Gateway & Auth, and DNS Automation (Cloudflare API).

## External Dependencies
- **PostgreSQL 16 Alpine:** Shared database.
- **Redis:** Caching.
- **MinIO:** S3-compatible object storage.
- **Caddy:** Reverse proxy and SSL.
- **GPT-4o (OpenAI API):** Jarvis AI assistant, Stream Bot fact generation.
- **Ollama:** AI model for complexity-based routing.
- **Discord API:** Discord ticket bot.
- **Twitch/Kick/YouTube APIs:** Multi-platform stream bot.
- **Plex Media Server:** Media streaming.
- **n8n:** Workflow automation.
- **Home Assistant:** Smart home hub.
- **Cloudflare API:** DNS automation.
- **Consul:** Service registry.
- **Traefik:** Unified API gateway and reverse proxy.
- **Prometheus:** Metrics collection.
- **Grafana:** Monitoring dashboards.
- **Loki:** Log aggregation.
- **Tailscale:** VPN integration.

## New Features (November 30, 2025)

### DNS Management Engine
Full Cloudflare API integration for managing all three domains (evindrake.net, rig-city.com, scarletredjoker.com):
- **Location:** `/dns-management` in dashboard
- **Files:** `services/dashboard/services/dns_service.py`, `routes/dns_routes.py`
- **Features:** CRUD operations for DNS records, domain health monitoring, auto-sync from services catalog
- **Requirements:** Set `CLOUDFLARE_API_TOKEN` environment variable

### Fleet Manager
Remote server control via Tailscale VPN mesh:
- **Location:** `/fleet-management` in dashboard
- **Files:** `services/dashboard/services/fleet_service.py`, `routes/fleet_routes.py`
- **Features:** SSH-based command execution with whitelist security, Docker container management, service deployment
- **Hosts:** Linode cloud server + Local Ubuntu host
- **Requirements:** Set `TAILSCALE_LINODE_HOST`, `TAILSCALE_LOCAL_HOST`, `FLEET_SSH_KEY_PATH`

### Jarvis Code Service
AI-powered code editing and deployment integration for code.evindrake.net:
- **Location:** `/jarvis-code` in dashboard
- **Files:** `services/dashboard/services/jarvis_code_service.py`, `routes/jarvis_code_routes.py`
- **Features:** Project analysis, AI code generation (GPT-4o), file editing, code review, test execution, deployment via git/rsync
- **Templates:** Flask, FastAPI, Express, Static HTML
- **Requirements:** `AI_INTEGRATIONS_OPENAI_API_KEY` or `OPENAI_API_KEY`

### Unified Storage Service
Dual-backend storage abstraction (local MinIO + cloud S3):
- **Location:** `/storage/management` in dashboard
- **Files:** `services/dashboard/services/storage_service.py`, `routes/storage_routes.py`
- **Features:** Bucket management, file upload/download, cross-backend copy/sync, storage statistics, cloud mirroring
- **Local Backend:** MINIO_ENDPOINT, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD
- **Cloud Backend:** CLOUD_S3_ENDPOINT, CLOUD_S3_ACCESS_KEY, CLOUD_S3_SECRET_KEY

### Jarvis Website Builder (v2.0)
Autonomous AI-powered website generation:
- **Location:** `/jarvis-builder` in dashboard
- **Files:** `services/dashboard/services/jarvis_website_builder.py`, `routes/jarvis_builder_routes.py`, `models/builder_project.py`
- **Features:** Natural language to website, project planning, page/backend/database generation, human-in-loop checkpoints, preview/production deployment
- **Stages:** PLANNING → SCAFFOLDING → BUILDING → REVIEWING → DEPLOYING → COMPLETE
- **Tech Stacks:** Static HTML, Flask, FastAPI, Express, React, Vue, Next.js

### Multi-Platform Deployment Guide
Interactive deployment documentation:
- **Location:** `/deployment-guide` in dashboard
- **Files:** `deploy/DEPLOYMENT_GUIDE.md`, `services/dashboard/templates/deployment_guide.html`
- **Features:** Step-by-step setup, progress tracking, command copy-to-clipboard, architecture visualization

### Setup Wizard
Interactive configuration wizard for all required services:
- **Location:** `/setup-wizard` in dashboard
- **Files:** `services/dashboard/routes/setup_routes.py`, `templates/setup_wizard.html`
- **Features:** 5 configuration sections with test connections, real-time status detection, database persistence
- **Sections:** Cloudflare DNS, Tailscale VPN, Fleet SSH Keys, Cloud Storage, OpenAI API

### Jarvis Codebase Access
Direct AI access to browse, read, edit, and search the actual HomeLabHub codebase:
- **Location:** `/api/jarvis/codebase/*` API endpoints
- **Files:** `services/dashboard/services/jarvis_codebase_service.py`, `routes/jarvis_codebase_routes.py`
- **Features:** File browsing, code search, automated edits with backups, Git status
- **Security:** Protected paths (.env, .git), file type whitelist, automatic .jarvis-backup files
- **Requirements:** Set `HOMELAB_PROJECT_ROOT=/home/evin/contain/HomeLabHub`

### Production Configuration
Gunicorn WSGI server configuration for Docker deployment:
- **Files:** `services/dashboard/Dockerfile`, `gunicorn.conf.py`, `docker-entrypoint.sh`
- **Features:** 4 workers, 2 threads, 120s timeout, health checks, preloaded app
- **Dev vs Prod:** Flask dev server in Replit, gunicorn in Docker

### Enhanced Automation Scripts
Shell scripts for deployment automation:
- **setup-tailscale.sh:** Automatic authkey authentication, exit node configuration, DNS setup
- **setup-ssh-keys.sh:** Key generation (ed25519/rsa), copy to hosts, connection testing
- **health-check.sh:** Tailscale connectivity, SSH verification, cross-host ping tests

## Dashboard Routes Summary
```
/                       - Home dashboard
/jarvis                 - AI assistant chat
/jarvis-code            - Code editing/deployment
/jarvis-builder         - Website builder
/dns-management         - Cloudflare DNS
/fleet-management       - Remote server control
/storage/management     - Unified storage
/deployment-guide       - Setup documentation
/setup-wizard           - Configuration wizard
/containers             - Docker management
/marketplace            - App deployment
/database-admin         - PostgreSQL admin
/plex-import            - Media management
```