#!/bin/bash
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Banner
show_banner() {
    clear
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}                                                                ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}        ${BOLD}${MAGENTA}🌌 NEBULA COMMAND DEPLOYMENT MANAGER 🚀${NC}            ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                                ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}        ${GREEN}Unified Control Panel for All Services${NC}              ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                                ${CYAN}║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Main Menu
show_menu() {
    show_banner
    
    # Check container status
    echo -e "${BOLD}${BLUE}━━━ Container Status ━━━${NC}"
    check_status_brief
    echo ""
    
    echo -e "${BOLD}${BLUE}━━━ What would you like to do? ━━━${NC}"
    echo ""
    echo -e "  ${BOLD}Deployment:${NC}"
    echo -e "    ${GREEN}1)${NC} 🚀 Full Deploy (build and start all services)"
    echo -e "    ${GREEN}2)${NC} 🔄 Quick Restart (restart without rebuilding)"
    echo -e "    ${GREEN}3)${NC} ⚡ Rebuild & Deploy (force rebuild + restart)"
    echo -e "    ${GREEN}3a)${NC} 🛑 Graceful Shutdown & Cleanup"
    echo ""
    echo -e "  ${BOLD}Service Control:${NC}"
    echo -e "    ${GREEN}4)${NC} ▶️  Start All Services"
    echo -e "    ${GREEN}5)${NC} ⏸️  Stop All Services"
    echo -e "    ${GREEN}6)${NC} 🔄 Restart Specific Service"
    echo ""
    echo -e "  ${BOLD}Database:${NC}"
    echo -e "    ${GREEN}7)${NC} 🗄️  Ensure Databases Exist (fix DB issues)"
    echo -e "    ${GREEN}8)${NC} 📊 Check Database Status"
    echo ""
    echo -e "  ${BOLD}Smart Home:${NC}"
    echo -e "    ${GREEN}9)${NC} 🏠 Setup Home Assistant Integration"
    echo ""
    echo -e "  ${BOLD}Configuration:${NC}"
    echo -e "    ${GREEN}10)${NC} ⚙️  Generate/Edit .env File"
    echo -e "    ${GREEN}11)${NC} 📋 View Current Configuration"
    echo ""
    echo -e "  ${BOLD}Licensing & Subscription:${NC}"
    echo -e "    ${GREEN}21)${NC} 🔑 Activate License Key"
    echo -e "    ${GREEN}22)${NC} 📊 View Subscription Status"
    echo ""
    echo -e "  ${BOLD}Troubleshooting:${NC}"
    echo -e "    ${GREEN}12)${NC} 🔍 View Service Logs"
    echo -e "    ${GREEN}13)${NC} 🏥 Health Check (all services)"
    echo -e "    ${GREEN}14)${NC} 🔧 Full Troubleshoot Mode"
    echo ""
    echo -e "  ${BOLD}Code Sync (Replit → Ubuntu):${NC}"
    echo -e "    ${GREEN}18)${NC} 🔄 Sync from Replit (pull latest code & auto-deploy)"
    echo -e "    ${GREEN}19)${NC} ⚡ Install Auto-Sync (every 5 minutes)"
    echo -e "    ${GREEN}20)${NC} 🔍 Check Auto-Sync Status"
    echo ""
    echo -e "  ${BOLD}Updates:${NC}"
    echo -e "    ${GREEN}17)${NC} 📦 Update Service (pull latest image)"
    echo ""
    echo -e "  ${BOLD}Information:${NC}"
    echo -e "    ${GREEN}15)${NC} 📊 Show Container Details"
    echo -e "    ${GREEN}16)${NC} 🌐 Show Service URLs"
    echo ""
    echo -e "    ${RED}0)${NC} 🚪 Exit"
    echo ""
    echo -n "Enter your choice: "
}

# Brief status check
check_status_brief() {
    local running=$(docker ps --filter "name=homelab-dashboard|homelab-celery-worker|homelab-redis|homelab-minio|discord-bot|stream-bot|caddy|n8n|plex-server|vnc-desktop|code-server|scarletredjoker-web|rig-city-site|homeassistant|discord-bot-db" --format "{{.Names}}" | wc -l)
    local total=15
    
    if [ $running -eq $total ]; then
        echo -e "  ${GREEN}✓ All services running${NC} ($running/$total)"
    elif [ $running -eq 0 ]; then
        echo -e "  ${RED}✗ No services running${NC} ($running/$total)"
    else
        echo -e "  ${YELLOW}⚠ Partial deployment${NC} ($running/$total services running)"
    fi
}

# Full Deploy
full_deploy() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🚀 FULL DEPLOYMENT${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    if [ -f "./deployment/deploy-unified.sh" ]; then
        ./deployment/deploy-unified.sh
    else
        echo -e "${YELLOW}Running manual deployment...${NC}"
        echo "Fixing code-server permissions..."
        mkdir -p ./config/code-server
        sudo chown -R 1000:1000 ./config/code-server 2>/dev/null || true
        echo ""
        docker-compose -f docker-compose.unified.yml up -d --build --remove-orphans
    fi
    
    pause
}

# Quick Restart
quick_restart() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🔄 QUICK RESTART${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    docker-compose -f docker-compose.unified.yml restart 2>/dev/null || true
    echo ""
    echo -e "${GREEN}✓ All services restarted${NC}"
    pause
}

# Rebuild and Deploy
rebuild_deploy() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  ⚡ REBUILD & DEPLOY${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    echo "Step 1: Stopping services..."
    docker-compose -f docker-compose.unified.yml down --remove-orphans --timeout 30
    
    echo ""
    echo "Step 2: Cleaning up networks..."
    docker network prune -f
    
    echo ""
    echo "Step 3: Building containers (no cache)..."
    docker-compose -f docker-compose.unified.yml build --no-cache
    
    echo ""
    echo "Step 4: Starting services..."
    docker-compose -f docker-compose.unified.yml up -d --remove-orphans
    
    echo ""
    echo -e "${GREEN}✓ Rebuild complete${NC}"
    pause
}

