#!/bin/bash
# ╔════════════════════════════════════════════════════════════════════════════╗
# ║                    HOMELAB DOCTOR - Comprehensive Diagnostics             ║
# ╚════════════════════════════════════════════════════════════════════════════╝
# Comprehensive health check and diagnostic tool for homelab infrastructure.
# Outputs JSON for automation or human-readable format for manual inspection.

set -euo pipefail

# Colors (disabled for JSON output)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_ROOT="${PROJECT_ROOT:-/home/evin/contain/HomeLabHub}"
if [ ! -d "$PROJECT_ROOT" ]; then
    PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
fi

ENV_FILE="${PROJECT_ROOT}/.env"
REPORT_DIR="${PROJECT_ROOT}/var/reports"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
REPORT_FILE="${REPORT_DIR}/doctor-report-${TIMESTAMP}.json"

# Output mode
OUTPUT_MODE="${1:-human}"  # human or json

# Domains to check (from Caddyfile)
DOMAINS=(
    "host.evindrake.net"
    "bot.evindrake.net"
    "stream.evindrake.net"
    "rig-city.com"
    "plex.evindrake.net"
    "n8n.evindrake.net"
    "vnc.evindrake.net"
    "code.evindrake.net"
    "home.evindrake.net"
    "scarletredjoker.com"
)

# Services to check
ALL_SERVICES=(
    "homelab-postgres"
    "homelab-redis"
    "homelab-minio"
    "homelab-dashboard"
    "homelab-celery-worker"
    "discord-bot"
    "stream-bot"
    "caddy"
    "plex-server"
    "n8n"
    "homeassistant"
    "vnc-desktop"
    "code-server"
    "rig-city-site"
    "scarletredjoker-web"
)

# Required environment variables
REQUIRED_ENV_VARS=(
    "POSTGRES_PASSWORD"
    "DISCORD_DB_PASSWORD"
    "STREAMBOT_DB_PASSWORD"
    "JARVIS_DB_PASSWORD"
    "WEB_USERNAME"
    "WEB_PASSWORD"
    "SESSION_SECRET"
)

# Required dependencies
REQUIRED_DEPS=(
    "docker"
    "jq"
    "curl"
    "openssl"
)

# Create report directory
mkdir -p "$REPORT_DIR"

# Initialize JSON report
declare -A REPORT
ISSUES_COUNT=0
WARNINGS_COUNT=0

# Utility functions
log() {
    if [ "$OUTPUT_MODE" = "human" ]; then
        echo -e "$1"
    fi
}

log_section() {
    if [ "$OUTPUT_MODE" = "human" ]; then
        echo ""
        echo -e "${CYAN}═══ $1 ═══${NC}"
        echo ""
    fi
}

add_issue() {
    ((ISSUES_COUNT++))
}

add_warning() {
    ((WARNINGS_COUNT++))
}

# Check if a command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# Check if a container is running
is_running() {
    docker ps --format "{{.Names}}" 2>/dev/null | grep -q "^$1$"
}

# Get container health status
container_health() {
    docker inspect "$1" --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown"
}

# ============================================================================
# DEPENDENCY CHECKS
# ============================================================================
check_dependencies() {
    log_section "Dependency Checks"
    
    local deps_json="{"
    local all_ok=true
    
    for dep in "${REQUIRED_DEPS[@]}"; do
        if command_exists "$dep"; then
            local version=""
            case "$dep" in
                docker)
                    version=$(docker --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
                    ;;
                jq)
                    version=$(jq --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1)
                    ;;
                curl)
                    version=$(curl --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
                    ;;
                openssl)
                    version=$(openssl version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
                    ;;
            esac
            log "  ${GREEN}✓${NC} $dep ($version)"
            deps_json="${deps_json}\"${dep}\":{\"installed\":true,\"version\":\"${version}\"},"
        else
            log "  ${RED}✗${NC} $dep - NOT INSTALLED"
            deps_json="${deps_json}\"${dep}\":{\"installed\":false,\"version\":null},"
            all_ok=false
            add_issue
        fi
    done
    
    # Check docker-compose (via docker compose)
    if command_exists docker && docker compose version &>/dev/null; then
        local compose_version=$(docker compose version --short 2>/dev/null)
        log "  ${GREEN}✓${NC} docker compose ($compose_version)"
        deps_json="${deps_json}\"docker-compose\":{\"installed\":true,\"version\":\"${compose_version}\"},"
    else
        log "  ${RED}✗${NC} docker compose - NOT AVAILABLE"
        deps_json="${deps_json}\"docker-compose\":{\"installed\":false,\"version\":null},"
        all_ok=false
        add_issue
    fi
    
    # Check docker daemon
    if docker info &>/dev/null; then
        log "  ${GREEN}✓${NC} Docker daemon running"
        deps_json="${deps_json}\"docker-daemon\":{\"running\":true},"
    else
        log "  ${RED}✗${NC} Docker daemon NOT RUNNING"
        deps_json="${deps_json}\"docker-daemon\":{\"running\":false},"
        all_ok=false
        add_issue
    fi
    
    deps_json="${deps_json%,}}"
    echo "$deps_json"
    
    if $all_ok; then
        log ""
        log "  ${GREEN}All dependencies satisfied${NC}"
    fi
}

