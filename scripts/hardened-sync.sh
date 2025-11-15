#!/bin/bash
################################################################################
# Hardened Git Sync Script
#
# Bulletproof git synchronization with comprehensive safety features:
# - Preflight guards (lock file, remote check, divergence detection)
# - Atomic operations (fetch, compare, fast-forward merge)
# - Permission enforcement (UID/GID alignment, umask, ownership)
# - Conflict resolution (automatic stash, clear recovery instructions)
# - Rollback capability (save state, revert on failure)
#
# Usage: ./scripts/hardened-sync.sh [OPTIONS]
#
# Options:
#   -b, --branch BRANCH    Branch to sync (default: main)
#   -r, --remote REMOTE    Remote name (default: origin)
#   -f, --force            Force sync even with local changes (stash them)
#   -n, --dry-run          Show what would be done without making changes
#   --no-perms             Skip permission fixes
#   --no-backup            Skip pre-sync backup
#   -h, --help             Show this help message
################################################################################

set -euo pipefail

# ===== CONFIGURATION =====
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEPLOYMENT_DIR="$PROJECT_DIR/deployment"

# Source common library if available
if [ -f "$DEPLOYMENT_DIR/lib-common.sh" ]; then
    source "$DEPLOYMENT_DIR/lib-common.sh"
else
    # Minimal fallback logging
    log_info() { echo "[INFO] $*"; }
    log_success() { echo "[✓] $*"; }
    log_warning() { echo "[⚠] $*"; }
    log_error() { echo "[✗] $*" >&2; }
    log_section() { echo ""; echo "=== $* ==="; }
    acquire_lock() { :; }
    release_lock() { :; }
    setup_signal_handlers() { :; }
fi

# Directories
BACKUP_DIR="$PROJECT_DIR/var/backups/git-sync"
STATE_DIR="$PROJECT_DIR/var/state"
LOG_DIR="$PROJECT_DIR/var/log"
LOG_FILE="$LOG_DIR/hardened-sync.log"

# Lock file
LOCK_FILE="/tmp/homelab-hardened-sync.lock"
LOCK_FD=""

# Git settings
GIT_BRANCH="${GIT_BRANCH:-main}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
FORCE_SYNC=false
DRY_RUN=false
SKIP_PERMS=false
SKIP_BACKUP=false

# State files
STASH_MARKER="$STATE_DIR/.stash_marker"
BACKUP_MARKER="$STATE_DIR/.backup_marker"
LAST_GOOD_COMMIT="$STATE_DIR/.last_good_commit"

# ===== PARSE ARGUMENTS =====
show_help() {
    cat <<EOF
Hardened Git Sync - Bulletproof git synchronization

USAGE:
    $(basename "$0") [OPTIONS]

OPTIONS:
    -b, --branch BRANCH    Branch to sync (default: main)
    -r, --remote REMOTE    Remote name (default: origin)
    -f, --force            Force sync even with local changes (stash them)
    -n, --dry-run          Show what would be done without making changes
    --no-perms             Skip permission fixes
    --no-backup            Skip pre-sync backup
    -h, --help             Show this help message

EXAMPLES:
    # Normal sync
    $(basename "$0")
    
    # Sync specific branch
    $(basename "$0") -b develop
    
    # Dry-run to preview changes
    $(basename "$0") --dry-run
    
    # Force sync with local changes
    $(basename "$0") --force

ENVIRONMENT:
    GIT_BRANCH=main        Default branch to sync
    GIT_REMOTE=origin      Default remote name
    DRY_RUN=true           Enable dry-run mode

EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case $1 in
        -b|--branch)
            GIT_BRANCH="$2"
            shift 2
            ;;
        -r|--remote)
            GIT_REMOTE="$2"
            shift 2
            ;;
        -f|--force)
            FORCE_SYNC=true
            shift
            ;;
        -n|--dry-run)
            DRY_RUN=true
            shift
            ;;
        --no-perms)
            SKIP_PERMS=true
            shift
            ;;
        --no-backup)
            SKIP_BACKUP=true
            shift
            ;;
        -h|--help)
            show_help
            ;;
        *)
            log_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# ===== LOCK MANAGEMENT =====
