#!/bin/bash

echo "================================================"
echo "  Nebula Command Health Check"
echo "================================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${CONFIG_DIR:-$HOME/.config/homelab}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
NC='\033[0m'

TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

TAILSCALE_HOSTS="${TAILSCALE_HOSTS:-}"
SSH_HOSTS="${SSH_HOSTS:-}"

show_usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

Options:
    --all               Run all checks (default)
    --web               Check web services only
    --tailscale         Check Tailscale connectivity only
    --ssh               Check SSH keys only
    --ping              Check cross-host ping only
    --docker            Check Docker status only
    --hosts HOST1,HOST2 Comma-separated list of hosts to ping/test
    --verbose           Show detailed output
    --json              Output results as JSON
    --help              Show this help message

Environment Variables:
    TAILSCALE_HOSTS     Comma-separated Tailscale hosts to ping
    SSH_HOSTS           Comma-separated SSH hosts to test

Examples:
    $(basename "$0")
    $(basename "$0") --tailscale --ping
    $(basename "$0") --hosts 100.x.x.x,100.y.y.y --ping
EOF
}

CHECK_WEB="true"
CHECK_TAILSCALE="true"
CHECK_SSH="true"
CHECK_PING="true"
CHECK_DOCKER="true"
VERBOSE="false"
JSON_OUTPUT="false"

parse_args() {
    local specific_check=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --all)
                shift
                ;;
            --web)
                if [[ "$specific_check" == "false" ]]; then
                    CHECK_WEB="false"
                    CHECK_TAILSCALE="false"
                    CHECK_SSH="false"
                    CHECK_PING="false"
                    CHECK_DOCKER="false"
                    specific_check=true
                fi
                CHECK_WEB="true"
                shift
                ;;
            --tailscale)
                if [[ "$specific_check" == "false" ]]; then
                    CHECK_WEB="false"
                    CHECK_TAILSCALE="false"
                    CHECK_SSH="false"
                    CHECK_PING="false"
                    CHECK_DOCKER="false"
                    specific_check=true
                fi
                CHECK_TAILSCALE="true"
                shift
                ;;
            --ssh)
                if [[ "$specific_check" == "false" ]]; then
                    CHECK_WEB="false"
                    CHECK_TAILSCALE="false"
                    CHECK_SSH="false"
                    CHECK_PING="false"
                    CHECK_DOCKER="false"
                    specific_check=true
                fi
                CHECK_SSH="true"
                shift
                ;;
            --ping)
                if [[ "$specific_check" == "false" ]]; then
                    CHECK_WEB="false"
                    CHECK_TAILSCALE="false"
                    CHECK_SSH="false"
                    CHECK_PING="false"
                    CHECK_DOCKER="false"
                    specific_check=true
                fi
                CHECK_PING="true"
                shift
                ;;
            --docker)
                if [[ "$specific_check" == "false" ]]; then
                    CHECK_WEB="false"
                    CHECK_TAILSCALE="false"
                    CHECK_SSH="false"
                    CHECK_PING="false"
                    CHECK_DOCKER="false"
                    specific_check=true
                fi
                CHECK_DOCKER="true"
                shift
                ;;
            --hosts)
                TAILSCALE_HOSTS="$2"
                SSH_HOSTS="$2"
                shift 2
                ;;
            --verbose)
                VERBOSE="true"
                shift
                ;;
            --json)
                JSON_OUTPUT="true"
                shift
                ;;
            --help)
                show_usage
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
}

record_result() {
    local status="$1"
    ((TOTAL_CHECKS++))
    
    case "$status" in
        pass)
            ((PASSED_CHECKS++))
            ;;
        fail)
            ((FAILED_CHECKS++))
            ;;
        warn)
            ((WARNING_CHECKS++))
            ;;
    esac
}

check_url() {
    local name="$1"
    local url="$2"
    local expected="${3:-200}"
    
    local status
    local response_time
    
    local start_time
    start_time=$(date +%s%N)
    
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")
    
    local end_time
    end_time=$(date +%s%N)
    response_time=$(( (end_time - start_time) / 1000000 ))
    
    if [[ "$status" == "$expected" ]] || [[ "$status" == "302" ]] || [[ "$status" == "301" ]]; then
        echo -e "${GREEN}✓${NC} $name: OK ($status, ${response_time}ms)"
        record_result "pass"
        return 0
    else
        echo -e "${RED}✗${NC} $name: FAILED ($status)"
        record_result "fail"
        return 1
    fi
}

check_port() {
    local name="$1"
    local host="$2"
    local port="$3"
    
    if timeout 5 bash -c "</dev/tcp/$host/$port" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $name: Port $port open"
        record_result "pass"
        return 0
    else
        echo -e "${RED}✗${NC} $name: Port $port closed"
        record_result "fail"
        return 1
    fi
}

