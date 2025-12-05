#!/bin/bash
# NAS Mount Setup for Zyxel NAS326
# Mounts NFS shares from the NAS to the local Ubuntu system for Plex access
# Run with: sudo ./setup-nas-mounts.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${CYAN}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# Configuration
NAS_HOST="${NAS_HOST:-NAS326.local}"
NAS_IP="${NAS_IP:-}"
NFS_SHARE="/nfs/networkshare"
MOUNT_BASE="/mnt/nas"

# Media mount points (matching NAS folders)
declare -A MOUNTS=(
    ["video"]="video"
    ["music"]="music"
    ["photo"]="photo"
    ["games"]="games"
)

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root (sudo)"
        exit 1
    fi
}

install_nfs_utils() {
    log_info "Installing NFS utilities..."
    
    if command -v apt-get &> /dev/null; then
        apt-get update -qq
        apt-get install -y nfs-common avahi-daemon libnss-mdns
    elif command -v dnf &> /dev/null; then
        dnf install -y nfs-utils avahi nss-mdns
    elif command -v pacman &> /dev/null; then
        pacman -Sy --noconfirm nfs-utils avahi nss-mdns
    else
        log_error "Unsupported package manager"
        exit 1
    fi
    
    systemctl enable --now avahi-daemon 2>/dev/null || true
    log_success "NFS utilities installed"
}

resolve_nas_ip() {
    log_info "Resolving NAS hostname: $NAS_HOST"
    
    if [ -n "$NAS_IP" ]; then
        log_info "Using provided IP: $NAS_IP"
        return 0
    fi
    
    NAS_IP=$(getent hosts "$NAS_HOST" 2>/dev/null | awk '{print $1}' | head -1)
    
    if [ -z "$NAS_IP" ]; then
        NAS_IP=$(avahi-resolve -n "$NAS_HOST" 2>/dev/null | awk '{print $2}')
    fi
    
    if [ -z "$NAS_IP" ]; then
        NAS_IP=$(ping -c 1 "$NAS_HOST" 2>/dev/null | grep -oP '\(\K[^)]+' | head -1)
    fi
    
    if [ -z "$NAS_IP" ]; then
        log_error "Cannot resolve $NAS_HOST"
        log_info "Try: sudo ./setup-nas-mounts.sh --nas-ip=192.168.x.x"
        exit 1
    fi
    
    log_success "NAS IP: $NAS_IP"
}

test_nfs_connection() {
    log_info "Testing NFS connection to $NAS_IP..."
    
    if showmount -e "$NAS_IP" &>/dev/null; then
        log_success "NFS server is accessible"
        log_info "Available exports:"
        showmount -e "$NAS_IP" | head -10
    else
        log_warn "Cannot query NFS exports - server may still work"
    fi
}

create_mount_points() {
    log_info "Creating mount points..."
    
    mkdir -p "$MOUNT_BASE"
    
    for mount_name in "${!MOUNTS[@]}"; do
        local mount_point="${MOUNT_BASE}/${mount_name}"
        mkdir -p "$mount_point"
        log_success "Created: $mount_point"
    done
    
    mkdir -p "$MOUNT_BASE/all"
    log_success "Created: $MOUNT_BASE/all (full share)"
}

configure_fstab() {
    log_info "Configuring /etc/fstab..."
    
    local backup="/etc/fstab.backup.$(date +%Y%m%d%H%M%S)"
    cp /etc/fstab "$backup"
    log_info "Backed up fstab to: $backup"
    
    sed -i '/# NAS326 NFS Mounts/,/# End NAS326/d' /etc/fstab
    
    cat >> /etc/fstab << EOF

# NAS326 NFS Mounts (auto-generated)
# Zyxel NAS326 at $NAS_HOST ($NAS_IP)
${NAS_IP}:${NFS_SHARE}  ${MOUNT_BASE}/all  nfs  defaults,soft,timeo=150,retrans=3,_netdev,noauto,x-systemd.automount  0  0
# End NAS326

EOF
    
    log_success "Updated /etc/fstab"
}

