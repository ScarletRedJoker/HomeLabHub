#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_section() {
    echo ""
    echo -e "${CYAN}━━━ $1 ━━━${NC}"
}

log_ok() { echo -e "  ${GREEN}[OK]${NC} $*"; }
log_warn() { echo -e "  ${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "  ${RED}[ERROR]${NC} $*"; }
log_info() { echo -e "  ${BLUE}[INFO]${NC} $*"; }
log_step() { echo -e "\n${CYAN}[STEP]${NC} $1"; }

print_usage() {
    cat << EOF
Homelab Server Update Script

Usage: $0 [TARGET] [OPTIONS]

Targets:
  local           Update local Ubuntu server only
  linode          Update Linode cloud server only  
  all             Update both servers (default)
  
Options:
  --pull-only     Only pull code from GitHub, don't restart services
  --restart-only  Only restart services, don't pull new code
  --images        Also pull latest Docker images
  --force         Skip confirmation prompts
  -h, --help      Show this help message

Examples:
  $0                    # Update both servers
  $0 local              # Update local Ubuntu only
  $0 linode --images    # Update Linode with fresh Docker images
  $0 all --force        # Update everything without prompts

Post-Update Verification:
  After update completes, the script runs health checks on all services.
  
EOF
}

TARGET="all"
PULL_ONLY=false
RESTART_ONLY=false
PULL_IMAGES=false
FORCE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        local|linode|all)
            TARGET="$1"
            shift
            ;;
        --pull-only)
            PULL_ONLY=true
            shift
            ;;
        --restart-only)
            RESTART_ONLY=true
            shift
            ;;
        --images)
            PULL_IMAGES=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            print_usage
            exit 1
            ;;
    esac
done

confirm() {
    if [[ "$FORCE" == "true" ]]; then
        return 0
    fi
    read -p "  Continue? [y/N] " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]]
}

detect_server_role() {
    if [ -f "/etc/homelab-role" ]; then
        cat /etc/homelab-role
    elif hostname | grep -qi "linode\|cloud"; then
        echo "linode"
    elif [ -d "/mnt/nas" ] || [ -f "/etc/plex" ]; then
        echo "local"
    else
        echo "unknown"
    fi
}

pull_latest_code() {
    log_step "Pulling latest code from GitHub..."
    
    cd "$PROJECT_ROOT"
    
    if ! git status &>/dev/null; then
        log_error "Not a git repository"
        return 1
    fi
    
    local changes
    changes=$(git status --porcelain)
    if [ -n "$changes" ]; then
        log_warn "Uncommitted local changes detected:"
        echo "$changes" | head -10
        if ! confirm; then
            log_info "Stashing changes..."
            git stash
        fi
    fi
    
    local branch
    branch=$(git branch --show-current)
    log_info "Current branch: $branch"
    
    git fetch origin
    
    local behind
    behind=$(git rev-list HEAD..origin/"$branch" --count 2>/dev/null || echo "0")
    
    if [ "$behind" -gt 0 ]; then
        log_info "Pulling $behind new commit(s)..."
        git pull origin "$branch"
        log_ok "Code updated successfully"
    else
        log_ok "Already up to date"
    fi
}

update_local_server() {
    print_section "Updating Local Ubuntu Server"
    
    local local_deploy_dir="${PROJECT_ROOT}/deploy/local"
    
    if [ ! -d "$local_deploy_dir" ]; then
        log_error "Local deployment directory not found: $local_deploy_dir"
        return 1
    fi
    
    cd "$local_deploy_dir"
    
    if [[ "$RESTART_ONLY" != "true" ]]; then
        pull_latest_code
    fi
    
    if [[ "$PULL_ONLY" == "true" ]]; then
        log_info "Pull only mode - skipping service restart"
        return 0
    fi
    
    log_step "Checking NAS mount status..."
    if mountpoint -q /mnt/nas/all 2>/dev/null; then
        log_ok "NAS is mounted"
    else
        log_warn "NAS is not mounted - Plex media may be unavailable"
        echo "    To fix: sudo ./scripts/setup-nas-mounts.sh"
    fi
    
    if [[ "$PULL_IMAGES" == "true" ]]; then
        log_step "Pulling latest Docker images..."
        docker compose pull 2>&1 || log_warn "Some images may not have updated"
    fi
    
    log_step "Restarting local services..."
    
    docker compose down --remove-orphans 2>&1 || true
    docker compose up -d 2>&1
    
    log_info "Waiting for services to start (20s)..."
    sleep 20
    
    log_step "Health checks..."
    
    local services_ok=0
    local services_fail=0
    
    if curl -sf "http://localhost:32400/identity" > /dev/null 2>&1; then
        log_ok "Plex is running"
        ((services_ok++))
    else
        log_warn "Plex not responding yet (may still be starting)"
        ((services_fail++))
    fi
    
    if curl -sf "http://localhost:9000/minio/health/live" > /dev/null 2>&1; then
        log_ok "MinIO is running"
        ((services_ok++))
    else
        log_warn "MinIO not responding"
        ((services_fail++))
    fi
    
    if curl -sf "http://localhost:8123/" > /dev/null 2>&1; then
        log_ok "Home Assistant is running"
        ((services_ok++))
    else
        log_warn "Home Assistant not responding"
        ((services_fail++))
    fi
    
    echo ""
    log_info "Local services: $services_ok OK, $services_fail issues"
    
    return 0
}