# Start All Services
start_services() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  ▶️  STARTING ALL SERVICES${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    docker-compose -f docker-compose.unified.yml up -d --remove-orphans
    echo ""
    echo -e "${GREEN}✓ All services started${NC}"
    pause
}

# Stop All Services
stop_services() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  ⏸️  STOPPING ALL SERVICES${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    docker-compose -f docker-compose.unified.yml down --remove-orphans
    echo ""
    echo -e "${GREEN}✓ All services stopped${NC}"
    pause
}

# Graceful Shutdown with Cleanup
graceful_shutdown() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🛑 GRACEFUL SHUTDOWN & CLEANUP${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    echo "Step 1: Stopping all services..."
    docker-compose -f docker-compose.unified.yml down --remove-orphans --timeout 30
    
    echo ""
    echo "Step 2: Removing orphaned containers..."
    docker container prune -f
    
    echo ""
    echo "Step 3: Cleaning up unused networks..."
    docker network prune -f
    
    echo ""
    echo "Step 4: Removing dangling volumes (if any)..."
    docker volume prune -f --filter "label!=keep"
    
    echo ""
    echo -e "${GREEN}✓ Graceful shutdown complete${NC}"
    pause
}

# Restart Specific Service
restart_service() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🔄 RESTART SPECIFIC SERVICE${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Available services:"
    echo "  1) homelab-dashboard"
    echo "  2) discord-bot"
    echo "  3) stream-bot"
    echo "  4) caddy"
    echo "  5) discord-bot-db"
    echo "  6) redis"
    echo "  7) minio"
    echo "  8) homelab-celery-worker"
    echo "  9) n8n"
    echo "  10) plex"
    echo "  11) vnc-desktop"
    echo "  12) code-server"
    echo "  13) scarletredjoker-web"
    echo "  14) rig-city-site"
    echo "  15) homeassistant"
    echo ""
    read -p "Enter service number (or name): " service_choice
    
    case $service_choice in
        1|homelab-dashboard) service="homelab-dashboard" ;;
        2|discord-bot) service="discord-bot" ;;
        3|stream-bot) service="stream-bot" ;;
        4|caddy) service="caddy" ;;
        5|discord-bot-db) service="discord-bot-db" ;;
        6|redis) service="redis" ;;
        7|minio) service="minio" ;;
        8|homelab-celery-worker) service="homelab-celery-worker" ;;
        9|n8n) service="n8n" ;;
        10|plex) service="plex" ;;
        11|vnc-desktop) service="vnc-desktop" ;;
        12|code-server) service="code-server" ;;
        13|scarletredjoker-web) service="scarletredjoker-web" ;;
        14|rig-city-site) service="rig-city-site" ;;
        15|homeassistant) service="homeassistant" ;;
        *) service="$service_choice" ;;
    esac
    
    echo ""
    echo "Restarting $service..."
    docker-compose -f docker-compose.unified.yml restart $service
    echo ""
    echo -e "${GREEN}✓ $service restarted${NC}"
    pause
}

# Update Specific Service
update_service() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  📦 UPDATE SPECIFIC SERVICE${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Available services:"
    echo "  1) homelab-dashboard"
    echo "  2) discord-bot"
    echo "  3) stream-bot"
    echo "  4) caddy"
    echo "  5) discord-bot-db"
    echo "  6) redis"
    echo "  7) minio"
    echo "  8) homelab-celery-worker"
    echo "  9) n8n"
    echo "  10) plex"
    echo "  11) vnc-desktop"
    echo "  12) code-server"
    echo "  13) scarletredjoker-web"
    echo "  14) rig-city-site"
    echo "  15) homeassistant"
    echo ""
    read -p "Enter service number (or name): " service_choice
    
    case $service_choice in
        1|homelab-dashboard) service="homelab-dashboard" ;;
        2|discord-bot) service="discord-bot" ;;
        3|stream-bot) service="stream-bot" ;;
        4|caddy) service="caddy" ;;
        5|discord-bot-db) service="discord-bot-db" ;;
        6|redis) service="redis" ;;
        7|minio) service="minio" ;;
        8|homelab-celery-worker) service="homelab-celery-worker" ;;
        9|n8n) service="n8n" ;;
        10|plex) service="plex" ;;
        11|vnc-desktop) service="vnc-desktop" ;;
        12|code-server) service="code-server" ;;
        13|scarletredjoker-web) service="scarletredjoker-web" ;;
        14|rig-city-site) service="rig-city-site" ;;
        15|homeassistant) service="homeassistant" ;;
        *) service="$service_choice" ;;
    esac
    
    echo ""
    if [ -f "./deployment/update-service.sh" ]; then
        echo "Using update-service.sh script..."
        ./deployment/update-service.sh "$service"
    else
        echo "Pulling latest image for $service..."
        docker-compose -f docker-compose.unified.yml pull "$service"
        echo "Recreating $service..."
        docker-compose -f docker-compose.unified.yml up -d --no-deps "$service"
        echo ""
        echo -e "${GREEN}✓ $service updated${NC}"
    fi
    pause
}

