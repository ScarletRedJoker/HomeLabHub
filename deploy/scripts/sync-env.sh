#!/bin/bash
set -euo pipefail

echo "================================================"
echo "  Environment Variable Sync Tool"
echo "================================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

SOURCE_ENV="${SOURCE_ENV:-$HOME/contain/HomeLabHub/.env}"
LINODE_ENV="$DEPLOY_DIR/linode/.env"
LOCAL_ENV="$DEPLOY_DIR/local/.env"

print_status() { echo -e "\033[1;34m==>\033[0m \033[1m$1\033[0m"; }
print_success() { echo -e "\033[1;32m✓\033[0m $1"; }
print_warning() { echo -e "\033[1;33m⚠\033[0m $1"; }

if [[ ! -f "$SOURCE_ENV" ]]; then
    echo "Source .env not found at: $SOURCE_ENV"
    echo "Set SOURCE_ENV to your main .env file location"
    exit 1
fi

extract_vars() {
    local output_file="$1"
    local vars_list="$2"
    
    > "$output_file"
    
    for var in $vars_list; do
        value=$(grep "^${var}=" "$SOURCE_ENV" 2>/dev/null | cut -d'=' -f2- || echo "")
        if [[ -n "$value" ]]; then
            echo "${var}=${value}" >> "$output_file"
        fi
    done
}

LINODE_VARS="
POSTGRES_PASSWORD
DISCORD_DB_PASSWORD
STREAMBOT_DB_PASSWORD
JARVIS_DB_PASSWORD
DISCORD_BOT_TOKEN
DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET
DISCORD_APP_ID
VITE_DISCORD_CLIENT_ID
DISCORD_SESSION_SECRET
TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET
YOUTUBE_CLIENT_ID
YOUTUBE_CLIENT_SECRET
SPOTIFY_CLIENT_ID
SPOTIFY_CLIENT_SECRET
KICK_CLIENT_ID
KICK_CLIENT_SECRET
OPENAI_API_KEY
STREAMBOT_SESSION_SECRET
SERVICE_AUTH_TOKEN
WEB_USERNAME
WEB_PASSWORD
N8N_BASIC_AUTH_USER
N8N_BASIC_AUTH_PASSWORD
CODE_SERVER_PASSWORD
PLEX_TOKEN
HOME_ASSISTANT_TOKEN
"

LOCAL_VARS="
MINIO_ROOT_USER
MINIO_ROOT_PASSWORD
PLEX_TOKEN
PLEX_CLAIM
HOME_ASSISTANT_TOKEN
"

print_status "Extracting Linode environment variables..."
extract_vars "$LINODE_ENV" "$LINODE_VARS"
print_success "Created: $LINODE_ENV"

print_status "Extracting Local environment variables..."
extract_vars "$LOCAL_ENV" "$LOCAL_VARS"
print_success "Created: $LOCAL_ENV"

echo ""
echo "Environment files created!"
echo ""
echo "Add Tailscale IPs to each file:"
echo "  Linode: TAILSCALE_LOCAL_HOST=<local-tailscale-ip>"
echo "  Local:  TAILSCALE_LINODE_HOST=<linode-tailscale-ip>"
echo ""
