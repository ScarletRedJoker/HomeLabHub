#!/bin/bash
# Quick diagnostic and fix for current issues

echo "=== ISSUE 1: Caddy DNS Resolution ==="
echo "Checking if dashboard container is reachable..."
docker exec caddy ping -c 2 homelab-dashboard 2>&1 | head -5

echo ""
echo "=== ISSUE 2: Dashboard Health ==="
docker exec homelab-dashboard curl -s http://localhost:5000/health

echo ""
echo "=== ISSUE 3: Jarvis API Test ==="
docker exec homelab-dashboard curl -s -X POST http://localhost:5000/api/jarvis/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"test"}' | head -100

echo ""
echo "=== ISSUE 4: OpenAI Key in Dashboard ==="
docker exec homelab-dashboard env | grep OPENAI

echo ""
echo "=== ISSUE 5: Dashboard Errors ==="
docker logs homelab-dashboard 2>&1 | grep -i "error\|exception" | tail -10

echo ""
echo "=== Proposed Fix: Restart dashboard to reload env vars ==="
echo "Run: docker compose restart homelab-dashboard"
