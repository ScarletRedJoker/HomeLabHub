# Homelab Dashboard Project

## Overview
This project delivers a comprehensive web-based dashboard for managing a Ubuntu homelab server. Its primary goal is to provide a unified, user-friendly interface to minimize operational overhead, improve server reliability, and enable intelligent automation and monitoring. Key functionalities include one-click database deployments, game streaming integration, robust domain health monitoring, and integrations with Google Services and Smart Home platforms. The project aims for production readiness, with the ambitious vision of an AI-first homelab copilot, Jarvis, capable of autonomous diagnosis, remediation, and execution of homelab issues. This includes zero-touch domain provisioning, autonomous DNS/SSL remediation, and self-healing infrastructure capabilities.

## User Preferences
- User: Evin
- Ubuntu 25.10 desktop homelab with Twingate VPN and dynamic DNS (ZoneEdit)
- Manages domains: rig-city.com, evindrake.net, scarletredjoker.com
- All projects stored in: `/home/evin/contain/` (production) and Replit (development)
- Development workflow: **Edit on Replit → Agent makes changes → Auto-sync to Ubuntu every 5 minutes**
- Services to manage:
  - Discord Ticket Bot (bot.rig-city.com)
  - Stream Bot / SnappleBotAI (stream.rig-city.com)
  - Plex Server (plex.evindrake.net)
  - n8n Automation (n8n.evindrake.net)
  - Static Website (scarletredjoker.com)
  - VNC Desktop (vnc.evindrake.net)
  - Homelab Dashboard (host.evindrake.net)
  - Home Assistant (home.evindrake.net)
- Prefers centralized development environment with clean structure
- Needs public HTTPS access with automatic SSL (port forwarding configured)

## System Architecture

### UI/UX Decisions
The Homelab Dashboard features a cosmic theme with deep space backgrounds, animated starfields, nebula gradients, and glassmorphic UI panels, adhering to WCAG AA Accessibility standards. The Jarvis Voice Chat and mobile UI are fully responsive, incorporating cosmic themes and touch-friendly design. The Stream Bot uses a "candy theme" with gradients, glassmorphism, rounded edges, and glow effects.

### Technical Implementations

**Homelab Dashboard**
- **Stack**: Flask, Python, Bootstrap 5, Chart.js, SQLAlchemy, Alembic, Redis, Celery, MinIO.
- **Core Features**: Docker management, system monitoring, AI assistant (Jarvis, powered by gpt-5), network analytics, domain health checks, one-click database deployments, game streaming integration, intelligent deployment analyzer, secure file upload.
- **Jarvis Autonomous Framework**: 
  - **Tier 1 (DIAGNOSE)**: 8 diagnostic actions monitoring DNS, SSL, services, git sync, deployments.
  - **Tier 2 (REMEDIATE)**: 7 autonomous healing actions for infrastructure failures with auto-execution and safety checks.
  - **Tier 3 (PROACTIVE)**: Scheduled maintenance tasks.
  - **SafeCommandExecutor**: For config file editing with validation, automatic backups, and rollback.
  - **Code Workspace**: For safe autonomous code generation with diff preview and approval workflow.
- **Domain Management System**: Complete end-to-end autonomous domain lifecycle management including database models (DomainRecord, DomainEvent, DomainTask), REST API with 9 production-ready endpoints, Celery workers for async tasks (health checks, SSL monitoring, provisioning), and a full UI for domain management.
- **ZoneEdit DNS Integration**: API wrapper for programmatic DNS management (CRUD operations, propagation verification, public IP detection).
- **Caddy Automation**: Safe configuration management with auto-generation, injection with backup/validation/apply workflow, smart block removal, timestamped backups, automatic rollback, and zero-downtime reloads.
- **SSL Lifecycle Management**: Autonomous certificate monitoring and renewal with alerts and an 8-step renewal workflow.
- **Autonomous Provisioning Workflow**: An 8-step process for detecting public IP, creating DNS records, verifying propagation, generating Caddy configs, reloading Caddy, waiting for SSL, and verifying HTTPS.
- **Import/Export Functionality**: For domains (JSON/CSV).

**Discord Ticket Bot**
- **Stack**: TypeScript, React, Express, Discord.js, Drizzle ORM, PostgreSQL.
- **Purpose**: Support ticket system and multi-platform streamer go-live notifications.

**Stream Bot / SnappleBotAI**
- **Stack**: TypeScript, React, Express, tmi.js, @retconned/kick-js, OpenAI GPT-5, Spotify Web API, Drizzle ORM, PostgreSQL.
- **Purpose**: Multi-tenant SaaS for AI-powered stream bot management across Twitch, YouTube, and Kick.
- **Key Features**: Custom commands, AI auto-moderation, giveaway system, stream statistics, mini-games, channel points, song requests, polls, alerts, AI chatbot personalities, advanced analytics.

**Other Services**:
- **Static Site**: Simple HTML/CSS/JS personal portfolio.
- **n8n**: Workflow automation platform.
- **Plex**: Media streaming server.
- **VNC Desktop**: Custom Dockerized Ubuntu desktop environment.

### System Design Choices
- **Database Architecture**: A single PostgreSQL container managing multiple service-specific databases with robust concurrency protection and constraints.
- **Unified Deployment System**: Orchestrated by `docker-compose.unified.yml` and `homelab-manager.sh` for centralized operations. Caddy reverse proxy for automatic SSL. Automated Replit → Ubuntu sync every 5 minutes.
- **Deployment Automation**: Blue-green deployments, pre-deployment validation, health-based deployment with auto-rollback, comprehensive backup/restore.
- **CI/CD Pipeline**: A 5-stage pipeline (Validate → Test → Build → Deploy → Verify) with multi-environment support and security scanning.
- **Security**: Session-based auth + API key, secure file validation, antivirus scanning, rate limiting, audit logging, CSRF protection, Celery/Redis health monitoring with circuit breaker, command/path whitelisting, multi-tenant isolation, OAuth.
- **Production Readiness**: Emphasizes comprehensive security, performance optimization (connection pooling, optimized Docker images, background jobs), robust error handling (Error Boundaries, retry logic, circuit breakers), high reliability (automatic token refresh, stream detection edge cases), extensive End-to-End and security testing, and centralized monitoring with structured JSON logging.

## External Dependencies

**Dashboard:**
- Flask (and related extensions)
- docker (SDK), psutil, dnspython, paramiko
- openai, tenacity
- SQLAlchemy, Alembic, psycopg2-binary
- Redis, Celery, eventlet
- MinIO (S3-compatible object storage)
- Google APIs: `google-api-python-client`, `google-auth`, `google-auth-httplib2`, `google-auth-oauthlib`
- Bootstrap 5, Chart.js

**Discord Bot:**
- `discord.js`, `express`, `drizzle-orm`, `pg`
- `passport-discord`, `express-rate-limit`, `express-session`
- React, Vite, Radix UI components, Tailwind CSS

**Stream Bot:**
- `tmi.js` (Twitch), `@retconned/kick-js` (Kick)
- `openai` (GPT-5), `express`, `drizzle-orm`, `pg`
- `passport`, `passport-twitch-new`, `passport-google-oauth20` (OAuth)
- `express-rate-limit`, `express-session`
- React, Vite, Radix UI, Tailwind CSS, Recharts
- Spotify Web API, YouTube Data API v3

**Infrastructure:**
- Caddy (reverse proxy)
- PostgreSQL 16 Alpine
- Docker & Docker Compose
- Let's Encrypt