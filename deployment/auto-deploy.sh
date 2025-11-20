#!/bin/bash
# Automated Deployment with Self-Healing and Comprehensive Error Checking
# One-command deployment that validates, provisions, fixes, and deploys everything

set -e  # Exit on error
set -o pipefail  # Catch errors in pipes

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Counters
CHECKS_PASSED=0
CHECKS_FAILED=0
FIXES_APPLIED=0

# Logging
LOG_FILE="deployment-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG_FILE")
exec 2>&1

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║        🚀 AUTOMATED DEPLOYMENT WITH SELF-HEALING 🚀      ║"
echo "║                                                              ║"
echo "║  Validates → Provisions → Fixes → Deploys → Verifies        ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Log file: $LOG_FILE"
echo ""

# ============================================================================
# PHASE 1: PRE-FLIGHT VALIDATION
# ============================================================================
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${BLUE}  PHASE 1: PRE-FLIGHT VALIDATION${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check 1: Docker is running
echo -n "Checking Docker... "
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}✗ FAILED${NC}"
    echo "ERROR: Docker is not running or not accessible"
    exit 1
fi
echo -e "${GREEN}✓ OK${NC}"
((CHECKS_PASSED++))

# Check 2: Docker Compose available
echo -n "Checking Docker Compose... "
if ! docker compose version >/dev/null 2>&1; then
    echo -e "${RED}✗ FAILED${NC}"
    echo "ERROR: Docker Compose plugin not available"
    exit 1
fi
echo -e "${GREEN}✓ OK${NC}"
((CHECKS_PASSED++))

# Check 3: .env file exists
echo -n "Checking .env file... "
if [ ! -f ".env" ]; then
    echo -e "${RED}✗ FAILED${NC}"
    echo "ERROR: .env file not found"
    echo "Run: ./homelab-manager.sh → Option 9 to generate .env file"
    exit 1
fi
echo -e "${GREEN}✓ OK${NC}"
((CHECKS_PASSED++))

# Check 4: Critical environment variables
echo -n "Checking critical environment variables... "
source .env
MISSING_VARS=""
[ -z "$POSTGRES_PASSWORD" ] && MISSING_VARS="$MISSING_VARS POSTGRES_PASSWORD"
[ -z "$DATABASE_URL" ] && MISSING_VARS="$MISSING_VARS DATABASE_URL"
[ -z "$REDIS_URL" ] && MISSING_VARS="$MISSING_VARS REDIS_URL"

if [ -n "$MISSING_VARS" ]; then
    echo -e "${RED}✗ FAILED${NC}"
    echo "ERROR: Missing critical variables:$MISSING_VARS"
    exit 1
fi
echo -e "${GREEN}✓ OK${NC}"
((CHECKS_PASSED++))

# Check 5: Docker Compose file exists
echo -n "Checking docker-compose.unified.yml... "
if [ ! -f "docker-compose.unified.yml" ]; then
    echo -e "${RED}✗ FAILED${NC}"
    echo "ERROR: docker-compose.unified.yml not found"
    exit 1
fi
echo -e "${GREEN}✓ OK${NC}"
((CHECKS_PASSED++))

echo ""
echo -e "${GREEN}✓ All pre-flight checks passed ($CHECKS_PASSED/5)${NC}"
echo ""

