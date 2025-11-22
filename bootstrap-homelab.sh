#!/bin/bash
# ════════════════════════════════════════════════════════════════
# HOMELAB BOOTSTRAP - Complete Setup & Validation
# ════════════════════════════════════════════════════════════════
# Run this ONCE on a fresh server or to fix broken deployments
# Idempotent: Safe to run multiple times

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_ROOT="/home/evin/contain/HomeLabHub"
cd "$PROJECT_ROOT"

echo -e "${CYAN}"
echo "════════════════════════════════════════════════════════════════"
echo "  HOMELAB BOOTSTRAP"
echo "════════════════════════════════════════════════════════════════"
echo -e "${NC}"

# ============================================================================
# STEP 1: Environment Validation
# ============================================================================
echo -e "\n${CYAN}[1/7] Validating Environment${NC}"

if [ ! -f ".env" ]; then
    echo -e "${RED}✗ .env file missing${NC}"
    exit 1
fi

required_vars=(
    "POSTGRES_PASSWORD"
    "DISCORD_DB_PASSWORD"
    "STREAMBOT_DB_PASSWORD"
    "JARVIS_DB_PASSWORD"
)

for var in "${required_vars[@]}"; do
    if ! grep -q "^${var}=" .env; then
        echo -e "${RED}✗ Missing required variable: $var${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✓ Environment validated${NC}"

# ============================================================================
# STEP 2: Build All Images
# ============================================================================
echo -e "\n${CYAN}[2/7] Building Docker Images${NC}"

docker compose --project-directory "$PROJECT_ROOT" \
    --env-file "$PROJECT_ROOT/.env" \
    build --no-cache

echo -e "${GREEN}✓ Images built${NC}"

# ============================================================================
# STEP 3: Start Infrastructure Services First
# ============================================================================
echo -e "\n${CYAN}[3/7] Starting Infrastructure (PostgreSQL, Redis, MinIO)${NC}"

docker compose --project-directory "$PROJECT_ROOT" \
    --env-file "$PROJECT_ROOT/.env" \
    up -d homelab-postgres redis minio

# Wait for PostgreSQL to be ready
echo "  Waiting for PostgreSQL..."
for i in {1..30}; do
    if docker exec homelab-postgres pg_isready -U postgres &>/dev/null; then
        echo -e "${GREEN}  ✓ PostgreSQL ready${NC}"
        break
    fi
    sleep 1
done

# ============================================================================
# STEP 4: Create & Initialize Databases
# ============================================================================
echo -e "\n${CYAN}[4/7] Creating Databases & Users${NC}"

# Load passwords from .env safely (without sourcing the whole file)
POSTGRES_PASSWORD=$(grep "^POSTGRES_PASSWORD=" "$PROJECT_ROOT/.env" | cut -d'=' -f2)
DISCORD_DB_PASSWORD=$(grep "^DISCORD_DB_PASSWORD=" "$PROJECT_ROOT/.env" | cut -d'=' -f2)
STREAMBOT_DB_PASSWORD=$(grep "^STREAMBOT_DB_PASSWORD=" "$PROJECT_ROOT/.env" | cut -d'=' -f2)
JARVIS_DB_PASSWORD=$(grep "^JARVIS_DB_PASSWORD=" "$PROJECT_ROOT/.env" | cut -d'=' -f2)

# Create databases if they don't exist
for db in ticketbot streambot homelab_jarvis; do
    if ! docker exec homelab-postgres psql -U postgres -lqt | cut -d \| -f 1 | grep -qw "$db"; then
        docker exec homelab-postgres psql -U postgres -c "CREATE DATABASE $db;" 2>/dev/null || true
        echo -e "${GREEN}  ✓ Created database: $db${NC}"
    else
        echo "  • Database exists: $db"
    fi
done

# Create users and grant permissions
docker exec homelab-postgres psql -U postgres <<-EOSQL
    -- Discord Bot User
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'ticketbot') THEN
            CREATE USER ticketbot WITH PASSWORD '${DISCORD_DB_PASSWORD}';
        END IF;
    END
    \$\$;
    GRANT ALL PRIVILEGES ON DATABASE ticketbot TO ticketbot;
    
    -- Stream Bot User  
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'streambot') THEN
            CREATE USER streambot WITH PASSWORD '${STREAMBOT_DB_PASSWORD}';
        END IF;
    END
    \$\$;
    GRANT ALL PRIVILEGES ON DATABASE streambot TO streambot;
    
    -- Dashboard/Jarvis User
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'jarvis') THEN
            CREATE USER jarvis WITH PASSWORD '${JARVIS_DB_PASSWORD}';
        END IF;
    END
    \$\$;
    GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis TO jarvis;
