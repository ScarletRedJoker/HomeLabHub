#!/bin/bash
# ============================================
# PRODUCTION DEPLOYMENT SCRIPT
# ============================================
# Performs complete health checks, database healing,
# user verification, and configuration validation
# before deploying all services.
#
# Run this EVERY TIME to deploy: ./deploy-production.sh
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

log_step() { echo -e "\n${BLUE}[STEP]${NC} $1"; }
log_pass() { echo -e "${GREEN}✓${NC} $1"; }
log_fail() { echo -e "${RED}✗${NC} $1"; ERRORS=$((ERRORS + 1)); }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; WARNINGS=$((WARNINGS + 1)); }
log_info() { echo -e "  $1"; }

echo "============================================"
echo "  HOMELAB PRODUCTION DEPLOYMENT"
echo "============================================"
echo "Starting comprehensive pre-deployment checks..."
echo ""

# ============================================
# STEP 1: Environment File Validation
# ============================================
log_step "1/10 - Validating .env file"

if [ ! -f .env ]; then
    log_fail ".env file not found"
    echo ""
    echo "Please create .env file before running deployment:"
    echo "  1. Copy from template: cp .env.example .env"
    echo "  2. Edit with your credentials: nano .env"
    echo "  3. Or use bootstrap with auto-generation: ./deploy/scripts/bootstrap.sh --generate-secrets"
    echo ""
    exit 1
else
    log_pass ".env file exists"
fi

# Test .env file can be sourced without bash errors
if set -a && source .env 2>/dev/null && set +a; then
    log_pass ".env file loads without syntax errors"
else
    log_fail ".env file has syntax errors - cannot proceed"
    exit 1
fi

# Load environment variables
set -a
source .env
set +a

# ============================================
# STEP 2: Required Variables Check
# ============================================
log_step "2/10 - Checking required environment variables"

REQUIRED_VARS=(
    "POSTGRES_PASSWORD"
    "WEB_PASSWORD"
    "SESSION_SECRET"
    "DASHBOARD_API_KEY"
    "OPENAI_API_KEY"
    "DISCORD_DATABASE_URL"
    "STREAMBOT_DATABASE_URL"
    "JARVIS_DATABASE_URL"
    "DISCORD_DB_PASSWORD"
    "STREAMBOT_DB_PASSWORD"
    "JARVIS_DB_PASSWORD"
)

MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -eq 0 ]; then
    log_pass "All ${#REQUIRED_VARS[@]} required variables are set"
else
    log_fail "Missing variables: ${MISSING_VARS[*]}"
fi

# ============================================
# STEP 3: Database URL Validation
# ============================================
log_step "3/10 - Validating database URLs"

# Check for unresolved variables in URLs
DB_URL_ERRORS=0
for url_var in DISCORD_DATABASE_URL STREAMBOT_DATABASE_URL JARVIS_DATABASE_URL; do
    if [[ "${!url_var}" == *'${'* ]]; then
        log_fail "$url_var contains unresolved variables: ${!url_var}"
        DB_URL_ERRORS=$((DB_URL_ERRORS + 1))
    fi
done

if [ $DB_URL_ERRORS -eq 0 ]; then
    log_pass "All database URLs are properly resolved"
fi

# ============================================
# STEP 4: Docker Services Check
# ============================================
log_step "4/10 - Checking Docker services"

if command -v docker &> /dev/null; then
    log_pass "Docker is installed"
else
    log_fail "Docker is not installed"
    exit 1
fi

if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
    log_pass "Docker Compose is available"
else
    log_fail "Docker Compose is not available"
    exit 1
fi

# ============================================
# STEP 5: PostgreSQL Availability
# ============================================
log_step "5/10 - Checking PostgreSQL availability"

PROJECT_DIR="/home/evin/contain/HomeLabHub"
ENV_FILE="$PROJECT_DIR/.env"

