#!/bin/bash

# ======================================================================
# Environment Setup Script
# Generates .env file with random secrets
# ======================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_info() { echo -e "${BLUE}ℹ${NC} $1"; }

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Homelab .env File Generator        ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""

# Function to get existing value from .env or use default
get_env_value() {
    local key=$1
    local default=$2
    
    if [[ -f .env ]]; then
        # Extract value, handling quotes and special characters
        local value=$(grep "^${key}=" .env | cut -d'=' -f2- | sed 's/^["'"'"']//' | sed 's/["'"'"']$//')
        if [[ -n "$value" && "$value" != "CHANGE_ME" && "$value" != "" ]]; then
            echo "$value"
            return
        fi
    fi
    
    echo "$default"
}

# Check if .env exists and load existing values
if [[ -f .env ]]; then
    print_warning ".env file already exists"
    print_info "Preserving existing API keys and tokens..."
    echo ""
    
    # Load existing configured values
    EXISTING_OPENAI=$(get_env_value "OPENAI_API_KEY" "")
    EXISTING_DISCORD_BOT_TOKEN=$(get_env_value "DISCORD_BOT_TOKEN" "")
    EXISTING_DISCORD_CLIENT_ID=$(get_env_value "DISCORD_CLIENT_ID" "")
    EXISTING_DISCORD_CLIENT_SECRET=$(get_env_value "DISCORD_CLIENT_SECRET" "")
    EXISTING_DISCORD_APP_ID=$(get_env_value "DISCORD_APP_ID" "")
    EXISTING_TWITCH_CLIENT_ID=$(get_env_value "TWITCH_CLIENT_ID" "")
    EXISTING_TWITCH_CLIENT_SECRET=$(get_env_value "TWITCH_CLIENT_SECRET" "")
    EXISTING_TWITCH_CHANNEL=$(get_env_value "TWITCH_CHANNEL" "")
    EXISTING_PLEX_CLAIM=$(get_env_value "PLEX_CLAIM" "")
    EXISTING_WEB_USERNAME=$(get_env_value "WEB_USERNAME" "evin")
    EXISTING_WEB_PASSWORD=$(get_env_value "WEB_PASSWORD" "homelab")
    EXISTING_WINDOWS_KVM_IP=$(get_env_value "WINDOWS_KVM_IP" "192.168.1.XXX")
    EXISTING_LETSENCRYPT_EMAIL=$(get_env_value "LETSENCRYPT_EMAIL" "admin@evindrake.net")
    
    # Load existing secrets (keep if set)
    EXISTING_DASHBOARD_API_KEY=$(get_env_value "DASHBOARD_API_KEY" "")
    EXISTING_SESSION_SECRET=$(get_env_value "SESSION_SECRET" "")
    EXISTING_DISCORD_DB_PASSWORD=$(get_env_value "DISCORD_DB_PASSWORD" "")
    EXISTING_DISCORD_SESSION_SECRET=$(get_env_value "DISCORD_SESSION_SECRET" "")
    EXISTING_VNC_PASSWORD=$(get_env_value "VNC_PASSWORD" "")
    EXISTING_VNC_USER_PASSWORD=$(get_env_value "VNC_USER_PASSWORD" "")
    
    # Show what will be preserved
    [[ -n "$EXISTING_OPENAI" && "$EXISTING_OPENAI" != "CHANGE_ME" ]] && print_success "Preserving OpenAI API key"
    [[ -n "$EXISTING_DISCORD_BOT_TOKEN" && "$EXISTING_DISCORD_BOT_TOKEN" != "CHANGE_ME" ]] && print_success "Preserving Discord bot token"
    [[ -n "$EXISTING_TWITCH_CLIENT_ID" && "$EXISTING_TWITCH_CLIENT_ID" != "CHANGE_ME" ]] && print_success "Preserving Twitch credentials"
    [[ -n "$EXISTING_PLEX_CLAIM" && "$EXISTING_PLEX_CLAIM" != "CHANGE_ME" ]] && print_success "Preserving Plex claim token"
    
    echo ""
    read -p "Continue updating .env with preserved values? (Y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        print_info "Keeping existing .env file unchanged"
        exit 0
    fi
    
    # Backup existing .env
    cp .env .env.old
    print_info "Backed up existing .env to .env.old"
else
    print_info "Creating new .env file..."
fi

print_info "Generating secure random secrets..."

