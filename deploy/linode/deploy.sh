#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_DIR="$(dirname "$SCRIPT_DIR")/shared"

source "$SHARED_DIR/env-lib.sh"
source "$SHARED_DIR/lib.sh"

cd "$SCRIPT_DIR"

VERBOSE=false
NO_CACHE=true
SKIP_PREFLIGHT=false
SKIP_BUILD=false

for arg in "$@"; do
    case $arg in
        -v|--verbose) VERBOSE=true ;;
        --cache) NO_CACHE=false ;;
        --skip-preflight) SKIP_PREFLIGHT=true ;;
        --skip-build) SKIP_BUILD=true ;;
    esac
done

show_help() {
    echo "Nebula Command - Linode Deployment"
    echo ""
    echo "Usage: ./deploy.sh [options] [command]"
    echo ""
    echo "Options:"
    echo "  -v, --verbose     Show full build/deploy output"
    echo "  --cache           Use Docker cache (default: no-cache for clean builds)"
    echo "  --skip-preflight  Skip host prerequisite checks"
    echo "  --skip-build      Skip Docker build (use existing images)"
    echo ""
    echo "Commands:"
    echo "  (none)       Full deployment (preflight + setup + build + deploy)"
    echo "  setup        Interactive environment setup only"
    echo "  check        Check environment and service health"
    echo "  preflight    Run host prerequisite checks only"
    echo "  build        Build images only"
    echo "  up           Start services only (no build)"
    echo "  down         Stop services"
    echo "  restart      Restart all services"
    echo "  verify       Extended health checks with retries (up to 60s)"
    echo "  logs         View service logs (docker compose logs)"
    echo "  status       Show service status"
    echo "  build-logs   View saved build/deploy logs"
    echo "  prune        Clean up Docker resources"
    echo "  help         Show this help"
    echo ""
    echo "Environment Variables:"
    echo "  KEEP_BUILD_LOGS=true  Keep logs even on success"
    echo "  VERBOSE=true          Same as -v flag"
    echo "  DRY_RUN=true          Show what would be done without executing"
    echo ""
    echo "Examples:"
    echo "  ./deploy.sh                    # Full deployment"
    echo "  ./deploy.sh -v                 # Verbose deployment"
    echo "  ./deploy.sh --cache build      # Build with cache"
    echo "  ./deploy.sh status             # Check service status"
    echo ""
}

do_preflight() {
    echo -e "${CYAN}[0/5] Preflight checks...${NC}"
    
    if [ "$SKIP_PREFLIGHT" = true ]; then
        echo -e "${YELLOW}[SKIP]${NC} Preflight checks skipped (--skip-preflight)"
        echo ""
        return 0
    fi
    
    if ! preflight_host; then
        echo ""
        echo -e "${RED}Preflight failed. Fix issues above or use --skip-preflight to bypass.${NC}"
        exit 1
    fi
    echo ""
}

do_git_pull() {
    echo -e "${CYAN}[1/5] Pulling latest code...${NC}"
    local repo_root
    repo_root="$(dirname "$(dirname "$SCRIPT_DIR")")"
    cd "$repo_root"
    
    local secret_files=(
        "deploy/local/services/authelia/configuration.yml"
        "deploy/local/services/authelia/users_database.yml"
        "deploy/linode/services/authelia/configuration.yml"
        "deploy/linode/services/authelia/users_database.yml"
    )
    
    local stashed=false
    local has_local_changes=false
    
    for f in "${secret_files[@]}"; do
        if [ -f "$f" ] && ! git diff --quiet "$f" 2>/dev/null; then
            has_local_changes=true
            break
        fi
    done
    
    if [ "$has_local_changes" = true ]; then
        [ "$VERBOSE" = true ] && echo "  Stashing local secret files..."
        git stash push -m "deploy-linode-secrets-$(date +%s)" -- "${secret_files[@]}" > /dev/null 2>&1 && stashed=true || true
    fi
    
    local pull_success=false
    if [ "$VERBOSE" = true ]; then
        if git pull origin main; then
            pull_success=true
        fi
    else
        echo -n "  Fetching updates... "
        if git pull origin main > /dev/null 2>&1; then
            echo -e "${GREEN}done${NC}"
            pull_success=true
        else
            echo -e "${YELLOW}check manually${NC}"
        fi
    fi
    
    if [ "$stashed" = true ]; then
        [ "$VERBOSE" = true ] && echo "  Restoring local secret files..."
        git stash pop > /dev/null 2>&1 || true
    fi
    
    cd "$SCRIPT_DIR"
    echo -e "${GREEN}✓ Code updated${NC}"
    echo ""
}

ensure_ssh_keys() {
    echo -e "${CYAN}━━━ SSH Keys ━━━${NC}"
    
    local ssh_dir="${HOME}/.ssh"
    local key_path="${ssh_dir}/homelab"
    
    if [ -f "$key_path" ] && [ -f "${key_path}.pub" ]; then
        echo -e "${GREEN}[OK]${NC} SSH key exists: $key_path"
        return 0
    fi
    
    echo -e "${YELLOW}[SETUP]${NC} No SSH key found, generating..."
    mkdir -p "$ssh_dir"
    chmod 700 "$ssh_dir"
    
    ssh-keygen -t ed25519 -f "$key_path" -N "" -C "homelab-$(hostname)-$(date +%Y%m%d)" -q
    
    if [ -f "$key_path" ]; then
        chmod 600 "$key_path"
        chmod 644 "${key_path}.pub"
        echo -e "${GREEN}[OK]${NC} SSH key generated: $key_path"
        echo ""
        echo -e "${YELLOW}Public key (add to remote servers' ~/.ssh/authorized_keys):${NC}"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        cat "${key_path}.pub"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
    else
        echo -e "${RED}[ERROR]${NC} Failed to generate SSH key"
        return 1
    fi
}

