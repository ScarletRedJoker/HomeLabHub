#!/bin/bash
# Emergency Diagnostic and Fix Script
# Diagnoses PostgreSQL restart loop and fixes all deployment issues

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║        🔍 EMERGENCY DIAGNOSTIC & FIX 🔧                   ║"
echo "║                                                              ║"
╚══════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Check PostgreSQL logs
echo -e "${BOLD}STEP 1: Checking PostgreSQL logs...${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker logs homelab-postgres --tail 100 2>&1 | tee postgres-error.log
echo ""
echo -e "${YELLOW}PostgreSQL logs saved to: postgres-error.log${NC}"
echo ""

# Step 2: Check if it's a permissions issue
echo -e "${BOLD}STEP 2: Checking for common issues...${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if data directory has issues
echo -n "Checking PostgreSQL data directory... "
if docker inspect homelab-postgres --format='{{.Mounts}}' 2>/dev/null | grep -q "pgdata"; then
    echo -e "${GREEN}✓ Volume mounted${NC}"
else
    echo -e "${RED}✗ Volume issue detected${NC}"
fi

# Check if there are conflicting processes
echo -n "Checking for port conflicts... "
if ss -tlnp 2>/dev/null | grep -q ":5432"; then
    echo -e "${YELLOW}⚠ Port 5432 may be in use${NC}"
    ss -tlnp | grep :5432
else
    echo -e "${GREEN}✓ Port 5432 available${NC}"
fi

echo ""

# Step 3: Try to restart PostgreSQL cleanly
echo -e "${BOLD}STEP 3: Attempting clean PostgreSQL restart...${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Stopping PostgreSQL container..."
docker stop homelab-postgres 2>/dev/null || true

echo "Waiting 5 seconds..."
sleep 5

echo "Starting PostgreSQL container..."
docker start homelab-postgres

echo "Waiting for PostgreSQL to initialize (10 seconds)..."
sleep 10

# Check if it's running
if docker ps --filter "name=homelab-postgres" --filter "status=running" | grep -q "homelab-postgres"; then
    echo -e "${GREEN}✓ PostgreSQL is now running${NC}"
    
    # Test connection
    echo -n "Testing database connection... "
    if docker exec homelab-postgres psql -U postgres -c "SELECT version();" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Connection successful (user: postgres)${NC}"
    elif docker exec homelab-postgres psql -U ticketbot -c "SELECT version();" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Connection successful (user: ticketbot)${NC}"
        echo -e "${YELLOW}⚠ Need to create postgres superuser${NC}"
    else
        echo -e "${RED}✗ Connection failed${NC}"
    fi
else
    echo -e "${RED}✗ PostgreSQL still not running${NC}"
    echo ""
    echo "Checking logs again..."
    docker logs homelab-postgres --tail 30
fi

echo ""

# Step 4: Start missing services
echo -e "${BOLD}STEP 4: Starting missing services...${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

MISSING_SERVICES=()

# Check each critical service
for SERVICE in homelab-dashboard discord-bot stream-bot homelab-celery-worker; do
    if ! docker ps --filter "name=$SERVICE" --filter "status=running" | grep -q "$SERVICE"; then
        MISSING_SERVICES+=("$SERVICE")
    fi
done

if [ ${#MISSING_SERVICES[@]} -eq 0 ]; then
    echo -e "${GREEN}✓ All critical services are running${NC}"
else
    echo "Missing services: ${MISSING_SERVICES[@]}"
    echo ""
    echo "Starting missing services..."
    docker compose -f docker-compose.unified.yml up -d "${MISSING_SERVICES[@]}"
    
    echo "Waiting 10 seconds for services to start..."
    sleep 10
fi

echo ""

# Step 5: Fix VNC/Code-Server health
echo -e "${BOLD}STEP 5: Fixing unhealthy services...${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Fix VNC password
if docker ps --filter "name=vnc-desktop" --filter "status=running" | grep -q "vnc-desktop"; then
    echo "Configuring VNC password..."
    docker exec vnc-desktop /usr/local/bin/fix-vnc-password.sh 2>/dev/null || echo "VNC password script not available"
    docker restart vnc-desktop
    echo -e "${GREEN}✓ VNC restarted${NC}"
fi

# Restart code-server
if docker ps --filter "name=code-server" | grep -q "code-server"; then
    echo "Restarting code-server..."
    docker restart code-server
    echo -e "${GREEN}✓ Code-server restarted${NC}"
fi

echo ""

# Step 6: Final status check
echo -e "${BOLD}STEP 6: Final Status Check${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Container Status:"
docker ps --format "table {{.Names}}\t{{.Status}}" --filter "name=homelab-|discord-bot|stream-bot|caddy|plex|n8n|vnc|code-server|homeassistant|rig-city|scarletredjoker"

echo ""
RUNNING_COUNT=$(docker ps --filter "name=homelab-|discord-bot|stream-bot|caddy|plex|n8n|vnc|code-server|homeassistant|rig-city|scarletredjoker" --format "{{.Names}}" | wc -l)
echo -e "${BOLD}Running containers: $RUNNING_COUNT/15${NC}"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║        ✅ DIAGNOSTIC COMPLETE                               ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

if [ $RUNNING_COUNT -eq 15 ]; then
    echo -e "${GREEN}✓ All services are running!${NC}"
    echo ""
    echo "Next step: Run full verification"
    echo "  ./homelab-manager.sh → Option 23"
else
    echo -e "${YELLOW}⚠ Some services still not running ($RUNNING_COUNT/15)${NC}"
    echo ""
    echo "Check logs for failed services:"
    echo "  docker logs <container-name>"
    echo ""
    echo "PostgreSQL errors saved to: postgres-error.log"
fi

echo ""
