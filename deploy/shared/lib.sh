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

print_header() {
    echo -e "${CYAN}━━━ $1 ━━━${NC}"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
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
        
        if [ "$container_status" = "healthy" ]; then
            # Docker healthcheck passed - trust it
            status="healthy"
            status_icon="●"
            status_color="$GREEN"
            healthy=$((healthy + 1))
        elif [ "$container_status" = "running" ]; then
            # No Docker healthcheck - verify with endpoint if available
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

wait_for_services_with_retry() {
    local deployment_type="${1:-linode}"
    local max_attempts="${2:-6}"
    local wait_between="${3:-10}"
    
    echo ""
    echo -e "${CYAN}Waiting for services to be healthy...${NC}"
    
    local attempt=1
    while [ $attempt -le $max_attempts ]; do
        echo ""
        echo -e "${CYAN}[Attempt $attempt/$max_attempts]${NC}"
        
        local all_healthy=true
        local starting_count=0
        
        declare -a critical_services
        if [ "$deployment_type" = "linode" ]; then
            critical_services=("homelab-dashboard" "discord-bot" "stream-bot" "homelab-postgres" "homelab-redis" "caddy")
        else
            critical_services=("plex" "authelia" "caddy-local" "homelab-minio" "dashboard-postgres" "authelia-redis")
        fi
        
        for svc in "${critical_services[@]}"; do
            local status
            status=$(docker inspect -f '{{.State.Health.Status}}' "$svc" 2>/dev/null || docker inspect -f '{{.State.Status}}' "$svc" 2>/dev/null || echo "not found")
            
            if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then
                echo -e "  ${GREEN}●${NC} $svc: $status"
            elif [ "$status" = "starting" ]; then
                echo -e "  ${YELLOW}◐${NC} $svc: $status"
                all_healthy=false
                starting_count=$((starting_count + 1))
            else
                echo -e "  ${RED}○${NC} $svc: $status"
                all_healthy=false
            fi
        done
        
        if [ "$all_healthy" = true ]; then
            echo ""
            echo -e "${GREEN}✓ All critical services are healthy!${NC}"
            return 0
        fi
        
        if [ $attempt -lt $max_attempts ]; then
            echo ""
            echo -e "${YELLOW}Waiting ${wait_between}s before retry...${NC}"
            sleep "$wait_between"
        fi
        
        attempt=$((attempt + 1))
    done
    
    echo ""
    echo -e "${YELLOW}⚠ Some services may still be starting. Check logs if issues persist.${NC}"
    return 1
}

get_tailscale_ip() {
    if command -v tailscale &> /dev/null; then
        tailscale ip -4 2>/dev/null | head -1 || echo ""
    else
        echo ""
    fi
}

get_tailscale_peers() {
    if command -v tailscale &> /dev/null; then
        tailscale status --json 2>/dev/null || echo "{}"
    else
        echo "{}"
    fi
}

check_ollama_health() {
    local url="${1:-http://localhost:11434}"
    local timeout="${2:-5}"
    
    if curl -sf --connect-timeout "$timeout" "${url}/api/version" > /dev/null 2>&1; then
        echo "online"
    else
        echo "offline"
    fi
}

get_local_ai_state_path() {
    if [ -n "${LOCAL_AI_STATE_FILE:-}" ]; then
        echo "$LOCAL_AI_STATE_FILE"
        return
    fi
    
    local repo_root="${REPO_ROOT:-}"
    if [ -z "$repo_root" ]; then
        if [ -n "${SCRIPT_DIR:-}" ]; then
            repo_root="$(cd "$SCRIPT_DIR/../.." 2>/dev/null && pwd)"
        else
            repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd)"
        fi
    fi
    
    echo "${repo_root}/deploy/shared/state/local-ai.json"
}

