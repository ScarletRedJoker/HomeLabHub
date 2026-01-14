#!/bin/bash
set -e

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Stopping Nebula Command - Ubuntu Host"

log "1. Stopping VNC server..."
vncserver -kill :1 2>/dev/null || true

log "2. Stopping Docker services..."
if command -v docker &> /dev/null; then
    COMPOSE_FILES=(
        "/opt/nebula/docker/plex/docker-compose.yml"
        "/opt/nebula/docker/transmission/docker-compose.yml"
    )
    
    for compose_file in "${COMPOSE_FILES[@]}"; do
        if [ -f "$compose_file" ]; then
            service_name=$(basename "$(dirname "$compose_file")")
            log "   Stopping $service_name..."
            docker compose -f "$compose_file" down 2>/dev/null || true
        fi
    done
fi

log "3. Gracefully shutting down Windows VM..."
VM_STATE=$(sudo virsh domstate windows11 2>/dev/null || echo "not found")
if [ "$VM_STATE" = "running" ]; then
    sudo virsh shutdown windows11
    log "   Waiting for graceful shutdown..."
    for i in {1..60}; do
        state=$(sudo virsh domstate windows11 2>/dev/null || echo "shut off")
        if [ "$state" = "shut off" ]; then
            log "   Windows VM: shut down"
            break
        fi
        sleep 2
    done
fi

log "Ubuntu Host services stopped"
