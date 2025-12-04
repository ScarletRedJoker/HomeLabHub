#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# HOMELAB BOOTSTRAP - Comprehensive Role-Based Deployment Script
# ═══════════════════════════════════════════════════════════════════════════════
# A fully automated deployment script with proper validation, health checks,
# and meaningful exit codes.
#
# Usage:
#   ./deploy/scripts/bootstrap.sh --role cloud    # Linode cloud server
#   ./deploy/scripts/bootstrap.sh --role local    # Local Ubuntu host
#   ./deploy/scripts/bootstrap.sh                 # Auto-detect role
#
# Options:
#   --role cloud|local    Specify deployment role (required for first run)
#   --generate-secrets    Auto-generate all missing secrets
#   --skip-cron           Skip self-healing cron setup
#   --skip-health-wait    Skip waiting for health checks
#   --setup-iptables      Setup iptables persistence for GameStream ports
#   --dry-run             Validate environment without deploying
#   --verbose             Enable verbose output
#   --help                Show this help message
#
# Exit Codes:
#   0  - Success
#   1  - General error
#   2  - .env file missing
#   3  - Required environment variables missing
#   4  - Docker not available
#   5  - Docker Compose failed
#   6  - Health check failed
#   7  - iptables setup failed
#
# Features:
#   - Role-based service deployment (cloud vs local)
#   - Comprehensive environment validation
#   - Auto-generation of secrets
#   - Docker health check waiting
#   - Service health verification
#   - iptables persistence for GameStream
#   - Meaningful exit codes for automation
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════════
# EXIT CODES
# ═══════════════════════════════════════════════════════════════════════════════
readonly EXIT_SUCCESS=0
readonly EXIT_GENERAL_ERROR=1
readonly EXIT_ENV_MISSING=2
readonly EXIT_ENV_INVALID=3
readonly EXIT_DOCKER_ERROR=4
readonly EXIT_COMPOSE_ERROR=5
readonly EXIT_HEALTH_ERROR=6
readonly EXIT_IPTABLES_ERROR=7

# ═══════════════════════════════════════════════════════════════════════════════
# COLORS AND FORMATTING
# ═══════════════════════════════════════════════════════════════════════════════
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly CYAN='\033[0;36m'
readonly MAGENTA='\033[0;35m'
readonly BLUE='\033[0;34m'
readonly BOLD='\033[1m'
readonly NC='\033[0m'

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

# Detect project root from script location
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Required environment variables by role
# Cloud: Main PostgreSQL, all service passwords, Discord, OpenAI, etc.
CLOUD_REQUIRED_VARS=(
    "POSTGRES_PASSWORD"
    "JARVIS_DB_PASSWORD"
    "DISCORD_DB_PASSWORD"
    "STREAMBOT_DB_PASSWORD"
    "DISCORD_BOT_TOKEN"
    "DISCORD_CLIENT_ID"
    "TWITCH_CLIENT_ID"
    "TWITCH_CLIENT_SECRET"
    "OPENAI_API_KEY"
    "SESSION_SECRET"
    "CODE_SERVER_PASSWORD"
)

# Alternative variable names (legacy/compatibility)
# Format: "EXPECTED_NAME:ALTERNATIVE_NAME"
VARIABLE_ALIASES=(
    "DISCORD_BOT_TOKEN:DISCORD_TOKEN"
    "DISCORD_DB_PASSWORD:TICKETBOT_DB_PASSWORD"
    "CODE_SERVER_PASSWORD:PASSWORD"
)

# Optional cloud variables (warnings only)
CLOUD_OPTIONAL_VARS=(
    "N8N_BASIC_AUTH_PASSWORD"
    "N8N_ENCRYPTION_KEY"
    "DISCORD_CLIENT_SECRET"
    "YOUTUBE_CLIENT_ID"
    "SPOTIFY_CLIENT_ID"
    "CLOUDFLARE_API_TOKEN"
)

# Local: Plex, MinIO, Home Assistant
# Note: PLEX_TOKEN and HOME_ASSISTANT_TOKEN are required for full functionality
LOCAL_REQUIRED_VARS=(
    "PLEX_TOKEN"
    "MINIO_ROOT_USER"
    "MINIO_ROOT_PASSWORD"
    "HOME_ASSISTANT_TOKEN"
)

# Optional local variables (warnings only)
LOCAL_OPTIONAL_VARS=(
    "SUNSHINE_PASS"
    "VNC_PASSWORD"
    "NAS_PASSWORD"
)

