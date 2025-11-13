#!/bin/bash

# ======================================================================
# Environment Configuration Checker
# Validates .env file and shows what needs to be configured
# ======================================================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

print_ok() { echo -e "  ${GREEN}✓${NC} $1"; }
print_missing() { echo -e "  ${RED}✗${NC} $1"; }
print_optional() { echo -e "  ${YELLOW}○${NC} $1"; }

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Environment Configuration Check    ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""

if [[ ! -f .env ]]; then
    echo -e "${RED}✗ .env file not found!${NC}"
    echo ""
    echo "Run this to create one:"
    echo "  ./setup-env.sh"
    echo ""
    exit 1
fi

source .env

MISSING=0
OPTIONAL_MISSING=0

# Check required variables
echo -e "${BLUE}Required Configuration:${NC}"

if [[ "$OPENAI_API_KEY" =~ ^CHANGE_ME ]] || [[ -z "$OPENAI_API_KEY" ]]; then
    print_missing "OPENAI_API_KEY not configured"
    echo "             Get from: https://platform.openai.com/api-keys"
    ((MISSING++))
else
    print_ok "OPENAI_API_KEY configured"
fi

if [[ "$DISCORD_BOT_TOKEN" =~ ^CHANGE_ME ]] || [[ -z "$DISCORD_BOT_TOKEN" ]]; then
    print_missing "Discord credentials not configured"
    echo "             Get from: https://discord.com/developers/applications"
    ((MISSING++))
else
    print_ok "Discord credentials configured"
fi

if [[ "$PLEX_CLAIM" =~ ^CHANGE_ME ]] || [[ -z "$PLEX_CLAIM" ]]; then
    print_missing "PLEX_CLAIM not configured"
    echo "             Get from: https://www.plex.tv/claim/ (expires in 4 min!)"
    ((MISSING++))
else
    print_ok "PLEX_CLAIM configured"
fi

if [[ -z "$STREAMBOT_SESSION_SECRET" ]]; then
    print_missing "STREAMBOT_SESSION_SECRET not configured (will be auto-generated)"
    ((MISSING++))
else
    print_ok "StreamBot session secret configured"
fi

echo ""
echo -e "${BLUE}Optional Configuration:${NC}"

if [[ "$VNC_BASIC_AUTH" == "evin:\$\$apr1\$\$8kVPkqVc\$\$P7YtMjKrJzTgQqWXqEJLT1" ]]; then
    print_optional "VNC web access using default password (evin/changeme)"
    ((OPTIONAL_MISSING++))
else
    print_ok "VNC web access password customized"
fi

if [[ "$ENABLE_SCRIPT_EXECUTION" == "true" ]]; then
    print_ok "Script execution ENABLED (SSH configured for remote commands)"
else
    print_optional "Script execution DISABLED (more secure, but limits functionality)"
fi

if [[ "$TRAEFIK_DASHBOARD_AUTH" == "admin:\$\$apr1\$\$8kVPkqVc\$\$P7YtMjKrJzTgQqWXqEJLT1" ]]; then
    print_optional "Traefik dashboard using default password (admin/changeme)"
    ((OPTIONAL_MISSING++))
else
    print_ok "Traefik dashboard password customized"
fi

echo ""
echo -e "${BLUE}Auto-Generated Secrets:${NC}"
print_ok "DASHBOARD_API_KEY: ${DASHBOARD_API_KEY:0:20}..."
print_ok "SESSION_SECRET: ${SESSION_SECRET:0:20}..."
print_ok "DISCORD_DB_PASSWORD: ${DISCORD_DB_PASSWORD:0:10}..."
print_ok "DISCORD_SESSION_SECRET: ${DISCORD_SESSION_SECRET:0:20}..."
print_ok "STREAMBOT_SESSION_SECRET: ${STREAMBOT_SESSION_SECRET:0:20}..."
print_ok "VNC_PASSWORD: ${VNC_PASSWORD:0:8}..."
print_ok "VNC_USER_PASSWORD: ${VNC_USER_PASSWORD:0:8}..."

echo ""
echo "========================================="

if [[ $MISSING -eq 0 ]]; then
    echo -e "${GREEN}✓ All required configuration is complete!${NC}"
    echo ""
    echo "You can now deploy:"
    echo "  ./deploy-unified.sh"
    echo ""
    
    if [[ $OPTIONAL_MISSING -gt 0 ]]; then
        echo -e "${YELLOW}Note: $OPTIONAL_MISSING optional items not configured${NC}"
        echo "Services will work, but some features may be limited."
    fi
else
    echo -e "${RED}✗ $MISSING required items need configuration${NC}"
    echo ""
    echo "Edit .env to add missing values:"
    echo "  nano .env"
    echo ""
    echo "Then run this check again:"
    echo "  ./check-env.sh"
fi

echo ""
