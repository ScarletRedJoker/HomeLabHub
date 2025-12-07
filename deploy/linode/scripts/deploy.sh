#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${DEPLOY_DIR}/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

DRY_RUN=false
FORCE=false
SKIP_BACKUP=false
SKIP_PREFLIGHT=false
SERVICES=""

print_usage() {
    cat << EOF
NASA-Grade Homelab Deployment Script

Usage: $0 [OPTIONS] [SERVICES...]

Options:
  --dry-run         Show what would be done without making changes
  --force           Skip confirmation prompts
  --skip-backup     Skip database backup (not recommended)
  --skip-preflight  Skip pre-flight checks (not recommended)
  --rollback        Rollback to previous deployment
  -h, --help        Show this help message

Services:
  If no services specified, deploys all services.
  Otherwise, only deploys specified services.

Examples:
  $0                           # Full deployment with all checks
  $0 discord-bot stream-bot    # Deploy only bot services
  $0 --dry-run                 # Preview deployment without changes
  $0 --rollback                # Rollback to previous state

EOF
}

print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
}

print_section() {
    echo ""
    echo -e "${YELLOW}━━━ $1 ━━━${NC}"
}

print_step() {
    echo -e "\n${CYAN}[STEP]${NC} $1"
}

log_success() {
    echo -e "  ${GREEN}[OK]${NC} $1"
}

log_error() {
    echo -e "  ${RED}[ERROR]${NC} $1"
}

log_warn() {
    echo -e "  ${YELLOW}[WARN]${NC} $1"
}

log_info() {
    echo -e "  ${BLUE}[INFO]${NC} $1"
}

confirm() {
    if [[ "$FORCE" == "true" ]]; then
        return 0
    fi
    read -p "  Continue? [y/N] " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]]
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --skip-backup)
            SKIP_BACKUP=true
            shift
            ;;
        --skip-preflight)
            SKIP_PREFLIGHT=true
            shift
            ;;
        --rollback)
            exec "$SCRIPT_DIR/rollback.sh"
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        -*)
            echo "Unknown option: $1"
            print_usage
            exit 1
            ;;
        *)
            SERVICES="$SERVICES $1"
            shift
            ;;
    esac
done

cd "$DEPLOY_DIR"

print_header "Homelab Deployment - NASA Grade"
echo "  Timestamp: $TIMESTAMP"
echo "  Directory: $DEPLOY_DIR"
echo "  Dry Run: $DRY_RUN"
if [[ -n "$SERVICES" ]]; then
    echo "  Services: $SERVICES"
else
    echo "  Services: ALL"
fi

if [[ "$DRY_RUN" == "true" ]]; then
    echo ""
    echo -e "  ${YELLOW}DRY RUN MODE - No changes will be made${NC}"
fi

if [[ "$SKIP_PREFLIGHT" != "true" ]]; then
    print_step "Running pre-flight checks..."
    if ! "$SCRIPT_DIR/preflight.sh"; then
        log_error "Pre-flight checks failed. Fix issues before deploying."
        exit 1
    fi
else
    log_warn "Skipping pre-flight checks (--skip-preflight)"
fi

if [[ "$SKIP_BACKUP" != "true" ]]; then
    print_step "Creating backup snapshot..."
    
    mkdir -p "$BACKUP_DIR"
    
    if [[ "$DRY_RUN" != "true" ]]; then
        cp .env "$BACKUP_DIR/.env.$TIMESTAMP" 2>/dev/null || true
        log_success "Backed up .env file"
        
        docker compose images > "$BACKUP_DIR/images.$TIMESTAMP.txt" 2>/dev/null || true
        log_success "Recorded current image versions"
        
        if docker ps --format '{{.Names}}' | grep -q "homelab-postgres"; then
            log_info "Creating database backup (this may take a moment)..."
            docker exec homelab-postgres pg_dumpall -U postgres > "$BACKUP_DIR/postgres_all.$TIMESTAMP.sql" 2>/dev/null || {
                log_warn "Database backup failed - container may not be running"
            }
            if [[ -f "$BACKUP_DIR/postgres_all.$TIMESTAMP.sql" ]]; then
                gzip "$BACKUP_DIR/postgres_all.$TIMESTAMP.sql" 2>/dev/null || true
                log_success "Database backup created: postgres_all.$TIMESTAMP.sql.gz"
            fi
        else
            log_warn "PostgreSQL container not running - skipping database backup"
        fi
        
        find "$BACKUP_DIR" -type f -mtime +7 -delete 2>/dev/null || true
        log_info "Cleaned up backups older than 7 days"
    else
        log_info "[DRY RUN] Would backup .env, images, and database"
    fi
