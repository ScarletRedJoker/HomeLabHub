#!/bin/bash
# Discord Bot Database Sync Script
# Run this after deploying to sync schema changes to production
# Usage: ./sync-discordbot-db.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "═══ Discord Bot Database Sync ═══"
echo "Syncing schema to production database..."

CONTAINER="homelab-postgres"
DB="discord_bot"
USER="postgres"
ERRORS=0

# Function to run SQL (reports errors but continues)
run_sql() {
    local result
    if result=$(docker exec -i $CONTAINER psql -U $USER -d $DB -c "$1" 2>&1); then
        echo -e "  ${GREEN}✓${NC} $2"
    else
        if echo "$result" | grep -q "already exists"; then
            echo -e "  ${YELLOW}○${NC} $2 (already exists)"
        else
            echo -e "  ${RED}✗${NC} $2: $result"
            ((ERRORS++))
        fi
    fi
}

echo "[1/5] Syncing stream_tracked_users table..."
run_sql "ALTER TABLE stream_tracked_users ADD COLUMN IF NOT EXISTS platform_usernames JSONB DEFAULT '{}'::jsonb;" "platform_usernames column"
run_sql "ALTER TABLE stream_tracked_users ADD COLUMN IF NOT EXISTS connected_platforms TEXT[] DEFAULT ARRAY[]::TEXT[];" "connected_platforms column"
run_sql "ALTER TABLE stream_tracked_users ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMP;" "last_notified_at column"

echo "[2/5] Syncing stream_notification_settings table..."
run_sql "ALTER TABLE stream_notification_settings ADD COLUMN IF NOT EXISTS notify_all_members BOOLEAN DEFAULT false NOT NULL;" "notify_all_members column"
run_sql "ALTER TABLE stream_notification_settings ADD COLUMN IF NOT EXISTS game_filter TEXT;" "game_filter column"
run_sql "ALTER TABLE stream_notification_settings ADD COLUMN IF NOT EXISTS cooldown_minutes INTEGER DEFAULT 60 NOT NULL;" "cooldown_minutes column"
run_sql "ALTER TABLE stream_notification_settings ADD COLUMN IF NOT EXISTS streaming_role_id TEXT;" "streaming_role_id column"
run_sql "ALTER TABLE stream_notification_settings ADD COLUMN IF NOT EXISTS required_role_id TEXT;" "required_role_id column"

echo "[3/5] Creating stream_notification_log table..."
run_sql "CREATE TABLE IF NOT EXISTS stream_notification_log (
    id SERIAL PRIMARY KEY,
    server_id TEXT NOT NULL,
    discord_user_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    stream_id TEXT,
    notified_at TIMESTAMP DEFAULT NOW() NOT NULL,
    source TEXT NOT NULL
);" "stream_notification_log table"
run_sql "CREATE INDEX IF NOT EXISTS idx_notification_log_lookup ON stream_notification_log(server_id, discord_user_id, stream_id);" "notification_log index"

echo "[4/5] Creating thread_mappings table..."
run_sql "CREATE TABLE IF NOT EXISTS thread_mappings (
    id SERIAL PRIMARY KEY,
    thread_id TEXT NOT NULL UNIQUE,
    ticket_id INTEGER NOT NULL,
    server_id TEXT NOT NULL,
    channel_id TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);" "thread_mappings table"

echo "[5/5] Granting permissions..."
run_sql "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO discord_bot;" "table permissions"
run_sql "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO discord_bot;" "sequence permissions"

echo ""
echo "═══ Verification ═══"
for table in tickets ticket_settings stream_tracked_users stream_notification_settings stream_notification_log thread_mappings; do
    if docker exec -i $CONTAINER psql -U $USER -d $DB -c "\\dt $table" 2>/dev/null | grep -q $table; then
        echo -e "  ${GREEN}✓${NC} $table exists"
    else
        echo -e "  ${RED}✗${NC} $table MISSING"
        ((ERRORS++))
    fi
done

echo ""
if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}✗ Sync completed with $ERRORS errors${NC}"
    echo "Check the output above for details."
    exit 1
else
    echo -e "${GREEN}✓ Database sync complete!${NC}"
fi
echo ""
echo "Restart discord-bot to apply changes:"
echo "  docker restart discord-bot"
