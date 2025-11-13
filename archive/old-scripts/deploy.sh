#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${INSTALL_DIR:-/home/evin/homelab-dashboard}"
SERVICE_USER="${SERVICE_USER:-evin}"
ENABLE_SCRIPT_EXECUTION="${ENABLE_SCRIPT_EXECUTION:-false}"

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
        print_warning "Run as the user who will own the dashboard (default: evin)"
        exit 1
    fi
}

check_system() {
    print_header "Checking System Requirements"
    
    # Check OS
    if [[ ! -f /etc/os-release ]]; then
        print_error "Cannot determine OS"
        exit 1
    fi
    
    source /etc/os-release
    if [[ "$ID" != "ubuntu" ]]; then
        print_warning "This script is designed for Ubuntu, detected: $ID"
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    print_success "Running on $PRETTY_NAME"
    
    # Check Python
    if ! command -v python3 &> /dev/null; then
        print_error "Python 3 is not installed"
        print_warning "Run: sudo apt update && sudo apt install -y python3 python3-pip"
        exit 1
    fi
    PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
    print_success "Python $PYTHON_VERSION installed"
    
    # Check and install pip if needed
    if ! command -v pip3 &> /dev/null && ! command -v pip &> /dev/null; then
        print_warning "pip is not installed, attempting to install..."
        
        # Try ensurepip first (doesn't require sudo)
        if python3 -m ensurepip --upgrade --user &> /dev/null; then
            print_success "pip installed successfully using ensurepip"
        else
            # If ensurepip fails, try apt (requires sudo)
            print_warning "ensurepip failed, trying apt (may require sudo password)"
            if sudo apt update && sudo apt install -y python3-pip; then
                print_success "pip installed successfully using apt"
            else
                print_error "Failed to install pip automatically"
                print_warning "Please install pip manually with one of:"
                print_warning "  sudo apt update && sudo apt install -y python3-pip"
                print_warning "  python3 -m ensurepip --upgrade --user"
                exit 1
            fi
        fi
    fi
    
    # Determine which pip command to use
    if command -v pip3 &> /dev/null; then
        PIP_CMD="pip3"
    elif command -v pip &> /dev/null; then
        PIP_CMD="pip"
    else
        # Fallback to python3 -m pip
        PIP_CMD="python3 -m pip"
    fi
    print_success "pip is available"
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        print_warning "Run: curl -fsSL https://get.docker.com | sh"
        exit 1
    fi
    DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | tr -d ',')
    print_success "Docker $DOCKER_VERSION installed"
    
    # Check Docker permissions
    if ! groups | grep -q docker; then
        print_error "Current user ($USER) is not in docker group"
        print_warning "Run: sudo usermod -aG docker $USER"
        print_warning "Then log out and back in"
        exit 1
    fi
    print_success "User $USER is in docker group"
    
    # Check if Docker socket is accessible
    if [[ ! -S /var/run/docker.sock ]]; then
        print_error "Docker socket not found at /var/run/docker.sock"
        exit 1
    fi
    print_success "Docker socket accessible"
}

install_dependencies() {
    print_header "Installing Python Dependencies"
    
    cd "$SCRIPT_DIR"
    
    if [[ ! -f requirements.txt ]]; then
        print_error "requirements.txt not found in $SCRIPT_DIR"
        exit 1
    fi
    
    print_warning "Installing packages globally (no virtual environment)"
    print_warning "Using: $PIP_CMD"
    
    # Try regular install first
    if $PIP_CMD install -r requirements.txt --user 2>/dev/null; then
        print_success "Dependencies installed"
    else
        # If it fails due to externally-managed-environment (PEP 668), use --break-system-packages
        # This is safe for a dedicated homelab server
        print_warning "System is using PEP 668 protection, installing with --break-system-packages"
        print_warning "This is safe for your homelab server"
        
        if $PIP_CMD install -r requirements.txt --break-system-packages; then
            print_success "Dependencies installed"
        else
            print_error "Failed to install dependencies"
            print_warning "Try manually: $PIP_CMD install -r requirements.txt --break-system-packages"
            exit 1
        fi
    fi
}

