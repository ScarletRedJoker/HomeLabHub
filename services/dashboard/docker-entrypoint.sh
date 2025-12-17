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

# Always run migrations in the entrypoint (once at startup)
ENTRYPOINT_RUN_MIGRATIONS=true
SCHEMA_WAIT_TIMEOUT=${SCHEMA_WAIT_TIMEOUT:-180}

export RUN_MIGRATIONS=$ENTRYPOINT_RUN_MIGRATIONS
export SCHEMA_WAIT_TIMEOUT

if ! python /app/wait_for_schema.py; then
    echo "❌ ERROR: Database schema not ready after timeout"
    echo "   Check PostgreSQL logs and migration status"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Starting Gunicorn Server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Starting with gunicorn.conf.py configuration"
echo ""
exec gunicorn --config gunicorn.conf.py "app:app"
