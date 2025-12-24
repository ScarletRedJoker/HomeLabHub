#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
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

generate_secret() {
    openssl rand -hex 32
}

generate_password() {
    openssl rand -base64 24 | tr -d '/+=' | head -c 24
}

prompt_value() {
    local var_name=$1
    local description=$2
    local default_value=${3:-}
    local is_secret=${4:-false}
    
    if [[ -n "$default_value" ]]; then
        echo -e "${CYAN}$description${NC}"
        echo -n "  $var_name [$default_value]: "
    else
        echo -e "${CYAN}$description${NC}"
        echo -n "  $var_name: "
    fi
    
    if [[ "$is_secret" == "true" ]]; then
        read -s value
        echo ""
    else
        read value
    fi
    
    echo "${value:-$default_value}"
}

prompt_optional() {
    local var_name=$1
    local description=$2
    
    echo -e "${CYAN}$description${NC}"
    echo -n "  $var_name (press Enter to skip): "
    read value
    echo "$value"
}

check_existing() {
    local var_name=$1
    local env_file=$2
    
    if grep -q "^${var_name}=.\+" "$env_file" 2>/dev/null; then
        grep "^${var_name}=" "$env_file" | cut -d'=' -f2-
    else
        echo ""
    fi
}

update_env() {
    local var_name=$1
    local value=$2
    local env_file=$3
    
    if [[ -z "$value" ]]; then
        return
    fi
    
    if grep -q "^${var_name}=" "$env_file" 2>/dev/null; then
        if [[ "$(uname)" == "Darwin" ]]; then
            sed -i '' "s|^${var_name}=.*|${var_name}=${value}|" "$env_file"
        else
            sed -i "s|^${var_name}=.*|${var_name}=${value}|" "$env_file"
        fi
    else
        echo "${var_name}=${value}" >> "$env_file"
    fi
}

show_usage() {
    echo "Usage: $0 [linode|local]"
    echo ""
    echo "Interactive environment setup wizard for HomeLabHub deployment."
    echo ""
    echo "Targets:"
    echo "  linode  - Setup environment for Linode cloud server"
    echo "  local   - Setup environment for local Ubuntu desktop"
    echo ""
    echo "This wizard will:"
    echo "  1. Auto-generate secrets (session keys, passwords)"
    echo "  2. Prompt for API keys and tokens"
    echo "  3. Validate the configuration"
    echo ""
}

