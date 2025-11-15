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
    echo -e "${CYAN}║${NC}        ${BOLD}${MAGENTA}🏠 HOMELAB DEPLOYMENT MANAGER 🚀${NC}                    ${CYAN}║${NC}"
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
    echo -e "    ${GREEN}21)${NC} 🛡️  Deploy with Auto-Rollback (safe deployment)"
    echo -e "    ${GREEN}22)${NC} 📜 View Deployment History"
    echo -e "    ${GREEN}23)${NC} ⏪ Rollback to Previous Version"
    echo -e "    ${GREEN}24)${NC} 🔍 Deployment Dry-Run (preview changes)"
    echo -e "    ${GREEN}25)${NC} ✅ Validate Deployment (pre-flight check)"
    echo -e "    ${GREEN}26)${NC} 🚀 Run CI/CD Pipeline (automated full pipeline)"
    echo ""
    echo -e "  ${BOLD}Service Control:${NC}"
    echo -e "    ${GREEN}4)${NC} ▶️  Start All Services"
    echo -e "    ${GREEN}5)${NC} ⏸️  Stop All Services"
    echo -e "    ${GREEN}6)${NC} 🔄 Restart Specific Service"
    echo ""
    echo -e "  ${BOLD}Database:${NC}"
    echo -e "    ${GREEN}7)${NC} 🗄️  Ensure Databases Exist (fix DB issues)"
    echo -e "    ${GREEN}8)${NC} 📊 Check Database Status"
    echo -e "    ${GREEN}20)${NC} 🔄 Migration Manager (check/apply/rollback migrations)"
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
    local running=$(docker ps --filter "name=discord-bot|stream-bot|homelab-dashboard|caddy|n8n|plex|vnc|scarletredjoker" --format "{{.Names}}" | wc -l)
    local total=8
    
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
    echo "  5) n8n"
    echo "  6) plex"
    echo "  7) vnc-desktop"
    echo "  8) scarletredjoker-web"
    echo "  9) discord-bot-db"
    echo ""
    read -p "Enter service number (or name): " service_choice
    
    case $service_choice in
        1|homelab-dashboard) service="homelab-dashboard" ;;
        2|discord-bot) service="discord-bot" ;;
        3|stream-bot) service="stream-bot" ;;
        4|caddy) service="caddy" ;;
        5|n8n) service="n8n" ;;
        6|plex) service="plex" ;;
        7|vnc-desktop) service="vnc-desktop" ;;
        8|scarletredjoker-web) service="scarletredjoker-web" ;;
        9|discord-bot-db) service="discord-bot-db" ;;
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
    echo "  5) n8n"
    echo "  6) plex"
    echo "  7) vnc-desktop"
    echo "  8) scarletredjoker-web"
    echo "  9) discord-bot-db"
    echo ""
    read -p "Enter service number (or name): " service_choice
    
    case $service_choice in
        1|homelab-dashboard) service="homelab-dashboard" ;;
        2|discord-bot) service="discord-bot" ;;
        3|stream-bot) service="stream-bot" ;;
        4|caddy) service="caddy" ;;
        5|n8n) service="n8n" ;;
        6|plex) service="plex" ;;
        7|vnc-desktop) service="vnc-desktop" ;;
        8|scarletredjoker-web) service="scarletredjoker-web" ;;
        9|discord-bot-db) service="discord-bot-db" ;;
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

# Ensure Databases Exist
ensure_databases() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🗄️  ENSURE DATABASES EXIST${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    if [ -f "./deployment/ensure-databases.sh" ]; then
        ./deployment/ensure-databases.sh
    else
        echo -e "${RED}✗ ensure-databases.sh not found${NC}"
    fi
    
    pause
}

# Check Database Status
check_database_status() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  📊 DATABASE STATUS${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    if docker ps --format '{{.Names}}' | grep -q '^discord-bot-db$'; then
        echo -e "${GREEN}✓ PostgreSQL container is running${NC}"
        echo ""
        echo "Databases:"
        docker exec discord-bot-db psql -U ticketbot -d postgres -c "\l" || true
        echo ""
        echo "Users:"
        docker exec discord-bot-db psql -U ticketbot -d postgres -c "\du" || true
    else
        echo -e "${RED}✗ PostgreSQL container is not running${NC}"
    fi
    
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
    echo "  6) All services"
    echo ""
    read -p "Enter service number: " log_choice
    
    case $log_choice in
        1) docker logs -f homelab-dashboard ;;
        2) docker logs -f discord-bot ;;
        3) docker logs -f stream-bot ;;
        4) docker logs -f caddy ;;
        5) docker logs -f discord-bot-db ;;
        6) docker-compose -f docker-compose.unified.yml logs -f ;;
        *) echo "Invalid choice" ; pause ;;
    esac
}