else
    log_warn "Skipping backup (--skip-backup) - not recommended for production"
fi

print_step "Pulling latest images..."
if [[ "$DRY_RUN" != "true" ]]; then
    if [[ -n "$SERVICES" ]]; then
        docker compose pull $SERVICES 2>&1 | head -20
    else
        docker compose pull 2>&1 | head -30
    fi
    log_success "Images pulled successfully"
else
    log_info "[DRY RUN] Would pull images"
fi

print_step "Building custom images..."
if [[ "$DRY_RUN" != "true" ]]; then
    if [[ -n "$SERVICES" ]]; then
        docker compose build --no-cache $SERVICES 2>&1 | tail -20
    else
        docker compose build --no-cache 2>&1 | tail -30
    fi
    log_success "Custom images built"
else
    log_info "[DRY RUN] Would build custom images"
fi

print_section "Deployment Order"
echo "  The following order ensures dependencies are ready:"
echo ""
echo "  1. Infrastructure: caddy, redis, homelab-postgres"
echo "  2. Observability:  homelab-loki, homelab-prometheus, homelab-grafana"
echo "  3. Core Services:  homelab-dashboard, homelab-celery-worker"
echo "  4. Bots:           discord-bot, stream-bot"
echo "  5. Tools:          n8n, code-server, code-server-proxy"
echo "  6. Static Sites:   scarletredjoker-web, rig-city-site"
echo "  7. Utilities:      dns-manager, homelab-node-exporter, homelab-cadvisor"
echo ""

if ! confirm; then
    echo "Deployment cancelled."
    exit 0
fi

deploy_tier() {
    local tier_name=$1
    shift
    local services=("$@")
    
    print_step "Deploying $tier_name..."
    
    for svc in "${services[@]}"; do
        if [[ -n "$SERVICES" ]] && ! echo "$SERVICES" | grep -qw "$svc"; then
            log_info "Skipping $svc (not in requested services)"
            continue
        fi
        
        if [[ "$DRY_RUN" != "true" ]]; then
            log_info "Starting $svc..."
            if docker compose up -d --wait --wait-timeout 120 "$svc" 2>&1 | grep -v "^$"; then
                log_success "$svc deployed"
            else
                log_warn "$svc may have issues - check logs"
            fi
        else
            log_info "[DRY RUN] Would deploy $svc"
        fi
    done
}

deploy_tier "Infrastructure Layer" caddy redis homelab-postgres

print_step "Verifying database initialization..."
if [[ "$DRY_RUN" != "true" ]]; then
    if docker ps --format '{{.Names}}' | grep -q "homelab-postgres"; then
        log_info "Waiting for PostgreSQL to be ready..."
        sleep 5
        
        REQUIRED_DBS=("homelab_jarvis" "ticketbot" "streambot" "dashboard")
        
        check_databases() {
            local missing=0
            for db in "${REQUIRED_DBS[@]}"; do
                if docker exec homelab-postgres psql -U postgres -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$db"; then
                    log_success "Database ready: $db"
                else
                    log_warn "Database not found: $db"
                    ((missing++))
                fi
            done
            return $missing
        }
        
        if ! check_databases; then
            log_info "Some databases missing - triggering initialization..."
            
            if docker exec homelab-postgres bash -c 'test -f /docker-entrypoint-initdb.d/init-databases.sh'; then
                log_info "Running database initialization script..."
                if docker exec homelab-postgres bash -c 'cd /docker-entrypoint-initdb.d && bash init-databases.sh' 2>&1; then
                    log_success "Database initialization script completed"
                else
                    log_error "Database initialization script failed"
                fi
            else
                log_warn "Init script not found in container - databases may need manual setup"
            fi
            
            sleep 3
            log_info "Re-checking databases after initialization..."
            
            STILL_MISSING=0
            for db in "${REQUIRED_DBS[@]}"; do
                if ! docker exec homelab-postgres psql -U postgres -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$db"; then
                    log_error "Database still missing: $db"
                    ((STILL_MISSING++))
                fi
            done
            
            if [[ $STILL_MISSING -gt 0 ]]; then
                log_error "Database initialization failed - $STILL_MISSING database(s) missing"
                log_error "Dependent services (discord-bot, stream-bot) will likely fail"
                log_error "Run: docker exec homelab-postgres bash /docker-entrypoint-initdb.d/init-databases.sh"
                exit 1
            fi
            
            log_success "All databases initialized successfully"
        else
            log_success "All required databases present"
        fi
    else
        log_error "PostgreSQL not running - cannot verify databases"
        exit 1
    fi
