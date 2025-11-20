#!/bin/bash

echo "====================================="
echo "     ENV LOADING FIX SCRIPT         "
echo "====================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Step 1: Clean the .env file (remove any Windows line endings)
echo -e "${YELLOW}Cleaning .env file...${NC}"
dos2unix .env 2>/dev/null || sed -i 's/\r$//' .env

# Step 2: Export all variables from .env
echo -e "${YELLOW}Loading environment variables...${NC}"
set -a
source .env
set +a

# Step 3: Verify critical variables are loaded
echo -e "${YELLOW}Verifying critical variables...${NC}"
missing=()
[ -z "$WEB_USERNAME" ] && missing+=("WEB_USERNAME")
[ -z "$WEB_PASSWORD" ] && missing+=("WEB_PASSWORD") 
[ -z "$POSTGRES_PASSWORD" ] && missing+=("POSTGRES_PASSWORD")
[ -z "$OPENAI_API_KEY" ] && missing+=("OPENAI_API_KEY")

if [ ${#missing[@]} -gt 0 ]; then
    echo -e "${RED}Missing variables: ${missing[*]}${NC}"
    exit 1
else
    echo -e "${GREEN}✓ All critical variables present${NC}"
    echo "  WEB_USERNAME: $WEB_USERNAME"
    echo "  WEB_PASSWORD: [SET]"
    echo "  POSTGRES_PASSWORD: [SET]"
    echo "  OPENAI_API_KEY: [SET]"
fi

# Step 4: Recreate containers with proper environment
echo -e "\n${YELLOW}Recreating services with environment...${NC}"

# Stop services that are failing
docker compose stop homelab-dashboard homelab-celery-worker discord-bot stream-bot

# Remove their containers to force recreation
docker compose rm -f homelab-dashboard homelab-celery-worker discord-bot stream-bot

# Start them with fresh environment
docker compose up -d homelab-dashboard homelab-celery-worker discord-bot stream-bot

# Wait for services to stabilize
sleep 5

# Step 5: Check if services are running
echo -e "\n${YELLOW}Checking service status...${NC}"
services=("homelab-dashboard" "homelab-celery-worker" "discord-bot" "stream-bot")
for service in "${services[@]}"; do
    if docker ps --format "{{.Names}}" | grep -q "^$service$"; then
        # Check if service is actually healthy (not just running)
        if docker logs "$service" --tail=10 2>&1 | grep -q "ERROR.*WEB_USERNAME"; then
            echo -e "$service: ${RED}● Running but still has errors${NC}"
        else
            echo -e "$service: ${GREEN}● Running${NC}"
        fi
    else
        echo -e "$service: ${RED}○ Stopped${NC}"
    fi
done

echo -e "\n${YELLOW}Testing database connection...${NC}"
if docker exec homelab-postgres pg_isready -U postgres; then
    echo -e "${GREEN}✓ PostgreSQL is ready${NC}"
    
    # Test if services can connect
    if docker exec homelab-postgres psql -U postgres -c "\l" | grep -q "homelab_jarvis"; then
        echo -e "${GREEN}✓ Databases exist${NC}"
    fi
else
    echo -e "${RED}✗ PostgreSQL not responding${NC}"
fi

echo -e "\n${GREEN}Fix completed!${NC}"
echo "Check full status with: ./homelab status"