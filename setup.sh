#!/bin/bash
set -euo pipefail

# HomeLab Dashboard - Intelligent Interactive Setup
# Investor-Ready Production Bootstrap System
# Version: 2.0.0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# State tracking
SETUP_STATE_FILE=".setup_state.json"
ENV_FILE=".env"

# Logging with timestamps
log() {
    echo -e "${CYAN}[$(date +'%H:%M:%S')]${NC} $1"
}

log_step() {
    echo ""
    echo -e "${BOLD}${PURPLE}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${PURPLE}║${NC} $1"
    echo -e "${BOLD}${PURPLE}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[⚠]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

log_prompt() {
    echo -e "${CYAN}[?]${NC} $1"
}

# Banner
show_banner() {
    clear
    cat << 'EOF'
╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║   ██╗  ██╗ ██████╗ ███╗   ███╗███████╗██╗      █████╗ ██████╗       ║
║   ██║  ██║██╔═══██╗████╗ ████║██╔════╝██║     ██╔══██╗██╔══██╗      ║
║   ███████║██║   ██║██╔████╔██║█████╗  ██║     ███████║██████╔╝      ║
║   ██╔══██║██║   ██║██║╚██╔╝██║██╔══╝  ██║     ██╔══██║██╔══██╗      ║
║   ██║  ██║╚██████╔╝██║ ╚═╝ ██║███████╗███████╗██║  ██║██████╔╝      ║
║   ╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝╚══════╝╚═╝  ╚═╝╚═════╝       ║
║                                                                       ║
║               🚀 Intelligent Setup & Deployment System 🚀             ║
║                        Version 2.0.0 - Jarvis AI                     ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
EOF
    echo ""
    log_info "Welcome! This wizard will guide you through setting up your homelab."
    log_info "Estimated time: 15-30 minutes depending on integrations."
    echo ""
}

# Prompt with default
prompt() {
    local var_name="$1"
    local prompt_text="$2"
    local default_value="${3:-}"
    local is_secret="${4:-false}"
    
    if [ -n "$default_value" ]; then
        log_prompt "$prompt_text"
        if [ "$is_secret" = "true" ]; then
            echo -e "         ${CYAN}(default: *********)${NC}"
        else
            echo -e "         ${CYAN}(default: $default_value)${NC}"
        fi
        echo -n "         > "
    else
        log_prompt "$prompt_text"
        echo -n "         > "
    fi
    
    if [ "$is_secret" = "true" ]; then
        read -s user_input
        echo "" # New line after hidden input
    else
        read user_input
    fi
    
    if [ -z "$user_input" ] && [ -n "$default_value" ]; then
        eval "$var_name='$default_value'"
    else
        eval "$var_name='$user_input'"
    fi
}

# Validate URL format
validate_url() {
    local url="$1"
    if [[ $url =~ ^https?:// ]]; then
        return 0
    else
        return 1
    fi
}

# Generate random secret
generate_secret() {
    openssl rand -base64 48 | tr -d "=+/" | cut -c1-64
}

# Test API key validity
test_openai_key() {
    local key="$1"
    log_info "Testing OpenAI API key..."
    
    response=$(curl -s -w "%{http_code}" -o /dev/null \
        -H "Authorization: Bearer $key" \
        -H "Content-Type: application/json" \
        https://api.openai.com/v1/models 2>/dev/null || echo "000")
    
    if [ "$response" = "200" ]; then
        log_success "OpenAI API key is valid!"
        return 0
    else
        log_error "OpenAI API key test failed (HTTP $response)"
        return 1
    fi
}

# Test Home Assistant connectivity
test_home_assistant() {
    local url="$1"
    local token="$2"
    log_info "Testing Home Assistant connection..."
    
    response=$(curl -s -w "%{http_code}" -o /dev/null \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        "$url/api/" 2>/dev/null || echo "000")
    
    if [ "$response" = "200" ]; then
        log_success "Home Assistant connection successful!"
        return 0
    else
        log_error "Home Assistant test failed (HTTP $response)"
        return 1
    fi
}

# Setup mode selection
setup_mode_selection() {
    log_step "STEP 1: Setup Mode Selection"
    
    echo "Choose your setup mode:"
    echo ""
    echo "  ${GREEN}1${NC}) Quick Start (Essential services only - 5 minutes)"
    echo "     ├─ Dashboard with Jarvis AI"
    echo "     ├─ Basic monitoring"
    echo "     └─ PostgreSQL database"
    echo ""
    echo "  ${YELLOW}2${NC}) Full Setup (All services + integrations - 20 minutes)"
    echo "     ├─ Everything in Quick Start"
    echo "     ├─ Stream Bot (Twitch/YouTube/Kick)"
    echo "     ├─ Discord Bot"
    echo "     ├─ Home Assistant integration"
    echo "     ├─ Google Services (Calendar, Gmail, Drive)"
    echo "     └─ MinIO object storage"
    echo ""
    echo "  ${BLUE}3${NC}) Custom (Choose specific services)"
    echo ""
    
    prompt setup_mode "Select mode (1/2/3)" "1"
    
    case $setup_mode in
        1)
            SETUP_MODE="quick"
            log_success "Quick Start mode selected"
            ;;
        2)
            SETUP_MODE="full"
            log_success "Full Setup mode selected"
            ;;
        3)
            SETUP_MODE="custom"
            log_success "Custom mode selected"
            setup_custom_services
            ;;
        *)
            log_error "Invalid selection"
            setup_mode_selection
            ;;
    esac
}

