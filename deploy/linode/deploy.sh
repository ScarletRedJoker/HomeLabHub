#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_DIR="$(dirname "$SCRIPT_DIR")/shared"

source "$SHARED_DIR/env-lib.sh"

cd "$SCRIPT_DIR"

show_help() {
    echo "Nebula Command - Linode Deployment"
    echo ""
    echo "Usage: ./deploy.sh [command]"
    echo ""
    echo "Commands:"
    echo "  (none)       Full deployment (setup + build + deploy)"
    echo "  setup        Interactive environment setup only"
    echo "  check        Check environment health"
    echo "  build        Build images only (with full logging)"
    echo "  up           Start services only"
    echo "  down         Stop services"
    echo "  logs         View service logs (docker compose logs)"
    echo "  build-logs   View saved build logs"
    echo "  help         Show this help"
    echo ""
    echo "Environment:"
    echo "  KEEP_BUILD_LOGS=true  Keep build logs even on success"
    echo ""
}

do_git_pull() {
    echo -e "${CYAN}[1/5] Pulling latest code...${NC}"
    local repo_root
    repo_root="$(dirname "$(dirname "$SCRIPT_DIR")")"
    cd "$repo_root"
    git pull origin main
    cd "$SCRIPT_DIR"
    echo -e "${GREEN}✓ Code updated${NC}"
    echo ""
}

do_env_setup() {
    echo -e "${CYAN}[2/5] Environment setup...${NC}"
    
    [ ! -f ".env" ] && touch ".env"
    
    normalize_env_file ".env"
    
    echo -e "${CYAN}━━━ Internal Secrets ━━━${NC}"
    ensure_internal_secrets ".env"
    
    if ! check_external_tokens ".env"; then
        echo ""
        echo -e "${YELLOW}Missing required tokens detected.${NC}"
        read -r -p "Run interactive setup? (Y/n) " do_setup
        
        if [[ ! "$do_setup" =~ ^[Nn]$ ]]; then
            local discord_token
            discord_token=$(get_env_value "DISCORD_BOT_TOKEN" ".env")
            if [ -z "$discord_token" ] || [[ "$discord_token" == *"xxxxx"* ]]; then
                prompt_for_token "DISCORD_BOT_TOKEN" \
                    "Discord bot authentication token" \
                    "https://discord.com/developers/applications" \
                    "true" || {
                    echo ""
                    echo -e "${RED}DISCORD_BOT_TOKEN is required. Aborting.${NC}"
                    exit 1
                }
            fi
            
            check_external_tokens ".env"
        else
            echo ""
            read -r -p "Continue without required tokens? (y/N) " continue_anyway
            if [[ ! "$continue_anyway" =~ ^[Yy]$ ]]; then
                echo -e "${RED}Deployment aborted.${NC}"
                exit 1
            fi
        fi
    fi
    
    echo -e "${GREEN}✓ Environment ready${NC}"
    echo ""
}

do_build() {
    echo -e "${CYAN}[3/5] Building images...${NC}"
    
    local log_dir="$SCRIPT_DIR/logs"
    mkdir -p "$log_dir"
    local log_file="$log_dir/build_$(date +%Y%m%d_%H%M%S).log"
    
    echo "Build log: $log_file"
    echo ""
    
    if docker compose build --no-cache --progress=plain 2>&1 | tee "$log_file"; then
        echo -e "${GREEN}✓ Build complete${NC}"
        if [ "${KEEP_BUILD_LOGS:-}" != "true" ]; then
            rm -f "$log_file"
        fi
    else
        echo ""
        echo -e "${RED}✗ Build failed!${NC}"
        echo -e "${YELLOW}Full build log saved to: $log_file${NC}"
        echo ""
        echo "Last 50 lines of errors:"
        echo "─────────────────────────"
        tail -50 "$log_file"
        echo "─────────────────────────"
        echo ""
        echo "To view full log: less $log_file"
        echo "To rebuild: ./deploy.sh build"
        exit 1
    fi
    echo ""
}

do_deploy() {
    echo -e "${CYAN}[4/5] Deploying services...${NC}"
    docker compose down --remove-orphans 2>/dev/null || true
    docker compose up -d
    echo -e "${GREEN}✓ Services started${NC}"
    echo ""
}

do_post_deploy() {
    echo -e "${CYAN}[5/5] Post-deployment tasks...${NC}"
    
    sleep 10
    
    [ -f "scripts/sync-streambot-db.sh" ] && bash scripts/sync-streambot-db.sh 2>/dev/null || true
    [ -f "scripts/sync-discordbot-db.sh" ] && bash scripts/sync-discordbot-db.sh 2>/dev/null || true
    
    docker restart stream-bot discord-bot 2>/dev/null || true
    
    echo -e "${GREEN}✓ Database synced${NC}"
    echo ""
    
    echo -e "${CYAN}Waiting for services (15s)...${NC}"
    sleep 15
    
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
    
    check_health "Dashboard" "http://localhost:5000/health"
    check_health "Discord Bot" "http://localhost:4000/health"
    check_health "Stream Bot" "http://localhost:3000/health"
    
    echo ""
    echo -e "${GREEN}═══ Deployment Complete ═══${NC}"
    echo ""
    echo "Access URLs (configure your domain DNS to point here):"
    echo "  Dashboard:   http://localhost:5000 (or https://dashboard.yourdomain.com)"
    echo "  Discord Bot: http://localhost:4000 (or https://discord.yourdomain.com)"
    echo "  Stream Bot:  http://localhost:3000 (or https://stream.yourdomain.com)"
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
        ;;
    build)
        echo -e "${CYAN}═══ Nebula Command - Build Only ═══${NC}"
        do_build
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
    build-logs)
        local log_dir="$SCRIPT_DIR/logs"
        if [ -d "$log_dir" ] && [ "$(ls -A "$log_dir" 2>/dev/null)" ]; then
            echo -e "${CYAN}═══ Build Logs ═══${NC}"
            ls -lt "$log_dir"/*.log 2>/dev/null | head -10
            echo ""
            latest=$(ls -t "$log_dir"/*.log 2>/dev/null | head -1)
            if [ -n "$latest" ]; then
                echo "Latest log: $latest"
                echo ""
                read -r -p "View latest log? (Y/n) " view_log
                if [[ ! "$view_log" =~ ^[Nn]$ ]]; then
                    less "$latest"
                fi
            fi
        else
            echo "No build logs found. Logs are saved when builds fail."
            echo "To keep logs on success: KEEP_BUILD_LOGS=true ./deploy.sh"
        fi
        ;;
    *)
        echo -e "${CYAN}═══ Nebula Command - Linode Deployment ═══${NC}"
        echo "Directory: $SCRIPT_DIR"
        echo ""
        
        do_git_pull
        do_env_setup
        do_build
        do_deploy
        do_post_deploy
        ;;
esac
