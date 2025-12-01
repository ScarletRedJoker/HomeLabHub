# Nebula Command Dashboard Project

## Overview
The Nebula Command Dashboard is a web-based interface designed to manage a homelab environment. It orchestrates 15 Docker-based services across a Ubuntu 25.10 server, accessible via custom subdomains. The project aims to provide a centralized, robust, and secure platform for personal and community use, with a strategic vision to evolve into an app marketplace offering one-click deployments.

## User Preferences
- User: Evin
- Ubuntu 25.10 server at host.evindrake.net
- Project location: `/home/evin/contain/HomeLabHub`
- Development: Edit in cloud IDE → Push to GitHub → Pull on Ubuntu server
- All services use shared PostgreSQL (homelab-postgres) with individual databases
- Passwords: Stored securely in .env file (never commit to git)
- Managed domains: rig-city.com, evindrake.net, scarletredjoker.com

## System Architecture

### UI/UX Decisions
The dashboard utilizes a Flask-based UI with Bootstrap 5 and Chart.js for data visualization. Bot interfaces are developed with React, Vite, Tailwind CSS, and Radix UI. The design prioritizes a mobile-first approach, featuring responsive layouts, collapsible sidebars, bottom navigation, and skeleton loading states for an optimal user experience.

### Technical Implementations
The core system relies on Docker Compose for orchestrating services across a split deployment, utilizing both a Linode cloud instance and a local Ubuntu host. A `bootstrap-homelab.sh` script ensures idempotent fresh installations, while a `./homelab` script provides daily management capabilities including diagnostics, health checks, and database operations. Key features include an RBAC system, Docker lifecycle APIs, a marketplace deployment queue with rollback, and an audit trail. The system also integrates Jarvis, an AI-powered agentic remediation system with multi-model routing (OpenAI + Ollama) for service diagnosis and auto-repair, including offline fallbacks.

### Feature Specifications
- **Dashboard & AI:** Flask UI with Jarvis AI assistant (GPT-4o), Agent Swarm, Voice Interface, Docker/system monitoring, JWT token management, anomaly detection, and AI-powered infrastructure orchestration for deploying templated stacks (LAMP, MEAN, WordPress, etc.) via natural language.
- **Storage & Data:** NAS Management, Storage Monitor, Database Admin, File Manager, Plex Media Import, automated backup, and a unified storage service with dual-backend abstraction (local MinIO + cloud S3).
- **Bots:** Discord ticket bot with SLA automation, LLM-assisted triage, and sentiment analysis; multi-platform stream bot (Twitch/Kick/YouTube) with broadcaster onboarding and enhanced moderation.
- **Services:** Remote Ubuntu desktop (Host VNC), VS Code in browser (code-server), Plex media server, n8n workflow automation, Home Assistant, and GameStream with Sunshine for low-latency game streaming.
- **App Marketplace:** One-click deployment for various applications (e.g., WordPress, Nextcloud).
- **Static Sites:** Hosting for rig-city.com and scarletredjoker.com, optimized for SEO and accessibility.
- **Notifications & Monitoring:** Multi-channel alerts (Discord, Email), Prometheus, Grafana, and Loki for comprehensive observability.
- **Security:** Automatic SSL via Caddy/Let's Encrypt, environment-based secrets, isolated database credentials, rate limiting, and JWT authentication.
- **New Features:** DNS Management Engine (Cloudflare API integration), Fleet Manager (remote server control via Tailscale), Jarvis Code Service (AI code editing/deployment), Jarvis Website Builder (autonomous AI website generation), Deployment Guide, Setup Wizard, and Jarvis Codebase Access (AI interaction with codebase).

### System Design Choices
- **Containerization:** All services are Dockerized and managed by Docker Compose.
- **Centralized Database:** A single PostgreSQL 16 Alpine container (`homelab-postgres`) with `database_orchestrator.py` for migrations and health checks.
- **Reverse Proxy:** Caddy handles reverse proxying and automatic SSL, with an Nginx sidecar for specific header handling.
- **Environment Management:** Centralized configuration via a single `.env` file.
- **Modular Architecture:** Designed for scalability and easy service expansion.
- **Homelab Transformation:** Implemented an 8-phase roadmap covering configuration, modular service packaging, service discovery & networking, database platform upgrade, observability, deployment automation, API Gateway & Auth, and DNS Automation.
- **Deployment Automation:** Enhanced automation scripts for Tailscale, SSH key management, and cross-host health checks. The `./homelab` script is role-aware (local/cloud) for managing services based on the deployment environment.

## External Dependencies
- **PostgreSQL 16 Alpine:** Shared database.
- **Redis:** Caching and message broker.
- **MinIO:** S3-compatible object storage (local Ubuntu host).
- **Caddy:** Reverse proxy with automatic SSL.
- **GPT-4o (OpenAI API):** Jarvis AI assistant, Stream Bot fact generation, AI code generation.
- **Discord API:** Discord ticket bot.
- **Twitch/Kick/YouTube APIs:** Multi-platform stream bot.
- **Plex Media Server:** Media streaming (local Ubuntu host).
- **n8n:** Workflow automation.
- **Home Assistant:** Smart home hub (local Ubuntu host).
- **Cloudflare API:** DNS automation.
- **Tailscale:** VPN mesh connecting Linode and local host.
- **Sunshine:** Game streaming server (local Ubuntu host).

## Deployment

**See [`docs/deploy/FULL_DEPLOYMENT_GUIDE.md`](docs/deploy/FULL_DEPLOYMENT_GUIDE.md)** - the single source of truth for all deployment instructions.

```bash
# Cloud (Linode)
./deploy/scripts/bootstrap.sh --role cloud --generate-secrets

# Local (Ubuntu)
./deploy/scripts/bootstrap.sh --role local
```