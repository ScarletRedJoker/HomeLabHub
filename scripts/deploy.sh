#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# DEPLOY - Unified Multi-Target Deployment Script
# ═══════════════════════════════════════════════════════════════
# Deploys services to Linode, Home Server, Windows VM, or all targets
# with health checks, error handling, and automatic rollback

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
DEPLOY_LOG="$PROJECT_ROOT/logs/deploy-$(date +%Y%m%d_%H%M%S).log"
TARGET="${1:-}"
OPTION="${2:-}"
NO_BACKUP="${NO_BACKUP:-false}"
AUTO_ROLLBACK="${AUTO_ROLLBACK:-true}"

mkdir -p "$PROJECT_ROOT/logs" "$PROJECT_ROOT/.deployments"

log_info() { echo -e "${GREEN}[INFO]${NC} $*" | tee -a "$DEPLOY_LOG"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "$DEPLOY_LOG"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" | tee -a "$DEPLOY_LOG"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $*" | tee -a "$DEPLOY_LOG"; }

print_banner() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}       ${BOLD}Nebula Command - Unified Deployment${NC}                     ${CYAN}║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

load_env() {
    if [[ -f "$PROJECT_ROOT/.env" ]]; then
        set -a
        source "$PROJECT_ROOT/.env"
        set +a
        log_info "Loaded .env configuration"
    else
        log_error "No .env file found! Run ./scripts/setup.sh first"
        exit 1
    fi
}

health_check_linode() {
    log_step "Health check: Linode..."
    
    local host="${LINODE_SSH_HOST:-}"
    local user="${LINODE_SSH_USER:-root}"
    
    if [[ -z "$host" ]]; then
        log_error "LINODE_SSH_HOST not configured"
        return 1
    fi
    
    if ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$user@$host" "echo 'connected'" &>/dev/null; then
        log_info "Linode SSH: OK"
        
        if ssh "$user@$host" "docker info" &>/dev/null; then
            log_info "Linode Docker: OK"
        else
            log_warn "Linode Docker: Not running"
        fi
        
        if ssh "$user@$host" "command -v pm2" &>/dev/null; then
            log_info "Linode PM2: OK"
        else
            log_warn "Linode PM2: Not installed"
        fi
        
        return 0
    else
        log_error "Cannot connect to Linode at $host"
        return 1
    fi
}

health_check_home() {
    log_step "Health check: Home Server..."
    
    local host="${HOME_SSH_HOST:-}"
    local user="${HOME_SSH_USER:-evin}"
    
    if [[ -z "$host" ]]; then
        log_error "HOME_SSH_HOST not configured"
        return 1
    fi
    
    if ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$user@$host" "echo 'connected'" &>/dev/null; then
        log_info "Home SSH: OK"
        
        if ssh "$user@$host" "docker info" &>/dev/null; then
            log_info "Home Docker: OK"
        else
            log_warn "Home Docker: Not running"
        fi
        
        return 0
    else
        log_error "Cannot connect to Home server at $host"
        return 1
    fi
}

health_check_windows() {
    log_step "Health check: Windows VM..."
    
    local host="${WINDOWS_VM_TAILSCALE_IP:-${WINDOWS_VM_HOST:-}}"
    
    if [[ -z "$host" ]]; then
        log_error "WINDOWS_VM_TAILSCALE_IP not configured"
        return 1
    fi
    
    if ping -c 1 -W 3 "$host" &>/dev/null; then
        log_info "Windows VM ping: OK"
        
        if curl -sf --max-time 5 "http://$host:${WINDOWS_AGENT_PORT:-9765}/health" &>/dev/null; then
            log_info "Windows Agent: OK"
        else
            log_warn "Windows Agent: Not responding (may need manual start)"
        fi
        
        if curl -sf --max-time 5 "http://$host:11434/api/tags" &>/dev/null; then
            log_info "Ollama: OK"
        else
            log_warn "Ollama: Not running"
        fi
        
        return 0
    else
        log_error "Windows VM unreachable at $host"
        return 1
    fi
}

