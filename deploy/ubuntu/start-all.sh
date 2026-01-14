#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/nebula/ubuntu-startup.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

wait_for_service() {
    local service=$1
    local max_attempts=${2:-30}
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            return 0
        fi
        sleep 1
        ((attempt++))
    done
    return 1
}

wait_for_vm() {
    local vm_name=$1
    local max_attempts=${2:-60}
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        state=$(sudo virsh domstate "$vm_name" 2>/dev/null || echo "unknown")
        if [ "$state" = "running" ]; then
            return 0
        fi
        sleep 2
        ((attempt++))
    done
    return 1
}

mkdir -p /var/log/nebula

log "=========================================="
log "Starting Nebula Command - Ubuntu Host"
log "=========================================="

log "1. Starting libvirtd..."
sudo systemctl start libvirtd
wait_for_service libvirtd
log "   libvirtd: $(systemctl is-active libvirtd)"

log "2. Mounting NAS shares..."
sudo mount -a 2>/dev/null || log "   Some mounts may have failed"
log "   NAS mounts: $(mount | grep -cE '(nas|nfs|cifs)' || echo 0) active"

log "3. Starting Windows 11 VM..."
VM_STATE=$(sudo virsh domstate windows11 2>/dev/null || echo "not found")
if [ "$VM_STATE" != "running" ]; then
    sudo virsh start windows11 2>/dev/null || log "   VM may already be starting"
    log "   Waiting for VM to boot..."
    if wait_for_vm windows11 120; then
        log "   Windows VM: running"
    else
        log "   Windows VM: boot timeout (may still be starting)"
    fi
else
    log "   Windows VM: already running"
fi

log "4. Starting Docker services..."
if command -v docker &> /dev/null; then
    sudo systemctl start docker
    
    COMPOSE_FILES=(
        "/opt/nebula/docker/plex/docker-compose.yml"
        "/opt/nebula/docker/transmission/docker-compose.yml"
    )
    
    for compose_file in "${COMPOSE_FILES[@]}"; do
        if [ -f "$compose_file" ]; then
            service_name=$(basename "$(dirname "$compose_file")")
            log "   Starting $service_name..."
            docker compose -f "$compose_file" up -d 2>/dev/null || log "   $service_name: failed to start"
        fi
    done
else
    log "   Docker not installed, skipping..."
fi

log "5. Starting VNC server..."
if command -v vncserver &> /dev/null; then
    vncserver -kill :1 2>/dev/null || true
    vncserver :1 -geometry 1920x1080 -depth 24 2>/dev/null || log "   VNC: failed to start"
    log "   VNC: listening on :5901"
else
    log "   VNC not installed, skipping..."
fi

log "6. Starting xrdp..."
if systemctl list-unit-files | grep -q xrdp; then
    sudo systemctl start xrdp
    log "   xrdp: $(systemctl is-active xrdp)"
else
    log "   xrdp not installed, skipping..."
fi

log "7. Verifying Tailscale..."
if command -v tailscale &> /dev/null; then
    TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "not connected")
    log "   Tailscale IP: $TAILSCALE_IP"
else
    log "   Tailscale not installed"
fi

log ""
log "=========================================="
log "Ubuntu Host Startup Complete"
log "=========================================="
log ""
log "Services Status:"
log "  libvirtd:    $(systemctl is-active libvirtd 2>/dev/null || echo 'unknown')"
log "  Windows VM:  $(sudo virsh domstate windows11 2>/dev/null || echo 'unknown')"
log "  Docker:      $(systemctl is-active docker 2>/dev/null || echo 'unknown')"
log "  VNC (:5901): $(vncserver -list 2>/dev/null | grep -c ':1' || echo '0') sessions"
log "  xrdp:        $(systemctl is-active xrdp 2>/dev/null || echo 'unknown')"
log ""
log "Remote Access:"
log "  VNC:  vnc://$(tailscale ip -4 2>/dev/null || echo 'localhost'):5901"
log "  RDP:  rdp://$(tailscale ip -4 2>/dev/null || echo 'localhost'):3389"
log ""
