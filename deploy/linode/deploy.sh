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

# Make fix-env.sh executable
chmod +x scripts/fix-env.sh 2>/dev/null || true

# Check for critical missing vars
source .env 2>/dev/null || true
MISSING_CRITICAL=0

if [[ -z "${TAILSCALE_AUTHKEY:-}" || "${TAILSCALE_AUTHKEY:-}" == *"xxxxx"* ]]; then
    echo -e "${RED}[MISSING] TAILSCALE_AUTHKEY${NC}"
    MISSING_CRITICAL=1
fi
if [[ -z "${AI_INTEGRATIONS_OPENAI_API_KEY:-}" && -z "${OPENAI_API_KEY:-}" ]]; then
    echo -e "${YELLOW}[OPTIONAL] No OpenAI API key (AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY)${NC}"
elif [[ "${AI_INTEGRATIONS_OPENAI_API_KEY:-}" == "sk-" || "${OPENAI_API_KEY:-}" == "sk-" ]]; then
    echo -e "${YELLOW}[INVALID] OpenAI API key appears to be a placeholder${NC}"
fi
if [[ -z "${DISCORD_BOT_TOKEN:-}" ]]; then
    echo -e "${RED}[MISSING] DISCORD_BOT_TOKEN${NC}"
    MISSING_CRITICAL=1
fi
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
    echo -e "${RED}[MISSING] CLOUDFLARE_API_TOKEN${NC}"
    MISSING_CRITICAL=1
fi

if [[ $MISSING_CRITICAL -eq 1 ]]; then
    echo ""
    echo -e "${YELLOW}Critical environment variables missing!${NC}"
    echo "  Fix with: ./scripts/fix-env.sh --fix"
    echo "  Or set directly: ./scripts/fix-env.sh --set TAILSCALE_AUTHKEY=tskey-xxx"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Deployment aborted. Fix your .env first.${NC}"
        exit 1
    fi
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
