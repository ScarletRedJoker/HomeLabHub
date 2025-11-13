#!/bin/bash

# Homelab Dashboard Deployment Script
# Using Nginx + Certbot (Traditional Setup)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SERVICE_USER=${SERVICE_USER:-evin}
INSTALL_DIR="/home/$SERVICE_USER/homelab-dashboard"
DOMAINS="host.evindrake.net bot.rig-city.com plex.evindrake.net n8n.evindrake.net scarletredjoker.com"
EMAIL="${LETSENCRYPT_EMAIL:-admin@evindrake.net}"

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
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

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Homelab Dashboard Deployment       ║${NC}"
echo -e "${BLUE}║   Nginx + Certbot Setup              ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""

# Check if running as correct user
if [[ "$USER" != "$SERVICE_USER" ]]; then
    print_error "This script should be run as user: $SERVICE_USER"
    exit 1
fi

print_header "Checking System Requirements"

# Check OS
if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    print_success "Running on $PRETTY_NAME"
else
    print_error "Cannot detect OS version"
    exit 1
fi

# Check Docker
if ! command -v docker &> /dev/null; then
    print_error "Docker not installed"
    exit 1
fi
print_success "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') installed"

# Check Docker Compose
if ! docker compose version &> /dev/null; then
    print_error "Docker Compose not installed"
    exit 1
fi
print_success "Docker Compose $(docker compose version | cut -d' ' -f4) installed"

# Check Nginx
if ! command -v nginx &> /dev/null; then
    print_warning "Nginx not installed - will install it now"
    sudo apt update
    sudo apt install -y nginx
fi
print_success "Nginx installed"

# Check certbot
if ! command -v certbot &> /dev/null; then
    print_warning "Certbot not installed - will install it now"
    sudo apt update
    sudo apt install -y certbot python3-certbot-nginx
fi
print_success "Certbot installed"

# Check if user is in docker group
if ! groups $SERVICE_USER | grep -q docker; then
    print_error "User $SERVICE_USER is not in docker group"
    print_warning "Run: sudo usermod -aG docker $SERVICE_USER && newgrp docker"
    exit 1
fi
print_success "User $SERVICE_USER is in docker group"

# Check Docker daemon
if ! docker ps &> /dev/null; then
    print_error "Docker daemon is not running"
    exit 1
fi
print_success "Docker daemon is running"

print_header "Setting Up Directories"

# Create install directory
if [[ ! -d "$INSTALL_DIR" ]]; then
    mkdir -p "$INSTALL_DIR"
    print_success "Created $INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# Create required directories
mkdir -p logs nginx-sites
mkdir -p /home/$SERVICE_USER/contain/{DiscordTicketBot,plex-server/{config,media,transcode},n8n}
print_success "Created container directories"

# Create static site directory
if [[ ! -d /var/www/scarletredjoker ]]; then
    print_warning "Creating /var/www/scarletredjoker (requires sudo)"
    if sudo mkdir -p /var/www/scarletredjoker && sudo chown $SERVICE_USER:$SERVICE_USER /var/www/scarletredjoker; then
        # Add default index.html if empty
        if [[ ! -f /var/www/scarletredjoker/index.html ]]; then
            echo "<h1>Scarlet Red Joker</h1><p>Coming Soon</p>" > /var/www/scarletredjoker/index.html
        fi
        print_success "Created /var/www/scarletredjoker"
    fi
fi

print_header "Setting Up Environment Variables"

if [[ -f .env ]]; then
    print_warning ".env file already exists"
    read -p "Keep existing .env? (Y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        print_success "Keeping existing .env file"
    else
        cp .env.production.example .env
        # Generate random secrets
        API_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')
        SESSION_SECRET=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
        sed -i "s/your-api-key-here/$API_KEY/" .env
        sed -i "s/your-session-secret-here/$SESSION_SECRET/" .env
        print_success "Created new .env file"
    fi
else
    cp .env.production.example .env
    API_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')
    SESSION_SECRET=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
    sed -i "s/your-api-key-here/$API_KEY/" .env
    sed -i "s/your-session-secret-here/$SESSION_SECRET/" .env
    print_success "Created .env file"
fi

