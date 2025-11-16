# Homelab Dashboard Project

## Overview
This project delivers a comprehensive, production-ready web-based dashboard for managing Ubuntu homelab servers. It functions as an enterprise-grade platform, providing a unified, AI-powered interface for minimizing operational overhead, maximizing reliability, and enabling intelligent automated operations. Key capabilities include:

- **Jarvis AI Agent**: GPT-4 powered AI assistant with voice control, automated diagnostics, and guided remediation.
- **Zero-Touch Domain Management**: Complete automation from DNS setup to SSL certificate provisioning.
- **Multi-Service Orchestration**: Manages 8 production services across 3 domains with automatic SSL.
- **Automated Health Monitoring**: 3-tier action system (Diagnose → Remediate with Approval → Proactive) with 20+ actions.
- **Enterprise Security**: Session authentication, API keys, rate limiting, audit logging, and secrets management.
- **Production Ready**: Rolling deployments with health checks, automatic backups, and comprehensive monitoring.
- **Jarvis Control Center**: Unified intelligence hub with real-time stats, quick actions, and an activity feed.
- **Container Marketplace**: 20 curated apps with one-click deployment and auto-provisioning.
- **Agent Collaboration Mesh**: Real-time agent-to-agent communication.
- **Jarvis Voice Commands**: NLP-powered natural language control for DNS, NAS, and Marketplace.

## User Preferences
- User: Evin
- Ubuntu 25.10 desktop homelab with Twingate VPN and dynamic DNS (ZoneEdit)
- Manages domains: rig-city.com, evindrake.net, scarletredjoker.com
- All projects stored in: `/home/evin/contain/` (production) and Replit (development)
- Development workflow: Edit on Replit → Agent makes changes → Auto-sync to Ubuntu every 5 minutes
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

**Homelab Dashboard Core**
- **Stack**: Flask, Python 3.11, Bootstrap 5, Chart.js, SQLAlchemy, Alembic, Redis, Celery, MinIO.
- **Core Features**: Docker orchestration, real-time system monitoring, AI assistant (Jarvis), network analytics, domain health monitoring, one-click database deployments, intelligent deployment analyzer, secure file upload, Google Services integration, Home Assistant integration.

**Jarvis Autonomous Framework**
- **Architecture**: Task System with CRUD API, Action Library (20+ pre-built YAML actions), Safe Executor with automatic rollback, AI Code Workspace with diff preview, Policy Engine for permissions, and comprehensive audit logging.
- **Action Tiers**:
    - **Tier 1 (DIAGNOSE)**: 8 diagnostic actions including DNS propagation, SSL validation, service health, Git sync status, deployment health, disk usage, log analysis, and endpoint verification.
    - **Tier 2 (REMEDIATE)**: 7 autonomous healing actions including DNS record remediation, SSL renewal, ddclient fixes, service restart, Git sync recovery, configuration rollback, and database optimization.
    - **Tier 3 (PROACTIVE)**: 5 maintenance tasks including temporary file cleanup, log rotation, Redis cache clearing, database vacuum/reindex, and system resource optimization.

**Container Marketplace ("Jarvis App Store")**
- **Features**: Database models for ContainerTemplate and DeployedContainer, Marketplace Service for deployment and search, Smart Deployment Workflow (dependency check, auto-deploy, port conflict detection, compose generation, Caddy config, health check), REST API, App Store-style frontend, and a curated catalog of 20 production apps.

**Agent Collaboration System ("Multi-Agent Intelligence Mesh")**
- **Features**: Database models for AgentMessage, WebSocket-enabled REST API for real-time messaging, a live feed frontend with avatars, and support for message types like task_delegation and status_update.

**Jarvis Voice Commands**
- **Features**: NLP parsing for domain, IP, DNS, app names, and mount commands. AI service enhancements to handle DNS, NAS, and Marketplace commands with intelligent routing and graceful fallbacks.

**Jarvis Control Center**
- **Features**: Hero Dashboard with real-time stats, Quick Actions Grid, Live Activity Feed, Featured Apps section, System Status indicators, and auto-refresh.

**Domain Management System**
- **Features**: Database models for `DomainRecord`, `DomainEvent`, `DomainTask`. 9 production REST API endpoints for domain CRUD, provisioning, health checks, SSL renewal, and import/export. Celery workers for background tasks like health monitoring and SSL expiration. ZoneEdit DNS integration for full CRUD operations. Caddy configuration automation with safe injection, validation, and auto-rollback. Full SSL certificate lifecycle management. 8-step autonomous provisioning workflow.

**Discord Ticket Bot**
- **Purpose**: Support ticket system and multi-platform streamer go-live notifications.

**Stream Bot / SnappleBotAI**
- **Purpose**: Multi-tenant SaaS for AI-powered stream bot management across Twitch, YouTube, and Kick.
- **Key Features**: Custom commands, AI auto-moderation, giveaway system, stream statistics, mini-games, channel points, song requests, polls, alerts, AI chatbot personalities, advanced analytics.

**Other Services**: Static Site, n8n (workflow automation), Plex (media streaming), VNC Desktop (Dockerized Ubuntu).

### System Design Choices
- **Database Architecture**: Single PostgreSQL container managing multiple service-specific databases.
- **Unified Deployment System**: Orchestrated by `docker-compose.unified.yml` and `homelab-manager.sh` with Caddy for automatic SSL, and automated Replit → Ubuntu sync.
- **Deployment Automation**: Rolling deployments with health checks, pre-deployment validation, backup/restore, and manual rollback.
- **CI/CD Pipeline**: 5-stage pipeline (Validate → Test → Build → Deploy → Verify) with multi-environment support and security scanning.
- **Security**: Session-based auth + API key, secure file validation, antivirus, rate limiting, audit logging, CSRF protection, Celery/Redis health monitoring with circuit breaker, command/path whitelisting, multi-tenant isolation, OAuth.
- **Production Readiness**: Emphasizes comprehensive security, performance optimization, robust error handling, high reliability, extensive End-to-End and security testing, and centralized monitoring with structured JSON logging.

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