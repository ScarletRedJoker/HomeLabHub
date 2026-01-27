#!/bin/bash
# Nebula Command Watchdog Service
# Monitors all Nebula services and restarts via systemctl

set -euo pipefail

CONFIG_DIR="${CONFIG_DIR:-/opt/nebula-command/config}"
CHECK_INTERVAL="${CHECK_INTERVAL:-30}"
MAX_RESTARTS="${MAX_RESTARTS:-3}"
COOLDOWN_MINUTES="${COOLDOWN_MINUTES:-5}"
LOG_DIR="${LOG_DIR:-/opt/nebula-command/logs}"
WEBHOOK_URL="${WEBHOOK_URL:-}"
STATE_FILE="${STATE_FILE:-/tmp/nebula-watchdog-state.json}"

declare -A SERVICES=(
    ["ollama"]="http://localhost:11434/api/version"
    ["nebula-comfyui"]="http://localhost:8188/system_stats"
    ["nebula-sd"]="http://localhost:7860/sdapi/v1/sd-models"
    ["nebula-agent"]="http://localhost:3500/health"
)

declare -A SERVICE_TIMEOUTS=(
    ["ollama"]=10
    ["nebula-comfyui"]=15
    ["nebula-sd"]=30
    ["nebula-agent"]=10
)

declare -A RESTART_COUNTS
declare -A LAST_RESTART_TIME

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

mkdir -p "$LOG_DIR"

log() {
    local level="$1"
    local message="$2"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local log_file="$LOG_DIR/watchdog-$(date '+%Y%m%d').log"
    
    echo "[$timestamp] [$level] $message" >> "$log_file"
    
    case "$level" in
        INFO)    echo -e "${BLUE}[$timestamp] [INFO]${NC} $message" ;;
        SUCCESS) echo -e "${GREEN}[$timestamp] [SUCCESS]${NC} $message" ;;
        WARN)    echo -e "${YELLOW}[$timestamp] [WARN]${NC} $message" ;;
        ERROR)   echo -e "${RED}[$timestamp] [ERROR]${NC} $message" ;;
        *)       echo "[$timestamp] [$level] $message" ;;
    esac
}

load_state() {
    if [[ -f "$STATE_FILE" ]]; then
        while IFS='=' read -r key value; do
            if [[ "$key" =~ ^restart_count_ ]]; then
                local service="${key#restart_count_}"
                RESTART_COUNTS["$service"]="$value"
            elif [[ "$key" =~ ^last_restart_ ]]; then
                local service="${key#last_restart_}"
                LAST_RESTART_TIME["$service"]="$value"
            fi
        done < <(jq -r 'to_entries | .[] | "\(.key)=\(.value)"' "$STATE_FILE" 2>/dev/null || true)
    fi
}

save_state() {
    local state="{}"
    
    for service in "${!RESTART_COUNTS[@]}"; do
        state=$(echo "$state" | jq --arg k "restart_count_$service" --arg v "${RESTART_COUNTS[$service]}" '. + {($k): ($v | tonumber)}')
    done
    
    for service in "${!LAST_RESTART_TIME[@]}"; do
        state=$(echo "$state" | jq --arg k "last_restart_$service" --arg v "${LAST_RESTART_TIME[$service]}" '. + {($k): ($v | tonumber)}')
    done
    
    echo "$state" > "$STATE_FILE"
}

check_health() {
    local url="$1"
    local timeout="${2:-10}"
    
    if curl -sf --max-time "$timeout" "$url" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

check_service_running() {
    local service="$1"
    
    if systemctl is-active --quiet "$service" 2>/dev/null; then
        return 0
    fi
    
    case "$service" in
        ollama)
            pgrep -x ollama > /dev/null 2>&1 && return 0
            ;;
        nebula-comfyui)
            pgrep -f "python.*main.py.*8188" > /dev/null 2>&1 && return 0
            ;;
        nebula-sd)
            pgrep -f "python.*launch.py" > /dev/null 2>&1 && return 0
            ;;
        nebula-agent)
            pgrep -f "node.*health-daemon" > /dev/null 2>&1 && return 0
            ;;
    esac
    
    return 1
}

