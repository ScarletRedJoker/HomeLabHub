#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-/home/evin/contain/backups/plex}"
DAILY_DIR="${BACKUP_ROOT}/daily"
WEEKLY_DIR="${BACKUP_ROOT}/weekly"
LOG_FILE="${BACKUP_ROOT}/backup.log"
RETAIN_DAILY=7
RETAIN_WEEKLY=4

CONTAINER_NAME="plex-server"
PLEX_CONFIG="./services/plex/config/Library/Application Support/Plex Media Server"

INCLUDE_METADATA="${INCLUDE_METADATA:-true}"
VERIFY_BACKUP="${VERIFY_BACKUP:-true}"

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

check_disk_space() {
    local required_space_mb=5000  # Require 5GB free space
    local available_space=$(df -m "${BACKUP_ROOT}" | awk 'NR==2 {print $4}')
    
    if [ "${available_space}" -lt "${required_space_mb}" ]; then
        log_error "Insufficient disk space. Required: ${required_space_mb}MB, Available: ${available_space}MB"
        return 1
    fi
    
    log_info "Disk space check passed: ${available_space}MB available"
    return 0
}

stop_plex() {
    log_info "Stopping Plex gracefully..."
    
    if ! docker stop -t 30 "${CONTAINER_NAME}"; then
        log_error "Failed to stop Plex gracefully"
        return 1
    fi
    
    sleep 5
    log_success "Plex stopped successfully"
    return 0
}

start_plex() {
    log_info "Starting Plex..."
    
    if ! docker start "${CONTAINER_NAME}"; then
        log_error "Failed to start Plex"
        return 1
    fi
    
    sleep 10
    
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_success "Plex started successfully"
        
        for i in {1..12}; do
            if curl -sf http://localhost:32400/identity > /dev/null 2>&1; then
                log_success "Plex is responding to requests"
                return 0
            fi
            log_info "Waiting for Plex to be ready... (${i}/12)"
            sleep 5
        done
        
        log_warning "Plex started but not responding to requests yet"
        return 0
    else
        log_error "Plex failed to start"
        return 1
    fi
}

backup_database() {
    local backup_dir=$1
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local backup_subdir="${backup_dir}/backup_${timestamp}"
    
    log_info "Creating database backup: ${backup_subdir}"
    mkdir -p "${backup_subdir}"
    
    local db_dir="${PLEX_CONFIG}/Plug-in Support/Databases"
    
    if [ ! -d "${db_dir}" ]; then
        log_error "Database directory not found: ${db_dir}"
        return 1
    fi
    
    log_info "Backing up main library database..."
    if [ -f "${db_dir}/com.plexapp.plugins.library.db" ]; then
        cp -p "${db_dir}/com.plexapp.plugins.library.db" "${backup_subdir}/"
        cp -p "${db_dir}/com.plexapp.plugins.library.db-wal" "${backup_subdir}/" 2>/dev/null || true
        cp -p "${db_dir}/com.plexapp.plugins.library.db-shm" "${backup_subdir}/" 2>/dev/null || true
        
        local db_size=$(du -h "${db_dir}/com.plexapp.plugins.library.db" | cut -f1)
        log_success "Main database backed up (${db_size})"
    else
        log_error "Main database not found"
        return 1
    fi
    
    log_info "Backing up blobs database..."
    if [ -f "${db_dir}/com.plexapp.plugins.library.blobs.db" ]; then
        cp -p "${db_dir}/com.plexapp.plugins.library.blobs.db" "${backup_subdir}/"
        cp -p "${db_dir}/com.plexapp.plugins.library.blobs.db-wal" "${backup_subdir}/" 2>/dev/null || true
        cp -p "${db_dir}/com.plexapp.plugins.library.blobs.db-shm" "${backup_subdir}/" 2>/dev/null || true
        
        local blobs_size=$(du -h "${db_dir}/com.plexapp.plugins.library.blobs.db" | cut -f1)
        log_success "Blobs database backed up (${blobs_size})"
    else
        log_warning "Blobs database not found (may not exist yet)"
    fi
    
    echo "${backup_subdir}"
    return 0
}

backup_configuration() {
    local backup_dir=$1
    
    log_info "Backing up Plex configuration..."
    
    if [ -f "${PLEX_CONFIG}/Preferences.xml" ]; then
        cp -p "${PLEX_CONFIG}/Preferences.xml" "${backup_dir}/"
        log_success "Preferences.xml backed up"
    else
        log_error "Preferences.xml not found"
        return 1
    fi
    
    if [ -d "${PLEX_CONFIG}/Plug-in Support/Preferences" ]; then
        cp -rp "${PLEX_CONFIG}/Plug-in Support/Preferences" "${backup_dir}/"
        log_success "Plugin preferences backed up"
    fi
    
    if [ -d "${PLEX_CONFIG}/Plug-in Support/Metadata Combination" ]; then
        cp -rp "${PLEX_CONFIG}/Plug-in Support/Metadata Combination" "${backup_dir}/"
        log_success "Metadata combinations backed up"
    fi
    
    return 0
}

