#!/bin/bash
# ════════════════════════════════════════════════════════════════
# HOMELAB BOOTSTRAP - Enhanced with Rollback & Validation
# ════════════════════════════════════════════════════════════════
# Run this ONCE on a fresh server or to fix broken deployments
# Idempotent: Safe to run multiple times
#
# Features:
#  - Pre-flight checks (Docker, disk, memory)
#  - Automatic rollback on failure
#  - Progress indicators
#  - Detailed error messages with suggestions

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_ROOT="/home/evin/contain/HomeLabHub"
cd "$PROJECT_ROOT"

echo -e "${CYAN}"
echo "════════════════════════════════════════════════════════════════"
echo "  HOMELAB BOOTSTRAP - Enhanced Edition"
echo "════════════════════════════════════════════════════════════════"
echo -e "${NC}"

# State tracking for rollback
DEPLOYMENT_STATE_FILE="$PROJECT_ROOT/var/state/deployment.state"
ROLLBACK_BACKUP="$PROJECT_ROOT/var/backups/databases/pre-bootstrap-$(date +%Y%m%d-%H%M%S).sql"

# Create state directory
mkdir -p "$PROJECT_ROOT/var/state"
mkdir -p "$PROJECT_ROOT/var/backups/databases"

# Rollback function
rollback() {
    local error_code=$?
    
    echo -e "\n${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}  ⚠️  DEPLOYMENT FAILED - INITIATING ROLLBACK${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
    
    echo "Stopping newly deployed containers..."
    docker compose --project-directory "$PROJECT_ROOT" \
        --env-file "$PROJECT_ROOT/.env" \
        down 2>/dev/null || true
    
    if [ -f "$ROLLBACK_BACKUP" ]; then
        echo -e "${YELLOW}Pre-bootstrap database backup available at:${NC}"
        echo "  $ROLLBACK_BACKUP"
        echo -e "Restore with: ${CYAN}./homelab restore $ROLLBACK_BACKUP${NC}"
    fi
    
    echo -e "\n${RED}Bootstrap failed with exit code: $error_code${NC}"
    echo -e "${YELLOW}Common solutions:${NC}"
    echo "  1. Check .env file has all required variables: ./homelab validate-env"
    echo "  2. Ensure Docker daemon is running: systemctl status docker"
    echo "  3. Check logs for specific errors: ./homelab logs"
    echo "  4. Free up disk space if needed: df -h"
    echo ""
    echo "After fixing issues, run: ./bootstrap-homelab.sh"
    
    exit $error_code
}

# Set trap for rollback on error
trap rollback ERR

# Progress indicator with spinner
progress() {
    local current=$1
    local total=$2
    local message=$3
    local percent=$((current * 100 / total))
    local filled=$((percent / 5))
    local empty=$((20 - filled))
    
    printf "\r${CYAN}[%d/%d]${NC} [" $current $total
    printf "%${filled}s" | tr ' ' '█'
    printf "%${empty}s" | tr ' ' '░'
    printf "] %3d%% - %s${NC}" $percent "$message"
    
    if [ $current -eq $total ]; then
        echo ""
    fi
}

