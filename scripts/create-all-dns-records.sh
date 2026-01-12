#!/bin/bash
# Create all DNS records for HomeLabHub services
# Run from /opt/homelab/HomeLabHub

set -e

LINODE_IP="69.164.211.205"
API_URL="http://localhost:5000/api/dns/records"

# Zone IDs
EVINDRAKE_ZONE="04172ef20635e7419c20ea28c2cd77a4"
RIGCITY_ZONE="3b3b81eb7c45049cd3667cff121dbc2d"
SCARLETREDJOKER_ZONE="1286c8b2f23f80444f06808e5215230c"

echo "Creating DNS records for all HomeLabHub services..."
echo "Target IP: $LINODE_IP"
echo ""

# Function to create A record
create_record() {
    local zone_id="$1"
    local name="$2"
    local content="$3"
    
    echo -n "Creating $name -> $content ... "
    
    result=$(curl -s -X POST "$API_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"zone_id\": \"$zone_id\",
            \"name\": \"$name\",
            \"type\": \"A\",
            \"content\": \"$content\",
            \"ttl\": 1,
            \"proxied\": false
        }")
    
    if echo "$result" | grep -q '"success":true'; then
        echo "OK"
    else
        echo "FAILED: $result"
    fi
}

echo "=== evindrake.net records ==="
create_record "$EVINDRAKE_ZONE" "host.evindrake.net" "$LINODE_IP"
create_record "$EVINDRAKE_ZONE" "dashboard.evindrake.net" "$LINODE_IP"
create_record "$EVINDRAKE_ZONE" "n8n.evindrake.net" "$LINODE_IP"
create_record "$EVINDRAKE_ZONE" "code.evindrake.net" "$LINODE_IP"
create_record "$EVINDRAKE_ZONE" "vnc.evindrake.net" "$LINODE_IP"
create_record "$EVINDRAKE_ZONE" "game.evindrake.net" "$LINODE_IP"
create_record "$EVINDRAKE_ZONE" "plex.evindrake.net" "$LINODE_IP"
create_record "$EVINDRAKE_ZONE" "gamestream.evindrake.net" "$LINODE_IP"
create_record "$EVINDRAKE_ZONE" "home.evindrake.net" "$LINODE_IP"

echo ""
echo "=== rig-city.com records ==="
create_record "$RIGCITY_ZONE" "rig-city.com" "$LINODE_IP"
create_record "$RIGCITY_ZONE" "www.rig-city.com" "$LINODE_IP"
create_record "$EVINDRAKE_ZONE" "bot.evindrake.net" "$LINODE_IP"
create_record "$EVINDRAKE_ZONE" "stream.evindrake.net" "$LINODE_IP"

echo ""
echo "=== scarletredjoker.com records ==="
create_record "$SCARLETREDJOKER_ZONE" "scarletredjoker.com" "$LINODE_IP"
create_record "$SCARLETREDJOKER_ZONE" "www.scarletredjoker.com" "$LINODE_IP"

echo ""
echo "Done! Restart Caddy to pick up new DNS:"
echo "  docker restart caddy"
