#!/bin/bash
# ======================================================================
# Automatic Rollback System
# Creates snapshots before deployment and restores on failure
# ======================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.unified.yml"
BACKUP_DIR="${PROJECT_DIR}/deployment/backups"
SNAPSHOT_DIR="${BACKUP_DIR}/snapshots"
ROLLBACK_LOG="${PROJECT_DIR}/deployment/rollback.log"

# Ensure directories exist
mkdir -p "$BACKUP_DIR" "$SNAPSHOT_DIR"

# Logging functions
log() {
    echo -e "${GREEN}[✓]${NC} $1" | tee -a "$ROLLBACK_LOG"
}

warn() {
    echo -e "${YELLOW}[⚠]${NC} $1" | tee -a "$ROLLBACK_LOG"
}

error() {
    echo -e "${RED}[✗]${NC} $1" | tee -a "$ROLLBACK_LOG"
}

info() {
    echo -e "${BLUE}[i]${NC} $1" | tee -a "$ROLLBACK_LOG"
}

section() {
    echo "" | tee -a "$ROLLBACK_LOG"
    echo -e "${CYAN}${BOLD}━━━ $1 ━━━${NC}" | tee -a "$ROLLBACK_LOG"
}

# Check if docker-compose is available
if docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    error "Docker Compose not found"
    exit 1
fi

# ===== CREATE SNAPSHOT =====
create_snapshot() {
    local snapshot_name="${1:-snapshot_$(date +%Y%m%d_%H%M%S)}"
    local snapshot_path="${SNAPSHOT_DIR}/${snapshot_name}"
    
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}                                                                ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}        ${BOLD}${BLUE}📸 CREATING DEPLOYMENT SNAPSHOT${NC}                     ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                                ${CYAN}║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    mkdir -p "$snapshot_path"
    echo "=== Snapshot Created at $(date) ===" > "${snapshot_path}/snapshot.log"
    
    section "Container States"
    
    # Save current container states
    if $DOCKER_COMPOSE -f "$COMPOSE_FILE" ps -a --format json > "${snapshot_path}/container_states.json" 2>/dev/null; then
        log "Container states saved"
    else
        # Fallback for older docker-compose versions
        $DOCKER_COMPOSE -f "$COMPOSE_FILE" ps -a > "${snapshot_path}/container_states.txt"
        log "Container states saved (text format)"
    fi
    
    # Save running container IDs and images
    docker ps --filter "name=discord-bot|stream-bot|homelab-dashboard|caddy|postgres|redis|minio" \
        --format "{{.Names}}\t{{.Image}}\t{{.Status}}" > "${snapshot_path}/running_containers.txt"
    log "Running containers list saved"
    
    # Save current docker-compose.yml version
    if [ -f "$COMPOSE_FILE" ]; then
        cp "$COMPOSE_FILE" "${snapshot_path}/docker-compose.unified.yml.backup"
        log "docker-compose.unified.yml backed up"
    fi
    
    # Save current .env file
    if [ -f "${PROJECT_DIR}/.env" ]; then
        cp "${PROJECT_DIR}/.env" "${snapshot_path}/.env.backup"
        log ".env file backed up"
    fi
    
    # Save Git commit hash
    if [ -d "${PROJECT_DIR}/.git" ]; then
        git -C "$PROJECT_DIR" rev-parse HEAD > "${snapshot_path}/git_commit.txt" 2>/dev/null || true
        git -C "$PROJECT_DIR" status --short > "${snapshot_path}/git_status.txt" 2>/dev/null || true
        log "Git state saved"
    fi
    
    section "Database Backups"
    
    # Check if PostgreSQL container is running
    if docker ps --format '{{.Names}}' | grep -q '^discord-bot-db$'; then
        log "PostgreSQL container is running"
        
        # Wait for database to be ready
        info "Waiting for database to be ready..."
        for i in {1..30}; do
            if docker exec discord-bot-db pg_isready -U ticketbot &> /dev/null; then
                log "Database is ready"
                break
            fi
            if [ $i -eq 30 ]; then
                warn "Database not ready after 30 seconds, skipping backup"
                return 1
            fi
            sleep 1
        done
        
        # Backup each database
        for db in ticketbot streambot homelab_jarvis; do
            info "Backing up database: $db"
            if docker exec discord-bot-db pg_dump -U ticketbot -d "$db" -F c -f "/tmp/${db}_backup.dump" 2>/dev/null; then
                docker cp "discord-bot-db:/tmp/${db}_backup.dump" "${snapshot_path}/${db}_backup.dump"
                docker exec discord-bot-db rm "/tmp/${db}_backup.dump"
                log "Database '$db' backed up successfully"
            else
                warn "Could not backup database: $db (may not exist yet)"
            fi
        done
        
        # Backup all PostgreSQL globals (users, roles, etc.)
        if docker exec discord-bot-db pg_dumpall -U ticketbot --globals-only > "${snapshot_path}/postgres_globals.sql" 2>/dev/null; then
            log "PostgreSQL globals backed up"
        fi
        
    else
        warn "PostgreSQL container not running - skipping database backup"
    fi
    
    section "Image Information"
    
    # Save current image digests
    docker images --format "{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.Size}}" | \
        grep -E "(homelab-dashboard|discord-bot|stream-bot|caddy|postgres|redis|minio)" \
        > "${snapshot_path}/image_digests.txt" || true
    log "Image information saved"
    
    # Calculate snapshot size
    SNAPSHOT_SIZE=$(du -sh "$snapshot_path" | cut -f1)
    log "Snapshot size: $SNAPSHOT_SIZE"
    
    # Save snapshot metadata
    cat > "${snapshot_path}/metadata.json" <<EOF
{
  "snapshot_name": "$snapshot_name",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "created_timestamp": $(date +%s),
  "project_dir": "$PROJECT_DIR",
  "snapshot_size": "$SNAPSHOT_SIZE",
  "git_commit": "$(cat ${snapshot_path}/git_commit.txt 2>/dev/null || echo 'unknown')"
}
EOF
    
    echo "" | tee -a "$ROLLBACK_LOG"
    log "Snapshot created successfully: $snapshot_name"
    log "Location: $snapshot_path"
    echo "" | tee -a "$ROLLBACK_LOG"
    
    # Create 'latest' symlink
    ln -sf "$snapshot_path" "${SNAPSHOT_DIR}/latest"
    
    echo "$snapshot_name"
}

