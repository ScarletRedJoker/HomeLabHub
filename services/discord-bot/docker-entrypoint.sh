#!/bin/bash
set -e

echo "Starting Discord Bot deployment..."

# Wait for PostgreSQL to be ready
# Since docker-compose depends_on with service_healthy is set, the database should be ready
# But we add a small grace period for network stability
echo "Waiting for PostgreSQL to be ready..."

# Extract PostgreSQL host from DATABASE_URL if available
# DATABASE_URL format: postgresql://user:password@hostname:5432/database
if [ -n "$DATABASE_URL" ]; then
  POSTGRES_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
  echo "Extracted PostgreSQL host from DATABASE_URL: $POSTGRES_HOST"
else
  POSTGRES_HOST=${POSTGRES_HOST:-postgres}
  echo "Using default PostgreSQL host: $POSTGRES_HOST"
fi

# Simple connection test using nc (netcat) or timeout
echo "Checking PostgreSQL connection at $POSTGRES_HOST:5432..."
for i in {1..30}; do
  if timeout 1 bash -c "echo > /dev/tcp/$POSTGRES_HOST/5432" 2>/dev/null; then
    echo "PostgreSQL port is accessible!"
    # Give it a couple more seconds to fully initialize
    sleep 3
    break
  fi
  
  if [ $i -eq 30 ]; then
    echo "Failed to connect to PostgreSQL after 30 attempts"
    exit 1
  fi
  
  echo "Waiting for PostgreSQL... attempt $i/30"
  sleep 2
done

echo "PostgreSQL is ready!"

# Check if database reset is requested
if [ "$RESET_DB" = "true" ]; then
  echo "⚠️  RESET_DB=true detected - Dropping all tables..."
  
  # Drop all tables using Drizzle drop command
  npx drizzle-kit drop --force || echo "Warning: Database drop failed, tables may not exist yet"
  
  echo "✅ Database reset complete!"
fi

# Run database migrations/push schema
echo "Initializing database schema..."
if [ "$NODE_ENV" = "production" ]; then
  # In production, use drizzle-kit push to sync schema
  npx drizzle-kit push --force || echo "Warning: Database schema sync had issues, continuing anyway..."
else
  npm run db:push || echo "Warning: Database schema sync had issues, continuing anyway..."
fi

echo "Database initialization complete!"

# Start the application
echo "Starting application..."
exec "$@"