# Generate new secrets only if not already set
if [[ -z "$EXISTING_DASHBOARD_API_KEY" ]]; then
    DASHBOARD_API_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')
else
    DASHBOARD_API_KEY="$EXISTING_DASHBOARD_API_KEY"
fi

if [[ -z "$EXISTING_SESSION_SECRET" ]]; then
    SESSION_SECRET=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
else
    SESSION_SECRET="$EXISTING_SESSION_SECRET"
fi

if [[ -z "$EXISTING_DISCORD_DB_PASSWORD" ]]; then
    DISCORD_DB_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_urlsafe(16))')
else
    DISCORD_DB_PASSWORD="$EXISTING_DISCORD_DB_PASSWORD"
fi

if [[ -z "$EXISTING_DISCORD_SESSION_SECRET" ]]; then
    DISCORD_SESSION_SECRET=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
else
    DISCORD_SESSION_SECRET="$EXISTING_DISCORD_SESSION_SECRET"
fi

if [[ -z "$EXISTING_VNC_PASSWORD" ]]; then
    VNC_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_urlsafe(12))')
else
    VNC_PASSWORD="$EXISTING_VNC_PASSWORD"
fi

if [[ -z "$EXISTING_VNC_USER_PASSWORD" ]]; then
    VNC_USER_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_urlsafe(12))')
else
    VNC_USER_PASSWORD="$EXISTING_VNC_USER_PASSWORD"
fi

# StreamBot session secret
EXISTING_STREAMBOT_SESSION=$(get_env_value "STREAMBOT_SESSION_SECRET" "")
if [[ -z "$EXISTING_STREAMBOT_SESSION" ]]; then
    STREAMBOT_SESSION_SECRET=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
else
    STREAMBOT_SESSION_SECRET="$EXISTING_STREAMBOT_SESSION"
fi

# Use existing values or defaults for API keys
OPENAI_API_KEY="${EXISTING_OPENAI:-CHANGE_ME}"
DISCORD_BOT_TOKEN="${EXISTING_DISCORD_BOT_TOKEN:-CHANGE_ME}"
DISCORD_CLIENT_ID="${EXISTING_DISCORD_CLIENT_ID:-CHANGE_ME}"
DISCORD_CLIENT_SECRET="${EXISTING_DISCORD_CLIENT_SECRET:-CHANGE_ME}"
DISCORD_APP_ID="${EXISTING_DISCORD_APP_ID:-CHANGE_ME}"
TWITCH_CLIENT_ID="${EXISTING_TWITCH_CLIENT_ID:-CHANGE_ME}"
TWITCH_CLIENT_SECRET="${EXISTING_TWITCH_CLIENT_SECRET:-CHANGE_ME}"
TWITCH_CHANNEL="${EXISTING_TWITCH_CHANNEL:-CHANGE_ME}"
PLEX_CLAIM="${EXISTING_PLEX_CLAIM:-CHANGE_ME}"
WEB_USERNAME="${EXISTING_WEB_USERNAME:-evin}"
WEB_PASSWORD="${EXISTING_WEB_PASSWORD:-homelab}"
WINDOWS_KVM_IP="${EXISTING_WINDOWS_KVM_IP:-192.168.1.XXX}"
LETSENCRYPT_EMAIL="${EXISTING_LETSENCRYPT_EMAIL:-admin@evindrake.net}"

cat > .env << EOF
# ======================================================================
# Unified Homelab Environment Configuration
# AUTO-GENERATED by setup-env.sh
# Preserves existing API keys and tokens
# ======================================================================

SERVICE_USER=evin

# ============================================
# Let's Encrypt SSL (Caddy)
# ============================================
LETSENCRYPT_EMAIL=$LETSENCRYPT_EMAIL

# ============================================
# Homelab Dashboard (AUTO-GENERATED)
# ============================================
# Web Login (change these for security)
WEB_USERNAME=$WEB_USERNAME
WEB_PASSWORD=$WEB_PASSWORD

# API Access (for programmatic access)
DASHBOARD_API_KEY=$DASHBOARD_API_KEY
SESSION_SECRET=$SESSION_SECRET

# AI Features
OPENAI_API_KEY=$OPENAI_API_KEY

# Optional Features
ENABLE_SCRIPT_EXECUTION=true
DOCKER_HOST=unix:///var/run/docker.sock
SSH_HOST=localhost
SSH_PORT=22
SSH_USER=evin
SSH_KEY_PATH=/home/evin/.ssh/id_rsa

