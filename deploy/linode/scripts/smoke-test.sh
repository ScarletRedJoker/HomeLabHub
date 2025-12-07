#!/bin/bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'
BOLD='\033[1m'

TIMEOUT_QUICK=5
TIMEOUT_STANDARD=10

TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
FAILED_SERVICES=()

AUTO_FIX=false
JSON_OUTPUT=false
QUIET=false

declare -A RESULTS

show_usage() {
    cat << EOF
${BOLD}Post-Deployment Smoke Test${NC}

Quick functional validation for all Linode-hosted services.
Designed to run in < 30 seconds for CI/CD integration.

Usage: $(basename "$0") [OPTIONS]

Options:
    --auto-fix          Attempt to restart failed services automatically
    --json              Output results as JSON (for automation)
    --quiet, -q         Minimal output (pass/fail only)
    -h, --help          Show this help message

Exit Codes:
    0   All tests passed
    1   One or more tests failed
    2   Critical infrastructure failure (abort deployment)

Examples:
    $(basename "$0")                    # Standard smoke test
    $(basename "$0") --auto-fix         # Test and restart failures
    $(basename "$0") --json             # JSON output for CI/CD
    $(basename "$0") --auto-fix --quiet # Silent auto-fix

EOF
}

log_info() {
    [[ "$JSON_OUTPUT" == "true" || "$QUIET" == "true" ]] && return
    echo -e "${BLUE}ℹ${NC} $1"
}

log_section() {
    [[ "$JSON_OUTPUT" == "true" || "$QUIET" == "true" ]] && return
    echo ""
    echo -e "${BOLD}${CYAN}━━━ $1 ━━━${NC}"
}

pass() {
    local service="$1"
    local message="$2"
    ((TOTAL_TESTS++))
    ((PASSED_TESTS++))
    RESULTS["$service"]="pass:$message"
    [[ "$JSON_OUTPUT" == "true" || "$QUIET" == "true" ]] && return
    echo -e "${GREEN}✓${NC} ${BOLD}$service${NC}: $message"
}

fail() {
    local service="$1"
    local message="$2"
    ((TOTAL_TESTS++))
    ((FAILED_TESTS++))
    FAILED_SERVICES+=("$service")
    RESULTS["$service"]="fail:$message"
    [[ "$JSON_OUTPUT" == "true" || "$QUIET" == "true" ]] && return
    echo -e "${RED}✗${NC} ${BOLD}$service${NC}: $message"
}

warn() {
    local service="$1"
    local message="$2"
    [[ "$JSON_OUTPUT" == "true" || "$QUIET" == "true" ]] && return
    echo -e "${YELLOW}○${NC} ${BOLD}$service${NC}: $message"
}

curl_status() {
    local url="$1"
    local timeout="${2:-$TIMEOUT_QUICK}"
    curl -sf -o /dev/null -w "%{http_code}" --max-time "$timeout" --connect-timeout 3 "$url" 2>/dev/null || echo "000"
}

curl_check() {
    local url="$1"
    local timeout="${2:-$TIMEOUT_QUICK}"
    curl -sf --max-time "$timeout" --connect-timeout 3 "$url" 2>/dev/null
}

container_running() {
    local container="$1"
    docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container}$"
}

container_healthy() {
    local container="$1"
    local health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "none")
    local running=$(docker inspect --format='{{.State.Running}}' "$container" 2>/dev/null || echo "false")
    
    if [[ "$health" == "healthy" ]]; then
        return 0
    elif [[ "$running" == "true" && "$health" == "none" ]]; then
        return 0
    fi
    return 1
}

restart_service() {
    local compose_service="$1"
    local container_name="${2:-$compose_service}"
    [[ "$JSON_OUTPUT" != "true" && "$QUIET" != "true" ]] && echo -e "  ${YELLOW}→${NC} Restarting $compose_service..."
    
    cd "$DEPLOY_DIR"
    if docker compose restart "$compose_service" >/dev/null 2>&1; then
        sleep 5
        if container_running "$container_name"; then
            [[ "$JSON_OUTPUT" != "true" && "$QUIET" != "true" ]] && echo -e "  ${GREEN}→${NC} $compose_service restarted successfully"
            return 0
        fi
    fi
    [[ "$JSON_OUTPUT" != "true" && "$QUIET" != "true" ]] && echo -e "  ${RED}→${NC} Failed to restart $compose_service"
    return 1
}