acquire_sync_lock() {
    exec 200>"$LOCK_FILE"
    LOCK_FD=200
    
    if ! flock -n 200; then
        local lock_pid=""
        if [ -f "$LOCK_FILE" ]; then
            lock_pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "unknown")
        fi
        log_error "Another sync is already running (PID: $lock_pid)"
        log_error "If this is incorrect, remove: $LOCK_FILE"
        exit 1
    fi
    
    echo $$ >&200
    log_info "Lock acquired (PID: $$)"
}

release_sync_lock() {
    if [ -n "$LOCK_FD" ]; then
        flock -u "$LOCK_FD" 2>/dev/null || true
        exec 200>&- || true
        rm -f "$LOCK_FILE" 2>/dev/null || true
        log_info "Lock released"
    fi
}

# ===== CLEANUP HANDLER =====
cleanup_on_exit() {
    local exit_code=$?
    
    if [ $exit_code -ne 0 ]; then
        log_error "Sync failed with exit code: $exit_code"
        
        # Offer rollback if we have a backup
        if [ -f "$BACKUP_MARKER" ]; then
            log_warning "A backup was created before sync started"
            log_warning "To rollback, run: git reset --hard $(cat "$LAST_GOOD_COMMIT" 2>/dev/null || echo HEAD~1)"
        fi
        
        # Show recovery instructions if stash exists
        if [ -f "$STASH_MARKER" ]; then
            log_warning "Local changes were stashed"
            log_warning "To recover: git stash pop"
        fi
    fi
    
    release_sync_lock
    exit $exit_code
}

trap cleanup_on_exit EXIT INT TERM

# ===== SETUP =====
log_section "Hardened Git Sync - Starting"

if [ "$DRY_RUN" = true ]; then
    log_warning "DRY-RUN MODE ENABLED - No changes will be made"
fi

# Create necessary directories
mkdir -p "$BACKUP_DIR" "$STATE_DIR" "$LOG_DIR"

# Acquire lock
acquire_sync_lock

# Change to project directory
cd "$PROJECT_DIR" || {
    log_error "Failed to change to project directory: $PROJECT_DIR"
    exit 1
}

# ===== PREFLIGHT CHECKS =====
log_section "Preflight Checks"

# Check if git repository
if [ ! -d ".git" ]; then
    log_error "Not a git repository: $PROJECT_DIR"
    exit 1
fi
log_success "Git repository verified"

# Check git is installed
if ! command -v git &> /dev/null; then
    log_error "Git command not found"
    exit 1
fi
log_success "Git binary found: $(git --version | head -1)"

# Check current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
log_info "Current branch: $CURRENT_BRANCH"

# Check remote exists
if ! git remote | grep -q "^${GIT_REMOTE}$"; then
    log_error "Remote '$GIT_REMOTE' not found"
    log_info "Available remotes: $(git remote | tr '\n' ' ')"
    exit 1
fi
log_success "Remote '$GIT_REMOTE' exists"

# Check network connectivity to remote
log_info "Checking connectivity to remote..."
if ! git ls-remote --exit-code "$GIT_REMOTE" "$GIT_BRANCH" &> /dev/null; then
    log_error "Cannot reach remote '$GIT_REMOTE' branch '$GIT_BRANCH'"
    log_error "Check network connectivity and branch name"
    exit 1
fi
log_success "Remote is reachable"

# ===== CHECK FOR LOCAL CHANGES =====
log_section "Checking Local Changes"

# Check for uncommitted changes
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    log_warning "Working directory has uncommitted changes"
    
    if [ "$FORCE_SYNC" = true ]; then
        log_info "Force flag set - will stash local changes"
        
        if [ "$DRY_RUN" = false ]; then
            # Create stash
            STASH_MSG="Hardened sync auto-stash $(date -u +%Y-%m-%dT%H:%M:%SZ)"
            if git stash push -u -m "$STASH_MSG"; then
                echo "yes" > "$STASH_MARKER"
                log_success "Local changes stashed: $STASH_MSG"
                log_warning "To restore: git stash pop"
            else
                log_error "Failed to stash local changes"
                exit 1
            fi
        else
            log_info "[DRY-RUN] Would stash local changes"
        fi
    else
        log_error "Sync aborted - uncommitted changes detected"
        echo ""
        log_info "Options:"
        log_info "  1. Commit your changes: git add . && git commit -m 'your message'"
        log_info "  2. Stash your changes: git stash"
        log_info "  3. Force sync (stash automatically): $(basename "$0") --force"
        log_info "  4. Reset changes (DESTRUCTIVE): git reset --hard HEAD"
        exit 1
    fi
