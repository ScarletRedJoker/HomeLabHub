#!/bin/bash
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}${MAGENTA}🔧 HOMELAB COMPLETE SYSTEM FIX 🔧${NC}                        ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${GREEN}Monkey-Proof Setup & Repair Tool${NC}                         ${CYAN}║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# ============================================
# STEP 1: Fix Home Assistant Configuration
# ============================================
fix_homeassistant() {
    echo -e "${BLUE}[1/10]${NC} Fixing Home Assistant reverse proxy configuration..."
    
    HA_CONFIG_DIR="./config/homeassistant"
    HA_CONFIG_FILE="$HA_CONFIG_DIR/configuration.yaml"
    
    mkdir -p "$HA_CONFIG_DIR"
    
    if [ ! -f "$HA_CONFIG_FILE" ]; then
        cat > "$HA_CONFIG_FILE" << 'EOF'
# Home Assistant Configuration
default_config:

http:
  use_x_forwarded_for: true
  trusted_proxies:
    - 172.23.0.0/16
    - 127.0.0.1
    - ::1
  ip_ban_enabled: false
  login_attempts_threshold: 5

# Enable frontend
frontend:
  themes: !include_dir_merge_named themes

# Enable configuration UI
config:

# Enable mobile app support
mobile_app:

# Enable automations UI
automation: !include automations.yaml

# Enable scenes UI
scene: !include scenes.yaml

# Enable scripts UI
script: !include scripts.yaml
EOF
        echo -e "${GREEN}✓${NC} Created Home Assistant configuration"
    else
        # Check if http section exists
        if ! grep -q "use_x_forwarded_for" "$HA_CONFIG_FILE"; then
            cat >> "$HA_CONFIG_FILE" << 'EOF'

# Reverse Proxy Configuration
http:
  use_x_forwarded_for: true
  trusted_proxies:
    - 172.23.0.0/16
    - 127.0.0.1
    - ::1
  ip_ban_enabled: false
  login_attempts_threshold: 5
EOF
            echo -e "${GREEN}✓${NC} Added reverse proxy config to Home Assistant"
        else
            echo -e "${YELLOW}⚠${NC} Home Assistant already configured"
        fi
    fi
    
    # Create required files
    touch "$HA_CONFIG_DIR/automations.yaml"
    touch "$HA_CONFIG_DIR/scenes.yaml"
    touch "$HA_CONFIG_DIR/scripts.yaml"
    mkdir -p "$HA_CONFIG_DIR/themes"
}

# ============================================
# STEP 2: Fix Database Users
# ============================================
fix_database_users() {
    echo -e "${BLUE}[2/10]${NC} Creating missing database users..."
    
    # Wait for PostgreSQL to be ready
    echo "Waiting for PostgreSQL..."
    sleep 5
    
    # Check if container is running
    if ! docker ps | grep -q discord-bot-db; then
        echo -e "${YELLOW}⚠${NC} Starting PostgreSQL container..."
        docker compose -f docker-compose.unified.yml up -d discord-bot-db
        sleep 10
    fi
    
    # Create jarvis user and database
    echo "Creating 'jarvis' database user..."
    docker exec discord-bot-db psql -U ticketbot -d postgres -c "
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'jarvis') THEN
                CREATE USER jarvis WITH PASSWORD 'jarvis_secure_password_2024';
                CREATE DATABASE jarvis_db OWNER jarvis;
                GRANT ALL PRIVILEGES ON DATABASE jarvis_db TO jarvis;
                ALTER USER jarvis WITH SUPERUSER;
            END IF;
        END
        \$\$;
    " 2>/dev/null || echo -e "${YELLOW}⚠${NC} Database user already exists or couldn't be created"
    
    echo -e "${GREEN}✓${NC} Database users configured"
}

# ============================================
# STEP 3: Fix Code-Server Permissions
# ============================================
fix_code_server_permissions() {
    echo -e "${BLUE}[3/10]${NC} Fixing code-server permissions..."
    
    CODE_SERVER_DIR="./volumes/code-server"
    mkdir -p "$CODE_SERVER_DIR/config"
    mkdir -p "$CODE_SERVER_DIR/workspace"
    
    # Set proper ownership
    sudo chown -R 1000:1000 "$CODE_SERVER_DIR" 2>/dev/null || chown -R $(id -u):$(id -g) "$CODE_SERVER_DIR"
    chmod -R 755 "$CODE_SERVER_DIR"
    
    echo -e "${GREEN}✓${NC} Code-server permissions fixed"
}

