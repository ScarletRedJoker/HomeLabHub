#!/bin/bash
set -e

echo "=========================================="
echo " Fix Jarvis Chatbot - Deploy GPT-4o"
echo "=========================================="
echo ""

# Check we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Error: Must run from project root (/home/evin/contain/HomeLabHub)"
    exit 1
fi

echo "✓ Running from project root"
echo ""

echo "Rebuilding dashboard with gpt-4o..."
docker-compose up -d --build homelab-dashboard homelab-celery-worker

echo ""
echo "Waiting 15 seconds for services to start..."
sleep 15

echo ""
echo "Dashboard logs:"
docker-compose logs homelab-dashboard --tail=30 | grep -E "AI Service|error|Error"

echo ""
echo "=========================================="
echo " Deployment Complete!"
echo "=========================================="
echo ""

echo "Test Jarvis now:"
echo "  Visit: https://host.evindrake.net/assistant"
echo "  Type: 'Hello Jarvis'"
echo "  Expected: Intelligent response from GPT-4o"
echo ""

# Service Status
echo "Current service status:"
docker-compose ps | grep -E "homelab-dashboard|homelab-celery-worker"
