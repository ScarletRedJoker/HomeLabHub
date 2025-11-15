#!/bin/bash
# Automated Replit → Ubuntu Sync & Deploy Script
# Uses hardened-sync.sh for bulletproof git synchronization

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SCRIPTS_DIR="$PROJECT_DIR/scripts"
LOG_DIR="$PROJECT_DIR/var/log"
LOG_FILE="$LOG_DIR/replit-sync.log"
STATE_DIR="$PROJECT_DIR/var/state"
LAST_SYNC_FILE="$STATE_DIR/.last_sync_commit"
COMPOSE_FILE="docker-compose.unified.yml"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Ensure log/state directories exist
mkdir -p "$LOG_DIR" "$STATE_DIR"

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$LOG_FILE"
}

abort() {
    error "$1"
    error "Sync aborted. Manual intervention required."
    exit 1
}

log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "Replit → Ubuntu Sync & Deploy"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$PROJECT_DIR" || abort "Failed to change to project directory: $PROJECT_DIR"

# ===== USE HARDENED SYNC =====

if [ -f "$SCRIPTS_DIR/hardened-sync.sh" ]; then
    log "Using hardened-sync.sh for bulletproof git synchronization..."
    echo ""
    
    # Save current commit for comparison
    PREV_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    
    # Run hardened sync
    if bash "$SCRIPTS_DIR/hardened-sync.sh" --force; then
        log "✓ Hardened sync completed successfully"
        
        # Get new commit
        NEW_COMMIT=$(git rev-parse HEAD)
        
        # Save successful sync
        echo "$NEW_COMMIT" > "$LAST_SYNC_FILE"
        
        # Check if anything changed
        if [ "$PREV_COMMIT" = "$NEW_COMMIT" ]; then
            log "No changes - sync complete"
            exit 0
        fi
    else
        abort "Hardened sync failed - check logs above"
    fi
else
    # ===== FALLBACK TO LEGACY SYNC =====
    warn "hardened-sync.sh not found - using legacy sync (not recommended)"
    
    log "Starting preflight checks..."
    
    # Check required binaries
    for cmd in git docker; do
        if ! command -v "$cmd" &> /dev/null; then
            abort "Required command not found: $cmd"
        fi
    done
    
    # Check docker-compose
    if docker compose version &> /dev/null; then
        DOCKER_COMPOSE="docker compose"
    elif command -v docker-compose &> /dev/null; then
        DOCKER_COMPOSE="docker-compose"
    else
        abort "docker-compose or 'docker compose' not found"
    fi
    log "Using: $DOCKER_COMPOSE"
    
    # Check docker daemon
    if ! docker info &> /dev/null; then
        abort "Docker daemon not running"
    fi
    
    # Check compose file
    if [ ! -f "$COMPOSE_FILE" ]; then
        abort "Compose file not found: $COMPOSE_FILE"
    fi
    
    # Check network access
    if ! git ls-remote --exit-code origin main &> /dev/null; then
        abort "Cannot reach git remote 'origin main'"
    fi
    
    log "✓ Preflight checks passed"
    
    # Check for dirty files
    if ! git diff-index --quiet HEAD -- 2>/dev/null; then
        abort "Working directory has uncommitted changes"
    fi
    
    # Fetch latest
    log "Fetching from origin..."
    if ! git fetch origin main; then
        abort "Failed to fetch from origin"
    fi
    
    # Compare commits
    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse origin/main)
    
    if [ "$LOCAL" = "$REMOTE" ]; then
        log "Already up to date"
        exit 0
    fi
    
    # Check if we can fast-forward
    if ! git merge-base --is-ancestor HEAD origin/main; then
        abort "Local branch has diverged from origin/main"
    fi
    
    # Save previous commit
    PREV_COMMIT="$LOCAL"
    
    # Fast-forward sync
    log "Syncing to origin/main (${REMOTE:0:8})..."
    git checkout main --quiet 2>/dev/null || git checkout -b main --quiet
    git reset --hard origin/main
    
    # Fix permissions
    log "Fixing execute permissions..."
    chmod +x deployment/*.sh homelab-manager.sh scripts/*.sh 2>/dev/null || true
    find services -name "*.sh" -type f -exec chmod +x {} \; 2>/dev/null || true
    
    log "✓ Sync complete: ${PREV_COMMIT:0:8} → ${REMOTE:0:8}"
    
    # Save successful sync
    NEW_COMMIT="$REMOTE"
    echo "$NEW_COMMIT" > "$LAST_SYNC_FILE"
fi

# ===== DETERMINE CHANGED SERVICES =====

CHANGED_FILES=$(git diff --name-only "$PREV_COMMIT" HEAD)
log "Changed files:"
echo "$CHANGED_FILES" | sed 's/^/  /' | tee -a "$LOG_FILE"

# Service mapping (directory → compose service name)
declare -A SERVICE_MAP=(
    ["services/dashboard/"]="homelab-dashboard"
    ["services/discord-bot/"]="discord-bot"
    ["services/stream-bot/"]="stream-bot"
    ["services/static-site/"]="static-site"
    ["services/vnc-desktop/"]="vnc-desktop"
    ["Caddyfile"]="caddy"
)

REBUILD_SERVICES=()

for path_pattern in "${!SERVICE_MAP[@]}"; do
    if echo "$CHANGED_FILES" | grep -q "^$path_pattern"; then
        service="${SERVICE_MAP[$path_pattern]}"
        if [[ ! " ${REBUILD_SERVICES[*]} " =~ " ${service} " ]]; then
            REBUILD_SERVICES+=("$service")
        fi
    fi
done

# Check for compose file changes
if echo "$CHANGED_FILES" | grep -q "^$COMPOSE_FILE"; then
    warn "$COMPOSE_FILE changed. Full redeployment recommended."
    log "Run './deployment/deploy-unified.sh' manually for full redeploy."
fi

# ===== REBUILD SERVICES =====

if [ ${#REBUILD_SERVICES[@]} -eq 0 ]; then
    log "No services need rebuilding."
else
    log "Rebuilding ${#REBUILD_SERVICES[@]} service(s): ${REBUILD_SERVICES[*]}"
    
    for service in "${REBUILD_SERVICES[@]}"; do
        log "Rebuilding $service..."
        if $DOCKER_COMPOSE -f "$COMPOSE_FILE" up -d --build --no-deps "$service"; then
            log "✓ $service rebuilt successfully"
        else
            error "Failed to rebuild $service"
        fi
    done
fi

# ===== SUMMARY =====

log "=========================================="
log "Sync Summary:"
log "  Commit: ${PREV_COMMIT:0:8} → ${REMOTE:0:8}"
log "  Files changed: $(echo "$CHANGED_FILES" | wc -l)"
log "  Services rebuilt: ${REBUILD_SERVICES[*]:-none}"
log "=========================================="

# Show current service status
log "Current service status:"
$DOCKER_COMPOSE -f "$COMPOSE_FILE" ps

log "✓ Sync complete"
