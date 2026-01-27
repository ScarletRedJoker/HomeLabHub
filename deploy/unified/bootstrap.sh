#!/bin/bash
# Nebula Command - Comprehensive Linux Deployment Bootstrap Script
# One-command deployment that auto-detects hardware and configures all AI services
# Supports: Ubuntu/Debian (apt), Fedora/RHEL (dnf/yum), Arch (pacman)

set -euo pipefail

###############################################################################
# CONFIGURATION
###############################################################################

NEBULA_HOME="${NEBULA_HOME:-/opt/nebula-command}"
CONFIG_DIR="${CONFIG_DIR:-$NEBULA_HOME/config}"
STATE_DIR="${STATE_DIR:-$NEBULA_HOME/state}"
LOG_DIR="${LOG_DIR:-$NEBULA_HOME/logs}"
SERVICES_DIR="${SERVICES_DIR:-$NEBULA_HOME/services}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"
TEMPLATE_DIR="$SCRIPT_DIR/templates"

DASHBOARD_URL="${DASHBOARD_URL:-}"
INSTALL_OLLAMA="${INSTALL_OLLAMA:-true}"
INSTALL_COMFYUI="${INSTALL_COMFYUI:-auto}"
INSTALL_SD="${INSTALL_SD:-auto}"
INSTALL_DASHBOARD="${INSTALL_DASHBOARD:-auto}"
INSTALL_BOTS="${INSTALL_BOTS:-auto}"
DRY_RUN="${DRY_RUN:-false}"
INTERACTIVE="${INTERACTIVE:-auto}"
CI_MODE="${CI:-false}"
VERBOSE="${VERBOSE:-false}"
SKIP_GPU_DRIVERS="${SKIP_GPU_DRIVERS:-false}"

DEPLOY_LOG="$LOG_DIR/deploy-$(date +%Y%m%d-%H%M%S).log"

###############################################################################
# COLORS AND LOGGING
###############################################################################

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

init_logging() {
    mkdir -p "$LOG_DIR"
    exec > >(tee -a "$DEPLOY_LOG") 2>&1
    log_info "Deployment log: $DEPLOY_LOG"
}

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_debug() { [[ "$VERBOSE" == "true" ]] && echo -e "${CYAN}[DEBUG]${NC} $1" || true; }
log_step() { echo -e "${MAGENTA}[STEP]${NC} ${BOLD}$1${NC}"; }

prompt_yes_no() {
    local prompt="$1"
    local default="${2:-y}"
    
    if [[ "$CI_MODE" == "true" ]] || [[ "$INTERACTIVE" == "false" ]]; then
        [[ "$default" == "y" ]] && return 0 || return 1
    fi
    
    local yn
    if [[ "$default" == "y" ]]; then
        read -r -p "$prompt [Y/n]: " yn
        yn="${yn:-y}"
    else
        read -r -p "$prompt [y/N]: " yn
        yn="${yn:-n}"
    fi
    
    [[ "$yn" =~ ^[Yy] ]]
}

###############################################################################
# HARDWARE DETECTION
###############################################################################

detect_os() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        echo "$ID"
    elif [[ -f /etc/redhat-release ]]; then
        echo "rhel"
    elif [[ -f /etc/debian_version ]]; then
        echo "debian"
    else
        echo "unknown"
    fi
}

detect_os_version() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        echo "${VERSION_ID:-unknown}"
    else
        echo "unknown"
    fi
}

detect_arch() {
    uname -m
}

detect_cpu() {
    local cores
    local model
    local threads
    
    cores=$(nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo 2>/dev/null || echo "1")
    threads=$(grep -c ^processor /proc/cpuinfo 2>/dev/null || echo "$cores")
    model=$(grep "model name" /proc/cpuinfo 2>/dev/null | head -1 | cut -d':' -f2 | xargs || echo "Unknown")
    
    cat << EOF
{
  "cores": $cores,
  "threads": $threads,
  "model": "$model"
}
EOF
}

detect_ram() {
    local total_kb
    total_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    echo $((total_kb / 1024))
}

detect_disk() {
    local root_available
    root_available=$(df -BM / | tail -1 | awk '{print $4}' | tr -d 'M')
    echo "$root_available"
}

detect_gpu() {
    local nvidia_gpu=""
    local amd_gpu=""
    
    nvidia_gpu=$(detect_nvidia_gpu)
    if [[ -n "$nvidia_gpu" ]] && [[ "$nvidia_gpu" != "null" ]]; then
        echo "$nvidia_gpu"
        return
    fi
    
    amd_gpu=$(detect_amd_gpu)
    if [[ -n "$amd_gpu" ]] && [[ "$amd_gpu" != "null" ]]; then
        echo "$amd_gpu"
        return
    fi
    
    echo '{"vendor":"none","count":0,"names":"","vram_mb":0,"driver_version":""}'
}

detect_nvidia_gpu() {
    local gpu_count=0
    local total_vram=0
    local cuda_version=""
    local driver_version=""
    local gpu_names=""
    
    if ! command -v nvidia-smi &> /dev/null; then
        echo ""
        return
    fi
    
    if ! nvidia-smi &> /dev/null; then
        echo ""
        return
    fi
    
    gpu_count=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | wc -l || echo "0")
    
    if [[ "$gpu_count" -eq 0 ]]; then
        echo ""
        return
    fi
    
    gpu_names=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | tr '\n' ',' | sed 's/,$//' || echo "")
    
    local vram_list
    vram_list=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null || echo "0")
    
    while IFS= read -r vram; do
        total_vram=$((total_vram + vram))
    done <<< "$vram_list"
    
    driver_version=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -1 || echo "")
    
    if command -v nvcc &> /dev/null; then
        cuda_version=$(nvcc --version 2>/dev/null | grep "release" | sed 's/.*release \([0-9.]*\).*/\1/' || echo "")
    else
        cuda_version=$(nvidia-smi 2>/dev/null | grep "CUDA Version" | awk '{print $NF}' | tr -d ' ' || echo "")
    fi
    
    cat << EOF
{"vendor":"nvidia","count":$gpu_count,"names":"$gpu_names","vram_mb":$total_vram,"cuda_version":"$cuda_version","driver_version":"$driver_version"}
EOF
}

detect_amd_gpu() {
    local gpu_count=0
    local total_vram=0
    local rocm_version=""
    local gpu_names=""
    
    if command -v rocm-smi &> /dev/null; then
        gpu_count=$(rocm-smi --showcount 2>/dev/null | grep -oP '\d+' | head -1 || echo "0")
        
        if [[ "$gpu_count" -gt 0 ]]; then
            gpu_names=$(rocm-smi --showproductname 2>/dev/null | grep -i "card" | cut -d':' -f2 | tr '\n' ',' | sed 's/,$//' | xargs || echo "")
            
            local vram_info
            vram_info=$(rocm-smi --showmeminfo vram 2>/dev/null | grep -i "total" | awk '{print $NF}' || echo "0")
            total_vram=$(echo "$vram_info" | awk 'BEGIN{sum=0} {sum += $1} END {print int(sum/1024/1024)}' || echo "0")
            
            if [[ -f /opt/rocm/.info/version ]]; then
                rocm_version=$(cat /opt/rocm/.info/version)
            elif command -v rocminfo &> /dev/null; then
                rocm_version=$(rocminfo 2>/dev/null | grep -i "version" | head -1 | awk '{print $NF}' || echo "")
            fi
            
            cat << EOF
{"vendor":"amd","count":$gpu_count,"names":"$gpu_names","vram_mb":$total_vram,"rocm_version":"$rocm_version","driver_version":"$rocm_version"}
EOF
            return
        fi
    fi
    
    if lspci 2>/dev/null | grep -iE "VGA.*AMD|Radeon|AMDGPU" &> /dev/null; then
        gpu_names=$(lspci 2>/dev/null | grep -iE "VGA.*AMD|Radeon" | cut -d':' -f3 | tr '\n' ',' | sed 's/,$//' | xargs || echo "")
        gpu_count=$(lspci 2>/dev/null | grep -iE "VGA.*AMD|Radeon" | wc -l)
        
        cat << EOF
{"vendor":"amd","count":$gpu_count,"names":"$gpu_names","vram_mb":0,"rocm_version":"","driver_version":"not_installed"}
EOF
        return
    fi
    
    echo ""
}

