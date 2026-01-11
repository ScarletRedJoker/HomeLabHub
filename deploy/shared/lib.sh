#!/bin/bash
# Nebula Command - Shared Deployment Library
# Common functions for Linode and Local deployments

source "$(dirname "${BASH_SOURCE[0]}")/env-lib.sh"

LOG_DIR=""
DEPLOY_LOG=""
VERBOSE=${VERBOSE:-false}
DRY_RUN=${DRY_RUN:-false}

init_logging() {
    local context="${1:-deploy}"
    LOG_DIR="${SCRIPT_DIR}/logs"
    mkdir -p "$LOG_DIR"
    DEPLOY_LOG="$LOG_DIR/${context}_$(date +%Y%m%d_%H%M%S).log"
}

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" >> "$DEPLOY_LOG" 2>/dev/null || true
    
    if [ "$VERBOSE" = true ]; then
        case "$level" in
            ERROR) echo -e "${RED}[$level]${NC} $message" ;;
            WARN)  echo -e "${YELLOW}[$level]${NC} $message" ;;
            INFO)  echo -e "${CYAN}[$level]${NC} $message" ;;
            *)     echo "[$level] $message" ;;
        esac
    fi
}

log_section() {
    echo "" >> "$DEPLOY_LOG"
    echo "═══════════════════════════════════════════════════════════════" >> "$DEPLOY_LOG"
    echo " $1" >> "$DEPLOY_LOG"
    echo "═══════════════════════════════════════════════════════════════" >> "$DEPLOY_LOG"
}

preflight_host() {
    echo -e "${CYAN}━━━ Preflight Host Checks ━━━${NC}"
    local errors=0
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}[FAIL]${NC} Docker not installed"
        echo "       Install: curl -fsSL https://get.docker.com | sh"
        errors=$((errors + 1))
    else
        echo -e "${GREEN}[OK]${NC} Docker $(docker --version | awk '{print $3}' | tr -d ',')"
    fi
    
    if ! command -v docker compose &> /dev/null 2>&1; then
        if ! docker compose version &> /dev/null; then
            echo -e "${RED}[FAIL]${NC} Docker Compose not installed"
            errors=$((errors + 1))
        else
            echo -e "${GREEN}[OK]${NC} Docker Compose $(docker compose version --short 2>/dev/null)"
        fi
    else
        echo -e "${GREEN}[OK]${NC} Docker Compose available"
    fi
    
    if ! docker info &> /dev/null; then
        echo -e "${RED}[FAIL]${NC} Docker daemon not running or no permission"
        echo "       Try: sudo systemctl start docker"
        echo "       Or add user to docker group: sudo usermod -aG docker \$USER"
        errors=$((errors + 1))
    else
        echo -e "${GREEN}[OK]${NC} Docker daemon running"
    fi
    
    if ! command -v git &> /dev/null; then
        echo -e "${YELLOW}[WARN]${NC} Git not installed (may affect code pull)"
    else
        echo -e "${GREEN}[OK]${NC} Git $(git --version | awk '{print $3}')"
    fi
    
    local free_disk
    free_disk=$(df -BG "${SCRIPT_DIR}" 2>/dev/null | awk 'NR==2 {gsub("G",""); print $4}')
    if [ -n "$free_disk" ]; then
        if [ "$free_disk" -lt 5 ]; then
            echo -e "${RED}[FAIL]${NC} Low disk space: ${free_disk}GB free (need 5GB+)"
            errors=$((errors + 1))
        elif [ "$free_disk" -lt 10 ]; then
            echo -e "${YELLOW}[WARN]${NC} Disk space: ${free_disk}GB free (recommend 10GB+)"
        else
            echo -e "${GREEN}[OK]${NC} Disk space: ${free_disk}GB free"
        fi
    fi
    
    local free_mem
    free_mem=$(free -m 2>/dev/null | awk '/Mem:/ {print $7}')
    if [ -n "$free_mem" ]; then
        if [ "$free_mem" -lt 512 ]; then
            echo -e "${YELLOW}[WARN]${NC} Low memory: ${free_mem}MB available"
        else
            echo -e "${GREEN}[OK]${NC} Memory: ${free_mem}MB available"
        fi
    fi
    
    echo ""
    
    if [ $errors -gt 0 ]; then
        echo -e "${RED}✗ Preflight failed with $errors error(s)${NC}"
        echo "  Fix the issues above before continuing."
        return 1
    fi
    
    echo -e "${GREEN}✓ Preflight checks passed${NC}"
    return 0
}

