#!/bin/bash
set -e

echo "=================================================="
echo "Initializing Multiple Databases for Homelab"
echo "=================================================="

# Function to create database and user
create_database() {
    local db_name=$1
    local db_user=$2
    local db_pass=$3
    
    echo "Creating database: $db_name with user: $db_user"
    
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        -- Create user if not exists
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$db_user') THEN
                CREATE ROLE $db_user WITH LOGIN PASSWORD '$db_pass';
            END IF;
        END
        \$\$;
        
        -- Create database if not exists
        SELECT 'CREATE DATABASE $db_name OWNER $db_user'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db_name')\gexec
        
        -- Grant all privileges
        GRANT ALL PRIVILEGES ON DATABASE $db_name TO $db_user;
EOSQL

    echo "✓ Database $db_name created successfully"
}

# Create Stream Bot database
if [ -n "$STREAMBOT_DB_PASSWORD" ]; then
    create_database "streambot" "streambot" "$STREAMBOT_DB_PASSWORD"
else
    echo "⚠ WARNING: STREAMBOT_DB_PASSWORD not set, skipping streambot database"
fi

# Create Jarvis Dashboard database  
if [ -n "$JARVIS_DB_PASSWORD" ]; then
    create_database "homelab_jarvis" "jarvis" "$JARVIS_DB_PASSWORD"
else
    echo "⚠ WARNING: JARVIS_DB_PASSWORD not set, skipping jarvis database"
fi

echo "=================================================="
echo "✓ All databases initialized successfully"
echo "=================================================="