detect_network() {
    local primary_ip=""
    local tailscale_ip=""
    local interfaces=""
    local hostname_fqdn=""
    
    primary_ip=$(hostname -I 2>/dev/null | awk '{print $1}' || ip route get 1.1.1.1 2>/dev/null | awk '{print $7}' | head -1 || echo "127.0.0.1")
    hostname_fqdn=$(hostname -f 2>/dev/null || hostname 2>/dev/null || echo "localhost")
    
    if command -v tailscale &> /dev/null; then
        tailscale_ip=$(tailscale ip -4 2>/dev/null || echo "")
    fi
    
    interfaces=$(ip -o link show 2>/dev/null | awk -F': ' '{print $2}' | grep -v "^lo$" | tr '\n' ',' | sed 's/,$//' || echo "")
    
    cat << EOF
{"primary_ip":"$primary_ip","tailscale_ip":"$tailscale_ip","interfaces":"$interfaces","hostname":"$hostname_fqdn"}
EOF
}

detect_services() {
    local ollama_installed=false
    local comfyui_installed=false
    local sd_installed=false
    local docker_installed=false
    local nodejs_installed=false
    local python_installed=false
    
    command -v ollama &> /dev/null && ollama_installed=true
    command -v docker &> /dev/null && docker_installed=true
    command -v node &> /dev/null && nodejs_installed=true
    command -v python3 &> /dev/null && python_installed=true
    
    [[ -d /opt/ComfyUI ]] || [[ -d "$HOME/ComfyUI" ]] || [[ -d "${SERVICES_DIR}/ComfyUI" ]] && comfyui_installed=true
    [[ -d /opt/stable-diffusion-webui ]] || [[ -d "$HOME/stable-diffusion-webui" ]] || [[ -d "${SERVICES_DIR}/stable-diffusion-webui" ]] && sd_installed=true
    
    cat << EOF
{"ollama":$ollama_installed,"comfyui":$comfyui_installed,"stable_diffusion":$sd_installed,"docker":$docker_installed,"nodejs":$nodejs_installed,"python":$python_installed}
EOF
}

generate_node_id() {
    local hostname_short
    hostname_short=$(hostname -s 2>/dev/null || hostname 2>/dev/null || echo "node")
    local mac_suffix
    mac_suffix=$(ip link show 2>/dev/null | grep -m1 "link/ether" | awk '{print $2}' | tr -d ':' | tail -c 6 || echo "")
    
    if [[ -z "$mac_suffix" ]]; then
        mac_suffix=$(date +%s | tail -c 6)
    fi
    
    echo "${hostname_short}-${mac_suffix}"
}

detect_hardware() {
    log_step "Detecting hardware configuration..."
    
    local profile_file="$STATE_DIR/hardware-profile.json"
    mkdir -p "$STATE_DIR"
    
    local os
    os=$(detect_os)
    local os_version
    os_version=$(detect_os_version)
    local arch
    arch=$(detect_arch)
    local cpu
    cpu=$(detect_cpu)
    local ram_mb
    ram_mb=$(detect_ram)
    local disk_mb
    disk_mb=$(detect_disk)
    local gpu
    gpu=$(detect_gpu)
    local network
    network=$(detect_network)
    local services
    services=$(detect_services)
    local node_id
    node_id=$(generate_node_id)
    
    local has_gpu=false
    local is_gpu_capable=false
    local vram_mb=0
    local gpu_vendor="none"
    
    if echo "$gpu" | grep -q '"count":[1-9]'; then
        has_gpu=true
        vram_mb=$(echo "$gpu" | grep -oP '"vram_mb":\s*\K\d+' || echo "0")
        gpu_vendor=$(echo "$gpu" | grep -oP '"vendor":\s*"\K[^"]+' || echo "none")
        [[ "$vram_mb" -ge 4000 ]] && is_gpu_capable=true
    fi
    
    local can_run_llm=false
    local can_run_sd=false
    local can_run_comfyui=false
    
    [[ "$ram_mb" -ge 8000 ]] && can_run_llm=true
    [[ "$is_gpu_capable" == "true" ]] && can_run_sd=true && can_run_comfyui=true
    
    local profile
    profile=$(cat << EOF
{
  "node_id": "$node_id",
  "detected_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "platform": "linux",
  "os": "$os",
  "os_version": "$os_version",
  "arch": "$arch",
  "cpu": $cpu,
  "ram_mb": $ram_mb,
  "disk_available_mb": $disk_mb,
  "gpu": $gpu,
  "network": $network,
  "services": $services,
  "capabilities": {
    "has_gpu": $has_gpu,
    "is_gpu_capable": $is_gpu_capable,
    "gpu_vendor": "$gpu_vendor",
    "vram_mb": $vram_mb,
    "can_run_llm": $can_run_llm,
    "can_run_sd": $can_run_sd,
    "can_run_comfyui": $can_run_comfyui
  }
}
EOF
)

    echo "$profile" > "$profile_file"
    
    log_success "Hardware detection complete"
    log_info "Node ID: $node_id"
    log_info "OS: $os $os_version ($arch)"
    log_info "CPU: $(echo "$cpu" | grep -oP '"model":\s*"\K[^"]+') ($(echo "$cpu" | grep -oP '"cores":\s*\K\d+') cores)"
    log_info "RAM: ${ram_mb}MB"
    log_info "Disk Available: ${disk_mb}MB"
    log_info "GPU: $gpu_vendor (${vram_mb}MB VRAM)"
    
    echo "$profile_file"
}

###############################################################################
# PACKAGE MANAGER ABSTRACTION
###############################################################################

detect_package_manager() {
    if command -v apt-get &> /dev/null; then
        echo "apt"
    elif command -v dnf &> /dev/null; then
        echo "dnf"
    elif command -v yum &> /dev/null; then
        echo "yum"
    elif command -v pacman &> /dev/null; then
        echo "pacman"
    elif command -v zypper &> /dev/null; then
        echo "zypper"
    else
        echo "unknown"
    fi
}

pkg_update() {
    local pm
    pm=$(detect_package_manager)
    
    log_debug "Updating package manager: $pm"
    
    case "$pm" in
        apt)
            sudo apt-get update -qq
            ;;
        dnf)
            sudo dnf check-update -q || true
            ;;
        yum)
            sudo yum check-update -q || true
            ;;
        pacman)
            sudo pacman -Sy --noconfirm
            ;;
        zypper)
            sudo zypper refresh -q
            ;;
        *)
            log_error "Unknown package manager"
            return 1
            ;;
    esac
}

pkg_install() {
    local packages=("$@")
    local pm
    pm=$(detect_package_manager)
    
    log_debug "Installing packages with $pm: ${packages[*]}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would install: ${packages[*]}"
        return 0
    fi
    
    case "$pm" in
        apt)
            sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${packages[@]}"
            ;;
        dnf)
            sudo dnf install -y -q "${packages[@]}"
            ;;
        yum)
            sudo yum install -y -q "${packages[@]}"
            ;;
        pacman)
            sudo pacman -S --noconfirm --needed "${packages[@]}"
            ;;
        zypper)
            sudo zypper install -y -q "${packages[@]}"
            ;;
        *)
            log_error "Unknown package manager: $pm"
            return 1
            ;;
    esac
}

