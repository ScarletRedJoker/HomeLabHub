#!/bin/bash
# NAS Auto-Discovery Script
# Scans the network to find NAS devices and their available shares
# Run with: sudo ./discover-nas.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

log_info() { echo -e "${CYAN}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_step() { echo -e "\n${MAGENTA}━━━ $* ━━━${NC}\n"; }

DISCOVERED_NAS=()
DISCOVERED_SHARES=()
OUTPUT_JSON=""
SCAN_TIMEOUT=5
AUTO_MOUNT=false
VERBOSE=false

parse_args() {
    for arg in "$@"; do
        case $arg in
            --auto-mount)
                AUTO_MOUNT=true
                ;;
            --verbose|-v)
                VERBOSE=true
                ;;
            --timeout=*)
                SCAN_TIMEOUT="${arg#*=}"
                ;;
            --json)
                OUTPUT_JSON=true
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
        esac
    done
}

show_help() {
    cat << 'EOF'
NAS Auto-Discovery Script

Usage: sudo ./discover-nas.sh [OPTIONS]

Options:
  --auto-mount     Automatically mount the first discovered NAS
  --verbose, -v    Show detailed scan progress
  --timeout=N      Set scan timeout in seconds (default: 5)
  --json           Output results in JSON format
  --help, -h       Show this help message

Discovery Methods:
  1. mDNS/Bonjour (Avahi) - finds .local hostnames
  2. Network scan for NFS (port 2049) and SMB (ports 139, 445)
  3. Common NAS hostname patterns (NAS*, synology*, qnap*, etc.)
  4. UPnP/SSDP device discovery

Examples:
  sudo ./discover-nas.sh                    # Scan and show results
  sudo ./discover-nas.sh --auto-mount       # Scan and auto-configure
  sudo ./discover-nas.sh --json             # Output as JSON
EOF
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root (sudo)"
        exit 1
    fi
}

