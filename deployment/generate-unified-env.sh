#!/bin/bash

# =====================================================
# Unified Environment Generator
# =====================================================
# Generates a complete .env file with all required
# variables for the entire homelab deployment
# =====================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
ENV_EXAMPLE="${SCRIPT_DIR}/.env.unified.example"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Unified Homelab Environment Generator       ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Check if .env already exists
if [ -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}⚠ Existing .env file found${NC}"
    echo ""
    echo "Options:"
    echo "  1) Keep existing and add missing variables"
    echo "  2) Backup and create fresh .env"
    echo "  3) Cancel"
    echo ""
    read -p "Choose option (1-3): " option
    
    case $option in
        1)
            echo -e "${GREEN}✓ Will preserve existing .env${NC}"
            BACKUP_ENV=false
            ;;
        2)
            BACKUP_FILE="${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
            cp "$ENV_FILE" "$BACKUP_FILE"
            echo -e "${GREEN}✓ Backed up to: $BACKUP_FILE${NC}"
            BACKUP_ENV=true
            ;;
        3)
            echo "Cancelled."
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid option${NC}"
            exit 1
            ;;
    esac
else
    echo -e "${BLUE}Creating new .env file...${NC}"
    BACKUP_ENV=true
fi

echo ""

# Function to generate random secrets
generate_secret() {
    python3 -c 'import secrets; print(secrets.token_urlsafe(32))'
}

generate_hex_secret() {
    python3 -c 'import secrets; print(secrets.token_hex(32))'
}

generate_password() {
    python3 -c 'import secrets; print(secrets.token_urlsafe(16))'
}

# Temporary file for building new .env
TEMP_ENV="${ENV_FILE}.tmp"

# Function to get or generate variable (returns value only)
get_or_generate() {
    local var_name=$1
    local prompt=$2
    local generator=$3
    local default_value=$4
    
    # Check if variable exists in current .env
    if [ -f "$ENV_FILE" ] && grep -q "^${var_name}=" "$ENV_FILE"; then
        current_value=$(grep "^${var_name}=" "$ENV_FILE" | head -1 | cut -d'=' -f2-)
        echo -e "${GREEN}✓ Using existing: ${var_name}${NC}" >&2
        echo "${current_value}"
    else
        if [ "$generator" = "PROMPT" ]; then
            read -p "${prompt}: " value
            if [ -z "$value" ] && [ -n "$default_value" ]; then
                value="$default_value"
            fi
            echo "${value}"
        elif [ "$generator" = "GENERATE" ]; then
            generated_value=$(eval "$default_value")
            echo -e "${BLUE}⚙ Generated: ${var_name}${NC}" >&2
            echo "${generated_value}"
        else
            echo "${default_value}"
        fi
    fi
}

# Start building new .env in temp file
cat > "$TEMP_ENV" << 'HEADER'
# ======================================================================
# Unified Homelab Environment Configuration
# ======================================================================
# Auto-generated - DO NOT EDIT MANUALLY
# Use generate-unified-env.sh to regenerate
# ======================================================================

HEADER

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  General Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Collect values
SERVICE_USER=$(get_or_generate "SERVICE_USER" "Service user" "PROMPT" "evin")
LETSENCRYPT_EMAIL=$(get_or_generate "LETSENCRYPT_EMAIL" "Email for Let's Encrypt SSL certificates" "PROMPT" "admin@evindrake.net")

# Write to temp file
cat >> "$TEMP_ENV" << EOF
# ============================================
# General / Shared Configuration
# ============================================
SERVICE_USER=${SERVICE_USER}
LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL}

EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Generating Secure Secrets..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Collect dashboard values
SESSION_SECRET=$(get_or_generate "SESSION_SECRET" "Dashboard session secret" "GENERATE" "generate_hex_secret")
DASHBOARD_API_KEY=$(get_or_generate "DASHBOARD_API_KEY" "Dashboard API key" "GENERATE" "generate_secret")
WEB_USERNAME=$(get_or_generate "WEB_USERNAME" "Dashboard web login username" "PROMPT" "evin")
WEB_PASSWORD=$(get_or_generate "WEB_PASSWORD" "Dashboard web login password" "PROMPT" "homelab")

