#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

print_header() {
    echo ""
    echo "=============================================="
    echo "  Plex Optimization & Buffering Fix Script"
    echo "=============================================="
    echo ""
}

check_hardware_transcoding() {
    log_info "Checking hardware transcoding capability..."
    
    echo ""
    echo "GPU/Hardware Detection:"
    echo "------------------------"
    
    if [ -d "/dev/dri" ]; then
        log_success "/dev/dri exists - GPU passthrough available"
        ls -la /dev/dri/ 2>/dev/null || true
    else
        log_warn "/dev/dri not found - hardware transcoding may not work"
    fi
    
    echo ""
    if command -v vainfo &>/dev/null; then
        log_info "VA-API info:"
        vainfo 2>&1 | head -20 || log_warn "vainfo failed - intel-media-va-driver may be missing"
    else
        log_warn "vainfo not installed - run: sudo apt install vainfo intel-media-va-driver"
    fi
    
    if lspci 2>/dev/null | grep -i "vga\|3d\|display" | grep -qi intel; then
        log_success "Intel GPU detected - Quick Sync should work"
    elif lspci 2>/dev/null | grep -i "vga\|3d\|display" | grep -qi nvidia; then
        log_success "NVIDIA GPU detected - NVENC available (requires Plex Pass)"
    elif lspci 2>/dev/null | grep -i "vga\|3d\|display" | grep -qi amd; then
        log_success "AMD GPU detected - VCE/VCN available"
    else
        log_warn "No supported GPU detected for hardware transcoding"
    fi
    echo ""
}

check_nas_speed() {
    log_info "Testing NAS read speed..."
    
    local test_file=""
    local nas_paths=("/mnt/nas/video" "/mnt/nas/all" "/mnt/nas/networkshare/video")
    
    for path in "${nas_paths[@]}"; do
        if [ -d "$path" ] && [ -n "$(ls -A "$path" 2>/dev/null)" ]; then
            test_file=$(find "$path" -type f -size +100M 2>/dev/null | head -1)
            if [ -n "$test_file" ]; then
                break
            fi
        fi
    done
    
    if [ -n "$test_file" ]; then
        log_info "Testing read speed with: $(basename "$test_file")"
        
        sync && echo 3 | sudo tee /proc/sys/vm/drop_caches > /dev/null 2>&1 || true
        
        local speed
        speed=$(dd if="$test_file" of=/dev/null bs=1M count=200 2>&1 | grep -oP '[\d.]+ [MG]B/s' | tail -1)
        
        if [ -n "$speed" ]; then
            log_success "NAS read speed: $speed"
            
            local speed_val
            speed_val=$(echo "$speed" | grep -oP '[\d.]+')
            if echo "$speed" | grep -q "GB"; then
                speed_val=$(echo "$speed_val * 1000" | bc 2>/dev/null || echo "1000")
            fi
            
            if (( $(echo "$speed_val < 50" | bc -l 2>/dev/null || echo 0) )); then
                log_warn "NAS speed is slow (<50 MB/s) - may cause buffering with high bitrate content"
                echo ""
                echo "  Recommendations:"
                echo "  - Check NAS is connected via Gigabit ethernet (not 100Mbps)"
                echo "  - Consider enabling SMB instead of NFS for potentially better speeds"
                echo "  - For 4K HDR content, consider copying files to local SSD"
            else
                log_success "NAS speed looks good for most content"
            fi
        fi
    else
        log_warn "No large files found on NAS to test speed"
        echo "  Make sure NAS is mounted: ls /mnt/nas/video"
    fi
    echo ""
}

check_plex_container() {
    log_info "Checking Plex container status..."
    
    if docker ps --format '{{.Names}}' | grep -q "^plex$"; then
        log_success "Plex container is running"
        
        local transcode_mount
        transcode_mount=$(docker inspect plex --format '{{range .Mounts}}{{if eq .Destination "/transcode"}}{{.Source}}:{{.Type}}{{end}}{{end}}' 2>/dev/null)
        
        echo ""
        echo "  Current transcode mount: $transcode_mount"
        
        if echo "$transcode_mount" | grep -q "tmpfs"; then
            log_success "Transcode is using RAM (tmpfs) - optimal!"
        elif echo "$transcode_mount" | grep -q "volume"; then
            log_warn "Transcode is using a Docker volume - may be slow"
            echo "  Consider switching to tmpfs for faster transcoding"
        fi
        
        local nas_access
        if docker exec plex ls /nas/video &>/dev/null; then
            log_success "Plex can access NAS media at /nas/video"
        else
            log_error "Plex CANNOT access NAS media - check mounts"
        fi
        
        if docker exec plex ls /dev/dri &>/dev/null; then
            log_success "GPU is accessible inside Plex container"
        else
            log_warn "GPU not accessible in container - hardware transcoding disabled"
        fi
    else
        log_error "Plex container is not running"
        echo "  Start with: cd ${DEPLOY_DIR} && docker compose up -d plex"
    fi
    echo ""
}