# ===== RESTORE FROM SNAPSHOT =====
restore_snapshot() {
    local snapshot_name="${1:-latest}"
    local snapshot_path
    
    if [ "$snapshot_name" = "latest" ]; then
        snapshot_path="${SNAPSHOT_DIR}/latest"
    else
        snapshot_path="${SNAPSHOT_DIR}/${snapshot_name}"
    fi
    
    if [ ! -d "$snapshot_path" ]; then
        error "Snapshot not found: $snapshot_path"
        return 1
    fi
    
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}                                                                ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}        ${BOLD}${YELLOW}🔄 ROLLING BACK TO SNAPSHOT${NC}                        ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                                ${CYAN}║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    info "Rolling back to snapshot: $(basename "$snapshot_path")"
    
    # Load snapshot metadata
    if [ -f "${snapshot_path}/metadata.json" ]; then
        info "Snapshot details:"
        cat "${snapshot_path}/metadata.json" | tee -a "$ROLLBACK_LOG"
    fi
    
    section "Stopping Current Containers"
    
    # Stop all containers
    info "Stopping all services..."
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" down 2>&1 | tee -a "$ROLLBACK_LOG" || warn "Some containers may have already been stopped"
    log "All containers stopped"
    
    section "Restoring Configuration Files"
    
    # Restore docker-compose.yml
    if [ -f "${snapshot_path}/docker-compose.unified.yml.backup" ]; then
        cp "${snapshot_path}/docker-compose.unified.yml.backup" "$COMPOSE_FILE"
        log "docker-compose.unified.yml restored"
    fi
    
    # Restore .env file
    if [ -f "${snapshot_path}/.env.backup" ]; then
        cp "${snapshot_path}/.env.backup" "${PROJECT_DIR}/.env"
        log ".env file restored"
    fi
    
    section "Restoring Databases"
    
    # Start PostgreSQL container first
    info "Starting PostgreSQL container..."
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" up -d discord-bot-db 2>&1 | tee -a "$ROLLBACK_LOG"
    
    # Wait for PostgreSQL to be ready
    info "Waiting for PostgreSQL to be ready..."
    for i in {1..60}; do
        if docker exec discord-bot-db pg_isready -U ticketbot &> /dev/null; then
            log "PostgreSQL is ready"
            break
        fi
        if [ $i -eq 60 ]; then
            error "PostgreSQL did not start in time"
            return 1
        fi
        sleep 1
    done
    
    # Restore PostgreSQL globals first
    if [ -f "${snapshot_path}/postgres_globals.sql" ]; then
        info "Restoring PostgreSQL globals..."
        docker exec -i discord-bot-db psql -U ticketbot -d postgres < "${snapshot_path}/postgres_globals.sql" 2>&1 | tee -a "$ROLLBACK_LOG" || warn "Could not restore globals"
        log "PostgreSQL globals restored"
    fi
    
    # Restore each database
    for db in ticketbot streambot homelab_jarvis; do
        if [ -f "${snapshot_path}/${db}_backup.dump" ]; then
            info "Restoring database: $db"
            
            # Drop existing database and recreate
            docker exec discord-bot-db psql -U ticketbot -d postgres -c "DROP DATABASE IF EXISTS ${db};" 2>&1 | tee -a "$ROLLBACK_LOG" || true
            docker exec discord-bot-db psql -U ticketbot -d postgres -c "CREATE DATABASE ${db};" 2>&1 | tee -a "$ROLLBACK_LOG"
            
            # Restore from dump
            docker cp "${snapshot_path}/${db}_backup.dump" "discord-bot-db:/tmp/${db}_backup.dump"
            docker exec discord-bot-db pg_restore -U ticketbot -d "$db" -F c "/tmp/${db}_backup.dump" 2>&1 | tee -a "$ROLLBACK_LOG" || warn "Some restore warnings (may be normal)"
            docker exec discord-bot-db rm "/tmp/${db}_backup.dump"
            
            log "Database '$db' restored"
        else
            warn "No backup found for database: $db"
        fi
    done
    
    section "Restoring Containers"
    
    # Start all services
    info "Starting all services with restored configuration..."
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" up -d 2>&1 | tee -a "$ROLLBACK_LOG"
    
    # Wait for services to start
    sleep 10
    
    # Check container status
    info "Checking container status..."
    RUNNING=$($DOCKER_COMPOSE -f "$COMPOSE_FILE" ps --filter "status=running" -q | wc -l)
    TOTAL=$($DOCKER_COMPOSE -f "$COMPOSE_FILE" ps -q | wc -l)
    
    echo "" | tee -a "$ROLLBACK_LOG"
    if [ "$RUNNING" -eq "$TOTAL" ]; then
        log "All $TOTAL containers are running!"
    else
        warn "$RUNNING out of $TOTAL containers running"
        info "Some services may still be starting..."
    fi
    
    echo "" | tee -a "$ROLLBACK_LOG"
    log "Rollback completed successfully!"
    log "System restored to snapshot: $(basename "$snapshot_path")"
    echo "" | tee -a "$ROLLBACK_LOG"
}

