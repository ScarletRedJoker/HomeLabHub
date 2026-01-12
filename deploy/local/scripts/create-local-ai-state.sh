#!/bin/bash
# Create/update local-ai.json state file for production use
# Run this on Linode after Windows VM Ollama is set up

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="/opt/homelab/HomeLabHub/deploy/shared/state"
STATE_FILE="$STATE_DIR/local-ai.json"

WINDOWS_VM_IP="${WINDOWS_VM_IP:-100.118.44.102}"
UBUNTU_SERVER_IP="${UBUNTU_SERVER_IP:-100.66.61.51}"

echo "=== Creating Local AI State File ==="

mkdir -p "$STATE_DIR"

# Check Windows VM Ollama
echo "Checking Windows VM Ollama at $WINDOWS_VM_IP:11434..."
WINDOWS_OLLAMA_STATUS="offline"
WINDOWS_OLLAMA_VERSION=""
if curl -sf --connect-timeout 5 "http://${WINDOWS_VM_IP}:11434/api/version" > /dev/null 2>&1; then
    WINDOWS_OLLAMA_STATUS="online"
    WINDOWS_OLLAMA_VERSION=$(curl -sf "http://${WINDOWS_VM_IP}:11434/api/version" | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
    echo "  Windows VM Ollama: ONLINE (v$WINDOWS_OLLAMA_VERSION)"
else
    echo "  Windows VM Ollama: OFFLINE"
fi

# Check Ubuntu Ollama (fallback)
echo "Checking Ubuntu Ollama at $UBUNTU_SERVER_IP:11434..."
UBUNTU_OLLAMA_STATUS="offline"
if curl -sf --connect-timeout 5 "http://${UBUNTU_SERVER_IP}:11434/api/version" > /dev/null 2>&1; then
    UBUNTU_OLLAMA_STATUS="online"
    echo "  Ubuntu Ollama: ONLINE"
else
    echo "  Ubuntu Ollama: OFFLINE"
fi

# Check Stable Diffusion (optional)
echo "Checking Stable Diffusion at $WINDOWS_VM_IP:7860..."
SD_STATUS="offline"
if curl -sf --connect-timeout 5 "http://${WINDOWS_VM_IP}:7860/sdapi/v1/sd-models" > /dev/null 2>&1; then
    SD_STATUS="online"
    echo "  Stable Diffusion: ONLINE"
else
    echo "  Stable Diffusion: OFFLINE (optional)"
fi

# Check ComfyUI (optional)
echo "Checking ComfyUI at $WINDOWS_VM_IP:8188..."
COMFY_STATUS="offline"
if curl -sf --connect-timeout 5 "http://${WINDOWS_VM_IP}:8188/system_stats" > /dev/null 2>&1; then
    COMFY_STATUS="online"
    echo "  ComfyUI: ONLINE"
else
    echo "  ComfyUI: OFFLINE (optional)"
fi

# Write state file
cat > "$STATE_FILE" << EOF
{
  "updated_at": "$(date -Iseconds)",
  "windows_vm": {
    "ip": "$WINDOWS_VM_IP",
    "ollama": {
      "status": "$WINDOWS_OLLAMA_STATUS",
      "url": "http://${WINDOWS_VM_IP}:11434",
      "version": "$WINDOWS_OLLAMA_VERSION"
    },
    "stable_diffusion": {
      "status": "$SD_STATUS",
      "url": "http://${WINDOWS_VM_IP}:7860"
    },
    "comfyui": {
      "status": "$COMFY_STATUS",
      "url": "http://${WINDOWS_VM_IP}:8188"
    }
  },
  "ubuntu_server": {
    "ip": "$UBUNTU_SERVER_IP",
    "ollama": {
      "status": "$UBUNTU_OLLAMA_STATUS",
      "url": "http://${UBUNTU_SERVER_IP}:11434"
    }
  }
}
EOF

echo ""
echo "State file written to: $STATE_FILE"
echo ""
cat "$STATE_FILE"
echo ""
echo "Done! Dashboard will use local AI when available."
