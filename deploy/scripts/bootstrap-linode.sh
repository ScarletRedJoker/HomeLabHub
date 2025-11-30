#!/bin/bash
set -euo pipefail

echo "================================================"
echo "  Nebula Command - Linode Bootstrap Script"
echo "  Cloud Services Deployment"
echo "================================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LINODE_DIR="$(dirname "$SCRIPT_DIR")/linode"

print_status() { echo -e "\n\033[1;34m==>\033[0m \033[1m$1\033[0m"; }
print_success() { echo -e "\033[1;32m✓\033[0m $1"; }
print_error() { echo -e "\033[1;31m✗\033[0m $1"; }
print_warning() { echo -e "\033[1;33m⚠\033[0m $1"; }

check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

install_docker() {
    print_status "Installing Docker..."
    
    if command -v docker &> /dev/null; then
        print_success "Docker already installed: $(docker --version)"
        return 0
    fi
    
    apt-get update
    apt-get install -y ca-certificates curl gnupg lsb-release
    
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    systemctl enable docker
    systemctl start docker
    
    print_success "Docker installed successfully"
}

install_tailscale() {
    print_status "Installing Tailscale..."
    
    if command -v tailscale &> /dev/null; then
        print_success "Tailscale already installed"
        return 0
    fi
    
    curl -fsSL https://tailscale.com/install.sh | sh
    
    print_success "Tailscale installed"
    print_warning "Run 'sudo tailscale up' to authenticate"
}

setup_firewall() {
    print_status "Configuring UFW firewall..."
    
    apt-get install -y ufw
    
    ufw default deny incoming
    ufw default allow outgoing
    
    ufw allow ssh
    ufw allow 80/tcp
    ufw allow 443/tcp
    
    ufw allow in on tailscale0
    
    echo "y" | ufw enable
    
    print_success "Firewall configured"
}

create_directories() {
    print_status "Creating deployment directories..."
    
    DEPLOY_DIR="/opt/homelab"
    
    mkdir -p "$DEPLOY_DIR"/{logs,workspace}
    mkdir -p "$DEPLOY_DIR/postgres-init"
    
    print_success "Directories created at $DEPLOY_DIR"
}

clone_repository() {
    print_status "Cloning HomeLabHub repository..."
    
    DEPLOY_DIR="/opt/homelab"
    REPO_URL="${REPO_URL:-https://github.com/ScarletRedJoker/HomeLabHub.git}"
    
    if [[ -d "$DEPLOY_DIR/HomeLabHub" ]]; then
        print_status "Repository exists, pulling latest..."
        cd "$DEPLOY_DIR/HomeLabHub"
        git pull origin main || print_warning "Git pull failed, continuing with existing code"
    else
        git clone "$REPO_URL" "$DEPLOY_DIR/HomeLabHub"
        print_success "Repository cloned"
    fi
    
    rm -rf "$DEPLOY_DIR/services" 2>/dev/null || true
    ln -sfn "$DEPLOY_DIR/HomeLabHub/services" "$DEPLOY_DIR/services"
    print_success "Linked services directory"
}

copy_services() {
    print_status "Setting up services..."
    
    DEPLOY_DIR="/opt/homelab"
    
    clone_repository
    
    if [[ -d "$DEPLOY_DIR/HomeLabHub/deploy/linode" ]]; then
        cp "$DEPLOY_DIR/HomeLabHub/deploy/linode/docker-compose.yml" "$DEPLOY_DIR/"
        cp "$DEPLOY_DIR/HomeLabHub/deploy/linode/Caddyfile" "$DEPLOY_DIR/"
        print_success "Copied compose and Caddy config from repo"
    elif [[ -d "$LINODE_DIR" ]]; then
        cp "$LINODE_DIR/docker-compose.yml" "$DEPLOY_DIR/"
        cp "$LINODE_DIR/Caddyfile" "$DEPLOY_DIR/"
        print_success "Copied compose and Caddy config"
    else
        print_warning "Linode config not found, please copy manually"
    fi
    
    cat > "$DEPLOY_DIR/code-server-proxy-nginx.conf" << 'NGINX'
events {
    worker_connections 1024;
}

http {
    upstream code-server {
        server code-server:8443;
    }

    server {
        listen 8080;
        server_name _;

        location / {
            proxy_pass http://code-server;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            proxy_hide_header X-Frame-Options;
            add_header X-Frame-Options "SAMEORIGIN" always;
            add_header Content-Security-Policy "frame-ancestors 'self'" always;
        }
    }
}
NGINX
    
    print_success "Nginx proxy config created"
}

