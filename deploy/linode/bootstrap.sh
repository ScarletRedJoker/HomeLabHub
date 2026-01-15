#!/bin/bash
#
# Nebula Command - Linode Bootstrap Script
# Services: Dashboard, Discord Bot, Stream Bot
#
# This script is idempotent - safe to run multiple times
#

set -e

export NEBULA_ENV=linode
export NEBULA_ROLE=dashboard
export NEBULA_DIR="${NEBULA_DIR:-/opt/homelab/NebulaCommand}"
export LOG_FILE="${LOG_FILE:-/var/log/nebula/bootstrap.log}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    local level=$1
    shift
    local msg="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        INFO)  color=$GREEN ;;
        WARN)  color=$YELLOW ;;
        ERROR) color=$RED ;;
        *)     color=$NC ;;
    esac
    
    echo -e "${color}[$timestamp] [$level] $msg${NC}" | tee -a "$LOG_FILE"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log ERROR "This script must be run as root"
        exit 1
    fi
}

detect_environment() {
    log INFO "Detecting environment..."
    
    if [[ -f /opt/homelab ]]; then
        log INFO "  Detected: Linode production server"
    elif hostname | grep -qi linode; then
        log INFO "  Detected: Linode (from hostname)"
    else
        log WARN "  Could not confirm Linode environment, proceeding anyway"
    fi
    
    export NEBULA_ENV=linode
}

load_secrets() {
    log INFO "Loading secrets..."
    
    local env_file="/opt/homelab/.env"
    local secrets_dir="/opt/homelab/secrets"
    
    if [[ -f "$env_file" ]]; then
        log INFO "  Loading from $env_file"
        set -a
        source "$env_file"
        set +a
    else
        log WARN "  No .env file found at $env_file"
    fi
    
    if [[ -d "$secrets_dir" ]]; then
        log INFO "  Loading from secrets directory"
        for secret_file in "$secrets_dir"/*; do
            if [[ -f "$secret_file" ]]; then
                local key=$(basename "$secret_file")
                local value=$(cat "$secret_file")
                export "$key"="$value"
            fi
        done
    fi
    
    local required_secrets=("DATABASE_URL" "DISCORD_TOKEN")
    local missing=()
    
    for secret in "${required_secrets[@]}"; do
        if [[ -z "${!secret}" ]]; then
            missing+=("$secret")
        fi
    done
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        log WARN "  Missing secrets: ${missing[*]}"
    else
        log INFO "  All required secrets loaded"
    fi
}

start_docker_services() {
    log INFO "Starting Docker services..."
    
    systemctl start docker 2>/dev/null || true
    
    if [[ -f "$NEBULA_DIR/deploy/linode/docker-compose.yml" ]]; then
        cd "$NEBULA_DIR/deploy/linode"
        docker compose up -d 2>/dev/null || log WARN "  Some Docker services may have failed"
        log INFO "  Docker Compose services started"
    fi
}

start_pm2_services() {
    log INFO "Starting PM2 services..."
    
    if ! command -v pm2 &> /dev/null; then
        log WARN "  PM2 not installed, installing..."
        npm install -g pm2
    fi
    
    local ecosystem_file="$NEBULA_DIR/deploy/linode/ecosystem.config.js"
    
    if [[ -f "$ecosystem_file" ]]; then
        cd "$NEBULA_DIR/deploy/linode"
        pm2 start ecosystem.config.js --env production 2>/dev/null || pm2 restart all
        pm2 save
        log INFO "  PM2 services started"
    else
        log INFO "  Starting services individually..."
        
        cd "$NEBULA_DIR/services/dashboard-next"
        pm2 start npm --name "dashboard" -- run start 2>/dev/null || pm2 restart dashboard
        
        cd "$NEBULA_DIR/services/discord-bot"
        pm2 start npm --name "discord-bot" -- run start 2>/dev/null || pm2 restart discord-bot
        
        cd "$NEBULA_DIR/services/stream-bot"
        pm2 start npm --name "stream-bot" -- run start 2>/dev/null || pm2 restart stream-bot
        
        pm2 save
    fi
}

start_caddy() {
    log INFO "Starting Caddy..."
    
    if systemctl list-unit-files | grep -q caddy; then
        systemctl start caddy
        log INFO "  Caddy: $(systemctl is-active caddy)"
    else
        log WARN "  Caddy not installed"
    fi
}

register_with_registry() {
    log INFO "Registering with service registry..."
    
    if [[ -n "$DATABASE_URL" ]]; then
        cd "$NEBULA_DIR/services/dashboard-next"
        
        node -e "
            const { bootstrap } = require('./lib/env-bootstrap');
            bootstrap().then(result => {
                console.log('Registration:', result.ready ? 'SUCCESS' : 'FAILED');
                if (result.errors.length > 0) {
                    console.log('Errors:', result.errors);
                }
            }).catch(err => {
                console.log('Registration failed:', err.message);
            });
        " 2>/dev/null || log WARN "  Service registration skipped (node not available)"
    else
        log WARN "  Skipping registration (no DATABASE_URL)"
    fi
}

verify_services() {
    log INFO "Verifying services..."
    
    sleep 5
    
    local services=("dashboard:5000" "discord-bot:4000" "stream-bot:3000")
    
    for service in "${services[@]}"; do
        local name="${service%%:*}"
        local port="${service##*:}"
        
        if curl -s "http://localhost:$port/api/health" > /dev/null 2>&1; then
            log INFO "  $name: healthy"
        else
            log WARN "  $name: not responding (may still be starting)"
        fi
    done
    
    if command -v tailscale &> /dev/null; then
        local ts_ip=$(tailscale ip -4 2>/dev/null || echo "not connected")
        log INFO "  Tailscale IP: $ts_ip"
    fi
}

print_summary() {
    echo ""
    log INFO "=========================================="
    log INFO "Linode Bootstrap Complete"
    log INFO "=========================================="
    echo ""
    
    if command -v pm2 &> /dev/null; then
        pm2 list
    fi
    
    echo ""
    log INFO "Access Dashboard: https://${DASHBOARD_DOMAIN:-localhost}"
    log INFO "Logs: $LOG_FILE"
    echo ""
}

main() {
    mkdir -p /var/log/nebula
    
    echo ""
    log INFO "=========================================="
    log INFO "Nebula Command - Linode Bootstrap"
    log INFO "Environment: $NEBULA_ENV | Role: $NEBULA_ROLE"
    log INFO "=========================================="
    echo ""
    
    check_root
    detect_environment
    load_secrets
    start_docker_services
    start_pm2_services
    start_caddy
    register_with_registry
    verify_services
    print_summary
}

main "$@"
