#!/bin/bash
# Nebula Command - Unified Deployment Orchestrator
# Deploy to Local Ubuntu, Windows VM, and Linode from a single control plane

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$DEPLOY_ROOT")"

# Source shared utilities
source "$DEPLOY_ROOT/shared/lib/common.sh"

# Default configuration
TARGETS="local,linode"  # Windows requires manual setup due to auth
PARALLEL=false
SKIP_HEALTH=false
VERBOSE=false
DRY_RUN=false

# Node configuration
LINODE_HOST="${LINODE_HOST:-69.164.211.205}"
LINODE_USER="${LINODE_USER:-root}"
WINDOWS_HOST="${WINDOWS_HOST:-100.118.44.102}"
WINDOWS_USER="${WINDOWS_USER:-Evin}"
LOCAL_USER="${LOCAL_USER:-$(whoami)}"

# Print usage
usage() {
    cat << EOF
${BOLD}Nebula Command - Unified Deployment Orchestrator${NC}

${CYAN}USAGE:${NC}
    $(basename "$0") [OPTIONS] [COMMAND]

${CYAN}COMMANDS:${NC}
    deploy      Deploy to specified targets (default)
    status      Show status of all nodes
    health      Run health checks on all nodes
    sync        Sync code to all nodes without deploying

${CYAN}OPTIONS:${NC}
    -t, --targets TARGETS   Comma-separated targets: local,linode,windows (default: local,linode)
    -p, --parallel          Run deployments in parallel
    -s, --skip-health       Skip post-deployment health checks
    -v, --verbose           Verbose output
    -n, --dry-run           Show what would be done without executing
    -h, --help              Show this help

${CYAN}EXAMPLES:${NC}
    $(basename "$0")                        # Deploy to local and linode
    $(basename "$0") -t local               # Deploy only to local
    $(basename "$0") -t linode,windows      # Deploy to linode and windows
    $(basename "$0") status                 # Show status of all nodes
    $(basename "$0") -p -t local,linode     # Parallel deployment

${CYAN}NOTES:${NC}
    - Windows deployment requires manual SSH setup (key-based auth)
    - Run from Local Ubuntu (the control plane)
    - Requires Tailscale for Windows VM connectivity
EOF
}

# Parse arguments
parse_args() {
    local command="deploy"
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -t|--targets)
                TARGETS="$2"
                shift 2
                ;;
            -p|--parallel)
                PARALLEL=true
                shift
                ;;
            -s|--skip-health)
                SKIP_HEALTH=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                export DEBUG=1
                shift
                ;;
            -n|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            deploy|status|health|sync)
                command="$1"
                shift
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                usage
                exit 1
                ;;
        esac
    done
    
    echo "$command"
}

# Print banner
print_banner() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}     ${BOLD}Nebula Command - Unified Deployment Orchestrator${NC}        ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Check prerequisites
check_prerequisites() {
    section "Preflight Checks"
    
    local errors=0
    
    # Check required commands
    for cmd in ssh curl jq git; do
        if has_command "$cmd"; then
            log INFO "$(status_icon online) $cmd available"
        else
            log ERROR "$(status_icon offline) $cmd not found"
            errors=$((errors + 1))
        fi
    done
    
    # Check Tailscale for Windows connectivity
    if [[ "$TARGETS" == *"windows"* ]]; then
        if check_tailscale_host "$WINDOWS_HOST"; then
            log INFO "$(status_icon online) Windows VM reachable ($WINDOWS_HOST)"
        else
            log WARN "$(status_icon offline) Windows VM not reachable - check Tailscale"
            errors=$((errors + 1))
        fi
    fi
    
    # Check Linode connectivity
    if [[ "$TARGETS" == *"linode"* ]]; then
        if ssh -o ConnectTimeout=5 -o BatchMode=yes "$LINODE_USER@$LINODE_HOST" "echo ok" &>/dev/null; then
            log INFO "$(status_icon online) Linode reachable ($LINODE_HOST)"
        else
            log WARN "$(status_icon offline) Linode SSH not configured or unreachable"
        fi
    fi
    
    if [[ $errors -gt 0 ]]; then
        log ERROR "Preflight checks failed with $errors errors"
        return 1
    fi
    
    log INFO "All preflight checks passed"
    return 0
}

# Deploy to Local Ubuntu
deploy_local() {
    section "Deploying to Local Ubuntu"
    update_state "local" "deploying" "Started deployment"
    
    local start_time=$(date +%s)
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "[DRY-RUN] Would run: $DEPLOY_ROOT/local/deploy.sh"
        update_state "local" "dry-run" "Dry run completed"
        return 0
    fi
    
    cd "$REPO_ROOT"
    
    if "$DEPLOY_ROOT/local/deploy.sh" -v; then
        local duration=$(($(date +%s) - start_time))
        log INFO "$(status_icon online) Local deployment completed in $(format_duration $duration)"
        update_state "local" "success" "Deployed successfully"
        return 0
    else
        log ERROR "$(status_icon offline) Local deployment failed"
        update_state "local" "failed" "Deployment failed"
        return 1
    fi
}