pkg_install_group() {
    local group="$1"
    local pm
    pm=$(detect_package_manager)
    
    case "$pm" in
        apt)
            case "$group" in
                build-essential)
                    pkg_install build-essential
                    ;;
                python-dev)
                    pkg_install python3-dev python3-pip python3-venv
                    ;;
            esac
            ;;
        dnf|yum)
            case "$group" in
                build-essential)
                    sudo $pm groupinstall -y "Development Tools"
                    ;;
                python-dev)
                    pkg_install python3-devel python3-pip
                    ;;
            esac
            ;;
        pacman)
            case "$group" in
                build-essential)
                    pkg_install base-devel
                    ;;
                python-dev)
                    pkg_install python python-pip python-virtualenv
                    ;;
            esac
            ;;
    esac
}

###############################################################################
# DEPENDENCY INSTALLATION
###############################################################################

check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_warn "Running as root. Some services may need non-root user."
        return 0
    fi
    
    if ! sudo -n true 2>/dev/null; then
        log_info "Sudo access required. Please enter your password."
        sudo -v
    fi
}

install_base_dependencies() {
    log_step "Installing base dependencies..."
    
    local missing=()
    local pm
    pm=$(detect_package_manager)
    
    command -v curl &> /dev/null || missing+=("curl")
    command -v wget &> /dev/null || missing+=("wget")
    command -v git &> /dev/null || missing+=("git")
    command -v jq &> /dev/null || missing+=("jq")
    command -v python3 &> /dev/null || missing+=("python3")
    command -v pip3 &> /dev/null || {
        case "$pm" in
            apt) missing+=("python3-pip") ;;
            dnf|yum) missing+=("python3-pip") ;;
            pacman) missing+=("python-pip") ;;
        esac
    }
    command -v node &> /dev/null || {
        case "$pm" in
            apt) missing+=("nodejs" "npm") ;;
            dnf|yum) missing+=("nodejs" "npm") ;;
            pacman) missing+=("nodejs" "npm") ;;
        esac
    }
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        log_info "Installing missing packages: ${missing[*]}"
        pkg_update
        pkg_install "${missing[@]}"
    fi
    
    if ! command -v node &> /dev/null; then
        log_info "Installing Node.js via NodeSource..."
        if [[ "$pm" == "apt" ]]; then
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            pkg_install nodejs
        elif [[ "$pm" == "dnf" ]] || [[ "$pm" == "yum" ]]; then
            curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
            pkg_install nodejs
        fi
    fi
    
    pkg_install_group "build-essential"
    pkg_install_group "python-dev"
    
    log_success "Base dependencies installed"
}

install_nvidia_drivers() {
    local profile_file="$1"
    
    if [[ "$SKIP_GPU_DRIVERS" == "true" ]]; then
        log_info "Skipping GPU driver installation (SKIP_GPU_DRIVERS=true)"
        return 0
    fi
    
    local gpu_vendor
    gpu_vendor=$(jq -r '.capabilities.gpu_vendor' "$profile_file")
    
    if [[ "$gpu_vendor" != "nvidia" ]]; then
        return 0
    fi
    
    if nvidia-smi &> /dev/null; then
        log_info "NVIDIA drivers already installed"
        return 0
    fi
    
    log_step "Installing NVIDIA drivers..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would install NVIDIA drivers"
        return 0
    fi
    
    local pm
    pm=$(detect_package_manager)
    
    case "$pm" in
        apt)
            sudo add-apt-repository -y ppa:graphics-drivers/ppa 2>/dev/null || true
            pkg_update
            sudo ubuntu-drivers autoinstall 2>/dev/null || pkg_install nvidia-driver-535
            ;;
        dnf)
            sudo dnf config-manager --add-repo https://developer.download.nvidia.com/compute/cuda/repos/fedora$(rpm -E %fedora)/x86_64/cuda-fedora.repo 2>/dev/null || true
            pkg_install nvidia-driver nvidia-settings
            ;;
        pacman)
            pkg_install nvidia nvidia-utils nvidia-settings
            ;;
    esac
    
    log_info "Installing NVIDIA Container Toolkit..."
    case "$pm" in
        apt)
            curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
            curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
                sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
                sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
            pkg_update
            pkg_install nvidia-container-toolkit
            ;;
        dnf|yum)
            curl -s -L https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo | \
                sudo tee /etc/yum.repos.d/nvidia-container-toolkit.repo
            pkg_install nvidia-container-toolkit
            ;;
    esac
    
    log_success "NVIDIA drivers installed (reboot may be required)"
}

install_rocm() {
    local profile_file="$1"
    
    if [[ "$SKIP_GPU_DRIVERS" == "true" ]]; then
        log_info "Skipping GPU driver installation (SKIP_GPU_DRIVERS=true)"
        return 0
    fi
    
    local gpu_vendor
    gpu_vendor=$(jq -r '.capabilities.gpu_vendor' "$profile_file")
    
    if [[ "$gpu_vendor" != "amd" ]]; then
        return 0
    fi
    
    if command -v rocm-smi &> /dev/null; then
        log_info "ROCm already installed"
        return 0
    fi
    
    log_step "Installing AMD ROCm..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would install ROCm"
        return 0
    fi
    
    local pm
    pm=$(detect_package_manager)
    local os
    os=$(detect_os)
    
    case "$pm" in
        apt)
            sudo mkdir -p /etc/apt/keyrings
            wget -q -O - https://repo.radeon.com/rocm/rocm.gpg.key | gpg --dearmor | sudo tee /etc/apt/keyrings/rocm.gpg > /dev/null
            
            local os_version
            os_version=$(detect_os_version)
            echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/rocm.gpg] https://repo.radeon.com/rocm/apt/${os_version} jammy main" | \
                sudo tee /etc/apt/sources.list.d/rocm.list
            
            echo 'Package: *\nPin: release o=repo.radeon.com\nPin-Priority: 600' | sudo tee /etc/apt/preferences.d/rocm-pin-600
            
            pkg_update
            pkg_install rocm-hip-sdk rocm-libs
            ;;
        dnf)
            sudo tee /etc/yum.repos.d/rocm.repo << 'EOF'
[ROCm]
name=ROCm
baseurl=https://repo.radeon.com/rocm/rhel8/rpm/
enabled=1
gpgcheck=1
gpgkey=https://repo.radeon.com/rocm/rocm.gpg.key
EOF
            pkg_install rocm-hip-sdk rocm-libs
            ;;
        pacman)
            pkg_install rocm-hip-sdk rocm-libs
            ;;
    esac
    
    sudo usermod -aG video,render "$USER" 2>/dev/null || true
    
    log_success "ROCm installed"
}

###############################################################################
# SERVICE INSTALLATION
###############################################################################

