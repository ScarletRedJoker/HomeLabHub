#!/bin/bash
# Complete deployment - handles orphans and ensures everything works
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        🚀 COMPLETE DEPLOYMENT - FIX EVERYTHING 🚀        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Remove orphan containers
echo -e "${BOLD}Removing orphan containers...${NC}"
docker stop discord-bot-db 2>/dev/null || true
docker rm -f discord-bot-db 2>/dev/null || true
echo -e "${GREEN}✓ Orphans removed${NC}"
echo ""

# Step 2: Clean shutdown
echo -e "${BOLD}Stopping all services...${NC}"
docker compose -f docker-compose.unified.yml down --remove-orphans --timeout 30 2>&1 | grep -v "not found" || true
echo -e "${GREEN}✓ Stopped${NC}"
echo ""

# Step 3: Start everything
echo -e "${BOLD}Starting all services...${NC}"
docker compose -f docker-compose.unified.yml up -d --remove-orphans
echo -e "${GREEN}✓ Started${NC}"
echo ""

# Step 4: Wait for critical services
echo "Waiting 30 seconds for services to initialize..."
sleep 30
echo ""

# Step 5: Fix VNC & Code-Server
echo -e "${BOLD}Fixing VNC/Code-Server...${NC}"
docker exec vnc-desktop /usr/local/bin/fix-vnc-password.sh 2>/dev/null || true
docker restart vnc-desktop code-server >/dev/null 2>&1
echo -e "${GREEN}✓ Fixed${NC}"
echo ""

# Step 6: Verify
echo -e "${BOLD}VERIFICATION${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
RUNNING=$(docker ps --filter "name=homelab-|discord-bot|stream-bot|caddy|plex|n8n|vnc|code-server|homeassistant|rig-city|scarletredjoker" --format "{{.Names}}" | wc -l)

docker ps --format "table {{.Names}}\t{{.Status}}" --filter "name=homelab-|discord-bot|stream-bot|caddy|plex|n8n|vnc|code-server|homeassistant|rig-city|scarletredjoker"

echo ""
echo -e "${BOLD}Running: $RUNNING/15${NC}"
echo ""

if [ $RUNNING -eq 15 ]; then
    echo -e "${GREEN}${BOLD}✅ SUCCESS - ALL 15 SERVICES RUNNING${NC}"
    echo ""
    echo "Service URLs:"
    echo "  • Dashboard:  https://host.evindrake.net"
    echo "  • Stream Bot: https://stream.rig-city.com"
    echo "  • Discord:    https://bot.rig-city.com"
    echo "  • VNC:        https://vnc.evindrake.net"
else
    echo -e "${YELLOW}Running: $RUNNING/15 - Checking logs...${NC}"
    echo ""
    for service in homelab-dashboard discord-bot stream-bot homelab-celery-worker; do
        if ! docker ps --filter "name=$service" | grep -q "$service"; then
            echo "Missing: $service"
            docker logs $service --tail 20 2>&1 | head -15
            echo ""
        fi
    done
fi
echo ""
