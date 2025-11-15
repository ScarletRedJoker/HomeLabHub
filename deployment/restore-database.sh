#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ROOT="/home/evin/contain/backups/database"
DAILY_DIR="${BACKUP_ROOT}/daily"
WEEKLY_DIR="${BACKUP_ROOT}/weekly"

CONTAINER_NAME="discord-bot-db"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $@"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $@"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $@"; }
log_error() { echo -e "${RED}[ERROR]${NC} $@"; }

usage() {
    cat << EOF
Usage: $0 <database> [backup_file]

Restore a PostgreSQL database from backup.

Arguments:
  database      Name of database to restore (ticketbot, streambot, homelab_jarvis)
  backup_file   Optional: Path to specific backup file
                If not provided, will use the most recent backup

Examples:
  $0 ticketbot
  $0 streambot /home/evin/contain/backups/database/daily/streambot_20250115_030000.sql.gz
  $0 homelab_jarvis --list

Options:
  --list        List available backups for the database
  --help        Show this help message

EOF
    exit 1
}

get_db_password() {
    local db=$1
    local env_file="${SCRIPT_DIR}/../.env"
    
    case $db in
        ticketbot)
            grep "^DISCORD_DB_PASSWORD=" "${env_file}" | cut -d'=' -f2 || echo "BrsJoker123"
            ;;
        streambot)
            grep "^STREAMBOT_DB_PASSWORD=" "${env_file}" | cut -d'=' -f2 || echo "streambot123"
            ;;
        homelab_jarvis)
            grep "^JARVIS_DB_PASSWORD=" "${env_file}" | cut -d'=' -f2 || echo "BrsDashboard123"
            ;;
        *)
            log_error "Unknown database: ${db}"
            exit 1
            ;;
    esac
}

list_backups() {
    local db=$1
    
    log_info "Available backups for ${db}:"
    echo ""
    
    echo "Daily Backups:"
    find "${DAILY_DIR}" -name "${db}_*.sql.gz" -type f -printf '%T@ %p\n' 2>/dev/null | \
        sort -rn | while read -r timestamp file; do
            local size=$(du -h "${file}" | cut -f1)
            local date=$(date -d "@${timestamp}" '+%Y-%m-%d %H:%M:%S')
            echo "  ${date} - $(basename ${file}) (${size})"
        done
    
    echo ""
    echo "Weekly Backups:"
    find "${WEEKLY_DIR}" -name "${db}_*.sql.gz" -type f -printf '%T@ %p\n' 2>/dev/null | \
        sort -rn | while read -r timestamp file; do
            local size=$(du -h "${file}" | cut -f1)
            local date=$(date -d "@${timestamp}" '+%Y-%m-%d %H:%M:%S')
            echo "  ${date} - $(basename ${file}) (${size})"
        done
}

find_latest_backup() {
    local db=$1
    
    local latest=$(find "${DAILY_DIR}" "${WEEKLY_DIR}" -name "${db}_*.sql.gz" -type f -printf '%T@ %p\n' 2>/dev/null | \
        sort -rn | head -1 | cut -d' ' -f2-)
    
    echo "${latest}"
}

check_prerequisites() {
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_error "Container '${CONTAINER_NAME}' is not running"
        log_info "Start the container with: docker-compose -f docker-compose.unified.yml up -d ${CONTAINER_NAME}"
        exit 1
    fi
    
    log_success "Container '${CONTAINER_NAME}' is running"
}

create_backup_before_restore() {
    local db=$1
    local db_user=$2
    local db_password=$3
    local safety_backup="/tmp/${db}_pre_restore_$(date +%Y%m%d_%H%M%S).sql.gz"
    
    log_info "Creating safety backup before restore..."
    
    if docker exec -e PGPASSWORD="${db_password}" "${CONTAINER_NAME}" \
        pg_dump -U "${db_user}" -d "${db}" \
        --no-owner --no-acl | gzip -9 > "${safety_backup}"; then
        
        log_success "Safety backup created: ${safety_backup}"
        echo "${safety_backup}"
    else
        log_warning "Could not create safety backup (database may not exist yet)"
        echo ""
    fi
}

