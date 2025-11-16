#!/bin/bash

# =============================================================================
# MASTER HOMELAB REPAIR SCRIPT
# Fixes ALL broken services and validates complete system health
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

clear

echo -e "${MAGENTA}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║         HOMELAB MASTER REPAIR & VALIDATION SYSTEM          ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# Change to project directory
cd /home/evin/contain/HomeLabHub || { echo -e "${RED}✗ Cannot find HomeLabHub directory${NC}"; exit 1; }

# Set compose project name
export COMPOSE_PROJECT_NAME=homelabhub

# Summary counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

# =============================================================================
# PHASE 1: Container Health Check & Repair
# =============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   PHASE 1: Container Health Check${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

CRITICAL_CONTAINERS=(
    "caddy"
    "discord-bot-db"
    "redis"
    "minio"
    "homelab-dashboard"
    "homelab-dashboard-demo"
    "stream-bot"
    "discord-bot"
    "rig-city-site"
    "scarletredjoker-web"
    "homeassistant"
    "vnc-desktop"
    "plex-server"
    "n8n"
    "code-server"
)

echo -e "${YELLOW}Checking critical containers...${NC}"
echo ""

for container in "${CRITICAL_CONTAINERS[@]}"; do
    ((TOTAL_CHECKS++))
    CONTAINER_NAME=$(docker ps -a --filter "name=$container" --format "{{.Names}}" | head -1)
    
    if [ -z "$CONTAINER_NAME" ]; then
        echo -e "${RED}  ✗ $container - NOT FOUND${NC}"
        ((FAILED_CHECKS++))
        continue
    fi
    
    if docker ps --filter "name=$CONTAINER_NAME" --format "{{.Names}}" | grep -q "$CONTAINER_NAME"; then
        # Container is running, check health
        HEALTH=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "none")
        if [ "$HEALTH" = "healthy" ] || [ "$HEALTH" = "none" ]; then
            echo -e "${GREEN}  ✓ $container - RUNNING${NC}"
            ((PASSED_CHECKS++))
        else
            echo -e "${YELLOW}  ⚠ $container - UNHEALTHY (attempting restart)${NC}"
            docker restart "$CONTAINER_NAME" >/dev/null 2>&1
            sleep 5
            if docker ps --filter "name=$CONTAINER_NAME" --format "{{.Names}}" | grep -q "$CONTAINER_NAME"; then
                echo -e "${GREEN}    └─ Restarted successfully${NC}"
                ((PASSED_CHECKS++))
            else
                echo -e "${RED}    └─ Restart failed${NC}"
                ((FAILED_CHECKS++))
            fi
        fi
    else
        echo -e "${RED}  ✗ $container - STOPPED (attempting start)${NC}"
        ((FAILED_CHECKS++))
        docker start "$CONTAINER_NAME" >/dev/null 2>&1 || docker compose -f docker-compose.unified.yml up -d "$container" >/dev/null 2>&1
        sleep 10
        if docker ps --filter "name=$CONTAINER_NAME" --format "{{.Names}}" | grep -q "$CONTAINER_NAME"; then
            echo -e "${GREEN}    └─ Started successfully${NC}"
            ((FAILED_CHECKS--))
            ((PASSED_CHECKS++))
        else
            echo -e "${RED}    └─ Start failed - check logs: docker logs $CONTAINER_NAME${NC}"
        fi
    fi
done

echo ""

# =============================================================================
# PHASE 2: SSL Certificate Health
# =============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   PHASE 2: SSL Certificate Validation${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

CADDY_CONTAINER=$(docker ps --filter "name=caddy" --format "{{.Names}}" | head -1)

if [ -n "$CADDY_CONTAINER" ]; then
    echo -e "${YELLOW}Validating Caddyfile...${NC}"
    ((TOTAL_CHECKS++))
    if docker exec "$CADDY_CONTAINER" caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Caddyfile syntax valid${NC}"
        ((PASSED_CHECKS++))
        
        echo -e "${YELLOW}Reloading Caddy configuration...${NC}"
        if docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
            echo -e "${GREEN}✓ Caddy reloaded successfully${NC}"
            sleep 5
        else
            echo -e "${RED}✗ Caddy reload failed${NC}"
        fi
    else
        echo -e "${RED}✗ Caddyfile has syntax errors${NC}"
        docker exec "$CADDY_CONTAINER" caddy validate --config /etc/caddy/Caddyfile
        ((FAILED_CHECKS++))
    fi
else
    echo -e "${RED}✗ Caddy container not running - SSL management unavailable${NC}"
    ((TOTAL_CHECKS++))
    ((FAILED_CHECKS++))
fi

echo ""

# =============================================================================
# PHASE 3: Database Health
# =============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   PHASE 3: Database Health Check${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

DB_CONTAINER=$(docker ps --filter "name=discord-bot-db" --format "{{.Names}}" | head -1)

if [ -n "$DB_CONTAINER" ]; then
    ((TOTAL_CHECKS++))
    if docker exec "$DB_CONTAINER" pg_isready -U ticketbot >/dev/null 2>&1; then
        echo -e "${GREEN}✓ PostgreSQL is healthy and accepting connections${NC}"
        ((PASSED_CHECKS++))
    else
        echo -e "${RED}✗ PostgreSQL is not responding${NC}"
        ((FAILED_CHECKS++))
    fi