# Health Check
health_check() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🏥 HEALTH CHECK${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    echo "Container Status:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" --filter "name=discord-bot|stream-bot|homelab-dashboard|caddy|n8n|plex|vnc|scarletredjoker"
    
    echo ""
    echo "Resource Usage:"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" --filter "name=discord-bot|stream-bot|homelab-dashboard|caddy|n8n|plex|vnc|scarletredjoker"
    
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
    local failed=$(docker ps -a --filter "status=exited" --filter "name=discord-bot|stream-bot|homelab-dashboard" --format "{{.Names}}")
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

# Run CI/CD Pipeline
run_cicd_pipeline() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🚀 RUN CI/CD PIPELINE${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    if [ ! -f "./deployment/unified-pipeline.sh" ]; then
        echo -e "${RED}Error: unified-pipeline.sh not found${NC}"
        pause
        return
    fi
    
    echo -e "  ${BOLD}Environment:${NC}"
    echo -e "    ${GREEN}1)${NC} 🔧 Development (dev)"
    echo -e "    ${GREEN}2)${NC} 🧪 Staging"
    echo -e "    ${GREEN}3)${NC} 🚀 Production"
    echo ""
    echo -n "Select environment [1-3]: "
    read env_choice
    
    case $env_choice in
        1) PIPELINE_ENV="dev" ;;
        2) PIPELINE_ENV="staging" ;;
        3) PIPELINE_ENV="production" ;;
        *)
            echo -e "${RED}Invalid choice${NC}"
            pause
            return
            ;;
    esac
    
    echo ""
    echo -e "  ${BOLD}Pipeline Options:${NC}"
    echo -e "    ${GREEN}1)${NC} 🚀 Full Pipeline (all stages)"
    echo -e "    ${GREEN}2)${NC} 🔍 Validate Only"
    echo -e "    ${GREEN}3)${NC} 🧪 Test Only"
    echo -e "    ${GREEN}4)${NC} 🔨 Build Only"
    echo -e "    ${GREEN}5)${NC} 📦 Deploy Only"
    echo -e "    ${GREEN}6)${NC} ✅ Verify Only"
    echo -e "    ${GREEN}7)${NC} 👀 Dry-Run (preview without changes)"
    echo ""
    echo -n "Select option [1-7]: "
    read pipeline_choice
    
    PIPELINE_ARGS="--env $PIPELINE_ENV"
    
    case $pipeline_choice in
        1)
            echo ""
            echo -e "${YELLOW}Running full CI/CD pipeline for ${PIPELINE_ENV}...${NC}"
            ;;
        2)
            PIPELINE_ARGS="$PIPELINE_ARGS --stage validate"
            echo ""
            echo -e "${YELLOW}Running validation stage...${NC}"
            ;;
        3)
            PIPELINE_ARGS="$PIPELINE_ARGS --stage test"
            echo ""
            echo -e "${YELLOW}Running test stage...${NC}"
            ;;
        4)
            PIPELINE_ARGS="$PIPELINE_ARGS --stage build"
            echo ""
            echo -e "${YELLOW}Running build stage...${NC}"
            ;;
        5)
            PIPELINE_ARGS="$PIPELINE_ARGS --stage deploy"
            echo ""
            echo -e "${YELLOW}Running deploy stage...${NC}"
            ;;
        6)
            PIPELINE_ARGS="$PIPELINE_ARGS --stage verify"
            echo ""
            echo -e "${YELLOW}Running verify stage...${NC}"
            ;;
        7)
            PIPELINE_ARGS="$PIPELINE_ARGS --dry-run"
            echo ""
            echo -e "${YELLOW}Running dry-run mode...${NC}"
            ;;
        *)
            echo -e "${RED}Invalid choice${NC}"
            pause
            return
            ;;
    esac
    
    # Ask for additional options for full pipeline
    if [ "$pipeline_choice" = "1" ]; then
        echo ""
        echo -e "${BOLD}Additional Options (optional):${NC}"
        echo -n "Skip tests? (y/N): "
        read skip_tests
        if [[ "$skip_tests" =~ ^[Yy]$ ]]; then
            PIPELINE_ARGS="$PIPELINE_ARGS --skip-tests"
        fi
        
        echo -n "Build in parallel? (Y/n): "
        read parallel_build
        if [[ ! "$parallel_build" =~ ^[Nn]$ ]]; then
            PIPELINE_ARGS="$PIPELINE_ARGS --parallel-build"
        fi
        
        if [ "$PIPELINE_ENV" = "production" ]; then
            echo -n "Require approval before deploy? (Y/n): "
            read require_approval
            if [[ ! "$require_approval" =~ ^[Nn]$ ]]; then
                PIPELINE_ARGS="$PIPELINE_ARGS --require-approval"
            fi
        fi
    fi
    
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}Executing: ./deployment/unified-pipeline.sh $PIPELINE_ARGS${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    # Execute the pipeline
    ./deployment/unified-pipeline.sh $PIPELINE_ARGS
    
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Show where to find reports
    if [ -f "./deployment/pipeline-report.html" ]; then
        echo ""
        echo -e "${GREEN}✓ Pipeline execution complete!${NC}"
        echo ""
        echo -e "${BOLD}Reports Generated:${NC}"
        echo -e "  📊 HTML Report: ${CYAN}deployment/pipeline-report.html${NC}"
        echo -e "  📋 Execution Log: ${CYAN}deployment/pipeline-execution.log${NC}"
        echo -e "  📜 Pipeline History: ${CYAN}deployment/pipeline-history.log${NC}"
        echo ""
        echo -n "Open HTML report in browser? (Y/n): "
        read open_report
        if [[ ! "$open_report" =~ ^[Nn]$ ]]; then
            if command -v xdg-open &> /dev/null; then
                xdg-open "./deployment/pipeline-report.html" 2>/dev/null &
            elif command -v open &> /dev/null; then
                open "./deployment/pipeline-report.html" 2>/dev/null &
            else
                echo -e "${YELLOW}Could not auto-open. Please open manually: deployment/pipeline-report.html${NC}"
            fi
        fi
    fi
    
    pause
}