restore_database() {
    local db=$1
    local backup_file=$2
    local db_user="${db}"
    
    if [ "${db}" = "homelab_jarvis" ]; then
        db_user="jarvis"
    fi
    
    local db_password=$(get_db_password "${db}")
    
    log_info "========================================="
    log_info "Database Restore"
    log_info "========================================="
    log_info "Database: ${db}"
    log_info "Backup: ${backup_file}"
    log_info "Size: $(du -h ${backup_file} | cut -f1)"
    log_info "========================================="
    
    read -p "Are you sure you want to restore this database? This will OVERWRITE existing data! (yes/no): " confirm
    if [ "${confirm}" != "yes" ]; then
        log_warning "Restore cancelled by user"
        exit 0
    fi
    
    local safety_backup=$(create_backup_before_restore "${db}" "${db_user}" "${db_password}")
    
    log_info "Dropping existing database connections..."
    docker exec -e PGPASSWORD="${db_password}" "${CONTAINER_NAME}" \
        psql -U "${db_user}" -d postgres -c \
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${db}' AND pid <> pg_backend_pid();" \
        >/dev/null 2>&1 || true
    
    log_info "Restoring database from backup..."
    if gunzip -c "${backup_file}" | \
       docker exec -i -e PGPASSWORD="${db_password}" "${CONTAINER_NAME}" \
       psql -U "${db_user}" -d "${db}" 2>&1 | tee /tmp/restore.log | grep -i "error" && \
       ! grep -iq "already exists" /tmp/restore.log; then
        
        log_error "Restore encountered errors. Check /tmp/restore.log for details"
        
        if [ -n "${safety_backup}" ]; then
            log_warning "Safety backup available at: ${safety_backup}"
        fi
        
        exit 1
    fi
    
    log_info "Verifying restore..."
    local table_count=$(docker exec -e PGPASSWORD="${db_password}" "${CONTAINER_NAME}" \
        psql -U "${db_user}" -d "${db}" -t -c \
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" | tr -d ' ')
    
    log_success "========================================="
    log_success "Database restored successfully!"
    log_success "Tables found: ${table_count}"
    log_success "========================================="
    
    if [ -n "${safety_backup}" ]; then
        log_info "Safety backup: ${safety_backup}"
        log_info "You can delete it once you've verified the restore"
    fi
}

main() {
    if [ $# -eq 0 ]; then
        usage
    fi
    
    local database=$1
    local backup_file=""
    
    if [ "${database}" = "--help" ]; then
        usage
    fi
    
    if [ $# -eq 2 ]; then
        if [ "$2" = "--list" ]; then
            list_backups "${database}"
            exit 0
        else
            backup_file="$2"
        fi
    fi
    
    if [ ! "${database}" = "ticketbot" ] && \
       [ ! "${database}" = "streambot" ] && \
       [ ! "${database}" = "homelab_jarvis" ]; then
        log_error "Invalid database name: ${database}"
        log_info "Valid options: ticketbot, streambot, homelab_jarvis"
        exit 1
    fi
    
    check_prerequisites
    
    if [ -z "${backup_file}" ]; then
        backup_file=$(find_latest_backup "${database}")
        
        if [ -z "${backup_file}" ]; then
            log_error "No backups found for database: ${database}"
            log_info "Run: $0 ${database} --list to see available backups"
            exit 1
        fi
        
        log_info "Using latest backup: ${backup_file}"
    fi
    
    if [ ! -f "${backup_file}" ]; then
        log_error "Backup file not found: ${backup_file}"
        exit 1
    fi
    
    restore_database "${database}" "${backup_file}"
}

main "$@"