setup_linode() {
    local DEPLOY_DIR="${DEPLOY_ROOT}/linode"
    local ENV_FILE="${DEPLOY_DIR}/.env"
    local EXAMPLE_FILE="${DEPLOY_DIR}/.env.example"
    
    print_header "Linode Environment Setup Wizard"
    
    if [[ ! -f "$ENV_FILE" ]]; then
        if [[ -f "$EXAMPLE_FILE" ]]; then
            cp "$EXAMPLE_FILE" "$ENV_FILE"
            echo -e "${GREEN}Created .env from .env.example${NC}"
        else
            touch "$ENV_FILE"
        fi
    fi
    
    echo ""
    echo "This wizard will help you configure all required environment variables."
    echo "Press Enter to accept defaults in [brackets], or type a new value."
    echo ""
    
    print_section "AUTO-GENERATING SECRETS"
    
    local secrets=(
        "POSTGRES_PASSWORD"
        "DISCORD_DB_PASSWORD"
        "STREAMBOT_DB_PASSWORD"
        "JARVIS_DB_PASSWORD"
        "SERVICE_AUTH_TOKEN"
        "SESSION_SECRET"
        "SECRET_KEY"
        "DISCORD_SESSION_SECRET"
        "STREAMBOT_SESSION_SECRET"
        "STREAM_BOT_WEBHOOK_SECRET"
    )
    
    for secret in "${secrets[@]}"; do
        existing=$(check_existing "$secret" "$ENV_FILE")
        if [[ -z "$existing" ]] || [[ "$existing" == "GENERATE_ME"* ]]; then
            new_secret=$(generate_secret)
            update_env "$secret" "$new_secret" "$ENV_FILE"
            echo -e "  ${GREEN}[GENERATED]${NC} $secret"
        else
            echo -e "  ${YELLOW}[EXISTS]${NC} $secret"
        fi
    done
    
    print_section "DASHBOARD CREDENTIALS"
    
    existing=$(check_existing "WEB_USERNAME" "$ENV_FILE")
    if [[ -z "$existing" ]]; then
        value=$(prompt_value "WEB_USERNAME" "Dashboard admin username" "admin")
        update_env "WEB_USERNAME" "$value" "$ENV_FILE"
    fi
    
    existing=$(check_existing "WEB_PASSWORD" "$ENV_FILE")
    if [[ -z "$existing" ]]; then
        value=$(prompt_value "WEB_PASSWORD" "Dashboard admin password" "$(generate_password)")
        update_env "WEB_PASSWORD" "$value" "$ENV_FILE"
    fi
    
    print_section "OPENAI API KEY (Required for Jarvis AI)"
    echo "Get from: https://platform.openai.com/api-keys"
    
    existing=$(check_existing "OPENAI_API_KEY" "$ENV_FILE")
    if [[ -z "$existing" ]] || [[ "$existing" == "sk-" ]]; then
        value=$(prompt_value "OPENAI_API_KEY" "OpenAI API key" "" "true")
        update_env "OPENAI_API_KEY" "$value" "$ENV_FILE"
    else
        echo -e "  ${YELLOW}[EXISTS]${NC} OPENAI_API_KEY"
    fi
    
    print_section "DISCORD BOT (Required)"
    echo "Get from: https://discord.com/developers/applications"
    
    existing=$(check_existing "DISCORD_BOT_TOKEN" "$ENV_FILE")
    if [[ -z "$existing" ]]; then
        value=$(prompt_value "DISCORD_BOT_TOKEN" "Discord Bot Token" "" "true")
        update_env "DISCORD_BOT_TOKEN" "$value" "$ENV_FILE"
    else
        echo -e "  ${YELLOW}[EXISTS]${NC} DISCORD_BOT_TOKEN"
    fi
    
    existing=$(check_existing "DISCORD_CLIENT_ID" "$ENV_FILE")
    if [[ -z "$existing" ]]; then
        value=$(prompt_value "DISCORD_CLIENT_ID" "Discord Client ID (same as App ID)")
        update_env "DISCORD_CLIENT_ID" "$value" "$ENV_FILE"
        update_env "DISCORD_APP_ID" "$value" "$ENV_FILE"
        update_env "VITE_DISCORD_CLIENT_ID" "$value" "$ENV_FILE"
    else
        echo -e "  ${YELLOW}[EXISTS]${NC} DISCORD_CLIENT_ID"
    fi
    
    existing=$(check_existing "DISCORD_CLIENT_SECRET" "$ENV_FILE")
    if [[ -z "$existing" ]]; then
        value=$(prompt_value "DISCORD_CLIENT_SECRET" "Discord Client Secret" "" "true")
        update_env "DISCORD_CLIENT_SECRET" "$value" "$ENV_FILE"
    else
        echo -e "  ${YELLOW}[EXISTS]${NC} DISCORD_CLIENT_SECRET"
    fi
    
    print_section "TWITCH (Required for Stream Bot)"
    echo "Get from: https://dev.twitch.tv/console/apps"
    
    existing=$(check_existing "TWITCH_CLIENT_ID" "$ENV_FILE")
    if [[ -z "$existing" ]]; then
        value=$(prompt_value "TWITCH_CLIENT_ID" "Twitch Client ID")
        update_env "TWITCH_CLIENT_ID" "$value" "$ENV_FILE"
    else
        echo -e "  ${YELLOW}[EXISTS]${NC} TWITCH_CLIENT_ID"
    fi
    
    existing=$(check_existing "TWITCH_CLIENT_SECRET" "$ENV_FILE")
    if [[ -z "$existing" ]]; then
        value=$(prompt_value "TWITCH_CLIENT_SECRET" "Twitch Client Secret" "" "true")
        update_env "TWITCH_CLIENT_SECRET" "$value" "$ENV_FILE"
    else
        echo -e "  ${YELLOW}[EXISTS]${NC} TWITCH_CLIENT_SECRET"
    fi
    
    print_section "CLOUDFLARE (Required for DNS)"
    echo "Get from: https://dash.cloudflare.com/profile/api-tokens"
    
    existing=$(check_existing "CLOUDFLARE_API_TOKEN" "$ENV_FILE")
    if [[ -z "$existing" ]]; then
        value=$(prompt_value "CLOUDFLARE_API_TOKEN" "Cloudflare API Token (Zone.DNS:Edit permission)" "" "true")
        update_env "CLOUDFLARE_API_TOKEN" "$value" "$ENV_FILE"
    else
        echo -e "  ${YELLOW}[EXISTS]${NC} CLOUDFLARE_API_TOKEN"
    fi
    
    print_section "MONITORING"
    
    existing=$(check_existing "GRAFANA_ADMIN_PASSWORD" "$ENV_FILE")
    if [[ -z "$existing" ]]; then
        value=$(prompt_value "GRAFANA_ADMIN_PASSWORD" "Grafana admin password" "$(generate_password)")
        update_env "GRAFANA_ADMIN_PASSWORD" "$value" "$ENV_FILE"
    else
        echo -e "  ${YELLOW}[EXISTS]${NC} GRAFANA_ADMIN_PASSWORD"
    fi
    
    existing=$(check_existing "CODE_SERVER_PASSWORD" "$ENV_FILE")
    if [[ -z "$existing" ]]; then
        value=$(prompt_value "CODE_SERVER_PASSWORD" "Code-server password" "$(generate_password)")
        update_env "CODE_SERVER_PASSWORD" "$value" "$ENV_FILE"
    else
        echo -e "  ${YELLOW}[EXISTS]${NC} CODE_SERVER_PASSWORD"
    fi
    
    print_section "OPTIONAL PLATFORMS"
    echo "Press Enter to skip if not using these platforms."
    
    for platform in YOUTUBE SPOTIFY KICK; do
        existing=$(check_existing "${platform}_CLIENT_ID" "$ENV_FILE")
        if [[ -z "$existing" ]]; then
            value=$(prompt_optional "${platform}_CLIENT_ID" "${platform} Client ID")
            if [[ -n "$value" ]]; then
                update_env "${platform}_CLIENT_ID" "$value" "$ENV_FILE"
                secret=$(prompt_value "${platform}_CLIENT_SECRET" "${platform} Client Secret" "" "true")
                update_env "${platform}_CLIENT_SECRET" "$secret" "$ENV_FILE"
            fi
        else
            echo -e "  ${YELLOW}[EXISTS]${NC} ${platform}_CLIENT_ID"
        fi
    done
    
    print_section "DISCORD COMMUNITY FEATURES"
    
    existing=$(check_existing "RIG_CITY_SERVER_ID" "$ENV_FILE")
    if [[ -z "$existing" ]]; then
        value=$(prompt_value "RIG_CITY_SERVER_ID" "Discord Server ID for public API" "692850100795473920")
        update_env "RIG_CITY_SERVER_ID" "$value" "$ENV_FILE"
    else
        echo -e "  ${YELLOW}[EXISTS]${NC} RIG_CITY_SERVER_ID"
    fi
    
    print_header "Setup Complete!"
    echo ""
    echo "  .env file saved to: $ENV_FILE"
    echo ""
    echo "  Next steps:"
    echo "    1. Review the file: cat $ENV_FILE"
    echo "    2. Validate: ./scripts/validate-env.sh"
    echo "    3. Deploy: ./deploy.sh"
    echo ""
}