# ===== LIST SNAPSHOTS =====
list_snapshots() {
    echo ""
    echo -e "${CYAN}${BOLD}━━━ Available Snapshots ━━━${NC}"
    echo ""
    
    if [ ! -d "$SNAPSHOT_DIR" ] || [ -z "$(ls -A "$SNAPSHOT_DIR" 2>/dev/null)" ]; then
        warn "No snapshots found in $SNAPSHOT_DIR"
        return
    fi
    
    # List snapshots with details
    for snapshot in "$SNAPSHOT_DIR"/snapshot_*; do
        if [ -d "$snapshot" ]; then
            local snapshot_name=$(basename "$snapshot")
            local created_date=""
            local size=$(du -sh "$snapshot" 2>/dev/null | cut -f1)
            
            if [ -f "${snapshot}/metadata.json" ]; then
                created_date=$(grep "created_at" "${snapshot}/metadata.json" | cut -d'"' -f4)
            fi
            
            echo -e "${GREEN}●${NC} $snapshot_name"
            echo "  Created: $created_date"
            echo "  Size: $size"
            echo ""
        fi
    done
}

# ===== CLEANUP OLD SNAPSHOTS =====
cleanup_snapshots() {
    local keep_count="${1:-5}"
    
    section "Cleaning Up Old Snapshots"
    
    info "Keeping latest $keep_count snapshots..."
    
    # Get list of snapshots sorted by modification time
    local snapshots=($(ls -t "$SNAPSHOT_DIR"/snapshot_* 2>/dev/null || true))
    local count=0
    
    for snapshot in "${snapshots[@]}"; do
        ((count++))
        if [ $count -gt $keep_count ]; then
            local snapshot_name=$(basename "$snapshot")
            info "Removing old snapshot: $snapshot_name"
            rm -rf "$snapshot"
            log "Removed: $snapshot_name"
        fi
    done
    
    if [ $count -le $keep_count ]; then
        log "No cleanup needed (only $count snapshots exist)"
    fi
}

