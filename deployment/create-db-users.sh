#!/bin/bash
# Create database users properly
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     🔧 CREATE DATABASE USERS (PROPERLY)                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Load environment
if [ ! -f ".env" ]; then
    echo -e "${RED}ERROR: .env file not found${NC}"
    exit 1
fi
source .env

echo -e "${BOLD}Creating database users...${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create streambot user
echo -n "streambot... "
docker exec homelab-postgres psql -U postgres <<-EOSQL >/dev/null 2>&1
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'streambot') THEN
            CREATE USER streambot WITH PASSWORD '${STREAMBOT_DB_PASSWORD}';
        END IF;
    END
    \$\$;
    GRANT ALL PRIVILEGES ON DATABASE streambot TO streambot;
    ALTER DATABASE streambot OWNER TO streambot;
EOSQL
echo -e "${GREEN}✓${NC}"

# Create ticketbot user  
echo -n "ticketbot... "
docker exec homelab-postgres psql -U postgres <<-EOSQL >/dev/null 2>&1
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'ticketbot') THEN
            CREATE USER ticketbot WITH PASSWORD '${DISCORD_DB_PASSWORD}';
        END IF;
    END
    \$\$;
    GRANT ALL PRIVILEGES ON DATABASE ticketbot TO ticketbot;
    ALTER DATABASE ticketbot OWNER TO ticketbot;
EOSQL
echo -e "${GREEN}✓${NC}"

# Create jarvis user
echo -n "jarvis... "
docker exec homelab-postgres psql -U postgres <<-EOSQL >/dev/null 2>&1
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'jarvis') THEN
            CREATE USER jarvis WITH PASSWORD '${JARVIS_DB_PASSWORD}';
        END IF;
    END
    \$\$;
    GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis TO jarvis;
    ALTER DATABASE homelab_jarvis OWNER TO jarvis;
EOSQL
echo -e "${GREEN}✓${NC}"

echo ""
echo -e "${BOLD}Verifying users exist...${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for user in streambot ticketbot jarvis; do
    echo -n "$user... "
    if docker exec homelab-postgres psql -U postgres -t -c "SELECT 1 FROM pg_user WHERE usename='$user';" | grep -q 1; then
        echo -e "${GREEN}✓ exists${NC}"
    else
        echo -e "${RED}✗ NOT FOUND${NC}"
    fi
done

echo ""
echo -e "${BOLD}Restarting services...${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker restart stream-bot discord-bot homelab-dashboard homelab-celery-worker >/dev/null 2>&1
echo -e "${GREEN}✓ Services restarted${NC}"

echo ""
echo "Waiting 15 seconds..."
sleep 15

echo ""
echo -e "${BOLD}Checking service status...${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for svc in stream-bot discord-bot; do
    echo -n "$svc... "
    if docker ps | grep -q "$svc"; then
        if docker logs $svc --tail 5 2>&1 | grep -q "password authentication failed"; then
            echo -e "${RED}✗ auth failed${NC}"
        elif docker logs $svc --tail 5 2>&1 | grep -q "error"; then
            echo -e "${YELLOW}⚠ has errors${NC}"
        else
            echo -e "${GREEN}✓ running${NC}"
        fi
    else
        echo -e "${RED}✗ not running${NC}"
    fi
done

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     ✅ COMPLETE                                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Check full status: docker ps"
echo ""
