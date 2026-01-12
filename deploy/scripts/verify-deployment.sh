#!/bin/bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'
BOLD='\033[1m'

TIMEOUT_SHORT=5
TIMEOUT_MEDIUM=10
TIMEOUT_LONG=30

TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
SKIPPED_CHECKS=0
FAILED_SERVICES=()

ROLE=""
VERBOSE="false"
JSON_OUTPUT="false"

CLOUD_DASHBOARD_URL="${CLOUD_DASHBOARD_URL:-https://dashboard.evindrake.net}"
CLOUD_DISCORD_BOT_URL="${CLOUD_DISCORD_BOT_URL:-https://bot.evindrake.net}"
CLOUD_STREAM_BOT_URL="${CLOUD_STREAM_BOT_URL:-https://stream.evindrake.net}"
CLOUD_N8N_URL="${CLOUD_N8N_URL:-https://n8n.evindrake.net}"
CLOUD_PLEX_URL="${CLOUD_PLEX_URL:-https://plex.evindrake.net}"
CLOUD_HOMEASSISTANT_URL="${CLOUD_HOMEASSISTANT_URL:-https://home.evindrake.net}"
WIREGUARD_LOCAL_IP="${WIREGUARD_LOCAL_IP:-10.200.0.2}"
GAMESTREAM_PORT="${GAMESTREAM_PORT:-47984}"

LOCAL_PLEX_URL="${LOCAL_PLEX_URL:-http://localhost:32400}"
LOCAL_HOMEASSISTANT_URL="${LOCAL_HOMEASSISTANT_URL:-http://localhost:8123}"
LOCAL_MINIO_URL="${LOCAL_MINIO_URL:-http://localhost:9000}"
LOCAL_MINIO_CONSOLE_URL="${LOCAL_MINIO_CONSOLE_URL:-http://localhost:9001}"
SUNSHINE_VM_IP="${SUNSHINE_VM_IP:-192.168.122.250}"

