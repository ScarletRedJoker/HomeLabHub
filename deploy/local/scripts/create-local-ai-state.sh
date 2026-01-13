#!/bin/bash
# Create/update local-ai.json state file for production use
# Run this on Linode after Windows VM Ollama is set up
# Can be run via cron: */1 * * * * /opt/homelab/HomeLabHub/deploy/local/scripts/create-local-ai-state.sh --quiet

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="/opt/homelab/HomeLabHub/deploy/shared/state"
STATE_FILE="$STATE_DIR/local-ai.json"
HISTORY_FILE="$STATE_DIR/local-ai-history.jsonl"

WINDOWS_VM_IP="${WINDOWS_VM_IP:-100.118.44.102}"
UBUNTU_SERVER_IP="${UBUNTU_SERVER_IP:-100.66.61.51}"

QUIET_MODE=false
[[ "${1:-}" == "--quiet" ]] && QUIET_MODE=true

log() { $QUIET_MODE || echo "$@"; }

log "=== Creating Local AI State File ==="

mkdir -p "$STATE_DIR"

# Check Windows VM reachability
log "Checking Windows VM connectivity..."
WINDOWS_VM_REACHABLE="false"
if ping -c1 -W2 "$WINDOWS_VM_IP" &>/dev/null; then
    WINDOWS_VM_REACHABLE="true"
    log "  Windows VM: REACHABLE"
else
    log "  Windows VM: UNREACHABLE"
fi