# Deploy to Linode
deploy_linode() {
    section "Deploying to Linode"
    update_state "linode" "deploying" "Started deployment"
    
    local start_time=$(date +%s)
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "[DRY-RUN] Would SSH to $LINODE_HOST and run deploy.sh"
        update_state "linode" "dry-run" "Dry run completed"
        return 0
    fi
    
    log INFO "Connecting to Linode ($LINODE_HOST)..."
    
    if ssh "$LINODE_USER@$LINODE_HOST" \
        "cd /opt/homelab/HomeLabHub && ./deploy/linode/deploy.sh -v"; then
        local duration=$(($(date +%s) - start_time))
        log INFO "$(status_icon online) Linode deployment completed in $(format_duration $duration)"
        update_state "linode" "success" "Deployed successfully"
        return 0
    else
        log ERROR "$(status_icon offline) Linode deployment failed"
        update_state "linode" "failed" "Deployment failed"
        return 1
    fi
}

# Deploy to Windows VM
deploy_windows() {
    section "Deploying to Windows VM"
    update_state "windows" "deploying" "Started deployment"
    
    local start_time=$(date +%s)
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "[DRY-RUN] Would SSH to $WINDOWS_HOST and run setup script"
        update_state "windows" "dry-run" "Dry run completed"
        return 0
    fi
    
    # Check Windows connectivity first
    if ! check_tailscale_host "$WINDOWS_HOST"; then
        log ERROR "$(status_icon offline) Windows VM not reachable via Tailscale"
        update_state "windows" "failed" "VM not reachable"
        return 1
    fi
    
    log INFO "Connecting to Windows VM ($WINDOWS_HOST)..."
    log WARN "Note: Windows deployment may require manual steps due to auth"
    
    # Try to pull latest code on Windows
    if ssh -o ConnectTimeout=10 "$WINDOWS_USER@$WINDOWS_HOST" \
        "cd C:\\NebulaCommand && git pull origin main" 2>/dev/null; then
        log INFO "$(status_icon online) Code synced on Windows"
    else
        log WARN "Could not sync code - may need manual git pull"
    fi
    
    # Check Ollama status
    if check_ollama_health "$WINDOWS_HOST"; then
        local models=$(check_ollama_health "$WINDOWS_HOST")
        log INFO "$(status_icon online) Ollama running with models: $models"
        update_state "windows" "success" "AI services online"
        return 0
    else
        log WARN "$(status_icon offline) Ollama not responding"
        log INFO "Run on Windows: ollama serve"
        update_state "windows" "partial" "Ollama offline"
        return 1
    fi
}

# Show status of all nodes
show_status() {
    print_banner
    section "Node Status"
    
    echo ""
    printf "  %-20s %-15s %-30s\n" "NODE" "STATUS" "DETAILS"
    printf "  %-20s %-15s %-30s\n" "────────────────────" "───────────────" "──────────────────────────────"
    
    # Local Ubuntu
    local local_status="unknown"
    local local_details=""
    if docker ps &>/dev/null; then
        local running=$(docker ps --format '{{.Names}}' | wc -l)
        local_status="online"
        local_details="$running containers running"
    else
        local_status="offline"
        local_details="Docker not responding"
    fi
    printf "  %-20s %-15s %-30s\n" "Local Ubuntu" "$(status_icon $local_status) $local_status" "$local_details"
    
    # Linode
    local linode_status="unknown"
    local linode_details=""
    if ssh -o ConnectTimeout=5 -o BatchMode=yes "$LINODE_USER@$LINODE_HOST" "docker ps" &>/dev/null; then
        local running=$(ssh "$LINODE_USER@$LINODE_HOST" "docker ps --format '{{.Names}}' | wc -l" 2>/dev/null)
        linode_status="online"
        linode_details="$running containers running"
    else
        linode_status="offline"
        linode_details="SSH unreachable"
    fi
    printf "  %-20s %-15s %-30s\n" "Linode" "$(status_icon $linode_status) $linode_status" "$linode_details"
    
    # Windows VM
    local windows_status="unknown"
    local windows_details=""
    if check_tailscale_host "$WINDOWS_HOST"; then
        if models=$(check_ollama_health "$WINDOWS_HOST" 2>/dev/null); then
            windows_status="online"
            windows_details="Ollama: $models"
        else
            windows_status="partial"
            windows_details="Reachable, Ollama offline"
        fi
    else
        windows_status="offline"
        windows_details="Not reachable via Tailscale"
    fi
    printf "  %-20s %-15s %-30s\n" "Windows VM" "$(status_icon $windows_status) $windows_status" "$windows_details"
    
    echo ""
    
    # Show last deployment state
    local state_file="$STATE_DIR/deploy-status.json"
    if [[ -f "$state_file" ]]; then
        section "Last Deployment Status"
        jq -r 'to_entries[] | "  \(.key): \(.value.status) - \(.value.updated)"' "$state_file" 2>/dev/null || true
    fi
}

