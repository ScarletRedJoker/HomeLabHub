#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/backups/discord-tickets"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║        📦 Discord Ticket Database Restore Tool                 ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if PostgreSQL is running
if ! docker ps | grep -q discord-bot-db; then
    echo "❌ ERROR: discord-bot-db container is not running"
    echo "   Please start the container first: docker-compose up -d discord-bot-db"
    exit 1
fi

# List available backups
if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]; then
    echo "❌ No backups found in: $BACKUP_DIR"
    echo ""
    echo "To create a backup, run:"
    echo "  bash $SCRIPT_DIR/reset-tickets.sh"
    exit 1
fi

echo "Available backups:"
echo ""
ls -lh "$BACKUP_DIR" | grep ".sql$" | awk '{print "  " $9 " (" $5 ")"}'
echo ""

read -p "Enter backup filename to restore: " BACKUP_NAME

if [ ! -f "$BACKUP_DIR/$BACKUP_NAME" ]; then
    echo "❌ Backup file not found: $BACKUP_DIR/$BACKUP_NAME"
    exit 1
fi

echo ""
echo "⚠️  WARNING: This will overwrite current ticket data!"
echo "   Restoring from: $BACKUP_NAME"
read -p "   Continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Restore cancelled"
    exit 0
fi

echo ""
echo "Restoring from backup: $BACKUP_NAME..."

docker exec -i discord-bot-db psql -U postgres -d discord < "$BACKUP_DIR/$BACKUP_NAME"

echo "✅ Restore complete"
echo ""
echo "Restarting Discord bot..."
docker-compose -f "$PROJECT_ROOT/docker-compose.unified.yml" restart discord-bot

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║        ✅ RESTORE COMPLETE!                                    ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "The ticket database has been restored from backup."
echo "All ticket data, messages, resolutions, and audit logs have been recovered."
echo ""