test_infrastructure() {
    log_section "Infrastructure Layer"
    
    if container_healthy "homelab-postgres"; then
        if docker exec homelab-postgres pg_isready -U postgres >/dev/null 2>&1; then
            pass "PostgreSQL" "Healthy and accepting connections"
        else
            fail "PostgreSQL" "Container healthy but not accepting connections"
        fi
    else
        fail "PostgreSQL" "Container not healthy"
        if [[ "$AUTO_FIX" == "true" ]]; then
            restart_service "homelab-postgres" "homelab-postgres"
        fi
    fi
    
    if container_running "homelab-redis"; then
        local pong=$(docker exec homelab-redis redis-cli ping 2>/dev/null)
        if [[ "$pong" == "PONG" ]]; then
            pass "Redis" "Responding to PING"
        else
            fail "Redis" "Not responding to PING"
        fi
    else
        fail "Redis" "Container not running"
        if [[ "$AUTO_FIX" == "true" ]]; then
            restart_service "redis" "homelab-redis"
        fi
    fi
    
    if container_running "caddy"; then
        pass "Caddy" "Reverse proxy running"
    else
        fail "Caddy" "Container not running"
        if [[ "$AUTO_FIX" == "true" ]]; then
            restart_service "caddy" "caddy"
        fi
    fi
}

test_core_services() {
    log_section "Core Services"
    
    local dashboard_status=$(curl_status "https://dashboard.evindrake.net/health")
    if [[ "$dashboard_status" == "200" ]]; then
        pass "Dashboard" "Health endpoint OK (200)"
    elif [[ "$dashboard_status" == "302" || "$dashboard_status" == "301" ]]; then
        pass "Dashboard" "Accessible (redirect to login)"
    else
        fail "Dashboard" "Health check failed (HTTP $dashboard_status)"
        if [[ "$AUTO_FIX" == "true" ]]; then
            restart_service "homelab-dashboard"
        fi
    fi
    
    local grafana_status=$(curl_status "https://grafana.evindrake.net/api/health")
    if [[ "$grafana_status" == "200" ]]; then
        pass "Grafana" "Health endpoint OK"
    else
        fail "Grafana" "Health check failed (HTTP $grafana_status)"
        if [[ "$AUTO_FIX" == "true" ]]; then
            restart_service "homelab-grafana"
        fi
    fi
    
    local n8n_status=$(curl_status "https://n8n.evindrake.net")
    if [[ "$n8n_status" == "200" || "$n8n_status" == "401" || "$n8n_status" == "302" ]]; then
        pass "n8n" "Accessible (HTTP $n8n_status)"
    else
        fail "n8n" "Not accessible (HTTP $n8n_status)"
        if [[ "$AUTO_FIX" == "true" ]]; then
            restart_service "n8n"
        fi
    fi
    
    local code_status=$(curl_status "https://code.evindrake.net/healthz")
    if [[ "$code_status" == "200" ]]; then
        pass "Code Server" "Health endpoint OK"
    elif [[ "$code_status" == "401" || "$code_status" == "302" ]]; then
        pass "Code Server" "Accessible (auth required)"
    else
        fail "Code Server" "Not accessible (HTTP $code_status)"
        if [[ "$AUTO_FIX" == "true" ]]; then
            restart_service "code-server-proxy"
        fi
    fi
}