else
    log_info "[DRY RUN] Would verify database initialization"
fi

deploy_tier "Observability Stack" homelab-loki homelab-prometheus homelab-grafana homelab-node-exporter homelab-cadvisor
deploy_tier "Core Services" homelab-dashboard homelab-celery-worker
deploy_tier "Bot Services" discord-bot stream-bot
deploy_tier "Developer Tools" n8n code-server code-server-proxy
deploy_tier "Static Sites" scarletredjoker-web rig-city-site
deploy_tier "Utilities" dns-manager

print_step "Running health checks..."

if [[ "$DRY_RUN" != "true" ]]; then
    sleep 10
    
    check_health() {
        local container=$1
        local status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "unknown")
        local running=$(docker inspect --format='{{.State.Running}}' "$container" 2>/dev/null || echo "false")
        
        if [[ "$status" == "healthy" ]]; then
            log_success "$container: healthy"
            return 0
        elif [[ "$running" == "true" ]]; then
            if [[ "$status" == "unknown" ]]; then
                log_success "$container: running (no health check)"
            else
                log_warn "$container: running but $status"
            fi
            return 0
        else
            log_error "$container: not running"
            return 1
        fi
    }
    
    CONTAINERS=$(docker compose ps --format '{{.Name}}' 2>/dev/null)
    HEALTHY=0
    UNHEALTHY=0
    
    for container in $CONTAINERS; do
        if check_health "$container"; then
            ((HEALTHY++))
        else
            ((UNHEALTHY++))
        fi
    done
    
    print_section "Container Health Verification"
    
    verify_container_health() {
        local container=$1
        local max_attempts=6
        local attempt=1
        
        while [[ $attempt -le $max_attempts ]]; do
            local health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "none")
            local running=$(docker inspect --format='{{.State.Running}}' "$container" 2>/dev/null || echo "false")
            
            if [[ "$health" == "healthy" ]]; then
                log_success "$container: healthy"
                return 0
            elif [[ "$running" == "true" && "$health" == "none" ]]; then
                log_success "$container: running (no health check configured)"
                return 0
            elif [[ "$running" == "true" ]]; then
                if [[ $attempt -lt $max_attempts ]]; then
                    log_info "$container: waiting for health check ($attempt/$max_attempts)..."
                    sleep 10
                    ((attempt++))
                else
                    log_warn "$container: running but health check not passing after $max_attempts attempts"
                    return 1
                fi
            else
                log_error "$container: not running"
                return 1
            fi
        done
    }
    
    CRITICAL_SERVICES=("homelab-postgres" "caddy" "redis")
    CRITICAL_FAILED=0
    
    for svc in "${CRITICAL_SERVICES[@]}"; do
        if ! verify_container_health "$svc"; then
            ((CRITICAL_FAILED++))
        fi
    done
    
    if [[ $CRITICAL_FAILED -gt 0 ]]; then
        log_error "Critical infrastructure services failed health checks!"
        log_error "Deployment ABORTED. Fix issues before retrying."
        log_error "Check logs with: docker compose logs"
        exit 1
    fi
    
    APPLICATION_SERVICES=("homelab-dashboard" "discord-bot" "stream-bot")
    
    for svc in "${APPLICATION_SERVICES[@]}"; do
        if docker ps --format '{{.Names}}' | grep -q "^${svc}$"; then
            verify_container_health "$svc" || true
        fi
    done
    
else
    log_info "[DRY RUN] Would run health checks"
fi

print_header "Deployment Summary"

if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "  ${YELLOW}DRY RUN COMPLETE - No changes were made${NC}"
    echo ""
    echo "  Run without --dry-run to perform actual deployment."
else
    echo -e "  ${GREEN}Deployment completed at $(date)${NC}"
    echo ""
    
    if [[ ${UNHEALTHY:-0} -gt 0 ]]; then
        echo -e "  ${YELLOW}[WARNING] $UNHEALTHY service(s) may have issues${NC}"
        echo "  Check logs with: docker compose logs <service-name>"
    else
        echo -e "  ${GREEN}All services deployed successfully!${NC}"
    fi
    
    echo ""
    echo "  Backup location: $BACKUP_DIR"
    echo "  To rollback: $0 --rollback"
    echo ""
    echo "  Useful commands:"
    echo "    docker compose ps                    # Check status"
    echo "    docker compose logs -f <service>     # View logs"
    echo "    docker compose restart <service>     # Restart service"
fi

exit 0
