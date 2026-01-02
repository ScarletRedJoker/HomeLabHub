#!/bin/bash
# Dynamic DNS Update Script
# Run this from your local server to update Cloudflare DNS with your current IP
# Add to cron: */5 * * * * /opt/homelab/HomeLabHub/deploy/local/ddns-update.sh

DASHBOARD_URL="${DASHBOARD_URL:-https://dashboard.evindrake.net}"
AUTH_TOKEN="${DASHBOARD_AUTH_TOKEN:-}"

# Get current public IP
CURRENT_IP=$(curl -4 -s --connect-timeout 10 ifconfig.me 2>/dev/null)

if [ -z "$CURRENT_IP" ]; then
    CURRENT_IP=$(curl -4 -s --connect-timeout 10 api.ipify.org 2>/dev/null)
fi

if [ -z "$CURRENT_IP" ]; then
    echo "$(date): ERROR - Could not determine public IP"
    exit 1
fi

echo "$(date): Current IP is $CURRENT_IP"

# Check if IP changed (optional - store last IP)
LAST_IP_FILE="/tmp/ddns_last_ip"
if [ -f "$LAST_IP_FILE" ]; then
    LAST_IP=$(cat "$LAST_IP_FILE")
    if [ "$CURRENT_IP" == "$LAST_IP" ]; then
        echo "$(date): IP unchanged ($CURRENT_IP), skipping update"
        exit 0
    fi
fi

# Update DNS via Dashboard API
RESPONSE=$(curl -s -X POST "${DASHBOARD_URL}/api/dns/ddns/update" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -d "{\"ip\": \"${CURRENT_IP}\", \"force\": false}")

if echo "$RESPONSE" | grep -q '"success":true'; then
    echo "$(date): SUCCESS - Updated DNS to $CURRENT_IP"
    echo "$CURRENT_IP" > "$LAST_IP_FILE"
    
    # Extract update count
    UPDATED=$(echo "$RESPONSE" | grep -o '"updated":\[[^]]*\]' | grep -o '"name"' | wc -l)
    echo "$(date): Updated $UPDATED records"
else
    echo "$(date): FAILED - $RESPONSE"
    exit 1
fi
