#!/bin/bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $*"; }

print_banner() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}       ${BOLD}Nebula Command - One-Command Setup${NC}                      ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}       Easy enough for a monkey 🐵                            ${CYAN}║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

detect_environment() {
    log_step "Detecting environment..."
    
    if [[ -n "${REPL_SLUG:-}" ]] || [[ -d "/home/runner" ]]; then
        DETECTED_ENV="replit"
        log_info "Detected: Replit environment"
    elif [[ -f "/etc/os-release" ]] && grep -q "Ubuntu" /etc/os-release; then
        if [[ -d "/opt/homelab" ]] || hostname | grep -q "linode"; then
            DETECTED_ENV="linode"
            log_info "Detected: Linode (Ubuntu cloud)"
        else
            DETECTED_ENV="ubuntu-home"
            log_info "Detected: Ubuntu Home Server"
        fi
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ -n "${WINDIR:-}" ]]; then
        DETECTED_ENV="windows"
        log_info "Detected: Windows environment"
    else
        DETECTED_ENV="unknown"
        log_warn "Unknown environment, assuming Linux"
    fi
    
    export DETECTED_ENV
}

check_dependencies() {
    log_step "Checking dependencies..."
    local missing=()
    
    if ! command -v node &> /dev/null; then
        missing+=("Node.js")
    else
        local node_version=$(node -v | sed 's/v//' | cut -d. -f1)
        if [[ "$node_version" -lt 18 ]]; then
            log_warn "Node.js version is $node_version, recommend 18+"
        else
            log_info "Node.js: $(node -v)"
        fi
    fi
    
    if ! command -v npm &> /dev/null; then
        missing+=("npm")
    else
        log_info "npm: $(npm -v)"
    fi
    
    if command -v psql &> /dev/null; then
        log_info "PostgreSQL client: $(psql --version | head -1)"
    elif [[ -n "${DATABASE_URL:-}" ]]; then
        log_info "PostgreSQL: Using external database"
    else
        log_warn "PostgreSQL not found locally (ok if using Neon/external DB)"
    fi
    
    if command -v git &> /dev/null; then
        log_info "Git: $(git --version)"
    else
        missing+=("git")
    fi
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Missing dependencies: ${missing[*]}"
        echo ""
        echo "Install missing dependencies:"
        echo "  Ubuntu/Debian: sudo apt install nodejs npm postgresql git"
        echo "  macOS: brew install node postgresql git"
        echo "  Windows: Use chocolatey or download from official sites"
        exit 1
    fi
    
    log_info "All required dependencies found!"
}

setup_env_file() {
    log_step "Setting up environment file..."
    
    local env_file="$PROJECT_ROOT/.env"
    local env_example="$PROJECT_ROOT/.env.example"
    
    if [[ -f "$env_file" ]]; then
        log_info "Found existing .env file"
        read -p "Use existing .env? [Y/n] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            mv "$env_file" "$env_file.backup.$(date +%Y%m%d_%H%M%S)"
            log_info "Backed up existing .env"
            cp "$env_example" "$env_file"
            log_info "Created new .env from .env.example"
        fi
    else
        if [[ -f "$env_example" ]]; then
            cp "$env_example" "$env_file"
            log_info "Created .env from .env.example"
        else
            log_error "No .env.example found!"
            exit 1
        fi
    fi
    
    chmod 600 "$env_file" 2>/dev/null || true
    
    if [[ "$DETECTED_ENV" == "replit" ]]; then
        log_info "Replit detected - using Replit Secrets for sensitive values"
        return 0
    fi
    
    prompt_required_vars
}

prompt_required_vars() {
    local env_file="$PROJECT_ROOT/.env"
    
    source "$env_file" 2>/dev/null || true
    
    echo ""
    echo -e "${CYAN}━━━ Required Variables ━━━${NC}"
    echo "Press Enter to keep existing value, or type new value"
    echo ""
    
    if [[ -z "${SESSION_SECRET:-}" ]] || [[ "$SESSION_SECRET" == "YOUR_SESSION_SECRET" ]]; then
        local new_secret=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 64)
        sed -i "s/SESSION_SECRET=.*/SESSION_SECRET=$new_secret/" "$env_file"
        log_info "Generated SESSION_SECRET"
    fi
    
    if [[ -z "${POSTGRES_PASSWORD:-}" ]] || [[ "$POSTGRES_PASSWORD" == "YOUR_POSTGRES_PASSWORD" ]]; then
        read -p "PostgreSQL password (or press Enter to generate): " pg_pass
        if [[ -z "$pg_pass" ]]; then
            pg_pass=$(openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)
        fi
        sed -i "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$pg_pass/" "$env_file"
        log_info "Set POSTGRES_PASSWORD"
    fi
    
    if [[ -z "${DISCORD_BOT_TOKEN:-}" ]] || [[ "$DISCORD_BOT_TOKEN" == "YOUR_DISCORD_BOT_TOKEN" ]]; then
        echo ""
        echo "Get Discord bot token from: https://discord.com/developers/applications"
        read -p "Discord Bot Token (or Enter to skip): " discord_token
        if [[ -n "$discord_token" ]]; then
            sed -i "s/DISCORD_BOT_TOKEN=.*/DISCORD_BOT_TOKEN=$discord_token/" "$env_file"
            log_info "Set DISCORD_BOT_TOKEN"
        fi
    fi
    
    if [[ -z "${OPENAI_API_KEY:-}" ]] || [[ "$OPENAI_API_KEY" == *"YOUR_"* ]]; then
        echo ""
        echo "Get OpenAI API key from: https://platform.openai.com/api-keys"
        read -p "OpenAI API Key (or Enter to skip): " openai_key
        if [[ -n "$openai_key" ]]; then
            sed -i "s/OPENAI_API_KEY=.*/OPENAI_API_KEY=$openai_key/" "$env_file"
            log_info "Set OPENAI_API_KEY"
        fi
    fi
    
    log_info "Environment file configured!"
}

