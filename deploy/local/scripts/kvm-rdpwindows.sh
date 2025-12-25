#!/bin/bash
set -euo pipefail

readonly SCRIPT_NAME="kvm-rdpwindows"
readonly VM_NAME="RDPWindows"
readonly GPU_ADDR="0000:03:00"
readonly GPU_FUNC0="${GPU_ADDR}.0"
readonly GPU_FUNC1="${GPU_ADDR}.1"
readonly VIRTIOFS_SHARE="/srv/vm-share"
readonly LOG_DIR="/var/log/kvm-orchestrator"
readonly PID_DIR="/run/kvm-orchestrator"
readonly SUNSHINE_PORT=47990
readonly MAX_RETRIES=3
readonly RETRY_DELAY=5

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_DIR}/${SCRIPT_NAME}.log"; logger -t "$SCRIPT_NAME" "$*"; }
success() { log "SUCCESS: $*"; }
error() { log "ERROR: $*"; }
warn() { log "WARN: $*"; }

init_dirs() {
    mkdir -p "$LOG_DIR" "$PID_DIR" "$VIRTIOFS_SHARE" 2>/dev/null || true
    chmod 755 "$VIRTIOFS_SHARE" 2>/dev/null || true
}

gpu_exists() {
    [[ -d "/sys/bus/pci/devices/${GPU_FUNC0}" ]]
}

gpu_wake() {
    log "Waking GPU from power state..."
    
    for dev in "$GPU_FUNC0" "$GPU_FUNC1"; do
        local power_file="/sys/bus/pci/devices/${dev}/power/control"
        if [[ -f "$power_file" ]]; then
            echo "on" > "$power_file" 2>/dev/null || true
        fi
    done
    
    local d3_check
    d3_check=$(cat /sys/bus/pci/devices/${GPU_FUNC0}/power_state 2>/dev/null || echo "unknown")
    
    if [[ "$d3_check" == "D3cold" ]] || ! gpu_exists; then
        warn "GPU in D3cold or missing, performing PCIe reset..."
        gpu_reset
    fi
}

gpu_reset() {
    log "Performing GPU PCIe remove/rescan..."
    
    for dev in "$GPU_FUNC0" "$GPU_FUNC1"; do
        if [[ -f "/sys/bus/pci/devices/${dev}/remove" ]]; then
            echo 1 > "/sys/bus/pci/devices/${dev}/remove" 2>/dev/null || true
        fi
    done
    
    sleep 2
    
    echo 1 > /sys/bus/pci/rescan
    sleep 3
    
    if gpu_exists; then
        success "GPU recovered after PCIe rescan"
        
        for dev in "$GPU_FUNC0" "$GPU_FUNC1"; do
            local power_file="/sys/bus/pci/devices/${dev}/power/control"
            if [[ -f "$power_file" ]]; then
                echo "on" > "$power_file" 2>/dev/null || true
            fi
        done
        return 0
    else
        error "GPU not found after rescan"
        return 1
    fi
}

gpu_verify_vfio() {
    log "Verifying GPU bound to vfio-pci..."
    
    local driver0 driver1
    driver0=$(basename "$(readlink -f /sys/bus/pci/devices/${GPU_FUNC0}/driver 2>/dev/null)" 2>/dev/null || echo "none")
    driver1=$(basename "$(readlink -f /sys/bus/pci/devices/${GPU_FUNC1}/driver 2>/dev/null)" 2>/dev/null || echo "none")
    
    if [[ "$driver0" == "vfio-pci" ]] && [[ "$driver1" == "vfio-pci" ]]; then
        success "GPU bound to vfio-pci"
        return 0
    else
        error "GPU not bound to vfio-pci (func0: $driver0, func1: $driver1)"
        return 1
    fi
}

cleanup_virtiofsd() {
    log "Cleaning up stale virtiofsd processes..."
    
    pkill -9 -f "virtiofsd.*${VM_NAME}" 2>/dev/null || true
    pkill -9 virtiofsd 2>/dev/null || true
    
    rm -f /var/log/libvirt/qemu/${VM_NAME}*virtiofsd* 2>/dev/null || true
    rm -f /var/lib/libvirt/qemu/${VM_NAME}*.sock 2>/dev/null || true
    
    sleep 1
    success "virtiofsd cleanup complete"
}

