#!/bin/bash
#
# NAS to Google Drive Backup Script
# Backs up NAS media to Google Drive using rclone
#
# Usage: ./backup-nas-to-gdrive.sh [--dry-run]
#

set -e

NAS_MOUNT="/mnt/nas/networkshare"
GDRIVE_REMOTE="google:"
GDRIVE_BACKUP_FOLDER="NAS-Backup"
LOG_FILE="/var/log/nas-backup.log"
DRY_RUN=""

if [[ "$1" == "--dry-run" ]]; then
    DRY_RUN="--dry-run"
    echo "=== DRY RUN MODE - No files will be transferred ==="
fi

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

if [ ! -d "$NAS_MOUNT" ]; then
    log "ERROR: NAS not mounted at $NAS_MOUNT"
    exit 1
fi

log "Starting NAS backup to Google Drive..."
log "Source: $NAS_MOUNT"
log "Destination: $GDRIVE_REMOTE$GDRIVE_BACKUP_FOLDER"

FOLDERS_TO_BACKUP=(
    "video"
    "music"
    "photo"
)

for folder in "${FOLDERS_TO_BACKUP[@]}"; do
    if [ -d "$NAS_MOUNT/$folder" ]; then
        log "Backing up $folder..."
        rclone sync "$NAS_MOUNT/$folder" "$GDRIVE_REMOTE$GDRIVE_BACKUP_FOLDER/$folder" \
            --progress \
            --transfers 4 \
            --checkers 8 \
            --contimeout 60s \
            --timeout 300s \
            --retries 3 \
            --low-level-retries 10 \
            --stats 1m \
            --log-file="$LOG_FILE" \
            --log-level INFO \
            $DRY_RUN
        log "Completed $folder backup"
    else
        log "SKIP: $folder not found at $NAS_MOUNT/$folder"
    fi
done

log "=== NAS Backup Complete ==="

rclone size "$GDRIVE_REMOTE$GDRIVE_BACKUP_FOLDER" 2>/dev/null || true

echo ""
echo "Backup complete! Check $LOG_FILE for details."
