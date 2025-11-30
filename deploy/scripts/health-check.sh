#!/bin/bash

echo "================================================"
echo "  Nebula Command Health Check"
echo "================================================"
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_url() {
    local name="$1"
    local url="$2"
    local expected="${3:-200}"
    
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")
    
    if [[ "$status" == "$expected" ]] || [[ "$status" == "302" ]] || [[ "$status" == "301" ]]; then
        echo -e "${GREEN}✓${NC} $name: OK ($status)"
        return 0
    else
        echo -e "${RED}✗${NC} $name: FAILED ($status)"
        return 1
    fi
}

check_port() {
    local name="$1"
    local host="$2"
    local port="$3"
    
    if timeout 5 bash -c "</dev/tcp/$host/$port" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $name: Port $port open"
        return 0
    else
        echo -e "${RED}✗${NC} $name: Port $port closed"
        return 1
    fi
}

echo "Cloud Services (Linode):"
echo "------------------------"
check_url "Discord Bot" "https://bot.rig-city.com/health"
check_url "Stream Bot" "https://stream.rig-city.com/health"
check_url "Dashboard" "https://dashboard.evindrake.net"
check_url "n8n" "https://n8n.evindrake.net"
check_url "Code Server" "https://code.evindrake.net"
check_url "Rig City Site" "https://rig-city.com"
check_url "Scarlet Red Joker" "https://scarletredjoker.com"

echo ""
echo "Local Services:"
echo "---------------"
check_url "Plex" "https://plex.evindrake.net/identity"
check_url "Home Assistant" "https://home.evindrake.net"
check_url "VNC" "https://vnc.evindrake.net"

echo ""
echo "Internal Services (Tailscale):"
echo "------------------------------"

if command -v tailscale &> /dev/null; then
    LOCAL_IP=$(tailscale ip -4 2>/dev/null || echo "")
    if [[ -n "$LOCAL_IP" ]]; then
        echo -e "${GREEN}✓${NC} Tailscale: Connected ($LOCAL_IP)"
    else
        echo -e "${YELLOW}⚠${NC} Tailscale: Not connected"
    fi
else
    echo -e "${YELLOW}⚠${NC} Tailscale: Not installed"
fi

echo ""
echo "Docker Status:"
echo "--------------"
if command -v docker &> /dev/null; then
    running=$(docker ps --format '{{.Names}}' 2>/dev/null | wc -l)
    echo -e "${GREEN}✓${NC} Docker: $running containers running"
else
    echo -e "${RED}✗${NC} Docker: Not available"
fi

echo ""
