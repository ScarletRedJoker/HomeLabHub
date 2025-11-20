#!/bin/bash

# Fix Jarvis AI 40% Error on Ubuntu Production Server

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          FIX JARVIS AI - PRODUCTION SERVER                    ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "This script will fix the Jarvis AI 40% error by ensuring"
echo "OPENAI_API_KEY is properly configured in the production environment."
echo ""

# Check if we have the OPENAI_API_KEY in Replit environment
if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ OPENAI_API_KEY not found in Replit environment!"
    echo "Please ensure the OPENAI_API_KEY is set in your Replit secrets."
    exit 1
fi

echo "✅ Found OPENAI_API_KEY in Replit environment"
echo ""

# Set variables
read -p "Enter Ubuntu server (default: host.evindrake.net): " UBUNTU_HOST
UBUNTU_HOST=${UBUNTU_HOST:-host.evindrake.net}

read -p "Enter SSH user (default: evin): " SSH_USER
SSH_USER=${SSH_USER:-evin}

PROJECT_PATH="/home/evin/contain/HomeLabHub"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 1: Create environment update file"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create a temporary file with the OPENAI_API_KEY
cat << EOF > /tmp/openai_env.txt

# OpenAI API Keys for Jarvis AI
OPENAI_API_KEY=${OPENAI_API_KEY}
AI_INTEGRATIONS_OPENAI_API_KEY=${OPENAI_API_KEY}
EOF

echo "✅ Created environment update file"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 2: Copy to Ubuntu server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "You will be prompted for your SSH password..."
scp /tmp/openai_env.txt ${SSH_USER}@${UBUNTU_HOST}:/tmp/

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 3: Apply fix on Ubuntu server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Connecting to Ubuntu server..."
echo "You will be prompted for your SSH password again..."
echo ""

ssh ${SSH_USER}@${UBUNTU_HOST} << 'ENDSSH'
cd /home/evin/contain/HomeLabHub

echo "1. Backing up current .env file..."
cp .env .env.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || touch .env
echo "✅ Backup created"

echo ""
echo "2. Updating environment variables..."

# Remove any existing OPENAI_API_KEY entries
grep -v "^OPENAI_API_KEY=" .env | grep -v "^AI_INTEGRATIONS_OPENAI_API_KEY=" > .env.tmp
mv .env.tmp .env

# Add the new keys
cat /tmp/openai_env.txt >> .env
rm /tmp/openai_env.txt

echo "✅ Environment variables updated"

echo ""
echo "3. Restarting Jarvis AI service..."

# Stop and remove the container
docker compose stop homelab-dashboard
docker compose rm -f homelab-dashboard

# Rebuild with new environment
docker compose build homelab-dashboard

# Start the service
docker compose up -d homelab-dashboard

echo "✅ Service restarted"

echo ""
echo "4. Waiting for service to initialize..."
sleep 10

echo ""
echo "5. Verifying the fix..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if the container has the env var
echo -n "Container environment check: "
if docker exec homelab-dashboard printenv 2>/dev/null | grep -q "OPENAI_API_KEY=sk-"; then
    echo "✅ OPENAI_API_KEY is properly set"
else
    echo "⚠️  Could not verify OPENAI_API_KEY in container"
fi

# Check service status
echo -n "Service status: "
if docker ps | grep -q "homelab-dashboard.*Up"; then
    echo "✅ Running"
    
    # Get container uptime
    UPTIME=$(docker ps --format "table {{.Status}}" --filter name=homelab-dashboard | tail -1)
    echo "  Uptime: $UPTIME"
else
    echo "❌ Not running properly"
fi

# Show relevant logs
echo ""
echo "Recent AI-related logs:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker logs homelab-dashboard --tail 30 2>&1 | grep -E "(AI|OpenAI|GPT|jarvis|Jarvis)" | tail -10 || echo "No AI-related messages in recent logs"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Fix completed!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ENDSSH

# Clean up temp file
rm -f /tmp/openai_env.txt

echo ""
echo "✅ JARVIS AI FIX COMPLETED!"
echo ""
echo "Please test Jarvis AI at: https://host.evindrake.net"
echo ""
echo "The AI Assistant should now work without the 40% error."
echo ""
echo "If issues persist:"
echo "1. Clear your browser cache"
echo "2. Try in an incognito/private window"
echo "3. Check the OpenAI API key is valid at: https://platform.openai.com/api-keys"