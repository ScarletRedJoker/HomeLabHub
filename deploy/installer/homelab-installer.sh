#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║                    HOMELAB HUB - INTERACTIVE TUI INSTALLER                   ║
# ║                      For Headless Linux Servers (Linode)                     ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
#
# A creative, terminal-based installer that works without GUI dependencies.
# Features:
#   - ASCII art interface with color themes
#   - Interactive keyboard navigation
#   - Service selection with checkboxes
#   - Environment configuration wizard
#   - Progress bars and spinners
#   - Live health monitoring dashboard
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/user/HomeLabHub/main/deploy/installer/homelab-installer.sh | bash
#   OR
#   ./deploy/installer/homelab-installer.sh
#
# Requirements:
#   - Bash 4.0+
#   - curl, git
#   - Root access (for Docker, firewall setup)

set -euo pipefail

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════
VERSION="1.0.0"
INSTALL_DIR="${HOMELAB_INSTALL_DIR:-/opt/homelab}"
REPO_URL="${HOMELAB_REPO_URL:-https://github.com/ScarletRedJoker/HomeLabHub.git}"
LOG_FILE="/var/log/homelab-installer.log"
TEMP_DIR=""

# Terminal dimensions
TERM_WIDTH=$(tput cols 2>/dev/null || echo 80)
TERM_HEIGHT=$(tput lines 2>/dev/null || echo 24)

# ══════════════════════════════════════════════════════════════════════════════
# COLOR THEME - Cyberpunk/Terminal Aesthetic
# ══════════════════════════════════════════════════════════════════════════════
if [[ -t 1 ]]; then
    # Primary colors
    C_RESET='\033[0m'
    C_BOLD='\033[1m'
    C_DIM='\033[2m'
    C_BLINK='\033[5m'
    C_REVERSE='\033[7m'
    
    # Foreground
    C_BLACK='\033[30m'
    C_RED='\033[31m'
    C_GREEN='\033[32m'
    C_YELLOW='\033[33m'
    C_BLUE='\033[34m'
    C_MAGENTA='\033[35m'
    C_CYAN='\033[36m'
    C_WHITE='\033[37m'
    
    # Bright foreground
    C_BRED='\033[91m'
    C_BGREEN='\033[92m'
    C_BYELLOW='\033[93m'
    C_BBLUE='\033[94m'
    C_BMAGENTA='\033[95m'
    C_BCYAN='\033[96m'
    C_BWHITE='\033[97m'
    
    # Background
    BG_BLACK='\033[40m'
    BG_RED='\033[41m'
    BG_GREEN='\033[42m'
    BG_BLUE='\033[44m'
    BG_CYAN='\033[46m'
else
    # No color support
    C_RESET='' C_BOLD='' C_DIM='' C_BLINK='' C_REVERSE=''
    C_BLACK='' C_RED='' C_GREEN='' C_YELLOW='' C_BLUE=''
    C_MAGENTA='' C_CYAN='' C_WHITE=''
    C_BRED='' C_BGREEN='' C_BYELLOW='' C_BBLUE=''
    C_BMAGENTA='' C_BCYAN='' C_BWHITE=''
    BG_BLACK='' BG_RED='' BG_GREEN='' BG_BLUE='' BG_CYAN=''
fi

# Theme shortcuts
TH_HEADER="${C_BOLD}${C_BCYAN}"
TH_ACCENT="${C_BMAGENTA}"
TH_SUCCESS="${C_BGREEN}"
TH_WARNING="${C_BYELLOW}"
TH_ERROR="${C_BRED}"
TH_INFO="${C_BCYAN}"
TH_DIM="${C_DIM}${C_WHITE}"
TH_HIGHLIGHT="${C_BOLD}${C_BWHITE}"

# ══════════════════════════════════════════════════════════════════════════════
# UTILITIES
# ══════════════════════════════════════════════════════════════════════════════

cleanup() {
    tput cnorm 2>/dev/null || true  # Show cursor
    stty echo 2>/dev/null || true    # Enable echo
    [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]] && rm -rf "$TEMP_DIR"
}

trap cleanup EXIT

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

die() {
    echo -e "${TH_ERROR}ERROR: $*${C_RESET}" >&2
    log "ERROR: $*"
    exit 1
}

