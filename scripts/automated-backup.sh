#!/bin/bash
# ============================================
# AUTOMATED BACKUP SCHEDULER
# Runs database backups on schedule
# ============================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROJECT_ROOT="/home/evin/contain/HomeLabHub"
BACKUP_DIR="$PROJECT_ROOT/var/backups/databases"
LOG_FILE="$PROJECT_ROOT/logs/automated-backup.log"

mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Run backup using homelab script
backup_database() {
    log "Starting automated database backup..."
    
    if cd "$PROJECT_ROOT" && ./homelab db backup; then
        log "${GREEN}✓ Database backup completed successfully${NC}"
        
        # Clean up old backups (keep last 7 daily, 4 weekly, 12 monthly)
        cleanup_old_backups
        
        return 0
    else
        log "${RED}✗ Database backup failed${NC}"
        
        # Send notification if available
        if command -v python3 &> /dev/null; then
            python3 -c "
from services.dashboard.services.notification_service import NotificationService, NotificationPriority
ns = NotificationService()
ns.notify_backup_failed('PostgreSQL', 'Automated backup script failed')
" 2>/dev/null || true
        fi
        
        return 1
    fi
}

cleanup_old_backups() {
    log "Cleaning up old backups..."
    
    # Keep daily backups for 7 days
    find "$BACKUP_DIR" -name "backup-*.sql" -type f -mtime +7 -delete 2>/dev/null || true
    
    # Keep weekly backups (every Sunday) for 4 weeks
    # Keep monthly backups (1st of month) for 12 months
    # This is a simple version - can be enhanced
    
    local old_count=$(find "$BACKUP_DIR" -name "backup-*.sql" -type f -mtime +7 | wc -l)
    log "Cleaned up $old_count old backup(s)"
}

# Check disk space before backup
check_disk_space() {
    local available=$(df "$BACKUP_DIR" | tail -1 | awk '{print $4}')
    local threshold=5242880  # 5GB in KB
    
    if [ "$available" -lt "$threshold" ]; then
        log "${YELLOW}⚠ Low disk space warning: $(( available / 1024 / 1024 ))GB available${NC}"
        return 1
    fi
    
    return 0
}

main() {
    log "=== Automated Backup Started ==="
    
    if ! check_disk_space; then
        log "Skipping backup due to low disk space"
        exit 1
    fi
    
    if backup_database; then
        log "=== Automated Backup Completed Successfully ==="
        exit 0
    else
        log "=== Automated Backup Failed ==="
        exit 1
    fi
}

main
