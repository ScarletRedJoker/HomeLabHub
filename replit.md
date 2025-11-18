# Nebula Command Dashboard Project

## Overview
This project provides a comprehensive web-based dashboard for managing a Ubuntu 25.10 server. Its primary purpose is to simplify server operations, enhance reliability, and enable intelligent automation and monitoring for complex infrastructure environments. Key capabilities include one-click database deployments, game streaming integration, robust domain health monitoring, and integrations with Google Services and Smart Home platforms. The long-term vision is to develop an AI-first infrastructure copilot, "Jarvis," for autonomous diagnosis, remediation, and execution of infrastructure issues, acting as a mission control UI for actionable intelligence and and streamlined automation.

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

### UI/UX Decisions
- **Nebula Command Dashboard**: Features a Nebular cloud theme with interconnected nodes, particle star effects, black hole vortex gradients, and glassmorphic UI panels. It is dark mode only and adheres to WCAG AA Accessibility standards.
- **Stream Bot**: Uses a "candy theme" with gradients, glassmorphism, rounded edges, and glow effects.
- **Discord Bot**: Utilizes React, Radix UI components, and Tailwind CSS.

### Technical Implementations
- **Nebula Command Dashboard**: Built with Flask, Python, Bootstrap 5, Chart.js, SQLAlchemy, Alembic, Redis, Celery, MinIO. It includes Docker management, system monitoring, an AI assistant (Jarvis, powered by gpt-5), network analytics, domain health checks, one-click database deployments, game streaming integration, intelligent deployment analysis, and secure file uploads. It integrates with Google Services (Calendar, Gmail, Drive) and Home Assistant, incorporating robust security measures.
- **Discord Ticket Bot**: Uses TypeScript, React, Express, Discord.js, Drizzle ORM, and PostgreSQL for support tickets and streamer notifications, with focus on security headers and atomic transactions.
- **Stream Bot / SnappleBotAI**: Developed with TypeScript, React, Express, tmi.js, @retconned/kick-js, OpenAI GPT-5, Spotify Web API, Drizzle ORM, and PostgreSQL. It provides multi-tenant SaaS for AI-powered stream bot management across Twitch, YouTube, and Kick, offering custom commands, AI auto-moderation, giveaways, and advanced analytics, emphasizing strong OAuth security and multi-tenant isolation.
- **Other Services**: Includes a Static Website, n8n for workflow automation, Plex for media streaming, and a custom Dockerized VNC Desktop for remote access.

### System Design Choices
- **Database Architecture**: A single PostgreSQL container manages multiple databases (`ticketbot`, `streambot`, `jarvis`), with automatic provisioning and concurrency protection.
- **Unified Deployment System**: Managed by `homelab-manager.sh` and orchestrated by `docker-compose.unified.yml`, utilizing Caddy for automatic SSL. An automated Replit to Ubuntu sync every 5 minutes maintains alignment between development and production. Deployment is handled by `linear-deploy.sh`, which performs validation, provisioning, deployment, and verification.
- **Production Readiness**: Emphasizes comprehensive security audits, environment variable-based secrets, robust OAuth, automatic HTTPS, SQL injection prevention, secure Docker configurations, secure session management, and input validation. Performance is ensured via health check endpoints, database connection pooling, and optimized Docker images. Error handling includes React Error Boundaries, comprehensive logging, user-friendly messages, automatic retry logic with exponential backoff, and circuit breaker patterns.
- **Security Monitoring**: The dashboard includes comprehensive security monitoring features such as VPN-only access configuration, optional rate limiting, SSL certificate monitoring, failed login monitoring (Redis-based), and service health monitoring.

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
## Deployment Fix History

### Code-Server WebSocket Fix (November 18, 2025)

**Issue:**
Code-server WebSocket connections failing with "Error 1006: The workbench failed to connect to the server" preventing VS Code features from working.

**Root Cause:**
Caddyfile was using shorthand WebSocket header placeholders `{>Upgrade}` and `{>Connection}` which weren't properly forwarding the WebSocket upgrade request headers.

**Solution:**
✅ Updated Caddyfile code-server block with improved WebSocket header forwarding:
- Changed from `header_up Upgrade {>Upgrade}` to `header_up Upgrade {http.request.header.Upgrade}`
- Changed from `header_up Connection {>Connection}` to `header_up Connection {http.request.header.Connection}`
- Added `X-Forwarded-For` and `X-Forwarded-Proto` headers for proper proxy behavior
- Removed cache control headers from main `header` block to prevent WebSocket interference
- Kept security headers (X-Content-Type-Options, X-Frame-Options, etc.) without blocking WebSocket upgrade

**Files Modified:**
- `Caddyfile` - code.evindrake.net block (lines 152-200)

**Result:**
- VS Code WebSocket connections now work properly
- Extension host agent can communicate with browser client
- All VS Code features (IntelliSense, debugging, terminal, etc.) functional
- No more "reload required" errors

### Dashboard MarketplaceApp Relationship Error Fix (November 18, 2025)

**Issue:**
Dashboard failing to start with SQLAlchemy error: "Could not determine join condition between parent/child tables on relationship MarketplaceApp.deployments - there are no foreign keys linking these tables."

**Root Cause:**
The `DeployedApp` model's `app_id` field was missing the `ForeignKey` constraint declaration in the Python model, even though the database migration (006) already had the foreign key constraint in the database schema. This mismatch caused SQLAlchemy to fail when initializing the relationship.

**Solution:**
✅ Added missing ForeignKey import and constraint to DeployedApp model:
- Added `ForeignKey` to imports in `services/dashboard/models/marketplace.py`
- Changed `app_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)` 
- To: `app_id: Mapped[int] = mapped_column(Integer, ForeignKey('marketplace_apps.id', ondelete='CASCADE'), nullable=False, index=True)`
- No database migration needed since migration 006 already created the constraint in the database

**Files Modified:**
- `services/dashboard/models/marketplace.py` - Added ForeignKey to DeployedApp.app_id

**Result:**
- Dashboard now starts without SQLAlchemy relationship errors
- MarketplaceApp.deployments relationship properly configured
- Model matches database schema from migration 006
- No "Could not determine join condition" errors

### Stream-Bot GPT Model Switch (November 18, 2025)

**Issue:**
Stream-bot AI Snapple facts generation was using gpt-5-mini as primary model, which was returning empty responses (content length: 0), requiring fallback to gpt-4.1-mini and causing delays.

**Root Cause:**
The gpt-5-mini model has been unreliable, frequently returning empty responses even with valid API calls. The code was configured to try gpt-5-mini first, then fall back to gpt-4.1-mini, wasting time and API credits on failed calls.

**Solution:**
✅ Switched default model to gpt-4.1-mini as primary, with gpt-5-mini as fallback:
- Changed default parameter from `model: string = "gpt-5-mini"` to `model: string = "gpt-4.1-mini"`
- Reordered model priority: try gpt-4.1-mini first (reliable), then gpt-5-mini (future compatibility)
- Added comment documenting the reason for the switch
- Kept fallback logic for robustness

**Files Modified:**
- `services/stream-bot/server/openai.ts` - Changed default model and priority order

**Result:**
- AI Snapple facts generate immediately without empty response delays
- Reduced wasted API calls to unreliable gpt-5-mini model
- Faster response times for /generate-fact endpoint
- Logs no longer show "Empty fact from gpt-5-mini - trying next model" messages
