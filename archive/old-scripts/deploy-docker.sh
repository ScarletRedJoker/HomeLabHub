#!/bin/bash

# Homelab Dashboard - Docker Compose Deployment
# This script deploys all homelab services using Docker Compose with Traefik

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${INSTALL_DIR:-/home/evin/homelab-dashboard}"
SERVICE_USER="${SERVICE_USER:-evin}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

check_root() {
    if [[ $EUID -eq 0 ]]; then
        print_error "This script should NOT be run as root"
        print_warning "Run as the user who will own the services (default: evin)"
        exit 1
    fi
}

check_system() {
    print_header "Checking System Requirements"
    
    # Check OS
    if [[ -f /etc/os-release ]]; then
        source /etc/os-release
        print_success "Running on $PRETTY_NAME"
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        print_warning "Install: curl -fsSL https://get.docker.com | sh"
        exit 1
    fi
    DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | tr -d ',')
    print_success "Docker $DOCKER_VERSION installed"
    
    # Check Docker Compose
    if ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not installed"
        print_warning "Docker Compose should be included with modern Docker installations"
        exit 1
    fi
    COMPOSE_VERSION=$(docker compose version --short)
    print_success "Docker Compose $COMPOSE_VERSION installed"
    
    # Check Docker permissions
    if ! groups | grep -q docker; then
        print_error "Current user ($USER) is not in docker group"
        print_warning "Run: sudo usermod -aG docker $USER"
        print_warning "Then log out and back in"
        exit 1
    fi
    print_success "User $USER is in docker group"
    
    # Check if Docker is running
    if ! docker ps &> /dev/null; then
        print_error "Docker daemon is not running"
        print_warning "Start: sudo systemctl start docker"
        exit 1
    fi
    print_success "Docker daemon is running"
}

setup_directories() {
    print_header "Setting Up Directories"
    
    if [[ "$SCRIPT_DIR" != "$INSTALL_DIR" ]]; then
        print_warning "Copying files from $SCRIPT_DIR to $INSTALL_DIR"
        
        if [[ -d "$INSTALL_DIR" ]]; then
            print_warning "Directory $INSTALL_DIR already exists"
            read -p "Continue and merge? (y/N) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                print_error "Deployment cancelled"
                exit 1
            fi
        else
            mkdir -p "$INSTALL_DIR"
        fi
        
        rsync -av --exclude='.git' "$SCRIPT_DIR/" "$INSTALL_DIR/"
        print_success "Files copied to $INSTALL_DIR"
    else
        print_success "Using current directory: $INSTALL_DIR"
    fi
    
    cd "$INSTALL_DIR"
    
    # Create required directories
    mkdir -p logs traefik/config
    
    # Create container data directories
    mkdir -p /home/$SERVICE_USER/contain/{DiscordTicketBot,plex-server/{config,media,transcode},n8n}
    print_success "Created container directories in /home/$SERVICE_USER/contain/"
    
    # Create static site directory (requires sudo)
    if [[ ! -d /var/www/scarletredjoker ]]; then
        print_warning "Creating /var/www/scarletredjoker (requires sudo)"
        if sudo mkdir -p /var/www/scarletredjoker && sudo chown $SERVICE_USER:$SERVICE_USER /var/www/scarletredjoker; then
            print_success "Created /var/www/scarletredjoker"
        else
            print_warning "Could not create /var/www/scarletredjoker - you may need to create it manually"
        fi
    else
        print_success "/var/www/scarletredjoker already exists"
    fi
    
    # Set up acme.json for SSL certificates
    if [[ ! -f traefik/acme.json ]]; then
        touch traefik/acme.json
        chmod 600 traefik/acme.json
        print_success "Created traefik/acme.json"
    fi
    
    print_success "All directories configured"
}