print_header "Setting Up Docker Network"

if ! docker network inspect homelab &> /dev/null; then
    docker network create homelab
    print_success "Created Docker network 'homelab'"
else
    print_success "Docker network 'homelab' already exists"
fi

print_header "Setting Up Nginx Configuration"

# Copy nginx config
sudo cp nginx-sites/homelab.conf /etc/nginx/sites-available/homelab
sudo ln -sf /etc/nginx/sites-available/homelab /etc/nginx/sites-enabled/homelab

# Remove default site if exists
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx config
if sudo nginx -t; then
    print_success "Nginx configuration valid"
    sudo systemctl reload nginx
    print_success "Nginx reloaded"
else
    print_error "Nginx configuration invalid"
    exit 1
fi

print_header "Building and Starting Containers"

# Load environment
set -a
source .env
set +a

# Build dashboard
docker compose -f docker-compose.nginx.yml build homelab-dashboard
print_success "Dashboard built"

# Start services
docker compose -f docker-compose.nginx.yml up -d homelab-dashboard

# Start optional services based on profiles
if [[ "${COMPOSE_PROFILES}" == *"plex"* ]] || [[ "${COMPOSE_PROFILES}" == "all" ]]; then
    docker compose -f docker-compose.nginx.yml up -d plex
    print_success "Started Plex"
fi

if [[ "${COMPOSE_PROFILES}" == *"n8n"* ]] || [[ "${COMPOSE_PROFILES}" == "all" ]]; then
    docker compose -f docker-compose.nginx.yml up -d n8n
    print_success "Started n8n"
fi

if [[ "${COMPOSE_PROFILES}" == *"web"* ]] || [[ "${COMPOSE_PROFILES}" == "all" ]]; then
    docker compose -f docker-compose.nginx.yml up -d scarletredjoker-web
    print_success "Started static website"
fi

if [[ -n "${DISCORD_BOT_IMAGE}" ]] && [[ "${DISCORD_BOT_IMAGE}" != *"placeholder"* ]]; then
    if [[ "${COMPOSE_PROFILES}" == *"discord"* ]] || [[ "${COMPOSE_PROFILES}" == "all" ]]; then
        docker compose -f docker-compose.nginx.yml up -d discord-bot
        print_success "Started Discord bot"
    fi
fi

print_header "SSL Certificate Setup"

print_warning "Ready to generate SSL certificates with certbot"
echo ""
echo "This will request certificates for:"
for domain in $DOMAINS; do
    echo "  - $domain"
done
echo ""
read -p "Proceed with SSL setup? (y/N) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    for domain in $DOMAINS; do
        echo ""
        print_warning "Setting up SSL for $domain"
        if sudo certbot --nginx -d $domain --non-interactive --agree-tos --email $EMAIL --redirect; then
            print_success "SSL configured for $domain"
        else
            print_warning "Could not configure SSL for $domain (check DNS)"
        fi
    done
    
    print_success "SSL setup complete!"
    print_warning "Certbot auto-renewal is configured via systemd timer"
else
    print_warning "Skipping SSL setup - run manually with:"
    echo "  sudo certbot --nginx -d host.evindrake.net"
fi

print_header "Deployment Complete!"

echo ""
print_success "Dashboard deployed successfully!"
echo ""
echo "Access your services at:"
echo "  Dashboard:     http://host.evindrake.net"
echo "  Discord Bot:   http://bot.rig-city.com"
echo "  Plex:          http://plex.evindrake.net"
echo "  n8n:           http://n8n.evindrake.net"
echo "  Static Site:   http://scarletredjoker.com"
echo ""
echo "After SSL setup (if completed), use https:// instead"
echo ""
print_warning "Next steps:"
echo "  1. Update .env with your OpenAI API key"
echo "  2. Configure Plex claim token (https://www.plex.tv/claim/)"
echo "  3. Test SSL: sudo certbot renew --dry-run"
echo ""
print_warning "Manage containers:"
echo "  View logs:    docker compose -f docker-compose.nginx.yml logs -f"
echo "  Restart:      docker compose -f docker-compose.nginx.yml restart"
echo "  Stop:         docker compose -f docker-compose.nginx.yml down"
echo ""
