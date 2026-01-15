#!/bin/bash
#
# Nebula Command - Ubuntu Home Server Bootstrap Script
# Services: WoL Relay, KVM management, Plex, SSH Gateway
#
# This script is idempotent - safe to run multiple times
#

set -e

export NEBULA_ENV=ubuntu-home
export NEBULA_ROLE=relay
export NEBULA_DIR="${NEBULA_DIR:-/opt/nebula}"
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

detect_environment() {
    log INFO "Detecting environment..."
    
    if [[ -d /etc/libvirt ]] || command -v virsh &> /dev/null; then
        log INFO "  Detected: Ubuntu Home Server (KVM hypervisor)"
    elif [[ -d /home/evin ]]; then
        log INFO "  Detected: Ubuntu Home Server (user home)"
    else
        log WARN "  Could not confirm Ubuntu Home environment"
    fi
    
    export NEBULA_ENV=ubuntu-home
}

load_secrets() {
    log INFO "Loading secrets..."
    
    local env_file="$NEBULA_DIR/.env"
    local secrets_dir="$NEBULA_DIR/secrets"
    
    if [[ -f "$env_file" ]]; then
        log INFO "  Loading from $env_file"
        set -a
        source "$env_file"
        set +a
    fi
    
    if [[ -d "$secrets_dir" ]]; then
        for secret_file in "$secrets_dir"/*; do
            if [[ -f "$secret_file" ]]; then
                local key=$(basename "$secret_file")
                local value=$(cat "$secret_file")
                export "$key"="$value"
            fi
        done
    fi
    
    log INFO "  Secrets loaded"
}

start_libvirtd() {
    log INFO "Starting libvirtd..."
    
    if systemctl list-unit-files | grep -q libvirtd; then
        sudo systemctl start libvirtd
        sleep 2
        log INFO "  libvirtd: $(systemctl is-active libvirtd)"
    else
        log WARN "  libvirtd not installed"
    fi
}

mount_nas_shares() {
    log INFO "Mounting NAS shares..."
    
    sudo mount -a 2>/dev/null || log WARN "  Some mounts may have failed"
    
    local mount_count=$(mount | grep -cE '(nas|nfs|cifs)' || echo 0)
    log INFO "  NAS mounts: $mount_count active"
}

start_windows_vm() {
    log INFO "Managing Windows 11 VM..."
    
    if ! command -v virsh &> /dev/null; then
        log WARN "  virsh not available, skipping VM management"
        return
    fi
    
    local vm_name="${WINDOWS_VM_NAME:-windows11}"
    local vm_state=$(sudo virsh domstate "$vm_name" 2>/dev/null || echo "not found")
    
    if [[ "$vm_state" == "running" ]]; then
        log INFO "  $vm_name: already running"
    elif [[ "$vm_state" == "shut off" ]]; then
        log INFO "  Starting $vm_name..."
        sudo virsh start "$vm_name" 2>/dev/null || log WARN "  Failed to start VM"
        
        log INFO "  Waiting for VM to boot..."
        local attempts=0
        local max_attempts=60
        
        while [[ $attempts -lt $max_attempts ]]; do
            local state=$(sudo virsh domstate "$vm_name" 2>/dev/null || echo "unknown")
            if [[ "$state" == "running" ]]; then
                log INFO "  $vm_name: running"
                break
            fi
            sleep 2
            ((attempts++))
        done
    else
        log WARN "  $vm_name: $vm_state"
    fi
}

start_docker_services() {
    log INFO "Starting Docker services..."
    
    if ! command -v docker &> /dev/null; then
        log WARN "  Docker not installed"
        return
    fi
    
    sudo systemctl start docker
    
    local compose_files=(
        "$NEBULA_DIR/docker/plex/docker-compose.yml"
        "$NEBULA_DIR/docker/transmission/docker-compose.yml"
    )
    
    for compose_file in "${compose_files[@]}"; do
        if [[ -f "$compose_file" ]]; then
            local service_name=$(basename "$(dirname "$compose_file")")
            log INFO "  Starting $service_name..."
            docker compose -f "$compose_file" up -d 2>/dev/null || log WARN "  $service_name failed"
        fi
    done
}

start_vnc_server() {
    log INFO "Starting VNC server..."
    
    if ! command -v vncserver &> /dev/null; then
        log WARN "  VNC server not installed"
        return
    fi
    
    vncserver -kill :1 2>/dev/null || true
    vncserver :1 -geometry 1920x1080 -depth 24 2>/dev/null || log WARN "  VNC failed to start"
    log INFO "  VNC listening on :5901"
}

start_xrdp() {
    log INFO "Starting xrdp..."
    
    if systemctl list-unit-files | grep -q xrdp; then
        sudo systemctl start xrdp
        log INFO "  xrdp: $(systemctl is-active xrdp)"
    else
        log WARN "  xrdp not installed"
    fi
}

verify_tailscale() {
    log INFO "Verifying Tailscale..."
    
    if command -v tailscale &> /dev/null; then
        local ts_ip=$(tailscale ip -4 2>/dev/null || echo "not connected")
        log INFO "  Tailscale IP: $ts_ip"
        export TAILSCALE_IP="$ts_ip"
    else
        log WARN "  Tailscale not installed"
    fi
}

setup_wol_relay() {
    log INFO "Setting up WoL relay capability..."
    
    if [[ -n "$WINDOWS_VM_MAC" ]]; then
        log INFO "  Windows VM MAC: $WINDOWS_VM_MAC"
        log INFO "  WoL relay ready for Windows VM wake requests"
    else
        log WARN "  WINDOWS_VM_MAC not set, WoL relay disabled"
    fi
}

print_summary() {
    echo ""
    log INFO "=========================================="
    log INFO "Ubuntu Home Bootstrap Complete"
    log INFO "=========================================="
    echo ""
    log INFO "Services Status:"
    log INFO "  libvirtd:    $(systemctl is-active libvirtd 2>/dev/null || echo 'unknown')"
    log INFO "  Windows VM:  $(sudo virsh domstate ${WINDOWS_VM_NAME:-windows11} 2>/dev/null || echo 'unknown')"
    log INFO "  Docker:      $(systemctl is-active docker 2>/dev/null || echo 'unknown')"
    log INFO "  VNC (:5901): $(vncserver -list 2>/dev/null | grep -c ':1' || echo '0') sessions"
    log INFO "  xrdp:        $(systemctl is-active xrdp 2>/dev/null || echo 'unknown')"
    echo ""
    log INFO "Remote Access:"
    log INFO "  VNC:  vnc://${TAILSCALE_IP:-localhost}:5901"
    log INFO "  RDP:  rdp://${TAILSCALE_IP:-localhost}:3389"
    log INFO "  SSH:  ssh://${TAILSCALE_IP:-localhost}:22"
    echo ""
    log INFO "Capabilities:"
    log INFO "  - WoL Relay for Windows VM"
    log INFO "  - SSH Gateway"
    log INFO "  - KVM/libvirt hypervisor"
    log INFO "  - Plex media server"
    log INFO "  - NAS connectivity"
    echo ""
}

main() {
    mkdir -p /var/log/nebula
    
    echo ""
    log INFO "=========================================="
    log INFO "Nebula Command - Ubuntu Home Bootstrap"
    log INFO "Environment: $NEBULA_ENV | Role: $NEBULA_ROLE"
    log INFO "=========================================="
    echo ""
    
    detect_environment
    load_secrets
    start_libvirtd
    mount_nas_shares
    start_windows_vm
    start_docker_services
    start_vnc_server
    start_xrdp
    verify_tailscale
    setup_wol_relay
    print_summary
}

main "$@"