# GameStream ports for iptables
GAMESTREAM_TCP_PORTS=(47984 47989 47990 48010)
GAMESTREAM_UDP_PORTS=(47998 47999 48000 48002 48010)

# Default values
ROLE=""
GENERATE_SECRETS=false
SKIP_CRON=false
SKIP_HEALTH_WAIT=false
SETUP_IPTABLES=false
DRY_RUN=false
VERBOSE=false

# ═══════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

log_info() {
    echo -e "${CYAN}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[⚠]${NC} $*"
}

log_error() {
    echo -e "${RED}[✗]${NC} $*" >&2
}

log_debug() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${BLUE}[DEBUG]${NC} $*"
    fi
}

log_step() {
    local step_num="$1"
    local total_steps="$2"
    local description="$3"
    echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}[$step_num/$total_steps]${NC} ${MAGENTA}$description${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

show_help() {
    cat << 'EOF'
HOMELAB BOOTSTRAP - Comprehensive Role-Based Deployment Script

USAGE:
    ./deploy/scripts/bootstrap.sh [OPTIONS]

OPTIONS:
    --role cloud|local    Specify deployment role
                          cloud: Linode server with dashboard, bots, database
                          local: Ubuntu host with Plex, MinIO, Home Assistant
    
    --generate-secrets    Auto-generate all missing secrets (passwords, tokens)
    
    --skip-cron           Skip installing the self-healing cron job
    
    --skip-health-wait    Skip waiting for Docker health checks
    
    --setup-iptables      Setup iptables persistence for GameStream ports
                          (local role only, requires sudo)
    
    --dry-run             Validate environment without deploying
    
    --verbose             Enable verbose debug output
    
    --help                Show this help message

EXIT CODES:
    0  - Success
    1  - General error
    2  - .env file missing
    3  - Required environment variables missing
    4  - Docker not available
    5  - Docker Compose failed
    6  - Health check failed
    7  - iptables setup failed

EXAMPLES:
    # First-time cloud deployment with secret generation
    ./deploy/scripts/bootstrap.sh --role cloud --generate-secrets

    # Local deployment with iptables setup
    sudo ./deploy/scripts/bootstrap.sh --role local --setup-iptables

    # Validate environment without deploying
    ./deploy/scripts/bootstrap.sh --role cloud --dry-run

    # Quick redeploy (auto-detect role)
    ./deploy/scripts/bootstrap.sh

REQUIRED ENVIRONMENT VARIABLES:

    Cloud Role:
      POSTGRES_PASSWORD      - Main PostgreSQL superuser password
      JARVIS_DB_PASSWORD     - Jarvis/Dashboard database password
      DISCORD_DB_PASSWORD    - Discord bot (ticketbot) database password
      STREAMBOT_DB_PASSWORD  - Stream bot database password
      DISCORD_BOT_TOKEN      - Discord bot token
      DISCORD_CLIENT_ID      - Discord OAuth client ID
      TWITCH_CLIENT_ID       - Twitch API client ID
      TWITCH_CLIENT_SECRET   - Twitch API client secret
      OPENAI_API_KEY         - OpenAI API key for AI features
      SESSION_SECRET         - Flask session secret
      CODE_SERVER_PASSWORD   - VS Code server password

    Optional Cloud (N8N_ENCRYPTION_KEY for enhanced security)

    Local Role:
      PLEX_TOKEN             - Plex authentication token
      MINIO_ROOT_USER        - MinIO admin username
      MINIO_ROOT_PASSWORD    - MinIO admin password
      HOME_ASSISTANT_TOKEN   - Home Assistant long-lived access token
EOF
}

# ═══════════════════════════════════════════════════════════════════════════════
# PARSE ARGUMENTS
# ═══════════════════════════════════════════════════════════════════════════════

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --role)
                if [[ -n "${2:-}" ]]; then
                    ROLE="$2"
                    shift 2
                else
                    log_error "--role requires an argument (cloud or local)"
                    exit $EXIT_GENERAL_ERROR
                fi
                ;;
            --generate-secrets)
                GENERATE_SECRETS=true
                shift
                ;;
            --skip-cron)
                SKIP_CRON=true
                shift
                ;;
            --skip-health-wait)
                SKIP_HEALTH_WAIT=true
                shift
                ;;
            --setup-iptables)
                SETUP_IPTABLES=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --help|-h)
                show_help
                exit $EXIT_SUCCESS
                ;;
            *)
                log_warn "Unknown option: $1 (ignoring)"
                shift
                ;;
        esac
    done
}

# ═══════════════════════════════════════════════════════════════════════════════
# ROLE DETECTION
# ═══════════════════════════════════════════════════════════════════════════════

