#!/bin/bash
set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          NEBULA DASHBOARD - PRODUCTION STARTUP               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Verify database URL is configured
if [ -z "$JARVIS_DATABASE_URL" ]; then
    echo "❌ ERROR: JARVIS_DATABASE_URL environment variable is required!"
    echo "   Dashboard cannot start without database configuration."
    exit 1
fi

echo "✓ Database URL configured"

# Use the wait_for_schema.py utility for proper database orchestration
# This ensures PostgreSQL is ready, migrations run, and all tables exist
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Database Orchestration (wait_for_schema.py)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Always run migrations in the entrypoint (once at startup)
# The Flask app has RUN_MIGRATIONS=false to prevent duplicate runs by workers
ENTRYPOINT_RUN_MIGRATIONS=true
SCHEMA_WAIT_TIMEOUT=${SCHEMA_WAIT_TIMEOUT:-180}

# Run the wait_for_schema utility - this handles:
# 1. Waiting for PostgreSQL to be ready
# 2. Running Alembic migrations
# 3. Verifying all required tables exist
export RUN_MIGRATIONS=$ENTRYPOINT_RUN_MIGRATIONS
export SCHEMA_WAIT_TIMEOUT
export DATABASE_URL="$JARVIS_DATABASE_URL"

if ! python /app/wait_for_schema.py; then
    echo "❌ ERROR: Database schema not ready after timeout"
    echo "   Check PostgreSQL logs and migration status"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Starting Gunicorn Server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PORT=${PORT:-5000}
echo "Binding to 0.0.0.0:$PORT"
echo ""
exec gunicorn --bind 0.0.0.0:$PORT --workers 3 --timeout 120 --access-logfile - --error-logfile - "main:app"
