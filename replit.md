# Homelab Dashboard Project

## Overview
This project delivers a comprehensive, production-ready web-based dashboard for managing Ubuntu homelab servers. Built as an **enterprise-grade platform**, it provides a unified, AI-powered interface that minimizes operational overhead, maximizes reliability, and enables intelligent automated operations. Key capabilities include:

- **Jarvis AI Agent**: GPT-4 powered AI assistant with voice control, automated diagnostics, and guided remediation
- **Zero-Touch Domain Management**: Complete automation from DNS setup to SSL certificate provisioning
- **Multi-Service Orchestration**: 8 production services across 3 domains with automatic SSL
- **Automated Health Monitoring**: 3-tier action system (Diagnose → Remediate with Approval → Proactive) with 20+ actions
- **Enterprise Security**: Session auth, API keys, rate limiting, audit logging, secrets management
- **Production Ready**: Rolling deployments with health checks, automatic backups, comprehensive monitoring

### Recent Major Features (Q4 2024)

✅ **Jarvis Task System** (November 2024)
- Complete autonomous task execution framework
- Database models: JarvisTask, JarvisAction, DomainTask
- 20+ pre-built autonomous actions across 3 tiers
- Approval workflow for destructive operations
- Real-time task status tracking and history
- Voice-controlled task execution

✅ **Domain Management System** (November 2024)
- End-to-end domain lifecycle automation
- ZoneEdit DNS API integration with CRUD operations
- Caddy configuration automation with safe rollback
- SSL certificate monitoring and autonomous renewal
- 8-step automated provisioning workflow
- Import/Export functionality (JSON/CSV)
- Real-time health monitoring with alerts

✅ **Unified Deployment System** (November 2024)
- Single master deployment script (`deploy.sh`)
- Interactive homelab manager CLI
- Automated backup/restore workflows
- Health-based deployment with auto-rollback
- Comprehensive logging and diagnostics

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
- **Stack**: Flask, Python 3.11, Bootstrap 5, Chart.js, SQLAlchemy, Alembic, Redis, Celery, MinIO
- **Core Features**: 
  - Docker container orchestration and management
  - Real-time system monitoring (CPU, memory, disk, network)
  - AI assistant (Jarvis, powered by GPT-4)
  - Network analytics and visualization
  - Domain health monitoring with alerts
  - One-click database deployments
  - Intelligent deployment analyzer
  - Secure file upload with virus scanning
  - Google Services integration (Calendar, Gmail, Drive)
  - Home Assistant smart home integration

**Jarvis Autonomous Framework (2024 Implementation)**
- **Architecture**:
  - **Task System**: Complete CRUD API for autonomous tasks
  - **Action Library**: 20+ pre-built YAML actions across 3 tiers
  - **Safe Executor**: Sandboxed command execution with automatic rollback
  - **Code Workspace**: AI code generation with diff preview and approval
  - **Policy Engine**: Permission-based action execution
  - **Observability**: Complete audit logging and real-time monitoring

- **Tier 1 (DIAGNOSE)** - 8 Diagnostic Actions:
  - DNS propagation verification
  - SSL certificate validation
  - Service health monitoring
  - Git sync status verification
  - Deployment health checks
  - Disk usage analysis
  - Log analysis and error detection
  - Endpoint health verification

- **Tier 2 (REMEDIATE)** - 7 Autonomous Healing Actions:
  - DNS record remediation
  - SSL certificate renewal
  - ddclient configuration fixes
  - Service restart and recovery
  - Git sync recovery
  - Configuration rollback
  - Database optimization

- **Tier 3 (PROACTIVE)** - 5 Maintenance Tasks:
  - Temporary file cleanup
  - Old log rotation
  - Redis cache clearing
  - Database vacuum/reindex
  - System resource optimization

**Domain Management System (Complete Implementation)**
- **Database Models**:
  - `DomainRecord`: Primary domain configuration and status
  - `DomainEvent`: Complete audit trail of all domain operations
  - `DomainTask`: Async task tracking for background operations
  
