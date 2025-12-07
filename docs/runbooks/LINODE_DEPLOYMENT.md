# Linode Deployment Runbook

## Overview

This runbook provides NASA-grade deployment procedures for the Homelab infrastructure running on Linode. It ensures zero-downtime deployments with proper validation, backup, and rollback capabilities.

## Quick Reference

```bash
# Location
cd /opt/homelab/HomeLabHub/deploy/linode

# Validate environment
./scripts/validate-env.sh

# Run pre-flight checks
./scripts/preflight.sh

# Deploy (with all safety checks)
./scripts/deploy.sh

# Dry run (preview without changes)
./scripts/deploy.sh --dry-run

# Rollback
./scripts/rollback.sh
```

## Pre-Deployment Checklist

### 1. Verify Access

```bash
# SSH to Linode
ssh root@your-linode-ip

# Navigate to project
cd /opt/homelab/HomeLabHub

# Pull latest code
git pull
```

### 2. Environment Validation

```bash
cd deploy/linode

# Run validation
./scripts/validate-env.sh
```

This checks for all required environment variables:

| Category | Required Variables |
|----------|-------------------|
| **Core Infrastructure** | `POSTGRES_PASSWORD`, `DISCORD_DB_PASSWORD`, `STREAMBOT_DB_PASSWORD`, `JARVIS_DB_PASSWORD` |
| **Authentication** | `SERVICE_AUTH_TOKEN`, `WEB_USERNAME`, `WEB_PASSWORD` |
| **AI Services** | `OPENAI_API_KEY` |
| **Discord Bot** | `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_APP_ID`, `VITE_DISCORD_CLIENT_ID`, `DISCORD_SESSION_SECRET` |
| **Stream Bot** | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `STREAMBOT_SESSION_SECRET` |
| **Code Server** | `CODE_SERVER_PASSWORD` |
| **Monitoring** | `GRAFANA_ADMIN_PASSWORD` |
| **DNS** | `CLOUDFLARE_API_TOKEN` |

### 3. Pre-Flight Checks

```bash
./scripts/preflight.sh
```

This verifies:
- Docker and Docker Compose v2 installed
- Disk space available
- Network connectivity (Docker Hub, OpenAI, Discord APIs)
- Required files exist
- Docker volumes are intact
- Current container status

## Deployment Procedure

### Standard Deployment

```bash
# Full deployment with all safety checks
./scripts/deploy.sh
```

This automatically:
1. Runs pre-flight checks
2. Creates backups (.env, images list, database dump)
3. Pulls latest images
4. Builds custom images
5. Deploys infrastructure services first (Caddy, Redis, PostgreSQL)
6. Verifies database initialization (creates users/databases if missing)
   - **FAILS** deployment if databases cannot be created
7. Deploys remaining services in dependency order
8. Runs container health verification with retry logic
   - **FAILS** deployment if critical services (postgres, caddy, redis) remain unhealthy
9. Reports status and any issues

**Important:** The deployment script will exit with error code 1 and stop if:
- Critical infrastructure services fail health checks
- Required databases cannot be initialized
- PostgreSQL is not running after infrastructure deployment

### Deployment Order

Services are deployed in tiers to respect dependencies:

```
Tier 1 - Infrastructure
├── caddy (reverse proxy)
├── redis (caching/messaging)
└── homelab-postgres (database)

Tier 2 - Observability
├── homelab-loki
├── homelab-prometheus
├── homelab-grafana
├── homelab-node-exporter
└── homelab-cadvisor

Tier 3 - Core Services
├── homelab-dashboard
└── homelab-celery-worker

Tier 4 - Bots
├── discord-bot
└── stream-bot

Tier 5 - Developer Tools
├── n8n
├── code-server
└── code-server-proxy

Tier 6 - Static Sites
├── scarletredjoker-web
└── rig-city-site

Tier 7 - Utilities
└── dns-manager
```

### Partial Deployment

Deploy only specific services:

```bash
# Deploy only bots
./scripts/deploy.sh discord-bot stream-bot

# Deploy only static sites
./scripts/deploy.sh scarletredjoker-web rig-city-site
```

### Dry Run