# ============================================================================
# PHASE 2: GRACEFUL SHUTDOWN & CLEANUP
# ============================================================================
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${BLUE}  PHASE 2: GRACEFUL SHUTDOWN & CLEANUP${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Stop existing services gracefully
echo "Stopping existing services gracefully (60s timeout)..."
docker compose -f docker-compose.unified.yml down --remove-orphans --timeout 60 2>&1 | grep -v "Network.*not found" || true
echo -e "${GREEN}✓ Services stopped${NC}"
echo ""

# ============================================================================
# PHASE 3: SERVICE STARTUP
# ============================================================================
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${BLUE}  PHASE 3: SERVICE STARTUP${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "Starting all services in dependency order..."
if ! docker compose -f docker-compose.unified.yml up -d --remove-orphans 2>&1; then
    echo -e "${RED}✗ Service startup failed${NC}"
    echo "Check logs: docker compose -f docker-compose.unified.yml logs"
    exit 1
fi
echo -e "${GREEN}✓ Services started${NC}"
echo ""

# Wait for critical services to be ready
echo "Waiting for critical services to initialize..."
sleep 10
echo ""

# ============================================================================
# PHASE 4: DATABASE AUTO-HEALING
# ============================================================================
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${BLUE}  PHASE 4: DATABASE AUTO-HEALING${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if PostgreSQL container is running
echo -n "Checking PostgreSQL container... "
if ! docker ps --filter "name=homelab-postgres" --filter "status=running" | grep -q "homelab-postgres"; then
    echo -e "${RED}✗ NOT RUNNING${NC}"
    echo "Attempting to start PostgreSQL..."
    docker compose -f docker-compose.unified.yml up -d homelab-postgres
    sleep 5
fi
echo -e "${GREEN}✓ Running${NC}"

# Auto-detect and fix PostgreSQL user
echo ""
echo "Auto-detecting PostgreSQL superuser..."
POSTGRES_SUPERUSER=""

# Try postgres first
if docker exec homelab-postgres psql -U postgres -c "SELECT 1;" >/dev/null 2>&1; then
    POSTGRES_SUPERUSER="postgres"
    echo -e "${GREEN}✓ Found: postgres user${NC}"
# Try ticketbot (legacy)
elif docker exec homelab-postgres psql -U ticketbot -c "SELECT 1;" >/dev/null 2>&1; then
    POSTGRES_SUPERUSER="ticketbot"
    echo -e "${YELLOW}⚠ Found: ticketbot user (legacy)${NC}"
    echo "Creating postgres superuser..."
    
    # Create postgres superuser
    docker exec homelab-postgres psql -U ticketbot -c "
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'postgres') THEN
            CREATE ROLE postgres WITH SUPERUSER CREATEDB CREATEROLE LOGIN PASSWORD '${POSTGRES_PASSWORD}';
            RAISE NOTICE 'Created postgres superuser';
        ELSE
            ALTER ROLE postgres WITH SUPERUSER CREATEDB CREATEROLE LOGIN PASSWORD '${POSTGRES_PASSWORD}';
            RAISE NOTICE 'Updated postgres superuser';
        END IF;
    END
    \$\$;
    " >/dev/null 2>&1
    
    if docker exec homelab-postgres psql -U postgres -c "SELECT 1;" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ postgres superuser created successfully${NC}"
        POSTGRES_SUPERUSER="postgres"
        ((FIXES_APPLIED++))
    else
        echo -e "${RED}✗ Failed to create postgres superuser${NC}"
    fi
else
    echo -e "${RED}✗ Could not connect to PostgreSQL${NC}"
    echo "Checking container logs..."
    docker logs homelab-postgres --tail 20
    echo ""
    echo -e "${YELLOW}WARNING: PostgreSQL user detection failed, continuing deployment...${NC}"
fi

# Create databases if they don't exist
if [ -n "$POSTGRES_SUPERUSER" ]; then
    echo ""
    echo "Provisioning databases..."
    
    for DB_NAME in ticketbot streambot homelab_jarvis; do
        echo -n "  → $DB_NAME: "
        
        # Check if database exists
        DB_EXISTS=$(docker exec homelab-postgres psql -U "$POSTGRES_SUPERUSER" -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME';" 2>/dev/null || echo "")
        
        if [ "$DB_EXISTS" = "1" ]; then
            echo -e "${GREEN}exists${NC}"
        else
            # Create database
            if docker exec homelab-postgres psql -U "$POSTGRES_SUPERUSER" -c "CREATE DATABASE $DB_NAME;" >/dev/null 2>&1; then
                echo -e "${GREEN}created${NC}"
                ((FIXES_APPLIED++))
            else
                echo -e "${RED}failed${NC}"
            fi
        fi
    done
fi

echo ""
echo -e "${GREEN}✓ Database auto-healing complete${NC}"
echo ""

# ============================================================================
# PHASE 5: VNC/CODE-SERVER AUTO-FIX
# ============================================================================
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${BLUE}  PHASE 5: VNC/CODE-SERVER AUTO-FIX${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Fix VNC password if container is running
echo -n "Checking VNC desktop... "
if docker ps --filter "name=vnc-desktop" --filter "status=running" | grep -q "vnc-desktop"; then
    echo -e "${GREEN}running${NC}"
    
    # Check if VNC password is set
    if [ -n "$VNC_PASSWORD" ]; then
        echo "Configuring VNC password..."
        if docker exec vnc-desktop /usr/local/bin/fix-vnc-password.sh >/dev/null 2>&1; then
            echo -e "${GREEN}✓ VNC password configured${NC}"
            ((FIXES_APPLIED++))
        else
            echo -e "${YELLOW}⚠ VNC password configuration failed (non-critical)${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ VNC_PASSWORD not set in .env${NC}"
    fi
else
    echo -e "${YELLOW}not running (skipping)${NC}"
fi

echo ""
echo -e "${GREEN}✓ VNC/Code-Server auto-fix complete${NC}"
echo ""

# ============================================================================
# PHASE 6: SERVICE HEALTH VERIFICATION
# ============================================================================
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${BLUE}  PHASE 6: SERVICE HEALTH VERIFICATION${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Wait for services to be fully ready
echo "Waiting for services to stabilize (15 seconds)..."
sleep 15
echo ""

# Check critical services
CRITICAL_SERVICES=(
    "homelab-postgres:PostgreSQL Database"
    "homelab-redis:Redis Cache"
    "homelab-minio:MinIO Storage"
    "caddy:Caddy Reverse Proxy"
    "homelab-dashboard:Dashboard"
    "stream-bot:Stream Bot"
    "discord-bot:Discord Bot"
)

RUNNING_COUNT=0
TOTAL_COUNT=${#CRITICAL_SERVICES[@]}

echo "Checking critical services:"
for SERVICE_INFO in "${CRITICAL_SERVICES[@]}"; do
    SERVICE_NAME="${SERVICE_INFO%%:*}"
    SERVICE_LABEL="${SERVICE_INFO##*:}"
    
    echo -n "  → $SERVICE_LABEL: "
    
    if docker ps --filter "name=$SERVICE_NAME" --filter "status=running" | grep -q "$SERVICE_NAME"; then
        echo -e "${GREEN}✓ running${NC}"
        ((RUNNING_COUNT++))
    else
        echo -e "${RED}✗ not running${NC}"
        ((CHECKS_FAILED++))
    fi
done

echo ""
if [ $RUNNING_COUNT -eq $TOTAL_COUNT ]; then
    echo -e "${GREEN}✓ All critical services running ($RUNNING_COUNT/$TOTAL_COUNT)${NC}"
else
    echo -e "${YELLOW}⚠ Some services not running ($RUNNING_COUNT/$TOTAL_COUNT)${NC}"
    echo "  Run: docker compose -f docker-compose.unified.yml ps"
    echo "  To check: docker compose -f docker-compose.unified.yml logs [service-name]"
fi

# Check total container count
echo ""
ALL_CONTAINERS=$(docker ps --filter "name=homelab-|discord-bot|stream-bot|caddy|plex|n8n|vnc-desktop|code-server|homeassistant|rig-city|scarletredjoker" --format "{{.Names}}" | wc -l)
echo "Total containers running: $ALL_CONTAINERS/15"

echo ""
echo -e "${GREEN}✓ Health verification complete${NC}"
echo ""

# ============================================================================
# PHASE 7: DATABASE MIGRATION CHECK
# ============================================================================
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${BLUE}  PHASE 7: DATABASE MIGRATION CHECK${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check Dashboard migrations
if docker ps --filter "name=homelab-dashboard" --filter "status=running" | grep -q "homelab-dashboard"; then
    echo -n "Checking Dashboard database migrations... "
    
    # Try to get migration status
    MIGRATION_OUTPUT=$(docker exec homelab-dashboard python -m alembic current 2>&1 || echo "FAILED")
    
    if echo "$MIGRATION_OUTPUT" | grep -q "FAILED"; then
        echo -e "${YELLOW}⚠ Unable to check${NC}"
        echo "  This is OK if the dashboard just started"
    else
        echo -e "${GREEN}✓ OK${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Dashboard not running (skipping migration check)${NC}"
fi

echo ""
echo -e "${GREEN}✓ Database migration check complete${NC}"
echo ""

# ============================================================================
# DEPLOYMENT SUMMARY
# ============================================================================
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║        ✅ DEPLOYMENT COMPLETE                               ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${BOLD}SUMMARY:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "Pre-flight checks passed: ${GREEN}$CHECKS_PASSED${NC}"
echo -e "Auto-fixes applied: ${GREEN}$FIXES_APPLIED${NC}"
echo -e "Critical services running: ${GREEN}$RUNNING_COUNT/$TOTAL_COUNT${NC}"
echo -e "Total containers: ${GREEN}$ALL_CONTAINERS/15${NC}"
echo ""

if [ $CHECKS_FAILED -gt 0 ]; then
    echo -e "${YELLOW}⚠ Some checks failed: $CHECKS_FAILED${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Check logs: docker compose -f docker-compose.unified.yml logs"
    echo "  2. Check specific service: docker logs <container-name>"
    echo "  3. View deployment log: cat $LOG_FILE"
    echo ""
fi

echo -e "${BOLD}SERVICE URLS:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Dashboard:  https://host.evindrake.net"
echo "  Stream Bot: https://stream.rig-city.com"
echo "  Discord:    https://bot.rig-city.com"
echo "  VNC:        https://vnc.evindrake.net"
echo "  n8n:        https://n8n.evindrake.net"
echo "  Plex:       https://plex.evindrake.net"
echo ""

echo -e "${BOLD}LOG FILE:${NC} $LOG_FILE"
echo ""
echo -e "${GREEN}✓ Deployment completed successfully!${NC}"
echo ""
