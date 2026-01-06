#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_DIR="$(dirname "$SCRIPT_DIR")/shared"

source "$SHARED_DIR/env-lib.sh"

cd "$SCRIPT_DIR"

show_help() {
    echo "Nebula Command - Local Ubuntu Deployment"
    echo ""
    echo "Usage: ./deploy.sh [command]"
    echo ""
    echo "Commands:"
    echo "  (none)     Full deployment (setup + deploy)"
    echo "  setup      Interactive environment setup only"
    echo "  check      Check environment health"
    echo "  up         Start services only"
    echo "  down       Stop services"
    echo "  logs       View service logs"
    echo "  nas        Mount NAS storage"
    echo "  help       Show this help"
    echo ""
}

do_git_pull() {
    echo -e "${CYAN}[1/4] Pulling latest code...${NC}"
    local repo_root
    repo_root="$(dirname "$(dirname "$SCRIPT_DIR")")"
    cd "$repo_root"
    git pull origin main
    cd "$SCRIPT_DIR"
    echo -e "${GREEN}✓ Code updated${NC}"
    echo ""
}

do_env_setup() {
    echo -e "${CYAN}[2/4] Environment setup...${NC}"
    
    [ ! -f ".env" ] && touch ".env"
    
    normalize_env_file ".env"
    
    echo -e "${CYAN}━━━ Internal Secrets ━━━${NC}"
    ensure_internal_secrets ".env"
    
    echo -e "${GREEN}✓ Environment ready${NC}"
    echo ""
}

check_nas() {
    echo -e "${CYAN}━━━ NAS Storage ━━━${NC}"
    if mountpoint -q /mnt/nas/all 2>/dev/null; then
        echo -e "${GREEN}[OK]${NC} NAS mounted at /mnt/nas/all"
    else
        echo -e "${YELLOW}[SKIP]${NC} NAS not mounted (Plex media unavailable)"
        echo "       To mount: sudo ./scripts/setup-nas-mounts.sh"
    fi
    echo ""
}

do_deploy() {
    echo -e "${CYAN}[3/4] Deploying services...${NC}"
    docker compose pull
    docker compose down --remove-orphans 2>/dev/null || true
    docker compose up -d
    echo -e "${GREEN}✓ Services started${NC}"
    echo ""
}

do_post_deploy() {
    echo -e "${CYAN}[4/4] Health checks...${NC}"
    sleep 20
    
    echo ""
    echo -e "${CYAN}━━━ Service Status ━━━${NC}"
    docker compose ps
    
    echo ""
    echo -e "${CYAN}━━━ Health Checks ━━━${NC}"
    
    check_health() {
        local name=$1
        local url=$2
        if curl -sf "$url" > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓${NC} $name"
        else
            echo -e "  ${YELLOW}⏳${NC} $name (starting...)"
        fi
    }
    
    check_health "Plex" "http://localhost:32400/identity"
    check_health "MinIO" "http://localhost:9000/minio/health/live"
    check_health "Home Assistant" "http://localhost:8123/"
    
    echo ""
    echo -e "${GREEN}═══ Local Deployment Complete ═══${NC}"
    echo ""
    echo "Access URLs:"
    echo "  Plex:           http://localhost:32400/web"
    echo "  MinIO Console:  http://localhost:9001"
    echo "  Home Assistant: http://localhost:8123"
    echo ""
    echo "Commands:"
    echo "  Logs:    docker compose logs -f [service]"
    echo "  Status:  docker compose ps"
    echo "  Restart: docker compose restart [service]"
}

case "${1:-}" in
    help|--help|-h)
        show_help
        ;;
    setup)
        echo -e "${CYAN}═══ Nebula Command - Environment Setup ═══${NC}"
        interactive_setup ".env"
        ;;
    check)
        env_doctor ".env" "check"
        check_nas
        ;;
    up)
        echo -e "${CYAN}═══ Nebula Command - Start Services ═══${NC}"
        do_deploy
        ;;
    down)
        echo -e "${CYAN}═══ Nebula Command - Stop Services ═══${NC}"
        docker compose down
        echo -e "${GREEN}✓ Services stopped${NC}"
        ;;
    logs)
        docker compose logs -f "${2:-}"
        ;;
    nas)
        echo -e "${CYAN}═══ Nebula Command - Mount NAS ═══${NC}"
        sudo ./scripts/setup-nas-mounts.sh
        ;;
    *)
        echo -e "${CYAN}═══ Nebula Command - Local Ubuntu Deployment ═══${NC}"
        echo "Directory: $SCRIPT_DIR"
        echo ""
        
        do_git_pull
        do_env_setup
        check_nas
        do_deploy
        do_post_deploy
        ;;
esac
