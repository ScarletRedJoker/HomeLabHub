#!/bin/bash
set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          NEBULA DASHBOARD - PRODUCTION STARTUP               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Auto-configure database if not set (self-managed mode)
if [ -z "$JARVIS_DATABASE_URL" ]; then
    if [ -n "$DATABASE_URL" ]; then
        export JARVIS_DATABASE_URL="$DATABASE_URL"
        echo "✓ Using DATABASE_URL for database connection"
    else
        # Default to containerized postgres (self-managed)
        export JARVIS_DATABASE_URL="postgresql://dashboard:dashboard_secure_2024@dashboard-db:5432/homelab_dashboard"
        export DATABASE_URL="$JARVIS_DATABASE_URL"
        echo "✓ Auto-configured database (self-managed mode)"
    fi
else
    echo "✓ Using provided JARVIS_DATABASE_URL"
fi

# Export DATABASE_URL for compatibility
export DATABASE_URL="${DATABASE_URL:-$JARVIS_DATABASE_URL}"

echo "  Database: ${JARVIS_DATABASE_URL%%@*}@*****"

# Auto-configure Redis if not set
if [ -z "$REDIS_URL" ]; then
    export REDIS_URL="redis://dashboard-redis:6379/0"
    echo "✓ Auto-configured Redis (self-managed mode)"
else
    echo "✓ Using provided REDIS_URL"
fi

# Use the wait_for_schema.py utility for proper database orchestration
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Database Orchestration (wait_for_schema.py)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if we're running as celery worker/beat (skip migrations)
if [[ "$1" == *"celery"* ]] || [[ "${RUN_MIGRATIONS:-true}" == "false" ]]; then
    echo "⏭ Skipping migrations (celery worker or RUN_MIGRATIONS=false)"
    # Just wait for database to be ready without running migrations
    python -c "
import time
import psycopg2
import os
for i in range(30):
    try:
        conn = psycopg2.connect(os.environ['JARVIS_DATABASE_URL'])
        conn.close()
        print('✓ Database connection verified')
        break
    except:
        time.sleep(2)
" || echo "⚠ Database connection check completed"
else
    # Run migrations only for main dashboard
    SCHEMA_WAIT_TIMEOUT=${SCHEMA_WAIT_TIMEOUT:-180}
    export RUN_MIGRATIONS=true
    export SCHEMA_WAIT_TIMEOUT
    
    if ! python /app/wait_for_schema.py; then
        echo "❌ ERROR: Database schema not ready after timeout"
        echo "   Check PostgreSQL logs and migration status"
        exit 1
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Network Auto-Discovery"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Run network discovery and export discovered IPs as environment variables
# This uses hints from NAS_IP, TAILSCALE_LOCAL_HOST, etc. but validates them
python -c "
from services.network_discovery import run_startup_discovery
config = run_startup_discovery()
" 2>&1 || echo "⚠ Network discovery completed with warnings (non-fatal)"

# If arguments passed (docker CMD), run that instead of gunicorn
if [ $# -gt 0 ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Starting: $@"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exec "$@"
else
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Starting Gunicorn Server"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Starting with gunicorn.conf.py configuration"
    echo ""
    exec gunicorn --config gunicorn.conf.py "app:app"
fi
