#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${DEPLOY_DIR}/.env"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
}

print_section() {
    echo ""
    echo -e "${YELLOW}━━━ $1 ━━━${NC}"
}

ERRORS=0
WARNINGS=0

check_required() {
    local var_name=$1
    local description=$2
    
    if [[ -z "${!var_name:-}" ]]; then
        echo -e "  ${RED}[MISSING]${NC} $var_name - $description"
        ERRORS=$((ERRORS + 1))
        return 1
    else
        local value="${!var_name}"
        local masked="${value:0:4}****${value: -4}"
        if [[ ${#value} -lt 8 ]]; then
            masked="****"
        fi
        echo -e "  ${GREEN}[OK]${NC} $var_name = $masked"
        return 0
    fi
}

check_optional() {
    local var_name=$1
    local description=$2
    
    if [[ -z "${!var_name:-}" ]]; then
        echo -e "  ${YELLOW}[OPTIONAL]${NC} $var_name - $description (not set)"
        WARNINGS=$((WARNINGS + 1))
        return 1
    else
        local value="${!var_name}"
        local masked="${value:0:4}****${value: -4}"
        if [[ ${#value} -lt 8 ]]; then
            masked="****"
        fi
        echo -e "  ${GREEN}[OK]${NC} $var_name = $masked"
        return 0
    fi
}

print_header "Environment Variable Validation"
echo "  Checking: $ENV_FILE"

if [[ ! -f "$ENV_FILE" ]]; then
    echo -e "\n${RED}[FATAL] .env file not found at $ENV_FILE${NC}"
    echo "  Create one from .env.example:"
    echo "    cp .env.example .env"
    echo "    nano .env"
    exit 1
fi

source "$ENV_FILE"

print_section "Core Infrastructure (REQUIRED)"
check_required "POSTGRES_PASSWORD" "PostgreSQL root password"
check_required "DISCORD_DB_PASSWORD" "Discord bot database password"
check_required "STREAMBOT_DB_PASSWORD" "Stream bot database password"
check_required "JARVIS_DB_PASSWORD" "Jarvis AI database password"

print_section "Authentication & Security (REQUIRED)"
check_required "SERVICE_AUTH_TOKEN" "Inter-service authentication token"
check_required "WEB_USERNAME" "Dashboard web login username"
check_required "WEB_PASSWORD" "Dashboard web login password"

print_section "AI Services (REQUIRED)"
check_required "OPENAI_API_KEY" "OpenAI API key for Jarvis AI"

print_section "Discord Bot (REQUIRED)"
check_required "DISCORD_BOT_TOKEN" "Discord bot token"
check_required "DISCORD_CLIENT_ID" "Discord OAuth client ID"
check_required "DISCORD_CLIENT_SECRET" "Discord OAuth client secret"
check_required "DISCORD_APP_ID" "Discord application ID"
check_required "VITE_DISCORD_CLIENT_ID" "Discord client ID for frontend"
check_required "DISCORD_SESSION_SECRET" "Discord session encryption secret"

print_section "Stream Bot - Twitch (REQUIRED)"
check_required "TWITCH_CLIENT_ID" "Twitch OAuth client ID"
check_required "TWITCH_CLIENT_SECRET" "Twitch OAuth client secret"
check_required "STREAMBOT_SESSION_SECRET" "Stream bot session secret"

print_section "Stream Bot - YouTube (OPTIONAL)"
check_optional "YOUTUBE_CLIENT_ID" "YouTube OAuth client ID"
check_optional "YOUTUBE_CLIENT_SECRET" "YouTube OAuth client secret"

print_section "Stream Bot - Spotify (OPTIONAL)"
check_optional "SPOTIFY_CLIENT_ID" "Spotify OAuth client ID"
check_optional "SPOTIFY_CLIENT_SECRET" "Spotify OAuth client secret"

print_section "Stream Bot - Kick (OPTIONAL)"
check_optional "KICK_CLIENT_ID" "Kick OAuth client ID"
check_optional "KICK_CLIENT_SECRET" "Kick OAuth client secret"

print_section "Code Server (REQUIRED)"
check_required "CODE_SERVER_PASSWORD" "Code-server web password"

print_section "n8n Workflow Automation (OPTIONAL)"
check_optional "N8N_BASIC_AUTH_USER" "n8n basic auth username"
check_optional "N8N_BASIC_AUTH_PASSWORD" "n8n basic auth password"

print_section "Monitoring - Grafana (REQUIRED)"
check_required "GRAFANA_ADMIN_PASSWORD" "Grafana admin password"
check_optional "GRAFANA_ADMIN_USER" "Grafana admin username (defaults to 'admin')"

print_section "DNS Management (REQUIRED)"
check_required "CLOUDFLARE_API_TOKEN" "Cloudflare API token for DNS automation"

print_section "Local Services Access (OPTIONAL)"
check_optional "TAILSCALE_LOCAL_HOST" "Tailscale IP for local Ubuntu host (e.g., 10.200.0.2)"
check_optional "PLEX_TOKEN" "Plex authentication token"
check_optional "HOME_ASSISTANT_TOKEN" "Home Assistant long-lived access token"

print_header "Validation Summary"

if [[ $ERRORS -gt 0 ]]; then
    echo -e "  ${RED}[FAILED]${NC} $ERRORS required variable(s) missing"
    echo -e "  ${YELLOW}[WARNING]${NC} $WARNINGS optional variable(s) not set"
    echo ""
    echo -e "  ${RED}Cannot proceed with deployment until all required variables are set.${NC}"
    echo ""
    echo "  Edit your .env file:"
    echo "    nano $ENV_FILE"
    echo ""
    exit 1
else
    echo -e "  ${GREEN}[PASSED]${NC} All required variables are set"
    if [[ $WARNINGS -gt 0 ]]; then
        echo -e "  ${YELLOW}[INFO]${NC} $WARNINGS optional variable(s) not set (services may have limited functionality)"
    fi
    echo ""
    echo -e "  ${GREEN}Environment validation successful!${NC}"
    exit 0
fi
