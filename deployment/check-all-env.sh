#!/bin/bash

# Simple Environment Variable Checker
# Checks all required env vars across all services and reports what's missing

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║  Environment Variables Check          ║"
echo "╚═══════════════════════════════════════╝"
echo ""

# Load .env file
if [ ! -f .env ]; then
    echo -e "${RED}❌ No .env file found!${NC}"
    echo "Run: ./setup-env.sh"
    exit 1
fi

source .env

MISSING=0
PLACEHOLDERS=0

check_var() {
    local var_name=$1
    local var_value="${!var_name}"
    local description=$3
    local where_to_get=$4
    
    if [[ -z "$var_value" ]]; then
        echo -e "${RED}✗${NC} $var_name - ${RED}MISSING${NC}"
        if [[ -n "$where_to_get" ]]; then
            echo -e "  ${BLUE}→${NC} Get from: $where_to_get"
        fi
        ((MISSING++))
    elif [[ "$var_value" =~ ^(CHANGE_ME|your_|placeholder) ]]; then
        echo -e "${YELLOW}⚠${NC} $var_name - ${YELLOW}PLACEHOLDER${NC}"
        if [[ -n "$where_to_get" ]]; then
            echo -e "  ${BLUE}→${NC} Get from: $where_to_get"
        fi
        ((PLACEHOLDERS++))
    else
        echo -e "${GREEN}✓${NC} $var_name"
    fi
}

# ============================================
# Discord Bot Variables
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Discord Ticket Bot (bot.rig-city.com)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

check_var "DISCORD_BOT_TOKEN" "" "Bot token" "https://discord.com/developers/applications → Your App → Bot → Token"
check_var "DISCORD_CLIENT_ID" "" "OAuth2 Client ID" "https://discord.com/developers/applications → Your App → OAuth2 → Client ID"
check_var "DISCORD_CLIENT_SECRET" "" "OAuth2 Client Secret" "https://discord.com/developers/applications → Your App → OAuth2 → Client Secret"
check_var "DISCORD_APP_ID" "" "Application ID" "https://discord.com/developers/applications → Your App → Application ID"
check_var "VITE_DISCORD_CLIENT_ID" "" "Same as Client ID" "(Usually same as DISCORD_CLIENT_ID)"
check_var "DISCORD_DB_PASSWORD" "" "Database password" "(Auto-generated secure password)"
check_var "DISCORD_SESSION_SECRET" "" "Session secret" "(Auto-generated secure secret)"

echo ""
echo -e "${YELLOW}⚠ IMPORTANT: Add OAuth2 Redirect URI:${NC}"
echo -e "  ${BLUE}→${NC} https://bot.rig-city.com/callback"
echo -e "  ${BLUE}→${NC} Go to: Discord Developer Portal → Your App → OAuth2 → Redirects"
echo ""

# ============================================
# Stream Bot Variables
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Stream Bot (stream.rig-city.com)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

check_var "TWITCH_CLIENT_ID" "" "Twitch Client ID" "https://dev.twitch.tv/console/apps → Your App → Client ID"
check_var "TWITCH_CLIENT_SECRET" "" "Twitch Client Secret" "https://dev.twitch.tv/console/apps → Your App → New Secret"
check_var "TWITCH_CHANNEL" "" "Twitch channel name" "(Your Twitch username)"
check_var "STREAMBOT_OPENAI_API_KEY" "" "OpenAI API key" "https://platform.openai.com/api-keys (or use main OPENAI_API_KEY)"
check_var "STREAMBOT_DATABASE_URL" "" "Database URL" "(Format: postgresql://user:pass@host:port/db)"
check_var "STREAMBOT_SESSION_SECRET" "" "Session secret" "(Auto-generated secure secret)"

echo ""

# ============================================
# Homelab Dashboard Variables
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Homelab Dashboard (host.evindrake.net)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

check_var "DASHBOARD_API_KEY" "" "Dashboard API key" "(Auto-generated - for API access)"
check_var "SESSION_SECRET" "" "Flask session secret" "(Auto-generated secure secret)"
check_var "WEB_USERNAME" "" "Dashboard username" "(Default: evin)"
check_var "WEB_PASSWORD" "" "Dashboard password" "(Change from default!)"
check_var "AI_INTEGRATIONS_OPENAI_API_KEY" "" "OpenAI API key" "https://platform.openai.com/api-keys"
check_var "AI_INTEGRATIONS_OPENAI_BASE_URL" "" "OpenAI base URL" "(Default: https://api.openai.com/v1)"

echo ""

# ============================================
# Other Services
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Other Services${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

check_var "PLEX_CLAIM" "" "Plex claim token" "https://www.plex.tv/claim/ (expires in 4 min!)"
check_var "VNC_PASSWORD" "" "VNC password" "(Your VNC access password)"
check_var "OPENAI_API_KEY" "" "Main OpenAI key" "https://platform.openai.com/api-keys (fallback for all services)"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# ============================================
# Summary
# ============================================
echo ""
if [ $MISSING -eq 0 ] && [ $PLACEHOLDERS -eq 0 ]; then
    echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✓ All variables configured!         ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
    echo ""
    echo "✓ Ready to deploy!"
    echo ""
else
    echo -e "${YELLOW}╔═══════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║  Action Required                      ║${NC}"
    echo -e "${YELLOW}╚═══════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${RED}Missing variables: $MISSING${NC}"
    echo -e "${YELLOW}Placeholder values: $PLACEHOLDERS${NC}"
    echo ""
    echo "📝 To fix:"
    echo "   1. Edit .env file: nano .env"
    echo "   2. Fill in the missing/placeholder values above"
    echo "   3. Save and run this script again"
    echo ""
    echo "💡 Quick tips:"
    echo "   • Discord OAuth: Add redirect URI before testing"
    echo "   • Secrets: Auto-generated ones are OK to keep"
    echo "   • Passwords: Change 'homelab' to something secure!"
    echo ""
fi

exit 0
