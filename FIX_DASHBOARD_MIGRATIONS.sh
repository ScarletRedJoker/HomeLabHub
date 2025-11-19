#!/bin/bash
# Fix Dashboard Database Migrations
# Run this on Ubuntu server to apply Alembic migrations to homelab_jarvis database

set -e

echo "========================================"
echo "  🔧 Dashboard Migration Fix"
echo "========================================"
echo ""

# Check if dashboard container is running
if ! docker ps | grep -q homelab-dashboard; then
    echo "❌ Dashboard container is not running!"
    echo "Start it first with: docker-compose -f docker-compose.unified.yml up -d homelab-dashboard"
    exit 1
fi

echo "Step 1: Verifying homelab_jarvis database exists..."
if docker exec discord-bot-db psql -U postgres -lqt | cut -d \| -f 1 | grep -qw homelab_jarvis; then
    echo "✅ Database 'homelab_jarvis' exists"
else
    echo "❌ Database 'homelab_jarvis' does NOT exist!"
    echo ""
    echo "This database should have been created automatically."
    echo "Check your JARVIS_DB_PASSWORD in .env file and restart postgres:"
    echo "  docker-compose -f docker-compose.unified.yml restart discord-bot-db"
    exit 1
fi

echo ""
echo "Step 2: Running Alembic migrations..."
docker exec homelab-dashboard alembic upgrade head

echo ""
echo "Step 3: Verifying migration status..."
docker exec homelab-dashboard alembic current

echo ""
echo "========================================"
echo "  ✅ Migration Fix Complete!"
echo "========================================"
echo ""
echo "The dashboard should now work correctly."
echo "Check: https://host.evindrake.net"
echo ""
