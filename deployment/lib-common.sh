#!/bin/bash
################################################################################
# Common Library for Deployment Scripts
#
# This library provides standardized functions for:
# - Logging and output formatting
# - Signal handling and cleanup
# - Lock file management
# - Input validation
# - Help documentation
# - Dry-run mode support
#
# Usage: source "${SCRIPT_DIR}/lib-common.sh"
################################################################################

# Prevent double-sourcing
if [ -n "${_LIB_COMMON_LOADED:-}" ]; then
    return 0
fi
_LIB_COMMON_LOADED=1

# ===== COLOR DEFINITIONS =====
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    MAGENTA='\033[0;35m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    DIM='\033[2m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    MAGENTA=''
    CYAN=''
    BOLD=''
    DIM=''
    NC=''
fi

# Export color codes for use in subshells if needed
export RED GREEN YELLOW BLUE MAGENTA CYAN BOLD DIM NC

# ===== LOGGING FUNCTIONS =====
log_info() {
    echo -e "${BLUE}[ℹ]${NC} $*" | tee -a "${LOG_FILE:-/dev/null}"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $*" | tee -a "${LOG_FILE:-/dev/null}"
}

log_warning() {
    echo -e "${YELLOW}[⚠]${NC} $*" | tee -a "${LOG_FILE:-/dev/null}"
}

log_error() {
    echo -e "${RED}[✗]${NC} $*" >&2 | tee -a "${LOG_FILE:-/dev/null}"
}

log_debug() {
    if [ "${DEBUG:-0}" = "1" ]; then
        echo -e "${DIM}[DEBUG]${NC} $*" | tee -a "${LOG_FILE:-/dev/null}"
    fi
}

log_section() {
    echo "" | tee -a "${LOG_FILE:-/dev/null}"
    echo -e "${CYAN}${BOLD}━━━ $* ━━━${NC}" | tee -a "${LOG_FILE:-/dev/null}"
}

# ===== DRY-RUN MODE =====
DRY_RUN=${DRY_RUN:-false}

run_cmd() {
    local cmd="$*"
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "[DRY-RUN] Would execute: $cmd"
        return 0
    else
        log_debug "Executing: $cmd"
        eval "$cmd"
        return $?
    fi
}

check_dry_run() {
    if [ "$DRY_RUN" = "true" ]; then
        log_warning "DRY-RUN MODE ENABLED - No changes will be made"
        echo ""
    fi
}

# ===== LOCK FILE MANAGEMENT =====
LOCK_FILE=""
LOCK_FD=""

acquire_lock() {
    local lock_name="${1:-script}"
    local timeout="${2:-0}"
    LOCK_FILE="/tmp/${lock_name}.lock"
    
    exec 200>"${LOCK_FILE}"
    LOCK_FD=200
    
    if [ "$timeout" -gt 0 ]; then
        if ! flock -w "$timeout" 200; then
            log_error "Could not acquire lock (timeout after ${timeout}s). Another instance may be running."
            exit 1
        fi
    else
        if ! flock -n 200; then
            log_error "Could not acquire lock. Another instance is already running."
            log_info "Lock file: ${LOCK_FILE}"
            exit 1
        fi
    fi
    
    log_debug "Lock acquired: ${LOCK_FILE}"
    echo $$ >&200
}

release_lock() {
    if [ -n "${LOCK_FD}" ]; then
        flock -u "${LOCK_FD}" 2>/dev/null || true
        exec 200>&- || true
        rm -f "${LOCK_FILE}" 2>/dev/null || true
        log_debug "Lock released: ${LOCK_FILE}"
    fi
}

# ===== SIGNAL HANDLING =====
CLEANUP_FUNCTIONS=()

add_cleanup_function() {
    CLEANUP_FUNCTIONS+=("$1")
}

cleanup_handler() {
    local exit_code=$?
    
    log_debug "Running cleanup handlers..."
    
    for cleanup_func in "${CLEANUP_FUNCTIONS[@]}"; do
        if declare -f "$cleanup_func" > /dev/null; then
            log_debug "Running cleanup function: $cleanup_func"
            $cleanup_func || true
        fi
    done
    
    release_lock
    
    if [ $exit_code -ne 0 ]; then
        log_error "Script exited with code: $exit_code"
    fi
    
    exit $exit_code
}

setup_signal_handlers() {
    trap cleanup_handler EXIT
    trap 'log_warning "Received SIGINT, cleaning up..."; exit 130' INT
    trap 'log_warning "Received SIGTERM, cleaning up..."; exit 143' TERM
    trap 'log_warning "Received SIGHUP, cleaning up..."; exit 129' HUP
}

# ===== INPUT VALIDATION =====
validate_not_empty() {
    local var_name="$1"
    local var_value="$2"
    
    if [ -z "$var_value" ]; then
        log_error "${var_name} cannot be empty"
        return 1
    fi
    return 0
}

validate_file_exists() {
    local file_path="$1"
    local description="${2:-File}"
    
    if [ ! -f "$file_path" ]; then
        log_error "${description} not found: ${file_path}"
        return 1
    fi
    return 0
}

validate_dir_exists() {
    local dir_path="$1"
    local description="${2:-Directory}"
    
    if [ ! -d "$dir_path" ]; then
        log_error "${description} not found: ${dir_path}"
        return 1
    fi
    return 0
}

validate_command_exists() {
    local cmd="$1"
    local description="${2:-$cmd}"
    
    if ! command -v "$cmd" &> /dev/null; then
        log_error "${description} command not found: ${cmd}"
        return 1
    fi
    return 0
}

validate_docker_running() {
    if ! docker info &> /dev/null; then
        log_error "Docker is not running or not accessible"
        return 1
    fi
    return 0
}

validate_container_running() {
    local container_name="$1"
    
    if ! docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
        log_error "Container '${container_name}' is not running"
        return 1
    fi
    return 0
}

# ===== USER CONFIRMATION =====
confirm_action() {
    local prompt="${1:-Continue?}"
    local default="${2:-n}"
    
    if [ "$DRY_RUN" = "true" ]; then
        return 0
    fi
    
    if [ "${FORCE:-false}" = "true" ]; then
        log_debug "Force flag set, skipping confirmation"
        return 0
    fi
    
    local yn
    if [ "$default" = "y" ]; then
        read -r -p "$(echo -e "${YELLOW}${prompt} [Y/n]:${NC} ")" yn
        yn=${yn:-y}
    else
        read -r -p "$(echo -e "${YELLOW}${prompt} [y/N]:${NC} ")" yn
        yn=${yn:-n}
    fi
    
    case $yn in
        [Yy]* ) return 0;;
        * ) log_info "Operation cancelled."; return 1;;
    esac
}