backup_metadata() {
    local backup_dir=$1
    
    log_info "Backing up metadata and artwork..."
    
    if [ -d "${PLEX_CONFIG}/Metadata" ]; then
        tar -czf "${backup_dir}/metadata.tar.gz" \
            -C "${PLEX_CONFIG}" \
            Metadata/ 2>/dev/null || log_warning "Metadata backup failed or empty"
        
        if [ -f "${backup_dir}/metadata.tar.gz" ]; then
            local meta_size=$(du -h "${backup_dir}/metadata.tar.gz" | cut -f1)
            log_success "Metadata archived (${meta_size})"
        fi
    else
        log_warning "Metadata directory not found"
    fi
    
    if [ -d "${PLEX_CONFIG}/Media" ]; then
        tar -czf "${backup_dir}/media.tar.gz" \
            -C "${PLEX_CONFIG}" \
            Media/ 2>/dev/null || log_warning "Media backup failed or empty"
        
        if [ -f "${backup_dir}/media.tar.gz" ]; then
            local media_size=$(du -h "${backup_dir}/media.tar.gz" | cut -f1)
            log_success "Custom media archived (${media_size})"
        fi
    else
        log_warning "Media directory not found"
    fi
    
    return 0
}

create_manifest() {
    local backup_dir=$1
    
    log_info "Creating backup manifest..."
    
    local plex_version="Unknown"
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        plex_version=$(docker exec "${CONTAINER_NAME}" cat /usr/lib/plexmediaserver/lib/plexmediaserver.so 2>/dev/null | \
            strings | grep "Plex Media Server v" | head -1 || echo "Unknown")
    fi
    
    cat > "${backup_dir}/manifest.txt" <<EOF
Plex Backup Manifest
====================
Backup Date: $(date)
Plex Version: ${plex_version}
Hostname: $(hostname)
Backup Script: $0

Files in backup:
$(ls -lh "${backup_dir}" 2>/dev/null || echo "Directory listing failed")

Database Checksums:
$(md5sum "${backup_dir}"/*.db 2>/dev/null || echo "No database files found")

Configuration Files:
$(ls -la "${backup_dir}"/*.xml 2>/dev/null || echo "No config files found")

Archive Sizes:
$(ls -lh "${backup_dir}"/*.tar.gz 2>/dev/null || echo "No archives found")
EOF
    
    chmod 600 "${backup_dir}/manifest.txt"
    log_success "Manifest created"
    return 0
}

verify_backup() {
    local backup_dir=$1
    
    log_info "Verifying backup integrity..."
    
    local verification_failed=0
    
    if [ ! -f "${backup_dir}/com.plexapp.plugins.library.db" ]; then
        log_error "Main database missing from backup"
        verification_failed=1
    else
        if ! sqlite3 "${backup_dir}/com.plexapp.plugins.library.db" "PRAGMA integrity_check;" >/dev/null 2>&1; then
            log_error "Main database integrity check failed"
            verification_failed=1
        else
            log_success "Main database integrity verified"
        fi
        
        local item_count=$(sqlite3 "${backup_dir}/com.plexapp.plugins.library.db" \
            "SELECT COUNT(*) FROM metadata_items;" 2>/dev/null || echo "0")
        log_info "Database contains ${item_count} metadata items"
    fi
    
    if [ -f "${backup_dir}/com.plexapp.plugins.library.blobs.db" ]; then
        if ! sqlite3 "${backup_dir}/com.plexapp.plugins.library.blobs.db" "PRAGMA integrity_check;" >/dev/null 2>&1; then
            log_warning "Blobs database integrity check failed"
        else
            log_success "Blobs database integrity verified"
        fi
    fi
    
    if [ ! -f "${backup_dir}/Preferences.xml" ]; then
        log_error "Preferences.xml missing from backup"
        verification_failed=1
    else
        log_success "Preferences.xml present"
    fi
    
    if [ "${verification_failed}" -eq 1 ]; then
        log_error "Backup verification failed"
        return 1
    fi
    
    log_success "Backup verification completed successfully"
    return 0
}

cleanup_old_backups() {
    local backup_dir=$1
    local retain_count=$2
    local backup_type=$3
    
    log_info "Cleaning up old ${backup_type} backups (keeping ${retain_count})"
    
    local backup_count=$(find "${backup_dir}" -maxdepth 1 -type d -name "backup_*" 2>/dev/null | wc -l)
    
    if [ "${backup_count}" -gt "${retain_count}" ]; then
        find "${backup_dir}" -maxdepth 1 -type d -name "backup_*" -printf '%T@ %p\n' | \
            sort -rn | tail -n +$((retain_count + 1)) | cut -d' ' -f2- | \
            while read -r dir; do
                log_info "Removing old backup: $(basename ${dir})"
                rm -rf "${dir}"
            done
        log_success "Cleanup completed"
    else
        log_info "No old backups to remove (${backup_count}/${retain_count})"
    fi
}

create_weekly_backup() {
    local day_of_week=$(date +%u)
    
    if [ "${day_of_week}" = "7" ]; then
        log_info "Creating weekly backup snapshot..."
        
        local latest_daily=$(find "${DAILY_DIR}" -maxdepth 1 -type d -name "backup_*" -printf '%T@ %p\n' | \
            sort -rn | head -1 | cut -d' ' -f2- || true)
        
        if [ -n "${latest_daily}" ] && [ -d "${latest_daily}" ]; then
            local weekly_name="backup_$(date +%Y%m%d_%H%M%S)"
            cp -r "${latest_daily}" "${WEEKLY_DIR}/${weekly_name}"
            log_success "Weekly backup created: ${weekly_name}"
            
            cleanup_old_backups "${WEEKLY_DIR}" "${RETAIN_WEEKLY}" "weekly"
        else
            log_warning "No daily backup found to create weekly snapshot"
        fi
    fi
}

get_backup_stats() {
    log_info "=== Backup Statistics ==="
    
    if [ -d "${BACKUP_ROOT}" ]; then
        local total_size=$(du -sh "${BACKUP_ROOT}" 2>/dev/null | cut -f1 || echo "0")
        local daily_count=$(find "${DAILY_DIR}" -maxdepth 1 -type d -name "backup_*" 2>/dev/null | wc -l)
        local weekly_count=$(find "${WEEKLY_DIR}" -maxdepth 1 -type d -name "backup_*" 2>/dev/null | wc -l)
        local latest_daily=$(find "${DAILY_DIR}" -maxdepth 1 -type d -name "backup_*" -printf '%T@ %p\n' 2>/dev/null | \
            sort -rn | head -1 | cut -d' ' -f2- || echo "None")
        
        log_info "Total backup size: ${total_size}"
        log_info "Daily backups: ${daily_count}"
        log_info "Weekly backups: ${weekly_count}"
        log_info "Latest backup: $(basename ${latest_daily})"
    else
        log_warning "Backup directory does not exist"
    fi
    
    log_info "======================="
}

send_notification() {
    local status=$1
    local message=$2
    
    echo "$(date '+%Y-%m-%d %H:%M:%S') ${status^^}: ${message}" >> "${BACKUP_ROOT}/status.txt"
    
    if [ "${status}" = "success" ]; then
        log_success "Notification: ${message}"
    else
        log_error "Notification: ${message}"
    fi
}

main() {
    log_info "========================================="
    log_info "Starting Plex Backup"
    log_info "========================================="
    
    create_backup_dirs
    
    if ! check_disk_space; then
        send_notification "failure" "Insufficient disk space for backup"
        exit 1
    fi
    
    if ! check_container; then
        send_notification "failure" "Plex container not running"
        exit 1
    fi
    
    if ! stop_plex; then
        send_notification "failure" "Failed to stop Plex"
        exit 1
    fi
    
    local backup_dir
    if ! backup_dir=$(backup_database "${DAILY_DIR}"); then
        log_error "Database backup failed"
        start_plex
        send_notification "failure" "Database backup failed"
        exit 1
    fi
    
    if ! backup_configuration "${backup_dir}"; then
        log_warning "Configuration backup failed, but continuing..."
    fi
    
    if [ "${INCLUDE_METADATA}" = "true" ]; then
        backup_metadata "${backup_dir}"
    else
        log_info "Skipping metadata backup (INCLUDE_METADATA=false)"
    fi
    
    create_manifest "${backup_dir}"
    
    if ! start_plex; then
        log_error "Failed to restart Plex after backup"
        send_notification "failure" "Failed to restart Plex after backup"
        exit 1
    fi
    
    if [ "${VERIFY_BACKUP}" = "true" ]; then
        if ! verify_backup "${backup_dir}"; then
            send_notification "failure" "Backup verification failed"
            exit 1
        fi
    fi
    
    cleanup_old_backups "${DAILY_DIR}" "${RETAIN_DAILY}" "daily"
    create_weekly_backup
    get_backup_stats
    
    log_success "========================================="
    log_success "Plex backup completed successfully"
    log_success "Backup location: ${backup_dir}"
    log_success "========================================="
    
    send_notification "success" "Plex backup completed successfully"
    exit 0
}

if [ "$#" -gt 0 ] && [ "$1" = "--verify-only" ]; then
    LATEST_BACKUP=$(find "${DAILY_DIR}" -maxdepth 1 -type d -name "backup_*" -printf '%T@ %p\n' | \
        sort -rn | head -1 | cut -d' ' -f2- || true)
    
    if [ -n "${LATEST_BACKUP}" ] && [ -d "${LATEST_BACKUP}" ]; then
        log_info "Verifying latest backup: $(basename ${LATEST_BACKUP})"
        verify_backup "${LATEST_BACKUP}"
        exit $?
    else
        log_error "No backup found to verify"
        exit 1
    fi
fi

if [ "$#" -gt 0 ] && [ "$1" = "--full" ]; then
    INCLUDE_METADATA=true
    VERIFY_BACKUP=true
fi

main "$@"
