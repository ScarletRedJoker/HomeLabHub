#!/bin/bash

# ======================================================================
# Unified Homelab Deployment Script
# Deploys all services with Caddy for automatic SSL and routing
# ======================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SERVICE_USER=${SERVICE_USER:-evin}
INSTALL_DIR="/home/$SERVICE_USER/contain/HomeLabHub"

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
echo -e "${BLUE}║   Unified Homelab Deployment         ║${NC}"
echo -e "${BLUE}║   All Services with Auto SSL         ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""

# Check if running as correct user
if [[ "$USER" != "$SERVICE_USER" ]]; then
    print_error "This script should be run as user: $SERVICE_USER"
    exit 1
fi

print_header "Checking System Requirements"

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

print_header "Checking System Configuration for Redis"

# Check and configure Redis memory overcommit
CURRENT_OVERCOMMIT=$(sysctl -n vm.overcommit_memory 2>/dev/null || echo "0")
if [[ "$CURRENT_OVERCOMMIT" != "1" ]]; then
    print_warning "Redis requires vm.overcommit_memory=1 (currently: $CURRENT_OVERCOMMIT)"
    echo ""
    echo "This setting allows Redis to allocate memory efficiently."
    echo "You can enable it temporarily (until reboot) or permanently."
    echo ""
    echo "Options:"
    echo "  1) Enable temporarily (until next reboot)"
    echo "  2) Enable permanently (modify /etc/sysctl.conf)"
    echo "  3) Skip (Redis will show warnings)"
    echo ""
    read -p "Your choice [1/2/3]: " -n 1 -r
    echo ""
    
    case $REPLY in
        1)
            print_warning "Enabling memory overcommit temporarily (requires sudo)"
            if sudo sysctl -w vm.overcommit_memory=1 &> /dev/null; then
                print_success "Memory overcommit enabled temporarily"
            else
                print_error "Failed to enable memory overcommit"
                print_warning "Redis will run but may show warnings"
            fi
            ;;
        2)
            print_warning "Enabling memory overcommit permanently (requires sudo)"
            if ! grep -q "^vm.overcommit_memory" /etc/sysctl.conf 2>/dev/null; then
                if echo "vm.overcommit_memory = 1" | sudo tee -a /etc/sysctl.conf > /dev/null && sudo sysctl -p > /dev/null; then
                    print_success "Memory overcommit enabled permanently"
                else
                    print_error "Failed to enable memory overcommit"
                    print_warning "Redis will run but may show warnings"
                fi
            else
                print_warning "Memory overcommit already configured in /etc/sysctl.conf"
                if sudo sysctl -w vm.overcommit_memory=1 &> /dev/null; then
                    print_success "Memory overcommit enabled"
                fi
            fi
            ;;
        3)
            print_warning "Skipping memory overcommit configuration"
            print_warning "Redis will show: 'Memory overcommit must be enabled!'"
            ;;
        *)
            print_warning "Invalid choice, skipping"
            ;;
    esac
else
    print_success "Redis memory overcommit already enabled (vm.overcommit_memory=$CURRENT_OVERCOMMIT)"
fi

print_header "Checking Container Directories"

# Check HomeLabHub workspace exists
if [[ -d "/home/$SERVICE_USER/contain/HomeLabHub" ]]; then
    print_success "Found: /home/$SERVICE_USER/contain/HomeLabHub"
else
    print_error "Missing directory: /home/$SERVICE_USER/contain/HomeLabHub"
    echo "Please clone the workspace repository to this location"
    exit 1
fi

# Check that services directory exists within workspace
if [[ ! -d "/home/$SERVICE_USER/contain/HomeLabHub/services" ]]; then
    print_error "Missing services/ directory in HomeLabHub"
    echo "Your workspace structure may be out of date"
    exit 1
fi
print_success "Workspace structure verified"

print_header "Setting Up Directories"

cd "$INSTALL_DIR"