# Custom service selection
setup_custom_services() {
    log_info "Select services to enable:"
    echo ""
    
    ENABLE_DASHBOARD=true
    ENABLE_DATABASE=true
    
    prompt_yes_no "Enable Stream Bot?" ENABLE_STREAMBOT
    prompt_yes_no "Enable Discord Bot?" ENABLE_DISCORDBOT
    prompt_yes_no "Enable Home Assistant integration?" ENABLE_HOMEASSISTANT
    prompt_yes_no "Enable Google Services?" ENABLE_GOOGLE
    prompt_yes_no "Enable MinIO object storage?" ENABLE_MINIO
}

# Yes/No prompt
prompt_yes_no() {
    local prompt_text="$1"
    local var_name="$2"
    
    log_prompt "$prompt_text (y/n)"
    echo -n "         > "
    read answer
    
    case $answer in
        [Yy]*)
            eval "$var_name=true"
            ;;
        *)
            eval "$var_name=false"
            ;;
    esac
}

# Core system configuration
setup_core_system() {
    log_step "STEP 2: Core System Configuration"
    
    # User
    local current_user=$(whoami)
    prompt SERVICE_USER "System user for services" "$current_user"
    
    # Project directory
    prompt COMPOSE_PROJECT_DIR "Project directory" "$SCRIPT_DIR"
    
    # Generate session secrets
    log_info "Generating secure session secrets..."
    DASHBOARD_SESSION_SECRET=$(generate_secret)
    DISCORD_SESSION_SECRET=$(generate_secret)
    STREAMBOT_SESSION_SECRET=$(generate_secret)
    log_success "Session secrets generated"
}

# Database configuration
setup_database() {
    log_step "STEP 3: Database Configuration"
    
    log_info "PostgreSQL will host multiple databases for your services."
    echo ""
    
    # Generate strong passwords
    log_info "Generating secure database passwords..."
    DISCORD_DB_PASSWORD=$(generate_secret)
    STREAMBOT_DB_PASSWORD=$(generate_secret)
    JARVIS_DB_PASSWORD=$(generate_secret)
    log_success "Database passwords generated"
    
    log_info "Database configuration complete!"
}

