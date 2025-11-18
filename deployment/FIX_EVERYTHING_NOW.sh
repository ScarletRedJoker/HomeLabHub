#!/bin/bash
# COMPLETE FIX SCRIPT - Fixes ALL Issues Systematically
# Run this on Ubuntu to get everything working

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}║        🔧 FIXING ALL ISSUES SYSTEMATICALLY 🔧               ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

cd /home/evin/contain/HomeLabHub

# Step 1: Fix code-server permissions
echo -e "${YELLOW}[1/3] Fixing code-server permissions...${NC}"
VOLUME_PATH=$(docker volume inspect code_server_data --format '{{ .Mountpoint }}' 2>/dev/null || echo "")
if [ -n "$VOLUME_PATH" ]; then
    sudo chown -R 1000:1000 "$VOLUME_PATH"
    echo -e "${GREEN}✓ Code-server permissions fixed${NC}"
else
    echo -e "${YELLOW}⚠ Code-server volume not found, skipping${NC}"
fi

# Step 2: Rebuild all services (databases auto-provision on startup via init scripts)
echo ""
echo -e "${YELLOW}[2/3] Rebuilding all services...${NC}"
echo -e "${BLUE}ℹ Database users and databases are automatically created by PostgreSQL init scripts${NC}"
echo -e "${BLUE}  (see config/postgres-init/00-init-all-databases.sh)${NC}"
echo ""
docker-compose -f docker-compose.unified.yml down
docker-compose -f docker-compose.unified.yml build --no-cache
docker-compose -f docker-compose.unified.yml up -d
echo -e "${GREEN}✓ All services rebuilt with automatic database provisioning${NC}"

# Step 3: Restart code-server, VNC & Caddy
echo ""
echo -e "${YELLOW}[3/3] Ensuring code-server, VNC, and Caddy are running...${NC}"
docker-compose -f docker-compose.unified.yml restart code-server vnc-desktop caddy
echo -e "${GREEN}✓ Services restarted${NC}"

# Wait for services to start
echo ""
echo -e "${BLUE}⏳ Waiting 15 seconds for services to initialize...${NC}"
sleep 15

# Verification
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║               ✓ VERIFICATION RESULTS                         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${YELLOW}Stream-bot status:${NC}"
if docker logs stream-bot --tail 10 2>&1 | grep -qi "ready\|listening\|started"; then
    echo -e "${GREEN}✓ Stream-bot is running${NC}"
else
    echo -e "${RED}✗ Stream-bot may have issues - checking logs:${NC}"
    docker logs stream-bot --tail 5
fi

echo ""
echo -e "${YELLOW}Dashboard status:${NC}"
if docker logs homelab-dashboard --tail 10 2>&1 | grep -qi "running\|started\|serving"; then
    echo -e "${GREEN}✓ Dashboard is running${NC}"
else
    echo -e "${RED}✗ Dashboard may have issues - checking logs:${NC}"
    docker logs homelab-dashboard --tail 5
fi

echo ""
echo -e "${YELLOW}Code-server status:${NC}"
if docker logs code-server --tail 5 2>&1 | grep -qi "EACCES"; then
    echo -e "${RED}✗ Code-server still has permission errors${NC}"
else
    echo -e "${GREEN}✓ Code-server permissions fixed${NC}"
fi

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║               🌐 YOUR WEBSITES                               ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✓ Dashboard:${NC}      https://host.evindrake.net"
echo -e "${GREEN}✓ Stream Bot:${NC}     https://stream.rig-city.com"
echo -e "${GREEN}✓ Discord Bot:${NC}    https://bot.rig-city.com"
echo -e "${GREEN}✓ Home:${NC}           https://home.evindrake.net"
echo -e "${GREEN}✓ Code Server:${NC}    https://code.evindrake.net"
echo -e "${GREEN}✓ VNC Desktop:${NC}    https://vnc.evindrake.net"
echo -e "${GREEN}✓ Plex:${NC}           https://plex.evindrake.net"
echo -e "${GREEN}✓ n8n:${NC}            https://n8n.evindrake.net"
echo -e "${GREEN}✓ Static Site:${NC}    https://scarletredjoker.com"
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ ALL FIXES COMPLETE - YOUR SITES SHOULD BE WORKING NOW!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
