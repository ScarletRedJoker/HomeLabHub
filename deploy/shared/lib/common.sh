#!/bin/bash
# Nebula Command - Shared Deployment Utilities
# Common functions for unified deployment orchestration

set -euo pipefail

# Colors
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export BLUE='\033[0;34m'
export CYAN='\033[0;36m'
export NC='\033[0m'
export BOLD='\033[1m'

# Paths
export DEPLOY_ROOT="${DEPLOY_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
export STATE_DIR="$DEPLOY_ROOT/shared/state"
export LOG_DIR="$DEPLOY_ROOT/unified/logs"

# Ensure directories exist
mkdir -p "$STATE_DIR" "$LOG_DIR"

# Logging
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case "$level" in
        INFO)  echo -e "${GREEN}[INFO]${NC} $message" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} $message" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} $message" ;;
        DEBUG) [[ "${DEBUG:-0}" == "1" ]] && echo -e "${BLUE}[DEBUG]${NC} $message" ;;
        *)     echo -e "$message" ;;
    esac
    
    echo "[$timestamp] [$level] $message" >> "$LOG_DIR/deploy-all.log"
}

# Print section header
section() {
    echo ""
    echo -e "${CYAN}━━━ $1 ━━━${NC}"
}

# Check if command exists
has_command() {
    command -v "$1" &> /dev/null
}

# SSH wrapper with retries
ssh_exec() {
    local host="$1"
    local user="$2"
    shift 2
    local cmd="$*"
    local max_retries=3
    local retry=0
    
    while [[ $retry -lt $max_retries ]]; do
        if ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
               -o PreferredAuthentications=publickey \
               "$user@$host" "$cmd" 2>/dev/null; then
            return 0
        fi
        retry=$((retry + 1))
        [[ $retry -lt $max_retries ]] && sleep 2
    done
    
    return 1
}

# SSH wrapper for Windows (PowerShell)
ssh_windows() {
    local host="$1"
    local user="$2"
    shift 2
    local cmd="$*"
    
    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
        -o PreferredAuthentications=publickey \
        "$user@$host" "powershell -Command \"$cmd\"" 2>/dev/null
}

# Check if host is reachable via Tailscale
check_tailscale_host() {
    local host="$1"
    ping -c 1 -W 2 "$host" &> /dev/null
}

# Get current timestamp for state files
get_timestamp() {
    date -u '+%Y-%m-%dT%H:%M:%SZ'
}

# Load environment config
load_env() {
    local env_file="${1:-.env}"
    if [[ -f "$env_file" ]]; then
        set -a
        source "$env_file"
        set +a
    fi
}

# Update deployment state
update_state() {
    local target="$1"
    local status="$2"
    local message="${3:-}"
    
    local state_file="$STATE_DIR/deploy-status.json"
    local temp_file=$(mktemp)
    
    if [[ -f "$state_file" ]]; then
        jq --arg target "$target" \
           --arg status "$status" \
           --arg message "$message" \
           --arg timestamp "$(get_timestamp)" \
           '.[$target] = {status: $status, message: $message, updated: $timestamp}' \
           "$state_file" > "$temp_file"
    else
        jq -n --arg target "$target" \
              --arg status "$status" \
              --arg message "$message" \
              --arg timestamp "$(get_timestamp)" \
              '{($target): {status: $status, message: $message, updated: $timestamp}}' \
              > "$temp_file"
    fi
    
    mv "$temp_file" "$state_file"
}

# Check service health via HTTP
check_http_health() {
    local url="$1"
    local timeout="${2:-5}"
    
    if curl -sf --max-time "$timeout" "$url" &> /dev/null; then
        return 0
    fi
    return 1
}

# Parse health from Ollama API
check_ollama_health() {
    local host="$1"
    local port="${2:-11434}"
    
    local response=$(curl -sf --max-time 5 "http://$host:$port/api/tags" 2>/dev/null)
    if [[ -n "$response" ]]; then
        local models=$(echo "$response" | jq -r '.models[]?.name' 2>/dev/null | tr '\n' ',' | sed 's/,$//')
        echo "$models"
        return 0
    fi
    return 1
}

# Print status indicator
status_icon() {
    case "$1" in
        online|healthy|success) echo -e "${GREEN}●${NC}" ;;
        starting|pending)       echo -e "${YELLOW}◐${NC}" ;;
        offline|error|failed)   echo -e "${RED}○${NC}" ;;
        *)                      echo -e "${BLUE}?${NC}" ;;
    esac
}

# Duration formatting
format_duration() {
    local seconds=$1
    if [[ $seconds -lt 60 ]]; then
        echo "${seconds}s"
    elif [[ $seconds -lt 3600 ]]; then
        echo "$((seconds / 60))m $((seconds % 60))s"
    else
        echo "$((seconds / 3600))h $((seconds % 3600 / 60))m"
    fi
}
