#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_DIR="$(dirname "$SCRIPT_DIR")/shared"

source "$SHARED_DIR/env-lib.sh"

cd "$SCRIPT_DIR"

VERBOSE=false
PROFILES=""
WITH_TORRENTS=false
WITH_GAMESTREAM=false
WITH_MONITORING=false
COMMAND=""
POSITIONAL_ARGS=()

while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--verbose) VERBOSE=true; shift ;;
        --with-torrents) WITH_TORRENTS=true; shift ;;
        --with-gamestream) WITH_GAMESTREAM=true; shift ;;
        --with-monitoring) WITH_MONITORING=true; shift ;;
        -*) echo "Unknown option: $1"; shift ;;
        *) POSITIONAL_ARGS+=("$1"); shift ;;
    esac
done

set -- "${POSITIONAL_ARGS[@]}"

build_profiles() {
    local profiles=""
    if [ "$WITH_TORRENTS" = true ]; then
        profiles="${profiles:+$profiles }--profile torrents"
    fi
    if [ "$WITH_GAMESTREAM" = true ]; then
        profiles="${profiles:+$profiles }--profile gamestream"
    fi
    if [ "$WITH_MONITORING" = true ]; then
        profiles="${profiles:+$profiles }--profile monitoring"
    fi
    echo "$profiles"
}

PROFILES=$(build_profiles)

show_help() {
    echo "Nebula Command - Local Ubuntu Deployment"
    echo ""
    echo "Usage: ./deploy.sh [options] [command]"
    echo ""
    echo "Options:"
    echo "  -v, --verbose       Show full output (default: compact)"
    echo "  --with-torrents     Enable torrent profile (qBittorrent, etc)"
    echo "  --with-gamestream   Enable gamestream profile (Sunshine, etc)"
    echo "  --with-monitoring   Enable monitoring profile (Prometheus, Grafana, etc)"
    echo ""
    echo "Commands:"
    echo "  (none)       Full deployment (setup + deploy)"
    echo "  setup        Interactive environment setup only"
    echo "  check        Check environment health"
    echo "  up           Start services only"
    echo "  down         Stop services"
    echo "  logs         View service logs (docker compose logs)"
    echo "  deploy-logs  View saved deploy logs"
    echo "  nas          Mount NAS storage"
    echo "  dns-sync     Sync Cloudflare DNS records"
    echo "  port-check   Check if ports are accessible from outside"
    echo "  dns-check    Validate DNS records resolve correctly"
    echo "  install      Install systemd service for auto-start on boot"
    echo "  uninstall    Remove systemd service"
    echo "  authelia     Generate Authelia password hash"
    echo "  help         Show this help"
    echo ""
    echo "Environment:"
    echo "  KEEP_BUILD_LOGS=true  Keep deploy logs even on success"
    echo ""
    echo "Examples:"
    echo "  ./deploy.sh                           # Default deployment"
    echo "  ./deploy.sh --with-torrents           # Deploy with torrent services"
    echo "  ./deploy.sh --with-monitoring -v      # Deploy with monitoring, verbose"
    echo "  ./deploy.sh --with-torrents --with-gamestream  # Multiple profiles"
    echo ""
}

