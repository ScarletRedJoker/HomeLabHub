#!/bin/bash
# Deploy Both Production and Demo Dashboards

set -e

echo "=============================================="
echo "🚀 DEPLOYING PRODUCTION + DEMO DASHBOARDS"
echo "=============================================="
echo ""

cd /home/evin/contain/HomeLabHub

echo "📥 Step 1: Pull latest code..."
git pull origin main
echo "✓ Code updated"
echo ""

echo "🔨 Step 2: Build dashboard image..."
cd services/dashboard
docker build --no-cache -t homelabhub-homelab-dashboard:latest .
echo "✓ Dashboard image built"
cd ../..
echo ""

echo "🗄️  Step 3: Create demo database..."
docker exec -it discord-bot-db psql -U jarvis -c "CREATE DATABASE homelab_jarvis_demo;" 2>/dev/null || echo "Demo database already exists"
echo "✓ Demo database ready"
echo ""

echo "🛑 Step 4: Stop old containers..."
docker stop homelab-dashboard homelab-dashboard-demo 2>/dev/null || true
docker rm homelab-dashboard homelab-dashboard-demo 2>/dev/null || true
echo "✓ Old containers removed"
echo ""

echo "🚀 Step 5: Start PRODUCTION dashboard (host.evindrake.net)..."
docker-compose -f docker-compose.unified.yml up -d homelab-dashboard
echo "✓ Production dashboard started"
echo ""

echo "🎭 Step 6: Start DEMO dashboard (test.evindrake.net)..."
docker-compose -f docker-compose.unified.yml up -d homelab-dashboard-demo
echo "✓ Demo dashboard started"
echo ""

echo "🔄 Step 7: Reload Caddy configuration..."
docker exec caddy caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || echo "⚠️  Caddy not running - start it with: docker-compose up -d caddy"
echo ""

echo "⏳ Step 8: Waiting for startup (30 seconds)..."
sleep 30

echo ""
echo "=============================================="
echo "📊 DEPLOYMENT STATUS"
echo "=============================================="
echo ""

echo "Production Dashboard (host.evindrake.net):"
docker ps | grep "homelab-dashboard " || echo "⚠️  Not running"
echo ""

echo "Demo Dashboard (test.evindrake.net):"
docker ps | grep "homelab-dashboard-demo" || echo "⚠️  Not running"
echo ""

echo "Caddy Reverse Proxy:"
docker ps | grep caddy || echo "⚠️  Not running"
echo ""

echo "=============================================="
echo "✅ DEPLOYMENT COMPLETE"
echo "=============================================="
echo ""
echo "Production Site (Private):"
echo "  URL: https://host.evindrake.net"
echo "  Login: Your secure credentials"
echo "  Features: Full power, real deployments"
echo ""
echo "Demo Site (Public):"
echo "  URL: https://test.evindrake.net"
echo "  Login: demo / demo"
echo "  Features: Safe demo mode, mock data"
echo ""
echo "Test locally:"
echo "  curl http://localhost:5000/health  # Production"
echo "  docker exec homelab-dashboard-demo curl http://localhost:5000/health  # Demo"
echo ""
echo "View logs:"
echo "  docker logs homelab-dashboard  # Production"
echo "  docker logs homelab-dashboard-demo  # Demo"
echo ""
