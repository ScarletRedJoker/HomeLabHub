#!/bin/bash
set -e

echo "================================================"
echo "  Nebula Dashboard Starting..."
echo "================================================"

# Verify database URL is configured
if [ -z "$JARVIS_DATABASE_URL" ]; then
    echo "❌ ERROR: JARVIS_DATABASE_URL environment variable is required!"
    echo "   Dashboard cannot start without database configuration."
    exit 1
fi

# Run database migrations (can be disabled for worker instances)
# Default to true if not set
RUN_MIGRATIONS=${RUN_MIGRATIONS:-true}

if [ "$RUN_MIGRATIONS" = "true" ]; then
    echo "Running database migrations..."
    alembic upgrade head 2>&1 | tee -a /app/logs/migrations.log
    echo "✓ Migrations complete"
else
    echo "⏭️  Skipping migrations (RUN_MIGRATIONS=$RUN_MIGRATIONS)"
fi

echo ""
echo "Starting Gunicorn server..."
echo "================================================"

# Start gunicorn with provided arguments
exec gunicorn --bind 0.0.0.0:5000 --workers 3 --timeout 120 --access-logfile - --error-logfile - "main:app"