show_plex_settings_guide() {
    echo "=============================================="
    echo "  Recommended Plex Settings for Buffering Fix"
    echo "=============================================="
    echo ""
    echo "1. ENABLE HARDWARE TRANSCODING (requires Plex Pass)"
    echo "   Settings → Transcoder → Use hardware acceleration when available: ON"
    echo "   Settings → Transcoder → Use hardware-accelerated video encoding: ON"
    echo ""
    echo "2. OPTIMIZE TRANSCODER SETTINGS"
    echo "   Settings → Transcoder → Transcoder quality: Prefer higher speed encoding"
    echo "   Settings → Transcoder → Background transcoding: Optional (uses more CPU)"
    echo ""
    echo "3. OPTIMIZE CLIENT SETTINGS"
    echo "   On each client (TV, phone, etc.):"
    echo "   Settings → Video Quality → Remote/Home quality: Original/Maximum"
    echo "   This enables Direct Play and avoids transcoding entirely"
    echo ""
    echo "4. CHECK LIBRARY ANALYSIS"
    echo "   Settings → Library → Generate video preview thumbnails: Never"
    echo "   Settings → Library → Generate intro video markers: Never"
    echo "   Settings → Library → Generate credits video markers: Never"
    echo "   (These can cause high disk I/O and slow down playback)"
    echo ""
    echo "5. NETWORK SETTINGS"
    echo "   Settings → Network → Enable Relay: OFF (for local network)"
    echo "   Settings → Network → Remote streams allowed per user: Unlimited"
    echo ""
}

show_network_tips() {
    echo "=============================================="
    echo "  Network Optimization Tips"
    echo "=============================================="
    echo ""
    echo "DOCSIS 3.1 Modem:"
    echo "  - ONLY affects internet speed (remote streaming)"
    echo "  - Does NOT affect local network speeds"
    echo "  - If buffering on home network, modem isn't the issue"
    echo ""
    echo "Local Network Checks:"
    echo "  1. Ensure Plex server is connected via Ethernet (not WiFi)"
    echo "  2. Check switch/router ports are Gigabit (not 100Mbps)"
    echo "  3. Use Cat6 or better Ethernet cables"
    echo "  4. NAS should also be on Gigabit connection"
    echo ""
    echo "Quick Network Test:"
    echo "  iperf3 -s  (on server)"
    echo "  iperf3 -c <server-ip>  (on client)"
    echo "  Should see ~900+ Mbps for Gigabit network"
    echo ""
}

apply_tmpfs_optimization() {
    log_info "Checking if tmpfs optimization can be applied..."
    
    local compose_file="${DEPLOY_DIR}/docker-compose.yml"
    
    if [ ! -f "$compose_file" ]; then
        log_error "docker-compose.yml not found at $compose_file"
        return 1
    fi
    
    if grep -q "tmpfs:" "$compose_file" && grep -q "/transcode" "$compose_file"; then
        log_success "tmpfs transcoding already configured in docker-compose.yml"
    else
        log_warn "tmpfs transcoding not configured"
        echo ""
        echo "To enable RAM-based transcoding (faster), update docker-compose.yml:"
        echo ""
        echo "  plex:"
        echo "    ..."
        echo "    tmpfs:"
        echo "      - /transcode:size=4G"
        echo ""
        echo "This uses 4GB of RAM for transcoding - adjust based on your RAM"
        echo "(8GB system: use 2-3GB, 16GB+: use 4-8GB)"
    fi
    echo ""
}

main() {
    print_header
    
    case "${1:-}" in
        --check|check)
            check_hardware_transcoding
            check_nas_speed
            check_plex_container
            ;;
        --settings|settings)
            show_plex_settings_guide
            ;;
        --network|network)
            show_network_tips
            ;;
        --all|all|"")
            check_hardware_transcoding
            check_nas_speed
            check_plex_container
            apply_tmpfs_optimization
            echo ""
            show_plex_settings_guide
            show_network_tips
            ;;
        --help|-h|help)
            echo "Usage: $0 [option]"
            echo ""
            echo "Options:"
            echo "  --check     Check hardware transcoding and NAS speed"
            echo "  --settings  Show recommended Plex settings"
            echo "  --network   Show network optimization tips"
            echo "  --all       Run all checks and show all tips (default)"
            echo "  --help      Show this help"
            ;;
        *)
            log_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
}

main "$@"
