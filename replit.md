# Nebula Command Dashboard Project

## Recent Changes

### November 18, 2025 - Database Password Sync Fix
**Problem:** Running containers using cached old passwords, causing authentication failures after database repair  
**Root Cause:** Container restart doesn't reload `.env` file - requires stop/start to pick up new environment variables

**Solution:** Services just need a proper stop/start cycle instead of restart to reload passwords from `.env`

**Database Architecture (UNCHANGED):**
- ✅ `ticketbot` - PostgreSQL superuser, manages Discord bot database
- ✅ `streambot` - Dedicated user for Stream Bot database (least privilege)
- ✅ `jarvis` - Dedicated user for Dashboard database (least privilege)
- ✅ Each service has its own isolated database and user (proper security model)

## Overview
This project provides a comprehensive web-based dashboard for managing a Ubuntu 25.10 server. Its core purpose is to offer a unified, user-friendly interface to minimize operational complexity, enhance server reliability, and facilitate intelligent automation and monitoring for complex infrastructure environments. Key capabilities include one-click database deployments, game streaming integration, robust domain health monitoring, and integrations with Google Services and Smart Home platforms. The project aims to deliver production-ready source code for streamlined development, testing, and deployment. The long-term vision is to evolve into an AI-first infrastructure copilot, "Jarvis," capable of autonomous diagnosis, remediation, and execution of infrastructure issues, serving as a mission control UI for actionable intelligence and safe automation.

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
- **Nebula Command Dashboard**: Nebular cloud theme with interconnected nodes, particle star effects, black hole vortex gradients, and glassmorphic UI panels. Dark mode only. WCAG AA Accessibility for text contrast.
- **Stream Bot**: Candy theme with delicious gradients, glassmorphism effects, rounded edges, and glow effects.
- **Discord Bot**: Utilizes React, Radix UI components, and Tailwind CSS.

### Technical Implementations
- **Nebula Command Dashboard**: Built with Flask, Python, Bootstrap 5, Chart.js, SQLAlchemy, Alembic, Redis, Celery, MinIO. Features Docker management, system monitoring, AI assistant (Jarvis, powered by gpt-5), network analytics, domain health checks, one-click database deployments, game streaming integration, intelligent deployment analyzer, secure file upload. Integrates with Google Services (Calendar, Gmail, Drive) and Home Assistant for smart home control. Incorporates robust security measures like session-based auth, API key, secure file validation, antivirus scanning, rate limiting, audit logging, CSRF protection, and Celery/Redis health monitoring with a circuit breaker.
- **Discord Ticket Bot**: Uses TypeScript, React, Express, Discord.js, Drizzle ORM, PostgreSQL for a support ticket system and multi-platform streamer go-live notifications. Features OAuth CSRF protection, atomic database transactions, and comprehensive security headers.
- **Stream Bot / SnappleBotAI**: Developed with TypeScript, React, Express, tmi.js, @retconned/kick-js, OpenAI GPT-5, Spotify Web API, Drizzle ORM, PostgreSQL. Provides multi-tenant SaaS for AI-powered stream bot management across Twitch, YouTube, and Kick, including custom commands, AI auto-moderation, giveaway system, shoutouts, stream statistics, mini-games, and advanced analytics. Emphasizes "Fort Knox" OAuth security, multi-tenant isolation, and atomic currency operations.
- **Other Services**: Includes a simple Static Website, n8n for workflow automation, Plex for media streaming, and a custom Dockerized VNC Desktop for remote access.

### System Design Choices
- **Database Architecture**: A single PostgreSQL container manages multiple databases (`ticketbot`, `streambot`) with comprehensive concurrency protection and constraints.
- **Unified Deployment System**: Managed by `homelab-manager.sh` script, orchestrated by `docker-compose.unified.yml`, and utilizes Caddy for automatic SSL via Let's Encrypt. Automated Replit to Ubuntu sync every 5 minutes ensures development and production environments are aligned.
- **Production Readiness**: Emphasizes comprehensive security audits, environment variable-based secrets, robust OAuth, automatic HTTPS, SQL injection prevention, secure Docker configurations, secure session management, and input validation. Performance is addressed through health check endpoints, database connection pooling, and optimized Docker images. Error handling includes React Error Boundaries, comprehensive logging, user-friendly messages, automatic retry logic with exponential backoff, and circuit breaker patterns. Reliability features include automatic token refresh, giveaway concurrency protection, stream detection edge case handling, and Home Assistant auto-reconnection.
- **Security Monitoring**: Implemented comprehensive security monitoring in the dashboard including VPN-only access configuration (for specific services), optional rate limiting configuration, SSL certificate monitoring, failed login monitoring (Redis-based), and service health monitoring.

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