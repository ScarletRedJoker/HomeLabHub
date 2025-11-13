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

### Automated Replit Sync

**Install automatic sync (recommended):**
```bash
./deployment/install-auto-sync.sh
```

**Manual sync when needed:**
```bash
./deployment/manual-sync.sh
```

**View sync logs:**
```bash
journalctl -u replit-sync.service -f
```

## Scripts Overview

| Script | Purpose |
|--------|---------|
| `homelab-manager.sh` | **Main interface** - Interactive menu for all operations |
| `sync-from-replit.sh` | **Auto-sync** - Pull latest Replit changes and deploy |
| `install-auto-sync.sh` | **Setup** - Install 5-minute auto-sync timer |
| `manual-sync.sh` | **Quick sync** - Manually sync from Replit now |
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

## Automated Replit → Ubuntu Sync

### How It Works

When the Replit Agent makes code changes, those changes exist only in the Replit workspace. The sync system automatically:

1. **Detects Changes**: Checks git remote every 5 minutes
2. **Pulls Code**: Downloads latest changes from Replit
3. **Smart Rebuild**: Only rebuilds services with changed files
4. **Auto-Deploy**: Restarts affected containers automatically

### Setup Auto-Sync

```bash
cd /home/evin/contain/HomeLabHub
chmod +x deployment/install-auto-sync.sh
./deployment/install-auto-sync.sh
```

This installs a systemd timer that syncs every 5 minutes.

### Manual Sync

```bash
./deployment/manual-sync.sh
```

### Monitoring

```bash
# Check auto-sync status
sudo systemctl status replit-sync.timer

# View sync logs in real-time
journalctl -u replit-sync.service -f

# View sync history
tail -f var/log/replit-sync.log
```

### Disable/Enable Auto-Sync

```bash
# Disable
sudo systemctl stop replit-sync.timer
sudo systemctl disable replit-sync.timer

# Re-enable
sudo systemctl enable replit-sync.timer
sudo systemctl start replit-sync.timer
```

### Troubleshooting Sync

**Problem:** "Already up to date" but changes aren't syncing

**Solution:** Changes in Replit workspace weren't pushed to git. The agent will create files on Replit, and you need to manually copy them or push them to the git remote.

**Problem:** Plex logs causing conflicts

**Solution:** Now ignored in `.gitignore`. Run `git reset HEAD services/plex/config/` if needed.

### Log Locations

Sync logs are stored in the project directory:
- Detailed log: `var/log/replit-sync.log`
- Systemd journal: `journalctl -u replit-sync.service -f`
- State file: `var/state/.last_sync_commit`
