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

# Wait for PostgreSQL to be ready using pg_isready or timeout-based approach
echo ""
echo "Waiting for PostgreSQL to be ready..."

# Extract host and port from DATABASE_URL
POSTGRES_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:\/]*\).*/\1/p' || echo "localhost")
POSTGRES_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p' || echo "5432")
echo "  PostgreSQL host: $POSTGRES_HOST:$POSTGRES_PORT"

# Wait for PostgreSQL using timeout and simple connection attempt via Node.js
for i in 1 2 3 4 5 6 7 8 9 10; do
    # Use Node.js to test connection since we're in a Node environment
    if node -e "
        const { Client } = require('pg');
        const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
        client.connect().then(() => { client.end(); process.exit(0); }).catch(() => process.exit(1));
    " 2>/dev/null; then
        echo "✓ PostgreSQL is accessible"
        break
    fi
    if [ "$i" -eq 10 ]; then
        echo "⚠ Could not verify PostgreSQL connection - continuing anyway"
        break
    fi
    echo "  Waiting for PostgreSQL... attempt $i/10"
    sleep 3
done

# Run database schema sync (drizzle-kit push is additive, non-destructive)
# Note: drizzle-kit push only ADDS tables/columns, it does NOT drop existing data
echo ""
echo "Syncing database schema..."
if [ -f "node_modules/.bin/drizzle-kit" ]; then
    echo "  Running drizzle-kit push (additive schema sync)..."
    if [ "$NODE_ENV" = "production" ]; then
        if ! npx drizzle-kit push --force 2>&1; then
            echo "❌ ERROR: Database schema sync failed"
            echo "  Check database connection and schema compatibility"
            exit 1
        fi
    else
        if ! npm run db:push 2>&1; then
            echo "❌ ERROR: Database schema sync failed"
            exit 1
        fi
    fi
    echo "✓ Database schema synchronized"
else
    echo "⚠ Drizzle-kit not found, skipping schema sync"
fi

echo ""
echo "================================================"
echo "  Starting Stream-Bot Application..."
echo "================================================"
echo ""

# Start the application
exec "$@"
