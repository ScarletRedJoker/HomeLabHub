#!/bin/bash
# Plex Server Claim Helper
# Simplifies the process of claiming an unclaimed Plex server
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

get_claim_token() {
    print_header "Get Your Plex Claim Token"
    
    echo ""
    echo -e "${YELLOW}IMPORTANT: Claim tokens expire in 4 minutes!${NC}"
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
    
    if command -v xdg-open &>/dev/null && [[ -n "${DISPLAY:-}" ]]; then
        read -p "Would you like to open the claim page now? [Y/n]: " open_page
        if [[ "${open_page:-Y}" =~ ^[Yy]$ ]]; then
            xdg-open "https://www.plex.tv/claim/" 2>/dev/null &
            echo -e "${GREEN}Opening browser...${NC}"
            sleep 2
        fi
    fi
    
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

update_env_file() {
    local claim_token=$1
    
    print_header "Updating Environment"
    
    if [[ ! -f "$ENV_FILE" ]]; then
        echo "PLEX_CLAIM=${claim_token}" > "$ENV_FILE"
        echo -e "${GREEN}[OK]${NC} Created .env file with PLEX_CLAIM"
    elif grep -q "^PLEX_CLAIM=" "$ENV_FILE"; then
        sed -i "s|^PLEX_CLAIM=.*|PLEX_CLAIM=${claim_token}|" "$ENV_FILE"
        echo -e "${GREEN}[OK]${NC} Updated PLEX_CLAIM in .env"
    else
        echo "PLEX_CLAIM=${claim_token}" >> "$ENV_FILE"
        echo -e "${GREEN}[OK]${NC} Added PLEX_CLAIM to .env"
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
        echo "Run this script again with a fresh token."
    fi
}

main() {
    print_header "Plex Server Claim Helper"
    
    cd "$DEPLOY_DIR"
    
    if check_plex_status 2>/dev/null; then
        exit 0
    fi
    
    echo ""
    echo -e "${YELLOW}Your Plex server needs to be claimed.${NC}"
    echo "This links it to your Plex account for remote access and sync."
    echo ""
    
    read -p "Would you like to claim it now? [Y/n]: " do_claim
    if [[ ! "${do_claim:-Y}" =~ ^[Yy]$ ]]; then
        echo "Exiting. Run this script again when ready."
        exit 0
    fi
    
    claim_token=$(get_claim_token)
    
    update_env_file "$claim_token"
    
    restart_plex
}

main "$@"