center_text() {
    local text="$1"
    local width="${2:-$TERM_WIDTH}"
    local text_len=${#text}
    local padding=$(( (width - text_len) / 2 ))
    printf "%*s%s" "$padding" "" "$text"
}

repeat_char() {
    local char="$1"
    local count="$2"
    printf '%*s' "$count" '' | tr ' ' "$char"
}

# ══════════════════════════════════════════════════════════════════════════════
# ASCII ART & BANNERS
# ══════════════════════════════════════════════════════════════════════════════

show_logo() {
    clear
    echo -e "${TH_HEADER}"
    cat << 'EOF'

    ╦ ╦┌─┐┌┬┐┌─┐╦  ┌─┐┌┐    ╦ ╦┬ ┬┌┐ 
    ╠═╣│ ││││├┤ ║  ├─┤├┴┐   ╠═╣│ │├┴┐
    ╩ ╩└─┘┴ ┴└─┘╩═╝┴ ┴└─┘   ╩ ╩└─┘└─┘

EOF
    echo -e "${TH_ACCENT}"
    center_text "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo -e "${TH_DIM}"
    center_text "Interactive Cloud Infrastructure Installer v${VERSION}"
    echo ""
    center_text "For Linode & Headless Linux Servers"
    echo -e "${C_RESET}"
    echo ""
}

show_section_header() {
    local title="$1"
    local width=$((TERM_WIDTH - 4))
    echo ""
    echo -e "${TH_ACCENT}┌$(repeat_char '─' $((width + 2)))┐${C_RESET}"
    echo -e "${TH_ACCENT}│${C_RESET} ${TH_HEADER}${title}$(printf '%*s' $((width - ${#title})) '')${TH_ACCENT}│${C_RESET}"
    echo -e "${TH_ACCENT}└$(repeat_char '─' $((width + 2)))┘${C_RESET}"
}

# ══════════════════════════════════════════════════════════════════════════════
# SPINNERS & PROGRESS
# ══════════════════════════════════════════════════════════════════════════════

declare -a SPINNER_FRAMES=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
SPINNER_PID=""

start_spinner() {
    local message="$1"
    tput civis  # Hide cursor
    (
        local i=0
        while true; do
            printf "\r${TH_INFO}${SPINNER_FRAMES[$i]}${C_RESET} %s " "$message"
            i=$(( (i + 1) % ${#SPINNER_FRAMES[@]} ))
            sleep 0.1
        done
    ) &
    SPINNER_PID=$!
}

stop_spinner() {
    local status="${1:-success}"
    local message="${2:-}"
    
    [[ -n "$SPINNER_PID" ]] && kill "$SPINNER_PID" 2>/dev/null && wait "$SPINNER_PID" 2>/dev/null || true
    SPINNER_PID=""
    
    printf "\r"
    if [[ "$status" == "success" ]]; then
        echo -e "${TH_SUCCESS}✔${C_RESET} ${message:-Done}"
    elif [[ "$status" == "warning" ]]; then
        echo -e "${TH_WARNING}⚠${C_RESET} ${message:-Warning}"
    else
        echo -e "${TH_ERROR}✖${C_RESET} ${message:-Failed}"
    fi
    tput cnorm  # Show cursor
}

progress_bar() {
    local current="$1"
    local total="$2"
    local width="${3:-40}"
    local label="${4:-}"
    
    local percent=$(( current * 100 / total ))
    local filled=$(( current * width / total ))
    local empty=$(( width - filled ))
    
    printf "\r${TH_DIM}%s${C_RESET} [${TH_SUCCESS}" "$label"
    repeat_char '█' "$filled"
    printf "${TH_DIM}"
    repeat_char '░' "$empty"
    printf "${C_RESET}] ${TH_HIGHLIGHT}%3d%%${C_RESET}" "$percent"
}

# ══════════════════════════════════════════════════════════════════════════════
# INTERACTIVE MENUS
# ══════════════════════════════════════════════════════════════════════════════

# Service definitions
declare -A SERVICES
SERVICES=(
    ["caddy"]="Caddy Web Server|Automatic HTTPS reverse proxy|core"
    ["postgres"]="PostgreSQL 16|Database for all services|core"
    ["redis"]="Redis|Caching and message broker|core"
    ["dashboard"]="HomeLabHub Dashboard|Main control panel with Jarvis AI|core"
    ["celery"]="Celery Worker|Background task processing|core"
    ["discord-bot"]="Discord Bot|Ticket system and server management|optional"
    ["stream-bot"]="Stream Bot|Twitch/YouTube integration|optional"
    ["n8n"]="N8N|Workflow automation platform|optional"
    ["code-server"]="Code Server|VS Code in browser|optional"
    ["grafana"]="Grafana|Metrics and dashboards|monitoring"
    ["prometheus"]="Prometheus|Metrics collection|monitoring"
    ["loki"]="Loki|Log aggregation|monitoring"
)

declare -A SERVICE_SELECTED
declare -a SERVICE_ORDER=("caddy" "postgres" "redis" "dashboard" "celery" "discord-bot" "stream-bot" "n8n" "code-server" "grafana" "prometheus" "loki")

init_service_selection() {
    for key in "${SERVICE_ORDER[@]}"; do
        local info="${SERVICES[$key]}"
        local category="${info##*|}"
        if [[ "$category" == "core" ]]; then
            SERVICE_SELECTED["$key"]=1
        else
            SERVICE_SELECTED["$key"]=0
        fi
    done
}

show_service_menu() {
    local selected=0
    local total=${#SERVICE_ORDER[@]}
    
    init_service_selection
    
    while true; do
        clear
        show_logo
        show_section_header "SELECT SERVICES TO INSTALL"
        echo ""
        echo -e "${TH_DIM}  Use ↑/↓ to navigate, SPACE to toggle, ENTER to confirm${C_RESET}"
        echo -e "${TH_DIM}  Core services are required and pre-selected${C_RESET}"
        echo ""
        
        for i in "${!SERVICE_ORDER[@]}"; do
            local key="${SERVICE_ORDER[$i]}"
            local info="${SERVICES[$key]}"
            local name="${info%%|*}"
            local rest="${info#*|}"
            local desc="${rest%%|*}"
            local category="${rest##*|}"
            
            local checkbox=""
            if [[ "${SERVICE_SELECTED[$key]}" == "1" ]]; then
                checkbox="${TH_SUCCESS}[✔]${C_RESET}"
            else
                checkbox="${TH_DIM}[ ]${C_RESET}"
            fi
            
            local prefix="  "
            if [[ $i -eq $selected ]]; then
                prefix="${TH_ACCENT}▶ ${C_RESET}"
            fi
            
            local cat_badge=""
            case "$category" in
                core) cat_badge="${BG_BLUE}${C_BWHITE} CORE ${C_RESET}" ;;
                optional) cat_badge="${BG_GREEN}${C_BLACK} OPT ${C_RESET}" ;;
                monitoring) cat_badge="${BG_CYAN}${C_BLACK} MON ${C_RESET}" ;;
            esac
            
            if [[ $i -eq $selected ]]; then
                echo -e "${prefix}${checkbox} ${TH_HIGHLIGHT}${name}${C_RESET} ${cat_badge}"
                echo -e "      ${TH_DIM}${desc}${C_RESET}"
            else
                echo -e "${prefix}${checkbox} ${name} ${cat_badge}"
            fi
        done
        
        echo ""
        echo -e "${TH_DIM}────────────────────────────────────────────────${C_RESET}"
        echo -e "  ${TH_INFO}[A]${C_RESET} Select All  ${TH_INFO}[N]${C_RESET} Select None  ${TH_INFO}[D]${C_RESET} Defaults  ${TH_INFO}[Q]${C_RESET} Quit"
        echo ""
        
        # Read key - handle escape sequences for arrow keys
        read -rsn1 key
        
        # Check if it's an escape sequence (arrow keys)
        if [[ "$key" == $'\x1b' ]]; then
            read -rsn2 -t 0.1 key2 || true
            case "$key2" in
                "[A") # Up arrow
                    ((selected--))
                    [[ $selected -lt 0 ]] && selected=$((total - 1))
                    ;;
                "[B") # Down arrow
                    ((selected++))
                    [[ $selected -ge $total ]] && selected=0
                    ;;
            esac
            continue
        fi
        
        case "$key" in
            " ") # Space - toggle
                local key="${SERVICE_ORDER[$selected]}"
                local info="${SERVICES[$key]}"
                local category="${info##*|}"
                if [[ "$category" != "core" ]]; then
                    if [[ "${SERVICE_SELECTED[$key]}" == "1" ]]; then
                        SERVICE_SELECTED["$key"]=0
                    else
                        SERVICE_SELECTED["$key"]=1
                    fi
                fi
                ;;
            "") # Enter - confirm
                break
                ;;
            a|A) # Select all
                for k in "${SERVICE_ORDER[@]}"; do
                    SERVICE_SELECTED["$k"]=1
                done
                ;;
            n|N) # Select none (except core)
                for k in "${SERVICE_ORDER[@]}"; do
                    local info="${SERVICES[$k]}"
                    local category="${info##*|}"
                    if [[ "$category" == "core" ]]; then
                        SERVICE_SELECTED["$k"]=1
                    else
                        SERVICE_SELECTED["$k"]=0
                    fi
                done
                ;;
            d|D) # Defaults
                init_service_selection
                ;;
            q|Q) # Quit
                echo ""
                echo -e "${TH_WARNING}Installation cancelled${C_RESET}"
                exit 0
                ;;
        esac
    done
}