# VNC Remote Desktop
NOVNC_URL=https://vnc.evindrake.net
VNC_PASSWORD=$VNC_PASSWORD
VNC_USER=evin
VNC_USER_PASSWORD=$VNC_USER_PASSWORD

# ============================================
# Discord Ticket Bot (AUTO-GENERATED)
# ============================================
DISCORD_DB_PASSWORD=$DISCORD_DB_PASSWORD
DISCORD_SESSION_SECRET=$DISCORD_SESSION_SECRET
DISCORD_BOT_TOKEN=$DISCORD_BOT_TOKEN
DISCORD_CLIENT_ID=$DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET=$DISCORD_CLIENT_SECRET
DISCORD_APP_ID=$DISCORD_APP_ID
VITE_DISCORD_CLIENT_ID=$DISCORD_CLIENT_ID
VITE_CUSTOM_WS_URL=
RESET_DB=false

# ============================================
# Stream Bot (SnappleBotAI)
# ============================================
# Database (uses shared PostgreSQL container)
STREAMBOT_DATABASE_URL=postgresql://streambot:$DISCORD_DB_PASSWORD@discord-bot-db:5432/streambot

# Session Security
STREAMBOT_SESSION_SECRET=$STREAMBOT_SESSION_SECRET

# OpenAI API (shares dashboard key)
STREAMBOT_OPENAI_API_KEY=$OPENAI_API_KEY
STREAMBOT_OPENAI_BASE_URL=https://api.openai.com/v1

# Application Settings
STREAMBOT_NODE_ENV=production
STREAMBOT_PORT=5000

# ============================================
# Plex Media Server
# ============================================
PLEX_CLAIM=$PLEX_CLAIM

# Game Streaming (Sunshine/Moonlight)
# IP address of your Windows 11 KVM with RTX 3060
WINDOWS_KVM_IP=$WINDOWS_KVM_IP
EOF

if [[ -f .env.old ]]; then
    print_success ".env file updated! (Previous version backed up to .env.old)"
else
    print_success ".env file created with random secrets!"
fi
echo ""

echo ""

# Check what still needs configuration
NEEDS_CONFIG=()
[[ "$OPENAI_API_KEY" == "CHANGE_ME" ]] && NEEDS_CONFIG+=("OpenAI API Key")
[[ "$DISCORD_BOT_TOKEN" == "CHANGE_ME" ]] && NEEDS_CONFIG+=("Discord Bot Token")
[[ "$PLEX_CLAIM" == "CHANGE_ME" ]] && NEEDS_CONFIG+=("Plex Claim Token")
[[ "$WINDOWS_KVM_IP" == "192.168.1.XXX" ]] && NEEDS_CONFIG+=("Windows KVM IP")

if [ ${#NEEDS_CONFIG[@]} -gt 0 ]; then
    print_warning "STILL REQUIRED: You must configure these before deploying:"
    echo ""
    
    [[ "$OPENAI_API_KEY" == "CHANGE_ME" ]] && echo "  1. OpenAI API Key (for dashboard AI + stream bot)" && echo "     Get from: https://platform.openai.com/api-keys" && echo ""
    [[ "$DISCORD_BOT_TOKEN" == "CHANGE_ME" ]] && echo "  2. Discord Bot Credentials (for Discord bot)" && echo "     Get from: https://discord.com/developers/applications" && echo "     - DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_APP_ID" && echo ""
    [[ "$PLEX_CLAIM" == "CHANGE_ME" ]] && echo "  3. Plex Claim Token (for Plex setup)" && echo "     Get from: https://www.plex.tv/claim/ (expires in 4 minutes!)" && echo ""
    [[ "$WINDOWS_KVM_IP" == "192.168.1.XXX" ]] && echo "  4. Windows KVM IP (for game streaming)" && echo "     Update WINDOWS_KVM_IP with your VM's IP address" && echo ""
else
    print_success "All required values are configured!"
    echo ""
fi

print_info "OPTIONAL: Customize these if needed:"
echo "  - WEB_USERNAME/WEB_PASSWORD (dashboard login)"
echo "  - VNC passwords (auto-generated, but can be changed)"
echo ""

echo "Next steps:"
echo "  1. Edit .env and fill in required values:"
echo "     nano .env"
echo ""
echo "  2. Check what still needs configuration:"
echo "     ./check-env.sh"
echo ""
echo "  3. Deploy when ready:"
echo "     ./deploy-unified.sh"
echo ""
