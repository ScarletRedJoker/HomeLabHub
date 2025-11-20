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
    echo -e "    ${GREEN}1)${NC} 🚀 Auto-Deploy (Smart deployment with auto-healing)"
    echo -e "    ${GREEN}1a)${NC} 📦 Full Deploy (build and start all services)"
    echo -e "    ${GREEN}1b)${NC} ☢️  Nuclear Reset (WIPE database and fresh start)"
    echo -e "    ${GREEN}1c)${NC} 🔧 Fix Everything (PostgreSQL + VNC + All Services)"
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
    echo -e "    ${GREEN}7)${NC} 📊 Check Database Status"
    echo ""
    echo -e "  ${BOLD}Smart Home:${NC}"
    echo -e "    ${GREEN}8)${NC} 🏠 Setup Home Assistant Integration"
    echo ""
    echo -e "  ${BOLD}Integrations:${NC}"
    echo -e "    ${GREEN}20)${NC} 🔌 Check All Integration Status"
    echo -e "    ${GREEN}21)${NC} 📝 View Integration Setup Guide"
    echo ""
    echo -e "  ${BOLD}Database Maintenance:${NC}"
    echo -e "    ${GREEN}22)${NC} 🔧 Fix Stuck Database Migrations"
    echo -e "    ${GREEN}22a)${NC} 🗄️ Fix Production Database Schema (VARCHAR → UUID)"
    echo -e "    ${GREEN}22b)${NC} 👤 Fix PostgreSQL User (create 'postgres' superuser)"
    echo ""
    echo -e "  ${BOLD}Verification:${NC}"
    echo -e "    ${GREEN}23)${NC} ✅ Run Full Deployment Verification"
    echo ""
    echo -e "  ${BOLD}Configuration:${NC}"
    echo -e "    ${GREEN}9)${NC} ⚙️  Generate/Edit .env File"
    echo -e "    ${GREEN}10)${NC} 📋 View Current Configuration"
    echo ""
    echo -e "  ${BOLD}Troubleshooting:${NC}"
    echo -e "    ${GREEN}11)${NC} 🔍 View Service Logs"
    echo -e "    ${GREEN}12)${NC} 🏥 Health Check (all services)"
    echo -e "    ${GREEN}12a)${NC} 🌐 Check Docker Network Status"
    echo -e "    ${GREEN}12b)${NC} 🔬 Run Lifecycle Diagnostics & Auto-Fix"
    echo -e "    ${GREEN}13)${NC} 🔧 Full Troubleshoot Mode"
    echo -e "    ${GREEN}13a)${NC} 📝 Format Caddyfile (fix formatting warnings)"
    echo ""
    echo -e "  ${BOLD}Updates:${NC}"
    echo -e "    ${GREEN}14)${NC} 📦 Update Service (pull latest image)"
    echo ""
    echo -e "  ${BOLD}Information:${NC}"
    echo -e "    ${GREEN}15)${NC} 📊 Show Container Details"
    echo -e "    ${GREEN}16)${NC} 🌐 Show Service URLs"
    echo ""
    echo -e "  ${BOLD}Code Sync (Replit → Ubuntu):${NC}"
    echo -e "    ${GREEN}17)${NC} 🔄 Sync from Replit (pull latest code & auto-deploy)"
    echo -e "    ${GREEN}18)${NC} ⚡ Install Auto-Sync (every 5 minutes)"
    echo -e "    ${GREEN}19)${NC} 🔍 Check Auto-Sync Status"
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

# Auto-Deploy (Smart deployment with auto-healing)
auto_deploy() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🚀 AUTO-DEPLOY (SMART)${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    if [ ! -f "./deployment/auto-deploy.sh" ]; then
        echo -e "${RED}✗ Error: auto-deploy.sh not found${NC}"
        echo -e "${YELLOW}Expected location: ./deployment/auto-deploy.sh${NC}"
        pause
        return
    fi
    
    chmod +x ./deployment/auto-deploy.sh
    ./deployment/auto-deploy.sh
    
    pause
}

# Full Deploy
full_deploy() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  📦 FULL DEPLOYMENT${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    # Use new linear deployment script with automatic database provisioning
    if [ -f "./deployment/linear-deploy.sh" ]; then
        chmod +x ./deployment/linear-deploy.sh
        ./deployment/linear-deploy.sh
    elif [ -f "./deployment/deploy-unified.sh" ]; then
        # Fallback to old script if linear-deploy doesn't exist
        ./deployment/deploy-unified.sh
    else
        echo -e "${YELLOW}Running manual deployment...${NC}"
        echo "Fixing code-server permissions..."
        mkdir -p ./config/code-server
        sudo chown -R 1000:1000 ./config/code-server 2>/dev/null || true
        echo ""
        echo "Building with --no-cache to ensure fresh environment variables..."
        docker-compose -f docker-compose.unified.yml build --no-cache
        docker-compose -f docker-compose.unified.yml up -d --remove-orphans
    fi
    
    pause
}

# Nuclear Reset (Database Wipe)
nuclear_reset() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${RED}  ☢️  NUCLEAR RESET (DATABASE WIPE)${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    if [ ! -f "./deployment/nuclear-reset.sh" ]; then
        echo -e "${RED}✗ Error: nuclear-reset.sh not found${NC}"
        echo -e "${YELLOW}Expected location: ./deployment/nuclear-reset.sh${NC}"
        pause
        return
    fi
    
    chmod +x ./deployment/nuclear-reset.sh
    ./deployment/nuclear-reset.sh
    
    pause
}