deploy_linode() {
    log_step "Deploying to Linode..."
    
    local host="${LINODE_SSH_HOST:-}"
    local user="${LINODE_SSH_USER:-root}"
    local deploy_dir="${LINODE_DEPLOY_DIR:-/opt/homelab/HomeLabHub}"
    
    log_info "Pulling latest code..."
    ssh "$user@$host" "cd $deploy_dir && git pull origin main" 2>&1 | tee -a "$DEPLOY_LOG"
    
    log_info "Updating Docker services..."
    ssh "$user@$host" "cd $deploy_dir && docker compose pull && docker compose up -d" 2>&1 | tee -a "$DEPLOY_LOG" || true
    
    log_info "Updating Dashboard..."
    ssh "$user@$host" "cd $deploy_dir/services/dashboard-next && npm install --legacy-peer-deps && pm2 restart dashboard-next || pm2 start npm --name dashboard-next -- run start" 2>&1 | tee -a "$DEPLOY_LOG"
    
    log_info "Updating Discord Bot..."
    ssh "$user@$host" "cd $deploy_dir/services/discord-bot && npm install --legacy-peer-deps && pm2 restart discord-bot || pm2 start npm --name discord-bot -- run start" 2>&1 | tee -a "$DEPLOY_LOG"
    
    log_info "Updating Stream Bot..."
    ssh "$user@$host" "cd $deploy_dir/services/stream-bot && npm install --legacy-peer-deps && pm2 restart stream-bot || pm2 start npm --name stream-bot -- run start" 2>&1 | tee -a "$DEPLOY_LOG"
    
    log_info "Linode deployment complete!"
}

deploy_home() {
    log_step "Deploying to Home Server..."
    
    local host="${HOME_SSH_HOST:-}"
    local user="${HOME_SSH_USER:-evin}"
    local deploy_dir="${HOME_DEPLOY_DIR:-/opt/homelab/HomeLabHub}"
    
    log_info "Pulling latest code..."
    ssh "$user@$host" "cd $deploy_dir && git pull origin main" 2>&1 | tee -a "$DEPLOY_LOG"
    
    log_info "Updating Docker services..."
    ssh "$user@$host" "cd $deploy_dir/deploy/local && docker compose pull && docker compose up -d" 2>&1 | tee -a "$DEPLOY_LOG"
    
    log_info "Home server deployment complete!"
}

deploy_windows() {
    log_step "Deploying to Windows VM..."
    
    local host="${WINDOWS_VM_TAILSCALE_IP:-${WINDOWS_VM_HOST:-}}"
    local agent_port="${WINDOWS_AGENT_PORT:-9765}"
    
    log_info "Executing git pull via agent..."
    local response=$(curl -sf --max-time 30 "http://$host:$agent_port/execute" \
        -H "Content-Type: application/json" \
        -d '{"command": "git pull", "cwd": "C:\\Users\\evin\\HomeLabHub"}' 2>/dev/null)
    
    if [[ -n "$response" ]]; then
        log_info "Windows git pull: OK"
    else
        log_warn "Windows deployment via agent may have issues"
    fi
    
    log_info "Windows VM deployment complete!"
}

deploy_local_docker() {
    log_step "Deploying local Docker services..."
    
    local BACKUP_NAME=""
    if [[ "$NO_BACKUP" != "true" ]]; then
        log_info "Creating pre-deployment backup..."
        BACKUP_NAME="pre-deploy-$(date +%Y%m%d-%H%M%S)"
        "$PROJECT_ROOT/scripts/backup-config.sh" "$BACKUP_NAME" 2>/dev/null || true
    fi
    
    log_info "Building Docker images..."
    cd "$PROJECT_ROOT"
    docker compose --project-directory "$PROJECT_ROOT" --env-file "$PROJECT_ROOT/.env" build
    
    log_info "Deploying services..."
    docker compose --project-directory "$PROJECT_ROOT" --env-file "$PROJECT_ROOT/.env" up -d
    
    log_info "Waiting for services to stabilize..."
    sleep 10
    
    log_info "Running health checks..."
    if "$PROJECT_ROOT/scripts/health-check.sh" all 2>/dev/null; then
        log_info "Local Docker deployment successful!"
    else
        log_warn "Some health checks failed"
        if [[ "$AUTO_ROLLBACK" == "true" ]] && [[ -n "$BACKUP_NAME" ]]; then
            log_warn "Initiating automatic rollback..."
            "$PROJECT_ROOT/scripts/rollback.sh" all "$BACKUP_NAME" 2>/dev/null || true
        fi
    fi
}