# ===== HELP DOCUMENTATION =====
show_help() {
    local script_name="${1:-Script}"
    local description="${2:-No description provided}"
    local usage="${3:-$0 [OPTIONS]}"
    local options="${4:-}"
    local examples="${5:-}"
    
    cat <<EOF
${BOLD}${script_name}${NC}

${description}

${BOLD}USAGE:${NC}
    ${usage}

${BOLD}OPTIONS:${NC}
    -h, --help          Show this help message
    -v, --verbose       Enable verbose output
    -d, --debug         Enable debug output
    -n, --dry-run       Show what would be done without making changes
    -f, --force         Skip confirmation prompts
    -l, --log FILE      Write output to log file
${options}

${BOLD}ENVIRONMENT VARIABLES:${NC}
    DRY_RUN=true        Enable dry-run mode
    DEBUG=1             Enable debug output
    FORCE=true          Skip confirmations
    LOG_FILE=path       Path to log file

${examples}
EOF
}

# ===== PROGRESS INDICATORS =====
show_spinner() {
    local pid=$1
    local message="${2:-Processing...}"
    local spinstr='|/-\'
    
    while kill -0 "$pid" 2>/dev/null; do
        local temp=${spinstr#?}
        printf "\r%s [%c]  " "$message" "$spinstr"
        spinstr=$temp${spinstr%"$temp"}
        sleep 0.1
    done
    printf "\r%s [✓]\n" "$message"
}

show_progress() {
    local current=$1
    local total=$2
    local message="${3:-Progress}"
    local percent=$((current * 100 / total))
    local filled=$((percent / 2))
    local empty=$((50 - filled))
    
    printf "\r${message}: ["
    printf "%${filled}s" | tr ' ' '█'
    printf "%${empty}s" | tr ' ' '░'
    printf "] %3d%% (%d/%d)" "$percent" "$current" "$total"
    
    if [ "$current" -eq "$total" ]; then
        echo ""
    fi
}

# ===== TIMESTAMP UTILITIES =====
get_timestamp() {
    date '+%Y%m%d_%H%M%S'
}

get_iso_timestamp() {
    date -u +%Y-%m-%dT%H:%M:%SZ
}

# ===== DOCKER COMPOSE DETECTION =====
detect_docker_compose() {
    if docker compose version &> /dev/null 2>&1; then
        echo "docker compose"
    elif command -v docker-compose &> /dev/null; then
        echo "docker-compose"
    else
        log_error "Docker Compose not found"
        return 1
    fi
}

# ===== INITIALIZATION =====
init_script() {
    local script_name="${1:-script}"
    local enable_lock="${2:-true}"
    local lock_timeout="${3:-0}"
    
    setup_signal_handlers
    check_dry_run
    
    if [ "$enable_lock" = "true" ]; then
        acquire_lock "$script_name" "$lock_timeout"
    fi
}

# Export functions for use in subshells
export -f log_info log_success log_warning log_error log_debug log_section
export -f run_cmd check_dry_run confirm_action
export -f validate_not_empty validate_file_exists validate_dir_exists
export -f validate_command_exists validate_docker_running validate_container_running
export -f get_timestamp get_iso_timestamp
