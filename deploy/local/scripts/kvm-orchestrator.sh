#!/bin/bash
# KVM Orchestrator - Smart Windows VM Management for Gaming/Desktop
# A robust, auto-discovering orchestrator that handles failures gracefully
#
# Usage:
#   ./kvm-orchestrator.sh discover   - Find and save Windows VM name
#   ./kvm-orchestrator.sh start      - Start VM + setup networking
#   ./kvm-orchestrator.sh stop       - Graceful shutdown
#   ./kvm-orchestrator.sh gaming     - Setup gaming mode (Sunshine)
#   ./kvm-orchestrator.sh desktop    - Setup desktop mode (RDP)
#   ./kvm-orchestrator.sh status     - Show full system status
#   ./kvm-orchestrator.sh help       - Show this help

set -euo pipefail

readonly CONFIG_FILE="${KVM_CONFIG:-/etc/kvm-orchestrator.conf}"
readonly AGENT_PORT="${AGENT_PORT:-8765}"
readonly SUNSHINE_PORT="${SUNSHINE_PORT:-47989}"
readonly RDP_PORT="${RDP_PORT:-3389}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()     { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; }
header()  { echo -e "\n${BOLD}=== $* ===${NC}\n"; }

load_config() {
    if [[ -f "$CONFIG_FILE" ]]; then
        source "$CONFIG_FILE"
    fi
    VM_NAME="${VM_NAME:-}"
    VM_IP="${VM_IP:-}"
}

save_config() {
    local config_content="# KVM Orchestrator Configuration
# Generated: $(date)
VM_NAME=\"${VM_NAME}\"
VM_IP=\"${VM_IP}\"
"
    if [[ -w "$(dirname "$CONFIG_FILE")" ]] || sudo test -w "$(dirname "$CONFIG_FILE")"; then
        echo "$config_content" | sudo tee "$CONFIG_FILE" > /dev/null
        success "Configuration saved to $CONFIG_FILE"
    else
        warn "Cannot write to $CONFIG_FILE - saving to ~/.kvm-orchestrator.conf"
        echo "$config_content" > ~/.kvm-orchestrator.conf
    fi
}

check_virsh() {
    if ! command -v virsh &>/dev/null; then
        error "virsh not found. Is libvirt installed?"
        echo "  Install with: sudo apt install libvirt-clients"
        return 1
    fi
    if ! virsh list &>/dev/null; then
        error "Cannot connect to libvirt. Check permissions."
        echo "  Try: sudo usermod -aG libvirt $USER"
        return 1
    fi
    return 0
}

