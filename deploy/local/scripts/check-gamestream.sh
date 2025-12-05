#!/bin/bash
set -euo pipefail

VM_NAME="${VM_NAME:-RDPWindows}"
VM_IP="${VM_IP:-192.168.122.250}"
WG_INTERFACE="${WG_INTERFACE:-wg0}"

log_ok() { echo -e "\033[0;32m[OK]\033[0m $*"; }
log_warn() { echo -e "\033[0;33m[WARN]\033[0m $*"; }
log_error() { echo -e "\033[0;31m[ERROR]\033[0m $*"; }
log_info() { echo -e "\033[0;34m[INFO]\033[0m $*"; }

echo "═══════════════════════════════════════════════════════════════"
echo "  GameStream Health Check"
echo "═══════════════════════════════════════════════════════════════"
echo ""

ERRORS=0

echo "━━━ VM Status ━━━"
vm_status=$(virsh domstate "$VM_NAME" 2>/dev/null || echo "not found")
if [[ "$vm_status" == "running" ]]; then
    log_ok "VM '$VM_NAME' is running"
else
    log_error "VM '$VM_NAME' is $vm_status"
    ((ERRORS++)) || true
fi

echo ""
echo "━━━ Sunshine Service ━━━"

check_port() {
    local port=$1
    local proto=$2
    if timeout 2 bash -c "echo >/dev/$proto/$VM_IP/$port" 2>/dev/null; then
        return 0
    elif command -v nc &>/dev/null && timeout 2 nc -z${proto:0:1} "$VM_IP" "$port" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

if check_port 47989 tcp; then
    log_ok "Sunshine HTTPS API responding ($VM_IP:47989)"
else
    log_warn "Sunshine HTTPS API not responding ($VM_IP:47989)"
    ((ERRORS++)) || true
fi

if check_port 47984 tcp; then
    log_ok "Sunshine RTSP port open ($VM_IP:47984)"
else
    log_warn "Sunshine RTSP port not responding ($VM_IP:47984)"
fi

echo ""
echo "━━━ Network ━━━"

if ip link show "$WG_INTERFACE" &>/dev/null; then
    wg_ip=$(ip -4 addr show "$WG_INTERFACE" | grep -oP '(?<=inet\s)\d+(\.\d+){3}' || echo "unknown")
    log_ok "WireGuard active: $wg_ip"
    
    if ping -c 1 -W 2 10.200.0.1 &>/dev/null; then
        latency=$(ping -c 3 10.200.0.1 2>/dev/null | tail -1 | awk -F '/' '{print $5}')
        log_ok "Linode tunnel: ${latency}ms latency"
    else
        log_warn "Linode tunnel not responding (10.200.0.1)"
    fi
else
    log_info "WireGuard not active (LAN only)"
fi

if ping -c 1 -W 1 "$VM_IP" &>/dev/null; then
    log_ok "VM network reachable ($VM_IP)"
else
    log_warn "VM network unreachable ($VM_IP)"
    ((ERRORS++)) || true
fi

echo ""
echo "━━━ Port Forwarding ━━━"

if ip link show "$WG_INTERFACE" &>/dev/null; then
    if sudo iptables -t nat -L PREROUTING -n 2>/dev/null | grep -q "47984:47990"; then
        log_ok "NAT rules configured for GameStream ports"
    else
        log_warn "NAT rules missing for GameStream ports"
        echo "       Run: ./deploy/local/scripts/start-sunshine-vm.sh"
    fi
fi

echo ""
echo "━━━ Summary ━━━"
if [[ $ERRORS -eq 0 ]]; then
    echo ""
    log_ok "GameStream is ready!"
    echo ""
    echo "  Connect via Moonlight:"
    echo "    LAN:  $VM_IP"
    if ip link show "$WG_INTERFACE" &>/dev/null; then
        echo "    WAN:  Via WireGuard tunnel"
    fi
    echo ""
else
    echo ""
    log_error "$ERRORS issue(s) found"
    echo ""
    echo "  Troubleshooting:"
    echo "    1. Start VM:    ./deploy/local/scripts/start-sunshine-vm.sh"
    echo "    2. Check logs:  virsh console $VM_NAME"
    echo "    3. Sunshine UI: https://$VM_IP:47990"
    echo ""
fi

exit $ERRORS