# ══════════════════════════════════════════════════════════════════════════════
# ENVIRONMENT CONFIGURATION WIZARD
# ══════════════════════════════════════════════════════════════════════════════

declare -A ENV_VALUES

read_input() {
    local prompt="$1"
    local var_name="$2"
    local default="${3:-}"
    local is_secret="${4:-false}"
    local value=""
    
    echo -ne "${TH_INFO}?${C_RESET} ${prompt}"
    if [[ -n "$default" && "$is_secret" != "true" ]]; then
        echo -ne " ${TH_DIM}[$default]${C_RESET}"
    fi
    echo -ne ": "
    
    if [[ "$is_secret" == "true" ]]; then
        read -rs value
        echo ""
    else
        read -r value
    fi
    
    [[ -z "$value" && -n "$default" ]] && value="$default"
    ENV_VALUES["$var_name"]="$value"
}

generate_secret() {
    openssl rand -base64 32 | tr -d '/+=' | head -c 32
}

generate_hex() {
    openssl rand -hex 32
}

show_config_wizard() {
    clear
    show_logo
    show_section_header "ENVIRONMENT CONFIGURATION"
    echo ""
    echo -e "${TH_INFO}Let's configure your HomeLabHub installation.${C_RESET}"
    echo -e "${TH_DIM}Press ENTER to accept defaults (shown in brackets).${C_RESET}"
    echo -e "${TH_DIM}Secrets will be auto-generated if left empty.${C_RESET}"
    echo ""
    
    # Database passwords (auto-generate)
    echo -e "\n${TH_ACCENT}── Database Configuration ──${C_RESET}"
    ENV_VALUES["POSTGRES_PASSWORD"]=$(generate_secret)
    ENV_VALUES["JARVIS_DB_PASSWORD"]=$(generate_secret)
    ENV_VALUES["DISCORD_DB_PASSWORD"]=$(generate_secret)
    ENV_VALUES["STREAMBOT_DB_PASSWORD"]=$(generate_secret)
    echo -e "${TH_SUCCESS}✔${C_RESET} Database passwords auto-generated"
    
    # Session secrets (auto-generate)
    ENV_VALUES["SESSION_SECRET"]=$(generate_hex)
    ENV_VALUES["SECRET_KEY"]=$(generate_hex)
    ENV_VALUES["DISCORD_SESSION_SECRET"]=$(generate_hex)
    ENV_VALUES["STREAMBOT_SESSION_SECRET"]=$(generate_hex)
    ENV_VALUES["SERVICE_AUTH_TOKEN"]=$(generate_hex)
    echo -e "${TH_SUCCESS}✔${C_RESET} Session secrets auto-generated"
    
    # User credentials
    echo -e "\n${TH_ACCENT}── Admin Credentials ──${C_RESET}"
    read_input "Dashboard admin username" "WEB_USERNAME" "admin"
    read_input "Dashboard admin password" "WEB_PASSWORD" "" true
    [[ -z "${ENV_VALUES[WEB_PASSWORD]}" ]] && ENV_VALUES["WEB_PASSWORD"]=$(generate_secret)
    
    read_input "Code Server password" "CODE_SERVER_PASSWORD" "" true
    [[ -z "${ENV_VALUES[CODE_SERVER_PASSWORD]}" ]] && ENV_VALUES["CODE_SERVER_PASSWORD"]=$(generate_secret)
    
    read_input "N8N admin username" "N8N_BASIC_AUTH_USER" "admin"
    read_input "N8N admin password" "N8N_BASIC_AUTH_PASSWORD" "" true
    [[ -z "${ENV_VALUES[N8N_BASIC_AUTH_PASSWORD]}" ]] && ENV_VALUES["N8N_BASIC_AUTH_PASSWORD"]=$(generate_secret)
    
    # API Keys
    echo -e "\n${TH_ACCENT}── API Keys (required for full functionality) ──${C_RESET}"
    echo -e "${TH_DIM}Get your OpenAI key from: https://platform.openai.com/api-keys${C_RESET}"
    read_input "OpenAI API Key" "OPENAI_API_KEY" "" true
    
    if [[ "${SERVICE_SELECTED[discord-bot]}" == "1" ]]; then
        echo -e "\n${TH_DIM}Get Discord credentials from: https://discord.com/developers/applications${C_RESET}"
        read_input "Discord Bot Token" "DISCORD_BOT_TOKEN" "" true
        read_input "Discord Client ID" "DISCORD_CLIENT_ID"
        read_input "Discord Client Secret" "DISCORD_CLIENT_SECRET" "" true
        ENV_VALUES["DISCORD_APP_ID"]="${ENV_VALUES[DISCORD_CLIENT_ID]}"
        ENV_VALUES["VITE_DISCORD_CLIENT_ID"]="${ENV_VALUES[DISCORD_CLIENT_ID]}"
    fi
    
    if [[ "${SERVICE_SELECTED[stream-bot]}" == "1" || "${SERVICE_SELECTED[discord-bot]}" == "1" ]]; then
        echo -e "\n${TH_DIM}Get Twitch credentials from: https://dev.twitch.tv/console/apps${C_RESET}"
        read_input "Twitch Client ID" "TWITCH_CLIENT_ID"
        read_input "Twitch Client Secret" "TWITCH_CLIENT_SECRET" "" true
    fi
    
    # Domain configuration
    echo -e "\n${TH_ACCENT}── Domain Configuration ──${C_RESET}"
    read_input "Primary domain (e.g., example.com)" "PRIMARY_DOMAIN" "evindrake.net"
    
    # Local host (for Tailscale connectivity to local services)
    echo -e "\n${TH_ACCENT}── Local Host Connection (optional) ──${C_RESET}"
    echo -e "${TH_DIM}If you have a local host with Plex/Home Assistant via Tailscale${C_RESET}"
    read_input "Tailscale local host IP (leave empty to skip)" "TAILSCALE_LOCAL_HOST" ""
    
    if [[ -n "${ENV_VALUES[TAILSCALE_LOCAL_HOST]}" ]]; then
        read_input "Plex Token" "PLEX_TOKEN" "" true
        read_input "Home Assistant Token" "HOME_ASSISTANT_TOKEN" "" true
    fi
    
    # Cloudflare (optional)
    echo -e "\n${TH_ACCENT}── Cloudflare DNS (optional) ──${C_RESET}"
    read_input "Cloudflare API Token (for auto DNS)" "CLOUDFLARE_API_TOKEN" "" true
    
    # Grafana
    if [[ "${SERVICE_SELECTED[grafana]}" == "1" ]]; then
        echo -e "\n${TH_ACCENT}── Monitoring ──${C_RESET}"
        read_input "Grafana admin password" "GRAFANA_ADMIN_PASSWORD" "" true
        [[ -z "${ENV_VALUES[GRAFANA_ADMIN_PASSWORD]}" ]] && ENV_VALUES["GRAFANA_ADMIN_PASSWORD"]=$(generate_secret)
    fi
    
    echo ""
    echo -e "${TH_SUCCESS}✔${C_RESET} Configuration complete!"
    sleep 1
}

