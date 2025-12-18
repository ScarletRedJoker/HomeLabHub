#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# LOCAL UBUNTU DEPLOY - Deploy local homelab services only
# ═══════════════════════════════════════════════════════════════
# Usage: ./deploy.sh [options]
# Run from: /opt/homelab/HomeLabHub/deploy/local
#
# Services deployed: Plex, MinIO, Home Assistant, CloudFlare Tunnel
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

echo -e "${CYAN}═══ Local Ubuntu Deployment ═══${NC}"
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
    echo "  Copy from template: cp .env.example .env"
    echo "  Then fill in all values"
    exit 1
fi

# Step 3: Check NAS mount
echo -e "${CYAN}[2/4] Checking NAS mount...${NC}"
if mountpoint -q /mnt/nas/all 2>/dev/null; then
    echo -e "${GREEN}✓ NAS mounted${NC}"
else
    echo -e "${YELLOW}⚠ NAS not mounted - Plex media unavailable${NC}"
    echo "  To mount: sudo ./scripts/setup-nas-mounts.sh"
fi
echo ""

# Step 4: Build and deploy
echo -e "${CYAN}[3/4] Pulling images and starting services...${NC}"
docker compose pull
docker compose down --remove-orphans 2>/dev/null || true
docker compose up -d
echo -e "${GREEN}✓ Services started${NC}"
echo ""

# Step 5: Health check
echo -e "${CYAN}[4/4] Waiting for services (20s)...${NC}"
sleep 20

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

check_service "Plex" "http://localhost:32400/identity"
check_service "MinIO" "http://localhost:9000/minio/health/live"
check_service "Home Assistant" "http://localhost:8123/"

echo ""
echo -e "${GREEN}═══ Local Deployment Complete ═══${NC}"
echo ""
echo "Access URLs:"
echo "  Plex:           http://localhost:32400/web"
echo "  MinIO Console:  http://localhost:9001"
echo "  Home Assistant: http://localhost:8123"
echo ""
echo "Logs: docker compose logs -f [service-name]"
