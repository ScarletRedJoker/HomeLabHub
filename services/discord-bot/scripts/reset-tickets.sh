#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/backups/discord-tickets"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║        🔄 Discord Ticket Database Reset Tool                  ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if PostgreSQL is running
if ! docker ps | grep -q discord-bot-db; then
    echo "❌ ERROR: discord-bot-db container is not running"
    echo "   Please start the container first: docker-compose up -d discord-bot-db"
    exit 1
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/tickets_backup_$TIMESTAMP.sql"

echo "Step 1: Creating backup of all ticket data..."
docker exec discord-bot-db pg_dump \
    -U postgres \
    -d discord \
    --table=tickets \
    --table=ticket_categories \
    --table=ticket_messages \
    --table=ticket_resolutions \
    --table=ticket_audit_log \
    --table=interaction_locks \
    > "$BACKUP_FILE"

echo "✅ Backup created: $BACKUP_FILE"
echo "   Size: $(du -h "$BACKUP_FILE" | cut -f1)"

# Ask for confirmation
echo ""
echo "⚠️  WARNING: This will delete ALL tickets from the database!"
echo "   Backup has been saved to: $BACKUP_FILE"
echo ""
read -p "   Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Reset cancelled"
    exit 0
fi

echo ""
echo "Step 2: Resetting ticket database..."

# Execute reset SQL
docker exec -i discord-bot-db psql -U postgres -d discord <<EOF
-- Disable triggers to avoid cascade issues
SET session_replication_role = 'replica';

-- Delete all ticket-related data
DELETE FROM ticket_audit_log;
DELETE FROM ticket_resolutions;
DELETE FROM ticket_messages;
DELETE FROM tickets;

-- Delete all interaction locks (cleanup)
DELETE FROM interaction_locks;

-- Reset sequences
SELECT setval('tickets_id_seq', 1, false);
SELECT setval('ticket_messages_id_seq', 1, false);
SELECT setval('ticket_resolutions_id_seq', 1, false);
SELECT setval('ticket_audit_log_id_seq', 1, false);

-- Re-enable triggers
SET session_replication_role = 'origin';

-- Verify counts
SELECT 'Tickets' as table_name, COUNT(*) as count FROM tickets
UNION ALL
SELECT 'Categories', COUNT(*) FROM ticket_categories
UNION ALL
SELECT 'Messages', COUNT(*) FROM ticket_messages
UNION ALL
SELECT 'Resolutions', COUNT(*) FROM ticket_resolutions
UNION ALL
SELECT 'Audit Log', COUNT(*) FROM ticket_audit_log
UNION ALL
SELECT 'Interaction Locks', COUNT(*) FROM interaction_locks;
EOF

echo "✅ Database reset complete"

echo ""
echo "Step 3: Restarting Discord bot..."
docker-compose -f "$PROJECT_ROOT/docker-compose.unified.yml" restart discord-bot

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║        ✅ RESET COMPLETE!                                      ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Summary:"
echo "  - Backup saved: $BACKUP_FILE"
echo "  - All tickets deleted"
echo "  - All ticket messages deleted"
echo "  - All ticket resolutions deleted"
echo "  - All ticket audit logs deleted"
echo "  - Sequences reset to 1"
echo "  - Categories preserved ✓"
echo "  - Bot settings preserved ✓"
echo "  - Panel settings preserved ✓"
echo "  - Discord bot restarted"
echo ""
echo "To restore from backup:"
echo "  bash $SCRIPT_DIR/restore-tickets.sh"
echo ""