# ============================================================================
# ENVIRONMENT VALIDATION
# ============================================================================
check_environment() {
    log_section "Environment Validation"
    
    local env_json="{"
    local all_ok=true
    
    # Check .env file exists
    if [ -f "$ENV_FILE" ]; then
        log "  ${GREEN}✓${NC} .env file exists"
        env_json="${env_json}\"file_exists\":true,"
        
        # Check for syntax errors
        if bash -n "$ENV_FILE" 2>/dev/null; then
            log "  ${GREEN}✓${NC} .env syntax valid"
            env_json="${env_json}\"syntax_valid\":true,"
        else
            log "  ${RED}✗${NC} .env has syntax errors"
            env_json="${env_json}\"syntax_valid\":false,"
            all_ok=false
            add_issue
        fi
        
        # Check required variables
        local missing_vars=()
        local present_vars=()
        
        for var in "${REQUIRED_ENV_VARS[@]}"; do
            if grep -q "^${var}=" "$ENV_FILE" && [ -n "$(grep "^${var}=" "$ENV_FILE" | cut -d'=' -f2-)" ]; then
                log "  ${GREEN}✓${NC} $var"
                present_vars+=("\"$var\"")
            else
                log "  ${RED}✗${NC} $var - MISSING or EMPTY"
                missing_vars+=("\"$var\"")
                all_ok=false
                add_issue
            fi
        done
        
        env_json="${env_json}\"present_vars\":[$(IFS=,; echo "${present_vars[*]:-}")],"
        env_json="${env_json}\"missing_vars\":[$(IFS=,; echo "${missing_vars[*]:-}")],"
        
    else
        log "  ${RED}✗${NC} .env file NOT FOUND"
        env_json="${env_json}\"file_exists\":false,\"syntax_valid\":false,\"present_vars\":[],\"missing_vars\":[],"
        all_ok=false
        add_issue
    fi
    
    env_json="${env_json%,}}"
    echo "$env_json"
}

# ============================================================================
# DATABASE CONNECTIVITY
# ============================================================================
check_database() {
    log_section "Database Connectivity"
    
    local db_json="{"
    
    if is_running "homelab-postgres"; then
        log "  ${GREEN}✓${NC} PostgreSQL container running"
        db_json="${db_json}\"container_running\":true,"
        
        if docker exec homelab-postgres pg_isready -U postgres &>/dev/null; then
            log "  ${GREEN}✓${NC} PostgreSQL responding"
            db_json="${db_json}\"responding\":true,"
            
            # Check databases exist
            local dbs_json="{"
            for db in ticketbot streambot homelab_jarvis; do
                if docker exec homelab-postgres psql -U postgres -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$db"; then
                    log "  ${GREEN}✓${NC} Database: $db"
                    dbs_json="${dbs_json}\"${db}\":true,"
                else
                    log "  ${RED}✗${NC} Database: $db - NOT FOUND"
                    dbs_json="${dbs_json}\"${db}\":false,"
                    add_issue
                fi
            done
            dbs_json="${dbs_json%,}}"
            db_json="${db_json}\"databases\":${dbs_json},"
            
        else
            log "  ${RED}✗${NC} PostgreSQL NOT responding"
            db_json="${db_json}\"responding\":false,"
            add_issue
        fi
    else
        log "  ${RED}✗${NC} PostgreSQL container NOT running"
        db_json="${db_json}\"container_running\":false,\"responding\":false,"
        add_issue
    fi
    
    # Check Redis
    if is_running "homelab-redis"; then
        if docker exec homelab-redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
            log "  ${GREEN}✓${NC} Redis responding"
            db_json="${db_json}\"redis\":{\"running\":true,\"responding\":true},"
        else
            log "  ${YELLOW}⚠${NC} Redis not responding"
            db_json="${db_json}\"redis\":{\"running\":true,\"responding\":false},"
            add_warning
        fi
    else
        log "  ${RED}✗${NC} Redis NOT running"
        db_json="${db_json}\"redis\":{\"running\":false,\"responding\":false},"
        add_issue
    fi
    
    # Check MinIO
    if is_running "homelab-minio"; then
        if curl -s -o /dev/null -w "%{http_code}" "http://localhost:9000/minio/health/live" 2>/dev/null | grep -q "200"; then
            log "  ${GREEN}✓${NC} MinIO healthy"
            db_json="${db_json}\"minio\":{\"running\":true,\"healthy\":true}"
        else
            log "  ${YELLOW}⚠${NC} MinIO not healthy"
            db_json="${db_json}\"minio\":{\"running\":true,\"healthy\":false}"
            add_warning
        fi
    else
        log "  ${RED}✗${NC} MinIO NOT running"
        db_json="${db_json}\"minio\":{\"running\":false,\"healthy\":false}"
        add_issue
    fi
    
    db_json="${db_json%,}}"
    echo "$db_json"
}

