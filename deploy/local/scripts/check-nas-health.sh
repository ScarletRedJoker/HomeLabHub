#!/bin/bash
# NAS Health Check Script
# Monitors NAS connectivity and alerts if mount is stale

MOUNT_BASE="/mnt/nas"
NAS_HOST="${NAS_HOST:-NAS326.local}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_mount() {
    local mount_point="$1"
    
    if ! mountpoint -q "$mount_point" 2>/dev/null; then
        echo -e "${YELLOW}[UNMOUNTED]${NC} $mount_point"
        return 1
    fi
    
    if timeout 5 ls "$mount_point" &>/dev/null; then
        local usage=$(df -h "$mount_point" 2>/dev/null | tail -1 | awk '{print $5}')
        echo -e "${GREEN}[OK]${NC} $mount_point ($usage used)"
        return 0
    else
        echo -e "${RED}[STALE]${NC} $mount_point - connection timeout"
        return 2
    fi
}

check_nas_ping() {
    if ping -c 1 -W 2 "$NAS_HOST" &>/dev/null; then
        echo -e "${GREEN}[OK]${NC} NAS is reachable: $NAS_HOST"
        return 0
    else
        echo -e "${RED}[FAIL]${NC} Cannot ping NAS: $NAS_HOST"
        return 1
    fi
}

check_nfs_service() {
    local nas_ip=$(getent hosts "$NAS_HOST" 2>/dev/null | awk '{print $1}')
    
    if [ -z "$nas_ip" ]; then
        echo -e "${YELLOW}[WARN]${NC} Cannot resolve NAS hostname"
        return 1
    fi
    
    if showmount -e "$nas_ip" &>/dev/null; then
        echo -e "${GREEN}[OK]${NC} NFS service is running on NAS"
        return 0
    else
        echo -e "${YELLOW}[WARN]${NC} Cannot query NFS exports"
        return 1
    fi
}

check_plex_access() {
    if [ -d "${MOUNT_BASE}/video" ] && ls "${MOUNT_BASE}/video" &>/dev/null; then
        local count=$(find "${MOUNT_BASE}/video" -maxdepth 2 -type f 2>/dev/null | wc -l)
        echo -e "${GREEN}[OK]${NC} Plex can access video folder ($count files visible)"
        return 0
    else
        echo -e "${YELLOW}[WARN]${NC} Video folder not accessible"
        return 1
    fi
}

echo "═══════════════════════════════════════════════════════════════"
echo "  NAS Health Check"
echo "═══════════════════════════════════════════════════════════════"
echo ""

ERRORS=0

check_nas_ping || ((ERRORS++))
check_nfs_service || ((ERRORS++))

echo ""
echo "Mount Status:"
check_mount "${MOUNT_BASE}/all" || ((ERRORS++))

echo ""
echo "Media Access:"
check_plex_access

echo ""
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}All checks passed!${NC}"
    exit 0
else
    echo -e "${YELLOW}$ERRORS issue(s) found${NC}"
    exit 1
fi