# ══════════════════════════════════════════════════════════════════════════════
# INSTALLATION FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════

check_requirements() {
    show_section_header "CHECKING REQUIREMENTS"
    echo ""
    
    local errors=0
    
    # Check root
    start_spinner "Checking permissions..."
    if [[ $EUID -ne 0 ]]; then
        stop_spinner "error" "This installer requires root privileges (use sudo)"
        ((errors++))
    else
        stop_spinner "success" "Running as root"
    fi
    
    # Check OS
    start_spinner "Detecting operating system..."
    if [[ -f /etc/os-release ]]; then
        source /etc/os-release
        if [[ "$ID" =~ ^(ubuntu|debian|linuxmint)$ ]]; then
            stop_spinner "success" "OS: $PRETTY_NAME"
        else
            stop_spinner "warning" "Untested OS: $PRETTY_NAME (proceeding anyway)"
        fi
    else
        stop_spinner "warning" "Could not detect OS"
    fi
    
    # Check Linode
    start_spinner "Detecting environment..."
    if curl -s --max-time 2 http://169.254.169.254/v1/instance-id &>/dev/null; then
        stop_spinner "success" "Running on Linode"
    else
        stop_spinner "warning" "Not running on Linode (local/other VPS)"
    fi
    
    # Check required tools
    for tool in curl git; do
        start_spinner "Checking for $tool..."
        if command -v "$tool" &>/dev/null; then
            stop_spinner "success" "$tool is installed"
        else
            stop_spinner "error" "$tool is not installed"
            ((errors++))
        fi
    done
    
    # Check memory
    start_spinner "Checking system resources..."
    local mem_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    local mem_gb=$((mem_kb / 1024 / 1024))
    if [[ $mem_gb -lt 2 ]]; then
        stop_spinner "warning" "Low memory: ${mem_gb}GB (recommended: 4GB+)"
    else
        stop_spinner "success" "Memory: ${mem_gb}GB"
    fi
    
    # Check disk
    start_spinner "Checking disk space..."
    local disk_free=$(df -BG / | awk 'NR==2 {print $4}' | tr -d 'G')
    if [[ $disk_free -lt 20 ]]; then
        stop_spinner "warning" "Low disk space: ${disk_free}GB free (recommended: 50GB+)"
    else
        stop_spinner "success" "Disk space: ${disk_free}GB free"
    fi
    
    if [[ $errors -gt 0 ]]; then
        echo ""
        echo -e "${TH_ERROR}Cannot proceed due to $errors error(s)${C_RESET}"
        exit 1
    fi
    
    echo ""
    sleep 1
}

