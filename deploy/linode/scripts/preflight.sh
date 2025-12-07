#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
}

print_section() {
    echo ""
    echo -e "${YELLOW}━━━ $1 ━━━${NC}"
}

ERRORS=0
WARNINGS=0

check_pass() {
    echo -e "  ${GREEN}[OK]${NC} $1"
}

check_fail() {
    echo -e "  ${RED}[FAIL]${NC} $1"
    ERRORS=$((ERRORS + 1))
}

check_warn() {
    echo -e "  ${YELLOW}[WARN]${NC} $1"
    WARNINGS=$((WARNINGS + 1))
}

print_header "Pre-Flight Checks - Homelab Deployment"
echo "  Date: $(date)"
echo "  Host: $(hostname)"
echo "  User: $(whoami)"

print_section "Docker Environment"

if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | tr -d ',')
    check_pass "Docker installed: $DOCKER_VERSION"
else
    check_fail "Docker not installed"
fi

if docker compose version &> /dev/null; then
    COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || echo "unknown")
    check_pass "Docker Compose v2 available: $COMPOSE_VERSION"
else
    check_fail "Docker Compose v2 not available (use 'docker compose' not 'docker-compose')"
fi

if docker info &> /dev/null; then
    check_pass "Docker daemon is running"
else
    check_fail "Docker daemon is not running or not accessible"
fi

print_section "Disk Space"

ROOT_SPACE=$(df -h / | awk 'NR==2 {print $4}')
ROOT_PERCENT=$(df / | awk 'NR==2 {print $5}' | tr -d '%')

if [[ $ROOT_PERCENT -lt 80 ]]; then
    check_pass "Root filesystem: $ROOT_SPACE available ($ROOT_PERCENT% used)"
elif [[ $ROOT_PERCENT -lt 90 ]]; then
    check_warn "Root filesystem: $ROOT_SPACE available ($ROOT_PERCENT% used) - consider cleanup"
else
    check_fail "Root filesystem: $ROOT_SPACE available ($ROOT_PERCENT% used) - critically low!"
fi

DOCKER_ROOT=$(docker info 2>/dev/null | grep "Docker Root Dir" | awk '{print $4}')
if [[ -n "$DOCKER_ROOT" ]]; then
    DOCKER_SPACE=$(df -h "$DOCKER_ROOT" 2>/dev/null | awk 'NR==2 {print $4}')
    DOCKER_PERCENT=$(df "$DOCKER_ROOT" 2>/dev/null | awk 'NR==2 {print $5}' | tr -d '%')
    if [[ $DOCKER_PERCENT -lt 80 ]]; then
        check_pass "Docker storage ($DOCKER_ROOT): $DOCKER_SPACE available"
    else
        check_warn "Docker storage low: $DOCKER_SPACE available"
    fi
fi

print_section "Network Connectivity"

if ping -c 1 -W 3 8.8.8.8 &> /dev/null; then
    check_pass "Internet connectivity (8.8.8.8)"
else
    check_fail "No internet connectivity"
fi

if ping -c 1 -W 3 hub.docker.com &> /dev/null 2>&1 || curl -s --connect-timeout 3 https://hub.docker.com &> /dev/null; then
    check_pass "Docker Hub accessible"
else
    check_warn "Docker Hub may not be accessible"
fi

if curl -s --connect-timeout 3 https://api.openai.com &> /dev/null; then
    check_pass "OpenAI API reachable"
else
    check_warn "OpenAI API not reachable (Jarvis may have issues)"
fi

if curl -s --connect-timeout 3 https://discord.com/api &> /dev/null; then
    check_pass "Discord API reachable"
else
    check_warn "Discord API not reachable (bot may have issues)"
fi

print_section "Required Files"

cd "$DEPLOY_DIR"

if [[ -f "docker-compose.yml" ]]; then
    check_pass "docker-compose.yml exists"
else
    check_fail "docker-compose.yml not found"
fi

if [[ -f ".env" ]]; then
    check_pass ".env file exists"
else
    check_fail ".env file not found - create from .env.example"
fi

if [[ -f "Caddyfile" ]]; then
    check_pass "Caddyfile exists"
else
    check_fail "Caddyfile not found"
fi

if [[ -d "postgres-init" ]]; then
    check_pass "postgres-init directory exists"
else
    check_warn "postgres-init directory not found"
fi

print_section "Docker Volumes (Data Persistence)"

VOLUMES=("postgres_data" "n8n_data" "caddy_data" "caddy_config" "code_server_data" "redis_data" "prometheus_data" "grafana_data" "loki_data")

for vol in "${VOLUMES[@]}"; do
    FULL_VOL="linode_${vol}"
    if docker volume inspect "$FULL_VOL" &> /dev/null; then
        check_pass "Volume exists: $vol"
    else
        check_warn "Volume not found: $vol (will be created on first run)"
    fi
done

print_section "Environment Validation"

if [[ -x "$SCRIPT_DIR/validate-env.sh" ]]; then
    if "$SCRIPT_DIR/validate-env.sh"; then
        check_pass "Environment variables validated"
    else
        check_fail "Environment validation failed"
    fi
else
    check_warn "validate-env.sh not found or not executable"
fi

print_section "Current Container Status"

RUNNING=$(docker ps --format '{{.Names}}' 2>/dev/null | wc -l)
echo -e "  ${BLUE}[INFO]${NC} $RUNNING containers currently running"

if [[ $RUNNING -gt 0 ]]; then
    echo ""
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | head -20
fi

print_header "Pre-Flight Summary"

if [[ $ERRORS -gt 0 ]]; then
    echo -e "  ${RED}[FAILED]${NC} $ERRORS critical issue(s) found"
    echo -e "  ${YELLOW}[WARNING]${NC} $WARNINGS warning(s)"
    echo ""
    echo -e "  ${RED}Fix the critical issues before proceeding with deployment.${NC}"
    exit 1
else
    echo -e "  ${GREEN}[PASSED]${NC} All critical checks passed"
    if [[ $WARNINGS -gt 0 ]]; then
        echo -e "  ${YELLOW}[INFO]${NC} $WARNINGS warning(s) - review recommended"
    fi
    echo ""
    echo -e "  ${GREEN}System is ready for deployment!${NC}"
    exit 0
fi
