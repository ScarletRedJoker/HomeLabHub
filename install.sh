#!/bin/bash
# Nebula Command Installer
# Usage: curl -fsSL https://nebula.sh/install | bash
#
# Supported: Ubuntu, Debian, CentOS/RHEL, Fedora, macOS

set -e

NEBULA_VERSION="${NEBULA_VERSION:-latest}"
INSTALL_DIR="${INSTALL_DIR:-/opt/nebula-command}"
REPO_URL="${NEBULA_REPO_URL:-https://github.com/user/nebula-command.git}"
LOG_DIR="${LOG_DIR:-/var/log/nebula}"
NODE_VERSION="${NODE_VERSION:-20}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_banner() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║     Nebula Command Installer          ║${NC}"
    echo -e "${CYAN}║     Backend Management Platform       ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════╝${NC}"
    echo ""
}

log() {
    local level=$1
    shift
    local msg="$*"
    local timestamp=$(date '+%H:%M:%S')
    
    case $level in
        INFO)  echo -e "${GREEN}[$timestamp]${NC} → $msg" ;;
        WARN)  echo -e "${YELLOW}[$timestamp]${NC} ⚠ $msg" ;;
        ERROR) echo -e "${RED}[$timestamp]${NC} ✗ $msg" ;;
        OK)    echo -e "${GREEN}[$timestamp]${NC} ✓ $msg" ;;
        *)     echo "[$timestamp] $msg" ;;
    esac
}

detect_os() {
    log INFO "Detecting operating system..."
    
    OS=""
    ARCH=$(uname -m)
    PKG_MANAGER=""
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
        PKG_MANAGER="brew"
        log OK "Detected: macOS ($ARCH)"
    elif [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        
        case $OS in
            ubuntu|debian|pop|linuxmint)
                PKG_MANAGER="apt"
                ;;
            centos|rhel|rocky|almalinux|fedora)
                if command -v dnf &>/dev/null; then
                    PKG_MANAGER="dnf"
                else
                    PKG_MANAGER="yum"
                fi
                ;;
            arch|manjaro)
                PKG_MANAGER="pacman"
                ;;
            opensuse*|sles)
                PKG_MANAGER="zypper"
                ;;
            alpine)
                PKG_MANAGER="apk"
                ;;
            *)
                PKG_MANAGER="unknown"
                ;;
        esac
        
        log OK "Detected: $PRETTY_NAME ($ARCH)"
    else
        log ERROR "Could not detect operating system"
        exit 1
    fi
}

check_root() {
    if [[ "$OS" != "macos" ]] && [[ $EUID -ne 0 ]]; then
        if command -v sudo &>/dev/null; then
            log WARN "Not running as root, will use sudo"
            SUDO="sudo"
        else
            log ERROR "This script requires root privileges. Please run with sudo."
            exit 1
        fi
    else
        SUDO=""
    fi
}

install_git() {
    log INFO "Installing git..."
    
    case $PKG_MANAGER in
        apt)
            $SUDO apt-get update -qq
            $SUDO apt-get install -y git
            ;;
        dnf|yum)
            $SUDO $PKG_MANAGER install -y git
            ;;
        pacman)
            $SUDO pacman -S --noconfirm git
            ;;
        zypper)
            $SUDO zypper install -y git
            ;;
        apk)
            $SUDO apk add git
            ;;
        brew)
            brew install git
            ;;
        *)
            log ERROR "Cannot install git on this system"
            exit 1
            ;;
    esac
}

install_node() {
    log INFO "Installing Node.js v${NODE_VERSION}..."
    
    case $PKG_MANAGER in
        apt)
            if ! command -v curl &>/dev/null; then
                $SUDO apt-get update -qq
                $SUDO apt-get install -y curl ca-certificates
            fi
            curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | $SUDO -E bash -
            $SUDO apt-get install -y nodejs
            ;;
        dnf)
            curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | $SUDO bash -
            $SUDO dnf install -y nodejs
            ;;
        yum)
            curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | $SUDO bash -
            $SUDO yum install -y nodejs
            ;;
        pacman)
            $SUDO pacman -S --noconfirm nodejs npm
            ;;
        zypper)
            $SUDO zypper install -y nodejs${NODE_VERSION} npm${NODE_VERSION}
            ;;
        apk)
            $SUDO apk add nodejs npm
            ;;
        brew)
            brew install node@${NODE_VERSION}
            brew link --overwrite node@${NODE_VERSION}
            ;;
        *)
            log WARN "Auto-install not supported for this OS. Installing via nvm..."
            curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
            export NVM_DIR="$HOME/.nvm"
            [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
            nvm install ${NODE_VERSION}
            nvm use ${NODE_VERSION}
            ;;
    esac
    
    log OK "Node.js $(node --version) installed"
}