# Load .env for database passwords - Safe parsing
load_env_passwords() {
    if [ ! -f ".env" ]; then
        echo -e "${RED}✗ .env file not found${NC}"
        return 1
    fi
    
    # Safe parsing that handles special characters in passwords
    set -a
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        [[ "$key" =~ ^[[:space:]]*# ]] && continue
        [[ -z "$key" ]] && continue
        
        # Only load database password variables
        if [[ "$key" =~ ^(DISCORD_DB_PASSWORD|STREAMBOT_DB_PASSWORD|JARVIS_DB_PASSWORD)$ ]]; then
            # Remove quotes if present
            value="${value%\"}"
            value="${value#\"}"
            export "$key=$value"
        fi
    done < .env
    set +a
    
    return 0
}

# Ensure Databases Exist - Comprehensive Repair
ensure_databases() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🗄️  DATABASE DIAGNOSTIC & REPAIR${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    # Check if PostgreSQL container is running
    if ! docker ps --format '{{.Names}}' | grep -q '^discord-bot-db$'; then
        echo -e "${RED}✗ PostgreSQL container is not running${NC}"
        echo ""
        echo "Starting PostgreSQL container..."
        docker-compose -f docker-compose.unified.yml up -d discord-bot-db
        echo "Waiting for PostgreSQL to start..."
        sleep 5
    fi
    
    echo -e "${GREEN}✓ PostgreSQL container is running${NC}"
    echo ""
    
    # Load passwords from .env
    echo "Loading credentials from .env..."
    load_env_passwords || { pause; return 1; }
    
    # Check required passwords
    local missing_passwords=0
    if [ -z "$DISCORD_DB_PASSWORD" ]; then
        echo -e "${RED}✗ DISCORD_DB_PASSWORD not set in .env${NC}"
        missing_passwords=1
    else
        echo -e "${GREEN}✓ DISCORD_DB_PASSWORD found${NC}"
    fi
    
    if [ -z "$STREAMBOT_DB_PASSWORD" ]; then
        echo -e "${RED}✗ STREAMBOT_DB_PASSWORD not set in .env${NC}"
        missing_passwords=1
    else
        echo -e "${GREEN}✓ STREAMBOT_DB_PASSWORD found${NC}"
    fi
    
    if [ -z "$JARVIS_DB_PASSWORD" ]; then
        echo -e "${RED}✗ JARVIS_DB_PASSWORD not set in .env${NC}"
        missing_passwords=1
    else
        echo -e "${GREEN}✓ JARVIS_DB_PASSWORD found${NC}"
    fi
    
    if [ $missing_passwords -eq 1 ]; then
        echo ""
        echo -e "${RED}✗ Cannot proceed with missing passwords${NC}"
        echo -e "${YELLOW}Please set all required passwords in .env and try again${NC}"
        pause
        return 1
    fi
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BOLD}${YELLOW}Creating/Repairing Databases and Users${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    # Defensive check - abort if any password is empty after loading
    if [ -z "$DISCORD_DB_PASSWORD" ] || [ -z "$STREAMBOT_DB_PASSWORD" ] || [ -z "$JARVIS_DB_PASSWORD" ]; then
        echo -e "${RED}✗ CRITICAL: One or more passwords became empty after loading${NC}"
        echo -e "${YELLOW}This may indicate special characters in .env. Please verify your .env file.${NC}"
        pause
        return 1
    fi
    
    # Create ticketbot database and user
    echo "1️⃣  Discord Bot (ticketbot)..."
    if docker exec discord-bot-db psql -U postgres -d postgres <<-EOSQL 2>/dev/null
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ticketbot') THEN
                CREATE ROLE ticketbot WITH LOGIN PASSWORD '${DISCORD_DB_PASSWORD}';
            ELSE
                ALTER ROLE ticketbot WITH PASSWORD '${DISCORD_DB_PASSWORD}';
            END IF;
        END
        \$\$;
        
        SELECT 'CREATE DATABASE ticketbot OWNER ticketbot'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ticketbot')\gexec
        
        GRANT ALL PRIVILEGES ON DATABASE ticketbot TO ticketbot;
EOSQL
    then
        echo -e "${GREEN}   ✓ ticketbot database ready${NC}"
    else
        echo -e "${RED}   ✗ Failed to create ticketbot database${NC}"
        echo "   Please check database container logs"
    fi
    
    # Create streambot database and user
    echo "2️⃣  Stream Bot (streambot)..."
    if docker exec discord-bot-db psql -U postgres -d postgres <<-EOSQL 2>/dev/null
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'streambot') THEN
                CREATE ROLE streambot WITH LOGIN PASSWORD '${STREAMBOT_DB_PASSWORD}';
            ELSE
                ALTER ROLE streambot WITH PASSWORD '${STREAMBOT_DB_PASSWORD}';
            END IF;
        END
        \$\$;
        
        SELECT 'CREATE DATABASE streambot OWNER streambot'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'streambot')\gexec
        
        GRANT ALL PRIVILEGES ON DATABASE streambot TO streambot;
EOSQL
    then
        echo -e "${GREEN}   ✓ streambot database ready${NC}"
    else
        echo -e "${RED}   ✗ Failed to create streambot database${NC}"
    fi
    
    # Create jarvis database and user
    echo "3️⃣  Dashboard/Jarvis (homelab_jarvis)..."
    if docker exec discord-bot-db psql -U postgres -d postgres <<-EOSQL 2>/dev/null
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'jarvis') THEN
                CREATE ROLE jarvis WITH LOGIN PASSWORD '${JARVIS_DB_PASSWORD}';
            ELSE
                ALTER ROLE jarvis WITH PASSWORD '${JARVIS_DB_PASSWORD}';
            END IF;
        END
        \$\$;
        
        SELECT 'CREATE DATABASE homelab_jarvis OWNER jarvis'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'homelab_jarvis')\gexec
        
        GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis TO jarvis;
