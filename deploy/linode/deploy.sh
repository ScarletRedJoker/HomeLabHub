#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# NEBULA COMMAND - Linode Cloud Deployment
# ═══════════════════════════════════════════════════════════════
# Usage: ./deploy.sh [options]
# Run from: /opt/homelab/HomeLabHub/deploy/linode
#
# Services deployed: Dashboard, Discord Bot, Stream Bot, Redis, Postgres
# AI Services: OpenAI (cloud), connects to local Ollama via Tailscale
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}═══ Linode Cloud Deployment ═══${NC}"
echo "Directory: $SCRIPT_DIR"
echo ""

# Step 1: Pull latest code
echo -e "${CYAN}[1/5] Pulling latest code...${NC}"
cd /opt/homelab/HomeLabHub
git pull origin main
cd "$SCRIPT_DIR"
echo -e "${GREEN}✓ Code updated${NC}"
echo ""

# Step 2: Validate and fix environment
echo -e "${CYAN}[2/5] Checking environment...${NC}"
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}No .env found - creating from template...${NC}"
    if [ -f ".env.example" ]; then
        cp .env.example .env
    else
        touch .env
    fi
fi

# Auto-generate missing passwords and secrets
generate_secret() {
    openssl rand -base64 32 | tr -d '/+=' | head -c 32
}

add_if_missing() {
    local key=$1
    local value=$2
    if ! grep -q "^${key}=" .env 2>/dev/null; then
        echo "${key}=${value}" >> .env
        echo -e "${GREEN}[AUTO] Generated ${key}${NC}"
    fi
}

# Auto-generate all passwords and secrets (these don't need manual input)
add_if_missing "POSTGRES_PASSWORD" "$(generate_secret)"
add_if_missing "DISCORD_DB_PASSWORD" "$(generate_secret)"
add_if_missing "STREAMBOT_DB_PASSWORD" "$(generate_secret)"
add_if_missing "JARVIS_DB_PASSWORD" "$(generate_secret)"
add_if_missing "SERVICE_AUTH_TOKEN" "$(generate_secret)"
add_if_missing "SESSION_SECRET" "$(generate_secret)"
add_if_missing "SECRET_KEY" "$(generate_secret)"
add_if_missing "REDIS_PASSWORD" "$(generate_secret)"
add_if_missing "JWT_SECRET" "$(generate_secret)"

# Helper function to get value from .env (handles special characters)
get_env_value() {
    local key=$1
    grep "^${key}=" .env 2>/dev/null | head -1 | cut -d'=' -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

# Check for API tokens using grep (more reliable than shell sourcing)
MISSING_CRITICAL=0
MISSING_OPTIONAL=0

DISCORD_TOKEN=$(get_env_value "DISCORD_BOT_TOKEN")
TAILSCALE_KEY=$(get_env_value "TAILSCALE_AUTHKEY")
CLOUDFLARE_TOKEN=$(get_env_value "CLOUDFLARE_API_TOKEN")
OPENAI_KEY=$(get_env_value "OPENAI_API_KEY")
AI_OPENAI_KEY=$(get_env_value "AI_INTEGRATIONS_OPENAI_API_KEY")

# Critical: Required for core functionality
if [[ -z "$DISCORD_TOKEN" || "$DISCORD_TOKEN" == *"xxxxx"* ]]; then
    echo -e "${RED}[MISSING] DISCORD_BOT_TOKEN - Get from discord.com/developers${NC}"
    MISSING_CRITICAL=1
else
    echo -e "${GREEN}[OK] DISCORD_BOT_TOKEN${NC}"
fi

# Optional: System works without these but with reduced functionality
if [[ -z "$TAILSCALE_KEY" || "$TAILSCALE_KEY" == *"xxxxx"* ]]; then
    echo -e "${YELLOW}[OPTIONAL] TAILSCALE_AUTHKEY - Needed for local homelab connection${NC}"
    MISSING_OPTIONAL=1
else
    echo -e "${GREEN}[OK] TAILSCALE_AUTHKEY${NC}"
fi
if [[ -z "$CLOUDFLARE_TOKEN" || "$CLOUDFLARE_TOKEN" == *"xxxxx"* ]]; then
    echo -e "${YELLOW}[OPTIONAL] CLOUDFLARE_API_TOKEN - Needed for DNS management${NC}"
    MISSING_OPTIONAL=1
else
    echo -e "${GREEN}[OK] CLOUDFLARE_API_TOKEN${NC}"
fi
if [[ -z "$AI_OPENAI_KEY" && -z "$OPENAI_KEY" ]]; then
    echo -e "${YELLOW}[OPTIONAL] OPENAI_API_KEY - Needed for AI features${NC}"
    MISSING_OPTIONAL=1
else
    echo -e "${GREEN}[OK] OPENAI_API_KEY${NC}"
fi

if [[ $MISSING_CRITICAL -eq 1 ]]; then
    echo ""
    echo -e "${RED}Critical API token missing! Discord Bot won't work without DISCORD_BOT_TOKEN.${NC}"
    echo "Get it from: https://discord.com/developers/applications"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Deployment aborted. Add DISCORD_BOT_TOKEN to .env${NC}"
        exit 1
    fi
elif [[ $MISSING_OPTIONAL -eq 1 ]]; then
    echo -e "${YELLOW}Some optional API tokens missing - deploying with reduced functionality.${NC}"
fi
echo -e "${GREEN}✓ Environment checked${NC}"
echo ""

# Step 3: Build and deploy
echo -e "${CYAN}[3/5] Building images...${NC}"
docker compose build --no-cache
echo -e "${GREEN}✓ Build complete${NC}"
echo ""

echo -e "${CYAN}[4/5] Deploying services...${NC}"
docker compose down --remove-orphans 2>/dev/null || true
docker compose up -d
echo -e "${GREEN}✓ Services started${NC}"
echo ""

# Step 5: Database sync and health check
echo -e "${CYAN}[5/5] Final setup...${NC}"
sleep 10  # Wait for postgres to be ready
if [ -f "scripts/sync-streambot-db.sh" ]; then
    bash scripts/sync-streambot-db.sh 2>/dev/null || true
fi
if [ -f "scripts/sync-discordbot-db.sh" ]; then
    bash scripts/sync-discordbot-db.sh 2>/dev/null || true
fi
docker restart stream-bot discord-bot 2>/dev/null || true
echo -e "${GREEN}✓ Database synced, services restarted${NC}"
echo ""

# Health check
echo -e "${CYAN}Waiting for services (15s)...${NC}"
sleep 15

echo ""
echo -e "${CYAN}━━━ Service Status ━━━${NC}"
docker compose ps

echo ""
echo -e "${CYAN}━━━ Health Checks ━━━${NC}"

check_service() {
    local name=$1
    local url=$2
    if curl -sf "$url" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} $name"
    else
        echo -e "  ${YELLOW}⏳${NC} $name (still starting)"
    fi
}

check_service "Dashboard" "http://localhost:5000/health"
check_service "Discord Bot" "http://localhost:4000/health"
check_service "Stream Bot" "http://localhost:3000/health"

echo ""
echo -e "${GREEN}═══ Linode Deployment Complete ═══${NC}"
echo ""
echo "Access URLs:"
echo "  Dashboard:   https://dashboard.rig-city.com"
echo "  Discord Bot: https://discord.rig-city.com"
echo "  Stream Bot:  https://stream.rig-city.com"
echo ""
echo "Logs: docker compose logs -f [service-name]"
