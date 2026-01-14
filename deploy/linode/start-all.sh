#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEBULA_DIR="/opt/nebula"
LOG_FILE="/var/log/nebula/linode-startup.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

mkdir -p /var/log/nebula

log "=========================================="
log "Starting Nebula Command - Linode Dashboard"
log "=========================================="

log "1. Starting Docker..."
sudo systemctl start docker
log "   Docker: $(systemctl is-active docker)"

log "2. Starting PostgreSQL..."
if [ -f "$NEBULA_DIR/docker/postgres/docker-compose.yml" ]; then
    docker compose -f "$NEBULA_DIR/docker/postgres/docker-compose.yml" up -d
    log "   PostgreSQL: started"
else
    log "   PostgreSQL: compose file not found, skipping..."
fi

log "3. Starting Redis..."
if [ -f "$NEBULA_DIR/docker/redis/docker-compose.yml" ]; then
    docker compose -f "$NEBULA_DIR/docker/redis/docker-compose.yml" up -d
    log "   Redis: started"
else
    log "   Redis: compose file not found, skipping..."
fi

log "4. Starting PM2 services..."
if command -v pm2 &> /dev/null; then
    cd "$NEBULA_DIR/services/dashboard-next"
    pm2 start ecosystem.config.js --env production 2>/dev/null || pm2 restart all
    log "   PM2 services: $(pm2 list | grep -c online) online"
else
    log "   PM2 not installed, starting manually..."
    
    cd "$NEBULA_DIR/services/dashboard-next"
    NODE_ENV=production npm run start &
    
    cd "$NEBULA_DIR/services/discord-bot"
    NODE_ENV=production npm run start &
    
    cd "$NEBULA_DIR/services/stream-bot"
    NODE_ENV=production npm run start &
fi

log "5. Starting Caddy..."
if systemctl list-unit-files | grep -q caddy; then
    sudo systemctl start caddy
    log "   Caddy: $(systemctl is-active caddy)"
else
    log "   Caddy not installed, skipping..."
fi

log "6. Verifying Tailscale..."
if command -v tailscale &> /dev/null; then
    TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "not connected")
    log "   Tailscale IP: $TAILSCALE_IP"
else
    log "   Tailscale not installed"
fi

log ""
log "=========================================="
log "Linode Dashboard Startup Complete"
log "=========================================="
log ""
log "Services:"
if command -v pm2 &> /dev/null; then
    pm2 list
fi
echo ""
log "Access: https://${DASHBOARD_DOMAIN:-localhost}"
log ""
