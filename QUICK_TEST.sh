#!/bin/bash
# Quick feature test - won't hang, shows what works

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

test() {
    local url="$1"
    local name="$2"
    local code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 -u admin:Brs=2729 "$url" 2>/dev/null || echo "000")
    
    if [ "$code" = "200" ] || [ "$code" = "302" ]; then
        echo -e "${GREEN}✓${NC} $name (HTTP $code)"
        ((PASS++))
    else
        echo -e "${RED}✗${NC} $name (HTTP $code)"
        ((FAIL++))
    fi
}

echo "╔══════════════════════════════════════════════════╗"
echo "║       QUICK HOMELAB FEATURE TEST                 ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

echo "Dashboard Pages:"
test "https://host.evindrake.net/" "Home"
test "https://host.evindrake.net/health" "Health"
test "https://host.evindrake.net/service-actions" "Services"
echo ""

echo "AI Features:"
test "https://host.evindrake.net/ai-assistant" "Jarvis AI"
test "https://host.evindrake.net/agent-swarm" "Agent Swarm"
test "https://host.evindrake.net/jarvis-voice" "Voice Commands"
test "https://host.evindrake.net/facts" "Facts Display"
echo ""

echo "Media & Storage:"
test "https://host.evindrake.net/plex" "Plex Import"
test "https://host.evindrake.net/storage" "Storage Monitor"
test "https://host.evindrake.net/nas" "NAS Management"
echo ""

echo "Database & Admin:"
test "https://host.evindrake.net/database" "DB Admin"
test "https://host.evindrake.net/marketplace" "App Marketplace"
echo ""

echo "Bots & Services:"
test "https://bot.rig-city.com" "Discord Bot"
test "https://stream.rig-city.com" "Stream Bot"
echo ""

echo "Websites:"
test "https://rig-city.com" "Rig City"
test "https://scarletredjoker.com" "Scarlet Red Joker"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}"
TOTAL=$((PASS + FAIL))
PERCENT=$((PASS * 100 / TOTAL))
echo "Success Rate: ${PERCENT}%"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
