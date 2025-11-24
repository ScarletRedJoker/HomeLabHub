#!/bin/bash
# Reload Caddy configuration to apply dashboard.evindrake.net alias

echo "Reloading Caddy configuration..."
docker exec caddy caddy reload --config /etc/caddy/Caddyfile

if [ $? -eq 0 ]; then
    echo "✓ Caddy reloaded successfully"
    echo ""
    echo "Dashboard now accessible at BOTH:"
    echo "  • https://host.evindrake.net"
    echo "  • https://dashboard.evindrake.net"
    echo ""
    echo "Testing..."
    sleep 2
    curl -s -o /dev/null -w "host.evindrake.net: HTTP %{http_code}\n" https://host.evindrake.net/health
    curl -s -o /dev/null -w "dashboard.evindrake.net: HTTP %{http_code}\n" https://dashboard.evindrake.net/health
else
    echo "✗ Caddy reload failed"
    echo "Check logs: docker logs caddy"
    exit 1
fi
