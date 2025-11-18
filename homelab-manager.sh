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
    echo -e "  ${BOLD}Configuration:${NC}"
    echo -e "    ${GREEN}9)${NC} ⚙️  Generate/Edit .env File"
    echo -e "    ${GREEN}10)${NC} 📋 View Current Configuration"
    echo ""
    echo -e "  ${BOLD}Troubleshooting:${NC}"
    echo -e "    ${GREEN}11)${NC} 🔍 View Service Logs"
    echo -e "    ${GREEN}12)${NC} 🏥 Health Check (all services)"
    echo -e "    ${GREEN}13)${NC} 🔧 Full Troubleshoot Mode"
    echo ""
    echo -e "  ${BOLD}Code Sync (Replit → Ubuntu):${NC}"
    echo -e "    ${GREEN}17)${NC} 🔄 Sync from Replit (pull latest code & auto-deploy)"
    echo -e "    ${GREEN}18)${NC} ⚡ Install Auto-Sync (every 5 minutes)"
    echo -e "    ${GREEN}19)${NC} 🔍 Check Auto-Sync Status"
    echo ""
    echo -e "  ${BOLD}Updates:${NC}"
    echo -e "    ${GREEN}16)${NC} 📦 Update Service (pull latest image)"
    echo ""
    echo -e "  ${BOLD}Information:${NC}"
    echo -e "    ${GREEN}14)${NC} 📊 Show Container Details"
    echo -e "    ${GREEN}15)${NC} 🌐 Show Service URLs"
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
        docker-compose -f docker-compose.unified.yml up -d --build
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
    docker-compose -f docker-compose.unified.yml restart
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
    echo "Stopping services..."
    docker-compose -f docker-compose.unified.yml down
    echo ""
    echo "Building containers (no cache)..."
    docker-compose -f docker-compose.unified.yml build --no-cache
    echo ""
    echo "Starting services..."
    docker-compose -f docker-compose.unified.yml up -d
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
    docker-compose -f docker-compose.unified.yml up -d
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
    docker-compose -f docker-compose.unified.yml stop
    echo ""
    echo -e "${GREEN}✓ All services stopped${NC}"
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
    if systemctl list-unit-files | grep -q "homelab-sync.timer"; then
        echo -e "${GREEN}✓ Auto-sync is installed${NC}"
        echo ""
        echo "Timer Status:"
        systemctl status homelab-sync.timer --no-pager | head -10
        echo ""
        echo "Service Status:"
        systemctl status homelab-sync.service --no-pager | head -10
        echo ""
        echo "Recent Sync Logs:"
        journalctl -u homelab-sync.service -n 20 --no-pager
    else
        echo -e "${YELLOW}⚠ Auto-sync is NOT installed${NC}"
        echo ""
        echo "To install auto-sync, choose option 18 from the main menu."
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
            4) start_services ;;
            5) stop_services ;;
            6) restart_service ;;
            7) ensure_databases ;;
            8) check_database_status ;;
            9) generate_env ;;
            10) view_config ;;
            11) view_logs ;;
            12) health_check ;;
            13) troubleshoot ;;
            14) show_details ;;
            15) show_urls ;;
            16) update_service ;;
            17) sync_from_replit ;;
            18) install_auto_sync ;;
            19) check_sync_status ;;
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
