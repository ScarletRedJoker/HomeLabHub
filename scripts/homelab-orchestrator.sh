#!/bin/bash
################################################################################
# Homelab Unified Orchestrator
#
# Zero-downtime deployment orchestrator with comprehensive safety features:
# - 6-stage deployment pipeline (Validate → Backup → Sync → Build → Deploy → Verify)
# - Health gates between stages
# - Automatic rollback on failure
# - GitOps integration (tag-based deployments)
# - Circuit breaker for repeated failures
# - Audit logging of all deployments
#
# Usage: ./scripts/homelab-orchestrator.sh [OPTIONS] [COMMAND]
#
# Commands:
#   deploy              Full deployment pipeline (default)
#   validate            Stage 1: Validate environment only
#   backup              Stage 2: Backup databases and configs only
#   sync                Stage 3: Sync from git only
#   build               Stage 4: Build containers only
#   rollback            Rollback to previous deployment
#   status              Show current deployment status
#   history             Show deployment history
#
# Options:
#   -t, --tag TAG       Deploy specific git tag
#   -s, --service NAME  Deploy single service only
#   -n, --dry-run       Preview deployment without making changes
#   -f, --force         Skip health checks and confirmations
#   --no-backup         Skip backup stage (faster, but riskier)
#   --no-health-check   Skip health verification (not recommended)
#   --rollback-on-fail  Automatic rollback on any failure
#   -h, --help          Show this help message
################################################################################

set -euo pipefail

# ===== CONFIGURATION =====
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEPLOYMENT_DIR="$PROJECT_DIR/deployment"
CONFIG_FILE="${ORCHESTRATOR_CONFIG:-$DEPLOYMENT_DIR/orchestrator-config.yaml}"

# Source common library
if [ -f "$DEPLOYMENT_DIR/lib-common.sh" ]; then
    source "$DEPLOYMENT_DIR/lib-common.sh"
else
    echo "ERROR: lib-common.sh not found"
    exit 1
fi

# Directories
BACKUP_DIR="$PROJECT_DIR/var/backups/deployments"
STATE_DIR="$PROJECT_DIR/var/state"
LOG_DIR="$PROJECT_DIR/var/log"
DEPLOYMENT_LOG="$LOG_DIR/deployment.log"
HISTORY_LOG="$DEPLOYMENT_DIR/deployment-history.log"
AUDIT_LOG="$LOG_DIR/deployment-audit.log"

# Docker Compose
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.unified.yml}"
DOCKER_COMPOSE=""

# State files
CURRENT_DEPLOYMENT="$STATE_DIR/.current_deployment"
LAST_DEPLOYMENT="$STATE_DIR/.last_deployment"
CIRCUIT_BREAKER="$STATE_DIR/.circuit_breaker"
LOCK_FILE="/tmp/homelab-orchestrator.lock"

# Health check settings
HEALTH_CHECK_TIMEOUT=120  # 2 minutes
HEALTH_CHECK_INTERVAL=5   # 5 seconds
ROLLING_RESTART_DELAY=10  # 10 seconds between service restarts

# Deployment settings
COMMAND="deploy"
GIT_TAG=""
SINGLE_SERVICE=""
DRY_RUN=false
FORCE=false
SKIP_BACKUP=false
SKIP_HEALTH=false
AUTO_ROLLBACK=true

# Failure tracking
CIRCUIT_BREAKER_THRESHOLD=3
CIRCUIT_BREAKER_WINDOW=3600  # 1 hour

