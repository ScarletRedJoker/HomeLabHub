#!/bin/bash
# Nebula Command - Linux Uninstaller
# Removes Nebula Command and optionally all associated data
#
# Usage: ./uninstall.sh [options]
#
# Options:
#   --yes           Skip confirmation prompts
#   --keep-data     Keep configuration and data files
#   --keep-services Keep installed services (Ollama, etc.)

set -euo pipefail

NEBULA_HOME="${NEBULA_HOME:-/opt/nebula-command}"
CONFIRM=false
KEEP_DATA=false
KEEP_SERVICES=false

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
    echo -e "${CYAN}${BOLD}Nebula Command Uninstaller${NC}"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --yes           Skip confirmation prompts"
    echo "  --keep-data     Keep configuration and data files"
    echo "  --keep-services Keep installed services (Ollama, ComfyUI, etc.)"
    echo "  -h, --help      Show this help message"
    echo ""
    echo "This will remove:"
    echo "  - Nebula Command installation at $NEBULA_HOME"
    echo "  - Systemd services (nebula-*)"
    echo "  - Cron jobs"
    echo ""
    echo "Optionally removes (unless --keep-services):"
    echo "  - Ollama"
    echo "  - ComfyUI"
    echo "  - Stable Diffusion WebUI"
    echo ""
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --yes|-y)
                CONFIRM=true
                shift
                ;;
            --keep-data)
                KEEP_DATA=true
                shift
                ;;
            --keep-services)
                KEEP_SERVICES=true
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

confirm_uninstall() {
    if [ "$CONFIRM" = "true" ]; then
        return 0
    fi

    echo -e "${YELLOW}${BOLD}WARNING: This will uninstall Nebula Command${NC}"
    echo ""
    echo "The following will be removed:"
    echo "  - Installation directory: $NEBULA_HOME"
    echo "  - Systemd services: nebula-*"
    echo "  - Scheduled tasks and cron jobs"
    
    if [ "$KEEP_DATA" != "true" ]; then
        echo "  - Configuration and state data"
    fi
    
    if [ "$KEEP_SERVICES" != "true" ]; then
        echo "  - Ollama (if installed by Nebula)"
        echo "  - ComfyUI (if installed by Nebula)"
    fi
    
    echo ""
    read -r -p "Are you sure you want to continue? [y/N]: " response
    
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        log_info "Uninstallation cancelled"
        exit 0
    fi
}

stop_services() {
    log_info "Stopping Nebula Command services..."

    local services
    services=$(systemctl list-units --type=service --all 2>/dev/null | grep "nebula-" | awk '{print $1}' || true)

    for service in $services; do
        log_info "Stopping $service..."
        $SUDO systemctl stop "$service" 2>/dev/null || true
        $SUDO systemctl disable "$service" 2>/dev/null || true
    done

    log_success "Services stopped"
}

remove_systemd_services() {
    log_info "Removing systemd service files..."

    local service_files
    service_files=$(find /etc/systemd/system -name "nebula-*.service" 2>/dev/null || true)

    for service_file in $service_files; do
        log_info "Removing $service_file..."
        $SUDO rm -f "$service_file"
    done

    $SUDO systemctl daemon-reload 2>/dev/null || true

    log_success "Systemd services removed"
}

remove_cron_jobs() {
    log_info "Removing cron jobs..."

    if [ -f /etc/cron.d/nebula-command ]; then
        $SUDO rm -f /etc/cron.d/nebula-command
    fi

    if crontab -l 2>/dev/null | grep -q "nebula"; then
        crontab -l 2>/dev/null | grep -v "nebula" | crontab - 2>/dev/null || true
    fi

    log_success "Cron jobs removed"
}

remove_installation() {
    if [ ! -d "$NEBULA_HOME" ]; then
        log_warn "Installation directory not found: $NEBULA_HOME"
        return
    fi

    if [ "$KEEP_DATA" = "true" ]; then
        log_info "Backing up data before removal..."
        local backup_dir="/tmp/nebula-backup-$(date +%Y%m%d-%H%M%S)"
        mkdir -p "$backup_dir"
        
        [ -d "$NEBULA_HOME/config" ] && cp -r "$NEBULA_HOME/config" "$backup_dir/" 2>/dev/null || true
        [ -d "$NEBULA_HOME/state" ] && cp -r "$NEBULA_HOME/state" "$backup_dir/" 2>/dev/null || true
        [ -d "$NEBULA_HOME/backups" ] && cp -r "$NEBULA_HOME/backups" "$backup_dir/" 2>/dev/null || true
        
        log_success "Data backed up to $backup_dir"
    fi

    log_info "Removing installation directory..."
    $SUDO rm -rf "$NEBULA_HOME"
    
    log_success "Installation directory removed"
}

remove_optional_services() {
    if [ "$KEEP_SERVICES" = "true" ]; then
        log_info "Keeping optional services as requested"
        return
    fi

    echo ""
    read -r -p "Remove Ollama? [y/N]: " remove_ollama
    if [[ "$remove_ollama" =~ ^[Yy]$ ]]; then
        log_info "Removing Ollama..."
        $SUDO systemctl stop ollama 2>/dev/null || true
        $SUDO systemctl disable ollama 2>/dev/null || true
        $SUDO rm -f /usr/local/bin/ollama
        $SUDO rm -rf /usr/share/ollama
        $SUDO rm -rf "$HOME/.ollama"
        log_success "Ollama removed"
    fi

    if [ -d /opt/ComfyUI ] || [ -d "$HOME/ComfyUI" ]; then
        read -r -p "Remove ComfyUI? [y/N]: " remove_comfyui
        if [[ "$remove_comfyui" =~ ^[Yy]$ ]]; then
            log_info "Removing ComfyUI..."
            $SUDO rm -rf /opt/ComfyUI
            rm -rf "$HOME/ComfyUI"
            log_success "ComfyUI removed"
        fi
    fi

    if [ -d /opt/stable-diffusion-webui ] || [ -d "$HOME/stable-diffusion-webui" ]; then
        read -r -p "Remove Stable Diffusion WebUI? [y/N]: " remove_sd
        if [[ "$remove_sd" =~ ^[Yy]$ ]]; then
            log_info "Removing Stable Diffusion WebUI..."
            $SUDO rm -rf /opt/stable-diffusion-webui
            rm -rf "$HOME/stable-diffusion-webui"
            log_success "Stable Diffusion WebUI removed"
        fi
    fi
}

cleanup() {
    log_info "Cleaning up..."

    $SUDO rm -rf /var/log/nebula-command 2>/dev/null || true
    $SUDO rm -rf /tmp/nebula-* 2>/dev/null || true

    if id -u nebula &>/dev/null; then
        read -r -p "Remove 'nebula' system user? [y/N]: " remove_user
        if [[ "$remove_user" =~ ^[Yy]$ ]]; then
            $SUDO userdel -r nebula 2>/dev/null || true
            log_success "User 'nebula' removed"
        fi
    fi

    log_success "Cleanup complete"
}

main() {
    echo -e "${RED}${BOLD}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║               Nebula Command - Uninstaller                    ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    parse_args "$@"
    check_sudo
    confirm_uninstall

    echo ""
    log_info "Starting uninstallation..."
    echo ""

    stop_services
    remove_systemd_services
    remove_cron_jobs
    remove_installation
    remove_optional_services
    cleanup

    echo ""
    log_success "Nebula Command has been uninstalled"
    echo ""
    echo -e "${CYAN}Thank you for using Nebula Command!${NC}"
    echo ""
}

main "$@"
