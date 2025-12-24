#!/bin/bash
#
# VM Storage & Network Sharing Setup
# Sets up virtio-fs shared folders and Tailscale subnet routing
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VM_NAME="RDPWindows"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
info() { echo -e "${BLUE}[i]${NC} $*"; }

# Shared folder paths
SHARED_BASE="/srv/vm-share"
HDD_MOUNT="/media/evin/1TB"

show_menu() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║        VM Storage & Network Sharing Setup                    ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║  1) Setup virtio-fs shared folder (host ↔ VM)                ║"
    echo "║  2) Setup Tailscale subnet routing (NAS access everywhere)   ║"
    echo "║  3) Show current VM storage config                           ║"
    echo "║  4) Full setup (both 1 and 2)                                ║"
    echo "║  5) Show Windows guest setup instructions                    ║"
    echo "║  q) Quit                                                     ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
}

setup_virtiofs_share() {
    log "Setting up virtio-fs shared folder..."
    
    # Create shared directory structure
    sudo mkdir -p "$SHARED_BASE"/{clipboard,files,1tb}
    sudo chown -R "$USER:$USER" "$SHARED_BASE"
    sudo chmod -R 755 "$SHARED_BASE"
    
    log "Created shared directories:"
    echo "  $SHARED_BASE/clipboard  - Quick file/text transfer"
    echo "  $SHARED_BASE/files      - General file sharing"
    echo "  $SHARED_BASE/1tb        - Symlink to 1TB HDD"
    
    # Create symlink to 1TB if mounted
    if mountpoint -q "$HDD_MOUNT" 2>/dev/null || [ -d "$HDD_MOUNT" ]; then
        ln -sfn "$HDD_MOUNT" "$SHARED_BASE/1tb"
        log "Linked 1TB HDD: $SHARED_BASE/1tb -> $HDD_MOUNT"
    else
        warn "1TB HDD not mounted at $HDD_MOUNT - skipping symlink"
    fi
    
    # Check if VM is running
    if virsh list --name | grep -q "^${VM_NAME}$"; then
        warn "VM is running. You'll need to shut it down to apply XML changes."
        echo "  Run: virsh shutdown $VM_NAME"
        echo "  Then re-run this script"
        return
    fi
    
    # Get current XML and check for existing filesystem
    if virsh dumpxml "$VM_NAME" | grep -q 'type="virtiofs"'; then
        warn "virtio-fs filesystem already configured in VM"
        virsh dumpxml "$VM_NAME" | grep -A5 'type="virtiofs"'
        read -p "Replace existing config? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            return
        fi
    fi
    
    # Add filesystem to VM XML
    log "Adding virtio-fs filesystem to VM..."
    
    # Create XML snippet for the filesystem
    cat > /tmp/virtiofs-device.xml << 'XMLEOF'
    <filesystem type="mount" accessmode="passthrough">
      <driver type="virtiofs" queue="1024"/>
      <source dir="/srv/vm-share"/>
      <target dir="host_share"/>
    </filesystem>
XMLEOF
    
    # Attach the device
    if virsh attach-device "$VM_NAME" /tmp/virtiofs-device.xml --config; then
        log "virtio-fs filesystem added to VM config"
    else
        warn "Could not attach via virsh. Adding manually to XML..."
        echo ""
        echo "Add this inside <devices> section of your VM XML:"
        echo ""
        cat << 'XMLSHOW'
    <filesystem type="mount" accessmode="passthrough">
      <driver type="virtiofs" queue="1024"/>
      <source dir="/srv/vm-share"/>
      <target dir="host_share"/>
    </filesystem>
XMLSHOW
        echo ""
        echo "Run: virsh edit $VM_NAME"
    fi
    
    rm -f /tmp/virtiofs-device.xml
    
    log "virtio-fs setup complete!"
    echo ""
    info "Next steps in Windows:"
    echo "  1. Install WinFSP: https://github.com/winfsp/winfsp/releases"
    echo "  2. Install virtio-win-guest-tools.exe"
    echo "  3. Start 'VirtIO-FS Service' in Services"
    echo "  4. Shared folder appears as Z: drive"
}

