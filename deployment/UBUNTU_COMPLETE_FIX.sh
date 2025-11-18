#!/bin/bash
# COMPLETE UBUNTU FIX - Checks env vars + fixes everything
# This is THE script to run on Ubuntu to get EVERYTHING working

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}║     🚀 COMPLETE UBUNTU FIX - ALL SITES WORKING 🚀          ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

cd /home/evin/contain/HomeLabHub

# Step 1: Pull latest code from Replit
echo -e "${YELLOW}[1/4] Pulling latest code from Replit...${NC}"
if git fetch origin main && git reset --hard origin/main; then
    chmod +x deployment/*.sh homelab-manager.sh
    echo -e "${GREEN}✓ Code synced from Replit${NC}"
else
    echo -e "${RED}✗ Git sync failed${NC}"
    exit 1
fi

# Step 2: Check all environment variables
echo ""
echo -e "${YELLOW}[2/4] Validating environment variables...${NC}"
if ./deployment/check-all-env-vars.sh; then
    echo -e "${GREEN}✓ All required env vars present${NC}"
else
    echo ""
    echo -e "${RED}✗ MISSING ENVIRONMENT VARIABLES!${NC}"
    echo ""
    echo "Fix by running: ./homelab-manager.sh (option 10)"
    echo "Then re-run this script."
    exit 1
fi

# Step 3: Fix all issues systematically
echo ""
echo -e "${YELLOW}[3/4] Fixing all infrastructure issues...${NC}"
./deployment/FIX_EVERYTHING_NOW.sh

# Step 4: Verify all sites are accessible
echo ""
echo -e "${YELLOW}[4/4] Verifying all websites...${NC}"
sleep 5

check_site() {
    local url="$1"
    local name="$2"
    
    if curl -Isk --max-time 10 "$url" 2>/dev/null | head -n1 | grep -qE "HTTP.*[23][0-9]{2}"; then
        echo -e "${GREEN}✓${NC} $name: $url"
    else
        echo -e "${RED}✗${NC} $name: $url (check logs)"
    fi
}

echo ""
check_site "https://host.evindrake.net" "Dashboard"
check_site "https://stream.rig-city.com" "Stream Bot"
check_site "https://bot.rig-city.com" "Discord Bot"
check_site "https://home.evindrake.net" "Home Assistant"
check_site "https://code.evindrake.net" "Code Server"
check_site "https://vnc.evindrake.net" "VNC Desktop"
check_site "https://plex.evindrake.net" "Plex"
check_site "https://n8n.evindrake.net" "n8n"
check_site "https://scarletredjoker.com" "Static Site"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ COMPLETE FIX FINISHED!${NC}"
echo ""
echo -e "If any sites show errors, check their logs:"
echo -e "  docker logs stream-bot"
echo -e "  docker logs homelab-dashboard"
echo -e "  docker logs discord-bot"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