install_docker() {
    show_section_header "INSTALLING DOCKER"
    echo ""
    
    if command -v docker &>/dev/null; then
        echo -e "${TH_SUCCESS}✔${C_RESET} Docker already installed: $(docker --version)"
        return 0
    fi
    
    start_spinner "Installing Docker..."
    {
        apt-get update
        apt-get install -y ca-certificates curl gnupg lsb-release
        mkdir -p /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
        apt-get update
        apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
        systemctl enable docker
        systemctl start docker
    } >> "$LOG_FILE" 2>&1
    stop_spinner "success" "Docker installed successfully"
}

install_tailscale() {
    show_section_header "SETTING UP TAILSCALE"
    echo ""
    
    if command -v tailscale &>/dev/null; then
        echo -e "${TH_SUCCESS}✔${C_RESET} Tailscale already installed"
        local ts_status=$(tailscale status --json 2>/dev/null | grep -o '"BackendState":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
        if [[ "$ts_status" == "Running" ]]; then
            echo -e "${TH_SUCCESS}✔${C_RESET} Tailscale is connected"
        else
            echo -e "${TH_WARNING}⚠${C_RESET} Tailscale not connected - run: ${TH_INFO}sudo tailscale up${C_RESET}"
        fi
        return 0
    fi
    
    start_spinner "Installing Tailscale..."
    curl -fsSL https://tailscale.com/install.sh | sh >> "$LOG_FILE" 2>&1
    stop_spinner "success" "Tailscale installed"
    
    echo ""
    echo -e "${TH_WARNING}⚠${C_RESET} Run ${TH_INFO}sudo tailscale up${C_RESET} after installation to connect"
}

setup_firewall() {
    show_section_header "CONFIGURING FIREWALL"
    echo ""
    
    start_spinner "Setting up UFW..."
    {
        apt-get install -y ufw
        ufw default deny incoming
        ufw default allow outgoing
        ufw allow ssh
        ufw allow 80/tcp
        ufw allow 443/tcp
        ufw allow in on tailscale0 2>/dev/null || true
        echo "y" | ufw enable
    } >> "$LOG_FILE" 2>&1
    stop_spinner "success" "Firewall configured"
}

clone_repository() {
    show_section_header "SETTING UP PROJECT"
    echo ""
    
    start_spinner "Creating directories..."
    mkdir -p "$INSTALL_DIR"/{logs,workspace,postgres-init}
    stop_spinner "success" "Directories created"
    
    if [[ -d "$INSTALL_DIR/HomeLabHub" ]]; then
        start_spinner "Updating repository..."
        cd "$INSTALL_DIR/HomeLabHub"
        git pull origin main >> "$LOG_FILE" 2>&1 || true
        stop_spinner "success" "Repository updated"
    else
        start_spinner "Cloning repository..."
        git clone "$REPO_URL" "$INSTALL_DIR/HomeLabHub" >> "$LOG_FILE" 2>&1
        stop_spinner "success" "Repository cloned"
    fi
    
    # Create symlinks
    rm -rf "$INSTALL_DIR/services" 2>/dev/null || true
    ln -sfn "$INSTALL_DIR/HomeLabHub/services" "$INSTALL_DIR/services"
    
    # Copy configs
    start_spinner "Copying configurations..."
    cp "$INSTALL_DIR/HomeLabHub/deploy/linode/docker-compose.yml" "$INSTALL_DIR/" 2>/dev/null || true
    cp "$INSTALL_DIR/HomeLabHub/deploy/linode/Caddyfile" "$INSTALL_DIR/" 2>/dev/null || true
    stop_spinner "success" "Configurations copied"
}

write_env_file() {
    show_section_header "WRITING ENVIRONMENT FILE"
    echo ""
    
    local env_file="$INSTALL_DIR/.env"
    
    start_spinner "Generating .env file..."
    cat > "$env_file" << EOF
# ══════════════════════════════════════════════════════════════
# HomeLabHub Environment Configuration
# Generated by homelab-installer.sh on $(date)
# ══════════════════════════════════════════════════════════════

# Database Passwords
POSTGRES_PASSWORD=${ENV_VALUES[POSTGRES_PASSWORD]}
JARVIS_DB_PASSWORD=${ENV_VALUES[JARVIS_DB_PASSWORD]}
DISCORD_DB_PASSWORD=${ENV_VALUES[DISCORD_DB_PASSWORD]}
STREAMBOT_DB_PASSWORD=${ENV_VALUES[STREAMBOT_DB_PASSWORD]}

# Session Secrets
SESSION_SECRET=${ENV_VALUES[SESSION_SECRET]}
SECRET_KEY=${ENV_VALUES[SECRET_KEY]}
DISCORD_SESSION_SECRET=${ENV_VALUES[DISCORD_SESSION_SECRET]}
STREAMBOT_SESSION_SECRET=${ENV_VALUES[STREAMBOT_SESSION_SECRET]}
SERVICE_AUTH_TOKEN=${ENV_VALUES[SERVICE_AUTH_TOKEN]}

# Admin Credentials
WEB_USERNAME=${ENV_VALUES[WEB_USERNAME]}
WEB_PASSWORD=${ENV_VALUES[WEB_PASSWORD]}
CODE_SERVER_PASSWORD=${ENV_VALUES[CODE_SERVER_PASSWORD]}
N8N_BASIC_AUTH_USER=${ENV_VALUES[N8N_BASIC_AUTH_USER]}
N8N_BASIC_AUTH_PASSWORD=${ENV_VALUES[N8N_BASIC_AUTH_PASSWORD]}

# API Keys
OPENAI_API_KEY=${ENV_VALUES[OPENAI_API_KEY]:-}

# Discord (if enabled)
DISCORD_BOT_TOKEN=${ENV_VALUES[DISCORD_BOT_TOKEN]:-}
DISCORD_CLIENT_ID=${ENV_VALUES[DISCORD_CLIENT_ID]:-}
DISCORD_CLIENT_SECRET=${ENV_VALUES[DISCORD_CLIENT_SECRET]:-}
DISCORD_APP_ID=${ENV_VALUES[DISCORD_APP_ID]:-}
VITE_DISCORD_CLIENT_ID=${ENV_VALUES[VITE_DISCORD_CLIENT_ID]:-}

# Twitch (if enabled)
TWITCH_CLIENT_ID=${ENV_VALUES[TWITCH_CLIENT_ID]:-}
TWITCH_CLIENT_SECRET=${ENV_VALUES[TWITCH_CLIENT_SECRET]:-}

# Domain
PRIMARY_DOMAIN=${ENV_VALUES[PRIMARY_DOMAIN]:-evindrake.net}

# Local Services (via Tailscale)
TAILSCALE_LOCAL_HOST=${ENV_VALUES[TAILSCALE_LOCAL_HOST]:-}
PLEX_TOKEN=${ENV_VALUES[PLEX_TOKEN]:-}
HOME_ASSISTANT_TOKEN=${ENV_VALUES[HOME_ASSISTANT_TOKEN]:-}

# Cloudflare
CLOUDFLARE_API_TOKEN=${ENV_VALUES[CLOUDFLARE_API_TOKEN]:-}

# Monitoring
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=${ENV_VALUES[GRAFANA_ADMIN_PASSWORD]:-admin}

# System
TZ=America/New_York
PUID=1000
PGID=1000
EOF

    chmod 600 "$env_file"
    stop_spinner "success" "Environment file created"
    
    echo -e "${TH_DIM}Location: $env_file${C_RESET}"
}

write_postgres_init() {
    start_spinner "Creating PostgreSQL init script..."
    
    cat > "$INSTALL_DIR/postgres-init/00-init-all-databases.sh" << 'SCRIPT'
#!/bin/bash
set -e

echo "=== PostgreSQL Multi-Database Initialization ==="

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE USER ticketbot WITH PASSWORD '${DISCORD_DB_PASSWORD}';
    CREATE USER streambot WITH PASSWORD '${STREAMBOT_DB_PASSWORD}';
    CREATE USER jarvis WITH PASSWORD '${JARVIS_DB_PASSWORD}';
    
    CREATE DATABASE ticketbot OWNER ticketbot;
    CREATE DATABASE streambot OWNER streambot;
    CREATE DATABASE homelab_jarvis OWNER jarvis;
    
    GRANT ALL PRIVILEGES ON DATABASE ticketbot TO ticketbot;
    GRANT ALL PRIVILEGES ON DATABASE streambot TO streambot;
    GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis TO jarvis;
EOSQL

echo "=== PostgreSQL initialization complete ==="
SCRIPT
    
    chmod +x "$INSTALL_DIR/postgres-init/00-init-all-databases.sh"
    stop_spinner "success" "PostgreSQL init script created"
}

deploy_services() {
    show_section_header "DEPLOYING SERVICES"
    echo ""
    
    cd "$INSTALL_DIR"
    
    # Build list of services to deploy
    local services_to_start=""
    for key in "${SERVICE_ORDER[@]}"; do
        if [[ "${SERVICE_SELECTED[$key]}" == "1" ]]; then
            case "$key" in
                postgres) services_to_start+=" homelab-postgres" ;;
                dashboard) services_to_start+=" homelab-dashboard" ;;
                celery) services_to_start+=" homelab-celery-worker" ;;
                grafana) services_to_start+=" homelab-grafana" ;;
                prometheus) services_to_start+=" homelab-prometheus" ;;
                loki) services_to_start+=" homelab-loki" ;;
                *) services_to_start+=" $key" ;;
            esac
        fi
    done
    
    echo -e "${TH_INFO}Starting services:${C_RESET}"
    echo -e "${TH_DIM}$services_to_start${C_RESET}"
    echo ""
    
    # Pull images first
    start_spinner "Pulling Docker images..."
    docker compose pull $services_to_start >> "$LOG_FILE" 2>&1 || true
    stop_spinner "success" "Images pulled"
    
    # Build custom images
    start_spinner "Building custom images..."
    docker compose build $services_to_start >> "$LOG_FILE" 2>&1 || true
    stop_spinner "success" "Images built"
    
    # Start services
    start_spinner "Starting containers..."
    docker compose up -d $services_to_start >> "$LOG_FILE" 2>&1
    stop_spinner "success" "Containers started"
    
    echo ""
    echo -e "${TH_INFO}Waiting for services to initialize...${C_RESET}"
    
    # Wait with progress
    for i in {1..30}; do
        progress_bar "$i" 30 40 "Initializing"
        sleep 1
    done
    echo ""
}

