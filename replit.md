# Nebula Command Dashboard Project

## Overview
The Nebula Command Dashboard is a web-based interface for managing a homelab environment, orchestrating 15 Docker-based services across a Ubuntu 25.10 server via custom subdomains. The project aims to provide a centralized, robust, and secure platform for personal and community use, with a strategic vision to evolve into an app marketplace offering one-click deployments.

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
The dashboard uses a Flask-based UI with Bootstrap 5 and Chart.js. Bot interfaces are built with React, Vite, Tailwind CSS, and Radix UI. Design principles include mobile-first, responsive layouts, collapsible sidebars, bottom navigation, and skeleton loading states.

### Technical Implementations
The core system leverages Docker Compose for orchestrating services across a split deployment (Linode cloud and local Ubuntu host). A `bootstrap-homelab.sh` script ensures idempotent installations, and a `./homelab` script provides daily management (diagnostics, health checks, DB operations). Key features include an RBAC system, Docker lifecycle APIs, a marketplace deployment queue with rollback, and an audit trail. Jarvis, an AI-powered agentic remediation system with multi-model routing (OpenAI + Ollama), provides service diagnosis and auto-repair, including offline fallbacks.

### Feature Specifications
- **Dashboard & AI:** Flask UI with Jarvis AI assistant (GPT-4o), Agent Swarm, Voice Interface, Docker/system monitoring, JWT token management, anomaly detection, and AI-powered infrastructure orchestration for deploying templated stacks via natural language.
- **Storage & Data:** NAS Management, Storage Monitor, Database Admin, File Manager, Plex Media Import, automated backup, and a unified storage service with dual-backend (local MinIO + cloud S3).
- **Bots:** Discord ticket bot with SLA automation, LLM-assisted triage, and sentiment analysis; multi-platform stream bot (Twitch/Kick/YouTube) with broadcaster onboarding and moderation.
- **Services:** Remote Ubuntu desktop (Host VNC), VS Code in browser (code-server), Plex, n8n, Home Assistant, and GameStream with Sunshine.
- **App Marketplace:** One-click deployment for various applications.
- **Static Sites:** Hosting for rig-city.com and scarletredjoker.com, optimized for SEO and accessibility.
- **Notifications & Monitoring:** Multi-channel alerts (Discord, Email), Prometheus, Grafana, and Loki.
- **Security:** Automatic SSL via Caddy/Let's Encrypt, environment-based secrets, isolated database credentials, rate limiting, and JWT authentication.
- **New Features:** DNS Management Engine (Cloudflare API), Fleet Manager (Tailscale), Jarvis Code Service (AI code editing/deployment), Jarvis Website Builder (autonomous AI website generation), Deployment Guide, Setup Wizard, and Jarvis Codebase Access (AI interaction with codebase).

### System Design Choices
- **Containerization:** All services are Dockerized and managed by Docker Compose.
- **Centralized Database:** A single PostgreSQL 16 Alpine container (`homelab-postgres`) with `database_orchestrator.py` for migrations and health checks.
- **Reverse Proxy:** Caddy handles reverse proxying and automatic SSL, with an Nginx sidecar.
- **Environment Management:** Centralized configuration via a single `.env` file.
- **Modular Architecture:** Designed for scalability and easy service expansion.
- **Homelab Transformation:** Implemented an 8-phase roadmap covering configuration, modular service packaging, service discovery & networking, database platform upgrade, observability, deployment automation, API Gateway & Auth, and DNS Automation.
- **Deployment Automation:** Enhanced automation scripts for Tailscale, SSH key management, and cross-host health checks. The `./homelab` script is role-aware for managing services.

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

## Current Status (December 7, 2025)

### NAS Media Storage
- **NAS Model**: Zyxel NAS326
- **NAS IP**: 192.168.0.176
- **Hostname**: NAS326.local
- **Protocol**: NFS (via /nfs/networkshare) or SMB/CIFS
- **Media Folders**: video, music, photo, games
- **Host Mount Path**: `/mnt/nas/networkshare` (mounted from NAS)

### Plex Media Server
- **Access URL**: https://plex.evindrake.net
- **Container Image**: `lscr.io/linuxserver/plex:latest`
- **Network Mode**: host
- **Config Volume**: `/var/lib/plex/config:/config`
- **Media Volumes** (read-only):
  - `/mnt/nas/networkshare/video:/nas/video:ro`
  - `/mnt/nas/networkshare/music:/nas/music:ro`
  - `/mnt/nas/networkshare/photo:/nas/photo:ro`
