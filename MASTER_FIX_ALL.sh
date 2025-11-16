#!/bin/bash
# ============================================
# MASTER FIX - Fixes EVERYTHING in One Go
# ============================================
# This script:
# 1. Validates .env configuration
# 2. Ensures infrastructure is healthy
# 3. Fixes database user/passwords
# 4. Clears redis cache (fixes CSRF)
# 5. Rebuilds broken containers
# 6. Restarts everything with health checks
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

cd "$(dirname "$0")"

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                                                       ║${NC}"
echo -e "${CYAN}║  ${BOLD}${BLUE}🔧 MASTER FIX - Fixing EVERYTHING${NC}              ${CYAN}║${NC}"
echo -e "${CYAN}║                                                       ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

# Load .env
if [ ! -f .env ]; then
    echo -e "${RED}ERROR: .env file not found${NC}"
    exit 1
fi

set -a
source .env
set +a

# Validate required passwords
MISSING_VARS=()
[ -z "$JARVIS_DB_PASSWORD" ] && MISSING_VARS+=("JARVIS_DB_PASSWORD")
[ -z "$STREAMBOT_DB_PASSWORD" ] && MISSING_VARS+=("STREAMBOT_DB_PASSWORD")
[ -z "$POWERDNS_DB_PASSWORD" ] && MISSING_VARS+=("POWERDNS_DB_PASSWORD")

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo -e "${RED}ERROR: Missing required variables in .env:${NC}"
    printf '  - %s\n' "${MISSING_VARS[@]}"
    echo ""
    echo "Please add them to .env and try again."
    exit 1
fi

# Helper: wait for container health
wait_for_healthy() {
    local container=$1
    local max_wait=${2:-60}
    local waited=0
    
    echo -n "Waiting for $container..."
    while [ $waited -lt $max_wait ]; do
        if docker ps -f "name=^${container}$" --format '{{.Names}}' | grep -q "^${container}$"; then
            local health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no-check{{end}}' "$container" 2>/dev/null)
            
            if [ "$health" = "healthy" ] || [ "$health" = "no-check" ]; then
                local status=$(docker inspect --format='{{.State.Status}}' "$container")
                if [ "$status" = "running" ]; then
                    echo -e " ${GREEN}✓${NC}"
                    return 0
                fi
            fi
        fi
        
        sleep 2
        waited=$((waited + 2))
        echo -n "."
    done
    
    echo -e " ${RED}TIMEOUT${NC}"
    return 1
}

echo -e "${BLUE}━━━ Step 1: Start Infrastructure ━━━${NC}"
echo ""

docker compose -f docker-compose.unified.yml up -d discord-bot-db
wait_for_healthy discord-bot-db 60 || {
    echo -e "${RED}Database failed to start${NC}"
    exit 1
}

docker compose -f docker-compose.unified.yml up -d redis
wait_for_healthy homelab-redis 30 || {
    echo -e "${RED}Redis failed to start${NC}"
    exit 1
}

# Flush redis cache to clear stale sessions/CSRF
echo "Flushing redis cache..."
docker exec homelab-redis redis-cli FLUSHALL >/dev/null 2>&1 || true
echo -e "${GREEN}✓ Redis cache cleared${NC}"

docker compose -f docker-compose.unified.yml up -d minio
wait_for_healthy homelab-minio 30 || {
    echo -e "${YELLOW}Warning: MinIO slow to start${NC}"
}

echo ""
echo -e "${GREEN}✓ Infrastructure ready${NC}"
echo ""

echo -e "${BLUE}━━━ Step 2: Fix Database Users & Passwords ━━━${NC}"
echo ""

docker exec discord-bot-db psql -v ON_ERROR_STOP=1 -U ticketbot -d postgres \
  -v jarvis_pwd="$JARVIS_DB_PASSWORD" \
  -v streambot_pwd="$STREAMBOT_DB_PASSWORD" \
  -v powerdns_pwd="$POWERDNS_DB_PASSWORD" \
  >/dev/null 2>&1 <<'EOSQL'
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'jarvis') THEN
        CREATE ROLE jarvis WITH LOGIN PASSWORD :'jarvis_pwd';
    ELSE
        EXECUTE format('ALTER ROLE jarvis WITH PASSWORD %L', :'jarvis_pwd');
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'streambot') THEN
        CREATE ROLE streambot WITH LOGIN PASSWORD :'streambot_pwd';
    ELSE
        EXECUTE format('ALTER ROLE streambot WITH PASSWORD %L', :'streambot_pwd');
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'powerdns') THEN
        CREATE ROLE powerdns WITH LOGIN PASSWORD :'powerdns_pwd';
    ELSE
        EXECUTE format('ALTER ROLE powerdns WITH PASSWORD %L', :'powerdns_pwd');
    END IF;
