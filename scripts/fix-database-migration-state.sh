#!/bin/bash
set -e

# Fix Database Migration State
# This script fixes the orphaned enum types that are preventing migrations from completing
# Run this ONCE on your Ubuntu production server

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🔧 FIX DATABASE MIGRATION STATE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "This will:"
echo "  1. Drop orphaned enum types from homelab_jarvis database"
echo "  2. Reset migration 005 version stamp"
echo "  3. Stop dashboard and celery-worker containers"
echo "  4. Run migration 005 cleanly from dashboard container"
echo "  5. Restart all services"
echo ""
read -p "Continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "[1/5] Dropping orphaned enum types..."
docker exec discord-bot-db psql -U jarvis -d homelab_jarvis << 'EOF'
-- Drop orphaned enum types that were created but tables weren't
DROP TYPE IF EXISTS serviceconnectionstatus CASCADE;
DROP TYPE IF EXISTS automationstatus CASCADE;
DROP TYPE IF EXISTS emailnotificationstatus CASCADE;
DROP TYPE IF EXISTS backupstatus CASCADE;

-- Reset migration version to 004 so 005 can run cleanly
DELETE FROM alembic_version WHERE version_num='005';

-- Verify current state
SELECT version_num FROM alembic_version;
EOF

echo "✓ Orphaned types dropped, version reset to 004"
echo ""

echo "[2/5] Stopping dashboard and celery-worker..."
docker-compose -f docker-compose.unified.yml stop homelab-dashboard homelab-celery-worker

echo "✓ Services stopped"
echo ""

echo "[3/5] Running migration 005 cleanly (one time only)..."
docker-compose -f docker-compose.unified.yml run --rm homelab-dashboard alembic upgrade 005

echo "✓ Migration 005 completed successfully"
echo ""

echo "[4/5] Verifying database state..."
docker exec discord-bot-db psql -U jarvis -d homelab_jarvis << 'EOF'
-- Check that migration 005 is now complete
SELECT version_num FROM alembic_version;

-- Verify the tables were created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('agents', 'marketplace_apps', 'google_service_status', 'google_calendar_events', 'google_emails', 'google_backups')
ORDER BY table_name;
EOF

echo ""
echo "[5/5] Starting all services..."
docker-compose -f docker-compose.unified.yml up -d

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ MIGRATION FIX COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "  1. Wait 30 seconds for services to start"
echo "  2. Check container health: docker ps"
echo "  3. Check dashboard logs: docker logs homelab-dashboard"
echo "  4. Check celery logs: docker logs homelab-celery-worker"
echo "  5. Verify Jarvis responds at https://host.evindrake.net"
echo ""
echo "All containers should now be 'healthy' and Jarvis should respond!"
