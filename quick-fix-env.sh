#!/bin/bash

# Quick Environment Fix Script
# Automatically generates missing secrets in .env file

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "════════════════════════════════════════════════════════════════"
echo "  Quick .env Fix - Auto-generating Missing Secrets"
echo "════════════════════════════════════════════════════════════════"
echo ""

if [ ! -f .env ]; then
    echo -e "${RED}✗ .env file not found!${NC}"
    echo "Creating from template..."
    cp .env.example .env
    echo -e "${GREEN}✓ Created .env from .env.example${NC}"
fi

# Backup existing .env
cp .env .env.backup
echo -e "${BLUE}Backed up .env to .env.backup${NC}"
echo ""

# Function to update placeholder variables
update_if_placeholder() {
    local var_name=$1
    local new_value=$2
    local current_value=$(grep "^${var_name}=" .env | cut -d'=' -f2)
    
    if [[ "$current_value" == *"YOUR_"* ]] || [ -z "$current_value" ]; then
        sed -i "s|^${var_name}=.*|${var_name}=${new_value}|" .env
        echo -e "${GREEN}✓ Generated ${var_name}${NC}"
        return 0
    else
        echo -e "${BLUE}• ${var_name} already set, keeping existing value${NC}"
        return 1
    fi
}

echo "Generating secrets and updating .env..."
echo ""

# Generate random secrets
SESSION_SECRET=$(openssl rand -hex 32)
DASHBOARD_API_KEY=$(openssl rand -hex 32)
SECRET_KEY=$(openssl rand -hex 32)
SERVICE_AUTH_TOKEN=$(openssl rand -hex 32)
STREAMBOT_SESSION_SECRET=$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')

# Update secrets
update_if_placeholder "SESSION_SECRET" "$SESSION_SECRET"
update_if_placeholder "DASHBOARD_API_KEY" "$DASHBOARD_API_KEY"
update_if_placeholder "SECRET_KEY" "$SECRET_KEY"
update_if_placeholder "SERVICE_AUTH_TOKEN" "$SERVICE_AUTH_TOKEN"
update_if_placeholder "STREAMBOT_SESSION_SECRET" "$STREAMBOT_SESSION_SECRET"

# Generate database passwords if needed
POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
DISCORD_DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
STREAMBOT_DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
JARVIS_DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)

update_if_placeholder "POSTGRES_PASSWORD" "$POSTGRES_PASSWORD"
update_if_placeholder "DISCORD_DB_PASSWORD" "$DISCORD_DB_PASSWORD"
update_if_placeholder "STREAMBOT_DB_PASSWORD" "$STREAMBOT_DB_PASSWORD"
update_if_placeholder "JARVIS_DB_PASSWORD" "$JARVIS_DB_PASSWORD"

# Set web password to user's standard password if still placeholder
WEB_PASSWORD=$(grep "^WEB_PASSWORD=" .env | cut -d'=' -f2)
if [[ "$WEB_PASSWORD" == *"YOUR_"* ]] || [ -z "$WEB_PASSWORD" ]; then
    echo ""
    echo -e "${YELLOW}⚠ WEB_PASSWORD needs to be set manually${NC}"
    echo "Using your standard password: Brs=2729"
    sed -i 's|^WEB_PASSWORD=.*|WEB_PASSWORD=Brs=2729|' .env
    echo -e "${GREEN}✓ Set WEB_PASSWORD${NC}"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo -e "${GREEN}✓ Environment configuration updated!${NC}"
echo ""
echo -e "${YELLOW}IMPORTANT:${NC}"
echo "  • Backup saved to: .env.backup"
echo "  • You may need to update database URLs with new passwords"
echo "  • Remember to set OPENAI_API_KEY if using AI features"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Review .env: cat .env | grep -v '^#' | grep -v '^$'"
echo "  2. Bootstrap again: ./bootstrap-homelab.sh"
echo "════════════════════════════════════════════════════════════════"