# Migration Manager
migration_manager() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🔄 DATABASE MIGRATION MANAGER${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    echo -e "  ${BOLD}Options:${NC}"
    echo -e "    ${GREEN}1)${NC} 📊 Check Migration Status (all services)"
    echo -e "    ${GREEN}2)${NC} ⬆️  Apply Pending Migrations"
    echo -e "    ${GREEN}3)${NC} ⬇️  Rollback Last Migration"
    echo -e "    ${GREEN}4)${NC} 📝 View Migration Guide"
    echo -e "    ${GREEN}0)${NC} ⬅️  Back to Main Menu"
    echo ""
    echo -n "Enter your choice: "
    read migration_choice
    
    case $migration_choice in
        1)
            echo ""
            if [ -f "./deployment/migrate-all.sh" ]; then
                ./deployment/migrate-all.sh status
            else
                echo -e "${RED}Error: migrate-all.sh not found${NC}"
            fi
            pause
            ;;
        2)
            echo ""
            if [ -f "./deployment/migrate-all.sh" ]; then
                ./deployment/migrate-all.sh
            else
                echo -e "${RED}Error: migrate-all.sh not found${NC}"
            fi
            pause
            ;;
        3)
            echo ""
            echo -e "${YELLOW}Select service to rollback:${NC}"
            echo -e "  ${GREEN}1)${NC} Dashboard"
            echo -e "  ${GREEN}2)${NC} Stream Bot"
            echo -e "  ${GREEN}3)${NC} Discord Bot"
            echo -n "Enter your choice: "
            read service_choice
            
            case $service_choice in
                1) service="dashboard" ;;
                2) service="stream-bot" ;;
                3) service="discord-bot" ;;
                *)
                    echo -e "${RED}Invalid choice${NC}"
                    pause
                    return
                    ;;
            esac
            
            if [ -f "./deployment/migrate-all.sh" ]; then
                ./deployment/migrate-all.sh rollback "$service"
            else
                echo -e "${RED}Error: migrate-all.sh not found${NC}"
            fi
            pause
            ;;
        4)
            echo ""
            if [ -f "./MIGRATION_GUIDE.md" ]; then
                less MIGRATION_GUIDE.md
            else
                echo -e "${YELLOW}MIGRATION_GUIDE.md not found${NC}"
                echo ""
                echo "Available migration documentation:"
                echo "  - services/stream-bot/migrations/README.md"
                echo "  - services/discord-bot/migrations/README.md"
            fi
            pause
            ;;
        0)
            return
            ;;
        *)
            echo -e "${RED}Invalid choice${NC}"
            sleep 1
            ;;
    esac
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
            20) migration_manager ;;
            21) deploy_with_auto_rollback ;;
            22) view_deployment_history ;;
            23) rollback_to_previous ;;
            24) deployment_dry_run ;;
            25) validate_deployment ;;
            26) run_cicd_pipeline ;;
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

