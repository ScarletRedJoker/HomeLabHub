#!/bin/bash
################################################################################
# Unified Database Migration Script
# 
# Manages database migrations across all services:
# - Dashboard (Alembic/Python)
# - Stream Bot (Drizzle/TypeScript)
# - Discord Bot (Drizzle/TypeScript)
#
# Features:
# - Checks pending migrations before applying
# - Creates backups before migrations
# - Applies migrations in dependency order
# - Supports rollback on failure
# - Logs all migrations to audit trail
################################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_ROOT/migration-backups"
AUDIT_LOG="$PROJECT_ROOT/migration-audit.log"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [$level] $message" | tee -a "$AUDIT_LOG"
}

log_info() {
    echo -e "${BLUE}ℹ️  $*${NC}"
    log "INFO" "$*"
}

log_success() {
    echo -e "${GREEN}✅ $*${NC}"
    log "SUCCESS" "$*"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $*${NC}"
    log "WARNING" "$*"
}

log_error() {
    echo -e "${RED}❌ $*${NC}"
    log "ERROR" "$*"
}

# Banner
show_banner() {
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}                                                                ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}        ${BOLD}${MAGENTA}🗄️  UNIFIED DATABASE MIGRATION MANAGER${NC}                ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                                ${CYAN}║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Check if a service has pending migrations
check_pending_migrations() {
    local service="$1"
    local has_pending=0
    
    case "$service" in
        "dashboard")
            log_info "Checking Dashboard (Alembic) migrations..."
            cd "$PROJECT_ROOT/services/dashboard"
            
            current=$(alembic current 2>/dev/null | head -n 1 | awk '{print $1}' || echo "")
            heads=$(alembic heads 2>/dev/null | head -n 1 | awk '{print $1}' || echo "")
            
            if [ "$current" != "$heads" ]; then
                log_warning "Dashboard has pending migrations: $current → $heads"
                has_pending=1
            else
                log_success "Dashboard is up to date: $current"
            fi
            cd "$PROJECT_ROOT"
            ;;
            
        "stream-bot")
            log_info "Checking Stream Bot (Drizzle) migrations..."
            cd "$PROJECT_ROOT/services/stream-bot"
            
            if npm run migrate:status 2>&1 | grep -q "⏳ Pending"; then
                log_warning "Stream Bot has pending migrations"
                has_pending=1
            else
                log_success "Stream Bot is up to date"
            fi
            cd "$PROJECT_ROOT"
            ;;
            
        "discord-bot")
            log_info "Checking Discord Bot (Drizzle) migrations..."
            cd "$PROJECT_ROOT/services/discord-bot"
            
            if npm run migrate:status 2>&1 | grep -q "⏳ Pending"; then
                log_warning "Discord Bot has pending migrations"
                has_pending=1
            else
                log_success "Discord Bot is up to date"
            fi
            cd "$PROJECT_ROOT"
            ;;
    esac
    
    return $has_pending
}

# Show migration status for all services
show_migration_status() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━ Migration Status ━━━${NC}"
    echo ""
    
    local total_pending=0
    
    # Dashboard
    if check_pending_migrations "dashboard"; then
        ((total_pending++)) || true
    fi
    echo ""
    
    # Stream Bot
    if check_pending_migrations "stream-bot"; then
        ((total_pending++)) || true
    fi
    echo ""
    
    # Discord Bot
    if check_pending_migrations "discord-bot"; then
        ((total_pending++)) || true
    fi
    echo ""
    
    if [ $total_pending -eq 0 ]; then
        echo -e "${GREEN}${BOLD}✨ All services are up to date!${NC}"
        return 0
    else
        echo -e "${YELLOW}${BOLD}⚠️  $total_pending service(s) have pending migrations${NC}"
        return 1
    fi
}

# Create database backup
create_backup() {
    local service="$1"
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    
    log_info "Creating backup for $service..."
    
    case "$service" in
        "dashboard")
            local backup_file="$BACKUP_DIR/dashboard_${timestamp}.sql"
            if [ -n "${DATABASE_URL:-}" ]; then
                pg_dump "$DATABASE_URL" > "$backup_file" 2>/dev/null || {
                    log_warning "Backup failed for $service (continuing anyway)"
                    return 0
                }
                log_success "Backup created: $backup_file"
            else
                log_warning "DATABASE_URL not set, skipping backup"
            fi
            ;;
            
        "stream-bot")
            cd "$PROJECT_ROOT/services/stream-bot"
            npm run migrate:up -- --backup-only 2>/dev/null || {
                log_warning "Backup handled by migration script"
            }
            cd "$PROJECT_ROOT"
            ;;
            
        "discord-bot")
            cd "$PROJECT_ROOT/services/discord-bot"
            npm run migrate:up -- --backup-only 2>/dev/null || {
                log_warning "Backup handled by migration script"
            }
            cd "$PROJECT_ROOT"
            ;;
    esac
}