get_public_ip() {
    local ip=""
    ip=$(curl -sf --connect-timeout 5 https://api.ipify.org 2>/dev/null) || \
    ip=$(curl -sf --connect-timeout 5 https://ifconfig.me 2>/dev/null) || \
    ip=$(curl -sf --connect-timeout 5 https://icanhazip.com 2>/dev/null) || \
    ip=""
    echo "$ip"
}

check_port_forwarding() {
    echo -e "${CYAN}━━━ Port Forwarding Check ━━━${NC}"
    
    local public_ip
    public_ip=$(get_public_ip)
    
    if [ -z "$public_ip" ]; then
        echo -e "${YELLOW}[SKIP]${NC} Could not determine public IP address"
        return 1
    fi
    
    echo "Public IP: $public_ip"
    echo ""
    
    local ports=(80 443 32400)
    local port_names=("HTTP" "HTTPS" "Plex")
    local all_ok=true
    
    for i in "${!ports[@]}"; do
        local port="${ports[$i]}"
        local name="${port_names[$i]}"
        echo -n "  Checking port $port ($name)... "
        
        if curl -sf --connect-timeout 5 --max-time 10 "http://$public_ip:$port" > /dev/null 2>&1 || \
           curl -sf --connect-timeout 5 --max-time 10 -k "https://$public_ip:$port" > /dev/null 2>&1 || \
           nc -z -w5 "$public_ip" "$port" 2>/dev/null; then
            echo -e "${GREEN}accessible${NC}"
        else
            echo -e "${YELLOW}not accessible or filtered${NC}"
            all_ok=false
        fi
    done
    
    echo ""
    if [ "$all_ok" = true ]; then
        echo -e "${GREEN}[OK]${NC} All ports appear accessible from outside"
    else
        echo -e "${YELLOW}[WARN]${NC} Some ports may not be forwarded correctly"
        echo "       Check your router/firewall port forwarding settings"
    fi
    echo ""
}

validate_dns() {
    echo -e "${CYAN}━━━ DNS Validation ━━━${NC}"
    
    local domain="${DOMAIN:-}"
    if [ -z "$domain" ] || [ "$domain" = "example.com" ]; then
        echo -e "${YELLOW}[SKIP]${NC} DOMAIN not set or still example.com"
        return 0
    fi
    
    if ! command -v dig &> /dev/null; then
        echo -e "${YELLOW}[SKIP]${NC} dig command not found (install dnsutils)"
        return 0
    fi
    
    local public_ip
    public_ip=$(get_public_ip)
    local linode_ip="69.164.211.205"
    
    if [ -z "$public_ip" ]; then
        echo -e "${YELLOW}[SKIP]${NC} Could not determine public IP for comparison"
        return 1
    fi
    
    echo "Local Public IP: $public_ip"
    echo "Linode IP: $linode_ip"
    echo "Domain: $domain"
    echo ""
    
    local all_ok=true
    
    check_dns() {
        local sub=$1
        local expected_server=$2
        local is_proxied=$3
        local fqdn
        
        if [ -z "$sub" ]; then
            fqdn="$domain"
        else
            fqdn="${sub}.${domain}"
        fi
        
        echo -n "  $fqdn -> "
        local resolved_ip
        resolved_ip=$(dig +short "$fqdn" A 2>/dev/null | head -1)
        
        if [ -z "$resolved_ip" ]; then
            echo -e "${YELLOW}no A record${NC}"
            all_ok=false
            return
        fi
        
        local expected_ip
        if [ "$expected_server" = "linode" ]; then
            expected_ip="$linode_ip"
        else
            expected_ip="$public_ip"
        fi
        
        if [ "$is_proxied" = "true" ]; then
            if [[ "$resolved_ip" =~ ^(172\.|104\.) ]]; then
                echo -e "${GREEN}$resolved_ip (Cloudflare proxied) ✓${NC}"
            elif [ "$resolved_ip" = "$expected_ip" ]; then
                echo -e "${GREEN}$resolved_ip ✓${NC}"
            else
                echo -e "${YELLOW}$resolved_ip (expected CF proxy or $expected_ip)${NC}"
                all_ok=false
            fi
        else
            if [ "$resolved_ip" = "$expected_ip" ]; then
                echo -e "${GREEN}$resolved_ip ✓${NC}"
            else
                echo -e "${YELLOW}$resolved_ip (expected $expected_ip)${NC}"
                all_ok=false
            fi
        fi
    }
    
    echo "Linode services:"
    check_dns "dashboard" "linode" "true"
    check_dns "api" "linode" "true"
    
    echo ""
    echo "Local services (DNS-only for bandwidth):"
    check_dns "plex" "local" "false"
    check_dns "jellyfin" "local" "false"
    check_dns "home" "local" "false"
    check_dns "gamestream" "local" "false"
    
    echo ""
    echo "Local services (Cloudflare proxied):"
    check_dns "auth" "local" "true"
    check_dns "storage" "local" "true"
    check_dns "vnc" "local" "true"
    check_dns "ssh" "local" "true"
    
    echo ""
    if [ "$all_ok" = true ]; then
        echo -e "${GREEN}[OK]${NC} All DNS records resolve correctly"
    else
        echo -e "${YELLOW}[WARN]${NC} Some DNS records may need attention"
        echo "       Run './deploy.sh dns-sync' to update Cloudflare records"
    fi
    echo ""
}

do_git_pull() {
    echo -e "${CYAN}[1/5] Pulling latest code...${NC}"
    local repo_root
    repo_root="$(dirname "$(dirname "$SCRIPT_DIR")")"
    cd "$repo_root"
    
    if [ "$VERBOSE" = true ]; then
        git pull origin main
    else
        echo -n "  Fetching updates... "
        if git pull origin main > /dev/null 2>&1; then
            echo -e "${GREEN}done${NC}"
        else
            echo -e "${YELLOW}check manually${NC}"
        fi
    fi
    
    cd "$SCRIPT_DIR"
    echo -e "${GREEN}✓ Code updated${NC}"
    echo ""
}

ensure_ssh_keys() {
    echo -e "${CYAN}━━━ SSH Keys ━━━${NC}"
    
    local ssh_dir="${HOME}/.ssh"
    local key_path="${ssh_dir}/homelab"
    
    if [ -f "$key_path" ] && [ -f "${key_path}.pub" ]; then
        echo -e "${GREEN}[OK]${NC} SSH key exists: $key_path"
        return 0
    fi
    
    echo -e "${YELLOW}[SETUP]${NC} No SSH key found, generating..."
    mkdir -p "$ssh_dir"
    chmod 700 "$ssh_dir"
    
    ssh-keygen -t ed25519 -f "$key_path" -N "" -C "homelab-$(hostname)-$(date +%Y%m%d)" -q
    
    if [ -f "$key_path" ]; then
        chmod 600 "$key_path"
        chmod 644 "${key_path}.pub"
        echo -e "${GREEN}[OK]${NC} SSH key generated: $key_path"
        echo ""
        echo -e "${YELLOW}Public key (add to remote servers' ~/.ssh/authorized_keys):${NC}"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        cat "${key_path}.pub"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
    else
        echo -e "${RED}[ERROR]${NC} Failed to generate SSH key"
        return 1
    fi
}

ensure_authelia_secrets() {
    echo -e "${CYAN}━━━ Authelia Secrets ━━━${NC}"
    
    local env_file="$SCRIPT_DIR/.env"
    
    if ! grep -q "AUTHELIA_JWT_SECRET=" "$env_file" 2>/dev/null || grep -q "AUTHELIA_JWT_SECRET=$" "$env_file" 2>/dev/null; then
        local jwt_secret=$(openssl rand -hex 32)
        echo "AUTHELIA_JWT_SECRET=$jwt_secret" >> "$env_file"
        echo -e "${GREEN}[OK]${NC} Generated AUTHELIA_JWT_SECRET"
    fi
    
    if ! grep -q "AUTHELIA_SESSION_SECRET=" "$env_file" 2>/dev/null || grep -q "AUTHELIA_SESSION_SECRET=$" "$env_file" 2>/dev/null; then
        local session_secret=$(openssl rand -hex 32)
        echo "AUTHELIA_SESSION_SECRET=$session_secret" >> "$env_file"
        echo -e "${GREEN}[OK]${NC} Generated AUTHELIA_SESSION_SECRET"
    fi
    
    if ! grep -q "AUTHELIA_STORAGE_KEY=" "$env_file" 2>/dev/null || grep -q "AUTHELIA_STORAGE_KEY=$" "$env_file" 2>/dev/null; then
        local storage_key=$(openssl rand -hex 32)
        echo "AUTHELIA_STORAGE_KEY=$storage_key" >> "$env_file"
        echo -e "${GREEN}[OK]${NC} Generated AUTHELIA_STORAGE_KEY"
    fi
    
    echo -e "${GREEN}[OK]${NC} Authelia secrets configured via environment variables"
}

do_env_setup() {
    echo -e "${CYAN}[2/5] Environment setup...${NC}"
    
    [ ! -f ".env" ] && touch ".env"
    
    normalize_env_file ".env"
    
    echo -e "${CYAN}━━━ Internal Secrets ━━━${NC}"
    ensure_internal_secrets ".env"
    
    ensure_ssh_keys
    ensure_authelia_secrets
    
    echo -e "${GREEN}✓ Environment ready${NC}"
    echo ""
}

check_nas() {
    echo -e "${CYAN}━━━ NAS Storage ━━━${NC}"
    
    local media_paths=("/srv/media" "/mnt/nas/all" "/mnt/media")
    local found_mount=""
    
    for path in "${media_paths[@]}"; do
        if [ -d "$path" ] && [ "$(ls -A "$path" 2>/dev/null)" ]; then
            found_mount="$path"
            break
        fi
    done
    
    if [ -n "$found_mount" ]; then
        echo -e "${GREEN}[OK]${NC} Media storage found at $found_mount"
    else
        echo -e "${YELLOW}[SKIP]${NC} No media storage detected"
        echo "       Checked: ${media_paths[*]}"
        echo "       Plex will start but may not have media files"
    fi
    echo ""
}

do_dns_sync() {
    echo -e "${CYAN}[3/5] Syncing DNS records...${NC}"
    
    if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
        echo -e "${YELLOW}[SKIP]${NC} CLOUDFLARE_API_TOKEN not set, skipping DNS sync"
        echo "       Set in .env to enable automatic DNS management"
        return 0
    fi
    
    if [ -z "${DOMAIN:-}" ] || [ "${DOMAIN:-}" = "example.com" ]; then
        echo -e "${YELLOW}[SKIP]${NC} DOMAIN not set or still example.com"
        return 0
    fi
    
    local sync_script="$(dirname "$(dirname "$SCRIPT_DIR")")/scripts/cloudflare-sync.js"
    local repo_root="$(dirname "$(dirname "$SCRIPT_DIR")")"
    local scripts_dir="$(dirname "$(dirname "$SCRIPT_DIR")")/scripts"
    
    if [ -f "$sync_script" ]; then
        echo "  Syncing DNS records for $DOMAIN..."
        
        if [ -f "$scripts_dir/package.json" ] && [ ! -d "$scripts_dir/node_modules" ]; then
            echo "  Installing script dependencies..."
            npm install --prefix "$scripts_dir" --silent 2>/dev/null || npm install --prefix "$scripts_dir" 2>&1 | tail -3
        fi
        
        local enabled_profiles=""
        [ "$WITH_TORRENTS" = true ] && enabled_profiles="${enabled_profiles:+$enabled_profiles,}torrents"
        [ "$WITH_GAMESTREAM" = true ] && enabled_profiles="${enabled_profiles:+$enabled_profiles,}gamestream"
        [ "$WITH_MONITORING" = true ] && enabled_profiles="${enabled_profiles:+$enabled_profiles,}monitoring"
        
        local sync_output
        local sync_result=0
        sync_output=$(cd "$repo_root" && ENABLED_PROFILES="$enabled_profiles" node "$sync_script" 2>&1) || sync_result=$?
        
        if [ $sync_result -eq 0 ]; then
            echo "$sync_output" | tail -5
            echo -e "  ${GREEN}✓ DNS sync complete${NC}"
        else
            echo -e "  ${RED}✗ DNS sync failed${NC}"
            echo ""
            echo "$sync_output" | tail -20
            echo ""
        fi
    else
        echo -e "${YELLOW}[SKIP]${NC} cloudflare-sync.js not found"
    fi
    
    echo -e "${GREEN}✓ DNS configured${NC}"
    echo ""
    
    validate_dns
}

do_deploy() {
    echo -e "${CYAN}[4/5] Deploying services...${NC}"
    
    if [ -n "$PROFILES" ]; then
        echo -e "  Active profiles: ${GREEN}${PROFILES}${NC}"
    fi
    
    local log_dir="$SCRIPT_DIR/logs"
    mkdir -p "$log_dir"
    local log_file="$log_dir/deploy_$(date +%Y%m%d_%H%M%S).log"
    local deploy_result=0
    
    mkdir -p /srv/media/community 2>/dev/null || sudo mkdir -p /srv/media/community
    sudo chown 1000:1000 /srv/media/community 2>/dev/null || true
    
    if [ "$VERBOSE" = true ]; then
        echo "Deploy log: $log_file"
        echo ""
        {
            echo "=== Docker Pull ===" 
            docker compose $PROFILES pull
            echo ""
            echo "=== Docker Up ==="
            docker compose $PROFILES down --remove-orphans 2>/dev/null || true
            docker compose $PROFILES up -d
        } 2>&1 | tee "$log_file" || deploy_result=$?
    else
        echo -n "  Pulling images... "
        if docker compose $PROFILES pull > "$log_file" 2>&1; then
            echo -e "${GREEN}done${NC}"
        else
            deploy_result=$?
            echo -e "${RED}failed${NC}"
        fi
        
        if [ $deploy_result -eq 0 ]; then
            echo -n "  Stopping old containers... "
            docker compose $PROFILES down --remove-orphans >> "$log_file" 2>&1 || true
            echo -e "${GREEN}done${NC}"
            
            echo -n "  Starting services... "
            if docker compose $PROFILES up -d >> "$log_file" 2>&1; then
                echo -e "${GREEN}done${NC}"
            else
                deploy_result=$?
                echo -e "${RED}failed${NC}"
            fi
        fi
    fi
    
    if [ $deploy_result -eq 0 ]; then
        echo -e "${GREEN}✓ Services started${NC}"
        if [ "${KEEP_BUILD_LOGS:-}" != "true" ]; then
            rm -f "$log_file"
        fi
    else
        echo ""
        echo -e "${RED}✗ Deploy failed!${NC}"
        echo -e "${YELLOW}Full log saved to: $log_file${NC}"
        echo ""
        echo "Last 30 lines:"
        tail -30 "$log_file"
        echo ""
        echo "To retry with verbose: ./deploy.sh -v"
        exit 1
    fi
    echo ""
}

get_container_health() {
    local container_name=$1
    local health
    health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_name" 2>/dev/null)
    echo "${health:-unknown}"
}

print_health_table_row() {
    local service=$1
    local status=$2
    local url=$3
    local profile=${4:-"core"}
    
    local status_color
    local status_icon
    case "$status" in
        healthy|running)
            status_color="${GREEN}"
            status_icon="●"
            ;;
        starting|unhealthy)
            status_color="${YELLOW}"
            status_icon="◐"
            ;;
        *)
            status_color="${RED}"
            status_icon="○"
            ;;
    esac
    
    printf "  │ %-18s │ %b%-12s%b │ %-35s │ %-10s │\n" \
        "$service" "$status_color" "$status_icon $status" "$NC" "$url" "$profile"
}

