#!/bin/bash
set -euo pipefail

# NAS Resilient Mount Setup
# Creates fail-fast NFS mounts that won't hang when NAS is offline
# Uses soft timeouts + local fallback directories

NAS_IP="${NAS_IP:-192.168.0.176}"
NAS_SHARES=("video" "music" "photo" "games")
MOUNT_BASE="/mnt/nas"
MEDIA_BASE="/srv/media"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (sudo)"
        exit 1
    fi
}

create_directories() {
    log_info "Creating local media directories..."
    
    # Create NAS mount points
    mkdir -p "${MOUNT_BASE}/all"
    for share in "${NAS_SHARES[@]}"; do
        mkdir -p "${MOUNT_BASE}/${share}"
    done
    
    # Create local /srv/media directories (these always exist)
    mkdir -p "${MEDIA_BASE}"
    for share in "${NAS_SHARES[@]}"; do
        mkdir -p "${MEDIA_BASE}/${share}"
    done
    
    # Set ownership
    chown -R 1000:1000 "${MEDIA_BASE}"
    
    log_info "Created directories at ${MEDIA_BASE}"
}

install_nfs_utils() {
    if ! command -v mount.nfs &> /dev/null; then
        log_info "Installing NFS utilities..."
        apt-get update && apt-get install -y nfs-common
    fi
}

create_systemd_mounts() {
    log_info "Creating systemd mount units with fail-fast options..."
    
    # Main NAS mount with soft timeout (fails fast instead of hanging)
    cat > /etc/systemd/system/mnt-nas-all.mount << EOF
[Unit]
Description=NAS All Share (Fail-Fast)
After=network-online.target
Wants=network-online.target
DefaultDependencies=no

[Mount]
What=${NAS_IP}:/volume1/all
Where=/mnt/nas/all
Type=nfs
Options=soft,timeo=30,retrans=2,vers=4.2,_netdev,noauto,x-systemd.automount,x-systemd.idle-timeout=300,x-systemd.mount-timeout=30
TimeoutSec=60

[Install]
WantedBy=multi-user.target
EOF

    # Automount unit - mounts on demand, unmounts when idle
    cat > /etc/systemd/system/mnt-nas-all.automount << EOF
[Unit]
Description=NAS All Share Automount
After=network-online.target
ConditionPathExists=/mnt/nas/all

[Automount]
Where=/mnt/nas/all
TimeoutIdleSec=300
DirectoryMode=0755

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd
    systemctl daemon-reload
    
    # Enable automount (not the mount itself - automount triggers it)
    systemctl enable mnt-nas-all.automount
    
    log_info "Systemd mount units created"
}

create_bind_mounts() {
    log_info "Setting up bind mounts from NAS to /srv/media..."
    
    # Create bind mount service that links NAS to /srv/media when available
    # This service runs when the NAS mount activates (via BindsTo)
    cat > /etc/systemd/system/srv-media-bind.service << EOF
[Unit]
Description=Bind NAS shares to /srv/media
After=mnt-nas-all.mount
BindsTo=mnt-nas-all.mount
PartOf=mnt-nas-all.mount

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/bin/nas-bind-mounts.sh start
ExecStop=/usr/local/bin/nas-bind-mounts.sh stop

[Install]
WantedBy=mnt-nas-all.mount
EOF

    # Create the bind mount script
    cat > /usr/local/bin/nas-bind-mounts.sh << 'SCRIPT'
#!/bin/bash
ACTION="${1:-start}"
SHARES=("video" "music" "photo" "games")
LOG_FILE="/var/log/nas-bind-mounts.log"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"; }

case "$ACTION" in
    start)
        log "Starting bind mounts..."
        # Wait briefly for mount to stabilize
        sleep 2
        for share in "${SHARES[@]}"; do
            # Skip if already mounted
            if mountpoint -q "/srv/media/${share}" 2>/dev/null; then
                log "Already bound: ${share}"
                continue
            fi
            # Check if NAS share is accessible (with timeout)
            if timeout 5 test -d "/mnt/nas/all/${share}" 2>/dev/null; then
                mount --bind "/mnt/nas/all/${share}" "/srv/media/${share}" 2>/dev/null && \
                    log "Bound: ${share}" || log "Failed to bind: ${share}"
            else
                log "NAS share not accessible: ${share}"
            fi
        done
        ;;
    stop)
        log "Stopping bind mounts..."
        for share in "${SHARES[@]}"; do
            umount "/srv/media/${share}" 2>/dev/null && log "Unbound: ${share}" || true
        done
        ;;
esac
SCRIPT
    
    chmod +x /usr/local/bin/nas-bind-mounts.sh
    systemctl daemon-reload
    
    # Enable the service to auto-run when NAS mounts
    systemctl enable srv-media-bind.service
    
    log_info "Bind mount service created and enabled"
}

