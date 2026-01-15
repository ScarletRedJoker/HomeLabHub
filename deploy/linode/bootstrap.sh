#!/bin/bash
#
# Nebula Command - Linode Bootstrap Script
# Services: Dashboard, Discord Bot, Stream Bot
#
# This script is idempotent - safe to run multiple times
# Handles first-run provisioning on fresh nodes
#

set -e

cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        log ERROR "Bootstrap failed with exit code $exit_code"
        log ERROR "Check $LOG_FILE for details"
    fi
}
trap cleanup EXIT

export NEBULA_ENV=linode
export NEBULA_ROLE=dashboard
export NEBULA_DIR="${NEBULA_DIR:-/opt/homelab/NebulaCommand}"
export LOG_DIR="${LOG_DIR:-/var/log/nebula}"
export LOG_FILE="${LOG_FILE:-$LOG_DIR/bootstrap.log}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    local level=$1
    shift
    local msg="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        INFO)  color=$GREEN ;;
        WARN)  color=$YELLOW ;;
        ERROR) color=$RED ;;
        *)     color=$NC ;;
    esac
    
    mkdir -p "$LOG_DIR" 2>/dev/null || true
    echo -e "${color}[$timestamp] [$level] $msg${NC}" | tee -a "$LOG_FILE" 2>/dev/null || echo "[$timestamp] [$level] $msg"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log ERROR "This script must be run as root"
        exit 1
    fi
}

detect_environment() {
    log INFO "Detecting environment..."
    
    if [[ -d /opt/homelab ]]; then
        log INFO "  Detected: Linode production server (existing installation)"
    elif hostname | grep -qi linode; then
        log INFO "  Detected: Linode (from hostname)"
    else
        log WARN "  Could not confirm Linode environment, proceeding anyway"
    fi
    
    export NEBULA_ENV=linode
}

create_directories() {
    log INFO "Creating required directories..."
    
    mkdir -p /opt/homelab
    mkdir -p /opt/homelab/NebulaCommand
    mkdir -p /opt/homelab/data
    mkdir -p /opt/homelab/secrets
    mkdir -p /opt/homelab/backups
    mkdir -p "$LOG_DIR"
    
    chmod 700 /opt/homelab/secrets
    
    log INFO "  Directories created"
}

check_and_install_tools() {
    log INFO "Checking required tools..."
    
    local missing_tools=()
    
    if ! command -v git &> /dev/null; then
        missing_tools+=("git")
    fi
    
    if ! command -v node &> /dev/null; then
        missing_tools+=("nodejs")
    fi
    
    if ! command -v npm &> /dev/null; then
        missing_tools+=("npm")
    fi
    
    if ! command -v docker &> /dev/null; then
        missing_tools+=("docker")
    fi
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        log INFO "  Installing missing tools: ${missing_tools[*]}"
        
        if command -v apt-get &> /dev/null; then
            apt-get update -qq
            
            for tool in "${missing_tools[@]}"; do
                case $tool in
                    nodejs|npm)
                        if ! command -v node &> /dev/null; then
                            log INFO "    Installing Node.js..."
                            curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
                            apt-get install -y nodejs
                        fi
                        ;;
                    docker)
                        log INFO "    Installing Docker..."
                        curl -fsSL https://get.docker.com | sh
                        systemctl enable docker
                        systemctl start docker
                        ;;
                    git)
                        apt-get install -y git
                        ;;
                esac
            done
        else
            log WARN "  apt-get not available, skipping tool installation"
        fi
    else
        log INFO "  All required tools present"
    fi
    
    if ! command -v pm2 &> /dev/null; then
        log INFO "  Installing PM2..."
        npm install -g pm2
    fi
}

