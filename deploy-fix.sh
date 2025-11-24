#!/bin/bash
set -e

echo "=========================================="
echo " Service Separation Fix - Deployment"
echo "=========================================="
echo ""

# Check we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Error: Must run from project root (/home/evin/contain/HomeLabHub)"
    exit 1
fi

echo "✓ Running from project root"
echo ""

# Step 1: Fix Stream-Bot AI Model in Database
echo "=========================================="
echo " Step 1: Fix Stream-Bot AI Model"
echo "=========================================="
echo ""

echo "Updating stream-bot database records to use gpt-4o..."
docker exec -i homelab-postgres psql -U streambot -d streambot <<'EOF'
-- Update bot_config records
UPDATE bot_config 
SET ai_model = 'gpt-4o' 
WHERE ai_model IN ('gpt-5-mini', 'gpt-4o-mini', 'gpt-3.5-turbo');

-- Update users records
UPDATE users 
SET ai_model = 'gpt-4o' 
WHERE ai_model IN ('gpt-5-mini', 'gpt-4o-mini', 'gpt-3.5-turbo');

-- Show results
SELECT 'bot_config' as table_name, ai_model, COUNT(*) as count
FROM bot_config 
GROUP BY ai_model
UNION ALL
SELECT 'users' as table_name, ai_model, COUNT(*) as count
FROM users 
GROUP BY ai_model;
EOF

echo ""
echo "✓ Database records updated"
echo ""

# Step 2: Rebuild Stream-Bot
echo "=========================================="
echo " Step 2: Rebuild Stream-Bot"
echo "=========================================="
echo ""

echo "Rebuilding stream-bot with latest code..."
docker-compose up -d --build stream-bot

echo ""
echo "Waiting 15 seconds for stream-bot to start..."
sleep 15

echo ""
echo "Stream-bot logs:"
docker-compose logs stream-bot | tail -50

echo ""

# Step 3: Verify Dashboard OpenAI Configuration
echo "=========================================="
echo " Step 3: Verify Dashboard AI Service"
echo "=========================================="
echo ""

echo "Checking dashboard OpenAI configuration..."
if docker exec homelab-dashboard printenv | grep -q OPENAI_API_KEY; then
    echo "✓ OPENAI_API_KEY is set in dashboard container"
else
    echo "⚠ WARNING: OPENAI_API_KEY not found in dashboard container"
    echo "  Please check your .env file and docker-compose.yml"
    echo "  Dashboard needs: OPENAI_API_KEY=${OPENAI_API_KEY}"
fi

echo ""
echo "Restarting dashboard and celery worker..."
docker-compose restart homelab-dashboard homelab-celery-worker

echo ""
echo "Waiting 10 seconds for services to start..."
sleep 10

echo ""
echo "Dashboard logs:"
docker-compose logs homelab-dashboard | grep -i "AI Service" | tail -10

echo ""
echo "=========================================="
echo " Deployment Complete!"
echo "=========================================="
echo ""

# Verification Instructions
echo "Please verify the following:"
echo ""
echo "1. Stream-Bot Fact Generation:"
echo "   Visit: https://stream.rig-city.com/trigger"
echo "   Click: 'Generate Preview' button"
echo "   Expected: New fact appears immediately"
echo ""
echo "2. Dashboard Jarvis Chatbot:"
echo "   Visit: https://host.evindrake.net/assistant"
echo "   Type: 'Hello Jarvis'"
echo "   Expected: Intelligent response from GPT-4o"
echo ""
echo "3. Check logs for errors:"
echo "   Run: ./homelab logs | grep -i error"
echo ""

# Service Status
echo "Current service status:"
docker-compose ps | grep -E "stream-bot|homelab-dashboard|discord-bot"

echo ""
echo "=========================================="
echo "For detailed documentation, see:"
echo "  - COMPLETE_SERVICE_SEPARATION_FIX.md"
echo "  - SERVICE_OWNERSHIP.md"
echo "=========================================="