setup_env_template() {
    print_status "Creating environment template..."
    
    DEPLOY_DIR="/opt/homelab"
    
    if [[ ! -f "$DEPLOY_DIR/.env" ]]; then
        cat > "$DEPLOY_DIR/.env.template" << 'ENV'
POSTGRES_PASSWORD=your_secure_password_here
DISCORD_DB_PASSWORD=your_discord_db_password
STREAMBOT_DB_PASSWORD=your_streambot_db_password
JARVIS_DB_PASSWORD=your_jarvis_db_password

DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_APP_ID=your_discord_app_id
VITE_DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_SESSION_SECRET=generate_random_32_char_string

OPENAI_API_KEY=your_openai_api_key
SERVICE_AUTH_TOKEN=generate_random_token

TWITCH_CLIENT_ID=your_twitch_client_id
TWITCH_CLIENT_SECRET=your_twitch_client_secret
STREAMBOT_SESSION_SECRET=generate_random_32_char_string

YOUTUBE_CLIENT_ID=your_youtube_client_id
YOUTUBE_CLIENT_SECRET=your_youtube_client_secret
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
KICK_CLIENT_ID=your_kick_client_id
KICK_CLIENT_SECRET=your_kick_client_secret

CODE_SERVER_PASSWORD=your_code_server_password
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=your_n8n_password

WEB_USERNAME=admin
WEB_PASSWORD=your_dashboard_password

PLEX_TOKEN=your_plex_token
HOME_ASSISTANT_TOKEN=your_ha_token

TAILSCALE_LOCAL_HOST=100.x.x.x
ENV
        
        print_warning "Environment template created at $DEPLOY_DIR/.env.template"
        print_warning "Copy to .env and fill in your values!"
    fi
}

copy_postgres_init() {
    print_status "Setting up PostgreSQL init scripts..."
    
    DEPLOY_DIR="/opt/homelab"
    
    cat > "$DEPLOY_DIR/postgres-init/00-init-all-databases.sh" << 'PGSCRIPT'
#!/bin/bash
set -e

echo "=== PostgreSQL Multi-Database Initialization ==="

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    -- Create users
    CREATE USER ticketbot WITH PASSWORD '${DISCORD_DB_PASSWORD}';
    CREATE USER streambot WITH PASSWORD '${STREAMBOT_DB_PASSWORD}';
    CREATE USER jarvis WITH PASSWORD '${JARVIS_DB_PASSWORD}';
    
    -- Create databases
    CREATE DATABASE ticketbot OWNER ticketbot;
    CREATE DATABASE streambot OWNER streambot;
    CREATE DATABASE homelab_jarvis OWNER jarvis;
    
    -- Grant privileges
    GRANT ALL PRIVILEGES ON DATABASE ticketbot TO ticketbot;
    GRANT ALL PRIVILEGES ON DATABASE streambot TO streambot;
    GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis TO jarvis;
EOSQL

echo "=== PostgreSQL initialization complete ==="
PGSCRIPT
    
    chmod +x "$DEPLOY_DIR/postgres-init/00-init-all-databases.sh"
    print_success "PostgreSQL init script created"
}

print_summary() {
    echo ""
    echo "================================================"
    echo "  Linode Bootstrap Complete!"
    echo "================================================"
    echo ""
    echo "Next steps:"
    echo "  1. cd /opt/homelab"
    echo "  2. cp .env.template .env && nano .env"
    echo "  3. Clone your services from GitHub"
    echo "  4. Run: sudo tailscale up"
    echo "  5. Run: docker compose up -d"
    echo ""
    echo "Update Cloudflare DNS to point to this server:"
    echo "  - bot.rig-city.com"
    echo "  - stream.rig-city.com"
    echo "  - rig-city.com"
    echo "  - dashboard.evindrake.net"
    echo "  - n8n.evindrake.net"
    echo "  - code.evindrake.net"
    echo "  - scarletredjoker.com"
    echo ""
}

main() {
    check_root
    
    print_status "Starting Linode bootstrap..."
    
    install_docker
    install_tailscale
    setup_firewall
    create_directories
    copy_services
    setup_env_template
    copy_postgres_init
    
    print_summary
}

main "$@"
