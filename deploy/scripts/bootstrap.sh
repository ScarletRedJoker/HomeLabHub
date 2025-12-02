#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# HOMELAB BOOTSTRAP - Role-Based, Idempotent, Self-Healing
# ═══════════════════════════════════════════════════════════════════
# One script to rule them all. Run on any server with role specification.
# Safe to run multiple times - it only changes what needs changing.
#
# Usage:
#   ./deploy/scripts/bootstrap.sh --role cloud    # Linode cloud server
#   ./deploy/scripts/bootstrap.sh --role local    # Local Ubuntu host
#   ./deploy/scripts/bootstrap.sh                 # Auto-detect role
#
# Options:
#   --role cloud|local  Specify deployment role
#   --skip-cron         Skip self-healing cron setup
#   --generate-secrets  Auto-generate all missing secrets
#   --hostname NAME     Set custom hostname for service URLs
#
# Features:
#   - Role-based service deployment
#   - Docker & Docker Compose verification
#   - Auto-generation of secrets
#   - Tailscale VPN integration
#   - Self-healing cron job installation
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Detect project root - use script location, no hardcoded paths
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Default values
ROLE=""
SKIP_CRON=false
GENERATE_SECRETS=false
CUSTOM_HOSTNAME=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --role)
            ROLE="$2"
            shift 2
            ;;
        --skip-cron)
            SKIP_CRON=true
            shift
            ;;
        --generate-secrets)
            GENERATE_SECRETS=true
            shift
            ;;
        --hostname)
            CUSTOM_HOSTNAME="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

# Auto-detect role if not specified
if [ -z "$ROLE" ]; then
    if [ -f "/etc/tailscale/tailscaled.env" ] 2>/dev/null; then
        # Check if we're on Linode (cloud) or local
        if curl -s --max-time 2 http://169.254.169.254/v1/instance-id &>/dev/null; then
            ROLE="cloud"
        else
            ROLE="local"
        fi
    else
        # Default to cloud for new deployments
        ROLE="cloud"
    fi
fi

# Validate role
if [[ ! "$ROLE" =~ ^(cloud|local)$ ]]; then
    echo -e "${RED}✗ Invalid role: $ROLE${NC}"
    echo "Valid roles: cloud, local"
    exit 1
fi

# Verify we're in a valid project directory
if [ ! -f "$PROJECT_ROOT/docker-compose.yml" ]; then
    echo -e "${RED}✗ Not a valid HomeLabHub directory${NC}"
    echo "Could not find docker-compose.yml in $PROJECT_ROOT"
    exit 1
fi

cd "$PROJECT_ROOT"

echo -e "${CYAN}"
echo "═══════════════════════════════════════════════════════════════"
echo "  HOMELAB BOOTSTRAP - ${MAGENTA}$ROLE${CYAN} deployment"
echo "  Project: $PROJECT_ROOT"
echo "═══════════════════════════════════════════════════════════════"
echo -e "${NC}"

# ═══════════════════════════════════════════════════════════════════
# STEP 1: Verify Docker
# ═══════════════════════════════════════════════════════════════════
echo -e "${CYAN}[1/7] Checking Docker...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker not installed${NC}"
    echo "Install with: curl -fsSL https://get.docker.com | sh"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo -e "${RED}✗ Docker daemon not running${NC}"
    echo "Start with: sudo systemctl start docker"
    exit 1
fi

if ! command -v docker compose &> /dev/null; then
    echo -e "${RED}✗ Docker Compose not installed${NC}"
    echo "Update Docker to latest version"
    exit 1
fi

echo -e "${GREEN}✓ Docker ready${NC}"

# ═══════════════════════════════════════════════════════════════════
# STEP 2: Check Tailscale (for multi-server setup)
# ═══════════════════════════════════════════════════════════════════
echo -e "\n${CYAN}[2/7] Checking Tailscale VPN...${NC}"

