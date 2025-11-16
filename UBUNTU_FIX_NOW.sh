#!/bin/bash
# EMERGENCY FIX - Missing structlog dependency
# Run this on Ubuntu to fix the crash

set -e

echo "=============================================="
echo "🔧 EMERGENCY FIX - Adding Missing Dependency"
echo "=============================================="
echo ""

cd /home/evin/contain/HomeLabHub/services/dashboard

echo "📝 Adding structlog to requirements.txt..."
if ! grep -q "structlog" requirements.txt; then
    echo "structlog==24.1.0" >> requirements.txt
    echo "✓ Added structlog==24.1.0"
else
    echo "✓ structlog already in requirements.txt"
fi
echo ""

echo "🔨 Rebuilding Docker image..."
docker build --no-cache -t homelabhub-homelab-dashboard:latest .
echo "✓ Image rebuilt with all dependencies"
echo ""

cd ../..

echo "🛑 Stopping old container..."
docker stop homelab-dashboard 2>/dev/null || true
docker rm homelab-dashboard 2>/dev/null || true
echo "✓ Old container removed"
echo ""

echo "🚀 Starting new container..."
docker-compose -f docker-compose.unified.yml up -d homelab-dashboard
echo "✓ Container started"
echo ""

echo "⏳ Waiting for startup (30 seconds)..."
sleep 30

echo ""
echo "=============================================="
echo "📊 DEPLOYMENT STATUS"
echo "=============================================="
docker ps | grep homelab-dashboard || echo "⚠️ Container not running - checking logs..."
echo ""

echo "🧪 Testing endpoint..."
if curl -s http://localhost:5000/login | grep -q "homelab"; then
    echo "✅ SUCCESS! Dashboard is working!"
    echo ""
    echo "🎉 You can now access: https://test.evindrake.net"
    echo "Login: evin / homelab"
else
    echo "⚠️ Test inconclusive - checking logs..."
    docker logs homelab-dashboard --tail 20
fi

echo ""
echo "=============================================="
echo "Done! Check the output above for any errors."
echo "=============================================="
