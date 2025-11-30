#!/bin/bash
set -euo pipefail

echo "================================================"
echo "  Nebula Command - Local Host Bootstrap Script"
echo "  Gaming/Streaming Priority Services"
echo "================================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_DIR="$(dirname "$SCRIPT_DIR")/local"
DEPLOY_DIR="${DEPLOY_DIR:-/home/$USER/contain/HomeLabLocal}"

print_status() { echo -e "\n\033[1;34m==>\033[0m \033[1m$1\033[0m"; }
print_success() { echo -e "\033[1;32m✓\033[0m $1"; }
print_error() { echo -e "\033[1;31m✗\033[0m $1"; }
print_warning() { echo -e "\033[1;33m⚠\033[0m $1"; }

check_docker() {
    print_status "Checking Docker installation..."
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    print_success "Docker is installed: $(docker --version)"
}

check_tailscale() {
    print_status "Checking Tailscale..."
    
    if ! command -v tailscale &> /dev/null; then
        print_warning "Tailscale not installed. Installing..."
        curl -fsSL https://tailscale.com/install.sh | sh
    fi
    
    if tailscale status &> /dev/null; then
        TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "Not connected")
        print_success "Tailscale connected: $TAILSCALE_IP"
    else
        print_warning "Tailscale not connected. Run: sudo tailscale up"
    fi
}

stop_migrated_services() {
    print_status "Stopping services that will run on Linode..."
    
    if [[ -f /home/$USER/contain/HomeLabHub/docker-compose.yml ]]; then
        cd /home/$USER/contain/HomeLabHub
        
        docker compose stop discord-bot stream-bot homelab-dashboard homelab-celery-worker \
            homelab-postgres redis n8n code-server code-server-proxy \
            scarletredjoker-web rig-city-site 2>/dev/null || true
        
        print_success "Cloud services stopped"
    fi
}

create_directories() {
    print_status "Creating local deployment directories..."
    
    mkdir -p "$DEPLOY_DIR"/{services,config,logs}
    mkdir -p "$DEPLOY_DIR/services/plex"/{config,transcode,media}
    mkdir -p "$DEPLOY_DIR/config/homeassistant"
    
    print_success "Directories created at $DEPLOY_DIR"
}

copy_local_config() {
    print_status "Setting up local configuration..."
    
    HOMELAB_HUB="${HOMELAB_HUB:-/home/$USER/contain/HomeLabHub}"
    
    if [[ -d "$HOMELAB_HUB/deploy/local" ]]; then
        cp "$HOMELAB_HUB/deploy/local/docker-compose.yml" "$DEPLOY_DIR/"
        cp "$HOMELAB_HUB/deploy/local/Caddyfile" "$DEPLOY_DIR/"
        print_success "Copied from HomeLabHub repo"
    elif [[ -f "$LOCAL_DIR/docker-compose.yml" ]]; then
        cp "$LOCAL_DIR/docker-compose.yml" "$DEPLOY_DIR/"
        print_success "Copied docker-compose.yml"
        
        if [[ -f "$LOCAL_DIR/Caddyfile" ]]; then
            cp "$LOCAL_DIR/Caddyfile" "$DEPLOY_DIR/"
            print_success "Copied Caddyfile"
        fi
    else
        print_warning "Local config not found. Please copy files manually."
    fi
    
    mkdir -p "$DEPLOY_DIR/services/plex"/{config,transcode,media}
    mkdir -p "$DEPLOY_DIR/config/homeassistant"
    
    if [[ -d "$HOMELAB_HUB/config/homeassistant" ]]; then
        cp -r "$HOMELAB_HUB/config/homeassistant/"* "$DEPLOY_DIR/config/homeassistant/" 2>/dev/null || true
        print_success "Copied Home Assistant config templates"
    fi
}

setup_vnc() {
    print_status "Setting up VNC for remote desktop..."
    
    if ! command -v vncserver &> /dev/null; then
        print_warning "TigerVNC not installed. Installing..."
        sudo apt-get update
        sudo apt-get install -y tigervnc-standalone-server tigervnc-common
    fi
    
    if [[ ! -d /opt/novnc ]]; then
        print_warning "noVNC not installed. Installing..."
        sudo apt-get install -y novnc websockify
        sudo ln -sf /usr/share/novnc /opt/novnc 2>/dev/null || true
    fi
    
    print_success "VNC tools ready"
    
    cat > "$DEPLOY_DIR/start-vnc.sh" << 'VNCSCRIPT'
#!/bin/bash
vncserver -kill :1 2>/dev/null || true
vncserver :1 -geometry 1920x1080 -depth 24
websockify --web=/opt/novnc 6080 localhost:5901 &
echo "VNC started on :1, noVNC available at http://localhost:6080"
VNCSCRIPT
    
    chmod +x "$DEPLOY_DIR/start-vnc.sh"
    print_success "VNC start script created"
}

setup_env_template() {
    print_status "Creating environment template..."
    
    if [[ ! -f "$DEPLOY_DIR/.env" ]]; then
        cat > "$DEPLOY_DIR/.env.template" << 'ENV'
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=your_minio_password

PLEX_CLAIM=claim-xxxx
PLEX_TOKEN=your_plex_token

HOME_ASSISTANT_TOKEN=your_ha_token
ENV
        
        print_warning "Environment template created at $DEPLOY_DIR/.env.template"
        print_warning "Copy to .env and fill in your values!"
    fi
}

create_systemd_service() {
    print_status "Creating systemd service for local homelab..."
    
    sudo tee /etc/systemd/system/homelab-local.service > /dev/null << SERVICE
[Unit]
Description=Homelab Local Services (Plex, Home Assistant, MinIO)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$DEPLOY_DIR
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
User=$USER
Group=docker

[Install]
WantedBy=multi-user.target
SERVICE

    sudo systemctl daemon-reload
    print_success "Systemd service created: homelab-local.service"
}

print_summary() {
    echo ""
    echo "================================================"
    echo "  Local Host Bootstrap Complete!"
    echo "================================================"
    echo ""
    echo "Local services retained:"
    echo "  - Plex Media Server (plex.evindrake.net)"
    echo "  - Home Assistant (home.evindrake.net)"
    echo "  - MinIO Storage (local NAS access)"
    echo "  - VNC Desktop (vnc.evindrake.net)"
    echo ""
    echo "Next steps:"
    echo "  1. cd $DEPLOY_DIR"
    echo "  2. cp .env.template .env && nano .env"
    echo "  3. Run: docker compose up -d"
    echo "  4. Enable auto-start: sudo systemctl enable homelab-local"
    echo ""
    echo "Tailscale IP for Linode config:"
    tailscale ip -4 2>/dev/null || echo "  Run 'tailscale up' first"
    echo ""
    echo "Resources freed for gaming:"
    echo "  - ~6-8 GB RAM"
    echo "  - 4-6 CPU cores"
    echo "  - Network bandwidth for Discord/Twitch webhooks"
    echo ""
}

main() {
    print_status "Starting local host bootstrap..."
    
    check_docker
    check_tailscale
    create_directories
    copy_local_config
    setup_vnc
    setup_env_template
    create_systemd_service
    
    print_summary
}

main "$@"