EOSQL
    then
        echo -e "${GREEN}   ✓ homelab_jarvis database ready${NC}"
    else
        echo -e "${RED}   ✗ Failed to create jarvis database${NC}"
    fi
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BOLD}${GREEN}✅ Database Repair Complete!${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "What was done:"
    echo "  • Created/updated all required database users"
    echo "  • Reset passwords to match .env file"
    echo "  • Created missing databases"
    echo "  • Granted necessary privileges"
    echo ""
    echo -e "${YELLOW}💡 Tip: Restart your services to apply the changes:${NC}"
    echo "     docker-compose -f docker-compose.unified.yml restart stream-bot homelab-dashboard homelab-celery-worker"
    echo ""
    
    pause
}

# Check Database Status - Comprehensive Diagnostics
check_database_status() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  📊 COMPREHENSIVE DATABASE STATUS${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    # Check if PostgreSQL container is running
    if ! docker ps --format '{{.Names}}' | grep -q '^discord-bot-db$'; then
        echo -e "${RED}✗ PostgreSQL container is NOT running${NC}"
        echo ""
        echo "Start the database container with:"
        echo "  docker-compose -f docker-compose.unified.yml up -d discord-bot-db"
        pause
        return 1
    fi
    
    echo -e "${GREEN}✓ PostgreSQL container is running${NC}"
    echo ""
    
    # Load passwords from .env
    echo "Checking .env configuration..."
    load_env_passwords || { pause; return 1; }
    
    local env_status=0
    [ -n "$DISCORD_DB_PASSWORD" ] && echo -e "${GREEN}✓ DISCORD_DB_PASSWORD${NC}" || { echo -e "${RED}✗ DISCORD_DB_PASSWORD${NC}"; env_status=1; }
    [ -n "$STREAMBOT_DB_PASSWORD" ] && echo -e "${GREEN}✓ STREAMBOT_DB_PASSWORD${NC}" || { echo -e "${RED}✗ STREAMBOT_DB_PASSWORD${NC}"; env_status=1; }
    [ -n "$JARVIS_DB_PASSWORD" ] && echo -e "${GREEN}✓ JARVIS_DB_PASSWORD${NC}" || { echo -e "${RED}✗ JARVIS_DB_PASSWORD${NC}"; env_status=1; }
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BOLD}Database Roles (Users):${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    docker exec discord-bot-db psql -U postgres -d postgres -c "\du" 2>/dev/null || echo -e "${RED}Failed to query roles${NC}"
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BOLD}Databases:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    docker exec discord-bot-db psql -U postgres -d postgres -c "\l" 2>/dev/null || echo -e "${RED}Failed to list databases${NC}"
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BOLD}Connection Tests:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Test ticketbot connection with scoped password
    echo -n "1️⃣  ticketbot → ticketbot: "
    if PGPASSWORD="$DISCORD_DB_PASSWORD" docker exec -e PGPASSWORD discord-bot-db psql -U ticketbot -d ticketbot -c "SELECT 1;" &>/dev/null; then
        echo -e "${GREEN}✓ Connected${NC}"
    else
        echo -e "${RED}✗ Failed${NC}"
    fi
    
    # Test streambot connection with scoped password
    echo -n "2️⃣  streambot → streambot: "
    if PGPASSWORD="$STREAMBOT_DB_PASSWORD" docker exec -e PGPASSWORD discord-bot-db psql -U streambot -d streambot -c "SELECT 1;" &>/dev/null; then
        echo -e "${GREEN}✓ Connected${NC}"
    else
        echo -e "${RED}✗ Failed (Run option 7 to repair)${NC}"
    fi
    
    # Test jarvis connection with scoped password
    echo -n "3️⃣  jarvis → homelab_jarvis: "
    if PGPASSWORD="$JARVIS_DB_PASSWORD" docker exec -e PGPASSWORD discord-bot-db psql -U jarvis -d homelab_jarvis -c "SELECT 1;" &>/dev/null; then
        echo -e "${GREEN}✓ Connected${NC}"
    else
        echo -e "${RED}✗ Failed (Run option 7 to repair)${NC}"
    fi
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BOLD}${YELLOW}💡 If you see connection failures, run option 7 to repair${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    pause
}