do_post_deploy() {
    echo -e "${CYAN}[5/5] Health checks...${NC}"
    sleep 20
    
    local domain="${DOMAIN:-example.com}"
    
    echo ""
    echo -e "${CYAN}━━━ Active Profiles ━━━${NC}"
    if [ -n "$PROFILES" ]; then
        echo -e "  ${GREEN}✓${NC} Core services (always enabled)"
        [ "$WITH_TORRENTS" = true ] && echo -e "  ${GREEN}✓${NC} Torrents profile enabled"
        [ "$WITH_GAMESTREAM" = true ] && echo -e "  ${GREEN}✓${NC} Gamestream profile enabled"
        [ "$WITH_MONITORING" = true ] && echo -e "  ${GREEN}✓${NC} Monitoring profile enabled"
    else
        echo -e "  ${GREEN}✓${NC} Core services only (default)"
        echo -e "  ${CYAN}Tip:${NC} Use --with-torrents, --with-gamestream, --with-monitoring to enable more"
    fi
    
    echo ""
    echo -e "${CYAN}━━━ Service Health Report ━━━${NC}"
    echo "  ┌────────────────────┬──────────────┬─────────────────────────────────────┬────────────┐"
    echo "  │ Service            │ Status       │ URL                                 │ Profile    │"
    echo "  ├────────────────────┼──────────────┼─────────────────────────────────────┼────────────┤"
    
    declare -A services=(
        ["plex"]="Plex|http://localhost:32400/identity|core"
        ["jellyfin"]="Jellyfin|http://localhost:8096/health|core"
        ["homelab-minio"]="MinIO|http://localhost:9000/minio/health/live|core"
        ["homeassistant"]="Home Assistant|http://localhost:8123/|core"
        ["authelia"]="Authelia|http://localhost:9091/api/health|core"
        ["caddy-local"]="Caddy|http://localhost:80/|core"
        ["authelia-redis"]="Auth Redis|-|core"
        ["dashboard-postgres"]="Dashboard DB|-|core"
        # Dashboard runs on LINODE, not locally
        # ["homelab-dashboard"]="Dashboard|http://localhost:5000/api/health|core"
        ["novnc"]="VNC|http://localhost:8080/|core"
        ["ttyd"]="SSH Terminal|http://localhost:7681/|core"
    )
    
    if [ "$WITH_TORRENTS" = true ]; then
        services["gluetun"]="VPN Tunnel|-|torrents"
        services["qbittorrent"]="qBittorrent|-|torrents"
    fi
    
    if [ "$WITH_GAMESTREAM" = true ]; then
        services["sunshine"]="Sunshine|-|gamestream"
    fi
    
    if [ "$WITH_MONITORING" = true ]; then
        services["smartctl-exporter"]="SMART Exporter|http://localhost:9633/|monitoring"
    fi
    
    for container in "${!services[@]}"; do
        IFS='|' read -r name check_url profile <<< "${services[$container]}"
        
        local status
        local container_status
        container_status=$(get_container_health "$container" 2>/dev/null)
        
        if [ "$container_status" = "healthy" ] || [ "$container_status" = "running" ]; then
            if [ "$check_url" = "-" ] || [ -z "$check_url" ]; then
                status="healthy"
            elif curl -sf --connect-timeout 2 "$check_url" > /dev/null 2>&1; then
                status="healthy"
            else
                status="starting"
            fi
        elif [ "$container_status" = "starting" ]; then
            status="starting"
        elif [ -n "$container_status" ] && [ "$container_status" != "unknown" ]; then
            status="$container_status"
        else
            status="not running"
        fi
        
        local public_url=""
        case "$container" in
            plex) public_url="https://plex.$domain" ;;
            jellyfin) public_url="https://jellyfin.$domain" ;;
            homeassistant) public_url="https://home.$domain" ;;
            authelia) public_url="https://auth.$domain" ;;
            homelab-minio) public_url="https://storage.$domain" ;;
            caddy-local) public_url="(reverse proxy)" ;;
            authelia-redis|dashboard-redis|dashboard-postgres) public_url="(internal)" ;;
            homelab-dashboard) public_url="https://dashboard.$domain" ;;
            novnc) public_url="https://vnc.$domain" ;;
            ttyd) public_url="https://ssh.$domain" ;;
            qbittorrent) public_url="https://torrent.$domain" ;;
            gluetun) public_url="(VPN tunnel)" ;;
            sunshine) public_url="https://gamestream.$domain" ;;
            smartctl-exporter) public_url="(internal metrics)" ;;
            *) public_url="https://${container}.$domain" ;;
        esac
        
        print_health_table_row "$name" "$status" "$public_url" "$profile"
    done
    
    echo "  └────────────────────┴──────────────┴─────────────────────────────────────┴────────────┘"
    
    local healthy_count=0
    local total_count=0
    for container in "${!services[@]}"; do
        total_count=$((total_count + 1))
        local status
        status=$(get_container_health "$container" 2>/dev/null)
        if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then
            healthy_count=$((healthy_count + 1))
        fi
    done
    
    echo ""
    if [ "$healthy_count" -eq "$total_count" ]; then
        echo -e "  ${GREEN}✓ All $total_count services healthy${NC}"
    elif [ "$healthy_count" -gt 0 ]; then
        echo -e "  ${YELLOW}◐ $healthy_count/$total_count services healthy (some still starting)${NC}"
    else
        echo -e "  ${RED}○ Services may still be starting...${NC}"
    fi
    
    echo ""
    echo -e "${GREEN}═══ Local Deployment Complete ═══${NC}"
    echo ""
    echo "Public URLs (after DNS propagation):"
    echo "  Dashboard:      https://dashboard.$domain"
    echo "  Plex:           https://plex.$domain"
    echo "  Jellyfin:       https://jellyfin.$domain"
    echo "  Home Assistant: https://home.$domain"
    echo "  Auth Portal:    https://auth.$domain"
    echo ""
    echo "Protected URLs (require Authelia login):"
    echo "  Storage:        https://storage.$domain"
    [ "$WITH_TORRENTS" = true ] && echo "  Torrents:       https://torrent.$domain"
    [ "$WITH_GAMESTREAM" = true ] && echo "  Game Stream:    https://gamestream.$domain"
    echo "  VNC Desktop:    https://vnc.$domain"
    echo "  SSH Terminal:   https://ssh.$domain"
    echo "  VM Manager:     https://vms.$domain"
    [ "$WITH_MONITORING" = true ] && echo "  Grafana:        https://grafana.$domain"
    echo ""
    echo "Commands:"
    echo "  Logs:       docker compose logs -f [service]"
    echo "  Status:     docker compose ps"
    echo "  Restart:    docker compose restart [service]"
    echo "  Port Check: ./deploy.sh port-check"
    echo "  DNS Check:  ./deploy.sh dns-check"
    echo "  Auto-start: ./deploy.sh install"
}