# Apply migrations for a service
apply_migrations() {
    local service="$1"
    
    log_info "Applying migrations for $service..."
    
    case "$service" in
        "dashboard")
            cd "$PROJECT_ROOT/services/dashboard"
            if alembic upgrade head; then
                log_success "$service migrations applied successfully"
                cd "$PROJECT_ROOT"
                return 0
            else
                log_error "$service migrations failed"
                cd "$PROJECT_ROOT"
                return 1
            fi
            ;;
            
        "stream-bot")
            cd "$PROJECT_ROOT/services/stream-bot"
            if npm run migrate:up; then
                log_success "$service migrations applied successfully"
                cd "$PROJECT_ROOT"
                return 0
            else
                log_error "$service migrations failed"
                cd "$PROJECT_ROOT"
                return 1
            fi
            ;;
            
        "discord-bot")
            cd "$PROJECT_ROOT/services/discord-bot"
            if npm run migrate:up; then
                log_success "$service migrations applied successfully"
                cd "$PROJECT_ROOT"
                return 0
            else
                log_error "$service migrations failed"
                cd "$PROJECT_ROOT"
                return 1
            fi
            ;;
    esac
}

# Rollback last migration for a service
rollback_migration() {
    local service="$1"
    
    log_warning "Rolling back $service migration..."
    
    case "$service" in
        "dashboard")
            cd "$PROJECT_ROOT/services/dashboard"
            alembic downgrade -1
            cd "$PROJECT_ROOT"
            ;;
            
        "stream-bot")
            cd "$PROJECT_ROOT/services/stream-bot"
            npm run migrate:down
            cd "$PROJECT_ROOT"
            ;;
            
        "discord-bot")
            cd "$PROJECT_ROOT/services/discord-bot"
            npm run migrate:down
            cd "$PROJECT_ROOT"
            ;;
    esac
    
    log_warning "Rollback completed for $service"
}

# Main migration flow
run_migrations() {
    show_banner
    
    # Show current status
    if show_migration_status; then
        echo ""
        log_info "Nothing to migrate. Exiting."
        exit 0
    fi
    
    echo ""
    echo -e "${YELLOW}${BOLD}⚠️  WARNING: This will apply pending database migrations!${NC}"
    echo ""
    read -p "Do you want to continue? (yes/no): " -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "Migration cancelled by user"
        exit 0
    fi
    
    # Apply migrations in dependency order
    # 1. Dashboard (infrastructure)
    # 2. Stream Bot & Discord Bot (can run in parallel)
    
    local failed_services=()
    
    # Dashboard first
    if check_pending_migrations "dashboard" 2>/dev/null; then
        create_backup "dashboard"
        if ! apply_migrations "dashboard"; then
            failed_services+=("dashboard")
        fi
    fi
    
    # Stream Bot
    if check_pending_migrations "stream-bot" 2>/dev/null; then
        create_backup "stream-bot"
        if ! apply_migrations "stream-bot"; then
            failed_services+=("stream-bot")
        fi
    fi
    
    # Discord Bot
    if check_pending_migrations "discord-bot" 2>/dev/null; then
        create_backup "discord-bot"
        if ! apply_migrations "discord-bot"; then
            failed_services+=("discord-bot")
        fi
    fi
    
    # Summary
    echo ""
    echo -e "${BOLD}${BLUE}━━━ Migration Summary ━━━${NC}"
    echo ""
    
    if [ ${#failed_services[@]} -eq 0 ]; then
        log_success "All migrations completed successfully!"
        echo ""
        echo -e "${GREEN}Backups stored in: $BACKUP_DIR${NC}"
        echo -e "${GREEN}Audit log: $AUDIT_LOG${NC}"
    else
        log_error "Some migrations failed: ${failed_services[*]}"
        echo ""
        echo -e "${RED}Failed services: ${failed_services[*]}${NC}"
        echo -e "${YELLOW}Check the audit log for details: $AUDIT_LOG${NC}"
        echo ""
        echo -e "${YELLOW}You may need to manually rollback or fix the migrations.${NC}"
        exit 1
    fi
}

# Status-only mode
if [ "${1:-}" = "status" ]; then
    show_banner
    show_migration_status
    exit $?
fi

# Rollback mode
if [ "${1:-}" = "rollback" ]; then
    show_banner
    service="${2:-}"
    
    if [ -z "$service" ]; then
        echo -e "${RED}Usage: $0 rollback <service>${NC}"
        echo -e "${YELLOW}Services: dashboard, stream-bot, discord-bot${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}${BOLD}⚠️  WARNING: This will rollback the last migration for $service!${NC}"
    echo ""
    read -p "Are you sure? (yes/no): " -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        create_backup "$service"
        rollback_migration "$service"
    else
        log_info "Rollback cancelled"
    fi
    exit 0
fi

# Run migrations
run_migrations
