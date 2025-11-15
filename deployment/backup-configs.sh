#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"
BACKUP_ROOT="/home/evin/contain/backups/config"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"
LOG_FILE="${BACKUP_ROOT}/backup.log"
RETAIN_COUNT=30

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
    mkdir -p "${BACKUP_DIR}"
    chmod 700 "${BACKUP_ROOT}"
    log_success "Backup directory created: ${BACKUP_DIR}"
}

backup_env_files() {
    log_info "Backing up .env files..."
    
    if [ -f "${PROJECT_ROOT}/.env" ]; then
        openssl enc -aes-256-cbc -salt -pbkdf2 \
            -in "${PROJECT_ROOT}/.env" \
            -out "${BACKUP_DIR}/.env.encrypted" \
            -pass pass:"homelab-backup-$(date +%Y)" 2>/dev/null
        log_success "Encrypted main .env file"
    fi
    
    if [ -f "${PROJECT_ROOT}/services/dashboard/.env" ]; then
        openssl enc -aes-256-cbc -salt -pbkdf2 \
            -in "${PROJECT_ROOT}/services/dashboard/.env" \
            -out "${BACKUP_DIR}/dashboard.env.encrypted" \
            -pass pass:"homelab-backup-$(date +%Y)" 2>/dev/null
        log_success "Encrypted dashboard .env file"
    fi
    
    for service_dir in "${PROJECT_ROOT}/services"/*; do
        if [ -d "${service_dir}" ] && [ -f "${service_dir}/.env" ]; then
            local service_name=$(basename "${service_dir}")
            openssl enc -aes-256-cbc -salt -pbkdf2 \
                -in "${service_dir}/.env" \
                -out "${BACKUP_DIR}/${service_name}.env.encrypted" \
                -pass pass:"homelab-backup-$(date +%Y)" 2>/dev/null
            log_success "Encrypted ${service_name} .env file"
        fi
    done
}

backup_docker_compose() {
    log_info "Backing up Docker Compose configuration..."
    
    if [ -f "${PROJECT_ROOT}/docker-compose.unified.yml" ]; then
        cp "${PROJECT_ROOT}/docker-compose.unified.yml" \
           "${BACKUP_DIR}/docker-compose.unified.yml"
        log_success "Backed up docker-compose.unified.yml"
    fi
    
    if [ -f "${PROJECT_ROOT}/docker-compose.yml" ]; then
        cp "${PROJECT_ROOT}/docker-compose.yml" \
           "${BACKUP_DIR}/docker-compose.yml"
        log_success "Backed up docker-compose.yml"
    fi
}

backup_caddy() {
    log_info "Backing up Caddy configuration..."
    
    if [ -f "${PROJECT_ROOT}/Caddyfile" ]; then
        cp "${PROJECT_ROOT}/Caddyfile" "${BACKUP_DIR}/Caddyfile"
        log_success "Backed up Caddyfile"
    fi
    
    if [ -f "${PROJECT_ROOT}/Caddyfile.backup" ]; then
        cp "${PROJECT_ROOT}/Caddyfile.backup" "${BACKUP_DIR}/Caddyfile.backup"
        log_success "Backed up Caddyfile.backup"
    fi
}

backup_service_configs() {
    log_info "Backing up service configurations..."
    
    local configs_dir="${BACKUP_DIR}/service-configs"
    mkdir -p "${configs_dir}"
    
    if [ -d "${PROJECT_ROOT}/config" ]; then
        cp -r "${PROJECT_ROOT}/config" "${configs_dir}/"
        log_success "Backed up config directory"
    fi
    
    if [ -f "${PROJECT_ROOT}/services/dashboard/config.py" ]; then
        cp "${PROJECT_ROOT}/services/dashboard/config.py" \
           "${configs_dir}/dashboard-config.py"
        log_success "Backed up dashboard config.py"
    fi
}

backup_deployment_scripts() {
    log_info "Backing up deployment scripts..."
    
    local deploy_dir="${BACKUP_DIR}/deployment-scripts"
    mkdir -p "${deploy_dir}"
    
    cp -r "${SCRIPT_DIR}"/*.sh "${deploy_dir}/" 2>/dev/null || true
    log_success "Backed up deployment scripts"
}

create_manifest() {
    log_info "Creating backup manifest..."
    
    local manifest="${BACKUP_DIR}/MANIFEST.txt"
    
    cat > "${manifest}" << EOF
Homelab Configuration Backup
=============================
Backup Date: $(date '+%Y-%m-%d %H:%M:%S')
Backup Directory: ${BACKUP_DIR}

Contents:
---------
EOF
    
    find "${BACKUP_DIR}" -type f -exec ls -lh {} \; | \
        awk '{print $9, "(" $5 ")"}' >> "${manifest}"
    
    echo "" >> "${manifest}"
    echo "Total Size: $(du -sh ${BACKUP_DIR} | cut -f1)" >> "${manifest}"
    
    log_success "Manifest created"
}

compress_backup() {
    log_info "Compressing backup..."
    
    local archive="${BACKUP_ROOT}/config_${TIMESTAMP}.tar.gz"
    
    tar -czf "${archive}" -C "${BACKUP_ROOT}" "$(basename ${BACKUP_DIR})"
    
    rm -rf "${BACKUP_DIR}"
    
    local size=$(du -h "${archive}" | cut -f1)
    log_success "Backup compressed: ${archive} (${size})"
    
    echo "${archive}"
}

cleanup_old_backups() {
    log_info "Cleaning up old configuration backups (keeping ${RETAIN_COUNT})"
    
    local file_count=$(find "${BACKUP_ROOT}" -name "config_*.tar.gz" 2>/dev/null | wc -l)
    
    if [ "${file_count}" -gt "${RETAIN_COUNT}" ]; then
        find "${BACKUP_ROOT}" -name "config_*.tar.gz" -type f -printf '%T@ %p\n' | \
            sort -rn | tail -n +$((RETAIN_COUNT + 1)) | cut -d' ' -f2- | \
            while read -r file; do
                log_info "Removing old backup: $(basename ${file})"
                rm -f "${file}"
            done
        log_success "Cleanup completed"
    else
        log_info "No old backups to remove (${file_count}/${RETAIN_COUNT})"
    fi
}

create_restore_instructions() {
    local archive=$1
    local instructions="${BACKUP_ROOT}/RESTORE_INSTRUCTIONS.txt"
    
    cat > "${instructions}" << 'EOF'
Configuration Backup Restore Instructions
==========================================

To decrypt .env files:
---------------------
openssl enc -aes-256-cbc -d -pbkdf2 \
    -in <encrypted_file> \
    -out <output_file> \
    -pass pass:"homelab-backup-$(date +%Y)"

Example:
openssl enc -aes-256-cbc -d -pbkdf2 \
    -in .env.encrypted \
    -out .env \
    -pass pass:"homelab-backup-2025"

To extract backup:
------------------
tar -xzf config_TIMESTAMP.tar.gz -C /home/evin/contain/backups/config/

Full restore procedure:
-----------------------
1. Extract the backup archive
2. Decrypt all .env files using the command above
3. Copy files back to their original locations:
   - .env → /home/evin/contain/HomeLabHub/.env
   - docker-compose.unified.yml → /home/evin/contain/HomeLabHub/
   - Caddyfile → /home/evin/contain/HomeLabHub/
   - config/ → /home/evin/contain/HomeLabHub/config/
4. Restart services: cd /home/evin/contain/HomeLabHub && docker-compose -f docker-compose.unified.yml restart

For detailed instructions, see BACKUP_RESTORE_GUIDE.md
EOF
    
    log_success "Restore instructions created"
}

main() {
    log_info "========================================="
    log_info "Starting Configuration Backup"
    log_info "========================================="
    
    create_backup_dirs
    backup_env_files
    backup_docker_compose
    backup_caddy
    backup_service_configs
    backup_deployment_scripts
    create_manifest
    
    local archive=$(compress_backup)
    create_restore_instructions "${archive}"
    cleanup_old_backups
    
    log_success "========================================="
    log_success "Configuration backup completed"
    log_success "Archive: ${archive}"
    log_success "========================================="
    
    echo "$(date '+%Y-%m-%d %H:%M:%S') SUCCESS: Configuration backup completed" >> "${BACKUP_ROOT}/status.txt"
}

main "$@"