# Check Windows VM Ollama
log "Checking Windows VM Ollama at $WINDOWS_VM_IP:11434..."
WINDOWS_OLLAMA_STATUS="offline"
WINDOWS_OLLAMA_VERSION=""
WINDOWS_OLLAMA_MODELS="[]"
WINDOWS_OLLAMA_LATENCY=""
if curl -sf --connect-timeout 5 "http://${WINDOWS_VM_IP}:11434/api/version" > /dev/null 2>&1; then
    WINDOWS_OLLAMA_STATUS="online"
    WINDOWS_OLLAMA_VERSION=$(curl -sf "http://${WINDOWS_VM_IP}:11434/api/version" | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
    # Get models list
    WINDOWS_OLLAMA_MODELS=$(curl -sf --connect-timeout 3 "http://${WINDOWS_VM_IP}:11434/api/tags" 2>/dev/null | jq -c '[.models[].name] // []' || echo '[]')
    log "  Windows VM Ollama: ONLINE (v$WINDOWS_OLLAMA_VERSION)"
else
    log "  Windows VM Ollama: OFFLINE"
fi

# Check Ubuntu Ollama (fallback)
log "Checking Ubuntu Ollama at $UBUNTU_SERVER_IP:11434..."
UBUNTU_OLLAMA_STATUS="offline"
UBUNTU_OLLAMA_MODELS="[]"
if curl -sf --connect-timeout 5 "http://${UBUNTU_SERVER_IP}:11434/api/version" > /dev/null 2>&1; then
    UBUNTU_OLLAMA_STATUS="online"
    UBUNTU_OLLAMA_MODELS=$(curl -sf --connect-timeout 3 "http://${UBUNTU_SERVER_IP}:11434/api/tags" 2>/dev/null | jq -c '[.models[].name] // []' || echo '[]')
    log "  Ubuntu Ollama: ONLINE"
else
    log "  Ubuntu Ollama: OFFLINE"
fi

# Check Stable Diffusion (optional)
log "Checking Stable Diffusion at $WINDOWS_VM_IP:7860..."
SD_STATUS="offline"
SD_MODELS="[]"
if curl -sf --connect-timeout 5 "http://${WINDOWS_VM_IP}:7860/sdapi/v1/sd-models" > /dev/null 2>&1; then
    SD_STATUS="online"
    SD_MODELS=$(curl -sf --connect-timeout 3 "http://${WINDOWS_VM_IP}:7860/sdapi/v1/sd-models" 2>/dev/null | jq -c '[.[].model_name] // []' || echo '[]')
    log "  Stable Diffusion: ONLINE"
else
    log "  Stable Diffusion: OFFLINE (optional)"
fi

# Check ComfyUI (optional)
log "Checking ComfyUI at $WINDOWS_VM_IP:8188..."
COMFY_STATUS="offline"
COMFY_GPU_INFO="{}"
if curl -sf --connect-timeout 5 "http://${WINDOWS_VM_IP}:8188/system_stats" > /dev/null 2>&1; then
    COMFY_STATUS="online"
    COMFY_GPU_INFO=$(curl -sf --connect-timeout 3 "http://${WINDOWS_VM_IP}:8188/system_stats" 2>/dev/null | jq -c '.devices[0] // {}' || echo '{}')
    log "  ComfyUI: ONLINE"
else
    log "  ComfyUI: OFFLINE (optional)"
fi

# Compute summary
ANY_LLM="false"
[[ "$WINDOWS_OLLAMA_STATUS" == "online" ]] || [[ "$UBUNTU_OLLAMA_STATUS" == "online" ]] && ANY_LLM="true"

PREFERRED_LLM="null"
[[ "$WINDOWS_OLLAMA_STATUS" == "online" ]] && PREFERRED_LLM='"windows_vm"'
[[ "$UBUNTU_OLLAMA_STATUS" == "online" ]] && [[ "$PREFERRED_LLM" == "null" ]] && PREFERRED_LLM='"ubuntu"'

IMAGE_GEN="false"
[[ "$SD_STATUS" == "online" ]] && IMAGE_GEN="true"

VIDEO_GEN="false"
[[ "$COMFY_STATUS" == "online" ]] && VIDEO_GEN="true"

# Write state file
cat > "$STATE_FILE" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "windows_vm": {
    "ip": "$WINDOWS_VM_IP",
    "reachable": $WINDOWS_VM_REACHABLE,
    "ollama": {
      "status": "$WINDOWS_OLLAMA_STATUS",
      "url": "http://${WINDOWS_VM_IP}:11434",
      "version": "$WINDOWS_OLLAMA_VERSION",
      "models": $WINDOWS_OLLAMA_MODELS
    },
    "stable_diffusion": {
      "status": "$SD_STATUS",
      "url": "http://${WINDOWS_VM_IP}:7860",
      "models": $SD_MODELS
    },
    "comfyui": {
      "status": "$COMFY_STATUS",
      "url": "http://${WINDOWS_VM_IP}:8188",
      "gpu": $COMFY_GPU_INFO
    }
  },
  "ubuntu": {
    "ip": "$UBUNTU_SERVER_IP",
    "ollama": {
      "status": "$UBUNTU_OLLAMA_STATUS",
      "url": "http://${UBUNTU_SERVER_IP}:11434",
      "models": $UBUNTU_OLLAMA_MODELS
    }
  },
  "summary": {
    "any_llm_available": $ANY_LLM,
    "image_generation_available": $IMAGE_GEN,
    "video_generation_available": $VIDEO_GEN,
    "preferred_llm": $PREFERRED_LLM
  }
}
EOF

# Append to history (for debugging/monitoring)
echo "{\"ts\":\"$(date -Iseconds)\",\"ollama\":\"$WINDOWS_OLLAMA_STATUS\",\"sd\":\"$SD_STATUS\",\"comfy\":\"$COMFY_STATUS\"}" >> "$HISTORY_FILE" 2>/dev/null || true
# Keep only last 1000 entries
tail -1000 "$HISTORY_FILE" > "${HISTORY_FILE}.tmp" 2>/dev/null && mv "${HISTORY_FILE}.tmp" "$HISTORY_FILE" || true

log ""
log "State file written to: $STATE_FILE"
$QUIET_MODE || cat "$STATE_FILE"
log ""
log "Done! Dashboard will use local AI when available."
