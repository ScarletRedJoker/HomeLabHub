#!/bin/bash
# Fix PostgreSQL database users (streambot, jarvis) - SECURE VERSION
# Uses proper SQL escaping to prevent SQL injection

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

# Function to escape SQL strings (doubles single quotes)
escape_sql() {
    printf '%s' "$1" | sed "s/'/''/g"
}

# Create streambot user
echo -e "${BLUE}[1/2] Creating streambot user and database...${NC}"
ESCAPED_STREAMBOT_PW=$(escape_sql "$STREAMBOT_DB_PASSWORD")

if docker exec -i discord-bot-db psql -v ON_ERROR_STOP=1 -U ticketbot -d ticketbot << EOF
DO \$\$
BEGIN
    -- Create user if not exists
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'streambot') THEN
        CREATE ROLE streambot WITH LOGIN PASSWORD '${ESCAPED_STREAMBOT_PW}';
        RAISE NOTICE 'Created user: streambot';
    ELSE
        ALTER ROLE streambot WITH PASSWORD '${ESCAPED_STREAMBOT_PW}';
        RAISE NOTICE 'User streambot already exists, password updated';
    END IF;
END \$\$;

-- Create database if not exists
SELECT 'CREATE DATABASE streambot OWNER streambot'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'streambot')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE streambot TO streambot;
EOF
then
    echo -e "${GREEN}✓ Streambot user and database created${NC}"
else
    echo -e "${RED}✗ Failed to create streambot user${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}[2/2] Creating jarvis user and database...${NC}"
ESCAPED_JARVIS_PW=$(escape_sql "$JARVIS_DB_PASSWORD")

if docker exec -i discord-bot-db psql -v ON_ERROR_STOP=1 -U ticketbot -d ticketbot << EOF
DO \$\$
BEGIN
    -- Create user if not exists
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'jarvis') THEN
        CREATE ROLE jarvis WITH LOGIN PASSWORD '${ESCAPED_JARVIS_PW}';
        RAISE NOTICE 'Created user: jarvis';
    ELSE
        ALTER ROLE jarvis WITH PASSWORD '${ESCAPED_JARVIS_PW}';
        RAISE NOTICE 'User jarvis already exists, password updated';
    END IF;
END \$\$;

-- Create database if not exists
SELECT 'CREATE DATABASE homelab_jarvis OWNER jarvis'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'homelab_jarvis')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis TO jarvis;
EOF
then
    echo -e "${GREEN}✓ Jarvis user and database created${NC}"
else
    echo -e "${RED}✗ Failed to create jarvis user${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Verifying databases and users...${NC}"

# Check streambot database exists
if ! docker exec discord-bot-db psql -U ticketbot -d ticketbot -c "\l" | grep -q "^\s*streambot\s"; then
    echo -e "${RED}✗ Database 'streambot' not found!${NC}"
    exit 1
fi

# Check homelab_jarvis database exists
if ! docker exec discord-bot-db psql -U ticketbot -d ticketbot -c "\l" | grep -q "^\s*homelab_jarvis\s"; then
    echo -e "${RED}✗ Database 'homelab_jarvis' not found!${NC}"
    exit 1
fi

# Check streambot user exists
if ! docker exec discord-bot-db psql -U ticketbot -d ticketbot -c "\du" | grep -q "^\s*streambot\s"; then
    echo -e "${RED}✗ User 'streambot' not found!${NC}"
    exit 1
fi

# Check jarvis user exists
if ! docker exec discord-bot-db psql -U ticketbot -d ticketbot -c "\du" | grep -q "^\s*jarvis\s"; then
    echo -e "${RED}✗ User 'jarvis' not found!${NC}"
    exit 1
fi

echo -e "${GREEN}✓ All databases and users verified${NC}"

echo ""
echo -e "${GREEN}✅ Database users fixed securely!${NC}"
echo ""
echo "Databases created:"
echo "  • streambot (owner: streambot)"
echo "  • homelab_jarvis (owner: jarvis)"
echo "  • ticketbot (owner: ticketbot)"
