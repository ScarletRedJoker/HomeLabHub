# Homelab Dashboard - Technical Architecture

## System Overview

**Tech Stack:**
- **Backend**: Flask (Python 3.11), SQLAlchemy, Alembic migrations
- **Database**: PostgreSQL 16 (unified container for all services)
- **Cache/Queue**: Redis + Celery for background tasks
- **Storage**: MinIO (S3-compatible object storage)
- **Reverse Proxy**: Caddy (automatic SSL with Let's Encrypt)
- **AI**: OpenAI GPT-4 (Jarvis assistant)

## Architecture Patterns

### Service Layer Architecture
```
services/dashboard/
├─ services/          # Business logic (all core functionality)
│  ├─ ai_service.py
│  ├─ auth_service.py
│  ├─ db_service.py
│  ├─ dns_service.py    (NEW - Phase 1)
│  └─ nas_service.py    (NEW - Phase 3)
├─ routes/           # HTTP endpoints (thin controllers)
│  ├─ web.py         # Web UI routes
│  ├─ api.py         # REST API
│  └─ setup_api.py   # Setup/configuration API
├─ models/           # SQLAlchemy database models
└─ utils/            # Generic helpers only
```

### Database Architecture
Single PostgreSQL instance with multiple databases:
- `jarvis_db` - Dashboard, tasks, domain records
- `discord_db` - Discord bot data
- `streambot_db` - Stream bot multi-tenant data

**Benefits:**
- Centralized backups
- Unified connection pooling
- Simplified deployment

### Security Model
- **Session Auth**: Flask sessions with `session['authenticated']`
- **API Keys**: Bearer token authentication for API endpoints
- **CSRF Protection**: All POST/PUT/DELETE require CSRF token
- **Rate Limiting**: Per-endpoint rate limits via Flask-Limiter
- **Secrets Management**: Environment variables, never committed

### Deployment Model
- **Development**: Replit (edit here, auto-sync every 5 min)
- **Production**: Ubuntu 25.10 homelab at `/home/evin/contain/`
- **Orchestration**: `docker-compose.unified.yml` with Caddy reverse proxy
- **Domains**: 3 domains (rig-city.com, evindrake.net, scarletredjoker.com)

## Key Services

### Jarvis AI System
- **Engine**: GPT-4 powered conversational AI
- **Capabilities**: Log analysis, code generation, task automation
- **Task System**: 20+ autonomous actions (diagnose, remediate, proactive)
- **Approval Workflow**: Destructive operations require user confirmation

### Domain Management
- **DNS Provider**: ZoneEdit (will be replaced with PowerDNS in Phase 1)
- **SSL**: Automatic via Caddy + Let's Encrypt
- **Monitoring**: Health checks every 5 minutes
- **Automation**: Full provisioning workflow (DNS → Caddy → SSL)

### Container Orchestration
- **Engine**: Docker + Docker Compose
- **Management**: Dashboard UI for start/stop/logs/stats
- **Health Monitoring**: Automatic health checks + restart policies

## External Integrations

### Configured (Available)
- Discord API (bot management)
- OpenAI API (Jarvis)
- Google Services (Calendar, Gmail, Drive)
- Home Assistant (smart home)
- Spotify API (stream bot)
- Twitch/YouTube/Kick APIs (stream bot)

### Planned (Phase 1-3)
- PowerDNS (local nameserver)
- NAS Integration (Synology/QNAP/TrueNAS)
- Docker Hub API (container marketplace)

## Performance Optimizations
- **Caching**: Redis for session storage, expensive operations
- **Connection Pooling**: PostgreSQL connection pool (10 connections)
- **Background Jobs**: Celery for async tasks (backups, monitoring)
- **Query Optimization**: Eager loading, batch operations

## Monitoring & Observability
- **Logging**: Structured JSON logs (dashboard, werkzeug, celery)
- **Metrics**: System stats (CPU, memory, disk, network)
- **Alerts**: Domain SSL expiration, service health failures
- **Audit Trail**: All user actions logged to database

## Disaster Recovery
- **Backups**: Daily automated backups (PostgreSQL dumps, configs)
- **Restore**: `./deploy.sh restore` for one-click recovery
- **Rollback**: Manual rollback to previous deployment
- **Checkpoints**: Replit automatic checkpoints (code + database)

## Future Architecture (120% Features)

### Phase 1: Local DNS (PowerDNS)
```
[Internet] → [Router with DynDNS] → [PowerDNS Container]
                                      ↓
                              [Dashboard manages records]
```

### Phase 3: NAS Integration
```
[NAS (192.168.1.100)] ←→ [Dashboard]
   - Auto-mount shares         ↓
   - Monitor health      [Plex Container]
   - Backup jobs         [Jellyfin Container]
   - DynDNS updates      [Other Services]
```

### Phase 2: Container Marketplace
```
[Dashboard UI] → [Template Library]
                      ↓
              [One-Click Deploy]
                      ↓
         [NAS + DynDNS Auto-Config]
```

## Development Workflow
1. **Edit on Replit** (this environment)
2. **Agent makes changes** (me!)
3. **Auto-sync to Ubuntu** (every 5 minutes via deployment/sync-from-replit.sh)
4. **Deploy on Ubuntu** (`./deploy.sh` in production)

## Tech Debt & Cleanup (In Progress)
- ✅ Consolidate 33+ status docs → organized structure
- ⏳ Move utils/auth.py → services/auth_service.py
- ⏳ Unify jarvis/autonomous_engine.py with ai_service.py
- ⏳ Remove duplicate code in routes/

---

Last Updated: November 16, 2024