clone_or_update_repo() {
    log INFO "Setting up repository..."
    
    local repo_url="${NEBULA_REPO_URL:-https://github.com/evindrake/NebulaCommand.git}"
    
    if [[ -d "$NEBULA_DIR/.git" ]]; then
        log INFO "  Repository exists, pulling latest..."
        cd "$NEBULA_DIR"
        git fetch origin 2>/dev/null || log WARN "  Git fetch failed (network issue?)"
        git reset --hard origin/main 2>/dev/null || git reset --hard origin/master 2>/dev/null || log WARN "  Git reset failed"
    elif [[ -n "$NEBULA_REPO_URL" ]] || [[ -n "$GITHUB_TOKEN" ]]; then
        log INFO "  Cloning repository..."
        if [[ -n "$GITHUB_TOKEN" ]]; then
            repo_url="https://${GITHUB_TOKEN}@github.com/evindrake/NebulaCommand.git"
        fi
        git clone "$repo_url" "$NEBULA_DIR" 2>/dev/null || log WARN "  Git clone failed"
    else
        log INFO "  No repository URL configured, skipping clone"
    fi
}

install_dependencies() {
    log INFO "Installing dependencies..."
    
    local services=("dashboard-next" "discord-bot" "stream-bot")
    
    for service in "${services[@]}"; do
        local service_dir="$NEBULA_DIR/services/$service"
        if [[ -d "$service_dir" ]] && [[ -f "$service_dir/package.json" ]]; then
            log INFO "  Installing deps for $service..."
            cd "$service_dir"
            npm ci --production 2>/dev/null || npm install --production 2>/dev/null || log WARN "    $service npm install failed"
        fi
    done
}

generate_secrets() {
    log INFO "Checking secrets..."
    
    local secrets_dir="/opt/homelab/secrets"
    local env_file="/opt/homelab/.env"
    
    if [[ ! -f "$secrets_dir/agent-token" ]]; then
        log INFO "  Generating agent token..."
        openssl rand -base64 32 | tr '+/' '-_' | tr -d '=' > "$secrets_dir/agent-token"
        chmod 600 "$secrets_dir/agent-token"
    fi
    
    if [[ ! -f "$env_file" ]]; then
        log WARN "  No .env file found, creating template..."
        cat > "$env_file" << 'EOF'
# Nebula Command Environment Configuration
# Copy this file and fill in the values

# Required
DATABASE_URL=
DISCORD_TOKEN=

# Optional
OPENAI_API_KEY=
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
EOF
        chmod 600 "$env_file"
        log WARN "  Please edit $env_file with your secrets"
    fi
}

