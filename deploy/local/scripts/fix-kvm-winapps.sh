#!/bin/bash
# Complete KVM + WinApps Fix Script
# Fixes everything in one go

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

VM_NAME="RDPWindows"
VM_IP="192.168.122.250"
VM_USER="Evin"
VM_PASS="Brs=2729"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${CYAN}[*]${NC} $1"; }
success() { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[x]${NC} $1"; }

echo ""
echo "=========================================="
echo "   KVM + WinApps Complete Fix Script"
echo "=========================================="
echo ""

# Step 1: Check VM status
log "Checking VM status..."
if virsh list --name | grep -q "^${VM_NAME}$"; then
    success "VM '$VM_NAME' is running"
else
    warn "VM '$VM_NAME' is not running, starting it..."
    virsh start "$VM_NAME" || true
    sleep 10
fi

# Step 2: Get VM IP
log "Finding VM IP address..."
VM_IP_FOUND=$(virsh domifaddr "$VM_NAME" --source arp 2>/dev/null | grep -oE '192\.168\.[0-9]+\.[0-9]+' | head -1)
if [ -n "$VM_IP_FOUND" ]; then
    VM_IP="$VM_IP_FOUND"
    success "VM IP: $VM_IP"
else
    warn "Could not detect VM IP, using default: $VM_IP"
fi

# Step 3: Test QEMU Guest Agent
log "Testing QEMU Guest Agent..."
if virsh qemu-agent-command "$VM_NAME" '{"execute":"guest-ping"}' &>/dev/null; then
    success "Guest agent is running"
    
    # Enable RDP via guest agent
    log "Enabling RDP via guest agent..."
    
    virsh qemu-agent-command "$VM_NAME" '{
      "execute":"guest-exec",
      "arguments":{
        "path":"reg.exe",
        "arg":["add","HKLM\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server","/v","fDenyTSConnections","/t","REG_DWORD","/d","0","/f"],
        "capture-output":true
      }
    }' &>/dev/null && success "RDP enabled in registry" || warn "Registry command failed"
    
    sleep 1
    
    virsh qemu-agent-command "$VM_NAME" '{
      "execute":"guest-exec",
      "arguments":{
        "path":"netsh.exe",
        "arg":["advfirewall","firewall","set","rule","group=remote desktop","new","enable=Yes"],
        "capture-output":true
      }
    }' &>/dev/null && success "RDP firewall rule enabled" || warn "Firewall command failed"
    
    sleep 1
    
    virsh qemu-agent-command "$VM_NAME" '{
      "execute":"guest-exec",
      "arguments":{
        "path":"net.exe",
        "arg":["start","TermService"],
        "capture-output":true
      }
    }' &>/dev/null && success "TermService started" || warn "TermService may already be running"
    
else
    warn "Guest agent not available - install QEMU Guest Agent in Windows"
    echo ""
    echo "To install QEMU Guest Agent in Windows:"
    echo "1. Open virtio-win.iso (should be mounted as D: or E:)"
    echo "2. Run: guest-agent\\qemu-ga-x86_64.msi"
    echo "3. Reboot Windows"
    echo "4. Run this script again"
    echo ""
fi

# Step 4: Test RDP connectivity
log "Testing RDP connectivity..."
sleep 2
if nc -z -w 5 "$VM_IP" 3389 2>/dev/null; then
    success "RDP port 3389 is OPEN"
else
    warn "RDP port 3389 not responding"
fi

# Step 5: Set up WinApps config
log "Setting up WinApps configuration..."
mkdir -p ~/.config/winapps

cat > ~/.config/winapps/winapps.conf << EOF
RDP_USER="$VM_USER"
RDP_PASS="$VM_PASS"
RDP_DOMAIN=""
RDP_IP="$VM_IP"
RDP_SCALE="100"
MULTIMON="false"
RDP_FLAGS="/network:auto /cert-ignore /dynamic-resolution +clipboard"
VM_NAME="$VM_NAME"
EOF

success "WinApps config written to ~/.config/winapps/winapps.conf"

# Step 6: Set libvirt URI
log "Setting LIBVIRT_DEFAULT_URI..."
if ! grep -q "LIBVIRT_DEFAULT_URI" ~/.bashrc 2>/dev/null; then
    echo 'export LIBVIRT_DEFAULT_URI="qemu:///system"' >> ~/.bashrc
    success "Added LIBVIRT_DEFAULT_URI to ~/.bashrc"
else
    success "LIBVIRT_DEFAULT_URI already set"
fi

# Also set in /etc/environment for WinApps
if ! grep -q "LIBVIRT_DEFAULT_URI" /etc/environment 2>/dev/null; then
    echo 'LIBVIRT_DEFAULT_URI="qemu:///system"' | sudo tee -a /etc/environment >/dev/null
    success "Added LIBVIRT_DEFAULT_URI to /etc/environment"
fi

# Step 7: Test connection
echo ""
echo "=========================================="
echo "   Testing Connection"
echo "=========================================="
echo ""

if nc -z -w 5 "$VM_IP" 3389 2>/dev/null; then
    echo -e "${GREEN}RDP is working!${NC}"
    echo ""
    echo "Connect with:"
    echo "  xfreerdp3 /v:$VM_IP /u:$VM_USER /p:$VM_PASS /f"
    echo ""
    echo "Or run WinApps:"
    echo "  winapps windows"
    echo ""
else
    echo -e "${YELLOW}RDP not responding yet.${NC}"
    echo ""
    echo "Manual steps needed in Windows (via SPICE console):"
    echo ""
    echo "1. Press Win key, type 'cmd', press Ctrl+Shift+Enter"
    echo "2. Press Left Arrow then Enter for UAC"  
    echo "3. Run these commands:"
    echo ""
    echo '   reg add "HKLM\System\CurrentControlSet\Control\Terminal Server" /v fDenyTSConnections /t REG_DWORD /d 0 /f'
    echo ""
    echo '   netsh advfirewall firewall set rule group="remote desktop" new enable=Yes'
    echo ""
    echo '   net start TermService'
    echo ""
fi

echo "=========================================="
echo "   Sunshine (Gaming Mode)"
echo "=========================================="
echo ""
if nc -z -w 3 "$VM_IP" 47990 2>/dev/null; then
    echo -e "${GREEN}Sunshine web UI is accessible${NC}"
    echo "  https://$VM_IP:47990"
else
    echo -e "${YELLOW}Sunshine web UI not responding${NC}"
fi
echo ""