# Deploy with Auto-Rollback
deploy_with_auto_rollback() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🛡️  DEPLOY WITH AUTO-ROLLBACK${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    if [ -f "./deployment/deploy-with-health-check.sh" ]; then
        ./deployment/deploy-with-health-check.sh
    else
        echo -e "${RED}Error: deploy-with-health-check.sh not found${NC}"
    fi
    
    pause
}

# View Deployment History
view_deployment_history() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  📜 DEPLOYMENT HISTORY${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    if [ -f "./deployment/deployment-history.log" ]; then
        echo "Last 10 deployments:"
        echo ""
        grep -E '^\[' ./deployment/deployment-history.log | tail -10 | while IFS= read -r line; do
            status=$(echo "$line" | awk '{print $2}')
            case "$status" in
                SUCCESS)
                    echo -e "${GREEN}✓${NC} $line"
                    ;;
                *FAILED*|*ROLLBACK*)
                    echo -e "${RED}✗${NC} $line"
                    ;;
                *)
                    echo -e "${YELLOW}⚠${NC} $line"
                    ;;
            esac
        done
        echo ""
        echo "Full history: ./deployment/deployment-history.log"
    else
        echo -e "${YELLOW}No deployment history found${NC}"
        echo "History will be created on first deployment with auto-rollback"
    fi
    
    pause
}

# Rollback to Previous Version
rollback_to_previous() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  ⏪ ROLLBACK TO PREVIOUS VERSION${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    if [ -f "./deployment/rollback-deployment.sh" ]; then
        # List available snapshots
        ./deployment/rollback-deployment.sh list
        echo ""
        echo -e "${YELLOW}Select a snapshot to restore:${NC}"
        echo -e "  ${GREEN}1)${NC} Restore latest snapshot"
        echo -e "  ${GREEN}2)${NC} Select specific snapshot"
        echo -e "  ${GREEN}0)${NC} Cancel"
        echo ""
        read -p "Enter your choice: " rollback_choice
        
        case $rollback_choice in
            1)
                echo ""
                read -p "Are you sure you want to rollback to the latest snapshot? (y/N) " -n 1 -r
                echo
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    ./deployment/rollback-deployment.sh restore latest
                else
                    echo "Cancelled"
                fi
                ;;
            2)
                echo ""
                read -p "Enter snapshot name: " snapshot_name
                if [ -n "$snapshot_name" ]; then
                    ./deployment/rollback-deployment.sh restore "$snapshot_name"
                else
                    echo "No snapshot name provided"
                fi
                ;;
            0)
                echo "Cancelled"
                ;;
            *)
                echo -e "${RED}Invalid choice${NC}"
                ;;
        esac
    else
        echo -e "${RED}Error: rollback-deployment.sh not found${NC}"
    fi
    
    pause
}

# Deployment Dry-Run
deployment_dry_run() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🔍 DEPLOYMENT DRY-RUN${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    if [ -f "./deployment/deploy-with-health-check.sh" ]; then
        DRY_RUN=true ./deployment/deploy-with-health-check.sh
    else
        echo -e "${RED}Error: deploy-with-health-check.sh not found${NC}"
    fi
    
    pause
}

# Validate Deployment
validate_deployment() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  ✅ VALIDATE DEPLOYMENT${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    if [ -f "./deployment/validate-deployment.sh" ]; then
        ./deployment/validate-deployment.sh
    else
        echo -e "${RED}Error: validate-deployment.sh not found${NC}"
    fi
    
    pause
}

# Run main
main