cleanup_stale_vm() {
    log "Cleaning up any stale VM state..."
    
    local state
    state=$(virsh domstate "$VM_NAME" 2>/dev/null || echo "unknown")
    
    case "$state" in
        "running")
            log "VM already running, nothing to clean"
            ;;
        "paused"|"pmsuspended")
            warn "VM in suspended state, destroying..."
            virsh destroy "$VM_NAME" 2>/dev/null || true
            sleep 2
            ;;
        "shut off"|"unknown")
            log "VM not running, cleaning any residual state..."
            virsh destroy "$VM_NAME" 2>/dev/null || true
            ;;
    esac
    
    pkill -9 -f "qemu.*${VM_NAME}" 2>/dev/null || true
    sleep 1
}

verify_network() {
    log "Verifying network configuration..."
    
    if ip link show br0 &>/dev/null; then
        success "Bridge br0 exists"
        return 0
    fi
    
    if virsh net-info default &>/dev/null; then
        local net_state
        net_state=$(virsh net-info default 2>/dev/null | grep -i "^Active:" | awk '{print $2}')
        if [[ "$net_state" == "yes" ]]; then
            success "Default NAT network active"
            return 0
        else
            log "Starting default network..."
            virsh net-start default 2>/dev/null || true
        fi
    fi
    
    warn "No bridge found, VM will use NAT (virbr0)"
    return 0
}

verify_virtiofs_share() {
    log "Verifying virtiofs share..."
    
    if [[ -d "$VIRTIOFS_SHARE" ]]; then
        success "virtiofs share exists: $VIRTIOFS_SHARE"
        return 0
    else
        log "Creating virtiofs share directory..."
        mkdir -p "$VIRTIOFS_SHARE"/{files,clipboard,1tb}
        chown -R 1000:1000 "$VIRTIOFS_SHARE"
        chmod 755 "$VIRTIOFS_SHARE"
        success "Created virtiofs share: $VIRTIOFS_SHARE"
    fi
}

preflight() {
    log "=== PREFLIGHT CHECKS ==="
    
    init_dirs
    
    cleanup_stale_vm
    cleanup_virtiofsd
    
    if ! gpu_exists; then
        warn "GPU not found, attempting recovery..."
        gpu_reset || { error "GPU recovery failed"; return 1; }
    fi
    
    gpu_wake
    gpu_verify_vfio || return 1
    
    verify_network
    verify_virtiofs_share
    
    success "=== PREFLIGHT COMPLETE ==="
    return 0
}

start_vm() {
    log "=== STARTING VM: $VM_NAME ==="
    
    local attempt=1
    while [[ $attempt -le $MAX_RETRIES ]]; do
        log "Start attempt $attempt of $MAX_RETRIES..."
        
        if virsh start "$VM_NAME" 2>&1; then
            success "VM started successfully"
            
            log "Waiting for VM to boot..."
            sleep 10
            
            local state
            state=$(virsh domstate "$VM_NAME" 2>/dev/null || echo "unknown")
            if [[ "$state" == "running" ]]; then
                success "VM is running"
                
                local vm_ip
                vm_ip=$(get_vm_ip)
                if [[ -n "$vm_ip" ]]; then
                    success "VM IP: $vm_ip"
                fi
                
                return 0
            else
                error "VM state after start: $state"
            fi
        fi
        
        error "Start attempt $attempt failed"
        
        cleanup_stale_vm
        cleanup_virtiofsd
        gpu_reset || true
        
        sleep $RETRY_DELAY
        ((attempt++))
    done
    
    error "Failed to start VM after $MAX_RETRIES attempts"
    return 1
}

get_vm_ip() {
    virsh domifaddr "$VM_NAME" 2>/dev/null | grep -oP '\d+\.\d+\.\d+\.\d+' | head -1 || \
    virsh net-dhcp-leases default 2>/dev/null | grep -i "$VM_NAME" | grep -oP '\d+\.\d+\.\d+\.\d+' | head -1 || \
    echo ""
}

