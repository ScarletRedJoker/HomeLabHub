#!/bin/bash
# Smart .env Setup Script for Linode Deployment
# - Preserves all existing values
# - Auto-generates passwords/tokens for missing internal values
# - Lists what user needs to provide for external APIs

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env"
ENV_EXAMPLE="${SCRIPT_DIR}/../.env.example"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          HOMELAB LINODE - SMART ENV SETUP                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Generate a random password
generate_password() {
    openssl rand -base64 32 | tr -d '/+=' | head -c 32
}

# Generate a shorter token
generate_token() {
    openssl rand -hex 32
}

# Check if a variable exists and is not empty in .env
var_exists() {
    local var_name="$1"
    if [ -f "$ENV_FILE" ]; then
        grep -q "^${var_name}=" "$ENV_FILE" && \
        [ -n "$(grep "^${var_name}=" "$ENV_FILE" | cut -d'=' -f2-)" ]
    else
        return 1
    fi
}

# Get value from .env
get_value() {
    local var_name="$1"
    if [ -f "$ENV_FILE" ]; then
        grep "^${var_name}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- | head -1
    fi
}

# Add or update a variable (preserves existing)
set_var_if_missing() {
    local var_name="$1"
    local var_value="$2"
    local description="$3"
    
    if var_exists "$var_name"; then
        echo "  ✓ $var_name (already set)"
    else
        echo "$var_name=$var_value" >> "$ENV_FILE"
        echo "  + $var_name (auto-generated: $description)"
    fi
}

# Track what user needs to provide
MISSING_USER_VARS=()

check_user_var() {
    local var_name="$1"
    local description="$2"
    
    if var_exists "$var_name"; then
        echo "  ✓ $var_name (configured)"
    else
        MISSING_USER_VARS+=("$var_name|$description")
        echo "  ⚠ $var_name (NEEDS YOUR INPUT: $description)"
    fi
}

# Create .env if it doesn't exist
if [ ! -f "$ENV_FILE" ]; then
    echo "Creating new .env file..."
    touch "$ENV_FILE"
else
    echo "Found existing .env file - preserving your values!"
    echo ""
fi

# Backup existing .env
if [ -f "$ENV_FILE" ] && [ -s "$ENV_FILE" ]; then
    cp "$ENV_FILE" "${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
    echo "Backup created: ${ENV_FILE}.backup.*"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Auto-Generated Internal Passwords & Tokens"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Database passwords (auto-generate if missing)
set_var_if_missing "POSTGRES_PASSWORD" "$(generate_password)" "PostgreSQL root password"
set_var_if_missing "JARVIS_DB_PASSWORD" "$(generate_password)" "Jarvis/Dashboard database"
set_var_if_missing "DISCORD_DB_PASSWORD" "$(generate_password)" "Discord bot database"
set_var_if_missing "STREAMBOT_DB_PASSWORD" "$(generate_password)" "Stream bot database"

# Session secrets (auto-generate if missing)
set_var_if_missing "SERVICE_AUTH_TOKEN" "$(generate_token)" "Internal service auth"
set_var_if_missing "DISCORD_SESSION_SECRET" "$(generate_token)" "Discord bot sessions"
set_var_if_missing "STREAMBOT_SESSION_SECRET" "$(generate_token)" "Stream bot sessions"

# Dashboard credentials
set_var_if_missing "WEB_USERNAME" "evin" "Dashboard username"
set_var_if_missing "WEB_PASSWORD" "$(generate_password)" "Dashboard password"

# Service passwords
set_var_if_missing "N8N_BASIC_AUTH_USER" "admin" "n8n username"
set_var_if_missing "N8N_BASIC_AUTH_PASSWORD" "$(generate_password)" "n8n password"
set_var_if_missing "CODE_SERVER_PASSWORD" "$(generate_password)" "Code-Server password"
set_var_if_missing "GRAFANA_ADMIN_PASSWORD" "$(generate_password)" "Grafana admin password"

# Defaults
set_var_if_missing "TAILSCALE_LOCAL_HOST" "192.168.0.177" "Local Ubuntu IP via Tailscale"
set_var_if_missing "WINDOWS_VM_TAILSCALE_IP" "100.118.44.102" "Windows VM with GPU (Ollama)"
set_var_if_missing "TZ" "America/New_York" "Timezone"

# Docker socket GID for container access
DOCKER_GID=$(stat -c '%g' /var/run/docker.sock 2>/dev/null || echo "999")
set_var_if_missing "DOCKER_GID" "$DOCKER_GID" "Docker socket group ID"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Checking External API Keys (requires your input)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# OpenAI
check_user_var "OPENAI_API_KEY" "OpenAI API key for Jarvis AI"

# Discord Bot
check_user_var "DISCORD_BOT_TOKEN" "Discord bot token"
check_user_var "DISCORD_CLIENT_ID" "Discord OAuth client ID"
check_user_var "DISCORD_CLIENT_SECRET" "Discord OAuth client secret"
check_user_var "DISCORD_APP_ID" "Discord application ID"

# Twitch
check_user_var "TWITCH_CLIENT_ID" "Twitch OAuth client ID"
check_user_var "TWITCH_CLIENT_SECRET" "Twitch OAuth client secret"

# YouTube (optional for stream bot)
check_user_var "YOUTUBE_CLIENT_ID" "YouTube OAuth client ID"
check_user_var "YOUTUBE_CLIENT_SECRET" "YouTube OAuth client secret"

# Spotify (optional for stream bot)
check_user_var "SPOTIFY_CLIENT_ID" "Spotify OAuth client ID"
check_user_var "SPOTIFY_CLIENT_SECRET" "Spotify OAuth client secret"

# Kick (optional for stream bot)
check_user_var "KICK_CLIENT_ID" "Kick OAuth client ID"

# Cloudflare (for DNS management)
check_user_var "CLOUDFLARE_API_TOKEN" "Cloudflare API token"

# Local services (optional)
check_user_var "PLEX_TOKEN" "Plex authentication token"
check_user_var "HOME_ASSISTANT_TOKEN" "Home Assistant long-lived token"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Copy DISCORD_CLIENT_ID to VITE if set
if var_exists "DISCORD_CLIENT_ID" && ! var_exists "VITE_DISCORD_CLIENT_ID"; then
    DISCORD_ID=$(get_value "DISCORD_CLIENT_ID")
    echo "VITE_DISCORD_CLIENT_ID=$DISCORD_ID" >> "$ENV_FILE"
    echo "  + VITE_DISCORD_CLIENT_ID (copied from DISCORD_CLIENT_ID)"
fi

if [ ${#MISSING_USER_VARS[@]} -eq 0 ]; then
    echo ""
    echo "  ✅ ALL CONFIGURATION COMPLETE!"
    echo ""
    echo "  You can now deploy with:"
    echo "    cd $(dirname $ENV_FILE)"
    echo "    docker-compose up -d --build"
    echo ""
else
    echo ""
    echo "  ⚠️  Missing ${#MISSING_USER_VARS[@]} external API keys"
    echo ""
    echo "  Edit .env and add these values:"
    echo "    nano $ENV_FILE"
    echo ""
    for item in "${MISSING_USER_VARS[@]}"; do
        var_name="${item%%|*}"
        description="${item##*|}"
        echo "    $var_name=your_value_here  # $description"
    done
    echo ""
    echo "  OPTIONAL: These are only needed if you use those features."
    echo "  The system will work without them, just with reduced functionality."
    echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
