#!/bin/bash
# Daily cleanup script for Linode server
# Add to crontab: 0 3 * * * /opt/homelab/HomeLabHub/deploy/linode/scripts/daily-cleanup.sh

set -e

LOG_FILE="/var/log/homelab-cleanup.log"
DAYS_TO_KEEP_LOGS=3

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== Starting Linode daily cleanup ==="

# Docker cleanup - aggressive on Linode since disk is limited
log "Cleaning Docker (aggressive)..."
docker system prune -af --volumes 2>/dev/null || true

# Remove dangling images
docker image prune -af 2>/dev/null || true

# Truncate large container logs
log "Truncating large container logs..."
find /var/lib/docker/containers -name "*.log" -size +50M -exec truncate -s 10M {} \; 2>/dev/null || true

# Clean systemd journal (keep only 3 days on Linode)
log "Cleaning journal logs..."
journalctl --vacuum-time=${DAYS_TO_KEEP_LOGS}d 2>/dev/null || true

# Clean old log files
log "Cleaning old log files..."
find /var/log -name "*.gz" -mtime +${DAYS_TO_KEEP_LOGS} -delete 2>/dev/null || true
find /var/log -name "*.old" -delete 2>/dev/null || true
find /var/log -name "*.[0-9]" -mtime +${DAYS_TO_KEEP_LOGS} -delete 2>/dev/null || true

# Clean apt cache
log "Cleaning apt cache..."
apt-get clean 2>/dev/null || true

# Clean npm cache (with timeout to prevent hanging)
log "Cleaning npm cache..."
timeout 30 npm cache clean --force 2>/dev/null || true

# Clean temp files
log "Cleaning temp files..."
find /tmp -type f -mtime +1 -delete 2>/dev/null || true

# Report disk usage
log "Current disk usage:"
df -h / | tee -a "$LOG_FILE"

log "=== Cleanup complete ==="

# Keep cleanup log small
tail -500 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE" 2>/dev/null || true
