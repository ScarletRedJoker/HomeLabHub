#!/bin/bash
# Verify services actually work, not just run

echo "════════════════════════════════════════"
echo "  Testing Actual Functionality"
echo "════════════════════════════════════════"

cd /home/evin/contain/HomeLabHub

echo ""
echo "[Dashboard - Jarvis AI]"
response=$(curl -s -w "\n%{http_code}" http://localhost:5000/ 2>/dev/null | tail -1)
if [ "$response" = "200" ]; then
    echo "  ✓ Dashboard HTTP 200"
else
    echo "  ✗ Dashboard HTTP $response"
fi

echo ""
echo "[Discord Bot API]"
response=$(curl -s -w "\n%{http_code}" http://localhost:4000/ 2>/dev/null | tail -1)
if [ "$response" = "200" ]; then
    echo "  ✓ Discord Bot HTTP 200"
else
    echo "  ✗ Discord Bot HTTP $response"
fi

echo ""
echo "[Stream Bot API]"
response=$(curl -s -w "\n%{http_code}" http://localhost:5000/login 2>/dev/null | tail -1)
if [ "$response" = "200" ]; then
    echo "  ✓ Stream Bot HTTP 200"
else
    echo "  ✗ Stream Bot HTTP $response"  
fi

echo ""
echo "[Database Tables]"
echo "  Dashboard (homelab_jarvis):"
docker exec homelab-postgres psql -U postgres -d homelab_jarvis -c "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | grep -E "^\s+[0-9]+" || echo "    ✗ Query failed"

echo ""
echo "  Discord Bot (ticketbot):"
docker exec homelab-postgres psql -U postgres -d ticketbot -c "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | grep -E "^\s+[0-9]+" || echo "    ✗ Query failed"

echo ""
echo "  Stream Bot (streambot):"
docker exec homelab-postgres psql -U postgres -d streambot -c "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | grep -E "^\s+[0-9]+" || echo "    ✗ Query failed"

echo ""
echo "════════════════════════════════════════"
echo ""
echo "If any show ✗, that's what's broken."
