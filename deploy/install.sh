#!/bin/bash
# Nebula Command - Linux One-Liner Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/yourusername/nebula-command/main/deploy/install.sh | bash
#   or: ./install.sh [options]
#
# Environment variables:
#   NEBULA_VERSION  - Git branch/tag to install (default: main)
#   NEBULA_HOME     - Installation directory (default: /opt/nebula-command)

set -euo pipefail

NEBULA_VERSION="${NEBULA_VERSION:-main}"
NEBULA_HOME="${NEBULA_HOME:-/opt/nebula-command}"
REPO_URL="${NEBULA_REPO:-https://github.com/nebula-command/nebula-command.git}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}${BOLD}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║           Nebula Command - One-Liner Installer                ║"
echo "║                                                               ║"
echo "║   Automated deployment for AI infrastructure management      ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_sudo() {
    if [ "$EUID" -ne 0 ]; then
        if command -v sudo &>/dev/null; then
            SUDO="sudo"
            log_info "Running with sudo privileges"
        else
            log_error "Please run as root or install sudo"
            exit 1
        fi
    else
        SUDO=""
        log_info "Running as root"
    fi
}

detect_package_manager() {
    if command -v apt-get &>/dev/null; then
        echo "apt"
    elif command -v dnf &>/dev/null; then
        echo "dnf"
    elif command -v yum &>/dev/null; then
        echo "yum"
    elif command -v pacman &>/dev/null; then
        echo "pacman"
    elif command -v zypper &>/dev/null; then
        echo "zypper"
    else
        echo "unknown"
    fi
}

install_git() {
    if command -v git &>/dev/null; then
        log_success "Git is already installed"
        return 0
    fi

    log_info "Installing git..."
    local pm
    pm=$(detect_package_manager)

    case "$pm" in
        apt)
            $SUDO apt-get update -qq
            $SUDO apt-get install -y -qq git
            ;;
        dnf)
            $SUDO dnf install -y -q git
            ;;
        yum)
            $SUDO yum install -y -q git
            ;;
        pacman)
            $SUDO pacman -Sy --noconfirm git
            ;;
        zypper)
            $SUDO zypper install -y -q git
            ;;
        *)
            log_error "Unknown package manager. Please install git manually."
            exit 1
            ;;
    esac

    log_success "Git installed successfully"
}

install_curl() {
    if command -v curl &>/dev/null; then
        return 0
    fi

    log_info "Installing curl..."
    local pm
    pm=$(detect_package_manager)

    case "$pm" in
        apt)
            $SUDO apt-get update -qq
            $SUDO apt-get install -y -qq curl
            ;;
        dnf|yum)
            $SUDO $pm install -y -q curl
            ;;
        pacman)
            $SUDO pacman -Sy --noconfirm curl
            ;;
        zypper)
            $SUDO zypper install -y -q curl
            ;;
    esac
}

clone_or_update_repo() {
    log_info "Setting up Nebula Command at $NEBULA_HOME..."

    if [ -d "$NEBULA_HOME/.git" ]; then
        log_info "Existing installation found, updating..."
        cd "$NEBULA_HOME"
        $SUDO git fetch origin
        $SUDO git checkout "$NEBULA_VERSION"
        $SUDO git reset --hard "origin/$NEBULA_VERSION" 2>/dev/null || $SUDO git reset --hard "$NEBULA_VERSION"
        log_success "Repository updated to $NEBULA_VERSION"
    else
        log_info "Cloning repository..."
        $SUDO mkdir -p "$(dirname "$NEBULA_HOME")"
        $SUDO git clone --branch "$NEBULA_VERSION" --depth 1 "$REPO_URL" "$NEBULA_HOME" || {
            log_warn "Branch $NEBULA_VERSION not found, trying main..."
            $SUDO git clone --depth 1 "$REPO_URL" "$NEBULA_HOME"
        }
        log_success "Repository cloned successfully"
    fi
}

run_bootstrap() {
    local bootstrap_script="$NEBULA_HOME/deploy/unified/bootstrap.sh"

    if [ ! -f "$bootstrap_script" ]; then
        log_error "Bootstrap script not found at $bootstrap_script"
        exit 1
    fi

    log_info "Making bootstrap script executable..."
    $SUDO chmod +x "$bootstrap_script"

    log_info "Running bootstrap script..."
    echo ""
    $SUDO "$bootstrap_script" "$@"
}

main() {
    echo ""
    log_info "Version: $NEBULA_VERSION"
    log_info "Install path: $NEBULA_HOME"
    echo ""

    check_sudo
    install_curl
    install_git
    clone_or_update_repo
    run_bootstrap "$@"

    echo ""
    log_success "Nebula Command installation complete!"
    echo ""
    echo -e "${CYAN}Next steps:${NC}"
    echo "  1. Check the deployment status: $NEBULA_HOME/deploy/unified/status.sh"
    echo "  2. View logs: tail -f $NEBULA_HOME/logs/*.log"
    echo "  3. Update anytime: $NEBULA_HOME/deploy/update.sh"
    echo ""
}

main "$@"
