#!/bin/bash
# Fix PostgreSQL database users (streambot, jarvis) - SECURE VERSION
# Uses psql variable binding to prevent SQL injection

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}║        🔧 FIXING DATABASE USERS (streambot, jarvis) 🔧      ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

cd /home/evin/contain/HomeLabHub

# Load environment variables
if [ ! -f ".env" ]; then
    echo -e "${RED}✗ .env file not found!${NC}"
    exit 1
fi

source .env

# Validate required passwords
if [ -z "$STREAMBOT_DB_PASSWORD" ]; then
    echo -e "${RED}✗ STREAMBOT_DB_PASSWORD not set in .env!${NC}"
    exit 1
fi

if [ -z "$JARVIS_DB_PASSWORD" ]; then
    echo -e "${RED}✗ JARVIS_DB_PASSWORD not set in .env!${NC}"
    exit 1
fi

echo -e "${YELLOW}Creating database users and databases...${NC}"
echo ""

# Create a temporary SQL file for streambot (safer than inline SQL)
echo -e "${BLUE}[1/2] Creating streambot user and database...${NC}"
cat > /tmp/create_streambot.sql <<'EOF'
-- Create user if not exists (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'streambot') THEN
        CREATE ROLE streambot WITH LOGIN PASSWORD :'streambot_password';
        RAISE NOTICE 'Created user: streambot';
    ELSE
        ALTER ROLE streambot WITH PASSWORD :'streambot_password';
        RAISE NOTICE 'User streambot already exists, password updated';
    END IF;
END
$$;

-- Create database if not exists
SELECT 'CREATE DATABASE streambot OWNER streambot'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'streambot')\gexec

-- Grant all privileges
GRANT ALL PRIVILEGES ON DATABASE streambot TO streambot;
EOF

# Execute with proper error handling and variable substitution
if docker exec -i discord-bot-db psql -v ON_ERROR_STOP=1 -v streambot_password="$STREAMBOT_DB_PASSWORD" -U ticketbot -d ticketbot -f /dev/stdin < /tmp/create_streambot.sql 2>&1; then
    echo -e "${GREEN}✓ Streambot user and database created${NC}"
else
    echo -e "${RED}✗ Failed to create streambot user${NC}"
    rm -f /tmp/create_streambot.sql
    exit 1
fi

rm -f /tmp/create_streambot.sql

echo ""
echo -e "${BLUE}[2/2] Creating jarvis user and database...${NC}"

# Create a temporary SQL file for jarvis (safer than inline SQL)
cat > /tmp/create_jarvis.sql <<'EOF'
-- Create user if not exists (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'jarvis') THEN
        CREATE ROLE jarvis WITH LOGIN PASSWORD :'jarvis_password';
        RAISE NOTICE 'Created user: jarvis';
    ELSE
        ALTER ROLE jarvis WITH PASSWORD :'jarvis_password';
        RAISE NOTICE 'User jarvis already exists, password updated';
    END IF;
END
$$;

-- Create database if not exists
SELECT 'CREATE DATABASE homelab_jarvis OWNER jarvis'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'homelab_jarvis')\gexec

-- Grant all privileges
GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis TO jarvis;
EOF

# Execute with proper error handling and variable substitution
if docker exec -i discord-bot-db psql -v ON_ERROR_STOP=1 -v jarvis_password="$JARVIS_DB_PASSWORD" -U ticketbot -d ticketbot -f /dev/stdin < /tmp/create_jarvis.sql 2>&1; then
    echo -e "${GREEN}✓ Jarvis user and database created${NC}"
else
    echo -e "${RED}✗ Failed to create jarvis user${NC}"
    rm -f /tmp/create_jarvis.sql
    exit 1
fi

rm -f /tmp/create_jarvis.sql

echo ""
echo -e "${BLUE}Verifying databases...${NC}"
if ! docker exec discord-bot-db psql -U ticketbot -d ticketbot -c "\l" | grep -E "streambot|homelab_jarvis|ticketbot"; then
    echo -e "${RED}✗ Database verification failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ Database users fixed securely!${NC}"
echo ""
echo "Next steps:"
echo "  1. Restart stream-bot: docker restart stream-bot"
echo "  2. Restart dashboard: docker restart homelab-dashboard homelab-celery-worker"
