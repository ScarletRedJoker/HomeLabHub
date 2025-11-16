#!/bin/bash
# UBUNTU QUICK FIX - Rebuild Dashboard with Latest Code
# Copy this entire file to Ubuntu and run it

set -e

echo "=============================================="
echo "🚀 REBUILDING DASHBOARD WITH LATEST CODE"
echo "=============================================="
echo ""

# Navigate to project directory
cd /home/evin/contain/HomeLabHub

# Pull latest code from GitHub
echo "📥 Pulling latest code..."
git pull origin main
echo "✓ Code updated"
echo ""

# Stop current dashboard
echo "🛑 Stopping old dashboard container..."
docker stop homelab-dashboard 2>/dev/null || true
docker rm homelab-dashboard 2>/dev/null || true
echo "✓ Old container removed"
echo ""

# Rebuild dashboard image
echo "🔨 Rebuilding dashboard image..."
cd services/dashboard
docker build -t homelab-dashboard:latest .
echo "✓ Dashboard image rebuilt"
echo ""

# Go back to root
cd /home/evin/contain/HomeLabHub

# Restart with docker-compose
echo "🚀 Starting new dashboard container..."
docker-compose -f docker-compose.unified.yml up -d homelab-dashboard
echo "✓ Dashboard restarted"
echo ""

# Wait for startup
echo "⏳ Waiting for dashboard to start (30 seconds)..."
sleep 30

# Check status
echo ""
echo "=============================================="
echo "📊 DEPLOYMENT STATUS"
echo "=============================================="
docker ps | grep homelab-dashboard
echo ""

# Test endpoint
echo "🧪 Testing login page..."
if curl -s http://localhost:5000/login | grep -q "homelab"; then
    echo "✅ SUCCESS! Login page shows demo credentials"
    echo ""
    echo "🎉 Dashboard deployed successfully!"
    echo ""
    echo "Access at: https://test.evindrake.net"
    echo "Login: evin / homelab"
else
    echo "⚠️  Login page test inconclusive - check manually"
    echo "View logs: docker logs homelab-dashboard"
fi
echo ""
echo "=============================================="