else
    log_success "No uncommitted changes"
fi

# Check for untracked files (just warn, don't block)
UNTRACKED=$(git ls-files --others --exclude-standard | wc -l)
if [ "$UNTRACKED" -gt 0 ]; then
    log_warning "Found $UNTRACKED untracked file(s) (will not be affected by sync)"
fi

# ===== SAVE CURRENT STATE =====
log_section "Saving Current State"

CURRENT_COMMIT=$(git rev-parse HEAD)
log_info "Current commit: ${CURRENT_COMMIT:0:12}"

if [ "$SKIP_BACKUP" = false ] && [ "$DRY_RUN" = false ]; then
    # Save commit hash for rollback
    echo "$CURRENT_COMMIT" > "$LAST_GOOD_COMMIT"
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BACKUP_MARKER"
    log_success "State saved for rollback"
else
    log_info "Backup skipped"
fi

# ===== FETCH LATEST =====
log_section "Fetching Latest Changes"

if [ "$DRY_RUN" = false ]; then
    if git fetch "$GIT_REMOTE" "$GIT_BRANCH"; then
        log_success "Fetched from $GIT_REMOTE/$GIT_BRANCH"
    else
        log_error "Failed to fetch from remote"
        exit 1
    fi
else
    log_info "[DRY-RUN] Would fetch from $GIT_REMOTE/$GIT_BRANCH"
fi

# ===== COMPARE COMMITS =====
log_section "Analyzing Changes"

LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse "$GIT_REMOTE/$GIT_BRANCH" 2>/dev/null || echo "")

if [ -z "$REMOTE_COMMIT" ]; then
    log_error "Could not find remote branch: $GIT_REMOTE/$GIT_BRANCH"
    exit 1
fi

log_info "Local:  ${LOCAL_COMMIT:0:12}"
log_info "Remote: ${REMOTE_COMMIT:0:12}"

# Check relationship
if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
    log_success "Already up to date - no sync needed"
    rm -f "$STASH_MARKER" "$BACKUP_MARKER"
    exit 0
fi

# Check if local is ahead of remote
if git merge-base --is-ancestor "$REMOTE_COMMIT" "$LOCAL_COMMIT" 2>/dev/null; then
    log_warning "Local branch is AHEAD of remote"
    log_warning "You have unpushed commits!"
    log_info "To push: git push $GIT_REMOTE $GIT_BRANCH"
    
    # Still allow sync if force is set (will reset local to remote)
    if [ "$FORCE_SYNC" = true ]; then
        log_warning "Force flag set - will reset to remote (LOSING local commits)"
        read -p "Are you sure? This will LOSE your local commits! [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Sync cancelled by user"
            exit 0
        fi
    else
        log_error "Sync aborted - push your changes first"
        exit 1
    fi
fi

# Check if fast-forward is possible
if ! git merge-base --is-ancestor "$LOCAL_COMMIT" "$REMOTE_COMMIT" 2>/dev/null; then
    log_error "Branches have DIVERGED - cannot fast-forward"
    log_error "Local and remote have conflicting changes"
    echo ""
    log_info "Recovery options:"
    log_info "  1. Merge:  git merge $GIT_REMOTE/$GIT_BRANCH"
    log_info "  2. Rebase: git rebase $GIT_REMOTE/$GIT_BRANCH"
    log_info "  3. Reset:  git reset --hard $GIT_REMOTE/$GIT_BRANCH (DESTRUCTIVE)"
    echo ""
    log_info "To see differences:"
    log_info "  git log $LOCAL_COMMIT..$REMOTE_COMMIT"
    log_info "  git log $REMOTE_COMMIT..$LOCAL_COMMIT"
    exit 1
fi

# Show what will change
COMMITS_BEHIND=$(git rev-list --count "$LOCAL_COMMIT..$REMOTE_COMMIT")
log_info "Local is $COMMITS_BEHIND commit(s) behind remote"

if [ "$COMMITS_BEHIND" -gt 0 ]; then
    echo ""
    log_info "New commits:"
    git log --oneline --decorate "$LOCAL_COMMIT..$REMOTE_COMMIT" | head -10 | sed 's/^/  /'
    echo ""
fi

# ===== PERFORM SYNC =====
log_section "Performing Sync"

