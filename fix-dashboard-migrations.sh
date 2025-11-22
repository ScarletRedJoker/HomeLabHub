#!/bin/bash
# Fix dashboard database migrations

set -e

echo "════════════════════════════════════════"
echo "  Fixing Dashboard Database"
echo "════════════════════════════════════════"

cd /home/evin/contain/HomeLabHub

echo ""
echo "[1/3] Running dashboard migrations..."
docker exec homelab-dashboard flask db upgrade || echo "Migration command failed, trying alternate method..."

echo ""
echo "[2/3] Checking database tables..."
docker exec homelab-postgres psql -U postgres -d homelab_jarvis -c "\dt" || echo "Table check failed"

echo ""
echo "[3/3] If migrations failed, initializing database manually..."
docker exec homelab-dashboard python -c "
from app import app, db
with app.app_context():
    db.create_all()
    print('✓ Database tables created')
" 2>&1

echo ""
echo "════════════════════════════════════════"
echo "  Checking what tables exist now"
echo "════════════════════════════════════════"
docker exec homelab-postgres psql -U postgres -d homelab_jarvis -c "\dt"

echo ""
echo "Restarting dashboard..."
docker restart homelab-dashboard

echo ""
echo "✅ Done! Wait 10 seconds then test the dashboard."
