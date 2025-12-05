#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

VM_NAME="${VM_NAME:-RDPWindows}"
VM_IP="${VM_IP:-192.168.122.250}"
WG_INTERFACE="${WG_INTERFACE:-wg0}"
SUNSHINE_PORTS_TCP="47984:47990"
SUNSHINE_PORTS_UDP="47984:47990,48010"

log_info() { echo -e "\033[0;34m[INFO]\033[0m $*"; }
log_ok() { echo -e "\033[0;32m[OK]\033[0m $*"; }
log_warn() { echo -e "\033[0;33m[WARN]\033[0m $*"; }
log_error() { echo -e "\033[0;31m[ERROR]\033[0m $*"; }

echo "═══════════════════════════════════════════════════════════════"
echo "  Sunshine GameStream VM Manager"
echo "═══════════════════════════════════════════════════════════════"
echo ""

check_vm_status() {
    local status
    status=$(virsh domstate "$VM_NAME" 2>/dev/null || echo "not found")
    echo "$status"
}

start_vm() {
    log_info "Starting VM: $VM_NAME"
    
    local status
    status=$(check_vm_status)
    
    if [[ "$status" == "running" ]]; then
        log_ok "VM is already running"
        return 0
    elif [[ "$status" == "shut off" ]]; then
        virsh start "$VM_NAME"
        log_ok "VM started"
    elif [[ "$status" == "paused" ]]; then
        virsh resume "$VM_NAME"
        log_ok "VM resumed"
    else
        log_error "VM '$VM_NAME' not found. Check 'virsh list --all'"
        return 1
    fi
    
    log_info "Waiting for VM to boot (30 seconds)..."
    sleep 30
}

setup_port_forwarding() {
    log_info "Setting up port forwarding for GameStream..."
    
    if ! ip link show "$WG_INTERFACE" &>/dev/null; then
        log_warn "WireGuard interface $WG_INTERFACE not found, skipping WAN forwarding"
        return 0
    fi
    
    sudo iptables -t nat -C PREROUTING -i "$WG_INTERFACE" -p tcp --dport 47984:47990 -j DNAT --to-destination "$VM_IP" 2>/dev/null || \
        sudo iptables -t nat -A PREROUTING -i "$WG_INTERFACE" -p tcp --dport 47984:47990 -j DNAT --to-destination "$VM_IP"
    
    sudo iptables -t nat -C PREROUTING -i "$WG_INTERFACE" -p udp --dport 47984:47990 -j DNAT --to-destination "$VM_IP" 2>/dev/null || \
        sudo iptables -t nat -A PREROUTING -i "$WG_INTERFACE" -p udp --dport 47984:47990 -j DNAT --to-destination "$VM_IP"
    
    sudo iptables -t nat -C PREROUTING -i "$WG_INTERFACE" -p udp --dport 48010 -j DNAT --to-destination "$VM_IP" 2>/dev/null || \
        sudo iptables -t nat -A PREROUTING -i "$WG_INTERFACE" -p udp --dport 48010 -j DNAT --to-destination "$VM_IP"
    
    sudo iptables -C FORWARD -i "$WG_INTERFACE" -o virbr0 -p tcp --dport 47984:47990 -j ACCEPT 2>/dev/null || \
        sudo iptables -A FORWARD -i "$WG_INTERFACE" -o virbr0 -p tcp --dport 47984:47990 -j ACCEPT
    
    sudo iptables -C FORWARD -i "$WG_INTERFACE" -o virbr0 -p udp --dport 47984:47990 -j ACCEPT 2>/dev/null || \
        sudo iptables -A FORWARD -i "$WG_INTERFACE" -o virbr0 -p udp --dport 47984:47990 -j ACCEPT
    
    sudo iptables -C FORWARD -i "$WG_INTERFACE" -o virbr0 -p udp --dport 48010 -j ACCEPT 2>/dev/null || \
        sudo iptables -A FORWARD -i "$WG_INTERFACE" -o virbr0 -p udp --dport 48010 -j ACCEPT
    
    log_ok "Port forwarding configured"
    
    if command -v netfilter-persistent &>/dev/null; then
        sudo netfilter-persistent save &>/dev/null || true
        log_info "iptables rules saved"
    fi
}

check_sunshine() {
    log_info "Checking Sunshine service..."
    
    if timeout 5 nc -zv "$VM_IP" 47989 2>&1 | grep -q "succeeded"; then
        log_ok "Sunshine is responding on $VM_IP:47989"
        return 0
    else
        log_warn "Sunshine not responding (VM may still be booting)"
        return 1
    fi
}

check_wireguard() {
    log_info "Checking WireGuard tunnel..."
    
    if ip link show "$WG_INTERFACE" &>/dev/null; then
        local wg_ip
        wg_ip=$(ip -4 addr show "$WG_INTERFACE" | grep -oP '(?<=inet\s)\d+(\.\d+){3}' || echo "unknown")
        log_ok "WireGuard active: $wg_ip"
        
        if ping -c 1 -W 2 10.200.0.1 &>/dev/null; then
            log_ok "Linode tunnel reachable (10.200.0.1)"
        else
            log_warn "Linode tunnel not responding"
        fi
    else
        log_warn "WireGuard not active"
    fi
}

show_status() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  GameStream Status"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "  VM Name:     $VM_NAME"
    echo "  VM Status:   $(check_vm_status)"
    echo "  VM IP:       $VM_IP"
    echo ""
    echo "  Sunshine:"
    if check_sunshine &>/dev/null; then
        echo "    Status:    Running"
        echo "    Web UI:    https://$VM_IP:47990"
    else
        echo "    Status:    Not responding"
    fi
    echo ""
    echo "  Connect via Moonlight:"
    echo "    LAN:       $VM_IP"
    echo "    WAN:       Via WireGuard (10.200.0.2)"
    echo ""
}

case "${1:-start}" in
    start)
        start_vm
        setup_port_forwarding
        check_wireguard
        sleep 10
        check_sunshine || true
        show_status
        ;;
    stop)
        log_info "Shutting down VM: $VM_NAME"
        virsh shutdown "$VM_NAME" 2>/dev/null || virsh destroy "$VM_NAME" 2>/dev/null || true
        log_ok "VM shutdown initiated"
        ;;
    status)
        show_status
        ;;
    restart)
        "$0" stop
        sleep 5
        "$0" start
        ;;
    *)
        echo "Usage: $0 {start|stop|status|restart}"
        exit 1
        ;;
esac
