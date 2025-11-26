#!/bin/bash
# ╔════════════════════════════════════════════════════════════════════════════╗
# ║              DEPENDENCY CHECK - Homelab Prerequisites Validator           ║
# ╚════════════════════════════════════════════════════════════════════════════╝
# Detects missing system packages, checks version compatibility,
# and validates language runtimes.

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m'

# Exit codes
EXIT_OK=0
EXIT_MISSING_DEPS=1
EXIT_VERSION_MISMATCH=2

# Minimum versions
MIN_DOCKER_VERSION="20.10"
MIN_COMPOSE_VERSION="2.0"
MIN_NODE_VERSION="18"
MIN_PYTHON_VERSION="3.9"

# Required system packages
REQUIRED_PACKAGES=(
    "docker"
    "curl"
    "jq"
    "openssl"
    "git"
)

# Optional but recommended packages
OPTIONAL_PACKAGES=(
    "htop"
    "vim"
    "netcat"
    "dig"
    "make"
)

# Initialize counters
MISSING_COUNT=0
WARNINGS_COUNT=0

log() {
    echo -e "$1"
}

log_section() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# Compare versions (returns 0 if $1 >= $2)
version_gte() {
    [ "$(printf '%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]
}

# Check if command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# Get package install command based on distro
get_install_cmd() {
    if command_exists apt-get; then
        echo "sudo apt-get install -y"
    elif command_exists dnf; then
        echo "sudo dnf install -y"
    elif command_exists yum; then
        echo "sudo yum install -y"
    elif command_exists pacman; then
        echo "sudo pacman -S --noconfirm"
    elif command_exists brew; then
        echo "brew install"
    else
        echo "# Package manager not detected - install manually:"
    fi
}

# ============================================================================
# SYSTEM PACKAGES CHECK
# ============================================================================
check_system_packages() {
    log_section "System Package Detection"
    
    local install_cmd=$(get_install_cmd)
    local missing_packages=()
    
    for pkg in "${REQUIRED_PACKAGES[@]}"; do
        if command_exists "$pkg"; then
            log "  ${GREEN}✓${NC} $pkg installed"
        else
            log "  ${RED}✗${NC} $pkg - MISSING (required)"
            missing_packages+=("$pkg")
            ((MISSING_COUNT++))
        fi
    done
    
    echo ""
    log "  ${CYAN}Optional packages:${NC}"
    
    for pkg in "${OPTIONAL_PACKAGES[@]}"; do
        if command_exists "$pkg"; then
            log "  ${GREEN}✓${NC} $pkg installed"
        else
            log "  ${YELLOW}○${NC} $pkg - not installed (optional)"
            ((WARNINGS_COUNT++))
        fi
    done
    
    if [ ${#missing_packages[@]} -gt 0 ]; then
        echo ""
        log "  ${RED}Missing required packages!${NC}"
        log "  Install with:"
        log "    ${CYAN}$install_cmd ${missing_packages[*]}${NC}"
    fi
}

# ============================================================================
# DOCKER VERSION CHECK
# ============================================================================
check_docker() {
    log_section "Docker Version Compatibility"
    
    if ! command_exists docker; then
        log "  ${RED}✗${NC} Docker not installed"
        log ""
        log "  Install Docker:"
        log "    ${CYAN}curl -fsSL https://get.docker.com | sh${NC}"
        log "    ${CYAN}sudo usermod -aG docker \$USER${NC}"
        ((MISSING_COUNT++))
        return
    fi
    
    # Check Docker version
    local docker_version=$(docker --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1)
    
    if version_gte "$docker_version" "$MIN_DOCKER_VERSION"; then
        log "  ${GREEN}✓${NC} Docker version: $docker_version (>= $MIN_DOCKER_VERSION)"
    else
        log "  ${YELLOW}⚠${NC} Docker version: $docker_version (recommended: >= $MIN_DOCKER_VERSION)"
        ((WARNINGS_COUNT++))
    fi
    
    # Check Docker daemon
    if docker info &>/dev/null; then
        log "  ${GREEN}✓${NC} Docker daemon running"
    else
        log "  ${RED}✗${NC} Docker daemon NOT running"
        log ""
        log "  Start Docker:"
        log "    ${CYAN}sudo systemctl start docker${NC}"
        log "    ${CYAN}sudo systemctl enable docker${NC}"
        ((MISSING_COUNT++))
    fi
    
    # Check Docker Compose
    if docker compose version &>/dev/null; then
        local compose_version=$(docker compose version --short 2>/dev/null)
        if version_gte "$compose_version" "$MIN_COMPOSE_VERSION"; then
            log "  ${GREEN}✓${NC} Docker Compose version: $compose_version (>= $MIN_COMPOSE_VERSION)"
        else
            log "  ${YELLOW}⚠${NC} Docker Compose version: $compose_version (recommended: >= $MIN_COMPOSE_VERSION)"
            ((WARNINGS_COUNT++))
        fi
    else
        log "  ${RED}✗${NC} Docker Compose not available"
        log ""
        log "  Docker Compose is included with Docker Desktop or can be installed via:"
        log "    ${CYAN}sudo apt-get install docker-compose-plugin${NC}"
        ((MISSING_COUNT++))
    fi
    
    # Check if user is in docker group
    if groups 2>/dev/null | grep -q docker; then
        log "  ${GREEN}✓${NC} User in docker group"
    else
        log "  ${YELLOW}⚠${NC} User not in docker group"
        log "    Add user: ${CYAN}sudo usermod -aG docker \$USER${NC}"
        log "    Then: log out and log back in"
        ((WARNINGS_COUNT++))
    fi
}

# ============================================================================
# NODE.JS VERSION CHECK
# ============================================================================
check_nodejs() {
    log_section "Node.js Version Check"
    
    if ! command_exists node; then
        log "  ${YELLOW}○${NC} Node.js not installed (only needed for local development)"
        log ""
        log "  Install Node.js:"
        log "    ${CYAN}curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -${NC}"
        log "    ${CYAN}sudo apt-get install -y nodejs${NC}"
        return
    fi
    
    local node_version=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1)
    
    if [ "$node_version" -ge "$MIN_NODE_VERSION" ]; then
        log "  ${GREEN}✓${NC} Node.js version: $(node --version) (>= v$MIN_NODE_VERSION)"
    else
        log "  ${YELLOW}⚠${NC} Node.js version: $(node --version) (recommended: >= v$MIN_NODE_VERSION)"
        ((WARNINGS_COUNT++))
    fi
    
    # Check npm
    if command_exists npm; then
        log "  ${GREEN}✓${NC} npm version: $(npm --version)"
    else
        log "  ${YELLOW}⚠${NC} npm not installed"
        ((WARNINGS_COUNT++))
    fi
    
    # Check for required npm packages in project
    if [ -f "package.json" ]; then
        log "  ${GREEN}✓${NC} package.json found"
    fi
}

# ============================================================================
# PYTHON VERSION CHECK
# ============================================================================
check_python() {
    log_section "Python Version Check"
    
    local python_cmd=""
    
    # Find Python 3
    if command_exists python3; then
        python_cmd="python3"
    elif command_exists python; then
        python_cmd="python"
    fi
    
    if [ -z "$python_cmd" ]; then
        log "  ${YELLOW}○${NC} Python not installed (only needed for local development)"
        log ""
        log "  Install Python:"
        log "    ${CYAN}sudo apt-get install -y python3 python3-pip${NC}"
        return
    fi
    
    local python_version=$($python_cmd --version 2>&1 | grep -oE '[0-9]+\.[0-9]+' | head -1)
    
    if version_gte "$python_version" "$MIN_PYTHON_VERSION"; then
        log "  ${GREEN}✓${NC} Python version: $python_version (>= $MIN_PYTHON_VERSION)"
    else
        log "  ${YELLOW}⚠${NC} Python version: $python_version (recommended: >= $MIN_PYTHON_VERSION)"
        ((WARNINGS_COUNT++))
    fi
    
    # Check pip
    if command_exists pip3 || command_exists pip; then
        local pip_version=$(pip3 --version 2>/dev/null || pip --version 2>/dev/null)
        log "  ${GREEN}✓${NC} pip installed"
    else
        log "  ${YELLOW}⚠${NC} pip not installed"
        log "    Install: ${CYAN}sudo apt-get install -y python3-pip${NC}"
        ((WARNINGS_COUNT++))
    fi
    
    # Check for virtualenv
    if command_exists virtualenv || $python_cmd -m venv --help &>/dev/null; then
        log "  ${GREEN}✓${NC} venv/virtualenv available"
    else
        log "  ${YELLOW}○${NC} virtualenv not available (optional)"
    fi
}

# ============================================================================
# DISK SPACE CHECK
# ============================================================================
check_disk_space() {
    log_section "Disk Space Check"
    
    local available_gb=$(df -BG . 2>/dev/null | awk 'NR==2 {print $4}' | sed 's/G//')
    
    if [ "$available_gb" -ge 20 ]; then
        log "  ${GREEN}✓${NC} Available disk space: ${available_gb}GB (>= 20GB recommended)"
    elif [ "$available_gb" -ge 10 ]; then
        log "  ${YELLOW}⚠${NC} Available disk space: ${available_gb}GB (20GB+ recommended)"
        ((WARNINGS_COUNT++))
    else
        log "  ${RED}✗${NC} Available disk space: ${available_gb}GB (CRITICAL: need at least 10GB)"
        ((MISSING_COUNT++))
    fi
}

# ============================================================================
# MEMORY CHECK
# ============================================================================
check_memory() {
    log_section "Memory Check"
    
    local total_mem_gb=$(free -g 2>/dev/null | awk 'NR==2 {print $2}')
    
    if [ "$total_mem_gb" -ge 8 ]; then
        log "  ${GREEN}✓${NC} Total memory: ${total_mem_gb}GB (>= 8GB recommended)"
    elif [ "$total_mem_gb" -ge 4 ]; then
        log "  ${YELLOW}⚠${NC} Total memory: ${total_mem_gb}GB (8GB+ recommended)"
        ((WARNINGS_COUNT++))
    else
        log "  ${RED}✗${NC} Total memory: ${total_mem_gb}GB (CRITICAL: need at least 4GB)"
        ((MISSING_COUNT++))
    fi
}

# ============================================================================
# PROJECT DEPENDENCIES CHECK
# ============================================================================
check_project_deps() {
    log_section "Project Dependencies"
    
    # Check for required files
    local required_files=(
        "docker-compose.yml"
        "Caddyfile"
        "homelab"
        "bootstrap-homelab.sh"
    )
    
    for file in "${required_files[@]}"; do
        if [ -f "$file" ]; then
            log "  ${GREEN}✓${NC} $file exists"
        else
            log "  ${RED}✗${NC} $file - MISSING"
            ((MISSING_COUNT++))
        fi
    done
    
    # Check for .env
    if [ -f ".env" ]; then
        log "  ${GREEN}✓${NC} .env file exists"
    else
        if [ -f ".env.example" ]; then
            log "  ${YELLOW}⚠${NC} .env file missing (copy from .env.example)"
            log "    Run: ${CYAN}cp .env.example .env${NC}"
            ((WARNINGS_COUNT++))
        else
            log "  ${RED}✗${NC} .env file missing"
            ((MISSING_COUNT++))
        fi
    fi
    
    # Check for config directory
    if [ -d "config" ]; then
        log "  ${GREEN}✓${NC} config/ directory exists"
    else
        log "  ${YELLOW}⚠${NC} config/ directory missing"
        ((WARNINGS_COUNT++))
    fi
}

# ============================================================================
# NETWORK CONNECTIVITY CHECK
# ============================================================================
check_network() {
    log_section "Network Connectivity"
    
    # Check internet connectivity
    if ping -c 1 -W 3 8.8.8.8 &>/dev/null; then
        log "  ${GREEN}✓${NC} Internet connectivity (ping)"
    else
        log "  ${RED}✗${NC} No internet connectivity"
        ((MISSING_COUNT++))
    fi
    
    # Check DNS resolution
    if host google.com &>/dev/null || nslookup google.com &>/dev/null 2>&1; then
        log "  ${GREEN}✓${NC} DNS resolution working"
    else
        log "  ${RED}✗${NC} DNS resolution failing"
        ((MISSING_COUNT++))
    fi
    
    # Check Docker Hub access
    if curl -s -o /dev/null -w "%{http_code}" https://hub.docker.com 2>/dev/null | grep -q "200\|301\|302"; then
        log "  ${GREEN}✓${NC} Docker Hub accessible"
    else
        log "  ${YELLOW}⚠${NC} Cannot reach Docker Hub (may need proxy)"
        ((WARNINGS_COUNT++))
    fi
}

# ============================================================================
# SUMMARY
# ============================================================================
print_summary() {
    log_section "Summary"
    
    if [ $MISSING_COUNT -eq 0 ] && [ $WARNINGS_COUNT -eq 0 ]; then
        log "  ${GREEN}✅ All dependencies satisfied!${NC}"
        log ""
        log "  Ready to run:"
        log "    ${CYAN}./bootstrap-homelab.sh${NC}"
    elif [ $MISSING_COUNT -eq 0 ]; then
        log "  ${YELLOW}⚠ All required dependencies satisfied with $WARNINGS_COUNT warning(s)${NC}"
        log ""
        log "  Can proceed with:"
        log "    ${CYAN}./bootstrap-homelab.sh${NC}"
    else
        log "  ${RED}❌ Missing $MISSING_COUNT required dependency/dependencies${NC}"
        log "  ${YELLOW}⚠ $WARNINGS_COUNT warning(s)${NC}"
        log ""
        log "  Fix missing dependencies before running bootstrap."
    fi
}

# ============================================================================
# MAIN
# ============================================================================
main() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║              DEPENDENCY CHECK - Homelab Prerequisites Validator           ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Checking system dependencies for HomeLabHub..."
    echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
    
    check_system_packages
    check_docker
    check_nodejs
    check_python
    check_disk_space
    check_memory
    check_project_deps
    check_network
    print_summary
    
    echo ""
    
    if [ $MISSING_COUNT -gt 0 ]; then
        exit $EXIT_MISSING_DEPS
    elif [ $WARNINGS_COUNT -gt 0 ]; then
        exit $EXIT_VERSION_MISMATCH
    else
        exit $EXIT_OK
    fi
}

# Usage
usage() {
    echo "Usage: $0 [--quiet|-q] [--json|-j]"
    echo ""
    echo "Options:"
    echo "  --quiet, -q    Suppress output, only return exit code"
    echo "  --json, -j     Output results as JSON"
    echo "  --help, -h     Show this help"
    echo ""
    echo "Exit codes:"
    echo "  0  All dependencies satisfied"
    echo "  1  Missing required dependencies"
    echo "  2  Version mismatch or warnings"
}

# Parse args
case "${1:-}" in
    --help|-h)
        usage
        exit 0
        ;;
    --quiet|-q)
        exec &>/dev/null
        main
        ;;
    --json|-j)
        echo "JSON output not yet implemented - run doctor for JSON output"
        exit 0
        ;;
    "")
        main
        ;;
    *)
        echo "Unknown option: $1"
        usage
        exit 1
        ;;
esac