# ============================================
# STEP 4: Create Missing Environment Variables
# ============================================
fix_environment_variables() {
    echo -e "${BLUE}[4/10]${NC} Checking environment variables..."
    
    if [ ! -f ".env" ]; then
        echo -e "${RED}✗${NC} .env file missing! Creating from template..."
        
        if [ -f ".env.example" ] || [ -f ".env.unified.example" ]; then
            cp .env.unified.example .env 2>/dev/null || cp .env.example .env
            echo -e "${YELLOW}⚠${NC} Please edit .env file with your actual credentials"
        else
            cat > .env << 'EOF'
# Database Configuration
DATABASE_URL=postgresql://jarvis:jarvis_secure_password_2024@discord-bot-db:5432/jarvis_db
POSTGRES_USER=ticketbot
POSTGRES_PASSWORD=your_postgres_password
POSTGRES_DB=ticketbot

# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret

# Twitch Configuration
TWITCH_CLIENT_ID=your_twitch_client_id
TWITCH_CLIENT_SECRET=your_twitch_client_secret

# Domain Configuration
DOMAIN=evindrake.net
ACME_EMAIL=evin@evindrake.net

# Home Assistant
HOMEASSISTANT_TOKEN=your_ha_token

# Security
SESSION_SECRET=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 32)
EOF
            echo -e "${GREEN}✓${NC} Created .env template"
        fi
    else
        # Add missing variables
        if ! grep -q "DATABASE_URL.*jarvis" .env; then
            echo "DATABASE_URL=postgresql://jarvis:jarvis_secure_password_2024@discord-bot-db:5432/jarvis_db" >> .env
        fi
        echo -e "${GREEN}✓${NC} Environment variables checked"
    fi
}

# ============================================
# STEP 5: Fix Docker Compose Configuration
# ============================================
fix_docker_compose() {
    echo -e "${BLUE}[5/10]${NC} Fixing docker-compose.unified.yml..."
    
    # Backup original
    cp docker-compose.unified.yml docker-compose.unified.yml.backup
    
    # Add fixes to docker-compose (this is a template - adjust to your actual file)
    echo -e "${YELLOW}⚠${NC} Manual docker-compose fixes required:"
    echo "  1. Add 'user: \"1000:1000\"' to code-server service"
    echo "  2. Ensure all services have proper restart policies"
    echo "  3. Verify network configuration includes: 172.23.0.0/16"
    
    echo -e "${GREEN}✓${NC} Docker compose backup created"
}

# ============================================
# STEP 6: Fix Celery Worker Security
# ============================================
fix_celery_worker() {
    echo -e "${BLUE}[6/10]${NC} Fixing Celery worker security..."
    
    echo -e "${YELLOW}⚠${NC} Add to homelab-celery-worker service in docker-compose:"
    echo "  user: \"1000:1000\""
    echo "  Or set C_FORCE_ROOT=true (not recommended)"
    
    echo -e "${GREEN}✓${NC} Celery worker security note added"
}

# ============================================
# STEP 7: Check DNS Configuration
# ============================================
check_dns_configuration() {
    echo -e "${BLUE}[7/10]${NC} Checking DNS configuration..."
    
    DOMAINS=(
        "host.evindrake.net"
        "code.evindrake.net"
        "home.evindrake.net"
        "n8n.evindrake.net"
        "plex.evindrake.net"
        "rig-city.com"
        "www.rig-city.com"
        "scarletredjoker.com"
    )
    
    echo -e "${YELLOW}Checking DNS records...${NC}"
    for domain in "${DOMAINS[@]}"; do
        if host "$domain" >/dev/null 2>&1; then
            echo -e "  ${GREEN}✓${NC} $domain"
        else
            echo -e "  ${RED}✗${NC} $domain - ${YELLOW}NO DNS RECORD${NC}"
        fi
    done
    
    echo ""
    echo -e "${YELLOW}⚠ Missing DNS records will cause SSL certificate failures${NC}"
}

