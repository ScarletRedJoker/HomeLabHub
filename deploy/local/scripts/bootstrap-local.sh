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
    
    local nas_args=()
    local auto_discover=true
    
    # Check if user provided NAS IP/host
    for arg in "$@"; do
        case $arg in
            --nas-ip=*|--nas-host=*|--nfs-share=*|--smb-share=*)
                auto_discover=false
                nas_args+=("$arg")
                ;;
            --skip-nas)
                log_info "Skipping NAS setup (--skip-nas)"
                return 0
                ;;
        esac
    done
    
    # Auto-discover NAS if no explicit config provided
    if [ "$auto_discover" = true ]; then
        log_info "No NAS configuration provided, running auto-discovery..."
        
        if [ -f "${SCRIPT_DIR}/discover-nas.sh" ]; then
            # Run discovery and capture results
            "${SCRIPT_DIR}/discover-nas.sh" --auto-mount && return 0
            
            # If auto-mount failed, show manual options
            log_warn "Auto-discovery couldn't mount NAS automatically"
            log_info "You can:"
            log_info "  1. Run discovery manually: sudo ./discover-nas.sh"
            log_info "  2. Specify NAS directly: sudo ./bootstrap-local.sh --nas-ip=192.168.x.x"
            log_info "  3. Skip NAS setup: sudo ./bootstrap-local.sh --skip-nas"
            echo ""
            read -p "Continue without NAS? [y/N]: " response
            if [[ ! "$response" =~ ^[Yy]$ ]]; then
                exit 1
            fi
            return 0
        fi
    fi
    
    # Use setup-nas-mounts.sh with provided args
    if [ -f "${SCRIPT_DIR}/setup-nas-mounts.sh" ]; then
        "${SCRIPT_DIR}/setup-nas-mounts.sh" "${nas_args[@]}"
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
    
    # Clean up any conflicting containers
    log_info "Cleaning up old containers..."
    docker stop homelab-minio homeassistant caddy-local plex-server 2>/dev/null || true
    docker rm homelab-minio homeassistant caddy-local plex-server 2>/dev/null || true
    
    log_info "Pulling latest images..."
    docker compose pull
    
    log_info "Starting local containers (MinIO, Home Assistant, Caddy)..."
    docker compose up -d --remove-orphans
    
    log_success "Local Docker services started"
}

start_plex() {
    log_step "Starting Plex Media Server"
    
    local plex_dir="${PROJECT_ROOT}/services/plex"
    
    if [ ! -f "${plex_dir}/docker-compose.yml" ]; then
        log_warn "Plex docker-compose not found at ${plex_dir}"
        return 1
    fi
    
    cd "${plex_dir}"
    
    # Create .env if it doesn't exist
    if [ ! -f ".env" ]; then
        log_info "Creating Plex .env file..."
        cat > .env << 'EOF'
# Get claim token from https://www.plex.tv/claim/ (valid for 4 minutes)
# Only needed for initial setup, can be removed after
PLEX_CLAIM_TOKEN=
EOF
    fi
    
    # Stop existing container if running
    docker stop plex 2>/dev/null || true
    docker rm plex 2>/dev/null || true
    
    log_info "Starting Plex with NAS mounts..."
    docker compose up -d plex
    
    # Verify NAS is accessible
    sleep 5
    if docker exec plex ls /nas/video &>/dev/null; then
        log_success "Plex started with NAS media accessible"
        log_info "NAS video contents:"
        docker exec plex ls /nas/video
    else
        log_warn "Plex started but NAS may not be accessible"
    fi
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
    echo "  Plex Library Paths (INSIDE container):"
    echo "    Movies:    /nas/video/Movies"
    echo "    TV Shows:  /nas/video/Shows"  
    echo "    Music:     /nas/music"
    echo "    Photos:    /nas/photo"
    echo ""
    echo "  IMPORTANT: In Plex, add libraries using /nas/... paths, NOT /mnt/nas/..."
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
    start_plex
    
    sleep 10
    
    check_plex
    verify_services
    show_summary
}

case "${1:-}" in
    --help|-h)
        echo "Usage: sudo $0 [OPTIONS]"
        echo ""
        echo "Bootstrap the local Ubuntu homelab server with NAS mounts and Docker services."
        echo ""
        echo "By default, the script will automatically discover NAS devices on your network"
        echo "and configure the best available share for media access."
        echo ""
        echo "Options:"
        echo "  --nas-ip=IP       Specify NAS IP address (skips auto-discovery)"
        echo "  --nas-host=HOST   Specify NAS hostname (default: NAS326.local)"
        echo "  --nfs-share=PATH  Specify NFS export path (e.g., /nfs/networkshare)"
        echo "  --smb-share=NAME  Specify SMB share name (e.g., media)"
        echo "  --skip-nas        Skip NAS setup entirely"
        echo "  --help, -h        Show this help message"
        echo ""
        echo "Auto-Discovery Features:"
        echo "  - Scans for NAS devices via mDNS/Bonjour (.local hostnames)"
        echo "  - Probes network for NFS (port 2049) and SMB (port 445) servers"
        echo "  - Automatically detects available shares"
        echo "  - Selects and mounts the best media share"
        echo ""
        echo "Examples:"
        echo "  sudo $0                             # Auto-discover and configure NAS"
        echo "  sudo $0 --nas-ip=192.168.0.100     # Use specific NAS IP"
        echo "  sudo $0 --skip-nas                  # Setup without NAS"
        echo ""
        echo "Standalone NAS Commands:"
        echo "  sudo ./discover-nas.sh              # Scan network for NAS devices"
        echo "  sudo ./discover-nas.sh --json       # Output discovery as JSON"
        echo "  sudo ./setup-nas-mounts.sh --status # Check current mount status"
        ;;
    *)
        main "$@"
        ;;
esac
