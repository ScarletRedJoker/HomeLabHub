# Nebula Command Dashboard Project

## Overview
The Nebula Command Dashboard is a web-based interface for managing a homelab environment consisting of a Ubuntu 25.10 server hosting 15 Docker-based services. These services, including homelab management, Discord/Twitch bots, media streaming, remote desktop, and home automation, are accessible via custom subdomains. The project aims to provide a centralized, robust, and secure platform, integrating various functionalities for personal and community use, with a vision to offer an app marketplace for one-click deployments.

## Deployment Architecture (Simplified - November 30, 2025)

**Philosophy: Simple, Straightforward, Automated, Self-Healing**

The project uses a unified deployment approach with ONE .env, ONE docker-compose.yml, and ONE homelab script.

### Service Distribution
**Linode Cloud (12 services):**
- Dashboard, Celery Worker, Discord Bot, Stream Bot
- PostgreSQL, Redis, n8n, Code-Server
- Caddy (reverse proxy), Static Sites (scarletredjoker.com, rig-city.com)

**Local Ubuntu Host (3 services via compose.local.yml):**
- Plex Media Server, Home Assistant, MinIO Storage
- VNC runs natively on host (not in Docker)

### Deployment Files
```
docker-compose.yml       # Main cloud services (Linode)
compose.local.yml        # Local services (Ubuntu host)
.env                     # All environment variables
.env.example             # Template with documentation
homelab                  # Management script
Caddyfile                # Reverse proxy configuration

deploy/scripts/
├── bootstrap.sh         # Unified deployment script
├── bootstrap-linode.sh  # Server setup (Docker, Tailscale, UFW)
├── bootstrap-local.sh   # Local host setup
└── health-check.sh      # Self-healing checks
```

### Quick Start (Linode Deployment)
```bash
# 1. Server setup (run as root on fresh Linode)
./deploy/scripts/bootstrap-linode.sh

# 2. Clone repo and configure
git clone https://github.com/username/HomeLabHub.git
cd HomeLabHub
cp .env.example .env
nano .env  # Add your credentials

# 3. Deploy services
./deploy/scripts/bootstrap.sh

# 4. Verify
./homelab status
```

### Daily Commands
```bash
./homelab up        # Start services
./homelab down      # Stop services
./homelab status    # Check status
./homelab logs      # View logs
./homelab fix       # Rebuild everything
./homelab health    # Run health checks
./homelab restart   # Restart all
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
- **PostgreSQL 16 Alpine:** Shared database
- **Redis:** Caching and message broker
- **MinIO:** S3-compatible object storage (local Ubuntu host)
- **Caddy:** Reverse proxy with automatic SSL
- **GPT-4o (OpenAI API):** Jarvis AI assistant, Stream Bot fact generation
- **Discord API:** Discord ticket bot
- **Twitch/Kick/YouTube APIs:** Multi-platform stream bot
- **Plex Media Server:** Media streaming (local Ubuntu host)
- **n8n:** Workflow automation
- **Home Assistant:** Smart home hub (local Ubuntu host)
- **Cloudflare API:** DNS automation
- **Tailscale:** VPN mesh connecting Linode and local host

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
- **Requirements:** Uses `HOMELAB_PROJECT_ROOT` environment variable (defaults to `/project` in Docker)

### Jarvis Infrastructure Orchestrator (NEW - November 30, 2025)
Multi-billion dollar AI SaaS platform for autonomous infrastructure management:
- **Location:** `/api/jarvis/infrastructure/*` API endpoints
- **Files:** `services/dashboard/jarvis/infrastructure_orchestrator.py`, `jarvis/stack_templates.py`, `routes/jarvis_infrastructure_api.py`
- **Features:**
  - **15+ Stack Templates:** LAMP, MEAN, MERN, Django, Flask, WordPress, Redis Cluster, PostgreSQL HA, MongoDB Replica Set, RabbitMQ, Kafka, Prometheus/Grafana, Elasticsearch, GitLab CI/CD
  - **Natural Language Deployment:** "Deploy a WordPress site with SSL" → Full deployment plan + compose files
  - **Cost Estimation:** Pricing models for Linode, DigitalOcean, AWS, Hetzner
  - **Security Scanning:** 10+ checks (exposed ports, weak credentials, SSL, network isolation)
  - **Multi-Host Orchestration:** Deploy across Fleet-managed hosts via Tailscale VPN
  - **One-Command Deploy:** End-to-end deployment from a single API request
- **API Endpoints:**
  - `GET /api/jarvis/infrastructure/stacks` - List all stack templates
  - `POST /api/jarvis/infrastructure/generate/compose` - Generate docker-compose from template
  - `POST /api/jarvis/infrastructure/plan` - Create deployment plan from natural language
  - `POST /api/jarvis/infrastructure/estimate` - Estimate deployment costs
  - `POST /api/jarvis/infrastructure/security/scan` - Security analysis
  - `POST /api/jarvis/infrastructure/deploy/fleet` - Multi-host deployment

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