# Setup Home Assistant Integration
setup_home_assistant() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🏠 HOME ASSISTANT SETUP WIZARD${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    # Check for required tools
    echo "Checking prerequisites..."
    if ! command -v jq &> /dev/null; then
        echo -e "${YELLOW}⚠ jq is not installed (needed for API validation)${NC}"
        echo ""
        read -p "Would you like to install jq? (y/n): " install_jq
        if [[ "$install_jq" =~ ^[Yy]$ ]]; then
            echo "Installing jq..."
            sudo apt-get update && sudo apt-get install -y jq
        else
            echo -e "${RED}Cannot proceed without jq. Exiting setup.${NC}"
            pause
            return 1
        fi
    fi
    echo -e "${GREEN}✓ Prerequisites met${NC}"
    echo ""
    
    # Step 1: Check if Home Assistant is running
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BOLD}Step 1: Checking Home Assistant Status${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    local ha_running=false
    if docker ps --format '{{.Names}}' | grep -q '^homeassistant$'; then
        echo -e "${GREEN}✓ Home Assistant container is running${NC}"
        ha_running=true
    else
        echo -e "${YELLOW}⚠ Home Assistant container is not running${NC}"
        echo ""
        read -p "Would you like to start Home Assistant now? (y/n): " start_ha
        if [[ "$start_ha" =~ ^[Yy]$ ]]; then
            echo "Starting Home Assistant..."
            docker-compose -f docker-compose.unified.yml up -d homeassistant
            
            echo "Waiting for Home Assistant to start (this may take up to 2 minutes)..."
            local timeout=120
            local elapsed=0
            while [ $elapsed -lt $timeout ]; do
                if docker ps --format '{{.Names}}' | grep -q '^homeassistant$'; then
                    ha_running=true
                    echo -e "${GREEN}✓ Home Assistant started successfully${NC}"
                    sleep 10  # Give it a bit more time to fully initialize
                    break
                fi
                sleep 5
                elapsed=$((elapsed + 5))
                echo -n "."
            done
            
            if [ "$ha_running" = false ]; then
                echo ""
                echo -e "${RED}✗ Home Assistant failed to start within timeout${NC}"
                echo "Please check logs: docker-compose -f docker-compose.unified.yml logs homeassistant"
                pause
                return 1
            fi
        else
            echo -e "${YELLOW}Cannot continue without Home Assistant running. Exiting setup.${NC}"
            pause
            return 1
        fi
    fi
    
    echo ""
    
    # Step 2: Display First-Time Setup Instructions
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║ HOME ASSISTANT FIRST-TIME SETUP                              ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║ Home Assistant is now running at:                           ║"
    echo "║   → https://home.evindrake.net                               ║"
    echo "║   → http://localhost:8123                                    ║"
    echo "║                                                              ║"
    echo "║ STEP 1: Complete Initial Setup                              ║"
    echo "║   1. Open https://home.evindrake.net in your browser        ║"
    echo "║   2. Create your admin account                               ║"
    echo "║   3. Complete the onboarding wizard                          ║"
    echo "║   4. Press Enter when done...                                ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    read -p "Press Enter when you've completed the initial setup..."
    
    echo ""
    
    # Step 3: Access Token Creation Guide
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║ STEP 2: Create Long-Lived Access Token                      ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║ 1. Log in to Home Assistant (https://home.evindrake.net)    ║"
    echo "║ 2. Click your profile icon (bottom left)                    ║"
    echo "║ 3. Scroll to \"Long-Lived Access Tokens\"                     ║"
    echo "║ 4. Click \"CREATE TOKEN\"                                     ║"
    echo "║ 5. Name it: \"Nebula Command Dashboard\"                      ║"
    echo "║ 6. Copy the token (you'll only see it once!)                ║"
    echo "║                                                              ║"
    echo "║ Paste your access token below:                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    
    # Get token with masked input
    local token=""
    local token_valid=false
    local max_attempts=3
    local attempt=1
    
    while [ $attempt -le $max_attempts ] && [ "$token_valid" = false ]; do
        if [ $attempt -gt 1 ]; then
            echo ""
            echo -e "${YELLOW}Attempt $attempt of $max_attempts${NC}"
        fi
        
        read -sp "Enter Home Assistant access token: " token
        echo ""
        
        # Basic validation - token should not be empty
        if [ -z "$token" ]; then
            echo -e "${RED}✗ Token cannot be empty${NC}"
            attempt=$((attempt + 1))
            continue
        fi
        
        # Step 4: Validate Token
        echo ""
        echo "Validating token..."
        
        # Test connection to Home Assistant API
        local api_response
        api_response=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            http://localhost:8123/api/ 2>/dev/null || echo -e "\n000")
        
        local http_code=$(echo "$api_response" | tail -n1)
        local response_body=$(echo "$api_response" | head -n-1)
        
        if [ "$http_code" = "200" ]; then
            local api_message=$(echo "$response_body" | jq -r '.message' 2>/dev/null || echo "")
            if [ "$api_message" = "API running." ]; then
                echo -e "${GREEN}✓ Token validated successfully!${NC}"
                token_valid=true
                
                # Get Home Assistant version
                local version_info=$(curl -s -H "Authorization: Bearer $token" \
                    http://localhost:8123/api/config 2>/dev/null | jq -r '.version' 2>/dev/null || echo "unknown")
                if [ "$version_info" != "unknown" ] && [ -n "$version_info" ]; then
                    echo -e "${GREEN}✓ Home Assistant version: $version_info${NC}"
                fi
            else
                echo -e "${RED}✗ Unexpected API response${NC}"
                attempt=$((attempt + 1))
            fi
        elif [ "$http_code" = "401" ]; then
            echo -e "${RED}✗ Authentication failed: Invalid token${NC}"
            echo "Please verify you copied the complete token from Home Assistant."
            attempt=$((attempt + 1))
        elif [ "$http_code" = "000" ]; then
            echo -e "${RED}✗ Connection failed: Cannot reach Home Assistant${NC}"
            echo "Please verify Home Assistant is running and accessible."
            attempt=$((attempt + 1))
        else
            echo -e "${RED}✗ Validation failed with HTTP code: $http_code${NC}"
            attempt=$((attempt + 1))
        fi
    done
    
    if [ "$token_valid" = false ]; then
        echo ""
        echo -e "${RED}✗ Failed to validate token after $max_attempts attempts${NC}"
        echo "Please ensure:"
        echo "  • Home Assistant is accessible at http://localhost:8123"
        echo "  • The token is valid and copied correctly"
        echo "  • You have network connectivity"
        pause
        return 1
    fi
    
    # Step 5: Update .env File
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BOLD}Step 3: Updating Configuration${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    # Create .env if it doesn't exist
    if [ ! -f ".env" ]; then
        echo "Creating new .env file..."
        touch .env
    fi
    
    # Backup existing .env
    cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
    echo -e "${GREEN}✓ Backed up existing .env${NC}"
    
    # Remove old Home Assistant configuration if exists
    sed -i '/^HOME_ASSISTANT_URL=/d' .env
    sed -i '/^HOME_ASSISTANT_TOKEN=/d' .env
    sed -i '/^HOME_ASSISTANT_VERIFY_SSL=/d' .env
    
    # Add new configuration
    echo "" >> .env
    echo "# Home Assistant Integration" >> .env
    echo "HOME_ASSISTANT_URL=https://home.evindrake.net" >> .env
    echo "HOME_ASSISTANT_TOKEN=$token" >> .env
    echo "HOME_ASSISTANT_VERIFY_SSL=True" >> .env
    
    echo -e "${GREEN}✓ Updated .env with Home Assistant configuration${NC}"
    
    # Step 6: Restart Dashboard Services
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BOLD}Step 4: Restarting Services${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    echo "Restarting dashboard services to load new configuration..."
    if docker-compose -f docker-compose.unified.yml restart homelab-dashboard homelab-celery-worker 2>/dev/null; then
        echo -e "${GREEN}✓ Services restarted successfully${NC}"
        echo "Waiting for services to initialize..."
        sleep 5
    else
        echo -e "${YELLOW}⚠ Warning: Could not restart services automatically${NC}"
        echo "Please restart manually: docker-compose -f docker-compose.unified.yml restart homelab-dashboard homelab-celery-worker"
    fi
    
    # Step 7: Success Message
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║ ✅ HOME ASSISTANT INTEGRATION COMPLETE!                      ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║ Your Nebula Command dashboard can now control:              ║"
    echo "║   • Smart lights                                             ║"
    echo "║   • Switches and outlets                                     ║"
    echo "║   • Thermostats and climate control                          ║"
    echo "║   • Sensors and monitoring                                   ║"
    echo "║   • Scenes and automations                                   ║"
    echo "║                                                              ║"
    echo "║ Access the Smart Home control panel:                        ║"
    echo "║   → https://host.evindrake.net/smart_home                    ║"
    echo "║                                                              ║"
    echo "║ Home Assistant URL: https://home.evindrake.net               ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo -e "${GREEN}Configuration saved to .env${NC}"
    echo -e "${YELLOW}Backup created: .env.backup.$(date +%Y%m%d)_*${NC}"
    echo ""
    
    pause
}

# Generate/Edit .env
generate_env() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  ⚙️  ENVIRONMENT CONFIGURATION${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    if [ -f ".env" ]; then
        echo "Existing .env file found."
        echo ""
        echo "1) Edit existing .env"
        echo "2) Regenerate from scratch"
        echo "3) View current .env"
        echo "4) Back to main menu"
        echo ""
        read -p "Choose option: " env_choice
        
        case $env_choice in
            1)
                ${EDITOR:-nano} .env
                ;;
            2)
                if [ -f "./deployment/generate-unified-env.sh" ]; then
                    ./deployment/generate-unified-env.sh
                else
                    echo "Copying from example..."
                    cp .env.unified.example .env
                    ${EDITOR:-nano} .env
                fi
                ;;
            3)
                echo ""
                cat .env
                pause
                ;;
            *)
                return
                ;;
        esac
    else
        echo "No .env file found. Creating from template..."
        if [ -f "./deployment/generate-unified-env.sh" ]; then
            ./deployment/generate-unified-env.sh
        else
            cp .env.unified.example .env
            ${EDITOR:-nano} .env
        fi
    fi
    
    pause
}

