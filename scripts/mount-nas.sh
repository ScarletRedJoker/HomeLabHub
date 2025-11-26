#!/bin/bash
#
# NAS Auto-Mount Script for Homelab
# Mounts Zyxel NAS326 shares for Plex and backup access
#
# Usage:
#   ./mount-nas.sh              # Mount using default settings
#   ./mount-nas.sh unmount      # Unmount all NAS shares
#   ./mount-nas.sh status       # Check mount status
#

set -euo pipefail

# Configuration - can be overridden by environment variables
NAS_IP="${NAS_IP:-192.168.1.100}"
NAS_HOSTNAME="${NAS_HOSTNAME:-NAS326.local}"
NAS_USER="${NAS_USER:-admin}"
NAS_PASSWORD="${NAS_PASSWORD:-}"
MOUNT_BASE="${NAS_MOUNT_BASE:-/mnt/nas}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1" >&2
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

check_requirements() {
    log_info "Checking requirements..."
    
    # Check if running as root or with sudo
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root or with sudo"
        exit 1
    fi
    
    # Check for cifs-utils
    if ! command -v mount.cifs &> /dev/null; then
        log_warn "cifs-utils not installed. Installing..."
        apt-get update && apt-get install -y cifs-utils
    fi
    
    # Check for avahi-utils for .local resolution
    if ! command -v avahi-resolve &> /dev/null; then
        log_warn "avahi-utils not installed. Installing for .local hostname resolution..."
        apt-get update && apt-get install -y avahi-utils
    fi
    
    log_info "All requirements satisfied"
}

resolve_nas_address() {
    # Prefer IP address for mounting (more reliable), fall back to hostname
    local nas_address=""
    
    # If IP is provided and reachable, use it (more reliable for CIFS mounts)
    if [ -n "$NAS_IP" ] && ping -c 1 -W 2 "$NAS_IP" &> /dev/null; then
        nas_address="$NAS_IP"
        log_info "NAS reachable at IP: $NAS_IP"
    elif ping -c 1 -W 2 "$NAS_HOSTNAME" &> /dev/null; then
        # Try to resolve hostname to IP for mounting
        local resolved_ip
        resolved_ip=$(avahi-resolve -n "$NAS_HOSTNAME" 2>/dev/null | awk '{print $2}')
        if [ -n "$resolved_ip" ]; then
            nas_address="$resolved_ip"
            log_info "NAS hostname $NAS_HOSTNAME resolved to IP: $resolved_ip"
        else
            nas_address="$NAS_HOSTNAME"
            log_warn "Using hostname directly (may fail for CIFS mount): $NAS_HOSTNAME"
        fi
    else
        log_error "Cannot reach NAS at $NAS_IP or $NAS_HOSTNAME"
        exit 1
    fi
    
    echo "$nas_address"
}

create_credentials_file() {
    local creds_file="/root/.nas-credentials"
    
    if [ -z "$NAS_PASSWORD" ]; then
        log_error "NAS_PASSWORD not set. Please set it in your environment or .env file"
        exit 1
    fi
    
    cat > "$creds_file" << EOF
username=$NAS_USER
password=$NAS_PASSWORD
EOF
    
    chmod 600 "$creds_file"
    echo "$creds_file"
}

mount_share() {
    local nas_address="$1"
    local share_name="$2"
    local mount_point="$3"
    local creds_file="$4"
    local options="${5:-rw}"
    
    # Create mount point if it doesn't exist
    mkdir -p "$mount_point"
    
    # Check if already mounted
    if mountpoint -q "$mount_point" 2>/dev/null; then
        log_info "Share $share_name already mounted at $mount_point"
        return 0
    fi
    
    # Mount the share
    log_info "Mounting //$nas_address/$share_name to $mount_point..."
    
    if mount -t cifs "//$nas_address/$share_name" "$mount_point" \
        -o "credentials=$creds_file,uid=1000,gid=1000,iocharset=utf8,$options,vers=3.0"; then
        log_info "Successfully mounted $share_name"
        return 0
    else
        log_error "Failed to mount $share_name"
        return 1
    fi
}