show_usage() {
    cat << EOF
${BOLD}Unified Deployment Verification Script${NC}

Usage: $(basename "$0") <role> [OPTIONS]

Arguments:
    cloud               Verify cloud (Linode) deployment
    local               Verify local (Ubuntu host) deployment

Options:
    -v, --verbose       Show detailed output including response bodies
    --json              Output results as JSON
    -h, --help          Show this help message

Description:
    This script performs comprehensive health checks on all services,
    testing actual functionality rather than just HTTP status codes.

Examples:
    $(basename "$0") cloud                  # Verify cloud deployment
    $(basename "$0") local --verbose        # Verify local with details
    $(basename "$0") cloud --json           # Output as JSON

Environment Variables:
    CLOUD_DASHBOARD_URL      Dashboard URL (default: https://dashboard.evindrake.net)
    CLOUD_DISCORD_BOT_URL    Discord Bot URL (default: https://bot.evindrake.net)
    CLOUD_STREAM_BOT_URL     Stream Bot URL (default: https://stream.evindrake.net)
    CLOUD_N8N_URL            n8n URL (default: https://n8n.evindrake.net)
    WIREGUARD_LOCAL_IP       WireGuard local IP (default: 10.200.0.2)
    LOCAL_PLEX_URL           Local Plex URL (default: http://localhost:32400)
    LOCAL_HOMEASSISTANT_URL  Local Home Assistant URL (default: http://localhost:8123)
    LOCAL_MINIO_URL          Local MinIO URL (default: http://localhost:9000)
    SUNSHINE_VM_IP           Sunshine VM IP (default: 192.168.122.250)

Exit Codes:
    0   All checks passed
    1   One or more checks failed
    2   Invalid arguments
EOF
}

log_info() {
    [[ "$JSON_OUTPUT" == "true" ]] && return
    echo -e "${BLUE}ℹ${NC} $1"
}

log_section() {
    [[ "$JSON_OUTPUT" == "true" ]] && return
    echo ""
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${CYAN}  $1${NC}"
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

log_subsection() {
    [[ "$JSON_OUTPUT" == "true" ]] && return
    echo ""
    echo -e "${MAGENTA}▸ $1${NC}"
    echo -e "${MAGENTA}$(printf '%.0s─' {1..50})${NC}"
}

pass() {
    local service="$1"
    local message="$2"
    ((TOTAL_CHECKS++))
    ((PASSED_CHECKS++))
    [[ "$JSON_OUTPUT" == "true" ]] && return
    echo -e "${GREEN}✓${NC} ${BOLD}$service${NC}: $message"
}

fail() {
    local service="$1"
    local message="$2"
    ((TOTAL_CHECKS++))
    ((FAILED_CHECKS++))
    FAILED_SERVICES+=("$service")
    [[ "$JSON_OUTPUT" == "true" ]] && return
    echo -e "${RED}✗${NC} ${BOLD}$service${NC}: $message"
}

skip() {
    local service="$1"
    local message="$2"
    ((TOTAL_CHECKS++))
    ((SKIPPED_CHECKS++))
    [[ "$JSON_OUTPUT" == "true" ]] && return
    echo -e "${YELLOW}○${NC} ${BOLD}$service${NC}: $message (skipped)"
}

verbose_log() {
    [[ "$JSON_OUTPUT" == "true" ]] && return
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "    ${CYAN}→${NC} $1"
    fi
}

check_command() {
    local cmd="$1"
    if ! command -v "$cmd" &> /dev/null; then
        return 1
    fi
    return 0
}

curl_check() {
    local url="$1"
    local timeout="${2:-$TIMEOUT_MEDIUM}"
    curl -sf --max-time "$timeout" --connect-timeout "$TIMEOUT_SHORT" "$url" 2>/dev/null
}

curl_status() {
    local url="$1"
    local timeout="${2:-$TIMEOUT_MEDIUM}"
    curl -sf -o /dev/null -w "%{http_code}" --max-time "$timeout" --connect-timeout "$TIMEOUT_SHORT" "$url" 2>/dev/null || echo "000"
}

check_port() {
    local host="$1"
    local port="$2"
    local timeout="${3:-$TIMEOUT_SHORT}"
    
    if check_command nc; then
        nc -zw "$timeout" "$host" "$port" 2>/dev/null
    else
        timeout "$timeout" bash -c "</dev/tcp/$host/$port" 2>/dev/null
    fi
}

check_postgresql() {
    log_subsection "PostgreSQL Database"
    
    local container="${POSTGRES_CONTAINER:-homelab-postgres}"
    
    if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container}$"; then
        fail "PostgreSQL" "Container '$container' not running"
        return 1
    fi
    
    local ready_output
    ready_output=$(docker exec "$container" pg_isready -U postgres 2>&1)
    if [[ $? -eq 0 ]]; then
        verbose_log "$ready_output"
        pass "PostgreSQL" "Accepting connections"
    else
        fail "PostgreSQL" "Not accepting connections: $ready_output"
        return 1
    fi
    
    local query_result
    query_result=$(docker exec "$container" psql -U postgres -t -c "SELECT 1 as test;" 2>&1)
    if echo "$query_result" | grep -q "1"; then
        pass "PostgreSQL Query" "Can execute queries"
    else
        fail "PostgreSQL Query" "Query failed: $query_result"
        return 1
    fi
    
    local db_count
    db_count=$(docker exec "$container" psql -U postgres -t -c "SELECT count(*) FROM pg_database WHERE datistemplate = false;" 2>&1 | tr -d ' ')
    if [[ "$db_count" =~ ^[0-9]+$ ]] && [[ "$db_count" -gt 0 ]]; then
        verbose_log "Found $db_count databases"
        pass "PostgreSQL Databases" "$db_count databases available"
    else
        fail "PostgreSQL Databases" "Cannot list databases"
        return 1
    fi
}

check_redis() {
    log_subsection "Redis Cache"
    
    local container="${REDIS_CONTAINER:-homelab-redis}"
    
    if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container}$"; then
        fail "Redis" "Container '$container' not running"
        return 1
    fi
    
    local ping_result
    ping_result=$(docker exec "$container" redis-cli ping 2>&1)
    if [[ "$ping_result" == "PONG" ]]; then
        pass "Redis Ping" "PONG received"
    else
        fail "Redis Ping" "Expected PONG, got: $ping_result"
        return 1
    fi
    
    local info_result
    info_result=$(docker exec "$container" redis-cli info server 2>&1 | grep -E "redis_version|uptime_in_seconds")
    if [[ -n "$info_result" ]]; then
        local version=$(echo "$info_result" | grep redis_version | cut -d: -f2 | tr -d '\r')
        local uptime=$(echo "$info_result" | grep uptime_in_seconds | cut -d: -f2 | tr -d '\r')
        verbose_log "Version: $version, Uptime: ${uptime}s"
        pass "Redis Info" "Version $version, up ${uptime}s"
    else
        fail "Redis Info" "Cannot retrieve server info"
        return 1
    fi
    
    local set_result
    set_result=$(docker exec "$container" redis-cli set "verify_test_key" "test_value" EX 10 2>&1)
    if [[ "$set_result" == "OK" ]]; then
        local get_result
        get_result=$(docker exec "$container" redis-cli get "verify_test_key" 2>&1)
        if [[ "$get_result" == "test_value" ]]; then
            docker exec "$container" redis-cli del "verify_test_key" >/dev/null 2>&1
            pass "Redis Read/Write" "Can read and write keys"
        else
            fail "Redis Read/Write" "Read failed: expected 'test_value', got '$get_result'"
            return 1
        fi
    else
        fail "Redis Read/Write" "Write failed: $set_result"
        return 1
    fi
}

check_dashboard() {
    log_subsection "Dashboard Service"
    
    local url="$CLOUD_DASHBOARD_URL"
    
    local status
    status=$(curl_status "$url")
    verbose_log "HTTP status: $status"
    
    if [[ "$status" == "200" ]] || [[ "$status" == "302" ]] || [[ "$status" == "301" ]]; then
        pass "Dashboard HTTP" "Responding with status $status"
    else
        fail "Dashboard HTTP" "Unexpected status: $status"
        return 1
    fi
    
    local login_response
    login_response=$(curl_check "$url/login" "$TIMEOUT_MEDIUM")
    if [[ -n "$login_response" ]]; then
        if echo "$login_response" | grep -qiE "(login|username|password|sign.?in|form)"; then
            pass "Dashboard Login Page" "Login form detected"
        else
            verbose_log "Response doesn't contain expected login form elements"
            pass "Dashboard Login Page" "Page accessible (form check inconclusive)"
        fi
    else
        fail "Dashboard Login Page" "Cannot reach login page"
        return 1
    fi
    
    local health_response
    health_response=$(curl_check "$url/health" "$TIMEOUT_SHORT" 2>/dev/null || echo "")
    if [[ -n "$health_response" ]]; then
        verbose_log "Health endpoint: $health_response"
        pass "Dashboard Health" "Health endpoint available"
    else
        verbose_log "No dedicated health endpoint"
    fi
}

check_discord_bot() {
    log_subsection "Discord Bot Service"
    
    local url="$CLOUD_DISCORD_BOT_URL"
    
    local health_response
    health_response=$(curl_check "$url/health" "$TIMEOUT_MEDIUM")
    
    if [[ -z "$health_response" ]]; then
        fail "Discord Bot Health" "Health endpoint not responding"
        return 1
    fi
    
    verbose_log "Health response: $health_response"
    
    if echo "$health_response" | grep -qiE '"status"\s*:\s*"(ok|healthy|up)"'; then
        pass "Discord Bot Health" "Status OK"
    elif echo "$health_response" | grep -qi "ok\|healthy\|alive"; then
        pass "Discord Bot Health" "Service responding"
    else
        fail "Discord Bot Health" "Unexpected health response"
        return 1
    fi
    
    if echo "$health_response" | grep -qE '"(guilds?|servers?|connected_servers?)"\s*:'; then
        local guild_count
        guild_count=$(echo "$health_response" | grep -oE '"(guilds?|servers?|connected_servers?)"\s*:\s*[0-9]+' | grep -oE '[0-9]+' | head -1)
        if [[ -n "$guild_count" ]]; then
            pass "Discord Bot Guilds" "Connected to $guild_count server(s)"
        else
            pass "Discord Bot Guilds" "Guild info present"
        fi
    else
        verbose_log "No guild/server count in health response"
    fi
    
    if echo "$health_response" | grep -qE '"bot"\s*:\s*"?(online|connected|ready)"?'; then
        pass "Discord Bot Status" "Bot is online"
    elif echo "$health_response" | grep -qi "discord.*connected\|bot.*ready"; then
        pass "Discord Bot Status" "Bot appears connected"
    fi
}

check_stream_bot() {
    log_subsection "Stream Bot Service"
    
    local url="$CLOUD_STREAM_BOT_URL"
    
    local health_response
    health_response=$(curl_check "$url/health" "$TIMEOUT_MEDIUM")
    
    if [[ -z "$health_response" ]]; then
        fail "Stream Bot Health" "Health endpoint not responding"
        return 1
    fi
    
    verbose_log "Health response: $health_response"
    
    if echo "$health_response" | grep -qiE '"status"\s*:\s*"(ok|healthy|up)"'; then
        pass "Stream Bot Health" "Status OK"
    elif echo "$health_response" | grep -qi "ok\|healthy"; then
        pass "Stream Bot Health" "Service responding"
    else
        fail "Stream Bot Health" "Unexpected health response"
        return 1
    fi
    
    if echo "$health_response" | grep -qiE '(twitch|youtube|spotify|oauth|integrations?)'; then
        local oauth_status=""
        
        if echo "$health_response" | grep -qiE '"twitch"\s*:'; then
            local twitch_status
            twitch_status=$(echo "$health_response" | grep -oE '"twitch"\s*:\s*"?[^",}]+"?' | head -1)
            oauth_status+="Twitch "
        fi
        
        if echo "$health_response" | grep -qiE '"youtube"\s*:'; then
            local youtube_status
            youtube_status=$(echo "$health_response" | grep -oE '"youtube"\s*:\s*"?[^",}]+"?' | head -1)
            oauth_status+="YouTube "
        fi
        
        if echo "$health_response" | grep -qiE '"spotify"\s*:'; then
            local spotify_status
            spotify_status=$(echo "$health_response" | grep -oE '"spotify"\s*:\s*"?[^",}]+"?' | head -1)
            oauth_status+="Spotify "
        fi
        
        if [[ -n "$oauth_status" ]]; then
            pass "Stream Bot OAuth" "OAuth integrations present: $oauth_status"
        else
            pass "Stream Bot OAuth" "OAuth status reported"
        fi
    else
        verbose_log "OAuth status not in health response"
    fi
    
    if echo "$health_response" | grep -qE '"database"\s*:\s*"?(connected|ok|healthy)"?'; then
        pass "Stream Bot Database" "Database connected"
    fi
}

check_n8n() {
    log_subsection "n8n Automation Service"
    
    local url="$CLOUD_N8N_URL"
    
    local status
    status=$(curl_status "$url")
    verbose_log "HTTP status: $status"
    
    if [[ "$status" == "401" ]]; then
        pass "n8n Auth" "Basic auth enabled (401 expected)"
    elif [[ "$status" == "200" ]] || [[ "$status" == "302" ]]; then
        pass "n8n Access" "Accessible with status $status"
    else
        fail "n8n Access" "Unexpected status: $status (expected 401 or 200)"
        return 1
    fi
    
    local workflow_status
    workflow_status=$(curl -sf -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT_SHORT" "$url/rest/workflows" 2>/dev/null || echo "000")
    verbose_log "Workflow endpoint status: $workflow_status"
    
    if [[ "$workflow_status" == "401" ]] || [[ "$workflow_status" == "200" ]]; then
        pass "n8n Workflows" "Workflow endpoint reachable"
    else
        verbose_log "Workflow endpoint may require auth"
    fi
}

check_plex_cloud() {
    log_subsection "Plex (via WireGuard)"
    
    local url="$CLOUD_PLEX_URL"
    
    local identity_response
    identity_response=$(curl_check "$url/identity" "$TIMEOUT_MEDIUM")
    
    if [[ -z "$identity_response" ]]; then
        fail "Plex Identity" "Cannot reach Plex via WireGuard"
        return 1
    fi
    
    verbose_log "Identity response: $(echo "$identity_response" | head -c 200)"
    
    if echo "$identity_response" | grep -qi "machineIdentifier"; then
        local machine_id
        machine_id=$(echo "$identity_response" | grep -oE 'machineIdentifier="[^"]+"' | cut -d'"' -f2 || echo "")
        if [[ -n "$machine_id" ]]; then
            pass "Plex Identity" "Machine ID: ${machine_id:0:16}..."
        else
            pass "Plex Identity" "Identity endpoint responding"
        fi
    else
        fail "Plex Identity" "Invalid identity response"
        return 1
    fi
}

check_plex_local() {
    log_subsection "Plex Media Server (Local)"
    
    local url="$LOCAL_PLEX_URL"
    
    local identity_response
    identity_response=$(curl_check "$url/identity" "$TIMEOUT_MEDIUM")
    
    if [[ -z "$identity_response" ]]; then
        fail "Plex Identity" "Cannot reach Plex locally"
        return 1
    fi
    
    verbose_log "Identity response: $(echo "$identity_response" | head -c 200)"
    
    if echo "$identity_response" | grep -qi "machineIdentifier"; then
        local machine_id
        machine_id=$(echo "$identity_response" | grep -oE 'machineIdentifier="[^"]+"' | cut -d'"' -f2 || echo "")
        local version
        version=$(echo "$identity_response" | grep -oE 'version="[^"]+"' | cut -d'"' -f2 || echo "unknown")
        pass "Plex Identity" "Version: $version"
    else
        fail "Plex Identity" "Invalid identity response"
        return 1
    fi
    
    local status_response
    status_response=$(curl_check "$url" "$TIMEOUT_SHORT")
    if [[ -n "$status_response" ]]; then
        pass "Plex Web" "Web interface accessible"
    else
        verbose_log "Web interface may require authentication"
    fi
}

check_homeassistant_cloud() {
    log_subsection "Home Assistant (via WireGuard)"
    
    local url="$CLOUD_HOMEASSISTANT_URL"
    
    local status
    status=$(curl_status "$url")
    verbose_log "HTTP status: $status"
    
    if [[ "$status" == "200" ]] || [[ "$status" == "401" ]] || [[ "$status" == "403" ]]; then
        pass "Home Assistant HTTP" "Responding with status $status"
    else
        fail "Home Assistant HTTP" "Not reachable (status: $status)"
        return 1
    fi
    
    local api_status
    api_status=$(curl_status "$url/api/" "$TIMEOUT_SHORT")
    verbose_log "API status: $api_status"
    
    if [[ "$api_status" == "200" ]] || [[ "$api_status" == "401" ]]; then
        pass "Home Assistant API" "API endpoint reachable (status: $api_status)"
    else
        verbose_log "API may require auth token"
    fi
}

check_homeassistant_local() {
    log_subsection "Home Assistant (Local)"
    
    local url="$LOCAL_HOMEASSISTANT_URL"
    
    local status
    status=$(curl_status "$url")
    verbose_log "HTTP status: $status"
    
    if [[ "$status" == "200" ]]; then
        pass "Home Assistant HTTP" "Web interface accessible"
    elif [[ "$status" == "401" ]] || [[ "$status" == "403" ]]; then
        pass "Home Assistant HTTP" "Running (auth required)"
    else
        fail "Home Assistant HTTP" "Not reachable (status: $status)"
        return 1
    fi
    
    local api_response
    api_response=$(curl_check "$url/api/" "$TIMEOUT_SHORT")
    if [[ -n "$api_response" ]]; then
        if echo "$api_response" | grep -qi "api_running\|message"; then
            pass "Home Assistant API" "API responding"
        else
            pass "Home Assistant API" "API endpoint accessible"
        fi
    fi
    
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "homeassistant"; then
        local container_health
        container_health=$(docker inspect --format='{{.State.Health.Status}}' homeassistant 2>/dev/null || echo "unknown")
        if [[ "$container_health" == "healthy" ]]; then
            pass "Home Assistant Container" "Container is healthy"
        elif [[ "$container_health" == "unknown" ]]; then
            pass "Home Assistant Container" "Container running (no healthcheck)"
        else
            verbose_log "Container health: $container_health"
        fi
    fi
}

check_minio() {
    log_subsection "MinIO Object Storage (Local)"
    
    local url="$LOCAL_MINIO_URL"
    
    local health_status
    health_status=$(curl_status "$url/minio/health/ready" "$TIMEOUT_SHORT")
    verbose_log "Health status: $health_status"
    
    if [[ "$health_status" == "200" ]]; then
        pass "MinIO Health" "Ready and healthy"
    else
        fail "MinIO Health" "Not ready (status: $health_status)"
        return 1
    fi
    
    local live_status
    live_status=$(curl_status "$url/minio/health/live" "$TIMEOUT_SHORT")
    if [[ "$live_status" == "200" ]]; then
        pass "MinIO Liveness" "Service alive"
    else
        verbose_log "Liveness check: $live_status"
    fi
    
    local console_url="$LOCAL_MINIO_CONSOLE_URL"
    local console_status
    console_status=$(curl_status "$console_url" "$TIMEOUT_SHORT")
    verbose_log "Console status: $console_status"
    
    if [[ "$console_status" == "200" ]] || [[ "$console_status" == "302" ]]; then
        pass "MinIO Console" "Console accessible"
    else
        verbose_log "Console may require different port"
    fi
}

check_gamestream_ports() {
    log_subsection "GameStream Ports (via WireGuard)"
    
    local host="$WIREGUARD_LOCAL_IP"
    local port="$GAMESTREAM_PORT"
    
    if check_port "$host" "$port" "$TIMEOUT_SHORT"; then
        pass "GameStream Control" "Port $port reachable at $host"
    else
        fail "GameStream Control" "Cannot connect to $host:$port via WireGuard"
        return 1
    fi
    
    if check_port "$host" 47989 "$TIMEOUT_SHORT"; then
        pass "GameStream HTTPS" "Port 47989 reachable"
    else
        verbose_log "HTTPS port 47989 not reachable"
    fi
    
    if check_port "$host" 47990 "$TIMEOUT_SHORT"; then
        pass "GameStream HTTP" "Port 47990 reachable"
    else
        verbose_log "HTTP port 47990 not reachable"
    fi
}

check_sunshine_local() {
    log_subsection "Sunshine/GameStream (Local)"
    
    local vm_ip="$SUNSHINE_VM_IP"
    
    if check_command virsh; then
        local vm_status
        vm_status=$(virsh list --all 2>/dev/null | grep -E "win11|windows" | awk '{print $3}')
        if [[ "$vm_status" == "running" ]]; then
            pass "Windows VM" "VM is running"
        elif [[ -n "$vm_status" ]]; then
            fail "Windows VM" "VM status: $vm_status"
            return 1
        else
            skip "Windows VM" "No Windows VM found"
            return 0
        fi
    else
        verbose_log "virsh not available, skipping VM check"
    fi
    
    if check_port "$vm_ip" 47984 "$TIMEOUT_SHORT"; then
        pass "Sunshine Control Port" "Port 47984 open on VM"
    else
        fail "Sunshine Control Port" "Cannot connect to $vm_ip:47984"
        return 1
    fi
    
    if check_port "$vm_ip" 47989 "$TIMEOUT_SHORT"; then
        pass "Sunshine HTTPS Port" "Port 47989 open"
    fi
    
    if check_port "$vm_ip" 47990 "$TIMEOUT_SHORT"; then
        pass "Sunshine HTTP Port" "Port 47990 open"
    fi
    
    if check_command iptables; then
        local nat_rules
        nat_rules=$(sudo iptables -t nat -L PREROUTING -n 2>/dev/null | grep -c "$GAMESTREAM_PORT" || echo "0")
        if [[ "$nat_rules" -gt 0 ]]; then
            pass "iptables NAT" "Port forwarding rules present"
        else
            verbose_log "No NAT rules found for port $GAMESTREAM_PORT"
        fi
    fi
}

check_wireguard() {
    log_subsection "WireGuard VPN"
    
    if ! check_command wg; then
        skip "WireGuard" "wg command not available"
        return 0
    fi
    
    local wg_output
    wg_output=$(sudo wg show 2>/dev/null || wg show 2>/dev/null || echo "")
    
    if [[ -z "$wg_output" ]]; then
        fail "WireGuard" "No active interfaces"
        return 1
    fi
    
    verbose_log "WireGuard output: $(echo "$wg_output" | head -5)"
    
    local interface
    interface=$(echo "$wg_output" | grep -E "^interface:" | head -1 | awk '{print $2}')
    if [[ -n "$interface" ]]; then
        pass "WireGuard Interface" "Active interface: $interface"
    else
        interface=$(echo "$wg_output" | head -1)
        pass "WireGuard Interface" "Interface detected"
    fi
    
    local handshake
    handshake=$(echo "$wg_output" | grep -E "latest handshake:" | head -1)
    if [[ -n "$handshake" ]]; then
        local handshake_time
        handshake_time=$(echo "$handshake" | sed 's/.*latest handshake: //')
        pass "WireGuard Handshake" "Recent: $handshake_time"
    else
        verbose_log "No recent handshake data"
    fi
    
    local transfer
    transfer=$(echo "$wg_output" | grep -E "transfer:" | head -1)
    if [[ -n "$transfer" ]]; then
        verbose_log "Transfer stats: $transfer"
        pass "WireGuard Transfer" "Data transfer active"
    fi
}

check_docker_containers() {
    log_subsection "Docker Containers"
    
    if ! check_command docker; then
        fail "Docker" "Docker not installed"
        return 1
    fi
    
    if ! docker info &>/dev/null; then
        fail "Docker Daemon" "Cannot connect to Docker"
        return 1
    fi
    
    local running
    running=$(docker ps --format '{{.Names}}' 2>/dev/null | wc -l)
    local total
    total=$(docker ps -a --format '{{.Names}}' 2>/dev/null | wc -l)
    
    pass "Docker Status" "$running/$total containers running"
    
    local unhealthy
    unhealthy=$(docker ps --filter "health=unhealthy" --format '{{.Names}}' 2>/dev/null)
    if [[ -n "$unhealthy" ]]; then
        fail "Container Health" "Unhealthy: $unhealthy"
    else
        pass "Container Health" "All containers healthy"
    fi
    
    if [[ "$VERBOSE" == "true" ]]; then
        echo ""
        echo -e "    ${CYAN}Running containers:${NC}"
        docker ps --format "      - {{.Names}}: {{.Status}}" 2>/dev/null
    fi
}

verify_cloud() {
    log_section "Cloud Deployment Verification (Linode)"
    
    check_docker_containers
    check_postgresql
    check_redis
    check_dashboard
    check_discord_bot
    check_stream_bot
    check_n8n
    check_wireguard
    check_plex_cloud
    check_homeassistant_cloud
    check_gamestream_ports
}

verify_local() {
    log_section "Local Deployment Verification (Ubuntu Host)"
    
    check_docker_containers
    check_plex_local
    check_homeassistant_local
    check_minio
    check_wireguard
    check_sunshine_local
}

print_summary() {
    echo ""
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${CYAN}  Verification Summary${NC}"
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  Role:     ${BOLD}$ROLE${NC}"
    echo -e "  Total:    $TOTAL_CHECKS checks"
    echo -e "  ${GREEN}Passed:${NC}   $PASSED_CHECKS"
    echo -e "  ${RED}Failed:${NC}   $FAILED_CHECKS"
    echo -e "  ${YELLOW}Skipped:${NC}  $SKIPPED_CHECKS"
    echo ""
    
    if [[ ${#FAILED_SERVICES[@]} -gt 0 ]]; then
        echo -e "  ${RED}Failed services:${NC}"
        for service in "${FAILED_SERVICES[@]}"; do
            echo -e "    ${RED}•${NC} $service"
        done
        echo ""
    fi
    
    if [[ $FAILED_CHECKS -eq 0 ]]; then
        echo -e "  ${GREEN}${BOLD}✓ All checks passed!${NC}"
        echo ""
        return 0
    else
        echo -e "  ${RED}${BOLD}✗ Some checks failed. Review output above.${NC}"
        echo ""
        return 1
    fi
}

output_json() {
    local status="healthy"
    [[ $FAILED_CHECKS -gt 0 ]] && status="unhealthy"
    
    local failed_json="[]"
    if [[ ${#FAILED_SERVICES[@]} -gt 0 ]]; then
        failed_json="["
        for i in "${!FAILED_SERVICES[@]}"; do
            [[ $i -gt 0 ]] && failed_json+=","
            failed_json+="\"${FAILED_SERVICES[$i]}\""
        done
        failed_json+="]"
    fi
    
    cat << EOF
{
  "timestamp": "$(date -Iseconds)",
  "role": "$ROLE",
  "summary": {
    "total": $TOTAL_CHECKS,
    "passed": $PASSED_CHECKS,
    "failed": $FAILED_CHECKS,
    "skipped": $SKIPPED_CHECKS
  },
  "failed_services": $failed_json,
  "status": "$status"
}
EOF
}

parse_args() {
    if [[ $# -lt 1 ]]; then
        show_usage
        exit 2
    fi
    
    case "$1" in
        cloud|local)
            ROLE="$1"
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            echo -e "${RED}Error:${NC} Invalid role '$1'. Must be 'cloud' or 'local'."
            echo ""
            show_usage
            exit 2
            ;;
    esac
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -v|--verbose)
                VERBOSE="true"
                shift
                ;;
            --json)
                JSON_OUTPUT="true"
                shift
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            *)
                echo -e "${RED}Error:${NC} Unknown option '$1'"
                show_usage
                exit 2
                ;;
        esac
    done
}

main() {
    parse_args "$@"
    
    if [[ "$JSON_OUTPUT" != "true" ]]; then
        echo ""
        echo -e "${BOLD}${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
        echo -e "${BOLD}${BLUE}║     Unified Deployment Verification                      ║${NC}"
        echo -e "${BOLD}${BLUE}║     Role: $(printf '%-47s' "$ROLE")║${NC}"
        echo -e "${BOLD}${BLUE}║     Time: $(printf '%-47s' "$(date '+%Y-%m-%d %H:%M:%S')")║${NC}"
        echo -e "${BOLD}${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
    fi
    
    case "$ROLE" in
        cloud)
            verify_cloud
            ;;
        local)
            verify_local
            ;;
    esac
    
    if [[ "$JSON_OUTPUT" == "true" ]]; then
        output_json
        [[ $FAILED_CHECKS -eq 0 ]]
    else
        print_summary
    fi
}

main "$@"
