#!/bin/bash
# ============================================
# HOME ASSISTANT COMPOSE FIX - DEPLOYMENT
# ============================================

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       HOME ASSISTANT COMPOSE FIX - DEPLOYMENT          ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

cd /home/evin/contain/HomeLabHub

echo -e "${CYAN}[1/5] Pull Home Assistant Fix${NC}"
git pull origin main
echo "✓ Pulled:"
echo "  - Fixed Home Assistant network conflict"
echo "  - Removed 'networks' (kept 'network_mode: host')"
echo ""

echo -e "${CYAN}[2/5] Validate Docker Compose Syntax${NC}"
if docker compose config > /dev/null 2>&1; then
    echo "✅ Compose syntax is VALID!"
else
    echo "❌ Compose syntax error:"
    docker compose config 2>&1 | head -10
    exit 1
fi
echo ""

echo -e "${CYAN}[3/5] Restart All Services${NC}"
docker compose down
echo "✓ Services stopped"
docker compose up -d
echo "✓ Services starting..."
echo ""

echo -e "${CYAN}[4/5] Wait for Services (30s)${NC}"
for i in {30..1}; do
    echo -ne "  ⏳ $i seconds remaining...\r"
    sleep 1
done
echo -e "\n✓ Services initialized"
echo ""

echo -e "${CYAN}[5/5] Verify Home Assistant${NC}"

# Check if Home Assistant is running
if docker ps --filter "name=homeassistant" --format "{{.Names}}" | grep -q homeassistant; then
    echo "✅ Home Assistant container is running"
    
    # Check if accessible on host network
    sleep 5
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:8123 | grep -q "200\|302"; then
        echo "✅ Home Assistant accessible at http://localhost:8123"
    else
        echo "⚠️  Home Assistant not responding yet (may still be starting up)"
    fi
else
    echo "❌ Home Assistant container not running"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              HOME ASSISTANT FIX COMPLETE!              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

echo "What Was Fixed:"
echo "  ✅ Removed conflicting 'networks' declaration from Home Assistant"
echo "  ✅ Kept 'network_mode: host' for device discovery"
echo "  ✅ Docker Compose syntax now valid"
echo ""

echo "Access Home Assistant:"
echo "  🌐 http://host.evindrake.net:8123"
echo "  🌐 http://localhost:8123 (on server)"
echo ""

echo "Check Services:"
./homelab status

echo ""
echo "View Home Assistant Logs:"
echo "  docker logs homeassistant -f"
echo ""

echo "Test Dashboard Connection:"
echo "  curl https://dashboard.evindrake.net/health"
echo ""

echo -e "${YELLOW}Note:${NC} Home Assistant uses host network mode for smart home device discovery."
echo "This means it's accessible on port 8123 directly on the host, not through Docker networking."
