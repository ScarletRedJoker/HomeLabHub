#!/bin/bash
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

generate_secret() {
    openssl rand -base64 32 | tr -d '/+=' | head -c 32
}

normalize_env_file() {
    local env_file="$1"
    if [ -f "$env_file" ]; then
        sed -i 's/\r$//' "$env_file" 2>/dev/null || true
        sed -i '/^$/d' "$env_file" 2>/dev/null || true
    fi
}

get_env_value() {
    local key="$1"
    local env_file="${2:-.env}"
    
    if [ ! -f "$env_file" ]; then
        echo ""
        return
    fi
    
    local value
    value=$(awk -F'=' -v key="$key" '
        $1 == key {
            sub(/^[^=]*=/, "")
            gsub(/^["'\''"]|["'\''"]$/, "")
            print
            exit
        }
    ' "$env_file" 2>/dev/null)
    
    echo "$value"
}

set_env_value() {
    local key="$1"
    local value="$2"
    local env_file="${3:-.env}"
    
    [ ! -f "$env_file" ] && touch "$env_file"
    
    if grep -q "^${key}=" "$env_file" 2>/dev/null; then
        local escaped_value
        escaped_value=$(printf '%s' "$value" | sed 's/[&/\]/\\&/g')
        sed -i "s|^${key}=.*|${key}=${escaped_value}|" "$env_file"
    else
        echo "${key}=${value}" >> "$env_file"
    fi
}

ensure_internal_secrets() {
    local env_file="${1:-.env}"
    local generated=0
    
    local internal_vars=(
        "POSTGRES_PASSWORD"
        "DISCORD_DB_PASSWORD"
        "STREAMBOT_DB_PASSWORD"
        "JARVIS_DB_PASSWORD"
        "SERVICE_AUTH_TOKEN"
        "SESSION_SECRET"
        "DISCORD_SESSION_SECRET"
        "STREAMBOT_SESSION_SECRET"
        "SECRET_KEY"
        "REDIS_PASSWORD"
        "JWT_SECRET"
    )
    
    for var in "${internal_vars[@]}"; do
        local current
        current=$(get_env_value "$var" "$env_file")
        if [ -z "$current" ]; then
            local secret
            secret=$(generate_secret)
            set_env_value "$var" "$secret" "$env_file"
            echo -e "${GREEN}[AUTO]${NC} Generated $var"
            generated=$((generated + 1))
        fi
    done
    
    if [ $generated -eq 0 ]; then
        echo -e "${GREEN}[OK]${NC} All internal secrets present"
    fi
}

prompt_for_token() {
    local key="$1"
    local description="$2"
    local hint="$3"
    local required="$4"
    
    echo ""
    if [ "$required" = "true" ]; then
        echo -e "${RED}[REQUIRED]${NC} $key"
    else
        echo -e "${YELLOW}[OPTIONAL]${NC} $key"
    fi
    echo "  $description"
    echo -e "  ${CYAN}$hint${NC}"
    echo ""
    
    read -r -p "  Enter value (or press Enter to skip): " value
    
    if [ -n "$value" ]; then
        set_env_value "$key" "$value" ".env"
        echo -e "  ${GREEN}✓ Saved${NC}"
        return 0
    else
        if [ "$required" = "true" ]; then
            echo -e "  ${RED}✗ Skipped (required!)${NC}"
            return 1
        else
            echo -e "  ${YELLOW}○ Skipped${NC}"
            return 0
        fi
    fi
}

check_external_tokens() {
    local env_file="${1:-.env}"
    local missing_required=0
    local missing_optional=0
    
    echo ""
    echo -e "${CYAN}━━━ External API Tokens ━━━${NC}"
    
    local discord_token
    discord_token=$(get_env_value "DISCORD_BOT_TOKEN" "$env_file")
    if [ -n "$discord_token" ] && [ "$discord_token" != "xxxxx" ]; then
        echo -e "${GREEN}[OK]${NC} DISCORD_BOT_TOKEN"
    else
        echo -e "${RED}[MISSING]${NC} DISCORD_BOT_TOKEN (required)"
        missing_required=1
    fi
    
    local tailscale_key
    tailscale_key=$(get_env_value "TAILSCALE_AUTHKEY" "$env_file")
    if [ -n "$tailscale_key" ] && [ "$tailscale_key" != "xxxxx" ]; then
        echo -e "${GREEN}[OK]${NC} TAILSCALE_AUTHKEY"
    else
        echo -e "${YELLOW}[SKIP]${NC} TAILSCALE_AUTHKEY (optional - local homelab)"
        missing_optional=1
    fi
    
    local cloudflare_token
    cloudflare_token=$(get_env_value "CLOUDFLARE_API_TOKEN" "$env_file")
    if [ -n "$cloudflare_token" ] && [ "$cloudflare_token" != "xxxxx" ]; then
        echo -e "${GREEN}[OK]${NC} CLOUDFLARE_API_TOKEN"
    else
        echo -e "${YELLOW}[SKIP]${NC} CLOUDFLARE_API_TOKEN (optional - DNS)"
        missing_optional=1
    fi
    
    local openai_key
    openai_key=$(get_env_value "OPENAI_API_KEY" "$env_file")
    local ai_openai_key
    ai_openai_key=$(get_env_value "AI_INTEGRATIONS_OPENAI_API_KEY" "$env_file")
    if [ -n "$openai_key" ] || [ -n "$ai_openai_key" ]; then
        echo -e "${GREEN}[OK]${NC} OPENAI_API_KEY"
    else
        echo -e "${YELLOW}[SKIP]${NC} OPENAI_API_KEY (optional - AI features)"
        missing_optional=1
    fi
    
    echo ""
    
    if [ $missing_required -eq 1 ]; then
        return 1
    fi
    return 0
}

interactive_setup() {
    local env_file="${1:-.env}"
    
    echo ""
    echo -e "${CYAN}═══ Interactive Environment Setup ═══${NC}"
    echo ""
    
    normalize_env_file "$env_file"
    
    echo -e "${CYAN}━━━ Internal Secrets ━━━${NC}"
    ensure_internal_secrets "$env_file"
    
    if ! check_external_tokens "$env_file"; then
        echo -e "${YELLOW}Some required tokens are missing. Let's set them up:${NC}"
        
        local discord_token
        discord_token=$(get_env_value "DISCORD_BOT_TOKEN" "$env_file")
        if [ -z "$discord_token" ] || [ "$discord_token" = "xxxxx" ]; then
            prompt_for_token "DISCORD_BOT_TOKEN" \
                "Discord bot authentication token" \
                "https://discord.com/developers/applications" \
                "true"
        fi
        
        echo ""
        read -r -p "Would you like to configure optional tokens? (y/N) " configure_optional
        
        if [[ "$configure_optional" =~ ^[Yy]$ ]]; then
            local tailscale_key
            tailscale_key=$(get_env_value "TAILSCALE_AUTHKEY" "$env_file")
            if [ -z "$tailscale_key" ] || [ "$tailscale_key" = "xxxxx" ]; then
                prompt_for_token "TAILSCALE_AUTHKEY" \
                    "Tailscale mesh network key (for local homelab)" \
                    "https://login.tailscale.com/admin/settings/keys" \
                    "false"
            fi
            
            local cloudflare_token
            cloudflare_token=$(get_env_value "CLOUDFLARE_API_TOKEN" "$env_file")
            if [ -z "$cloudflare_token" ] || [ "$cloudflare_token" = "xxxxx" ]; then
                prompt_for_token "CLOUDFLARE_API_TOKEN" \
                    "Cloudflare API token (for DNS management)" \
                    "https://dash.cloudflare.com/profile/api-tokens" \
                    "false"
            fi
            
            local openai_key
            openai_key=$(get_env_value "OPENAI_API_KEY" "$env_file")
            if [ -z "$openai_key" ]; then
                prompt_for_token "OPENAI_API_KEY" \
                    "OpenAI API key (for AI features)" \
                    "https://platform.openai.com/api-keys" \
                    "false"
            fi
        fi
        
        echo ""
        check_external_tokens "$env_file"
    fi
    
    echo -e "${GREEN}✓ Environment setup complete${NC}"
}

env_doctor() {
    local env_file="${1:-.env}"
    local action="${2:-check}"
    local deployment_type="${3:-linode}"
    
    case "$action" in
        check)
            echo -e "${CYAN}═══ Environment Health Check ═══${NC}"
            normalize_env_file "$env_file"
            echo ""
            
            local missing_critical=0
            local missing_optional=0
            
            echo -e "${CYAN}━━━ Internal Secrets (auto-generated) ━━━${NC}"
            local internal_vars=(
                "POSTGRES_PASSWORD"
                "DISCORD_DB_PASSWORD"
                "STREAMBOT_DB_PASSWORD"
                "JARVIS_DB_PASSWORD"
                "SERVICE_AUTH_TOKEN"
                "SESSION_SECRET"
                "DISCORD_SESSION_SECRET"
                "STREAMBOT_SESSION_SECRET"
            )
            
            for var in "${internal_vars[@]}"; do
                local val
                val=$(get_env_value "$var" "$env_file")
                if [ -n "$val" ] && [ "$val" != "xxxxx" ]; then
                    echo -e "${GREEN}[OK]${NC} $var"
                else
                    echo -e "${RED}[MISSING]${NC} $var - run './deploy.sh setup' to generate"
                    missing_critical=1
                fi
            done
            
            echo ""
            echo -e "${CYAN}━━━ Discord Bot Secrets ━━━${NC}"
            local discord_vars=("DISCORD_BOT_TOKEN" "DISCORD_CLIENT_ID" "DISCORD_CLIENT_SECRET" "DISCORD_APP_ID")
            for var in "${discord_vars[@]}"; do
                local val
                val=$(get_env_value "$var" "$env_file")
                if [ -n "$val" ] && [ "$val" != "xxxxx" ]; then
                    echo -e "${GREEN}[OK]${NC} $var"
                else
                    echo -e "${RED}[MISSING]${NC} $var - https://discord.com/developers"
                    missing_critical=1
                fi
            done
            
            echo ""
            echo -e "${CYAN}━━━ Stream Bot OAuth Secrets ━━━${NC}"
            local twitch_vars=("TWITCH_CLIENT_ID" "TWITCH_CLIENT_SECRET")
            for var in "${twitch_vars[@]}"; do
                local val
                val=$(get_env_value "$var" "$env_file")
                if [ -n "$val" ] && [ "$val" != "xxxxx" ]; then
                    echo -e "${GREEN}[OK]${NC} $var"
                else
                    echo -e "${YELLOW}[WARN]${NC} $var - https://dev.twitch.tv/console"
                    missing_optional=1
                fi
            done
            
            local youtube_vars=("YOUTUBE_CLIENT_ID" "YOUTUBE_CLIENT_SECRET")
            for var in "${youtube_vars[@]}"; do
                local val
                val=$(get_env_value "$var" "$env_file")
                if [ -n "$val" ] && [ "$val" != "xxxxx" ]; then
                    echo -e "${GREEN}[OK]${NC} $var"
                else
                    echo -e "${YELLOW}[WARN]${NC} $var - https://console.cloud.google.com"
                    missing_optional=1
                fi
            done
            
            echo ""
            echo -e "${CYAN}━━━ Infrastructure Secrets ━━━${NC}"
            local infra_vars=("TAILSCALE_AUTHKEY" "CLOUDFLARE_API_TOKEN" "OPENAI_API_KEY" "DOMAIN")
            for var in "${infra_vars[@]}"; do
                local val
                val=$(get_env_value "$var" "$env_file")
                if [ -n "$val" ] && [ "$val" != "xxxxx" ] && [ "$val" != "example.com" ]; then
                    echo -e "${GREEN}[OK]${NC} $var"
                else
                    if [ "$var" = "DOMAIN" ]; then
                        echo -e "${RED}[MISSING]${NC} $var - set your domain (e.g., example.com)"
                        missing_critical=1
                    else
                        echo -e "${YELLOW}[WARN]${NC} $var (optional)"
                        missing_optional=1
                    fi
                fi
            done
            
            echo ""
            if [ $missing_critical -gt 0 ]; then
                echo -e "${RED}═══ CRITICAL: Missing required secrets! ═══${NC}"
                echo "Run './deploy.sh setup' to configure interactively"
                echo "Or copy .env.example and fill in values manually"
                return 1
            elif [ $missing_optional -gt 0 ]; then
                echo -e "${YELLOW}═══ Some optional features disabled ═══${NC}"
                echo "Run './deploy.sh setup' to configure additional services"
                return 0
            else
                echo -e "${GREEN}═══ All secrets configured! ═══${NC}"
                return 0
            fi
            ;;
        generate)
            echo -e "${CYAN}═══ Generating Missing Secrets ═══${NC}"
            ensure_internal_secrets "$env_file"
            ;;
        setup)
            interactive_setup "$env_file"
            ;;
        *)
            echo "Usage: env_doctor <env_file> [check|generate|setup]"
            ;;
    esac
}
