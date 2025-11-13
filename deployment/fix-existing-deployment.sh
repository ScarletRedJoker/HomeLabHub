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
echo "║   Fix Existing Deployment Database           ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${RED}✗ .env file not found!${NC}"
    echo "Please run ./generate-unified-env.sh first"
    exit 1
fi

# Source environment variables
set -a
source .env
set +a

echo "This script fixes existing deployments to add the Stream Bot database."
echo ""
echo -e "${YELLOW}What this script does:${NC}"
echo "  1. Checks if streambot database exists"
echo "  2. Creates streambot database and user if missing"
echo "  3. Does NOT delete any existing data"
echo ""

# Check if postgres is running
if ! docker ps | grep -q discord-bot-db; then
    echo -e "${RED}✗ discord-bot-db container is not running${NC}"
    echo "Please start it first: docker-compose -f docker-compose.unified.yml up -d discord-bot-db"
    exit 1
fi

echo "━━━ Step 1: Checking Current Database State ━━━"
echo ""

# Check if streambot database exists
echo "Checking for streambot database..."
if docker exec discord-bot-db psql -U ticketbot -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='streambot'" | grep -q 1; then
    echo -e "${GREEN}✓ streambot database already exists${NC}"
    DB_EXISTS=true
else
    echo -e "${YELLOW}⚠ streambot database does not exist${NC}"
    DB_EXISTS=false
fi

# Check if streambot user exists
echo "Checking for streambot user..."
if docker exec discord-bot-db psql -U ticketbot -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='streambot'" | grep -q 1; then
    echo -e "${GREEN}✓ streambot user already exists${NC}"
    USER_EXISTS=true
else
    echo -e "${YELLOW}⚠ streambot user does not exist${NC}"
    USER_EXISTS=false
fi

echo ""

if [ "$DB_EXISTS" = true ] && [ "$USER_EXISTS" = true ]; then
    echo -e "${GREEN}✓ Everything is already configured!${NC}"
    echo ""
    echo "Your deployment is ready. The Stream Bot should be able to connect."
    echo ""
    exit 0
fi

echo "━━━ Step 2: Creating Missing Database/User ━━━"
echo ""

if [ -z "$STREAMBOT_DB_PASSWORD" ]; then
    echo -e "${RED}✗ STREAMBOT_DB_PASSWORD not set in .env!${NC}"
    echo "Please run ./generate-unified-env.sh to add it"
    exit 1
fi

echo -e "${BLUE}Creating streambot database and user...${NC}"

# Create the database and user
docker exec discord-bot-db psql -U ticketbot -d postgres <<-EOSQL
    -- Create user if not exists
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'streambot') THEN
            CREATE ROLE streambot WITH LOGIN PASSWORD '$STREAMBOT_DB_PASSWORD';
            RAISE NOTICE 'Created user: streambot';
        ELSE
            ALTER ROLE streambot WITH PASSWORD '$STREAMBOT_DB_PASSWORD';
            RAISE NOTICE 'Updated password for user: streambot';
        END IF;
    END
    \$\$;
    
    -- Create database if not exists
    SELECT 'CREATE DATABASE streambot OWNER streambot'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'streambot')\gexec
    
    -- Grant all privileges
    GRANT ALL PRIVILEGES ON DATABASE streambot TO streambot;
EOSQL

echo ""
echo -e "${GREEN}✓ Stream Bot database created successfully!${NC}"
echo ""

echo "━━━ Step 3: Restarting Stream Bot ━━━"
echo ""

# Check if stream-bot container exists before trying to restart
if docker ps -a --format '{{.Names}}' | grep -q '^stream-bot$'; then
    echo "Restarting stream-bot container..."
    if docker-compose -f docker-compose.unified.yml restart stream-bot; then
        echo -e "${GREEN}✓ stream-bot restarted successfully${NC}"
    else
        echo -e "${YELLOW}⚠ Failed to restart stream-bot (may not be running yet)${NC}"
        echo "This is OK - the database is ready. Just deploy the stack:"
        echo "  ./deploy-unified.sh"
    fi
else
    echo -e "${YELLOW}⚠ stream-bot container not found${NC}"
    echo "This is OK - the database is ready. Deploy the stack to create it:"
    echo "  ./deploy-unified.sh"
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✓ Fix Complete!                             ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Deploy or redeploy: ./deploy-unified.sh"
echo "  2. Check stream-bot logs: docker logs stream-bot"
echo "  3. Verify it's running: docker ps | grep stream-bot"
echo "  4. Test the site: https://stream.rig-city.com"
echo ""
