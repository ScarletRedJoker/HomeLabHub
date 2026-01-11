#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_DIR="$(dirname "$SCRIPT_DIR")/shared"

source "$SHARED_DIR/env-lib.sh"
source "$SHARED_DIR/lib.sh"

cd "$SCRIPT_DIR"

VERBOSE=false
SKIP_PREFLIGHT=false
WITH_TORRENTS=false
WITH_GAMESTREAM=false
WITH_MONITORING=false
POSITIONAL_ARGS=()

while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--verbose) VERBOSE=true; shift ;;
        --skip-preflight) SKIP_PREFLIGHT=true; shift ;;
        --with-torrents) WITH_TORRENTS=true; shift ;;
        --with-gamestream) WITH_GAMESTREAM=true; shift ;;
        --with-monitoring) WITH_MONITORING=true; shift ;;
        -*) echo "Unknown option: $1"; shift ;;
        *) POSITIONAL_ARGS+=("$1"); shift ;;
    esac
done

set -- "${POSITIONAL_ARGS[@]+"${POSITIONAL_ARGS[@]}"}"

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
    echo "  -v, --verbose       Show full output"
    echo "  --skip-preflight    Skip host prerequisite checks"
    echo "  --with-torrents     Enable torrent profile (qBittorrent, etc)"
    echo "  --with-gamestream   Enable gamestream profile (Sunshine, etc)"
    echo "  --with-monitoring   Enable monitoring profile (Prometheus, Grafana, etc)"
    echo ""
    echo "Commands:"
    echo "  (none)       Full deployment (preflight + setup + deploy)"
    echo "  setup        Interactive environment setup only"
    echo "  check        Check environment and service health"
    echo "  preflight    Run host prerequisite checks only"
    echo "  up           Start services only"
    echo "  down         Stop services"
    echo "  restart      Restart all services"
    echo "  verify       Extended health checks with retries (up to 60s)"
    echo "  doctor       Check all required secrets and configuration"
    echo "  test         Run smoke tests for all services"
    echo "  monitor      Start health monitoring daemon with alerts"
    echo "  logs         View service logs (docker compose logs)"
    echo "  status       Show service status"
    echo "  deploy-logs  View saved deploy logs"
    echo "  nas          Mount NAS storage"
    echo "  dns-sync     Sync Cloudflare DNS records"
    echo "  port-check   Check if ports are accessible from outside"
    echo "  dns-check    Validate DNS records resolve correctly"
    echo "  install      Install systemd service for auto-start on boot"
    echo "  uninstall    Remove systemd service"
    echo "  authelia     Generate Authelia password hash"
    echo "  prune        Clean up Docker resources"
    echo "  help         Show this help"
    echo ""
    echo "Environment Variables:"
    echo "  KEEP_BUILD_LOGS=true  Keep deploy logs even on success"
    echo "  VERBOSE=true          Same as -v flag"
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

do_preflight() {
    echo -e "${CYAN}[0/5] Preflight checks...${NC}"
    
    if [ "$SKIP_PREFLIGHT" = true ]; then
        echo -e "${YELLOW}[SKIP]${NC} Preflight checks skipped (--skip-preflight)"
        echo ""
        return 0
    fi
    
    if ! preflight_host; then
        echo ""
        echo -e "${RED}Preflight failed. Fix issues above or use --skip-preflight to bypass.${NC}"
        exit 1
    fi
    echo ""
}