setup_local() {
    local DEPLOY_DIR="${DEPLOY_ROOT}/local"
    local ENV_FILE="${DEPLOY_DIR}/.env"
    local EXAMPLE_FILE="${DEPLOY_DIR}/.env.example"
    
    print_header "Local Ubuntu Environment Setup Wizard"
    
    if [[ ! -f "$ENV_FILE" ]]; then
        if [[ -f "$EXAMPLE_FILE" ]]; then
            cp "$EXAMPLE_FILE" "$ENV_FILE"
            echo -e "${GREEN}Created .env from .env.example${NC}"
        else
            touch "$ENV_FILE"
        fi
    fi
    
    echo ""
    echo "This wizard configures your local Ubuntu homelab server."
    echo "Press Enter to accept defaults in [brackets], or type a new value."
    echo ""
    
    print_section "AUTO-GENERATING SECRETS"
    
    local secrets=("MINIO_ROOT_PASSWORD")
    
    for secret in "${secrets[@]}"; do
        existing=$(check_existing "$secret" "$ENV_FILE")
        if [[ -z "$existing" ]] || [[ "$existing" == "GENERATE_ME"* ]]; then
            new_secret=$(generate_password)
            update_env "$secret" "$new_secret" "$ENV_FILE"
            echo -e "  ${GREEN}[GENERATED]${NC} $secret"
        else
            echo -e "  ${YELLOW}[EXISTS]${NC} $secret"
        fi
    done
    
    print_section "MINIO OBJECT STORAGE"
    
    existing=$(check_existing "MINIO_ROOT_USER" "$ENV_FILE")
    if [[ -z "$existing" ]]; then
        value=$(prompt_value "MINIO_ROOT_USER" "MinIO admin username" "admin")
        update_env "MINIO_ROOT_USER" "$value" "$ENV_FILE"
    else
        echo -e "  ${YELLOW}[EXISTS]${NC} MINIO_ROOT_USER"
    fi
    
    print_section "PLEX MEDIA SERVER"
    echo "Get token from: https://www.plex.tv/claim/"
    
    existing=$(check_existing "PLEX_CLAIM" "$ENV_FILE")
    if [[ -z "$existing" ]] || [[ "$existing" == "claim-xxxxxxxxxxxxx" ]]; then
        value=$(prompt_value "PLEX_CLAIM" "Plex claim token (valid 4 minutes)")
        update_env "PLEX_CLAIM" "$value" "$ENV_FILE"
    else
        echo -e "  ${YELLOW}[EXISTS]${NC} PLEX_CLAIM"
    fi
    
    existing=$(check_existing "PLEX_TOKEN" "$ENV_FILE")
    if [[ -z "$existing" ]]; then
        value=$(prompt_optional "PLEX_TOKEN" "Plex auth token (for API access)")
        if [[ -n "$value" ]]; then
            update_env "PLEX_TOKEN" "$value" "$ENV_FILE"
        fi
    else
        echo -e "  ${YELLOW}[EXISTS]${NC} PLEX_TOKEN"
    fi
    
    print_section "HOME ASSISTANT"
    echo "Get token from: Home Assistant → Profile → Long-Lived Access Tokens"
    
    existing=$(check_existing "HOME_ASSISTANT_TOKEN" "$ENV_FILE")
    if [[ -z "$existing" ]]; then
        value=$(prompt_optional "HOME_ASSISTANT_TOKEN" "Home Assistant long-lived token")
        if [[ -n "$value" ]]; then
            update_env "HOME_ASSISTANT_TOKEN" "$value" "$ENV_FILE"
        fi
    else
        echo -e "  ${YELLOW}[EXISTS]${NC} HOME_ASSISTANT_TOKEN"
    fi
    
    print_section "NAS CONFIGURATION"
    
    existing=$(check_existing "NAS_HOST" "$ENV_FILE")
    if [[ -z "$existing" ]]; then
        value=$(prompt_value "NAS_HOST" "NAS IP address" "192.168.0.185")
        update_env "NAS_HOST" "$value" "$ENV_FILE"
    else
        echo -e "  ${YELLOW}[EXISTS]${NC} NAS_HOST"
    fi
    
    existing=$(check_existing "NAS_USER" "$ENV_FILE")
    if [[ -z "$existing" ]]; then
        value=$(prompt_value "NAS_USER" "NAS username" "admin")
        update_env "NAS_USER" "$value" "$ENV_FILE"
    else
        echo -e "  ${YELLOW}[EXISTS]${NC} NAS_USER"
    fi
    
    existing=$(check_existing "NAS_PASSWORD" "$ENV_FILE")
    if [[ -z "$existing" ]]; then
        value=$(prompt_value "NAS_PASSWORD" "NAS password" "" "true")
        update_env "NAS_PASSWORD" "$value" "$ENV_FILE"
    else
        echo -e "  ${YELLOW}[EXISTS]${NC} NAS_PASSWORD"
    fi
    
    print_section "GAMING VM (OPTIONAL)"
    
    existing=$(check_existing "WINDOWS_VM_IP" "$ENV_FILE")
    if [[ -z "$existing" ]]; then
        value=$(prompt_value "WINDOWS_VM_IP" "Windows VM IP (for Moonlight)" "192.168.122.250")
        update_env "WINDOWS_VM_IP" "$value" "$ENV_FILE"
    else
        echo -e "  ${YELLOW}[EXISTS]${NC} WINDOWS_VM_IP"
    fi
    
    existing=$(check_existing "SUNSHINE_PASS" "$ENV_FILE")
    if [[ -z "$existing" ]]; then
        value=$(prompt_optional "SUNSHINE_PASS" "Sunshine web UI password")
        if [[ -n "$value" ]]; then
            update_env "SUNSHINE_PASS" "$value" "$ENV_FILE"
        fi
    else
        echo -e "  ${YELLOW}[EXISTS]${NC} SUNSHINE_PASS"
    fi
    
    print_header "Setup Complete!"
    echo ""
    echo "  .env file saved to: $ENV_FILE"
    echo ""
    echo "  Next steps:"
    echo "    1. Review the file: cat $ENV_FILE"
    echo "    2. Validate: ./scripts/validate-env.sh"
    echo "    3. Deploy: ./deploy.sh"
    echo ""
}

case "${1:-}" in
    linode)
        setup_linode
        ;;
    local)
        setup_local
        ;;
    -h|--help|help)
        show_usage
        ;;
    *)
        echo ""
        echo -e "${CYAN}HomeLabHub Environment Setup Wizard${NC}"
        echo ""
        echo "Which server are you configuring?"
        echo ""
        echo "  1) Linode (cloud server - Dashboard, Discord Bot, Stream Bot)"
        echo "  2) Local Ubuntu (homelab - Plex, MinIO, Home Assistant)"
        echo ""
        echo -n "Enter choice [1/2]: "
        read choice
        
        case "$choice" in
            1|linode)
                setup_linode
                ;;
            2|local)
                setup_local
                ;;
            *)
                echo -e "${RED}Invalid choice${NC}"
                exit 1
                ;;
        esac
        ;;
esac
