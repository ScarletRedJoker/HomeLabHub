#!/bin/bash
# Production Health Check Script
# Run after deployment to verify all services are working
# Usage: ./health-check.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}═══ Production Health Check ═══${NC}"
echo ""

PASSED=0
FAILED=0

check() {
    local name=$1
    local cmd=$2
    if eval "$cmd" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} $name"
        ((PASSED++))
    else
        echo -e "  ${RED}✗${NC} $name"
        ((FAILED++))
    fi
}

echo -e "${CYAN}Docker Containers:${NC}"
check "homelab-postgres" "docker ps | grep homelab-postgres | grep -q Up"
check "stream-bot" "docker ps | grep stream-bot | grep -q Up"
check "discord-bot" "docker ps | grep discord-bot | grep -q Up"
check "dashboard" "docker ps | grep dashboard | grep -q Up"
check "caddy" "docker ps | grep caddy | grep -q Up"
check "redis" "docker ps | grep redis | grep -q Up"
echo ""

echo -e "${CYAN}Internal Health Endpoints:${NC}"
check "Dashboard /health" "curl -sf http://localhost:5000/health"
check "Discord Bot /health" "curl -sf http://localhost:4000/health"
check "Stream Bot /health" "curl -sf http://localhost:3000/health"
echo ""

echo -e "${CYAN}External Access (via Caddy):${NC}"
check "dashboard.rig-city.com" "curl -sf https://dashboard.rig-city.com/health"
check "discord.rig-city.com" "curl -sf https://discord.rig-city.com/health"
check "stream.rig-city.com" "curl -sf https://stream.rig-city.com/health"
echo ""

echo -e "${CYAN}Database Connectivity:${NC}"
check "PostgreSQL (stream-bot)" "docker exec homelab-postgres psql -U postgres -d streambot -c 'SELECT 1' 2>/dev/null"
check "PostgreSQL (discord_bot)" "docker exec homelab-postgres psql -U postgres -d discord_bot -c 'SELECT 1' 2>/dev/null"
echo ""

echo -e "${CYAN}Stream Bot Database Tables:${NC}"
check "users table" "docker exec homelab-postgres psql -U postgres -d streambot -c '\\dt users' 2>/dev/null | grep -q users"
check "oauth_sessions table" "docker exec homelab-postgres psql -U postgres -d streambot -c '\\dt oauth_sessions' 2>/dev/null | grep -q oauth_sessions"
check "platform_connections table" "docker exec homelab-postgres psql -U postgres -d streambot -c '\\dt platform_connections' 2>/dev/null | grep -q platform_connections"
echo ""

echo "═══════════════════════════════"
echo -e "Results: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}"
echo ""

if [ $FAILED -gt 0 ]; then
    echo -e "${YELLOW}Some checks failed. Check logs:${NC}"
    echo "  docker logs stream-bot --tail 50"
    echo "  docker logs discord-bot --tail 50"
    echo "  docker logs caddy --tail 50"
    exit 1
else
    echo -e "${GREEN}All health checks passed!${NC}"
fi
