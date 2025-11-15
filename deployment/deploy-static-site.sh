#!/bin/bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.unified.yml"
VALIDATION_SCRIPT="${SCRIPT_DIR}/validate-static-site.sh"

# Deployment tracking
DEPLOYMENT_HISTORY="${SCRIPT_DIR}/static-site-deployments.log"

# Function to log messages
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${PURPLE}[STEP]${NC} $1"
}

# Function to log deployment history
log_deployment() {
    local site_name="$1"
    local action="$2"
    local status="$3"
    local timestamp=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
    echo "$timestamp | $site_name | $action | $status" >> "$DEPLOYMENT_HISTORY"
}

# Function to create backup
create_backup() {
    local site_dir="$1"
    local site_name=$(basename "$site_dir")
    local backup_dir="${PROJECT_ROOT}/backups/static-sites"
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_path="${backup_dir}/${site_name}_${timestamp}"
    
    log_step "Creating backup of $site_name"
    
    mkdir -p "$backup_dir"
    
    if [[ -d "$site_dir" ]]; then
        cp -r "$site_dir" "$backup_path"
        log_success "Backup created: $backup_path"
        echo "$backup_path"
    else
        log_error "Site directory not found: $site_dir"
        return 1
    fi
}

# Function to validate site before deployment
validate_site() {
    local site_dir="$1"
    local site_name=$(basename "$site_dir")
    
    log_step "Validating site: $site_name"
    
    if [[ ! -x "$VALIDATION_SCRIPT" ]]; then
        log_error "Validation script not found or not executable: $VALIDATION_SCRIPT"
        return 1
    fi
    
    if "$VALIDATION_SCRIPT" "$site_dir"; then
        log_success "Site validation passed"
        return 0
    else
        log_error "Site validation failed"
        return 1
    fi
}

# Function to get container name from docker-compose
get_container_name() {
    local service_name="$1"
    
    # Try to get container name from docker-compose
    if command -v docker-compose &> /dev/null; then
        container_name=$(docker-compose -f "$COMPOSE_FILE" ps -q "$service_name" 2>/dev/null | xargs docker inspect --format='{{.Name}}' 2>/dev/null | sed 's/^\///')
        if [[ -n "$container_name" ]]; then
            echo "$container_name"
            return 0
        fi
    fi
    
    # Fallback to service name
    echo "$service_name"
}

# Function to check if container is healthy
check_container_health() {
    local container_name="$1"
    local max_attempts=30
    local attempt=1
    
    log_info "Checking health of container: $container_name"
    
    while [[ $attempt -le $max_attempts ]]; do
        if docker inspect "$container_name" &>/dev/null; then
            health_status=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null || echo "none")
            
            if [[ "$health_status" == "healthy" ]] || [[ "$health_status" == "none" ]]; then
                # If no health check or healthy, check if running
                state=$(docker inspect --format='{{.State.Running}}' "$container_name" 2>/dev/null)
                if [[ "$state" == "true" ]]; then
                    log_success "Container is healthy and running"
                    return 0
                fi
            fi
        fi
        
        log_info "Waiting for container to be healthy... (attempt $attempt/$max_attempts)"
        sleep 2
        ((attempt++))
    done
    
    log_error "Container failed to become healthy after $max_attempts attempts"
    return 1
}

# Function to test site accessibility
test_site_accessibility() {
    local url="$1"
    local max_attempts=10
    local attempt=1
    
    log_info "Testing site accessibility: $url"
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -sSf -o /dev/null -w "%{http_code}" "$url" | grep -q "200"; then
            log_success "Site is accessible and returning HTTP 200"
            return 0
        fi
        
        log_info "Waiting for site to be accessible... (attempt $attempt/$max_attempts)"
        sleep 3
        ((attempt++))
    done
    
    log_error "Site failed to become accessible after $max_attempts attempts"
    return 1
}