mount_all() {
    check_requirements
    
    local nas_address
    nas_address=$(resolve_nas_address)
    
    local creds_file
    creds_file=$(create_credentials_file)
    
    log_info "Mounting NAS shares to $MOUNT_BASE..."
    
    # Create base mount directory
    mkdir -p "$MOUNT_BASE"
    
    # Mount the nfs share (which contains networkshare folder with all media)
    # Zyxel NAS326 exposes 'nfs' as the SMB share name
    mount_share "$nas_address" "nfs" "$MOUNT_BASE/nfs" "$creds_file" "rw"
    
    # Create symlink for networkshare if it exists inside nfs
    if [ -d "$MOUNT_BASE/nfs/networkshare" ]; then
        ln -sf "$MOUNT_BASE/nfs/networkshare" "$MOUNT_BASE/networkshare" 2>/dev/null || true
        log_info "Created symlink: networkshare -> nfs/networkshare"
        
        # Link common media folders if they exist inside networkshare
        for folder in video music photo games admin; do
            if [ -d "$MOUNT_BASE/nfs/networkshare/$folder" ]; then
                ln -sf "$MOUNT_BASE/nfs/networkshare/$folder" "$MOUNT_BASE/$folder" 2>/dev/null || true
            fi
        done
        log_info "Created symlinks for media folders"
    elif [ -d "$MOUNT_BASE/nfs" ]; then
        # If no networkshare subfolder, link folders directly from nfs
        for folder in video music photo games admin; do
            if [ -d "$MOUNT_BASE/nfs/$folder" ]; then
                ln -sf "$MOUNT_BASE/nfs/$folder" "$MOUNT_BASE/$folder" 2>/dev/null || true
            fi
        done
        log_info "Created symlinks for media folders from nfs share"
    fi
    
    log_info "NAS mounting complete!"
    echo ""
    log_info "Plex can now access media at:"
    echo "  - /nas/nfs/networkshare (inside container)"
    echo "  - /nas/video, /nas/music, etc. (symlinks)"
    echo ""
    log_info "Configure Plex libraries to point to these paths"
}

unmount_all() {
    log_info "Unmounting NAS shares..."
    
    # Remove symlinks first
    rm -f "$MOUNT_BASE/networkshare" 2>/dev/null || true
    for folder in video music photo games admin; do
        rm -f "$MOUNT_BASE/$folder" 2>/dev/null || true
    done
    
    # Unmount shares
    if mountpoint -q "$MOUNT_BASE/nfs" 2>/dev/null; then
        umount "$MOUNT_BASE/nfs" && log_info "Unmounted nfs share"
    fi
    
    log_info "NAS unmount complete"
}

show_status() {
    echo "=== NAS Mount Status ==="
    echo ""
    
    if mountpoint -q "$MOUNT_BASE/nfs" 2>/dev/null; then
        echo -e "${GREEN}[MOUNTED]${NC} $MOUNT_BASE/nfs"
        echo ""
        echo "Contents:"
        ls -la "$MOUNT_BASE/nfs" 2>/dev/null | head -20 || echo "  (unable to list)"
    else
        echo -e "${RED}[NOT MOUNTED]${NC} $MOUNT_BASE/nfs"
    fi
    
    echo ""
    echo "=== Symlinks ==="
    if [ -L "$MOUNT_BASE/networkshare" ]; then
        echo -e "${GREEN}[OK]${NC} $MOUNT_BASE/networkshare -> $(readlink -f "$MOUNT_BASE/networkshare")"
    else
        echo -e "${YELLOW}[MISSING]${NC} $MOUNT_BASE/networkshare"
    fi
    
    for folder in video music photo games admin; do
        if [ -L "$MOUNT_BASE/$folder" ]; then
            echo -e "${GREEN}[OK]${NC} $MOUNT_BASE/$folder -> $(readlink -f "$MOUNT_BASE/$folder")"
        else
            echo -e "${YELLOW}[MISSING]${NC} $MOUNT_BASE/$folder"
        fi
    done
}

setup_automount() {
    log_info "Setting up automatic mounting on boot..."
    
    local nas_address
    nas_address=$(resolve_nas_address)
    
    local creds_file="/root/.nas-credentials"
    create_credentials_file
    
    # Add to /etc/fstab if not already present
    # Mount the 'nfs' share which contains networkshare folder
    local fstab_entry="//$nas_address/nfs $MOUNT_BASE/nfs cifs credentials=$creds_file,uid=1000,gid=1000,iocharset=utf8,_netdev,vers=3.0 0 0"
    
    if ! grep -q "$MOUNT_BASE/nfs" /etc/fstab; then
        echo "$fstab_entry" >> /etc/fstab
        log_info "Added NAS mount to /etc/fstab"
    else
        log_warn "NAS mount already in /etc/fstab"
    fi
    
    log_info "Automount configured. NAS will mount on boot."
}

# Main
case "${1:-mount}" in
    mount)
        mount_all
        ;;
    unmount|umount)
        unmount_all
        ;;
    status)
        show_status
        ;;
    automount)
        mount_all
        setup_automount
        ;;
    *)
        echo "Usage: $0 {mount|unmount|status|automount}"
        echo ""
        echo "Commands:"
        echo "  mount     - Mount NAS shares (default)"
        echo "  unmount   - Unmount all NAS shares"
        echo "  status    - Show current mount status"
        echo "  automount - Mount and configure automatic mounting on boot"
        exit 1
        ;;
esac