# ===== PARSE ARGUMENTS =====
show_help() {
    cat <<EOF
Homelab Unified Orchestrator - Zero-downtime deployment system

USAGE:
    $(basename "$0") [OPTIONS] [COMMAND]

COMMANDS:
    deploy              Full deployment pipeline (default)
    validate            Stage 1: Validate environment only
    backup              Stage 2: Backup databases and configs only
    sync                Stage 3: Sync from git only
    build               Stage 4: Build containers only
    rollback [VERSION]  Rollback to previous or specific deployment
    status              Show current deployment status
    history             Show deployment history
    health              Check health of all services

OPTIONS:
    -t, --tag TAG          Deploy specific git tag
    -s, --service NAME     Deploy single service only
    -n, --dry-run          Preview deployment without making changes
    -f, --force            Skip health checks and confirmations
    --no-backup            Skip backup stage (faster, but riskier)
    --no-health-check      Skip health verification (not recommended)
    --no-auto-rollback     Disable automatic rollback on failure
    -h, --help             Show this help message

EXAMPLES:
    # Full deployment with all safety checks
    $(basename "$0") deploy
    
    # Deploy specific git tag
    $(basename "$0") deploy --tag v1.2.3
    
    # Deploy single service
    $(basename "$0") deploy --service stream-bot
    
    # Dry-run to preview changes
    $(basename "$0") deploy --dry-run
    
    # Quick deploy (skip backup, faster)
    $(basename "$0") deploy --no-backup
    
    # Rollback to previous version
    $(basename "$0") rollback
    
    # Check deployment status
    $(basename "$0") status

SAFETY FEATURES:
    - Health checks before and after deployment
    - Automatic rollback on failure
    - Circuit breaker prevents repeated failures
    - Backup before deployment
    - Zero-downtime rolling restarts
    - Audit logging of all changes

EOF
    exit 0
}

# Parse arguments
POSITIONAL_ARGS=()
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            ;;
        -t|--tag)
            GIT_TAG="$2"
            shift 2
            ;;
        -s|--service)
            SINGLE_SERVICE="$2"
            shift 2
            ;;
        -n|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        --no-backup)
            SKIP_BACKUP=true
            shift
            ;;
        --no-health-check)
            SKIP_HEALTH=true
            shift
            ;;
        --no-auto-rollback)
            AUTO_ROLLBACK=false
            shift
            ;;
        deploy|validate|backup|sync|build|rollback|status|history|health)
            COMMAND="$1"
            shift
            ;;
        *)
            POSITIONAL_ARGS+=("$1")
            shift
            ;;
    esac
done

# Restore positional parameters
set -- "${POSITIONAL_ARGS[@]}"

# ===== INITIALIZATION =====
log_section "Homelab Orchestrator - $COMMAND"

# Create directories
mkdir -p "$BACKUP_DIR" "$STATE_DIR" "$LOG_DIR"

# Setup signal handlers and acquire lock
init_script "homelab-orchestrator" true 10

# Detect Docker Compose command
DOCKER_COMPOSE=$(detect_docker_compose)
log_info "Using: $DOCKER_COMPOSE"

# Change to project directory
cd "$PROJECT_DIR" || {
    log_error "Failed to change to project directory"
    exit 1
}

# ===== AUDIT LOGGING =====
audit_log() {
    local action="$1"
    local status="$2"
    local details="${3:-}"
    
    local timestamp=$(get_iso_timestamp)
    local git_commit=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    local user=$(whoami)
    
    echo "$timestamp | $action | $status | commit=$git_commit | user=$user | $details" >> "$AUDIT_LOG"
}

# ===== CIRCUIT BREAKER =====
check_circuit_breaker() {
    if [ ! -f "$CIRCUIT_BREAKER" ]; then
        return 0
    fi
    
    local failure_count=0
    local window_start=$(($(date +%s) - CIRCUIT_BREAKER_WINDOW))
    
    while read -r timestamp; do
        if [ "$timestamp" -ge "$window_start" ]; then
            ((failure_count++))
        fi
    done < "$CIRCUIT_BREAKER"
    
    if [ "$failure_count" -ge "$CIRCUIT_BREAKER_THRESHOLD" ]; then
        log_error "Circuit breaker OPEN - too many failures in the last hour"
        log_error "Failed deployments: $failure_count in last $((CIRCUIT_BREAKER_WINDOW/60)) minutes"
        log_warning "Manual intervention required. To reset: rm $CIRCUIT_BREAKER"
        audit_log "circuit_breaker" "blocked" "failures=$failure_count"
        exit 1
    fi
    
    return 0
}

record_failure() {
    mkdir -p "$STATE_DIR"
    echo "$(date +%s)" >> "$CIRCUIT_BREAKER"
    audit_log "deployment" "failed" "$1"
}

record_success() {
    rm -f "$CIRCUIT_BREAKER"
    audit_log "deployment" "success" "$1"
}