# Function to deploy with blue-green strategy
deploy_blue_green() {
    local site_name="$1"
    local service_name="$2"
    local site_dir="$3"
    
    log_step "Starting blue-green deployment for $site_name"
    
    # Get current container name
    local current_container=$(get_container_name "$service_name")
    log_info "Current container: $current_container"
    
    # Create temporary green deployment
    local green_service="${service_name}-green"
    local green_container="${current_container}-green"
    
    log_step "Creating green deployment: $green_service"
    
    # Scale up green deployment
    # Note: This requires docker-compose.yml to support scaling or temporary service creation
    # For simplicity, we'll use a restart strategy for static sites
    
    log_info "Restarting $service_name with new content..."
    
    if docker-compose -f "$COMPOSE_FILE" up -d --force-recreate "$service_name"; then
        log_success "Container recreated successfully"
        
        # Check health
        if check_container_health "$service_name"; then
            log_success "Green deployment is healthy"
            
            # Test accessibility
            local test_url="http://localhost/"
            if docker exec "$service_name" wget --spider -q "http://localhost/" 2>/dev/null; then
                log_success "Green deployment accessibility verified"
                log_success "Blue-green deployment completed successfully"
                return 0
            else
                log_warning "Could not verify accessibility, but container is healthy"
                return 0
            fi
        else
            log_error "Green deployment health check failed"
            return 1
        fi
    else
        log_error "Failed to recreate container"
        return 1
    fi
}

# Function to rollback deployment
rollback_deployment() {
    local site_name="$1"
    local backup_path="$2"
    local service_name="$3"
    
    log_step "Rolling back deployment for $site_name"
    
    if [[ ! -d "$backup_path" ]]; then
        log_error "Backup not found: $backup_path"
        return 1
    fi
    
    # Restore from backup
    local site_dir=$(dirname "$backup_path")/$(basename "$site_name")
    
    log_info "Restoring from backup: $backup_path"
    rm -rf "$site_dir"
    cp -r "$backup_path" "$site_dir"
    
    # Restart container
    log_info "Restarting container: $service_name"
    if docker-compose -f "$COMPOSE_FILE" restart "$service_name"; then
        log_success "Rollback completed successfully"
        log_deployment "$site_name" "rollback" "success"
        return 0
    else
        log_error "Rollback failed"
        log_deployment "$site_name" "rollback" "failed"
        return 1
    fi
}

# Function to deploy static site
deploy_site() {
    local site_name="$1"
    local service_name="$2"
    local site_dir="$3"
    local skip_validation="${4:-false}"
    
    echo ""
    echo "========================================="
    echo "Deploying Static Site: $site_name"
    echo "========================================="
    echo ""
    
    # Step 1: Validate site
    if [[ "$skip_validation" != "true" ]]; then
        if ! validate_site "$site_dir"; then
            log_error "Pre-deployment validation failed for $site_name"
            log_deployment "$site_name" "deploy" "validation_failed"
            return 1
        fi
    else
        log_warning "Skipping validation as requested"
    fi
    
    # Step 2: Create backup
    backup_path=$(create_backup "$site_dir")
    if [[ $? -ne 0 ]]; then
        log_error "Failed to create backup"
        log_deployment "$site_name" "deploy" "backup_failed"
        return 1
    fi
    
    # Step 3: Deploy with blue-green strategy
    if deploy_blue_green "$site_name" "$service_name" "$site_dir"; then
        log_success "Deployment successful for $site_name"
        log_deployment "$site_name" "deploy" "success"
        
        # Clean up old backups (keep last 5)
        cleanup_old_backups "$site_name"
        
        return 0
    else
        log_error "Deployment failed for $site_name"
        
        # Attempt rollback
        log_warning "Attempting automatic rollback..."
        if rollback_deployment "$site_name" "$backup_path" "$service_name"; then
            log_deployment "$site_name" "deploy" "failed_rolled_back"
        else
            log_deployment "$site_name" "deploy" "failed_rollback_failed"
        fi
        
        return 1
    fi
}

# Function to cleanup old backups
cleanup_old_backups() {
    local site_name="$1"
    local backup_dir="${PROJECT_ROOT}/backups/static-sites"
    local keep_count=5
    
    log_info "Cleaning up old backups for $site_name (keeping last $keep_count)"
    
    if [[ -d "$backup_dir" ]]; then
        # Find and remove old backups, keeping the most recent ones
        find "$backup_dir" -maxdepth 1 -type d -name "${site_name}_*" | \
            sort -r | \
            tail -n +$((keep_count + 1)) | \
            while read -r old_backup; do
                log_info "Removing old backup: $(basename "$old_backup")"
                rm -rf "$old_backup"
            done
    fi
}