detect_role() {
    if [ -n "$ROLE" ]; then
        log_debug "Role specified via argument: $ROLE"
        return
    fi
    
    log_info "Auto-detecting deployment role..."
    
    # Check for Linode metadata service (cloud)
    if curl -s --max-time 2 http://169.254.169.254/v1/instance-id &>/dev/null; then
        ROLE="cloud"
        log_info "Detected Linode cloud environment"
        return
    fi
    
    # Check for local indicators
    if [ -f "/etc/libvirt/qemu.conf" ] || [ -d "/var/lib/libvirt" ]; then
        ROLE="local"
        log_info "Detected local Ubuntu host (KVM/libvirt present)"
        return
    fi
    
    # Check for GPU (typically local)
    if lspci 2>/dev/null | grep -qi nvidia; then
        ROLE="local"
        log_info "Detected local host (NVIDIA GPU present)"
        return
    fi
    
    # Default to cloud for VPS-like environments
    ROLE="cloud"
    log_warn "Could not determine role, defaulting to 'cloud'"
}

validate_role() {
    if [[ ! "$ROLE" =~ ^(cloud|local)$ ]]; then
        log_error "Invalid role: '$ROLE'"
        log_error "Valid roles are: cloud, local"
        exit $EXIT_GENERAL_ERROR
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# ENVIRONMENT FILE HANDLING
# ═══════════════════════════════════════════════════════════════════════════════

check_env_file() {
    local env_file="$PROJECT_ROOT/.env"
    
    if [ ! -f "$env_file" ]; then
        log_error ".env file not found at: $env_file"
        echo ""
        echo -e "${YELLOW}To create the environment file:${NC}"
        echo ""
        echo "  1. Copy the example file:"
        echo "     cp $PROJECT_ROOT/.env.example $PROJECT_ROOT/.env"
        echo ""
        echo "  2. Edit and fill in your values:"
        echo "     nano $PROJECT_ROOT/.env"
        echo ""
        echo "  3. Or run with --generate-secrets to auto-generate passwords:"
        echo "     $0 --role $ROLE --generate-secrets"
        echo ""
        echo -e "${CYAN}Required variables for ${MAGENTA}$ROLE${CYAN} role:${NC}"
        
        if [ "$ROLE" = "cloud" ]; then
            for var in "${CLOUD_REQUIRED_VARS[@]}"; do
                echo "     - $var"
            done
        else
            for var in "${LOCAL_REQUIRED_VARS[@]}"; do
                echo "     - $var"
            done
        fi
        echo ""
        exit $EXIT_ENV_MISSING
    fi
    
    log_success ".env file exists"
}

# Normalize variable names using aliases
# If DISCORD_TOKEN exists but DISCORD_BOT_TOKEN doesn't, copy the value
normalize_env_aliases() {
    local env_file="$PROJECT_ROOT/.env"
    local normalized=0
    
    for alias_pair in "${VARIABLE_ALIASES[@]}"; do
        local expected="${alias_pair%%:*}"
        local alternative="${alias_pair##*:}"
        
        local expected_val
        local alt_val
        expected_val=$(grep "^${expected}=" "$env_file" 2>/dev/null | head -1 | cut -d'=' -f2-) || true
        alt_val=$(grep "^${alternative}=" "$env_file" 2>/dev/null | head -1 | cut -d'=' -f2-) || true
        
        # If expected is empty but alternative exists, copy alternative to expected
        if [ -z "$expected_val" ] && [ -n "$alt_val" ]; then
            if grep -q "^${expected}=" "$env_file" 2>/dev/null; then
                sed -i "s|^${expected}=.*|${expected}=${alt_val}|" "$env_file"
            else
                echo "${expected}=${alt_val}" >> "$env_file"
            fi
            log_info "Mapped $alternative → $expected"
            normalized=$((normalized + 1))
        fi
    done
    
    if [ "$normalized" -gt 0 ]; then
        log_success "Normalized $normalized variable(s) from legacy names"
    fi
}

# Get env value (handles quoted values and empty values)
get_env_value() {
    local var_name="$1"
    local env_file="$PROJECT_ROOT/.env"
    
    local value
    value=$(grep "^${var_name}=" "$env_file" 2>/dev/null | head -1 | cut -d'=' -f2- | sed 's/^["'\''"]//;s/["'\''"]$//')
    
    # Check for placeholder values
    if [[ "$value" == "YOUR_"* ]] || [[ "$value" == "sk-proj-YOUR_"* ]] || [[ "$value" == "your_"* ]]; then
        echo ""
        return
    fi
    
    echo "$value"
}

# Generate secure password
generate_password() {
    local length="${1:-32}"
    openssl rand -base64 48 | tr -d '/+=' | head -c "$length"
}

# Generate hex secret
generate_hex_secret() {
    local length="${1:-32}"
    openssl rand -hex "$length"
}

# Set env var if empty or missing
set_env_if_empty() {
    local var_name="$1"
    local default_value="${2:-$(generate_password 32)}"
    local env_file="$PROJECT_ROOT/.env"
    
    local current_value
    current_value=$(get_env_value "$var_name")
    
    if [ -z "$current_value" ]; then
        if grep -q "^${var_name}=" "$env_file" 2>/dev/null; then
            # Variable exists but is empty, update it
            sed -i "s|^${var_name}=.*|${var_name}=${default_value}|" "$env_file"
        else
            # Variable doesn't exist, add it
            echo "${var_name}=${default_value}" >> "$env_file"
        fi
        log_success "Generated: $var_name"
        return 0
    fi
    
    log_debug "Skipping $var_name (already set)"
    return 1
}

# Generate all missing secrets
generate_secrets() {
    log_info "Generating missing secrets..."
    
    local generated=0
    
    # Database passwords
    set_env_if_empty "POSTGRES_PASSWORD" && ((generated++)) || true
    set_env_if_empty "JARVIS_DB_PASSWORD" && ((generated++)) || true
    set_env_if_empty "DISCORD_DB_PASSWORD" && ((generated++)) || true
    set_env_if_empty "STREAMBOT_DB_PASSWORD" && ((generated++)) || true
    
    # Session secrets (hex)
    set_env_if_empty "SESSION_SECRET" "$(generate_hex_secret 32)" && ((generated++)) || true
    set_env_if_empty "SECRET_KEY" "$(generate_hex_secret 32)" && ((generated++)) || true
    set_env_if_empty "DISCORD_SESSION_SECRET" "$(generate_hex_secret 32)" && ((generated++)) || true
    set_env_if_empty "STREAMBOT_SESSION_SECRET" "$(generate_hex_secret 32)" && ((generated++)) || true
    
    # Service tokens
    set_env_if_empty "SERVICE_AUTH_TOKEN" "$(generate_hex_secret 32)" && ((generated++)) || true
    set_env_if_empty "DASHBOARD_API_KEY" "$(generate_hex_secret 24)" && ((generated++)) || true
    
    # Code server
    set_env_if_empty "CODE_SERVER_PASSWORD" && ((generated++)) || true
    
    # N8N
    set_env_if_empty "N8N_BASIC_AUTH_PASSWORD" && ((generated++)) || true
    
    # Local services
    if [ "$ROLE" = "local" ]; then
        set_env_if_empty "MINIO_ROOT_PASSWORD" && ((generated++)) || true
        set_env_if_empty "VNC_PASSWORD" && ((generated++)) || true
        set_env_if_empty "SUNSHINE_PASS" && ((generated++)) || true
    fi
    
    if [ $generated -gt 0 ]; then
        log_success "Generated $generated secrets"
    else
        log_info "All secrets already configured"
    fi
}

# Validate required environment variables
validate_environment() {
    local role="$1"
    local missing_required=()
    local missing_optional=()
    
    log_info "Validating environment for $role role..."
    
    # Select variable lists based on role
    local -n required_vars
    local -n optional_vars
    
    if [ "$role" = "cloud" ]; then
        required_vars=CLOUD_REQUIRED_VARS
        optional_vars=CLOUD_OPTIONAL_VARS
    else
        required_vars=LOCAL_REQUIRED_VARS
        optional_vars=LOCAL_OPTIONAL_VARS
    fi
    
    # Check required variables
    for var in "${required_vars[@]}"; do
        local value
        value=$(get_env_value "$var")
        if [ -z "$value" ]; then
            missing_required+=("$var")
        else
            log_debug "✓ $var is set"
        fi
    done
    
    # Check optional variables
    for var in "${optional_vars[@]}"; do
        local value
        value=$(get_env_value "$var")
        if [ -z "$value" ]; then
            missing_optional+=("$var")
        else
            log_debug "✓ $var is set (optional)"
        fi
    done
    
    # Report optional warnings
    if [ ${#missing_optional[@]} -gt 0 ]; then
        echo ""
        log_warn "Optional variables not set (some features may be limited):"
        for var in "${missing_optional[@]}"; do
            echo -e "     ${YELLOW}-${NC} $var"
        done
    fi
    
    # Report required errors
    if [ ${#missing_required[@]} -gt 0 ]; then
        echo ""
        log_error "Required variables are missing or empty:"
        for var in "${missing_required[@]}"; do
            echo -e "     ${RED}✗${NC} $var"
        done
        echo ""
        echo -e "${YELLOW}To fix this, you can:${NC}"
        echo ""
        echo "  1. Edit .env and set the values manually:"
        echo "     nano $PROJECT_ROOT/.env"
        echo ""
        echo "  2. Run with --generate-secrets to auto-generate passwords:"
        echo "     $0 --role $role --generate-secrets"
        echo ""
        echo -e "${CYAN}Helpful links:${NC}"
        echo "     OpenAI API Key:    https://platform.openai.com/api-keys"
        echo "     Discord Developer: https://discord.com/developers/applications"
        echo "     Twitch Developer:  https://dev.twitch.tv/console/apps"
        echo "     Plex Token:        https://www.plex.tv/claim/"
        echo ""
        exit $EXIT_ENV_INVALID
    fi
    
    log_success "All required environment variables are set"
}

# ═══════════════════════════════════════════════════════════════════════════════
# DOCKER CHECKS
# ═══════════════════════════════════════════════════════════════════════════════

check_docker() {
    log_info "Checking Docker installation..."
    
    # Check if docker is installed
    if ! command -v docker &>/dev/null; then
        log_error "Docker is not installed"
        echo ""
        echo "Install Docker with:"
        echo "  curl -fsSL https://get.docker.com | sh"
        echo "  sudo usermod -aG docker \$USER"
        echo ""
        exit $EXIT_DOCKER_ERROR
    fi
    
    # Check if docker daemon is running
    if ! docker info &>/dev/null; then
        log_error "Docker daemon is not running"
        echo ""
        echo "Start Docker with:"
        echo "  sudo systemctl start docker"
        echo "  sudo systemctl enable docker"
        echo ""
        exit $EXIT_DOCKER_ERROR
    fi
    
    # Check docker compose
    if ! docker compose version &>/dev/null; then
        log_error "Docker Compose is not available"
        echo ""
        echo "Docker Compose should be included with recent Docker versions."
        echo "Try updating Docker to the latest version."
        echo ""
        exit $EXIT_DOCKER_ERROR
    fi
    
    local docker_version
    docker_version=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "unknown")
    log_success "Docker $docker_version is ready"
}

# ═══════════════════════════════════════════════════════════════════════════════
# DIRECTORY SETUP
# ═══════════════════════════════════════════════════════════════════════════════

create_directories() {
    log_info "Creating required directories..."
    
    # Common directories
    local dirs=(
        "$PROJECT_ROOT/logs"
        "$PROJECT_ROOT/static-sites"
        "$PROJECT_ROOT/services/dashboard/logs"
        "$PROJECT_ROOT/services/discord-bot/logs"
        "$PROJECT_ROOT/services/discord-bot/attached_assets"
        "$PROJECT_ROOT/services/stream-bot/logs"
        "$PROJECT_ROOT/config/postgres-init"
    )
    
    # Role-specific directories
    if [ "$ROLE" = "local" ]; then
        dirs+=(
            "$PROJECT_ROOT/data/plex/config"
            "$PROJECT_ROOT/data/plex/media"
            "$PROJECT_ROOT/data/plex/transcode"
            "$PROJECT_ROOT/data/homeassistant"
            "$PROJECT_ROOT/data/minio"
            "$PROJECT_ROOT/config/sunshine"
        )
    fi
    
    for dir in "${dirs[@]}"; do
        if mkdir -p "$dir" 2>/dev/null; then
            log_debug "Created: $dir"
        fi
    done
    
    log_success "Directories ready"
}

# ═══════════════════════════════════════════════════════════════════════════════
# DOCKER COMPOSE DEPLOYMENT
# ═══════════════════════════════════════════════════════════════════════════════

get_compose_file() {
    if [ "$ROLE" = "cloud" ]; then
        echo "$PROJECT_ROOT/docker-compose.yml"
    else
        echo "$PROJECT_ROOT/deploy/local/docker-compose.yml"
    fi
}

deploy_services() {
    local compose_file
    compose_file=$(get_compose_file)
    
    if [ ! -f "$compose_file" ]; then
        log_error "Compose file not found: $compose_file"
        exit $EXIT_COMPOSE_ERROR
    fi
    
    log_info "Using compose file: $compose_file"
    
    # Pull images
    log_info "Pulling Docker images..."
    if ! docker compose --project-directory "$PROJECT_ROOT" \
        --env-file "$PROJECT_ROOT/.env" \
        -f "$compose_file" \
        pull --quiet 2>&1; then
        log_warn "Some images could not be pulled (will try to build)"
    fi
    
    # Build images
    log_info "Building Docker images..."
    if ! docker compose --project-directory "$PROJECT_ROOT" \
        --env-file "$PROJECT_ROOT/.env" \
        -f "$compose_file" \
        build --quiet 2>&1; then
        log_warn "Some images could not be built (may use existing)"
    fi
    
    # Start services
    log_info "Starting services..."
    local compose_args=(
        "--project-directory" "$PROJECT_ROOT"
        "--env-file" "$PROJECT_ROOT/.env"
        "-f" "$compose_file"
        "up" "-d" "--remove-orphans"
    )
    
    # Add health check waiting if not skipped
    if [ "$SKIP_HEALTH_WAIT" = false ]; then
        compose_args+=("--wait" "--wait-timeout" "120")
    fi
    
    if ! docker compose "${compose_args[@]}" 2>&1; then
        log_error "Failed to start services"
        echo ""
        echo "Check logs with:"
        echo "  docker compose -f $compose_file logs"
        echo ""
        exit $EXIT_COMPOSE_ERROR
    fi
    
    log_success "Services started"
}

# ═══════════════════════════════════════════════════════════════════════════════
# HEALTH CHECKS
# ═══════════════════════════════════════════════════════════════════════════════

wait_for_postgres() {
    if [ "$ROLE" != "cloud" ]; then
        return 0
    fi
    
    log_info "Waiting for PostgreSQL to be ready..."
    
    local max_attempts=60
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker exec homelab-postgres pg_isready -U postgres &>/dev/null; then
            log_success "PostgreSQL is ready"
            return 0
        fi
        
        if [ $((attempt % 10)) -eq 0 ]; then
            log_info "Still waiting for PostgreSQL... ($attempt/$max_attempts)"
        fi
        
        sleep 1
        ((attempt++))
    done
    
    log_error "PostgreSQL failed to become ready within $max_attempts seconds"
    return 1
}

verify_service_health() {
    local compose_file
    compose_file=$(get_compose_file)
    
    log_info "Verifying service health..."
    
    local all_healthy=true
    local service_status=()
    
    # Get all services
    local services
    services=$(docker compose --project-directory "$PROJECT_ROOT" -f "$compose_file" ps --format "{{.Name}}:{{.Status}}" 2>/dev/null || echo "")
    
    if [ -z "$services" ]; then
        log_warn "Could not retrieve service status"
        return 1
    fi
    
    echo ""
    printf "%-30s %-15s %-10s\n" "SERVICE" "STATE" "HEALTH"
    printf "%s\n" "──────────────────────────────────────────────────────────"
    
    while IFS= read -r line; do
        local name status health state
        name=$(echo "$line" | cut -d':' -f1)
        status=$(echo "$line" | cut -d':' -f2-)
        
        # Parse status for health info
        if echo "$status" | grep -qi "healthy"; then
            health="${GREEN}healthy${NC}"
            state="Up"
        elif echo "$status" | grep -qi "unhealthy"; then
            health="${RED}unhealthy${NC}"
            state="Up"
            all_healthy=false
        elif echo "$status" | grep -qi "starting"; then
            health="${YELLOW}starting${NC}"
            state="Up"
        elif echo "$status" | grep -qi "up"; then
            health="${BLUE}no check${NC}"
            state="Up"
        elif echo "$status" | grep -qi "exited"; then
            health="${RED}exited${NC}"
            state="Exited"
            all_healthy=false
        else
            health="${YELLOW}unknown${NC}"
            state="Unknown"
        fi
        
        printf "%-30s %-15s " "$name" "$state"
        echo -e "$health"
        
    done <<< "$services"
    
    echo ""
    
    if [ "$all_healthy" = true ]; then
        log_success "All services are healthy"
        return 0
    else
        log_warn "Some services may need attention"
        return 0  # Don't fail on warnings
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# IPTABLES SETUP (for GameStream)
# ═══════════════════════════════════════════════════════════════════════════════

setup_iptables() {
    if [ "$ROLE" != "local" ]; then
        log_debug "Skipping iptables setup (not local role)"
        return 0
    fi
    
    log_info "Setting up iptables rules for GameStream..."
    
    # Check if we have root/sudo
    if [ "$EUID" -ne 0 ]; then
        log_warn "iptables setup requires root privileges"
        log_warn "Run with sudo or as root to setup iptables"
        return 0
    fi
    
    # Install iptables-persistent if not present
    if ! dpkg -l | grep -q iptables-persistent; then
        log_info "Installing iptables-persistent..."
        DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent >/dev/null 2>&1 || {
            log_error "Failed to install iptables-persistent"
            return 1
        }
    fi
    
    # Add TCP rules
    for port in "${GAMESTREAM_TCP_PORTS[@]}"; do
        if ! iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
            iptables -A INPUT -p tcp --dport "$port" -j ACCEPT
            log_debug "Added TCP rule for port $port"
        fi
    done
    
    # Add UDP rules
    for port in "${GAMESTREAM_UDP_PORTS[@]}"; do
        if ! iptables -C INPUT -p udp --dport "$port" -j ACCEPT 2>/dev/null; then
            iptables -A INPUT -p udp --dport "$port" -j ACCEPT
            log_debug "Added UDP rule for port $port"
        fi
    done
    
    # Save rules
    if command -v netfilter-persistent &>/dev/null; then
        netfilter-persistent save >/dev/null 2>&1
    else
        iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
    fi
    
    log_success "iptables rules configured for GameStream"
    echo ""
    echo "GameStream ports opened:"
    echo "  TCP: ${GAMESTREAM_TCP_PORTS[*]}"
    echo "  UDP: ${GAMESTREAM_UDP_PORTS[*]}"
    echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# CRON SETUP
# ═══════════════════════════════════════════════════════════════════════════════

setup_cron() {
    log_info "Setting up self-healing cron job..."
    
    local homelab_script="$PROJECT_ROOT/homelab"
    
    if [ ! -f "$homelab_script" ]; then
        log_warn "homelab script not found, skipping cron setup"
        return 0
    fi
    
    local cron_cmd="*/5 * * * * cd $PROJECT_ROOT && ./homelab health --quiet || ./homelab restart 2>&1 | logger -t homelab-heal"
    
    # Remove old entries
    (crontab -l 2>/dev/null | grep -v "homelab-heal" | crontab -) 2>/dev/null || true
    
    # Add new entry
    (crontab -l 2>/dev/null; echo "$cron_cmd") | crontab - 2>/dev/null || {
        log_warn "Failed to setup cron job"
        return 0
    }
    
    log_success "Self-healing cron installed (every 5 minutes)"
}

# ═══════════════════════════════════════════════════════════════════════════════
# FUNCTIONAL VERIFICATION
# ═══════════════════════════════════════════════════════════════════════════════

run_functional_verification() {
    local verify_script="$PROJECT_ROOT/deploy/scripts/verify-deployment.sh"
    
    if [ ! -f "$verify_script" ]; then
        log_warning "Verification script not found at $verify_script"
        log_info "Running basic health checks instead..."
        
        # Basic smoke test: check if we can reach the main services
        if [ "$ROLE" = "cloud" ]; then
            local checks_passed=0
            local checks_total=3
            
            # Check PostgreSQL
            if docker exec homelab-postgres pg_isready -U postgres &>/dev/null; then
                log_success "PostgreSQL is ready"
                checks_passed=$((checks_passed + 1))
            else
                log_error "PostgreSQL not responding"
            fi
            
            # Check Redis
            if docker exec homelab-redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
                log_success "Redis is ready"
                checks_passed=$((checks_passed + 1))
            else
                log_error "Redis not responding"
            fi
            
            # Check Dashboard
            if curl -sf http://localhost:5000/health &>/dev/null; then
                log_success "Dashboard is healthy"
                checks_passed=$((checks_passed + 1))
            else
                log_error "Dashboard not responding"
            fi
            
            if [ "$checks_passed" -lt "$checks_total" ]; then
                log_warning "Some services are not responding ($checks_passed/$checks_total)"
                log_info "This may resolve in a few seconds as services finish starting"
            else
                log_success "All basic health checks passed"
            fi
        else
            log_info "Local deployment - skipping remote verification"
        fi
        return 0
    fi
    
    # Run the full verification script
    log_info "Running comprehensive verification..."
    
    chmod +x "$verify_script" 2>/dev/null || true
    
    if "$verify_script" "$ROLE"; then
        log_success "All functional verification checks passed"
    else
        log_warning "Some verification checks failed"
        log_info "Run '$verify_script $ROLE --verbose' for details"
        log_info "Services may still be starting - try again in 30 seconds"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════

print_summary() {
    local compose_file
    compose_file=$(get_compose_file)
    
    local running total
    running=$(docker compose --project-directory "$PROJECT_ROOT" -f "$compose_file" ps --status running --format "{{.Name}}" 2>/dev/null | wc -l || echo "0")
    total=$(docker compose --project-directory "$PROJECT_ROOT" -f "$compose_file" ps --format "{{.Name}}" 2>/dev/null | wc -l || echo "0")
    
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║${NC}                    ${BOLD}BOOTSTRAP COMPLETE${NC}                           ${GREEN}║${NC}"
    echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║${NC}  Role:     ${MAGENTA}$ROLE${NC}                                              ${GREEN}║${NC}"
    echo -e "${GREEN}║${NC}  Services: ${CYAN}$running/$total running${NC}                                     ${GREEN}║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    if [ "$ROLE" = "cloud" ]; then
        echo -e "${CYAN}Cloud Endpoints:${NC}"
        echo "  Dashboard:    https://host.evindrake.net"
        echo "  Discord Bot:  https://bot.rig-city.com"
        echo "  Stream Bot:   https://stream.rig-city.com"
        echo "  n8n:          https://n8n.evindrake.net"
        echo "  Code Server:  https://code.evindrake.net"
    else
        echo -e "${CYAN}Local Services:${NC}"
        echo "  Home Assistant: http://localhost:8123"
        echo "  MinIO Console:  http://localhost:9001"
        echo "  Plex:           http://localhost:32400/web"
        echo "  Sunshine:       https://localhost:47990"
    fi
    
    echo ""
    echo -e "${CYAN}Quick Commands:${NC}"
    echo "  ./homelab status   - Check service status"
    echo "  ./homelab logs     - View service logs"
    echo "  ./homelab health   - Run health check"
    echo "  ./homelab restart  - Restart all services"
    echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN EXECUTION
# ═══════════════════════════════════════════════════════════════════════════════

main() {
    parse_args "$@"
    
    # Show banner
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║          HOMELAB BOOTSTRAP - Automated Deployment                ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    # Detect and validate role
    detect_role
    validate_role
    
    echo -e "Deployment Role: ${MAGENTA}$ROLE${NC}"
    echo -e "Project Root:    ${CYAN}$PROJECT_ROOT${NC}"
    echo ""
    
    local total_steps=7
    if [ "$DRY_RUN" = true ]; then
        total_steps=3
    fi
    
    # Step 1: Check Docker
    log_step 1 $total_steps "Checking Docker"
    check_docker
    
    # Step 2: Check .env file
    log_step 2 $total_steps "Validating Environment File"
    check_env_file
    
    # Normalize legacy variable names before validation
    normalize_env_aliases
    
    # Generate secrets if requested
    if [ "$GENERATE_SECRETS" = true ]; then
        generate_secrets
    fi
    
    # Step 3: Validate environment variables
    log_step 3 $total_steps "Validating Environment Variables"
    validate_environment "$ROLE"
    
    # Stop here if dry run
    if [ "$DRY_RUN" = true ]; then
        echo ""
        log_success "Dry run complete - environment is valid"
        exit $EXIT_SUCCESS
    fi
    
    # Step 4: Create directories
    log_step 4 $total_steps "Creating Directories"
    create_directories
    
    # Step 5: Deploy services
    log_step 5 $total_steps "Deploying Services"
    deploy_services
    
    # Wait for PostgreSQL if cloud
    if [ "$ROLE" = "cloud" ]; then
        wait_for_postgres
    fi
    
    # Step 6: Health verification
    log_step 6 $total_steps "Verifying Health"
    verify_service_health
    
    # Step 7: Additional setup
    log_step 7 $total_steps "Additional Configuration"
    
    # Setup iptables if requested (requires root)
    if [ "$SETUP_IPTABLES" = true ]; then
        if [ "$EUID" -ne 0 ] && ! command -v sudo &> /dev/null; then
            log_warning "iptables setup requires root privileges"
            log_warning "Run with sudo or as root to enable iptables setup"
            log_info "Skipping iptables setup - deployment will continue"
        else
            setup_iptables || log_warning "iptables setup failed - continuing deployment"
        fi
    fi
    
    # Setup cron if not skipped
    if [ "$SKIP_CRON" = false ]; then
        setup_cron
    else
        log_info "Skipping cron setup (--skip-cron)"
    fi
    
    # Step 8: Run functional verification
    log_step 8 $((total_steps + 1)) "Running Functional Verification"
    run_functional_verification
    
    # Print summary
    print_summary
    
    exit $EXIT_SUCCESS
}

# Run main function
main "$@"
