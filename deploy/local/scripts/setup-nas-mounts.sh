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
NFS_SHARE="${NFS_SHARE:-}"  # Auto-detected from showmount
SMB_SHARE="${SMB_SHARE:-}"  # For direct SMB mounting
MOUNT_TYPE="${MOUNT_TYPE:-auto}"  # auto, nfs, or smb
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
        
        # Auto-detect best export path if not specified
        if [ -z "$NFS_SHARE" ]; then
            log_info "Auto-detecting NFS export path..."
            
            # Look for exports available to everyone (*) or this host
            local my_ip=$(hostname -I | awk '{print $1}')
            local exports=$(showmount -e "$NAS_IP" 2>/dev/null)
            
            # First try: find export with networkshare that allows everyone or our IP
            NFS_SHARE=$(echo "$exports" | grep -E "networkshare.*(\*|${my_ip})" | awk '{print $1}' | head -1)
            
            # Second try: find any export that allows everyone (*)
            if [ -z "$NFS_SHARE" ]; then
                NFS_SHARE=$(echo "$exports" | grep '\*$' | awk '{print $1}' | head -1)
            fi
            
            # Third try: find any nfs-related export
            if [ -z "$NFS_SHARE" ]; then
                NFS_SHARE=$(echo "$exports" | grep -i nfs | awk '{print $1}' | head -1)
            fi
            
            if [ -n "$NFS_SHARE" ]; then
                log_success "Auto-detected export: $NFS_SHARE"
            else
                log_error "Could not auto-detect NFS export path"
                log_info "Please specify with: --nfs-share=/path/to/share"
                exit 1
            fi
        fi
    else
        log_warn "Cannot query NFS exports - server may still work"
        if [ -z "$NFS_SHARE" ]; then
            NFS_SHARE="/nfs/networkshare"  # Fallback default
            log_warn "Using default export path: $NFS_SHARE"
        fi
    fi
}

cleanup_stale_mounts() {
    log_info "Checking for stale mounts..."
    
    if mount | grep -q "$MOUNT_BASE"; then
        log_warn "Found existing mount at $MOUNT_BASE, unmounting..."
        umount -l "$MOUNT_BASE/all" 2>/dev/null || true
        umount -f "$MOUNT_BASE/all" 2>/dev/null || true
        umount -l "$MOUNT_BASE" 2>/dev/null || true
        umount -f "$MOUNT_BASE" 2>/dev/null || true
        sleep 1
        log_success "Cleaned up stale mounts"
    fi
    
    if timeout 5 ls "$MOUNT_BASE" &>/dev/null; then
        log_info "Mount base is accessible"
    else
        log_warn "Mount base appears stale, forcing cleanup..."
        umount -l "$MOUNT_BASE/all" 2>/dev/null || true
        umount -l "$MOUNT_BASE" 2>/dev/null || true
        rm -rf "$MOUNT_BASE" 2>/dev/null || true
    fi
}

create_mount_points() {
    log_info "Creating mount points..."
    
    cleanup_stale_mounts
    
    mkdir -p "$MOUNT_BASE" 2>/dev/null || true
    
    for mount_name in "${!MOUNTS[@]}"; do
        local mount_point="${MOUNT_BASE}/${mount_name}"
        mkdir -p "$mount_point" 2>/dev/null || true
        if [ -d "$mount_point" ]; then
            log_success "Ready: $mount_point"
        fi
    done
    
    mkdir -p "$MOUNT_BASE/all" 2>/dev/null || true
    if [ -d "$MOUNT_BASE/all" ]; then
        log_success "Ready: $MOUNT_BASE/all (full share)"
    fi
}