check_docker_health() {
    local container_name=$1
    local health
    health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_name" 2>/dev/null)
    echo "${health:-unknown}"
}

wait_for_healthy() {
    local container=$1
    local timeout=${2:-60}
    local start_time=$SECONDS
    
    while [ $((SECONDS - start_time)) -lt $timeout ]; do
        local status
        status=$(check_docker_health "$container")
        case "$status" in
            healthy|running)
                return 0
                ;;
            exited|dead)
                return 1
                ;;
        esac
        sleep 2
    done
    return 1
}

verify_service_health() {
    local name=$1
    local url=$2
    local timeout=${3:-5}
    
    if [ -z "$url" ] || [ "$url" = "-" ]; then
        return 0
    fi
    
    local result=1
    for i in 1 2 3; do
        if curl -sf --connect-timeout "$timeout" --max-time $((timeout * 2)) "$url" > /dev/null 2>&1; then
            result=0
            break
        fi
        sleep 2
    done
    
    return $result
}

health_report() {
    local deployment_type=$1  # "linode" or "local"
    local domain="${DOMAIN:-example.com}"
    
    echo ""
    echo -e "${CYAN}━━━ Service Health Report ━━━${NC}"
    
    local total=0
    local healthy=0
    local starting=0
    local failed=0
    
    declare -A services
    
    if [ "$deployment_type" = "linode" ]; then
        services=(
            ["homelab-dashboard"]="Dashboard|http://localhost:5000/health"
            ["discord-bot"]="Discord Bot|http://localhost:4000/health"
            ["stream-bot"]="Stream Bot|http://localhost:3000/health"
            ["dns-manager"]="DNS Manager|-"
            ["homelab-postgres"]="PostgreSQL|-"
            ["homelab-redis"]="Redis|-"
            ["tailscale"]="Tailscale|-"
            ["caddy"]="Caddy|http://localhost:80/"
        )
    else
        services=(
            ["plex"]="Plex|http://localhost:32400/identity"
            ["jellyfin"]="Jellyfin|http://localhost:8096/health"
            ["homelab-minio"]="MinIO|http://localhost:9000/minio/health/live"
            ["homeassistant"]="Home Assistant|http://localhost:8123/"
            ["authelia"]="Authelia|http://localhost:9091/api/health"
            ["caddy-local"]="Caddy|-"
            ["authelia-redis"]="Auth Redis|-"
            ["dashboard-postgres"]="Dashboard DB|-"
            ["novnc"]="VNC|http://localhost:8080/"
            ["ttyd"]="SSH Terminal|http://localhost:7681/"
        )
    fi
    
    echo "  ┌────────────────────┬──────────────┬────────────────────────────┐"
    echo "  │ Service            │ Status       │ Endpoint                   │"
    echo "  ├────────────────────┼──────────────┼────────────────────────────┤"
    
    for container in "${!services[@]}"; do
        IFS='|' read -r name check_url <<< "${services[$container]}"
        total=$((total + 1))
        
        local container_status
        container_status=$(check_docker_health "$container" 2>/dev/null)
        local status
        local status_icon
        local status_color
        
        if [ "$container_status" = "healthy" ] || [ "$container_status" = "running" ]; then
            if [ "$check_url" = "-" ] || verify_service_health "$name" "$check_url" 2; then
                status="healthy"
                status_icon="●"
                status_color="$GREEN"
                healthy=$((healthy + 1))
            else
                status="starting"
                status_icon="◐"
                status_color="$YELLOW"
                starting=$((starting + 1))
            fi
        elif [ "$container_status" = "starting" ]; then
            status="starting"
            status_icon="◐"
            status_color="$YELLOW"
            starting=$((starting + 1))
        elif [ -n "$container_status" ] && [ "$container_status" != "unknown" ]; then
            status="$container_status"
            status_icon="○"
            status_color="$RED"
            failed=$((failed + 1))
        else
            status="not running"
            status_icon="○"
            status_color="$RED"
            failed=$((failed + 1))
        fi
        
        printf "  │ %-18s │ %b%-12s%b │ %-26s │\n" \
            "$name" "$status_color" "$status_icon $status" "$NC" "${check_url:--}"
    done
    
    echo "  └────────────────────┴──────────────┴────────────────────────────┘"
    echo ""
    
    if [ $failed -eq 0 ] && [ $starting -eq 0 ]; then
        echo -e "  ${GREEN}● $healthy/$total services healthy${NC}"
        return 0
    elif [ $failed -eq 0 ]; then
        echo -e "  ${YELLOW}◐ $healthy/$total healthy, $starting starting${NC}"
        return 0
    else
        echo -e "  ${RED}○ $healthy/$total healthy, $failed failed${NC}"
        return 1
    fi
}

