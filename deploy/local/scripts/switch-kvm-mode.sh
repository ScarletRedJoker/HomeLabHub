#!/bin/bash
# KVM Mode Switcher - Ubuntu Host Orchestrator
# Switches Windows VM between Gaming (Sunshine) and Productivity (RDP) modes
# Usage: ./switch-kvm-mode.sh [gaming|productivity]

set -euo pipefail

VM_IP="${VM_IP:-192.168.122.250}"
VM_USER="${VM_USER:-Evin}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${CYAN}[$(date '+%H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')]${NC} $1"; }
error() { echo -e "${RED}[$(date '+%H:%M:%S')]${NC} $1"; }

usage() {
    echo "Usage: $0 [gaming|productivity|status]"
    echo ""
    echo "Modes:"
    echo "  gaming       - Enable Sunshine for Moonlight game streaming"
    echo "  productivity - Enable RDP for WinApps and remote desktop"
    echo "  status       - Check current mode and service status"
    exit 1
}

check_vm_reachable() {
    log "Checking if Windows VM is reachable..."
    if ! nc -z -w 3 "$VM_IP" 22 2>/dev/null && ! nc -z -w 3 "$VM_IP" 5985 2>/dev/null; then
        if ! ping -c 1 -W 2 "$VM_IP" &>/dev/null; then
            error "Cannot reach Windows VM at $VM_IP"
            exit 1
        fi
    fi
    success "Windows VM is reachable"
}

enable_sunshine_forwarding() {
    log "Enabling Sunshine port forwarding..."
    
    sudo iptables -t nat -C PREROUTING -p tcp --dport 47984:48010 -j DNAT --to-destination ${VM_IP} 2>/dev/null || \
        sudo iptables -t nat -A PREROUTING -p tcp --dport 47984:48010 -j DNAT --to-destination ${VM_IP}
    
    sudo iptables -t nat -C PREROUTING -p udp --dport 47998:48010 -j DNAT --to-destination ${VM_IP} 2>/dev/null || \
        sudo iptables -t nat -A PREROUTING -p udp --dport 47998:48010 -j DNAT --to-destination ${VM_IP}
    
    sudo iptables -C FORWARD -d ${VM_IP} -p tcp --dport 47984:48010 -j ACCEPT 2>/dev/null || \
        sudo iptables -A FORWARD -d ${VM_IP} -p tcp --dport 47984:48010 -j ACCEPT
    
    sudo iptables -C FORWARD -d ${VM_IP} -p udp --dport 47998:48010 -j ACCEPT 2>/dev/null || \
        sudo iptables -A FORWARD -d ${VM_IP} -p udp --dport 47998:48010 -j ACCEPT
    
    sudo iptables -C LIBVIRT_FWI -d ${VM_IP} -o virbr0 -p tcp --dport 47984:48010 -j ACCEPT 2>/dev/null || \
        sudo iptables -I LIBVIRT_FWI 1 -d ${VM_IP} -o virbr0 -p tcp --dport 47984:48010 -j ACCEPT
    
    sudo iptables -C LIBVIRT_FWI -d ${VM_IP} -o virbr0 -p udp --dport 47998:48010 -j ACCEPT 2>/dev/null || \
        sudo iptables -I LIBVIRT_FWI 1 -d ${VM_IP} -o virbr0 -p udp --dport 47998:48010 -j ACCEPT
    
    sudo iptables -t nat -C POSTROUTING -d ${VM_IP} -j MASQUERADE 2>/dev/null || \
        sudo iptables -t nat -A POSTROUTING -d ${VM_IP} -j MASQUERADE
    
    sudo sysctl -w net.ipv4.ip_forward=1 >/dev/null
    
    success "Sunshine port forwarding enabled"
}

disable_sunshine_forwarding() {
    log "Note: Port forwarding rules left in place (harmless when Sunshine is stopped)"
}

stop_winapps_containers() {
    log "Stopping WinApps containers if running..."
    if command -v docker &>/dev/null; then
        docker stop winapps 2>/dev/null || true
        docker stop winapps-rdp 2>/dev/null || true
    fi
    success "WinApps containers stopped"
}

start_winapps_containers() {
    log "Starting WinApps containers..."
    if command -v docker &>/dev/null; then
        docker start winapps 2>/dev/null || true
        docker start winapps-rdp 2>/dev/null || true
    fi
    success "WinApps containers started"
}

test_moonlight_connection() {
    log "Testing Moonlight handshake..."
    if nc -z -w 5 "$VM_IP" 47989 2>/dev/null; then
        success "Sunshine is responding on port 47989"
        return 0
    else
        warn "Sunshine not responding yet (may still be starting)"
        return 1
    fi
}

test_rdp_connection() {
    log "Testing RDP connection..."
    if nc -z -w 5 "$VM_IP" 3389 2>/dev/null; then
        success "RDP is responding on port 3389"
        return 0
    else
        warn "RDP not responding (may be disabled or still starting)"
        return 1
    fi
}

