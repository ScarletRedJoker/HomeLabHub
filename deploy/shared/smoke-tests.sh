#!/bin/bash
# Nebula Command - Smoke Tests for Core Services
# Run basic functionality tests to verify deployments
# Note: No 'set -e' - we want to continue testing even after failures

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

test_result() {
    local name="$1"
    local status="$2"
    local message="${3:-}"
    
    if [ "$status" = "pass" ]; then
        echo -e "${GREEN}[PASS]${NC} $name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    elif [ "$status" = "skip" ]; then
        echo -e "${YELLOW}[SKIP]${NC} $name ${message:+- $message}"
        TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
    else
        echo -e "${RED}[FAIL]${NC} $name ${message:+- $message}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

test_endpoint() {
    local name="$1"
    local url="$2"
    local expected_status="${3:-200}"
    local timeout="${4:-10}"
    
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout "$timeout" "$url" 2>/dev/null || echo "000")
    
    if [ "$response" = "$expected_status" ]; then
        test_result "$name" "pass"
    elif [ "$response" = "000" ]; then
        test_result "$name" "fail" "Connection failed (timeout or unreachable)"
    else
        test_result "$name" "fail" "Expected $expected_status, got $response"
    fi
    return 0
}

test_container_health() {
    local container="$1"
    local health
    
    if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container}$"; then
        test_result "$container container running" "fail" "Container not found"
        return 0
    fi
    
    health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' "$container" 2>/dev/null || echo "unknown")
    
    if [ "$health" = "healthy" ] || [ "$health" = "running" ]; then
        test_result "$container container healthy" "pass"
    else
        test_result "$container container healthy" "fail" "Status: $health"
    fi
    return 0
}

test_database_connection() {
    local container="$1"
    local db_name="$2"
    
    if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container}$"; then
        test_result "Database $db_name accessible" "skip" "Container not running"
        return 0
    fi
    
    if docker exec "$container" pg_isready -U postgres 2>/dev/null | grep -q "accepting connections"; then
        test_result "Database $db_name accessible" "pass"
    else
        test_result "Database $db_name accessible" "fail" "Not accepting connections"
    fi
    return 0
}

run_linode_tests() {
    echo -e "${CYAN}═══ Linode Deployment Smoke Tests ═══${NC}"
    echo ""
    
    echo -e "${CYAN}━━━ Infrastructure ━━━${NC}"
    test_container_health "homelab-postgres"
    test_container_health "homelab-redis"
    test_database_connection "homelab-postgres" "postgres"
    
    echo ""
    echo -e "${CYAN}━━━ Dashboard ━━━${NC}"
    test_container_health "homelab-dashboard"
    test_endpoint "Dashboard health" "http://localhost:5000/api/health"
    test_endpoint "Dashboard API" "http://localhost:5000/api/docker"
    
    echo ""
    echo -e "${CYAN}━━━ Discord Bot ━━━${NC}"
    test_container_health "discord-bot"
    test_endpoint "Discord Bot health" "http://localhost:4000/health"
    
    echo ""
    echo -e "${CYAN}━━━ Stream Bot ━━━${NC}"
    test_container_health "stream-bot"
    test_endpoint "Stream Bot health" "http://localhost:3000/health" "200" "15"
    
    echo ""
    echo -e "${CYAN}━━━ Reverse Proxy ━━━${NC}"
    test_container_health "caddy"
    test_endpoint "Caddy HTTP" "http://localhost:80/"
    
    echo ""
    echo -e "${CYAN}━━━ Monitoring ━━━${NC}"
    test_container_health "homelab-grafana"
    test_container_health "homelab-prometheus"
}

run_local_tests() {
    echo -e "${CYAN}═══ Local Deployment Smoke Tests ═══${NC}"
    echo ""
    
    echo -e "${CYAN}━━━ Infrastructure ━━━${NC}"
    test_container_health "dashboard-postgres"
    test_container_health "dashboard-redis"
    test_database_connection "dashboard-postgres" "postgres"
    
    echo ""
    echo -e "${CYAN}━━━ Authentication ━━━${NC}"
    test_container_health "authelia"
    test_endpoint "Authelia health" "http://localhost:9091/api/health"
    
    echo ""
    echo -e "${CYAN}━━━ Media Services ━━━${NC}"
    test_container_health "plex"
    test_endpoint "Plex" "http://localhost:32400/identity"
    test_container_health "jellyfin"
    test_endpoint "Jellyfin" "http://localhost:8096/health"
    
    echo ""
    echo -e "${CYAN}━━━ Home Automation ━━━${NC}"
    test_container_health "homeassistant"
    test_endpoint "Home Assistant" "http://localhost:8123/"
    
    echo ""
    echo -e "${CYAN}━━━ Storage ━━━${NC}"
    test_container_health "homelab-minio"
    test_endpoint "MinIO health" "http://localhost:9000/minio/health/live"
    
    echo ""
    echo -e "${CYAN}━━━ Reverse Proxy ━━━${NC}"
    test_container_health "caddy-local"
    test_endpoint "Caddy HTTP" "http://localhost:80/"
}

print_summary() {
    echo ""
    echo -e "${CYAN}═══ Test Summary ═══${NC}"
    echo -e "  Passed:  ${GREEN}$TESTS_PASSED${NC}"
    echo -e "  Failed:  ${RED}$TESTS_FAILED${NC}"
    echo -e "  Skipped: ${YELLOW}$TESTS_SKIPPED${NC}"
    echo ""
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✓ All tests passed!${NC}"
        return 0
    else
        echo -e "${RED}✗ $TESTS_FAILED test(s) failed${NC}"
        return 1
    fi
}

case "${1:-}" in
    linode)
        run_linode_tests
        print_summary
        ;;
    local)
        run_local_tests
        print_summary
        ;;
    *)
        echo "Usage: $0 <linode|local>"
        echo ""
        echo "Run smoke tests for deployment verification:"
        echo "  linode - Test Linode cloud deployment"
        echo "  local  - Test local homelab deployment"
        exit 1
        ;;
esac