- **REST API** (9 Production Endpoints):
  - `GET /api/domains` - List all domains with health status
  - `POST /api/domains` - Create new domain with validation
  - `GET /api/domains/:id` - Get domain details
  - `PATCH /api/domains/:id` - Update domain configuration
  - `DELETE /api/domains/:id` - Remove domain
  - `POST /api/domains/:id/provision` - Trigger auto-provisioning
  - `GET /api/domains/:id/health` - Real-time health check
  - `POST /api/domains/:id/renew-ssl` - Force SSL renewal
  - `POST /api/domains/import` - Bulk import (JSON/CSV)

- **Celery Workers** (Background Tasks):
  - Domain health monitoring (every 5 minutes)
  - SSL expiration monitoring (daily)
  - DNS propagation verification
  - Automated provisioning workflows
  - Certificate renewal execution

- **ZoneEdit DNS Integration**:
  - Full CRUD operations via REST API
  - Automatic public IP detection
  - DNS propagation verification (multi-server check)
  - TTL management
  - Bulk record updates

- **Caddy Configuration Automation**:
  - Template-based config generation
  - Safe injection with validation
  - Automatic backup before changes
  - Syntax validation (caddy validate)
  - Zero-downtime reloads
  - Automatic rollback on failure
  - Smart block removal (preserves other configs)

- **SSL Certificate Lifecycle**:
  - Expiration monitoring (checks every 24h)
  - Automatic renewal (30 days before expiry)
  - Multi-step renewal workflow with validation
  - HTTPS verification after renewal
  - Alert system for failures
  - Manual renewal API endpoint

- **Autonomous Provisioning Workflow** (8 Steps):
  1. Detect server public IP
  2. Create DNS A record in ZoneEdit
  3. Verify DNS propagation (multi-server)
  4. Generate Caddy configuration block
  5. Inject config with validation
  6. Reload Caddy server
  7. Wait for SSL certificate acquisition
  8. Verify HTTPS accessibility

- **Import/Export**:
  - JSON export with full domain data
  - CSV export for spreadsheet editing
  - Bulk import with validation
  - Conflict detection and resolution

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
- **Deployment Automation**: Rolling deployments with health checks, pre-deployment validation, backup/restore workflows, manual rollback capability.
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

## Production Readiness

**Implemented Features:**
- Automated backups (database + configs)
- Health-based deployment with manual rollback capability
- Comprehensive error handling and logging
- Graceful degradation for optional services
- Feature flags for API integrations

**Deployment Process:**
- Pre-flight checks (Docker, Docker Compose, environment)
- Automated backup before deployment
- Container rebuild with latest code
- Health verification after deployment
- Manual rollback capability via backup restore

**Monitoring & Reliability:**
- Container health checks (Postgres, Redis, Caddy, MinIO)
- Service status monitoring
- Real-time system metrics (CPU, memory, disk, network)
- Alert system for domain SSL expiration
- Automated log rotation and cleanup

**Optional Features (Require Configuration):**
- Jarvis AI Assistant (requires OPENAI_API_KEY)
- Domain Automation (requires ZoneEdit credentials)
- Google Services (requires OAuth setup)
- Smart Home Integration (requires Home Assistant)
- Stream Bot (requires platform OAuth)

**Current Limitations:**
- Docker management requires Docker daemon (not available in Replit)
- Some features require external API keys or services
- Deployments have brief downtime during container restart (~10-30 seconds)
- Rollback is manual, not automatic (operator must trigger via ./deploy.sh restore)

**Jarvis AI Capabilities (When Configured):**

**Implemented:**
- AI-powered chat assistance
- Log analysis and troubleshooting
- Code generation with review workflow
- Task management system with approval workflow
- Complexity analysis and intelligent delegation
- Automated diagnostics (20+ diagnostic actions)

**Requires Manual Approval:**
- Code changes (review and approve required)
- Destructive operations (approval workflow)
- Domain provisioning (can be automated if configured)
- Container restarts and service changes

**Future Enhancements:**
- Fully autonomous code deployment
- Automatic remediation without approval for safe operations
- Predictive maintenance and capacity planning