install_docker() {
    log INFO "Installing Docker (optional)..."
    
    if [[ "$OS" == "macos" ]]; then
        log WARN "Docker Desktop must be installed manually on macOS"
        log WARN "Download from: https://www.docker.com/products/docker-desktop"
        return 0
    fi
    
    case $PKG_MANAGER in
        apt)
            curl -fsSL https://get.docker.com | $SUDO sh
            $SUDO systemctl enable docker
            $SUDO systemctl start docker
            ;;
        dnf|yum)
            $SUDO $PKG_MANAGER install -y dnf-plugins-core 2>/dev/null || true
            $SUDO $PKG_MANAGER config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo 2>/dev/null || \
            $SUDO $PKG_MANAGER config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo 2>/dev/null || true
            $SUDO $PKG_MANAGER install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
            $SUDO systemctl enable docker
            $SUDO systemctl start docker
            ;;
        pacman)
            $SUDO pacman -S --noconfirm docker docker-compose
            $SUDO systemctl enable docker
            $SUDO systemctl start docker
            ;;
        apk)
            $SUDO apk add docker docker-compose
            $SUDO rc-update add docker boot
            $SUDO service docker start
            ;;
        *)
            log WARN "Docker installation not automated for this OS"
            ;;
    esac
    
    if command -v docker &>/dev/null; then
        log OK "Docker installed: $(docker --version)"
        
        if [[ -n "$SUDO_USER" ]]; then
            $SUDO usermod -aG docker "$SUDO_USER"
            log INFO "Added $SUDO_USER to docker group"
        fi
    fi
}

check_requirements() {
    log INFO "Checking requirements..."
    
    if ! command -v git &>/dev/null; then
        install_git
    else
        log OK "git: $(git --version)"
    fi
    
    if ! command -v node &>/dev/null; then
        install_node
    else
        local node_ver=$(node --version | sed 's/v//' | cut -d. -f1)
        if [[ $node_ver -lt 18 ]]; then
            log WARN "Node.js version $node_ver is too old, upgrading..."
            install_node
        else
            log OK "node: $(node --version)"
        fi
    fi
    
    if ! command -v npm &>/dev/null; then
        log ERROR "npm not found after Node.js installation"
        exit 1
    fi
    log OK "npm: $(npm --version)"
    
    if ! command -v docker &>/dev/null; then
        log WARN "Docker not found (optional)"
        
        read -p "Would you like to install Docker? [y/N] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            install_docker
        fi
    else
        log OK "docker: $(docker --version | head -1)"
    fi
}

install_nebula() {
    log INFO "Installing Nebula Command..."
    
    $SUDO mkdir -p "$(dirname "$INSTALL_DIR")"
    $SUDO mkdir -p "$LOG_DIR"
    
    if [ -d "$INSTALL_DIR" ]; then
        log INFO "Existing installation found, updating..."
        cd "$INSTALL_DIR"
        $SUDO git fetch origin 2>/dev/null || true
        $SUDO git reset --hard origin/main 2>/dev/null || $SUDO git reset --hard origin/master 2>/dev/null || true
    else
        log INFO "Cloning repository..."
        $SUDO git clone "$REPO_URL" "$INSTALL_DIR"
    fi
    
    cd "$INSTALL_DIR"
    
    log INFO "Installing dependencies..."
    
    local services=("services/dashboard-next" "services/discord-bot" "services/stream-bot")
    
    for service_path in "${services[@]}"; do
        if [[ -d "$service_path" ]] && [[ -f "$service_path/package.json" ]]; then
            log INFO "  Installing deps for $(basename $service_path)..."
            cd "$INSTALL_DIR/$service_path"
            $SUDO npm ci --production 2>/dev/null || $SUDO npm install --production --legacy-peer-deps 2>/dev/null || true
        fi
    done
    
    cd "$INSTALL_DIR"
    
    if [[ -f "package.json" ]]; then
        $SUDO npm ci --production 2>/dev/null || $SUDO npm install --production --legacy-peer-deps 2>/dev/null || true
    fi
    
    log OK "Nebula Command installed to $INSTALL_DIR"
}