TAILSCALE_IP=""
if command -v tailscale &> /dev/null; then
    # Try to get Tailscale IP - this only works when connected
    TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "")
    if [ -n "$TAILSCALE_IP" ]; then
        echo -e "${GREEN}✓ Tailscale connected: $TAILSCALE_IP${NC}"
    else
        # Double-check with status command
        if tailscale status &>/dev/null; then
            TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "")
            echo -e "${GREEN}✓ Tailscale connected: $TAILSCALE_IP${NC}"
        else
            echo -e "${YELLOW}⚠ Tailscale installed but not connected${NC}"
            echo "  Run: sudo tailscale up --authkey=YOUR_KEY"
        fi
    fi
else
    echo -e "${YELLOW}⚠ Tailscale not installed (optional for single-server)${NC}"
    echo "  Install: curl -fsSL https://tailscale.com/install.sh | sh"
fi

# ═══════════════════════════════════════════════════════════════════
# STEP 3: Setup Environment
# ═══════════════════════════════════════════════════════════════════
echo -e "\n${CYAN}[3/7] Setting up environment...${NC}"

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo "Creating .env from .env.example..."
        cp .env.example .env
        chmod 600 .env
        
        if [ "$GENERATE_SECRETS" = true ]; then
            echo "Auto-generating secrets..."
        else
            echo -e "${YELLOW}⚠ Created .env - please update with your credentials!${NC}"
            echo "Or run with --generate-secrets to auto-generate passwords"
            echo ""
            echo "Required variables:"
            echo "  POSTGRES_PASSWORD, DISCORD_DB_PASSWORD, STREAMBOT_DB_PASSWORD"
            echo "  JARVIS_DB_PASSWORD, WEB_USERNAME, WEB_PASSWORD"
            echo ""
            exit 1
        fi
    else
        echo -e "${RED}✗ No .env or .env.example found${NC}"
        exit 1
    fi
fi

# Function to generate a secure password
generate_password() {
    openssl rand -base64 24 | tr -d '/+=' | head -c 32
}

# Function to set env var if empty or missing
set_env_if_empty() {
    local var_name="$1"
    local default_value="${2:-$(generate_password)}"
    
    if ! grep -q "^${var_name}=" .env; then
        echo "${var_name}=${default_value}" >> .env
        echo -e "  ${GREEN}+ Generated ${var_name}${NC}"
        return 0
    elif [ -z "$(grep "^${var_name}=" .env | cut -d'=' -f2-)" ]; then
        sed -i "s|^${var_name}=.*|${var_name}=${default_value}|" .env
        echo -e "  ${GREEN}+ Generated ${var_name}${NC}"
        return 0
    fi
    return 1
}

# Auto-generate secrets if requested or if values are empty
if [ "$GENERATE_SECRETS" = true ]; then
    echo "Generating missing secrets..."
    set_env_if_empty "POSTGRES_PASSWORD" || true
    set_env_if_empty "DISCORD_DB_PASSWORD" || true
    set_env_if_empty "STREAMBOT_DB_PASSWORD" || true
    set_env_if_empty "JARVIS_DB_PASSWORD" || true
    set_env_if_empty "WEB_PASSWORD" || true
    set_env_if_empty "SESSION_SECRET" "$(openssl rand -hex 32)" || true
    set_env_if_empty "SECRET_KEY" "$(openssl rand -hex 32)" || true
    set_env_if_empty "DASHBOARD_API_KEY" "$(openssl rand -hex 24)" || true
    set_env_if_empty "DISCORD_SESSION_SECRET" "$(openssl rand -hex 32)" || true
    set_env_if_empty "STREAMBOT_SESSION_SECRET" "$(openssl rand -hex 32)" || true
    set_env_if_empty "CODE_SERVER_PASSWORD" || true
fi

# Always generate SERVICE_AUTH_TOKEN if missing
set_env_if_empty "SERVICE_AUTH_TOKEN" "$(openssl rand -hex 32)" || true

