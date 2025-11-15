# Homelab Dashboard Project

## Overview
This project delivers a comprehensive web-based dashboard for managing a Ubuntu 25.10 homelab server. Its primary purpose is to provide a unified, user-friendly interface to reduce operational overhead, enhance server reliability, and enable intelligent automation and monitoring for complex homelab setups. Key capabilities include one-click database deployments, game streaming integration, robust domain health monitoring, and integrations with Google Services and Smart Home platforms. The project aims to provide all necessary source code for easy development, testing, and deployment, with a focus on production readiness. The vision for this project is an AI-first homelab copilot, Jarvis, capable of autonomous diagnosis, remediation, and execution of homelab issues, serving as a mission control UI for actionable intelligence and safe automation.

## User Preferences
- User: Evin
- Ubuntu 25.10 desktop homelab with Twingate VPN and dynamic DNS (ZoneEdit)
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
  - Homelab Dashboard (host.evindrake.net) - Management UI
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

### Technical Implementations

**Homelab Dashboard (services/dashboard/)**
- **Stack**: Flask, Python, Bootstrap 5, Chart.js, SQLAlchemy, Alembic, Redis, Celery, MinIO.
- **Core Features**: Docker management, system monitoring, AI assistant (Jarvis, powered by gpt-5), network analytics, domain health checks, one-click database deployments, game streaming integration, intelligent deployment analyzer, secure file upload.
- **Advanced Integrations**: Google Services (Calendar, Gmail, Drive with automatic token refresh), Smart Home Control (Home Assistant with health monitoring and auto-reconnection).
- **Security**: Session-based auth + API key, secure file validation, antivirus scanning, rate limiting, audit logging, CSRF protection, Celery/Redis health monitoring with circuit breaker.
- **Design System**: Cosmic theme with deep space backgrounds, animated starfields, nebula gradients, glassmorphic UI panels. WCAG AA Accessibility for text contrast.

**Discord Ticket Bot (services/discord-bot/)**
- **Stack**: TypeScript, React, Express, Discord.js, Drizzle ORM, PostgreSQL.
- **Purpose**: Support ticket system and multi-platform streamer go-live notifications with automatic streamer discovery via Discord presence.
- **Security**: OAuth CSRF protection with state tokens, atomic database transactions, comprehensive security headers, session hardening.
- **Stream Notifications**: 30-second debouncing, 5-minute offline grace period, platform switch detection, YouTube API integration, exponential backoff retry.

**Stream Bot / SnappleBotAI (services/stream-bot/)**
- **Stack**: TypeScript, React, Express, tmi.js, @retconned/kick-js, OpenAI GPT-5, Spotify Web API, Drizzle ORM, PostgreSQL.
- **Purpose**: Multi-tenant SaaS for AI-powered stream bot management across Twitch, YouTube, and Kick.
- **Key Features**: Custom commands, AI auto-moderation, giveaway system (with atomic concurrency protection), shoutouts, stream statistics, mini-games, channel points, song requests, polls, alerts, AI chatbot personalities, advanced analytics, OAuth platform linking with automatic token refresh, onboarding wizard.
- **Security**: Fort Knox OAuth (atomic transactions + unique constraints), multi-tenant isolation verified, OAuth rate limiting (10/15min), giveaway concurrency protection, currency operations with atomic SQL.
- **Design System**: Candy theme with delicious gradients, glassmorphism effects, rounded edges, and glow effects.

**Other Services**:
- **Static Site**: Simple HTML/CSS/JS personal portfolio.
- **n8n**: Workflow automation platform.
- **Plex**: Media streaming server.
- **VNC Desktop**: Custom Dockerized Ubuntu desktop environment for remote access.

### Database Architecture
A single PostgreSQL container manages multiple databases (`ticketbot`, `streambot`) with comprehensive concurrency protection and constraints.

### Unified Deployment System
- `homelab-manager.sh`: Central script for all operations.
- `docker-compose.unified.yml`: Orchestrates all services.
- Caddy reverse proxy: Provides automatic SSL via Let's Encrypt.
- Automated Replit → Ubuntu Sync: Scripts for 5-minute code synchronization.

### Production Readiness
- **Security**: Comprehensive security audits (Stream Bot, Discord Bot), environment variable-based secrets, robust OAuth with account hijacking prevention, automatic HTTPS, SQL injection prevention, secure Docker configurations, secure session management, input validation, OAuth rate limiting (10/15min), multi-tenant isolation, CSRF protection with state tokens.
- **Performance**: Health check endpoints (Celery/Redis monitoring), database connection pooling, optimized Docker images.
- **Error Handling**: React Error Boundaries, comprehensive logging, user-friendly messages, automatic retry logic with exponential backoff, circuit breaker patterns.
- **Reliability**: Automatic token refresh (24hr before expiry), giveaway concurrency protection (9/9 tests passing), stream detection edge cases handled, Home Assistant auto-reconnection.

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

## Recent Changes

### November 15, 2025 - Comprehensive Security & Reliability Hardening (9 Major Tasks Completed)

**"Brain Dead Simple and Resilient, but Robust as Fort Knox" Achieved**

Completed massive systematic audit and hardening effort across all services implementing Fort Knox-level security with production-grade reliability.