do_git_pull() {
    echo -e "${CYAN}[1/5] Pulling latest code...${NC}"
    local repo_root
    repo_root="$(dirname "$(dirname "$SCRIPT_DIR")")"
    cd "$repo_root"
    
    local secret_files=(
        "deploy/local/services/authelia/configuration.yml"
        "deploy/local/services/authelia/users_database.yml"
        "deploy/linode/services/authelia/configuration.yml"
        "deploy/linode/services/authelia/users_database.yml"
    )
    
    local stashed=false
    local has_local_changes=false
    
    for f in "${secret_files[@]}"; do
        if [ -f "$f" ] && ! git diff --quiet "$f" 2>/dev/null; then
            has_local_changes=true
            break
        fi
    done
    
    if [ "$has_local_changes" = true ]; then
        [ "$VERBOSE" = true ] && echo "  Stashing local secret files..."
        git stash push -m "deploy-local-secrets-$(date +%s)" -- "${secret_files[@]}" > /dev/null 2>&1 && stashed=true || true
    fi
    
    local pull_success=false
    if [ "$VERBOSE" = true ]; then
        if git pull origin main; then
            pull_success=true
        fi
    else
        echo -n "  Fetching updates... "
        if git pull origin main > /dev/null 2>&1; then
            echo -e "${GREEN}done${NC}"
            pull_success=true
        else
            echo -e "${YELLOW}check manually${NC}"
        fi
    fi
    
    if [ "$stashed" = true ]; then
        [ "$VERBOSE" = true ] && echo "  Restoring local secret files..."
        git stash pop > /dev/null 2>&1 || true
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
    
    local users_db="$SCRIPT_DIR/services/authelia/users_database.yml"
    if [ ! -f "$users_db" ]; then
        echo -e "${YELLOW}[SETUP]${NC} Creating Authelia users database..."
        local temp_password=$(openssl rand -base64 16 | tr -d '/+=' | head -c 16)
        local password_hash=$(docker run --rm authelia/authelia:latest authelia crypto hash generate argon2 --password "$temp_password" 2>/dev/null | grep -E '^\$argon2')
        
        if [ -n "$password_hash" ]; then
            cat > "$users_db" << EOF
# Authelia Users Database - Auto-generated by Nebula Command
# Generated: $(date)

users:
  admin:
    displayname: "Admin"
    password: "$password_hash"
    email: ${ADMIN_EMAIL:-admin@${DOMAIN:-example.com}}
    groups:
      - admins
      - trusted
EOF
            echo -e "${GREEN}[OK]${NC} Created Authelia users database"
            echo ""
            echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
            echo -e "${YELLOW}  AUTHELIA ADMIN CREDENTIALS (SAVE THESE!)${NC}"
            echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
            echo -e "  Username: ${GREEN}admin${NC}"
            echo -e "  Password: ${GREEN}$temp_password${NC}"
            echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
            echo ""
            echo -e "  Change password: ./deploy.sh authelia"
            echo ""
        else
            echo -e "${YELLOW}[WARN]${NC} Could not generate password hash (Docker not available?)"
            echo "       Copy users_database.yml.example and set password manually"
        fi
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
    
    export LOCAL_UID=$(id -u)
    export LOCAL_GID=$(id -g)
    
    if [ -n "$PROFILES" ]; then
        echo -e "  Active profiles: ${GREEN}${PROFILES}${NC}"
    fi
    
    init_logging "deploy"
    
    mkdir -p /srv/media/community 2>/dev/null || sudo mkdir -p /srv/media/community
    sudo chown 1000:1000 /srv/media/community 2>/dev/null || true
    
    if ! safe_docker_deploy "docker-compose.yml" "$DEPLOY_LOG" "$PROFILES"; then
        exit 1
    fi
    
    if [ "${KEEP_BUILD_LOGS:-}" != "true" ]; then
        rm -f "$DEPLOY_LOG" 2>/dev/null || true
    fi
    
    cleanup_old_logs "$LOG_DIR" 10
    echo ""
}

do_post_deploy() {
    echo -e "${CYAN}[5/5] Health checks...${NC}"
    
    post_deploy_wait 15
    
    register_local_ai_services
    
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
    
    wait_for_services_with_retry "local" 6 10
    
    health_report "local"
    
    show_deployment_summary "local"
}

do_verify() {
    echo -e "${CYAN}═══ Nebula Command - Extended Health Verification ═══${NC}"
    echo "Running extended health checks with retry..."
    wait_for_services_with_retry "local" 12 5
    echo ""
    health_report "local"
}

do_status() {
    echo -e "${CYAN}═══ Nebula Command - Service Status ═══${NC}"
    echo ""
    echo -e "${CYAN}━━━ Docker Containers ━━━${NC}"
    docker compose $PROFILES ps 2>/dev/null || docker compose ps
    echo ""
    health_report "local"
}