load_secrets() {
    log INFO "Loading secrets..."
    
    local env_file="/opt/homelab/.env"
    local secrets_dir="/opt/homelab/secrets"
    
    if [[ -f "$env_file" ]]; then
        log INFO "  Loading from $env_file"
        set -a
        source "$env_file"
        set +a
    else
        log WARN "  No .env file found at $env_file"
    fi
    
    if [[ -d "$secrets_dir" ]]; then
        log INFO "  Loading from secrets directory"
        for secret_file in "$secrets_dir"/*; do
            if [[ -f "$secret_file" ]]; then
                local key=$(basename "$secret_file")
                local value=$(cat "$secret_file")
                # Convert hyphens to underscores for valid bash variable names
                key="${key//-/_}"
                key="${key^^}"  # uppercase
                export "$key"="$value"
            fi
        done
    fi
    
    local required_secrets=("DATABASE_URL" "DISCORD_TOKEN")
    local missing=()
    
    for secret in "${required_secrets[@]}"; do
        if [[ -z "${!secret}" ]]; then
            missing+=("$secret")
        fi
    done
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        log WARN "  Missing secrets: ${missing[*]}"
    else
        log INFO "  All required secrets loaded"
    fi
}

start_docker_services() {
    log INFO "Starting Docker services..."
    
    if ! command -v docker &> /dev/null; then
        log WARN "  Docker not installed, skipping"
        return
    fi
    
    systemctl start docker 2>/dev/null || true
    
    if [[ -f "$NEBULA_DIR/deploy/linode/docker-compose.yml" ]]; then
        cd "$NEBULA_DIR/deploy/linode"
        docker compose up -d 2>/dev/null || log WARN "  Some Docker services may have failed"
        log INFO "  Docker Compose services started"
    fi
}

start_pm2_services() {
    log INFO "Starting PM2 services..."
    
    if ! command -v pm2 &> /dev/null; then
        log WARN "  PM2 not installed, installing..."
        npm install -g pm2
    fi
    
    local ecosystem_file="$NEBULA_DIR/deploy/linode/ecosystem.config.js"
    
    if [[ -f "$ecosystem_file" ]]; then
        cd "$NEBULA_DIR/deploy/linode"
        pm2 start ecosystem.config.js --env production 2>/dev/null || pm2 restart all
        pm2 save
        log INFO "  PM2 services started"
    elif [[ -d "$NEBULA_DIR/services/dashboard-next" ]]; then
        log INFO "  Starting services individually..."
        
        cd "$NEBULA_DIR/services/dashboard-next"
        pm2 start npm --name "dashboard" -- run start 2>/dev/null || pm2 restart dashboard 2>/dev/null || log WARN "  Dashboard failed to start"
        
        if [[ -d "$NEBULA_DIR/services/discord-bot" ]]; then
            cd "$NEBULA_DIR/services/discord-bot"
            pm2 start npm --name "discord-bot" -- run start 2>/dev/null || pm2 restart discord-bot 2>/dev/null || log WARN "  Discord bot failed to start"
        fi
        
        if [[ -d "$NEBULA_DIR/services/stream-bot" ]]; then
            cd "$NEBULA_DIR/services/stream-bot"
            pm2 start npm --name "stream-bot" -- run start 2>/dev/null || pm2 restart stream-bot 2>/dev/null || log WARN "  Stream bot failed to start"
        fi
        
        pm2 save
    else
        log WARN "  No services found to start"
    fi
}

start_caddy() {
    log INFO "Starting Caddy..."
    
    if systemctl list-unit-files | grep -q caddy; then
        systemctl start caddy
        log INFO "  Caddy: $(systemctl is-active caddy)"
    else
        log WARN "  Caddy not installed"
    fi
}

register_with_registry() {
    log INFO "Registering with service registry..."
    
    if [[ -z "$DATABASE_URL" ]]; then
        log WARN "  Skipping registration (no DATABASE_URL)"
        return
    fi
    
    if [[ ! -d "$NEBULA_DIR/services/dashboard-next" ]]; then
        log WARN "  Skipping registration (dashboard not installed)"
        return
    fi
    
    cd "$NEBULA_DIR/services/dashboard-next"
    
    node -e "
        const { bootstrap } = require('./lib/env-bootstrap');
        bootstrap().then(result => {
            console.log('Registration:', result.ready ? 'SUCCESS' : 'FAILED');
            if (result.errors.length > 0) {
                console.log('Errors:', result.errors);
            }
        }).catch(err => {
            console.log('Registration failed:', err.message);
        });
    " 2>/dev/null || log WARN "  Service registration skipped (node not available or error)"
}

verify_services() {
    log INFO "Verifying services..."
    
    sleep 5
    
    local services=("dashboard:5000" "discord-bot:4000" "stream-bot:3000")
    
    for service in "${services[@]}"; do
        local name="${service%%:*}"
        local port="${service##*:}"
        
        if curl -s "http://localhost:$port/api/health" > /dev/null 2>&1; then
            log INFO "  $name: healthy"
        else
            log WARN "  $name: not responding (may still be starting)"
        fi
    done
    
    if command -v tailscale &> /dev/null; then
        local ts_ip=$(tailscale ip -4 2>/dev/null || echo "not connected")
        log INFO "  Tailscale IP: $ts_ip"
    fi
}

print_summary() {
    echo ""
    log INFO "=========================================="
    log INFO "Linode Bootstrap Complete"
    log INFO "=========================================="
    echo ""
    
    if command -v pm2 &> /dev/null; then
        pm2 list
    fi
    
    echo ""
    log INFO "Access Dashboard: https://${DASHBOARD_DOMAIN:-localhost}"
    log INFO "Logs: $LOG_FILE"
    echo ""
}

main() {
    echo ""
    log INFO "=========================================="
    log INFO "Nebula Command - Linode Bootstrap"
    log INFO "Environment: $NEBULA_ENV | Role: $NEBULA_ROLE"
    log INFO "=========================================="
    echo ""
    
    check_root
    detect_environment
    create_directories
    check_and_install_tools
    clone_or_update_repo
    install_dependencies
    generate_secrets
    load_secrets
    start_docker_services
    start_pm2_services
    start_caddy
    register_with_registry
    verify_services
    print_summary
}

main "$@"
