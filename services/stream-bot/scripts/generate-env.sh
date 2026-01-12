#!/bin/bash
# StreamBot Unified Environment Generator
# Creates a single .env file that works for ALL deployment scenarios

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Header
echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   StreamBot Environment Generator    ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""

# Helper functions
log_info() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_section() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# Generate secure random string
generate_secret() {
    if command -v openssl &> /dev/null; then
        openssl rand -base64 32
    else
        head -c 32 /dev/urandom | base64
    fi
}

# Generate password
generate_password() {
    if command -v openssl &> /dev/null; then
        openssl rand -base64 24 | tr -d "=+/" | cut -c1-20
    else
        head -c 20 /dev/urandom | base64 | tr -d "=+/" | cut -c1-20
    fi
}

# Prompt with default
prompt() {
    local prompt="$1"
    local default="$2"
    local value
    read -p "$(echo -e ${BLUE}${prompt}${NC} [${default}]: )" value
    echo "${value:-$default}"
}

# Prompt yes/no
prompt_yn() {
    local prompt="$1"
    read -p "$(echo -e ${BLUE}${prompt}${NC} (y/N): )" value
    [[ "$value" =~ ^[Yy]$ ]]
}

# Check existing .env
if [ -f .env ]; then
    log_section "Existing Configuration Found"
    log_warn ".env file already exists"
    if prompt_yn "Backup and create new .env?"; then
        BACKUP=".env.backup.$(date +%Y%m%d_%H%M%S)"
        mv .env "$BACKUP"
        log_info "Backed up to $BACKUP"
    else
        log_info "Keeping existing .env"
        exit 0
    fi
fi

# Detect deployment type
log_section "Deployment Configuration"
echo "Select deployment type:"
echo "  1. Replit (automatic secrets, AI integrations)"
echo "  2. Docker/Self-hosted (manual configuration)"
echo ""
read -p "$(echo -e ${BLUE}Choice${NC} [1]: )" DEPLOY_TYPE
DEPLOY_TYPE="${DEPLOY_TYPE:-1}"

IS_REPLIT=false
[ "$DEPLOY_TYPE" = "1" ] && IS_REPLIT=true

# Database
log_section "Database Configuration"
if [ "$IS_REPLIT" = true ]; then
    log_info "Replit provides DATABASE_URL automatically"
    DB_CONFIG="# Automatically provided by Replit via DATABASE_URL secret"
else
    DB_USER=$(prompt "Database username" "streambot")
    DB_PASSWORD=$(generate_password)
    log_info "Generated secure password"
    DB_HOST=$(prompt "Database host" "postgres")
    DB_PORT=$(prompt "Database port" "5432")
    DB_NAME=$(prompt "Database name" "streambot")
    DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
fi

# Session Secret
log_section "Security Configuration"
if [ "$IS_REPLIT" = true ]; then
    log_info "Replit provides SESSION_SECRET automatically"
    SESSION_CONFIG="# Automatically provided by Replit via SESSION_SECRET secret"
else
    SESSION_SECRET=$(generate_secret)
    log_info "Generated secure session secret"
fi

# OpenAI
log_section "AI Integration"
if [ "$IS_REPLIT" = true ]; then
    log_info "Using Replit AI Integrations (automatic)"
    OPENAI_CONFIG="# Automatically provided by Replit AI Integrations"
else
    if prompt_yn "Configure OpenAI API key now?"; then
        read -p "$(echo -e ${BLUE}OpenAI API key:${NC} )" OPENAI_KEY
        log_info "OpenAI API key configured"
    else
        log_warn "Skipping OpenAI (add to .env later)"
        OPENAI_KEY=""
    fi
fi

# Production domain
log_section "Domain Configuration"
if [ "$IS_REPLIT" = true ]; then
    DOMAIN=""
    log_info "Domain auto-detected on Replit"
else
    DOMAIN=$(prompt "Production domain" "stream.evindrake.net")
fi

# Create .env
log_section "Writing Configuration"

