#!/bin/bash
set -e

echo "=================================================="
echo "Ensuring Stream Bot Database Exists"
echo "=================================================="

# This script creates the streambot database if it doesn't exist
# It's idempotent and safe to run multiple times

if [ -n "$STREAMBOT_DB_PASSWORD" ]; then
    echo "Creating streambot database and user (if not exists)..."
    
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        -- Create user if not exists
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'streambot') THEN
                CREATE ROLE streambot WITH LOGIN PASSWORD '$STREAMBOT_DB_PASSWORD';
                RAISE NOTICE 'Created user: streambot';
            ELSE
                -- Update password in case it changed
                ALTER ROLE streambot WITH PASSWORD '$STREAMBOT_DB_PASSWORD';
                RAISE NOTICE 'User streambot already exists, password updated';
            END IF;
        END
        \$\$;
        
        -- Create database if not exists
        SELECT 'CREATE DATABASE streambot OWNER streambot'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'streambot')\gexec
        
        -- Grant all privileges
        GRANT ALL PRIVILEGES ON DATABASE streambot TO streambot;
EOSQL

    echo "✓ Stream Bot database ready"
else
    echo "⚠ WARNING: STREAMBOT_DB_PASSWORD not set, skipping streambot database"
fi

echo "=================================================="