else
    echo -e "${RED}✗ PostgreSQL container not found${NC}"
    ((TOTAL_CHECKS++))
    ((FAILED_CHECKS++))
fi

echo ""

# =============================================================================
# PHASE 4: Site Connectivity Tests
# =============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   PHASE 4: Site Connectivity Validation${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo "Waiting for services to stabilize..."
sleep 15
echo ""

# Test sites
declare -A SITES=(
    ["stream.rig-city.com"]="Stream Bot"
    ["bot.rig-city.com"]="Discord Bot"
    ["rig-city.com"]="Rig City Community"
    ["test.evindrake.net"]="Demo Dashboard"
    ["host.evindrake.net"]="Production Dashboard"
    ["game.evindrake.net"]="Moonlight Gaming"
    ["scarletredjoker.com"]="Portfolio Site"
    ["home.evindrake.net"]="Home Assistant"
    ["vnc.evindrake.net"]="VNC Desktop"
    ["plex.evindrake.net"]="Plex Media"
    ["n8n.evindrake.net"]="n8n Automation"
    ["code.evindrake.net"]="Code Server"
)

for site in "${!SITES[@]}"; do
    ((TOTAL_CHECKS++))
    echo -ne "${YELLOW}Testing ${SITES[$site]} ($site)...${NC} "
    
    HTTP_CODE=$(curl -sI -o /dev/null -w "%{http_code}" --max-time 10 "https://$site" 2>/dev/null || echo "000")
    
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "301" ]; then
        echo -e "${GREEN}✓ HTTP $HTTP_CODE${NC}"
        ((PASSED_CHECKS++))
    elif [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
        echo -e "${YELLOW}⚠ HTTP $HTTP_CODE (requires auth - OK)${NC}"
        ((PASSED_CHECKS++))
    elif [ "$HTTP_CODE" = "000" ]; then
        echo -e "${RED}✗ CONNECTION FAILED${NC}"
        ((FAILED_CHECKS++))
    else
        echo -e "${RED}✗ HTTP $HTTP_CODE${NC}"
        ((FAILED_CHECKS++))
    fi
done

echo ""

# =============================================================================
# PHASE 5: Dashboard Specific Tests
# =============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   PHASE 5: Dashboard Login Tests${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Test demo dashboard login page
echo -ne "${YELLOW}Testing test.evindrake.net login page...${NC} "
((TOTAL_CHECKS++))
LOGIN_PAGE=$(curl -s "https://test.evindrake.net/login" 2>/dev/null || echo "")
if echo "$LOGIN_PAGE" | grep -qi "login\|username\|password"; then
    if echo "$LOGIN_PAGE" | grep -qi "csrf"; then
        echo -e "${RED}✗ CSRF token issue detected${NC}"
        ((FAILED_CHECKS++))
    else
        echo -e "${GREEN}✓ Login page accessible${NC}"
        ((PASSED_CHECKS++))
    fi
else
    echo -e "${RED}✗ Login page not loading correctly${NC}"
    ((FAILED_CHECKS++))
fi

echo ""

# =============================================================================
# FINAL REPORT
# =============================================================================

echo -e "${MAGENTA}═══════════════════════════════════════════════════════════${NC}"
echo -e "${MAGENTA}   REPAIR SUMMARY${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════════════════════════${NC}"
echo ""

PASS_RATE=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))

echo -e "Total Checks:    $TOTAL_CHECKS"
echo -e "${GREEN}Passed:          $PASSED_CHECKS${NC}"
echo -e "${RED}Failed:          $FAILED_CHECKS${NC}"
echo -e "Success Rate:    ${PASS_RATE}%"
echo ""

if [ $FAILED_CHECKS -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                            ║${NC}"
    echo -e "${GREEN}║    ✓ ALL SYSTEMS OPERATIONAL - HOMELAB IS HEALTHY!        ║${NC}"
    echo -e "${GREEN}║                                                            ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
else
    echo -e "${YELLOW}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║                                                            ║${NC}"
    echo -e "${YELLOW}║    ⚠ SOME ISSUES DETECTED - REVIEW FAILURES ABOVE         ║${NC}"
    echo -e "${YELLOW}║                                                            ║${NC}"
    echo -e "${YELLOW}╚════════════════════════════════════════════════════════════╝${NC}"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   SITE ACCESS GUIDE${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "  🏠 Production Dashboard:"
echo "     https://host.evindrake.net"
echo "     Credentials: evin / homelab"
echo ""
echo "  🧪 Demo Dashboard:"
echo "     https://test.evindrake.net"
echo "     Credentials: demo / demo"
echo ""
echo "  🎮 Moonlight Gaming:"
echo "     https://game.evindrake.net"
echo "     (No login required)"
echo ""
echo "  🤖 Stream Bot:"
echo "     https://stream.rig-city.com"
echo ""
echo "  💬 Discord Bot:"
echo "     https://bot.rig-city.com"
echo ""
echo "  🏙️ Rig City Community:"
echo "     https://rig-city.com"
echo ""
echo "  🎨 Portfolio:"
echo "     https://scarletredjoker.com"
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

if [ $FAILED_CHECKS -gt 0 ]; then
    echo -e "${YELLOW}For detailed logs of failed services:${NC}"
    echo "  docker compose -f docker-compose.unified.yml logs [service-name]"
    echo ""
fi

exit $([ $FAILED_CHECKS -eq 0 ] && echo 0 || echo 1)
