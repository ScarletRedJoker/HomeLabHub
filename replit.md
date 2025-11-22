# Nebula Command Dashboard Project

## Overview
The Nebula Command Dashboard is a web-based interface for managing a Ubuntu 25.10 server with 15 Docker-based services accessible via custom domains (evindrake.net subdomains). Services run on Docker Compose with Caddy reverse proxy and provide homelab management, Discord/Twitch bots, media streaming, remote desktop access, and home automation.

## User Preferences
- User: Evin
- Ubuntu 25.10 server at host.evindrake.net
- Project location: `/home/evin/contain/HomeLabHub`
- Development: Edit in cloud IDE → Push to GitHub → Pull on Ubuntu server
- All services use shared PostgreSQL (homelab-postgres) with individual databases
- Main password: `Brs=2729` (used for most services)
- Managed domains: rig-city.com, evindrake.net, scarletredjoker.com

## 🎯 SIMPLIFIED MANAGEMENT (Current Approach)

### One Script Controls Everything: `./homelab`

```bash
./homelab fix       # Fix all issues and start all 15 services
./homelab status    # Show what's running
./homelab logs      # View logs (saves to logs/ directory)
./homelab debug     # Show environment and container status  
./homelab restart   # Restart services
./homelab stop      # Stop everything
```

**Key Fix:** Uses absolute paths to ensure Docker finds .env file:
```bash
docker compose \
    --project-directory /home/evin/contain/HomeLabHub \
    --env-file /home/evin/contain/HomeLabHub/.env \
    up -d --force-recreate
```

## Services (15 Total)

### Core Infrastructure
- **homelab-postgres** - PostgreSQL 16 Alpine (shared database)
- **homelab-redis** - Redis cache
- **homelab-minio** - S3-compatible object storage
- **caddy** - Reverse proxy with automatic SSL

### Dashboard & AI
- **homelab-dashboard** - Flask-based management UI (host.evindrake.net)
  - Login: evin/Brs=2729
  - Jarvis AI assistant (GPT-3.5-turbo)
  - Docker management, system monitoring
  - Database: homelab_jarvis
- **homelab-celery-worker** - Background task processor

### Bots
- **discord-bot** - Discord ticket bot (bot.rig-city.com)
  - TypeScript, React, Drizzle ORM
  - Database: ticketbot
- **stream-bot** - Multi-platform stream bot (stream.rig-city.com)
  - SnappleBotAI for Twitch/Kick/YouTube
  - Database: streambot

### Services
- **vnc-desktop** - Remote Ubuntu desktop (vnc.evindrake.net)
- **code-server** - VS Code in browser (code.evindrake.net)
- **plex-server** - Media streaming (plex.evindrake.net)
- **n8n** - Workflow automation (n8n.evindrake.net)
- **homeassistant** - Smart home hub (home.evindrake.net)

### Static Sites
- **rig-city-site** - rig-city.com
- **scarletredjoker-web** - scarletredjoker.com

## Database Architecture

**Single PostgreSQL Container** (`homelab-postgres`):
- User: `postgres`
- Password: `Brs=2729` (from POSTGRES_PASSWORD)
- Three databases:
  - `ticketbot` - Discord bot data
  - `streambot` - Stream bot data  
  - `homelab_jarvis` - Dashboard data

Each service connects with individual user credentials but all to the same PostgreSQL instance.

## Environment Management

**.env File Structure:**
- All configuration in one file at project root
- Docker loads via `--env-file` flag with absolute path
- Critical variables:
  - `WEB_USERNAME=evin`
  - `WEB_PASSWORD=Brs=2729`
  - `POSTGRES_PASSWORD=Brs=2729`
  - `OPENAI_API_KEY=sk-proj-...`
  - Individual service credentials

## Recent Major Fixes

1. **Database Password Caching Issue (Nov 22, 2025)** ✅ RESOLVED
   - Problem: Running `./homelab fix` caused password authentication failures
   - Root cause: Docker cached image layers with old passwords, `--force-recreate` only recreates containers, doesn't rebuild images
   - Solution: Updated `./homelab fix` to rebuild bots with `--no-cache` before recreating
   - All database passwords now standardized to: `qS4R8Wrl-Spz7-YEmyllIA`

1.5. **Background Cleanup Task Fixes (Nov 22, 2025)** ✅ RESOLVED
   - Discord bot: Added missing `interaction_locks` table to prevent duplicate ticket creation
   - Stream bot: Fixed OAuth stats display error (proper query result handling)

2. **Environment Loading Issue (Nov 2025)**
   - Problem: Services crashed with "Missing environment variables" despite .env having all values
   - Root cause: Docker Compose using relative paths, couldn't find .env
   - Solution: Use absolute paths with `--project-directory` and `--env-file` flags

3. **Jarvis AI Model Error**
   - Fixed deprecated `gpt-5` → `gpt-3.5-turbo`

4. **Script Consolidation**
   - Removed 84+ duplicate scripts
   - Single `homelab` script handles all operations

## Technical Stack

- **Dashboard**: Flask, Python, Bootstrap 5, Chart.js, SQLAlchemy, Alembic
- **Bots**: TypeScript, React, Express, Drizzle ORM
- **Infrastructure**: Docker Compose, Caddy, PostgreSQL, Redis, MinIO
- **Frontend**: React, Vite, Tailwind CSS, Radix UI

## Security

- Automatic SSL via Caddy + Let's Encrypt
- Environment-based secrets (never committed)
- Each service has isolated database credentials
- Password-protected VNC and Code Server
- Rate limiting and CSRF protection on dashboard

## Development Workflow

1. Edit code in cloud IDE (Replit)
2. Commit and push to GitHub
3. On Ubuntu server:
   ```bash
   cd /home/evin/contain/HomeLabHub
   git pull origin main
   ./homelab fix
   ```

## Troubleshooting

**Services not starting?**
```bash
./homelab debug     # Shows environment status
./homelab logs      # View error logs
./homelab fix       # Fix and restart
```

**Expected status:** All 15/15 services running

## Future Growth

The architecture is modular - add new services by:
1. Adding to docker-compose.yml
2. Configuring domain in Caddyfile  
3. Running `./homelab fix`