echo ""
echo "=== OpenAI AI Integrations Configuration ==="
echo "Both Dashboard (Jarvis) and Stream Bot use these shared AI Integration keys."
echo "Get API key from: https://platform.openai.com/api-keys"
AI_INTEGRATIONS_OPENAI_API_KEY=$(get_or_generate "AI_INTEGRATIONS_OPENAI_API_KEY" "OpenAI API Key (required for AI features)" "PROMPT" "")
AI_INTEGRATIONS_OPENAI_BASE_URL=$(get_or_generate "AI_INTEGRATIONS_OPENAI_BASE_URL" "OpenAI base URL" "PROMPT" "https://api.openai.com/v1")

DOCKER_HOST=$(get_or_generate "DOCKER_HOST" "Docker socket path" "PROMPT" "unix:///var/run/docker.sock")
SSH_HOST=$(get_or_generate "SSH_HOST" "SSH host for remote execution" "PROMPT" "localhost")
SSH_PORT=$(get_or_generate "SSH_PORT" "SSH port" "PROMPT" "22")
SSH_USER=$(get_or_generate "SSH_USER" "SSH username" "PROMPT" "evin")
SSH_KEY_PATH=$(get_or_generate "SSH_KEY_PATH" "SSH private key path" "PROMPT" "/home/evin/.ssh/id_rsa")
ENABLE_SCRIPT_EXECUTION=$(get_or_generate "ENABLE_SCRIPT_EXECUTION" "Enable remote script execution" "PROMPT" "true")

# Write to temp file
cat >> "$TEMP_ENV" << EOF
# ============================================
# AI Integrations (Shared by Dashboard & Stream Bot)
# ============================================
# Both Dashboard (Jarvis) and Stream Bot use these keys for AI features
# Get API key from: https://platform.openai.com/api-keys
AI_INTEGRATIONS_OPENAI_API_KEY=${AI_INTEGRATIONS_OPENAI_API_KEY}
AI_INTEGRATIONS_OPENAI_BASE_URL=${AI_INTEGRATIONS_OPENAI_BASE_URL}

# ============================================
# Homelab Dashboard (host.evindrake.net)
# ============================================
SESSION_SECRET=${SESSION_SECRET}
DASHBOARD_API_KEY=${DASHBOARD_API_KEY}

# Web Login
WEB_USERNAME=${WEB_USERNAME}
WEB_PASSWORD=${WEB_PASSWORD}

# Docker & SSH Configuration
DOCKER_HOST=${DOCKER_HOST}
SSH_HOST=${SSH_HOST}
SSH_PORT=${SSH_PORT}
SSH_USER=${SSH_USER}
SSH_KEY_PATH=${SSH_KEY_PATH}
ENABLE_SCRIPT_EXECUTION=${ENABLE_SCRIPT_EXECUTION}

EOF

# Collect OpenAI values
OPENAI_API_KEY=$(get_or_generate "OPENAI_API_KEY" "OpenAI API key" "PROMPT" "sk-proj-your-key-here")

# Write to temp file
cat >> "$TEMP_ENV" << EOF
# ============================================
# OpenAI API (Shared)
# ============================================
# Get from: https://platform.openai.com/api-keys
OPENAI_API_KEY=${OPENAI_API_KEY}

EOF

# Collect ZoneEdit DNS values
echo ""
echo "=== ZoneEdit Dynamic DNS Configuration ==="
echo "For automatic DNS updates when your IP changes:"
echo "1. Log into ZoneEdit: https://zoneedit.com"
echo "2. Go to Domains → DNS Settings → DYN records → wrench icon"
echo "3. Click 'Enable dynamic authentication' to generate token"
ZONEEDIT_USERNAME=$(get_or_generate "ZONEEDIT_USERNAME" "ZoneEdit account email (your login email)" "PROMPT" "")
ZONEEDIT_API_TOKEN=$(get_or_generate "ZONEEDIT_API_TOKEN" "ZoneEdit Dynamic Authentication Token" "PROMPT" "")