create_watchdog() {
    log_info "Creating NAS mount watchdog..."
    
    cat > /usr/local/bin/nas-watchdog.sh << 'WATCHDOG'
#!/bin/bash
# NAS Mount Watchdog - Detects and recovers stale mounts

MOUNT_PATH="/mnt/nas/all"
LOG_FILE="/var/log/nas-watchdog.log"
DISCORD_WEBHOOK="${STORAGE_ALERT_DISCORD_WEBHOOK:-}"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}

send_alert() {
    local message="$1"
    log "ALERT: $message"
    
    if [[ -n "$DISCORD_WEBHOOK" ]]; then
        curl -s -X POST -H "Content-Type: application/json" \
            -d "{\"content\":\"🚨 NAS Alert: $message\"}" \
            "$DISCORD_WEBHOOK" > /dev/null 2>&1
    fi
}

check_mount() {
    # Use timeout to prevent hanging on stale mount
    if timeout 5 stat "$MOUNT_PATH" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

recover_mount() {
    log "Attempting to recover stale NAS mount..."
    
    # Force lazy unmount to clear stale state
    umount -l "$MOUNT_PATH" 2>/dev/null || true
    
    # Clear any zombie bind mounts
    for share in video music photo games; do
        umount -l "/srv/media/${share}" 2>/dev/null || true
    done
    
    # Let systemd automount handle reconnection
    systemctl restart mnt-nas-all.automount 2>/dev/null || true
    
    # Wait briefly then try to re-establish bind mounts if NAS is back
    sleep 5
    if timeout 5 stat "$MOUNT_PATH" > /dev/null 2>&1; then
        log "NAS is back online, re-establishing bind mounts..."
        /usr/local/bin/nas-bind-mounts.sh start 2>/dev/null || true
    fi
    
    log "Mount recovery attempted"
}

# Main check
if ! check_mount; then
    send_alert "NAS mount stale or offline - recovering"
    recover_mount
fi
WATCHDOG

    chmod +x /usr/local/bin/nas-watchdog.sh
    
    # Create systemd timer for watchdog (runs every 2 minutes)
    cat > /etc/systemd/system/nas-watchdog.service << EOF
[Unit]
Description=NAS Mount Watchdog

[Service]
Type=oneshot
ExecStart=/usr/local/bin/nas-watchdog.sh
EOF

    cat > /etc/systemd/system/nas-watchdog.timer << EOF
[Unit]
Description=Run NAS watchdog every 2 minutes

[Timer]
OnBootSec=60
OnUnitActiveSec=120
AccuracySec=30

[Install]
WantedBy=timers.target
EOF

    systemctl daemon-reload
    systemctl enable nas-watchdog.timer
    systemctl start nas-watchdog.timer
    
    log_info "Watchdog timer installed and started"
}

remove_fstab_entries() {
    log_info "Removing any NAS entries from /etc/fstab..."
    
    # Backup fstab
    cp /etc/fstab /etc/fstab.backup.$(date +%Y%m%d)
    
    # Remove NAS mount lines
    sed -i '/\/mnt\/nas/d' /etc/fstab
    sed -i "/${NAS_IP}/d" /etc/fstab
    
    log_info "fstab cleaned"
}

test_mount() {
    log_info "Testing NAS mount..."
    
    # Try to trigger automount
    if timeout 10 ls "${MOUNT_BASE}/all" > /dev/null 2>&1; then
        log_info "NAS mount successful!"
        
        # Start bind mounts if NAS is available
        systemctl start srv-media-bind.service 2>/dev/null || true
        
        return 0
    else
        log_warn "NAS not currently available (this is OK - system will work without it)"
        return 0
    fi
}

main() {
    log_info "=== NAS Resilient Mount Setup ==="
    log_info "NAS IP: ${NAS_IP}"
    
    check_root
    install_nfs_utils
    create_directories
    remove_fstab_entries
    create_systemd_mounts
    create_bind_mounts
    create_watchdog
    test_mount
    
    echo ""
    log_info "=== Setup Complete ==="
    echo ""
    echo "Key changes:"
    echo "  - NAS mounts use soft timeout (won't hang if offline)"
    echo "  - Local /srv/media directories always exist"
    echo "  - Docker containers mount /srv/media (never hangs)"
    echo "  - Watchdog clears stale mounts every 2 minutes"
    echo ""
    echo "Docker containers should now use:"
    echo "  /srv/media/video:/media/video"
    echo "  /srv/media/music:/media/music"
    echo "  /srv/media/photo:/media/photo"
    echo "  /srv/media/games:/media/games"
}

main "$@"
