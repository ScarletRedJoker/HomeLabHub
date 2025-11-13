#!/bin/bash

# Quick script to add missing VNC variables to existing .env

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

if [[ ! -f .env ]]; then
    echo "Error: .env file not found!"
    exit 1
fi

# Check what's missing
NEEDS_VNC=false
NEEDS_GAME_STREAMING=false
NEEDS_NOVNC_URL=false
NEEDS_STREAMBOT=false
NEEDS_WEB_LOGIN=false

if ! grep -q "VNC_PASSWORD=" .env; then
    NEEDS_VNC=true
fi

if ! grep -q "WINDOWS_KVM_IP=" .env; then
    NEEDS_GAME_STREAMING=true
fi

if ! grep -q "NOVNC_URL=" .env; then
    NEEDS_NOVNC_URL=true
fi

if ! grep -q "STREAMBOT_SESSION_SECRET=" .env; then
    NEEDS_STREAMBOT=true
fi

if ! grep -q "WEB_USERNAME=" .env; then
    NEEDS_WEB_LOGIN=true
fi

if [ "$NEEDS_VNC" = false ] && [ "$NEEDS_GAME_STREAMING" = false ] && [ "$NEEDS_NOVNC_URL" = false ] && [ "$NEEDS_STREAMBOT" = false ] && [ "$NEEDS_WEB_LOGIN" = false ]; then
    print_success "All variables already present in .env!"
    exit 0
fi

print_warning "Adding missing variables to .env..."

# Generate passwords if needed
if [ "$NEEDS_VNC" = true ]; then
    VNC_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_urlsafe(12))')
    VNC_USER_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_urlsafe(12))')
fi

if [ "$NEEDS_STREAMBOT" = true ]; then
    STREAMBOT_SESSION_SECRET=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
fi

# Add dashboard web login if missing
if [ "$NEEDS_WEB_LOGIN" = true ]; then
    cat >> .env << EOF

# ============================================
# Dashboard Web Login (AUTO-ADDED)
# ============================================
WEB_USERNAME=evin
WEB_PASSWORD=homelab
EOF
    print_success "Dashboard web login credentials added!"
fi

# Add StreamBot session secret
if [ "$NEEDS_STREAMBOT" = true ]; then
    # Get the OpenAI key to use for StreamBot
    OPENAI_KEY=$(grep "^OPENAI_API_KEY=" .env | cut -d'=' -f2-)
    
    cat >> .env << EOF

# ============================================
# Stream Bot (AUTO-ADDED)
# ============================================
STREAMBOT_DATABASE_URL=postgresql://streambot:streambot123@discord-bot-db:5432/streambot
STREAMBOT_SESSION_SECRET=$STREAMBOT_SESSION_SECRET
STREAMBOT_OPENAI_API_KEY=${OPENAI_KEY}
STREAMBOT_OPENAI_BASE_URL=https://api.openai.com/v1
STREAMBOT_NODE_ENV=production
STREAMBOT_PORT=5000
EOF
    print_success "StreamBot configuration added!"
fi

# Add VNC variables
if [ "$NEEDS_VNC" = true ]; then
    cat >> .env << EOF

# ============================================
# VNC Remote Desktop (AUTO-ADDED)
# ============================================
VNC_PASSWORD=$VNC_PASSWORD
VNC_USER=evin
VNC_USER_PASSWORD=$VNC_USER_PASSWORD
VNC_BASIC_AUTH=evin:\$\$apr1\$\$8kVPkqVc\$\$P7YtMjKrJzTgQqWXqEJLT1
EOF
    print_success "VNC variables added!"
fi

# Add NOVNC_URL if missing
if [ "$NEEDS_NOVNC_URL" = true ]; then
    echo "NOVNC_URL=https://vnc.evindrake.net" >> .env
    print_success "NOVNC_URL added!"
fi

# Add Game Streaming variable
if [ "$NEEDS_GAME_STREAMING" = true ]; then
    cat >> .env << EOF

# ============================================
# Game Streaming (AUTO-ADDED)
# ============================================
# IP address of your Windows 11 KVM with RTX 3060
WINDOWS_KVM_IP=192.168.1.XXX
EOF
    print_success "Game streaming variable added!"
fi

echo ""
print_success "All missing variables added to .env!"
echo ""
if [ "$NEEDS_VNC" = true ]; then
    echo "VNC Web Access: https://vnc.evindrake.net"
    echo "  Username: evin"
    echo "  Password: changeme"
    echo ""
    echo "VNC Session Password (auto-generated):"
    echo "  $VNC_PASSWORD"
    echo ""
fi

if [ "$NEEDS_GAME_STREAMING" = true ]; then
    print_warning "REMINDER: Update WINDOWS_KVM_IP in .env with your Windows VM's IP"
    echo ""
fi

print_warning "Next step - Restart deployment to apply changes:"
echo "  docker compose -f docker-compose.unified.yml down"
echo "  docker compose -f docker-compose.unified.yml up -d"
echo ""