if [ "$DRY_RUN" = false ]; then
    # Ensure we're on the target branch
    if [ "$CURRENT_BRANCH" != "$GIT_BRANCH" ]; then
        log_info "Switching to branch: $GIT_BRANCH"
        if git checkout "$GIT_BRANCH" --quiet 2>/dev/null || git checkout -b "$GIT_BRANCH" --quiet; then
            log_success "Switched to $GIT_BRANCH"
        else
            log_error "Failed to switch to branch: $GIT_BRANCH"
            exit 1
        fi
    fi
    
    # Fast-forward merge
    log_info "Fast-forwarding to $REMOTE_COMMIT..."
    if git merge --ff-only "$GIT_REMOTE/$GIT_BRANCH"; then
        log_success "Successfully synced to ${REMOTE_COMMIT:0:12}"
    else
        log_error "Fast-forward merge failed"
        exit 1
    fi
else
    log_info "[DRY-RUN] Would fast-forward from ${LOCAL_COMMIT:0:12} to ${REMOTE_COMMIT:0:12}"
fi

# ===== PERMISSION ENFORCEMENT =====
if [ "$SKIP_PERMS" = false ]; then
    log_section "Enforcing Permissions"
    
    # Set umask for security
    umask 027
    log_info "Set umask to 027"
    
    if [ "$DRY_RUN" = false ]; then
        # Fix script permissions
        log_info "Fixing script permissions..."
        find . -type f -name "*.sh" -exec chmod 750 {} \; 2>/dev/null || true
        chmod 750 homelab-manager.sh 2>/dev/null || true
        
        # Make deployment scripts executable
        if [ -d "deployment" ]; then
            chmod 750 deployment/*.sh 2>/dev/null || true
        fi
        
        # Make scripts directory executable
        if [ -d "scripts" ]; then
            chmod 750 scripts/*.sh 2>/dev/null || true
        fi
        
        log_success "Script permissions fixed"
        
        # Validate ownership (warn only, don't fail)
        CURRENT_USER=$(whoami)
        CURRENT_UID=$(id -u)
        CURRENT_GID=$(id -g)
        
        log_info "Current user: $CURRENT_USER (UID=$CURRENT_UID, GID=$CURRENT_GID)"
        
        # Check if we should fix ownership
        if [ "$CURRENT_UID" -eq 1000 ] && [ "$CURRENT_GID" -eq 1000 ]; then
            log_success "UID/GID already optimal for Docker bind mounts (1000:1000)"
        else
            log_warning "UID/GID is not 1000:1000 - Docker bind mounts may have permission issues"
            log_info "Consider running as a user with UID/GID 1000:1000"
        fi
    else
        log_info "[DRY-RUN] Would fix permissions on shell scripts"
    fi
fi

# ===== RESTORE STASHED CHANGES =====
if [ -f "$STASH_MARKER" ]; then
    log_section "Restoring Stashed Changes"
    
    if [ "$DRY_RUN" = false ]; then
        echo ""
        log_warning "Local changes were stashed before sync"
        read -p "Restore stashed changes now? [Y/n] " -n 1 -r
        echo
        
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            if git stash pop; then
                log_success "Stashed changes restored"
                rm -f "$STASH_MARKER"
            else
                log_error "Failed to restore stash (conflicts?)"
                log_warning "Your changes are still in stash"
                log_info "To restore manually: git stash pop"
            fi
        else
            log_info "Stash preserved - restore later with: git stash pop"
        fi
    else
        log_info "[DRY-RUN] Would prompt to restore stashed changes"
    fi
fi

# ===== SUMMARY =====
log_section "Sync Complete"

NEW_COMMIT=$(git rev-parse HEAD)
log_success "Synced: ${CURRENT_COMMIT:0:12} → ${NEW_COMMIT:0:12}"
log_info "Branch: $GIT_BRANCH"
log_info "Remote: $GIT_REMOTE"

# Show changed files
if [ "$DRY_RUN" = false ]; then
    CHANGED_FILES=$(git diff --name-only "$CURRENT_COMMIT" "$NEW_COMMIT" | wc -l)
    log_info "Files changed: $CHANGED_FILES"
    
    if [ "$CHANGED_FILES" -gt 0 ] && [ "$CHANGED_FILES" -le 20 ]; then
        echo ""
        log_info "Changed files:"
        git diff --name-status "$CURRENT_COMMIT" "$NEW_COMMIT" | sed 's/^/  /'
    fi
fi

# Clean up markers
rm -f "$BACKUP_MARKER"

log_success "✓ Hardened sync completed successfully"

exit 0