rollback_linode() {
    log_step "Rolling back Linode..."
    
    local host="${LINODE_SSH_HOST:-}"
    local user="${LINODE_SSH_USER:-root}"
    local deploy_dir="${LINODE_DEPLOY_DIR:-/opt/homelab/HomeLabHub}"
    
    ssh "$user@$host" "cd $deploy_dir && git reset --hard HEAD~1" 2>&1 | tee -a "$DEPLOY_LOG"
    ssh "$user@$host" "pm2 restart all" 2>&1 | tee -a "$DEPLOY_LOG"
    
    log_info "Linode rollback complete!"
}

print_status() {
    echo ""
    echo -e "${CYAN}━━━ Deployment Status ━━━${NC}"
    echo ""
    echo -e "Target: ${BOLD}$1${NC}"
    echo -e "Log: $DEPLOY_LOG"
    echo ""
    
    if [[ -n "${LINODE_SSH_HOST:-}" ]]; then
        echo -e "Dashboard: ${CYAN}https://dash.evindrake.net${NC}"
        echo -e "Discord Bot: ${CYAN}https://bot.rig-city.com${NC}"
        echo -e "Stream Bot: ${CYAN}https://stream.rig-city.com${NC}"
    fi
    
    echo ""
    echo -e "${GREEN}Deployment completed!${NC}"
}

usage() {
    echo "Nebula Command - Unified Deployment Script"
    echo ""
    echo "Usage: ./scripts/deploy.sh <target> [options]"
    echo ""
    echo "Targets:"
    echo "  linode      Deploy to Linode cloud server"
    echo "  home        Deploy to Ubuntu home server"
    echo "  windows     Deploy to Windows VM (via Nebula Agent)"
    echo "  local       Deploy local Docker services (current machine)"
    echo "  all         Deploy to all configured remote targets"
    echo ""
    echo "Options:"
    echo "  --check     Run health checks only (no deployment)"
    echo "  --rollback  Rollback to previous version"
    echo "  --help      Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  NO_BACKUP=true     Skip pre-deployment backup"
    echo "  AUTO_ROLLBACK=false Disable automatic rollback on failure"
    echo ""
    echo "Examples:"
    echo "  ./scripts/deploy.sh linode           # Deploy to Linode"
    echo "  ./scripts/deploy.sh all --check      # Health check all targets"
    echo "  ./scripts/deploy.sh linode --rollback# Rollback Linode"
    echo "  ./scripts/deploy.sh local            # Deploy local Docker"
}

main() {
    if [[ -z "$TARGET" ]] || [[ "$TARGET" == "--help" ]] || [[ "$TARGET" == "-h" ]]; then
        usage
        exit 0
    fi
    
    print_banner
    load_env
    
    case "$TARGET" in
        linode)
            if [[ "$OPTION" == "--check" ]]; then
                health_check_linode
            elif [[ "$OPTION" == "--rollback" ]]; then
                rollback_linode
            else
                health_check_linode && deploy_linode
            fi
            ;;
        home)
            if [[ "$OPTION" == "--check" ]]; then
                health_check_home
            else
                health_check_home && deploy_home
            fi
            ;;
        windows)
            if [[ "$OPTION" == "--check" ]]; then
                health_check_windows
            else
                health_check_windows && deploy_windows
            fi
            ;;
        local)
            deploy_local_docker
            ;;
        all)
            local failed=0
            
            if [[ "$OPTION" == "--check" ]]; then
                health_check_linode || ((failed++)) || true
                health_check_home || ((failed++)) || true
                health_check_windows || ((failed++)) || true
            else
                (health_check_linode && deploy_linode) || ((failed++)) || true
                (health_check_home && deploy_home) || ((failed++)) || true
                (health_check_windows && deploy_windows) || ((failed++)) || true
            fi
            
            if [[ $failed -gt 0 ]]; then
                log_warn "$failed target(s) had issues"
            fi
            ;;
        *)
            log_error "Unknown target: $TARGET"
            usage
            exit 1
            ;;
    esac
    
    print_status "$TARGET"
}

main "$@"
