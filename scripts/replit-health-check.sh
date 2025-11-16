#!/bin/bash

echo "============================================================"
echo "🏥 Replit Services Health Check"
echo "============================================================"
echo ""

# Check Dashboard (Port 5000)
echo "Checking Dashboard (Port 5000)..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/ | grep -q "302\|200"; then
    echo "✅ Dashboard: RUNNING"
else
    echo "❌ Dashboard: NOT RESPONDING"
fi

# Check Stream Bot (Port 3000)
echo "Checking Stream Bot (Port 3000)..."
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "✅ Stream Bot: RUNNING"
else
    echo "❌ Stream Bot: NOT RESPONDING"
fi

# Check Database
echo "Checking Database..."
if [ -n "$DATABASE_URL" ]; then
    echo "✅ Database: CONFIGURED"
else
    echo "⚠️  Database: NOT CONFIGURED"
fi

echo ""
echo "============================================================"
echo "Service Status Summary"
echo "============================================================"
echo "Dashboard:  http://localhost:5000/"
echo "Stream Bot: http://localhost:3000/"
echo "============================================================"