# Write to temp file
cat >> "$TEMP_ENV" << EOF
# ============================================
# ZoneEdit Dynamic DNS (host.evindrake.net)
# ============================================
# Get Dynamic Authentication Token from: 
# https://zoneedit.com → Domains → DNS Settings → DYN records → Enable dynamic auth
ZONEEDIT_USERNAME=${ZONEEDIT_USERNAME}
ZONEEDIT_API_TOKEN=${ZONEEDIT_API_TOKEN}

EOF

# Collect StreamBot values (moved before Plex)
# Note: StreamBot uses AI_INTEGRATIONS_OPENAI_API_KEY (shared with Dashboard)
STREAMBOT_DB_PASSWORD=$(get_or_generate "STREAMBOT_DB_PASSWORD" "StreamBot database password" "GENERATE" "generate_password")
STREAMBOT_SESSION_SECRET=$(get_or_generate "STREAMBOT_SESSION_SECRET" "StreamBot session secret" "GENERATE" "generate_hex_secret")
STREAMBOT_NODE_ENV=$(get_or_generate "STREAMBOT_NODE_ENV" "Node environment" "PROMPT" "production")
STREAMBOT_PORT=$(get_or_generate "STREAMBOT_PORT" "Server port" "PROMPT" "5000")
TWITCH_CLIENT_ID=$(get_or_generate "TWITCH_CLIENT_ID" "Twitch client ID (optional)" "PROMPT" "")
TWITCH_CLIENT_SECRET=$(get_or_generate "TWITCH_CLIENT_SECRET" "Twitch client secret (optional)" "PROMPT" "")
TWITCH_CHANNEL=$(get_or_generate "TWITCH_CHANNEL" "Twitch channel name (optional)" "PROMPT" "")

# Spotify OAuth credentials (for per-user connections)
echo ""
echo "=== Spotify OAuth Configuration ==="
echo "For multi-user Spotify overlay feature, create OAuth app at:"
echo "https://developer.spotify.com/dashboard"
echo "Set redirect URI to: https://stream.rig-city.com/auth/spotify/callback"
SPOTIFY_CLIENT_ID=$(get_or_generate "SPOTIFY_CLIENT_ID" "Spotify OAuth client ID (optional)" "PROMPT" "")
SPOTIFY_CLIENT_SECRET=$(get_or_generate "SPOTIFY_CLIENT_SECRET" "Spotify OAuth client secret (optional)" "PROMPT" "")
SPOTIFY_REDIRECT_URI=$(get_or_generate "SPOTIFY_REDIRECT_URI" "Spotify OAuth redirect URI" "PROMPT" "https://stream.rig-city.com/auth/spotify/callback")

# YouTube OAuth credentials (for per-user connections)
echo ""
echo "=== YouTube OAuth Configuration ==="
echo "For multi-user YouTube livestream feature, create OAuth app at:"
echo "https://console.cloud.google.com/apis/credentials"
echo "Set redirect URI to: https://stream.rig-city.com/auth/youtube/callback"
YOUTUBE_CLIENT_ID=$(get_or_generate "YOUTUBE_CLIENT_ID" "YouTube OAuth client ID (optional)" "PROMPT" "")
YOUTUBE_CLIENT_SECRET=$(get_or_generate "YOUTUBE_CLIENT_SECRET" "YouTube OAuth client secret (optional)" "PROMPT" "")
YOUTUBE_REDIRECT_URI=$(get_or_generate "YOUTUBE_REDIRECT_URI" "YouTube OAuth redirect URI" "PROMPT" "https://stream.rig-city.com/auth/youtube/callback")