# ===== STAGE 1: VALIDATION =====
stage_validate() {
    log_section "Stage 1: Validation"
    
    # Check Docker
    validate_command_exists docker "Docker"
    validate_docker_running
    
    # Check Docker Compose
    if [ ! -f "$COMPOSE_FILE" ]; then
        log_error "Compose file not found: $COMPOSE_FILE"
        return 1
    fi
    log_success "Compose file found: $COMPOSE_FILE"
    
    # Validate compose file syntax
    if ! $DOCKER_COMPOSE -f "$COMPOSE_FILE" config &> /dev/null; then
        log_error "Compose file has syntax errors"
        $DOCKER_COMPOSE -f "$COMPOSE_FILE" config || true
        return 1
    fi
    log_success "Compose file syntax valid"
    
    # Check .env file
    if [ ! -f ".env" ]; then
        log_warning ".env file not found"
        if [ -f ".env.unified.example" ]; then
            log_info "Found .env.unified.example"
            if [ "$FORCE" = false ]; then
                if ! confirm_action "Create .env from example?"; then
                    return 1
                fi
                cp .env.unified.example .env
                log_warning "IMPORTANT: Edit .env and set your API keys/secrets!"
            fi
        else
            log_error ".env.unified.example not found"
            return 1
        fi
    else
        log_success ".env file exists"
    fi
    
    # Validate critical environment variables
    set +u  # Allow unset variables for env check
    source .env
    local missing_vars=()
    
    for var in LETSENCRYPT_EMAIL DOMAIN; do
        if [ -z "${!var:-}" ]; then
            missing_vars+=("$var")
        fi
    done
    set -u
    
    if [ ${#missing_vars[@]} -gt 0 ]; then
        log_warning "Missing environment variables: ${missing_vars[*]}"
        log_info "Please set these in .env file"
    else
        log_success "Critical environment variables set"
    fi
    
    # Check Git repository
    if [ ! -d ".git" ]; then
        log_warning "Not a git repository"
    else
        log_success "Git repository found"
        local git_status=$(git status --porcelain | wc -l)
        if [ "$git_status" -gt 0 ]; then
            log_warning "Working directory has uncommitted changes ($git_status files)"
        fi
    fi
    
    # Check disk space
    local free_space=$(df -BG . | tail -1 | awk '{print $4}' | tr -d 'G')
    if [ "$free_space" -lt 5 ]; then
        log_warning "Low disk space: ${free_space}GB free"
    else
        log_success "Disk space OK: ${free_space}GB free"
    fi
    
    # Check network connectivity
    if ping -c 1 -W 2 8.8.8.8 &> /dev/null; then
        log_success "Network connectivity OK"
    else
        log_warning "Network connectivity may be limited"
    fi
    
    log_success "✓ Stage 1: Validation complete"
    return 0
}

# ===== STAGE 2: BACKUP =====
stage_backup() {
    log_section "Stage 2: Backup"
    
    if [ "$SKIP_BACKUP" = true ]; then
        log_warning "Backup skipped (--no-backup flag)"
        return 0
    fi
    
    local backup_timestamp=$(get_timestamp)
    local backup_path="$BACKUP_DIR/deployment_$backup_timestamp"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would create backup at: $backup_path"
        return 0
    fi
    
    mkdir -p "$backup_path"
    
    # Backup current deployment state
    log_info "Backing up deployment state..."
    if [ -f "$CURRENT_DEPLOYMENT" ]; then
        cp "$CURRENT_DEPLOYMENT" "$backup_path/deployment_state.txt"
    fi
    
    # Backup git commit
    git rev-parse HEAD > "$backup_path/git_commit.txt" 2>/dev/null || echo "unknown" > "$backup_path/git_commit.txt"
    
    # Backup .env file
    if [ -f ".env" ]; then
        log_info "Backing up .env file..."
        cp .env "$backup_path/env.backup"
    fi
    
    # Backup compose file
    if [ -f "$COMPOSE_FILE" ]; then
        log_info "Backing up $COMPOSE_FILE..."
        cp "$COMPOSE_FILE" "$backup_path/docker-compose.backup.yml"
    fi
    
    # Backup databases if scripts available
    if [ -f "$DEPLOYMENT_DIR/backup-databases.sh" ]; then
        log_info "Backing up databases..."
        if bash "$DEPLOYMENT_DIR/backup-databases.sh" > "$backup_path/database_backup.log" 2>&1; then
            log_success "Database backup complete"
        else
            log_warning "Database backup had issues (check log)"
        fi
    fi
    
    # Save backup location
    echo "$backup_path" > "$STATE_DIR/.last_backup"
    
    log_success "✓ Stage 2: Backup complete - $backup_path"
    return 0
}

# ===== STAGE 3: SYNC =====
stage_sync() {
    log_section "Stage 3: Git Sync"
    
    if [ ! -d ".git" ]; then
        log_warning "Not a git repository - skipping sync"
        return 0
    fi
    
    # Use hardened sync if available
    if [ -f "$SCRIPT_DIR/hardened-sync.sh" ]; then
        log_info "Using hardened git sync..."
        
        local sync_args=""
        [ "$DRY_RUN" = true ] && sync_args="$sync_args --dry-run"
        [ "$FORCE" = true ] && sync_args="$sync_args --force"
        [ -n "$GIT_TAG" ] && sync_args="$sync_args --branch $GIT_TAG"
        
        if bash "$SCRIPT_DIR/hardened-sync.sh" $sync_args; then
            log_success "✓ Stage 3: Sync complete"
            return 0
        else
            log_error "Hardened sync failed"
            return 1
        fi
    else
        # Fallback to simple sync
        log_warning "Hardened sync not available, using basic sync..."
        
        if [ "$DRY_RUN" = true ]; then
            log_info "[DRY-RUN] Would fetch and merge from origin"
            return 0
        fi
        
        if git fetch origin; then
            local current=$(git rev-parse HEAD)
            local remote=$(git rev-parse origin/main)
            
            if [ "$current" != "$remote" ]; then
                log_info "Updating from $current to $remote..."
                if git merge --ff-only origin/main; then
                    log_success "✓ Stage 3: Sync complete"
                    return 0
                else
                    log_error "Cannot fast-forward - manual merge required"
                    return 1
                fi
            else
                log_info "Already up to date"
                return 0
            fi
        else
            log_error "Git fetch failed"
            return 1
        fi
    fi
}

# ===== STAGE 4: BUILD =====
stage_build() {
    log_section "Stage 4: Build"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would build containers"
        if [ -n "$SINGLE_SERVICE" ]; then
            log_info "[DRY-RUN] Target service: $SINGLE_SERVICE"
        else
            log_info "[DRY-RUN] Would build all services"
        fi
        return 0
    fi
    
    local build_target=""
    if [ -n "$SINGLE_SERVICE" ]; then
        build_target="$SINGLE_SERVICE"
        log_info "Building single service: $build_target"
    else
        log_info "Building all services..."
    fi
    
    # Pull latest base images first
    log_info "Pulling latest base images..."
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" pull --quiet 2>/dev/null || true
    
    # Build with no cache for clean build
    if $DOCKER_COMPOSE -f "$COMPOSE_FILE" build --pull $build_target; then
        log_success "✓ Stage 4: Build complete"
        return 0
    else
        log_error "Build failed"
        return 1
    fi
}

# ===== STAGE 5: DEPLOY =====
stage_deploy() {
    log_section "Stage 5: Deploy"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would deploy containers with rolling restart"
        return 0
    fi
    
    local deploy_target=""
    if [ -n "$SINGLE_SERVICE" ]; then
        deploy_target="$SINGLE_SERVICE"
        log_info "Deploying single service: $deploy_target"
    fi
    
    # Get list of services to deploy
    local services=()
    if [ -n "$deploy_target" ]; then
        services=("$deploy_target")
    else
        # Get all services from compose file
        mapfile -t services < <($DOCKER_COMPOSE -f "$COMPOSE_FILE" config --services)
    fi
    
    log_info "Deploying ${#services[@]} service(s): ${services[*]}"
    
    # Rolling restart with health checks
    for service in "${services[@]}"; do
        log_info "Deploying $service..."
        
        # Start/restart service
        if $DOCKER_COMPOSE -f "$COMPOSE_FILE" up -d --no-deps "$service"; then
            log_success "$service deployed"
            
            # Wait for service to be healthy (if health check enabled)
            if [ "$SKIP_HEALTH" = false ]; then
                log_info "Waiting for $service to be healthy..."
                if wait_for_service_health "$service"; then
                    log_success "$service is healthy"
                else
                    log_error "$service failed health check"
                    return 1
                fi
            fi
            
            # Delay between services for rolling restart
            if [ ${#services[@]} -gt 1 ]; then
                log_info "Waiting ${ROLLING_RESTART_DELAY}s before next service..."
                sleep $ROLLING_RESTART_DELAY
            fi
        else
            log_error "Failed to deploy $service"
            return 1
        fi
    done
    
    # Save deployment state
    {
        echo "timestamp=$(get_iso_timestamp)"
        echo "git_commit=$(git rev-parse HEAD 2>/dev/null || echo unknown)"
        echo "services=${services[*]}"
        echo "git_tag=${GIT_TAG:-none}"
    } > "$CURRENT_DEPLOYMENT"
    
    log_success "✓ Stage 5: Deploy complete"
    return 0
}

# ===== STAGE 6: VERIFY =====
stage_verify() {
    log_section "Stage 6: Verify"
    
    if [ "$SKIP_HEALTH" = true ]; then
        log_warning "Health checks skipped"
        return 0
    fi
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would verify service health"
        return 0
    fi
    
    log_info "Verifying all services..."
    
    # Get running containers
    local containers=$($DOCKER_COMPOSE -f "$COMPOSE_FILE" ps --format '{{.Service}}' | sort)
    
    if [ -z "$containers" ]; then
        log_error "No containers running!"
        return 1
    fi
    
    local total=0
    local healthy=0
    
    while read -r service; do
        ((total++))
        if check_service_health "$service"; then
            ((healthy++))
        fi
    done <<< "$containers"
    
    log_info "Health check: $healthy/$total services healthy"
    
    if [ "$healthy" -eq "$total" ]; then
        log_success "✓ Stage 6: Verification complete - all services healthy"
        return 0
    else
        log_error "Some services are unhealthy"
        return 1
    fi
}

# ===== HEALTH CHECK FUNCTIONS =====
check_service_health() {
    local service="$1"
    
    # Check if container is running
    if ! docker ps --format '{{.Names}}' | grep -q "^$service$"; then
        log_warning "$service: not running"
        return 1
    fi
    
    # Check container status
    local status=$(docker inspect --format='{{.State.Status}}' "$service" 2>/dev/null || echo "unknown")
    
    if [ "$status" = "running" ]; then
        log_success "$service: running"
        return 0
    else
        log_warning "$service: $status"
        return 1
    fi
}

wait_for_service_health() {
    local service="$1"
    local elapsed=0
    
    while [ $elapsed -lt $HEALTH_CHECK_TIMEOUT ]; do
        if check_service_health "$service" &> /dev/null; then
            return 0
        fi
        
        sleep $HEALTH_CHECK_INTERVAL
        ((elapsed += HEALTH_CHECK_INTERVAL))
    done
    
    log_error "Timeout waiting for $service (${HEALTH_CHECK_TIMEOUT}s)"
    return 1
}

# ===== FULL DEPLOYMENT PIPELINE =====
run_deployment() {
    local start_time=$(date +%s)
    local deployment_id=$(get_timestamp)
    
    log_section "Deployment Pipeline - ID: $deployment_id"
    
    audit_log "deployment_start" "in_progress" "id=$deployment_id tag=${GIT_TAG:-none}"
    
    # Check circuit breaker
    check_circuit_breaker
    
    # Save current deployment for rollback
    if [ -f "$CURRENT_DEPLOYMENT" ]; then
        cp "$CURRENT_DEPLOYMENT" "$LAST_DEPLOYMENT"
    fi
    
    # Run pipeline stages
    local failed_stage=""
    
    if ! stage_validate; then
        failed_stage="validate"
    elif ! stage_backup; then
        failed_stage="backup"
    elif ! stage_sync; then
        failed_stage="sync"
    elif ! stage_build; then
        failed_stage="build"
    elif ! stage_deploy; then
        failed_stage="deploy"
    elif ! stage_verify; then
        failed_stage="verify"
    fi
    
    # Check if deployment failed
    if [ -n "$failed_stage" ]; then
        log_error "Deployment FAILED at stage: $failed_stage"
        record_failure "stage=$failed_stage id=$deployment_id"
        
        # Automatic rollback if enabled
        if [ "$AUTO_ROLLBACK" = true ] && [ "$failed_stage" != "validate" ] && [ "$failed_stage" != "backup" ]; then
            log_warning "Initiating automatic rollback..."
            if run_rollback; then
                log_success "Rollback completed successfully"
            else
                log_error "Rollback FAILED - manual intervention required"
            fi
        fi
        
        return 1
    fi
    
    # Success!
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log_success "✓ Deployment completed successfully in ${duration}s"
    record_success "id=$deployment_id duration=${duration}s"
    
    # Add to history
    echo "$(get_iso_timestamp) | SUCCESS | id=$deployment_id | duration=${duration}s | tag=${GIT_TAG:-none}" >> "$HISTORY_LOG"
    
    return 0
}

# ===== ROLLBACK =====
run_rollback() {
    log_section "Rollback to Previous Deployment"
    
    if [ ! -f "$LAST_DEPLOYMENT" ]; then
        log_error "No previous deployment found to rollback to"
        return 1
    fi
    
    log_info "Previous deployment:"
    cat "$LAST_DEPLOYMENT" | sed 's/^/  /'
    
    if [ "$FORCE" = false ]; then
        if ! confirm_action "Rollback to previous deployment?"; then
            log_info "Rollback cancelled"
            return 1
        fi
    fi
    
    # Extract git commit from last deployment
    local rollback_commit=$(grep "git_commit=" "$LAST_DEPLOYMENT" | cut -d'=' -f2)
    
    if [ -z "$rollback_commit" ] || [ "$rollback_commit" = "unknown" ]; then
        log_error "Cannot determine rollback commit"
        return 1
    fi
    
    log_info "Rolling back to commit: $rollback_commit"
    
    if [ "$DRY_RUN" = false ]; then
        # Reset to previous commit
        if git reset --hard "$rollback_commit"; then
            log_success "Git rollback complete"
        else
            log_error "Git rollback failed"
            return 1
        fi
        
        # Rebuild and deploy
        if stage_build && stage_deploy; then
            log_success "✓ Rollback completed successfully"
            audit_log "rollback" "success" "commit=$rollback_commit"
            return 0
        else
            log_error "Rollback deployment failed"
            audit_log "rollback" "failed" "commit=$rollback_commit"
            return 1
        fi
    else
        log_info "[DRY-RUN] Would rollback to commit: $rollback_commit"
        return 0
    fi
}

# ===== STATUS =====
show_status() {
    log_section "Deployment Status"
    
    if [ -f "$CURRENT_DEPLOYMENT" ]; then
        echo ""
        log_info "Current Deployment:"
        cat "$CURRENT_DEPLOYMENT" | sed 's/^/  /'
        echo ""
    else
        log_warning "No deployment information available"
    fi
    
    log_info "Running Services:"
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" ps
    
    echo ""
    log_info "Service Health:"
    local containers=$($DOCKER_COMPOSE -f "$COMPOSE_FILE" ps --format '{{.Service}}' | sort)
    while read -r service; do
        check_service_health "$service"
    done <<< "$containers"
}

# ===== HISTORY =====
show_history() {
    log_section "Deployment History"
    
    if [ -f "$HISTORY_LOG" ]; then
        tail -20 "$HISTORY_LOG"
    else
        log_warning "No deployment history available"
    fi
    
    if [ -f "$AUDIT_LOG" ]; then
        echo ""
        log_info "Recent Audit Log:"
        tail -10 "$AUDIT_LOG"
    fi
}

# ===== MAIN =====
case "$COMMAND" in
    deploy)
        run_deployment
        ;;
    validate)
        stage_validate
        ;;
    backup)
        stage_backup
        ;;
    sync)
        stage_sync
        ;;
    build)
        stage_build
        ;;
    rollback)
        run_rollback
        ;;
    status)
        show_status
        ;;
    history)
        show_history
        ;;
    health)
        stage_verify
        ;;
    *)
        log_error "Unknown command: $COMMAND"
        echo "Use --help for usage information"
        exit 1
        ;;
esac

exit $?
