#!/bin/bash
set -e

echo "════════════════════════════════════════════════════════"
echo "  🚀 FINAL COMPREHENSIVE FIX - ALL SERVICES"
echo "════════════════════════════════════════════════════════"
echo ""

cd /home/evin/contain/HomeLabHub

echo "[1/5] Pulling latest code with docker-compose.yml fixes..."
git pull origin main

echo ""
echo "[2/5] Stopping all services..."
docker compose down

echo ""
echo "[3/5] Starting all services with new configuration..."
docker compose up -d

echo ""
echo "[4/5] Waiting 45 seconds for everything to initialize..."
sleep 45

echo ""
echo "[5/5] Running comprehensive tests..."
echo ""

# Service Status
echo "═══════════════════════════════════════════════════════"
echo "📊 SERVICE STATUS:"
echo "═══════════════════════════════════════════════════════"
docker ps --format "table {{.Names}}\t{{.Status}}" | head -18

# Environment Variables Check
echo ""
echo "═══════════════════════════════════════════════════════"
echo "🔍 ENVIRONMENT VARIABLE VERIFICATION:"
echo "═══════════════════════════════════════════════════════"

echo ""
echo "[Jarvis AI Configuration]"
docker exec homelab-dashboard env 2>/dev/null | grep "AI_PROVIDER\|AI_MODEL" || echo "❌ AI env vars missing from dashboard"
docker exec homelab-celery-worker env 2>/dev/null | grep "AI_PROVIDER\|AI_MODEL" || echo "❌ AI env vars missing from celery"

echo ""
echo "[Stream-bot AI Configuration]"
docker exec stream-bot env 2>/dev/null | grep "STREAMBOT_FACT_MODEL\|OPENAI_API_KEY" | head -2 || echo "❌ Stream-bot AI env vars missing"

echo ""
echo "[VNC Web Client Configuration]"
docker exec vnc-desktop env 2>/dev/null | grep "NOVNC_ENABLE\|ENABLE_WEB_CLIENT" || echo "❌ VNC env vars missing"

# Connectivity Tests
echo ""
echo "═══════════════════════════════════════════════════════"
echo "🌐 CONNECTIVITY TESTS (from Caddy):"
echo "═══════════════════════════════════════════════════════"

echo ""
echo "[Dashboard]"
docker exec caddy wget -q -O- http://homelab-dashboard:5000 2>&1 | head -2 | grep -E "200 OK|<!DOCTYPE" && echo "✅ Reachable" || echo "❌ Unreachable"

echo ""
echo "[Stream-bot]"
docker exec caddy wget -q -O- http://stream-bot:5000 2>&1 | head -2 | grep -E "200 OK|<!DOCTYPE" && echo "✅ Reachable" || echo "❌ Unreachable"

echo ""
echo "[VNC Desktop]"
docker exec caddy wget -q -O- http://vnc-desktop:6080 2>&1 | head -5 | grep -E "vnc.html|noVNC|200 OK" && echo "✅ noVNC is running!" || echo "❌ noVNC NOT running"

# Check logs for critical errors
echo ""
echo "═══════════════════════════════════════════════════════"
echo "📋 RECENT LOGS (checking for errors):"
echo "═══════════════════════════════════════════════════════"

echo ""
echo "[Dashboard - last 10 lines]"
docker logs homelab-dashboard --tail 10 2>&1 | grep -v "GET /static" | tail -5

echo ""
echo "[Celery Worker - last 5 lines]"
docker logs homelab-celery-worker --tail 5 2>&1

echo ""
echo "[Stream-bot - last 5 lines]"
docker logs stream-bot --tail 5 2>&1

echo ""
echo "[VNC Desktop - last 10 lines]"
docker logs vnc-desktop --tail 10 2>&1

echo ""
echo "════════════════════════════════════════════════════════"
echo "✅ DEPLOYMENT COMPLETE!"
echo "════════════════════════════════════════════════════════"
echo ""
echo "🧪 NOW TEST THESE FEATURES:"
echo ""
echo "1️⃣  JARVIS AI - https://host.evindrake.net"
echo "    → Click 'AI Assistant (JARVIS)'"
echo "    → Type: 'Hello Jarvis'"
echo "    → Should respond (no 408 error)"
echo ""
echo "2️⃣  STREAM-BOT FACT PREVIEW - https://stream.rig-city.com/trigger"
echo "    → Select 'Twitch'"
echo "    → Click 'Generate Preview'"
echo "    → Should show AI-generated Snapple fact"
echo ""
echo "3️⃣  YOUTUBE AUTH - https://stream.rig-city.com"
echo "    → Click 'Sign in with YouTube'"
echo "    → Should redirect to Google (check redirect URL)"
echo ""
echo "4️⃣  VNC DESKTOP - https://vnc.evindrake.net"
echo "    → Should show noVNC interface (no 502)"
echo ""
echo "════════════════════════════════════════════════════════"
echo ""
echo "💡 If anything still fails, send me:"
echo "   1. Which feature failed"
echo "   2. Screenshot of the error"
echo "   3. Output from above logs section"
echo ""
