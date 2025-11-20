#!/bin/bash
# Complete database setup - databases, users, and permissions
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     🔧 COMPLETE DATABASE SETUP                            ║"
echo "║        Create DBs + Users + Permissions                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Load environment
if [ ! -f ".env" ]; then
    echo -e "${RED}ERROR: .env file not found${NC}"
    exit 1
fi
source .env

echo -e "${BOLD}Step 1: Create Databases${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create streambot database
echo -n "streambot... "
docker exec homelab-postgres psql -U postgres -c "
    SELECT 'CREATE DATABASE streambot'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'streambot')
    \gexec
" >/dev/null 2>&1 && echo -e "${GREEN}✓${NC}" || echo -e "${YELLOW}exists${NC}"

# Create ticketbot database
echo -n "ticketbot... "
docker exec homelab-postgres psql -U postgres -c "
    SELECT 'CREATE DATABASE ticketbot'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ticketbot')
    \gexec
" >/dev/null 2>&1 && echo -e "${GREEN}✓${NC}" || echo -e "${YELLOW}exists${NC}"

# Create homelab_jarvis database
echo -n "homelab_jarvis... "
docker exec homelab-postgres psql -U postgres -c "
    SELECT 'CREATE DATABASE homelab_jarvis'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'homelab_jarvis')
    \gexec
" >/dev/null 2>&1 && echo -e "${GREEN}✓${NC}" || echo -e "${YELLOW}exists${NC}"

echo ""
echo -e "${BOLD}Step 2: Create Users${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create streambot user
echo -n "streambot... "
docker exec homelab-postgres psql -U postgres -c "
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'streambot') THEN
            CREATE USER streambot WITH PASSWORD '${STREAMBOT_DB_PASSWORD}';
            RAISE NOTICE 'Created';
        ELSE
            ALTER USER streambot WITH PASSWORD '${STREAMBOT_DB_PASSWORD}';
            RAISE NOTICE 'Updated';
        END IF;
    END
    \$\$;
" 2>&1 | grep -q "Created" && echo -e "${GREEN}✓ created${NC}" || echo -e "${YELLOW}✓ updated${NC}"

# Create ticketbot user  
echo -n "ticketbot... "
docker exec homelab-postgres psql -U postgres -c "
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'ticketbot') THEN
            CREATE USER ticketbot WITH PASSWORD '${DISCORD_DB_PASSWORD}';
            RAISE NOTICE 'Created';
        ELSE
            ALTER USER ticketbot WITH PASSWORD '${DISCORD_DB_PASSWORD}';
            RAISE NOTICE 'Updated';
        END IF;
    END
    \$\$;
" 2>&1 | grep -q "Created" && echo -e "${GREEN}✓ created${NC}" || echo -e "${YELLOW}✓ updated${NC}"

# Create jarvis user
echo -n "jarvis... "
docker exec homelab-postgres psql -U postgres -c "
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'jarvis') THEN
            CREATE USER jarvis WITH PASSWORD '${JARVIS_DB_PASSWORD}';
            RAISE NOTICE 'Created';
        ELSE
            ALTER USER jarvis WITH PASSWORD '${JARVIS_DB_PASSWORD}';
            RAISE NOTICE 'Updated';
        END IF;
    END
    \$\$;
" 2>&1 | grep -q "Created" && echo -e "${GREEN}✓ created${NC}" || echo -e "${YELLOW}✓ updated${NC}"

echo ""
echo -e "${BOLD}Step 3: Grant Permissions${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Grant permissions for streambot
echo -n "streambot → streambot db... "
docker exec homelab-postgres psql -U postgres -d streambot -c "
    GRANT ALL PRIVILEGES ON DATABASE streambot TO streambot;
    GRANT ALL PRIVILEGES ON SCHEMA public TO streambot;
    ALTER DATABASE streambot OWNER TO streambot;
    ALTER SCHEMA public OWNER TO streambot;
" >/dev/null 2>&1 && echo -e "${GREEN}✓${NC}"

