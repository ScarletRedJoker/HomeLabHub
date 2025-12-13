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
The core system uses Docker Compose for orchestrating services across a split deployment (Linode cloud and local Ubuntu host). An idempotent `bootstrap-homelab.sh` script handles installations, and a `./homelab` script manages daily operations (diagnostics, health checks, DB operations). Key features include an RBAC system, Docker lifecycle APIs, a marketplace deployment queue with rollback, and an audit trail. Jarvis, an AI-powered agentic remediation system with multi-model routing (OpenAI + Ollama), provides service diagnosis and auto-repair, including offline fallbacks.

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

### System Design Choices
- **Containerization:** All services are Dockerized and managed by Docker Compose.
- **Centralized Database:** A single PostgreSQL 16 Alpine container (`homelab-postgres`) with `database_orchestrator.py` for migrations and health checks.
- **Reverse Proxy:** Caddy handles reverse proxying and automatic SSL, with an Nginx sidecar.
- **Environment Management:** Centralized configuration via a single `.env` file.
- **Modular Architecture:** Designed for scalability and easy service expansion.
- **Deployment Automation:** Enhanced automation scripts for Tailscale, SSH key management, cross-host health checks, and a unified `./homelab pipeline` command for automated deployment across local and cloud environments.
- **NAS Integration:** Resilient NAS mounts that never hang when NAS is offline. Uses systemd automount with fail-fast timeouts + local /srv/media directories. Docker containers mount local paths that are bind-mounted to NAS when available. Watchdog auto-recovers stale mounts. Setup: `sudo ./deploy/local/scripts/setup-nas-resilient.sh`. Emergency unmount: `./deploy/local/scripts/nas-emergency-unmount.sh`.
- **Secrets Management:** Age-based encryption for centralized secrets using `scripts/secrets-manager.sh`.
- **Desktop Integration:** Scripts for integrating NAS folders into the Ubuntu desktop and mode switching for gaming (Sunshine) and productivity (RDP for WinApps).
- **Gamestream Forwarding:** Windows KVM VM (192.168.122.250) with RTX 3060 GPU passthrough. Sunshine streams to Moonlight clients via iptables forwarding through Ubuntu host. Setup: `sudo ./deploy/local/scripts/setup-gamestream-forwarding.sh`. Clients connect to Ubuntu LAN IP (192.168.0.177) and traffic forwards to VM.

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

## Deployment Guide

### Environment Variable Auto-Derivation

The deployment system automatically derives certain environment variables from others to reduce configuration overhead:

| Derived Variable | Source Variable | Purpose |
|-----------------|-----------------|---------|
| `DISCORD_APP_ID` | `DISCORD_CLIENT_ID` | Discord application ID (identical to client ID) |
| `VITE_DISCORD_CLIENT_ID` | `DISCORD_CLIENT_ID` | Frontend Discord OAuth (Vite environment) |

When you set `DISCORD_CLIENT_ID` in your `.env` file, the deployment scripts automatically export these derived variables. This eliminates redundant configuration and reduces the chance of mismatched values.

For the complete list of required and optional environment variables, see `docs/deploy/FULL_INFRASTRUCTURE_STATUS.md` Section 2.

### Service-to-Domain Matrix

All services are mapped to their respective domains via Caddy reverse proxy:

| Domain | Service | Health Endpoint |
|--------|---------|-----------------|
| dashboard.evindrake.net | homelab-dashboard | `/health` |
| bot.rig-city.com | discord-bot | `/health` |
| stream.rig-city.com | stream-bot | `/health` |
| grafana.evindrake.net | homelab-grafana | `/api/health` |
| n8n.evindrake.net | n8n | - |
| code.evindrake.net | code-server-proxy | `/healthz` |
| dns.evindrake.net | dns-manager | `/health` |
| rig-city.com | rig-city-site | Static |
| scarletredjoker.com | scarletredjoker-web | Static |
| plex.evindrake.net | Local (WireGuard) | - |
| home.evindrake.net | Local (WireGuard) | - |

For complete matrix including container names and internal ports, see `docs/deploy/FULL_INFRASTRUCTURE_STATUS.md` Section 1.

### Post-Deployment Smoke Test

After deployment, an automated smoke test validates all services:

```bash
./deploy/linode/scripts/smoke-test.sh              # Run smoke test
./deploy/linode/scripts/smoke-test.sh --auto-fix   # Auto-fix failures
./deploy/linode/scripts/smoke-test.sh --json       # JSON output for CI/CD
./deploy/linode/scripts/smoke-test.sh --quiet      # Minimal output
```

The smoke test validates: Infrastructure (PostgreSQL, Redis, Caddy), Core Services (Dashboard, Grafana, n8n, Code Server), Bots (Discord, Stream), Static Sites, and Utilities (DNS Manager, Prometheus, Loki).

Exit codes: `0` = All passed, `1` = Some failed, `2` = Critical infrastructure failure.

### Unified Deployment Pipeline

```bash
./homelab pipeline   # Auto-detects role (local/cloud), runs all checks
```

Steps: Environment validation → Pre-flight checks → Deploy services (includes smoke test) → Health checks → Log summary.

### Local Ubuntu Deployment

The local Ubuntu host runs services that need direct hardware access or local network visibility:

| Service | Port | Purpose |
|---------|------|---------|
| Plex | 32400 | Media streaming with NAS access |
| MinIO | 9000/9001 | S3-compatible object storage |
| Home Assistant | 8123 | Smart home hub |
| noVNC | 6080 | Remote desktop (optional profile) |
| Sunshine | 47990 | GameStream server (optional profile) |

**Quick Start:**
```bash
cd deploy/local
./scripts/env-doctor.sh --fix    # Smart fix missing env vars
./start-local-services.sh        # Start all services
```