# Dashboard & Jarvis AI
setup_dashboard() {
    log_step "STEP 4: Dashboard & Jarvis AI Setup"
    
    echo "The dashboard is the central control panel for your homelab."
    echo "Jarvis AI provides intelligent assistance and automation."
    echo ""
    
    # Dashboard credentials
    prompt DASHBOARD_USERNAME "Dashboard username" "admin"
    prompt DASHBOARD_PASSWORD "Dashboard password" "homelab123" true
    log_success "Dashboard login: $DASHBOARD_USERNAME / (password set)"
    
    # API key for programmatic access
    DASHBOARD_API_KEY=$(generate_secret)
    log_success "Dashboard API key generated"
    
    echo ""
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "🤖 ${BOLD}Jarvis AI Assistant Setup${NC}"
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Jarvis uses OpenAI's GPT-4 to provide intelligent assistance."
    echo ""
    echo "Features when enabled:"
    echo "  • Intelligent troubleshooting and diagnostics"
    echo "  • Natural language homelab control"
    echo "  • Code generation and review"
    echo "  • Log analysis and pattern detection"
    echo "  • Automated task execution"
    echo ""
    
    prompt_yes_no "Enable Jarvis AI?" enable_jarvis
    
    if [ "$enable_jarvis" = true ]; then
        echo ""
        log_info "To enable Jarvis, you need an OpenAI API key."
        echo ""
        echo "  📌 ${BOLD}How to get an OpenAI API key:${NC}"
        echo "     1. Visit: https://platform.openai.com/api-keys"
        echo "     2. Sign up or log in"
        echo "     3. Click 'Create new secret key'"
        echo "     4. Copy the key (starts with 'sk-')"
        echo ""
        
        while true; do
            prompt AI_INTEGRATIONS_OPENAI_API_KEY "Enter your OpenAI API key" "" true
            
            if [ -z "$AI_INTEGRATIONS_OPENAI_API_KEY" ]; then
                log_warn "Jarvis will be disabled without an API key"
                break
            fi
            
            if test_openai_key "$AI_INTEGRATIONS_OPENAI_API_KEY"; then
                AI_INTEGRATIONS_OPENAI_BASE_URL="https://api.openai.com/v1"
                log_success "Jarvis AI is now enabled!"
                break
            else
                log_error "Invalid API key. Please try again or press Enter to skip."
            fi
        done
    else
        log_info "Jarvis AI will be disabled. You can enable it later in Settings."
    fi
}

# Stream Bot setup
setup_streambot() {
    if [ "$SETUP_MODE" = "quick" ]; then
        return
    fi
    
    log_step "STEP 5: Stream Bot Configuration"
    
    echo "Stream Bot manages your Twitch, YouTube, and Kick streams."
    echo "Features: AI chat, custom commands, alerts, giveaways, analytics"
    echo ""
    
    prompt_yes_no "Set up Stream Bot now?" setup_streambot_now
    
    if [ "$setup_streambot_now" = false ]; then
        log_info "Stream Bot setup skipped. Configure later in dashboard."
        return
    fi
    
    # Twitch
    echo ""
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "🎮 ${BOLD}Twitch Integration${NC}"
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  📌 ${BOLD}How to get Twitch credentials:${NC}"
    echo "     1. Visit: https://dev.twitch.tv/console/apps"
    echo "     2. Click 'Register Your Application'"
    echo "     3. Name: 'My Stream Bot'"
    echo "     4. OAuth Redirect URL: https://YOUR_DOMAIN/api/auth/twitch/callback"
    echo "     5. Category: 'Chat Bot'"
    echo "     6. Copy Client ID and generate Client Secret"
    echo ""
    
    prompt TWITCH_CLIENT_ID "Twitch Client ID" ""
    prompt TWITCH_CLIENT_SECRET "Twitch Client Secret" "" true
    
    # YouTube
    echo ""
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "📺 ${BOLD}YouTube Integration (Optional)${NC}"
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    prompt_yes_no "Enable YouTube integration?" enable_youtube
    
    if [ "$enable_youtube" = true ]; then
        echo ""
        echo "  📌 ${BOLD}How to get YouTube credentials:${NC}"
        echo "     1. Visit: https://console.cloud.google.com/"
        echo "     2. Create new project: 'Stream Bot'"
        echo "     3. Enable YouTube Data API v3"
        echo "     4. Create OAuth 2.0 credentials"
        echo "     5. Add redirect URI: https://YOUR_DOMAIN/api/auth/youtube/callback"
        echo ""
        
        prompt YOUTUBE_CLIENT_ID "YouTube Client ID" ""
        prompt YOUTUBE_CLIENT_SECRET "YouTube Client Secret" "" true
    fi
    
    # Kick
    echo ""
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "⚡ ${BOLD}Kick Integration (Optional)${NC}"
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    prompt_yes_no "Enable Kick integration?" enable_kick
    
    if [ "$enable_kick" = true ]; then
        prompt KICK_CLIENT_ID "Kick Client ID" ""
        prompt KICK_CLIENT_SECRET "Kick Client Secret" "" true
    fi
    
    # Stream Bot OpenAI
    echo ""
    log_info "Stream Bot can use AI for intelligent chat responses."
    prompt_yes_no "Enable AI chat for Stream Bot?" enable_streambot_ai
    
    if [ "$enable_streambot_ai" = true ]; then
        if [ -n "${AI_INTEGRATIONS_OPENAI_API_KEY:-}" ]; then
            log_info "Using the same OpenAI key as Jarvis"
            STREAMBOT_OPENAI_API_KEY="$AI_INTEGRATIONS_OPENAI_API_KEY"
            STREAMBOT_OPENAI_BASE_URL="https://api.openai.com/v1"
        else
            prompt STREAMBOT_OPENAI_API_KEY "OpenAI API key for Stream Bot" "" true
            STREAMBOT_OPENAI_BASE_URL="https://api.openai.com/v1"
        fi
    fi
}