update_linode_server() {
    print_section "Updating Linode Cloud Server"
    
    local linode_deploy_dir="${PROJECT_ROOT}/deploy/linode"
    
    if [ ! -d "$linode_deploy_dir" ]; then
        log_error "Linode deployment directory not found: $linode_deploy_dir"
        return 1
    fi
    
    cd "$linode_deploy_dir"
    
    if [[ "$RESTART_ONLY" != "true" ]]; then
        pull_latest_code
    fi
    
    if [[ "$PULL_ONLY" == "true" ]]; then
        log_info "Pull only mode - skipping service restart"
        return 0
    fi
    
    if [[ "$PULL_IMAGES" == "true" ]]; then
        log_step "Pulling latest Docker images..."
        docker compose pull 2>&1 || log_warn "Some images may not have updated"
    fi
    
    log_step "Running pre-flight checks..."
    if [ -x "${linode_deploy_dir}/scripts/preflight.sh" ]; then
        "${linode_deploy_dir}/scripts/preflight.sh" || log_warn "Some preflight checks failed"
    fi
    
    log_step "Restarting Linode services..."
    
    docker compose down --remove-orphans 2>&1 || true
    docker compose up -d 2>&1
    
    log_info "Waiting for services to start (30s)..."
    sleep 30
    
    log_step "Running smoke test..."
    if [ -x "${linode_deploy_dir}/scripts/smoke-test.sh" ]; then
        "${linode_deploy_dir}/scripts/smoke-test.sh" --quiet || log_warn "Some smoke tests failed"
    else
        log_step "Manual health checks..."
        
        local services_ok=0
        local services_fail=0
        
        if curl -sf "http://localhost:5000/health" > /dev/null 2>&1; then
            log_ok "Dashboard is running"
            ((services_ok++))
        else
            log_warn "Dashboard not responding"
            ((services_fail++))
        fi
        
        if curl -sf "http://localhost:4000/health" > /dev/null 2>&1; then
            log_ok "Discord Bot is running"
            ((services_ok++))
        else
            log_warn "Discord Bot not responding"
            ((services_fail++))
        fi
        
        if curl -sf "http://localhost:3000/health" > /dev/null 2>&1; then
            log_ok "Stream Bot is running"
            ((services_ok++))
        else
            log_warn "Stream Bot not responding"
            ((services_fail++))
        fi
        
        echo ""
        log_info "Linode services: $services_ok OK, $services_fail issues"
    fi
    
    return 0
}

show_post_update_summary() {
    print_header "Update Complete"
    
    echo "What was updated:"
    case "$TARGET" in
        local)
            echo "  - Local Ubuntu server (Plex, MinIO, Home Assistant)"
            ;;
        linode)
            echo "  - Linode cloud server (Dashboard, Discord Bot, Stream Bot)"
            ;;
        all)
            echo "  - Local Ubuntu server (Plex, MinIO, Home Assistant)"
            echo "  - Linode cloud server (Dashboard, Discord Bot, Stream Bot)"
            ;;
    esac
    
    echo ""
    echo "Access URLs:"
    
    if [[ "$TARGET" == "local" || "$TARGET" == "all" ]]; then
        echo ""
        echo "  Local Services:"
        echo "    Plex:           http://localhost:32400/web"
        echo "    MinIO Console:  http://localhost:9001"
        echo "    Home Assistant: http://localhost:8123"
    fi
    
    if [[ "$TARGET" == "linode" || "$TARGET" == "all" ]]; then
        echo ""
        echo "  Cloud Services:"
        echo "    Dashboard:      https://dashboard.evindrake.net"
        echo "    Discord Bot:    https://bot.rig-city.com"
        echo "    Stream Bot:     https://stream.rig-city.com"
    fi
    
    echo ""
    echo "Troubleshooting:"
    echo "  View logs:     docker compose logs -f [service]"
    echo "  Restart:       docker compose restart [service]"
    echo "  Full restart:  docker compose down && docker compose up -d"
    echo ""
}

main() {
    print_header "Homelab Server Update"
    
    log_info "Target: $TARGET"
    log_info "Pull images: $PULL_IMAGES"
    log_info "Pull only: $PULL_ONLY"
    log_info "Restart only: $RESTART_ONLY"
    
    echo ""
    
    if ! confirm; then
        echo "Cancelled."
        exit 0
    fi
    
    case "$TARGET" in
        local)
            update_local_server
            ;;
        linode)
            update_linode_server
            ;;
        all)
            update_local_server || log_warn "Local update had issues"
            update_linode_server || log_warn "Linode update had issues"
            ;;
    esac
    
    show_post_update_summary
}

main "$@"
