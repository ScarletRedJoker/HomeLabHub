#!/bin/bash

# Fix Jarvis AI 40% Error on Ubuntu Production Server

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          FIX JARVIS AI - PRODUCTION SERVER                    ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "This script will fix the Jarvis AI 40% error by ensuring"
echo "OPENAI_API_KEY is properly configured in the production environment."
echo ""

# Set variables
UBUNTU_HOST="host.evindrake.net"
SSH_USER="evin"
PROJECT_PATH="/home/evin/contain/HomeLabHub"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Connecting to Ubuntu Server..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Create a temporary script to run on the Ubuntu server
cat << 'REMOTE_SCRIPT' > /tmp/fix_jarvis_remote.sh
#!/bin/bash

cd /home/evin/contain/HomeLabHub

echo "1. Checking current environment variables..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "Creating new .env file..."
    touch .env
fi

# Backup current .env
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
echo "✅ Created backup of .env"

# Check if OPENAI_API_KEY exists
echo ""
echo "2. Checking OpenAI configuration..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if grep -q "^OPENAI_API_KEY=" .env; then
    echo "✅ OPENAI_API_KEY found in .env"
    # Get the value
    API_KEY=$(grep "^OPENAI_API_KEY=" .env | cut -d'=' -f2)
    if [ -z "$API_KEY" ]; then
        echo "⚠️  OPENAI_API_KEY is empty!"
        echo ""
        echo "Please add your OpenAI API key to .env:"
        echo "OPENAI_API_KEY=sk-..."
        exit 1
    fi
else
    # Check if AI_INTEGRATIONS_OPENAI_API_KEY exists and copy it
    if grep -q "^AI_INTEGRATIONS_OPENAI_API_KEY=" .env; then
        echo "Found AI_INTEGRATIONS_OPENAI_API_KEY, copying to OPENAI_API_KEY..."
        API_KEY=$(grep "^AI_INTEGRATIONS_OPENAI_API_KEY=" .env | cut -d'=' -f2)
        echo "OPENAI_API_KEY=$API_KEY" >> .env
        echo "✅ Added OPENAI_API_KEY to .env"
    else
        echo "❌ No OpenAI API key found!"
        echo ""
        echo "Please add your OpenAI API key to .env:"
        echo "OPENAI_API_KEY=sk-..."
        exit 1
    fi
fi

# Also ensure AI_INTEGRATIONS_OPENAI_API_KEY exists for compatibility
if ! grep -q "^AI_INTEGRATIONS_OPENAI_API_KEY=" .env; then
    if grep -q "^OPENAI_API_KEY=" .env; then
        API_KEY=$(grep "^OPENAI_API_KEY=" .env | cut -d'=' -f2)
        echo "AI_INTEGRATIONS_OPENAI_API_KEY=$API_KEY" >> .env
        echo "✅ Added AI_INTEGRATIONS_OPENAI_API_KEY for compatibility"
    fi
fi

echo ""
echo "3. Verifying Docker Compose configuration..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check docker-compose.yml for proper env var passing
if grep -q "OPENAI_API_KEY" docker-compose.yml; then
    echo "✅ docker-compose.yml configured for OPENAI_API_KEY"
else
    echo "⚠️  docker-compose.yml may need update for OPENAI_API_KEY"
fi

echo ""
echo "4. Restarting services..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Stop the dashboard service
echo "→ Stopping homelab-dashboard..."
docker compose stop homelab-dashboard

# Remove the container to ensure clean restart
docker compose rm -f homelab-dashboard

# Rebuild the dashboard with the new env vars
echo "→ Rebuilding homelab-dashboard..."
docker compose build homelab-dashboard

# Start the dashboard
echo "→ Starting homelab-dashboard..."
docker compose up -d homelab-dashboard

# Wait for service to initialize
echo "→ Waiting for service to initialize..."
sleep 10

echo ""
echo "5. Verifying fix..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if the container has the env var
echo -n "Checking container environment: "
if docker exec homelab-dashboard printenv | grep -q "OPENAI_API_KEY="; then
    echo "✅ OPENAI_API_KEY is set in container"
else
    echo "❌ OPENAI_API_KEY not found in container"
fi

# Check service health
echo -n "Checking service status: "
if docker ps | grep -q "homelab-dashboard.*Up"; then
    echo "✅ Service is running"
else
    echo "❌ Service not running properly"
fi

# Check logs for errors
echo ""
echo "Recent logs from homelab-dashboard:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker logs homelab-dashboard --tail 20 2>&1 | grep -E "(AI|OpenAI|GPT|Error|WARNING)" || echo "No AI-related messages in recent logs"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Fix attempt completed!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
REMOTE_SCRIPT

# Copy the script to Ubuntu server
echo "Copying fix script to server..."
sshpass -p '7530' scp /tmp/fix_jarvis_remote.sh ${SSH_USER}@${UBUNTU_HOST}:/tmp/

# Execute the script on Ubuntu server
echo "Executing fix on server..."
echo ""
sshpass -p '7530' ssh ${SSH_USER}@${UBUNTU_HOST} "bash /tmp/fix_jarvis_remote.sh"

# Clean up
rm /tmp/fix_jarvis_remote.sh

echo ""
echo "✅ FIX COMPLETED!"
echo ""
echo "Please test Jarvis AI at: https://host.evindrake.net"
echo ""
echo "If the 40% error persists:"
echo "1. Check that your OpenAI API key is valid"
echo "2. Ensure the key starts with 'sk-'"
echo "3. Try regenerating the key in your OpenAI dashboard"
echo ""
echo "To manually check the environment:"
echo "  ssh ${SSH_USER}@${UBUNTU_HOST}"
echo "  cd ${PROJECT_PATH}"
echo "  grep OPENAI .env"