# Write to temp file
cat >> "$TEMP_ENV" << EOF
# ============================================
# Stream Bot (Snapple Facts AI - stream.rig-city.com)
# ============================================
# Note: Stream Bot uses AI_INTEGRATIONS_OPENAI_API_KEY (shared with Dashboard)
STREAMBOT_DB_PASSWORD=${STREAMBOT_DB_PASSWORD}
STREAMBOT_SESSION_SECRET=${STREAMBOT_SESSION_SECRET}
STREAMBOT_NODE_ENV=${STREAMBOT_NODE_ENV}
STREAMBOT_PORT=${STREAMBOT_PORT}

# Twitch Integration (optional)
TWITCH_CLIENT_ID=${TWITCH_CLIENT_ID}
TWITCH_CLIENT_SECRET=${TWITCH_CLIENT_SECRET}
TWITCH_CHANNEL=${TWITCH_CHANNEL}

# Spotify OAuth (for per-user connections)
SPOTIFY_CLIENT_ID=${SPOTIFY_CLIENT_ID}
SPOTIFY_CLIENT_SECRET=${SPOTIFY_CLIENT_SECRET}
SPOTIFY_REDIRECT_URI=${SPOTIFY_REDIRECT_URI}

# YouTube OAuth (for per-user connections)
YOUTUBE_CLIENT_ID=${YOUTUBE_CLIENT_ID}
YOUTUBE_CLIENT_SECRET=${YOUTUBE_CLIENT_SECRET}
YOUTUBE_REDIRECT_URI=${YOUTUBE_REDIRECT_URI}

EOF

# Collect VNC values
VNC_PASSWORD=$(get_or_generate "VNC_PASSWORD" "VNC viewer password" "GENERATE" "generate_password")
VNC_USER=$(get_or_generate "VNC_USER" "VNC desktop username" "PROMPT" "evin")
VNC_USER_PASSWORD=$(get_or_generate "VNC_USER_PASSWORD" "VNC user password" "GENERATE" "generate_password")
NOVNC_URL=$(get_or_generate "NOVNC_URL" "NoVNC web URL" "PROMPT" "https://vnc.evindrake.net")

# Write to temp file
cat >> "$TEMP_ENV" << EOF
# ============================================
# VNC Remote Desktop (vnc.evindrake.net)
# ============================================
VNC_PASSWORD=${VNC_PASSWORD}
VNC_USER=${VNC_USER}
VNC_USER_PASSWORD=${VNC_USER_PASSWORD}
NOVNC_URL=${NOVNC_URL}

EOF

# Collect Code-Server AI Extension values
echo ""
echo "=== Code-Server AI Extensions Configuration ==="
echo "Code-Server supports AI coding assistants for enhanced development:"
echo ""
echo "Recommended FREE options:"
echo "  1. Continue.dev - Open-source, supports local & cloud AI models"
echo "     Get API key from: https://continue.dev (or use local Ollama)"
echo "     Features: Chat, inline edits, works with GPT-4/Claude/local models"
echo ""
echo "  2. Codeium - Free forever for individuals, unlimited autocomplete"
echo "     Sign up at: https://codeium.com"
echo "     Features: Autocomplete, chat, search, 70+ languages"
echo ""
echo "  3. GitHub Copilot - \$10/month (premium quality)"
echo "     Get token from: https://github.com/settings/copilot"
echo ""
echo "Leave blank to skip and install AI extensions manually later."
CODEIUM_API_KEY=$(get_or_generate "CODEIUM_API_KEY" "Codeium API Key (optional, free at codeium.com)" "PROMPT" "")
CONTINUE_API_KEY=$(get_or_generate "CONTINUE_API_KEY" "Continue.dev API Key (optional, or use local models)" "PROMPT" "")
GITHUB_COPILOT_TOKEN=$(get_or_generate "GITHUB_COPILOT_TOKEN" "GitHub Copilot Token (optional, \$10/mo)" "PROMPT" "")