install_ollama() {
    local profile_file="$1"
    
    if [[ "$INSTALL_OLLAMA" != "true" ]]; then
        log_info "Skipping Ollama installation (INSTALL_OLLAMA=$INSTALL_OLLAMA)"
        return 0
    fi
    
    if command -v ollama &> /dev/null; then
        log_info "Ollama already installed: $(ollama --version 2>/dev/null || echo 'version unknown')"
        return 0
    fi
    
    local can_run_llm
    can_run_llm=$(jq -r '.capabilities.can_run_llm' "$profile_file")
    
    if [[ "$can_run_llm" != "true" ]]; then
        log_warn "System does not meet minimum requirements for LLM (8GB RAM). Skipping Ollama."
        return 0
    fi
    
    log_step "Installing Ollama..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would install Ollama"
        return 0
    fi
    
    curl -fsSL https://ollama.ai/install.sh | sh
    
    if ! id ollama &> /dev/null; then
        sudo useradd -r -s /bin/false -m -d /var/lib/ollama ollama 2>/dev/null || true
    fi
    
    sudo mkdir -p /var/lib/ollama
    sudo chown -R ollama:ollama /var/lib/ollama 2>/dev/null || true
    
    log_success "Ollama installed"
}

configure_ollama_models() {
    local profile_file="$1"
    
    if ! command -v ollama &> /dev/null; then
        return 0
    fi
    
    local vram_mb
    vram_mb=$(jq -r '.capabilities.vram_mb' "$profile_file")
    local ram_mb
    ram_mb=$(jq -r '.ram_mb' "$profile_file")
    
    local models=()
    
    if [[ "$vram_mb" -lt 4000 ]]; then
        models=("phi" "tinyllama")
        log_info "VRAM < 4GB: Configuring small models (phi, tinyllama)"
    elif [[ "$vram_mb" -lt 8000 ]]; then
        models=("llama2" "mistral")
        log_info "VRAM 4-8GB: Configuring medium models (llama2, mistral)"
    elif [[ "$vram_mb" -lt 16000 ]]; then
        models=("llama2:13b" "codellama")
        log_info "VRAM 8-16GB: Configuring large models (llama2:13b, codellama)"
    else
        models=("llama2:70b" "mixtral")
        log_info "VRAM > 16GB: Configuring extra-large models (llama2:70b, mixtral)"
    fi
    
    local models_file="$STATE_DIR/recommended-models.txt"
    printf '%s\n' "${models[@]}" > "$models_file"
    
    log_info "Recommended models saved to: $models_file"
    log_info "Pull models with: while read m; do ollama pull \$m; done < $models_file"
}

install_comfyui() {
    local profile_file="$1"
    
    if [[ "$INSTALL_COMFYUI" == "false" ]]; then
        log_info "Skipping ComfyUI installation (INSTALL_COMFYUI=false)"
        return 0
    fi
    
    local install_dir="${COMFYUI_DIR:-${SERVICES_DIR}/ComfyUI}"
    
    if [[ -d "$install_dir" ]]; then
        log_info "ComfyUI already installed at: $install_dir"
        return 0
    fi
    
    local can_run_comfyui
    can_run_comfyui=$(jq -r '.capabilities.can_run_comfyui' "$profile_file")
    
    if [[ "$INSTALL_COMFYUI" == "auto" ]] && [[ "$can_run_comfyui" != "true" ]]; then
        log_warn "System does not meet requirements for ComfyUI (GPU with 4GB+ VRAM). Skipping."
        return 0
    fi
    
    log_step "Installing ComfyUI..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would install ComfyUI to: $install_dir"
        return 0
    fi
    
    sudo mkdir -p "$(dirname "$install_dir")"
    sudo chown "$USER":"$USER" "$(dirname "$install_dir")" 2>/dev/null || true
    
    git clone https://github.com/comfyanonymous/ComfyUI.git "$install_dir"
    
    cd "$install_dir"
    python3 -m venv venv
    source venv/bin/activate
    
    local gpu_vendor
    gpu_vendor=$(jq -r '.capabilities.gpu_vendor' "$profile_file")
    
    if [[ "$gpu_vendor" == "nvidia" ]]; then
        pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
    elif [[ "$gpu_vendor" == "amd" ]]; then
        pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/rocm5.7
    else
        pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
    fi
    
    pip install -r requirements.txt
    deactivate
    
    log_success "ComfyUI installed at: $install_dir"
}

install_stable_diffusion() {
    local profile_file="$1"
    
    if [[ "$INSTALL_SD" == "false" ]]; then
        log_info "Skipping Stable Diffusion installation (INSTALL_SD=false)"
        return 0
    fi
    
    local install_dir="${SD_DIR:-${SERVICES_DIR}/stable-diffusion-webui}"
    
    if [[ -d "$install_dir" ]]; then
        log_info "Stable Diffusion WebUI already installed at: $install_dir"
        return 0
    fi
    
    local can_run_sd
    can_run_sd=$(jq -r '.capabilities.can_run_sd' "$profile_file")
    
    if [[ "$INSTALL_SD" == "auto" ]] && [[ "$can_run_sd" != "true" ]]; then
        log_warn "System does not meet requirements for Stable Diffusion (GPU with 4GB+ VRAM). Skipping."
        return 0
    fi
    
    log_step "Installing Stable Diffusion WebUI..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would install Stable Diffusion WebUI to: $install_dir"
        return 0
    fi
    
    sudo mkdir -p "$(dirname "$install_dir")"
    sudo chown "$USER":"$USER" "$(dirname "$install_dir")" 2>/dev/null || true
    
    git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui.git "$install_dir"
    
    cd "$install_dir"
    
    local gpu_vendor
    gpu_vendor=$(jq -r '.capabilities.gpu_vendor' "$profile_file")
    
    if [[ "$gpu_vendor" == "amd" ]]; then
        export TORCH_COMMAND="pip install torch torchvision --index-url https://download.pytorch.org/whl/rocm5.7"
    fi
    
    bash webui.sh --exit --skip-torch-cuda-test
    
    log_success "Stable Diffusion WebUI installed at: $install_dir"
}

install_dashboard_and_bots() {
    local profile_file="$1"
    
    if [[ "$INSTALL_DASHBOARD" == "false" ]] && [[ "$INSTALL_BOTS" == "false" ]]; then
        log_info "Skipping dashboard and bots installation"
        return 0
    fi
    
    log_step "Setting up Dashboard and Bots..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would set up dashboard and bots"
        return 0
    fi
    
    sudo mkdir -p "$SERVICES_DIR"
    sudo chown "$USER":"$USER" "$SERVICES_DIR" 2>/dev/null || true
    
    if [[ "$INSTALL_DASHBOARD" != "false" ]]; then
        if [[ -d "$SCRIPT_DIR/../../services/dashboard-next" ]]; then
            log_info "Linking dashboard-next service..."
            ln -sfn "$(realpath "$SCRIPT_DIR/../../services/dashboard-next")" "$SERVICES_DIR/dashboard-next" 2>/dev/null || \
                cp -r "$SCRIPT_DIR/../../services/dashboard-next" "$SERVICES_DIR/"
            
            cd "$SERVICES_DIR/dashboard-next"
            npm install --production 2>/dev/null || npm install
            log_success "Dashboard installed"
        fi
    fi
    
    if [[ "$INSTALL_BOTS" != "false" ]]; then
        for bot in discord-bot stream-bot; do
            if [[ -d "$SCRIPT_DIR/../../services/$bot" ]]; then
                log_info "Linking $bot service..."
                ln -sfn "$(realpath "$SCRIPT_DIR/../../services/$bot")" "$SERVICES_DIR/$bot" 2>/dev/null || \
                    cp -r "$SCRIPT_DIR/../../services/$bot" "$SERVICES_DIR/"
                
                cd "$SERVICES_DIR/$bot"
                npm install --production 2>/dev/null || npm install
                log_success "$bot installed"
            fi
        done
    fi
}

###############################################################################
# CONFIGURATION GENERATION
###############################################################################

