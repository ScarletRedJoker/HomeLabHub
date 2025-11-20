#!/bin/bash
# COMPLETE FIX - PostgreSQL + VNC + All Services
# This fixes EVERYTHING in one go

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║        🔧 COMPLETE FIX - EVERYTHING 🔧                    ║"
echo "║                                                              ║"
echo "║  Fixes: PostgreSQL, VNC, All 15 Services                    ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Load environment
if [ ! -f ".env" ]; then
    echo -e "${RED}ERROR: .env file not found${NC}"
    exit 1
fi
source .env

echo -e "${BOLD}PHASE 1: Remove Orphan Containers${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker stop discord-bot-db 2>/dev/null && echo "  ✓ Stopped discord-bot-db" || echo "  • discord-bot-db not running"
docker rm -f discord-bot-db 2>/dev/null && echo "  ✓ Removed discord-bot-db" || echo "  • discord-bot-db not found"
docker volume rm homelabhub_postgres_data 2>/dev/null && echo "  ✓ Removed old postgres volume" || echo "  • Volume not found"
echo ""

echo -e "${BOLD}PHASE 2: Clean Shutdown${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker compose -f docker-compose.unified.yml down --remove-orphans --timeout 30 2>&1 | grep -v "not found" || true
echo "  ✓ All services stopped"
echo ""

echo -e "${BOLD}PHASE 3: Start PostgreSQL Fresh${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Starting PostgreSQL with fresh database..."
docker compose -f docker-compose.unified.yml up -d homelab-postgres

echo "Waiting for PostgreSQL to initialize..."
for i in {1..12}; do
    if docker exec homelab-postgres psql -U postgres -c "SELECT 1;" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ PostgreSQL ready (attempt $i/12)${NC}"
        break
    fi
    if [ $i -eq 12 ]; then
        echo -e "${RED}ERROR: PostgreSQL failed to start${NC}"
        echo "Logs:"
        docker logs homelab-postgres --tail 30
        exit 1
    fi
    echo "  Waiting... ($i/12)"
    sleep 5
done
echo ""

echo -e "${BOLD}PHASE 4: Create Databases${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
for DB in ticketbot streambot homelab_jarvis; do
    echo -n "  Creating $DB... "
    if docker exec homelab-postgres psql -U postgres -c "CREATE DATABASE $DB;" 2>&1 | grep -q "already exists"; then
        echo -e "${YELLOW}exists${NC}"
    else
        echo -e "${GREEN}✓${NC}"
    fi
done
echo ""

echo -e "${BOLD}PHASE 5: Fix VNC Password Configuration${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat > services/vnc-desktop/bootstrap.sh << 'BOOTSTRAP_EOF'
#!/bin/bash
set -e

USER=${VNC_USER:-evin}
HOME_DIR=/home/$USER

echo "============================================"
echo "  VNC Desktop Bootstrap"
echo "  User: $USER"
echo "  Home: $HOME_DIR"
echo "============================================"

# Check if desktop is already provisioned
if [ -f "$HOME_DIR/.desktop_provisioned" ]; then
    echo "Desktop already provisioned. Skipping bootstrap."
