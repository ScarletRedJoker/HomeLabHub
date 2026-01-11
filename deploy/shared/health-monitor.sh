#!/bin/bash
# Nebula Command - Health Monitor with Alerts
# Continuous monitoring with optional notifications
# Note: No 'set -e' - we want monitoring to continue after check failures

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/../logs"
ALERT_LOG="$LOG_DIR/health-alerts.log"
LAST_STATE_FILE="$LOG_DIR/.health-state"

mkdir -p "$LOG_DIR"

DISCORD_WEBHOOK_URL="${DISCORD_ALERT_WEBHOOK:-}"
CHECK_INTERVAL="${CHECK_INTERVAL:-60}"
ALERT_COOLDOWN="${ALERT_COOLDOWN:-300}"

declare -A SERVICE_STATE
declare -A LAST_ALERT_TIME

load_state() {
    if [ -f "$LAST_STATE_FILE" ]; then
        while IFS='=' read -r key value; do
            SERVICE_STATE["$key"]="$value"
        done < "$LAST_STATE_FILE"
    fi
}

save_state() {
    > "$LAST_STATE_FILE"
    for key in "${!SERVICE_STATE[@]}"; do
        echo "${key}=${SERVICE_STATE[$key]}" >> "$LAST_STATE_FILE"
    done
}

log_alert() {
    local level="$1"
    local message="$2"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" >> "$ALERT_LOG"
    
    if [ "$level" = "ERROR" ]; then
        echo -e "${RED}[ALERT]${NC} $message"
    elif [ "$level" = "WARN" ]; then
        echo -e "${YELLOW}[WARN]${NC} $message"
    else
        echo -e "${GREEN}[INFO]${NC} $message"
    fi
}

send_discord_alert() {
    local title="$1"
    local message="$2"
    local color="$3"
    
    if [ -z "$DISCORD_WEBHOOK_URL" ]; then
        return 0
    fi
    
    local payload
    payload=$(cat <<EOF
{
    "embeds": [{
        "title": "$title",
        "description": "$message",
        "color": $color,
        "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    }]
}
EOF
)
    
    curl -s -H "Content-Type: application/json" -d "$payload" "$DISCORD_WEBHOOK_URL" > /dev/null 2>&1 || true
}

check_service() {
    local name="$1"
    local url="$2"
    local timeout="${3:-10}"
    
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout "$timeout" "$url" 2>/dev/null || echo "000")
    
    local prev_state="${SERVICE_STATE[$name]:-unknown}"
    local new_state
    
    if [ "$status" = "200" ]; then
        new_state="healthy"
    else
        new_state="unhealthy"
    fi
    
    SERVICE_STATE["$name"]="$new_state"
    
    if [ "$prev_state" != "$new_state" ]; then
        if [ "$new_state" = "unhealthy" ]; then
            log_alert "ERROR" "$name went DOWN (HTTP $status)"
            send_discord_alert "Service Down" "$name is unreachable (HTTP $status)" "16711680"
        elif [ "$prev_state" = "unhealthy" ]; then
            log_alert "INFO" "$name recovered (HTTP $status)"
            send_discord_alert "Service Recovered" "$name is back online" "65280"
        fi
    fi
}

check_container() {
    local name="$1"
    
    if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${name}$"; then
        local prev_state="${SERVICE_STATE[$name]:-unknown}"
        SERVICE_STATE["$name"]="stopped"
        
        if [ "$prev_state" != "stopped" ] && [ "$prev_state" != "unknown" ]; then
            log_alert "ERROR" "Container $name stopped"
            send_discord_alert "Container Stopped" "$name container is not running" "16711680"
        fi
        return 0
    fi
    
    local health
    health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' "$name" 2>/dev/null || echo "unknown")
    
    local prev_state="${SERVICE_STATE[$name]:-unknown}"
    SERVICE_STATE["$name"]="$health"
    
    if [ "$health" = "unhealthy" ] && [ "$prev_state" != "unhealthy" ]; then
        log_alert "ERROR" "Container $name is unhealthy"
        send_discord_alert "Container Unhealthy" "$name container health check failed" "16776960"
    elif [ "$health" = "healthy" ] && [ "$prev_state" = "unhealthy" ]; then
        log_alert "INFO" "Container $name recovered"
        send_discord_alert "Container Recovered" "$name is healthy again" "65280"
    fi
    return 0
}

monitor_linode() {
    echo -e "${CYAN}━━━ Checking Linode Services ━━━${NC}"
    
    check_container "homelab-postgres"
    check_container "homelab-redis"
    check_container "homelab-dashboard"
    check_container "discord-bot"
    check_container "stream-bot"
    check_container "caddy"
    
    check_service "dashboard" "http://localhost:5000/api/health"
    check_service "discord-bot" "http://localhost:4000/health"
    check_service "stream-bot" "http://localhost:3000/health" "15"
}

monitor_local() {
    echo -e "${CYAN}━━━ Checking Local Services ━━━${NC}"
    
    check_container "dashboard-postgres"
    check_container "dashboard-redis"
    check_container "authelia"
    check_container "plex"
    check_container "jellyfin"
    check_container "homeassistant"
    check_container "caddy-local"
    
    check_service "authelia" "http://localhost:9091/api/health"
    check_service "plex" "http://localhost:32400/identity"
    check_service "home-assistant" "http://localhost:8123/"
}

run_once() {
    local deployment="${1:-linode}"
    
    load_state
    
    if [ "$deployment" = "linode" ]; then
        monitor_linode
    else
        monitor_local
    fi
    
    save_state
    
    local healthy=0
    local unhealthy=0
    
    for key in "${!SERVICE_STATE[@]}"; do
        if [ "${SERVICE_STATE[$key]}" = "healthy" ] || [ "${SERVICE_STATE[$key]}" = "running" ]; then
            healthy=$((healthy + 1))
        else
            unhealthy=$((unhealthy + 1))
        fi
    done
    
    echo ""
    echo -e "${CYAN}Status: ${GREEN}$healthy healthy${NC}, ${RED}$unhealthy issues${NC}"
}

run_daemon() {
    local deployment="${1:-linode}"
    
    echo -e "${CYAN}═══ Nebula Command - Health Monitor Daemon ═══${NC}"
    echo "Deployment: $deployment"
    echo "Check interval: ${CHECK_INTERVAL}s"
    echo "Alert cooldown: ${ALERT_COOLDOWN}s"
    [ -n "$DISCORD_WEBHOOK_URL" ] && echo "Discord alerts: enabled"
    echo ""
    
    while true; do
        run_once "$deployment"
        echo ""
        echo "Next check in ${CHECK_INTERVAL}s... (Ctrl+C to stop)"
        sleep "$CHECK_INTERVAL"
        clear
    done
}

case "${1:-}" in
    linode|local)
        run_once "$1"
        ;;
    daemon)
        run_daemon "${2:-linode}"
        ;;
    *)
        echo "Usage: $0 <linode|local|daemon [linode|local]>"
        echo ""
        echo "Commands:"
        echo "  linode        - One-time check of Linode services"
        echo "  local         - One-time check of local services"
        echo "  daemon        - Continuous monitoring with alerts"
        echo ""
        echo "Environment variables:"
        echo "  DISCORD_ALERT_WEBHOOK - Discord webhook URL for alerts"
        echo "  CHECK_INTERVAL        - Seconds between checks (default: 60)"
        echo "  ALERT_COOLDOWN        - Seconds between repeat alerts (default: 300)"
        exit 1
        ;;
esac