# ══════════════════════════════════════════════════════════════════════════════
# HEALTH CHECK DASHBOARD
# ══════════════════════════════════════════════════════════════════════════════

show_health_dashboard() {
    clear
    show_logo
    show_section_header "SERVICE HEALTH DASHBOARD"
    echo ""
    
    cd "$INSTALL_DIR"
    
    local containers=$(docker compose ps --format json 2>/dev/null | jq -r '.Name' 2>/dev/null || docker compose ps --format "{{.Name}}" 2>/dev/null)
    
    echo -e "${TH_DIM}┌────────────────────────────┬─────────────┬────────────────┐${C_RESET}"
    printf "${TH_DIM}│${C_RESET} %-26s ${TH_DIM}│${C_RESET} %-11s ${TH_DIM}│${C_RESET} %-14s ${TH_DIM}│${C_RESET}\n" "SERVICE" "STATUS" "HEALTH"
    echo -e "${TH_DIM}├────────────────────────────┼─────────────┼────────────────┤${C_RESET}"
    
    for container in $containers; do
        local status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "unknown")
        local health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}N/A{{end}}' "$container" 2>/dev/null || echo "N/A")
        
        local status_color="$TH_DIM"
        case "$status" in
            running) status_color="$TH_SUCCESS" ;;
            exited|dead) status_color="$TH_ERROR" ;;
            restarting) status_color="$TH_WARNING" ;;
        esac
        
        local health_color="$TH_DIM"
        case "$health" in
            healthy) health_color="$TH_SUCCESS" ;;
            unhealthy) health_color="$TH_ERROR" ;;
            starting) health_color="$TH_WARNING" ;;
        esac
        
        printf "${TH_DIM}│${C_RESET} %-26s ${TH_DIM}│${C_RESET} ${status_color}%-11s${C_RESET} ${TH_DIM}│${C_RESET} ${health_color}%-14s${C_RESET} ${TH_DIM}│${C_RESET}\n" \
            "${container:0:26}" "${status:0:11}" "${health:0:14}"
    done
    
    echo -e "${TH_DIM}└────────────────────────────┴─────────────┴────────────────┘${C_RESET}"
    echo ""
}

