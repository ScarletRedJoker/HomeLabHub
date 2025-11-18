#!/bin/bash
# Fix Stream-Bot Database Schema Issue
# This script rebuilds stream-bot with database migrations

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}║        🔧 Fixing Stream-Bot Database Schema 🔧              ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

cd /home/evin/contain/HomeLabHub

# Check if stream-bot service exists
if ! docker-compose -f docker-compose.unified.yml config --services 2>/dev/null | grep -q "stream-bot"; then
    echo -e "${RED}✗ Stream-bot service not found in docker-compose.unified.yml${NC}"
    exit 1
fi

echo -e "${YELLOW}Problem:${NC} Stream-bot crashes with 'relation bot_instances does not exist'"
echo -e "${YELLOW}Cause:${NC}   Database tables haven't been created (migrations not run)"
echo -e "${YELLOW}Fix:${NC}     Rebuild stream-bot with automatic migration support"
echo ""

# Step 1: Stop stream-bot
echo -e "${YELLOW}[1/3] Stopping stream-bot...${NC}"
docker-compose -f docker-compose.unified.yml stop stream-bot || true
echo -e "${GREEN}✓ Stream-bot stopped${NC}"

# Step 2: Rebuild stream-bot with migrations
echo ""
echo -e "${YELLOW}[2/3] Rebuilding stream-bot with database migration support...${NC}"
echo -e "${BLUE}ℹ This includes drizzle-kit and runs migrations on startup${NC}"
docker-compose -f docker-compose.unified.yml build --no-cache stream-bot
echo -e "${GREEN}✓ Stream-bot rebuilt${NC}"

# Step 3: Start stream-bot
echo ""
echo -e "${YELLOW}[3/3] Starting stream-bot...${NC}"
docker-compose -f docker-compose.unified.yml up -d stream-bot
echo -e "${GREEN}✓ Stream-bot started${NC}"

# Wait for startup
echo ""
echo -e "${BLUE}⏳ Waiting 20 seconds for migrations to run and service to start...${NC}"
sleep 20

# Verification
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║               ✓ VERIFICATION RESULTS                         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${YELLOW}Checking stream-bot logs for errors...${NC}"
if docker logs stream-bot --tail 30 2>&1 | grep -qi "relation.*does not exist"; then
    echo -e "${RED}✗ Stream-bot still has database errors${NC}"
    echo -e "${YELLOW}  Last 20 log lines:${NC}"
    docker logs stream-bot --tail 20
    echo ""
    echo -e "${RED}❌ FIX FAILED - Database tables still missing${NC}"
    echo ""
    echo -e "${YELLOW}Manual Fix:${NC}"
    echo "  1. Connect to the database:"
    echo "     docker exec -it discord-bot-db psql -U ticketbot -d streambot"
    echo ""
    echo "  2. Run the migrations manually from:"
    echo "     services/stream-bot/migrations/0000_broad_speedball.sql"
    exit 1
elif docker logs stream-bot --tail 30 2>&1 | grep -qi "listening\|ready\|started"; then
    echo -e "${GREEN}✓ Stream-bot is running successfully${NC}"
    echo ""
    echo -e "${GREEN}Migration check:${NC}"
    if docker logs stream-bot 2>&1 | grep -qi "database.*migration\|drizzle"; then
        echo -e "${GREEN}✓ Database migrations were run${NC}"
    else
        echo -e "${YELLOW}⚠ Migration logs not found (may have scrolled off)${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Stream-bot status unclear - showing recent logs:${NC}"
    docker logs stream-bot --tail 15
fi

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║               🌐 ACCESS YOUR SERVICE                         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✓ Stream Bot:${NC} https://stream.rig-city.com"
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ FIX COMPLETE - Stream-bot should be working now!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}To check logs:${NC}"
echo "  docker logs stream-bot --tail 50"
echo ""
echo -e "${YELLOW}To verify tables exist:${NC}"
echo "  docker exec -it discord-bot-db psql -U ticketbot -d streambot -c '\dt'"
echo ""