# Start PostgreSQL if not running
if ! docker ps | grep -q homelab-postgres; then
    log_info "Starting PostgreSQL container..."
    docker compose --project-directory "$PROJECT_DIR" --env-file "$ENV_FILE" up -d homelab-postgres
    sleep 5
fi

# Wait for PostgreSQL to be ready (max 30 seconds)
POSTGRES_READY=false
for i in {1..30}; do
    if docker exec homelab-postgres pg_isready -U postgres &>/dev/null; then
        POSTGRES_READY=true
        break
    fi
    sleep 1
done

if [ "$POSTGRES_READY" = true ]; then
    log_pass "PostgreSQL is ready"
else
    log_fail "PostgreSQL failed to become ready after 30 seconds"
    exit 1
fi

# ============================================
# STEP 6: Database Healing
# ============================================
log_step "6/10 - Database healing and user verification"

log_info "Creating/verifying databases..."
for db in ticketbot streambot homelab_jarvis; do
    DB_EXISTS=$(docker exec homelab-postgres psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$db'" | grep -c 1 || true)
    if [ "$DB_EXISTS" -eq 0 ]; then
        docker exec homelab-postgres psql -U postgres -c "CREATE DATABASE $db;" &>/dev/null
        log_info "Created database: $db"
    else
        log_info "Database exists: $db"
    fi
done
log_pass "All databases verified"

log_info "Verifying database users with passwords from .env..."

DISCORD_DB_PASSWORD=$(grep "^DISCORD_DB_PASSWORD=" .env | cut -d'=' -f2)
STREAMBOT_DB_PASSWORD=$(grep "^STREAMBOT_DB_PASSWORD=" .env | cut -d'=' -f2)
JARVIS_DB_PASSWORD=$(grep "^JARVIS_DB_PASSWORD=" .env | cut -d'=' -f2)

docker exec homelab-postgres psql -U postgres <<PGSQL 2>/dev/null
-- Create or update users with passwords from .env
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'ticketbot') THEN
        CREATE USER ticketbot WITH PASSWORD '${DISCORD_DB_PASSWORD}';
    ELSE
        ALTER USER ticketbot WITH PASSWORD '${DISCORD_DB_PASSWORD}';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'streambot') THEN
        CREATE USER streambot WITH PASSWORD '${STREAMBOT_DB_PASSWORD}';
    ELSE
        ALTER USER streambot WITH PASSWORD '${STREAMBOT_DB_PASSWORD}';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'jarvis') THEN
        CREATE USER jarvis WITH PASSWORD '${JARVIS_DB_PASSWORD}';
    ELSE
        ALTER USER jarvis WITH PASSWORD '${JARVIS_DB_PASSWORD}';
    END IF;
END
\$\$;

-- Grant all privileges
GRANT ALL PRIVILEGES ON DATABASE ticketbot TO ticketbot;
GRANT ALL PRIVILEGES ON DATABASE streambot TO streambot;
GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis TO jarvis;

-- Set database owners
ALTER DATABASE ticketbot OWNER TO ticketbot;
ALTER DATABASE streambot OWNER TO streambot;
ALTER DATABASE homelab_jarvis OWNER TO jarvis;
PGSQL

log_pass "Database users verified with passwords from .env"

# ============================================
# STEP 7: Database Connection Tests
# ============================================
log_step "7/10 - Testing database connections"

# Test each database connection
CONNECTION_ERRORS=0

# Test ticketbot connection
if docker exec homelab-postgres psql -U ticketbot -d ticketbot -c "SELECT 1;" &>/dev/null; then
    log_pass "ticketbot database connection successful"
else
    log_fail "ticketbot database connection failed"
    CONNECTION_ERRORS=$((CONNECTION_ERRORS + 1))
fi

# Test streambot connection
if docker exec homelab-postgres psql -U streambot -d streambot -c "SELECT 1;" &>/dev/null; then
    log_pass "streambot database connection successful"
else
    log_fail "streambot database connection failed"
    CONNECTION_ERRORS=$((CONNECTION_ERRORS + 1))
fi