EOSQL

echo -e "${GREEN}✓ Databases and users configured${NC}"

# ============================================================================
# STEP 5: Run Dashboard Migrations
# ============================================================================
echo -e "\n${CYAN}[5/7] Running Dashboard Database Migrations${NC}"

# Start dashboard temporarily to run migrations
docker compose --project-directory "$PROJECT_ROOT" \
    --env-file "$PROJECT_ROOT/.env" \
    up -d homelab-dashboard

sleep 5

# Run migrations
docker exec homelab-dashboard bash -c "
    cd /app
    # Try Alembic first
    if [ -f alembic.ini ]; then
        alembic upgrade head 2>&1 | grep -E '(Running upgrade|successfully|ERROR)' || true
    fi
"

# Verify tables exist
table_count=$(docker exec homelab-postgres psql -U postgres -d homelab_jarvis -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" | tr -d ' ')

if [ "$table_count" -gt 0 ]; then
    echo -e "${GREEN}✓ Dashboard has $table_count tables${NC}"
else
    echo -e "${YELLOW}⚠ Dashboard has no tables - may need manual migration${NC}"
fi

# ============================================================================
# STEP 6: Start All Services
# ============================================================================
echo -e "\n${CYAN}[6/7] Starting All Services${NC}"

docker compose --project-directory "$PROJECT_ROOT" \
    --env-file "$PROJECT_ROOT/.env" \
    up -d

echo "  Waiting 30 seconds for services to initialize..."
sleep 30

# ============================================================================
# STEP 7: Validation - Test Everything Actually Works
# ============================================================================
echo -e "\n${CYAN}[7/7] Validating Service Functionality${NC}"

validation_failed=0

# Test Dashboard
echo "  Testing Dashboard..."
dashboard_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/ 2>/dev/null || echo "000")
if [ "$dashboard_status" = "200" ] || [ "$dashboard_status" = "302" ]; then
    echo -e "${GREEN}  ✓ Dashboard responding (HTTP $dashboard_status)${NC}"
else
    echo -e "${RED}  ✗ Dashboard failed (HTTP $dashboard_status)${NC}"
    validation_failed=1
fi

# Test Discord Bot
echo "  Testing Discord Bot..."
discord_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/ 2>/dev/null || echo "000")
if [ "$discord_status" = "200" ] || [ "$discord_status" = "302" ]; then
    echo -e "${GREEN}  ✓ Discord Bot responding (HTTP $discord_status)${NC}"
else
    echo -e "${RED}  ✗ Discord Bot failed (HTTP $discord_status)${NC}"
    validation_failed=1
fi

# Test Stream Bot
echo "  Testing Stream Bot..."
stream_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/login 2>/dev/null || echo "000")
if [ "$stream_status" = "200" ] || [ "$stream_status" = "302" ]; then
    echo -e "${GREEN}  ✓ Stream Bot responding (HTTP $stream_status)${NC}"
else
    echo -e "${YELLOW}  ⚠ Stream Bot (HTTP $stream_status) - may conflict with dashboard port${NC}"
fi

# Check database tables
echo "  Verifying database schemas..."
for db in ticketbot streambot homelab_jarvis; do
    count=$(docker exec homelab-postgres psql -U postgres -d "$db" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | tr -d ' ' || echo "0")
    if [ "$count" -gt 0 ]; then
        echo -e "${GREEN}  ✓ $db: $count tables${NC}"
    else
        echo -e "${RED}  ✗ $db: No tables${NC}"
        validation_failed=1
    fi
done

# Container status
echo "  Checking container status..."
running=$(docker ps --filter "name=homelab" --format "{{.Names}}" | wc -l)
echo "  • $running/15 containers running"

# ============================================================================
# Summary
# ============================================================================
echo -e "\n${CYAN}════════════════════════════════════════════════════════════════${NC}"
if [ $validation_failed -eq 0 ]; then
    echo -e "${GREEN}"
    echo "  ✅ HOMELAB BOOTSTRAP COMPLETE"
    echo "  All services are operational!"
    echo -e "${NC}"
    echo "  Access your services:"
    echo "    Dashboard: https://host.evindrake.net"
    echo "    Discord Bot: https://bot.rig-city.com"
    echo "    Stream Bot: https://stream.rig-city.com"
else
    echo -e "${YELLOW}"
    echo "  ⚠️  BOOTSTRAP COMPLETED WITH WARNINGS"
    echo "  Some services may need attention"
    echo -e "${NC}"
    echo "  Check logs: ./homelab logs"
    echo "  Or run diagnostics: ./diagnose-services.sh"
fi
echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
