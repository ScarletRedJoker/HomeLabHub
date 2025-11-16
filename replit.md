# Homelab Dashboard Project

## Current Status (November 16, 2024)

### MASTER_FIX_ALL.sh - The Recovery Solution
**Status**: Production-ready

**What It Does:**
Simple one-command recovery script that fixes all production issues:
- Validates .env configuration
- Ensures infrastructure health (postgres, redis, minio)
- Syncs database user passwords
- Flushes Redis cache (fixes CSRF errors)
- Rebuilds broken containers (discord-bot, stream-bot)
- Starts all services (dashboards, bots, rig-city-site, powerdns, vnc)
- Purges stale SSL certificates and forces Caddy renewal
- Detects unhealthy containers
- Shows status and test URLs

**Run on Ubuntu:**
```bash
cd /home/evin/contain/HomeLabHub
bash MASTER_FIX_ALL.sh
```

**Recent Fixes:**
1. Auto-sync bug fixed (deployment/sync-from-replit.sh now detects DOCKER_COMPOSE)
2. Moonlight page readability improved (text contrast fixed)
3. All old fix scripts removed - ONE simple solution
4. Enhanced MASTER_FIX_ALL.sh to fix rig-city.com SSL errors and include all services

---

## Overview

Production-ready web dashboard for managing Ubuntu homelab servers across 3 domains (rig-city.com, evindrake.net, scarletredjoker.com).

**Key Features:**
- Jarvis AI Assistant (GPT-4 powered with voice control)
- Domain Management (ZoneEdit DNS integration, auto-SSL)
- Container Marketplace (20 curated apps, one-click deploy)
- Smart Home Integration (Home Assistant)
- Game Streaming (Moonlight landing page)
- Multi-service orchestration (8 services, automatic SSL)

---

## User Setup

**Environment:**
- Ubuntu 25.10 desktop homelab
- Twingate VPN + dynamic DNS (ZoneEdit)
- Projects: `/home/evin/contain/` (production), Replit (development)
- Auto-sync: Replit → Ubuntu every 5 minutes

**Managed Services:**
- Discord Ticket Bot (bot.rig-city.com)
- Stream Bot / SnappleBotAI (stream.rig-city.com)
- Plex Server (plex.evindrake.net)
- n8n Automation (n8n.evindrake.net)
- Static Website (scarletredjoker.com)
- VNC Desktop (vnc.evindrake.net)
- Homelab Dashboard (test.evindrake.net - demo, host.evindrake.net - production)
- Home Assistant (home.evindrake.net)

**Access URLs:**
- Demo Dashboard: https://test.evindrake.net (demo/demo)
- Production Dashboard: https://host.evindrake.net (evin/homelab)
- Game Streaming: https://game.evindrake.net

---

## Tech Stack

**Dashboard:**
- Flask + Python 3.11
- PostgreSQL (multi-database setup)
- Redis (sessions/cache)
- Celery (background tasks)
- MinIO (object storage)
- Bootstrap 5 + Chart.js

**Bots:**
- Discord Bot: Node.js, Discord.js, React, Drizzle ORM
- Stream Bot: Node.js, Twitch/YouTube/Kick APIs, React, OpenAI

**Infrastructure:**
- Caddy (reverse proxy, auto-SSL)
- Docker Compose (unified deployment)
- PostgreSQL 16 Alpine (shared database)

**Integrations:**
- ZoneEdit (DNS)
- Let's Encrypt (SSL)
- OpenAI (Jarvis AI)
- Home Assistant (IoT)
- Google APIs (Calendar, Gmail)

---

## Architecture

**Database Layout:**
- `ticketbot` - Discord bot database
- `streambot` - Stream bot database
- `homelab_jarvis` - Production dashboard
- `homelab_jarvis_demo` - Demo dashboard
- `powerdns` - DNS management

**Deployment System:**
- `docker-compose.unified.yml` - All services
- `MASTER_FIX_ALL.sh` - Recovery script
- `deployment/sync-from-replit.sh` - Auto-sync (5-min cron)

**Security:**
- Session authentication + API keys
- Rate limiting + CSRF protection
- Audit logging
- Secret management
- Multi-tenant isolation

---

## Key Components

### Jarvis AI Agent
- GPT-4 powered assistant
- Voice control
- 20+ automated actions (diagnose, remediate, maintain)
- Task approval workflow
- Code workspace with diff preview

### Container Marketplace
- 20 curated production apps
- One-click deployment
- Auto port management
- Caddy config automation
- Health checks

### Domain Management
- ZoneEdit API integration
- Full DNS CRUD operations
- Automatic SSL provisioning
- 8-step autonomous workflow
- Health monitoring

### Demo Mode
- Investor-ready interface (test.evindrake.net)
- Auto-login (demo/demo)
- Mock services (no production access)
- Flashy UI without touching real infrastructure

---

## Development Workflow

1. Edit code on Replit
2. Changes auto-sync to Ubuntu every 5 minutes
3. Run MASTER_FIX_ALL.sh if services need restart
4. Test on production URLs

**Simple principle:** One command fixes everything.