# View Current Configuration
view_config() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  📋 CURRENT CONFIGURATION${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    if [ -f ".env" ]; then
        # Show non-sensitive parts
        echo "Configuration file: .env"
        echo ""
        grep -E "^[A-Z_]+=.+" .env | grep -v "PASSWORD\|SECRET\|TOKEN\|KEY" | head -20
        echo ""
        echo -e "${YELLOW}(Sensitive values hidden)${NC}"
    else
        echo -e "${RED}✗ No .env file found${NC}"
    fi
    
    pause
}

# View Service Logs
view_logs() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🔍 SERVICE LOGS${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Available services:"
    echo "  1) homelab-dashboard"
    echo "  2) discord-bot"
    echo "  3) stream-bot"
    echo "  4) caddy"
    echo "  5) discord-bot-db"
    echo "  6) redis"
    echo "  7) minio"
    echo "  8) homelab-celery-worker"
    echo "  9) n8n"
    echo "  10) plex"
    echo "  11) vnc-desktop"
    echo "  12) code-server"
    echo "  13) homeassistant"
    echo "  14) rig-city-site"
    echo "  15) scarletredjoker-web"
    echo "  16) All services"
    echo "  17) Save stream-bot logs to file"
    echo "  18) Save all logs to file"
    echo ""
    read -p "Enter service number: " log_choice
    
    case $log_choice in
        1) docker-compose -f docker-compose.unified.yml logs -f homelab-dashboard || true ;;
        2) docker-compose -f docker-compose.unified.yml logs -f discord-bot || true ;;
        3) docker-compose -f docker-compose.unified.yml logs -f stream-bot || true ;;
        4) docker-compose -f docker-compose.unified.yml logs -f caddy || true ;;
        5) docker-compose -f docker-compose.unified.yml logs -f discord-bot-db || true ;;
        6) docker-compose -f docker-compose.unified.yml logs -f redis || true ;;
        7) docker-compose -f docker-compose.unified.yml logs -f minio || true ;;
        8) docker-compose -f docker-compose.unified.yml logs -f homelab-celery-worker || true ;;
        9) docker-compose -f docker-compose.unified.yml logs -f n8n || true ;;
        10) docker-compose -f docker-compose.unified.yml logs -f plex || true ;;
        11) docker-compose -f docker-compose.unified.yml logs -f vnc-desktop || true ;;
        12) docker-compose -f docker-compose.unified.yml logs -f code-server || true ;;
        13) docker-compose -f docker-compose.unified.yml logs -f homeassistant || true ;;
        14) docker-compose -f docker-compose.unified.yml logs -f rig-city-site || true ;;
        15) docker-compose -f docker-compose.unified.yml logs -f scarletredjoker-web || true ;;
        16) docker-compose -f docker-compose.unified.yml logs -f || true ;;
        17) 
            echo "Saving stream-bot logs to stream-bot-logs.txt..."
            if docker-compose -f docker-compose.unified.yml logs stream-bot > stream-bot-logs.txt 2>&1; then
                echo -e "${GREEN}✓ Logs saved to stream-bot-logs.txt${NC}"
            else
                echo -e "${RED}✗ Failed to save logs (service may not be running)${NC}"
            fi
            ;;
        18)
            echo "Saving all logs to homelab-logs.txt..."
            if docker-compose -f docker-compose.unified.yml logs > homelab-logs.txt 2>&1; then
                echo -e "${GREEN}✓ Logs saved to homelab-logs.txt${NC}"
            else
                echo -e "${RED}✗ Failed to save logs${NC}"
            fi
            ;;
        *) echo "Invalid choice" ;;
    esac
    
    echo ""
    echo -e "${YELLOW}(Press any key to return to menu)${NC}"
    pause
}