- **Plex Library Paths** (inside container): `/nas/video`, `/nas/music`, `/nas/photo`
- **Environment**: PUID=1000, PGID=1000, TZ=America/New_York

#### Docker Run Command
```bash
docker run -d \
  --name=plex \
  --net=host \
  -e PUID=1000 \
  -e PGID=1000 \
  -e TZ=America/New_York \
  -e VERSION=docker \
  -v /var/lib/plex/config:/config \
  -v /mnt/nas/networkshare/video:/nas/video:ro \
  -v /mnt/nas/networkshare/music:/nas/music:ro \
  -v /mnt/nas/networkshare/photo:/nas/photo:ro \
  --restart unless-stopped \
  lscr.io/linuxserver/plex:latest
```

#### NAS Auto-Discovery
The local setup includes automatic NAS discovery that scans for NFS and SMB shares on the network:

```bash
# Auto-discover and mount NAS:
sudo ./deploy/local/scripts/discover-nas.sh --auto-mount

# Discovery methods:
#   1. mDNS/Bonjour (Avahi) - finds .local hostnames
#   2. Network scan for NFS (port 2049) and SMB (ports 139, 445)
#   3. Common NAS hostname patterns (NAS*, synology*, qnap*, etc.)
#   4. UPnP/SSDP device discovery

# Manual mount options:
sudo ./deploy/local/scripts/setup-nas-mounts.sh --nas-ip=192.168.0.100 --nfs-share=/nfs/networkshare
sudo ./deploy/local/scripts/setup-nas-mounts.sh --nas-ip=192.168.0.100 --smb-share=public

# Skip NAS during bootstrap:
sudo ./deploy/local/scripts/bootstrap-local.sh --skip-nas
```

Scripts:
- `deploy/local/scripts/discover-nas.sh` - Auto-discovery with scoring algorithm (prefers NFS, media shares)
- `deploy/local/scripts/setup-nas-mounts.sh` - Mount configuration with read-write access and Docker compatibility symlinks
- `deploy/local/scripts/diagnose-nas.sh` - Troubleshooting script for NAS connectivity and write access
- `deploy/local/scripts/bootstrap-local.sh` - Integrated bootstrap with `--skip-nas` option
- `scripts/secrets-manager.sh` - Centralized secrets encryption using Age

### NAS Upload Support
- NAS mounts at `/mnt/nas/all` with read-write access enabled
- Symlink `/mnt/nas/networkshare` → `/mnt/nas/all` for Docker compatibility
- Uploads via: `cp file.mkv /mnt/nas/networkshare/video/`
- Plex volumes remain read-only for safety

### Secrets Management
- Documentation: `docs/deploy/SECRETS_MANAGEMENT.md`
- Script: `scripts/secrets-manager.sh` (Age-based encryption)
- Commands: `./scripts/secrets-manager.sh init|encrypt|decrypt|sync`

### Home Assistant
- URL: https://home.evindrake.net
- Config includes `external_url` for reverse proxy support
- Configuration template: `config/homeassistant/configuration.yaml`

### Deployment

#### Local Ubuntu Setup (with NAS)

```bash
# On local Ubuntu server:
cd /opt/homelab/HomeLabHub

# Complete bootstrap (NAS auto-discovery + Docker services)
sudo ./deploy/local/scripts/bootstrap-local.sh

# Or step by step:
sudo ./deploy/local/scripts/discover-nas.sh            # Discover NAS devices
sudo ./deploy/local/scripts/setup-nas-mounts.sh        # Mount NAS
./deploy/local/start-local-services.sh                 # Start Docker
```

See `docs/deploy/LOCAL_UBUNTU_SETUP.md` for detailed instructions.

#### Linode Cloud Deployment

```bash
# On Linode server:
cd /opt/homelab/HomeLabHub

# Smart .env setup (preserves existing values, adds new vars)
./homelab sync-env
nano deploy/linode/.env  # Fill in any new variables

# Or manual setup (first time only):
# cp deploy/linode/.env.example deploy/linode/.env
# nano deploy/linode/.env

# Validate environment
./deploy/linode/scripts/validate-env.sh

# Run pre-flight checks
./deploy/linode/scripts/preflight.sh

# Deploy (with all safety checks)
./deploy/linode/scripts/deploy.sh

# Or preview first
./deploy/linode/scripts/deploy.sh --dry-run

# Rollback if needed
./deploy/linode/scripts/rollback.sh
```

