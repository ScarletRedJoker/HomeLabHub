# Deployment Scripts

This directory contains all deployment and management scripts for the HomeLabHub services.

## Quick Reference

### Service Updates

**Update n8n (or any service):**
```bash
./deployment/update-n8n.sh
```

**Update any service:**
```bash
./deployment/update-service.sh <service-name>

# Examples:
./deployment/update-service.sh n8n
./deployment/update-service.sh plex
./deployment/update-service.sh caddy
```

**Via homelab-manager menu:**
```bash
./homelab-manager.sh
# Select option 16: Update Service
```

### Database Management

**Ensure databases exist (fix DB issues):**
```bash
./deployment/ensure-databases.sh
```

**Create stream bot schema:**
```bash
docker cp deployment/init-streambot-schema.sql discord-bot-db:/tmp/
docker exec discord-bot-db psql -U streambot -d streambot -f /tmp/init-streambot-schema.sql
```

### Full Deployment

**Initial deployment:**
```bash
./deployment/deploy-unified.sh
```

**Interactive management:**
```bash
./homelab-manager.sh
```

## Scripts Overview

| Script | Purpose |
|--------|---------|
| `homelab-manager.sh` | **Main interface** - Interactive menu for all operations |
| `update-service.sh` | Update any service to latest Docker image |
| `update-n8n.sh` | Quick n8n update shortcut |
| `deploy-unified.sh` | Full deployment of all services |
| `ensure-databases.sh` | Create/fix PostgreSQL databases |
| `generate-unified-env.sh` | Interactive .env file generator |
| `init-streambot-schema.sql` | Stream bot database schema |
| `check-all-env.sh` | Validate environment variables |
| `diagnose-all.sh` | Full system diagnostics |
| `monitor-services.sh` | Real-time service monitoring |

## Service Names

Available services for updates/restarts:
- `homelab-dashboard` - Flask management UI
- `discord-bot` - Discord ticket bot
- `stream-bot` - Twitch/Kick/YouTube streaming bot
- `caddy` - Reverse proxy with SSL
- `n8n` - Workflow automation
- `plex` - Media server
- `vnc-desktop` - Remote desktop
- `scarletredjoker-web` - Static portfolio site
- `discord-bot-db` - PostgreSQL database

## Update Process

When you update a service:
1. Latest Docker image is pulled from registry
2. Container is stopped gracefully
3. Old container is removed
4. New container is started with same configuration
5. Volumes/data are preserved
6. Health check confirms successful restart

**Data Safety:** All persistent data (databases, configurations, media) is stored in Docker volumes and is never deleted during updates.