# Set Tailscale IP in .env if detected
if [ -n "$TAILSCALE_IP" ]; then
    if [ "$ROLE" = "cloud" ]; then
        set_env_if_empty "TAILSCALE_LINODE_HOST" "$TAILSCALE_IP" || true
    else
        set_env_if_empty "TAILSCALE_LOCAL_HOST" "$TAILSCALE_IP" || true
    fi
fi

# Validate required variables
# WEB_USERNAME must always be provided (cannot be auto-generated)
# Other secrets can be auto-generated
required_manual=("WEB_USERNAME")
required_secrets=("POSTGRES_PASSWORD" "DISCORD_DB_PASSWORD" "STREAMBOT_DB_PASSWORD" "JARVIS_DB_PASSWORD" "WEB_PASSWORD")
missing=()
missing_secrets=()

# Check manual requirements (cannot be auto-generated)
for var in "${required_manual[@]}"; do
    if ! grep -q "^${var}=" .env || [ -z "$(grep "^${var}=" .env | cut -d'=' -f2-)" ]; then
        missing+=("$var")
    fi
done

# Check secrets (can be auto-generated if --generate-secrets is used)
for var in "${required_secrets[@]}"; do
    if ! grep -q "^${var}=" .env || [ -z "$(grep "^${var}=" .env | cut -d'=' -f2-)" ]; then
        missing_secrets+=("$var")
    fi
done

