#!/bin/bash
# Test dashboard access methods

echo "=== 1. Localhost Direct Test ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:5000/health
echo ""

echo "=== 2. Container Name Test ==="
docker exec caddy curl -s -o /dev/null -w "HTTP %{http_code}\n" http://homelab-dashboard:5000/health 2>/dev/null || echo "Can't reach from Caddy container"
echo ""

echo "=== 3. External Domain Test ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://dashboard.evindrake.net/health 2>/dev/null || echo "External domain unreachable"
echo ""

echo "=== 4. Check Caddy Logs ==="
docker logs caddy --tail 20 2>&1 | grep -i "dashboard\|error" || echo "No obvious errors"
echo ""

echo "=== 5. Check Caddy Config ==="
docker exec caddy caddy validate --config /etc/caddy/Caddyfile 2>&1 || echo "Can't validate Caddy config"
echo ""

echo "=== 6. DNS Resolution Test ==="
host dashboard.evindrake.net || nslookup dashboard.evindrake.net || echo "Can't resolve DNS"
echo ""

echo "=== 7. Firewall/Port Test ==="
ss -tlnp | grep -E ":80|:443" || netstat -tlnp | grep -E ":80|:443" || echo "Ports not visible"