# Write to temp file
cat >> "$TEMP_ENV" << EOF
# ============================================
# Code-Server AI Extensions
# ============================================
# AI coding assistants for code-server web IDE
# Free options: Continue.dev (supports local models) or Codeium
# Premium: GitHub Copilot (\$10/month)
CODEIUM_API_KEY=${CODEIUM_API_KEY}
CONTINUE_API_KEY=${CONTINUE_API_KEY}
GITHUB_COPILOT_TOKEN=${GITHUB_COPILOT_TOKEN}

EOF

# Collect Discord values
DISCORD_DB_PASSWORD=$(get_or_generate "DISCORD_DB_PASSWORD" "Discord DB password" "GENERATE" "generate_password")
DISCORD_BOT_TOKEN=$(get_or_generate "DISCORD_BOT_TOKEN" "Discord bot token" "PROMPT" "your-bot-token-here")
DISCORD_CLIENT_ID=$(get_or_generate "DISCORD_CLIENT_ID" "Discord client ID" "PROMPT" "your-client-id")
DISCORD_CLIENT_SECRET=$(get_or_generate "DISCORD_CLIENT_SECRET" "Discord client secret" "PROMPT" "your-client-secret")
DISCORD_APP_ID=$(get_or_generate "DISCORD_APP_ID" "Discord app ID" "PROMPT" "your-app-id")
VITE_DISCORD_CLIENT_ID=$(get_or_generate "VITE_DISCORD_CLIENT_ID" "Vite Discord client ID" "PROMPT" "your-client-id")
DISCORD_SESSION_SECRET=$(get_or_generate "DISCORD_SESSION_SECRET" "Discord session secret" "GENERATE" "generate_hex_secret")
VITE_CUSTOM_WS_URL=$(get_or_generate "VITE_CUSTOM_WS_URL" "Custom WebSocket URL" "PROMPT" "")
RESET_DB=$(get_or_generate "RESET_DB" "Reset database on startup" "PROMPT" "false")

# Write to temp file
cat >> "$TEMP_ENV" << EOF
# ============================================
# Discord Ticket Bot
# ============================================
# Get from: https://discord.com/developers/applications
DISCORD_DB_PASSWORD=${DISCORD_DB_PASSWORD}
DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}
DISCORD_CLIENT_ID=${DISCORD_CLIENT_ID}
DISCORD_CLIENT_SECRET=${DISCORD_CLIENT_SECRET}
DISCORD_APP_ID=${DISCORD_APP_ID}
VITE_DISCORD_CLIENT_ID=${VITE_DISCORD_CLIENT_ID}
DISCORD_SESSION_SECRET=${DISCORD_SESSION_SECRET}
VITE_CUSTOM_WS_URL=${VITE_CUSTOM_WS_URL}
RESET_DB=${RESET_DB}

EOF


# Collect Plex values
echo ""
echo "NOTE: Plex claim token expires in 4 minutes! Get from: https://www.plex.tv/claim/"
PLEX_CLAIM=$(get_or_generate "PLEX_CLAIM" "Plex claim token (get from https://www.plex.tv/claim/)" "PROMPT" "claim-token-here")

# Write to temp file
cat >> "$TEMP_ENV" << EOF
# ============================================
# Plex Media Server (plex.evindrake.net)
# ============================================
# Get claim token from: https://www.plex.tv/claim/ (expires in 4 minutes!)
PLEX_CLAIM=${PLEX_CLAIM}

EOF

# Atomically replace .env with temp file
mv "$TEMP_ENV" "$ENV_FILE"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✓ Environment file generated!               ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}✓ Saved to: ${ENV_FILE}${NC}"
echo ""
echo "Next steps:"
echo "  1. Review and edit: nano .env"
echo "  2. Check configuration: ./check-all-env.sh"
echo "  3. Deploy: ./deploy-unified.sh"
echo ""
