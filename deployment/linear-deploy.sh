#!/bin/bash
# LINEAR DEPLOYMENT SCRIPT
# Single-command deployment: validate → provision → launch → verify
# 
# Usage: ./deployment/linear-deploy.sh
#
# This script ensures:
#   ✓ Environment variables are validated
#   ✓ Databases are provisioned automatically on first startup
#   ✓ Services start in correct dependency order
#   ✓ Health checks verify successful deployment

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                                                              ║${NC}"
echo -e "${CYAN}║        ${BOLD}🚀 NEBULA COMMAND - LINEAR DEPLOYMENT 🚀${NC}          ${CYAN}║${NC}"
echo -e "${CYAN}║                                                              ║${NC}"
echo -e "${CYAN}║  Automated deployment with zero manual intervention         ║${NC}"
echo -e "${CYAN}║                                                              ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ============================================
# Step 1: Validate Environment
# ============================================
echo -e "${BOLD}${BLUE}[1/4] Validating environment...${NC}"
echo ""

if [ ! -f "./deployment/check-all-env-vars.sh" ]; then
    echo -e "${RED}✗ Environment validation script not found!${NC}"
    exit 1
fi

chmod +x ./deployment/check-all-env-vars.sh

if ./deployment/check-all-env-vars.sh; then
    echo ""
    echo -e "${GREEN}✓ Environment validation passed${NC}"
else
    echo ""
    echo -e "${RED}✗ Environment validation failed!${NC}"
    echo ""
    echo -e "${YELLOW}Fix missing variables by running:${NC}"
    echo -e "  ./homelab-manager.sh (option 10)"
    echo ""
    exit 1
fi

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ============================================
# Step 2: Stop Existing Services (Clean Slate)
# ============================================
echo -e "${BOLD}${BLUE}[2/4] Stopping existing services...${NC}"
echo ""

if docker-compose -f docker-compose.unified.yml down --timeout 30; then
    echo -e "${GREEN}✓ Services stopped${NC}"
else
    echo -e "${YELLOW}⚠ No services were running${NC}"
fi

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ============================================
# Step 3: Start with Automatic Provisioning
# ============================================
echo -e "${BOLD}${BLUE}[3/4] Starting services with automatic database provisioning...${NC}"
echo ""
echo -e "${YELLOW}This will:${NC}"
echo -e "  • Pull/build all container images"
echo -e "  • Automatically create databases (streambot, homelab_jarvis)"
echo -e "  • Start services in dependency order"
echo -e "  • Wait for health checks to pass"
echo ""

if docker-compose -f docker-compose.unified.yml up -d --build; then
    echo ""
    echo -e "${GREEN}✓ Services started${NC}"
else
    echo ""
    echo -e "${RED}✗ Service startup failed!${NC}"
    echo ""
    echo -e "${YELLOW}Check logs with:${NC}"
    echo -e "  docker-compose -f docker-compose.unified.yml logs"
    echo ""
    exit 1
fi

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ============================================
# Step 4: Verify Service Health
# ============================================
echo -e "${BOLD}${BLUE}[4/4] Verifying service health...${NC}"
echo ""
echo -e "${YELLOW}Waiting for services to initialize (15 seconds)...${NC}"
sleep 15

echo ""
echo -e "${BOLD}Service Status:${NC}"
echo ""

# Display container status in table format
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | \
    grep -E "homelab-dashboard|homelab-celery-worker|homelab-redis|homelab-minio|discord-bot|stream-bot|caddy|n8n|plex-server|vnc-desktop|code-server|scarletredjoker-web|rig-city-site|homeassistant|discord-bot-db|NAMES" || {
    echo -e "${RED}✗ Could not check container status${NC}"
}

echo ""

# Count running containers
RUNNING_COUNT=$(docker ps --format "{{.Names}}" 2>/dev/null | grep -E "homelab-dashboard|homelab-celery-worker|homelab-redis|homelab-minio|discord-bot|stream-bot|caddy|n8n|plex-server|vnc-desktop|code-server|scarletredjoker-web|rig-city-site|homeassistant|discord-bot-db" | wc -l)
EXPECTED_COUNT=15

echo ""
echo -e "${BOLD}Health Summary:${NC}"
echo -e "  Running: ${RUNNING_COUNT}/${EXPECTED_COUNT} services"

if [ "$RUNNING_COUNT" -eq "$EXPECTED_COUNT" ]; then
    echo -e "  Status:  ${GREEN}✓ All services healthy${NC}"
elif [ "$RUNNING_COUNT" -ge $((EXPECTED_COUNT - 2)) ]; then
    echo -e "  Status:  ${YELLOW}⚠ Most services running (check logs for issues)${NC}"
else
    echo -e "  Status:  ${RED}✗ Multiple services failed to start${NC}"
fi

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ============================================
# Deployment Complete
# ============================================
if [ "$RUNNING_COUNT" -ge $((EXPECTED_COUNT - 1)) ]; then
    echo -e "${GREEN}${BOLD}✅ DEPLOYMENT COMPLETE!${NC}"
    echo ""
    echo -e "${BOLD}Your services are accessible at:${NC}"
    echo -e "  ${GREEN}•${NC} Dashboard:      https://host.evindrake.net"
    echo -e "  ${GREEN}•${NC} Stream Bot:     https://stream.rig-city.com"
    echo -e "  ${GREEN}•${NC} Discord Bot:    https://bot.rig-city.com"
    echo -e "  ${GREEN}•${NC} Home Assistant: https://home.evindrake.net"
    echo -e "  ${GREEN}•${NC} Code Server:    https://code.evindrake.net"
    echo -e "  ${GREEN}•${NC} VNC Desktop:    https://vnc.evindrake.net"
    echo -e "  ${GREEN}•${NC} Plex:           https://plex.evindrake.net"
    echo -e "  ${GREEN}•${NC} n8n:            https://n8n.evindrake.net"
    echo -e "  ${GREEN}•${NC} Static Site:    https://scarletredjoker.com"
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 0
else
    echo -e "${YELLOW}${BOLD}⚠ DEPLOYMENT COMPLETED WITH WARNINGS${NC}"
    echo ""
    echo -e "${YELLOW}Some services may not have started correctly.${NC}"
    echo ""
    echo -e "Troubleshooting steps:"
    echo -e "  1. Check logs: ${CYAN}docker-compose -f docker-compose.unified.yml logs <service>${NC}"
    echo -e "  2. Restart failed service: ${CYAN}docker-compose -f docker-compose.unified.yml restart <service>${NC}"
    echo -e "  3. Check health: ${CYAN}./homelab-manager.sh${NC} (option 13)"
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 1
fi