discover_vms() {
    header "VM Discovery"
    
    if ! check_virsh; then
        return 1
    fi
    
    log "Searching for Windows VMs..."
    
    local vms
    vms=$(virsh list --all --name 2>/dev/null | grep -iE 'win|windows' | grep -v '^$' || true)
    
    if [[ -z "$vms" ]]; then
        log "No VMs with 'win' or 'windows' in name found."
        log "Listing all VMs:"
        virsh list --all --name 2>/dev/null | grep -v '^$' || echo "  (none found)"
        echo ""
        read -rp "Enter VM name manually: " VM_NAME
        if [[ -z "$VM_NAME" ]]; then
            error "No VM name provided"
            return 1
        fi
    else
        local vm_array
        readarray -t vm_array <<< "$vms"
        
        if [[ ${#vm_array[@]} -eq 1 ]]; then
            VM_NAME="${vm_array[0]}"
            success "Found Windows VM: $VM_NAME"
        else
            echo "Multiple Windows VMs found:"
            local i=1
            for vm in "${vm_array[@]}"; do
                echo "  $i) $vm"
                ((i++))
            done
            echo ""
            read -rp "Select VM number [1]: " choice
            choice="${choice:-1}"
            if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#vm_array[@]} )); then
                VM_NAME="${vm_array[$((choice-1))]}"
            else
                error "Invalid selection"
                return 1
            fi
        fi
    fi
    
    if ! virsh dominfo "$VM_NAME" &>/dev/null; then
        error "VM '$VM_NAME' not found in libvirt"
        return 1
    fi
    
    success "Selected VM: $VM_NAME"
    
    discover_vm_ip
    save_config
    
    echo ""
    success "Discovery complete!"
    echo "  VM Name: $VM_NAME"
    echo "  VM IP:   ${VM_IP:-not detected}"
}

discover_vm_ip() {
    log "Detecting VM IP address..."
    
    local mac_addresses
    mac_addresses=$(virsh domiflist "$VM_NAME" 2>/dev/null | awk 'NR>2 && $5 {print $5}' || true)
    
    for mac in $mac_addresses; do
        local ip
        ip=$(arp -an 2>/dev/null | grep -i "$mac" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
        if [[ -n "$ip" ]]; then
            VM_IP="$ip"
            success "Found VM IP via ARP: $VM_IP"
            return 0
        fi
    done
    
    local net_name
    net_name=$(virsh domiflist "$VM_NAME" 2>/dev/null | awk 'NR>2 {print $3}' | head -1 || true)
    if [[ -n "$net_name" ]]; then
        local lease_ip
        lease_ip=$(virsh net-dhcp-leases "$net_name" 2>/dev/null | grep -i "$VM_NAME" | awk '{print $5}' | cut -d'/' -f1 | head -1 || true)
        if [[ -n "$lease_ip" ]]; then
            VM_IP="$lease_ip"
            success "Found VM IP via DHCP lease: $VM_IP"
            return 0
        fi
        
        for mac in $mac_addresses; do
            lease_ip=$(virsh net-dhcp-leases "$net_name" 2>/dev/null | grep -i "$mac" | awk '{print $5}' | cut -d'/' -f1 | head -1 || true)
            if [[ -n "$lease_ip" ]]; then
                VM_IP="$lease_ip"
                success "Found VM IP via MAC lookup: $VM_IP"
                return 0
            fi
        done
    fi
    
    warn "Could not auto-detect VM IP address"
    read -rp "Enter VM IP manually (or press Enter to skip): " VM_IP
}

require_vm_config() {
    load_config
    if [[ -z "$VM_NAME" ]]; then
        error "No VM configured. Run: $0 discover"
        return 1
    fi
}

get_vm_state() {
    virsh domstate "$VM_NAME" 2>/dev/null | head -1 || echo "unknown"
}

check_port() {
    local ip="$1" port="$2" timeout="${3:-2}"
    nc -z -w "$timeout" "$ip" "$port" 2>/dev/null
}

check_agent() {
    if [[ -z "$VM_IP" ]]; then
        return 1
    fi
    local response
    response=$(curl -s --connect-timeout 2 "http://${VM_IP}:${AGENT_PORT}/health" 2>/dev/null || true)
    if [[ "$response" == *"status"* ]]; then
        return 0
    fi
    return 1
}

call_agent() {
    local method="$1" endpoint="$2"
    local url="http://${VM_IP}:${AGENT_PORT}${endpoint}"
    
    if [[ "$method" == "GET" ]]; then
        curl -s --connect-timeout 5 "$url" 2>/dev/null
    else
        # Fix HTTP 411: Windows agent requires Content-Length header on POST
        curl -s --connect-timeout 5 -X POST -H "Content-Length: 0" "$url" 2>/dev/null
    fi
}

open_console() {
    header "Recovery Console"
    require_vm_config || return 1
    
    local state
    state=$(get_vm_state)
    
    if [[ "$state" != "running" ]]; then
        error "VM '$VM_NAME' is not running (state: $state)"
        echo "Start the VM first: $0 start"
        return 1
    fi
    
    log "Opening SPICE console to $VM_NAME..."
    echo ""
    echo "This gives you direct GUI access to the Windows VM."
    echo "Use this to fix Sunshine, RDP, or other issues."
    echo ""
    
    if command -v virt-viewer &>/dev/null; then
        virt-viewer "$VM_NAME" &
        success "Console opened in new window"
    elif command -v remote-viewer &>/dev/null; then
        # Get SPICE port from VM config
        local spice_port
        spice_port=$(virsh domdisplay "$VM_NAME" 2>/dev/null | grep -oP 'spice://[^:]+:\K[0-9]+' || echo "")
        if [[ -n "$spice_port" ]]; then
            remote-viewer "spice://localhost:$spice_port" &
            success "Console opened via remote-viewer"
        else
            warn "Could not determine SPICE port"
            echo "Try: virsh domdisplay $VM_NAME"
        fi
    else
        error "Neither virt-viewer nor remote-viewer found"
        echo "Install with: sudo apt install virt-viewer"
        echo ""
        echo "Manual access options:"
        echo "  1. Install virt-viewer: sudo apt install virt-viewer"
        echo "  2. Use virt-manager GUI: virt-manager"
        echo "  3. SSH with X forwarding from another machine"
        return 1
    fi
}

start_vm() {
    header "Starting VM"
    require_vm_config || return 1
    
    local state
    state=$(get_vm_state)
    
    if [[ "$state" == "running" ]]; then
        success "VM '$VM_NAME' is already running"
        setup_networking
        return 0
    fi
    
    log "Starting VM: $VM_NAME"
    
    if virsh start "$VM_NAME" 2>&1; then
        success "VM start initiated"
    else
        error "Failed to start VM"
        echo ""
        echo "Common issues:"
        echo "  - GPU may be in use by host (check nvidia-smi)"
        echo "  - Previous VM didn't shut down cleanly"
        echo ""
        echo "Try these fixes:"
        echo "  virsh destroy $VM_NAME   # Force stop if stuck"
        echo "  echo 1 | sudo tee /sys/bus/pci/devices/0000:XX:00.0/reset  # Reset GPU"
        return 1
    fi
    
    log "Waiting for VM to boot..."
    local attempts=0
    local max_attempts=60
    
    while (( attempts < max_attempts )); do
        sleep 2
        discover_vm_ip 2>/dev/null || true
        
        if [[ -n "$VM_IP" ]] && ping -c1 -W1 "$VM_IP" &>/dev/null; then
            success "VM is responding at $VM_IP"
            save_config
            setup_networking
            return 0
        fi
        
        ((attempts++))
        echo -n "."
    done
    
    echo ""
    warn "VM started but network not responding after 2 minutes"
    echo "Check VM console: virt-viewer $VM_NAME"
}

stop_vm() {
    header "Stopping VM"
    require_vm_config || return 1
    
    local state
    state=$(get_vm_state)
    
    if [[ "$state" != "running" ]]; then
        success "VM '$VM_NAME' is not running (state: $state)"
        return 0
    fi
    
    log "Requesting graceful shutdown..."
    
    if check_agent; then
        log "Sending shutdown via Windows agent..."
        call_agent POST "/shutdown" || true
        sleep 5
    fi
    
    virsh shutdown "$VM_NAME" 2>&1 || true
    
    log "Waiting for shutdown (up to 60s)..."
    local attempts=0
    while (( attempts < 30 )); do
        sleep 2
        state=$(get_vm_state)
        if [[ "$state" != "running" ]]; then
            success "VM stopped successfully"
            return 0
        fi
        ((attempts++))
        echo -n "."
    done
    
    echo ""
    warn "VM didn't stop gracefully"
    read -rp "Force stop? [y/N]: " force
    if [[ "$force" =~ ^[Yy] ]]; then
        virsh destroy "$VM_NAME"
        success "VM force stopped"
    fi
}

setup_networking() {
    log "Setting up network forwarding..."
    
    sudo sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1 || true
    
    for port_range in "47984:48010" "47998:48010"; do
        for proto in tcp udp; do
            sudo iptables -t nat -C PREROUTING -p "$proto" --dport "$port_range" -j DNAT --to-destination "${VM_IP}" 2>/dev/null || \
                sudo iptables -t nat -A PREROUTING -p "$proto" --dport "$port_range" -j DNAT --to-destination "${VM_IP}" 2>/dev/null || true
        done
    done
    
    sudo iptables -t nat -C POSTROUTING -d "${VM_IP}" -j MASQUERADE 2>/dev/null || \
        sudo iptables -t nat -A POSTROUTING -d "${VM_IP}" -j MASQUERADE 2>/dev/null || true
    
    success "Network forwarding configured"
}

switch_to_gaming() {
    header "Switching to Gaming Mode"
    require_vm_config || return 1
    
    local state
    state=$(get_vm_state)
    
    if [[ "$state" != "running" ]]; then
        warn "VM is not running (state: $state)"
        read -rp "Start VM? [Y/n]: " start_it
        if [[ ! "$start_it" =~ ^[Nn] ]]; then
            start_vm
        else
            return 1
        fi
    fi
    
    setup_networking
    
    if check_agent; then
        log "Switching mode via Windows agent..."
        local result
        result=$(call_agent POST "/mode/gaming")
        if [[ "$result" == *"success"* ]]; then
            success "Gaming mode activated via agent"
            show_gaming_instructions
            return 0
        else
            warn "Agent returned: $result"
        fi
    else
        show_manual_gaming_instructions
    fi
}

switch_to_desktop() {
    header "Switching to Desktop Mode"
    require_vm_config || return 1
    
    local state
    state=$(get_vm_state)
    
    if [[ "$state" != "running" ]]; then
        warn "VM is not running (state: $state)"
        read -rp "Start VM? [Y/n]: " start_it
        if [[ ! "$start_it" =~ ^[Nn] ]]; then
            start_vm
        else
            return 1
        fi
    fi
    
    if check_agent; then
        log "Switching mode via Windows agent..."
        local result
        result=$(call_agent POST "/mode/desktop")
        if [[ "$result" == *"success"* ]]; then
            success "Desktop mode activated via agent"
            show_desktop_instructions
            return 0
        else
            warn "Agent returned: $result"
        fi
    else
        show_manual_desktop_instructions
    fi
}

show_gaming_instructions() {
    echo ""
    success "Gaming mode is ready!"
    echo ""
    echo "Connect with Moonlight to: $(hostname -I | awk '{print $1}')"
    echo "Or directly to VM: $VM_IP"
    echo ""
}

show_manual_gaming_instructions() {
    warn "Windows agent not responding - manual setup required"
    echo ""
    echo "${BOLD}On your Windows VM:${NC}"
    echo "  1. Make sure Sunshine is installed and running"
    echo "  2. Right-click Sunshine tray icon → Start"
    echo "  3. If RDP is connected, disconnect it first"
    echo ""
    echo "${BOLD}From your gaming device:${NC}"
    echo "  Connect Moonlight to: $(hostname -I | awk '{print $1}')"
    echo "  Or directly to: ${VM_IP:-<vm-ip>}"
    echo ""
    echo "Install Windows agent for automatic control:"
    echo "  On Windows (Admin PowerShell):"
    echo "  iwr https://your-server/install-windows-agent.ps1 | iex"
}

show_desktop_instructions() {
    echo ""
    success "Desktop mode is ready!"
    echo ""
    echo "Connect with RDP to: $VM_IP"
    echo ""
}

show_manual_desktop_instructions() {
    warn "Windows agent not responding - manual setup required"
    echo ""
    echo "${BOLD}On your Windows VM:${NC}"
    echo "  1. Stop Sunshine (right-click tray icon → Exit)"
    echo "  2. RDP is now available"
    echo ""
    echo "${BOLD}Connect with:${NC}"
    echo "  rdesktop ${VM_IP:-<vm-ip>}"
    echo "  # or use your preferred RDP client"
    echo ""
}

show_status() {
    header "KVM Gaming Status"
    load_config
    
    echo "Configuration:"
    echo "  Config file: $CONFIG_FILE"
    echo "  VM Name:     ${VM_NAME:-not configured}"
    echo "  VM IP:       ${VM_IP:-not detected}"
    echo ""
    
    if [[ -z "$VM_NAME" ]]; then
        warn "No VM configured. Run: $0 discover"
        return 0
    fi
    
    local state
    state=$(get_vm_state)
    
    echo "VM Status:"
    if [[ "$state" == "running" ]]; then
        success "  State: $state"
    elif [[ "$state" == "shut off" ]]; then
        warn "  State: $state"
    else
        echo "  State: $state"
    fi
    
    if [[ "$state" == "running" && -n "$VM_IP" ]]; then
        echo ""
        echo "Services:"
        
        if check_agent; then
            success "  Windows Agent (port $AGENT_PORT): responding"
            local health
            health=$(call_agent GET "/health" 2>/dev/null || true)
            if [[ -n "$health" ]]; then
                echo "    $health" | head -1
            fi
        else
            warn "  Windows Agent (port $AGENT_PORT): not responding"
        fi
        
        if check_port "$VM_IP" "$SUNSHINE_PORT"; then
            success "  Sunshine (port $SUNSHINE_PORT): responding"
        else
            warn "  Sunshine (port $SUNSHINE_PORT): not responding"
        fi
        
        if check_port "$VM_IP" "$RDP_PORT"; then
            success "  RDP (port $RDP_PORT): responding"
        else
            warn "  RDP (port $RDP_PORT): not responding"
        fi
    fi
    
    echo ""
    echo "GPU Status:"
    if command -v nvidia-smi &>/dev/null; then
        if nvidia-smi --query-gpu=name,driver_version --format=csv,noheader 2>/dev/null; then
            local vfio
            vfio=$(lspci -nnk 2>/dev/null | grep -A3 "NVIDIA" | grep "vfio-pci" || true)
            if [[ -n "$vfio" ]]; then
                success "  Binding: vfio-pci (passed to VM)"
            else
                warn "  Binding: nvidia (available to host)"
            fi
        else
            warn "  nvidia-smi failed - GPU may be passed to VM"
        fi
    else
        echo "  nvidia-smi not available"
    fi
    
    echo ""
    echo "Port Forwarding:"
    if sudo iptables -t nat -L PREROUTING -n 2>/dev/null | grep -q "${VM_IP:-xxx}"; then
        success "  Sunshine ports forwarded to $VM_IP"
    else
        warn "  Port forwarding not configured"
    fi
}

show_help() {
    cat << 'EOF'
KVM Orchestrator - Smart Windows VM Management for Gaming/Desktop

Usage: kvm-orchestrator.sh <command>

Commands:
  discover    Find Windows VMs and save configuration
  start       Start the VM and setup networking
  stop        Gracefully shutdown the VM
  gaming      Switch to gaming mode (Sunshine/Moonlight)
  desktop     Switch to desktop mode (RDP)
  console     Open SPICE recovery console (when Sunshine/RDP unavailable)
  status      Show full system status
  help        Show this help message

Environment Variables:
  KVM_CONFIG      Config file path (default: /etc/kvm-orchestrator.conf)
  AGENT_PORT      Windows agent port (default: 8765)
  SUNSHINE_PORT   Sunshine control port (default: 47989)
  RDP_PORT        RDP port (default: 3389)

Examples:
  # First-time setup
  ./kvm-orchestrator.sh discover
  
  # Start gaming session
  ./kvm-orchestrator.sh start
  ./kvm-orchestrator.sh gaming
  
  # Check what's happening
  ./kvm-orchestrator.sh status

For automatic Windows control, install the Windows agent on your VM:
  (Run in Admin PowerShell on Windows)
  iwr https://your-server/install-windows-agent.ps1 | iex

EOF
}

main() {
    local command="${1:-help}"
    
    case "$command" in
        discover|d)
            discover_vms
            ;;
        start|up)
            start_vm
            ;;
        stop|down|shutdown)
            stop_vm
            ;;
        gaming|game|g)
            switch_to_gaming
            ;;
        desktop|rdp|productivity|p)
            switch_to_desktop
            ;;
        console|c|recovery)
            open_console
            ;;
        status|s)
            show_status
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            error "Unknown command: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

main "$@"