# Health Check
health_check() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🏥 HEALTH CHECK${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    echo "Container Status:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" --filter "name=homelab-dashboard|homelab-celery-worker|homelab-redis|homelab-minio|discord-bot|stream-bot|caddy|n8n|plex-server|vnc-desktop|code-server|scarletredjoker-web|rig-city-site|homeassistant|discord-bot-db"
    
    echo ""
    echo "Resource Usage:"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" --filter "name=homelab-dashboard|homelab-celery-worker|homelab-redis|homelab-minio|discord-bot|stream-bot|caddy|n8n|plex-server|vnc-desktop|code-server|scarletredjoker-web|rig-city-site|homeassistant|discord-bot-db"
    
    pause
}

# Full Troubleshoot Mode
troubleshoot() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🔧 TROUBLESHOOT MODE${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    echo "Running diagnostic checks..."
    echo ""
    
    # Check docker
    echo "1. Docker Status:"
    if docker info >/dev/null 2>&1; then
        echo -e "   ${GREEN}✓ Docker is running${NC}"
    else
        echo -e "   ${RED}✗ Docker is not accessible${NC}"
    fi
    
    # Check .env
    echo "2. Environment File:"
    if [ -f ".env" ]; then
        echo -e "   ${GREEN}✓ .env file exists${NC}"
    else
        echo -e "   ${RED}✗ .env file missing${NC}"
    fi
    
    # Check compose file
    echo "3. Compose File:"
    if [ -f "docker-compose.unified.yml" ]; then
        echo -e "   ${GREEN}✓ docker-compose.unified.yml exists${NC}"
    else
        echo -e "   ${RED}✗ docker-compose.unified.yml missing${NC}"
    fi
    
    # Check containers
    echo "4. Container Status:"
    local failed=$(docker ps -a --filter "status=exited" --filter "name=homelab-dashboard|homelab-celery-worker|homelab-redis|homelab-minio|discord-bot|stream-bot|caddy|n8n|plex-server|vnc-desktop|code-server|scarletredjoker-web|rig-city-site|homeassistant|discord-bot-db" --format "{{.Names}}")
    if [ -z "$failed" ]; then
        echo -e "   ${GREEN}✓ No failed containers${NC}"
    else
        echo -e "   ${RED}✗ Failed containers: $failed${NC}"
    fi
    
    # Check database
    echo "5. Database:"
    if docker ps --format '{{.Names}}' | grep -q '^discord-bot-db$'; then
        echo -e "   ${GREEN}✓ PostgreSQL is running${NC}"
    else
        echo -e "   ${RED}✗ PostgreSQL is not running${NC}"
    fi
    
    echo ""
    echo "For detailed troubleshooting, see: docs/DATABASE_TROUBLESHOOTING.md"
    
    pause
}

# Show Container Details
show_details() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  📊 CONTAINER DETAILS${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    docker-compose -f docker-compose.unified.yml ps -a
    pause
}

# Show Service URLs
show_urls() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🌐 SERVICE URLs${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${GREEN}Production URLs:${NC}"
    echo "  🏠 Dashboard:      https://host.evindrake.net"
    echo "  🤖 Discord Bot:    https://bot.rig-city.com"
    echo "  📺 Stream Bot:     https://stream.rig-city.com"
    echo "  🎬 Plex:           https://plex.evindrake.net"
    echo "  ⚙️  n8n:            https://n8n.evindrake.net"
    echo "  🖥️  VNC Desktop:    https://vnc.evindrake.net"
    echo "  🌐 Portfolio:      https://scarletredjoker.com"
    echo ""
    pause
}

# Sync from Replit
sync_from_replit() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🔄 SYNC FROM REPLIT${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    if [ -f "./deployment/sync-from-replit.sh" ]; then
        ./deployment/sync-from-replit.sh
    else
        echo -e "${RED}Error: sync-from-replit.sh not found in deployment folder${NC}"
    fi
    
    pause
}

# Install Auto-Sync
install_auto_sync() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  ⚡ INSTALL AUTO-SYNC${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    if [ -f "./deployment/install-auto-sync.sh" ]; then
        sudo ./deployment/install-auto-sync.sh
        echo ""
        echo -e "${GREEN}✓ Auto-sync installed! Will run every 5 minutes.${NC}"
    else
        echo -e "${RED}Error: install-auto-sync.sh not found in deployment folder${NC}"
    fi
    
    pause
}

# Check Sync Status
check_sync_status() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🔍 AUTO-SYNC STATUS${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    # Check if systemd timer exists
    if systemctl list-unit-files | grep -q "replit-sync.timer"; then
        echo -e "${GREEN}✓ Auto-sync is installed${NC}"
        echo ""
        echo "Timer Status:"
        systemctl status replit-sync.timer --no-pager | head -10
        echo ""
        echo "Service Status:"
        systemctl status replit-sync.service --no-pager | head -10
        echo ""
        echo "Recent Sync Logs:"
        journalctl -u replit-sync.service -n 20 --no-pager
    else
        echo -e "${YELLOW}⚠ Auto-sync is NOT installed${NC}"
        echo ""
        echo "To install auto-sync, choose option 19 from the main menu."
    fi
    
    pause
}

