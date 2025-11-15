#!/bin/bash
# ======================================================================
# Enhanced Deployment Script with Health Checks and Auto-Rollback
# Validates, deploys, monitors health, and rolls back on failure
# ======================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.unified.yml"
DEPLOYMENT_LOG="${SCRIPT_DIR}/deployment.log"
HISTORY_LOG="${SCRIPT_DIR}/deployment-history.log"
HEALTH_CHECK_TIMEOUT=120
HEALTH_CHECK_INTERVAL=5
DRY_RUN=${DRY_RUN:-false}
AUTO_ROLLBACK=${AUTO_ROLLBACK:-true}

# Detect docker-compose command
if docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    echo -e "${RED}Error: Docker Compose not found${NC}"
    exit 1
fi

# Logging functions
log() {
    echo -e "${GREEN}[✓]${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

warn() {
    echo -e "${YELLOW}[⚠]${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

error() {
    echo -e "${RED}[✗]${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

info() {
    echo -e "${BLUE}[i]${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

section() {
    echo "" | tee -a "$DEPLOYMENT_LOG"
    echo -e "${CYAN}${BOLD}━━━ $1 ━━━${NC}" | tee -a "$DEPLOYMENT_LOG"
}

# Print banner
print_banner() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}                                                                ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}        ${BOLD}${MAGENTA}🚀 DEPLOYMENT WITH AUTO-ROLLBACK${NC}                   ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                                ${CYAN}║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    if [ "$DRY_RUN" = "true" ]; then
        echo -e "${YELLOW}${BOLD}⚠ DRY RUN MODE - No changes will be made${NC}"
        echo ""
    fi
}

# Log deployment event to history
log_deployment_event() {
    local status="$1"
    local snapshot="${2:-none}"
    local notes="${3:-}"
    local git_commit=""
    
    if [ -d "${PROJECT_DIR}/.git" ]; then
        git_commit=$(git -C "$PROJECT_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
    fi
    
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $status $snapshot $git_commit all-services \"$notes\"" >> "$HISTORY_LOG"
}

# Wait for service health check
wait_for_health() {
    local service_name="$1"
    local timeout="${2:-$HEALTH_CHECK_TIMEOUT}"
    local elapsed=0
    
    info "Waiting for $service_name health check..."
    
    while [ $elapsed -lt $timeout ]; do
        # Check if container is running
        if ! docker ps --format '{{.Names}}' | grep -q "^${service_name}$"; then
            error "$service_name container is not running"
            return 1
        fi
        
        # Check health status
        health_status=$(docker inspect --format='{{.State.Health.Status}}' "$service_name" 2>/dev/null || echo "none")
        
        if [ "$health_status" = "healthy" ]; then
            log "$service_name is healthy"
            return 0
        elif [ "$health_status" = "unhealthy" ]; then
            error "$service_name is unhealthy"
            return 1
        elif [ "$health_status" = "none" ]; then
            # Service doesn't have health check, check if it's running
            if docker ps --format '{{.Names}}' --filter "status=running" | grep -q "^${service_name}$"; then
                log "$service_name is running (no health check defined)"
                return 0
            fi
        fi
        
        # Still starting
        echo -ne "\r${BLUE}[i]${NC} Waiting for $service_name... ${elapsed}s/${timeout}s"
        sleep $HEALTH_CHECK_INTERVAL
        elapsed=$((elapsed + HEALTH_CHECK_INTERVAL))
    done
    
    echo "" # New line after progress
    error "$service_name did not become healthy within ${timeout}s"
    return 1
}

# Check all services health
check_all_health() {
    section "Health Check Monitoring"
    
    # Services to monitor (in dependency order)
    local services=(
        "discord-bot-db"
        "homelab-redis"
        "homelab-minio"
        "homelab-dashboard"
        "homelab-celery-worker"
        "discord-bot"
        "stream-bot"
        "caddy"
        "n8n"
        "plex-server"
        "vnc-desktop"
        "code-server"
        "homeassistant"
        "scarletredjoker-web"
        "rig-city-site"
    )
    
    local failed_services=()
    
    for service in "${services[@]}"; do
        if docker ps --format '{{.Names}}' | grep -q "^${service}$"; then
            if ! wait_for_health "$service" "$HEALTH_CHECK_TIMEOUT"; then
                failed_services+=("$service")
                error "Health check failed for: $service"
                
                # Show last 20 lines of logs for failed service
                info "Last 20 log lines from $service:"
                docker logs "$service" --tail 20 2>&1 | sed 's/^/  /' | tee -a "$DEPLOYMENT_LOG"
            fi
        else
            warn "$service is not running (may not be defined in this deployment)"
        fi
    done
    
    echo ""
    if [ ${#failed_services[@]} -eq 0 ]; then
        log "All services passed health checks!"
        return 0
    else
        error "Health check failed for ${#failed_services[@]} service(s): ${failed_services[*]}"
        return 1
    fi
}

# Provide error context and suggestions
analyze_deployment_errors() {
    section "Error Analysis"
    
    info "Analyzing deployment errors..."
    
    # Check for common errors
    local error_count=0
    
    # Port conflicts
    if grep -qi "port.*already.*allocated\|address already in use" "$DEPLOYMENT_LOG" 2>/dev/null; then
        error "PORT CONFLICT DETECTED"
        info "Fix: Check which process is using the port with: sudo lsof -i :<port>"
        info "Fix: Stop the conflicting service or change ports in docker-compose.unified.yml"
        ((error_count++))
    fi
    
    # Missing environment variables
    if grep -qi "missing.*environment\|variable.*not.*set" "$DEPLOYMENT_LOG" 2>/dev/null; then
        error "MISSING ENVIRONMENT VARIABLES"
        info "Fix: Edit .env file and set all required variables"
        info "Fix: Run: ./deployment/generate-unified-env.sh"
        ((error_count++))
    fi
    
    # Out of memory
    if grep -qi "out of memory\|OOM\|cannot allocate memory" "$DEPLOYMENT_LOG" 2>/dev/null; then
        error "OUT OF MEMORY"
        info "Fix: Increase system memory or reduce container resource limits"
        info "Fix: Free up memory: docker system prune -a"
        ((error_count++))
    fi
    
    # Database connection errors
    if grep -qi "could not connect.*database\|database.*connection.*failed" "$DEPLOYMENT_LOG" 2>/dev/null; then
        error "DATABASE CONNECTION FAILED"
        info "Fix: Ensure PostgreSQL container is running and healthy"
        info "Fix: Check database credentials in .env file"
        info "Fix: Run: ./deployment/ensure-databases.sh"
        ((error_count++))
    fi
    
    # Image pull errors
    if grep -qi "failed to pull\|image.*not found\|manifest.*not found" "$DEPLOYMENT_LOG" 2>/dev/null; then
        error "IMAGE PULL FAILED"
        info "Fix: Check internet connectivity"
        info "Fix: Verify image names in docker-compose.unified.yml"
        info "Fix: Try: docker-compose build --no-cache"
        ((error_count++))
    fi
    
    if [ $error_count -eq 0 ]; then
        warn "No specific errors detected. Check logs above for details."
    fi
    
    echo ""
}

# Main deployment flow
main() {
    cd "$PROJECT_DIR" || { error "Cannot access project directory: $PROJECT_DIR"; exit 1; }
    
    echo "=== Deployment Started at $(date) ===" >> "$DEPLOYMENT_LOG"
    print_banner
    
    local snapshot_name=""
    local deployment_status="FAILED"
    
    # ===== Step 1: Pre-Deployment Validation =====
    section "Step 1: Pre-Deployment Validation"
    
    if [ "$DRY_RUN" = "false" ]; then
        if [ -x "${SCRIPT_DIR}/validate-deployment.sh" ]; then
            if ! "${SCRIPT_DIR}/validate-deployment.sh"; then
                error "Pre-deployment validation failed!"
                log_deployment_event "VALIDATION_FAILED" "none" "Pre-deployment validation failed"
                exit 1
            fi
        else
            warn "validate-deployment.sh not found or not executable - skipping validation"
        fi
    else
        info "Dry run: Would run pre-deployment validation"
    fi
    
    # ===== Step 2: Create Snapshot =====
    section "Step 2: Creating Snapshot"
    
    if [ "$DRY_RUN" = "false" ]; then
        if [ -x "${SCRIPT_DIR}/rollback-deployment.sh" ]; then
            snapshot_name=$("${SCRIPT_DIR}/rollback-deployment.sh" create 2>&1 | tail -1)
            log "Snapshot created: $snapshot_name"
        else
            warn "rollback-deployment.sh not found - deployment will proceed without snapshot"
            snapshot_name="none"
        fi
    else
        info "Dry run: Would create deployment snapshot"
        snapshot_name="dry-run-snapshot"
    fi
    
    # ===== Step 3: Deploy Services =====
    section "Step 3: Deploying Services"
    
    if [ "$DRY_RUN" = "false" ]; then
        info "Building and starting services..."
        
        # Build images
        if ! $DOCKER_COMPOSE -f "$COMPOSE_FILE" build 2>&1 | tee -a "$DEPLOYMENT_LOG"; then
            error "Build failed!"
            if [ "$AUTO_ROLLBACK" = "true" ] && [ "$snapshot_name" != "none" ]; then
                warn "Triggering automatic rollback..."
                "${SCRIPT_DIR}/rollback-deployment.sh" restore "$snapshot_name"
                log_deployment_event "BUILD_FAILED_ROLLBACK" "$snapshot_name" "Build failed, rolled back"
            else
                log_deployment_event "BUILD_FAILED" "$snapshot_name" "Build failed, no rollback"
            fi
            exit 1
        fi
        
        # Start services
        if ! $DOCKER_COMPOSE -f "$COMPOSE_FILE" up -d 2>&1 | tee -a "$DEPLOYMENT_LOG"; then
            error "Failed to start services!"
            if [ "$AUTO_ROLLBACK" = "true" ] && [ "$snapshot_name" != "none" ]; then
                warn "Triggering automatic rollback..."
                "${SCRIPT_DIR}/rollback-deployment.sh" restore "$snapshot_name"
                log_deployment_event "START_FAILED_ROLLBACK" "$snapshot_name" "Start failed, rolled back"
            else
                log_deployment_event "START_FAILED" "$snapshot_name" "Start failed, no rollback"
            fi
            exit 1
        fi
        
        log "Services started successfully"
    else
        info "Dry run: Would build and start services"
        info "Command: $DOCKER_COMPOSE -f $COMPOSE_FILE build"
        info "Command: $DOCKER_COMPOSE -f $COMPOSE_FILE up -d"
    fi
    
    # ===== Step 4: Health Check Monitoring =====
    if [ "$DRY_RUN" = "false" ]; then
        info "Waiting for services to initialize..."
        sleep 10
        
        if ! check_all_health; then
            error "Health checks failed!"
            analyze_deployment_errors
            
            if [ "$AUTO_ROLLBACK" = "true" ] && [ "$snapshot_name" != "none" ]; then
                warn "Triggering automatic rollback..."
                "${SCRIPT_DIR}/rollback-deployment.sh" restore "$snapshot_name"
                log_deployment_event "HEALTH_FAILED_ROLLBACK" "$snapshot_name" "Health checks failed, rolled back"
            else
                log_deployment_event "HEALTH_FAILED" "$snapshot_name" "Health checks failed, no rollback"
            fi
            exit 1
        fi
        
        deployment_status="SUCCESS"
    else
        info "Dry run: Would monitor service health checks"
    fi
    
    # ===== Success! =====
    echo "" | tee -a "$DEPLOYMENT_LOG"
    echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" | tee -a "$DEPLOYMENT_LOG"
    echo -e "${GREEN}${BOLD}✓ DEPLOYMENT SUCCESSFUL${NC}" | tee -a "$DEPLOYMENT_LOG"
    echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" | tee -a "$DEPLOYMENT_LOG"
    echo "" | tee -a "$DEPLOYMENT_LOG"
    
    if [ "$DRY_RUN" = "false" ]; then
        log "Snapshot: $snapshot_name"
        log "All services are healthy and running"
        log_deployment_event "SUCCESS" "$snapshot_name" "Deployment completed successfully"
        
        # Show service status
        info "Current service status:"
        $DOCKER_COMPOSE -f "$COMPOSE_FILE" ps | tee -a "$DEPLOYMENT_LOG"
    else
        info "Dry run completed - no changes were made"
        info "To deploy for real, run without DRY_RUN=true"
    fi
    
    echo "" | tee -a "$DEPLOYMENT_LOG"
    echo "=== Deployment Completed at $(date) ===" >> "$DEPLOYMENT_LOG"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --no-rollback)
            AUTO_ROLLBACK=false
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --dry-run       Show what would be deployed without making changes"
            echo "  --no-rollback   Disable automatic rollback on failure"
            echo "  --help          Show this help message"
            echo ""
            echo "Environment variables:"
            echo "  DRY_RUN=true           Same as --dry-run"
            echo "  AUTO_ROLLBACK=false    Same as --no-rollback"
            echo ""
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Run main deployment
main
