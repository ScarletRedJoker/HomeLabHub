#!/bin/bash
set -euo pipefail

# Fix Production Database Schema Issues
# Resolves legacy agents/agent_messages table type mismatches

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Production Database Schema Fix                             ║"
echo "║  Fixes: agents.id INTEGER → UUID migration                  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo

# Load database connection from .env
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found"
    echo "   Run this script from the project root directory"
    exit 1
fi

source .env

# Try DATABASE_URL first, fallback to NEON_DATABASE_URL
if [ -z "${DATABASE_URL:-}" ] && [ -z "${NEON_DATABASE_URL:-}" ]; then
    echo "❌ Error: Neither DATABASE_URL nor NEON_DATABASE_URL is set in .env"
    exit 1
fi

DB_URL="${DATABASE_URL:-${NEON_DATABASE_URL}}"

# Extract database components from URL
# Format: postgresql://user:password@host:port/database
DB_HOST=$(echo "$DB_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo "$DB_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo "$DB_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
DB_USER=$(echo "$DB_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASSWORD=$(echo "$DB_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')

echo "📊 Database: $DB_NAME"
echo "🏠 Host: $DB_HOST:${DB_PORT:-5432}"
echo "👤 User: $DB_USER"
echo

# Function to run SQL
run_sql() {
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "${DB_PORT:-5432}" -U "$DB_USER" -d "$DB_NAME" -c "$1"
}

# Function to run SQL and get output
run_sql_query() {
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "${DB_PORT:-5432}" -U "$DB_USER" -d "$DB_NAME" -tAc "$1"
}

echo "🔍 Checking for legacy agent tables..."

# Check if agents table exists
AGENTS_EXISTS=$(run_sql_query "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='agents');")

if [ "$AGENTS_EXISTS" = "f" ]; then
    echo "✅ No legacy agents table found"
    echo "ℹ️  Migration 014 will create it properly with UUID primary key"
    echo
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║  ✅ No Fix Needed - Schema is Clean                         ║"
    echo "║                                                              ║"
    echo "║  Next step: Run migrations                                  ║"
    echo "║  docker exec homelab-dashboard python -m alembic upgrade head"
    echo "╚════════════════════════════════════════════════════════════╝"
    exit 0
fi

echo "⚠️  Found existing agents table"

# Check agents.id data type
AGENTS_ID_TYPE=$(run_sql_query "SELECT data_type FROM information_schema.columns WHERE table_name='agents' AND column_name='id';")

echo "🔍 Current agents.id type: $AGENTS_ID_TYPE"

if [ "$AGENTS_ID_TYPE" = "uuid" ]; then
    echo "✅ agents.id is already UUID - schema is correct!"
    
    # Check agent_messages if it exists
    MESSAGES_EXISTS=$(run_sql_query "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='agent_messages');")
    
    if [ "$MESSAGES_EXISTS" = "t" ]; then
        MSG_FROM_TYPE=$(run_sql_query "SELECT data_type FROM information_schema.columns WHERE table_name='agent_messages' AND column_name='from_agent_id';")
        
        if [ "$MSG_FROM_TYPE" != "uuid" ]; then
            echo "⚠️  But agent_messages has wrong column types!"
            echo "   Dropping agent_messages to allow migration to recreate it..."
            run_sql "DROP TABLE IF EXISTS agent_messages CASCADE;"
            echo "✅ Dropped agent_messages"
        fi
    fi
    
    echo
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║  ✅ Schema Fix Complete                                      ║"
    echo "║                                                              ║"
    echo "║  Next step: Run migrations                                  ║"
    echo "║  docker exec homelab-dashboard python -m alembic upgrade head"
    echo "╚════════════════════════════════════════════════════════════╝"
    exit 0
fi

# If we get here, agents.id is wrong type (INTEGER, VARCHAR, etc.)
echo "❌ ERROR: agents.id is $AGENTS_ID_TYPE but should be UUID!"
echo
echo "This happens when old migration created tables with wrong types."
echo
echo "⚠️  FIX OPTIONS:"
echo
echo "  1) Drop and recreate ALL agent tables (RECOMMENDED)"
echo "     - Drops: agents, agent_messages, chat_history"
echo "     - Safe if no critical production data"
echo "     - Migration will recreate with correct UUID types"
echo
echo "  2) Backup data and manually migrate"
echo "     - Creates backup tables"
echo "     - You manually migrate data after"
echo "     - Use if you have important agent data"
echo
echo "  3) Cancel (inspect database manually)"
echo
read -p "Choose option (1/2/3): " OPTION

if [ "$OPTION" = "1" ]; then
    echo
    echo "🗑️  Dropping legacy agent tables..."
    
    # Count rows to show what's being deleted
    AGENTS_COUNT=$(run_sql_query "SELECT COUNT(*) FROM agents;" || echo "0")
    MESSAGES_COUNT=$(run_sql_query "SELECT COUNT(*) FROM agent_messages;" || echo "0")
    CHAT_COUNT=$(run_sql_query "SELECT COUNT(*) FROM chat_history;" || echo "0")
    
    echo "   - agents: $AGENTS_COUNT rows"
    echo "   - agent_messages: $MESSAGES_COUNT rows"
    echo "   - chat_history: $CHAT_COUNT rows"
    echo
    
    read -p "⚠️  Are you sure you want to delete these tables? (yes/no): " CONFIRM
    
    if [ "$CONFIRM" != "yes" ]; then
        echo "❌ Aborted"
        exit 1
    fi
    
    echo
    echo "Dropping tables..."
    run_sql "DROP TABLE IF EXISTS agent_messages CASCADE;"
    echo "✅ Dropped agent_messages"
    
    run_sql "DROP TABLE IF EXISTS chat_history CASCADE;"
    echo "✅ Dropped chat_history"
    
    run_sql "DROP TABLE IF EXISTS agents CASCADE;"
    echo "✅ Dropped agents"
    
    echo
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║  ✅ Database Schema Fix Complete                             ║"
    echo "║                                                              ║"
    echo "║  Deleted tables will be recreated by migration 014          ║"
    echo "║  with correct UUID types.                                   ║"
    echo "║                                                              ║"
    echo "║  Next steps:                                                ║"
    echo "║  1. Run migrations:                                         ║"
    echo "║     docker exec homelab-dashboard \\                         ║"
    echo "║       python -m alembic upgrade head                        ║"
    echo "║                                                              ║"
    echo "║  2. Restart services:                                       ║"
    echo "║     ./deployment/homelab-manager.sh (option 2)              ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    
elif [ "$OPTION" = "2" ]; then
    echo
    echo "🔄 Creating backup tables..."
    
    # Backup agents
    run_sql "DROP TABLE IF EXISTS agents_backup_$(date +%Y%m%d);"
    run_sql "CREATE TABLE agents_backup_$(date +%Y%m%d) AS SELECT * FROM agents;"
    echo "✅ Backup created: agents_backup_$(date +%Y%m%d)"
    
    # Backup agent_messages if exists
    MESSAGES_EXISTS=$(run_sql_query "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='agent_messages');")
    if [ "$MESSAGES_EXISTS" = "t" ]; then
        run_sql "CREATE TABLE agent_messages_backup_$(date +%Y%m%d) AS SELECT * FROM agent_messages;"
        echo "✅ Backup created: agent_messages_backup_$(date +%Y%m%d)"
    fi
    
    # Backup chat_history if exists
    CHAT_EXISTS=$(run_sql_query "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='chat_history');")
    if [ "$CHAT_EXISTS" = "t" ]; then
        run_sql "CREATE TABLE chat_history_backup_$(date +%Y%m%d) AS SELECT * FROM chat_history;"
        echo "✅ Backup created: chat_history_backup_$(date +%Y%m%d)"
    fi
    
    echo
    echo "📋 Manual migration required:"
    echo "   1. Review backup tables in database"
    echo "   2. Drop original tables when ready:"
    echo "      DROP TABLE agents CASCADE;"
    echo "      DROP TABLE agent_messages CASCADE;"
    echo "      DROP TABLE chat_history CASCADE;"
    echo "   3. Run migrations to recreate with UUID:"
    echo "      docker exec homelab-dashboard python -m alembic upgrade head"
    echo "   4. Manually migrate data from backup tables"
    
elif [ "$OPTION" = "3" ]; then
    echo
    echo "❌ Cancelled - no changes made"
    echo
    echo "To inspect database manually:"
    echo "  docker exec -it homelab-postgres psql -U nebula_user -d homelab_jarvis"
    echo
    echo "Check agents table structure:"
    echo "  \\d agents"
    
else
    echo "❌ Invalid option. Exiting."
    exit 1
fi