# Test jarvis connection
if docker exec homelab-postgres psql -U jarvis -d homelab_jarvis -c "SELECT 1;" &>/dev/null; then
    log_pass "jarvis database connection successful"
else
    log_fail "jarvis database connection failed"
    CONNECTION_ERRORS=$((CONNECTION_ERRORS + 1))
fi

if [ $CONNECTION_ERRORS -gt 0 ]; then
    log_fail "Some database connections failed"
fi

# ============================================
# STEP 8: OpenAI API Validation
# ============================================
log_step "8/10 - Validating OpenAI API key"

if [ -n "$OPENAI_API_KEY" ]; then
    HTTP_CODE=$(curl -s -w "%{http_code}" -o /dev/null \
        -H "Authorization: Bearer $OPENAI_API_KEY" \
        "https://api.openai.com/v1/models" 2>/dev/null || echo "000")
    
    if [ "$HTTP_CODE" = "200" ]; then
        log_pass "OpenAI API key is valid"
    elif [ "$HTTP_CODE" = "401" ]; then
        log_fail "OpenAI API key is invalid (401 Unauthorized)"
    else
        log_warn "Could not verify OpenAI API key (HTTP $HTTP_CODE)"
    fi
else
    log_fail "OPENAI_API_KEY is not set"
fi

# ============================================
# STEP 9: Pre-Deployment Summary
# ============================================
log_step "9/10 - Pre-deployment summary"

echo ""
if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}════════════════════════════════════════${NC}"
    echo -e "${RED}  DEPLOYMENT BLOCKED${NC}"
    echo -e "${RED}════════════════════════════════════════${NC}"
    echo -e "${RED}Errors: $ERRORS${NC}"
    echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
    echo ""
    echo "Fix the errors above before deploying."
    exit 1
fi

echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  PRE-DEPLOYMENT CHECKS PASSED${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}Errors: 0${NC}"
echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
echo ""
echo "Proceeding with deployment..."
echo ""

# ============================================
# STEP 10: Deploy All Services
# ============================================
log_step "10/10 - Deploying all services"

PROJECT_DIR="/home/evin/contain/HomeLabHub"
ENV_FILE="$PROJECT_DIR/.env"

log_info "Starting all services with correct environment file..."
log_info "Using: $ENV_FILE"
docker compose --project-directory "$PROJECT_DIR" --env-file "$ENV_FILE" up -d --force-recreate

log_pass "All services started with environment loaded"

# Wait for services to stabilize
log_info "Waiting 15 seconds for services to stabilize..."
sleep 15

# ============================================
# Final Status Report
# ============================================
echo ""
echo "============================================"
echo "  DEPLOYMENT STATUS"
echo "============================================"

# Show service status
RUNNING=$(docker compose --project-directory "$PROJECT_DIR" --env-file "$ENV_FILE" ps --services --filter "status=running" | wc -l)
TOTAL=$(docker compose --project-directory "$PROJECT_DIR" --env-file "$ENV_FILE" ps --services | wc -l)

if [ "$RUNNING" -eq "$TOTAL" ]; then
    echo -e "${GREEN}✓ All services running: $RUNNING/$TOTAL${NC}"
else
    echo -e "${YELLOW}⚠ Services running: $RUNNING/$TOTAL${NC}"
fi

echo ""
echo "Service health check:"
docker compose --project-directory "$PROJECT_DIR" --env-file "$ENV_FILE" ps

echo ""
echo "============================================"
echo "  DEPLOYMENT COMPLETE"
echo "============================================"
echo ""
echo "Access your services:"
echo "  • Dashboard:  https://host.evindrake.net"
echo "  • VNC:        https://vnc.evindrake.net"
echo "  • Code:       https://code.evindrake.net"
echo "  • Stream Bot: https://stream.rig-city.com"
echo "  • Discord:    https://bot.rig-city.com"
echo ""
echo "Dashboard login: admin / Brs=2729"
echo ""
echo "Check logs with: ./homelab logs"
echo ""