check_tailscale_status() {
    echo ""
    echo -e "${BLUE}Tailscale Connectivity:${NC}"
    echo "------------------------"
    
    if ! command -v tailscale &> /dev/null; then
        echo -e "${YELLOW}⚠${NC} Tailscale: Not installed"
        record_result "warn"
        return 1
    fi
    
    local version
    version=$(tailscale version 2>/dev/null | head -n1 || echo "unknown")
    echo -e "${GREEN}✓${NC} Tailscale installed: $version"
    record_result "pass"
    
    if ! systemctl is-active --quiet tailscaled 2>/dev/null; then
        echo -e "${RED}✗${NC} Tailscale daemon: Not running"
        record_result "fail"
        return 1
    fi
    echo -e "${GREEN}✓${NC} Tailscale daemon: Running"
    record_result "pass"
    
    local backend_state
    backend_state=$(sudo tailscale status --json 2>/dev/null | grep -o '"BackendState":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
    
    if [[ "$backend_state" == "Running" ]]; then
        echo -e "${GREEN}✓${NC} Tailscale connection: Active"
        record_result "pass"
    else
        echo -e "${RED}✗${NC} Tailscale connection: $backend_state"
        record_result "fail"
        return 1
    fi
    
    local ipv4
    local ipv6
    ipv4=$(sudo tailscale ip -4 2>/dev/null || echo "")
    ipv6=$(sudo tailscale ip -6 2>/dev/null || echo "")
    
    if [[ -n "$ipv4" ]]; then
        echo -e "${GREEN}✓${NC} Tailscale IPv4: $ipv4"
        record_result "pass"
    else
        echo -e "${YELLOW}⚠${NC} Tailscale IPv4: Not available"
        record_result "warn"
    fi
    
    if [[ "$VERBOSE" == "true" && -n "$ipv6" ]]; then
        echo -e "${GREEN}✓${NC} Tailscale IPv6: $ipv6"
    fi
    
    local magicdns
    magicdns=$(sudo tailscale status --json 2>/dev/null | grep -o '"MagicDNSSuffix":"[^"]*"' | cut -d'"' -f4 || echo "")
    if [[ -n "$magicdns" ]]; then
        echo -e "${GREEN}✓${NC} MagicDNS: $magicdns"
        record_result "pass"
    fi
    
    local peer_count
    peer_count=$(sudo tailscale status 2>/dev/null | grep -c "100\." || echo "0")
    echo -e "${GREEN}✓${NC} Connected peers: $peer_count"
    
    if [[ "$VERBOSE" == "true" ]]; then
        echo ""
        echo "Peer Status:"
        sudo tailscale status 2>/dev/null | head -20
    fi
    
    return 0
}

check_ssh_keys() {
    echo ""
    echo -e "${BLUE}SSH Key Verification:${NC}"
    echo "----------------------"
    
    local ssh_dir="$HOME/.ssh"
    local config_file="$CONFIG_DIR/ssh.conf"
    
    if [[ ! -d "$ssh_dir" ]]; then
        echo -e "${RED}✗${NC} SSH directory: Not found"
        record_result "fail"
        return 1
    fi
    echo -e "${GREEN}✓${NC} SSH directory: $ssh_dir"
    record_result "pass"
    
    local ssh_dir_perms
    ssh_dir_perms=$(stat -c %a "$ssh_dir" 2>/dev/null || stat -f %Lp "$ssh_dir" 2>/dev/null)
    if [[ "$ssh_dir_perms" == "700" ]]; then
        echo -e "${GREEN}✓${NC} SSH directory permissions: $ssh_dir_perms (correct)"
        record_result "pass"
    else
        echo -e "${YELLOW}⚠${NC} SSH directory permissions: $ssh_dir_perms (should be 700)"
        record_result "warn"
    fi
    
    local key_count=0
    local valid_keys=0
    
    for key in "$ssh_dir"/id_*; do
        if [[ -f "$key" && ! "$key" =~ \.pub$ ]]; then
            ((key_count++))
            
            local key_name
            key_name=$(basename "$key")
            local key_perms
            key_perms=$(stat -c %a "$key" 2>/dev/null || stat -f %Lp "$key" 2>/dev/null)
            
            if [[ -f "${key}.pub" ]]; then
                local fingerprint
                fingerprint=$(ssh-keygen -lf "${key}.pub" 2>/dev/null | awk '{print $2}' || echo "unknown")
                
                if [[ "$key_perms" == "600" ]]; then
                    echo -e "${GREEN}✓${NC} Key '$key_name': Valid (perms: $key_perms)"
                    ((valid_keys++))
                    record_result "pass"
                else
                    echo -e "${YELLOW}⚠${NC} Key '$key_name': Insecure permissions ($key_perms, should be 600)"
                    record_result "warn"
                fi
                
                if [[ "$VERBOSE" == "true" ]]; then
                    echo "    Fingerprint: $fingerprint"
                fi
            else
                echo -e "${YELLOW}⚠${NC} Key '$key_name': Missing public key"
                record_result "warn"
            fi
        fi
    done
    
    if [[ $key_count -eq 0 ]]; then
        echo -e "${YELLOW}⚠${NC} No SSH keys found"
        echo "    Run 'deploy/scripts/setup-ssh-keys.sh generate' to create keys"
        record_result "warn"
    else
        echo -e "${GREEN}✓${NC} SSH keys found: $key_count ($valid_keys valid)"
    fi
    
    if [[ -n "${SSH_AUTH_SOCK:-}" ]]; then
        local loaded
        loaded=$(ssh-add -l 2>/dev/null | wc -l || echo "0")
        echo -e "${GREEN}✓${NC} SSH agent: Running ($loaded keys loaded)"
        record_result "pass"
    else
        echo -e "${YELLOW}⚠${NC} SSH agent: Not running"
        record_result "warn"
    fi
    
    if [[ -f "$ssh_dir/known_hosts" ]]; then
        local known_count
        known_count=$(wc -l < "$ssh_dir/known_hosts")
        echo -e "${GREEN}✓${NC} Known hosts: $known_count entries"
        record_result "pass"
    else
        echo -e "${YELLOW}⚠${NC} Known hosts: File not found"
        record_result "warn"
    fi
    
    if [[ -f "$config_file" ]]; then
        echo -e "${GREEN}✓${NC} Homelab SSH config: Found"
        record_result "pass"
        
        if [[ "$VERBOSE" == "true" ]]; then
            echo ""
            echo "SSH Configuration:"
            cat "$config_file"
        fi
    fi
    
    return 0
}

check_cross_host_ping() {
    echo ""
    echo -e "${BLUE}Cross-Host Connectivity:${NC}"
    echo "------------------------"
    
    local hosts_to_check=""
    
    if [[ -n "$TAILSCALE_HOSTS" ]]; then
        hosts_to_check="$TAILSCALE_HOSTS"
    elif [[ -f "$CONFIG_DIR/hosts.conf" ]]; then
        hosts_to_check=$(grep -v "^#" "$CONFIG_DIR/hosts.conf" 2>/dev/null | cut -d'=' -f1 | tr '\n' ',' | sed 's/,$//')
    fi
    
    if command -v tailscale &> /dev/null; then
        local tailscale_peers
        tailscale_peers=$(sudo tailscale status 2>/dev/null | grep -oE '100\.[0-9]+\.[0-9]+\.[0-9]+' | head -5 | tr '\n' ',')
        if [[ -n "$tailscale_peers" && -z "$hosts_to_check" ]]; then
            hosts_to_check="${tailscale_peers%,}"
        fi
    fi
    
    if [[ -z "$hosts_to_check" ]]; then
        echo -e "${YELLOW}⚠${NC} No hosts configured for ping test"
        echo "    Use --hosts HOST1,HOST2 or set TAILSCALE_HOSTS"
        record_result "warn"
        return 0
    fi
    
    IFS=',' read -ra HOSTS <<< "$hosts_to_check"
    
    for host in "${HOSTS[@]}"; do
        host=$(echo "$host" | xargs)
        
        if [[ -z "$host" ]]; then
            continue
        fi
        
        local ping_result
        local latency=""
        
        if ping -c 1 -W 5 "$host" &> /dev/null; then
            latency=$(ping -c 3 -W 5 "$host" 2>/dev/null | tail -1 | awk -F'/' '{print $5}')
            echo -e "${GREEN}✓${NC} Ping $host: OK (${latency}ms avg)"
            record_result "pass"
            
            if check_port_silent "$host" 22; then
                echo -e "${GREEN}✓${NC}   SSH port ($host:22): Open"
                record_result "pass"
            else
                echo -e "${YELLOW}⚠${NC}   SSH port ($host:22): Closed"
                record_result "warn"
            fi
        else
            echo -e "${RED}✗${NC} Ping $host: FAILED"
            record_result "fail"
        fi
    done
}

check_port_silent() {
    local host="$1"
    local port="$2"
    timeout 3 bash -c "</dev/tcp/$host/$port" 2>/dev/null
}

test_ssh_connection() {
    local host="$1"
    local user="${2:-$USER}"
    
    if ssh -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$user@$host" "echo ok" &>/dev/null; then
        return 0
    fi
    return 1
}

check_web_services() {
    echo -e "${BLUE}Cloud Services (Linode):${NC}"
    echo "------------------------"
    check_url "Discord Bot" "https://bot.evindrake.net/health"
    check_url "Stream Bot" "https://stream.evindrake.net/health"
    check_url "Dashboard" "https://dashboard.evindrake.net"
    check_url "n8n" "https://n8n.evindrake.net"
    check_url "Code Server" "https://code.evindrake.net"
    check_url "Rig City Site" "https://rig-city.com"
    check_url "Scarlet Red Joker" "https://scarletredjoker.com"
    
    echo ""
    echo -e "${BLUE}Local Services:${NC}"
    echo "---------------"
    check_url "Plex" "https://plex.evindrake.net/identity"
    check_url "Home Assistant" "https://home.evindrake.net"
    check_url "VNC" "https://vnc.evindrake.net"
}

check_docker_status() {
    echo ""
    echo -e "${BLUE}Docker Status:${NC}"
    echo "--------------"
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}✗${NC} Docker: Not installed"
        record_result "fail"
        return 1
    fi
    
    local docker_version
    docker_version=$(docker --version 2>/dev/null | awk '{print $3}' | tr -d ',')
    echo -e "${GREEN}✓${NC} Docker installed: $docker_version"
    record_result "pass"
    
    if ! docker info &>/dev/null; then
        echo -e "${RED}✗${NC} Docker daemon: Not running or no permission"
        record_result "fail"
        return 1
    fi
    echo -e "${GREEN}✓${NC} Docker daemon: Running"
    record_result "pass"
    
    local running
    running=$(docker ps --format '{{.Names}}' 2>/dev/null | wc -l)
    local total
    total=$(docker ps -a --format '{{.Names}}' 2>/dev/null | wc -l)
    
    echo -e "${GREEN}✓${NC} Containers: $running running / $total total"
    record_result "pass"
    
    if [[ "$VERBOSE" == "true" && $running -gt 0 ]]; then
        echo ""
        echo "Running Containers:"
        docker ps --format "  - {{.Names}}: {{.Status}}" 2>/dev/null
    fi
    
    local unhealthy
    unhealthy=$(docker ps --filter "health=unhealthy" --format '{{.Names}}' 2>/dev/null | wc -l)
    if [[ $unhealthy -gt 0 ]]; then
        echo -e "${RED}✗${NC} Unhealthy containers: $unhealthy"
        docker ps --filter "health=unhealthy" --format "  - {{.Names}}" 2>/dev/null
        record_result "fail"
    fi
}