restart_service() {
    local service="$1"
    local current_time
    current_time=$(date +%s)
    
    RESTART_COUNTS["$service"]="${RESTART_COUNTS[$service]:-0}"
    LAST_RESTART_TIME["$service"]="${LAST_RESTART_TIME[$service]:-0}"
    
    local last_restart="${LAST_RESTART_TIME[$service]}"
    local time_diff=$((current_time - last_restart))
    local cooldown_seconds=$((COOLDOWN_MINUTES * 60))
    
    if [[ $time_diff -gt $cooldown_seconds ]]; then
        RESTART_COUNTS["$service"]=0
    fi
    
    if [[ "${RESTART_COUNTS[$service]}" -ge "$MAX_RESTARTS" ]]; then
        log "ERROR" "$service has exceeded max restarts ($MAX_RESTARTS). Sending alert..."
        send_alert "$service" "Service has failed $MAX_RESTARTS times and requires manual intervention"
        return 1
    fi
    
    local attempt=$((RESTART_COUNTS[$service] + 1))
    log "WARN" "Restarting $service (attempt $attempt/$MAX_RESTARTS)..."
    
    if systemctl is-enabled --quiet "$service" 2>/dev/null; then
        sudo systemctl restart "$service"
    else
        case "$service" in
            ollama)
                pkill -x ollama 2>/dev/null || true
                sleep 2
                nohup ollama serve > /dev/null 2>&1 &
                ;;
            nebula-comfyui)
                pkill -f "python.*main.py.*8188" 2>/dev/null || true
                sleep 2
                cd /opt/nebula-command/ComfyUI
                nohup ./venv/bin/python main.py --listen 0.0.0.0 --port 8188 > /dev/null 2>&1 &
                ;;
            nebula-sd)
                pkill -f "python.*launch.py" 2>/dev/null || true
                sleep 2
                cd /opt/nebula-command/stable-diffusion-webui
                nohup ./venv/bin/python launch.py --api --listen > /dev/null 2>&1 &
                ;;
            nebula-agent)
                pkill -f "node.*health-daemon" 2>/dev/null || true
                sleep 2
                cd /opt/nebula-command/services
                nohup node health-daemon.js > /dev/null 2>&1 &
                ;;
        esac
    fi
    
    sleep 5
    
    RESTART_COUNTS["$service"]=$((RESTART_COUNTS[$service] + 1))
    LAST_RESTART_TIME["$service"]="$current_time"
    save_state
    
    if check_service_running "$service"; then
        log "SUCCESS" "$service restarted successfully"
        return 0
    else
        log "ERROR" "$service failed to restart"
        return 1
    fi
}

send_alert() {
    local service="$1"
    local message="$2"
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local hostname
    hostname=$(hostname)
    
    local alert_data
    alert_data=$(jq -n \
        --arg service "$service" \
        --arg message "$message" \
        --arg timestamp "$timestamp" \
        --arg hostname "$hostname" \
        --arg severity "critical" \
        '{service: $service, message: $message, timestamp: $timestamp, hostname: $hostname, severity: $severity}')
    
    if [[ -n "$WEBHOOK_URL" ]]; then
        if curl -sf -X POST -H "Content-Type: application/json" -d "$alert_data" "$WEBHOOK_URL" --max-time 10 > /dev/null 2>&1; then
            log "INFO" "Alert sent for $service"
        else
            log "ERROR" "Failed to send webhook alert"
        fi
    fi
    
    local alert_file="$LOG_DIR/alerts.json"
    if [[ -f "$alert_file" ]]; then
        local existing
        existing=$(cat "$alert_file" 2>/dev/null || echo "[]")
        echo "$existing" | jq ". + [$alert_data]" > "$alert_file"
    else
        echo "[$alert_data]" > "$alert_file"
    fi
}

get_service_status() {
    local status="{}"
    
    for service in "${!SERVICES[@]}"; do
        local running=false
        local healthy=false
        local restarts="${RESTART_COUNTS[$service]:-0}"
        
        if check_service_running "$service"; then
            running=true
            local url="${SERVICES[$service]}"
            local timeout="${SERVICE_TIMEOUTS[$service]:-10}"
            
            if check_health "$url" "$timeout"; then
                healthy=true
            fi
        fi
        
        status=$(echo "$status" | jq \
            --arg service "$service" \
            --argjson running "$running" \
            --argjson healthy "$healthy" \
            --argjson restarts "$restarts" \
            '. + {($service): {running: $running, healthy: $healthy, restarts: $restarts}}')
    done
    
    echo "$status"
}

print_status_report() {
    log "INFO" "=== Service Status Report ==="
    
    for service in "${!SERVICES[@]}"; do
        local running="DOWN"
        local restarts="${RESTART_COUNTS[$service]:-0}"
        
        if check_service_running "$service"; then
            local url="${SERVICES[$service]}"
            local timeout="${SERVICE_TIMEOUTS[$service]:-10}"
            
            if check_health "$url" "$timeout"; then
                running="HEALTHY"
            else
                running="DEGRADED"
            fi
        fi
        
        log "INFO" "  $service: $running (restarts: $restarts)"
    done
    
    log "INFO" "=============================="
}

watchdog_loop() {
    log "INFO" "Nebula Watchdog starting..."
    log "INFO" "Config dir: $CONFIG_DIR"
    log "INFO" "Check interval: ${CHECK_INTERVAL}s"
    log "INFO" "Max restarts: $MAX_RESTARTS"
    log "INFO" "Monitoring ${#SERVICES[@]} services"
    
    load_state
    
    local last_report_hour=-1
    
    while true; do
        for service in "${!SERVICES[@]}"; do
            local url="${SERVICES[$service]}"
            local timeout="${SERVICE_TIMEOUTS[$service]:-10}"
            
            if ! check_service_running "$service"; then
                log "WARN" "$service process not running"
                restart_service "$service"
                continue
            fi
            
            if ! check_health "$url" "$timeout"; then
                log "WARN" "$service health check failed"
                restart_service "$service"
            fi
        done
        
        local current_hour
        current_hour=$(date +%H)
        if [[ "$current_hour" != "$last_report_hour" ]]; then
            print_status_report
            last_report_hour="$current_hour"
        fi
        
        sleep "$CHECK_INTERVAL"
    done
}

case "${1:-}" in
    status)
        get_service_status
        ;;
    report)
        load_state
        print_status_report
        ;;
    restart)
        if [[ -n "${2:-}" ]]; then
            load_state
            restart_service "$2"
            save_state
        else
            echo "Usage: $0 restart <service>"
            exit 1
        fi
        ;;
    *)
        watchdog_loop
        ;;
esac
