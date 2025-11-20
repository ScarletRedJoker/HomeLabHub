#!/bin/bash
# Fix .env file and create missing database users
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     🔧 FIX .ENV & DATABASE USERS                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Load environment
if [ ! -f ".env" ]; then
    echo -e "${RED}ERROR: .env file not found${NC}"
    exit 1
fi
source .env

echo -e "${BOLD}Step 1: Fix .env file (discord-bot-db → homelab-postgres)${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if grep -q "@discord-bot-db:" .env; then
    sed -i 's/@discord-bot-db:/@homelab-postgres:/g' .env
    echo -e "${GREEN}✓ Updated .env file${NC}"
else
    echo -e "${YELLOW}⚠ Already using homelab-postgres${NC}"
fi
echo ""

echo -e "${BOLD}Step 2: Create database users${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create streambot user
echo -n "  streambot... "
docker exec homelab-postgres psql -U postgres -c "
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'streambot') THEN
            CREATE USER streambot WITH PASSWORD '${STREAMBOT_DB_PASSWORD}';
            GRANT ALL PRIVILEGES ON DATABASE streambot TO streambot;
            RAISE NOTICE 'Created user streambot';
        ELSE
            RAISE NOTICE 'User streambot already exists';
        END IF;
    END
    \$\$;
" 2>&1 | grep -q "already exists" && echo -e "${YELLOW}exists${NC}" || echo -e "${GREEN}✓${NC}"

# Create ticketbot user
echo -n "  ticketbot... "
docker exec homelab-postgres psql -U postgres -c "
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'ticketbot') THEN
            CREATE USER ticketbot WITH PASSWORD '${DISCORD_DB_PASSWORD}';
            GRANT ALL PRIVILEGES ON DATABASE ticketbot TO ticketbot;
            RAISE NOTICE 'Created user ticketbot';
        ELSE
            RAISE NOTICE 'User ticketbot already exists';
        END IF;
    END
    \$\$;
" 2>&1 | grep -q "already exists" && echo -e "${YELLOW}exists${NC}" || echo -e "${GREEN}✓${NC}"

# Create jarvis user
echo -n "  jarvis... "
docker exec homelab-postgres psql -U postgres -c "
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'jarvis') THEN
            CREATE USER jarvis WITH PASSWORD '${JARVIS_DB_PASSWORD}';
            GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis TO jarvis;
            RAISE NOTICE 'Created user jarvis';
        ELSE
            RAISE NOTICE 'User jarvis already exists';
        END IF;
    END
    \$\$;
" 2>&1 | grep -q "already exists" && echo -e "${YELLOW}exists${NC}" || echo -e "${GREEN}✓${NC}"

echo ""

echo -e "${BOLD}Step 3: Restart affected services${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker restart stream-bot discord-bot homelab-dashboard homelab-celery-worker >/dev/null 2>&1
echo -e "${GREEN}✓ Services restarted${NC}"
echo ""

echo "Waiting 10 seconds for services to start..."
sleep 10
echo ""

echo -e "${BOLD}Step 4: Verify${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check stream-bot
echo -n "stream-bot: "
if docker ps | grep -q "stream-bot"; then
    if docker logs stream-bot --tail 5 2>&1 | grep -q "password authentication failed"; then
        echo -e "${RED}✗ Still failing${NC}"
    else
        echo -e "${GREEN}✓ Running${NC}"
    fi
else
    echo -e "${RED}✗ Not running${NC}"
fi

# Check discord-bot
echo -n "discord-bot: "
if docker ps | grep -q "discord-bot"; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${RED}✗ Not running${NC}"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     ✅ FIX COMPLETE                                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Check status with: docker ps"
echo ""
