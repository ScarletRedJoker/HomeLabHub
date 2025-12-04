#!/bin/bash
# Create all required databases and users for HomeLabHub services
# This script is idempotent - safe to run multiple times

set -e

echo "Creating HomeLabHub databases and users..."

# Use environment variables for passwords
JARVIS_PASS="${JARVIS_DB_PASSWORD:-defaultpassword}"
DISCORD_PASS="${DISCORD_DB_PASSWORD:-defaultpassword}"
STREAMBOT_PASS="${STREAMBOT_DB_PASSWORD:-defaultpassword}"

# Function to create user if not exists
create_user_if_not_exists() {
    local user=$1
    local pass=$2
    psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$user') THEN
                CREATE USER $user WITH PASSWORD '$pass';
                RAISE NOTICE 'Created user: $user';
            ELSE
                RAISE NOTICE 'User already exists: $user';
            END IF;
        END
        \$\$;
EOSQL
}

# Function to create database if not exists
create_db_if_not_exists() {
    local db=$1
    local owner=$2
    psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        SELECT 'CREATE DATABASE $db OWNER $owner' 
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec
EOSQL
    # Grant privileges
    psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "GRANT ALL PRIVILEGES ON DATABASE $db TO $owner;" 2>/dev/null || true
}

# Create users
create_user_if_not_exists "jarvis" "$JARVIS_PASS"
create_user_if_not_exists "ticketbot" "$DISCORD_PASS"
create_user_if_not_exists "streambot" "$STREAMBOT_PASS"
create_user_if_not_exists "dashboard" "$JARVIS_PASS"

# Create databases
create_db_if_not_exists "homelab_jarvis" "jarvis"
create_db_if_not_exists "ticketbot" "ticketbot"
create_db_if_not_exists "streambot" "streambot"
create_db_if_not_exists "dashboard" "dashboard"

echo "HomeLabHub databases initialized successfully!"