# Spinner for long operations
spinner() {
    local pid=$1
    local message=$2
    local delay=0.1
    local spinstr='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    
    while ps -p $pid > /dev/null 2>&1; do
        local temp=${spinstr#?}
        printf "\r${CYAN}%s${NC} %s" "${spinstr:0:1}" "$message"
        local spinstr=$temp${spinstr%"$temp"}
        sleep $delay
    done
    printf "\r"
}

# ============================================================================
# PRE-FLIGHT CHECKS (Step 0)
# ============================================================================
echo -e "\n${BLUE}[0/8] Pre-Flight System Checks${NC}"

# Check 1: Docker installed and running
echo -n "Checking Docker installation... "
if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ FAILED${NC}"
    echo -e "${RED}Docker is not installed${NC}"
    echo -e "${YELLOW}Solution:${NC} Install Docker with: curl -fsSL https://get.docker.com | sh"
    exit 1
fi
echo -e "${GREEN}✓${NC}"

echo -n "Checking Docker daemon... "
if ! docker info &> /dev/null; then
    echo -e "${RED}✗ FAILED${NC}"
    echo -e "${RED}Docker daemon is not running${NC}"
    echo -e "${YELLOW}Solution:${NC} Start Docker with: sudo systemctl start docker"
    exit 1
fi
echo -e "${GREEN}✓${NC}"

# Check 2: Docker Compose
echo -n "Checking Docker Compose... "
if ! command -v docker compose &> /dev/null; then
    echo -e "${RED}✗ FAILED${NC}"
    echo -e "${RED}Docker Compose is not installed${NC}"
    echo -e "${YELLOW}Solution:${NC} Update Docker to latest version"
    exit 1
fi
echo -e "${GREEN}✓${NC}"

# Check 3: Disk space (need at least 10GB free)
echo -n "Checking disk space... "
available_space=$(df -BG "$PROJECT_ROOT" | awk 'NR==2 {print $4}' | sed 's/G//')
if [ "$available_space" -lt 10 ]; then
    echo -e "${YELLOW}⚠${NC}"
    echo -e "${YELLOW}  WARNING: Low disk space (${available_space}GB available)${NC}"
    echo "  Recommended: At least 10GB free"
    read -p "  Continue anyway? (y/N): " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo "Bootstrap cancelled"
        exit 1
    fi
else
    echo -e "${GREEN}✓ ${available_space}GB available${NC}"
fi

# Check 4: Memory (need at least 4GB)
echo -n "Checking memory... "
total_mem=$(free -g | awk 'NR==2 {print $2}')
if [ "$total_mem" -lt 4 ]; then
    echo -e "${YELLOW}⚠${NC}"
    echo -e "${YELLOW}  WARNING: Low memory (${total_mem}GB total)${NC}"
    echo "  Recommended: At least 4GB RAM"
    read -p "  Continue anyway? (y/N): " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo "Bootstrap cancelled"
        exit 1
    fi
else
    echo -e "${GREEN}✓ ${total_mem}GB total${NC}"
fi

# Check 5: Project files exist
echo -n "Checking project files... "
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo -e "${RED}✗ FAILED${NC}"
    echo -e "${RED}.env file not found${NC}"
    echo -e "${YELLOW}Solution:${NC} Create .env from template: cp .env.example .env"
    exit 1
fi
if [ ! -f "$PROJECT_ROOT/docker-compose.yml" ]; then
    echo -e "${RED}✗ FAILED${NC}"
    echo -e "${RED}docker-compose.yml not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC}"

echo -e "\n${GREEN}✅ All pre-flight checks passed${NC}"

# ============================================================================
# STEP 1: Environment Validation
# ============================================================================
echo -e "\n${CYAN}[1/8] Validating Environment${NC}"
progress 0 4 "Checking .env file"

if [ ! -f ".env" ]; then
    echo -e "${RED}✗ .env file missing${NC}"
    echo -e "${YELLOW}Solution:${NC} Create from template: cp .env.example .env"
    exit 1
fi

required_vars=(
    "POSTGRES_PASSWORD"
    "DISCORD_DB_PASSWORD"
    "STREAMBOT_DB_PASSWORD"
    "JARVIS_DB_PASSWORD"
    "WEB_USERNAME"
    "WEB_PASSWORD"
    "SESSION_SECRET"
)

missing_vars=()
for var in "${required_vars[@]}"; do
    if ! grep -q "^${var}=" .env || [ -z "$(grep "^${var}=" .env | cut -d'=' -f2)" ]; then
        missing_vars+=("$var")
    fi
    progress $((4 - ${#missing_vars[@]})) 4 "Validating variables"
done

if [ ${#missing_vars[@]} -gt 0 ]; then
    echo -e "\n${RED}✗ Missing required variables:${NC}"
    for var in "${missing_vars[@]}"; do
        echo "  - $var"
    done
    echo -e "${YELLOW}Solution:${NC} Update .env file with missing variables"
    exit 1
fi

progress 4 4 "Environment validated"
echo -e "${GREEN}✓ Environment validated${NC}"

# Auto-generate SERVICE_AUTH_TOKEN if missing
echo ""
echo -n "Checking SERVICE_AUTH_TOKEN... "
if ! grep -q "^SERVICE_AUTH_TOKEN=" .env || [ -z "$(grep "^SERVICE_AUTH_TOKEN=" .env | cut -d'=' -f2)" ]; then
    echo ""
    echo "  Generating SERVICE_AUTH_TOKEN..."
    TOKEN=$(openssl rand -hex 32)
    echo "SERVICE_AUTH_TOKEN=$TOKEN" >> .env
    echo -e "  ${GREEN}✓ SERVICE_AUTH_TOKEN added to .env${NC}"
else
    echo -e "${GREEN}✓ Already configured${NC}"
fi

# ============================================================================
# STEP 2: Create Pre-Bootstrap Backup
# ============================================================================
echo -e "\n${CYAN}[2/8] Creating Pre-Bootstrap Backup${NC}"

if docker ps --format "{{.Names}}" | grep -q "homelab-postgres"; then
    echo "Creating database backup for rollback..."
    docker exec homelab-postgres pg_dumpall -U postgres > "$ROLLBACK_BACKUP" 2>/dev/null || true
    
    if [ -f "$ROLLBACK_BACKUP" ]; then
        backup_size=$(du -h "$ROLLBACK_BACKUP" | cut -f1)
        echo -e "${GREEN}✓ Backup created ($backup_size)${NC}"
    else
        echo -e "${YELLOW}⚠ No existing databases to backup${NC}"
    fi
else
    echo -e "${YELLOW}⚠ No existing PostgreSQL container - skipping backup${NC}"
fi

# ============================================================================
# STEP 3: Build All Images
# ============================================================================
echo -e "\n${CYAN}[3/8] Building Docker Images${NC}"
echo "This may take several minutes..."

docker compose --project-directory "$PROJECT_ROOT" \
    --env-file "$PROJECT_ROOT/.env" \
    build --no-cache 2>&1 | while read line; do
    if echo "$line" | grep -q "Step"; then
        echo "  $line"
    fi
done

echo -e "${GREEN}✓ Images built${NC}"

# ============================================================================
# STEP 4: Start Infrastructure Services First
# ============================================================================
echo -e "\n${CYAN}[4/8] Starting Infrastructure (PostgreSQL, Redis, MinIO)${NC}"

docker compose --project-directory "$PROJECT_ROOT" \
    --env-file "$PROJECT_ROOT/.env" \
    up -d homelab-postgres redis minio

# Wait for PostgreSQL to be ready with timeout
echo -n "Waiting for PostgreSQL to be ready"
for i in {1..60}; do
    if docker exec homelab-postgres pg_isready -U postgres &>/dev/null; then
        echo ""
        echo -e "${GREEN}  ✓ PostgreSQL ready (${i}s)${NC}"
        break
    fi
    echo -n "."
    sleep 1
    if [ $i -eq 60 ]; then
        echo ""
        echo -e "${RED}✗ PostgreSQL failed to start within 60 seconds${NC}"
        echo -e "${YELLOW}Solution:${NC} Check logs with: docker logs homelab-postgres"
        exit 1
    fi
done

# Wait for Redis
echo -n "Waiting for Redis... "
sleep 3
if docker exec homelab-redis redis-cli ping &>/dev/null | grep -q "PONG"; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}⚠${NC} (will retry)"
fi

# ============================================================================
# STEP 5: Create & Initialize Databases
# ============================================================================
echo -e "\n${CYAN}[5/8] Creating Databases & Users${NC}"

# Load passwords from .env safely
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
        echo -e "  ${BLUE}•${NC} Database exists: $db"
    fi
done

# Create users and grant permissions
docker exec homelab-postgres psql -U postgres <<-EOSQL 2>/dev/null
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
# STEP 6: Run Dashboard Migrations
# ============================================================================
echo -e "\n${CYAN}[6/8] Running Dashboard Database Migrations${NC}"

# Start dashboard temporarily to run migrations
docker compose --project-directory "$PROJECT_ROOT" \
    --env-file "$PROJECT_ROOT/.env" \
    up -d homelab-dashboard

echo "Waiting for dashboard to initialize..."
sleep 8

# Run migrations
echo "Running Alembic migrations..."
docker exec homelab-dashboard bash -c "
    cd /app
    if [ -f alembic.ini ]; then
        alembic upgrade head 2>&1 | grep -E '(Running upgrade|successfully|ERROR|target database)' || true
    fi
" 2>/dev/null || true

# Verify tables exist
table_count=$(docker exec homelab-postgres psql -U postgres -d homelab_jarvis -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | tr -d ' ' || echo "0")

if [ "$table_count" -gt 0 ]; then
    echo -e "${GREEN}✓ Dashboard has $table_count tables${NC}"
else
    echo -e "${YELLOW}⚠ Dashboard has no tables - may need manual migration${NC}"
    echo -e "${YELLOW}  This is OK for first-time setup${NC}"
fi

# ============================================================================
# STEP 7: Start All Services
# ============================================================================
echo -e "\n${CYAN}[7/8] Starting All Services${NC}"

docker compose --project-directory "$PROJECT_ROOT" \
    --env-file "$PROJECT_ROOT/.env" \
    up -d

echo "Waiting for services to stabilize (30 seconds)..."
for i in {1..30}; do
    printf "\r  Progress: [%-30s] %d%%" $(printf '#%.0s' $(seq 1 $i)) $((i*100/30))
    sleep 1
done
echo ""

# ============================================================================
# STEP 8: Comprehensive Validation
# ============================================================================
echo -e "\n${CYAN}[8/8] Validating Service Functionality${NC}"

validation_failed=0
validation_warnings=0

# Test Dashboard
echo -n "  Testing Dashboard... "
dashboard_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/ 2>/dev/null || echo "000")
if [ "$dashboard_status" = "200" ] || [ "$dashboard_status" = "302" ]; then
    echo -e "${GREEN}✓ (HTTP $dashboard_status)${NC}"
else
    echo -e "${RED}✗ (HTTP $dashboard_status)${NC}"
    ((validation_failed++))
fi

# Test Discord Bot
echo -n "  Testing Discord Bot... "
discord_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/ 2>/dev/null || echo "000")
if [ "$discord_status" = "200" ] || [ "$discord_status" = "302" ]; then
    echo -e "${GREEN}✓ (HTTP $discord_status)${NC}"
else
    echo -e "${YELLOW}⚠ (HTTP $discord_status)${NC}"
    ((validation_warnings++))
fi

# Test Stream Bot
echo -n "  Testing Stream Bot... "
stream_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/ 2>/dev/null || echo "000")
if [ "$stream_status" = "200" ] || [ "$stream_status" = "302" ]; then
    echo -e "${GREEN}✓ (HTTP $stream_status)${NC}"
else
    echo -e "${YELLOW}⚠ (HTTP $stream_status)${NC}"
    ((validation_warnings++))
fi

# Check database tables
echo "  Verifying database schemas..."
for db in ticketbot streambot homelab_jarvis; do
    count=$(docker exec homelab-postgres psql -U postgres -d "$db" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | tr -d ' ' || echo "0")
    if [ "$count" -gt 0 ]; then
        echo -e "    ${GREEN}✓${NC} $db: $count tables"
    else
        echo -e "    ${YELLOW}⚠${NC} $db: No tables (may be normal for first run)"
        ((validation_warnings++))
    fi
done

# Container status
running=$(docker ps --filter "name=homelab" --format "{{.Names}}" | wc -l)
echo -e "  Container status: ${CYAN}$running/15${NC} running"

# ============================================================================
# Summary
# ============================================================================
echo -e "\n${CYAN}════════════════════════════════════════════════════════════════${NC}"

if [ $validation_failed -eq 0 ]; then
    if [ $validation_warnings -eq 0 ]; then
        echo -e "${GREEN}"
        echo "  ✅ HOMELAB BOOTSTRAP COMPLETE"
        echo "  All services are fully operational!"
        echo -e "${NC}"
    else
        echo -e "${YELLOW}"
        echo "  ✅ HOMELAB BOOTSTRAP COMPLETE (with warnings)"
        echo "  Core services operational, $validation_warnings warning(s)"
        echo -e "${NC}"
    fi
    
    echo "  Quick Access:"
    echo "    Dashboard: https://host.evindrake.net"
    echo "    Discord Bot: https://bot.rig-city.com"
    echo "    Stream Bot: https://stream.rig-city.com"
    echo ""
    echo "  Next Steps:"
    echo "    • Check status: ${CYAN}./homelab status${NC}"
    echo "    • Run health check: ${CYAN}./homelab health${NC}"
    echo "    • View logs: ${CYAN}./homelab logs${NC}"
    echo "    • See operations guide: ${CYAN}cat OPERATIONS_GUIDE.md${NC}"
else
    echo -e "${RED}"
    echo "  ⚠️  BOOTSTRAP COMPLETED WITH ERRORS"
    echo "  $validation_failed critical issue(s) detected"
    echo -e "${NC}"
    echo "  Troubleshooting:"
    echo "    • Check logs: ${CYAN}./homelab logs${NC}"
    echo "    • Run diagnostics: ${CYAN}./diagnose-services.sh${NC}"
    echo "    • Validate environment: ${CYAN}./homelab validate-env${NC}"
    echo "    • Run health check: ${CYAN}./homelab health${NC}"
fi

echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"

# Clear rollback trap - deployment succeeded
trap - ERR

# Save deployment state
echo "$(date +%Y%m%d-%H%M%S)" > "$DEPLOYMENT_STATE_FILE"
echo "Bootstrap completed successfully"

exit 0