sync_local_ai_state() {
    local LOCAL_TAILSCALE_IP="${LOCAL_TAILSCALE_IP:-100.66.61.51}"
    local SSH_USER="${HOME_SSH_USER:-evin}"
    local SSH_KEY="${HOME}/.ssh/homelab"
    local REMOTE_STATE="/opt/homelab/HomeLabHub/deploy/shared/state/local-ai.json"
    local LOCAL_STATE
    LOCAL_STATE=$(get_local_ai_state_path)
    
    echo -e "${CYAN}━━━ Syncing AI State from Local Server ━━━${NC}"
    
    if [ ! -f "$SSH_KEY" ]; then
        echo -e "${YELLOW}[SKIP]${NC} SSH key not found: $SSH_KEY"
        return 1
    fi
    
    mkdir -p "$(dirname "$LOCAL_STATE")"
    
    # BatchMode=yes prevents password prompts - will fail silently if key auth doesn't work
    if scp -o ConnectTimeout=5 -o StrictHostKeyChecking=no -o BatchMode=yes -i "$SSH_KEY" \
        "${SSH_USER}@${LOCAL_TAILSCALE_IP}:${REMOTE_STATE}" "$LOCAL_STATE" 2>/dev/null; then
        echo -e "${GREEN}[OK]${NC} Synced state from local server"
        return 0
    else
        echo -e "${YELLOW}[SKIP]${NC} Could not sync state - will probe Windows VM directly"
        return 1
    fi
}

parse_json_value() {
    local json="$1"
    local key="$2"
    
    if command -v jq &> /dev/null; then
        echo "$json" | jq -r "$key // empty" 2>/dev/null || echo ""
    else
        local pattern
        case "$key" in
            ".primaryOllama.url")
                pattern='"primaryOllama"[^}]*"url"[[:space:]]*:[[:space:]]*"([^"]*)"'
                ;;
            ".windowsVm.services.ollama.url")
                pattern='"windowsVm"[^}]*"ollama"[^}]*"url"[[:space:]]*:[[:space:]]*"([^"]*)"'
                ;;
            ".services.ollama.url")
                pattern='"ollama"[^}]*"url"[[:space:]]*:[[:space:]]*"([^"]*)"'
                ;;
            ".services.stableDiffusion.url")
                pattern='"stableDiffusion"[^}]*"url"[[:space:]]*:[[:space:]]*"([^"]*)"'
                ;;
            ".services.comfyui.url")
                pattern='"comfyui"[^}]*"url"[[:space:]]*:[[:space:]]*"([^"]*)"'
                ;;
            *)
                echo ""
                return
                ;;
        esac
        echo "$json" | tr '\n' ' ' | grep -oE "$pattern" | sed -E 's/.*"url"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/' | head -1 || echo ""
    fi
}

discover_local_ai_from_state() {
    local state_file
    state_file=$(get_local_ai_state_path)
    
    if [ ! -f "$state_file" ]; then
        echo ""
        return 1
    fi
    
    local json
    json=$(cat "$state_file" 2>/dev/null) || return 1
    
    local ollama_url sd_url comfy_url
    
    ollama_url=$(parse_json_value "$json" ".primaryOllama.url")
    if [ -z "$ollama_url" ] || [ "$ollama_url" = "null" ]; then
        ollama_url=$(parse_json_value "$json" ".windowsVm.services.ollama.url")
    fi
    if [ -z "$ollama_url" ] || [ "$ollama_url" = "null" ]; then
        ollama_url=$(parse_json_value "$json" ".services.ollama.url")
    fi
    
    sd_url=$(parse_json_value "$json" ".services.stableDiffusion.url")
    comfy_url=$(parse_json_value "$json" ".services.comfyui.url")
    
    echo "OLLAMA_URL=$ollama_url"
    echo "STABLE_DIFFUSION_URL=$sd_url"
    echo "COMFYUI_URL=$comfy_url"
}