# Grant permissions for ticketbot
echo -n "ticketbot → ticketbot db... "
docker exec homelab-postgres psql -U postgres -d ticketbot -c "
    GRANT ALL PRIVILEGES ON DATABASE ticketbot TO ticketbot;
    GRANT ALL PRIVILEGES ON SCHEMA public TO ticketbot;
    ALTER DATABASE ticketbot OWNER TO ticketbot;
    ALTER SCHEMA public OWNER TO ticketbot;
" >/dev/null 2>&1 && echo -e "${GREEN}✓${NC}"

# Grant permissions for jarvis
echo -n "jarvis → homelab_jarvis db... "
docker exec homelab-postgres psql -U postgres -d homelab_jarvis -c "
    GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis TO jarvis;
    GRANT ALL PRIVILEGES ON SCHEMA public TO jarvis;
    ALTER DATABASE homelab_jarvis OWNER TO jarvis;
    ALTER SCHEMA public OWNER TO jarvis;
" >/dev/null 2>&1 && echo -e "${GREEN}✓${NC}"

echo ""
echo -e "${BOLD}Step 4: Verify Setup${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Databases:"
for db in streambot ticketbot homelab_jarvis; do
    echo -n "  $db... "
    if docker exec homelab-postgres psql -U postgres -lqt | cut -d \| -f 1 | grep -qw $db; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗ MISSING${NC}"
    fi
done

echo ""
echo "Users:"
for user in streambot ticketbot jarvis; do
    echo -n "  $user... "
    if docker exec homelab-postgres psql -U postgres -t -c "SELECT 1 FROM pg_user WHERE usename='$user';" | grep -q 1; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗ MISSING${NC}"
    fi
done

echo ""
echo -e "${BOLD}Step 5: Test Connections${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test streambot connection
echo -n "streambot... "
if PGPASSWORD="${STREAMBOT_DB_PASSWORD}" docker exec homelab-postgres psql -U streambot -d streambot -c "SELECT 1;" >/dev/null 2>&1; then
    echo -e "${GREEN}✓ can connect${NC}"
else
    echo -e "${RED}✗ CANNOT CONNECT${NC}"
fi

# Test ticketbot connection  
echo -n "ticketbot... "
if PGPASSWORD="${DISCORD_DB_PASSWORD}" docker exec homelab-postgres psql -U ticketbot -d ticketbot -c "SELECT 1;" >/dev/null 2>&1; then
    echo -e "${GREEN}✓ can connect${NC}"
else
    echo -e "${RED}✗ CANNOT CONNECT${NC}"
fi

# Test jarvis connection
echo -n "jarvis... "
if PGPASSWORD="${JARVIS_DB_PASSWORD}" docker exec homelab-postgres psql -U jarvis -d homelab_jarvis -c "SELECT 1;" >/dev/null 2>&1; then
    echo -e "${GREEN}✓ can connect${NC}"
else
    echo -e "${RED}✗ CANNOT CONNECT${NC}"
fi

echo ""
echo -e "${BOLD}Step 6: Restart Services${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker restart stream-bot discord-bot homelab-dashboard homelab-celery-worker >/dev/null 2>&1
echo -e "${GREEN}✓ Services restarted${NC}"

echo ""
echo "Waiting 20 seconds for services to start..."
sleep 20

echo ""
echo -e "${BOLD}Step 7: Check Service Status${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for svc in stream-bot discord-bot homelab-dashboard; do
    echo -n "$svc... "
    if ! docker ps | grep -q "$svc"; then
        echo -e "${RED}✗ NOT RUNNING${NC}"
        continue
    fi
    
    if docker logs $svc --tail 10 2>&1 | grep -qi "password authentication failed"; then
        echo -e "${RED}✗ AUTH FAILED${NC}"
    elif docker logs $svc --tail 10 2>&1 | grep -qi "error"; then
        echo -e "${YELLOW}⚠ has errors (check logs)${NC}"
    elif docker logs $svc --tail 10 2>&1 | grep -qi "listening\|started\|ready"; then
        echo -e "${GREEN}✓ RUNNING${NC}"
    else
        echo -e "${YELLOW}? running (unclear state)${NC}"
    fi
done

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     ✅ COMPLETE                                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Full status: docker ps"
echo "Full logs: docker compose logs -f stream-bot discord-bot"
echo ""
