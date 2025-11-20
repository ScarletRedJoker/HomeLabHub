#!/bin/bash
# IMMEDIATE FIX - Drops tables using current architecture (ticketbot superuser)
# Then rebuilds container with fixed migration code

set -e

echo "🔧 Fixing migration issue with current architecture..."
echo ""
echo "📝 Step 1: Dropping tables using ticketbot superuser..."

# Use ticketbot (current superuser) to drop tables
docker exec discord-bot-db psql -U ticketbot -d homelab_jarvis << 'EOF'
DROP TABLE IF EXISTS agent_messages CASCADE;
DROP TABLE IF EXISTS chat_history CASCADE;
DROP TABLE IF EXISTS agent_conversations CASCADE;
DROP TABLE IF EXISTS agent_tasks CASCADE;
DROP TABLE IF EXISTS agents CASCADE;
\echo '✓ All agent tables dropped'
EOF

if [ $? -ne 0 ]; then
    echo "❌ Failed to drop tables"
    exit 1
fi

echo ""
echo "📝 Step 2: Rebuilding dashboard container with fixed migration..."
docker compose build --no-cache homelab-dashboard

echo ""
echo "📝 Step 3: Restarting dashboard..."
docker compose up -d homelab-dashboard

echo ""
echo "📝 Step 4: Waiting for migrations to complete..."
sleep 8

echo ""
echo "📋 Checking migration logs..."
docker logs homelab-dashboard 2>&1 | tail -30

echo ""
echo "🔍 Verifying table types..."
docker exec discord-bot-db psql -U jarvis -d homelab_jarvis -c "
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('agents', 'agent_messages')
  AND column_name LIKE '%id%'
ORDER BY table_name, column_name;
" 2>/dev/null || echo "⚠️  Migration may still be running..."

echo ""
echo "✅ Fix applied! Check above for UUID types."
echo ""
echo "📖 See ARCHITECTURE_FIX.md for the proper long-term solution."