cleanup_old_logs() {
    local log_dir="${1:-$LOG_DIR}"
    local keep_count=${2:-10}
    
    if [ -d "$log_dir" ]; then
        local count
        count=$(ls -1 "$log_dir"/*.log 2>/dev/null | wc -l)
        if [ "$count" -gt "$keep_count" ]; then
            ls -t "$log_dir"/*.log 2>/dev/null | tail -n +$((keep_count + 1)) | xargs rm -f 2>/dev/null
            log "INFO" "Cleaned up old logs, keeping $keep_count most recent"
        fi
    fi
}

docker_prune_if_needed() {
    local free_space
    free_space=$(df -BG /var/lib/docker 2>/dev/null | awk 'NR==2 {gsub("G",""); print $4}' || echo "100")
    
    if [ "${free_space:-100}" -lt 10 ]; then
        echo -e "${YELLOW}[AUTO]${NC} Low disk space, pruning Docker resources..."
        docker system prune -f --volumes 2>/dev/null || true
        docker image prune -f 2>/dev/null || true
    fi
}

retry_command() {
    local max_attempts=${1:-3}
    local delay=${2:-5}
    shift 2
    local cmd=("$@")
    
    local attempt=1
    while [ $attempt -le $max_attempts ]; do
        if "${cmd[@]}"; then
            return 0
        fi
        
        if [ $attempt -lt $max_attempts ]; then
            log "WARN" "Command failed (attempt $attempt/$max_attempts), retrying in ${delay}s..."
            sleep "$delay"
        fi
        attempt=$((attempt + 1))
    done
    
    log "ERROR" "Command failed after $max_attempts attempts"
    return 1
}

show_deployment_summary() {
    local deployment_type=$1
    local domain="${DOMAIN:-example.com}"
    
    echo ""
    echo -e "${GREEN}═══ Deployment Complete ═══${NC}"
    echo ""
    
    if [ "$deployment_type" = "linode" ]; then
        echo "Public URLs:"
        echo "  Dashboard:   https://dashboard.$domain"
        echo "  Discord Bot: https://bot.$domain"
        echo "  Stream Bot:  https://stream.$domain"
    else
        echo "Public URLs:"
        echo "  Plex:           https://plex.$domain"
        echo "  Jellyfin:       https://jellyfin.$domain"
        echo "  Home Assistant: https://home.$domain"
        echo "  Auth Portal:    https://auth.$domain"
        echo ""
        echo "Protected URLs (require Authelia login):"
        echo "  Storage:        https://storage.$domain"
        echo "  VNC Desktop:    https://vnc.$domain"
        echo "  SSH Terminal:   https://ssh.$domain"
    fi
    
    echo ""
    echo "Commands:"
    echo "  Logs:       docker compose logs -f [service]"
    echo "  Status:     docker compose ps"
    echo "  Restart:    docker compose restart [service]"
    echo "  Health:     ./deploy.sh check"
}

safe_docker_build() {
    local compose_file="${1:-docker-compose.yml}"
    local log_file="${2:-$DEPLOY_LOG}"
    local use_cache=${3:-true}
    
    local cache_arg=""
    if [ "$use_cache" = false ]; then
        cache_arg="--no-cache"
    fi
    
    local build_result=0
    
    log_section "Docker Build Started"
    
    if [ "$VERBOSE" = true ]; then
        echo "Build log: $log_file"
        echo ""
        docker compose -f "$compose_file" build $cache_arg --progress=plain 2>&1 | tee -a "$log_file" || build_result=$?
    else
        echo -n "  Building images... "
        if docker compose -f "$compose_file" build $cache_arg >> "$log_file" 2>&1; then
            echo -e "${GREEN}done${NC}"
        else
            build_result=$?
            echo -e "${RED}failed${NC}"
        fi
    fi
    
    if [ $build_result -ne 0 ]; then
        echo ""
        echo -e "${RED}✗ Build failed!${NC}"
        echo -e "${YELLOW}Full log: $log_file${NC}"
        echo ""
        echo "Last 30 lines of errors:"
        echo "─────────────────────────"
        tail -30 "$log_file" | grep -E "(ERROR|error|Error|failed|Failed|FAIL|Cannot|not found|Module)" || tail -30 "$log_file"
        echo "─────────────────────────"
        echo ""
        echo "Common fixes:"
        echo "  - Check package.json for missing dependencies"
        echo "  - Run 'npm install' locally to verify"
        echo "  - Check Dockerfile for correct paths"
        return 1
    fi
    
    echo -e "${GREEN}✓ Build complete${NC}"
    return 0
}

safe_docker_deploy() {
    local compose_file="${1:-docker-compose.yml}"
    local log_file="${2:-$DEPLOY_LOG}"
    local profiles="${3:-}"
    
    log_section "Docker Deploy Started"
    
    local compose_cmd="docker compose -f $compose_file"
    if [ -n "$profiles" ]; then
        compose_cmd="$compose_cmd $profiles"
    fi
    
    if [ "$VERBOSE" = true ]; then
        echo "Deploy log: $log_file"
        echo ""
        {
            echo "=== Stopping old containers ==="
            $compose_cmd down --remove-orphans 2>/dev/null || true
            echo ""
            echo "=== Pulling images ==="
            $compose_cmd pull 2>/dev/null || true
            echo ""
            echo "=== Starting services ==="
            $compose_cmd up -d
        } 2>&1 | tee -a "$log_file"
    else
        echo -n "  Stopping old containers... "
        $compose_cmd down --remove-orphans >> "$log_file" 2>&1 || true
        echo -e "${GREEN}done${NC}"
        
        echo -n "  Pulling images... "
        $compose_cmd pull >> "$log_file" 2>&1 || true
        echo -e "${GREEN}done${NC}"
        
        echo -n "  Starting services... "
        if $compose_cmd up -d >> "$log_file" 2>&1; then
            echo -e "${GREEN}done${NC}"
        else
            echo -e "${RED}failed${NC}"
            echo ""
            echo -e "${RED}✗ Deploy failed!${NC}"
            echo "Last 20 lines:"
            tail -20 "$log_file"
            return 1
        fi
    fi
    
    echo -e "${GREEN}✓ Services started${NC}"
    return 0
}

post_deploy_wait() {
    local wait_time=${1:-15}
    echo ""
    echo -e "${CYAN}Waiting ${wait_time}s for services to initialize...${NC}"
    
    if [ "$VERBOSE" = true ]; then
        for i in $(seq 1 $wait_time); do
            echo -ne "\r  $i/${wait_time}s "
            sleep 1
        done
        echo ""
    else
        sleep "$wait_time"
    fi
}