configure_fstab() {
    log_info "Configuring /etc/fstab..."
    
    local backup="/etc/fstab.backup.$(date +%Y%m%d%H%M%S)"
    cp /etc/fstab "$backup"
    log_info "Backed up fstab to: $backup"
    
    sed -i '/# NAS326.*Mounts/,/# End NAS326/d' /etc/fstab
    
    if [ "$MOUNT_TYPE" = "smb" ] || [ -n "$SMB_SHARE" ]; then
        cat >> /etc/fstab << EOF

# NAS326 SMB Mounts (auto-generated)
# Zyxel NAS326 at $NAS_HOST ($NAS_IP)
//${NAS_IP}/${SMB_SHARE}  ${MOUNT_BASE}/all  cifs  guest,vers=3.0,_netdev,noauto,x-systemd.automount  0  0
# End NAS326

EOF
    else
        cat >> /etc/fstab << EOF

# NAS326 NFS Mounts (auto-generated)
# Zyxel NAS326 at $NAS_HOST ($NAS_IP)
${NAS_IP}:${NFS_SHARE}  ${MOUNT_BASE}/all  nfs  nfsvers=3,proto=tcp,soft,timeo=150,retrans=3,_netdev,noauto,x-systemd.automount  0  0
# End NAS326

EOF
    fi
    
    log_success "Updated /etc/fstab"
}

mount_smb_share() {
    log_info "Mounting SMB share..."
    
    apt-get install -y cifs-utils 2>/dev/null || true
    
    local share_name="${SMB_SHARE}"
    
    log_info "Attempting SMB mount: //${NAS_IP}/${share_name}"
    
    if mount -t cifs "//${NAS_IP}/${share_name}" "${MOUNT_BASE}/all" -o guest,vers=3.0 2>/dev/null; then
        log_success "Mounted via SMB 3.0: ${MOUNT_BASE}/all"
        return 0
    elif mount -t cifs "//${NAS_IP}/${share_name}" "${MOUNT_BASE}/all" -o guest,vers=2.1 2>/dev/null; then
        log_success "Mounted via SMB 2.1: ${MOUNT_BASE}/all"
        return 0
    elif mount -t cifs "//${NAS_IP}/${share_name}" "${MOUNT_BASE}/all" -o guest 2>/dev/null; then
        log_success "Mounted via SMB (auto): ${MOUNT_BASE}/all"
        return 0
    else
        log_error "SMB mount failed for //${NAS_IP}/${share_name}"
        return 1
    fi
}

mount_nfs_share() {
    log_info "Mounting NFS share..."
    
    log_info "Attempting NFS mount: ${NAS_IP}:${NFS_SHARE}"
    
    if mount -t nfs -o nfsvers=3,proto=tcp,soft,timeo=150,retrans=3 "${NAS_IP}:${NFS_SHARE}" "${MOUNT_BASE}/all" 2>/dev/null; then
        log_success "Mounted via NFS v3: ${MOUNT_BASE}/all"
        return 0
    elif mount -t nfs -o nfsvers=4,proto=tcp,soft,timeo=150 "${NAS_IP}:${NFS_SHARE}" "${MOUNT_BASE}/all" 2>/dev/null; then
        log_success "Mounted via NFS v4: ${MOUNT_BASE}/all"
        return 0
    elif mount -t nfs "${NAS_IP}:${NFS_SHARE}" "${MOUNT_BASE}/all" 2>/dev/null; then
        log_success "Mounted via NFS (auto): ${MOUNT_BASE}/all"
        return 0
    else
        log_error "NFS mount failed for ${NAS_IP}:${NFS_SHARE}"
        return 1
    fi
}