install_systemd() {
    echo -e "${CYAN}═══ Installing Systemd Service ═══${NC}"
    
    local service_file="/etc/systemd/system/nebula-homelab.service"
    
    sudo tee "$service_file" > /dev/null << EOF
[Unit]
Description=Nebula Command Homelab Services
After=docker.service network-online.target
Requires=docker.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$SCRIPT_DIR
ExecStart=/usr/bin/docker compose $PROFILES up -d
ExecStop=/usr/bin/docker compose $PROFILES down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF
    
    sudo systemctl daemon-reload
    sudo systemctl enable nebula-homelab.service
    
    echo -e "${GREEN}✓ Systemd service installed and enabled${NC}"
    echo ""
    echo "Commands:"
    echo "  Start:   sudo systemctl start nebula-homelab"
    echo "  Stop:    sudo systemctl stop nebula-homelab"
    echo "  Status:  sudo systemctl status nebula-homelab"
    echo "  Disable: sudo systemctl disable nebula-homelab"
}

uninstall_systemd() {
    echo -e "${CYAN}═══ Removing Systemd Service ═══${NC}"
    
    sudo systemctl stop nebula-homelab.service 2>/dev/null || true
    sudo systemctl disable nebula-homelab.service 2>/dev/null || true
    sudo rm -f /etc/systemd/system/nebula-homelab.service
    sudo systemctl daemon-reload
    
    echo -e "${GREEN}✓ Systemd service removed${NC}"
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
        do_status
        ;;
    preflight)
        echo -e "${CYAN}═══ Nebula Command - Preflight Checks ═══${NC}"
        preflight_host
        ;;
    up)
        echo -e "${CYAN}═══ Nebula Command - Start Services ═══${NC}"
        do_deploy
        post_deploy_wait 15
        health_report "local"
        ;;
    down)
        echo -e "${CYAN}═══ Nebula Command - Stop Services ═══${NC}"
        docker compose $PROFILES down
        echo -e "${GREEN}✓ Services stopped${NC}"
        ;;
    restart)
        echo -e "${CYAN}═══ Nebula Command - Restart Services ═══${NC}"
        docker compose $PROFILES restart
        post_deploy_wait 10
        health_report "local"
        ;;
    status)
        do_status
        ;;
    logs)
        docker compose $PROFILES logs -f "${2:-}"
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
            echo "No logs found. Logs are saved when deploys fail."
            echo "To keep logs on success: KEEP_BUILD_LOGS=true ./deploy.sh"
        fi
        ;;
    nas)
        echo -e "${CYAN}═══ Nebula Command - NAS Mount ═══${NC}"
        check_nas
        ;;
    dns-sync)
        echo -e "${CYAN}═══ Nebula Command - DNS Sync ═══${NC}"
        source ".env" 2>/dev/null || true
        do_dns_sync
        ;;
    port-check)
        echo -e "${CYAN}═══ Nebula Command - Port Check ═══${NC}"
        check_port_forwarding
        ;;
    dns-check)
        echo -e "${CYAN}═══ Nebula Command - DNS Validation ═══${NC}"
        source ".env" 2>/dev/null || true
        validate_dns
        ;;
    install)
        install_systemd
        ;;
    uninstall)
        uninstall_systemd
        ;;
    authelia)
        echo -e "${CYAN}═══ Nebula Command - Authelia Password Hash ═══${NC}"
        read -r -s -p "Enter password to hash: " password
        echo ""
        docker run --rm authelia/authelia:latest authelia crypto hash generate argon2 --password "$password"
        ;;
    verify)
        do_verify
        ;;
    doctor)
        echo -e "${CYAN}═══ Nebula Command - Secrets Doctor ═══${NC}"
        source ".env" 2>/dev/null || true
        env_doctor ".env" "check" "local"
        ;;
    test)
        source "../shared/smoke-tests.sh"
        run_local_tests
        print_summary
        ;;
    monitor)
        source "../shared/health-monitor.sh"
        run_daemon "local"
        ;;
    prune)
        echo -e "${CYAN}═══ Nebula Command - Cleanup ═══${NC}"
        echo "This will remove unused Docker resources."
        read -r -p "Continue? (y/N) " confirm
        if [[ "$confirm" =~ ^[Yy]$ ]]; then
            docker system prune -f
            docker image prune -f
            echo -e "${GREEN}✓ Cleanup complete${NC}"
        fi
        ;;
    *)
        echo -e "${CYAN}═══ Nebula Command - Local Ubuntu Deployment ═══${NC}"
        echo "Directory: $SCRIPT_DIR"
        echo ""
        
        source ".env" 2>/dev/null || true
        
        do_preflight
        do_git_pull
        do_env_setup
        check_nas
        do_dns_sync
        do_deploy
        do_post_deploy
        ;;
esac