setup_tailscale_subnet() {
    log "Setting up Tailscale subnet routing..."
    
    # Check if tailscale is installed
    if ! command -v tailscale &>/dev/null; then
        error "Tailscale not installed. Install with: curl -fsSL https://tailscale.com/install.sh | sh"
    fi
    
    # Check current status
    if ! tailscale status &>/dev/null; then
        error "Tailscale not running or not logged in"
    fi
    
    # Enable IP forwarding
    log "Enabling IP forwarding..."
    echo 'net.ipv4.ip_forward = 1' | sudo tee /etc/sysctl.d/99-tailscale-forward.conf
    echo 'net.ipv6.conf.all.forwarding = 1' | sudo tee -a /etc/sysctl.d/99-tailscale-forward.conf
    sudo sysctl -p /etc/sysctl.d/99-tailscale-forward.conf
    
    # Get current local subnet
    local_ip=$(ip -4 route get 1 | awk '{print $7; exit}')
    local_subnet=$(ip -4 route | grep "dev $(ip -4 route get 1 | awk '{print $5; exit}')" | grep -v default | head -1 | awk '{print $1}')
    
    if [ -z "$local_subnet" ]; then
        local_subnet="192.168.0.0/24"
    fi
    
    log "Detected local subnet: $local_subnet"
    info "This will expose your local network (including NAS at 192.168.0.185) to Tailscale"
    
    read -p "Advertise subnet $local_subnet? [Y/n] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        read -p "Enter custom subnet (e.g., 192.168.0.0/24): " custom_subnet
        local_subnet="$custom_subnet"
    fi
    
    # Advertise routes
    log "Advertising routes via Tailscale..."
    sudo tailscale up --advertise-routes="$local_subnet" --accept-routes
    
    log "Subnet routing configured!"
    echo ""
    warn "IMPORTANT: You must approve the route in Tailscale Admin Console:"
    echo "  1. Go to: https://login.tailscale.com/admin/machines"
    echo "  2. Find 'homelab-local' (or this machine's name)"
    echo "  3. Click '...' → 'Edit route settings'"
    echo "  4. Enable the $local_subnet route"
    echo ""
    info "After approval, from any Tailscale device you can access:"
    echo "  - NAS: \\\\192.168.0.185\\networkshare"
    echo "  - Host: \\\\192.168.0.177"
    echo "  - Any device on your local network"
}

show_vm_storage() {
    log "Current VM storage configuration:"
    echo ""
    virsh dumpxml "$VM_NAME" | grep -A10 '<disk\|<filesystem' | head -50
    echo ""
    
    log "Host disk status:"
    lsblk -o NAME,SIZE,TYPE,MOUNTPOINT /dev/sda
    echo ""
    
    log "Shared folder status:"
    if [ -d "$SHARED_BASE" ]; then
        ls -la "$SHARED_BASE"
    else
        warn "Shared folder not set up yet"
    fi
}

show_windows_instructions() {
    cat << 'EOF'

╔══════════════════════════════════════════════════════════════════════╗
║                    WINDOWS GUEST SETUP INSTRUCTIONS                  ║
╠══════════════════════════════════════════════════════════════════════╣

STEP 1: Install WinFSP (Windows File System Proxy)
─────────────────────────────────────────────────────
  Download: https://github.com/winfsp/winfsp/releases
  Install with "Core" feature enabled

STEP 2: Install VirtIO Guest Tools
─────────────────────────────────────────────────────
  Download: https://github.com/virtio-win/virtio-win-pkg-scripts/releases
  Run: virtio-win-guest-tools.exe
  This installs virtio-fs driver and service

STEP 3: Start VirtIO-FS Service
─────────────────────────────────────────────────────
  Open: services.msc
  Find: "VirtIO-FS Service"
  Right-click → Start
  Set Startup Type: Automatic

STEP 4: Access Shared Folder
─────────────────────────────────────────────────────
  Open File Explorer
  Shared folder appears as Z: drive (or next available)
  
  Folder structure:
    Z:\clipboard\   - Quick transfers
    Z:\files\       - General sharing
    Z:\1tb\         - Access to 1TB HDD

STEP 5: Access NAS via Tailscale (after subnet routing)
─────────────────────────────────────────────────────
  Ensure Tailscale is running on Windows VM
  Run: tailscale up --accept-routes
  
  Then access NAS:
    \\192.168.0.185\networkshare

╚══════════════════════════════════════════════════════════════════════╝

EOF
}

full_setup() {
    setup_virtiofs_share
    echo ""
    setup_tailscale_subnet
    echo ""
    show_windows_instructions
}

main() {
    case "${1:-}" in
        virtiofs|1)
            setup_virtiofs_share
            ;;
        tailscale|2)
            setup_tailscale_subnet
            ;;
        status|3)
            show_vm_storage
            ;;
        full|4)
            full_setup
            ;;
        help|5)
            show_windows_instructions
            ;;
        *)
            while true; do
                show_menu
                read -p "Select option: " choice
                case "$choice" in
                    1) setup_virtiofs_share ;;
                    2) setup_tailscale_subnet ;;
                    3) show_vm_storage ;;
                    4) full_setup ;;
                    5) show_windows_instructions ;;
                    q|Q) exit 0 ;;
                    *) warn "Invalid option" ;;
                esac
                echo ""
                read -p "Press Enter to continue..."
            done
            ;;
    esac
}

main "$@"
