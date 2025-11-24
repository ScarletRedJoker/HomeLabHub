#!/bin/bash
# Complete fix: Reload Caddy + Run comprehensive tests

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

cd /home/evin/contain/HomeLabHub

echo -e "${CYAN}Step 1: Pull latest fixes${NC}"
git pull origin main

echo ""
echo -e "${CYAN}Step 2: Reload Caddy (add dashboard.evindrake.net alias)${NC}"
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
sleep 2

echo ""
echo -e "${GREEN}✓ Dashboard now accessible at BOTH URLs:${NC}"
echo "  • https://host.evindrake.net"
echo "  • https://dashboard.evindrake.net"

echo ""
echo -e "${CYAN}Step 3: Run comprehensive feature tests${NC}"
echo ""
./COMPREHENSIVE_FEATURE_TEST.sh
