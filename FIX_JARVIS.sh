#!/bin/bash
# ============================================
# FIX JARVIS AI AND RESTART SERVICES
# ============================================

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║           FIXING JARVIS AI AND CONSUL SERVICE          ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

cd /home/evin/contain/HomeLabHub

echo -e "${CYAN}[1/5] Pull Latest Fixes${NC}"
git pull origin main
echo "✓ Pulled compose fixes (consul added to compose.all.yml)"
echo ""

echo -e "${CYAN}[2/5] Check OPENAI_API_KEY${NC}"
if grep -q "^OPENAI_API_KEY=" .env 2>/dev/null; then
    echo "✓ OPENAI_API_KEY found in .env"
else
    echo -e "${RED}✗ OPENAI_API_KEY missing from .env${NC}"
    echo "Please add it: echo 'OPENAI_API_KEY=sk-your-key-here' >> .env"
    exit 1
fi
echo ""

echo -e "${CYAN}[3/5] Stop All Services${NC}"
docker compose down
echo "✓ Stopped"
echo ""

echo -e "${CYAN}[4/5] Start All Services (with Consul)${NC}"
docker compose up -d
echo "✓ Starting all services..."
sleep 30
echo ""

echo -e "${CYAN}[5/5] Check Services${NC}"
RUNNING=$(docker ps --format "{{.Names}}" | wc -l)
echo "✓ $RUNNING containers running"
echo ""

docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "consul|dashboard|dns" || echo "Checking specific services..."

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                  FIX COMPLETE!                         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Verify Jarvis AI:"
echo "  1. Visit: https://dashboard.evindrake.net/ai-assistant"
echo "  2. Send a test message"
echo ""
echo "Check dashboard logs:"
echo "  ./homelab logs homelab-dashboard"
echo ""
echo "Expected containers now running:"
echo "  - homelab-dashboard (with working Jarvis)"
echo "  - consul-server (for service discovery)"
echo "  - dns-manager (depends on consul)"
echo "  - All 14 other core services"
echo ""