configure_local_ai_env() {
    local env_file="${1:-.env}"
    local state_file
    state_file=$(get_local_ai_state_path)
    
    echo -e "${CYAN}━━━ Local AI Auto-Discovery ━━━${NC}"
    
    local ollama_url=""
    local sd_url=""
    local comfy_url=""
    local configured=0
    
    if [ -f "$state_file" ]; then
        local state_age=0
        local state_mtime=$(stat -c %Y "$state_file" 2>/dev/null || stat -f %m "$state_file" 2>/dev/null || echo 0)
        local now=$(date +%s)
        state_age=$(( (now - state_mtime) / 3600 ))
        
        if [ "$state_age" -gt 24 ]; then
            echo -e "${YELLOW}[WARN]${NC} Local AI state is ${state_age}h old - may be stale"
        fi
        
        local ai_config
        ai_config=$(discover_local_ai_from_state)
        
        ollama_url=$(echo "$ai_config" | grep "^OLLAMA_URL=" | cut -d= -f2-)
        sd_url=$(echo "$ai_config" | grep "^STABLE_DIFFUSION_URL=" | cut -d= -f2-)
        comfy_url=$(echo "$ai_config" | grep "^COMFYUI_URL=" | cut -d= -f2-)
    else
        echo -e "${YELLOW}[INFO]${NC} No state file - probing Windows VM directly"
    fi
    
    local WINDOWS_VM_IP="${WINDOWS_VM_TAILSCALE_IP:-100.118.44.102}"
    local win_ollama_url="http://${WINDOWS_VM_IP}:11434"
    local best_ollama=""
    local ollama_online=false
    
    # Windows VM GPU is always primary - NEVER fall back to other IPs in .env
    best_ollama="$win_ollama_url"
    local win_status=$(check_ollama_health "$win_ollama_url" 3)
    if [ "$win_status" = "online" ]; then
        echo -e "${GREEN}[OK]${NC} Windows VM Ollama: $win_ollama_url (GPU primary)"
        ollama_online=true
        configured=$((configured + 1))
    else
        echo -e "${YELLOW}[--]${NC} Ollama: $win_ollama_url (offline - start on Windows VM)"
        # Check if a fallback exists for status display only (don't save to .env)
        if [ -n "$ollama_url" ] && [ "$ollama_url" != "$win_ollama_url" ]; then
            local fallback_status=$(check_ollama_health "$ollama_url" 3)
            if [ "$fallback_status" = "online" ]; then
                echo -e "${YELLOW}     ${NC} Fallback available: $ollama_url (not using - Windows VM is primary)"
            fi
        fi
    fi
    
    if [ -n "$best_ollama" ]; then
        update_env_var "$env_file" "OLLAMA_URL" "$best_ollama"
        if [ "$ollama_online" = false ]; then
            echo -e "${YELLOW}[INFO]${NC} Saved Ollama URL for later: $best_ollama"
        fi
    fi
    
    # Check Stable Diffusion - Windows VM GPU is always primary, NEVER fall back in .env
    local sd_win_url="http://${WINDOWS_VM_IP}:7860"
    local best_sd="$sd_win_url"
    local sd_online=false
    
    # Check multiple endpoints - API may vary by version
    if curl -sf --connect-timeout 3 "${sd_win_url}/sdapi/v1/sd-models" > /dev/null 2>&1 || \
       curl -sf --connect-timeout 3 "${sd_win_url}/internal/ping" > /dev/null 2>&1 || \
       curl -s --connect-timeout 3 -o /dev/null -w "%{http_code}" "${sd_win_url}/" 2>/dev/null | grep -q "200"; then
        echo -e "${GREEN}[OK]${NC} Stable Diffusion: $sd_win_url (Windows VM GPU)"
        sd_online=true
        configured=$((configured + 1))
    else
        echo -e "${YELLOW}[--]${NC} Stable Diffusion: $sd_win_url (offline - start on Windows VM)"
        # Check fallback for status display only
        if [ -n "$sd_url" ] && [ "$sd_url" != "$sd_win_url" ] && (curl -sf --connect-timeout 3 "${sd_url}/sdapi/v1/sd-models" > /dev/null 2>&1 || curl -s --connect-timeout 3 -o /dev/null -w "%{http_code}" "${sd_url}/" 2>/dev/null | grep -q "200"); then
            echo -e "${YELLOW}     ${NC} Fallback available: $sd_url (not using - Windows VM is primary)"
        fi
    fi
    
    update_env_var "$env_file" "STABLE_DIFFUSION_URL" "$best_sd"
    
    # Check ComfyUI - Windows VM GPU is always primary, NEVER fall back in .env
    local comfy_win_url="http://${WINDOWS_VM_IP}:8188"
    local best_comfy="$comfy_win_url"
    local comfy_online=false
    
    if curl -sf --connect-timeout 3 "${comfy_win_url}/system_stats" > /dev/null 2>&1; then
        echo -e "${GREEN}[OK]${NC} ComfyUI: $comfy_win_url (Windows VM GPU)"
        comfy_online=true
        configured=$((configured + 1))
    else
        echo -e "${YELLOW}[--]${NC} ComfyUI: $comfy_win_url (offline - start on Windows VM)"
        # Check fallback for status display only
        if [ -n "$comfy_url" ] && [ "$comfy_url" != "$comfy_win_url" ] && curl -sf --connect-timeout 3 "${comfy_url}/system_stats" > /dev/null 2>&1; then
            echo -e "${YELLOW}     ${NC} Fallback available: $comfy_url (not using - Windows VM is primary)"
        fi
    fi
    
    update_env_var "$env_file" "COMFYUI_URL" "$best_comfy"
    
    if [ $configured -eq 0 ]; then
        echo -e "${YELLOW}[INFO]${NC} No local AI services reachable"
        echo "       Dashboard will use OpenAI as fallback"
    else
        echo -e "${GREEN}✓${NC} Configured $configured local AI service(s)"
    fi
    
    echo ""
}

