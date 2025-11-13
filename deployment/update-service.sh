#!/bin/bash
set -e

# Service Update Script
# Updates Docker containers by pulling latest images and recreating containers
# Usage: ./update-service.sh <service-name>
# Example: ./update-service.sh n8n

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.unified.yml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if service name is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: Service name required${NC}"
    echo "Usage: $0 <service-name>"
    echo ""
    echo "Available services:"
    docker compose -f "$COMPOSE_FILE" config --services 2>/dev/null | sort
    exit 1
fi

SERVICE_NAME="$1"

# Verify service exists in docker-compose
if ! docker compose -f "$COMPOSE_FILE" config --services 2>/dev/null | grep -q "^${SERVICE_NAME}$"; then
    echo -e "${RED}Error: Service '$SERVICE_NAME' not found in docker-compose.yml${NC}"
    echo ""
    echo "Available services:"
    docker compose -f "$COMPOSE_FILE" config --services 2>/dev/null | sort
    exit 1
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Service Update: $SERVICE_NAME${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Get current image info
CURRENT_IMAGE=$(docker inspect "$SERVICE_NAME" --format='{{.Config.Image}}' 2>/dev/null || echo "not running")
echo -e "${YELLOW}Current image: $CURRENT_IMAGE${NC}"
echo ""

# Pull latest image
echo -e "${BLUE}Step 1: Pulling latest image...${NC}"
docker compose -f "$COMPOSE_FILE" pull "$SERVICE_NAME"
echo ""

# Stop and remove old container
echo -e "${BLUE}Step 2: Stopping service...${NC}"
docker compose -f "$COMPOSE_FILE" stop "$SERVICE_NAME"
docker compose -f "$COMPOSE_FILE" rm -f "$SERVICE_NAME"
echo ""

# Start with new image
echo -e "${BLUE}Step 3: Starting updated service...${NC}"
docker compose -f "$COMPOSE_FILE" up -d "$SERVICE_NAME"
echo ""

# Wait for container to start
sleep 3

# Check status
echo -e "${BLUE}Step 4: Verifying status...${NC}"
if docker ps --format '{{.Names}}' | grep -q "^${SERVICE_NAME}$"; then
    NEW_IMAGE=$(docker inspect "$SERVICE_NAME" --format='{{.Config.Image}}')
    STATUS=$(docker inspect "$SERVICE_NAME" --format='{{.State.Status}}')
    
    echo -e "${GREEN}✓ Service updated successfully!${NC}"
    echo -e "  Status: ${GREEN}$STATUS${NC}"
    echo -e "  Image: $NEW_IMAGE"
    
    # Show recent logs
    echo ""
    echo -e "${BLUE}Recent logs:${NC}"
    docker logs "$SERVICE_NAME" --tail 20
else
    echo -e "${RED}✗ Service failed to start${NC}"
    echo ""
    echo -e "${YELLOW}Logs:${NC}"
    docker logs "$SERVICE_NAME" --tail 50
    exit 1
fi

echo ""
echo -e "${GREEN}Update complete!${NC}"