test_bots() {
    log_section "Bot Services"
    
    local discord_health=$(curl_check "https://bot.rig-city.com/health" "$TIMEOUT_STANDARD")
    if [[ -n "$discord_health" ]]; then
        if echo "$discord_health" | grep -qiE '"status"\s*:\s*"(ok|healthy)"'; then
            pass "Discord Bot" "Health OK"
        elif echo "$discord_health" | grep -qi "ok\|healthy\|alive"; then
            pass "Discord Bot" "Responding"
        else
            warn "Discord Bot" "Responding but status unclear"
            ((PASSED_TESTS++))
            ((TOTAL_TESTS++))
            RESULTS["Discord Bot"]="pass:Responding (status unclear)"
        fi
    else
        fail "Discord Bot" "Health endpoint not responding"
        if [[ "$AUTO_FIX" == "true" ]]; then
            restart_service "discord-bot"
        fi
    fi
    
    local stream_health=$(curl_check "https://stream.rig-city.com/health" "$TIMEOUT_STANDARD")
    if [[ -n "$stream_health" ]]; then
        if echo "$stream_health" | grep -qiE '"status"\s*:\s*"(ok|healthy)"'; then
            pass "Stream Bot" "Health OK"
        elif echo "$stream_health" | grep -qi "ok\|healthy"; then
            pass "Stream Bot" "Responding"
        else
            warn "Stream Bot" "Responding but status unclear"
            ((PASSED_TESTS++))
            ((TOTAL_TESTS++))
            RESULTS["Stream Bot"]="pass:Responding (status unclear)"
        fi
    else
        fail "Stream Bot" "Health endpoint not responding"
        if [[ "$AUTO_FIX" == "true" ]]; then
            restart_service "stream-bot"
        fi
    fi
}

test_static_sites() {
    log_section "Static Sites"
    
    local rigcity_status=$(curl_status "https://rig-city.com")
    if [[ "$rigcity_status" == "200" ]]; then
        pass "rig-city.com" "Site accessible"
    else
        fail "rig-city.com" "Not accessible (HTTP $rigcity_status)"
        if [[ "$AUTO_FIX" == "true" ]]; then
            restart_service "rig-city-site"
        fi
    fi
    
    local scarlet_status=$(curl_status "https://scarletredjoker.com")
    if [[ "$scarlet_status" == "200" ]]; then
        pass "scarletredjoker.com" "Site accessible"
    else
        fail "scarletredjoker.com" "Not accessible (HTTP $scarlet_status)"
        if [[ "$AUTO_FIX" == "true" ]]; then
            restart_service "scarletredjoker-web"
        fi
    fi
}

test_utilities() {
    log_section "Utilities"
    
    local dns_status=$(curl_status "https://dns.evindrake.net/health")
    if [[ "$dns_status" == "200" ]]; then
        pass "DNS Manager" "Health OK"
    elif container_running "dns-manager"; then
        warn "DNS Manager" "Container running, health endpoint unavailable"
        ((TOTAL_TESTS++))
    else
        fail "DNS Manager" "Not accessible"
        if [[ "$AUTO_FIX" == "true" ]]; then
            restart_service "dns-manager"
        fi
    fi
    
    if container_running "homelab-prometheus"; then
        pass "Prometheus" "Container running"
    else
        fail "Prometheus" "Container not running"
        if [[ "$AUTO_FIX" == "true" ]]; then
            restart_service "homelab-prometheus"
        fi
    fi
    
    if container_running "homelab-loki"; then
        pass "Loki" "Container running"
    else
        fail "Loki" "Container not running"
        if [[ "$AUTO_FIX" == "true" ]]; then
            restart_service "homelab-loki"
        fi
    fi
}

output_json() {
    echo "{"
    echo "  \"timestamp\": \"$(date -Iseconds)\","
    echo "  \"total\": $TOTAL_TESTS,"
    echo "  \"passed\": $PASSED_TESTS,"
    echo "  \"failed\": $FAILED_TESTS,"
    echo "  \"success\": $([ $FAILED_TESTS -eq 0 ] && echo "true" || echo "false"),"
    echo "  \"auto_fix\": $AUTO_FIX,"
    echo "  \"results\": {"
    
    local first=true
    for service in "${!RESULTS[@]}"; do
        local result="${RESULTS[$service]}"
        local status="${result%%:*}"
        local message="${result#*:}"
        
        if [[ "$first" == "true" ]]; then
            first=false
        else
            echo ","
        fi
        printf '    "%s": {"status": "%s", "message": "%s"}' "$service" "$status" "$message"
    done
    echo ""
    echo "  },"
    
    echo "  \"failed_services\": ["
    local first_failed=true
    for svc in "${FAILED_SERVICES[@]}"; do
        if [[ "$first_failed" == "true" ]]; then
            first_failed=false
        else
            echo ","
        fi
        printf '    "%s"' "$svc"
    done
    echo ""
    echo "  ]"
    echo "}"
}

