#!/bin/bash
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}Code-Server WebSocket Fix Script${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Configuration
PROJECT_DIR="/home/evin/contain/HomeLabHub"
CODE_SERVER_VOLUME="$PROJECT_DIR/volumes/code-server"
CODE_SERVER_CONFIG="$PROJECT_DIR/config/code-server"
SERVICE_USER="evin"
USER_UID=1000
USER_GID=1000

cd "$PROJECT_DIR" || {
    echo -e "${RED}Error: Cannot find project directory: $PROJECT_DIR${NC}"
    exit 1
}

echo -e "${YELLOW}Step 1: Stopping code-server container...${NC}"
docker-compose -f docker-compose.unified.yml stop code-server 2>/dev/null || echo "Container not running"
sleep 2

echo -e "${YELLOW}Step 2: Removing code-server container...${NC}"
docker-compose -f docker-compose.unified.yml rm -f code-server 2>/dev/null || echo "Container already removed"
sleep 1

echo -e "${YELLOW}Step 3: Fixing volume permissions...${NC}"

# Create directories if they don't exist
mkdir -p "$CODE_SERVER_VOLUME"
mkdir -p "$CODE_SERVER_CONFIG"

# Fix ownership recursively
echo "Fixing ownership of $CODE_SERVER_VOLUME..."
sudo chown -R ${USER_UID}:${USER_GID} "$CODE_SERVER_VOLUME"

echo "Fixing ownership of $CODE_SERVER_CONFIG..."
sudo chown -R ${USER_UID}:${USER_GID} "$CODE_SERVER_CONFIG"

# Fix permissions
echo "Fixing permissions..."
sudo chmod -R 755 "$CODE_SERVER_VOLUME"
sudo chmod -R 755 "$CODE_SERVER_CONFIG"

# Ensure write permissions for the user
sudo chmod -R u+rwX "$CODE_SERVER_VOLUME"
sudo chmod -R u+rwX "$CODE_SERVER_CONFIG"

echo -e "${GREEN}✓ Permissions fixed!${NC}"

echo -e "${YELLOW}Step 4: Verifying permissions...${NC}"
echo "Volumes/code-server:"
ls -la "$CODE_SERVER_VOLUME"
echo ""
echo "Config/code-server:"
ls -la "$CODE_SERVER_CONFIG"
echo ""

echo -e "${YELLOW}Step 5: Starting code-server with new configuration...${NC}"
docker-compose -f docker-compose.unified.yml up -d code-server

echo -e "${YELLOW}Step 6: Waiting for code-server to start...${NC}"
sleep 10

echo -e "${YELLOW}Step 7: Checking code-server health...${NC}"
if docker ps | grep -q code-server; then
    echo -e "${GREEN}✓ Code-server container is running!${NC}"
else
    echo -e "${RED}✗ Code-server container is not running!${NC}"
    echo "Checking logs..."
    docker logs code-server --tail 50
    exit 1
fi

echo -e "${YELLOW}Step 8: Checking logs for errors...${NC}"
echo "Last 30 lines of code-server logs:"
docker logs code-server --tail 30

echo ""
echo -e "${YELLOW}Step 9: Testing healthcheck endpoint...${NC}"
sleep 5
if docker exec code-server curl -f http://localhost:8080/healthz 2>/dev/null; then
    echo -e "${GREEN}✓ Healthcheck endpoint is responding!${NC}"
else
    echo -e "${YELLOW}⚠ Healthcheck endpoint not responding yet (may need more time)${NC}"
fi

echo ""
echo -e "${YELLOW}Step 10: Restarting Caddy to reload configuration...${NC}"
docker-compose -f docker-compose.unified.yml restart caddy

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}Code-Server Fix Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "1. Visit https://code.evindrake.net in your browser"
echo "2. Verify the IDE loads without WebSocket errors"
echo "3. Open a workspace and test file editing"
echo "4. Check that changes persist after container restart"
echo ""
echo -e "${BLUE}Monitoring Commands:${NC}"
echo "  - View logs: docker logs -f code-server"
echo "  - Check status: docker ps | grep code-server"
echo "  - Restart: docker-compose -f docker-compose.unified.yml restart code-server"
echo ""
echo -e "${YELLOW}If issues persist, check:${NC}"
echo "  - Caddy logs: docker logs caddy | grep code-server"
echo "  - Code-server logs: docker logs code-server"
echo "  - Permissions: ls -la $CODE_SERVER_VOLUME"
echo ""