# Run health checks
run_health_checks() {
    section "Health Checks"
    
    local all_healthy=true
    
    # Local services
    log INFO "Checking Local Ubuntu services..."
    for service in "http://localhost:9091/api/health" "http://localhost:8123/" "http://localhost:32400/identity"; do
        if check_http_health "$service"; then
            log INFO "  $(status_icon online) $service"
        else
            log WARN "  $(status_icon offline) $service"
            all_healthy=false
        fi
    done
    
    # Linode services
    if [[ "$TARGETS" == *"linode"* ]]; then
        log INFO "Checking Linode services..."
        if check_http_health "https://dashboard.evindrake.net"; then
            log INFO "  $(status_icon online) Dashboard"
        else
            log WARN "  $(status_icon offline) Dashboard"
            all_healthy=false
        fi
    fi
    
    # Windows AI services
    if [[ "$TARGETS" == *"windows"* ]]; then
        log INFO "Checking Windows AI services..."
        if check_ollama_health "$WINDOWS_HOST" &>/dev/null; then
            log INFO "  $(status_icon online) Ollama"
        else
            log WARN "  $(status_icon offline) Ollama"
        fi
        
        if check_http_health "http://$WINDOWS_HOST:7860" 2>/dev/null; then
            log INFO "  $(status_icon online) Stable Diffusion"
        else
            log INFO "  $(status_icon offline) Stable Diffusion (optional)"
        fi
    fi
    
    if [[ "$all_healthy" == "true" ]]; then
        log INFO "All critical services healthy!"
        return 0
    else
        log WARN "Some services may need attention"
        return 1
    fi
}

# Main deployment orchestration
run_deploy() {
    print_banner
    
    local start_time=$(date +%s)
    local failed_targets=()
    
    # Parse targets
    IFS=',' read -ra target_list <<< "$TARGETS"
    
    log INFO "Deployment targets: ${target_list[*]}"
    [[ "$PARALLEL" == "true" ]] && log INFO "Parallel mode: enabled"
    [[ "$DRY_RUN" == "true" ]] && log INFO "Dry run mode: enabled"
    
    # Preflight
    check_prerequisites || exit 1
    
    # Sequential deployment (safer, recommended)
    if [[ "$PARALLEL" == "false" ]]; then
        for target in "${target_list[@]}"; do
            case "$target" in
                local)
                    deploy_local || failed_targets+=("local")
                    ;;
                linode)
                    deploy_linode || failed_targets+=("linode")
                    ;;
                windows)
                    deploy_windows || failed_targets+=("windows")
                    ;;
                *)
                    log WARN "Unknown target: $target"
                    ;;
            esac
        done
    else
        # Parallel deployment (faster but harder to debug)
        local pids=()
        
        for target in "${target_list[@]}"; do
            case "$target" in
                local)
                    deploy_local &
                    pids+=($!)
                    ;;
                linode)
                    deploy_linode &
                    pids+=($!)
                    ;;
                windows)
                    deploy_windows &
                    pids+=($!)
                    ;;
            esac
        done
        
        # Wait for all deployments
        for pid in "${pids[@]}"; do
            wait "$pid" || failed_targets+=("pid-$pid")
        done
    fi
    
    # Health checks
    if [[ "$SKIP_HEALTH" == "false" && "$DRY_RUN" == "false" ]]; then
        echo ""
        run_health_checks || true
    fi
    
    # Summary
    local duration=$(($(date +%s) - start_time))
    
    section "Deployment Summary"
    echo ""
    log INFO "Total time: $(format_duration $duration)"
    
    if [[ ${#failed_targets[@]} -eq 0 ]]; then
        echo -e "${GREEN}${BOLD}✓ All deployments completed successfully!${NC}"
        return 0
    else
        echo -e "${RED}${BOLD}✗ Failed targets: ${failed_targets[*]}${NC}"
        return 1
    fi
}

# Sync code to all nodes
run_sync() {
    print_banner
    section "Syncing Code to All Nodes"
    
    # Sync to Linode
    if [[ "$TARGETS" == *"linode"* ]]; then
        log INFO "Syncing to Linode..."
        if ssh "$LINODE_USER@$LINODE_HOST" "cd /opt/homelab/HomeLabHub && git pull origin main"; then
            log INFO "$(status_icon online) Linode synced"
        else
            log ERROR "$(status_icon offline) Linode sync failed"
        fi
    fi
    
    # Sync to Windows
    if [[ "$TARGETS" == *"windows"* ]]; then
        log INFO "Syncing to Windows..."
        if ssh "$WINDOWS_USER@$WINDOWS_HOST" "cd C:\\NebulaCommand && git pull origin main" 2>/dev/null; then
            log INFO "$(status_icon online) Windows synced"
        else
            log WARN "$(status_icon offline) Windows sync failed - may need manual pull"
        fi
    fi
    
    # Local is always up to date (we're running from here)
    if [[ "$TARGETS" == *"local"* ]]; then
        log INFO "$(status_icon online) Local is already at latest"
    fi
}

# Main
main() {
    local command=$(parse_args "$@")
    
    case "$command" in
        deploy)
            run_deploy
            ;;
        status)
            show_status
            ;;
        health)
            run_health_checks
            ;;
        sync)
            run_sync
            ;;
        *)
            usage
            exit 1
            ;;
    esac
}

main "$@"
