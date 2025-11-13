#!/bin/bash

# ======================================================================
# Diagnose All Services
# Comprehensive health check for entire homelab
# ======================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

cd /home/${USER}/contain/HomeLabHub

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Homelab Health Diagnostics          ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""

# ============================================
# Container Status
# ============================================
echo -e "${BLUE}━━━ Container Status ━━━${NC}"
echo ""
docker compose -f docker-compose.unified.yml ps
echo ""

# ============================================
# Individual Service Checks
# ============================================
check_service() {
    local name=$1
    local url=$2
    local container=$3
    
    echo -e "${BLUE}━━━ $name ━━━${NC}"
    
    # Check if container is running
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        echo -e "${GREEN}✓${NC} Container running"
        
        # Show last 10 lines of logs
        echo "Last 10 log lines:"
        docker logs "$container" --tail 10 2>&1 | sed 's/^/  /'
        
        # Test URL if provided
        if [ -n "$url" ]; then
            echo ""
            echo -n "Testing $url... "
            if curl -sI "$url" -k --max-time 5 > /dev/null 2>&1; then
                echo -e "${GREEN}✓ Accessible${NC}"
            else
                echo -e "${RED}✗ Not accessible${NC}"
            fi
        fi
    else
        echo -e "${RED}✗${NC} Container not running"
        echo "Last exit logs:"
        docker logs "$container" --tail 20 2>&1 | sed 's/^/  /' || echo "  No logs available"
    fi
    echo ""
}

check_service "Caddy (Reverse Proxy)" "http://localhost:80" "caddy"
check_service "Homelab Dashboard" "https://host.evindrake.net" "homelab-dashboard"
check_service "Discord Ticket Bot" "https://bot.rig-city.com" "discord-bot"
check_service "Stream Bot" "https://stream.rig-city.com" "stream-bot"
check_service "Plex Server" "https://plex.evindrake.net" "plex-server"
check_service "n8n Automation" "https://n8n.evindrake.net" "n8n"
check_service "VNC Desktop" "https://vnc.evindrake.net" "vnc-desktop"
check_service "Static Website" "https://scarletredjoker.com" "scarletredjoker-web"
check_service "PostgreSQL Database" "" "discord-bot-db"

# ============================================
# Port Check
# ============================================
echo -e "${BLUE}━━━ Port Status ━━━${NC}"
echo ""
echo "Checking open ports on host..."
netstat -tuln 2>/dev/null | grep -E ":(80|443|5000|32400|5678)" | sed 's/^/  /' || echo "  netstat not available"
echo ""

# ============================================
# Disk Space
# ============================================
echo -e "${BLUE}━━━ Disk Space ━━━${NC}"
echo ""
df -h | grep -E "Filesystem|/home|/var/www" | sed 's/^/  /'
echo ""

# ============================================
# Docker Resources
# ============================================
echo -e "${BLUE}━━━ Docker Resource Usage ━━━${NC}"
echo ""
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" | head -10
echo ""

# ============================================
# Recommendations
# ============================================
echo -e "${BLUE}━━━ Recommendations ━━━${NC}"
echo ""

# Check for specific issues
if ! docker ps | grep -q caddy; then
    echo -e "${RED}✗${NC} Caddy is not running - SSL/HTTPS will not work"
    echo "  Fix: docker compose -f docker-compose.unified.yml restart caddy"
fi

if ! docker ps | grep -q discord-bot-db; then
    echo -e "${RED}✗${NC} PostgreSQL is not running - Discord bot will fail"
    echo "  Fix: docker compose -f docker-compose.unified.yml restart discord-bot-db"
fi

# Check for crashed containers
CRASHED=$(docker compose -f docker-compose.unified.yml ps --filter "status=exited" --format '{{.Name}}' | wc -l)
if [ "$CRASHED" -gt 0 ]; then
    echo -e "${YELLOW}⚠${NC} $CRASHED container(s) have exited"
    echo "  View: docker compose -f docker-compose.unified.yml ps -a"
    echo "  Logs: docker logs <container-name>"
fi

echo ""
echo -e "${GREEN}Diagnostics complete!${NC}"
echo ""
echo "For detailed service logs:"
echo "  docker logs <container-name> -f"
echo ""
echo "To restart all services:"
echo "  docker compose -f docker-compose.unified.yml restart"
echo ""