See `docs/runbooks/LINODE_DEPLOYMENT.md` for complete deployment runbook.

#### Post-Deployment Smoke Test

After deployment, an automated smoke test validates all services:

```bash
# Run smoke test manually
./deploy/linode/scripts/smoke-test.sh

# Auto-fix failed services
./deploy/linode/scripts/smoke-test.sh --auto-fix

# JSON output for CI/CD automation
./deploy/linode/scripts/smoke-test.sh --json

# Quiet mode (pass/fail only)
./deploy/linode/scripts/smoke-test.sh --quiet
```

The smoke test validates:
- **Infrastructure**: PostgreSQL, Redis, Caddy
- **Core Services**: Dashboard, Grafana, n8n, Code Server
- **Bots**: Discord Bot, Stream Bot
- **Static Sites**: rig-city.com, scarletredjoker.com
- **Utilities**: DNS Manager, Prometheus, Loki

The smoke test is automatically run at the end of `deploy.sh` (non-blocking with warnings) and provides:
- Quick validation (< 30 seconds)
- Pass/fail exit codes for CI/CD when run standalone
- Optional auto-restart of failed services with `--auto-fix`
- JSON output for automation with `--json`

Note: During `deploy.sh`, smoke test failures trigger warnings but don't abort deployment. Run standalone with `--auto-fix` for automatic remediation.

#### Unified Deployment Pipeline

The `./homelab pipeline` command provides a "one script to rule them all" deployment experience:

```bash
# Run complete deployment with auto-fix (auto-detects local vs cloud)
./homelab pipeline

# Features:
#   1. Auto-detects role (local Ubuntu vs Linode cloud)
#   2. Validates environment and pre-flight checks
#   3. Auto-creates .env from template if missing
#   4. Attempts Docker start if not running
#   5. Provides NAS write access guidance
#   6. Runs health checks after deployment
#   7. Shows log summary at the end
```

The pipeline runs 5 steps automatically:
1. Environment validation
2. Pre-flight checks
3. Deploy services (includes smoke test on Linode)
4. Health checks
5. Log summary

Note: On Linode, the deploy.sh script automatically runs a smoke test at the end. Run `./deploy/linode/scripts/smoke-test.sh --auto-fix` separately to auto-fix any issues.

### Desktop Integration (Gaming & Media)

The Ubuntu desktop provides seamless integration for gaming and media management:

#### NAS File Manager Integration
```bash
# One-time setup - adds NAS folders to Files sidebar
./scripts/setup-nas-desktop.sh

# Or install everything (gaming + NAS + WinApps)
./scripts/install-mode-switchers.sh
```

Desktop shortcuts for NAS:
- `scripts/desktop-entries/nas-media.desktop` - Main NAS folder
- `scripts/desktop-entries/nas-video.desktop` - Plex videos (drag-drop movies here)
- `scripts/desktop-entries/nas-music.desktop` - Music library
- `scripts/desktop-entries/nas-games.desktop` - Game storage

#### GameStream via Sunshine
- **VM**: Windows 11 KVM with RTX 3060 GPU passthrough
- **VM IP**: 192.168.122.250
- **Streaming Port**: 47989 (TCP/UDP)
- **Documentation**: `docs/deploy/SUNSHINE_SETUP.md`

```bash
# Check GameStream readiness
./deploy/local/scripts/check-gamestream.sh

# Switch to gaming mode (disconnects RDP, enables Sunshine)
gaming-mode

# Launch Moonlight client
moonlight-gaming
```

#### Mode Switching
- `gaming-mode` - Switch VM to console for Sunshine streaming
- `productivity-mode` - Enable RDP for WinApps
- `winapps-mode <app>` - Launch Windows apps (word, excel, etc.)

Full guide: `docs/deploy/ULTIMATE_GAMING_MEDIA_SETUP.md`

### Static Sites
- **rig-city.com**: Gaming community site (services/rig-city-site/)
- **scarletredjoker.com**: Digital creator portfolio (services/static-site/)
- Served via Nginx containers on Linode
- Docker path: `deploy/linode/docker-compose.yml` → `../../services/rig-city-site`