#!/bin/bash
set -euo pipefail

echo "=== KVM Gaming VM Setup Script ==="
echo ""
echo "This script will:"
echo "1. Install the robust VM management scripts"
echo "2. Configure kernel parameters for GPU passthrough"
echo "3. Set up systemd services for auto-start"
echo "4. Optionally configure network bridge for LAN access"
echo ""

if [[ $EUID -ne 0 ]]; then
    echo "ERROR: Must run as root"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[1/5] Installing management scripts..."
cp "$SCRIPT_DIR/kvm-rdpwindows.sh" /usr/local/sbin/
chmod +x /usr/local/sbin/kvm-rdpwindows.sh
echo "  Installed: /usr/local/sbin/kvm-rdpwindows.sh"

echo "[2/5] Installing systemd services..."
cp "$SCRIPT_DIR/kvm-rdpwindows.service" /etc/systemd/system/
cp "$SCRIPT_DIR/kvm-health.service" /etc/systemd/system/
cp "$SCRIPT_DIR/kvm-health.timer" /etc/systemd/system/
systemctl daemon-reload
echo "  Installed systemd units"

echo "[3/5] Checking kernel parameters..."
GRUB_FILE="/etc/default/grub"
CURRENT_CMDLINE=$(grep "^GRUB_CMDLINE_LINUX_DEFAULT" "$GRUB_FILE" || echo "")

NEEDED_PARAMS=""

if ! echo "$CURRENT_CMDLINE" | grep -q "pcie_port_pm=off"; then
    NEEDED_PARAMS="$NEEDED_PARAMS pcie_port_pm=off"
fi

if ! echo "$CURRENT_CMDLINE" | grep -q "pcie_aspm=off"; then
    NEEDED_PARAMS="$NEEDED_PARAMS pcie_aspm=off"
fi

if [[ -n "$NEEDED_PARAMS" ]]; then
    echo "  RECOMMENDED: Add these kernel parameters to prevent GPU D3cold issues:"
    echo "  Edit $GRUB_FILE and add to GRUB_CMDLINE_LINUX_DEFAULT:"
    echo "    $NEEDED_PARAMS"
    echo "  Then run: update-grub && reboot"
else
    echo "  Kernel parameters OK"
fi

echo "[4/5] Creating directories..."
mkdir -p /var/log/kvm-orchestrator
mkdir -p /run/kvm-orchestrator
mkdir -p /srv/vm-share/{files,clipboard,1tb}
chown -R 1000:1000 /srv/vm-share
echo "  Created: /var/log/kvm-orchestrator, /srv/vm-share"

echo "[5/5] Network bridge setup..."
echo ""
echo "  Your VM needs a network bridge for local device access."
echo "  Current network interfaces:"
ip -br link show | grep -v "^lo\|^vir\|^docker\|^br-" || true
echo ""

read -rp "  Set up network bridge now? (requires brief network drop) [y/N]: " setup_bridge

if [[ "$setup_bridge" =~ ^[Yy]$ ]]; then
    read -rp "  Enter your physical NIC name (e.g., enp3s0, eno1): " nic_name
    
    if [[ -z "$nic_name" ]] || ! ip link show "$nic_name" &>/dev/null; then
        echo "  ERROR: Invalid NIC name"
    else
        cat > /etc/netplan/01-bridge.yaml << EOF
network:
  version: 2
  renderer: networkd
  ethernets:
    ${nic_name}:
      dhcp4: false
      dhcp6: false
  bridges:
    br0:
      interfaces:
        - ${nic_name}
      dhcp4: true
      dhcp6: false
      parameters:
        stp: false
        forward-delay: 0
EOF
        echo "  Created /etc/netplan/01-bridge.yaml"
        echo "  Run 'sudo netplan apply' to activate (network will briefly drop)"
    fi
else
    echo "  Skipped bridge setup. VM will use NAT (Tailscale still works)."
    echo "  Template saved at: $SCRIPT_DIR/netplan-bridge.yaml"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Quick start:"
echo "  sudo kvm-rdpwindows.sh start    # Start VM with preflight"
echo "  sudo kvm-rdpwindows.sh status   # Check status"
echo "  sudo kvm-rdpwindows.sh stop     # Stop VM"
echo ""
echo "Enable auto-start on boot:"
echo "  sudo systemctl enable kvm-rdpwindows.service"
echo "  sudo systemctl enable kvm-health.timer"
echo ""
echo "Connect with Moonlight:"
echo "  - Via Tailscale: 100.118.44.102"
echo "  - Via LAN (if bridge configured): Check VM IP after start"