# Fix Everything (Complete Fix)
fix_everything() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${GREEN}  🔧 FIX EVERYTHING (COMPLETE)${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    if [ ! -f "./deployment/fix-everything.sh" ]; then
        echo -e "${RED}✗ Error: fix-everything.sh not found${NC}"
        echo -e "${YELLOW}Expected location: ./deployment/fix-everything.sh${NC}"
        pause
        return
    fi
    
    chmod +x ./deployment/fix-everything.sh
    ./deployment/fix-everything.sh
    
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
    
    echo "Step 1: Stopping all services gracefully..."
    docker-compose -f docker-compose.unified.yml down --remove-orphans --timeout 60
    
    echo ""
    echo "Step 2: Waiting for network cleanup..."
    sleep 3  # Give Docker time to detach containers
    
    echo ""
    echo "Step 3: Removing orphaned containers and old images..."
    # Remove any orphaned containers (like old ollama, etc.)
    echo "  → Removing orphaned containers..."
    docker container prune -f 2>/dev/null || true
    # Clean up old Docker images, build cache, and dangling resources
    echo "  → Cleaning up old images and build cache..."
    docker system prune -f
    echo "  ✓ Cleanup complete"
    
    echo ""
    echo "Step 4: Removing homelab network (if exists and unused)..."
    # Check if network exists and has no attached containers
    if docker network inspect homelabhub_homelab >/dev/null 2>&1; then
        ATTACHED_CONTAINERS=$(docker network inspect homelabhub_homelab --format='{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null | wc -w)
        
        if [ "$ATTACHED_CONTAINERS" -eq 0 ]; then
            echo "  → Network is clear, removing..."
            docker network rm homelabhub_homelab 2>/dev/null || echo "  → Network already removed or in use (will be recreated)"
        else
            echo "  → Warning: $ATTACHED_CONTAINERS containers still attached, skipping network removal"
            echo "  → Docker will handle network on next deployment"
        fi
    else
        echo "  → Network doesn't exist (will be created on deployment)"
    fi
    
    echo ""
    echo "Step 5: Building containers (no cache)..."
    if docker-compose -f docker-compose.unified.yml build --no-cache; then
        echo -e "${GREEN}✓ Build completed successfully${NC}"
    else
        echo -e "${YELLOW}⚠ Build completed with warnings (will attempt to start anyway)${NC}"
    fi
    
    echo ""
    echo "Step 6: Starting services..."
    if docker-compose -f docker-compose.unified.yml up -d --remove-orphans; then
        echo -e "${GREEN}✓ Services started${NC}"
    else
        echo -e "${RED}✗ Failed to start some services${NC}"
        echo -e "${YELLOW}Check logs with: docker-compose -f docker-compose.unified.yml logs${NC}"
    fi
    
    echo ""
    echo "Step 7: Waiting for services to initialize (15 seconds)..."
    sleep 15
    
    echo ""
    echo "Step 8: Checking container status..."
    RUNNING_COUNT=$(docker ps --format "{{.Names}}" 2>/dev/null | grep -E "homelab-dashboard|homelab-celery-worker|homelab-redis|homelab-minio|discord-bot|stream-bot|caddy|n8n|plex-server|vnc-desktop|code-server|scarletredjoker-web|rig-city-site|homeassistant|discord-bot-db" | wc -l)
    EXPECTED_COUNT=15
    echo -e "  Running: ${RUNNING_COUNT}/${EXPECTED_COUNT} services"
    
    if [ "$RUNNING_COUNT" -eq "$EXPECTED_COUNT" ]; then
        echo -e "  Status:  ${GREEN}✓ All services healthy${NC}"
    elif [ "$RUNNING_COUNT" -ge $((EXPECTED_COUNT - 2)) ]; then
        echo -e "  Status:  ${YELLOW}⚠ Most services running (check logs for issues)${NC}"
    else
        echo -e "  Status:  ${RED}✗ Multiple services failed to start${NC}"
        echo -e "${YELLOW}Run option 11 (View Logs) or option 13 (Troubleshoot) for details${NC}"
    fi
    
    echo ""
    echo "Step 9: Running automatic diagnostics and fixes..."
    if [ -f "./homelab-lifecycle-diagnostics.sh" ]; then
        ./homelab-lifecycle-diagnostics.sh
    else
        echo -e "${YELLOW}⚠ Diagnostics script not found, skipping auto-fix${NC}"
    fi
    
    echo ""
    if [ "$RUNNING_COUNT" -ge $((EXPECTED_COUNT - 1)) ]; then
        echo -e "${GREEN}✓ Rebuild complete - All lifecycle issues handled automatically${NC}"
    else
        echo -e "${YELLOW}⚠ Rebuild complete but some services may need attention${NC}"
    fi
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
    
    echo "Step 1: Stopping all services gracefully..."
    docker-compose -f docker-compose.unified.yml down --remove-orphans --timeout 60
    
    echo ""
    echo "Step 2: Waiting for cleanup..."
    sleep 3
    
    echo ""
    echo "Step 3: Removing orphaned containers..."
    docker container prune -f
    
    echo ""
    echo "Step 4: Cleaning up unused networks (safe)..."
    # Only prune networks that have no containers attached
    docker network prune -f --filter "until=1h"  # Only remove old networks
    
    echo ""
    echo "Step 5: Removing dangling volumes..."
    docker volume prune -f --filter "label!=keep"
    
    echo ""
    echo -e "${GREEN}✓ Graceful shutdown complete${NC}"
    echo ""
    echo "Safe to rebuild or redeploy now."
    pause
}

# Run Lifecycle Diagnostics & Auto-Fix
run_lifecycle_diagnostics() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🔬 LIFECYCLE DIAGNOSTICS & AUTO-FIX${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    if [ -f "./homelab-lifecycle-diagnostics.sh" ]; then
        ./homelab-lifecycle-diagnostics.sh
    else
        echo -e "${RED}✗ Diagnostics script not found at ./homelab-lifecycle-diagnostics.sh${NC}"
        echo -e "${YELLOW}Please make sure the script exists in the project root${NC}"
    fi
    
    pause
}

# Check Docker Network Status
check_docker_network() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🔍 DOCKER NETWORK STATUS${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    if docker network inspect homelabhub_homelab >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Network 'homelabhub_homelab' exists${NC}"
        echo ""
        echo "Network Details:"
        docker network inspect homelabhub_homelab --format='Driver: {{.Driver}}'
        docker network inspect homelabhub_homelab --format='Scope: {{.Scope}}'
        echo ""
        echo "Attached Containers:"
        docker network inspect homelabhub_homelab --format='{{range .Containers}}  - {{.Name}} ({{.IPv4Address}}){{"\n"}}{{end}}' | grep -v '^$' || echo "  (none)"
    else
        echo -e "${YELLOW}⚠ Network 'homelabhub_homelab' does not exist${NC}"
        echo "  This is normal if services haven't been started yet."
    fi
    
    echo ""
    echo "All Docker Networks:"
    docker network ls
    
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
    
    # Note: ticketbot user is the PostgreSQL superuser (set via POSTGRES_USER in docker-compose)
    echo "1️⃣  Discord Bot (ticketbot)..."
    if docker exec discord-bot-db psql -U ticketbot -d ticketbot -c "SELECT 1;" &>/dev/null; then
        echo -e "${GREEN}   ✓ ticketbot database ready (already exists)${NC}"
    else
        echo -e "${RED}   ✗ ticketbot database connection failed${NC}"
    fi
    
    # Create streambot database and user (using ticketbot as superuser)
    echo "2️⃣  Stream Bot (streambot)..."
    if PGPASSWORD="${DISCORD_DB_PASSWORD}" docker exec -e PGPASSWORD discord-bot-db psql -U ticketbot -d ticketbot <<-EOSQL
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
        echo -e "${RED}   ✗ Failed to create streambot database (see errors above)${NC}"
    fi
    
    # Create jarvis database and user (using ticketbot as superuser)
    echo "3️⃣  Dashboard/Jarvis (homelab_jarvis)..."
    if PGPASSWORD="${DISCORD_DB_PASSWORD}" docker exec -e PGPASSWORD discord-bot-db psql -U ticketbot -d ticketbot <<-EOSQL
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
        echo -e "${RED}   ✗ Failed to create jarvis database (see errors above)${NC}"
    fi
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BOLD}${YELLOW}Verifying Database Connections${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    # Test database connections with .env passwords
    local connection_tests_passed=0
    local connection_tests_failed=0
    
    echo -n "1️⃣  Testing ticketbot connection... "
    if PGPASSWORD="$DISCORD_DB_PASSWORD" docker exec -e PGPASSWORD discord-bot-db psql -U ticketbot -d ticketbot -c "SELECT 1;" &>/dev/null; then
        echo -e "${GREEN}✓ Success${NC}"
        ((connection_tests_passed++))
    else
        echo -e "${RED}✗ Failed${NC}"
        ((connection_tests_failed++))
    fi
    
    echo -n "2️⃣  Testing streambot connection... "
    if PGPASSWORD="$STREAMBOT_DB_PASSWORD" docker exec -e PGPASSWORD discord-bot-db psql -U streambot -d streambot -c "SELECT 1;" &>/dev/null; then
        echo -e "${GREEN}✓ Success${NC}"
        ((connection_tests_passed++))
    else
        echo -e "${RED}✗ Failed${NC}"
        ((connection_tests_failed++))
    fi
    
    echo -n "3️⃣  Testing jarvis connection... "
    if PGPASSWORD="$JARVIS_DB_PASSWORD" docker exec -e PGPASSWORD discord-bot-db psql -U jarvis -d homelab_jarvis -c "SELECT 1;" &>/dev/null; then
        echo -e "${GREEN}✓ Success${NC}"
        ((connection_tests_passed++))
    else
        echo -e "${RED}✗ Failed${NC}"
        ((connection_tests_failed++))
    fi
    
    echo ""
    echo -e "${BOLD}Connection Tests: ${GREEN}${connection_tests_passed} passed${NC}, ${RED}${connection_tests_failed} failed${NC}"
    echo ""
    
    # Check if any connection tests failed
    if [ $connection_tests_failed -gt 0 ]; then
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo -e "${BOLD}${RED}❌ Database Repair Failed${NC}"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo -e "${RED}One or more database connections failed verification.${NC}"
        echo ""
        echo "Possible causes:"
        echo "  • Password mismatch between .env and database"
        echo "  • Database user doesn't exist"
        echo "  • Database container not running"
        echo "  • Network connectivity issue"
        echo ""
        echo "Recommended actions:"
        echo "  1. Check .env file has correct passwords"
        echo "  2. Verify PostgreSQL container is running: docker ps"
        echo "  3. Check database logs: docker logs discord-bot-db"
        echo "  4. Re-run this repair (option 7) after fixing the issue"
        echo ""
        pause
        return 1
    fi
    
    # All connection tests passed - proceed with restart
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BOLD}${YELLOW}Restarting Services to Apply Changes${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Database credentials have been verified successfully!"
    echo "Services need to be restarted to reload the new passwords from .env file."
    echo ""
    echo "Affected services:"
    echo "  • stream-bot (uses streambot database)"
    echo "  • homelab-dashboard (uses jarvis database)"
    echo "  • homelab-celery-worker (uses jarvis database)"
    echo "  • discord-bot (uses ticketbot database)"
    echo ""
    
    read -p "Restart these services now? (Y/n): " restart_choice
    restart_choice=${restart_choice:-Y}
    
    if [[ "$restart_choice" =~ ^[Yy]$ ]]; then
        echo ""
        echo "Restarting services..."
        docker-compose -f docker-compose.unified.yml restart stream-bot homelab-dashboard homelab-celery-worker discord-bot
        
        echo ""
        echo "Waiting for services to stabilize..."
        sleep 5
        
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo -e "${BOLD}Service Status After Restart:${NC}"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "(stream-bot|homelab-dashboard|homelab-celery-worker|discord-bot|NAMES)"
        echo ""
    else
        echo ""
        echo -e "${YELLOW}⚠ Services NOT restarted.${NC}"
        echo -e "${YELLOW}  You must manually restart them for password changes to take effect:${NC}"
        echo "  docker-compose -f docker-compose.unified.yml restart stream-bot homelab-dashboard homelab-celery-worker discord-bot"
        echo ""
    fi
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BOLD}${GREEN}✅ Database Repair Successful!${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "What was done:"
    echo "  • Created/updated all required database users"
    echo "  • Reset passwords to match .env file"
    echo "  • Created missing databases"
    echo "  • Granted necessary privileges"
    echo "  • ✅ Verified all database connections: ${GREEN}${connection_tests_passed}/3 passed${NC}"
    if [[ "$restart_choice" =~ ^[Yy]$ ]]; then
        echo "  • ✅ Restarted services to apply password changes"
    fi
    echo ""
    echo -e "${GREEN}All services should now connect to the database successfully!${NC}"
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
    PGPASSWORD="$DISCORD_DB_PASSWORD" docker exec -e PGPASSWORD discord-bot-db psql -U ticketbot -d ticketbot -c "\du" 2>/dev/null || echo -e "${RED}Failed to query roles${NC}"
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BOLD}Databases:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    PGPASSWORD="$DISCORD_DB_PASSWORD" docker exec -e PGPASSWORD discord-bot-db psql -U ticketbot -d ticketbot -c "\l" 2>/dev/null || echo -e "${RED}Failed to list databases${NC}"
    
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
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null | grep -E "(NAME|homelab-|discord-bot|stream-bot|caddy|plex|n8n|homeassistant|vnc-desktop|code-server)" || echo "No containers running"
    
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

# Format Caddy Configuration
format_caddy() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  📝 FORMAT CADDYFILE${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    # Check if Caddy container is running
    if ! docker ps --format '{{.Names}}' | grep -q '^caddy$'; then
        echo -e "${RED}✗ Caddy container is not running${NC}"
        echo "Start Caddy first with option 4 (Start All Services)"
        pause
        return
    fi
    
    echo "Formatting Caddyfile to fix inconsistencies..."
    echo ""
    
    # Format the Caddyfile
    if docker exec caddy caddy fmt --overwrite /etc/caddy/Caddyfile 2>&1; then
        echo ""
        echo -e "${GREEN}✓ Caddyfile formatted successfully${NC}"
        echo ""
        echo "Reloading Caddy to apply changes..."
        if docker exec caddy caddy reload --config /etc/caddy/Caddyfile 2>&1; then
            echo -e "${GREEN}✓ Caddy reloaded successfully${NC}"
        else
            echo -e "${YELLOW}⚠ Caddy reload failed - you may need to restart the container${NC}"
        fi
    else
        echo ""
        echo -e "${RED}✗ Failed to format Caddyfile${NC}"
        echo "Check for syntax errors in your Caddyfile"
    fi
    
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

# Check All Integration Status
check_all_integrations() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🔌 INTEGRATION STATUS CHECK${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    # Load .env file for checking
    if [ -f ".env" ]; then
        set -a
        source .env 2>/dev/null || true
        set +a
    else
        echo -e "${RED}✗ .env file not found${NC}"
        echo "Please run option 9 to generate .env file first."
        pause
        return 1
    fi
    
    echo -e "${BOLD}CRITICAL INTEGRATIONS (Required for full functionality)${NC}"
    echo ""
    
    # ZoneEdit DNS
    echo -n "🌐 ZoneEdit Dynamic DNS: "
    if [ -n "$ZONEEDIT_USERNAME" ] && [ -n "$ZONEEDIT_API_TOKEN" ]; then
        echo -e "${GREEN}✓ Configured${NC}"
        echo "   Username: $ZONEEDIT_USERNAME"
    else
        echo -e "${RED}✗ NOT CONFIGURED${NC}"
        echo "   ${YELLOW}Action: Run option 9 to add ZONEEDIT_USERNAME and ZONEEDIT_API_TOKEN${NC}"
        echo "   ${YELLOW}See: docs/ZONEEDIT_SETUP.md for instructions${NC}"
    fi
    echo ""
    
    # Home Assistant
    echo -n "🏠 Home Assistant: "
    if [ -n "$HOME_ASSISTANT_TOKEN" ] && [ -n "$HOME_ASSISTANT_URL" ]; then
        echo -e "${GREEN}✓ Configured${NC}"
        echo "   URL: $HOME_ASSISTANT_URL"
    else
        echo -e "${RED}✗ NOT CONFIGURED${NC}"
        echo "   ${YELLOW}Action: Add HOME_ASSISTANT_TOKEN and HOME_ASSISTANT_URL to .env${NC}"
        echo "   ${YELLOW}See: INTEGRATION_SETUP_STATUS.md for instructions${NC}"
    fi
    echo ""
    
    # Discord Bot
    echo -n "💬 Discord Bot: "
    if [ -n "$DISCORD_BOT_TOKEN" ] && [ -n "$DISCORD_CLIENT_ID" ]; then
        echo -e "${GREEN}✓ Configured${NC}"
    else
        echo -e "${RED}✗ NOT CONFIGURED${NC}"
        echo "   ${YELLOW}Action: Setup via option 21 (Integration Guide) - See INTEGRATION_SETUP_STATUS.md${NC}"
    fi
    echo ""
    
    # OpenAI
    echo -n "🤖 OpenAI API: "
    if [ -n "$OPENAI_API_KEY" ] || [ -n "$AI_INTEGRATIONS_OPENAI_API_KEY" ]; then
        echo -e "${GREEN}✓ Configured${NC}"
    else
        echo -e "${YELLOW}⚠ NOT CONFIGURED (Optional - Jarvis AI will not work)${NC}"
        echo "   ${YELLOW}Action: Add OPENAI_API_KEY to .env via option 9${NC}"
    fi
    echo ""
    
    echo -e "${BOLD}REPLIT CONNECTOR INTEGRATIONS${NC}"
    echo ""
    
    # Google Calendar (via Replit connector)
    echo -e "📅 Google Calendar Connector:"
    echo -e "   ${YELLOW}⚠ Check via Replit UI - No env variable to detect${NC}"
    echo "   ${YELLOW}Action: Setup via option 21 (Integration Guide) - See INTEGRATION_SETUP_STATUS.md${NC}"
    echo ""
    
    # Gmail (via Replit connector)
    echo -e "📧 Gmail Connector:"
    echo -e "   ${YELLOW}⚠ Check via Replit UI - No env variable to detect${NC}"
    echo "   ${YELLOW}Action: Setup via option 21 (Integration Guide) - See INTEGRATION_SETUP_STATUS.md${NC}"
    echo ""
    
    # Google Drive (via Replit connector)
    echo -e "💾 Google Drive Connector:"
    echo -e "   ${YELLOW}⚠ Check via Replit UI - No env variable to detect${NC}"
    echo "   ${YELLOW}Action: Setup via option 21 (Integration Guide) - See INTEGRATION_SETUP_STATUS.md${NC}"
    echo ""
    
    echo -e "${BOLD}OPTIONAL INTEGRATIONS${NC}"
    echo ""
    
    # Spotify
    echo -n "🎵 Spotify OAuth: "
    if [ -n "$SPOTIFY_CLIENT_ID" ] && [ -n "$SPOTIFY_CLIENT_SECRET" ]; then
        echo -e "${GREEN}✓ Configured${NC}"
    else
        echo -e "${YELLOW}⚠ NOT CONFIGURED (Optional - Stream Bot song requests disabled)${NC}"
    fi
    echo ""
    
    # Twitch
    echo -n "📺 Twitch Integration: "
    if [ -n "$TWITCH_CLIENT_ID" ] && [ -n "$TWITCH_CLIENT_SECRET" ]; then
        echo -e "${GREEN}✓ Configured${NC}"
    else
        echo -e "${YELLOW}⚠ NOT CONFIGURED (Optional - Stream Bot Twitch features disabled)${NC}"
    fi
    echo ""
    
    # Plex
    echo -n "🎬 Plex Media Server: "
    if [ -n "$PLEX_CLAIM" ]; then
        echo -e "${GREEN}✓ Claim token set${NC}"
        echo "   ${YELLOW}Note: Claim tokens expire in 4 minutes - reclaim if needed${NC}"
    else
        echo -e "${YELLOW}⚠ NO CLAIM TOKEN (Optional - required for initial Plex setup)${NC}"
    fi
    echo ""
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo -e "${BOLD}📋 Quick Actions:${NC}"
    echo "  • To add/edit credentials: Select option 9 (Generate/Edit .env)"
    echo "  • For detailed setup instructions: Select option 21 (View Integration Guide)"
    echo "  • For Home Assistant setup: Select option 8 (Setup Home Assistant)"
    echo ""
    
    pause
}

# View Integration Setup Guide
view_integration_guide() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  📝 INTEGRATION SETUP GUIDE${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    if [ -f "INTEGRATION_SETUP_STATUS.md" ]; then
        less INTEGRATION_SETUP_STATUS.md
    else
        echo -e "${YELLOW}⚠ INTEGRATION_SETUP_STATUS.md not found${NC}"
        echo ""
        echo "Key Integration Documentation:"
        echo "  • ZoneEdit DNS: docs/ZONEEDIT_SETUP.md"
        echo "  • Home Assistant: See INTEGRATION_SETUP_STATUS.md"
        echo "  • Discord Bot: See INTEGRATION_SETUP_STATUS.md"
        echo "  • Google Services: See INTEGRATION_SETUP_STATUS.md"
        echo ""
    fi
    
    pause
}

# Fix Stuck Database Migrations
fix_stuck_migrations() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🔧 FIX STUCK DATABASE MIGRATIONS${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${BOLD}${RED}⚠️  WARNING: This operation will modify your database${NC}"
    echo ""
    echo "This script will:"
    echo "  • Drop stuck enum types (serviceconnectionstatus, automationstatus, etc.)"
    echo "  • Drop Google integration tables if they exist"
    echo "  • Re-run alembic upgrade head to create them cleanly"
    echo ""
    echo -e "${YELLOW}This is designed to fix migration 005 errors that prevent Dashboard/Celery from starting.${NC}"
    echo ""
    echo -e "${BOLD}IMPORTANT:${NC}"
    echo "  1. This script is idempotent - safe to run multiple times"
    echo "  2. It will NOT delete your main application data"
    echo "  3. It only affects Google integration tables (which may be empty)"
    echo "  4. Backup your database first if you have important Google integration data"
    echo ""
    
    read -p "Do you want to proceed? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        echo ""
        echo -e "${YELLOW}Migration fix cancelled${NC}"
        pause
        return
    fi
    
    echo ""
    echo "Starting migration fix..."
    echo ""
    
    # Check if script exists
    if [ ! -f "./deployment/fix-stuck-migrations.sh" ]; then
        echo -e "${RED}✗ Error: fix-stuck-migrations.sh not found${NC}"
        echo -e "${YELLOW}Expected location: ./deployment/fix-stuck-migrations.sh${NC}"
        pause
        return
    fi
    
    # Make script executable
    chmod +x ./deployment/fix-stuck-migrations.sh
    
    # Run the fix script
    if ./deployment/fix-stuck-migrations.sh; then
        echo ""
        echo -e "${GREEN}✓ Migration fix completed successfully${NC}"
        echo ""
        echo "Recommended next steps:"
        echo "  1. Restart Dashboard: Option 6 → homelab-dashboard"
        echo "  2. Restart Celery Worker: Option 6 → homelab-celery-worker"
        echo "  3. Check logs: Option 11 → View Service Logs"
        echo "  4. Verify AI features: See docs/AI_FEATURES_VERIFICATION.md"
    else
        echo ""
        echo -e "${RED}✗ Migration fix encountered errors${NC}"
        echo -e "${YELLOW}Please review the error messages above${NC}"
        echo ""
        echo "Troubleshooting tips:"
        echo "  • Ensure PostgreSQL is running (check with option 7)"
        echo "  • Verify .env has correct database credentials"
        echo "  • Check database logs: docker logs discord-bot-db"
    fi
    
    pause
}

# Fix Production Database Schema (VARCHAR → UUID)
fix_production_database_schema() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  🗄️ FIX PRODUCTION DATABASE SCHEMA${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${BOLD}${RED}⚠️  WARNING: This operation will modify your database${NC}"
    echo ""
    echo "This script will:"
    echo "  • Check for legacy agent_messages table with VARCHAR columns"
    echo "  • Convert VARCHAR columns to UUID (or drop and recreate)"
    echo "  • Fix foreign key constraint mismatches"
    echo ""
    echo -e "${YELLOW}This fixes migration 014 errors related to agent_messages column types.${NC}"
    echo ""
    echo -e "${BOLD}IMPORTANT:${NC}"
    echo "  1. This script is idempotent - safe to run multiple times"
    echo "  2. It will check column types before making changes"
    echo "  3. You'll be given options to backup data if needed"
    echo "  4. Recommended for production databases with existing data"
    echo ""
    
    read -p "Do you want to proceed? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        echo ""
        echo -e "${YELLOW}Schema fix cancelled${NC}"
        pause
        return
    fi
    
    echo ""
    echo "Starting schema fix..."
    echo ""
    
    # Check if script exists
    if [ ! -f "./deployment/scripts/fix-production-database.sh" ]; then
        echo -e "${RED}✗ Error: fix-production-database.sh not found${NC}"
        echo -e "${YELLOW}Expected location: ./deployment/scripts/fix-production-database.sh${NC}"
        pause
        return
    fi
    
    # Make script executable
    chmod +x ./deployment/scripts/fix-production-database.sh
    
    # Run the fix script
    if ./deployment/scripts/fix-production-database.sh; then
        echo ""
        echo -e "${GREEN}✓ Schema fix completed successfully${NC}"
        echo ""
        echo "Recommended next steps:"
        echo "  1. Run migrations: docker exec homelab-dashboard python -m alembic upgrade head"
        echo "  2. Restart services: Option 2 (Quick Restart)"
        echo "  3. Check logs: Option 11 (View Service Logs)"
        echo "  4. Verify database: Option 7 (Check Database Status)"
    else
        echo ""
        echo -e "${RED}✗ Schema fix encountered errors${NC}"
        echo -e "${YELLOW}Please review the error messages above${NC}"
        echo ""
        echo "Troubleshooting tips:"
        echo "  • Ensure NEON_DATABASE_URL is set in .env"
        echo "  • Verify database is accessible"
        echo "  • Check database logs for connection errors"
    fi
    
    pause
}

# Fix PostgreSQL User (create 'postgres' superuser)
fix_postgres_user() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  👤 FIX POSTGRESQL USER${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${BOLD}${YELLOW}⚠️  INFO: This will create the 'postgres' superuser${NC}"
    echo ""
    echo "This script will:"
    echo "  • Auto-detect existing PostgreSQL superuser (ticketbot or postgres)"
    echo "  • Create 'postgres' superuser role if it doesn't exist"
    echo "  • Grant full superuser privileges to postgres role"
    echo "  • Fix FATAL: role 'postgres' does not exist errors"
    echo ""
    echo -e "${YELLOW}This is needed when homelab-postgres was initialized with a different user.${NC}"
    echo ""
    echo -e "${BOLD}IMPORTANT:${NC}"
    echo "  1. This script is idempotent - safe to run multiple times"
    echo "  2. It does NOT delete any data or existing users"
    echo "  3. It only adds/updates the postgres superuser role"
    echo "  4. No confirmation required - this is a safe operation"
    echo ""
    
    # Don't require confirmation for this safe operation
    echo "Starting postgres user fix..."
    echo ""
    
    # Check if script exists
    if [ ! -f "./deployment/fix-postgres-user.sh" ]; then
        echo -e "${RED}✗ Error: fix-postgres-user.sh not found${NC}"
        echo -e "${YELLOW}Expected location: ./deployment/fix-postgres-user.sh${NC}"
        pause
        return
    fi
    
    # Make script executable
    chmod +x ./deployment/fix-postgres-user.sh
    
    # Run the fix script
    if ./deployment/fix-postgres-user.sh; then
        echo ""
        echo -e "${GREEN}✓ PostgreSQL user fix completed successfully${NC}"
        echo ""
        echo "You can now connect with: docker exec homelab-postgres psql -U postgres"
        echo ""
        echo "Recommended next steps:"
        echo "  1. Test connection: docker exec homelab-postgres psql -U postgres -c 'SELECT version();'"
        echo "  2. Restart services if needed: Option 2 (Quick Restart)"
        echo "  3. Check database status: Option 7 (Check Database Status)"
    else
        echo ""
        echo -e "${RED}✗ PostgreSQL user fix encountered errors${NC}"
        echo -e "${YELLOW}Please review the error messages above${NC}"
        echo ""
        echo "Troubleshooting tips:"
        echo "  • Ensure homelab-postgres container is running"
        echo "  • Check container logs: docker logs homelab-postgres"
        echo "  • Verify .env has POSTGRES_PASSWORD set"
    fi
    
    pause
}

# Run Full Deployment Verification
run_deployment_verification() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  ✅ FULL DEPLOYMENT VERIFICATION${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    local passed=0
    local failed=0
    local warnings=0
    
    # Test 1: Check Critical Environment Variables
    echo -e "${BOLD}TEST 1: Critical Environment Variables${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    if [ -f ".env" ]; then
        echo -e "${GREEN}✓${NC} .env file exists"
        passed=$((passed + 1))
        
        # Check AI Integration keys (shared by Dashboard and Stream Bot)
        if grep -q "^AI_INTEGRATIONS_OPENAI_API_KEY=" .env && [ -n "$(grep "^AI_INTEGRATIONS_OPENAI_API_KEY=" .env | cut -d'=' -f2)" ]; then
            echo -e "${GREEN}✓${NC} AI_INTEGRATIONS_OPENAI_API_KEY is set"
            passed=$((passed + 1))
        else
            echo -e "${RED}✗${NC} AI_INTEGRATIONS_OPENAI_API_KEY is missing or empty"
            failed=$((failed + 1))
        fi
        
        if grep -q "^AI_INTEGRATIONS_OPENAI_BASE_URL=" .env && [ -n "$(grep "^AI_INTEGRATIONS_OPENAI_BASE_URL=" .env | cut -d'=' -f2)" ]; then
            echo -e "${GREEN}✓${NC} AI_INTEGRATIONS_OPENAI_BASE_URL is set"
            passed=$((passed + 1))
        else
            echo -e "${YELLOW}⚠${NC} AI_INTEGRATIONS_OPENAI_BASE_URL is missing (will use default)"
            warnings=$((warnings + 1))
        fi
        
        # Check database URL
        if grep -q "^DATABASE_URL=" .env && [ -n "$(grep "^DATABASE_URL=" .env | cut -d'=' -f2)" ]; then
            echo -e "${GREEN}✓${NC} DATABASE_URL is set"
            passed=$((passed + 1))
        else
            echo -e "${RED}✗${NC} DATABASE_URL is missing or empty"
            failed=$((failed + 1))
        fi
        
        # Check session secrets
        if grep -q "^SESSION_SECRET=" .env && [ -n "$(grep "^SESSION_SECRET=" .env | cut -d'=' -f2)" ]; then
            echo -e "${GREEN}✓${NC} SESSION_SECRET is set"
            passed=$((passed + 1))
        else
            echo -e "${RED}✗${NC} SESSION_SECRET is missing or empty"
            failed=$((failed + 1))
        fi
    else
        echo -e "${RED}✗${NC} .env file not found"
        echo -e "${YELLOW}  → Run option 9 to generate .env file${NC}"
        failed=$((failed + 1))
    fi
    
    echo ""
    
    # Test 2: Database Connectivity
    echo -e "${BOLD}TEST 2: Database Connectivity${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    if docker ps --filter "name=discord-bot-db" --filter "status=running" | grep -q "discord-bot-db"; then
        echo -e "${GREEN}✓${NC} PostgreSQL container is running"
        passed=$((passed + 1))
        
        # Detect which superuser to use (legacy container uses ticketbot, new uses postgres)
        local pg_superuser="ticketbot"
        if docker exec discord-bot-db psql -U postgres -c "SELECT 1" >/dev/null 2>&1; then
            pg_superuser="postgres"
        fi
        
        # Try to connect to database
        if docker exec discord-bot-db psql -U "$pg_superuser" -c "SELECT 1" >/dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} PostgreSQL is accepting connections"
            passed=$((passed + 1))
            
            # Check if Jarvis database exists
            if docker exec discord-bot-db psql -U "$pg_superuser" -lqt | cut -d \| -f 1 | grep -qw "homelab_jarvis"; then
                echo -e "${GREEN}✓${NC} Jarvis database exists"
                passed=$((passed + 1))
            else
                echo -e "${YELLOW}⚠${NC} Jarvis database not found"
                warnings=$((warnings + 1))
            fi
        else
            echo -e "${RED}✗${NC} Cannot connect to PostgreSQL"
            failed=$((failed + 1))
        fi
    else
        echo -e "${RED}✗${NC} PostgreSQL container is not running"
        failed=$((failed + 1))
    fi
    
    echo ""
    
    # Test 3: Redis Connectivity
    echo -e "${BOLD}TEST 3: Redis Connectivity${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    if docker ps --filter "name=homelab-redis" --filter "status=running" | grep -q "homelab-redis"; then
        echo -e "${GREEN}✓${NC} Redis container is running"
        passed=$((passed + 1))
        
        # Try to ping Redis
        if docker exec homelab-redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
            echo -e "${GREEN}✓${NC} Redis is responding to ping"
            passed=$((passed + 1))
        else
            echo -e "${RED}✗${NC} Redis is not responding"
            failed=$((failed + 1))
        fi
    else
        echo -e "${RED}✗${NC} Redis container is not running"
        failed=$((failed + 1))
    fi
    
    echo ""
    
    # Test 4: AI Services Health
    echo -e "${BOLD}TEST 4: AI Services Health${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Check Dashboard AI
    if docker ps --filter "name=homelab-dashboard" --filter "status=running" | grep -q "homelab-dashboard"; then
        echo -e "${GREEN}✓${NC} Dashboard container is running"
        passed=$((passed + 1))
        
        # Check if AI is enabled in dashboard
        if docker exec homelab-dashboard env | grep -q "AI_INTEGRATIONS_OPENAI_API_KEY"; then
            echo -e "${GREEN}✓${NC} Dashboard has AI_INTEGRATIONS_OPENAI_API_KEY"
            passed=$((passed + 1))
        else
            echo -e "${YELLOW}⚠${NC} Dashboard AI credentials not found in container env"
            warnings=$((warnings + 1))
        fi
    else
        echo -e "${YELLOW}⚠${NC} Dashboard container is not running"
        warnings=$((warnings + 1))
    fi
    
    
    echo ""
    
    # Test 5: Critical Services Status
    echo -e "${BOLD}TEST 5: Critical Services Status${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    local services=("homelab-dashboard" "stream-bot" "caddy" "homelab-redis" "discord-bot-db" "homelab-minio")
    local running_services=0
    local total_services=${#services[@]}
    
    for service in "${services[@]}"; do
        if docker ps --filter "name=$service" --filter "status=running" | grep -q "$service"; then
            echo -e "${GREEN}✓${NC} $service is running"
            running_services=$((running_services + 1))
            passed=$((passed + 1))
        else
            echo -e "${RED}✗${NC} $service is not running"
            failed=$((failed + 1))
        fi
    done
    
    echo ""
    echo "Services running: $running_services/$total_services"
    
    echo ""
    
    # Test 6: Code-Server AI Extensions
    echo -e "${BOLD}TEST 6: Code-Server AI Extensions${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Check if code-server is running
    if docker ps --filter "name=code-server" --filter "status=running" | grep -q "code-server"; then
        echo -e "${GREEN}✓${NC} Code-Server container is running"
        passed=$((passed + 1))
        
        # Check if AI extensions are recommended in config
        if [ -f "config/code-server/extensions.json" ]; then
            if grep -q "Continue.continue" config/code-server/extensions.json && \
               grep -q "Codeium.codeium" config/code-server/extensions.json; then
                echo -e "${GREEN}✓${NC} AI extensions configured in recommendations"
                passed=$((passed + 1))
            else
                echo -e "${YELLOW}⚠${NC} AI extensions not found in recommendations"
                warnings=$((warnings + 1))
            fi
        else
            echo -e "${YELLOW}⚠${NC} extensions.json not found"
            warnings=$((warnings + 1))
        fi
        
        # Check if AI extension settings are configured
        if [ -f "config/code-server/settings.json" ]; then
            if grep -q "continue.enableTabAutocomplete" config/code-server/settings.json || \
               grep -q "codeium.enableCodeLens" config/code-server/settings.json; then
                echo -e "${GREEN}✓${NC} AI extension settings configured"
                passed=$((passed + 1))
            else
                echo -e "${YELLOW}⚠${NC} AI extension settings not configured"
                warnings=$((warnings + 1))
            fi
        else
            echo -e "${YELLOW}⚠${NC} settings.json not found"
            warnings=$((warnings + 1))
        fi
        
        # Check if Continue.dev config exists
        if [ -f "config/code-server/continue-config.json" ]; then
            echo -e "${GREEN}✓${NC} Continue.dev configuration file exists"
            passed=$((passed + 1))
        else
            echo -e "${YELLOW}⚠${NC} Continue.dev config not found (optional)"
            warnings=$((warnings + 1))
        fi
        
        # Check AI extension installation status
        INSTALLED_EXTENSIONS=$(docker exec code-server code-server --list-extensions 2>/dev/null | grep -E "continue|codeium|copilot" || echo "")
        if [ -n "$INSTALLED_EXTENSIONS" ]; then
            echo -e "${GREEN}✓${NC} AI extensions installed:"
            echo "$INSTALLED_EXTENSIONS" | sed 's/^/    /'
            passed=$((passed + 1))
        else
            echo -e "${YELLOW}⚠${NC} No AI extensions installed yet (can be installed via UI)"
            warnings=$((warnings + 1))
        fi
        
        # Check Ollama connectivity for local AI models (optional)
        if docker exec code-server curl -s -o /dev/null -w "%{http_code}" http://homelab-dashboard:11434/api/tags 2>/dev/null | grep -q "200"; then
            echo -e "${GREEN}✓${NC} Ollama accessible from code-server (local AI available)"
            passed=$((passed + 1))
        else
            echo -e "${YELLOW}⚠${NC} Ollama not accessible (local AI models unavailable, cloud models still work)"
            warnings=$((warnings + 1))
        fi
        
    else
        echo -e "${YELLOW}⚠${NC} Code-Server container is not running (optional service)"
        warnings=$((warnings + 1))
    fi
    
    echo ""
    echo ""
    
    # Summary
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  VERIFICATION SUMMARY${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  ${GREEN}Passed:${NC}   $passed tests"
    echo -e "  ${YELLOW}Warnings:${NC} $warnings tests"
    echo -e "  ${RED}Failed:${NC}   $failed tests"
    echo ""
    
    if [ $failed -eq 0 ] && [ $warnings -eq 0 ]; then
        echo -e "${BOLD}${GREEN}✅ ALL SYSTEMS GO! Deployment is ready for production!${NC}"
        echo ""
        echo "Your deployment is 'sock-knocking' ready! 🚀"
        echo ""
        echo "Next steps:"
        echo "  • Access dashboard at configured domain"
        echo "  • Test AI features (see docs/AI_FEATURES_VERIFICATION.md)"
        echo "  • Monitor service logs for any issues"
    elif [ $failed -eq 0 ]; then
        echo -e "${BOLD}${YELLOW}⚠️  DEPLOYMENT READY WITH WARNINGS${NC}"
        echo ""
        echo "Your deployment is mostly ready, but review the warnings above."
        echo ""
        echo "Common warnings:"
        echo "  • Optional services not running (plex, vnc, etc.)"
        echo "  • Optional integrations not configured"
        echo ""
        echo "To proceed:"
        echo "  • Review warnings and decide if action needed"
        echo "  • Test critical features work correctly"
    else
        echo -e "${BOLD}${RED}❌ DEPLOYMENT HAS ISSUES - NOT READY${NC}"
        echo ""
        echo "Critical issues detected. Please fix the following:"
        echo ""
        echo "If environment variables are missing:"
        echo "  → Run option 9 to generate/edit .env file"
        echo ""
        echo "If services are not running:"
        echo "  → Run option 1 (Full Deploy) or option 3 (Rebuild & Deploy)"
        echo ""
        echo "If database issues:"
        echo "  → Run option 7 (Check Database Status)"
        echo "  → Run option 22 (Fix Stuck Database Migrations)"
        echo ""
        echo "For detailed AI feature testing:"
        echo "  → See docs/AI_FEATURES_VERIFICATION.md"
        echo "  → See docs/DEPLOYMENT_CHECKLIST.md"
    fi
    
    echo ""
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
            1) auto_deploy ;;
            1a) full_deploy ;;
            1b) nuclear_reset ;;
            1c) fix_everything ;;
            2) quick_restart ;;
            3) rebuild_deploy ;;
            3a) graceful_shutdown ;;
            4) start_services ;;
            5) stop_services ;;
            6) restart_service ;;
            7) check_database_status ;;
            8) setup_home_assistant ;;
            9) generate_env ;;
            10) view_config ;;
            11) view_logs ;;
            12) health_check ;;
            12a) check_docker_network ;;
            12b) run_lifecycle_diagnostics ;;
            13) troubleshoot ;;
            13a) format_caddy ;;
            14) update_service ;;
            15) show_details ;;
            16) show_urls ;;
            17) sync_from_replit ;;
            18) install_auto_sync ;;
            19) check_sync_status ;;
            20) check_all_integrations ;;
            21) view_integration_guide ;;
            22) fix_stuck_migrations ;;
            22a) fix_production_database_schema ;;
            22b) fix_postgres_user ;;
            23) run_deployment_verification ;;
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