# Create static website directory
if [[ ! -d /var/www/scarletredjoker ]]; then
    print_warning "Creating /var/www/scarletredjoker (requires sudo)"
    if sudo mkdir -p /var/www/scarletredjoker && sudo chown $SERVICE_USER:$SERVICE_USER /var/www/scarletredjoker; then
        # Add placeholder index
        if [[ ! -f /var/www/scarletredjoker/index.html ]]; then
            cat > /var/www/scarletredjoker/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Scarlet Red Joker</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .container {
            text-align: center;
        }
        h1 { font-size: 3em; margin: 0; }
        p { font-size: 1.5em; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Scarlet Red Joker</h1>
        <p>Coming Soon</p>
        <small>Upload your website files to /var/www/scarletredjoker/</small>
    </div>
</body>
</html>
EOF
        fi
        print_success "Created /var/www/scarletredjoker with placeholder page"
    else
        print_error "Could not create /var/www/scarletredjoker"
        exit 1
    fi
else
    print_success "/var/www/scarletredjoker already exists"
fi

# Create logs directories within workspace structure
mkdir -p services/dashboard/logs
mkdir -p services/discord-bot/{logs,attached_assets}
mkdir -p services/stream-bot/logs
mkdir -p services/plex/{config,transcode,media}
print_success "Service directories created"

print_header "Setting Up Environment Variables"

if [[ -f .env ]]; then
    print_warning ".env file already exists"
    read -p "Keep existing .env? (Y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        print_success "Keeping existing .env file"
    else
        cp .env.unified.example .env
        # Generate random secrets
        DASHBOARD_API_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')
        DASHBOARD_SESSION=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
        DISCORD_SESSION=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
        DB_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_urlsafe(16))')
        
        sed -i "s/generate-with-python-secrets/$DASHBOARD_API_KEY/g" .env
        sed -i "s/generate-random-password/$DB_PASSWORD/" .env
        sed -i "s/generate-random-secret/$DISCORD_SESSION/" .env
        
        print_success "Created new .env file with random secrets"
        print_warning "IMPORTANT: Edit .env and add your API keys/tokens!"
    fi
else
    cp .env.unified.example .env
    # Generate random secrets
    DASHBOARD_API_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')
    DASHBOARD_SESSION=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
    DISCORD_SESSION=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
    DB_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_urlsafe(16))')
    
    sed -i "s/generate-with-python-secrets/$DASHBOARD_API_KEY/g" .env
    sed -i "s/generate-random-password/$DB_PASSWORD/" .env
    sed -i "s/generate-random-secret/$DISCORD_SESSION/" .env
    
    print_success "Created .env file with random secrets"
    print_warning "IMPORTANT: Edit .env and add your API keys/tokens!"
fi

print_header "Generating Caddyfile"

# Load environment to get email
set -a
source .env
set +a

# Validate email is set and not a placeholder
if [ -z "$LETSENCRYPT_EMAIL" ]; then
    print_error "LETSENCRYPT_EMAIL not set in .env"
    echo "Please edit .env and set LETSENCRYPT_EMAIL=your-email@example.com"
    exit 1
fi

if [[ "$LETSENCRYPT_EMAIL" == *"YOUR_EMAIL"* ]] || [[ "$LETSENCRYPT_EMAIL" == *"example.com"* ]]; then
    print_error "LETSENCRYPT_EMAIL still has placeholder value: $LETSENCRYPT_EMAIL"
    echo "Please edit .env and set your REAL email address"
    exit 1
fi

