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
    echo "Creating .env from template..."
    
    cat > .env << 'ENVTEMPLATE'
SERVICE_USER=evin
POSTGRES_PASSWORD=qS4R8Wrl-Spz7-YEmyllIA
WEB_USERNAME=admin
WEB_PASSWORD=Brs=2729
SESSION_SECRET=qS4R8Wrl-Spz7-YEmyllIA
DASHBOARD_API_KEY=eaa143f78c41c87d0dad846419182f93960dc93574d7f33eb77f8f101185d7e7
FLASK_ENV=production
FLASK_DEBUG=false
SECRET_KEY=eaa143f78c41c87d0dad846419182f93960dc93574d7f33eb77f8f101185d7e7
FLASK_HOST=0.0.0.0
FLASK_PORT=5000
ENABLE_SCRIPT_EXECUTION=false
DISCORD_DB_PASSWORD=qS4R8Wrl-Spz7-YEmyllIA
STREAMBOT_DB_PASSWORD=qS4R8Wrl-Spz7-YEmyllIA
JARVIS_DB_PASSWORD=qS4R8Wrl-Spz7-YEmyllIA
DISCORD_DB_USER=ticketbot
STREAMBOT_DB_USER=streambot
JARVIS_DB_USER=jarvis
DISCORD_DATABASE_URL=postgresql://ticketbot:qS4R8Wrl-Spz7-YEmyllIA@homelab-postgres:5432/ticketbot
STREAMBOT_DATABASE_URL=postgresql://streambot:qS4R8Wrl-Spz7-YEmyllIA@homelab-postgres:5432/streambot
JARVIS_DATABASE_URL=postgresql://jarvis:qS4R8Wrl-Spz7-YEmyllIA@homelab-postgres:5432/homelab_jarvis
OPENAI_API_KEY=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
OPENAI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-3.5-turbo
AI_PROVIDER=openai
STREAMBOT_SESSION_SECRET=eaa143f78c41c87d0dad846419182f93960dc93574d7f33eb77f8f101185d7e7
STREAMBOT_PORT=5000
STREAMBOT_NODE_ENV=production
STREAMBOT_OPENAI_API_KEY=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
STREAMBOT_OPENAI_BASE_URL=https://api.openai.com/v1
STREAMBOT_FACT_MODEL=gpt-3.5-turbo
TWITCH_CLIENT_ID=5guyyrv2gjh02yy9l1bxwjvkmb3wai
TWITCH_CLIENT_SECRET=
TWITCH_CHANNEL=
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REDIRECT_URI=https://stream.rig-city.com/api/auth/youtube/callback
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
KICK_CLIENT_ID=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
KICK_CLIENT_SECRET=1f74813218fb6f25147362ebc447987c3b2497f082923e5252eda27071382faa
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=1355875026070667374
DISCORD_CLIENT_SECRET=
DISCORD_APP_ID=1355875026070667374
VITE_DISCORD_CLIENT_ID=1355875026070667374
DISCORD_SESSION_SECRET=eaa143f78c41c87d0dad846419182f93960dc93574d7f33eb77f8f101185d7e7
VITE_CUSTOM_WS_URL=wss://bot.rig-city.com/ws
RESET_DB=false
PLEX_URL=https://plex.evindrake.net
PLEX_TOKEN=
PLEX_CLAIM=
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=qS4R8Wrl-Spz7-YEmyllIA
MINIO_ENDPOINT=minio:9000
MINIO_USE_SSL=false
MINIO_BUCKET_NAME=homelab-uploads
VNC_PASSWORD=qS4R8Wrl-Spz7-YEmyllIA
VNC_USER=evin
VNC_USER_PASSWORD=Brs=2729
NOVNC_ENABLE=true
NOVNC_URL=vnc.evindrake.net
CODE_SERVER_PASSWORD=qS4R8Wrl-Spz7-YEmyllIA
HOME_ASSISTANT_URL=http://homeassistant:8123
HOME_ASSISTANT_TOKEN=
HOME_ASSISTANT_VERIFY_SSL=False
GOOGLE_TOKEN_CACHE_TTL=300
CALENDAR_POLL_INTERVAL_MINUTES=5
CALENDAR_LEAD_TIME_MINUTES=10
GMAIL_FROM_NAME=Homelab_Dashboard
GMAIL_DEFAULT_RECIPIENT=evindrake11@gmail.com
DRIVE_BACKUP_FOLDER_NAME=Homelab_Backups
DRIVE_BACKUP_RETENTION_DAYS=30
DRIVE_AUTO_BACKUP_ENABLED=false
DRIVE_AUTO_BACKUP_SCHEDULE="0 2 * * *"
DISCORD_BOT_URL=https://bot.rig-city.com
N8N_URL=https://n8n.evindrake.net
STATIC_SITE_URL=https://scarletredjoker.com
LETSENCRYPT_EMAIL=evindrake11@gmail.com
ENVTEMPLATE
    
    chmod 600 .env
    log_pass ".env file created from template"
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

log_info "Resetting database users with correct passwords..."
docker exec homelab-postgres psql -U postgres <<'PGSQL' 2>/dev/null
-- Drop users if they exist (to reset passwords)
DROP USER IF EXISTS ticketbot;
DROP USER IF EXISTS streambot;
DROP USER IF EXISTS jarvis;

-- Recreate users with correct passwords
CREATE USER ticketbot WITH PASSWORD 'qS4R8Wrl-Spz7-YEmyllIA';
CREATE USER streambot WITH PASSWORD 'qS4R8Wrl-Spz7-YEmyllIA';
CREATE USER jarvis WITH PASSWORD 'qS4R8Wrl-Spz7-YEmyllIA';

-- Grant all privileges
GRANT ALL PRIVILEGES ON DATABASE ticketbot TO ticketbot;
GRANT ALL PRIVILEGES ON DATABASE streambot TO streambot;
GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis TO jarvis;

-- Set database owners
ALTER DATABASE ticketbot OWNER TO ticketbot;
ALTER DATABASE streambot OWNER TO streambot;
ALTER DATABASE homelab_jarvis OWNER TO jarvis;
PGSQL

log_pass "Database users recreated with correct passwords"

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