setup_service() {
    log INFO "Setting up service manager..."
    
    if ! command -v pm2 &>/dev/null; then
        log INFO "Installing PM2..."
        $SUDO npm install -g pm2
    fi
    
    cd "$INSTALL_DIR"
    
    if [[ -f "ecosystem.config.js" ]]; then
        log INFO "Starting services with PM2..."
        $SUDO pm2 start ecosystem.config.js --env production 2>/dev/null || \
        pm2 start ecosystem.config.js --env production 2>/dev/null || true
        
        $SUDO pm2 save 2>/dev/null || pm2 save 2>/dev/null || true
        
        if [[ "$OS" != "macos" ]]; then
            log INFO "Setting up PM2 startup..."
            pm2 startup 2>/dev/null || $SUDO env PATH=$PATH:/usr/bin pm2 startup systemd -u ${SUDO_USER:-$USER} --hp ${HOME} 2>/dev/null || true
        fi
        
        log OK "PM2 services configured"
    else
        log WARN "No ecosystem.config.js found, skipping PM2 setup"
    fi
}

create_env_template() {
    log INFO "Creating environment template..."
    
    local env_file="$INSTALL_DIR/.env"
    
    if [[ ! -f "$env_file" ]]; then
        cat > "$env_file" << 'ENVEOF'
# Nebula Command Environment Configuration
# Edit this file with your actual values

# Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/nebula

# Discord Bot (optional)
DISCORD_TOKEN=
DISCORD_CLIENT_ID=

# Stream Bot (optional)
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=

# AI Integration (optional)
OPENAI_API_KEY=

# Security
SESSION_SECRET=change-this-to-a-random-string
JWT_SECRET=change-this-to-another-random-string

# Dashboard
NEXT_PUBLIC_APP_URL=http://localhost:5000
ENVEOF
        
        chmod 600 "$env_file"
        log OK "Environment template created at $env_file"
    else
        log OK "Existing .env file preserved"
    fi
}

run_setup() {
    echo ""
    log INFO "Starting setup wizard..."
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  Complete the setup by visiting:"
    echo ""
    echo -e "    ${GREEN}http://localhost:5000/setup${NC}"
    echo ""
    echo "  Or configure manually:"
    echo ""
    echo -e "    ${BLUE}1.${NC} Edit $INSTALL_DIR/.env"
    echo -e "    ${BLUE}2.${NC} Set up your PostgreSQL database"
    echo -e "    ${BLUE}3.${NC} Run: cd $INSTALL_DIR && pm2 restart all"
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_summary() {
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║         Nebula Command Installed Successfully!        ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "  Installation Directory: $INSTALL_DIR"
    echo "  Log Directory:          $LOG_DIR"
    echo ""
    echo "  Services:"
    echo "    • Dashboard:    http://localhost:5000"
    echo "    • Setup Wizard: http://localhost:5000/setup"
    echo ""
    echo "  Commands:"
    echo "    pm2 status          - View running services"
    echo "    pm2 logs            - View logs"
    echo "    pm2 restart all     - Restart all services"
    echo ""
    
    if command -v pm2 &>/dev/null; then
        echo "  Current Status:"
        pm2 list 2>/dev/null || true
    fi
    
    echo ""
}

show_help() {
    echo "Nebula Command Installer"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -h, --help           Show this help message"
    echo "  -d, --dir DIR        Installation directory (default: /opt/nebula-command)"
    echo "  -v, --version VER    Version to install (default: latest)"
    echo "  --skip-docker        Skip Docker installation prompt"
    echo "  --skip-service       Skip PM2 service setup"
    echo ""
    echo "Environment Variables:"
    echo "  INSTALL_DIR          Installation directory"
    echo "  NEBULA_VERSION       Version to install"
    echo "  NEBULA_REPO_URL      Git repository URL"
    echo "  NODE_VERSION         Node.js version (default: 20)"
    echo ""
}

SKIP_DOCKER=false
SKIP_SERVICE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -d|--dir)
            INSTALL_DIR="$2"
            shift 2
            ;;
        -v|--version)
            NEBULA_VERSION="$2"
            shift 2
            ;;
        --skip-docker)
            SKIP_DOCKER=true
            shift
            ;;
        --skip-service)
            SKIP_SERVICE=true
            shift
            ;;
        *)
            log ERROR "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

main() {
    print_banner
    detect_os
    check_root
    check_requirements
    install_nebula
    create_env_template
    
    if [[ "$SKIP_SERVICE" != "true" ]]; then
        setup_service
    fi
    
    run_setup
    print_summary
}

main "$@"
