#!/bin/bash
# FORCE FRESH START - Nuclear option for corrupted PostgreSQL
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║        💥 FORCE FRESH START - CORRUPTED DB FIX 💥         ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Load environment
if [ ! -f ".env" ]; then
    echo -e "${RED}ERROR: .env file not found${NC}"
    exit 1
fi
source .env

echo -e "${BOLD}Step 1: Complete shutdown${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker compose -f docker-compose.unified.yml down --volumes --remove-orphans --timeout 30 2>&1 | grep -v "not found" || true
echo ""

echo -e "${BOLD}Step 2: Force remove ALL postgres containers and volumes${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker stop homelab-postgres discord-bot-db 2>/dev/null || true
docker rm -f homelab-postgres discord-bot-db 2>/dev/null || true

# Force remove ALL postgres-related volumes
for vol in $(docker volume ls -q | grep -E "postgres|homelabhub_postgres"); do
    echo "Removing volume: $vol"
    docker volume rm -f "$vol" 2>/dev/null || true
done

# Specific volume removals
docker volume rm -f homelabhub_postgres_data 2>/dev/null || true
docker volume rm -f postgres_data 2>/dev/null || true
docker volume rm -f homelab_postgres_data 2>/dev/null || true

echo -e "${GREEN}✓ All postgres volumes removed${NC}"
echo ""

echo -e "${BOLD}Step 3: Verify volume is gone${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if docker volume ls | grep -q postgres; then
    echo -e "${YELLOW}WARNING: Some postgres volumes still exist:${NC}"
    docker volume ls | grep postgres
else
    echo -e "${GREEN}✓ All postgres volumes confirmed deleted${NC}"
fi
echo ""

echo -e "${BOLD}Step 4: Start PostgreSQL with fresh volume${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker compose -f docker-compose.unified.yml up -d homelab-postgres

echo "Waiting for PostgreSQL initialization (first boot takes longer)..."
RETRY=0
while [ $RETRY -lt 15 ]; do
    sleep 3
    if docker exec homelab-postgres psql -U postgres -c "SELECT 1;" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ PostgreSQL ready on attempt $((RETRY+1))${NC}"
        break
    fi
    
    # Check for errors
    if docker logs homelab-postgres 2>&1 | tail -5 | grep -q "PANIC\|FATAL"; then
        echo -e "${RED}ERROR: PostgreSQL crashed${NC}"
        docker logs homelab-postgres --tail 20
        exit 1
    fi
    
    echo "  Initializing... ($((RETRY+1))/15)"
    ((RETRY++))
done

if [ $RETRY -eq 15 ]; then
    echo -e "${RED}ERROR: PostgreSQL failed to start${NC}"
    docker logs homelab-postgres --tail 50
    exit 1
fi
echo ""

echo -e "${BOLD}Step 5: Create databases${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
for DB in ticketbot streambot homelab_jarvis; do
    echo -n "  $DB... "
    if docker exec homelab-postgres psql -U postgres -c "CREATE DATABASE $DB;" 2>&1 | grep -q "already exists"; then
        echo -e "${YELLOW}exists${NC}"
    else
        echo -e "${GREEN}✓${NC}"
    fi
done
echo ""

echo -e "${BOLD}Step 6: Fix VNC bootstrap${NC}"
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
    
    # CRITICAL: Remove legacy password file
    rm -f /.password2 /.password 2>/dev/null || true
    
    # Export for x11vnc to use correct password file
    export X11VNC_AUTH="$HOME_DIR/.vnc/passwd"
    echo "✓ X11VNC will use: $X11VNC_AUTH"
fi

echo "VNC password setup complete"

# Start supervisord
exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
BOOTSTRAP_EOF

chmod +x services/vnc-desktop/bootstrap.sh
echo -e "${GREEN}✓ VNC bootstrap updated${NC}"
echo ""

echo -e "${BOLD}Step 7: Rebuild VNC${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker compose -f docker-compose.unified.yml build vnc-desktop
echo -e "${GREEN}✓ VNC rebuilt${NC}"
echo ""

echo -e "${BOLD}Step 8: Start all services${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker compose -f docker-compose.unified.yml up -d --remove-orphans
echo ""

echo "Waiting 30 seconds for services..."
sleep 30
echo ""

echo -e "${BOLD}Step 9: Verification${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
RUNNING=$(docker ps --filter "name=homelab-|discord-bot|stream-bot|caddy|plex|n8n|vnc|code-server|homeassistant|rig-city|scarletredjoker" | tail -n +2 | wc -l)

echo ""
docker ps --format "table {{.Names}}\t{{.Status}}" | head -20
echo ""
echo -e "${BOLD}Services: $RUNNING/15${NC}"
echo ""

# Database check
echo -n "PostgreSQL: "
if docker exec homelab-postgres psql -U postgres -c "\\l" 2>/dev/null | grep -q "homelab_jarvis"; then
    echo -e "${GREEN}✓ Healthy${NC}"
else
    echo -e "${RED}✗ Issue${NC}"
fi

# VNC check
echo -n "VNC password: "
if docker exec vnc-desktop test -f /home/evin/.vnc/passwd 2>/dev/null; then
    if ! docker exec vnc-desktop test -f /.password2 2>/dev/null; then
        echo -e "${GREEN}✓ Configured${NC}"
    else
        echo -e "${YELLOW}⚠ Legacy file exists${NC}"
    fi
else
    echo -e "${RED}✗ Not set${NC}"
fi

echo ""
if [ $RUNNING -eq 15 ]; then
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║        ✅ SUCCESS - ALL 15 SERVICES RUNNING              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo -e "${GREEN}${BOLD}COMPLETE SUCCESS!${NC}"
    echo ""
    echo "URLs:"
    echo "  • Dashboard:  https://host.evindrake.net"
    echo "  • Stream Bot: https://stream.rig-city.com"
    echo "  • Discord:    https://bot.rig-city.com"
    echo "  • VNC:        https://vnc.evindrake.net"
    echo ""
    echo -e "${BOLD}VNC Password: $VNC_PASSWORD${NC}"
else
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║        ⚠ PARTIAL SUCCESS - $RUNNING/15 RUNNING              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Checking failed services..."
    for svc in homelab-dashboard discord-bot stream-bot homelab-celery-worker; do
        if ! docker ps | grep -q "$svc"; then
            echo ""
            echo -e "${YELLOW}$svc:${NC}"
            docker logs $svc --tail 15 2>&1 || echo "  (not started)"
        fi
    done
fi
echo ""