print_summary() {
    echo ""
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${CYAN}  SMOKE TEST SUMMARY${NC}"
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    local pass_rate=0
    if [[ $TOTAL_TESTS -gt 0 ]]; then
        pass_rate=$((PASSED_TESTS * 100 / TOTAL_TESTS))
    fi
    
    if [[ $FAILED_TESTS -eq 0 ]]; then
        echo -e "  ${GREEN}${BOLD}ALL TESTS PASSED${NC} ($PASSED_TESTS/$TOTAL_TESTS)"
        echo ""
        echo -e "  ${GREEN}✓${NC} Deployment verified successfully"
    else
        echo -e "  ${RED}${BOLD}TESTS FAILED${NC} ($FAILED_TESTS failed, $PASSED_TESTS passed)"
        echo ""
        echo -e "  ${YELLOW}Failed services:${NC}"
        for svc in "${FAILED_SERVICES[@]}"; do
            echo -e "    ${RED}•${NC} $svc"
        done
        echo ""
        if [[ "$AUTO_FIX" == "true" ]]; then
            echo -e "  ${BLUE}ℹ${NC} Auto-fix was attempted for failed services"
        else
            echo -e "  ${YELLOW}Tip:${NC} Run with --auto-fix to attempt automatic recovery"
        fi
    fi
    
    echo ""
    echo -e "  Pass rate: ${BOLD}${pass_rate}%${NC}"
    echo -e "  Duration: $((SECONDS))s"
    echo ""
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --auto-fix)
            AUTO_FIX=true
            shift
            ;;
        --json)
            JSON_OUTPUT=true
            shift
            ;;
        --quiet|-q)
            QUIET=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_usage
            exit 2
            ;;
    esac
done

SECONDS=0

if [[ "$JSON_OUTPUT" != "true" && "$QUIET" != "true" ]]; then
    echo ""
    echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}${BLUE}  POST-DEPLOYMENT SMOKE TEST${NC}"
    echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo "  Timestamp: $(date)"
    echo "  Auto-fix: $AUTO_FIX"
fi

cd "$DEPLOY_DIR"

test_infrastructure

INFRA_FAILED=0
for svc_display in "PostgreSQL" "Redis" "Caddy"; do
    if [[ " ${FAILED_SERVICES[*]} " =~ " $svc_display " ]]; then
        ((INFRA_FAILED++))
    fi
done

if [[ $INFRA_FAILED -gt 1 ]]; then
    if [[ "$JSON_OUTPUT" == "true" ]]; then
        output_json
    elif [[ "$QUIET" != "true" ]]; then
        echo ""
        echo -e "${RED}${BOLD}CRITICAL: Multiple infrastructure services failed!${NC}"
        echo "Aborting smoke test - fix infrastructure before continuing."
    fi
    exit 2
fi

test_core_services
test_bots
test_static_sites
test_utilities

if [[ "$JSON_OUTPUT" == "true" ]]; then
    output_json
elif [[ "$QUIET" != "true" ]]; then
    print_summary
fi

if [[ "$QUIET" == "true" ]]; then
    if [[ $FAILED_TESTS -eq 0 ]]; then
        echo "PASS ($PASSED_TESTS/$TOTAL_TESTS)"
    else
        echo "FAIL ($FAILED_TESTS failed)"
    fi
fi

if [[ $FAILED_TESTS -gt 0 ]]; then
    exit 1
fi

exit 0
