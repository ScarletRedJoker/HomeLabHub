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
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
}

check_plex_status() {
    print_header "Checking Plex Server Status"
    
    if ! docker ps --format '{{.Names}}' | grep -q "^plex$"; then
        echo -e "${RED}[ERROR]${NC} Plex container is not running!"
        echo "Start it with: docker compose up -d plex"
        exit 1
    fi
    
    echo -e "${GREEN}[OK]${NC} Plex container is running"
    
    local identity
    identity=$(curl -s http://localhost:32400/identity 2>/dev/null || echo "")
    
    if [[ -z "$identity" ]]; then
        echo -e "${YELLOW}[WARN]${NC} Cannot reach Plex API - server may still be starting"
        echo "Wait a moment and try again..."
        exit 1
    fi
    
    local claimed
    claimed=$(echo "$identity" | grep -oP 'claimed="\K[^"]+' || echo "unknown")
    local machine_id
    machine_id=$(echo "$identity" | grep -oP 'machineIdentifier="\K[^"]+' || echo "unknown")
    local version
    version=$(echo "$identity" | grep -oP 'version="\K[^"]+' || echo "unknown")
    
    echo ""
    echo -e "${CYAN}Plex Server Info:${NC}"
    echo -e "  Version:    ${version}"
    echo -e "  Machine ID: ${machine_id:0:16}..."
    
    if [[ "$claimed" == "1" ]]; then
        echo -e "  Status:     ${GREEN}CLAIMED${NC} ✓"
        echo ""
        echo -e "${GREEN}Your Plex server is already claimed!${NC}"
        echo "Access it at: http://localhost:32400/web"
        exit 0
    else
        echo -e "  Status:     ${RED}NOT CLAIMED${NC}"
        echo ""
        return 1
    fi
}

get_plex_token() {
    local username=$1
    local password=$2
    
    echo -e "${CYAN}Fetching X-Plex-Token from Plex API...${NC}"
    
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
            echo -e "${GREEN}[OK]${NC} Successfully obtained X-Plex-Token"
            echo "$token"
            return 0
        fi
    fi
    
    if echo "$response" | grep -q "Invalid email"; then
        echo -e "${RED}[ERROR]${NC} Invalid email or username"
    elif echo "$response" | grep -q "Invalid password"; then
        echo -e "${RED}[ERROR]${NC} Invalid password"
    elif echo "$response" | grep -q "two-factor"; then
        echo -e "${YELLOW}[2FA]${NC} Two-factor authentication is enabled"
        echo "Please append your 6-digit 2FA code to your password"
        echo "Example: mypassword123456"
    else
        echo -e "${RED}[ERROR]${NC} Failed to authenticate with Plex"
        echo "Response: $response"
    fi
    
    return 1
}

get_claim_token() {
    local plex_token=$1
    
    echo -e "${CYAN}Fetching claim token from Plex API...${NC}"
    
    local response
    response=$(curl -s "https://plex.tv/api/claim/token.json" \
        -H "X-Plex-Token: ${plex_token}" \
        -H "X-Plex-Client-Identifier: ${CLIENT_ID}" \
        2>/dev/null)
    
    if echo "$response" | grep -q '"token"'; then
        local claim
        claim=$(echo "$response" | grep -oP '"token"\s*:\s*"\K[^"]+' || echo "")
        if [[ -n "$claim" ]]; then
            echo -e "${GREEN}[OK]${NC} Successfully obtained claim token"
            echo "$claim"
            return 0
        fi
    fi
    
    echo -e "${RED}[ERROR]${NC} Failed to get claim token"
    echo "Response: $response"
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
        if grep -q "^PLEX_TOKEN=" "$ENV_FILE"; then
            sed -i "s|^PLEX_TOKEN=.*|PLEX_TOKEN=${plex_token}|" "$ENV_FILE"
            echo -e "${GREEN}[OK]${NC} Updated PLEX_TOKEN in .env"
        else
            echo "PLEX_TOKEN=${plex_token}" >> "$ENV_FILE"
            echo -e "${GREEN}[OK]${NC} Added PLEX_TOKEN to .env"
        fi
    else
        echo -e "${YELLOW}[SKIP]${NC} PLEX_TOKEN not updated (no token provided, preserving existing)"
    fi
    
    if [[ -n "$claim_token" ]]; then
        if grep -q "^PLEX_CLAIM=" "$ENV_FILE"; then
            sed -i "s|^PLEX_CLAIM=.*|PLEX_CLAIM=${claim_token}|" "$ENV_FILE"
            echo -e "${GREEN}[OK]${NC} Updated PLEX_CLAIM in .env"
        else
            echo "PLEX_CLAIM=${claim_token}" >> "$ENV_FILE"
            echo -e "${GREEN}[OK]${NC} Added PLEX_CLAIM to .env"
        fi
    else
        echo -e "${RED}[ERROR]${NC} No claim token provided!"
        exit 1
    fi
}

restart_plex() {
    print_header "Restarting Plex with Claim Token"
    
    echo "Stopping Plex container..."
    docker compose -f "${DEPLOY_DIR}/docker-compose.yml" stop plex
    
    echo "Removing old container (to apply new claim)..."
    docker compose -f "${DEPLOY_DIR}/docker-compose.yml" rm -f plex
    
    echo "Starting Plex with claim token..."
    docker compose -f "${DEPLOY_DIR}/docker-compose.yml" up -d plex
    
    echo ""
    echo -e "${YELLOW}Waiting for Plex to start (30 seconds)...${NC}"
    sleep 30
    
    local identity
    identity=$(curl -s http://localhost:32400/identity 2>/dev/null || echo "")
    local claimed
    claimed=$(echo "$identity" | grep -oP 'claimed="\K[^"]+' || echo "0")
    
    if [[ "$claimed" == "1" ]]; then
        echo ""
        echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
        echo -e "${GREEN}  SUCCESS! Your Plex server is now claimed!${NC}"
        echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
        echo ""
        echo "Access your Plex server at:"
        echo -e "  ${CYAN}http://localhost:32400/web${NC}"
        echo ""
        echo "Next steps:"
        echo "  1. Open Plex in your browser"
        echo "  2. Set up your libraries (Movies, TV Shows, etc.)"
        echo "  3. Point them to /nas/video, /nas/music, etc."
    else
        echo ""
        echo -e "${YELLOW}════════════════════════════════════════════════════════════════${NC}"
        echo -e "${YELLOW}  Plex may still be initializing...${NC}"
        echo -e "${YELLOW}════════════════════════════════════════════════════════════════${NC}"
        echo ""
        echo "Try accessing: http://localhost:32400/web"
        echo ""
        echo "If still not claimed, the token may have expired."
        echo "Run this script again to get a fresh token."
    fi
}

manual_claim_fallback() {
    print_header "Manual Claim Token Entry"
    
    echo ""
    echo -e "${YELLOW}Automatic token fetch failed. Falling back to manual entry.${NC}"
    echo ""
    echo "Steps to get your claim token:"
    echo ""
    echo "  1. Open this URL in your browser:"
    echo -e "     ${CYAN}https://www.plex.tv/claim/${NC}"
    echo ""
    echo "  2. Log in to your Plex account if prompted"
    echo ""
    echo "  3. Copy the token that appears (starts with 'claim-')"
    echo ""
    echo -e "${YELLOW}IMPORTANT: Claim tokens expire in 4 minutes!${NC}"
    echo ""
    
    read -p "Paste your claim token here: " claim_token
    
    if [[ -z "$claim_token" ]]; then
        echo -e "${RED}[ERROR]${NC} No token provided"
        exit 1
    fi
    
    if [[ ! "$claim_token" =~ ^claim- ]]; then
        echo -e "${RED}[ERROR]${NC} Invalid token format. Token must start with 'claim-'"
        exit 1
    fi
    
    echo "$claim_token"
}

main() {
    print_header "Plex Server Auto-Claim Tool"
    
    cd "$DEPLOY_DIR"
    
    if check_plex_status 2>/dev/null; then
        exit 0
    fi
    
    echo ""
    echo -e "${YELLOW}Your Plex server needs to be claimed.${NC}"
    echo "This links it to your Plex account for remote access and sync."
    echo ""
    echo -e "${GREEN}This tool will automatically fetch your tokens!${NC}"
    echo ""
    
    read -p "Would you like to claim it now? [Y/n]: " do_claim
    if [[ ! "${do_claim:-Y}" =~ ^[Yy]$ ]]; then
        echo "Exiting. Run this script again when ready."
        exit 0
    fi
    
    echo ""
    echo -e "${CYAN}Enter your Plex account credentials:${NC}"
    echo "(If you have 2FA enabled, append your 6-digit code to your password)"
    echo ""
    
    read -p "Plex Email/Username: " plex_username
    read -s -p "Plex Password: " plex_password
    echo ""
    
    if [[ -z "$plex_username" || -z "$plex_password" ]]; then
        echo -e "${RED}[ERROR]${NC} Username and password are required"
        exit 1
    fi
    
    plex_token=""
    claim_token=""
    
    if plex_token=$(get_plex_token "$plex_username" "$plex_password" 2>&1 | tail -1) && [[ "$plex_token" =~ ^[A-Za-z0-9_-]{20,}$ ]]; then
        echo ""
        
        if claim_token=$(get_claim_token "$plex_token" 2>&1 | tail -1) && [[ "$claim_token" =~ ^claim- ]]; then
            echo ""
            update_env_file "$plex_token" "$claim_token"
            restart_plex
        else
            echo -e "${YELLOW}[WARN]${NC} Could not auto-fetch claim token"
            claim_token=$(manual_claim_fallback)
            update_env_file "$plex_token" "$claim_token"
            restart_plex
        fi
    else
        echo ""
        echo -e "${YELLOW}[WARN]${NC} Could not auto-fetch tokens"
        claim_token=$(manual_claim_fallback)
        update_env_file "" "$claim_token"
        restart_plex
    fi
}

main "$@"
