#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${DEPLOY_DIR}/backups"

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
}

print_section() {
    echo ""
    echo -e "${YELLOW}━━━ $1 ━━━${NC}"
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

cd "$DEPLOY_DIR"

print_header "Homelab Rollback System"

if [[ ! -d "$BACKUP_DIR" ]]; then
    log_error "No backup directory found at $BACKUP_DIR"
    echo "  Cannot perform rollback without backups."
    exit 1
fi

print_section "Available Backups"

ENV_BACKUPS=$(ls -1t "$BACKUP_DIR"/.env.* 2>/dev/null | head -10)
DB_BACKUPS=$(ls -1t "$BACKUP_DIR"/postgres_all.*.sql.gz 2>/dev/null | head -10)
IMAGE_BACKUPS=$(ls -1t "$BACKUP_DIR"/images.*.txt 2>/dev/null | head -10)

echo "  Environment backups:"
if [[ -n "$ENV_BACKUPS" ]]; then
    for backup in $ENV_BACKUPS; do
        BACKUP_TIME=$(echo "$backup" | grep -oP '\d{8}_\d{6}')
        echo "    - $BACKUP_TIME ($(basename "$backup"))"
    done
else
    echo "    (none)"
fi

echo ""
echo "  Database backups:"
if [[ -n "$DB_BACKUPS" ]]; then
    for backup in $DB_BACKUPS; do
        SIZE=$(du -h "$backup" | cut -f1)
        BACKUP_TIME=$(echo "$backup" | grep -oP '\d{8}_\d{6}')
        echo "    - $BACKUP_TIME ($SIZE)"
    done
else
    echo "    (none)"
fi

if [[ -z "$ENV_BACKUPS" ]] && [[ -z "$DB_BACKUPS" ]]; then
    log_error "No backups found. Cannot perform rollback."
    exit 1
fi

print_section "Rollback Options"
echo "  1) Quick rollback (restart services with current config)"
echo "  2) Environment rollback (restore previous .env file)"
echo "  3) Database rollback (restore database from backup)"
echo "  4) Full rollback (environment + database + restart)"
echo "  5) Cancel"
echo ""

read -p "  Select option [1-5]: " OPTION

case $OPTION in
    1)
        print_section "Quick Rollback - Restarting Services"
        log_info "Stopping all services..."
        docker compose down
        log_info "Starting services..."
        docker compose up -d
        log_success "Services restarted"
        ;;
    2)
        print_section "Environment Rollback"
        
        if [[ -z "$ENV_BACKUPS" ]]; then
            log_error "No environment backups available"
            exit 1
        fi
        
        echo "  Available backups:"
        select BACKUP in $ENV_BACKUPS "Cancel"; do
            if [[ "$BACKUP" == "Cancel" ]] || [[ -z "$BACKUP" ]]; then
                echo "  Cancelled."
                exit 0
            fi
            
            log_info "Backing up current .env..."
            cp .env ".env.before_rollback_$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
            
            log_info "Restoring from $BACKUP..."
            cp "$BACKUP" .env
            log_success "Environment restored"
            
            read -p "  Restart services with restored config? [y/N] " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                docker compose down
                docker compose up -d
                log_success "Services restarted with restored environment"
            fi
            break
        done
        ;;
    3)
        print_section "Database Rollback"
        
        if [[ -z "$DB_BACKUPS" ]]; then
            log_error "No database backups available"
            exit 1
        fi
        
        echo ""
        echo -e "  ${RED}WARNING: This will replace ALL database data!${NC}"
        echo "  Make sure you have a current backup before proceeding."
        echo ""
        
        echo "  Available database backups:"
        select BACKUP in $DB_BACKUPS "Cancel"; do
            if [[ "$BACKUP" == "Cancel" ]] || [[ -z "$BACKUP" ]]; then
                echo "  Cancelled."
                exit 0
            fi
            
            read -p "  Are you SURE you want to restore this database? [yes/NO] " CONFIRM
            if [[ "$CONFIRM" != "yes" ]]; then
                echo "  Cancelled."
                exit 0
            fi
            
            log_info "Creating safety backup of current database..."
            docker exec homelab-postgres pg_dumpall -U postgres > "$BACKUP_DIR/postgres_before_rollback_$(date +%Y%m%d_%H%M%S).sql" 2>/dev/null || {
                log_warn "Could not backup current database - container may not be running"
            }
            
            log_info "Stopping dependent services..."
            docker compose stop homelab-dashboard homelab-celery-worker discord-bot stream-bot n8n 2>/dev/null || true
            
            log_info "Restoring database from $BACKUP..."
            gunzip -c "$BACKUP" | docker exec -i homelab-postgres psql -U postgres 2>/dev/null
            log_success "Database restored"
            
            log_info "Restarting services..."
            docker compose up -d
            log_success "Services restarted"
            break
        done
        ;;
    4)
        print_section "Full Rollback"
        echo ""
        echo -e "  ${RED}WARNING: This will restore environment AND database!${NC}"
        echo "  This is a complete rollback to a previous state."
        echo ""
        
        read -p "  Are you SURE you want to perform a full rollback? [yes/NO] " CONFIRM
        if [[ "$CONFIRM" != "yes" ]]; then
            echo "  Cancelled."
            exit 0
        fi
        
        LATEST_ENV=$(echo "$ENV_BACKUPS" | head -1)
        LATEST_DB=$(echo "$DB_BACKUPS" | head -1)
        
        log_info "Using latest backups:"
        echo "    Environment: $(basename "$LATEST_ENV")"
        echo "    Database: $(basename "$LATEST_DB")"
        
        log_info "Stopping all services..."
        docker compose down
        
        log_info "Restoring environment..."
        cp .env ".env.before_rollback_$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
        cp "$LATEST_ENV" .env
        log_success "Environment restored"
        
        log_info "Starting infrastructure..."
        docker compose up -d homelab-postgres redis
        sleep 10
        
        log_info "Restoring database..."
        gunzip -c "$LATEST_DB" | docker exec -i homelab-postgres psql -U postgres 2>/dev/null
        log_success "Database restored"
        
        log_info "Starting all services..."
        docker compose up -d
        log_success "Full rollback complete"
        ;;
    5|*)
        echo "  Cancelled."
        exit 0
        ;;
esac

print_section "Post-Rollback Status"

docker compose ps

echo ""
log_info "Check service health with: docker compose ps"
log_info "View logs with: docker compose logs -f <service>"