mount_shares() {
    log_info "Mounting NFS shares..."
    
    systemctl daemon-reload
    
    if mount "${MOUNT_BASE}/all" 2>/dev/null; then
        log_success "Mounted: ${MOUNT_BASE}/all"
        
        log_info "Creating symlinks to media folders..."
        for mount_name in "${!MOUNTS[@]}"; do
            local nas_folder="${MOUNTS[$mount_name]}"
            local symlink="${MOUNT_BASE}/${mount_name}"
            local target="${MOUNT_BASE}/all/${nas_folder}"
            
            if [ -d "$target" ]; then
                rm -f "$symlink" 2>/dev/null || rmdir "$symlink" 2>/dev/null || true
                ln -sf "$target" "$symlink"
                log_success "Linked: $symlink -> $target"
            else
                log_warn "Folder not found on NAS: $nas_folder"
            fi
        done
    else
        log_error "Failed to mount NFS share"
        log_info "Trying alternative mount..."
        
        if mount -t nfs -o soft,timeo=150 "${NAS_IP}:${NFS_SHARE}" "${MOUNT_BASE}/all"; then
            log_success "Mounted with alternative options"
        else
            log_error "Mount failed. Check NFS export permissions on NAS."
            exit 1
        fi
    fi
}

verify_mounts() {
    log_info "Verifying mounts..."
    
    if mountpoint -q "${MOUNT_BASE}/all"; then
        log_success "NFS share is mounted"
        
        echo ""
        log_info "Contents of ${MOUNT_BASE}/all:"
        ls -la "${MOUNT_BASE}/all" 2>/dev/null || true
        
        echo ""
        log_info "Symlinks:"
        ls -la "${MOUNT_BASE}" | grep "^l" || true
    else
        log_error "Mount verification failed"
        exit 1
    fi
}

show_plex_paths() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Plex Library Paths"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "Add these paths to your Plex libraries:"
    echo ""
    echo "  Movies/TV:    ${MOUNT_BASE}/video"
    echo "  Music:        ${MOUNT_BASE}/music"
    echo "  Photos:       ${MOUNT_BASE}/photo"
    echo "  Games:        ${MOUNT_BASE}/games"
    echo "  All Media:    ${MOUNT_BASE}/all"
    echo ""
    echo "To add libraries in Plex:"
    echo "  1. Go to http://localhost:32400/web"
    echo "  2. Settings -> Libraries -> Add Library"
    echo "  3. Choose type (Movies, TV Shows, Music, Photos)"
    echo "  4. Add folder using paths above"
    echo ""
}

parse_args() {
    for arg in "$@"; do
        case $arg in
            --nas-ip=*)
                NAS_IP="${arg#*=}"
                ;;
            --nas-host=*)
                NAS_HOST="${arg#*=}"
                ;;
            --unmount)
                unmount_shares
                exit 0
                ;;
            --status)
                show_status
                exit 0
                ;;
            --help)
                show_help
                exit 0
                ;;
        esac
    done
}

unmount_shares() {
    log_info "Unmounting NAS shares..."
    
    for mount_name in "${!MOUNTS[@]}"; do
        rm -f "${MOUNT_BASE}/${mount_name}" 2>/dev/null || true
    done
    
    if umount "${MOUNT_BASE}/all" 2>/dev/null; then
        log_success "Unmounted ${MOUNT_BASE}/all"
    else
        log_warn "Nothing to unmount"
    fi
}

show_status() {
    echo "═══════════════════════════════════════════════════════════════"
    echo "  NAS Mount Status"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    
    if mountpoint -q "${MOUNT_BASE}/all" 2>/dev/null; then
        log_success "NAS is mounted at ${MOUNT_BASE}/all"
        echo ""
        df -h "${MOUNT_BASE}/all"
        echo ""
        log_info "Contents:"
        ls -la "${MOUNT_BASE}/all"
    else
        log_warn "NAS is not mounted"
        echo ""
        log_info "Run: sudo ./setup-nas-mounts.sh"
    fi
}

show_help() {
    echo "NAS Mount Setup for Zyxel NAS326"
    echo ""
    echo "Usage: sudo $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --nas-ip=IP       Specify NAS IP address directly"
    echo "  --nas-host=HOST   Specify NAS hostname (default: NAS326.local)"
    echo "  --unmount         Unmount all NAS shares"
    echo "  --status          Show current mount status"
    echo "  --help            Show this help message"
    echo ""
    echo "Examples:"
    echo "  sudo $0                           # Auto-detect NAS"
    echo "  sudo $0 --nas-ip=192.168.0.100   # Use specific IP"
    echo "  sudo $0 --status                  # Check if mounted"
    echo "  sudo $0 --unmount                 # Unmount shares"
}

main() {
    echo "═══════════════════════════════════════════════════════════════"
    echo "  NAS Mount Setup - Zyxel NAS326"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    
    parse_args "$@"
    check_root
    install_nfs_utils
    resolve_nas_ip
    test_nfs_connection
    create_mount_points
    configure_fstab
    mount_shares
    verify_mounts
    show_plex_paths
    
    log_success "NAS setup complete!"
}

main "$@"
