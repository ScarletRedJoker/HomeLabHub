#!/bin/bash
#
# backfill-db-users.sh - Create/update database users and databases
#
# This script safely creates the required PostgreSQL users and databases
# for the homelab services. It's idempotent - safe to run multiple times.
#
# Run this on LINODE after deploying if you see database connection errors.
#
# Usage: ./deploy/scripts/backfill-db-users.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "============================================================"
echo "Database User Backfill Script"
echo "============================================================"

# Check if we're in the right directory
if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
    echo -e "${RED}ERROR: .env file not found at $PROJECT_ROOT/.env${NC}"
    echo "Please run this script from the project root or ensure .env exists"
    exit 1
fi

# Source environment variables
source "$PROJECT_ROOT/.env"

# Check required passwords
if [[ -z "$DISCORD_DB_PASSWORD" ]] || [[ -z "$STREAMBOT_DB_PASSWORD" ]] || [[ -z "$JARVIS_DB_PASSWORD" ]]; then
    echo -e "${RED}ERROR: Database passwords not set in .env${NC}"
    echo "Required variables: DISCORD_DB_PASSWORD, STREAMBOT_DB_PASSWORD, JARVIS_DB_PASSWORD"
    exit 1
fi

# Check if postgres container is running
if ! docker ps --format '{{.Names}}' | grep -q "homelab-postgres"; then
    echo -e "${RED}ERROR: homelab-postgres container is not running${NC}"
    echo "Start it with: docker compose up -d homelab-postgres"
    exit 1
fi

echo -e "${GREEN}Found homelab-postgres container${NC}"
echo ""
echo "Creating/updating database users and databases..."
echo ""

# Run the SQL commands
docker exec -i homelab-postgres psql -U postgres <<EOF
-- Create users if they don't exist, or update their passwords
DO \$\$
BEGIN
    -- ticketbot user (Discord bot)
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ticketbot') THEN
        CREATE USER ticketbot WITH PASSWORD '${DISCORD_DB_PASSWORD}';
        RAISE NOTICE 'Created user: ticketbot';
    ELSE
        ALTER USER ticketbot WITH PASSWORD '${DISCORD_DB_PASSWORD}';
        RAISE NOTICE 'Updated password for: ticketbot';
    END IF;
    
    -- streambot user
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'streambot') THEN
        CREATE USER streambot WITH PASSWORD '${STREAMBOT_DB_PASSWORD}';
        RAISE NOTICE 'Created user: streambot';
    ELSE
        ALTER USER streambot WITH PASSWORD '${STREAMBOT_DB_PASSWORD}';
        RAISE NOTICE 'Updated password for: streambot';
    END IF;
    
    -- jarvis user (Dashboard/AI)
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'jarvis') THEN
        CREATE USER jarvis WITH PASSWORD '${JARVIS_DB_PASSWORD}';
        RAISE NOTICE 'Created user: jarvis';
    ELSE
        ALTER USER jarvis WITH PASSWORD '${JARVIS_DB_PASSWORD}';
        RAISE NOTICE 'Updated password for: jarvis';
    END IF;
END
\$\$;

-- Create databases if they don't exist
SELECT 'CREATE DATABASE ticketbot OWNER ticketbot'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ticketbot')\gexec

SELECT 'CREATE DATABASE streambot OWNER streambot'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'streambot')\gexec

SELECT 'CREATE DATABASE homelab_jarvis OWNER jarvis'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'homelab_jarvis')\gexec

SELECT 'CREATE DATABASE homelab_dashboard OWNER postgres'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'homelab_dashboard')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE ticketbot TO ticketbot;
GRANT ALL PRIVILEGES ON DATABASE streambot TO streambot;
GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis TO jarvis;

-- Grant schema permissions for each database
\c ticketbot postgres
GRANT ALL ON SCHEMA public TO ticketbot;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\c streambot postgres
GRANT ALL ON SCHEMA public TO streambot;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\c homelab_jarvis postgres
GRANT ALL ON SCHEMA public TO jarvis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Show results
\echo ''
\echo '============================================================'
\echo 'Database Users:'
\echo '============================================================'
SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname IN ('ticketbot', 'streambot', 'jarvis', 'postgres');

\echo ''
\echo '============================================================'
\echo 'Databases:'
\echo '============================================================'
SELECT datname, pg_catalog.pg_get_userbyid(datdba) as owner 
FROM pg_database 
WHERE datname IN ('ticketbot', 'streambot', 'homelab_jarvis', 'homelab_dashboard', 'postgres');
EOF

if [[ $? -eq 0 ]]; then
    echo ""
    echo -e "${GREEN}============================================================${NC}"
    echo -e "${GREEN}SUCCESS: Database users and databases configured!${NC}"
    echo -e "${GREEN}============================================================${NC}"
    echo ""
    echo "You can now restart the services:"
    echo "  docker compose restart discord-bot stream-bot homelab-dashboard"
else
    echo ""
    echo -e "${RED}ERROR: Failed to configure database${NC}"
    exit 1
fi
