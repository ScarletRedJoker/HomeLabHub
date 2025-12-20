#!/bin/bash
# Enable RDP on Windows VM using QEMU Guest Agent
# Run this from Linux host - no need for admin access in Windows

set -e

VM_NAME="${VM_NAME:-RDPWindows}"
VM_IP="${VM_IP:-192.168.122.250}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[x]${NC} $1"; }

echo "=== Enable RDP via QEMU Guest Agent ==="
echo ""

# Check if VM is running
if ! virsh list --name | grep -q "^${VM_NAME}$"; then
    error "VM '$VM_NAME' is not running"
    exit 1
fi

# Test guest agent
log "Testing QEMU Guest Agent..."
if ! virsh qemu-agent-command "$VM_NAME" '{"execute":"guest-ping"}' &>/dev/null; then
    error "QEMU Guest Agent not responding"
    echo ""
    echo "The guest agent needs to be installed in Windows:"
    echo "1. Mount virtio-win.iso in Windows"
    echo "2. Run guest-agent\\qemu-ga-x86_64.msi"
    echo "3. Reboot Windows"
    echo ""
    exit 1
fi
log "Guest agent is responding"

# Enable RDP in registry
log "Enabling Remote Desktop in registry..."
virsh qemu-agent-command "$VM_NAME" '{
  "execute":"guest-exec",
  "arguments":{
    "path":"reg.exe",
    "arg":["add","HKLM\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server","/v","fDenyTSConnections","/t","REG_DWORD","/d","0","/f"],
    "capture-output":true
  }
}' --pretty

sleep 2

# Enable firewall rule
log "Opening Windows Firewall for RDP..."
virsh qemu-agent-command "$VM_NAME" '{
  "execute":"guest-exec",
  "arguments":{
    "path":"netsh.exe",
    "arg":["advfirewall","firewall","set","rule","group=remote desktop","new","enable=Yes"],
    "capture-output":true
  }
}' --pretty

sleep 2

# Start TermService
log "Starting Remote Desktop service..."
virsh qemu-agent-command "$VM_NAME" '{
  "execute":"guest-exec",
  "arguments":{
    "path":"net.exe",
    "arg":["start","TermService"],
    "capture-output":true
  }
}' --pretty

sleep 3

# Test connection
log "Testing RDP connection..."
if nc -z -w 5 "$VM_IP" 3389 2>/dev/null; then
    echo ""
    echo -e "${GREEN}=== SUCCESS ===${NC}"
    echo ""
    echo "RDP is now enabled. Connect with:"
    echo "  xfreerdp3 /v:$VM_IP /u:Evin /p:Brs=2729 /f"
    echo ""
else
    warn "RDP port not responding yet - may need a moment to start"
    echo "Try: nc -zv $VM_IP 3389"
fi
