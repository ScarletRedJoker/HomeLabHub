#!/bin/bash
# ======================================================================
# Pre-Deployment Validation Script
# Validates environment, resources, and configuration before deployment
# ======================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.unified.yml"
ENV_FILE="${PROJECT_DIR}/.env"
MIN_DISK_SPACE_GB=10
VALIDATION_LOG="${PROJECT_DIR}/deployment/validation.log"

# Validation results
VALIDATION_ERRORS=0
VALIDATION_WARNINGS=0
FAILED_CHECKS=()
WARNING_CHECKS=()

# Initialize log
mkdir -p "$(dirname "$VALIDATION_LOG")"
echo "=== Deployment Validation Started at $(date) ===" > "$VALIDATION_LOG"

# Logging functions
log() {
    echo -e "${GREEN}[✓]${NC} $1" | tee -a "$VALIDATION_LOG"
}

warn() {
    echo -e "${YELLOW}[⚠]${NC} $1" | tee -a "$VALIDATION_LOG"
    ((VALIDATION_WARNINGS++))
    WARNING_CHECKS+=("$1")
}

error() {
    echo -e "${RED}[✗]${NC} $1" | tee -a "$VALIDATION_LOG"
    ((VALIDATION_ERRORS++))
    FAILED_CHECKS+=("$1")
}

info() {
    echo -e "${BLUE}[i]${NC} $1" | tee -a "$VALIDATION_LOG"
}

section() {
    echo "" | tee -a "$VALIDATION_LOG"
    echo -e "${CYAN}${BOLD}━━━ $1 ━━━${NC}" | tee -a "$VALIDATION_LOG"
}

# Print header
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}                                                                ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}        ${BOLD}${BLUE}🔍 PRE-DEPLOYMENT VALIDATION${NC}                        ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                                ${CYAN}║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ===== 1. DOCKER ENVIRONMENT VALIDATION =====
section "Docker Environment"

# Check Docker installed
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | tr -d ',')
    log "Docker installed: v${DOCKER_VERSION}"
else
    error "Docker not installed or not in PATH"
fi

# Check Docker daemon
if docker info &> /dev/null 2>&1; then
    log "Docker daemon is running"
else
    error "Docker daemon is not running. Start it with: sudo systemctl start docker"
fi

# Check Docker Compose
if docker compose version &> /dev/null 2>&1; then
    COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || echo "unknown")
    log "Docker Compose available: v${COMPOSE_VERSION}"
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_VERSION=$(docker-compose version --short 2>/dev/null || echo "unknown")
    log "Docker Compose available: v${COMPOSE_VERSION}"
    DOCKER_COMPOSE="docker-compose"
else
    error "Docker Compose not found"
fi

# Check user in docker group (if not root)
if [ "$EUID" -ne 0 ]; then
    if groups | grep -q docker; then
        log "User is in docker group"
    else
        error "User not in docker group. Run: sudo usermod -aG docker \$USER && newgrp docker"
    fi
fi

# ===== 2. FILE STRUCTURE VALIDATION =====
section "File Structure"

cd "$PROJECT_DIR" || { error "Cannot access project directory: $PROJECT_DIR"; exit 1; }

# Check critical files exist
if [ -f "$COMPOSE_FILE" ]; then
    log "docker-compose.unified.yml found"
else
    error "docker-compose.unified.yml not found at: $COMPOSE_FILE"
fi

if [ -f "$ENV_FILE" ]; then
    log ".env file found"
else
    error ".env file not found. Run: ./deployment/generate-unified-env.sh"
fi

if [ -f "Caddyfile" ]; then
    log "Caddyfile found"
else
    warn "Caddyfile not found (will affect SSL routing)"
fi

# Check service directories
for service_dir in services/dashboard services/discord-bot services/stream-bot; do
    if [ -d "$service_dir" ]; then
        log "Service directory exists: $service_dir"
    else
        error "Missing service directory: $service_dir"
    fi
