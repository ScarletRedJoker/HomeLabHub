#!/bin/bash
# Comprehensive Environment Variable Checker
# Validates ALL required environment variables for every service

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}║        🔍 CHECKING ALL ENVIRONMENT VARIABLES 🔍             ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Load .env file if it exists
if [ -f ".env" ]; then
    echo -e "${GREEN}✓ Found .env file${NC}"
    set -a
    source .env
    set +a
else
    echo -e "${RED}✗ .env file not found!${NC}"
    echo ""
    echo "Run: ./homelab-manager.sh (option 10) to generate .env file"
    exit 1
fi

MISSING=()
WARNINGS=()
OK_COUNT=0

# Helper function to check required variable
check_required() {
    local var_name="$1"
    local service="$2"
    
    if [ -z "${!var_name}" ]; then
        MISSING+=("${RED}✗${NC} $service: $var_name")
    else
        OK_COUNT=$((OK_COUNT + 1))
    fi
}

# Helper function to check optional variable
check_optional() {
    local var_name="$1"
    local service="$2"
    
    if [ -z "${!var_name}" ]; then
        WARNINGS+=("${YELLOW}⚠${NC} $service: $var_name (optional)")
    else
        OK_COUNT=$((OK_COUNT + 1))
    fi
}

echo -e "${BLUE}[1/10] PostgreSQL Database...${NC}"
check_required "DISCORD_DB_PASSWORD" "PostgreSQL"
check_required "STREAMBOT_DB_PASSWORD" "PostgreSQL"
check_required "JARVIS_DB_PASSWORD" "PostgreSQL"

echo -e "${BLUE}[2/10] Dashboard (Nebula Command)...${NC}"
check_required "JARVIS_DATABASE_URL" "Dashboard"
check_required "WEB_USERNAME" "Dashboard"
check_required "WEB_PASSWORD" "Dashboard"
check_required "SESSION_SECRET" "Dashboard"
check_required "DASHBOARD_API_KEY" "Dashboard"
check_required "MINIO_ROOT_USER" "Dashboard"
check_required "MINIO_ROOT_PASSWORD" "Dashboard"
check_optional "HOME_ASSISTANT_URL" "Dashboard"
check_optional "HOME_ASSISTANT_TOKEN" "Dashboard"
check_optional "OPENAI_API_KEY" "Dashboard"

echo -e "${BLUE}[3/10] Stream Bot (stream.rig-city.com)...${NC}"
check_required "STREAMBOT_DB_PASSWORD" "Stream Bot"
check_required "STREAMBOT_SESSION_SECRET" "Stream Bot"
check_optional "STREAMBOT_OPENAI_API_KEY" "Stream Bot"
check_optional "OPENAI_API_KEY" "Stream Bot"
check_optional "TWITCH_CLIENT_ID" "Stream Bot"
check_optional "TWITCH_CLIENT_SECRET" "Stream Bot"
check_optional "YOUTUBE_CLIENT_ID" "Stream Bot"
check_optional "YOUTUBE_CLIENT_SECRET" "Stream Bot"
check_optional "KICK_CLIENT_ID" "Stream Bot"
check_optional "KICK_CLIENT_SECRET" "Stream Bot"

echo -e "${BLUE}[4/10] Discord Bot (bot.rig-city.com)...${NC}"
check_required "DISCORD_DB_PASSWORD" "Discord Bot"
check_required "DISCORD_BOT_TOKEN" "Discord Bot"
check_required "DISCORD_CLIENT_ID" "Discord Bot"
check_required "DISCORD_CLIENT_SECRET" "Discord Bot"
check_required "DISCORD_SESSION_SECRET" "Discord Bot"
check_optional "TWITCH_CLIENT_ID" "Discord Bot"
check_optional "TWITCH_CLIENT_SECRET" "Discord Bot"

echo -e "${BLUE}[5/10] VNC Desktop (vnc.evindrake.net)...${NC}"
check_required "VNC_PASSWORD" "VNC Desktop"
check_required "VNC_USER_PASSWORD" "VNC Desktop"

echo -e "${BLUE}[6/10] Code Server (code.evindrake.net)...${NC}"
check_required "CODE_SERVER_PASSWORD" "Code Server"

echo -e "${BLUE}[7/10] MinIO Object Storage...${NC}"
check_required "MINIO_ROOT_USER" "MinIO"
check_required "MINIO_ROOT_PASSWORD" "MinIO"

echo -e "${BLUE}[8/10] Home Assistant (home.evindrake.net)...${NC}"
check_optional "HOME_ASSISTANT_URL" "Home Assistant"
check_optional "HOME_ASSISTANT_TOKEN" "Home Assistant"

echo -e "${BLUE}[9/10] Plex (plex.evindrake.net)...${NC}"
check_optional "PLEX_CLAIM" "Plex"

echo -e "${BLUE}[10/10] n8n (n8n.evindrake.net)...${NC}"
check_optional "N8N_ENCRYPTION_KEY" "n8n"

# Results
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    RESULTS                                   ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ ${#MISSING[@]} -gt 0 ]; then
    echo -e "${RED}CRITICAL - Missing Required Variables:${NC}"
    printf '%s\n' "${MISSING[@]}"
    echo ""
fi

if [ ${#WARNINGS[@]} -gt 0 ]; then
    echo -e "${YELLOW}Optional Variables Not Set:${NC}"
    printf '%s\n' "${WARNINGS[@]}"
    echo ""
fi

echo -e "${GREEN}✓ $OK_COUNT environment variables configured${NC}"

if [ ${#MISSING[@]} -gt 0 ]; then
    echo ""
    echo -e "${RED}⚠ SERVICES WILL FAIL WITHOUT REQUIRED VARIABLES!${NC}"
    echo ""
    echo "Fix by running: ./homelab-manager.sh (option 10)"
    exit 1
else
    echo ""
    echo -e "${GREEN}✅ ALL REQUIRED ENVIRONMENT VARIABLES ARE SET!${NC}"
    echo ""
    echo "Your services should start successfully."
    exit 0
fi
