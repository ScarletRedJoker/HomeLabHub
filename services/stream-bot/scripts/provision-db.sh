#!/bin/bash
set -e

echo "=== StreamBot Database Provisioning ==="

# Check if DATABASE_URL or STREAMBOT_DATABASE_URL is set
if [ -z "$DATABASE_URL" ] && [ -z "$STREAMBOT_DATABASE_URL" ]; then
  echo "❌ Error: DATABASE_URL or STREAMBOT_DATABASE_URL must be set"
  exit 1
fi

DB_URL="${DATABASE_URL:-$STREAMBOT_DATABASE_URL}"

echo "✓ Database URL configured"
echo "Running database migrations..."

# Run Drizzle migrations
npm run db:push

echo "✓ Database schema synchronized"
echo "=== Database provisioning complete ==="