# Report manual variables that must be set
if [ ${#missing[@]} -gt 0 ]; then
    echo -e "${RED}✗ Missing required variables (cannot be auto-generated):${NC}"
    for var in "${missing[@]}"; do
        echo "  - $var"
    done
    echo ""
    echo "Edit .env to set these values manually"
    exit 1
fi

# Report missing secrets (can be auto-generated)
if [ ${#missing_secrets[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠ Missing secret variables:${NC}"
    for var in "${missing_secrets[@]}"; do
        echo "  - $var"
    done
    echo ""
    echo "Re-run with --generate-secrets to auto-generate passwords"
    exit 1
fi

echo -e "${GREEN}✓ Environment ready${NC}"

# Re-source environment after generation so preflight sees updated values
# This ensures check_env_var sees any auto-generated secrets
export $(grep -v '^#' .env | grep -v '^$' | xargs 2>/dev/null) 2>/dev/null || true

# ═══════════════════════════════════════════════════════════════════
# STEP 3.5: PREFLIGHT VALIDATION - Role-Aware Checks
# ═══════════════════════════════════════════════════════════════════
# This runs AFTER secret generation so auto-generated values are available
echo -e "\n${CYAN}[3.5/7] Running preflight validation for ${MAGENTA}$ROLE${CYAN} role...${NC}"

# Track validation status
PREFLIGHT_WARNINGS=()
PREFLIGHT_ERRORS=()

# Helper: Check if env var is set and non-empty (not a placeholder)
check_env_var() {
    local var_name="$1"
    local required="$2"  # "required" or "optional"
    local context="$3"   # Description of what it's for
    
    local value=$(grep "^${var_name}=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'")
    
    # Skip placeholders
    if [[ "$value" == "YOUR_"* ]] || [[ "$value" == "sk-proj-YOUR_"* ]]; then
        value=""
    fi
    
    if [ -z "$value" ]; then
        if [ "$required" = "required" ]; then
            PREFLIGHT_ERRORS+=("$var_name - Required for: $context")
            return 1
        else
            PREFLIGHT_WARNINGS+=("$var_name - Optional for: $context")
            return 1
        fi
    fi
    return 0
}

# ═══════════════════════════════════════════════════════════════════
# CLOUD ROLE PREFLIGHT CHECKS
# ═══════════════════════════════════════════════════════════════════
if [ "$ROLE" = "cloud" ]; then
    echo "Validating cloud deployment requirements..."
    
    # AI Features - Required for Jarvis/Discord AI (cannot be auto-generated)
    check_env_var "OPENAI_API_KEY" "required" "Jarvis AI assistant, Discord bot AI features"
    
    # Discord Bot - Required (cannot be auto-generated)
    check_env_var "DISCORD_BOT_TOKEN" "required" "Discord bot authentication"
    check_env_var "DISCORD_CLIENT_ID" "required" "Discord OAuth login"
    check_env_var "DISCORD_CLIENT_SECRET" "required" "Discord OAuth login"
    
    # Multi-Host Routing - Important for local services
    LOCAL_TS_IP=$(grep "^LOCAL_TAILSCALE_IP=" .env 2>/dev/null | cut -d'=' -f2 | tr -d '"')
    if [ -z "$LOCAL_TS_IP" ] || [ "$LOCAL_TS_IP" = "100.64.0.1" ]; then
        PREFLIGHT_WARNINGS+=("LOCAL_TAILSCALE_IP - Set to your Ubuntu host's Tailscale IP for Plex/GameStream routing")
    else
        echo -e "  ${GREEN}✓${NC} LOCAL_TAILSCALE_IP configured: $LOCAL_TS_IP"
    fi
    
    # DNS Management - Optional but recommended
    check_env_var "CLOUDFLARE_API_TOKEN" "optional" "Automatic DNS management"
    
    # Stream Bot OAuth - Optional
    check_env_var "TWITCH_CLIENT_ID" "optional" "Twitch stream integration"
    check_env_var "YOUTUBE_CLIENT_ID" "optional" "YouTube stream integration"
    check_env_var "SPOTIFY_CLIENT_ID" "optional" "Spotify music integration"
fi

# ═══════════════════════════════════════════════════════════════════
# LOCAL ROLE PREFLIGHT CHECKS
# ═══════════════════════════════════════════════════════════════════
if [ "$ROLE" = "local" ]; then
    echo "Validating local deployment requirements..."
    
    # Plex - Optional but common
    check_env_var "PLEX_TOKEN" "optional" "Plex API access"
    
    # Sunshine GameStream - Check setup
    if [ -f "$PROJECT_ROOT/compose.local.yml" ]; then
        echo "  Checking Sunshine GameStream setup..."
        check_env_var "SUNSHINE_PASS" "optional" "GameStream web UI login"
    fi
    
    # Home Assistant - Optional
    check_env_var "HOME_ASSISTANT_TOKEN" "optional" "Home Assistant API access"
    
    # Cloud Connectivity - Important for multi-host
    CLOUD_TS_IP=$(grep "^TAILSCALE_LINODE_HOST=" .env 2>/dev/null | cut -d'=' -f2 | tr -d '"')
    if [ -z "$CLOUD_TS_IP" ]; then
        PREFLIGHT_WARNINGS+=("TAILSCALE_LINODE_HOST - Set to your Linode's Tailscale IP for cloud database access")
    else
        echo -e "  ${GREEN}✓${NC} TAILSCALE_LINODE_HOST configured: $CLOUD_TS_IP"
    fi
fi

# ═══════════════════════════════════════════════════════════════════
# PREFLIGHT REPORT
# ═══════════════════════════════════════════════════════════════════
echo ""

# Show warnings (non-blocking)
if [ ${#PREFLIGHT_WARNINGS[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠ Optional Configuration (features may be limited):${NC}"
    for warning in "${PREFLIGHT_WARNINGS[@]}"; do
        echo "  - $warning"
    done
    echo ""
fi

# Show errors (blocking)
if [ ${#PREFLIGHT_ERRORS[@]} -gt 0 ]; then
    echo -e "${RED}✗ PREFLIGHT FAILED - Missing required configuration:${NC}"
    for error in "${PREFLIGHT_ERRORS[@]}"; do
        echo -e "  ${RED}✗${NC} $error"
    done
    echo ""
    echo -e "${YELLOW}How to fix:${NC}"
    echo "  1. Edit .env file: nano $PROJECT_ROOT/.env"
    echo "  2. Set all required values listed above"
    echo "  3. Re-run: ./deploy/scripts/bootstrap.sh --role $ROLE"
    echo ""
    echo -e "${CYAN}Quick links:${NC}"
    echo "  OpenAI API Key:  https://platform.openai.com/api-keys"
    echo "  Discord Dev:     https://discord.com/developers/applications"
    echo "  Cloudflare:      https://dash.cloudflare.com/profile/api-tokens"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ Preflight validation passed${NC}"

# ═══════════════════════════════════════════════════════════════════
# STEP 4: Create Required Directories
# ═══════════════════════════════════════════════════════════════════
echo -e "\n${CYAN}[4/7] Creating required directories...${NC}"

# Read host path configuration from .env (with defaults)
HOST_STATIC_SITE=$(grep "^HOST_STATIC_SITE_PATH=" .env 2>/dev/null | cut -d'=' -f2 || echo "$PROJECT_ROOT/static-sites")

# Create all required directories relative to project
mkdir -p "$HOST_STATIC_SITE" 2>/dev/null || true
mkdir -p "$PROJECT_ROOT/static-sites" 2>/dev/null || true
mkdir -p "$PROJECT_ROOT/services/dashboard/logs" 2>/dev/null || true
mkdir -p "$PROJECT_ROOT/services/discord-bot/logs" 2>/dev/null || true
mkdir -p "$PROJECT_ROOT/services/discord-bot/attached_assets" 2>/dev/null || true
mkdir -p "$PROJECT_ROOT/services/stream-bot/logs" 2>/dev/null || true
mkdir -p "$PROJECT_ROOT/config/postgres-init" 2>/dev/null || true
mkdir -p "$PROJECT_ROOT/marketplace" 2>/dev/null || true

# Role-specific directories
if [ "$ROLE" = "local" ]; then
    mkdir -p "$PROJECT_ROOT/data/plex/config" 2>/dev/null || true
    mkdir -p "$PROJECT_ROOT/data/plex/media" 2>/dev/null || true
    mkdir -p "$PROJECT_ROOT/data/homeassistant" 2>/dev/null || true
    mkdir -p "$PROJECT_ROOT/data/minio" 2>/dev/null || true
    mkdir -p "$PROJECT_ROOT/config/sunshine" 2>/dev/null || true
fi

echo -e "${GREEN}✓ Directories ready${NC}"

# ═══════════════════════════════════════════════════════════════════
# STEP 5: Pull and Build Images
# ═══════════════════════════════════════════════════════════════════
echo -e "\n${CYAN}[5/7] Pulling and building Docker images...${NC}"

# Select compose file based on role
if [ "$ROLE" = "cloud" ]; then
    COMPOSE_FILE="$PROJECT_ROOT/docker-compose.yml"
else
    COMPOSE_FILE="$PROJECT_ROOT/compose.local.yml"
fi

echo "Using compose file: $COMPOSE_FILE"

docker compose --project-directory "$PROJECT_ROOT" \
    --env-file "$PROJECT_ROOT/.env" \
    -f "$COMPOSE_FILE" \
    pull --quiet 2>/dev/null || true

docker compose --project-directory "$PROJECT_ROOT" \
    --env-file "$PROJECT_ROOT/.env" \
    -f "$COMPOSE_FILE" \
    build --quiet 2>/dev/null || true

echo -e "${GREEN}✓ Images ready${NC}"

# ═══════════════════════════════════════════════════════════════════
# STEP 6: Start Services
# ═══════════════════════════════════════════════════════════════════
echo -e "\n${CYAN}[6/7] Starting services...${NC}"

docker compose --project-directory "$PROJECT_ROOT" \
    --env-file "$PROJECT_ROOT/.env" \
    -f "$COMPOSE_FILE" \
    up -d

# Wait for PostgreSQL (cloud role only)
if [ "$ROLE" = "cloud" ]; then
    echo -n "Waiting for PostgreSQL..."
    for i in {1..60}; do
        if docker exec homelab-postgres pg_isready -U postgres &>/dev/null; then
            echo -e " ${GREEN}ready${NC}"
            break
        fi
        echo -n "."
        sleep 1
        if [ $i -eq 60 ]; then
            echo -e " ${YELLOW}timeout (may still be starting)${NC}"
        fi
    done
fi

echo -e "${GREEN}✓ Services started${NC}"

# ═══════════════════════════════════════════════════════════════════
# STEP 7: Setup Self-Healing Cron
# ═══════════════════════════════════════════════════════════════════
if [ "$SKIP_CRON" = false ]; then
    echo -e "\n${CYAN}[7/7] Setting up self-healing cron...${NC}"
    
    CRON_CMD="*/5 * * * * cd $PROJECT_ROOT && ./homelab health --quiet || ./homelab restart 2>&1 | logger -t homelab-heal"
    
    # Remove old cron entries
    crontab -l 2>/dev/null | grep -v "homelab-heal" | crontab - 2>/dev/null || true
    
    # Add new cron entry
    (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
    
    echo -e "${GREEN}✓ Self-healing cron installed (every 5 minutes)${NC}"
else
    echo -e "\n${CYAN}[7/7] Skipping cron setup (--skip-cron)${NC}"
fi

# ═══════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════
echo -e "\n${CYAN}═══════════════════════════════════════════════════════════════${NC}"

running=$(docker compose --project-directory "$PROJECT_ROOT" -f "$COMPOSE_FILE" ps --status running --format "{{.Name}}" 2>/dev/null | wc -l || echo "0")
total=$(docker compose --project-directory "$PROJECT_ROOT" -f "$COMPOSE_FILE" ps --format "{{.Name}}" 2>/dev/null | wc -l || echo "0")

echo -e "${GREEN}✅ BOOTSTRAP COMPLETE - $ROLE deployment${NC}"
echo ""
echo "Services: $running/$total running"
if [ -n "$TAILSCALE_IP" ]; then
    echo "Tailscale IP: $TAILSCALE_IP"
fi
echo ""
echo "Quick Commands:"
echo "  ./homelab status   - Check service status"
echo "  ./homelab logs     - View service logs"
echo "  ./homelab health   - Run health check"
echo "  ./homelab restart  - Restart all services"
echo ""

if [ "$ROLE" = "cloud" ]; then
    echo "Cloud Endpoints:"
    echo "  Dashboard:   https://host.evindrake.net"
    echo "  Discord Bot: https://bot.rig-city.com"
    echo "  Stream Bot:  https://stream.rig-city.com"
else
    echo "Local Services:"
    echo "  Plex:           http://localhost:32400/web"
    echo "  Home Assistant: http://localhost:8123"
    echo "  MinIO Console:  http://localhost:9001"
    echo "  Sunshine (GameStream): http://localhost:47990"
fi

echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"

# Show next steps for multi-server setup
if [ -z "$TAILSCALE_IP" ]; then
    echo ""
    echo -e "${YELLOW}Next Steps for Multi-Server Setup:${NC}"
    echo "1. Install Tailscale: curl -fsSL https://tailscale.com/install.sh | sh"
    echo "2. Connect to VPN: sudo tailscale up --authkey=YOUR_KEY"
    echo "3. Re-run bootstrap to register Tailscale IP"
fi

# Check for LOCAL_TAILSCALE_IP on cloud deployments (needed for routing to local services)
if [ "$ROLE" = "cloud" ]; then
    LOCAL_TS_IP=$(grep "^LOCAL_TAILSCALE_IP=" .env 2>/dev/null | cut -d'=' -f2 || echo "")
    if [ -z "$LOCAL_TS_IP" ]; then
        echo ""
        echo -e "${YELLOW}Multi-Host Routing:${NC}"
        echo "To route Plex, Home Assistant, and GameStream from Linode to your local host,"
        echo "add LOCAL_TAILSCALE_IP to .env with your local host's Tailscale IP address."
        echo ""
        echo "Example: LOCAL_TAILSCALE_IP=100.x.x.x"
    fi
fi
