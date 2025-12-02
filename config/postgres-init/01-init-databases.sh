#!/bin/bash
# ============================================
# HomeLabHub Database Initialization
# ============================================
# This script runs ONCE when the PostgreSQL container is first created.
# It creates all required databases and users for the homelab services.
# ============================================

set -e

echo "=== Creating HomeLabHub databases and users ==="

# Wait for postgres to be ready
until pg_isready -U postgres; do
    echo "Waiting for PostgreSQL to be ready..."
    sleep 2
done

# Create Discord Bot (Ticket Bot) user and database
echo "Creating ticketbot database and user..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ticketbot') THEN
            CREATE USER ticketbot WITH PASSWORD '${DISCORD_DB_PASSWORD}';
        ELSE
            ALTER USER ticketbot WITH PASSWORD '${DISCORD_DB_PASSWORD}';
        END IF;
    END
    \$\$;
    
    SELECT 'CREATE DATABASE ticketbot OWNER ticketbot'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ticketbot')\gexec
    
    GRANT ALL PRIVILEGES ON DATABASE ticketbot TO ticketbot;
EOSQL

# Create Stream Bot user and database
echo "Creating streambot database and user..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'streambot') THEN
            CREATE USER streambot WITH PASSWORD '${STREAMBOT_DB_PASSWORD}';
        ELSE
            ALTER USER streambot WITH PASSWORD '${STREAMBOT_DB_PASSWORD}';
        END IF;
    END
    \$\$;
    
    SELECT 'CREATE DATABASE streambot OWNER streambot'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'streambot')\gexec
    
    GRANT ALL PRIVILEGES ON DATABASE streambot TO streambot;
EOSQL

# Create Jarvis AI user and database
echo "Creating jarvis database and user..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'jarvis') THEN
            CREATE USER jarvis WITH PASSWORD '${JARVIS_DB_PASSWORD}';
        ELSE
            ALTER USER jarvis WITH PASSWORD '${JARVIS_DB_PASSWORD}';
        END IF;
    END
    \$\$;
    
    SELECT 'CREATE DATABASE homelab_jarvis OWNER jarvis'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'homelab_jarvis')\gexec
    
    GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis TO jarvis;
EOSQL

# Create Dashboard database
echo "Creating homelab_dashboard database..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE homelab_dashboard OWNER postgres'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'homelab_dashboard')\gexec
EOSQL

# Grant schema permissions
echo "Granting schema permissions..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "ticketbot" -c "GRANT ALL ON SCHEMA public TO ticketbot;"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "streambot" -c "GRANT ALL ON SCHEMA public TO streambot;"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "homelab_jarvis" -c "GRANT ALL ON SCHEMA public TO jarvis;"

echo "=== Database initialization complete! ==="