install_dependencies() {
    log_step "Installing dependencies for all services..."
    
    cd "$PROJECT_ROOT"
    
    local services=(
        "services/dashboard-next"
        "services/discord-bot"
        "services/stream-bot"
    )
    
    for service in "${services[@]}"; do
        if [[ -f "$PROJECT_ROOT/$service/package.json" ]]; then
            log_info "Installing: $service"
            cd "$PROJECT_ROOT/$service"
            npm install --legacy-peer-deps 2>/dev/null || npm install
            cd "$PROJECT_ROOT"
        fi
    done
    
    log_info "All dependencies installed!"
}

run_migrations() {
    log_step "Running database migrations..."
    
    local env_file="$PROJECT_ROOT/.env"
    source "$env_file" 2>/dev/null || true
    
    if [[ -z "${DATABASE_URL:-}" ]]; then
        log_warn "DATABASE_URL not set, skipping migrations"
        log_info "Set DATABASE_URL in .env and run: npm run db:push (in service directories)"
        return 0
    fi
    
    if [[ -f "$PROJECT_ROOT/services/dashboard-next/package.json" ]]; then
        cd "$PROJECT_ROOT/services/dashboard-next"
        if grep -q "db:push" package.json; then
            log_info "Running dashboard migrations..."
            npm run db:push 2>/dev/null || log_warn "Dashboard migration skipped"
        fi
    fi
    
    if [[ -f "$PROJECT_ROOT/services/discord-bot/package.json" ]]; then
        cd "$PROJECT_ROOT/services/discord-bot"
        if grep -q "db:push" package.json; then
            log_info "Running discord-bot migrations..."
            npm run db:push 2>/dev/null || log_warn "Discord-bot migration skipped"
        fi
    fi
    
    if [[ -f "$PROJECT_ROOT/services/stream-bot/package.json" ]]; then
        cd "$PROJECT_ROOT/services/stream-bot"
        if grep -q "db:push" package.json; then
            log_info "Running stream-bot migrations..."
            npm run db:push 2>/dev/null || log_warn "Stream-bot migration skipped"
        fi
    fi
    
    cd "$PROJECT_ROOT"
    log_info "Migrations complete!"
}

print_next_steps() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}                    ${BOLD}Setup Complete!${NC}                            ${CYAN}║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}Next Steps:${NC}"
    echo ""
    echo "1. Review and update .env file:"
    echo "   ${CYAN}nano .env${NC}"
    echo ""
    echo "2. Start services (choose one):"
    echo "   ${CYAN}# Dashboard${NC}"
    echo "   cd services/dashboard-next && npm run dev"
    echo ""
    echo "   ${CYAN}# Discord Bot${NC}"
    echo "   cd services/discord-bot && npm run dev"
    echo ""
    echo "   ${CYAN}# Stream Bot${NC}"
    echo "   cd services/stream-bot && npm run dev"
    echo ""
    echo "3. Deploy to production:"
    echo "   ${CYAN}./scripts/deploy.sh linode${NC}   # Deploy to cloud"
    echo "   ${CYAN}./scripts/deploy.sh home${NC}     # Deploy to home server"
    echo "   ${CYAN}./scripts/deploy.sh all${NC}      # Deploy everywhere"
    echo ""
    echo "4. Read the full documentation:"
    echo "   ${CYAN}docs/SETUP.md${NC}"
    echo ""
    
    if [[ "$DETECTED_ENV" == "replit" ]]; then
        echo -e "${YELLOW}Replit Users:${NC}"
        echo "   - Add secrets via Replit Secrets panel (lock icon)"
        echo "   - Click 'Run' to start the dashboard"
        echo ""
    fi
    
    echo -e "${GREEN}Happy hacking! 🚀${NC}"
}

main() {
    print_banner
    
    detect_environment
    check_dependencies
    setup_env_file
    install_dependencies
    run_migrations
    print_next_steps
}

if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    echo "Nebula Command Setup Script"
    echo ""
    echo "Usage: ./scripts/setup.sh [options]"
    echo ""
    echo "Options:"
    echo "  --help, -h    Show this help message"
    echo "  --skip-deps   Skip dependency installation"
    echo "  --skip-db     Skip database migrations"
    echo ""
    exit 0
fi

main "$@"
