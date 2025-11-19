#!/bin/bash
# Comprehensive Lifecycle Diagnostics and Auto-Fix
# Automatically detects and fixes common deployment issues

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}${BOLD}  🔍 HOMELAB LIFECYCLE DIAGNOSTICS${NC}"
echo -e "${BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

ISSUES_FOUND=0
ISSUES_FIXED=0

# ============================================
# Check 1: Database Migrations
# ============================================
echo -e "${BOLD}[1/6] Checking dashboard database migrations...${NC}"

if docker ps | grep -q homelab-dashboard; then
    # Check if migrations are needed
    MIGRATION_STATUS=$(docker exec homelab-dashboard alembic current 2>&1 || echo "error")
    
    if echo "$MIGRATION_STATUS" | grep -q "Can't locate revision"; then
        echo -e "  ${YELLOW}⚠ Database migrations not run${NC}"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
        
        echo -e "  ${BLUE}→ Running migrations...${NC}"
        if docker exec homelab-dashboard alembic upgrade head 2>&1; then
            echo -e "  ${GREEN}✓ Migrations completed${NC}"
            ISSUES_FIXED=$((ISSUES_FIXED + 1))
        else
            echo -e "  ${RED}✗ Migration failed${NC}"
        fi
    elif echo "$MIGRATION_STATUS" | grep -q "error"; then
        echo -e "  ${YELLOW}⚠ Cannot check migrations (database may not be available)${NC}"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    else
        echo -e "  ${GREEN}✓ Migrations up to date${NC}"
    fi
else
    echo -e "  ${YELLOW}⚠ Dashboard container not running${NC}"
fi

echo ""

# ============================================
# Check 2: Orphaned Containers
# ============================================
echo -e "${BOLD}[2/6] Checking for orphaned containers...${NC}"

ORPHANED_COUNT=$(docker ps -a -f "status=exited" --format "{{.Names}}" | wc -l)

if [ "$ORPHANED_COUNT" -gt 0 ]; then
    echo -e "  ${YELLOW}⚠ Found $ORPHANED_COUNT orphaned containers${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
    
    echo -e "  ${BLUE}→ Cleaning up...${NC}"
    docker container prune -f > /dev/null 2>&1
    echo -e "  ${GREEN}✓ Orphaned containers removed${NC}"
    ISSUES_FIXED=$((ISSUES_FIXED + 1))
else
    echo -e "  ${GREEN}✓ No orphaned containers${NC}"
fi

echo ""

# ============================================
# Check 3: Dangling Images
# ============================================
echo -e "${BOLD}[3/6] Checking for dangling images...${NC}"

DANGLING_COUNT=$(docker images -f "dangling=true" -q | wc -l)

if [ "$DANGLING_COUNT" -gt 0 ]; then
    echo -e "  ${YELLOW}⚠ Found $DANGLING_COUNT dangling images${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
    
    echo -e "  ${BLUE}→ Cleaning up...${NC}"
    docker image prune -f > /dev/null 2>&1
    echo -e "  ${GREEN}✓ Dangling images removed${NC}"
    ISSUES_FIXED=$((ISSUES_FIXED + 1))
else
    echo -e "  ${GREEN}✓ No dangling images${NC}"
fi

echo ""

# ============================================
# Check 4: Service Health
# ============================================
echo -e "${BOLD}[4/6] Checking service health...${NC}"

EXPECTED_SERVICES=15
RUNNING_SERVICES=$(docker ps --filter "name=homelab-dashboard|homelab-celery-worker|homelab-redis|homelab-minio|discord-bot|stream-bot|caddy|n8n|plex-server|vnc-desktop|code-server|scarletredjoker-web|rig-city-site|homeassistant|discord-bot-db" --format "{{.Names}}" | wc -l)

if [ "$RUNNING_SERVICES" -lt "$EXPECTED_SERVICES" ]; then
    echo -e "  ${YELLOW}⚠ Only $RUNNING_SERVICES/$EXPECTED_SERVICES services running${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
    
    # List missing services
    echo -e "  ${BLUE}→ Missing services:${NC}"
    for service in homelab-dashboard homelab-celery-worker homelab-redis homelab-minio discord-bot stream-bot caddy n8n plex-server vnc-desktop code-server scarletredjoker-web rig-city-site homeassistant discord-bot-db; do
        if ! docker ps --format "{{.Names}}" | grep -q "^${service}$"; then
            echo -e "    - $service"
        fi
    done
    
    echo -e "  ${BLUE}→ Run './homelab-manager.sh' and select option 4 to start missing services${NC}"
else
    echo -e "  ${GREEN}✓ All $EXPECTED_SERVICES services running${NC}"
fi

echo ""

# ============================================
# Check 5: Disk Space
# ============================================
echo -e "${BOLD}[5/6] Checking Docker disk usage...${NC}"

# Get Docker system disk usage
DOCKER_DISK=$(df -h /var/lib/docker 2>/dev/null | awk 'NR==2 {print $5}' | sed 's/%//')

if [ -n "$DOCKER_DISK" ] && [ "$DOCKER_DISK" -gt 80 ]; then
    echo -e "  ${YELLOW}⚠ Docker disk usage: ${DOCKER_DISK}% (high)${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
    
    echo -e "  ${BLUE}→ Running docker system prune...${NC}"
    docker system prune -f > /dev/null 2>&1
    echo -e "  ${GREEN}✓ Cleanup completed${NC}"
    ISSUES_FIXED=$((ISSUES_FIXED + 1))
elif [ -n "$DOCKER_DISK" ]; then
    echo -e "  ${GREEN}✓ Docker disk usage: ${DOCKER_DISK}% (healthy)${NC}"
else
    echo -e "  ${YELLOW}⚠ Could not check Docker disk usage${NC}"
fi

echo ""

# ============================================
# Check 6: Log File Sizes
# ============================================
echo -e "${BOLD}[6/6] Checking log file sizes...${NC}"

LARGE_LOGS=$(find ./services/*/logs -type f -size +100M 2>/dev/null | wc -l)

if [ "$LARGE_LOGS" -gt 0 ]; then
    echo -e "  ${YELLOW}⚠ Found $LARGE_LOGS large log files (>100MB)${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
    
    echo -e "  ${BLUE}→ Rotating large logs...${NC}"
    find ./services/*/logs -type f -size +100M -exec sh -c 'mv "$1" "$1.old" && touch "$1"' _ {} \; 2>/dev/null
    echo -e "  ${GREEN}✓ Large logs rotated${NC}"
    ISSUES_FIXED=$((ISSUES_FIXED + 1))
else
    echo -e "  ${GREEN}✓ No large log files${NC}"
fi

echo ""

# ============================================
# Summary
# ============================================
echo -e "${BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}DIAGNOSTIC SUMMARY${NC}"
echo -e "${BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ "$ISSUES_FOUND" -eq 0 ]; then
    echo -e "${GREEN}${BOLD}✓ No issues found - System healthy!${NC}"
elif [ "$ISSUES_FIXED" -eq "$ISSUES_FOUND" ]; then
    echo -e "${GREEN}${BOLD}✓ All $ISSUES_FOUND issues automatically fixed!${NC}"
else
    echo -e "${YELLOW}${BOLD}⚠ Found $ISSUES_FOUND issues, fixed $ISSUES_FIXED${NC}"
fi

echo ""
