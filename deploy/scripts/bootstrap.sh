#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# HOMELAB BOOTSTRAP - Simple, Idempotent, Self-Healing
# ═══════════════════════════════════════════════════════════════════
# One script to rule them all. Run on fresh server or to fix issues.
# Safe to run multiple times - it only changes what needs changing.
#
# Usage:
#   ./deploy/scripts/bootstrap.sh [--skip-cron]
#
# Features:
#   - Docker & Docker Compose verification
#   - Environment setup from .env.example
#   - Database provisioning
#   - Self-healing cron job installation
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Detect project root
if [ -d "/home/evin/contain/HomeLabHub" ]; then
    PROJECT_ROOT="/home/evin/contain/HomeLabHub"
elif [ -d "/opt/homelab/HomeLabHub" ]; then
    PROJECT_ROOT="/opt/homelab/HomeLabHub"
else
    PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

cd "$PROJECT_ROOT"

# Parse arguments
SKIP_CRON=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-cron) SKIP_CRON=true; shift ;;
        *) shift ;;
    esac
done

echo -e "${CYAN}"
echo "═══════════════════════════════════════════════════════════════"
echo "  HOMELAB BOOTSTRAP"
echo "  Project: $PROJECT_ROOT"
echo "═══════════════════════════════════════════════════════════════"
echo -e "${NC}"

# ═══════════════════════════════════════════════════════════════════
# STEP 1: Verify Docker
# ═══════════════════════════════════════════════════════════════════
echo -e "${CYAN}[1/6] Checking Docker...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker not installed${NC}"
    echo "Install with: curl -fsSL https://get.docker.com | sh"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo -e "${RED}✗ Docker daemon not running${NC}"
    echo "Start with: sudo systemctl start docker"
    exit 1
fi

if ! command -v docker compose &> /dev/null; then
    echo -e "${RED}✗ Docker Compose not installed${NC}"
    echo "Update Docker to latest version"
    exit 1
fi

echo -e "${GREEN}✓ Docker ready${NC}"

# ═══════════════════════════════════════════════════════════════════
# STEP 2: Setup Environment
# ═══════════════════════════════════════════════════════════════════
echo -e "\n${CYAN}[2/6] Setting up environment...${NC}"

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo "Creating .env from .env.example..."
        cp .env.example .env
        chmod 600 .env
        echo -e "${YELLOW}⚠ Created .env - please update with your credentials!${NC}"
        echo "Edit .env and run bootstrap again."
        exit 1
    else
        echo -e "${RED}✗ No .env or .env.example found${NC}"
        exit 1
    fi
fi

# Validate required variables
required_vars=("POSTGRES_PASSWORD" "DISCORD_DB_PASSWORD" "STREAMBOT_DB_PASSWORD" "JARVIS_DB_PASSWORD" "WEB_USERNAME" "WEB_PASSWORD")
missing=()

for var in "${required_vars[@]}"; do
    if ! grep -q "^${var}=" .env || [ -z "$(grep "^${var}=" .env | cut -d'=' -f2)" ]; then
        missing+=("$var")
    fi
done

if [ ${#missing[@]} -gt 0 ]; then
    echo -e "${RED}✗ Missing required variables:${NC}"
    for var in "${missing[@]}"; do
        echo "  - $var"
    done
    echo "Update .env and run bootstrap again."
    exit 1
fi

# Auto-generate SERVICE_AUTH_TOKEN if missing
if ! grep -q "^SERVICE_AUTH_TOKEN=" .env || [ -z "$(grep "^SERVICE_AUTH_TOKEN=" .env | cut -d'=' -f2)" ]; then
    TOKEN=$(openssl rand -hex 32)
    echo "SERVICE_AUTH_TOKEN=$TOKEN" >> .env
    echo -e "${GREEN}✓ Generated SERVICE_AUTH_TOKEN${NC}"
fi

echo -e "${GREEN}✓ Environment ready${NC}"

# ═══════════════════════════════════════════════════════════════════
# STEP 3: Pull Images
# ═══════════════════════════════════════════════════════════════════
echo -e "\n${CYAN}[3/6] Pulling Docker images...${NC}"

docker compose --project-directory "$PROJECT_ROOT" \
    --env-file "$PROJECT_ROOT/.env" \
    -f "$PROJECT_ROOT/docker-compose.yml" \
    pull --quiet 2>/dev/null || true

echo -e "${GREEN}✓ Images ready${NC}"

# ═══════════════════════════════════════════════════════════════════
# STEP 4: Build Custom Images
# ═══════════════════════════════════════════════════════════════════
echo -e "\n${CYAN}[4/6] Building custom images...${NC}"

docker compose --project-directory "$PROJECT_ROOT" \
    --env-file "$PROJECT_ROOT/.env" \
    -f "$PROJECT_ROOT/docker-compose.yml" \
    build --quiet 2>/dev/null

echo -e "${GREEN}✓ Images built${NC}"

# ═══════════════════════════════════════════════════════════════════
# STEP 5: Start Services
# ═══════════════════════════════════════════════════════════════════
echo -e "\n${CYAN}[5/6] Starting services...${NC}"

docker compose --project-directory "$PROJECT_ROOT" \
    --env-file "$PROJECT_ROOT/.env" \
    -f "$PROJECT_ROOT/docker-compose.yml" \
    up -d

# Wait for PostgreSQL
echo -n "Waiting for PostgreSQL..."
for i in {1..60}; do
    if docker exec homelab-postgres pg_isready -U postgres &>/dev/null; then
        echo -e " ${GREEN}ready${NC}"
        break
    fi
    echo -n "."
    sleep 1
    if [ $i -eq 60 ]; then
        echo -e " ${RED}timeout${NC}"
    fi
done

echo -e "${GREEN}✓ Services started${NC}"

# ═══════════════════════════════════════════════════════════════════
# STEP 6: Setup Self-Healing Cron
# ═══════════════════════════════════════════════════════════════════
if [ "$SKIP_CRON" = false ]; then
    echo -e "\n${CYAN}[6/6] Setting up self-healing cron...${NC}"
    
    CRON_CMD="*/5 * * * * cd $PROJECT_ROOT && ./homelab health --quiet || ./homelab restart 2>&1 | logger -t homelab-heal"
    
    # Remove old cron entries
    crontab -l 2>/dev/null | grep -v "homelab-heal" | crontab - 2>/dev/null || true
    
    # Add new cron entry
    (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
    
    echo -e "${GREEN}✓ Self-healing cron installed (every 5 minutes)${NC}"
else
    echo -e "\n${CYAN}[6/6] Skipping cron setup (--skip-cron)${NC}"
fi

# ═══════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════
echo -e "\n${CYAN}═══════════════════════════════════════════════════════════════${NC}"

running=$(docker compose --project-directory "$PROJECT_ROOT" ps --status running --format "{{.Name}}" 2>/dev/null | wc -l || echo "0")
total=$(docker compose --project-directory "$PROJECT_ROOT" ps --format "{{.Name}}" 2>/dev/null | wc -l || echo "0")

echo -e "${GREEN}✅ BOOTSTRAP COMPLETE${NC}"
echo ""
echo "Services: $running/$total running"
echo ""
echo "Quick Commands:"
echo "  ./homelab status   - Check service status"
echo "  ./homelab logs     - View service logs"
echo "  ./homelab health   - Run health check"
echo "  ./homelab restart  - Restart all services"
echo ""
echo "Endpoints:"
echo "  Dashboard:   https://host.evindrake.net"
echo "  Discord Bot: https://bot.rig-city.com"
echo "  Stream Bot:  https://stream.rig-city.com"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