# Discord Bot setup
setup_discord() {
    if [ "$SETUP_MODE" = "quick" ]; then
        return
    fi
    
    log_step "STEP 6: Discord Bot Configuration"
    
    echo "Discord Bot provides ticket support system and notifications."
    echo ""
    
    prompt_yes_no "Set up Discord Bot now?" setup_discord_now
    
    if [ "$setup_discord_now" = false ]; then
        log_info "Discord Bot setup skipped. Configure later in dashboard."
        return
    fi
    
    echo ""
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "💬 ${BOLD}Discord Developer Portal Setup${NC}"
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  📌 ${BOLD}How to create a Discord bot:${NC}"
    echo "     1. Visit: https://discord.com/developers/applications"
    echo "     2. Click 'New Application'"
    echo "     3. Name your bot (e.g., 'My Homelab Bot')"
    echo "     4. Go to 'Bot' tab → Click 'Add Bot'"
    echo "     5. Copy the bot token (click 'Reset Token' if needed)"
    echo "     6. Go to 'OAuth2' tab → Copy Client ID and Client Secret"
    echo "     7. Add Redirect URI: https://YOUR_DOMAIN/api/auth/discord/callback"
    echo ""
    
    prompt DISCORD_BOT_TOKEN "Discord Bot Token" "" true
    prompt DISCORD_CLIENT_ID "Discord Client ID" ""
    prompt DISCORD_CLIENT_SECRET "Discord Client Secret" "" true
    
    # Use Client ID for App ID
    DISCORD_APP_ID="$DISCORD_CLIENT_ID"
    VITE_DISCORD_CLIENT_ID="$DISCORD_CLIENT_ID"
    
    log_success "Discord Bot configured!"
}

# Home Assistant setup
setup_home_assistant() {
    if [ "$SETUP_MODE" = "quick" ]; then
        return
    fi
    
    log_step "STEP 7: Home Assistant Integration"
    
    echo "Control your smart home devices directly from the dashboard."
    echo ""
    
    prompt_yes_no "Set up Home Assistant integration?" setup_ha_now
    
    if [ "$setup_ha_now" = false ]; then
        log_info "Home Assistant setup skipped. Configure later in dashboard."
        return
    fi
    
    echo ""
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "🏠 ${BOLD}Home Assistant Connection${NC}"
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  📌 ${BOLD}How to get a Home Assistant token:${NC}"
    echo "     1. Open your Home Assistant instance"
    echo "     2. Click your profile (bottom left)"
    echo "     3. Scroll to 'Long-Lived Access Tokens'"
    echo "     4. Click 'Create Token'"
    echo "     5. Name: 'Homelab Dashboard'"
    echo "     6. Copy the token (you won't see it again!)"
    echo ""
    
    while true; do
        prompt HOME_ASSISTANT_URL "Home Assistant URL (e.g., https://home.example.com)" ""
        
        if validate_url "$HOME_ASSISTANT_URL"; then
            break
        else
            log_error "Invalid URL format. Must start with http:// or https://"
        fi
    done
    
    while true; do
        prompt HOME_ASSISTANT_TOKEN "Home Assistant Long-Lived Access Token" "" true
        
        if [ -z "$HOME_ASSISTANT_TOKEN" ]; then
            log_warn "Home Assistant will be disabled without a token"
            break
        fi
        
        if test_home_assistant "$HOME_ASSISTANT_URL" "$HOME_ASSISTANT_TOKEN"; then
            log_success "Home Assistant connected successfully!"
            break
        else
            log_error "Connection failed. Check URL and token, then try again."
        fi
    done
}