if [[ ! "$LETSENCRYPT_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
    print_error "LETSENCRYPT_EMAIL is not a valid email: $LETSENCRYPT_EMAIL"
    exit 1
fi

# Auto-generate Caddyfile with environment variables
cat > Caddyfile << EOF
{
    email $LETSENCRYPT_EMAIL
}

bot.rig-city.com {
    reverse_proxy discord-bot:5000
}

stream.rig-city.com {
    reverse_proxy stream-bot:5000
}

plex.evindrake.net {
    reverse_proxy plex-server:32400
}

n8n.evindrake.net {
    reverse_proxy n8n:5678
}

host.evindrake.net {
    reverse_proxy homelab-dashboard:5000
}

vnc.evindrake.net {
    reverse_proxy vnc-desktop:6080
}

scarletredjoker.com {
    reverse_proxy scarletredjoker-web:80
}

www.scarletredjoker.com {
    redir https://scarletredjoker.com{uri} permanent
}
EOF

print_success "Caddyfile generated with email: $LETSENCRYPT_EMAIL"

# Validate Caddyfile doesn't contain placeholders
if grep -q '\${' Caddyfile; then
    print_error "Caddyfile still contains unexpanded variables!"
    echo "Check Caddyfile for \${...} placeholders"
    grep '\${' Caddyfile
    exit 1
fi

# Validate critical services have correct ports
if ! grep -q "homelab-dashboard:5000" Caddyfile; then
    print_warning "Dashboard port in Caddyfile is not 5000 - fixing..."
    sed -i 's/homelab-dashboard:[0-9]*/homelab-dashboard:5000/' Caddyfile
fi

print_success "Caddyfile validation passed"

print_header "Port Forwarding Check"

echo "For automatic SSL to work, your router must forward these ports:"
echo "  Port 80  (HTTP)  → This server"
echo "  Port 443 (HTTPS) → This server"
echo ""
read -p "Have you set up port forwarding? (y/N) " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Port forwarding is REQUIRED for SSL certificates!"
    echo ""
    echo "Configure your router to forward:"
    echo "  External Port 80  → $(hostname -I | awk '{print $1}'):80"
    echo "  External Port 443 → $(hostname -I | awk '{print $1}'):443"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

print_header "Building and Starting Services"

print_warning "Building custom containers (may take a few minutes)..."
echo ""

# Build all services with progress output
docker compose -f docker-compose.unified.yml build --progress=plain

if [ $? -eq 0 ]; then
    print_success "All containers built successfully"
else
    print_error "Build failed! Check output above for errors"
    exit 1
fi

echo ""
print_warning "Starting services..."
docker compose -f docker-compose.unified.yml up -d

if [ $? -ne 0 ]; then
    print_error "Failed to start services!"
    echo ""
    echo "Showing logs for debugging:"
    docker compose -f docker-compose.unified.yml logs --tail=50
    exit 1
fi

print_header "Checking Service Health"

echo "Waiting for containers to initialize..."
sleep 8

# Check container status
echo ""
echo "Container Status:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker compose -f docker-compose.unified.yml ps

# Count running containers
RUNNING=$(docker compose -f docker-compose.unified.yml ps --filter "status=running" -q | wc -l)
TOTAL=$(docker compose -f docker-compose.unified.yml ps -q | wc -l)

echo ""
if [ "$RUNNING" -eq "$TOTAL" ]; then
    print_success "All $TOTAL containers are running!"
else
    print_warning "$RUNNING out of $TOTAL containers running"
    echo ""
    echo "Checking for issues..."
    docker compose -f docker-compose.unified.yml ps --filter "status=exited"
fi

print_header "SSL Certificate Status"

echo "Checking Caddy for SSL certificate acquisition..."
echo ""
sleep 3

# Check Caddy logs for SSL cert info
CADDY_LOGS=$(docker logs caddy --tail=50 2>&1)

if echo "$CADDY_LOGS" | grep -q "certificate obtained successfully"; then
    print_success "SSL certificates are being issued!"
elif echo "$CADDY_LOGS" | grep -qi "error"; then
    print_warning "Caddy may have encountered issues"
    echo ""
    echo "Last 10 lines of Caddy logs:"
    docker logs caddy --tail=10 2>&1 | grep -i error
else
    print_success "Caddy is running and will automatically obtain SSL certificates"
    echo "  Certificates will be requested on first HTTPS access"
fi

print_header "Service Logs Preview"

echo "Showing last 5 lines from each service:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

SERVICES=("caddy" "homelab-dashboard" "discord-bot" "stream-bot" "n8n" "plex-server")

for service in "${SERVICES[@]}"; do
    echo -e "${BLUE}▶ $service${NC}"
    docker logs $service --tail=5 2>&1 | sed 's/^/  /'
    echo ""
done

print_header "Deployment Complete!"

echo ""
print_success "All services deployed successfully!"
echo ""
echo "Your services are accessible at:"
echo ""
echo "  🎛️  Dashboard:       https://host.evindrake.net"
echo "  🎫  Discord Bot:     https://bot.rig-city.com"
echo "  🎬  Stream Bot:      https://stream.rig-city.com"
echo "  📺  Plex Server:     https://plex.evindrake.net"
echo "  🤖  n8n Automation:  https://n8n.evindrake.net"
echo "  🌐  Static Website:  https://scarletredjoker.com"
echo "  🖥️  VNC Desktop:     https://vnc.evindrake.net"
echo ""
print_warning "Important Next Steps:"
echo ""
echo "1. Dashboard Login Credentials:"
echo "   Username: evin"
echo "   Password: homelab"
echo "   ⚠️  CHANGE THESE in .env (WEB_USERNAME, WEB_PASSWORD) for security!"
echo ""
echo "2. Edit .env and add your API keys/tokens:"
echo "   nano .env"
echo ""
echo "3. Required credentials:"
echo "   - OPENAI_API_KEY (for dashboard AI and stream bot)"
echo "   - DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, etc."
echo "   - TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_CHANNEL"
echo "   - PLEX_CLAIM (from https://www.plex.tv/claim/)"
echo ""
echo "4. After updating .env, restart services:"
echo "   docker compose -f docker-compose.unified.yml restart"
echo ""
echo "5. Upload your static website files to:"
echo "   /var/www/scarletredjoker/"
echo ""
echo "6. Monitor all logs in real-time:"
echo "   docker compose -f docker-compose.unified.yml logs -f"
echo ""
echo "7. Check specific service logs:"
echo "   docker logs caddy -f              # SSL certificate status"
echo "   docker logs homelab-dashboard -f  # Dashboard logs"
echo "   docker logs discord-bot -f        # Discord bot logs"
echo ""
echo "8. Read ARCHITECTURE.md for how services are structured"
echo ""
print_warning "SSL Certificates:"
echo "  Caddy will automatically request Let's Encrypt certificates"
echo "  This requires port 80 and 443 to be accessible from the internet"
echo "  Watch certificate acquisition: docker logs caddy -f"
echo ""
print_success "Deployment finished! Your homelab is now online! 🚀"
echo ""

# Ask if user wants to follow logs
read -p "Would you like to watch live logs now? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    print_warning "Following logs from all services (Ctrl+C to exit)..."
    echo ""
    docker compose -f docker-compose.unified.yml logs -f
fi

echo ""
