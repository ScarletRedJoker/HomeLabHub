# Nebula Command Dashboard Project

## Overview
The Nebula Command Dashboard is a web-based interface designed to manage a homelab environment, orchestrating 15 Docker-based services on a Ubuntu 25.10 server using custom subdomains. The project aims to establish a centralized, robust, and secure platform for personal and community use, with a long-term vision to evolve into an app marketplace offering one-click deployments.

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
The dashboard utilizes a Flask-based UI with Bootstrap 5 and Chart.js. Bot interfaces are built with React, Vite, Tailwind CSS, and Radix UI, adhering to mobile-first, responsive design principles with features like collapsible sidebars, bottom navigation, and skeleton loading states.

### Technical Implementations
The core system uses Docker Compose for orchestrating services across a split deployment (Linode cloud and local Ubuntu host). An idempotent `bootstrap-homelab.sh` script handles installations, and a `./homelab` script manages daily operations. Key features include an RBAC system, Docker lifecycle APIs, a marketplace deployment queue with rollback, and an audit trail. Jarvis, an AI-powered agentic remediation system with multi-model routing (OpenAI + Ollama), provides service diagnosis and auto-repair, including offline fallbacks.

### Feature Specifications
- **Dashboard & AI:** Flask UI with Jarvis AI assistant (GPT-4o), Agent Swarm, Voice Interface, Docker/system monitoring, JWT token management, anomaly detection, and AI-powered infrastructure orchestration.
- **Storage & Data:** NAS Management, Storage Monitor, Database Admin, File Manager, Plex Media Import, automated backup, and a unified storage service with dual-backend (local MinIO + cloud S3).
- **Bots:** Discord ticket bot with SLA automation, LLM-assisted triage, and sentiment analysis; multi-platform stream bot (Twitch/Kick/YouTube) with broadcaster onboarding and moderation.
- **Services:** Remote Ubuntu desktop (Host VNC), VS Code in browser (code-server), Plex, n8n, Home Assistant, and GameStream with Sunshine.
- **App Marketplace:** One-click deployment for various applications.
- **Static Sites:** Hosting for rig-city.com and scarletredjoker.com, optimized for SEO and accessibility.
- **Notifications & Monitoring:** Multi-channel alerts (Discord, Email), Prometheus, Grafana, and Loki.
- **Security:** Automatic SSL via Caddy/Let's Encrypt, environment-based secrets, isolated database credentials, rate limiting, and JWT authentication.
- **New Features:** DNS Management Engine (Cloudflare API), Fleet Manager (Tailscale), Jarvis Code Service (AI code editing/deployment), Jarvis Website Builder (autonomous AI website generation), Deployment Guide, Setup Wizard, and Jarvis Codebase Access (AI interaction with codebase).
- **Prime Time Ready (Dec 2025):** Command Center UI (unified environment overview), Guided Deployment Wizard (multi-step service deployment with preflight checks), Database Console (cross-environment database management), Storage Dashboard (NAS/storage monitoring for post-upgrade), Enhanced sidebar navigation with status indicators and quick actions.
- **Homelab Management Suite (Dec 2025):**
  - **NAS Mount Manager:** Real-time mount status, one-click remount, diagnostics, and troubleshooting from dashboard
  - **KVM Gaming Control:** Windows 11 VM management with GPU telemetry, mode switching (Gaming/Productivity), and freeze diagnostics
  - **Unified Docker Management:** Multi-host container control with 24+ deployment templates, logs, and resource monitoring
  - **Fleet Control Center:** Real-time host monitoring for Local Ubuntu, Linode, and KVM with command execution and health checks
  - **Jarvis Autonomous Operations:** AI-powered incident detection, root cause analysis, auto-remediation playbooks, and learning system
  - **Notification & Task Queue:** Human-in-the-loop escalation with Discord/email alerts, SLA tracking, and task management
  - **Multi-Tenant SaaS Architecture:** Organizations, member roles, API keys, JWT authentication, and complete audit trail
  - **Network Auto-Discovery (NEW):** Dynamic detection of NAS, hosts, and services with automatic IP resolution, fallback strategies, and persistent resource registry. API endpoints for network status, manual re-discovery, and health checks. Uses environment hints as starting points but probes network to verify/discover actual IPs.

### System Design Choices
- **Containerization:** All services are Dockerized and managed by Docker Compose.
- **Centralized Database:** A single PostgreSQL 16 Alpine container (`homelab-postgres`) with `database_orchestrator.py` for migrations and health checks.
- **Reverse Proxy:** Caddy handles reverse proxying and automatic SSL, with an Nginx sidecar.
- **Environment Management:** Centralized configuration via a single `.env` file.
- **Modular Architecture:** Designed for scalability and easy service expansion.
- **Deployment Automation:** Enhanced automation scripts for Tailscale, SSH key management, cross-host health checks, and a unified `./homelab pipeline` command for automated deployment across local and cloud environments.
- **NAS Integration:** Resilient NAS mounts using systemd automount with fail-fast timeouts and local `/srv/media` directories, with Docker containers mounting local paths bind-mounted to NAS when available.
- **Secrets Management:** Age-based encryption for centralized secrets using `scripts/secrets-manager.sh`.
- **Desktop Integration:** Scripts for integrating NAS folders into the Ubuntu desktop and mode switching for gaming (Sunshine) and productivity (RDP for WinApps).
- **Gamestream Forwarding:** Windows KVM VM with GPU passthrough, streaming to Moonlight clients via iptables forwarding through Ubuntu host.
- **KVM Mode Switching:** Seamlessly switch between Gaming Mode (Sunshine/Moonlight) and Productivity Mode (RDP/WinApps).

## External Dependencies
- **PostgreSQL 16 Alpine:** Shared database.
- **Redis:** Caching and message broker.
- **MinIO:** S3-compatible object storage.
- **Caddy:** Reverse proxy with automatic SSL.
- **GPT-4o (OpenAI API):** Jarvis AI assistant, Stream Bot fact generation, AI code generation.
- **Discord API:** Discord ticket bot.
- **Twitch/Kick/YouTube APIs:** Multi-platform stream bot.
- **Plex Media Server:** Media streaming.
- **n8n:** Workflow automation.
- **Home Assistant:** Smart home hub.
- **Cloudflare API:** DNS automation.
- **Tailscale:** VPN mesh.
- **Sunshine:** Game streaming server.