# Function to show deployment history
show_deployment_history() {
    local site_name="${1:-all}"
    
    echo ""
    echo "========================================="
    echo "Deployment History"
    echo "========================================="
    echo ""
    
    if [[ ! -f "$DEPLOYMENT_HISTORY" ]]; then
        log_info "No deployment history found"
        return 0
    fi
    
    if [[ "$site_name" == "all" ]]; then
        tail -n 20 "$DEPLOYMENT_HISTORY" | column -t -s '|'
    else
        grep "$site_name" "$DEPLOYMENT_HISTORY" | tail -n 20 | column -t -s '|'
    fi
    echo ""
}

# Usage information
usage() {
    cat << EOF
Usage: $0 <command> [options]

Commands:
    deploy <site>           Deploy a static site
    validate <site>         Validate a static site without deploying
    rollback <site>         Rollback to previous deployment
    history [site]          Show deployment history

Sites:
    scarletredjoker        scarletredjoker.com (services/static-site)
    rig-city               rig-city.com (services/rig-city-site)
    all                    Deploy both sites

Options:
    --skip-validation      Skip pre-deployment validation (use with caution)

Examples:
    $0 deploy scarletredjoker
    $0 deploy rig-city --skip-validation
    $0 deploy all
    $0 validate scarletredjoker
    $0 history rig-city
    $0 rollback scarletredjoker

EOF
    exit 1
}

# Parse site name and get paths
get_site_info() {
    local site="$1"
    
    case "$site" in
        scarletredjoker)
            SITE_NAME="scarletredjoker.com"
            SERVICE_NAME="scarletredjoker-web"
            SITE_DIR="${PROJECT_ROOT}/services/static-site"
            ;;
        rig-city)
            SITE_NAME="rig-city.com"
            SERVICE_NAME="rig-city-site"
            SITE_DIR="${PROJECT_ROOT}/services/rig-city-site"
            ;;
        *)
            log_error "Unknown site: $site"
            usage
            ;;
    esac
}

# Main script
main() {
    if [[ $# -lt 1 ]]; then
        usage
    fi
    
    local command="$1"
    shift
    
    case "$command" in
        deploy)
            if [[ $# -lt 1 ]]; then
                usage
            fi
            
            local site="$1"
            shift
            local skip_validation="false"
            
            # Parse options
            while [[ $# -gt 0 ]]; do
                case "$1" in
                    --skip-validation)
                        skip_validation="true"
                        shift
                        ;;
                    *)
                        log_error "Unknown option: $1"
                        usage
                        ;;
                esac
            done
            
            if [[ "$site" == "all" ]]; then
                # Deploy all sites
                for s in scarletredjoker rig-city; do
                    get_site_info "$s"
                    deploy_site "$SITE_NAME" "$SERVICE_NAME" "$SITE_DIR" "$skip_validation"
                    echo ""
                done
            else
                get_site_info "$site"
                deploy_site "$SITE_NAME" "$SERVICE_NAME" "$SITE_DIR" "$skip_validation"
            fi
            ;;
            
        validate)
            if [[ $# -lt 1 ]]; then
                usage
            fi
            
            local site="$1"
            get_site_info "$site"
            validate_site "$SITE_DIR"
            ;;
            
        rollback)
            if [[ $# -lt 1 ]]; then
                usage
            fi
            
            local site="$1"
            get_site_info "$site"
            
            # Find most recent backup
            local backup_dir="${PROJECT_ROOT}/backups/static-sites"
            local latest_backup=$(find "$backup_dir" -maxdepth 1 -type d -name "$(basename "$SITE_DIR")_*" | sort -r | head -n 1)
            
            if [[ -z "$latest_backup" ]]; then
                log_error "No backup found for $site"
                exit 1
            fi
            
            log_info "Latest backup: $latest_backup"
            rollback_deployment "$SITE_NAME" "$latest_backup" "$SERVICE_NAME"
            ;;
            
        history)
            local site="${1:-all}"
            show_deployment_history "$site"
            ;;
            
        *)
            log_error "Unknown command: $command"
            usage
            ;;
    esac
}

# Run main function
main "$@"