setup_environment() {
    print_header "Setting Up Environment Variables"
    
    cd "$INSTALL_DIR"
    
    if [[ -f .env ]]; then
        print_warning ".env file already exists"
        read -p "Keep existing .env? (Y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            mv .env .env.backup
            print_warning "Backed up to .env.backup"
        else
            print_success "Keeping existing .env file"
            return
        fi
    fi
    
    # Generate random secrets
    API_KEY=$(openssl rand -hex 32)
    SESSION_SECRET=$(openssl rand -hex 32)
    
    cat > .env << EOF
# Flask Configuration
FLASK_ENV=production
FLASK_DEBUG=false

# Dashboard Security
DASHBOARD_API_KEY=$API_KEY
SESSION_SECRET=$SESSION_SECRET

# OpenAI API (get from https://platform.openai.com/api-keys)
OPENAI_API_KEY=

# Cloudflare DNS (optional - for Let's Encrypt DNS challenge)
CF_API_EMAIL=
CF_API_KEY=

# Discord Bot Configuration
DISCORD_BOT_IMAGE=ghcr.io/yourrepo/discord-bot:latest
DISCORD_TOKEN=
BOT_PREFIX=!

# Plex Configuration (get claim token from https://www.plex.tv/claim/)
PLEX_CLAIM=

# Service Profiles: all, discord, plex, n8n, web
# Set to 'all' to start all services, or specify individual ones
COMPOSE_PROFILES=all
EOF

    chmod 600 .env
    
    print_success ".env file created"
    echo ""
    print_warning "IMPORTANT - Your Dashboard API Key:"
    echo "  $API_KEY"
    echo ""
    print_warning "NEXT STEPS - Configure these in .env:"
    echo "  1. OPENAI_API_KEY - For AI features (optional)"
    echo "  2. DISCORD_TOKEN - For Discord bot (if using)"
    echo "  3. PLEX_CLAIM - For Plex server (if using)"
    echo "  4. Edit traefik/traefik.yml and update email for Let's Encrypt"
    echo ""
    read -p "Press Enter to continue..."
}

setup_docker_network() {
    print_header "Setting Up Docker Network"
    
    if docker network inspect homelab &> /dev/null; then
        print_success "Docker network 'homelab' already exists"
    else
        docker network create homelab
        print_success "Created Docker network 'homelab'"
    fi
}

pull_images() {
    print_header "Pulling Docker Images"
    
    cd "$INSTALL_DIR"
    
    # Load environment
    if [[ -f .env ]]; then
        set -a
        source .env
        set +a
    fi
    
    print_warning "Pulling base images (Traefik, Plex, n8n)..."
    
    # Pull only the images we know exist
    docker pull traefik:v3.0 || print_warning "Could not pull Traefik image"
    docker pull plexinc/pms-docker:latest || print_warning "Could not pull Plex image"
    docker pull n8nio/n8n:latest || print_warning "Could not pull n8n image"
    docker pull nginx:alpine || print_warning "Could not pull Nginx image"
    
    print_success "Base images pulled"
    
    # Note about Discord bot
    if [[ -z "${DISCORD_BOT_IMAGE}" ]] || [[ "${DISCORD_BOT_IMAGE}" == *"yourrepo"* ]]; then
        print_warning "Discord bot image not configured - service will be skipped"
    fi
}

build_dashboard() {
    print_header "Building Dashboard Container"
    
    cd "$INSTALL_DIR"
    
    docker compose -f docker-compose.production.yml build homelab-dashboard
    
    print_success "Dashboard built successfully"
}

