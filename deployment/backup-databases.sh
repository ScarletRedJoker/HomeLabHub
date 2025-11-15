#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ROOT="/home/evin/contain/backups/database"
DAILY_DIR="${BACKUP_ROOT}/daily"
WEEKLY_DIR="${BACKUP_ROOT}/weekly"
LOG_FILE="${BACKUP_ROOT}/backup.log"
RETAIN_DAILY=7
RETAIN_WEEKLY=4

CONTAINER_NAME="discord-bot-db"
DATABASES=("ticketbot" "streambot" "homelab_jarvis")

POSTGRES_USER="postgres"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "${LOG_FILE}"
}

log_info() { log "INFO" "${BLUE}$@${NC}"; }
log_success() { log "SUCCESS" "${GREEN}$@${NC}"; }
log_warning() { log "WARNING" "${YELLOW}$@${NC}"; }
log_error() { log "ERROR" "${RED}$@${NC}"; }

create_backup_dirs() {
    log_info "Creating backup directories..."
    mkdir -p "${DAILY_DIR}" "${WEEKLY_DIR}"
    chmod 700 "${BACKUP_ROOT}"
    log_success "Backup directories created"
}

check_container() {
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_error "Container '${CONTAINER_NAME}' is not running"
        return 1
    fi
    log_success "Container '${CONTAINER_NAME}' is running"
    return 0
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
            echo "postgres"
            ;;
    esac
}

backup_database() {
    local db=$1
    local backup_dir=$2
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local backup_file="${backup_dir}/${db}_${timestamp}.sql.gz"
    local temp_file="/tmp/${db}_${timestamp}.sql"
    
    log_info "Backing up database: ${db}"
    
    local db_user="${db}"
    if [ "${db}" = "homelab_jarvis" ]; then
        db_user="jarvis"
    fi
    
    local db_password=$(get_db_password "${db}")
    
    if docker exec -e PGPASSWORD="${db_password}" "${CONTAINER_NAME}" \
        pg_dump -U "${db_user}" -d "${db}" \
        --no-owner --no-acl --clean --if-exists \
        > "${temp_file}"; then
        
        gzip -9 "${temp_file}"
        mv "${temp_file}.gz" "${backup_file}"
        
        local size=$(du -h "${backup_file}" | cut -f1)
        log_success "Database ${db} backed up successfully (${size})"
        
        verify_backup "${backup_file}" "${db}" "${db_user}" "${db_password}"
        
        echo "${backup_file}"
        return 0
    else
        log_error "Failed to backup database: ${db}"
        rm -f "${temp_file}" "${temp_file}.gz"
        return 1
    fi
}

verify_backup() {
    local backup_file=$1
    local db_name=$2
    local db_user=$3
    local db_password=$4
    local temp_db="verify_${db_name}_$$"
    
    log_info "Verifying backup: $(basename ${backup_file})"
    
    if docker exec -e PGPASSWORD="${db_password}" "${CONTAINER_NAME}" \
        psql -U "${db_user}" -d postgres -c "CREATE DATABASE ${temp_db};" >/dev/null 2>&1; then
        
        if gunzip -c "${backup_file}" | \
           docker exec -i -e PGPASSWORD="${db_password}" "${CONTAINER_NAME}" \
           psql -U "${db_user}" -d "${temp_db}" >/dev/null 2>&1; then
            
            local table_count=$(docker exec -e PGPASSWORD="${db_password}" "${CONTAINER_NAME}" \
                psql -U "${db_user}" -d "${temp_db}" -t -c \
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" | tr -d ' ')
            
            log_success "Backup verified successfully (${table_count} tables)"
        else
            log_warning "Backup verification failed: Could not restore to temp database"
        fi
        
        docker exec -e PGPASSWORD="${db_password}" "${CONTAINER_NAME}" \
            psql -U "${db_user}" -d postgres -c "DROP DATABASE ${temp_db};" >/dev/null 2>&1
    else
        log_warning "Could not create verification database"
    fi
}

cleanup_old_backups() {
    local backup_dir=$1
    local retain_count=$2
    local backup_type=$3
    
    log_info "Cleaning up old ${backup_type} backups (keeping ${retain_count})"
    
    local file_count=$(find "${backup_dir}" -name "*.sql.gz" 2>/dev/null | wc -l)
    
    if [ "${file_count}" -gt "${retain_count}" ]; then
        find "${backup_dir}" -name "*.sql.gz" -type f -printf '%T@ %p\n' | \
            sort -rn | tail -n +$((retain_count + 1)) | cut -d' ' -f2- | \
            while read -r file; do
                log_info "Removing old backup: $(basename ${file})"
                rm -f "${file}"
            done
        log_success "Cleanup completed"
    else
        log_info "No old backups to remove (${file_count}/${retain_count})"
    fi
}

create_weekly_backup() {
    local day_of_week=$(date +%u)
    
    if [ "${day_of_week}" = "7" ]; then
        log_info "Creating weekly backup snapshot..."
        
        for db in "${DATABASES[@]}"; do
            local latest_daily=$(find "${DAILY_DIR}" -name "${db}_*.sql.gz" -type f -printf '%T@ %p\n' | \
                sort -rn | head -1 | cut -d' ' -f2-)
            
            if [ -n "${latest_daily}" ]; then
                local weekly_file="${WEEKLY_DIR}/$(basename ${latest_daily})"
                cp "${latest_daily}" "${weekly_file}"
                log_success "Weekly backup created for ${db}"
            fi
        done
        
        cleanup_old_backups "${WEEKLY_DIR}" "${RETAIN_WEEKLY}" "weekly"
    fi
}

get_backup_stats() {
    local total_size=$(du -sh "${BACKUP_ROOT}" 2>/dev/null | cut -f1 || echo "0")
    local daily_count=$(find "${DAILY_DIR}" -name "*.sql.gz" 2>/dev/null | wc -l)
    local weekly_count=$(find "${WEEKLY_DIR}" -name "*.sql.gz" 2>/dev/null | wc -l)
    
    log_info "=== Backup Statistics ==="
    log_info "Total backup size: ${total_size}"
    log_info "Daily backups: ${daily_count}"
    log_info "Weekly backups: ${weekly_count}"
    log_info "======================="
}

send_notification() {
    local status=$1
    local message=$2
    
    if [ "${status}" = "success" ]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') SUCCESS: ${message}" >> "${BACKUP_ROOT}/status.txt"
    else
        echo "$(date '+%Y-%m-%d %H:%M:%S') FAILURE: ${message}" >> "${BACKUP_ROOT}/status.txt"
    fi
}

main() {
    log_info "========================================="
    log_info "Starting Database Backup"
    log_info "========================================="
    
    create_backup_dirs
    
    if ! check_container; then
        send_notification "failure" "Database container not running"
        exit 1
    fi
    
    local backup_failed=0
    local backup_count=0
    
    for db in "${DATABASES[@]}"; do
        if backup_database "${db}" "${DAILY_DIR}"; then
            ((backup_count++))
        else
            backup_failed=1
        fi
    done
    
    if [ "${backup_count}" -eq "${#DATABASES[@]}" ]; then
        cleanup_old_backups "${DAILY_DIR}" "${RETAIN_DAILY}" "daily"
        create_weekly_backup
        get_backup_stats
        
        log_success "========================================="
        log_success "All database backups completed successfully"
        log_success "========================================="
        
        send_notification "success" "All ${backup_count} databases backed up successfully"
        exit 0
    else
        log_error "========================================="
        log_error "Some backups failed"
        log_error "========================================="
        
        send_notification "failure" "Some database backups failed"
        exit 1
    fi
}

main "$@"
