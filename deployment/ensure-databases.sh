#!/bin/bash
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Ensure All Homelab Databases Exist         ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${RED}✗ .env file not found!${NC}"
    echo "Please create .env file first (copy from .env.unified.example)"
    exit 1
fi

# Source environment variables
set -a
source .env
set +a

echo -e "${BLUE}This script ensures all required databases exist.${NC}"
echo "It will:"
echo "  ✓ Create missing databases"
echo "  ✓ Create missing users"
echo "  ✓ Update passwords if changed"
echo "  ✓ NOT delete any existing data"
echo ""

# Check if postgres container is running
if ! docker ps --format '{{.Names}}' | grep -q '^discord-bot-db$'; then
    echo -e "${RED}✗ PostgreSQL container (discord-bot-db) is not running${NC}"
    echo ""
    echo "Please start it first:"
    echo "  docker-compose -f docker-compose.unified.yml up -d discord-bot-db"
    exit 1
fi

echo -e "${GREEN}✓ PostgreSQL container is running${NC}"
echo ""

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
    if docker exec discord-bot-db pg_isready -U ticketbot -d ticketbot >/dev/null 2>&1; then
        echo -e "${GREEN}✓ PostgreSQL is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}✗ PostgreSQL did not become ready in time${NC}"
        exit 1
    fi
    echo -n "."
    sleep 1
done
echo ""

# Function to ensure database exists
ensure_database() {
    local db_name=$1
    local db_user=$2
    local db_password=$3
    
    if [ -z "$db_password" ]; then
        echo -e "${YELLOW}⚠ Skipping $db_name - no password provided${NC}"
        return
    fi
    
    echo "━━━ Ensuring $db_name database exists ━━━"
    
    # Create user and database
    docker exec discord-bot-db psql -U ticketbot -d postgres <<-EOSQL 2>/dev/null || {
        echo -e "${RED}✗ Failed to create $db_name${NC}"
        return 1
    }
        -- Create user if not exists
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$db_user') THEN
                CREATE ROLE $db_user WITH LOGIN PASSWORD '$db_password';
                RAISE NOTICE '✓ Created user: $db_user';
            ELSE
                -- Update password in case it changed
                ALTER ROLE $db_user WITH PASSWORD '$db_password';
                RAISE NOTICE '✓ User $db_user exists, password updated';
            END IF;
        END
        \$\$;
        
        -- Create database if not exists
        SELECT 'CREATE DATABASE $db_name OWNER $db_user'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db_name')\gexec
        
        -- Grant all privileges
        GRANT ALL PRIVILEGES ON DATABASE $db_name TO $db_user;
EOSQL
    
    # Verify database exists
    if docker exec discord-bot-db psql -U ticketbot -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db_name'" | grep -q 1; then
        echo -e "${GREEN}✓ Database '$db_name' is ready${NC}"
    else
        echo -e "${RED}✗ Database '$db_name' was not created${NC}"
        return 1
    fi
    echo ""
}

# Ensure Discord Bot database
if [ -n "${DISCORD_DB_PASSWORD:-}" ]; then
    ensure_database "ticketbot" "ticketbot" "$DISCORD_DB_PASSWORD"
else
    echo -e "${YELLOW}⚠ Skipping Discord Bot - DISCORD_DB_PASSWORD not set${NC}"
    echo ""
fi

# Ensure Stream Bot database
if [ -n "${STREAMBOT_DB_PASSWORD:-}" ]; then
    ensure_database "streambot" "streambot" "$STREAMBOT_DB_PASSWORD"
else
    echo -e "${YELLOW}⚠ Skipping Stream Bot - STREAMBOT_DB_PASSWORD not set${NC}"
    echo ""
fi

echo "╔══════════════════════════════════════════════╗"
echo "║  ✓ All Databases Ready!                      ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Restart affected containers
echo "━━━ Restarting Affected Services ━━━"
echo ""

RESTART_NEEDED=false

for container in discord-bot stream-bot; do
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        echo "Restarting $container..."
        if docker restart $container >/dev/null 2>&1; then
            echo -e "${GREEN}✓ $container restarted${NC}"
            RESTART_NEEDED=true
        else
            echo -e "${YELLOW}⚠ Could not restart $container${NC}"
        fi
    fi
done

if [ "$RESTART_NEEDED" = false ]; then
    echo -e "${YELLOW}⚠ No containers needed restart${NC}"
    echo "If services aren't running, deploy them:"
    echo "  docker-compose -f docker-compose.unified.yml up -d"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Next Steps:"
echo "  1. Check service logs:"
echo "     docker logs discord-bot"
echo "     docker logs stream-bot"
echo ""
echo "  2. Verify services are healthy:"
echo "     docker ps"
echo ""
echo "  3. Test the applications:"
echo "     https://bot.rig-city.com"
echo "     https://stream.rig-city.com"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
