#!/bin/bash
# Plex Server Claim Helper with Automatic Token Fetching
# Automatically fetches X-Plex-Token and claim token using your Plex credentials
# Run: ./plex-claim.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${DEPLOY_DIR}/.env"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

CLIENT_ID="homelab-dashboard-$(hostname)-$(date +%s)"

print_header() {
    echo "" >&2
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}" >&2
    echo -e "${BLUE}  $1${NC}" >&2
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}" >&2
}

log_ok() {
    echo -e "${GREEN}[OK]${NC} $1" >&2
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_info() {
    echo -e "${CYAN}$1${NC}" >&2
}

check_plex_status() {
    print_header "Checking Plex Server Status"
    
    if ! docker ps --format '{{.Names}}' | grep -q "^plex$"; then
        log_error "Plex container is not running!"
        echo "Start it with: docker compose up -d plex" >&2
        exit 1
    fi
    
    log_ok "Plex container is running"
    
    local identity
    identity=$(curl -s http://localhost:32400/identity 2>/dev/null || echo "")
    
    if [[ -z "$identity" ]]; then
        log_warn "Cannot reach Plex API - server may still be starting"
        echo "Wait a moment and try again..." >&2
        exit 1
    fi
    
    local claimed
    claimed=$(echo "$identity" | grep -oP 'claimed="\K[^"]+' || echo "unknown")
    local machine_id
    machine_id=$(echo "$identity" | grep -oP 'machineIdentifier="\K[^"]+' || echo "unknown")
    local version
    version=$(echo "$identity" | grep -oP 'version="\K[^"]+' || echo "unknown")
    
    echo "" >&2
    log_info "Plex Server Info:"
    echo "  Version:    ${version}" >&2
    echo "  Machine ID: ${machine_id:0:16}..." >&2
    
    if [[ "$claimed" == "1" ]]; then
        echo -e "  Status:     ${GREEN}CLAIMED${NC} ✓" >&2
        echo "" >&2
        echo -e "${GREEN}Your Plex server is already claimed!${NC}" >&2
        echo "Access it at: http://localhost:32400/web" >&2
        exit 0
    else
        echo -e "  Status:     ${RED}NOT CLAIMED${NC}" >&2
        echo "" >&2
        return 1
    fi
}

get_plex_token() {
    local username=$1
    local password=$2
    
    log_info "Fetching X-Plex-Token from Plex API..."
    
    local response
    response=$(curl -s -X POST "https://plex.tv/users/sign_in.json" \
        -H "X-Plex-Client-Identifier: ${CLIENT_ID}" \
        -H "X-Plex-Product: HomeLabHub" \
        -H "X-Plex-Version: 1.0.0" \
        -H "X-Plex-Device: Ubuntu-Server" \
        -H "X-Plex-Platform: Linux" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        --data-urlencode "user[login]=${username}" \
        --data-urlencode "user[password]=${password}" \
        2>/dev/null)
    
    if echo "$response" | grep -q '"authToken"'; then
        local token
        token=$(echo "$response" | grep -oP '"authToken"\s*:\s*"\K[^"]+' || echo "")
        if [[ -n "$token" ]]; then
            log_ok "Successfully obtained X-Plex-Token"
            echo "$token"
            return 0
        fi
    fi
    
    if echo "$response" | grep -q "Invalid email"; then
        log_error "Invalid email or username"
    elif echo "$response" | grep -q "Invalid password"; then
        log_error "Invalid password"
    elif echo "$response" | grep -q "two-factor"; then
        log_warn "Two-factor authentication is enabled"
        echo "Please append your 6-digit 2FA code to your password" >&2
        echo "Example: mypassword123456" >&2
    else
        log_error "Failed to authenticate with Plex"
        echo "Response: $response" >&2
    fi
    
    return 1
}

get_claim_token() {
    local plex_token=$1
    
    log_info "Fetching claim token from Plex API..."
    
    local response
    response=$(curl -s "https://plex.tv/api/claim/token.json" \
        -H "X-Plex-Token: ${plex_token}" \
        -H "X-Plex-Client-Identifier: ${CLIENT_ID}" \
        2>/dev/null)
    
    if echo "$response" | grep -q '"token"'; then
        local claim
        claim=$(echo "$response" | grep -oP '"token"\s*:\s*"\K[^"]+' || echo "")
        if [[ -n "$claim" ]]; then
            log_ok "Successfully obtained claim token"
            echo "$claim"
            return 0
        fi
    fi
    
    log_error "Failed to get claim token"
    echo "Response: $response" >&2
    return 1
}

update_env_file() {
    local plex_token=$1
    local claim_token=$2
    
    print_header "Updating Environment"
    
    if [[ ! -f "$ENV_FILE" ]]; then
        touch "$ENV_FILE"
    fi
    
    if [[ -n "$plex_token" ]]; then
        local escaped_token="${plex_token//\//\\/}"
        if grep -q "^PLEX_TOKEN=" "$ENV_FILE"; then
            sed -i "s/^PLEX_TOKEN=.*/PLEX_TOKEN=${escaped_token}/" "$ENV_FILE"
            log_ok "Updated PLEX_TOKEN in .env"
        else
            echo "PLEX_TOKEN=${plex_token}" >> "$ENV_FILE"
            log_ok "Added PLEX_TOKEN to .env"
        fi
    else
        log_warn "PLEX_TOKEN not updated (no token provided, preserving existing)"
    fi
    
    if [[ -n "$claim_token" ]]; then
        local escaped_claim="${claim_token//\//\\/}"
        if grep -q "^PLEX_CLAIM=" "$ENV_FILE"; then
            sed -i "s/^PLEX_CLAIM=.*/PLEX_CLAIM=${escaped_claim}/" "$ENV_FILE"
            log_ok "Updated PLEX_CLAIM in .env"
        else
            echo "PLEX_CLAIM=${claim_token}" >> "$ENV_FILE"
            log_ok "Added PLEX_CLAIM to .env"
        fi
    else
        log_error "No claim token provided!"
        exit 1
    fi
}

restart_plex() {
    print_header "Restarting Plex with Claim Token"
    
    echo "Stopping Plex container..." >&2
    docker compose -f "${DEPLOY_DIR}/docker-compose.yml" stop plex
    
    echo "Removing old container (to apply new claim)..." >&2
    docker compose -f "${DEPLOY_DIR}/docker-compose.yml" rm -f plex
    
    echo "Starting Plex with claim token..." >&2
    docker compose -f "${DEPLOY_DIR}/docker-compose.yml" up -d plex
    
    echo "" >&2
    echo -e "${YELLOW}Waiting for Plex to start (30 seconds)...${NC}" >&2
    sleep 30
    
    local identity
    identity=$(curl -s http://localhost:32400/identity 2>/dev/null || echo "")
    local claimed
    claimed=$(echo "$identity" | grep -oP 'claimed="\K[^"]+' || echo "0")
    
    if [[ "$claimed" == "1" ]]; then
        echo "" >&2
        echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}" >&2
        echo -e "${GREEN}  SUCCESS! Your Plex server is now claimed!${NC}" >&2
        echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}" >&2
        echo "" >&2
        echo "Access your Plex server at:" >&2
        echo -e "  ${CYAN}http://localhost:32400/web${NC}" >&2
        echo "" >&2
        echo "Next steps:" >&2
        echo "  1. Open Plex in your browser" >&2
        echo "  2. Set up your libraries (Movies, TV Shows, etc.)" >&2
        echo "  3. Point them to /nas/video, /nas/music, etc." >&2
    else
        echo "" >&2
        echo -e "${YELLOW}════════════════════════════════════════════════════════════════${NC}" >&2
        echo -e "${YELLOW}  Plex may still be initializing...${NC}" >&2
        echo -e "${YELLOW}════════════════════════════════════════════════════════════════${NC}" >&2
        echo "" >&2
        echo "Try accessing: http://localhost:32400/web" >&2
        echo "" >&2
        echo "If still not claimed, the token may have expired." >&2
        echo "Run this script again to get a fresh token." >&2
    fi
}

manual_claim_fallback() {
    print_header "Manual Claim Token Entry"
    
    echo "" >&2
    echo -e "${YELLOW}Automatic token fetch failed. Falling back to manual entry.${NC}" >&2
    echo "" >&2
    echo "Steps to get your claim token:" >&2
    echo "" >&2
    echo "  1. Open this URL in your browser:" >&2
    echo -e "     ${CYAN}https://www.plex.tv/claim/${NC}" >&2
    echo "" >&2
    echo "  2. Log in to your Plex account if prompted" >&2
    echo "" >&2
    echo "  3. Copy the token that appears (starts with 'claim-')" >&2
    echo "" >&2
    echo -e "${YELLOW}IMPORTANT: Claim tokens expire in 4 minutes!${NC}" >&2
    echo "" >&2
    
    read -p "Paste your claim token here: " claim_token </dev/tty
    
    if [[ -z "$claim_token" ]]; then
        log_error "No token provided"
        exit 1
    fi
    
    claim_token=$(echo "$claim_token" | tr -d '[:space:]')
    
    if [[ ! "$claim_token" =~ ^claim-[A-Za-z0-9_-]+$ ]]; then
        log_error "Invalid token format. Token must start with 'claim-' and contain only letters, numbers, dashes, and underscores"
        exit 1
    fi
    
    echo "$claim_token"
}

fix_corrupted_env() {
    if [[ -f "$ENV_FILE" ]] && grep -q $'\x1b' "$ENV_FILE"; then
        echo -e "${YELLOW}[FIX]${NC} Detected corrupted .env file, cleaning..." >&2
        grep -v $'\x1b' "$ENV_FILE" > "${ENV_FILE}.tmp" 2>/dev/null || true
        mv "${ENV_FILE}.tmp" "$ENV_FILE"
        log_ok "Cleaned corrupted entries from .env"
    fi
}

main() {
    print_header "Plex Server Auto-Claim Tool"
    
    cd "$DEPLOY_DIR"
    
    fix_corrupted_env
    
    if check_plex_status 2>/dev/null; then
        exit 0
    fi
    
    echo "" >&2
    echo -e "${YELLOW}Your Plex server needs to be claimed.${NC}" >&2
    echo "This links it to your Plex account for remote access and sync." >&2
    echo "" >&2
    echo -e "${GREEN}This tool will automatically fetch your tokens!${NC}" >&2
    echo "" >&2
    
    read -p "Would you like to claim it now? [Y/n]: " do_claim </dev/tty
    if [[ ! "${do_claim:-Y}" =~ ^[Yy]$ ]]; then
        echo "Exiting. Run this script again when ready." >&2
        exit 0
    fi
    
    echo "" >&2
    log_info "Enter your Plex account credentials:"
    echo "(If you have 2FA enabled, append your 6-digit code to your password)" >&2
    echo "" >&2
    
    read -p "Plex Email/Username: " plex_username </dev/tty
    read -s -p "Plex Password: " plex_password </dev/tty
    echo "" >&2
    
    if [[ -z "$plex_username" || -z "$plex_password" ]]; then
        log_error "Username and password are required"
        exit 1
    fi
    
    plex_token=""
    claim_token=""
    
    if plex_token=$(get_plex_token "$plex_username" "$plex_password") && [[ "$plex_token" =~ ^[A-Za-z0-9_-]{20,}$ ]]; then
        echo "" >&2
        
        if claim_token=$(get_claim_token "$plex_token") && [[ "$claim_token" =~ ^claim- ]]; then
            echo "" >&2
            update_env_file "$plex_token" "$claim_token"
            restart_plex
        else
            log_warn "Could not auto-fetch claim token"
            claim_token=$(manual_claim_fallback)
            update_env_file "$plex_token" "$claim_token"
            restart_plex
        fi
    else
        echo "" >&2
        log_warn "Could not auto-fetch tokens"
        claim_token=$(manual_claim_fallback)
        update_env_file "" "$claim_token"
        restart_plex
    fi
}

main "$@"