update_env_var() {
    local env_file="$1"
    local key="$2"
    local value="$3"
    
    if grep -q "^${key}=" "$env_file" 2>/dev/null; then
        sed -i "s|^${key}=.*|${key}=${value}|" "$env_file"
    else
        echo "${key}=${value}" >> "$env_file"
    fi
}

register_local_ai_services() {
    echo -e "${CYAN}━━━ Registering Local AI Services ━━━${NC}"
    
    local state_file
    state_file=$(get_local_ai_state_path)
    local state_dir
    state_dir=$(dirname "$state_file")
    
    mkdir -p "$state_dir"
    chmod 750 "$state_dir" 2>/dev/null || true
    
    local tailscale_ip=$(get_tailscale_ip)
    local local_ip=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
    local hostname=$(hostname)
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    
    local preferred_ip="${tailscale_ip:-$local_ip}"
    
    local WINDOWS_VM_IP="${WINDOWS_VM_TAILSCALE_IP:-100.118.44.102}"
    local WINDOWS_VM_NAME="${WINDOWS_VM_NAME:-RDPWindows}"
    
    local ollama_status="offline"
    local ollama_url="http://${preferred_ip}:11434"
    local ollama_version=""
    local ollama_models=""
    local ollama_source="ubuntu-host"
    
    local win_ollama_status="offline"
    local win_ollama_url="http://${WINDOWS_VM_IP}:11434"
    local win_ollama_version=""
    local win_ollama_models=""
    
    echo "Checking Windows VM (${WINDOWS_VM_NAME} @ ${WINDOWS_VM_IP})..."
    if curl -sf --connect-timeout 5 "${win_ollama_url}/api/version" > /dev/null 2>&1; then
        win_ollama_status="online"
        win_ollama_version=$(curl -sf --connect-timeout 3 "${win_ollama_url}/api/version" 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
        win_ollama_models=$(curl -sf --connect-timeout 5 "${win_ollama_url}/api/tags" 2>/dev/null | grep -o '"name":"[^"]*"' | cut -d'"' -f4 | tr '\n' ',' | sed 's/,$//' || echo "")
        echo -e "${GREEN}[OK]${NC} Windows VM Ollama: online (v${win_ollama_version}) - GPU: NVIDIA RTX 3060"
        [ -n "$win_ollama_models" ] && echo "      Models: $win_ollama_models"
        ollama_status="online"
        ollama_url="$win_ollama_url"
        ollama_version="$win_ollama_version"
        ollama_models="$win_ollama_models"
        ollama_source="windows-vm-gpu"
    else
        echo -e "${YELLOW}[--]${NC} Windows VM Ollama: offline (VM may be shut down)"
    fi
    
    if [ "$win_ollama_status" != "online" ]; then
        echo "Checking Ubuntu host..."
        if curl -sf --connect-timeout 3 "http://${preferred_ip}:11434/api/version" > /dev/null 2>&1; then
            ollama_status="online"
            ollama_version=$(curl -sf --connect-timeout 3 "http://${preferred_ip}:11434/api/version" 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
            ollama_models=$(curl -sf --connect-timeout 5 "http://${preferred_ip}:11434/api/tags" 2>/dev/null | grep -o '"name":"[^"]*"' | cut -d'"' -f4 | tr '\n' ',' | sed 's/,$//' || echo "")
            ollama_url="http://${preferred_ip}:11434"
            ollama_source="ubuntu-host"
            echo -e "${GREEN}[OK]${NC} Ubuntu Ollama: online (v${ollama_version}) - CPU only"
        else
            echo -e "${RED}[--]${NC} Ubuntu Ollama: offline"
        fi
    fi
    
    local sd_status="offline"
    local sd_url=""
    local sd_source=""
    
    # Check Windows VM first for Stable Diffusion (GPU preferred)
    local win_sd_url="http://${WINDOWS_VM_IP}:7860"
    # Check multiple endpoints - API may vary by version
    if curl -sf --connect-timeout 3 "${win_sd_url}/sdapi/v1/sd-models" > /dev/null 2>&1 || \
       curl -sf --connect-timeout 3 "${win_sd_url}/internal/ping" > /dev/null 2>&1 || \
       curl -s --connect-timeout 3 -o /dev/null -w "%{http_code}" "${win_sd_url}/" 2>/dev/null | grep -q "200"; then
        sd_status="online"
        sd_url="$win_sd_url"
        sd_source="windows-vm-gpu"
        echo -e "${GREEN}[OK]${NC} Stable Diffusion: online (Windows VM GPU)"
    else
        # Fallback to local Ubuntu
        local local_sd_url="http://${preferred_ip}:7860"
        if curl -sf --connect-timeout 3 "${local_sd_url}/sdapi/v1/sd-models" > /dev/null 2>&1 || \
           curl -s --connect-timeout 3 -o /dev/null -w "%{http_code}" "${local_sd_url}/" 2>/dev/null | grep -q "200"; then
            sd_status="online"
            sd_url="$local_sd_url"
            sd_source="ubuntu-host"
            echo -e "${GREEN}[OK]${NC} Stable Diffusion: online (Ubuntu)"
        else
            echo -e "${YELLOW}[--]${NC} Stable Diffusion: offline"
        fi
    fi
    
    local comfy_status="offline"
    local comfy_url=""
    local comfy_source=""
    
    # Check Windows VM first for ComfyUI (GPU preferred)
    local win_comfy_url="http://${WINDOWS_VM_IP}:8188"
    if curl -sf --connect-timeout 3 "${win_comfy_url}/system_stats" > /dev/null 2>&1; then
        comfy_status="online"
        comfy_url="$win_comfy_url"
        comfy_source="windows-vm-gpu"
        echo -e "${GREEN}[OK]${NC} ComfyUI: online (Windows VM GPU)"
    else
        # Fallback to local Ubuntu
        local local_comfy_url="http://${preferred_ip}:8188"
        if curl -sf --connect-timeout 3 "${local_comfy_url}/system_stats" > /dev/null 2>&1; then
            comfy_status="online"
            comfy_url="$local_comfy_url"
            comfy_source="ubuntu-host"
            echo -e "${GREEN}[OK]${NC} ComfyUI: online (Ubuntu)"
        else
            echo -e "${YELLOW}[--]${NC} ComfyUI: offline"
        fi
    fi
    
    cat > "$state_file" << EOF
{
  "hostname": "$hostname",
  "localIp": "$local_ip",
  "tailscaleIp": "${tailscale_ip:-null}",
  "preferredIp": "$preferred_ip",
  "registeredAt": "$timestamp",
  "primaryOllama": {
    "status": "$ollama_status",
    "url": "$ollama_url",
    "source": "$ollama_source",
    "version": "$ollama_version",
    "models": "$ollama_models"
  },
  "services": {
    "ollama": {
      "status": "$ollama_status",
      "url": "$ollama_url",
      "version": "$ollama_version",
      "models": "$ollama_models",
      "source": "$ollama_source"
    },
    "stableDiffusion": {
      "status": "$sd_status",
      "url": "$sd_url"
    },
    "comfyui": {
      "status": "$comfy_status",
      "url": "$comfy_url"
    }
  },
  "windowsVm": {
    "name": "$WINDOWS_VM_NAME",
    "tailscaleIp": "$WINDOWS_VM_IP",
    "gpu": {
      "model": "NVIDIA GeForce RTX 3060",
      "vram": "12GB",
      "passthrough": "kvm"
    },
    "services": {
      "ollama": {
        "status": "$win_ollama_status",
        "url": "$win_ollama_url",
        "version": "$win_ollama_version",
        "models": "$win_ollama_models"
      }
    }
  }
}
EOF
    
    echo -e "${GREEN}✓${NC} State saved to: $state_file"
    echo ""
}