generate_env_file() {
    local profile_file="$1"
    local output_dir="$2"
    
    log_info "Generating .env configuration..."
    
    local node_id
    node_id=$(jq -r '.node_id' "$profile_file")
    local platform
    platform=$(jq -r '.platform' "$profile_file")
    local primary_ip
    primary_ip=$(jq -r '.network.primary_ip' "$profile_file")
    local tailscale_ip
    tailscale_ip=$(jq -r '.network.tailscale_ip // empty' "$profile_file")
    local has_gpu
    has_gpu=$(jq -r '.capabilities.has_gpu' "$profile_file")
    local vram_mb
    vram_mb=$(jq -r '.capabilities.vram_mb' "$profile_file")
    local gpu_vendor
    gpu_vendor=$(jq -r '.capabilities.gpu_vendor' "$profile_file")
    local cuda_version
    cuda_version=$(jq -r '.gpu.cuda_version // empty' "$profile_file")
    local ram_mb
    ram_mb=$(jq -r '.ram_mb' "$profile_file")
    
    local advertise_ip="${tailscale_ip:-$primary_ip}"
    
    mkdir -p "$output_dir"
    
    cat > "$output_dir/.env" << EOF
# Nebula Command Node Configuration
# Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Node ID: $node_id

# Node Identity
NODE_ID=$node_id
NODE_PLATFORM=$platform
NODE_IP=$advertise_ip
WINDOWS_VM_TAILSCALE_IP=$advertise_ip

# Dashboard Connection
DASHBOARD_URL=${DASHBOARD_URL:-http://localhost:5000}

# AI Service URLs (auto-configured based on hardware)
OLLAMA_URL=http://${advertise_ip}:11434
STABLE_DIFFUSION_URL=http://${advertise_ip}:7860
COMFYUI_URL=http://${advertise_ip}:8188

# Hardware Capabilities
HAS_GPU=$has_gpu
GPU_VENDOR=$gpu_vendor
VRAM_MB=$vram_mb
RAM_MB=$ram_mb
CUDA_VERSION=$cuda_version

# Service Ports
OLLAMA_PORT=11434
COMFYUI_PORT=8188
SD_PORT=7860

# Directories
NEBULA_HOME=$NEBULA_HOME
CONFIG_DIR=$CONFIG_DIR
STATE_DIR=$STATE_DIR
LOG_DIR=$LOG_DIR
SERVICES_DIR=$SERVICES_DIR

# Logging
LOG_LEVEL=info
AI_LOG_LEVEL=info
EOF

    if [[ "$has_gpu" == "true" ]] && [[ "$gpu_vendor" == "nvidia" ]]; then
        cat >> "$output_dir/.env" << EOF

# NVIDIA GPU Settings
CUDA_VISIBLE_DEVICES=all
NVIDIA_VISIBLE_DEVICES=all
EOF
    fi
    
    if [[ "$has_gpu" == "true" ]] && [[ "$gpu_vendor" == "amd" ]]; then
        cat >> "$output_dir/.env" << EOF

# AMD GPU Settings
HSA_OVERRIDE_GFX_VERSION=10.3.0
ROCm_PATH=/opt/rocm
EOF
    fi
    
    log_success "Generated .env at: $output_dir/.env"
}

generate_service_configs() {
    local profile_file="$1"
    local output_dir="$2"
    
    log_info "Generating service configurations..."
    
    local has_gpu
    has_gpu=$(jq -r '.capabilities.has_gpu' "$profile_file")
    local vram_mb
    vram_mb=$(jq -r '.capabilities.vram_mb' "$profile_file")
    local gpu_vendor
    gpu_vendor=$(jq -r '.capabilities.gpu_vendor' "$profile_file")
    
    mkdir -p "$output_dir"
    
    cat > "$output_dir/ollama.conf" << EOF
OLLAMA_HOST=0.0.0.0:11434
OLLAMA_ORIGINS=*
OLLAMA_KEEP_ALIVE=5m
EOF
    
    if [[ "$has_gpu" == "true" ]]; then
        if [[ "$vram_mb" -ge 8000 ]]; then
            echo "OLLAMA_NUM_GPU=99" >> "$output_dir/ollama.conf"
        else
            echo "OLLAMA_NUM_GPU=1" >> "$output_dir/ollama.conf"
        fi
    else
        echo "OLLAMA_NUM_GPU=0" >> "$output_dir/ollama.conf"
    fi
    
    local comfyui_args=""
    if [[ "$has_gpu" != "true" ]]; then
        comfyui_args="--cpu"
    elif [[ "$gpu_vendor" == "amd" ]]; then
        comfyui_args="--directml"
    elif [[ "$vram_mb" -lt 6000 ]]; then
        comfyui_args="--lowvram"
    elif [[ "$vram_mb" -lt 8000 ]]; then
        comfyui_args="--normalvram"
    else
        comfyui_args="--highvram"
    fi
    
    cat > "$output_dir/comfyui.conf" << EOF
COMFYUI_PORT=8188
COMFYUI_LISTEN=0.0.0.0
COMFYUI_EXTRA_ARGS=$comfyui_args
COMFYUI_DIR=${COMFYUI_DIR:-${SERVICES_DIR}/ComfyUI}
EOF
    
    local sd_args=""
    if [[ "$has_gpu" != "true" ]]; then
        sd_args="--skip-torch-cuda-test --use-cpu all --no-half"
    elif [[ "$vram_mb" -lt 4000 ]]; then
        sd_args="--lowvram --opt-sub-quad-attention"
    elif [[ "$vram_mb" -lt 6000 ]]; then
        sd_args="--medvram --opt-sdp-attention"
    else
        sd_args="--xformers"
    fi
    
    cat > "$output_dir/sd.conf" << EOF
SD_WEBUI_PORT=7860
SD_WEBUI_LISTEN=0.0.0.0
SD_WEBUI_EXTRA_ARGS=$sd_args
SD_WEBUI_API=true
SD_DIR=${SD_DIR:-${SERVICES_DIR}/stable-diffusion-webui}
EOF
    
    log_success "Generated service configurations"
}

generate_service_map() {
    local profile_file="$1"
    local output_file="$2"
    
    log_info "Generating service-map.yml..."
    
    local node_id
    node_id=$(jq -r '.node_id' "$profile_file")
    local primary_ip
    primary_ip=$(jq -r '.network.primary_ip' "$profile_file")
    local tailscale_ip
    tailscale_ip=$(jq -r '.network.tailscale_ip // empty' "$profile_file")
    local can_run_llm
    can_run_llm=$(jq -r '.capabilities.can_run_llm' "$profile_file")
    local can_run_sd
    can_run_sd=$(jq -r '.capabilities.can_run_sd' "$profile_file")
    local can_run_comfyui
    can_run_comfyui=$(jq -r '.capabilities.can_run_comfyui' "$profile_file")
    
    cat > "$output_file" << EOF
# Nebula Command Service Map
# Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Node: $node_id

nodes:
  $node_id:
    description: "AI compute node (auto-configured)"
    primary_ip: "$primary_ip"
    tailscale_ip: "${tailscale_ip:-$primary_ip}"
    access:
      ssh: 22
    services:
EOF

    if [[ "$can_run_llm" == "true" ]]; then
        cat >> "$output_file" << EOF
      ollama:
        description: "Local LLM inference"
        port: 11434
        enabled: true
        commands:
          start: "sudo systemctl start ollama"
          stop: "sudo systemctl stop ollama"
          status: "sudo systemctl is-active ollama"
          health: "curl -sf http://localhost:11434/api/tags"
EOF
    fi

    if [[ "$can_run_comfyui" == "true" ]]; then
        cat >> "$output_file" << EOF
      comfyui:
        description: "Node-based image/video generation"
        port: 8188
        enabled: true
        gpu_required: true
        commands:
          start: "sudo systemctl start comfyui"
          stop: "sudo systemctl stop comfyui"
          status: "sudo systemctl is-active comfyui"
          health: "curl -sf http://localhost:8188/system_stats"
EOF
    fi

    if [[ "$can_run_sd" == "true" ]]; then
        cat >> "$output_file" << EOF
      stable-diffusion:
        description: "Image generation with GPU"
        port: 7860
        enabled: true
        gpu_required: true
        commands:
          start: "sudo systemctl start stable-diffusion"
          stop: "sudo systemctl stop stable-diffusion"
          status: "sudo systemctl is-active stable-diffusion"
          health: "curl -sf http://localhost:7860/sdapi/v1/progress"
EOF
    fi
    
    log_success "Generated service-map.yml"
}

###############################################################################
# SYSTEMD SERVICE MANAGEMENT
###############################################################################

create_systemd_services() {
    local profile_file="$1"
    local config_dir="$2"
    
    log_step "Creating systemd service units..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would create systemd services"
        return 0
    fi
    
    local vram_mb
    vram_mb=$(jq -r '.capabilities.vram_mb' "$profile_file")
    local gpu_vendor
    gpu_vendor=$(jq -r '.capabilities.gpu_vendor' "$profile_file")
    
    if command -v ollama &> /dev/null; then
        create_ollama_service "$config_dir"
    fi
    
    local comfyui_dir="${COMFYUI_DIR:-${SERVICES_DIR}/ComfyUI}"
    if [[ -d "$comfyui_dir" ]]; then
        create_comfyui_service "$config_dir" "$comfyui_dir" "$vram_mb" "$gpu_vendor"
    fi
    
    local sd_dir="${SD_DIR:-${SERVICES_DIR}/stable-diffusion-webui}"
    if [[ -d "$sd_dir" ]]; then
        create_sd_service "$config_dir" "$sd_dir" "$vram_mb"
    fi
    
    create_nebula_watchdog_service
    
    sudo systemctl daemon-reload
    log_success "Systemd services created"
}

create_ollama_service() {
    local config_dir="$1"
    
    log_info "Creating Ollama systemd service..."
    
    local env_file="$config_dir/ollama.conf"
    
    sudo tee /etc/systemd/system/ollama.service > /dev/null << EOF
[Unit]
Description=Ollama AI Service
Documentation=https://ollama.ai
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ollama
Group=ollama
ExecStart=/usr/local/bin/ollama serve
Restart=always
RestartSec=3
TimeoutStopSec=30

EnvironmentFile=-$env_file
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_ORIGINS=*"
Environment="OLLAMA_KEEP_ALIVE=5m"

LimitNOFILE=65535
LimitNPROC=65535

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/var/lib/ollama /home/ollama/.ollama

WatchdogSec=60
NotifyAccess=main

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl enable ollama 2>/dev/null || true
    log_success "Ollama service created"
}

create_comfyui_service() {
    local config_dir="$1"
    local comfyui_dir="$2"
    local vram_mb="$3"
    local gpu_vendor="$4"
    
    log_info "Creating ComfyUI systemd service..."
    
    local extra_args=""
    if [[ "$vram_mb" -lt 4000 ]]; then
        extra_args="--cpu"
    elif [[ "$gpu_vendor" == "amd" ]]; then
        extra_args="--directml"
    elif [[ "$vram_mb" -lt 6000 ]]; then
        extra_args="--lowvram"
    elif [[ "$vram_mb" -lt 8000 ]]; then
        extra_args="--normalvram"
    else
        extra_args="--highvram"
    fi
    
    local run_user="${SUDO_USER:-$USER}"
    
    sudo tee /etc/systemd/system/comfyui.service > /dev/null << EOF
[Unit]
Description=ComfyUI Image Generation Service
Documentation=https://github.com/comfyanonymous/ComfyUI
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$run_user
WorkingDirectory=$comfyui_dir
ExecStart=$comfyui_dir/venv/bin/python main.py --listen 0.0.0.0 --port 8188 $extra_args
Restart=always
RestartSec=5
TimeoutStopSec=30

Environment="PYTHONUNBUFFERED=1"

LimitNOFILE=65535

SupplementaryGroups=video render

WatchdogSec=120
NotifyAccess=main

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl enable comfyui 2>/dev/null || true
    log_success "ComfyUI service created"
}

create_sd_service() {
    local config_dir="$1"
    local sd_dir="$2"
    local vram_mb="$3"
    
    log_info "Creating Stable Diffusion systemd service..."
    
    local extra_args="--api --listen"
    if [[ "$vram_mb" -lt 4000 ]]; then
        extra_args="$extra_args --lowvram --opt-sub-quad-attention"
    elif [[ "$vram_mb" -lt 6000 ]]; then
        extra_args="$extra_args --medvram --opt-sdp-attention"
    else
        extra_args="$extra_args --xformers"
    fi
    
    local run_user="${SUDO_USER:-$USER}"
    
    sudo tee /etc/systemd/system/stable-diffusion.service > /dev/null << EOF
[Unit]
Description=Stable Diffusion WebUI Service
Documentation=https://github.com/AUTOMATIC1111/stable-diffusion-webui
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$run_user
WorkingDirectory=$sd_dir
ExecStart=$sd_dir/venv/bin/python launch.py $extra_args --port 7860
Restart=always
RestartSec=5
TimeoutStopSec=60

Environment="PYTHONUNBUFFERED=1"

LimitNOFILE=65535

SupplementaryGroups=video render

WatchdogSec=180
NotifyAccess=main

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl enable stable-diffusion 2>/dev/null || true
    log_success "Stable Diffusion service created"
}

create_nebula_watchdog_service() {
    log_info "Creating Nebula watchdog service..."
    
    sudo tee /etc/systemd/system/nebula-watchdog.service > /dev/null << EOF
[Unit]
Description=Nebula Command Service Watchdog
After=network-online.target ollama.service comfyui.service stable-diffusion.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=$NEBULA_HOME/scripts/watchdog.sh
RemainAfterExit=no

[Install]
WantedBy=multi-user.target
EOF

    sudo tee /etc/systemd/system/nebula-watchdog.timer > /dev/null << EOF
[Unit]
Description=Nebula Command Watchdog Timer
Requires=nebula-watchdog.service

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
AccuracySec=1min

[Install]
WantedBy=timers.target
EOF

    mkdir -p "$NEBULA_HOME/scripts"
    
    cat > "$NEBULA_HOME/scripts/watchdog.sh" << 'WATCHDOG'
#!/bin/bash
LOG_FILE="/opt/nebula-command/logs/watchdog.log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

check_service() {
    local service="$1"
    local port="$2"
    local health_endpoint="$3"
    
    if ! systemctl is-active --quiet "$service" 2>/dev/null; then
        return 1
    fi
    
    if [[ -n "$health_endpoint" ]]; then
        if ! curl -sf --connect-timeout 5 "$health_endpoint" > /dev/null 2>&1; then
            return 1
        fi
    fi
    
    return 0
}

restart_service() {
    local service="$1"
    log "Restarting $service..."
    sudo systemctl restart "$service"
    sleep 5
}

if systemctl is-enabled --quiet ollama 2>/dev/null; then
    if ! check_service "ollama" 11434 "http://localhost:11434/api/tags"; then
        log "Ollama health check failed"
        restart_service "ollama"
    fi
fi

if systemctl is-enabled --quiet comfyui 2>/dev/null; then
    if ! check_service "comfyui" 8188 "http://localhost:8188/system_stats"; then
        log "ComfyUI health check failed"
        restart_service "comfyui"
    fi
fi

if systemctl is-enabled --quiet stable-diffusion 2>/dev/null; then
    if ! check_service "stable-diffusion" 7860 "http://localhost:7860/sdapi/v1/progress"; then
        log "Stable Diffusion health check failed"
        restart_service "stable-diffusion"
    fi
fi

log "Watchdog check complete"
WATCHDOG

    chmod +x "$NEBULA_HOME/scripts/watchdog.sh"
    
    sudo systemctl enable nebula-watchdog.timer 2>/dev/null || true
    sudo systemctl start nebula-watchdog.timer 2>/dev/null || true
    
    log_success "Watchdog service created"
}

start_services() {
    local profile_file="$1"
    
    log_step "Starting services..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would start services"
        return 0
    fi
    
    if systemctl is-enabled --quiet ollama 2>/dev/null; then
        sudo systemctl start ollama
        log_success "Ollama started"
    fi
    
    if systemctl is-enabled --quiet comfyui 2>/dev/null; then
        sudo systemctl start comfyui
        log_success "ComfyUI started"
    fi
    
    if systemctl is-enabled --quiet stable-diffusion 2>/dev/null; then
        sudo systemctl start stable-diffusion
        log_success "Stable Diffusion started"
    fi
}

###############################################################################
# VALIDATION AND HEALTH CHECKS
###############################################################################

health_check() {
    local service="$1"
    local port="$2"
    local endpoint="$3"
    local max_retries="${4:-5}"
    local retry_delay="${5:-3}"
    
    local retry=0
    while [[ $retry -lt $max_retries ]]; do
        if curl -sf --connect-timeout 5 "http://localhost:${port}${endpoint}" > /dev/null 2>&1; then
            return 0
        fi
        retry=$((retry + 1))
        sleep "$retry_delay"
    done
    
    return 1
}

validate_deployment() {
    log_step "Validating deployment..."
    
    local all_healthy=true
    local results=()
    
    echo ""
    echo "Service Health Status:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    if systemctl is-enabled --quiet ollama 2>/dev/null; then
        if systemctl is-active --quiet ollama && health_check "ollama" 11434 "/api/tags" 3 2; then
            echo -e "  Ollama (11434):         ${GREEN}✓ HEALTHY${NC}"
            results+=("ollama:healthy")
        else
            echo -e "  Ollama (11434):         ${RED}✗ UNHEALTHY${NC}"
            results+=("ollama:unhealthy")
            all_healthy=false
        fi
    else
        echo -e "  Ollama (11434):         ${YELLOW}○ NOT INSTALLED${NC}"
        results+=("ollama:not_installed")
    fi
    
    if systemctl is-enabled --quiet comfyui 2>/dev/null; then
        if systemctl is-active --quiet comfyui && health_check "comfyui" 8188 "/system_stats" 5 3; then
            echo -e "  ComfyUI (8188):         ${GREEN}✓ HEALTHY${NC}"
            results+=("comfyui:healthy")
        else
            echo -e "  ComfyUI (8188):         ${RED}✗ UNHEALTHY${NC}"
            results+=("comfyui:unhealthy")
            all_healthy=false
        fi
    else
        echo -e "  ComfyUI (8188):         ${YELLOW}○ NOT INSTALLED${NC}"
        results+=("comfyui:not_installed")
    fi
    
    if systemctl is-enabled --quiet stable-diffusion 2>/dev/null; then
        if systemctl is-active --quiet stable-diffusion && health_check "stable-diffusion" 7860 "/sdapi/v1/progress" 10 5; then
            echo -e "  Stable Diffusion (7860): ${GREEN}✓ HEALTHY${NC}"
            results+=("sd:healthy")
        else
            echo -e "  Stable Diffusion (7860): ${RED}✗ UNHEALTHY${NC}"
            results+=("sd:unhealthy")
            all_healthy=false
        fi
    else
        echo -e "  Stable Diffusion (7860): ${YELLOW}○ NOT INSTALLED${NC}"
        results+=("sd:not_installed")
    fi
    
    if systemctl is-enabled --quiet nebula-dashboard 2>/dev/null; then
        if systemctl is-active --quiet nebula-dashboard && health_check "nebula-dashboard" 5000 "/" 5 3; then
            echo -e "  Dashboard (5000):        ${GREEN}✓ HEALTHY${NC}"
            results+=("dashboard:healthy")
        else
            echo -e "  Dashboard (5000):        ${RED}✗ UNHEALTHY${NC}"
            results+=("dashboard:unhealthy")
            all_healthy=false
        fi
    else
        echo -e "  Dashboard (5000):        ${YELLOW}○ NOT INSTALLED${NC}"
        results+=("dashboard:not_installed")
    fi
    
    if systemctl is-enabled --quiet nebula-discord-bot 2>/dev/null; then
        if systemctl is-active --quiet nebula-discord-bot; then
            echo -e "  Discord Bot:             ${GREEN}✓ RUNNING${NC}"
            results+=("discord-bot:healthy")
        else
            echo -e "  Discord Bot:             ${RED}✗ NOT RUNNING${NC}"
            results+=("discord-bot:unhealthy")
            all_healthy=false
        fi
    else
        echo -e "  Discord Bot:             ${YELLOW}○ NOT INSTALLED${NC}"
        results+=("discord-bot:not_installed")
    fi
    
    if systemctl is-enabled --quiet nebula-stream-bot 2>/dev/null; then
        if systemctl is-active --quiet nebula-stream-bot && health_check "nebula-stream-bot" 3000 "/" 5 3; then
            echo -e "  Stream Bot (3000):       ${GREEN}✓ HEALTHY${NC}"
            results+=("stream-bot:healthy")
        else
            echo -e "  Stream Bot (3000):       ${RED}✗ UNHEALTHY${NC}"
            results+=("stream-bot:unhealthy")
            all_healthy=false
        fi
    else
        echo -e "  Stream Bot (3000):       ${YELLOW}○ NOT INSTALLED${NC}"
        results+=("stream-bot:not_installed")
    fi
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    local healthy_count=0
    local unhealthy_count=0
    for result in "${results[@]}"; do
        if [[ "$result" == *":healthy"* ]]; then
            ((healthy_count++))
        elif [[ "$result" == *":unhealthy"* ]]; then
            ((unhealthy_count++))
        fi
    done
    
    echo ""
    if [[ "$all_healthy" == "true" ]]; then
        echo -e "${GREEN}✓ SMOKE TEST PASSED${NC} - All $healthy_count enabled services are healthy"
    else
        echo -e "${RED}✗ SMOKE TEST FAILED${NC} - $unhealthy_count service(s) unhealthy, $healthy_count healthy"
    fi
    
    local validation_file="$STATE_DIR/validation-$(date +%Y%m%d-%H%M%S).json"
    cat > "$validation_file" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "all_healthy": $all_healthy,
  "results": $(printf '%s\n' "${results[@]}" | jq -R . | jq -s 'map(split(":") | {(.[0]): .[1]}) | add')
}
EOF
    
    log_info "Validation results saved to: $validation_file"
    
    if [[ "$all_healthy" == "true" ]]; then
        return 0
    else
        return 1
    fi
}