print_summary() {
    echo ""
    echo "================================================"
    echo -e "${BLUE}Health Check Summary${NC}"
    echo "================================================"
    echo ""
    echo -e "Total checks:   $TOTAL_CHECKS"
    echo -e "${GREEN}Passed:${NC}         $PASSED_CHECKS"
    echo -e "${RED}Failed:${NC}         $FAILED_CHECKS"
    echo -e "${YELLOW}Warnings:${NC}       $WARNING_CHECKS"
    echo ""
    
    if [[ $FAILED_CHECKS -eq 0 ]]; then
        echo -e "${GREEN}All critical checks passed!${NC}"
    else
        echo -e "${RED}Some checks failed. Please review the output above.${NC}"
    fi
    
    echo ""
}

output_json() {
    cat << EOF
{
  "timestamp": "$(date -Iseconds)",
  "summary": {
    "total": $TOTAL_CHECKS,
    "passed": $PASSED_CHECKS,
    "failed": $FAILED_CHECKS,
    "warnings": $WARNING_CHECKS
  },
  "status": "$( [[ $FAILED_CHECKS -eq 0 ]] && echo "healthy" || echo "unhealthy" )"
}
EOF
}

main() {
    parse_args "$@"
    
    if [[ "$CHECK_WEB" == "true" ]]; then
        check_web_services
    fi
    
    if [[ "$CHECK_TAILSCALE" == "true" ]]; then
        check_tailscale_status
    fi
    
    if [[ "$CHECK_SSH" == "true" ]]; then
        check_ssh_keys
    fi
    
    if [[ "$CHECK_PING" == "true" ]]; then
        check_cross_host_ping
    fi
    
    if [[ "$CHECK_DOCKER" == "true" ]]; then
        check_docker_status
    fi
    
    if [[ "$JSON_OUTPUT" == "true" ]]; then
        output_json
    else
        print_summary
    fi
    
    [[ $FAILED_CHECKS -eq 0 ]]
}

main "$@"
