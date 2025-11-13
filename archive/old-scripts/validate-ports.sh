#!/bin/bash

# ======================================================================
# Port Validation Script
# Validates all container ports are correctly configured
# ======================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Port Configuration Validation${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if containers are running
echo "Checking running containers..."
docker compose -f docker-compose.unified.yml ps

echo ""
echo -e "${BLUE}Testing Internal Container Ports:${NC}"
echo ""

# Test Discord Bot
echo -n "Discord Bot (discord-bot:5000)... "
if docker exec caddy wget -q -O- http://discord-bot:5000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Reachable${NC}"
else
    echo -e "${RED}✗ UNREACHABLE${NC}"
fi

# Test Dashboard
echo -n "Dashboard (homelab-dashboard:5000)... "
if docker exec caddy wget -q -O- http://homelab-dashboard:5000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Reachable${NC}"
else
    echo -e "${RED}✗ UNREACHABLE${NC}"
fi

# Test Stream Bot
echo -n "Stream Bot (stream-bot:5000)... "
if docker exec caddy wget -q -O- http://stream-bot:5000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Reachable${NC}"
else
    echo -e "${RED}✗ UNREACHABLE${NC}"
fi

# Test n8n
echo -n "n8n (n8n:5678)... "
if docker exec caddy wget -q -O- http://n8n:5678 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Reachable${NC}"
else
    echo -e "${RED}✗ UNREACHABLE${NC}"
fi

# Test Plex
echo -n "Plex (plex-server:32400)... "
if docker exec caddy wget -q -O- http://plex-server:32400/web > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Reachable${NC}"
else
    echo -e "${RED}✗ UNREACHABLE${NC}"
fi

# Test VNC
echo -n "VNC Desktop (vnc-desktop:6080)... "
if docker exec caddy wget -q -O- http://vnc-desktop:6080 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Reachable${NC}"
else
    echo -e "${RED}✗ UNREACHABLE${NC}"
fi

# Test Static Site
echo -n "Static Site (scarletredjoker-web:80)... "
if docker exec caddy wget -q -O- http://scarletredjoker-web:80 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Reachable${NC}"
else
    echo -e "${RED}✗ UNREACHABLE${NC}"
fi

echo ""
echo -e "${BLUE}Checking Caddyfile Configuration:${NC}"
echo ""

# Verify Caddyfile has correct ports
if grep -q "homelab-dashboard:5000" Caddyfile 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Dashboard port is 5000 (correct)"
else
    echo -e "${RED}✗${NC} Dashboard port is NOT 5000 in Caddyfile!"
fi

if grep -q "discord-bot:5000" Caddyfile 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Discord bot port is 5000 (correct)"
else
    echo -e "${RED}✗${NC} Discord bot port is NOT 5000 in Caddyfile!"
fi

if grep -q "stream-bot:5000" Caddyfile 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Stream bot port is 5000 (correct)"
else
    echo -e "${RED}✗${NC} Stream bot port is NOT 5000 in Caddyfile!"
fi

echo ""
echo -e "${BLUE}Port Isolation Test (Docker):${NC}"
echo ""
echo "These services ALL use port 5000 internally - this is CORRECT"
echo "because each container has its own network namespace:"
echo ""
docker compose -f docker-compose.unified.yml exec -T discord-bot sh -c 'echo "  Discord bot internal port: $(ss -tlnp | grep :5000 | wc -l) listener(s)"' 2>/dev/null || echo "  Discord bot: Container not running"
docker compose -f docker-compose.unified.yml exec -T homelab-dashboard sh -c 'echo "  Dashboard internal port: $(ss -tlnp | grep :5000 | wc -l) listener(s)"' 2>/dev/null || echo "  Dashboard: Container not running"
docker compose -f docker-compose.unified.yml exec -T stream-bot sh -c 'echo "  Stream bot internal port: $(ss -tlnp | grep :5000 | wc -l) listener(s)"' 2>/dev/null || echo "  Stream bot: Container not running"

echo ""
echo -e "${GREEN}This is normal Docker behavior - no conflicts!${NC}"
echo ""