###############################################################################
# NODE REGISTRATION
###############################################################################

register_node() {
    local profile_file="$1"
    
    if [[ -z "$DASHBOARD_URL" ]]; then
        log_info "No DASHBOARD_URL set, skipping node registration"
        return 0
    fi
    
    log_step "Registering node with dashboard..."
    
    local node_id
    node_id=$(jq -r '.node_id' "$profile_file")
    local payload
    payload=$(cat "$profile_file")
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would register node: $node_id"
        return 0
    fi
    
    local response
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        --connect-timeout 10 \
        --max-time 30 \
        "${DASHBOARD_URL}/api/nodes/register" 2>/dev/null || echo '{"error":"connection_failed"}')
    
    if echo "$response" | jq -e '.success' &> /dev/null; then
        log_success "Node registered: $node_id"
    else
        log_warn "Node registration failed (dashboard may be unreachable)"
        log_debug "Response: $response"
    fi
}

###############################################################################
# SUMMARY
###############################################################################

print_summary() {
    local profile_file="$1"
    local config_dir="$2"
    
    local node_id
    node_id=$(jq -r '.node_id' "$profile_file")
    local primary_ip
    primary_ip=$(jq -r '.network.primary_ip' "$profile_file")
    local tailscale_ip
    tailscale_ip=$(jq -r '.network.tailscale_ip // empty' "$profile_file")
    local advertise_ip="${tailscale_ip:-$primary_ip}"
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  ${BOLD}Nebula Command - Deployment Complete${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  Node ID:        ${CYAN}$node_id${NC}"
    echo "  Config Dir:     $config_dir"
    echo "  Primary IP:     $primary_ip"
    [[ -n "$tailscale_ip" ]] && echo "  Tailscale IP:   $tailscale_ip"
    echo ""
    echo "  ${BOLD}Service Endpoints:${NC}"
    
    if systemctl is-active --quiet ollama 2>/dev/null; then
        echo "    • Ollama:           http://${advertise_ip}:11434"
    fi
    
    if systemctl is-active --quiet comfyui 2>/dev/null; then
        echo "    • ComfyUI:          http://${advertise_ip}:8188"
    fi
    
    if systemctl is-active --quiet stable-diffusion 2>/dev/null; then
        echo "    • Stable Diffusion: http://${advertise_ip}:7860"
    fi
    
    echo ""
    echo "  ${BOLD}Useful Commands:${NC}"
    echo "    • Check status:     systemctl status ollama comfyui stable-diffusion"
    echo "    • View logs:        journalctl -u ollama -f"
    echo "    • Restart service:  sudo systemctl restart ollama"
    echo ""
    echo "  ${BOLD}Files:${NC}"
    echo "    • Deploy log:       $DEPLOY_LOG"
    echo "    • Hardware profile: $STATE_DIR/hardware-profile.json"
    echo "    • Service map:      $config_dir/service-map.yml"
    echo ""
    
    if [[ -f "$STATE_DIR/recommended-models.txt" ]]; then
        echo "  ${BOLD}Recommended Ollama Models:${NC}"
        while IFS= read -r model; do
            echo "    • $model"
        done < "$STATE_DIR/recommended-models.txt"
        echo ""
        echo "  Pull models with:"
        echo "    while read m; do ollama pull \$m; done < $STATE_DIR/recommended-models.txt"
        echo ""
    fi
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

###############################################################################
# MAIN FLOW
###############################################################################

show_help() {
    cat << EOF
Nebula Command - Linux Deployment Bootstrap Script

Usage: $0 [OPTIONS]

Options:
  --dashboard-url URL     Dashboard URL for node registration
  --nebula-home DIR       Installation directory (default: /opt/nebula-command)
  --no-ollama             Skip Ollama installation
  --no-comfyui            Skip ComfyUI installation
  --no-sd                 Skip Stable Diffusion installation
  --no-dashboard          Skip dashboard installation
  --no-bots               Skip bot services installation
  --force-comfyui         Install ComfyUI even without capable GPU
  --force-sd              Install Stable Diffusion even without capable GPU
  --skip-gpu-drivers      Skip GPU driver installation
  --dry-run               Show what would be done without making changes
  --non-interactive       Run without prompts (for CI/automation)
  --verbose               Enable verbose output
  --help                  Show this help message

Environment Variables:
  NEBULA_HOME             Installation directory
  CONFIG_DIR              Configuration directory
  DASHBOARD_URL           Dashboard URL for registration
  INSTALL_OLLAMA          Install Ollama (true/false)
  INSTALL_COMFYUI         Install ComfyUI (true/false/auto)
  INSTALL_SD              Install Stable Diffusion (true/false/auto)
  CI                      Enable CI mode (non-interactive)
  DRY_RUN                 Dry run mode
  VERBOSE                 Verbose output

Examples:
  # Full installation with default settings
  $0

  # Install with custom home directory
  $0 --nebula-home /home/user/nebula

  # Non-interactive installation for CI
  CI=true $0 --non-interactive

  # Dry run to see what would be installed
  $0 --dry-run

  # Skip GPU services, only install Ollama
  $0 --no-comfyui --no-sd

EOF
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dashboard-url)
                DASHBOARD_URL="$2"
                shift 2
                ;;
            --nebula-home)
                NEBULA_HOME="$2"
                CONFIG_DIR="$NEBULA_HOME/config"
                STATE_DIR="$NEBULA_HOME/state"
                LOG_DIR="$NEBULA_HOME/logs"
                SERVICES_DIR="$NEBULA_HOME/services"
                shift 2
                ;;
            --no-ollama)
                INSTALL_OLLAMA="false"
                shift
                ;;
            --no-comfyui)
                INSTALL_COMFYUI="false"
                shift
                ;;
            --no-sd)
                INSTALL_SD="false"
                shift
                ;;
            --no-dashboard)
                INSTALL_DASHBOARD="false"
                shift
                ;;
            --no-bots)
                INSTALL_BOTS="false"
                shift
                ;;
            --force-comfyui)
                INSTALL_COMFYUI="true"
                shift
                ;;
            --force-sd)
                INSTALL_SD="true"
                shift
                ;;
            --skip-gpu-drivers)
                SKIP_GPU_DRIVERS="true"
                shift
                ;;
            --dry-run)
                DRY_RUN="true"
                shift
                ;;
            --non-interactive)
                INTERACTIVE="false"
                shift
                ;;
            --verbose)
                VERBOSE="true"
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done
}