run_windows_script() {
    local mode=$1
    log "Triggering Windows mode switch to: $mode"
    
    if nc -z -w 2 "$VM_IP" 22 2>/dev/null; then
        log "Using SSH to run PowerShell script..."
        ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no "${VM_USER}@${VM_IP}" \
            "powershell -ExecutionPolicy Bypass -File C:\\Scripts\\set-mode.ps1 -Mode $mode" 2>/dev/null && return 0
    fi
    
    if nc -z -w 2 "$VM_IP" 5985 2>/dev/null; then
        log "Using WinRM to run PowerShell script..."
        
        local cred_file="/etc/winrm-creds"
        if [ -f "$cred_file" ]; then
            source "$cred_file"
            if command -v curl &>/dev/null; then
                local script_cmd="powershell -ExecutionPolicy Bypass -File C:\\Scripts\\set-mode.ps1 -Mode $mode"
                local payload="<s:Envelope xmlns:s=\"http://www.w3.org/2003/05/soap-envelope\" xmlns:wsa=\"http://schemas.xmlsoap.org/ws/2004/08/addressing\" xmlns:wsman=\"http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd\"><s:Header><wsa:To>http://${VM_IP}:5985/wsman</wsa:To><wsman:ResourceURI>http://schemas.microsoft.com/wbem/wsman/1/windows/shell/cmd</wsman:ResourceURI><wsa:Action>http://schemas.microsoft.com/wbem/wsman/1/windows/shell/Command</wsa:Action></s:Header><s:Body><CommandLine><Command>$script_cmd</Command></CommandLine></s:Body></s:Envelope>"
                curl -s -u "${WINRM_USER}:${WINRM_PASS}" --ntlm \
                    -H "Content-Type: application/soap+xml;charset=UTF-8" \
                    -d "$payload" \
                    "http://${VM_IP}:5985/wsman" &>/dev/null && { success "Mode switch command sent"; return 0; }
            fi
        fi
        
        if command -v smbclient &>/dev/null && [ -f "$cred_file" ]; then
            source "$cred_file"
            log "Using SMB trigger file method..."
            echo "$mode" > /tmp/kvm-mode-trigger
            smbclient "\\\\${VM_IP}\\C\$" -U "${WINRM_USER}%${WINRM_PASS}" -c "put /tmp/kvm-mode-trigger Scripts\\mode-trigger.txt" 2>/dev/null && {
                success "Mode trigger file sent - Windows scheduled task will pick it up"
                return 0
            }
        fi
    fi
    
    warn "Cannot connect to Windows VM via SSH or WinRM"
    echo ""
    echo "Please run this command on Windows (as Administrator):"
    echo ""
    echo "  powershell -ExecutionPolicy Bypass -File C:\\Scripts\\set-mode.ps1 -Mode $mode"
    echo ""
    echo "Or manually:"
    if [ "$mode" = "gaming" ]; then
        echo "  1. Disconnect any RDP sessions"
        echo "  2. Start Sunshine"
        echo "  3. Connect with Moonlight"
    else
        echo "  1. Stop Sunshine (right-click tray icon -> Exit)"
        echo "  2. Connect via RDP"
    fi
    echo ""
    return 1
}

enter_gaming_mode() {
    log "=== ENTERING GAMING MODE ==="
    
    check_vm_reachable
    stop_winapps_containers
    enable_sunshine_forwarding
    run_windows_script "gaming" || true
    
    echo ""
    success "=== GAMING MODE READY ==="
    echo ""
    echo "Connect with Moonlight to: $(hostname -I | awk '{print $1}')"
    echo "Windows VM IP: $VM_IP"
    echo ""
    
    sleep 3
    test_moonlight_connection || true
}

enter_productivity_mode() {
    log "=== ENTERING PRODUCTIVITY MODE ==="
    
    check_vm_reachable
    disable_sunshine_forwarding
    run_windows_script "productivity" || true
    start_winapps_containers
    
    echo ""
    success "=== PRODUCTIVITY MODE READY ==="
    echo ""
    echo "Connect with RDP to: $VM_IP"
    echo "Or use WinApps for seamless app access"
    echo ""
    
    sleep 3
    test_rdp_connection || true
}

show_status() {
    log "=== KVM MODE STATUS ==="
    echo ""
    
    echo "Windows VM: $VM_IP"
    if ping -c 1 -W 2 "$VM_IP" &>/dev/null; then
        success "  Reachable: Yes"
    else
        error "  Reachable: No"
    fi
    
    echo ""
    echo "Sunshine (Gaming):"
    if nc -z -w 2 "$VM_IP" 47989 2>/dev/null; then
        success "  Status: Running (port 47989 open)"
        echo "  Mode: GAMING"
    else
        warn "  Status: Not responding"
    fi
    
    echo ""
    echo "RDP (Productivity):"
    if nc -z -w 2 "$VM_IP" 3389 2>/dev/null; then
        success "  Status: Available (port 3389 open)"
        echo "  Mode: PRODUCTIVITY"
    else
        warn "  Status: Disabled or blocked"
    fi
    
    echo ""
    echo "Port Forwarding:"
    if sudo iptables -t nat -L PREROUTING -n 2>/dev/null | grep -q "47984:48010"; then
        success "  Sunshine forwarding: Enabled"
    else
        warn "  Sunshine forwarding: Not configured"
    fi
}

MODE="${1:-}"
if [ -z "$MODE" ]; then
    usage
fi

case "$MODE" in
    gaming|game|g)
        enter_gaming_mode
        ;;
    productivity|prod|rdp|p)
        enter_productivity_mode
        ;;
    status|s)
        show_status
        ;;
    *)
        usage
        ;;
esac