# ============================================================================
# CONTAINER HEALTH STATUS
# ============================================================================
check_containers() {
    log_section "Container Health Status"
    
    local containers_json="{"
    local running=0
    local total=${#ALL_SERVICES[@]}
    
    for service in "${ALL_SERVICES[@]}"; do
        if is_running "$service"; then
            local health=$(container_health "$service")
            local uptime=$(docker inspect "$service" --format='{{.State.StartedAt}}' 2>/dev/null | xargs -I{} date -d {} +%s 2>/dev/null || echo "0")
            local now=$(date +%s)
            local uptime_secs=$((now - uptime))
            
            if [ "$health" = "healthy" ] || [ "$health" = "unknown" ] || [ "$health" = "" ]; then
                log "  ${GREEN}✓${NC} $service (${health:-running})"
            elif [ "$health" = "starting" ]; then
                log "  ${YELLOW}⟳${NC} $service (starting)"
                add_warning
            else
                log "  ${RED}✗${NC} $service ($health)"
                add_issue
            fi
            
            ((running++))
            containers_json="${containers_json}\"${service}\":{\"running\":true,\"health\":\"${health:-unknown}\",\"uptime_seconds\":${uptime_secs}},"
        else
            log "  ${RED}○${NC} $service (not running)"
            containers_json="${containers_json}\"${service}\":{\"running\":false,\"health\":\"stopped\",\"uptime_seconds\":0},"
            add_issue
        fi
    done
    
    containers_json="${containers_json}\"_summary\":{\"running\":${running},\"total\":${total}}}"
    
    log ""
    log "  Services: $running/$total running"
    
    echo "$containers_json"
}

# ============================================================================
# NETWORK CONFIGURATION
# ============================================================================
check_network() {
    log_section "Network Configuration"
    
    local network_json="{"
    
    # Check Docker network
    if docker network inspect homelab &>/dev/null; then
        local containers_in_network=$(docker network inspect homelab --format='{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null)
        local container_count=$(echo "$containers_in_network" | wc -w)
        log "  ${GREEN}✓${NC} homelab network exists ($container_count containers)"
        network_json="${network_json}\"homelab_network\":{\"exists\":true,\"container_count\":${container_count}},"
    else
        log "  ${YELLOW}⚠${NC} homelab network not found"
        network_json="${network_json}\"homelab_network\":{\"exists\":false,\"container_count\":0},"
        add_warning
    fi
    
    # Check exposed ports
    local ports_json="["
    local ports_to_check=("80:HTTP" "443:HTTPS" "9000:MinIO" "5432:PostgreSQL")
    
    for port_info in "${ports_to_check[@]}"; do
        local port=${port_info%:*}
        local name=${port_info#*:}
        
        if netstat -tuln 2>/dev/null | grep -q ":${port} " || ss -tuln 2>/dev/null | grep -q ":${port} "; then
            log "  ${GREEN}✓${NC} Port $port ($name) listening"
            ports_json="${ports_json}{\"port\":${port},\"name\":\"${name}\",\"listening\":true},"
        else
            log "  ${YELLOW}⚠${NC} Port $port ($name) NOT listening"
            ports_json="${ports_json}{\"port\":${port},\"name\":\"${name}\",\"listening\":false},"
        fi
    done
    
    ports_json="${ports_json%,}]"
    network_json="${network_json}\"ports\":${ports_json}}"
    
    echo "$network_json"
}

# ============================================================================
# DNS RESOLUTION
# ============================================================================
check_dns() {
    log_section "DNS Resolution"
    
    local dns_json="{"
    local resolved=0
    local total=${#DOMAINS[@]}
    
    for domain in "${DOMAINS[@]}"; do
        if host "$domain" &>/dev/null || nslookup "$domain" &>/dev/null 2>&1; then
            local ip=$(dig +short "$domain" 2>/dev/null | head -1)
            log "  ${GREEN}✓${NC} $domain -> ${ip:-resolved}"
            dns_json="${dns_json}\"${domain}\":{\"resolves\":true,\"ip\":\"${ip:-unknown}\"},"
            ((resolved++))
        else
            log "  ${RED}✗${NC} $domain - DNS FAILED"
            dns_json="${dns_json}\"${domain}\":{\"resolves\":false,\"ip\":null},"
            add_issue
        fi
    done
    
    dns_json="${dns_json}\"_summary\":{\"resolved\":${resolved},\"total\":${total}}}"
    
    log ""
    log "  Domains: $resolved/$total resolving"
    
    echo "$dns_json"
}

# ============================================================================
# DISK SPACE
# ============================================================================
check_disk() {
    log_section "Disk Space"
    
    local disk_json="{"
    
    # Get disk usage for project directory
    local disk_info=$(df -h "$PROJECT_ROOT" 2>/dev/null | tail -1)
    local total=$(echo "$disk_info" | awk '{print $2}')
    local used=$(echo "$disk_info" | awk '{print $3}')
    local available=$(echo "$disk_info" | awk '{print $4}')
    local usage_percent=$(echo "$disk_info" | awk '{print $5}' | sed 's/%//')
    
    disk_json="${disk_json}\"total\":\"${total}\",\"used\":\"${used}\",\"available\":\"${available}\",\"usage_percent\":${usage_percent},"
    
    if [ "$usage_percent" -lt 80 ]; then
        log "  ${GREEN}✓${NC} Disk usage: ${usage_percent}% ($used / $total)"
        disk_json="${disk_json}\"status\":\"ok\","
    elif [ "$usage_percent" -lt 90 ]; then
        log "  ${YELLOW}⚠${NC} Disk usage: ${usage_percent}% - WARNING"
        disk_json="${disk_json}\"status\":\"warning\","
        add_warning
    else
        log "  ${RED}✗${NC} Disk usage: ${usage_percent}% - CRITICAL"
        disk_json="${disk_json}\"status\":\"critical\","
        add_issue
    fi
    
    # Check Docker disk usage
    local docker_size=$(docker system df --format '{{.Size}}' 2>/dev/null | head -1)
    log "  Docker storage used: ${docker_size:-unknown}"
    disk_json="${disk_json}\"docker_usage\":\"${docker_size:-unknown}\"}"
    
    echo "$disk_json"
}

# ============================================================================
# SSL CERTIFICATE VALIDATION
# ============================================================================
check_ssl() {
    log_section "SSL Certificate Validation"
    
    local ssl_json="{"
    local valid=0
    local total=0
    
    # Check certs for each domain
    for domain in "${DOMAINS[@]}"; do
        ((total++))
        
        local expiry_date=$(echo | timeout 5 openssl s_client -servername "$domain" -connect "$domain:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
        
        if [ -n "$expiry_date" ]; then
            local expiry_epoch=$(date -d "$expiry_date" +%s 2>/dev/null || echo "0")
            local now_epoch=$(date +%s)
            local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))
            
            if [ "$days_left" -gt 30 ]; then
                log "  ${GREEN}✓${NC} $domain - expires in ${days_left} days"
                ssl_json="${ssl_json}\"${domain}\":{\"valid\":true,\"days_remaining\":${days_left}},"
                ((valid++))
            elif [ "$days_left" -gt 7 ]; then
                log "  ${YELLOW}⚠${NC} $domain - expires in ${days_left} days"
                ssl_json="${ssl_json}\"${domain}\":{\"valid\":true,\"days_remaining\":${days_left}},"
                ((valid++))
                add_warning
            else
                log "  ${RED}✗${NC} $domain - expires in ${days_left} days (CRITICAL)"
                ssl_json="${ssl_json}\"${domain}\":{\"valid\":true,\"days_remaining\":${days_left}},"
                add_issue
            fi
        else
            log "  ${YELLOW}⚠${NC} $domain - Cannot verify SSL (may be local only)"
            ssl_json="${ssl_json}\"${domain}\":{\"valid\":null,\"days_remaining\":null},"
        fi
    done
    
    ssl_json="${ssl_json}\"_summary\":{\"valid\":${valid},\"total\":${total}}}"
    
    echo "$ssl_json"
}

# ============================================================================
# MEMORY USAGE
# ============================================================================
check_memory() {
    log_section "Memory Usage"
    
    local mem_total=$(free -m | awk 'NR==2 {print $2}')
    local mem_used=$(free -m | awk 'NR==2 {print $3}')
    local mem_available=$(free -m | awk 'NR==2 {print $7}')
    local mem_percent=$((mem_used * 100 / mem_total))
    
    local mem_json="{"
    mem_json="${mem_json}\"total_mb\":${mem_total},\"used_mb\":${mem_used},\"available_mb\":${mem_available},\"usage_percent\":${mem_percent},"
    
    if [ "$mem_percent" -lt 80 ]; then
        log "  ${GREEN}✓${NC} Memory usage: ${mem_percent}% (${mem_used}MB / ${mem_total}MB)"
        mem_json="${mem_json}\"status\":\"ok\"}"
    elif [ "$mem_percent" -lt 90 ]; then
        log "  ${YELLOW}⚠${NC} Memory usage: ${mem_percent}% - WARNING"
        mem_json="${mem_json}\"status\":\"warning\"}"
        add_warning
    else
        log "  ${RED}✗${NC} Memory usage: ${mem_percent}% - CRITICAL"
        mem_json="${mem_json}\"status\":\"critical\"}"
        add_issue
    fi
    
    echo "$mem_json"
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================
main() {
    if [ "$OUTPUT_MODE" = "human" ]; then
        echo -e "${CYAN}"
        echo "╔════════════════════════════════════════════════════════════════════════════╗"
        echo "║                    HOMELAB DOCTOR - Comprehensive Diagnostics             ║"
        echo "╚════════════════════════════════════════════════════════════════════════════╝"
        echo -e "${NC}"
        echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "Project: $PROJECT_ROOT"
    fi
    
    # Run all checks and capture JSON
    local deps_json=$(check_dependencies)
    local env_json=$(check_environment)
    local db_json=$(check_database)
    local containers_json=$(check_containers)
    local network_json=$(check_network)
    local dns_json=$(check_dns)
    local disk_json=$(check_disk)
    local ssl_json=$(check_ssl)
    local memory_json=$(check_memory)
    
    # Build final report
    local report=$(cat <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "project_root": "$PROJECT_ROOT",
  "summary": {
    "issues": $ISSUES_COUNT,
    "warnings": $WARNINGS_COUNT,
    "status": "$([ $ISSUES_COUNT -eq 0 ] && echo "healthy" || echo "unhealthy")"
  },
  "checks": {
    "dependencies": $deps_json,
    "environment": $env_json,
    "database": $db_json,
    "containers": $containers_json,
    "network": $network_json,
    "dns": $dns_json,
    "disk": $disk_json,
    "ssl": $ssl_json,
    "memory": $memory_json
  }
}
EOF
)
    
    # Save JSON report
    echo "$report" | jq '.' > "$REPORT_FILE" 2>/dev/null || echo "$report" > "$REPORT_FILE"
    
    # Print summary
    if [ "$OUTPUT_MODE" = "human" ]; then
        log_section "Summary"
        
        if [ $ISSUES_COUNT -eq 0 ] && [ $WARNINGS_COUNT -eq 0 ]; then
            log "  ${GREEN}✅ All systems healthy!${NC}"
        elif [ $ISSUES_COUNT -eq 0 ]; then
            log "  ${YELLOW}⚠ Healthy with $WARNINGS_COUNT warning(s)${NC}"
        else
            log "  ${RED}❌ Found $ISSUES_COUNT issue(s) and $WARNINGS_COUNT warning(s)${NC}"
        fi
        
        log ""
        log "  Full report saved to: $REPORT_FILE"
        log ""
        log "  For JSON output: $0 json"
    else
        # JSON output mode
        echo "$report" | jq '.' 2>/dev/null || echo "$report"
    fi
    
    # Exit code based on issues
    if [ $ISSUES_COUNT -gt 0 ]; then
        exit 1
    else
        exit 0
    fi
}

# Usage
usage() {
    echo "Usage: $0 [human|json]"
    echo ""
    echo "Options:"
    echo "  human    Human-readable output (default)"
    echo "  json     JSON output for automation"
    echo ""
    echo "Examples:"
    echo "  $0                     # Human-readable diagnostics"
    echo "  $0 json                # JSON output"
    echo "  $0 json | jq '.summary'  # Just the summary"
}

# Parse args
case "${1:-}" in
    -h|--help|help)
        usage
        exit 0
        ;;
    json|JSON)
        OUTPUT_MODE="json"
        main
        ;;
    human|"")
        OUTPUT_MODE="human"
        main
        ;;
    *)
        echo "Unknown option: $1"
        usage
        exit 1
        ;;
esac