main() {
    parse_args "$@"
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  ${BOLD}Nebula Command - Automated Node Bootstrap${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_warn "DRY RUN MODE - No changes will be made"
    fi
    
    mkdir -p "$NEBULA_HOME" "$CONFIG_DIR" "$STATE_DIR" "$LOG_DIR" "$SERVICES_DIR"
    
    init_logging
    
    check_root
    
    install_base_dependencies
    
    local profile_file
    profile_file=$(detect_hardware)
    
    install_nvidia_drivers "$profile_file"
    install_rocm "$profile_file"
    
    local node_id
    node_id=$(jq -r '.node_id' "$profile_file")
    local node_config_dir="$CONFIG_DIR/$node_id"
    mkdir -p "$node_config_dir"
    
    generate_env_file "$profile_file" "$node_config_dir"
    generate_service_configs "$profile_file" "$node_config_dir"
    generate_service_map "$profile_file" "$node_config_dir/service-map.yml"
    
    install_ollama "$profile_file"
    configure_ollama_models "$profile_file"
    install_comfyui "$profile_file"
    install_stable_diffusion "$profile_file"
    install_dashboard_and_bots "$profile_file"
    
    create_systemd_services "$profile_file" "$node_config_dir"
    start_services "$profile_file"
    
    sleep 5
    
    validate_deployment || log_warn "Some services may still be starting up"
    
    register_node "$profile_file"
    
    print_summary "$profile_file" "$node_config_dir"
    
    log_success "Deployment complete!"
    log_info "Log file: $DEPLOY_LOG"
}

main "$@"
