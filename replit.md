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