done

# ===== 3. DOCKER COMPOSE SYNTAX VALIDATION =====
section "Docker Compose Syntax"

if [ -f "$COMPOSE_FILE" ]; then
    if $DOCKER_COMPOSE -f "$COMPOSE_FILE" config &> /dev/null; then
        log "docker-compose.unified.yml syntax is valid"
        
        # Check for common issues
        SERVICES_COUNT=$($DOCKER_COMPOSE -f "$COMPOSE_FILE" config --services | wc -l)
        info "Found $SERVICES_COUNT services defined"
        
    else
        error "docker-compose.unified.yml has syntax errors:"
        $DOCKER_COMPOSE -f "$COMPOSE_FILE" config 2>&1 | head -10 | tee -a "$VALIDATION_LOG"
    fi
fi

# ===== 4. ENVIRONMENT VARIABLES VALIDATION =====
section "Environment Variables"

# Source .env file
if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE" 2>/dev/null || warn "Could not source .env file"
    set +a
    
    # Required environment variables
    REQUIRED_VARS=(
        "DISCORD_BOT_TOKEN"
        "DISCORD_CLIENT_ID"
        "DISCORD_CLIENT_SECRET"
        "DISCORD_DB_PASSWORD"
        "STREAMBOT_DB_PASSWORD"
        "JARVIS_DB_PASSWORD"
        "DISCORD_SESSION_SECRET"
        "STREAMBOT_SESSION_SECRET"
        "LETSENCRYPT_EMAIL"
    )
    
    MISSING_VARS=()
    for var in "${REQUIRED_VARS[@]}"; do
        if [ -z "${!var:-}" ]; then
            MISSING_VARS+=("$var")
        fi
    done
    
    if [ ${#MISSING_VARS[@]} -eq 0 ]; then
        log "All required environment variables are set"
    else
        for var in "${MISSING_VARS[@]}"; do
            error "Missing required environment variable: $var"
        done
        info "Edit .env file to set missing variables"
    fi
    
    # Validate email format
    if [ -n "${LETSENCRYPT_EMAIL:-}" ]; then
        if [[ "$LETSENCRYPT_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
            log "LETSENCRYPT_EMAIL is valid: $LETSENCRYPT_EMAIL"
        else
            error "LETSENCRYPT_EMAIL has invalid format: $LETSENCRYPT_EMAIL"
        fi
    fi
    
    # Check for placeholder values
    PLACEHOLDER_VARS=$(grep -E "(your_|YOUR_|example|CHANGE_ME|placeholder)" "$ENV_FILE" | grep -v "^#" | wc -l || echo 0)
    if [ "$PLACEHOLDER_VARS" -gt 0 ]; then
        warn "Found $PLACEHOLDER_VARS placeholder values in .env - replace with real values"
    fi
    
else
    error ".env file not found for validation"
fi

# ===== 5. DISK SPACE VALIDATION =====
section "Disk Space"

AVAILABLE_SPACE_KB=$(df "$PROJECT_DIR" | tail -1 | awk '{print $4}')
AVAILABLE_SPACE_GB=$((AVAILABLE_SPACE_KB / 1024 / 1024))

if [ "$AVAILABLE_SPACE_GB" -ge "$MIN_DISK_SPACE_GB" ]; then
    log "Sufficient disk space available: ${AVAILABLE_SPACE_GB}GB (minimum: ${MIN_DISK_SPACE_GB}GB)"
else
    error "Insufficient disk space: ${AVAILABLE_SPACE_GB}GB available, ${MIN_DISK_SPACE_GB}GB required"
    info "Free up space with: docker system prune -a --volumes"
fi

# Check Docker disk usage
DOCKER_SPACE=$(docker system df 2>/dev/null || echo "")
if [ -n "$DOCKER_SPACE" ]; then
    info "Docker disk usage:"
    echo "$DOCKER_SPACE" | tee -a "$VALIDATION_LOG"
fi

# ===== 6. PORT AVAILABILITY VALIDATION =====
section "Port Availability"

# Ports that need to be available
REQUIRED_PORTS=(80 443 5000 8123 9000 9001 32400)
PORT_CONFLICTS=()

for port in "${REQUIRED_PORTS[@]}"; do
    if ss -tuln 2>/dev/null | grep -q ":$port " || netstat -tuln 2>/dev/null | grep -q ":$port "; then
        # Port is in use - check if it's our container
        CONTAINER_USING=$(docker ps --format '{{.Names}}' --filter "publish=$port" 2>/dev/null | head -1)
        if [ -n "$CONTAINER_USING" ]; then
            info "Port $port in use by our container: $CONTAINER_USING"
        else
            PORT_CONFLICTS+=("$port")
            error "Port $port is already in use by another process"
            info "Find process using port: sudo lsof -i :$port"
        fi
    else
        log "Port $port is available"
    fi
done

if [ ${#PORT_CONFLICTS[@]} -gt 0 ]; then
    info "To resolve port conflicts, stop the conflicting services or change ports in docker-compose.unified.yml"
fi

# ===== 7. NETWORK VALIDATION =====
section "Network Connectivity"

# Check internet connectivity
if ping -c 1 8.8.8.8 &> /dev/null; then
    log "Internet connectivity available"
else
    warn "No internet connectivity (may affect image pulls and SSL certificates)"
fi

# Check DNS resolution
if host github.com &> /dev/null 2>&1 || nslookup github.com &> /dev/null 2>&1; then
    log "DNS resolution working"
else
    warn "DNS resolution issues detected"
fi

# Check Docker network
if docker network ls | grep -q homelab; then
    log "Docker network 'homelab' exists"
else
    info "Docker network 'homelab' will be created during deployment"
fi

# ===== 8. DATABASE VALIDATION =====
section "Database Connectivity"

# Check if PostgreSQL container is running
if docker ps --format '{{.Names}}' | grep -q '^discord-bot-db$'; then
    log "PostgreSQL container is running"
    
    # Test database connectivity
    if docker exec discord-bot-db pg_isready -U ticketbot &> /dev/null; then
        log "Database is accepting connections"
        
        # Check if required databases exist
        DATABASES=$(docker exec discord-bot-db psql -U ticketbot -d postgres -t -c "SELECT datname FROM pg_database WHERE datistemplate = false;" 2>/dev/null || echo "")
        
        for db in ticketbot streambot homelab_jarvis; do
            if echo "$DATABASES" | grep -q "$db"; then
                log "Database '$db' exists"
            else
                warn "Database '$db' does not exist (will be created on first run)"
            fi
        done
    else
        warn "PostgreSQL is running but not accepting connections yet"
    fi
else
    info "PostgreSQL container not running (will start during deployment)"
fi

# ===== 9. IMAGE AVAILABILITY VALIDATION =====
section "Docker Images"

# Get list of services that use custom builds
BUILD_SERVICES=$(grep -A5 "build:" "$COMPOSE_FILE" | grep "context:" | awk '{print $2}' | sed 's/^.\///' || echo "")

if [ -n "$BUILD_SERVICES" ]; then
    info "Services with custom builds: $(echo "$BUILD_SERVICES" | tr '\n' ' ')"
    
    # Check if Dockerfiles exist
    for service_path in $BUILD_SERVICES; do
        if [ -f "${service_path}/Dockerfile" ]; then
            log "Dockerfile found: ${service_path}/Dockerfile"
        else
            error "Missing Dockerfile: ${service_path}/Dockerfile"
        fi
    done
fi

# Check if we can pull base images
info "Checking base image availability..."
BASE_IMAGES=("caddy:2-alpine" "redis:7-alpine" "postgres:16-alpine" "nginx:alpine")

for image in "${BASE_IMAGES[@]}"; do
    if docker pull "$image" &> /dev/null; then
        log "Base image available: $image"
    else
        warn "Cannot pull base image: $image (may already be cached)"
    fi
done

# ===== 10. RESOURCE LIMITS VALIDATION =====
section "System Resources"

# Check available memory
TOTAL_MEM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
TOTAL_MEM_GB=$((TOTAL_MEM_KB / 1024 / 1024))

if [ "$TOTAL_MEM_GB" -ge 4 ]; then
    log "Sufficient memory available: ${TOTAL_MEM_GB}GB"
else
    warn "Low memory: ${TOTAL_MEM_GB}GB (recommended: 4GB+)"
fi

# Check CPU cores
CPU_CORES=$(nproc)
if [ "$CPU_CORES" -ge 2 ]; then
    log "CPU cores available: $CPU_CORES"
else
    warn "Low CPU cores: $CPU_CORES (recommended: 2+)"
fi

# ===== VALIDATION SUMMARY =====
echo "" | tee -a "$VALIDATION_LOG"
echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" | tee -a "$VALIDATION_LOG"
echo -e "${CYAN}${BOLD}  VALIDATION SUMMARY${NC}" | tee -a "$VALIDATION_LOG"
echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" | tee -a "$VALIDATION_LOG"
echo "" | tee -a "$VALIDATION_LOG"

if [ $VALIDATION_ERRORS -eq 0 ] && [ $VALIDATION_WARNINGS -eq 0 ]; then
    echo -e "${GREEN}${BOLD}✓ ALL VALIDATION CHECKS PASSED${NC}" | tee -a "$VALIDATION_LOG"
    echo "" | tee -a "$VALIDATION_LOG"
    echo -e "${GREEN}System is ready for deployment!${NC}" | tee -a "$VALIDATION_LOG"
    EXIT_CODE=0
elif [ $VALIDATION_ERRORS -eq 0 ]; then
    echo -e "${YELLOW}${BOLD}⚠ VALIDATION COMPLETED WITH WARNINGS${NC}" | tee -a "$VALIDATION_LOG"
    echo "" | tee -a "$VALIDATION_LOG"
    echo -e "${YELLOW}Warnings: $VALIDATION_WARNINGS${NC}" | tee -a "$VALIDATION_LOG"
    echo "" | tee -a "$VALIDATION_LOG"
    echo "Warning checks:" | tee -a "$VALIDATION_LOG"
    for check in "${WARNING_CHECKS[@]}"; do
        echo "  - $check" | tee -a "$VALIDATION_LOG"
    done
    echo "" | tee -a "$VALIDATION_LOG"
    echo -e "${YELLOW}Deployment can proceed, but review warnings above${NC}" | tee -a "$VALIDATION_LOG"
    EXIT_CODE=0
else
    echo -e "${RED}${BOLD}✗ VALIDATION FAILED${NC}" | tee -a "$VALIDATION_LOG"
    echo "" | tee -a "$VALIDATION_LOG"
    echo -e "${RED}Errors: $VALIDATION_ERRORS${NC}" | tee -a "$VALIDATION_LOG"
    echo -e "${YELLOW}Warnings: $VALIDATION_WARNINGS${NC}" | tee -a "$VALIDATION_LOG"
    echo "" | tee -a "$VALIDATION_LOG"
    echo "Failed checks:" | tee -a "$VALIDATION_LOG"
    for check in "${FAILED_CHECKS[@]}"; do
        echo "  - $check" | tee -a "$VALIDATION_LOG"
    done
    echo "" | tee -a "$VALIDATION_LOG"
    echo -e "${RED}Fix the errors above before deploying${NC}" | tee -a "$VALIDATION_LOG"
    EXIT_CODE=1
fi

echo "" | tee -a "$VALIDATION_LOG"
echo "Validation log saved to: $VALIDATION_LOG" | tee -a "$VALIDATION_LOG"
echo "=== Validation Completed at $(date) ===" >> "$VALIDATION_LOG"
echo ""

exit $EXIT_CODE