stop_vm() {
    log "=== STOPPING VM: $VM_NAME ==="
    
    local state
    state=$(virsh domstate "$VM_NAME" 2>/dev/null || echo "unknown")
    
    if [[ "$state" != "running" ]]; then
        log "VM not running (state: $state)"
        cleanup_virtiofsd
        return 0
    fi
    
    log "Sending ACPI shutdown..."
    virsh shutdown "$VM_NAME" 2>/dev/null || true
    
    local timeout=60
    local elapsed=0
    while [[ $elapsed -lt $timeout ]]; do
        state=$(virsh domstate "$VM_NAME" 2>/dev/null || echo "unknown")
        if [[ "$state" == "shut off" ]]; then
            success "VM shut down gracefully"
            cleanup_virtiofsd
            return 0
        fi
        sleep 2
        ((elapsed+=2))
    done
    
    warn "Graceful shutdown timed out, forcing destroy..."
    virsh destroy "$VM_NAME" 2>/dev/null || true
    cleanup_virtiofsd
    
    success "VM stopped"
    return 0
}

status() {
    local state
    state=$(virsh domstate "$VM_NAME" 2>/dev/null || echo "unknown")
    
    echo "=== KVM Gaming VM Status ==="
    echo "VM Name: $VM_NAME"
    echo "State: $state"
    
    if [[ "$state" == "running" ]]; then
        local vm_ip
        vm_ip=$(get_vm_ip)
        echo "VM IP: ${vm_ip:-detecting...}"
        echo "Sunshine: https://${vm_ip:-<vm-ip>}:$SUNSHINE_PORT"
        echo "Tailscale: 100.118.44.102"
    fi
    
    echo ""
    echo "GPU Status:"
    if gpu_exists; then
        local driver
        driver=$(basename "$(readlink -f /sys/bus/pci/devices/${GPU_FUNC0}/driver 2>/dev/null)" 2>/dev/null || echo "none")
        local power
        power=$(cat /sys/bus/pci/devices/${GPU_FUNC0}/power_state 2>/dev/null || echo "unknown")
        echo "  Device: $GPU_FUNC0"
        echo "  Driver: $driver"
        echo "  Power: $power"
    else
        echo "  GPU not detected"
    fi
    
    echo ""
    echo "Network:"
    if ip link show br0 &>/dev/null; then
        echo "  Bridge: br0 (LAN access)"
    else
        echo "  Network: NAT (virbr0)"
    fi
}

health() {
    log "=== HEALTH CHECK ==="
    
    local state
    state=$(virsh domstate "$VM_NAME" 2>/dev/null || echo "unknown")
    
    if [[ "$state" != "running" ]]; then
        warn "VM not running, attempting recovery..."
        preflight && start_vm
        return $?
    fi
    
    if ! gpu_exists; then
        error "GPU disappeared while VM running!"
        return 1
    fi
    
    success "Health check passed"
    return 0
}

usage() {
    cat << EOF
KVM Gaming VM Manager - Robust startup with automatic recovery

Usage: $0 <command>

Commands:
  start     Run preflight checks and start VM
  stop      Gracefully stop VM
  restart   Stop then start VM
  status    Show VM and GPU status
  health    Health check with auto-recovery
  preflight Run preflight checks only (no start)
  reset-gpu Force GPU PCIe reset

Examples:
  $0 start      # Full startup with preflight
  $0 status     # Check current state
  $0 health     # Auto-recover if needed
EOF
}

main() {
    if [[ $EUID -ne 0 ]]; then
        echo "This script must be run as root"
        exit 1
    fi
    
    init_dirs
    
    local cmd="${1:-}"
    
    case "$cmd" in
        start)
            preflight && start_vm
            ;;
        stop)
            stop_vm
            ;;
        restart)
            stop_vm
            sleep 3
            preflight && start_vm
            ;;
        status)
            status
            ;;
        health)
            health
            ;;
        preflight)
            preflight
            ;;
        reset-gpu)
            gpu_reset
            ;;
        *)
            usage
            exit 1
            ;;
    esac
}

main "$@"
