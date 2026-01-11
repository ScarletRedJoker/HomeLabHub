#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
STATE_DIR="$REPO_ROOT/deploy/shared/state"
STATE_FILE="$STATE_DIR/local-ai.json"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

OLLAMA_PORT="${OLLAMA_PORT:-11434}"
STABLE_DIFFUSION_PORT="${STABLE_DIFFUSION_PORT:-7860}"
COMFYUI_PORT="${COMFYUI_PORT:-8188}"

get_tailscale_ip() {
    if command -v tailscale &> /dev/null; then
        tailscale ip -4 2>/dev/null | head -1 || echo ""
    else
        echo ""
    fi
}

get_local_ip() {
    hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1"
}

check_ollama() {
    local host="${1:-localhost}"
    local port="${2:-$OLLAMA_PORT}"
    local url="http://${host}:${port}"
    
    local version=""
    local models=()
    local status="offline"
    
    if curl -sf --connect-timeout 3 "${url}/api/version" > /dev/null 2>&1; then
        status="online"
        version=$(curl -sf --connect-timeout 3 "${url}/api/version" 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
        
        local models_json
        models_json=$(curl -sf --connect-timeout 5 "${url}/api/tags" 2>/dev/null || echo '{"models":[]}')
        models=$(echo "$models_json" | grep -o '"name":"[^"]*"' | cut -d'"' -f4 | tr '\n' ',' | sed 's/,$//' || echo "")
    fi
    
    echo "{\"status\":\"$status\",\"version\":\"$version\",\"models\":\"$models\",\"url\":\"$url\"}"
}

check_stable_diffusion() {
    local host="${1:-localhost}"
    local port="${2:-$STABLE_DIFFUSION_PORT}"
    local url="http://${host}:${port}"
    
    local status="offline"
    
    if curl -sf --connect-timeout 3 "${url}/sdapi/v1/options" > /dev/null 2>&1; then
        status="online"
    elif curl -sf --connect-timeout 3 "${url}/api/v1/txt2img" > /dev/null 2>&1; then
        status="online"
    fi
    
    echo "{\"status\":\"$status\",\"url\":\"$url\"}"
}

check_comfyui() {
    local host="${1:-localhost}"
    local port="${2:-$COMFYUI_PORT}"
    local url="http://${host}:${port}"
    
    local status="offline"
    
    if curl -sf --connect-timeout 3 "${url}/system_stats" > /dev/null 2>&1; then
        status="online"
    fi
    
    echo "{\"status\":\"$status\",\"url\":\"$url\"}"
}

register_services() {
    echo -e "${CYAN}━━━ Local AI Service Registration ━━━${NC}"
    
    mkdir -p "$STATE_DIR"
    chmod 750 "$STATE_DIR" 2>/dev/null || true
    
    local tailscale_ip=$(get_tailscale_ip)
    local local_ip=$(get_local_ip)
    local hostname=$(hostname)
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    
    echo "Hostname: $hostname"
    echo "Local IP: $local_ip"
    echo "Tailscale IP: ${tailscale_ip:-not connected}"
    echo ""
    
    if [ -z "$tailscale_ip" ]; then
        echo -e "${YELLOW}[WARN]${NC} Tailscale not connected - waiting 10s for connection..."
        sleep 10
        tailscale_ip=$(get_tailscale_ip)
        if [ -z "$tailscale_ip" ]; then
            echo -e "${YELLOW}[WARN]${NC} Tailscale still not connected. Using local IP."
            echo "       Remote servers won't be able to reach these services."
        else
            echo -e "${GREEN}[OK]${NC} Tailscale connected: $tailscale_ip"
        fi
    fi
    
    local preferred_ip="${tailscale_ip:-$local_ip}"
    
    echo "Checking services on $preferred_ip..."
    
    local ollama_result=$(check_ollama "$preferred_ip" "$OLLAMA_PORT")
    local ollama_status=$(echo "$ollama_result" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    local ollama_version=$(echo "$ollama_result" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
    local ollama_models=$(echo "$ollama_result" | grep -o '"models":"[^"]*"' | cut -d'"' -f4)
    
    if [ "$ollama_status" = "online" ]; then
        echo -e "  ${GREEN}●${NC} Ollama: online (v${ollama_version})"
        [ -n "$ollama_models" ] && echo "    Models: $ollama_models"
    else
        echo -e "  ${RED}○${NC} Ollama: offline"
    fi
    
    local sd_result=$(check_stable_diffusion "$preferred_ip" "$STABLE_DIFFUSION_PORT")
    local sd_status=$(echo "$sd_result" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    
    if [ "$sd_status" = "online" ]; then
        echo -e "  ${GREEN}●${NC} Stable Diffusion: online"
    else
        echo -e "  ${RED}○${NC} Stable Diffusion: offline"
    fi
    
    local comfy_result=$(check_comfyui "$preferred_ip" "$COMFYUI_PORT")
    local comfy_status=$(echo "$comfy_result" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    
    if [ "$comfy_status" = "online" ]; then
        echo -e "  ${GREEN}●${NC} ComfyUI: online"
    else
        echo -e "  ${RED}○${NC} ComfyUI: offline"
    fi
    
    cat > "$STATE_FILE" << EOF
{
  "hostname": "$hostname",
  "localIp": "$local_ip",
  "tailscaleIp": "${tailscale_ip:-null}",
  "preferredIp": "$preferred_ip",
  "registeredAt": "$timestamp",
  "services": {
    "ollama": {
      "status": "$ollama_status",
      "url": "http://${preferred_ip}:${OLLAMA_PORT}",
      "version": "$ollama_version",
      "models": "$ollama_models"
    },
    "stableDiffusion": {
      "status": "$sd_status",
      "url": "http://${preferred_ip}:${STABLE_DIFFUSION_PORT}"
    },
    "comfyui": {
      "status": "$comfy_status",
      "url": "http://${preferred_ip}:${COMFYUI_PORT}"
    }
  }
}
EOF
    
    echo ""
    echo -e "${GREEN}✓${NC} State saved to: $STATE_FILE"
    
    if [ -n "$tailscale_ip" ]; then
        echo ""
        echo -e "${CYAN}Environment variables for Linode .env:${NC}"
        [ "$ollama_status" = "online" ] && echo "OLLAMA_URL=http://${tailscale_ip}:${OLLAMA_PORT}"
        [ "$sd_status" = "online" ] && echo "STABLE_DIFFUSION_URL=http://${tailscale_ip}:${STABLE_DIFFUSION_PORT}"
        [ "$comfy_status" = "online" ] && echo "COMFYUI_URL=http://${tailscale_ip}:${COMFYUI_PORT}"
    else
        echo ""
        echo -e "${YELLOW}Warning: Tailscale not connected. Start Tailscale for cross-server access.${NC}"
    fi
}

show_status() {
    if [ -f "$STATE_FILE" ]; then
        echo -e "${CYAN}━━━ Local AI State ━━━${NC}"
        cat "$STATE_FILE"
    else
        echo "No state file found. Run: $0 register"
    fi
}

case "${1:-register}" in
    register)
        register_services
        ;;
    status)
        show_status
        ;;
    check-ollama)
        host="${2:-localhost}"
        check_ollama "$host" "$OLLAMA_PORT"
        ;;
    *)
        echo "Usage: $0 {register|status|check-ollama [host]}"
        exit 1
        ;;
esac