do_install_systemd() {
    echo -e "${CYAN}═══ Installing Systemd Service ═══${NC}"
    
    local service_file="$SCRIPT_DIR/nebula-stack.service"
    local target_path="/etc/systemd/system/nebula-stack.service"
    
    if [ ! -f "$service_file" ]; then
        echo -e "${RED}[ERROR]${NC} nebula-stack.service not found"
        exit 1
    fi
    
    echo "Installing systemd service..."
    sudo cp "$service_file" "$target_path"
    sudo systemctl daemon-reload
    sudo systemctl enable nebula-stack.service
    
    echo -e "${GREEN}✓ Systemd service installed${NC}"
    echo ""
    echo "The stack will now automatically start on boot!"
    echo ""
    echo "Commands:"
    echo "  Start:   sudo systemctl start nebula-stack"
    echo "  Stop:    sudo systemctl stop nebula-stack"
    echo "  Status:  sudo systemctl status nebula-stack"
    echo "  Logs:    sudo journalctl -u nebula-stack -f"
}

do_uninstall_systemd() {
    echo -e "${CYAN}═══ Removing Systemd Service ═══${NC}"
    
    sudo systemctl stop nebula-stack.service 2>/dev/null || true
    sudo systemctl disable nebula-stack.service 2>/dev/null || true
    sudo rm -f /etc/systemd/system/nebula-stack.service
    sudo systemctl daemon-reload
    
    echo -e "${GREEN}✓ Systemd service removed${NC}"
}