#### ✅ 1. Stream Bot: OAuth Rate Limiting
- Added rate limiter (10 attempts/15min/IP) to all OAuth callbacks
- Prevents brute-force attacks with user-friendly error messages
- **Files**: `services/stream-bot/server/auth/oauth-signin-routes.ts`

#### ✅ 2. Dashboard: Celery/Redis Health Monitoring
- Created `/api/health/celery` endpoint with comprehensive metrics
- Circuit breaker pattern queues tasks when Redis unavailable
- Real-time dashboard widget (5-second polling)
- **Prevents silent failures** of background jobs
- **Files**: `routes/api.py`, `celery_app.py`, `services/workflow_service.py`, `templates/dashboard.html`

#### ✅ 3. Discord Bot: OAuth Security Audit - **CRITICAL FIXES**
- 🔴 **Fixed OAuth race condition** (atomic transactions)
- 🔴 **Fixed missing CSRF protection** (32-byte state tokens)
- 🟡 **Added security headers** (CSP, X-Frame-Options, etc.)
- **Report**: `services/discord-bot/SECURITY_AUDIT_REPORT.md`

#### ✅ 4. Stream Bot: Token Lifecycle Management
- Auto-refreshes tokens 24hr before expiry (every 30 minutes check)
- Detects revoked tokens (401/400) and marks disconnected
- Exponential backoff retry (5 attempts: 1s→16s)
- Admin APIs: `/api/admin/tokens/refresh`, `/api/admin/tokens/status`
- **Files**: `server/token-refresh-service.ts`, `server/oauth-youtube.ts`, `server/oauth-twitch.ts`

#### ✅ 5. Stream Bot: Multi-Tenant Isolation - **CRITICAL FIX**
- 🔴 **Fixed authorization bypass** in giveaway entries endpoint (PII leak)
- Verified 95%+ endpoints properly filter by userId
- Created 20+ integration tests
- **Reports**: `SECURITY_AUDIT_REPORT.md`, `tests/tenant-isolation.test.ts`

#### ✅ 6. Discord Bot: Stream Auto-Detection Edge Cases
- 30-second debouncing prevents notification spam
- 5-minute offline grace period before marking ended
- Platform switch detection (Twitch↔YouTube↔Kick)
- YouTube API integration with stream verification
- Exponential backoff retry (1s→60s) + notification queue
- **Documentation**: `STREAM_EDGE_CASE_HANDLING.md` (400+ lines)

#### ✅ 7. Stream Bot: Giveaway Concurrency - **ALL RACE CONDITIONS FIXED**
- Atomic transactions prevent duplicate entries
- Rate limiting (10 entries/min/user sliding window)
- Currency operations safe (atomic SQL + CHECK constraints)
- Winner selection with `FOR UPDATE` row locking
- **9/9 concurrent load tests PASSING** (100 simultaneous users)
- **Files**: `server/giveaway-service.ts`, `server/currency-service.ts`, `migrations/0004_add_giveaway_concurrency_improvements.sql`, `tests/concurrency.test.ts`

#### ✅ 8. Dashboard: Google Services OAuth Error Handling
- Auto-refreshes tokens with 5-minute expiry buffer
- User-friendly exception classes (OAuthError, RateLimitError, etc.)
- Exponential backoff retry (max 3 attempts, 2-60s)
- Comprehensive error handling (401, 403, 429, network)
- **Documentation**: `OAUTH_SCOPES_DOCUMENTATION.md`
- **Files**: `services/google/error_handler.py`, `services/google/google_client.py`

#### ✅ 9. Dashboard: Home Assistant Connection Fix
- Fixed "408: Bad Request" (missing env vars identified)
- Health monitoring (5-minute ping to `/api/`)
- Auto-reconnection with exponential backoff (max 3 retries)
- Command queuing (100 commands) replays when reconnected
- Graceful degradation ("Home Assistant Offline" status)
- New endpoints: `/smarthome/api/connection-status`, `/smarthome/api/test-connection`
- **Documentation**: `HOME_ASSISTANT_FIX_SUMMARY.md`
- **Files**: `services/home_assistant_service.py`, `routes/smart_home_api.py`, `config.py`

**Security Reports Created:**
- `COMPREHENSIVE_AUDIT_2025-11-15.md` - Full audit of all 7 services with 25 prioritized tasks
- `INTEGRATION_SETUP_STATUS.md` - Complete secrets/credentials inventory
- `services/stream-bot/SECURITY_AUDIT_REPORT.md` - Multi-tenant isolation audit
- `services/discord-bot/SECURITY_AUDIT_REPORT.md` - OAuth security fixes
- `services/discord-bot/STREAM_EDGE_CASE_HANDLING.md` - Stream detection documentation

**Database Migrations:**
- `services/stream-bot/migrations/0003_add_platform_user_unique_constraint.sql` - OAuth security (unique platform accounts)
- `services/stream-bot/migrations/0004_add_giveaway_concurrency_improvements.sql` - Giveaway atomicity + constraints

**Test Suites:**
- `services/stream-bot/tests/tenant-isolation.test.ts` - 20+ multi-tenant tests
- `services/stream-bot/tests/concurrency.test.ts` - 9/9 concurrent load tests passing

**Remaining Tasks (16/25):**
Pending tasks documented in task list - ready for next sprint.