# Activate License
activate_license() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🔑 NEBULA COMMAND LICENSE ACTIVATION${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    echo "This will activate your Nebula Command license on this server."
    echo ""
    echo "Don't have a license key? Visit:"
    echo "  → https://host.evindrake.net/pricing"
    echo ""
    
    # Get license key
    read -p "Enter your license key: " LICENSE_KEY
    
    if [ -z "$LICENSE_KEY" ]; then
        echo -e "${RED}✗ No license key provided${NC}"
        pause
        return
    fi
    
    # Generate server ID from machine ID
    if [ -f "/etc/machine-id" ]; then
        SERVER_ID=$(cat /etc/machine-id)
    else
        SERVER_ID=$(hostname | md5sum | cut -d' ' -f1)
    fi
    
    HOSTNAME=$(hostname)
    IP=$(hostname -I | awk '{print $1}')
    
    echo ""
    echo "Server Information:"
    echo "  Hostname: $HOSTNAME"
    echo "  IP: $IP"
    echo "  Server ID: $SERVER_ID"
    echo ""
    echo "Activating license..."
    
    # Activate via API
    RESPONSE=$(curl -s -X POST "https://host.evindrake.net/api/subscription/activate" \
        -H "Content-Type: application/json" \
        -d "{\"license_key\": \"$LICENSE_KEY\", \"server_id\": \"$SERVER_ID\", \"hostname\": \"$HOSTNAME\", \"ip\": \"$IP\"}")
    
    # Check response
    SUCCESS=$(echo "$RESPONSE" | grep -o '"success"[[:space:]]*:[[:space:]]*true')
    
    if [ ! -z "$SUCCESS" ]; then
        echo -e "${GREEN}✓ License activated successfully!${NC}"
        echo ""
        
        # Extract tier information
        TIER=$(echo "$RESPONSE" | grep -o '"tier"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        STATUS=$(echo "$RESPONSE" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        
        if [ ! -z "$TIER" ]; then
            echo "Subscription Tier: ${BOLD}$TIER${NC}"
            echo "Status: $STATUS"
        fi
        
        # Save license key to local config
        echo "$LICENSE_KEY" > .nebula_license
        chmod 600 .nebula_license
        
        echo ""
        echo -e "${GREEN}License key saved locally${NC}"
    else
        echo -e "${RED}✗ License activation failed${NC}"
        echo ""
        MESSAGE=$(echo "$RESPONSE" | grep -o '"message"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        if [ ! -z "$MESSAGE" ]; then
            echo "Error: $MESSAGE"
        else
            echo "Full response:"
            echo "$RESPONSE"
        fi
    fi
    
    pause
}

# View Subscription Status
view_subscription_status() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  📊 SUBSCRIPTION STATUS${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    # Check if license key exists
    if [ ! -f ".nebula_license" ]; then
        echo -e "${YELLOW}No license key found on this server${NC}"
        echo ""
        echo "To activate a license, choose option 21 from the main menu."
        pause
        return
    fi
    
    LICENSE_KEY=$(cat .nebula_license)
    
    # Generate server ID
    if [ -f "/etc/machine-id" ]; then
        SERVER_ID=$(cat /etc/machine-id)
    else
        SERVER_ID=$(hostname | md5sum | cut -d' ' -f1)
    fi
    
    echo "Checking subscription status..."
    echo ""
    
    # Verify license via API
    RESPONSE=$(curl -s -X POST "https://host.evindrake.net/api/subscription/verify" \
        -H "Content-Type: application/json" \
        -d "{\"license_key\": \"$LICENSE_KEY\", \"server_id\": \"$SERVER_ID\"}")
    
    VALID=$(echo "$RESPONSE" | grep -o '"valid"[[:space:]]*:[[:space:]]*true')
    
    if [ ! -z "$VALID" ]; then
        echo -e "${GREEN}✓ License is active and valid${NC}"
        echo ""
        echo "License Key: ${LICENSE_KEY:0:16}..."
        echo "Server ID: $SERVER_ID"
        echo ""
        echo "For detailed subscription information, visit:"
        echo "  → https://host.evindrake.net/pricing"
    else
        echo -e "${RED}✗ License is not valid${NC}"
        echo ""
        echo "Please activate or renew your license."
        echo "Visit: https://host.evindrake.net/pricing"
    fi
    
    pause
}

# Pause helper
pause() {
    echo ""
    read -p "Press Enter to continue..."
}

# Main loop
main() {
    while true; do
        show_menu
        read choice
        
        case $choice in
            1) full_deploy ;;
            2) quick_restart ;;
            3) rebuild_deploy ;;
            3a) graceful_shutdown ;;
            4) start_services ;;
            5) stop_services ;;
            6) restart_service ;;
            7) ensure_databases ;;
            8) check_database_status ;;
            9) setup_home_assistant ;;
            10) generate_env ;;
            11) view_config ;;
            12) view_logs ;;
            13) health_check ;;
            14) troubleshoot ;;
            15) show_details ;;
            16) show_urls ;;
            17) update_service ;;
            18) sync_from_replit ;;
            19) install_auto_sync ;;
            20) check_sync_status ;;
            21) activate_license ;;
            22) view_subscription_status ;;
            0) 
                echo ""
                echo -e "${GREEN}Goodbye! 👋${NC}"
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid choice. Please try again.${NC}"
                sleep 1
                ;;
        esac
    done
}

# Run main
main