cat > .env << EOF
# StreamBot Environment Configuration
# Generated: $(date)
# Deployment: $([ "$IS_REPLIT" = true ] && echo "Replit" || echo "Docker/Self-hosted")

# ======================
# Application Settings
# ======================
NODE_ENV=production
PORT=5000
$([ -n "$DOMAIN" ] && echo "PRODUCTION_DOMAIN=$DOMAIN" || echo "# PRODUCTION_DOMAIN= (auto-detected)")

# ======================
# Database Configuration
# ======================
EOF

if [ "$IS_REPLIT" = true ]; then
    cat >> .env << EOF
$DB_CONFIG
EOF
else
    cat >> .env << EOF
DATABASE_URL=$DB_URL
PGHOST=$DB_HOST
PGPORT=$DB_PORT
PGUSER=$DB_USER
PGPASSWORD=$DB_PASSWORD
PGDATABASE=$DB_NAME
EOF
fi

cat >> .env << EOF

# ======================
# Session Management
# ======================
EOF

if [ "$IS_REPLIT" = true ]; then
    cat >> .env << EOF
$SESSION_CONFIG
EOF
else
    cat >> .env << EOF
SESSION_SECRET=$SESSION_SECRET
EOF
fi

cat >> .env << EOF

# ======================
# OpenAI Integration
# ======================
EOF

if [ "$IS_REPLIT" = true ]; then
    cat >> .env << EOF
$OPENAI_CONFIG
EOF
else
    if [ -n "$OPENAI_KEY" ]; then
        cat >> .env << EOF
OPENAI_API_KEY=$OPENAI_KEY
OPENAI_BASE_URL=https://api.openai.com/v1
EOF
    else
        cat >> .env << EOF
# Add your OpenAI API key here:
# OPENAI_API_KEY=sk-your-key-here
# OPENAI_BASE_URL=https://api.openai.com/v1
EOF
    fi
fi

cat >> .env << EOF

# ======================
# Advanced Settings
# ======================
LOG_LEVEL=info
WS_PING_INTERVAL=30000
BOT_HEALTH_CHECK_INTERVAL=60000
EOF

log_info ".env file created successfully!"

# Summary
log_section "Configuration Summary"
echo ""
if [ "$IS_REPLIT" = true ]; then
    echo -e "${GREEN}Replit Deployment${NC}"
    echo "  • Database: Auto-provided via DATABASE_URL secret"
    echo "  • Session: Auto-provided via SESSION_SECRET secret"
    echo "  • OpenAI: Uses Replit AI Integrations"
    echo "  • Domain: Auto-detected from Replit environment"
else
    echo -e "${GREEN}Docker/Self-hosted Deployment${NC}"
    echo "  • Database: $DB_HOST:$DB_PORT/$DB_NAME"
    echo "  • User: $DB_USER"
    echo "  • Password: [generated]"
    echo "  • Session Secret: [generated]"
    [ -n "$OPENAI_KEY" ] && echo "  • OpenAI: [configured]" || echo "  • OpenAI: [not configured - add to .env]"
    [ -n "$DOMAIN" ] && echo "  • Domain: $DOMAIN"
fi
echo ""
echo -e "${YELLOW}IMPORTANT:${NC}"
echo "  1. Review .env and adjust if needed"
if [ "$IS_REPLIT" = false ]; then
    echo "  2. For unified homelab deployment, prefix variables:"
    echo "     STREAMBOT_DATABASE_URL, STREAMBOT_SESSION_SECRET, etc."
    echo "  3. Change default admin password after first login:"
    echo "     admin@streambot.local / admin123"
fi
echo ""
echo -e "${GREEN}Next steps:${NC}"
if [ "$IS_REPLIT" = true ]; then
    echo "  1. Ensure DATABASE_URL and SESSION_SECRET are in Replit Secrets"
    echo "  2. Click 'Run' to start the application"
    echo "  3. Access dashboard and connect platforms"
else
    echo "  1. Start: docker-compose up -d"
    echo "  2. Access: https://${DOMAIN:-localhost:5000}"
    echo "  3. Logs: docker-compose logs -f"
fi
echo ""
