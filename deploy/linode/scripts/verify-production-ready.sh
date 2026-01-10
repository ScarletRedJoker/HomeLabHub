#!/bin/bash
# =============================================================================
# Nebula Command - Production Readiness Verification
# Verifies all services and configurations are ready for production deployment
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$DEPLOY_DIR")")"

ERRORS=0
WARNINGS=0

log_check() { echo -e "${CYAN}[CHECK]${NC} $1"; }
log_pass() { echo -e "  ${GREEN}[PASS]${NC} $1"; }
log_fail() { echo -e "  ${RED}[FAIL]${NC} $1"; ((ERRORS++)); }
log_warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; ((WARNINGS++)); }
log_info() { echo -e "  ${BLUE}[INFO]${NC} $1"; }

print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
}

print_header "Nebula Command - Production Readiness Verification"
echo "  Timestamp: $(date)"
echo "  Root Directory: $ROOT_DIR"

# =============================================================================
# CHECK 1: Required Files
# =============================================================================
print_header "Step 1: Required Files"

log_check "Docker configuration files..."

REQUIRED_FILES=(
    "$DEPLOY_DIR/docker-compose.yml"
    "$DEPLOY_DIR/Caddyfile"
    "$DEPLOY_DIR/postgres-init/init-databases.sh"
    "$ROOT_DIR/services/dashboard-next/Dockerfile"
    "$ROOT_DIR/services/discord-bot/Dockerfile"
    "$ROOT_DIR/services/stream-bot/Dockerfile"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [[ -f "$file" ]]; then
        log_pass "$(basename "$file")"
    else
        log_fail "Missing: $file"
    fi
done

# =============================================================================
# CHECK 2: Environment Variables
# =============================================================================
print_header "Step 2: Environment Configuration"

log_check "Environment file..."
if [[ -f "$DEPLOY_DIR/.env" ]]; then
    log_pass ".env file exists"
    
    # Check required variables
    REQUIRED_VARS=(
        "POSTGRES_PASSWORD"
        "DISCORD_BOT_TOKEN"
        "SESSION_SECRET"
        "SERVICE_AUTH_TOKEN"
    )
    
    for var in "${REQUIRED_VARS[@]}"; do
        if grep -q "^${var}=.\+" "$DEPLOY_DIR/.env" 2>/dev/null; then
            log_pass "$var is set"
        else
            log_fail "$var is missing or empty"
        fi
    done
    
    # Check recommended variables
    RECOMMENDED_VARS=(
        "OPENAI_API_KEY"
        "TAILSCALE_AUTHKEY"
        "TWITCH_CLIENT_ID"
        "YOUTUBE_CLIENT_ID"
    )
    
    for var in "${RECOMMENDED_VARS[@]}"; do
        if grep -q "^${var}=.\+" "$DEPLOY_DIR/.env" 2>/dev/null; then
            log_pass "$var is set (optional)"
        else
            log_warn "$var not set (optional feature)"
        fi
    done
else
    log_fail ".env file not found - copy from .env.example"
fi

# =============================================================================
# CHECK 3: Docker Build Verification
# =============================================================================
print_header "Step 3: Docker Build Verification"

log_check "Verifying Dockerfile syntax..."

DOCKERFILES=(
    "$ROOT_DIR/services/dashboard-next/Dockerfile"
    "$ROOT_DIR/services/discord-bot/Dockerfile"
    "$ROOT_DIR/services/stream-bot/Dockerfile"
)

for dockerfile in "${DOCKERFILES[@]}"; do
    if [[ -f "$dockerfile" ]]; then
        SERVICE_NAME=$(basename "$(dirname "$dockerfile")")
        # Check for multi-stage build
        if grep -q "FROM.*AS" "$dockerfile"; then
            log_pass "$SERVICE_NAME: Multi-stage build configured"
        else
            log_warn "$SERVICE_NAME: No multi-stage build"
        fi
        # Check for health check
        if grep -q "HEALTHCHECK" "$dockerfile"; then
            log_pass "$SERVICE_NAME: Health check configured"
        else
            log_warn "$SERVICE_NAME: No health check"
        fi
        # Check for non-root user
        if grep -q "USER " "$dockerfile"; then
            log_pass "$SERVICE_NAME: Non-root user configured"
        else
            log_warn "$SERVICE_NAME: Running as root"
        fi
    fi
done

# =============================================================================
# CHECK 4: Database Configuration
# =============================================================================
print_header "Step 4: Database Configuration"

log_check "Database initialization script..."
INIT_SCRIPT="$DEPLOY_DIR/postgres-init/init-databases.sh"
if [[ -f "$INIT_SCRIPT" ]]; then
    log_pass "init-databases.sh exists"
    
    EXPECTED_DBS=("homelab_jarvis" "ticketbot" "streambot")
    for db in "${EXPECTED_DBS[@]}"; do
        if grep -q "$db" "$INIT_SCRIPT"; then
            log_pass "Database $db configured"
        else
            log_warn "Database $db not found in init script"
        fi
    done
else
    log_fail "Database init script not found"
fi

log_check "Drizzle schemas..."
SCHEMAS=(
    "$ROOT_DIR/services/discord-bot/shared/schema.ts"
    "$ROOT_DIR/services/stream-bot/shared/schema.ts"
)

for schema in "${SCHEMAS[@]}"; do
    if [[ -f "$schema" ]]; then
        SERVICE_NAME=$(basename "$(dirname "$(dirname "$schema")")")
        log_pass "$SERVICE_NAME schema exists"
    else
        log_warn "Schema not found: $schema"
    fi
done

# =============================================================================
# CHECK 5: Service Entry Points
# =============================================================================
print_header "Step 5: Service Entry Points"

log_check "Docker entrypoint scripts..."
ENTRYPOINTS=(
    "$ROOT_DIR/services/discord-bot/docker-entrypoint.sh"
    "$ROOT_DIR/services/stream-bot/docker-entrypoint.sh"
)

for ep in "${ENTRYPOINTS[@]}"; do
    if [[ -f "$ep" ]]; then
        SERVICE_NAME=$(basename "$(dirname "$ep")")
        log_pass "$SERVICE_NAME entrypoint exists"
        if [[ -x "$ep" ]]; then
            log_pass "$SERVICE_NAME entrypoint is executable"
        else
            log_warn "$SERVICE_NAME entrypoint is not executable"
        fi
    else
        log_warn "Entrypoint not found: $ep"
    fi
done

# =============================================================================
# CHECK 6: Caddy Configuration
# =============================================================================
print_header "Step 6: Reverse Proxy Configuration"

log_check "Caddyfile configuration..."
if [[ -f "$DEPLOY_DIR/Caddyfile" ]]; then
    log_pass "Caddyfile exists"
    
    EXPECTED_DOMAINS=("evindrake.net" "rig-city.com" "scarletredjoker.com")
    for domain in "${EXPECTED_DOMAINS[@]}"; do
        if grep -q "$domain" "$DEPLOY_DIR/Caddyfile"; then
            log_pass "Domain $domain configured"
        else
            log_warn "Domain $domain not found in Caddyfile"
        fi
    done
else
    log_fail "Caddyfile not found"
fi

# =============================================================================
# CHECK 7: Monitoring Stack
# =============================================================================
print_header "Step 7: Monitoring Configuration"

log_check "Prometheus configuration..."
if [[ -f "$ROOT_DIR/config/prometheus/prometheus.yml" ]]; then
    log_pass "Prometheus config exists"
else
    log_warn "Prometheus config not found"
fi

log_check "Grafana provisioning..."
if [[ -d "$ROOT_DIR/config/grafana/provisioning" ]]; then
    log_pass "Grafana provisioning directory exists"
else
    log_warn "Grafana provisioning directory not found"
fi

# =============================================================================
# CHECK 8: Deployment Scripts
# =============================================================================
print_header "Step 8: Deployment Scripts"

DEPLOY_SCRIPTS=(
    "$SCRIPT_DIR/deploy.sh"
    "$SCRIPT_DIR/preflight.sh"
    "$SCRIPT_DIR/rollback.sh"
    "$SCRIPT_DIR/smoke-test.sh"
    "$SCRIPT_DIR/health-check.sh"
)

for script in "${DEPLOY_SCRIPTS[@]}"; do
    if [[ -f "$script" ]]; then
        if [[ -x "$script" ]]; then
            log_pass "$(basename "$script") exists and executable"
        else
            log_warn "$(basename "$script") exists but not executable"
        fi
    else
        log_warn "$(basename "$script") not found"
    fi
done

# =============================================================================
# SUMMARY
# =============================================================================
print_header "Production Readiness Summary"

echo ""
if [[ $ERRORS -eq 0 && $WARNINGS -eq 0 ]]; then
    echo -e "  ${GREEN}✓ ALL CHECKS PASSED${NC}"
    echo "  Your deployment is production-ready!"
elif [[ $ERRORS -eq 0 ]]; then
    echo -e "  ${YELLOW}⚠ READY WITH WARNINGS${NC}"
    echo "  $WARNINGS warning(s) detected - review before deploying"
else
    echo -e "  ${RED}✗ NOT PRODUCTION READY${NC}"
    echo "  $ERRORS error(s) and $WARNINGS warning(s) detected"
    echo "  Fix errors before deploying to production"
fi

echo ""
echo "  Next steps:"
if [[ $ERRORS -gt 0 ]]; then
    echo "    1. Fix all errors listed above"
    echo "    2. Re-run this verification script"
    echo "    3. Run: ./scripts/deploy.sh --dry-run"
else
    echo "    1. Run: ./scripts/deploy.sh --dry-run"
    echo "    2. Review output and confirm deployment"
    echo "    3. Run: ./scripts/deploy.sh"
fi
echo ""

exit $ERRORS