do_env_setup() {
    echo -e "${CYAN}[2/5] Environment setup...${NC}"
    
    [ ! -f ".env" ] && touch ".env"
    
    normalize_env_file ".env"
    
    echo -e "${CYAN}━━━ Internal Secrets ━━━${NC}"
    ensure_internal_secrets ".env"
    
    ensure_ssh_keys
    
    configure_local_ai_env ".env"
    
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
    
    if [ "$SKIP_BUILD" = true ]; then
        echo -e "${YELLOW}[SKIP]${NC} Build skipped (--skip-build)"
        echo ""
        return 0
    fi
    
    init_logging "build"
    
    docker_prune_if_needed
    
    local cache_flag=true
    [ "$NO_CACHE" = true ] && cache_flag=false
    
    if ! safe_docker_build "docker-compose.yml" "$DEPLOY_LOG" "$cache_flag"; then
        exit 1
    fi
    
    if [ "${KEEP_BUILD_LOGS:-}" != "true" ]; then
        rm -f "$DEPLOY_LOG" 2>/dev/null || true
    fi
    
    cleanup_old_logs "$LOG_DIR" 10
    echo ""
}

do_deploy() {
    echo -e "${CYAN}[4/5] Deploying services...${NC}"
    
    init_logging "deploy"
    
    if ! safe_docker_deploy "docker-compose.yml" "$DEPLOY_LOG"; then
        exit 1
    fi
    
    if [ "${KEEP_BUILD_LOGS:-}" != "true" ]; then
        rm -f "$DEPLOY_LOG" 2>/dev/null || true
    fi
    
    echo ""
}

do_post_deploy() {
    echo -e "${CYAN}[5/5] Post-deployment tasks...${NC}"
    
    post_deploy_wait 10
    
    [ -f "scripts/sync-streambot-db.sh" ] && bash scripts/sync-streambot-db.sh 2>/dev/null || true
    [ -f "scripts/sync-discordbot-db.sh" ] && bash scripts/sync-discordbot-db.sh 2>/dev/null || true
    
    docker restart stream-bot discord-bot 2>/dev/null || true
    
    echo -e "${GREEN}✓ Database synced${NC}"
    
    wait_for_services_with_retry "linode" 6 10
    
    health_report "linode"
    
    show_deployment_summary "linode"
}

do_verify() {
    echo -e "${CYAN}═══ Nebula Command - Extended Health Verification ═══${NC}"
    echo "Running extended health checks with retry..."
    wait_for_services_with_retry "linode" 12 5
    echo ""
    health_report "linode"
}

do_status() {
    echo -e "${CYAN}═══ Nebula Command - Service Status ═══${NC}"
    echo ""
    echo -e "${CYAN}━━━ Docker Containers ━━━${NC}"
    docker compose ps
    echo ""
    health_report "linode"
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
        do_status
        ;;
    preflight)
        echo -e "${CYAN}═══ Nebula Command - Preflight Checks ═══${NC}"
        preflight_host
        ;;
    build)
        echo -e "${CYAN}═══ Nebula Command - Build Only ═══${NC}"
        do_build
        ;;
    up)
        echo -e "${CYAN}═══ Nebula Command - Start Services ═══${NC}"
        do_deploy
        post_deploy_wait 15
        health_report "linode"
        ;;
    down)
        echo -e "${CYAN}═══ Nebula Command - Stop Services ═══${NC}"
        docker compose down
        echo -e "${GREEN}✓ Services stopped${NC}"
        ;;
    restart)
        echo -e "${CYAN}═══ Nebula Command - Restart Services ═══${NC}"
        docker compose restart
        post_deploy_wait 10
        health_report "linode"
        ;;
    status)
        do_status
        ;;
    logs)
        docker compose logs -f "${2:-}"
        ;;
    build-logs)
        log_dir="$SCRIPT_DIR/logs"
        if [ -d "$log_dir" ] && [ "$(ls -A "$log_dir" 2>/dev/null)" ]; then
            echo -e "${CYAN}═══ Build/Deploy Logs ═══${NC}"
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
            echo "No logs found. Logs are saved when builds/deploys fail."
            echo "To keep logs on success: KEEP_BUILD_LOGS=true ./deploy.sh"
        fi
        ;;
    verify)
        do_verify
        ;;
    prune)
        echo -e "${CYAN}═══ Nebula Command - Cleanup ═══${NC}"
        echo "This will remove unused Docker resources."
        read -r -p "Continue? (y/N) " confirm
        if [[ "$confirm" =~ ^[Yy]$ ]]; then
            docker system prune -f
            docker image prune -f
            echo -e "${GREEN}✓ Cleanup complete${NC}"
        fi
        ;;
    *)
        echo -e "${CYAN}═══ Nebula Command - Linode Deployment ═══${NC}"
        echo "Directory: $SCRIPT_DIR"
        echo ""
        
        do_preflight
        do_git_pull
        do_env_setup
        do_build
        do_deploy
        do_post_deploy
        ;;
esac