**Environment Doctor (`env-doctor.sh`):**
- Auto-generates passwords for MinIO, VNC, Sunshine
- Detects placeholder values and reports what needs manual action
- Supports `--fix` for auto-apply, `--check-only` for validation
- Never wipes existing valid values

**NAS Setup for Plex:**
```bash
sudo ./scripts/setup-nas-mounts.sh                    # Auto-detect NAS
sudo ./scripts/setup-nas-mounts.sh --nas-ip=192.168.x.x  # Specific IP
sudo ./scripts/setup-nas-mounts.sh --smb-share=nfs   # Force SMB (better write access)
```

**Optional Services (Profiles):**
```bash
docker compose --profile vnc up -d         # Start noVNC
docker compose --profile gamestream up -d  # Start Sunshine
docker compose --profile monitoring up -d  # Start storage monitor
docker compose --profile vnc --profile gamestream up -d  # Start both
```

### Cloudflare Tunnel (Recommended for Plex)

Cloudflare Tunnel exposes local services to the internet without port forwarding, firewall configuration, or static IP:

```bash
# One-time setup
cloudflared tunnel login
cloudflared tunnel create homelab-tunnel
cloudflared tunnel route dns homelab-tunnel plex.evindrake.net

# Copy config
cp config/cloudflared/config.yml.example config/cloudflared/config.yml
# Edit config.yml with your tunnel ID

# Copy credentials
cp ~/.cloudflared/TUNNEL_ID.json config/cloudflared/credentials.json

# Start tunnel
docker compose up -d cloudflared
```

Benefits:
- Works behind any NAT/firewall (no port forwarding needed)
- Survives ISP IP changes automatically
- DDoS protection built-in
- Automatic SSL certificates

See `docs/deploy/CLOUDFLARE_TUNNEL.md` for full setup guide.

### Storage Health Monitoring

Monitor disk health with SMART monitoring and ZFS pool status:

```bash
# Quick check
./deploy/local/scripts/storage-health.sh

# Disk inventory
./deploy/local/scripts/disk-inventory.sh

# Start monitoring service (with Discord alerts)
docker compose --profile monitoring up -d storage-monitor

# View status
curl http://localhost:9634/status
```

Environment variables for alerts:
- `STORAGE_ALERT_DISCORD_WEBHOOK` - Discord webhook URL for alerts
- `ZFS_ENABLED=true` - Enable ZFS pool monitoring
- `STORAGE_CHECK_INTERVAL=3600` - Check interval in seconds

See `docs/runbooks/STORAGE_HEALTH.md` for troubleshooting and ZFS migration guide.

## Server Update Commands

**Update both servers (pull code + restart services):**
```bash
./scripts/update-servers.sh all
```

**Update specific server:**
```bash
./scripts/update-servers.sh local    # Local Ubuntu only
./scripts/update-servers.sh linode   # Linode cloud only
```

**Update with fresh Docker images:**
```bash
./scripts/update-servers.sh all --images
```

**Plex optimization (buffering fixes):**
```bash
./deploy/local/scripts/optimize-plex.sh --all
```

**Plex Cache (for slow NAS - speeds below 80 MB/s):**
```bash
sudo ./deploy/local/scripts/plex-cache.sh setup          # Initial setup
./deploy/local/scripts/plex-cache.sh search "movie"      # Search NAS
sudo ./deploy/local/scripts/plex-cache.sh add movie "Title"   # Cache movie
sudo ./deploy/local/scripts/plex-cache.sh add show "Title"    # Cache TV show
sudo ./deploy/local/scripts/plex-cache.sh add music "Artist"  # Cache music
./deploy/local/scripts/plex-cache.sh list                # Show cached
./deploy/local/scripts/plex-cache.sh status              # Show disk usage
```
Cache location: `/opt/plex-cache/{movies,shows,music}` - Add to Plex as libraries for prioritized playback.

**Plex Auto-Cache (intelligent automatic caching):**

Automatically caches content when you start watching, with smart disk management:

```bash
# Start the auto-cache service
docker compose up -d --build plex-auto-cache

# Check cache status
curl http://localhost:5055/status

# View cached items
curl http://localhost:5055/cached
```

Setup Plex webhook: Plex Settings → Webhooks → Add `http://YOUR_IP:5055/webhook`

Configuration (in `.env`):
- `PLEX_CACHE_MAX_GB=100` - Maximum cache size (default 100GB)
- `PLEX_CACHE_BUFFER_GB=10` - Buffer space to keep free
- `PLEX_SESSION_PROTECT_MINUTES=60` - Time to protect paused content from eviction

Features:
- Automatic caching on playback start
- LRU eviction (least-recently-watched content removed first)
- Session protection (never removes content being watched)
- Watch completion tracking (finished content evicted first)
- Seamless fallback to NAS when content is evicted

See `docs/troubleshooting/PLEX_AUTO_CACHE.md` for detailed setup guide.

## Documentation Reference

- `docs/deploy/FULL_INFRASTRUCTURE_STATUS.md` - Complete infrastructure audit and service matrix
- `docs/deploy/LOCAL_UBUNTU_SETUP.md` - Local Ubuntu server setup guide
- `docs/deploy/CLOUDFLARE_TUNNEL.md` - Cloudflare Tunnel setup for Plex/services
- `docs/runbooks/LINODE_DEPLOYMENT.md` - Linode deployment runbook
- `docs/runbooks/STORAGE_HEALTH.md` - Storage monitoring and ZFS migration guide
- `docs/deploy/SUNSHINE_SETUP.md` - GameStream/Sunshine configuration
- `docs/deploy/SECRETS_MANAGEMENT.md` - Secrets encryption guide
- `docs/troubleshooting/PLEX_BUFFERING.md` - Plex buffering diagnosis and fixes