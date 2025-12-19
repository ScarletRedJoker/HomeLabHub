#!/bin/bash
# Stream Bot Database Sync Script
# Run this after deploying to sync schema changes to production
# Usage: ./sync-streambot-db.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "═══ Stream Bot Database Sync ═══"
echo "Syncing schema to production database..."

CONTAINER="homelab-postgres"
DB="streambot"
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

# Ensure pgcrypto extension for gen_random_uuid()
echo "[0/6] Ensuring pgcrypto extension..."
docker exec -i $CONTAINER psql -U $USER -d $DB -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" 2>/dev/null || true

echo "[1/6] Syncing users table..."
run_sql "ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_id VARCHAR(20);" "discord_id column"
run_sql "ALTER TABLE users ADD COLUMN IF NOT EXISTS personal_presence_enabled BOOLEAN DEFAULT false NOT NULL;" "personal_presence_enabled column"
run_sql "ALTER TABLE users ADD COLUMN IF NOT EXISTS dismissed_welcome BOOLEAN DEFAULT false NOT NULL;" "dismissed_welcome column"
run_sql "ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0 NOT NULL;" "onboarding_step column"

echo "[2/6] Syncing platform_connections table..."
run_sql "ALTER TABLE platform_connections ADD COLUMN IF NOT EXISTS needs_refresh BOOLEAN DEFAULT false NOT NULL;" "needs_refresh column"
run_sql "ALTER TABLE platform_connections ADD COLUMN IF NOT EXISTS channel_id TEXT;" "channel_id column"

echo "[3/6] Creating oauth_sessions table..."
run_sql "CREATE TABLE IF NOT EXISTS oauth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    state TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    code_verifier TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    ip_address TEXT
);" "oauth_sessions table"
run_sql "CREATE INDEX IF NOT EXISTS oauth_sessions_state_idx ON oauth_sessions(state);" "oauth_sessions state index"
run_sql "CREATE INDEX IF NOT EXISTS oauth_sessions_expires_at_idx ON oauth_sessions(expires_at);" "oauth_sessions expires index"
run_sql "CREATE INDEX IF NOT EXISTS oauth_sessions_user_id_idx ON oauth_sessions(user_id);" "oauth_sessions user index"

echo "[4/6] Creating webhook_queue table..."
run_sql "CREATE TABLE IF NOT EXISTS webhook_queue (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL,
    platform TEXT NOT NULL,
    payload JSONB NOT NULL,
    attempts INTEGER DEFAULT 0 NOT NULL,
    max_attempts INTEGER DEFAULT 5 NOT NULL,
    last_attempt_at TIMESTAMP,
    next_retry_at TIMESTAMP,
    status TEXT DEFAULT 'pending' NOT NULL,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);" "webhook_queue table"
run_sql "CREATE INDEX IF NOT EXISTS webhook_queue_status_idx ON webhook_queue(status);" "webhook_queue status index"
run_sql "CREATE INDEX IF NOT EXISTS webhook_queue_next_retry_idx ON webhook_queue(next_retry_at);" "webhook_queue retry index"

echo "[5/6] Creating custom_commands table..."
run_sql "CREATE TABLE IF NOT EXISTS custom_commands (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    response TEXT NOT NULL,
    cooldown INTEGER DEFAULT 0 NOT NULL,
    permission TEXT DEFAULT 'everyone' NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    usage_count INTEGER DEFAULT 0 NOT NULL,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);" "custom_commands table"
run_sql "CREATE UNIQUE INDEX IF NOT EXISTS custom_commands_user_id_name_unique ON custom_commands(user_id, name);" "custom_commands unique index"

echo "[6/6] Granting permissions..."
run_sql "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO streambot;" "table permissions"
run_sql "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO streambot;" "sequence permissions"

echo ""
echo "═══ Verification ═══"
TABLES_OK=true
for table in users platform_connections oauth_sessions webhook_queue bot_configs; do
    if docker exec -i $CONTAINER psql -U $USER -d $DB -c "\\dt $table" 2>/dev/null | grep -q $table; then
        echo -e "  ${GREEN}✓${NC} $table exists"
    else
        echo -e "  ${RED}✗${NC} $table MISSING"
        TABLES_OK=false
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
echo "Restart stream-bot to apply changes:"
echo "  docker restart stream-bot"
