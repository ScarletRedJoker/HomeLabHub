# Nebula Command Dashboard Project

## Overview
This project delivers a comprehensive web-based dashboard for managing a Ubuntu 25.10 server, aiming to provide a unified, user-friendly interface to minimize operational complexity, enhance server reliability, and facilitate intelligent automation and monitoring for complex infrastructure environments. Key capabilities include one-click database deployments, game streaming integration, robust domain health monitoring, and integrations with Google Services and Smart Home platforms. The project's long-term vision is to evolve into an AI-first infrastructure copilot, "Jarvis," capable of autonomous diagnosis, remediation, and execution of infrastructure issues, serving as a mission control UI for actionable intelligence and safe automation. It emphasizes production-ready source code for streamlined development, testing, and deployment.

## User Preferences
- User: Evin
- Ubuntu 25.10 desktop with Twingate VPN and dynamic DNS (ZoneEdit)
- Manages domains: rig-city.com, evindrake.net, scarletredjoker.com
- All projects stored in: `/home/evin/contain/` (production) and Replit (development)
- Development workflow: **Edit on Replit → Agent makes changes → Auto-sync to Ubuntu every 5 minutes**
- Services to manage:
  - Discord Ticket Bot (bot.rig-city.com) - Custom support bot with PostgreSQL
  - Stream Bot / SnappleBotAI (stream.rig-city.com) - AI Snapple facts for Twitch/Kick
  - Plex Server (plex.evindrake.net) - Media streaming
  - n8n Automation (n8n.evindrake.net) - Workflow automation
  - Static Website (scarletredjoker.com) - Personal website
  - VNC Desktop (vnc.evindrake.net) - Remote desktop access
  - Nebula Command Dashboard (host.evindrake.net) - Management UI
  - **Home Assistant (home.evindrake.net) - Smart home automation hub with Google Home integration**
- Prefers centralized development environment with clean structure
- Needs public HTTPS access with automatic SSL (port forwarding configured)

## System Architecture

### Directory Structure
```
HomeLabHub/
├── services/
│   ├── dashboard/
│   ├── discord-bot/
│   ├── stream-bot/
│   ├── static-site/
│   ├── vnc-desktop/
│   ├── n8n/
│   └── plex/
├── deployment/
├── docs/
├── config/
├── docker-compose.unified.yml
├── Caddyfile
└── DEPLOYMENT_GUIDE.md
```

### UI/UX Decisions
- **Nebula Command Dashboard**: Nebular cloud theme with interconnected nodes, particle star effects, black hole vortex gradients, and glassmorphic UI panels. Dark mode only, WCAG AA Accessibility.
- **Stream Bot**: Candy theme with delicious gradients, glassmorphism effects, rounded edges, and glow effects.
- **Discord Bot**: Utilizes React, Radix UI components, and Tailwind CSS.

### Technical Implementations
- **Nebula Command Dashboard**: Built with Flask, Python, Bootstrap 5, Chart.js, SQLAlchemy, Alembic, Redis, Celery, MinIO. Features Docker management, system monitoring, AI assistant (Jarvis, powered by gpt-5), network analytics, domain health checks, one-click database deployments, game streaming integration, intelligent deployment analyzer, secure file upload. Integrates with Google Services (Calendar, Gmail, Drive) and Home Assistant. Incorporates security measures like session-based auth, API key, secure file validation, antivirus scanning, rate limiting, audit logging, CSRF protection, and Celery/Redis health monitoring with a circuit breaker.
- **Discord Ticket Bot**: Uses TypeScript, React, Express, Discord.js, Drizzle ORM, PostgreSQL for support tickets and streamer go-live notifications. Features OAuth CSRF protection, atomic database transactions, and security headers.
- **Stream Bot / SnappleBotAI**: Developed with TypeScript, React, Express, tmi.js, @retconned/kick-js, OpenAI GPT-5, Spotify Web API, Drizzle ORM, PostgreSQL. Provides multi-tenant SaaS for AI-powered stream bot management across Twitch, YouTube, and Kick, including custom commands, AI auto-moderation, giveaway system, shoutouts, stream statistics, mini-games, and advanced analytics. Emphasizes "Fort Knox" OAuth security, multi-tenant isolation, and atomic currency operations.
- **Other Services**: Includes a simple Static Website, n8n for workflow automation, Plex for media streaming, and a custom Dockerized VNC Desktop for remote access.

### System Design Choices
- **Database Architecture**: A single PostgreSQL container manages multiple databases (`ticketbot`, `streambot`, `jarvis`), with automatic provisioning on first startup and comprehensive concurrency protection.
- **Unified Deployment System**: Managed by `homelab-manager.sh` script, orchestrated by `docker-compose.unified.yml`, and utilizes Caddy for automatic SSL via Let's Encrypt. Automated Replit to Ubuntu sync every 5 minutes ensures development and production environments are aligned. Deployment is handled by `linear-deploy.sh`, which validates, provisions, deploys, and verifies.
- **Production Readiness**: Emphasizes comprehensive security audits, environment variable-based secrets, robust OAuth, automatic HTTPS, SQL injection prevention, secure Docker configurations, secure session management, and input validation. Performance is addressed through health check endpoints, database connection pooling, and optimized Docker images. Error handling includes React Error Boundaries, comprehensive logging, user-friendly messages, automatic retry logic with exponential backoff, and circuit breaker patterns. Reliability features include automatic token refresh, giveaway concurrency protection, stream detection edge case handling, and Home Assistant auto-reconnection.
- **Security Monitoring**: Implemented comprehensive security monitoring in the dashboard including VPN-only access configuration (for specific services), optional rate limiting configuration, SSL certificate monitoring, failed login monitoring (Redis-based), and service health monitoring.

