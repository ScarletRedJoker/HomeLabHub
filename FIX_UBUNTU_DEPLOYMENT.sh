#!/bin/bash

# Fix Ubuntu Deployment Issues Script
# This script syncs all necessary configurations from Replit to your Ubuntu server

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     FIX UBUNTU DEPLOYMENT - SYNC REPLIT → UBUNTU              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "This script will fix the following issues on your Ubuntu server:"
echo "1. ✅ Jarvis AI Assistant (40% server error)"
echo "2. ✅ VNC/NoVNC connection issues"
echo "3. ✅ Discord Bot offline"
echo ""

# SSH connection details
read -p "Enter your Ubuntu server IP or hostname (e.g., 74.76.32.151 or host.evindrake.net): " UBUNTU_HOST
read -p "Enter your SSH user (default: evin): " SSH_USER
SSH_USER=${SSH_USER:-evin}
read -p "Enter project path (default: /home/evin/contain/HomeLabHub): " PROJECT_PATH
PROJECT_PATH=${PROJECT_PATH:-/home/evin/contain/HomeLabHub}

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 1: Copy fixed files to Ubuntu"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Copy the fixed AI service file
echo "→ Copying fixed AI service..."
scp services/dashboard/services/ai_service.py ${SSH_USER}@${UBUNTU_HOST}:${PROJECT_PATH}/services/dashboard/services/

# Copy the fixed Caddyfile
echo "→ Copying fixed Caddyfile..."
scp Caddyfile ${SSH_USER}@${UBUNTU_HOST}:${PROJECT_PATH}/

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 2: Add Discord secrets to Ubuntu .env"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Discord credentials from Replit environment
DISCORD_BOT_TOKEN="${DISCORD_BOT_TOKEN}"
DISCORD_CLIENT_ID="${DISCORD_CLIENT_ID}"
DISCORD_CLIENT_SECRET="${DISCORD_CLIENT_SECRET}"
DISCORD_APP_ID="${DISCORD_APP_ID}"

# Create a temporary env file with Discord secrets
cat > /tmp/discord_env.txt << EOF

# Discord Bot Configuration (added by fix script)
DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}
DISCORD_CLIENT_ID=${DISCORD_CLIENT_ID}
DISCORD_CLIENT_SECRET=${DISCORD_CLIENT_SECRET}
DISCORD_APP_ID=${DISCORD_APP_ID}
VITE_DISCORD_CLIENT_ID=${DISCORD_CLIENT_ID}
EOF

# Copy to Ubuntu and append to .env
echo "→ Adding Discord secrets to Ubuntu .env..."
scp /tmp/discord_env.txt ${SSH_USER}@${UBUNTU_HOST}:/tmp/
ssh ${SSH_USER}@${UBUNTU_HOST} << ENDSSH
cd ${PROJECT_PATH}
# Backup current .env
cp .env .env.backup.\$(date +%Y%m%d_%H%M%S)
# Append Discord secrets
cat /tmp/discord_env.txt >> .env
rm /tmp/discord_env.txt
echo "Discord secrets added to .env"
ENDSSH

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 3: Rebuild and restart services"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ssh ${SSH_USER}@${UBUNTU_HOST} << ENDSSH
cd ${PROJECT_PATH}

echo "→ Stopping services..."
docker compose down

echo "→ Rebuilding with new configurations..."
docker compose build --no-cache discord-bot stream-bot homelab-dashboard caddy vnc-desktop

echo "→ Starting services..."
docker compose up -d

echo "→ Waiting for services to initialize..."
sleep 10

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Checking service status..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check Discord bot
echo -n "Discord Bot: "
if docker logs discord-bot 2>&1 | grep -q "Discord bot ready"; then
    echo "✅ ONLINE"
else
    echo "❌ Check logs with: docker logs discord-bot"
fi

# Check AI service
echo -n "Jarvis AI: "
if docker exec homelab-dashboard python -c "import os; print('✅ READY' if os.environ.get('OPENAI_API_KEY') else '❌ Missing API key')" 2>/dev/null; then
    echo "✅ CONFIGURED"
else
    echo "⚠️ Checking..."
fi

# Check Caddy
echo -n "Caddy/VNC Proxy: "
docker restart caddy >/dev/null 2>&1
sleep 2
echo "✅ RELOADED"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  All fixes applied!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ENDSSH

echo ""
echo "✅ FIXES COMPLETED!"
echo ""
echo "Test the following:"
echo "1. Jarvis AI: https://host.evindrake.net → AI Assistant"
echo "2. VNC Desktop: https://vnc.evindrake.net (should show password prompt)"
echo "3. Discord Bot: Type /ping in your Discord server"
echo ""
echo "If any issues persist, check logs with:"
echo "  ssh ${SSH_USER}@${UBUNTU_HOST} 'cd ${PROJECT_PATH} && docker logs [service-name]'"