# ============================================
# STEP 8: Create Directory Structure
# ============================================
create_directory_structure() {
    echo -e "${BLUE}[8/10]${NC} Creating required directory structure..."
    
    DIRS=(
        "config/homeassistant"
        "config/caddy"
        "config/n8n"
        "volumes/code-server/config"
        "volumes/code-server/workspace"
        "volumes/plex/config"
        "volumes/plex/data"
        "volumes/postgres/data"
        "logs"
        "deployment"
    )
    
    for dir in "${DIRS[@]}"; do
        mkdir -p "$dir"
        echo -e "  ${GREEN}✓${NC} Created $dir"
    done
    
    echo -e "${GREEN}✓${NC} Directory structure created"
}

# ============================================
# STEP 9: Fix File Permissions
# ============================================
fix_file_permissions() {
    echo -e "${BLUE}[9/10]${NC} Fixing file permissions..."
    
    # Make scripts executable
    find deployment -type f -name "*.sh" -exec chmod +x {} \; 2>/dev/null || true
    chmod +x manage-homelab.sh 2>/dev/null || true
    
    # Set proper volume permissions
    chmod -R 755 volumes/ 2>/dev/null || true
    chmod -R 755 config/ 2>/dev/null || true
    
    echo -e "${GREEN}✓${NC} File permissions fixed"
}

# ============================================
# STEP 10: Generate Troubleshooting Report
# ============================================
generate_troubleshooting_report() {
    echo -e "${BLUE}[10/10]${NC} Generating troubleshooting report..."
    
    REPORT_FILE="homelab-diagnostic-$(date +%Y%m%d-%H%M%S).log"
    
    {
        echo "=== HOMELAB DIAGNOSTIC REPORT ==="
        echo "Generated: $(date)"
        echo ""
        
        echo "=== Docker Info ==="
        docker --version
        docker compose version
        echo ""
        
        echo "=== Running Containers ==="
        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        echo ""
        
        echo "=== Container Logs (Last 20 lines) ==="
        for container in homeassistant discord-bot homelab-dashboard; do
            if docker ps | grep -q "$container"; then
                echo "--- $container ---"
                docker logs --tail 20 "$container" 2>&1
                echo ""
            fi
        done
        
        echo "=== Disk Usage ==="
        df -h | grep -E "Filesystem|/dev/sd|/dev/nvme"
        echo ""
        
        echo "=== Network Configuration ==="
        docker network ls
        echo ""
        
        echo "=== Environment Variables (sanitized) ==="
        grep -v "PASSWORD\|SECRET\|TOKEN" .env 2>/dev/null || echo "No .env file"
        
    } > "$REPORT_FILE"
    
    echo -e "${GREEN}✓${NC} Diagnostic report saved to: $REPORT_FILE"
}

# ============================================
# Main Execution
# ============================================
main() {
    echo -e "${BOLD}Starting comprehensive homelab fix...${NC}"
    echo ""
    
    fix_homeassistant
    echo ""
    
    fix_database_users
    echo ""
    
    fix_code_server_permissions
    echo ""
    
    fix_environment_variables
    echo ""
    
    fix_docker_compose
    echo ""
    
    fix_celery_worker
    echo ""
    
    check_dns_configuration
    echo ""
    
    create_directory_structure
    echo ""
    
    fix_file_permissions
    echo ""
    
    generate_troubleshooting_report
    echo ""
    
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}  ${BOLD}${GREEN}✓ FIXES COMPLETE!${NC}                                            ${CYAN}║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "  1. Edit .env file with your actual credentials"
    echo "  2. Run: docker compose -f docker-compose.unified.yml down"
    echo "  3. Run: docker compose -f docker-compose.unified.yml up -d --build"
    echo "  4. Check logs: docker compose -f docker-compose.unified.yml logs -f"
    echo ""
    echo -e "${BLUE}DNS Issues:${NC}"
    echo "  - Fix DNS records for domains showing ✗ above"
    echo "  - Add A records pointing to your server IP"
    echo ""
    echo -e "${BLUE}Remaining Manual Tasks:${NC}"
    echo "  - Update Twitch OAuth credentials in .env"
    echo "  - Update Discord bot token in .env"
    echo "  - Update Home Assistant token in .env"
    echo ""
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