## Recent Changes

### Deployment Issues Fixed (November 18, 2025)

**Critical Issues Identified:**
1. **Stream-Bot Migration Failures:** drizzle-kit v0.18.1 incompatible with `push:pg` command syntax
2. **Code-Server Permission Errors:** codercom image incompatible with PUID/PGID directives
3. **Caddyfile Formatting:** Inconsistent indentation (spaces vs tabs)
4. **Home Assistant Config:** Configuration files existed but not properly mounted
5. **Missing bot_instances Table:** Table defined but not created due to migration failures

**Solutions Implemented:**
1. ✅ **Stream-Bot:** Upgraded drizzle-kit from v0.18.1 to v0.31.0 and **moved to production dependencies**
2. ✅ **Stream-Bot:** Updated migration command to `push` (correct syntax for drizzle-kit v0.31.0)
3. ✅ **Code-Server:** Switched to linuxserver/code-server image for proper PUID/PGID support
4. ✅ **Code-Server:** Updated health check and Caddy reverse proxy to use HTTPS port 8443
5. ✅ **Code-Server:** Fixed volume mount path from `/home/coder/projects` to `/config/workspace`
6. ✅ **Caddyfile:** Fixed indentation to use tabs consistently
7. ✅ **Home Assistant:** Kept named volume for data safety, added template mount for migration
8. ✅ **Home Assistant:** Added Docker subnet (172.18.0.0/16) to trusted_proxies configuration
9. ✅ **bot_instances Table:** Will be created automatically once stream-bot migrations run successfully

**Technical Details:**

```bash
# Stream-Bot Migration Command (docker-entrypoint.sh)
# drizzle-kit v0.31.0 moved to production dependencies
npx drizzle-kit push --config=drizzle.config.ts
```

```yaml
# Code-Server: LinuxServer image with HTTPS on port 8443
code-server:
  image: lscr.io/linuxserver/code-server:latest
  environment:
    - PUID=1000  # Now properly respected
    - PGID=1000
  volumes:
    - code_server_data:/config
  healthcheck:
    test: ["CMD", "curl", "-f", "-k", "https://localhost:8443/healthz"]
```

```caddyfile
# Caddy reverse proxy for code-server
code.evindrake.net {
    reverse_proxy https://code-server:8443 {
        transport http {
            tls_insecure_skip_verify
        }
    }
}
```

```yaml
# Home Assistant: Safe volume configuration with migration templates + Bluetooth support
homeassistant:
  volumes:
    - homeassistant_config:/config  # Named volume (no data loss)
    - ./config/homeassistant:/config-templates:ro  # Migration templates
  devices:
    - /dev/bus/usb:/dev/bus/usb  # USB Bluetooth adapters
  cap_add:
    - NET_ADMIN  # Required for Bluetooth networking
    - NET_RAW    # Required for Bluetooth Low Energy (BLE)
    - SYS_ADMIN  # Required for advanced Bluetooth features
```

**Files Modified:**
- `services/stream-bot/package.json` - Updated drizzle-kit to v0.31.0
- `services/stream-bot/package-lock.json` - Updated via npm install
- `services/stream-bot/docker-entrypoint.sh` - Added fallback migration command
- `docker-compose.unified.yml` - Updated code-server and homeassistant services
- `Caddyfile` - Fixed indentation, updated code-server reverse proxy
- `config/homeassistant/MIGRATION_GUIDE.md` - Created comprehensive migration guide

**Deployment Instructions:**
```bash
# Redeploy affected services
docker-compose -f docker-compose.unified.yml up -d caddy code-server stream-bot homeassistant

# Verify health checks
docker ps --filter "name=code-server|stream-bot|homeassistant" --format "table {{.Names}}\t{{.Status}}"

# Check logs
docker logs stream-bot --tail 50  # Verify migrations run successfully
docker logs code-server --tail 20  # Verify startup
```

## External Dependencies

**Dashboard:**
- Flask, Flask-CORS, Flask-SocketIO, Flask-Session, Flask-WTF, Flask-Limiter, docker (SDK), psutil, dnspython, paramiko, openai, tenacity
- SQLAlchemy, Alembic, psycopg2-binary
- Redis, Celery, eventlet
- MinIO (S3-compatible object storage)
- Google APIs: `google-api-python-client`, `google-auth`, `google-auth-httplib2`, `google-auth-oauthlib`
- Bootstrap 5, Chart.js

**Discord Bot:**
- `discord.js`, `express`, `drizzle-orm`, `pg`, `passport-discord`
- `express-rate-limit`, `express-session`
- React, Vite, Radix UI components, Tailwind CSS

**Stream Bot:**
- `tmi.js` (Twitch), `@retconned/kick-js` (Kick), `openai` (GPT-5), `express`, `drizzle-orm`, `pg`
- `passport`, `passport-twitch-new`, `passport-google-oauth20` (OAuth)
- `express-rate-limit`, `express-session`
- React, Vite, Radix UI, Tailwind CSS, Recharts
- Spotify Web API, YouTube Data API v3

**Infrastructure:**
- Caddy (reverse proxy)
- PostgreSQL 16 Alpine
- Docker & Docker Compose
- Let's Encrypt