#!/bin/sh
# Stream-bot Docker entrypoint - runs migrations before starting the app
set -e

echo "================================================"
echo "  Stream-Bot Starting..."
echo "================================================"

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable is not set"
    exit 1
fi

echo "✓ Database URL configured"

# Run database migrations
echo ""
echo "Running database migrations..."
if [ -f "node_modules/.bin/drizzle-kit" ]; then
    echo "  Using drizzle-kit to sync schema..."
    # Use --force to skip interactive prompts in production
    npx drizzle-kit push:pg --config=drizzle.config.ts
    echo "✓ Database schema synchronized"
else
    echo "⚠ drizzle-kit not found, skipping migrations"
fi

echo ""
echo "================================================"
echo "  Starting Stream-Bot Application..."
echo "================================================"
echo ""

# Start the application
exec "$@"