mount_shares() {
    log_info "Mounting shares (type: ${MOUNT_TYPE})..."
    
    systemctl daemon-reload
    
    local mount_success=false
    
    if [ "$MOUNT_TYPE" = "smb" ]; then
        if mount_smb_share; then
            mount_success=true
        fi
    elif [ "$MOUNT_TYPE" = "nfs" ]; then
        if mount_nfs_share; then
            mount_success=true
        fi
    else
        if mount_nfs_share; then
            mount_success=true
        elif [ -n "$SMB_SHARE" ]; then
            log_info "NFS failed, trying SMB fallback..."
            if mount_smb_share; then
                mount_success=true
            fi
        else
            log_info "Checking if SMB/CIFS is available..."
            if nc -z -w2 "$NAS_IP" 445 2>/dev/null; then
                log_info "SMB port is open, trying CIFS mount..."
                SMB_SHARE="nfs"
                if mount_smb_share; then
                    mount_success=true
                fi
            fi
        fi
    fi
    
    if [ "$mount_success" = false ]; then
        log_error "All mount attempts failed"
        echo ""
        echo "Please run the diagnostic script:"
        echo "  ./scripts/diagnose-nas.sh ${NAS_IP}"
        exit 1
    fi
    
    # Create symlinks to media folders
    log_info "Creating symlinks to media folders..."
    for mount_name in "${!MOUNTS[@]}"; do
        local nas_folder="${MOUNTS[$mount_name]}"
        local symlink="${MOUNT_BASE}/${mount_name}"
        
        # Check multiple possible locations for media folders
        local target=""
        if [ -d "${MOUNT_BASE}/all/${nas_folder}" ]; then
            target="${MOUNT_BASE}/all/${nas_folder}"
        elif [ -d "${MOUNT_BASE}/all/networkshare/${nas_folder}" ]; then
            target="${MOUNT_BASE}/all/networkshare/${nas_folder}"
        fi
        
        if [ -n "$target" ] && [ -d "$target" ]; then
            rm -f "$symlink" 2>/dev/null || rmdir "$symlink" 2>/dev/null || true
            ln -sf "$target" "$symlink"
            log_success "Linked: $symlink -> $target"
        else
            log_warn "Folder not found on NAS: $nas_folder"
        fi
    done
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
            --nfs-share=*)
                NFS_SHARE="${arg#*=}"
                MOUNT_TYPE="nfs"
                ;;
            --smb-share=*)
                SMB_SHARE="${arg#*=}"
                MOUNT_TYPE="smb"
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
            --clean-fstab)
                clean_old_fstab
                exit 0
                ;;
        esac
    done
}

clean_old_fstab() {
    log_info "Cleaning old NAS entries from fstab..."
    
    # Backup
    cp /etc/fstab /etc/fstab.backup.$(date +%Y%m%d%H%M%S)
    
    # Remove old NAS326 entries and old IP entries
    sed -i '/# NAS326/,/# End NAS326/d' /etc/fstab
    sed -i '/192\.168\.1\.[0-9]*.*nas/d' /etc/fstab
    sed -i '/192\.168\.1\.[0-9]*.*nfs/d' /etc/fstab
    
    log_success "Cleaned old fstab entries"
    log_info "Current NAS-related fstab entries:"
    grep -i "nas\|nfs" /etc/fstab || echo "  (none)"
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
    echo "  --nfs-share=PATH  Specify NFS export path (e.g., /nfs/networkshare)"
    echo "  --smb-share=NAME  Specify SMB share name for direct CIFS mount (e.g., media)"
    echo "  --unmount         Unmount all NAS shares"
    echo "  --status          Show current mount status"
    echo "  --clean-fstab     Remove old NAS entries from fstab"
    echo "  --help            Show this help message"
    echo ""
    echo "Mount Types:"
    echo "  By default, NFS is tried first, then SMB as fallback."
    echo "  Use --nfs-share to force NFS mount."
    echo "  Use --smb-share to force SMB/CIFS mount."
    echo ""
    echo "Examples:"
    echo "  sudo $0                                    # Auto-detect NAS and mount"
    echo "  sudo $0 --nas-ip=192.168.0.100            # Use specific IP"
    echo "  sudo $0 --nas-ip=192.168.0.100 --nfs-share=/nfs/media   # Force NFS"
    echo "  sudo $0 --nas-ip=192.168.0.100 --smb-share=public       # Force SMB"
    echo "  sudo $0 --status                          # Check if mounted"
    echo "  sudo $0 --unmount                         # Unmount shares"
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
    
    if [ "$MOUNT_TYPE" != "smb" ]; then
        test_nfs_connection
    else
        log_info "Using SMB mount type, skipping NFS detection"
    fi
    
    create_mount_points
    configure_fstab
    mount_shares
    verify_mounts
    show_plex_paths
    
    log_success "NAS setup complete!"
}

main "$@"