# ===== VERIFY SNAPSHOT =====
verify_snapshot() {
    local snapshot_name="${1:-latest}"
    local snapshot_path
    
    if [ "$snapshot_name" = "latest" ]; then
        snapshot_path="${SNAPSHOT_DIR}/latest"
    else
        snapshot_path="${SNAPSHOT_DIR}/${snapshot_name}"
    fi
    
    if [ ! -d "$snapshot_path" ]; then
        error "Snapshot not found: $snapshot_path"
        return 1
    fi
    
    echo ""
    section "Verifying Snapshot: $(basename "$snapshot_path")"
    
    local errors=0
    
    # Check required files
    if [ -f "${snapshot_path}/docker-compose.unified.yml.backup" ]; then
        log "docker-compose.unified.yml backup exists"
    else
        error "Missing docker-compose.unified.yml backup"
        ((errors++))
    fi
    
    if [ -f "${snapshot_path}/container_states.json" ] || [ -f "${snapshot_path}/container_states.txt" ]; then
        log "Container states backup exists"
    else
        warn "Missing container states backup"
    fi
    
    # Check database backups
    local db_count=0
    for db in ticketbot streambot homelab_jarvis; do
        if [ -f "${snapshot_path}/${db}_backup.dump" ]; then
            log "Database backup exists: $db"
            ((db_count++))
        fi
    done
    
    if [ $db_count -eq 0 ]; then
        warn "No database backups found"
    else
        log "Found $db_count database backup(s)"
    fi
    
    if [ -f "${snapshot_path}/metadata.json" ]; then
        log "Metadata file exists"
        cat "${snapshot_path}/metadata.json"
    else
        warn "Missing metadata file"
    fi
    
    echo ""
    if [ $errors -eq 0 ]; then
        log "Snapshot verification passed!"
        return 0
    else
        error "Snapshot verification failed with $errors error(s)"
        return 1
    fi
}

# ===== MAIN SCRIPT =====
main() {
    local command="${1:-help}"
    
    echo "=== Rollback Script Started at $(date) ===" >> "$ROLLBACK_LOG"
    
    case "$command" in
        create|snapshot)
            create_snapshot "${2:-}"
            cleanup_snapshots 10
            ;;
        restore|rollback)
            restore_snapshot "${2:-latest}"
            ;;
        list)
            list_snapshots
            ;;
        verify)
            verify_snapshot "${2:-latest}"
            ;;
        cleanup)
            cleanup_snapshots "${2:-5}"
            ;;
        help|*)
            echo ""
            echo -e "${CYAN}${BOLD}Rollback System - Usage:${NC}"
            echo ""
            echo "  $0 create [name]       - Create a new snapshot (default: snapshot_YYYYMMDD_HHMMSS)"
            echo "  $0 restore [name]      - Restore from snapshot (default: latest)"
            echo "  $0 list                - List all available snapshots"
            echo "  $0 verify [name]       - Verify snapshot integrity (default: latest)"
            echo "  $0 cleanup [keep]      - Remove old snapshots, keep N recent (default: 5)"
            echo ""
            echo -e "${YELLOW}Examples:${NC}"
            echo "  $0 create              - Create snapshot with auto-generated name"
            echo "  $0 create pre_upgrade  - Create named snapshot"
            echo "  $0 restore             - Restore latest snapshot"
            echo "  $0 restore snapshot_20231115_120000  - Restore specific snapshot"
            echo ""
            ;;
    esac
    
    echo "=== Rollback Script Completed at $(date) ===" >> "$ROLLBACK_LOG"
}

# Run main function with all arguments
main "$@"