Preview what would happen without making changes:

```bash
./scripts/deploy.sh --dry-run
```

### Force Deployment (Skip Confirmations)

```bash
./scripts/deploy.sh --force
```

## Rollback Procedures

### Quick Rollback

Restart all services with current configuration:

```bash
./scripts/rollback.sh
# Select option 1
```

### Environment Rollback

Restore a previous .env file:

```bash
./scripts/rollback.sh
# Select option 2
# Choose backup to restore
```

### Database Rollback

**WARNING: This replaces ALL database data!**

```bash
./scripts/rollback.sh
# Select option 3
# Choose database backup to restore
```

### Full Rollback

Restore both environment and database:

```bash
./scripts/rollback.sh
# Select option 4
# Confirm with "yes"
```

## Backup Locations

Backups are stored in `deploy/linode/backups/`:

| File Pattern | Contents |
|-------------|----------|
| `.env.YYYYMMDD_HHMMSS` | Environment variables snapshot |
| `images.YYYYMMDD_HHMMSS.txt` | Docker image versions |
| `postgres_all.YYYYMMDD_HHMMSS.sql.gz` | Full database dump |

Backups older than 7 days are automatically cleaned up.

## Troubleshooting

### Service Not Starting

```bash
# Check logs
docker compose logs <service-name>

# Check health status
docker inspect --format='{{.State.Health.Status}}' <container-name>

# Restart single service
docker compose restart <service-name>
```

### Database Issues

```bash
# Check PostgreSQL logs
docker compose logs homelab-postgres

# Connect to database
docker exec -it homelab-postgres psql -U postgres

# Check connection from another container
docker exec homelab-dashboard python -c "from models import db; print(db.engine.execute('SELECT 1').fetchone())"
```

### Network/SSL Issues

```bash
# Check Caddy logs
docker compose logs caddy

# Test SSL certificate
curl -vI https://your-domain.com

# Reload Caddy config
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

### Disk Space Issues

```bash
# Check Docker disk usage
docker system df

# Clean up unused resources
docker system prune -a --volumes
```

## Monitoring Endpoints

After deployment, verify these endpoints respond:

| Service | URL | Expected |
|---------|-----|----------|
| Dashboard | https://host.evindrake.net | 200/401 |
| Discord Bot | https://bot.rig-city.com | 200/301 |
| Stream Bot | https://stream.rig-city.com | 200/301 |
| n8n | https://n8n.evindrake.net | 200/401 |
| Code Server | https://code.evindrake.net | 200/401 |
| Grafana | https://grafana.evindrake.net | 200/302 |
| Scarlet Red Joker | https://scarletredjoker.com | 200 |
| Rig City | https://rig-city.com | 200 |

## Emergency Procedures

### Complete Service Failure

```bash
# Stop everything
docker compose down

# Check for obvious issues
./scripts/preflight.sh

# Start infrastructure only
docker compose up -d caddy redis homelab-postgres
sleep 30

# Verify infrastructure
docker compose ps

# Start remaining services
docker compose up -d
```

### Corrupt Database

```bash
# Stop services
docker compose down

# Start only PostgreSQL
docker compose up -d homelab-postgres
sleep 30

# Restore from backup
./scripts/rollback.sh  # Choose option 3

# Start everything
docker compose up -d
```

### Lost .env File

```bash
# Check for backups
ls -la backups/.env.*

# Restore most recent
cp backups/.env.YYYYMMDD_HHMMSS .env

# Or recreate from template
cp .env.example .env
# Then fill in values
```

## Maintenance Windows

For planned maintenance:

1. **Announce** downtime if needed (Discord, etc.)
2. **Backup** before any changes: `docker exec homelab-postgres pg_dumpall -U postgres > /tmp/backup.sql`
3. **Deploy** during low-traffic hours
4. **Verify** all endpoints respond
5. **Monitor** logs for 15-30 minutes

## Security Notes

- Never commit `.env` to git
- Rotate secrets periodically (quarterly recommended)
- Keep backups encrypted for off-site storage
- Review Cloudflare access logs periodically
- Monitor for failed SSH attempts

---

*Last Updated: December 2025*
*Runbook Version: 1.1*
