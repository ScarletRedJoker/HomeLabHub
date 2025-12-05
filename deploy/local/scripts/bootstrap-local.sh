#!/bin/bash
# Local Ubuntu Homelab Bootstrap Script
# Complete setup for Plex, NAS mounts, and Docker services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
DEPLOY_LOCAL="${PROJECT_ROOT}/deploy/local"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${CYAN}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_step() { echo -e "\n${CYAN}━━━ $* ━━━${NC}\n"; }

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root (sudo)"
        exit 1
    fi
}

check_prerequisites() {
    log_step "Checking Prerequisites"
    
    local missing=()
    
    if ! command -v docker &>/dev/null; then
        missing+=("docker")
    fi
    
    if ! command -v docker-compose &>/dev/null && ! docker compose version &>/dev/null; then
        missing+=("docker-compose")
    fi
    
    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing required tools: ${missing[*]}"
        log_info "Install with: sudo apt install docker.io docker-compose"
        exit 1
    fi
    
    log_success "All prerequisites installed"
}

setup_nas() {
    log_step "Setting Up NAS Media Mounts"
    
    if [ -f "${SCRIPT_DIR}/setup-nas-mounts.sh" ]; then
        "${SCRIPT_DIR}/setup-nas-mounts.sh" "$@"
    else
        log_error "NAS setup script not found"
        exit 1
    fi
}

setup_env() {
    log_step "Setting Up Environment"
    
    cd "${DEPLOY_LOCAL}"
    
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env
            log_info "Created .env from template"
            
            MINIO_PASSWORD=$(openssl rand -base64 24)
            sed -i "s/your_secure_minio_password_here/$MINIO_PASSWORD/" .env 2>/dev/null || true
            
            log_success "Generated secure passwords"
        else
            log_warn "No .env.example found, creating minimal .env"
            local minio_pass=$(openssl rand -base64 24)
            cat > .env << EOF
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=${minio_pass}
TZ=America/New_York
EOF
            log_info "Generated MinIO password: ${minio_pass:0:8}..."
        fi
    else
        log_info ".env already exists"
    fi
}

start_docker_services() {
    log_step "Starting Docker Services"
    
    cd "${DEPLOY_LOCAL}"
    
    log_info "Pulling latest images..."
    docker compose pull
    
    log_info "Starting containers..."
    docker compose up -d
    
    log_success "Docker services started"
}

check_plex() {
    log_step "Checking Plex Media Server"
    
    if systemctl is-active --quiet plexmediaserver 2>/dev/null; then
        log_success "Plex is running (native)"
    elif pgrep -x "Plex Media Server" &>/dev/null; then
        log_success "Plex is running"
    else
        log_warn "Plex is not running"
        log_info "Start with: sudo systemctl start plexmediaserver"
    fi
    
    if curl -sf http://localhost:32400/identity &>/dev/null; then
        log_success "Plex API is responding"
    else
        log_warn "Plex API not responding yet"
    fi
}

verify_services() {
    log_step "Verifying Services"
    
    echo "Docker containers:"
    docker compose -f "${DEPLOY_LOCAL}/docker-compose.yml" ps 2>/dev/null || true
    
    echo ""
    echo "Service health:"
    
    if curl -sf http://localhost:9000/minio/health/live &>/dev/null; then
        log_success "MinIO is healthy"
    else
        log_warn "MinIO is not responding"
    fi
    
    if curl -sf http://localhost:8123/ &>/dev/null; then
        log_success "Home Assistant is healthy"
    else
        log_warn "Home Assistant is not responding"
    fi
    
    "${SCRIPT_DIR}/check-nas-health.sh" 2>/dev/null || true
}

show_summary() {
    log_step "Setup Complete"
    
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Local Homelab is Ready!"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "  Services:"
    echo "    Plex:           http://localhost:32400/web"
    echo "    MinIO Console:  http://localhost:9001"
    echo "    Home Assistant: http://localhost:8123"
    echo ""
    echo "  NAS Media Paths (add to Plex):"
    echo "    Video:  /mnt/nas/video"
    echo "    Music:  /mnt/nas/music"
    echo "    Photos: /mnt/nas/photo"
    echo ""
    echo "  Useful Commands:"
    echo "    Check NAS:       ./scripts/check-nas-health.sh"
    echo "    Remount NAS:     sudo ./scripts/setup-nas-mounts.sh"
    echo "    Docker logs:     docker compose logs -f"
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
}

main() {
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Local Ubuntu Homelab Bootstrap"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    
    check_root
    check_prerequisites
    setup_nas "$@"
    setup_env
    start_docker_services
    
    sleep 10
    
    check_plex
    verify_services
    show_summary
}

case "${1:-}" in
    --help)
        echo "Usage: sudo $0 [NAS_OPTIONS]"
        echo ""
        echo "Bootstrap the local Ubuntu homelab server with NAS mounts and Docker services."
        echo ""
        echo "NAS Options (passed to setup-nas-mounts.sh):"
        echo "  --nas-ip=IP       Specify NAS IP address"
        echo "  --nas-host=HOST   Specify NAS hostname (default: NAS326.local)"
        echo ""
        echo "Examples:"
        echo "  sudo $0                           # Auto-detect everything"
        echo "  sudo $0 --nas-ip=192.168.0.100   # Use specific NAS IP"
        ;;
    *)
        main "$@"
        ;;
esac
