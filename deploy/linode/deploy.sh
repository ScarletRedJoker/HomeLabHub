#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# LINODE DEPLOY - Deploy Linode cloud services only
# ═══════════════════════════════════════════════════════════════
# Usage: ./deploy.sh [options]
# Run from: /opt/homelab/HomeLabHub/deploy/linode
#
# Services deployed: Dashboard, Discord Bot, Stream Bot, Redis, Postgres
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}═══ Linode Cloud Deployment ═══${NC}"
echo "Directory: $SCRIPT_DIR"
echo ""

# Step 1: Pull latest code
echo -e "${CYAN}[1/4] Pulling latest code...${NC}"
cd /opt/homelab/HomeLabHub
git pull origin main
cd "$SCRIPT_DIR"
echo -e "${GREEN}✓ Code updated${NC}"
echo ""

# Step 2: Check .env exists
if [ ! -f ".env" ]; then
    echo -e "${RED}[ERROR] .env file not found!${NC}"
    echo "  Copy from template: cp /opt/homelab/HomeLabHub/.env.template .env"
    echo "  Then fill in all values"
    exit 1
fi

# Step 3: Build and deploy
echo -e "${CYAN}[2/4] Building images...${NC}"
docker compose build --no-cache
echo -e "${GREEN}✓ Build complete${NC}"
echo ""

echo -e "${CYAN}[3/4] Deploying services...${NC}"
docker compose down --remove-orphans 2>/dev/null || true
docker compose up -d
echo -e "${GREEN}✓ Services started${NC}"
echo ""

# Step 4: Health check
echo -e "${CYAN}[4/4] Waiting for services (30s)...${NC}"
sleep 30

echo ""
echo -e "${CYAN}━━━ Service Status ━━━${NC}"
docker compose ps

echo ""
echo -e "${CYAN}━━━ Health Checks ━━━${NC}"

check_service() {
    local name=$1
    local url=$2
    if curl -sf "$url" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} $name"
    else
        echo -e "  ${YELLOW}⏳${NC} $name (still starting)"
    fi
}

check_service "Dashboard" "http://localhost:5000/health"
check_service "Discord Bot" "http://localhost:4000/health"
check_service "Stream Bot" "http://localhost:3000/health"

echo ""
echo -e "${GREEN}═══ Linode Deployment Complete ═══${NC}"
echo ""
echo "Access URLs:"
echo "  Dashboard:   https://dashboard.rig-city.com"
echo "  Discord Bot: https://discord.rig-city.com"
echo "  Stream Bot:  https://stream.rig-city.com"
echo ""
echo "Logs: docker compose logs -f [service-name]"