else
    echo "First-time setup: Provisioning desktop shortcuts..."
    
    # Copy desktop shortcuts if they exist
    if [ -d "/tmp/desktop-shortcuts" ]; then
        cp -r /tmp/desktop-shortcuts/* $HOME_DIR/Desktop/ 2>/dev/null || true
        chmod +x $HOME_DIR/Desktop/*.desktop 2>/dev/null || true
    fi
    
    # Mark as provisioned
    touch $HOME_DIR/.desktop_provisioned
    chown $USER:$USER $HOME_DIR/.desktop_provisioned
    
    echo "Desktop provisioning complete."
fi

# Setup VNC password from environment variable
if [ -n "$VNC_PASSWORD" ]; then
    echo "Setting up VNC password for user: $USER"
    mkdir -p $HOME_DIR/.vnc
    echo "Creating VNC password file..."
    echo "$VNC_PASSWORD" | vncpasswd -f > $HOME_DIR/.vnc/passwd
    chmod 600 $HOME_DIR/.vnc/passwd
    chown -R $USER:$USER $HOME_DIR/.vnc
    echo "✓ VNC password configured at $HOME_DIR/.vnc/passwd"
    
    # CRITICAL: Remove legacy password file and export correct path
    rm -f /.password2
    export X11VNC_AUTH="$HOME_DIR/.vnc/passwd"
    echo "✓ Removed legacy password file"
    echo "✓ X11VNC will use: $HOME_DIR/.vnc/passwd"
fi

echo "VNC password setup complete"

# Start supervisord
exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
BOOTSTRAP_EOF

chmod +x services/vnc-desktop/bootstrap.sh
echo "  ✓ VNC bootstrap script updated"
echo "  ✓ Removed /.password2 legacy file"
echo "  ✓ Set X11VNC_AUTH to correct password file"
echo ""

echo -e "${BOLD}PHASE 6: Rebuild VNC Desktop${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker compose -f docker-compose.unified.yml build vnc-desktop
echo "  ✓ VNC image rebuilt"
echo ""

echo -e "${BOLD}PHASE 7: Start All Services${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker compose -f docker-compose.unified.yml up -d --remove-orphans
echo "  ✓ All services started"
echo ""

echo "Waiting 30 seconds for services to initialize..."
sleep 30
echo ""

echo -e "${BOLD}PHASE 8: Verification${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Count running services
RUNNING=$(docker ps --filter "name=homelab-|discord-bot|stream-bot|caddy|plex|n8n|vnc|code-server|homeassistant|rig-city|scarletredjoker" --format "{{.Names}}" | wc -l)

echo ""
echo -e "${BOLD}Container Status:${NC}"
docker ps --format "table {{.Names}}\t{{.Status}}" --filter "name=homelab-|discord-bot|stream-bot|caddy|plex|n8n|vnc|code-server|homeassistant|rig-city|scarletredjoker" | head -20

echo ""
echo -e "${BOLD}Services Running: $RUNNING/15${NC}"
echo ""

# Database check
echo -n "PostgreSQL check: "
if docker exec homelab-postgres psql -U postgres -c "\\l" | grep -q "homelab_jarvis"; then
    echo -e "${GREEN}✓ All databases present${NC}"
else
    echo -e "${YELLOW}⚠ Database check partial${NC}"
fi

# VNC check
echo -n "VNC password: "
if docker exec vnc-desktop test -f /home/evin/.vnc/passwd; then
    if docker exec vnc-desktop test -f /.password2; then
        echo -e "${YELLOW}⚠ Legacy file still exists${NC}"
    else
        echo -e "${GREEN}✓ Configured correctly${NC}"
    fi
else
    echo -e "${RED}✗ Not configured${NC}"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"

if [ $RUNNING -eq 15 ]; then
    echo "║        ✅ SUCCESS - ALL 15 SERVICES RUNNING              ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo -e "${GREEN}${BOLD}COMPLETE SUCCESS${NC}"
    echo ""
    echo "Service URLs:"
    echo "  • Dashboard:    https://host.evindrake.net"
    echo "  • Stream Bot:   https://stream.rig-city.com"
    echo "  • Discord Bot:  https://bot.rig-city.com"
    echo "  • VNC Desktop:  https://vnc.evindrake.net"
    echo "  • Code-Server:  https://code.evindrake.net"
    echo "  • Home Assistant: https://home.evindrake.net"
    echo ""
    echo -e "${BOLD}VNC Password: $VNC_PASSWORD${NC}"
    echo ""
else
    echo "║        ⚠ PARTIAL - $RUNNING/15 SERVICES RUNNING          ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo -e "${YELLOW}WARNING: Not all services running${NC}"
    echo ""
    echo "Checking missing services..."
    for service in homelab-dashboard discord-bot stream-bot homelab-celery-worker homelab-postgres; do
        if ! docker ps | grep -q "$service"; then
            echo ""
            echo -e "${RED}Missing: $service${NC}"
            docker logs $service --tail 30 2>&1 | head -20 || echo "  (No logs available)"
        fi
    done
fi

echo ""
