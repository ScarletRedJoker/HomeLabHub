#!/bin/bash

# Homelab Dashboard - Simple Local Deployment
# For LAN access only (no SSL needed)

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SERVICE_USER=${SERVICE_USER:-evin}
INSTALL_DIR="/home/$SERVICE_USER/homelab-dashboard"

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Homelab Dashboard - Local Setup    ║${NC}"
echo -e "${BLUE}║   Simple LAN Access (No SSL)         ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""

cd "$INSTALL_DIR"

# Create directories
echo -e "${YELLOW}Setting up directories...${NC}"
mkdir -p logs
mkdir -p /home/$SERVICE_USER/contain/{DiscordTicketBot,plex-server/{config,media,transcode},n8n}

# Create static site directory
if [[ ! -d /var/www/scarletredjoker ]]; then
    sudo mkdir -p /var/www/scarletredjoker
    sudo chown $SERVICE_USER:$SERVICE_USER /var/www/scarletredjoker
    if [[ ! -f /var/www/scarletredjoker/index.html ]]; then
        echo "<h1>Scarlet Red Joker</h1><p>Coming Soon</p>" > /var/www/scarletredjoker/index.html
    fi
fi

# Set up .env if needed
if [[ ! -f .env ]]; then
    echo -e "${YELLOW}Creating .env file...${NC}"
    cp .env.production.example .env
    API_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')
    SESSION_SECRET=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
    sed -i "s/generate-with-openssl-rand-hex-32/$API_KEY/" .env
    sed -i "s/your-session-secret-here/$SESSION_SECRET/" .env
fi

# Load environment
set -a
source .env
set +a

# Build and start
echo -e "${YELLOW}Building dashboard...${NC}"
docker compose -f docker-compose.local.yml build homelab-dashboard

echo -e "${YELLOW}Starting services...${NC}"
docker compose -f docker-compose.local.yml up -d homelab-dashboard

# Start optional services
if [[ "${COMPOSE_PROFILES}" == *"plex"* ]]; then
    docker compose -f docker-compose.local.yml up -d plex
fi

if [[ "${COMPOSE_PROFILES}" == *"n8n"* ]]; then
    docker compose -f docker-compose.local.yml up -d n8n
fi

if [[ "${COMPOSE_PROFILES}" == *"web"* ]]; then
    docker compose -f docker-compose.local.yml up -d scarletredjoker-web
fi

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Deployment Complete!                ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
echo ""
echo "Access your services:"
echo "  Dashboard:     http://localhost:5000"
echo "  Plex:          http://localhost:32400/web"
echo "  n8n:           http://localhost:5003"
echo "  Static Site:   http://localhost:5004"
echo ""
echo "Or from any device on your LAN:"
echo "  http://$(hostname -I | awk '{print $1}'):5000"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Update .env with OpenAI API key (for AI features)"
echo "  2. Get Plex claim: https://www.plex.tv/claim/"
echo "  3. Access dashboard and login with API key from .env"
echo ""
echo -e "${YELLOW}Manage containers:${NC}"
echo "  docker compose -f docker-compose.local.yml ps"
echo "  docker compose -f docker-compose.local.yml logs -f"
echo "  docker compose -f docker-compose.local.yml restart"
echo ""
