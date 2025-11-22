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

## 🎯 DEPLOYMENT (Current Approach)

### Fresh Installation - One Command

```bash
./bootstrap-homelab.sh
```

This comprehensive, idempotent script:
- ✅ Validates environment (.env file, required variables)
- ✅ Builds all Docker images without cache
- ✅ Starts infrastructure (PostgreSQL, Redis, MinIO)
- ✅ Creates databases & users with proper permissions
- ✅ Runs dashboard migrations (fixes "relation agents does not exist")
- ✅ Starts all 15 services
- ✅ Validates everything actually works (not just runs)

**Time:** 10-15 minutes | **Idempotent:** Safe to run multiple times

### Day-to-Day Management: `./homelab`

```bash
./homelab status    # Show which services are running
./homelab logs      # View logs (saves to logs/ directory)
./homelab restart   # Restart services
./homelab stop      # Stop everything
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

1. **Git Merge Conflict in Dashboard (Nov 22, 2025)** ✅ RESOLVED
   - Problem: Dashboard and Celery worker stuck in restart loop with `SyntaxError: invalid syntax`
   - Root cause: Unresolved git merge conflict markers in `ai_service.py`
   - Solution: Removed merge conflict markers, kept simple `import os`
   - Fix script: `fix-dashboard.sh` pulls fix and rebuilds dashboard

2. **Docker Compose Mount Fix (Nov 22, 2025)** ✅ RESOLVED
   - Problem: After cleanup, services failed with mount error for deleted `docker-compose.unified.yml`
   - Root cause: docker-compose.yml referenced unified.yml in 3 volume mounts
   - Solution: Updated all references to `docker-compose.yml` instead
   - Additional: Dashboard/Celery worker needed `--no-cache` rebuild to fix Config import and password auth
   - Fix script: `fix-ubuntu-services.sh` automates full rebuild process

3. **Code Quality Cleanup (Nov 22, 2025)** ✅ RESOLVED
   - Fixed 6 LSP typing errors in AI service (proper Optional typing, imports)
   - Relaxed Discord bot token validation (was rejecting valid v2 tokens)
   - Removed 40+ duplicate documentation files and legacy scripts
   - Created comprehensive .env.example template for deployments
   - **Security**: Verified .env was never committed to git (secrets safe!)

4. **Database Password Caching Issue (Nov 22, 2025)** ✅ RESOLVED
   - Problem: Running `./homelab fix` caused password authentication failures
   - Root cause: Docker cached image layers with old passwords, `--force-recreate` only recreates containers, doesn't rebuild images
   - Solution: Updated `./homelab fix` to rebuild bots with `--no-cache` before recreating
   - All database passwords now standardized to: `qS4R8Wrl-Spz7-YEmyllIA`

5. **Background Cleanup Task Fixes (Nov 22, 2025)** ✅ RESOLVED
   - Discord bot: Added missing `interaction_locks` table to prevent duplicate ticket creation
   - Stream bot: Fixed OAuth stats display error (proper query result handling)

6. **Environment Loading Issue (Nov 2025)** ✅ RESOLVED
   - Problem: Services crashed with "Missing environment variables" despite .env having all values
   - Root cause: Docker Compose using relative paths, couldn't find .env
   - Solution: Use absolute paths with `--project-directory` and `--env-file` flags

7. **Jarvis AI Model Error** ✅ RESOLVED
   - Fixed deprecated `gpt-5` → `gpt-3.5-turbo`

8. **Script Consolidation** ✅ RESOLVED
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
   ./bootstrap-homelab.sh  # Complete setup
   # OR
   ./homelab restart       # Quick restart (if no DB changes)
   ```

## Troubleshooting

**Services not working properly?**
```bash
./bootstrap-homelab.sh  # Comprehensive fix (idempotent)
./homelab logs          # View error logs
./diagnose-services.sh  # Detailed diagnostics
```

**Expected status:** All 15/15 services running with proper database tables

**See SETUP.md for complete troubleshooting guide**

## Future Growth

The architecture is modular - add new services by:
1. Adding to docker-compose.yml
2. Configuring domain in Caddyfile  
3. Running `./homelab fix`