# Generate .env file
generate_env_file() {
    log_step "FINAL STEP: Generating Configuration"
    
    log_info "Creating .env file with your configuration..."
    
    cat > "$ENV_FILE" << EOF
# HomeLab Dashboard - Environment Configuration
# Generated: $(date)
# Setup Mode: $SETUP_MODE

# ═══════════════════════════════════════════════════════════════
# SYSTEM CONFIGURATION
# ═══════════════════════════════════════════════════════════════
SERVICE_USER=${SERVICE_USER:-evin}
COMPOSE_PROJECT_DIR=${COMPOSE_PROJECT_DIR:-$SCRIPT_DIR}

# ═══════════════════════════════════════════════════════════════
# DATABASE CONFIGURATION
# ═══════════════════════════════════════════════════════════════
DISCORD_DB_PASSWORD=${DISCORD_DB_PASSWORD}
STREAMBOT_DB_PASSWORD=${STREAMBOT_DB_PASSWORD}
JARVIS_DB_PASSWORD=${JARVIS_DB_PASSWORD}
JARVIS_DATABASE_URL=postgresql://postgres:${JARVIS_DB_PASSWORD}@discord-bot-db:5432/jarvis_db

# ═══════════════════════════════════════════════════════════════
# DASHBOARD & JARVIS AI
# ═══════════════════════════════════════════════════════════════
DASHBOARD_USERNAME=${DASHBOARD_USERNAME:-admin}
DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD:-homelab123}
DASHBOARD_API_KEY=${DASHBOARD_API_KEY}
DASHBOARD_SESSION_SECRET=${DASHBOARD_SESSION_SECRET}

# Jarvis AI Configuration
AI_INTEGRATIONS_OPENAI_API_KEY=${AI_INTEGRATIONS_OPENAI_API_KEY:-}
AI_INTEGRATIONS_OPENAI_BASE_URL=${AI_INTEGRATIONS_OPENAI_BASE_URL:-https://api.openai.com/v1}

# ═══════════════════════════════════════════════════════════════
# DISCORD BOT (Optional)
# ═══════════════════════════════════════════════════════════════
DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN:-}
DISCORD_CLIENT_ID=${DISCORD_CLIENT_ID:-}
DISCORD_CLIENT_SECRET=${DISCORD_CLIENT_SECRET:-}
DISCORD_APP_ID=${DISCORD_APP_ID:-}
VITE_DISCORD_CLIENT_ID=${VITE_DISCORD_CLIENT_ID:-}
DISCORD_SESSION_SECRET=${DISCORD_SESSION_SECRET}
RESET_DB=false

# ═══════════════════════════════════════════════════════════════
# STREAM BOT (Optional)
# ═══════════════════════════════════════════════════════════════
STREAMBOT_SESSION_SECRET=${STREAMBOT_SESSION_SECRET}
STREAMBOT_OPENAI_API_KEY=${STREAMBOT_OPENAI_API_KEY:-}
STREAMBOT_OPENAI_BASE_URL=${STREAMBOT_OPENAI_BASE_URL:-https://api.openai.com/v1}
STREAMBOT_NODE_ENV=production
STREAMBOT_PORT=3000

# Twitch Integration
TWITCH_CLIENT_ID=${TWITCH_CLIENT_ID:-}
TWITCH_CLIENT_SECRET=${TWITCH_CLIENT_SECRET:-}

# YouTube Integration
YOUTUBE_CLIENT_ID=${YOUTUBE_CLIENT_ID:-}
YOUTUBE_CLIENT_SECRET=${YOUTUBE_CLIENT_SECRET:-}

# Kick Integration
KICK_CLIENT_ID=${KICK_CLIENT_ID:-}
KICK_CLIENT_SECRET=${KICK_CLIENT_SECRET:-}

# ═══════════════════════════════════════════════════════════════
# HOME ASSISTANT (Optional)
# ═══════════════════════════════════════════════════════════════
HOME_ASSISTANT_URL=${HOME_ASSISTANT_URL:-}
HOME_ASSISTANT_TOKEN=${HOME_ASSISTANT_TOKEN:-}
HOME_ASSISTANT_VERIFY_SSL=True

# ═══════════════════════════════════════════════════════════════
# MINIO OBJECT STORAGE (Optional)
# ═══════════════════════════════════════════════════════════════
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=$(generate_secret | cut -c1-20)

# ═══════════════════════════════════════════════════════════════
# GOOGLE SERVICES (Optional)
# ═══════════════════════════════════════════════════════════════
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}