setup_directories() {
    print_header "Setting Up Directories"
    
    # If deploying to a different location, copy files
    if [[ "$SCRIPT_DIR" != "$INSTALL_DIR" ]]; then
        print_warning "Copying files from $SCRIPT_DIR to $INSTALL_DIR"
        
        if [[ -d "$INSTALL_DIR" ]]; then
            print_warning "Directory $INSTALL_DIR already exists"
            read -p "Overwrite? (y/N) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                print_error "Deployment cancelled"
                exit 1
            fi
            rm -rf "$INSTALL_DIR"
        fi
        
        mkdir -p "$INSTALL_DIR"
        cp -r "$SCRIPT_DIR"/* "$INSTALL_DIR/"
        cd "$INSTALL_DIR"
        print_success "Files copied to $INSTALL_DIR"
    else
        print_success "Using current directory: $INSTALL_DIR"
    fi
    
    # Create log directory
    mkdir -p "$INSTALL_DIR/logs"
    print_success "Log directory created"
}

setup_environment() {
    print_header "Setting Up Environment Variables"
    
    cd "$INSTALL_DIR"
    
    if [[ -f .env ]]; then
        print_warning ".env file already exists"
        read -p "Overwrite? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
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
SECRET_KEY=$SESSION_SECRET

# Dashboard Security
DASHBOARD_API_KEY=$API_KEY
SESSION_SECRET=$SESSION_SECRET

# Security Settings
ENABLE_SCRIPT_EXECUTION=$ENABLE_SCRIPT_EXECUTION

# Server Configuration
FLASK_HOST=0.0.0.0
FLASK_PORT=5000

# Docker Configuration
DOCKER_SOCKET=/var/run/docker.sock

# SSH Configuration (for script execution - if enabled)
SSH_HOST=localhost
SSH_PORT=22
SSH_USERNAME=$SERVICE_USER
SSH_KEY_PATH=/home/$SERVICE_USER/.ssh/id_rsa

# Container Configuration
CONTAIN_DIR=/home/$SERVICE_USER/contain

# OpenAI Configuration (for AI features)
# If deploying outside Replit, you'll need your own OpenAI API key
# OPENAI_API_KEY=your-key-here

# Service URLs (update with your actual URLs)
DISCORD_BOT_URL=https://bot.rig-city.com
PLEX_URL=https://plex.evindrake.net
N8N_URL=https://n8n.evindrake.net
STATIC_SITE_URL=https://scarletredjoker.com
EOF

    chmod 600 .env
    
    print_success ".env file created with random secrets"
    print_warning "Your API Key: $API_KEY"
    print_warning "Save this key! You'll need it to log in."
    echo ""
    read -p "Press Enter to continue..."
}

setup_systemd_service() {
    print_header "Setting Up Systemd Service"
    
    SERVICE_FILE="/etc/systemd/system/homelab-dashboard.service"
    
    if [[ -f "$SERVICE_FILE" ]]; then
        print_warning "Service file already exists"
        sudo systemctl stop homelab-dashboard 2>/dev/null || true
    fi
    
    # Create service file
    sudo tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=Homelab Dashboard - Web-based Docker and System Management
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=/usr/bin/python3 $INSTALL_DIR/main.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=homelab-dashboard

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$INSTALL_DIR/logs

[Install]
WantedBy=multi-user.target
EOF

    print_success "Systemd service file created"
    
    # Reload systemd
    sudo systemctl daemon-reload
    print_success "Systemd daemon reloaded"
    
    # Enable service
    sudo systemctl enable homelab-dashboard
    print_success "Service enabled for auto-start"
}

setup_firewall() {
    print_header "Configuring Firewall (Optional)"
    
    if ! command -v ufw &> /dev/null; then
        print_warning "UFW not installed, skipping firewall configuration"
        return
    fi
    
    print_warning "The dashboard should be accessed through Twingate VPN"
    print_warning "It's recommended to block public access to port 5000"
    echo ""
    read -p "Configure UFW to block port 5000 from public? (y/N) " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Allow from localhost
        sudo ufw allow from 127.0.0.1 to any port 5000
        print_success "Allowed localhost access to port 5000"
        
        # You might want to allow from Twingate network
        print_warning "If you need to allow Twingate network, run:"
        print_warning "sudo ufw allow from <twingate-network-cidr> to any port 5000"
    else
        print_warning "Skipping firewall configuration"
        print_warning "Remember to restrict access via Twingate VPN"
    fi
}

start_service() {
    print_header "Starting Dashboard Service"
    
    sudo systemctl start homelab-dashboard
    
    sleep 2
    
    if sudo systemctl is-active --quiet homelab-dashboard; then
        print_success "Dashboard service is running"
    else
        print_error "Failed to start dashboard service"
        print_warning "Check logs with: sudo journalctl -u homelab-dashboard -n 50"
        exit 1
    fi
}

print_completion() {
    print_header "Deployment Complete!"
    
    echo -e "${GREEN}Dashboard successfully deployed!${NC}\n"
    
    echo "Installation Details:"
    echo "  Location: $INSTALL_DIR"
    echo "  User: $SERVICE_USER"
    echo "  Service: homelab-dashboard.service"
    echo ""
    
    echo "Access Information:"
    echo "  Local URL: http://localhost:5000"
    SERVER_IP=$(hostname -I | awk '{print $1}')
    echo "  Network URL: http://$SERVER_IP:5000"
    echo ""
    
    echo "Login Credentials:"
    if [[ -f "$INSTALL_DIR/.env" ]]; then
        API_KEY=$(grep DASHBOARD_API_KEY "$INSTALL_DIR/.env" | cut -d'=' -f2)
        echo "  API Key: $API_KEY"
    fi
    echo ""
    
    echo "Useful Commands:"
    echo "  Status:  sudo systemctl status homelab-dashboard"
    echo "  Stop:    sudo systemctl stop homelab-dashboard"
    echo "  Start:   sudo systemctl start homelab-dashboard"
    echo "  Restart: sudo systemctl restart homelab-dashboard"
    echo "  Logs:    sudo journalctl -u homelab-dashboard -f"
    echo ""
    
    if [[ "$ENABLE_SCRIPT_EXECUTION" == "false" ]]; then
        print_warning "Script execution is DISABLED (recommended for production)"
        echo "  Enable: Set ENABLE_SCRIPT_EXECUTION=true in $INSTALL_DIR/.env"
    else
        print_warning "Script execution is ENABLED (use with caution)"
        echo "  Disable: Set ENABLE_SCRIPT_EXECUTION=false in $INSTALL_DIR/.env"
    fi
    echo ""
    
    print_warning "IMPORTANT: Save your API key shown above!"
    print_warning "You'll need it to log in to the dashboard."
    echo ""
    
    echo "Next Steps:"
    echo "  1. Set up reverse proxy (nginx) with SSL for production"
    echo "  2. Configure Twingate to access the dashboard securely"
    echo "  3. Review PRODUCTION_DEPLOYMENT.md for hardening tips"
    echo "  4. Set up OpenAI API key if using AI features outside Replit"
    echo ""
    echo ""
    print_header "Starting Log Monitor (Press Ctrl+C to exit)"
    echo ""
    sleep 2
    sudo journalctl -u homelab-dashboard -f
}

main() {
    clear
    echo -e "${BLUE}"
    cat << "EOF"
╔═══════════════════════════════════════╗
║   Homelab Dashboard Deployment       ║
║   Automated Setup Script             ║
╚═══════════════════════════════════════╝
EOF
    echo -e "${NC}"
    
    check_root
    check_system
    install_dependencies
    setup_directories
    setup_environment
    setup_systemd_service
    setup_firewall
    start_service
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
        --enable-scripts)
            ENABLE_SCRIPT_EXECUTION="true"
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --install-dir DIR    Installation directory (default: /home/evin/homelab-dashboard)"
            echo "  --user USER          Service user (default: evin)"
            echo "  --enable-scripts     Enable remote script execution (not recommended for production)"
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