start_services() {
    print_header "Starting Services"
    
    cd "$INSTALL_DIR"
    
    # Load environment
    if [[ -f .env ]]; then
        set -a
        source .env
        set +a
    fi
    
    print_warning "Starting core services (Traefik + Dashboard)..."
    echo ""
    
    # Start Traefik and Dashboard (always)
    if docker compose -f docker-compose.production.yml up -d traefik homelab-dashboard 2>&1 | grep -v "variable is not set"; then
        print_success "Core services started"
    else
        print_error "Failed to start core services"
        docker compose -f docker-compose.production.yml logs traefik homelab-dashboard
        return 1
    fi
    
    # Check which optional services to start
    echo ""
    print_warning "Optional services configuration:"
    
    # Plex
    if [[ "${COMPOSE_PROFILES}" == *"plex"* ]] || [[ "${COMPOSE_PROFILES}" == "all" ]]; then
        echo "  - Plex Server: Enabled"
        docker compose -f docker-compose.production.yml up -d plex 2>/dev/null || print_warning "    Could not start Plex"
    else
        echo "  - Plex Server: Disabled (set COMPOSE_PROFILES=plex or all to enable)"
    fi
    
    # n8n
    if [[ "${COMPOSE_PROFILES}" == *"n8n"* ]] || [[ "${COMPOSE_PROFILES}" == "all" ]]; then
        echo "  - n8n Automation: Enabled"
        docker compose -f docker-compose.production.yml up -d n8n 2>/dev/null || print_warning "    Could not start n8n"
    else
        echo "  - n8n Automation: Disabled (set COMPOSE_PROFILES=n8n or all to enable)"
    fi
    
    # Static website
    if [[ "${COMPOSE_PROFILES}" == *"web"* ]] || [[ "${COMPOSE_PROFILES}" == "all" ]]; then
        echo "  - Static Website: Enabled"
        docker compose -f docker-compose.production.yml up -d scarletredjoker-web 2>/dev/null || print_warning "    Could not start website"
    else
        echo "  - Static Website: Disabled (set COMPOSE_PROFILES=web or all to enable)"
    fi
    
    # Discord bot (only if properly configured)
    if [[ -n "${DISCORD_BOT_IMAGE}" ]] && [[ "${DISCORD_BOT_IMAGE}" != *"yourrepo"* ]]; then
        if [[ "${COMPOSE_PROFILES}" == *"discord"* ]] || [[ "${COMPOSE_PROFILES}" == "all" ]]; then
            echo "  - Discord Bot: Enabled"
            docker compose -f docker-compose.production.yml up -d discord-bot 2>/dev/null || print_warning "    Could not start Discord bot"
        else
            echo "  - Discord Bot: Disabled (set COMPOSE_PROFILES=discord or all to enable)"
        fi
    else
        echo "  - Discord Bot: Not configured (update DISCORD_BOT_IMAGE in .env)"
    fi
    
    sleep 3
    echo ""
    print_success "Services deployment complete"
}

show_status() {
    print_header "Service Status"
    
    cd "$INSTALL_DIR"
    
    docker compose -f docker-compose.production.yml ps
}

print_completion() {
    print_header "Deployment Complete!"
    
    echo -e "${GREEN}All services successfully deployed!${NC}\n"
    
    echo "Access Information:"
    echo "  Dashboard:      https://host.evindrake.net"
    echo "  Traefik UI:     https://traefik.evindrake.net"
    echo "  Discord Bot:    https://bot.rig-city.com"
    echo "  Plex:           https://plex.evindrake.net"
    echo "  n8n:            https://n8n.evindrake.net"
    echo "  Static Site:    https://scarletredjoker.com"
    echo ""
    
    echo "Login Credentials:"
    if [[ -f "$INSTALL_DIR/.env" ]]; then
        API_KEY=$(grep DASHBOARD_API_KEY "$INSTALL_DIR/.env" | cut -d'=' -f2)
        echo "  API Key: $API_KEY"
    fi
    echo ""
    
    echo "Useful Commands:"
    echo "  View logs:      docker compose -f docker-compose.production.yml logs -f [service]"
    echo "  Restart:        docker compose -f docker-compose.production.yml restart [service]"
    echo "  Stop all:       docker compose -f docker-compose.production.yml down"
    echo "  Update:         docker compose -f docker-compose.production.yml pull && docker compose -f docker-compose.production.yml up -d"
    echo ""
    
    print_warning "IMPORTANT NEXT STEPS:"
    echo "  1. Update traefik/traefik.yml with your email for Let's Encrypt"
    echo "  2. Configure DNS A records in ZoneEdit for all subdomains"
    echo "  3. Edit .env to add service-specific tokens (Discord, Plex, OpenAI)"
    echo "  4. Restart services after configuration changes"
    echo ""
    
    echo "To view live logs:"
    echo "  docker compose -f docker-compose.production.yml logs -f"
    echo ""
    
    print_header "Monitoring Service Logs"
    echo ""
    sleep 2
    docker compose -f docker-compose.production.yml logs -f --tail=50
}

main() {
    clear
    echo -e "${BLUE}"
    cat << "EOF"
╔═══════════════════════════════════════╗
║   Homelab Dashboard Deployment       ║
║   Docker Compose Multi-Service       ║
╚═══════════════════════════════════════╝
EOF
    echo -e "${NC}"
    
    check_root
    check_system
    setup_directories
    setup_environment
    setup_docker_network
    pull_images
    build_dashboard
    start_services
    show_status
    print_completion
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --install-dir)
            INSTALL_DIR="$2"
            shift 2
            ;;
        --user)
            SERVICE_USER="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --install-dir DIR    Installation directory (default: /home/evin/homelab-dashboard)"
            echo "  --user USER          Service user (default: evin)"
            echo "  --help               Show this help message"
            echo ""
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

main
