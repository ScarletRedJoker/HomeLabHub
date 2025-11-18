# Nebula Command Dashboard Project

## Overview
This project delivers a comprehensive web-based dashboard for managing a Ubuntu 25.10 server, aiming to provide a unified, user-friendly interface to minimize operational complexity, enhance server reliability, and facilitate intelligent automation and monitoring for complex infrastructure environments. Key capabilities include one-click database deployments, game streaming integration, robust domain health monitoring, and integrations with Google Services and Smart Home platforms. The long-term vision is to evolve into an AI-first infrastructure copilot, "Jarvis," capable of autonomous diagnosis, remediation, and execution of infrastructure issues, serving as a mission control UI for actionable intelligence and safe automation. It emphasizes production-ready source code for streamlined development, testing, and deployment.

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

### Replit Dependency Removal & Optional Integrations (November 18, 2025)

**Issue:**
Stream-bot had hard dependencies on Replit-specific environment variables (X_REPLIT_TOKEN, REPLIT_CONNECTORS_HOSTNAME) that prevented deployment on Ubuntu production servers.

**Root Cause:**
YouTube and Spotify integrations were tightly coupled to Replit's connector infrastructure, causing startup crashes when deployed outside Replit environment.

**Solutions Implemented:**

1. ✅ **YouTube Client Refactor** (services/stream-bot/server/youtube-client.ts):
   - Removed Replit connector dependency
   - Implemented standard OAuth2 using environment variables (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN)
   - Added graceful degradation - returns null when credentials not configured
   - Integration is now **optional**

2. ✅ **Spotify Service Refactor** (services/stream-bot/server/spotify-service.ts):
   - Removed Replit connector dependency
   - Implemented direct Spotify OAuth2 token refresh flow
   - Uses environment variables (SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN)
   - Returns benign defaults ({ isPlaying: false }) when not configured
   - Integration is now **optional**

3. ✅ **Environment Configuration Updates**:
   - Updated `.env.template` with YouTube/Spotify optional variables
   - Updated `docker-compose.unified.yml` to pass all optional integration environment variables
   - All integrations use `${VAR:-}` syntax for safe defaults

4. ✅ **Deployment Guide Updates** (SYSTEMATIC_FIX.md):
   - Documented optional YouTube/Spotify setup procedures
   - Clarified which integrations are required (Twitch) vs optional (YouTube, Spotify, Kick)
   - Added Twitch OAuth redirect URL configuration instructions

**Technical Details:**

```typescript
// YouTube - graceful degradation
async function getYouTubeAuth() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
  
  if (!clientId || !clientSecret || !refreshToken) {
    return null; // Gracefully disable feature
  }
  // ... OAuth2 implementation
}

// Spotify - graceful degradation
async function getAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
  
  if (!clientId || !clientSecret || !refreshToken) {
    return null; // Gracefully disable feature
  }
  // ... Token refresh implementation
}
```

**Files Modified:**
- `services/stream-bot/server/youtube-client.ts` - Replit-free YouTube integration
- `services/stream-bot/server/spotify-service.ts` - Replit-free Spotify integration
- `.env.template` - Added optional YouTube/Spotify variables
- `docker-compose.unified.yml` - Added YouTube/Spotify environment variables
- `SYSTEMATIC_FIX.md` - Updated deployment instructions

**Result:**
- Stream-bot now runs successfully on Ubuntu without Replit infrastructure
- YouTube and Spotify integrations are truly optional
- Only Twitch credentials are required for basic operation
- No startup crashes when optional integrations not configured
- All optional features gracefully disabled with clear log messages

### PostgreSQL Idempotent Migrations (November 18, 2025)

**Issue:**
Dashboard migrations failed with "type serviceconnectionstatus already exists" errors on service restarts.

**Solution:**
✅ Updated `services/dashboard/alembic/versions/005_add_google_integration_models.py` to wrap all CREATE TYPE statements in DO blocks with duplicate_object exception handling.

**Technical Details:**

```python
# Idempotent PostgreSQL enum creation
op.execute("""
    DO $$ BEGIN
        CREATE TYPE serviceconnectionstatus AS ENUM ('connected', 'disconnected', 'error', 'pending');
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$;
""")
```

**Result:**
- Database migrations now safe to run multiple times
- No "already exists" errors on service restarts
- Production-ready migration system

### OpenAI API Parameter Fix (November 18, 2025)

**Issue:**
Stream-bot's AI Snapple facts generation was falling back from gpt-5-mini to gpt-4.1-mini due to incorrect parameter usage.

**Root Cause:**
OpenAI's newer models (gpt-5, gpt-5-mini) require `max_completion_tokens` instead of the deprecated `max_tokens` parameter.

**Solution:**
✅ Updated all OpenAI API calls across stream-bot services to use `max_completion_tokens`:
- `services/stream-bot/server/openai.ts` - Snapple facts generation
- `services/stream-bot/server/games-service.ts` - Magic 8-Ball and Trivia games
- `services/stream-bot/server/analytics-service.ts` - Sentiment analysis
- `services/stream-bot/server/chatbot-service.ts` - AI chatbot responses

**Result:**
- AI Snapple facts generation now works correctly with gpt-5-mini
- All AI-powered features work without fallback errors
- No more "400 Unsupported parameter" errors in logs