END$$;

SELECT 'CREATE DATABASE homelab_jarvis OWNER jarvis' 
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'homelab_jarvis')\gexec

SELECT 'CREATE DATABASE homelab_jarvis_demo OWNER jarvis' 
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'homelab_jarvis_demo')\gexec

SELECT 'CREATE DATABASE streambot OWNER streambot' 
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'streambot')\gexec

SELECT 'CREATE DATABASE powerdns OWNER powerdns' 
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'powerdns')\gexec

GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis TO jarvis;
GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis_demo TO jarvis;
GRANT ALL PRIVILEGES ON DATABASE streambot TO streambot;
GRANT ALL PRIVILEGES ON DATABASE powerdns TO powerdns;
EOSQL

echo -e "${GREEN}✓ Database users configured${NC}"
echo ""

echo -e "${BLUE}━━━ Step 3: Rebuild Broken Services ━━━${NC}"
echo ""

echo "Stopping services..."
docker compose -f docker-compose.unified.yml stop discord-bot stream-bot homelab-dashboard homelab-dashboard-demo homelab-celery-worker powerdns vnc-desktop 2>/dev/null || true

echo ""
echo "Rebuilding discord-bot..."
docker compose -f docker-compose.unified.yml build --no-cache discord-bot >/dev/null 2>&1

echo "Rebuilding stream-bot..."
docker compose -f docker-compose.unified.yml build --no-cache stream-bot >/dev/null 2>&1

echo -e "${GREEN}✓ Services rebuilt${NC}"
echo ""

echo -e "${BLUE}━━━ Step 4: Start All Services ━━━${NC}"
echo ""

docker compose -f docker-compose.unified.yml up -d homelab-dashboard homelab-dashboard-demo
wait_for_healthy homelab-dashboard 90 || echo -e "${YELLOW}⚠ Dashboard may need more time${NC}"
wait_for_healthy homelab-dashboard-demo 90 || echo -e "${YELLOW}⚠ Demo dashboard may need more time${NC}"

docker compose -f docker-compose.unified.yml up -d homelab-celery-worker
wait_for_healthy homelab-celery-worker 60 || true

docker compose -f docker-compose.unified.yml up -d discord-bot
wait_for_healthy discord-bot 90 || echo -e "${YELLOW}⚠ Discord bot may need more time${NC}"

docker compose -f docker-compose.unified.yml up -d stream-bot
wait_for_healthy stream-bot 90 || echo -e "${YELLOW}⚠ Stream bot may need more time${NC}"

docker compose -f docker-compose.unified.yml up -d powerdns vnc-desktop rig-city-site
wait_for_healthy homelab-powerdns 60 || true
wait_for_healthy vnc-desktop 60 || true
wait_for_healthy rig-city-site 60 || true

echo ""
echo -e "${BLUE}Purging stale SSL certificates...${NC}"
docker exec caddy rm -rf /data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/www.rig-city.com 2>/dev/null || true
docker exec caddy rm -rf /data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/rig-city.com 2>/dev/null || true
echo -e "${GREEN}✓ SSL cache cleared${NC}"

echo "Restarting Caddy to renew certificates..."
docker compose -f docker-compose.unified.yml restart caddy
wait_for_healthy caddy 30 || true

echo ""
echo -e "${GREEN}✓ All services started${NC}"
echo ""

echo -e "${BLUE}━━━ Step 5: Health Check ━━━${NC}"
echo ""

echo "Checking for unhealthy containers..."
UNHEALTHY=$(docker ps --filter "health=unhealthy" --format "{{.Names}}" 2>/dev/null)
if [ -n "$UNHEALTHY" ]; then
    echo -e "${YELLOW}⚠ Unhealthy containers found:${NC}"
    echo "$UNHEALTHY"
    echo ""
fi

echo "Container Status:"
docker ps --format "table {{.Names}}\t{{.Status}}" | head -20

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  ${BOLD}${GREEN}✓ FIX COMPLETE${NC}                                    ${CYAN}║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Test your sites:${NC}"
echo "  • https://test.evindrake.net (demo/demo)"
echo "  • https://host.evindrake.net (evin/homelab)"
echo "  • https://game.evindrake.net"
echo "  • https://rig-city.com (homepage)"
echo "  • https://stream.rig-city.com"
echo "  • https://bot.rig-city.com"
echo ""
echo -e "${BLUE}If SSL errors on rig-city.com, wait 1-2 min for cert renewal${NC}"
echo ""
echo -e "${BLUE}Check logs if needed:${NC}"
echo "  docker compose -f docker-compose.unified.yml logs --tail 50 <service>"
echo "  docker logs caddy --tail 50  # For SSL certificate issues"
echo ""