# ══════════════════════════════════════════════════════════════════════════════
# COMPLETION SUMMARY
# ══════════════════════════════════════════════════════════════════════════════

show_completion() {
    clear
    show_logo
    
    echo -e "${TH_SUCCESS}"
    cat << 'EOF'
    ╔══════════════════════════════════════════════════════════════╗
    ║                                                              ║
    ║   ██╗███╗   ██╗███████╗████████╗ █████╗ ██╗     ██╗         ║
    ║   ██║████╗  ██║██╔════╝╚══██╔══╝██╔══██╗██║     ██║         ║
    ║   ██║██╔██╗ ██║███████╗   ██║   ███████║██║     ██║         ║
    ║   ██║██║╚██╗██║╚════██║   ██║   ██╔══██║██║     ██║         ║
    ║   ██║██║ ╚████║███████║   ██║   ██║  ██║███████╗███████╗    ║
    ║   ╚═╝╚═╝  ╚═══╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚══════╝╚══════╝    ║
    ║                                                              ║
    ║              COMPLETE! YOUR HOMELAB IS READY                 ║
    ║                                                              ║
    ╚══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${C_RESET}"
    
    show_health_dashboard
    
    echo -e "${TH_ACCENT}── Next Steps ──${C_RESET}"
    echo ""
    echo -e "  ${TH_INFO}1.${C_RESET} Connect Tailscale (if not already):"
    echo -e "     ${TH_DIM}sudo tailscale up${C_RESET}"
    echo ""
    echo -e "  ${TH_INFO}2.${C_RESET} Update DNS records to point to this server"
    echo ""
    echo -e "  ${TH_INFO}3.${C_RESET} Access your services:"
    echo -e "     ${TH_DIM}Dashboard:   https://dash.${ENV_VALUES[PRIMARY_DOMAIN]:-example.com}${C_RESET}"
    echo -e "     ${TH_DIM}Code Server: https://code.${ENV_VALUES[PRIMARY_DOMAIN]:-example.com}${C_RESET}"
    echo -e "     ${TH_DIM}N8N:         https://n8n.${ENV_VALUES[PRIMARY_DOMAIN]:-example.com}${C_RESET}"
    echo ""
    echo -e "${TH_ACCENT}── Useful Commands ──${C_RESET}"
    echo ""
    echo -e "  ${TH_DIM}cd $INSTALL_DIR${C_RESET}"
    echo -e "  ${TH_DIM}docker compose logs -f             # View logs${C_RESET}"
    echo -e "  ${TH_DIM}docker compose restart <service>   # Restart service${C_RESET}"
    echo -e "  ${TH_DIM}docker compose down                # Stop all${C_RESET}"
    echo -e "  ${TH_DIM}./HomeLabHub/homelab status        # Check status${C_RESET}"
    echo ""
    echo -e "${TH_SUCCESS}Installation complete! Log saved to: $LOG_FILE${C_RESET}"
    echo ""
}

# ══════════════════════════════════════════════════════════════════════════════
# MAIN ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

main() {
    # Initialize log
    mkdir -p "$(dirname "$LOG_FILE")"
    echo "=== HomeLabHub Installation Started: $(date) ===" > "$LOG_FILE"
    
    # Welcome
    show_logo
    echo ""
    echo -e "${TH_INFO}Welcome to the HomeLabHub Installer!${C_RESET}"
    echo -e "${TH_DIM}This wizard will guide you through setting up your cloud infrastructure.${C_RESET}"
    echo ""
    echo -e "Press ${TH_HIGHLIGHT}ENTER${C_RESET} to begin or ${TH_DIM}Ctrl+C${C_RESET} to cancel..."
    read -r
    
    # Check requirements
    check_requirements
    
    # Service selection
    show_service_menu
    
    # Configuration wizard
    show_config_wizard
    
    # Installation
    install_docker
    install_tailscale
    setup_firewall
    clone_repository
    write_env_file
    write_postgres_init
    deploy_services
    
    # Completion
    show_completion
}

# Run main
main "$@"
