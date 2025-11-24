#!/bin/bash
# ============================================
# INSTALL BACKUP CRON JOBS
# Sets up automated backup scheduling
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Installing automated backup cron jobs..."

# Create cron job for daily backups at 2 AM
CRON_JOB="0 2 * * * $PROJECT_ROOT/scripts/automated-backup.sh >> $PROJECT_ROOT/logs/automated-backup.log 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "automated-backup.sh"; then
    echo "⚠ Backup cron job already exists"
else
    # Add cron job
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    echo "✓ Installed daily backup cron job (runs at 2 AM)"
fi

# Optional: Weekly full backup on Sundays at 3 AM
WEEKLY_CRON="0 3 * * 0 $PROJECT_ROOT/scripts/automated-backup.sh >> $PROJECT_ROOT/logs/automated-backup.log 2>&1"

echo ""
echo "Current cron jobs:"
crontab -l 2>/dev/null | grep "automated-backup" || echo "No backup cron jobs found"

echo ""
echo "To remove automated backups, run:"
echo "  crontab -e"
echo "  # Then delete the line(s) containing 'automated-backup.sh'"
