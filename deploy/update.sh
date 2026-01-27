#!/bin/bash
# Nebula Command - Linux Updater
# Updates Nebula Command to the latest version
#
# Usage: ./update.sh [options]
#
# Options:
#   --skip-deps     Skip dependency updates
#   --version TAG   Update to specific version/tag
#   --force         Force update even if already up-to-date

set -euo pipefail

NEBULA_HOME="${NEBULA_HOME:-/opt/nebula-command}"
NEBULA_VERSION="${NEBULA_VERSION:-main}"
SKIP_DEPS=false
FORCE=false

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

show_help() {
    echo -e "${CYAN}${BOLD}Nebula Command Updater${NC}"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --skip-deps     Skip dependency updates during bootstrap"
    echo "  --version TAG   Update to specific version/branch/tag"
    echo "  --force         Force update even if already up-to-date"
    echo "  -h, --help      Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  NEBULA_HOME     Installation directory (default: /opt/nebula-command)"
    echo "  NEBULA_VERSION  Target version (default: main)"
    echo ""
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --skip-deps)
                SKIP_DEPS=true
                shift
                ;;
            --version)
                NEBULA_VERSION="$2"
                shift 2
                ;;
            --force)
                FORCE=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

check_sudo() {
    if [ "$EUID" -ne 0 ]; then
        if command -v sudo &>/dev/null; then
            SUDO="sudo"
        else
            log_error "Please run as root or install sudo"
            exit 1
        fi
    else
        SUDO=""
    fi
}

check_installation() {
    if [ ! -d "$NEBULA_HOME" ]; then
        log_error "Nebula Command not found at $NEBULA_HOME"
        log_info "Run the installer first: curl -fsSL https://raw.githubusercontent.com/yourusername/nebula-command/main/deploy/install.sh | bash"
        exit 1
    fi

    if [ ! -d "$NEBULA_HOME/.git" ]; then
        log_error "$NEBULA_HOME is not a git repository"
        log_info "Please reinstall Nebula Command"
        exit 1
    fi
}

backup_config() {
    local backup_dir="$NEBULA_HOME/backups/pre-update-$(date +%Y%m%d-%H%M%S)"
    
    log_info "Backing up configuration..."
    $SUDO mkdir -p "$backup_dir"
    
    if [ -d "$NEBULA_HOME/config" ]; then
        $SUDO cp -r "$NEBULA_HOME/config" "$backup_dir/" 2>/dev/null || true
    fi
    
    if [ -d "$NEBULA_HOME/state" ]; then
        $SUDO cp -r "$NEBULA_HOME/state" "$backup_dir/" 2>/dev/null || true
    fi
    
    log_success "Backup created at $backup_dir"
}

update_repository() {
    log_info "Updating repository..."
    cd "$NEBULA_HOME"

    local current_commit
    current_commit=$($SUDO git rev-parse HEAD 2>/dev/null || echo "unknown")

    $SUDO git fetch origin

    if [ "$FORCE" != "true" ]; then
        local remote_commit
        remote_commit=$($SUDO git rev-parse "origin/$NEBULA_VERSION" 2>/dev/null || $SUDO git rev-parse "$NEBULA_VERSION" 2>/dev/null || echo "unknown")
        
        if [ "$current_commit" = "$remote_commit" ]; then
            log_success "Already up-to-date (commit: ${current_commit:0:8})"
            exit 0
        fi
    fi

    $SUDO git checkout "$NEBULA_VERSION" 2>/dev/null || true
    $SUDO git reset --hard "origin/$NEBULA_VERSION" 2>/dev/null || $SUDO git reset --hard "$NEBULA_VERSION"

    local new_commit
    new_commit=$($SUDO git rev-parse HEAD 2>/dev/null || echo "unknown")
    
    log_success "Updated from ${current_commit:0:8} to ${new_commit:0:8}"
}

run_bootstrap() {
    local bootstrap_script="$NEBULA_HOME/deploy/unified/bootstrap.sh"

    if [ ! -f "$bootstrap_script" ]; then
        log_warn "Bootstrap script not found, skipping post-update setup"
        return
    fi

    $SUDO chmod +x "$bootstrap_script"

    local bootstrap_args=()
    if [ "$SKIP_DEPS" = "true" ]; then
        bootstrap_args+=("--skip-deps")
    fi

    log_info "Running bootstrap script..."
    $SUDO "$bootstrap_script" "${bootstrap_args[@]}"
}

main() {
    echo -e "${CYAN}${BOLD}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║               Nebula Command - Updater                        ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    parse_args "$@"
    
    log_info "Target version: $NEBULA_VERSION"
    log_info "Install path: $NEBULA_HOME"
    echo ""

    check_sudo
    check_installation
    backup_config
    update_repository
    run_bootstrap

    echo ""
    log_success "Nebula Command update complete!"
    echo ""
}

main "$@"