do_authelia_hash() {
    echo -e "${CYAN}═══ Generate Authelia Password Hash ═══${NC}"
    echo ""
    echo "Enter the password to hash:"
    read -rs password
    echo ""
    
    docker run --rm authelia/authelia:latest authelia crypto hash generate argon2 --password "$password"
    echo ""
    echo "Copy the hash above into services/authelia/users_database.yml"
}

case "${1:-}" in
    help|--help|-h)
        show_help
        ;;
    setup)
        echo -e "${CYAN}═══ Nebula Command - Environment Setup ═══${NC}"
        interactive_setup ".env"
        ;;
    check)
        env_doctor ".env" "check"
        check_nas
        ;;
    port-check)
        set -a
        source .env 2>/dev/null || true
        set +a
        check_port_forwarding
        ;;
    dns-check)
        set -a
        source .env 2>/dev/null || true
        set +a
        validate_dns
        ;;
    up)
        echo -e "${CYAN}═══ Nebula Command - Start Services ═══${NC}"
        do_deploy
        ;;
    down)
        echo -e "${CYAN}═══ Nebula Command - Stop Services ═══${NC}"
        docker compose $PROFILES down
        echo -e "${GREEN}✓ Services stopped${NC}"
        ;;
    logs)
        docker compose logs -f "${2:-}"
        ;;
    deploy-logs)
        log_dir="$SCRIPT_DIR/logs"
        if [ -d "$log_dir" ] && [ "$(ls -A "$log_dir" 2>/dev/null)" ]; then
            echo -e "${CYAN}═══ Deploy Logs ═══${NC}"
            ls -lt "$log_dir"/*.log 2>/dev/null | head -10
            echo ""
            latest=$(ls -t "$log_dir"/*.log 2>/dev/null | head -1)
            if [ -n "$latest" ]; then
                echo "Latest log: $latest"
                echo ""
                read -r -p "View latest log? (Y/n) " view_log
                if [[ ! "$view_log" =~ ^[Nn]$ ]]; then
                    less "$latest"
                fi
            fi
        else
            echo "No deploy logs found. Logs are saved when deploys fail."
            echo "To keep logs on success: KEEP_BUILD_LOGS=true ./deploy.sh"
        fi
        ;;
    nas)
        echo -e "${CYAN}═══ Nebula Command - Mount NAS ═══${NC}"
        sudo ./scripts/setup-nas-mounts.sh
        ;;
    dns-sync)
        set -a
        source .env 2>/dev/null || true
        set +a
        do_dns_sync
        ;;
    install)
        do_install_systemd
        ;;
    uninstall)
        do_uninstall_systemd
        ;;
    authelia)
        do_authelia_hash
        ;;
    *)
        echo -e "${CYAN}═══ Nebula Command - Local Ubuntu Deployment ═══${NC}"
        echo "Directory: $SCRIPT_DIR"
        echo ""
        
        set -a
        source .env 2>/dev/null || true
        set +a
        
        do_git_pull
        do_env_setup
        
        set -a
        source .env 2>/dev/null || true
        set +a
        
        check_nas
        do_dns_sync
        do_deploy
        do_post_deploy
        ;;
esac