# ═══════════════════════════════════════════════════════════════
# ZONEEDIT DNS (Optional)
# ═══════════════════════════════════════════════════════════════
ZONEEDIT_USERNAME=${ZONEEDIT_USERNAME:-}
ZONEEDIT_PASSWORD=${ZONEEDIT_PASSWORD:-}

# ═══════════════════════════════════════════════════════════════
# REPLIT ENVIRONMENT (Auto-detected)
# ═══════════════════════════════════════════════════════════════
REPLIT=${REPLIT:-false}
REPLIT_DEV_DOMAIN=${REPLIT_DEV_DOMAIN:-localhost}
REPLIT_DOMAINS=${REPLIT_DOMAINS:-}
EOF

    log_success ".env file created successfully!"
    
    # Set secure permissions
    chmod 600 "$ENV_FILE"
    log_success "Secure permissions set on .env (600)"
}

# Setup summary
show_summary() {
    log_step "Setup Complete! 🎉"
    
    echo ""
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                     SETUP SUMMARY                             ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo ""
    
    log_info "✓ Configuration file created: .env"
    log_info "✓ Setup mode: $SETUP_MODE"
    echo ""
    
    echo "Services configured:"
    echo "  ✓ Dashboard & Database (core)"
    
    [ -n "${AI_INTEGRATIONS_OPENAI_API_KEY:-}" ] && echo "  ✓ Jarvis AI Assistant"
    [ -n "${DISCORD_BOT_TOKEN:-}" ] && echo "  ✓ Discord Bot"
    [ -n "${TWITCH_CLIENT_ID:-}" ] && echo "  ✓ Stream Bot (Twitch)"
    [ -n "${YOUTUBE_CLIENT_ID:-}" ] && echo "  ✓ Stream Bot (YouTube)"
    [ -n "${HOME_ASSISTANT_URL:-}" ] && echo "  ✓ Home Assistant"
    
    echo ""
    echo "Dashboard Login:"
    echo "  Username: $DASHBOARD_USERNAME"
    echo "  Password: (set during setup)"
    echo ""
    
    log_info "Next steps:"
    echo "  1. Review your .env file if needed: nano .env"
    echo "  2. Start services: ./deploy.sh start"
    echo "  3. Check status: ./deploy.sh status"
    echo "  4. View logs: ./deploy.sh logs -f"
    echo "  5. Access dashboard at: http://localhost:5000"
    echo ""
    
    log_warn "IMPORTANT: Keep your .env file secure - it contains sensitive credentials!"
    echo ""
    
    log_success "You're ready to go! Run './deploy.sh start' to begin."
    echo ""
}

# Main setup flow
main() {
    show_banner
    
    # Check if already configured
    if [ -f "$ENV_FILE" ]; then
        log_warn ".env file already exists!"
        echo ""
        prompt_yes_no "Do you want to reconfigure? (This will backup existing .env)" reconfigure
        
        if [ "$reconfigure" = true ]; then
            mv "$ENV_FILE" "${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
            log_success "Existing .env backed up"
        else
            log_info "Setup cancelled. Existing configuration preserved."
            exit 0
        fi
    fi
    
    # Run setup steps
    setup_mode_selection
    setup_core_system
    setup_database
    setup_dashboard
    setup_streambot
    setup_discord
    setup_home_assistant
    
    # Generate configuration
    generate_env_file
    
    # Show summary
    show_summary
}

# Run main setup
main "$@"