install_dependencies() {
    log_info "Checking dependencies..."
    
    local packages=()
    
    command -v avahi-browse &>/dev/null || packages+=(avahi-utils)
    command -v nmap &>/dev/null || packages+=(nmap)
    command -v smbclient &>/dev/null || packages+=(smbclient)
    command -v showmount &>/dev/null || packages+=(nfs-common)
    command -v jq &>/dev/null || packages+=(jq)
    
    if [ ${#packages[@]} -gt 0 ]; then
        log_info "Installing: ${packages[*]}"
        apt-get update -qq
        apt-get install -y "${packages[@]}" &>/dev/null
    fi
    
    systemctl enable --now avahi-daemon 2>/dev/null || true
    log_success "Dependencies ready"
}

get_local_network() {
    local ip=$(ip route get 1 2>/dev/null | awk '{print $7; exit}')
    local subnet=$(ip -4 addr show | grep "$ip" | awk '{print $2}' | head -1)
    
    if [ -z "$subnet" ]; then
        subnet=$(ip -4 addr show | grep "inet " | grep -v "127.0.0.1" | awk '{print $2}' | head -1)
    fi
    
    local network=$(echo "$subnet" | sed 's/\.[0-9]*\//.0\//')
    echo "$network"
}

discover_mdns() {
    log_step "Scanning via mDNS/Bonjour"
    
    local found=()
    
    log_info "Looking for NFS servers..."
    while IFS= read -r line; do
        local host=$(echo "$line" | awk '{print $4}')
        if [ -n "$host" ] && [[ "$host" != *"localhost"* ]]; then
            log_success "Found NFS: $host"
            found+=("$host:nfs")
        fi
    done < <(timeout "$SCAN_TIMEOUT" avahi-browse -rpt _nfs._tcp 2>/dev/null | grep "=" || true)
    
    log_info "Looking for SMB/CIFS servers..."
    while IFS= read -r line; do
        local host=$(echo "$line" | awk '{print $4}')
        if [ -n "$host" ] && [[ "$host" != *"localhost"* ]]; then
            log_success "Found SMB: $host"
            found+=("$host:smb")
        fi
    done < <(timeout "$SCAN_TIMEOUT" avahi-browse -rpt _smb._tcp 2>/dev/null | grep "=" || true)
    
    log_info "Looking for storage/NAS devices..."
    while IFS= read -r line; do
        if [[ "$line" == *"="* ]]; then
            local name=$(echo "$line" | cut -d';' -f4)
            local host=$(echo "$line" | cut -d';' -f7)
            if [ -n "$host" ]; then
                log_success "Found device: $name ($host)"
                found+=("$host:device:$name")
            fi
        fi
    done < <(timeout "$SCAN_TIMEOUT" avahi-browse -rpt _device-info._tcp 2>/dev/null | grep -iE "nas|storage|synology|qnap|zyxel|asustor|buffalo|netgear|wd|seagate" || true)
    
    log_info "Looking for .local hostnames matching NAS patterns..."
    local common_hostnames=("NAS326" "nas" "synology" "diskstation" "qnap" "storage" "fileserver" "mediaserver")
    for hostname in "${common_hostnames[@]}"; do
        local ip=$(timeout 2 avahi-resolve -n "${hostname}.local" 2>/dev/null | awk '{print $2}')
        if [ -n "$ip" ]; then
            log_success "Found: ${hostname}.local ($ip)"
            found+=("$ip:mdns:${hostname}.local")
        fi
    done
    
    for item in "${found[@]}"; do
        DISCOVERED_NAS+=("$item")
    done
}

discover_network_scan() {
    log_step "Scanning Network for NAS Ports"
    
    local network=$(get_local_network)
    if [ -z "$network" ]; then
        log_warn "Could not determine local network"
        return
    fi
    
    log_info "Scanning $network for NFS (2049) and SMB (445) ports..."
    
    local nfs_hosts=$(timeout 30 nmap -Pn -p 2049 --open "$network" 2>/dev/null | grep -B4 "2049/tcp open" | grep "Nmap scan" | awk '{print $5}' || true)
    
    for host in $nfs_hosts; do
        if [ -n "$host" ] && ! printf '%s\n' "${DISCOVERED_NAS[@]}" | grep -q "^$host:"; then
            log_success "Found NFS server: $host"
            DISCOVERED_NAS+=("$host:nfs:network-scan")
        fi
    done
    
    local smb_hosts=$(timeout 30 nmap -Pn -p 445 --open "$network" 2>/dev/null | grep -B4 "445/tcp open" | grep "Nmap scan" | awk '{print $5}' || true)
    
    for host in $smb_hosts; do
        if [ -n "$host" ] && ! printf '%s\n' "${DISCOVERED_NAS[@]}" | grep -q "^$host:"; then
            log_success "Found SMB server: $host"
            DISCOVERED_NAS+=("$host:smb:network-scan")
        fi
    done
}

discover_upnp() {
    log_step "Scanning via UPnP/SSDP"
    
    local ssdp_response=$(timeout 3 bash -c 'echo -e "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nST: upnp:rootdevice\r\nMX: 2\r\n\r\n" | socat - UDP4-DATAGRAM:239.255.255.250:1900,sourceport=1900 2>/dev/null' || true)
    
    if [ -n "$ssdp_response" ]; then
        local locations=$(echo "$ssdp_response" | grep -i "LOCATION:" | sed 's/LOCATION: //i' | tr -d '\r')
        for loc in $locations; do
            local host=$(echo "$loc" | sed -E 's|https?://([^/:]+).*|\1|')
            if [ -n "$host" ] && ! printf '%s\n' "${DISCOVERED_NAS[@]}" | grep -q "^$host:"; then
                log_info "Found UPnP device: $host"
            fi
        done
    fi
}

get_nfs_shares() {
    local host=$1
    local shares=()
    
    if timeout 5 showmount -e "$host" &>/dev/null; then
        while IFS= read -r line; do
            local share=$(echo "$line" | awk '{print $1}')
            if [ -n "$share" ] && [[ "$share" != "Export" ]]; then
                shares+=("$share")
            fi
        done < <(showmount -e "$host" 2>/dev/null | tail -n +2)
    fi
    
    echo "${shares[*]}"
}

get_smb_shares() {
    local host=$1
    local shares=()
    
    while IFS= read -r line; do
        local share=$(echo "$line" | awk '{print $1}')
        local type=$(echo "$line" | awk '{print $2}')
        if [ -n "$share" ] && [[ "$type" == "Disk" ]] && [[ "$share" != *"$"* ]]; then
            shares+=("$share")
        fi
    done < <(smbclient -L "$host" -N 2>/dev/null | grep "Disk" || true)
    
    echo "${shares[*]}"
}

probe_shares() {
    log_step "Probing Discovered NAS Devices for Shares"
    
    declare -A unique_hosts
    for item in "${DISCOVERED_NAS[@]}"; do
        local host=$(echo "$item" | cut -d: -f1)
        unique_hosts["$host"]=1
    done
    
    for host in "${!unique_hosts[@]}"; do
        log_info "Probing $host..."
        
        local nfs_shares=$(get_nfs_shares "$host")
        if [ -n "$nfs_shares" ]; then
            log_success "  NFS exports: $nfs_shares"
            for share in $nfs_shares; do
                DISCOVERED_SHARES+=("$host:nfs:$share")
            done
        fi
        
        local smb_shares=$(get_smb_shares "$host")
        if [ -n "$smb_shares" ]; then
            log_success "  SMB shares: $smb_shares"
            for share in $smb_shares; do
                DISCOVERED_SHARES+=("$host:smb:$share")
            done
        fi
        
        if [ -z "$nfs_shares" ] && [ -z "$smb_shares" ]; then
            log_warn "  No accessible shares found on $host"
        fi
    done
}

select_best_nas() {
    local best_host=""
    local best_share=""
    local best_type=""
    local best_score=0
    
    for share_info in "${DISCOVERED_SHARES[@]}"; do
        local host=$(echo "$share_info" | cut -d: -f1)
        local type=$(echo "$share_info" | cut -d: -f2)
        local share=$(echo "$share_info" | cut -d: -f3)
        local score=0
        
        [[ "$type" == "nfs" ]] && ((score += 10))
        
        [[ "$share" == *"networkshare"* ]] && ((score += 5))
        [[ "$share" == *"media"* ]] && ((score += 5))
        [[ "$share" == *"public"* ]] && ((score += 3))
        [[ "$share" == *"share"* ]] && ((score += 2))
        
        if [ $score -gt $best_score ]; then
            best_score=$score
            best_host=$host
            best_share=$share
            best_type=$type
        fi
    done
    
    echo "$best_host:$best_type:$best_share"
}

output_json() {
    echo "{"
    echo "  \"discovered_nas\": ["
    local first=true
    declare -A unique_hosts
    for item in "${DISCOVERED_NAS[@]}"; do
        local host=$(echo "$item" | cut -d: -f1)
        unique_hosts["$host"]=1
    done
    for host in "${!unique_hosts[@]}"; do
        if [ "$first" = true ]; then
            first=false
        else
            echo ","
        fi
        echo -n "    \"$host\""
    done
    echo ""
    echo "  ],"
    echo "  \"discovered_shares\": ["
    first=true
    for share_info in "${DISCOVERED_SHARES[@]}"; do
        local host=$(echo "$share_info" | cut -d: -f1)
        local type=$(echo "$share_info" | cut -d: -f2)
        local share=$(echo "$share_info" | cut -d: -f3)
        if [ "$first" = true ]; then
            first=false
        else
            echo ","
        fi
        echo -n "    {\"host\": \"$host\", \"type\": \"$type\", \"share\": \"$share\"}"
    done
    echo ""
    echo "  ],"
    local best=$(select_best_nas)
    local best_host=$(echo "$best" | cut -d: -f1)
    local best_type=$(echo "$best" | cut -d: -f2)
    local best_share=$(echo "$best" | cut -d: -f3)
    echo "  \"recommended\": {"
    echo "    \"host\": \"$best_host\","
    echo "    \"type\": \"$best_type\","
    echo "    \"share\": \"$best_share\""
    echo "  }"
    echo "}"
}

show_results() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  NAS Discovery Results"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    
    if [ ${#DISCOVERED_NAS[@]} -eq 0 ]; then
        log_warn "No NAS devices found on the network"
        echo ""
        echo "Troubleshooting tips:"
        echo "  1. Ensure your NAS is powered on and connected"
        echo "  2. Check if NFS/SMB services are enabled on the NAS"
        echo "  3. Verify firewall isn't blocking discovery"
        echo "  4. Try specifying IP directly: sudo ./setup-nas-mounts.sh --nas-ip=192.168.x.x"
        return 1
    fi
    
    declare -A unique_hosts
    for item in "${DISCOVERED_NAS[@]}"; do
        local host=$(echo "$item" | cut -d: -f1)
        unique_hosts["$host"]=1
    done
    
    echo "Found ${#unique_hosts[@]} NAS device(s):"
    echo ""
    
    local idx=1
    for host in "${!unique_hosts[@]}"; do
        echo "  [$idx] $host"
        
        local has_shares=false
        for share_info in "${DISCOVERED_SHARES[@]}"; do
            local share_host=$(echo "$share_info" | cut -d: -f1)
            if [ "$share_host" = "$host" ]; then
                local type=$(echo "$share_info" | cut -d: -f2)
                local share=$(echo "$share_info" | cut -d: -f3)
                echo "      └── [$type] $share"
                has_shares=true
            fi
        done
        
        if [ "$has_shares" = false ]; then
            echo "      └── (no accessible shares)"
        fi
        
        ((idx++))
        echo ""
    done
    
    local best=$(select_best_nas)
    local best_host=$(echo "$best" | cut -d: -f1)
    local best_type=$(echo "$best" | cut -d: -f2)
    local best_share=$(echo "$best" | cut -d: -f3)
    
    if [ -n "$best_host" ] && [ "$best_host" != "" ]; then
        echo "═══════════════════════════════════════════════════════════════"
        echo "  Recommended Configuration"
        echo "═══════════════════════════════════════════════════════════════"
        echo ""
        echo "  Host:  $best_host"
        echo "  Type:  $best_type"
        echo "  Share: $best_share"
        echo ""
        echo "  To mount automatically:"
        if [ "$best_type" = "nfs" ]; then
            echo "    sudo ./setup-nas-mounts.sh --nas-ip=$best_host --nfs-share=$best_share"
        else
            echo "    sudo ./setup-nas-mounts.sh --nas-ip=$best_host --smb-share=$best_share"
        fi
        echo ""
    fi
}

auto_mount_best() {
    local best=$(select_best_nas)
    local best_host=$(echo "$best" | cut -d: -f1)
    local best_type=$(echo "$best" | cut -d: -f2)
    local best_share=$(echo "$best" | cut -d: -f3)
    
    if [ -z "$best_host" ] || [ "$best_host" = "" ]; then
        log_error "No suitable NAS share found for auto-mount"
        return 1
    fi
    
    log_step "Auto-Mounting Best NAS Share"
    
    log_info "Selected: $best_host ($best_type) - $best_share"
    
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    
    if [ "$best_type" = "nfs" ]; then
        "${script_dir}/setup-nas-mounts.sh" --nas-ip="$best_host" --nfs-share="$best_share"
    else
        "${script_dir}/setup-nas-mounts.sh" --nas-ip="$best_host" --smb-share="$best_share"
    fi
}

save_discovery_cache() {
    local cache_file="/var/cache/homelab/nas-discovery.json"
    mkdir -p "$(dirname "$cache_file")"
    output_json > "$cache_file"
    log_info "Saved discovery cache to $cache_file"
}

main() {
    if [ "$OUTPUT_JSON" != "true" ]; then
        echo "═══════════════════════════════════════════════════════════════"
        echo "  NAS Auto-Discovery"
        echo "═══════════════════════════════════════════════════════════════"
        echo ""
    fi
    
    parse_args "$@"
    check_root
    install_dependencies
    
    discover_mdns
    discover_network_scan
    discover_upnp
    probe_shares
    
    save_discovery_cache
    
    if [ "$OUTPUT_JSON" = "true" ]; then
        output_json
    else
        show_results
        
        if [ "$AUTO_MOUNT" = true ]; then
            auto_mount_best
        fi
    fi
}

main "$@"
